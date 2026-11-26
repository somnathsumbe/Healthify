export const TIME_ZONE = 'Asia/Kolkata';

export function getTodayISO(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: TIME_ZONE,
    year: 'numeric', month: '2-digit', day: '2-digit'
  }).format(date);
}

export function getCurrentTimeHHMM(date = new Date()) {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: TIME_ZONE,
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
  }).format(date);
}

export function addDaysISO(isoDate, amount) {
  const [year, month, day] = isoDate.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + amount));
  return date.toISOString().slice(0, 10);
}

export function diffDays(startISO, endISO) {
  const [sy, sm, sd] = startISO.split('-').map(Number);
  const [ey, em, ed] = endISO.split('-').map(Number);
  return Math.round((Date.UTC(ey, em - 1, ed) - Date.UTC(sy, sm - 1, sd)) / 86400000);
}

export function formatDateMarathi(isoDate, options = {}) {
  if (!isoDate) return 'तारीख निवडलेली नाही';
  const [year, month, day] = isoDate.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day, 12));
  return new Intl.DateTimeFormat('mr-IN', {
    timeZone: TIME_ZONE, day: 'numeric', month: 'short', year: 'numeric', ...options
  }).format(date);
}

// Converts an IST wall-clock date/time to an absolute UTC timestamp.
// Asia/Kolkata is UTC+05:30 and has no daylight-saving transitions.
export function istDateTimeToISO(dateISO, timeHHMM) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateISO) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(timeHHMM)) {
    throw new TypeError('Invalid date or time');
  }
  return new Date(`${dateISO}T${timeHHMM}:00+05:30`).toISOString();
}

export function getProgramDay(startDate, today = getTodayISO()) {
  const offset = diffDays(startDate, today);
  return { offset, day: Math.min(21, Math.max(1, offset + 1)), beforeStart: offset < 0, completed: offset >= 21 };
}
