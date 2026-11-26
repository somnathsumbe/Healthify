import { getRecord, putRecord, getAllRecords } from '../services/storage.js';
import { getTodayISO } from '../utils/date-time.js';

export async function saveDailyProgress(input) {
  const date = input.date || getTodayISO();
  const existing = await getRecord('dailyLogs', date) || {};
  const weightKg = input.weightKg === '' || input.weightKg == null ? null : Number(input.weightKg);
  const sleepHours = input.sleepHours === '' || input.sleepHours == null ? null : Number(input.sleepHours);
  const kneePain = input.kneePain === '' || input.kneePain == null ? null : Number(input.kneePain);
  const waistInches = input.waistInches === '' || input.waistInches == null ? null : Number(input.waistInches);
  if (weightKg != null && (!Number.isFinite(weightKg) || weightKg < 30 || weightKg > 300)) throw new RangeError('वजन 30 ते 300 kg असावे.');
  if (sleepHours != null && (!Number.isFinite(sleepHours) || sleepHours < 0 || sleepHours > 24)) throw new RangeError('झोप 0 ते 24 तास असावी.');
  if (kneePain != null && (!Number.isInteger(kneePain) || kneePain < 0 || kneePain > 10)) throw new RangeError('Knee Pain Score 0 ते 10 असावा.');
  if (waistInches != null && (!Number.isFinite(waistInches) || waistInches < 15 || waistInches > 100)) throw new RangeError('कंबर माप 15 ते 100 इंच असावे.');
  const record = { ...existing, id: date, date, weightKg: weightKg ?? existing.weightKg ?? null, sleepHours: sleepHours ?? existing.sleepHours ?? null, kneePain: kneePain ?? existing.kneePain ?? null, waistInches: waistInches ?? existing.waistInches ?? null, waistCircumferenceCm: waistInches == null ? (existing.waistCircumferenceCm ?? null) : Number((waistInches * 2.54).toFixed(2)), exerciseCompleted: input.exerciseCompleted === undefined ? Boolean(existing.exerciseCompleted) : Boolean(input.exerciseCompleted), notes: input.notes === undefined ? (existing.notes || '') : String(input.notes || '').slice(0, 500), updatedAt: new Date().toISOString() };
  await putRecord('dailyLogs', record);
  return record;
}

export async function getProgressHistory() {
  return (await getAllRecords('dailyLogs')).sort((a,b) => a.date.localeCompare(b.date));
}

export async function getTodayProgress() {
  return getRecord('dailyLogs', getTodayISO());
}

export function calculateSevenDayAverage(records) {
  const values = records.slice(-7).map(record => record.weightKg).filter(value => Number.isFinite(value));
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}
