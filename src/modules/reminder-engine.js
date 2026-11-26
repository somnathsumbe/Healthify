import { getTodayISO, istDateTimeToISO, getProgramDay } from '../utils/date-time.js';
import { getRecord, putRecord } from '../services/storage.js';

const REMINDER_LEAD_MS = 60_000;
const REMINDER_CATCH_UP_MS = 10 * 60_000;

export function isWithinReminderWindow(dueAt, now = new Date(), windowMs = REMINDER_CATCH_UP_MS) {
  const due = typeof dueAt === 'number' ? dueAt : Date.parse(dueAt);
  const current = now instanceof Date ? now.getTime() : Date.parse(now);
  return Number.isFinite(due) && Number.isFinite(current) && current >= due && current - due <= windowMs;
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
  const nowDate = new Date();
  const today = getTodayISO(nowDate);
  const program = getProgramDay(profile.startDate, today);
  if (program.offset < 0 || program.offset >= 21) return;
  const day = plan.days[program.day - 1];
  const mealMap = new Map((day?.meals || []).map(meal => [meal.time, meal]));
  for (const reminder of plan.dailyReminderTemplate) {
    const id = getReminderOccurrenceId(today, reminder);
    const saved = await getRecord('reminders', id);
    if (saved?.status === 'completed' || saved?.status === 'skipped') continue;

    const scheduledAt = istDateTimeToISO(today, reminder.time);
    const dueAt = saved?.status === 'snoozed' ? saved.snoozeUntil : scheduledAt;
    if (!isWithinReminderWindow(dueAt, nowDate)) continue;
    if (saved?.notifiedAt && saved.status !== 'snoozed') continue;

    const meal = mealMap.get(reminder.time);
    const payload = { ...reminder, id, date: today, dayNumber: program.day, meal: meal || null };
    await putRecord('reminders', { ...saved, id, status: 'pending', notifiedAt: nowDate.toISOString(), snoozeUntil: null });
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
