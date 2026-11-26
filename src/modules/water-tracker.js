import { putRecord, getAllRecords, deleteRecord } from '../services/storage.js';
import { getTodayISO } from '../utils/date-time.js';

export async function addWater(quantityMl) {
  const amount = Number(quantityMl);
  if (!Number.isFinite(amount) || amount < 25 || amount > 1000) throw new RangeError('एका नोंदीत 25 ते 1000 ml पाणी नोंदवा.');
  const entry = { id: `${getTodayISO()}-${Date.now()}`, date: getTodayISO(), quantityMl: amount, createdAt: new Date().toISOString() };
  await putRecord('waterLogs', entry);
  return entry;
}

export async function getTodayWaterTotal() {
  const entries = await getAllRecords('waterLogs');
  return entries.filter(entry => entry.date === getTodayISO()).reduce((sum, entry) => sum + entry.quantityMl, 0);
}

export async function getTodayWaterEntries() {
  const entries = await getAllRecords('waterLogs');
  return entries.filter(entry => entry.date === getTodayISO()).sort((a,b) => b.createdAt.localeCompare(a.createdAt));
}

export async function removeWaterEntry(id) {
  return deleteRecord('waterLogs', id);
}
