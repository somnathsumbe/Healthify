import { getTodayISO, getCurrentTimeHHMM, istDateTimeToISO, addDaysISO, getProgramDay } from '../utils/date-time.js';
import { getRecord, putRecord } from '../services/storage.js';

const REMINDER_LEAD_MS = 60_000;

export function buildPushSchedule(startDate, reminderTemplate) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate)) throw new TypeError('Start date invalid');
  if (!Array.isArray(reminderTemplate) || !reminderTemplate.length) throw new TypeError('Reminder template missing');
  const events = [];
  for (let day = 0; day < 21; day += 1) {
    const date = addDaysISO(startDate, day);
    for (const reminder of reminderTemplate) {
      const sendAt = istDateTimeToISO(date, reminder.time);
      events.push({
        id: `${date}-${reminder.time.replace(':', '')}-${reminder.type}`,
        sendAt,
        time: reminder.time,
        date,
        type: reminder.type,
        title: reminder.title,
        body: reminder.message || reminder.title,
        quantityMl: reminder.quantityMl || null
      });
    }
  }
  return events.sort((a, b) => a.sendAt.localeCompare(b.sendAt));
}

export async function setReminderStatus(id, status, extra = {}) {
  const existing = await getRecord('reminders', id) || { id, status: 'pending' };
  const record = { ...existing, ...extra, id, status, updatedAt: new Date().toISOString() };
  if (status === 'completed' || status === 'skipped') record.completedAt = new Date().toISOString();
  await putRecord('reminders', record);
  return record;
}

export function getReminderOccurrenceId(date, reminder) {
  return `${date}-${reminder.time.replace(':', '')}-${reminder.type}`;
}

export async function checkDueReminders(plan, profile, onDue) {
  const today = getTodayISO();
  const now = getCurrentTimeHHMM();
  const program = getProgramDay(profile.startDate, today);
  if (program.offset < 0 || program.offset >= 21) return;
  const day = plan.days[program.day - 1];
  const mealMap = new Map((day?.meals || []).map(meal => [meal.time, meal]));
  for (const reminder of plan.dailyReminderTemplate) {
    if (reminder.time !== now) continue;
    const id = getReminderOccurrenceId(today, reminder);
    const saved = await getRecord('reminders', id);
    if (saved?.status === 'completed' || saved?.status === 'skipped') continue;
    const snoozeDue = saved?.status === 'snoozed' && Date.parse(saved.snoozeUntil || '') <= Date.now();
    if (saved?.status === 'snoozed' && !snoozeDue) continue;
    if (reminder.time !== now && !snoozeDue) continue;
    if (saved?.notifiedAt && !snoozeDue) continue;
    const meal = mealMap.get(reminder.time);
    const payload = { ...reminder, id, date: today, dayNumber: program.day, meal: meal || null };
    await putRecord('reminders', { ...saved, id, status: 'pending', notifiedAt: new Date().toISOString(), snoozeUntil: null });
    onDue(payload);
  }
}

export function startReminderEngine(plan, profile, onDue) {
  let active = true;
  const run = () => { if (active) checkDueReminders(plan, profile, onDue).catch(console.error); };
  run();
  const intervalId = setInterval(run, REMINDER_LEAD_MS);
  return () => { active = false; clearInterval(intervalId); };
}

export async function syncScheduleWithPushService({ endpoint, token, subscriptionId, profile, template }) {
  const reminders = buildPushSchedule(profile.startDate, template).filter(item => Date.parse(item.sendAt) > Date.now() + 30_000);
  if (!reminders.length) throw new Error('पुढील कोणतेही Reminder schedule करण्यासाठी शिल्लक नाहीत.');
  const response = await fetch(`${endpoint.replace(/\/$/, '')}/api/push/schedule`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ subscriptionId, startDate: profile.startDate, timezone: 'Asia/Kolkata', reminders })
  });
  if (!response.ok) throw new Error(`Push schedule sync failed (${response.status})`);
  return response.json();
}
