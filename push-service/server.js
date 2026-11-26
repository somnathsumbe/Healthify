import 'dotenv/config';
import express from 'express';
import helmet from 'helmet';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import webpush from 'web-push';
import cron from 'node-cron';
import { randomUUID, timingSafeEqual } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validatePushSubscription, validateSchedulePayload } from './schedule-utils.js';
import { createEmptyStore, normalizeStore, upsertSubscription, replaceReminderSchedule, updateReminderStatus, removeSubscription, getDueReminders, makeReminderPayload } from './state-store.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const PORT = Number(process.env.PORT || 8787);
const DATA_FILE = process.env.DATA_FILE || path.join(rootDir, 'push-service', 'data', 'push-state.json');
const API_TOKEN = process.env.PUSH_API_TOKEN || '';
const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY || '';
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || '';
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || '';
const allowedOrigins = (process.env.ALLOWED_ORIGIN || 'http://localhost:5500,http://127.0.0.1:5500').split(',').map(value => value.trim()).filter(Boolean);

if (API_TOKEN.length < 32) throw new Error('PUSH_API_TOKEN must contain at least 32 characters.');
if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY || !VAPID_SUBJECT.startsWith('mailto:')) throw new Error('VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY and mailto: VAPID_SUBJECT are required.');
fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

function loadState() {
  if (!fs.existsSync(DATA_FILE)) return createEmptyStore();
  return normalizeStore(JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')));
}
let state = loadState();
// Recover any reminder interrupted while the process was sending a push.
for (const reminder of state.reminders) if (reminder.status === 'sending') reminder.status = 'pending';

function saveState() {
  const temporaryPath = `${DATA_FILE}.tmp`;
  fs.writeFileSync(temporaryPath, JSON.stringify(state));
  fs.renameSync(temporaryPath, DATA_FILE);
}
saveState();

const app = express();
app.disable('x-powered-by');
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' }, contentSecurityPolicy: false }));
app.use(compression());
app.use(express.json({ limit: '256kb' }));
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && (allowedOrigins.includes('*') || allowedOrigins.includes(origin))) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  }
  if (req.method === 'OPTIONS') return res.sendStatus(origin && !allowedOrigins.includes('*') && !allowedOrigins.includes(origin) ? 403 : 204);
  next();
});
app.use('/api/', rateLimit({ windowMs: 15 * 60 * 1000, limit: 90, standardHeaders: 'draft-7', legacyHeaders: false }));

function isAuthorized(req) {
  const header = req.headers.authorization || '';
  const supplied = header.startsWith('Bearer ') ? header.slice(7) : '';
  const expectedBuffer = Buffer.from(API_TOKEN);
  const suppliedBuffer = Buffer.from(supplied);
  return suppliedBuffer.length === expectedBuffer.length && timingSafeEqual(suppliedBuffer, expectedBuffer);
}
function requireAuth(req, res, next) {
  if (!isAuthorized(req)) return res.status(401).json({ error: 'Unauthorized' });
  next();
}

app.get('/api/push/health', (_req, res) => res.json({ status: 'ok', service: 'healthify-push', timezone: 'Asia/Kolkata' }));
app.get('/api/push/vapid-public-key', (_req, res) => res.json({ publicKey: VAPID_PUBLIC_KEY }));

app.post('/api/push/subscribe', requireAuth, (req, res) => {
  const error = validatePushSubscription(req.body?.subscription);
  if (error) return res.status(400).json({ error });
  const result = upsertSubscription(state, req.body.subscription, randomUUID);
  saveState();
  res.status(result.reused ? 200 : 201).json(result);
});

app.post('/api/push/schedule', requireAuth, (req, res) => {
  const error = validateSchedulePayload(req.body);
  if (error) return res.status(400).json({ error });
  if (!state.subscriptions.some(item => item.id === req.body.subscriptionId)) return res.status(404).json({ error: 'Subscription not found.' });
  const now = Date.now();
  const invalid = req.body.reminders.find(item => Date.parse(item.sendAt) < now - 60_000);
  if (invalid) return res.status(400).json({ error: `Past reminder rejected: ${invalid.id}` });
  const scheduledCount = replaceReminderSchedule(state, req.body.subscriptionId, req.body.reminders);
  saveState();
  res.json({ success: true, scheduledCount, storedFields: ['sendAt', 'title', 'body', 'subscriptionId'], healthDataStored: false });
});

app.post('/api/push/reminder-status', requireAuth, (req, res) => {
  const { subscriptionId, reminderId, status, snoozeUntil } = req.body || {};
  if (typeof subscriptionId !== 'string' || typeof reminderId !== 'string' || !['completed', 'skipped', 'snoozed'].includes(status)) {
    return res.status(400).json({ error: 'Invalid reminder status payload.' });
  }
  try {
    const updated = updateReminderStatus(state, { subscriptionId, reminderId, status, snoozeUntil });
    saveState();
    res.json({ success: true, updated });
  } catch (error) { res.status(400).json({ error: error.message }); }
});

app.post('/api/push/unsubscribe', requireAuth, (req, res) => {
  const id = req.body?.subscriptionId;
  if (typeof id !== 'string') return res.status(400).json({ error: 'subscriptionId required.' });
  const removed = removeSubscription(state, id);
  saveState();
  res.json({ success: true, removed });
});

let dispatchInProgress = false;
export async function dispatchDueReminders(now = new Date()) {
  if (dispatchInProgress) return { checked: 0, sent: 0, busy: true };
  dispatchInProgress = true;
  let sent = 0;
  try {
    const due = getDueReminders(state, now).slice(0, 50);
    for (const reminder of due) {
      const subscriptionRecord = state.subscriptions.find(item => item.id === reminder.subscriptionId);
      if (!subscriptionRecord) { reminder.status = 'failed'; reminder.lastError = 'Subscription missing'; saveState(); continue; }
      reminder.status = 'sending'; saveState();
      try {
        await webpush.sendNotification(subscriptionRecord.subscription, JSON.stringify(makeReminderPayload(reminder)), { TTL: 3600, urgency: 'normal' });
        reminder.status = 'sent'; reminder.sentAt = new Date().toISOString(); reminder.lastError = null;
        subscriptionRecord.lastUsedAt = reminder.sentAt;
        sent += 1;
      } catch (error) {
        if (error?.statusCode === 404 || error?.statusCode === 410) {
          removeSubscription(state, reminder.subscriptionId);
        } else {
          reminder.attempts += 1;
          reminder.status = reminder.attempts >= 3 ? 'failed' : 'pending';
          reminder.failedAt = new Date().toISOString();
          reminder.lastError = String(error?.message || 'Push delivery failed').slice(0, 250);
        }
      }
      saveState();
    }
    return { checked: due.length, sent };
  } finally { dispatchInProgress = false; }
}

cron.schedule('* * * * *', () => dispatchDueReminders().catch(error => console.error('Push scheduler error:', error)), { timezone: 'Asia/Kolkata' });
app.use((error, _req, res, _next) => { console.error(error); res.status(500).json({ error: 'Internal server error.' }); });
app.listen(PORT, () => console.log(`Healthify Push Service listening on ${PORT}`));
