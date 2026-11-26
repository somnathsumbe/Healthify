const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const MAX_SCHEDULE_ITEMS = 462;

export function validatePushSubscription(subscription) {
  if (!subscription || typeof subscription !== 'object') return 'Push subscription आवश्यक आहे.';
  if (typeof subscription.endpoint !== 'string' || !subscription.endpoint.startsWith('https://')) return 'Subscription endpoint HTTPS URL असावा.';
  if (!subscription.keys || typeof subscription.keys.p256dh !== 'string' || typeof subscription.keys.auth !== 'string') return 'Subscription keys अपूर्ण आहेत.';
  return null;
}

export function validateSchedulePayload(payload) {
  if (!payload || typeof payload !== 'object') return 'Schedule payload आवश्यक आहे.';
  if (typeof payload.subscriptionId !== 'string' || payload.subscriptionId.length < 12) return 'Subscription ID invalid आहे.';
  if (payload.timezone !== 'Asia/Kolkata') return 'Timezone Asia/Kolkata असणे आवश्यक आहे.';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(payload.startDate || '')) return 'Start date ISO format मध्ये असावी.';
  if (!Array.isArray(payload.reminders) || payload.reminders.length < 1 || payload.reminders.length > MAX_SCHEDULE_ITEMS) return `Schedule मध्ये 1 ते ${MAX_SCHEDULE_ITEMS} reminders असावेत.`;
  const ids = new Set();
  for (const item of payload.reminders) {
    if (!item || typeof item.id !== 'string' || !TIME_RE.test(item.time || '')) return 'Reminder ID किंवा time invalid आहे.';
    if (ids.has(item.id)) return 'Duplicate reminder ID आढळला.';
    ids.add(item.id);
    if (typeof item.sendAt !== 'string' || Number.isNaN(Date.parse(item.sendAt))) return 'Reminder sendAt UTC timestamp invalid आहे.';
    if (typeof item.title !== 'string' || !item.title.trim() || item.title.length > 100) return 'Reminder title invalid आहे.';
    if (typeof item.body !== 'string' || item.body.length > 220) return 'Reminder body invalid आहे.';
    if (item.date && !/^\d{4}-\d{2}-\d{2}$/.test(item.date)) return 'Reminder date invalid आहे.';
    const localParts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(item.sendAt));
    const parts = Object.fromEntries(localParts.map(part => [part.type, part.value]));
    if (`${parts.year}-${parts.month}-${parts.day}` !== item.date || `${parts.hour}:${parts.minute}` !== item.time) return `Reminder date/time mismatch: ${item.id}`;
  }
  return null;
}

export function makeReminderPayload(reminder) {
  const rawId = String(reminder.id);
  const clientReminderId = rawId.includes(':') ? rawId.slice(rawId.indexOf(':') + 1) : rawId;
  return {
    title: String(reminder.title).slice(0, 100),
    body: String(reminder.body).slice(0, 220),
    tag: clientReminderId.slice(0, 120),
    url: './'
  };
}
