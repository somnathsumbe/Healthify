export function createEmptyStore() {
  return { schemaVersion: 1, subscriptions: [], reminders: [] };
}

export function normalizeStore(value) {
  if (!value || value.schemaVersion !== 1 || !Array.isArray(value.subscriptions) || !Array.isArray(value.reminders)) {
    throw new Error('Push service state file is invalid.');
  }
  return value;
}

export function upsertSubscription(store, subscription, createId, now = new Date().toISOString()) {
  const existing = store.subscriptions.find(item => item.endpoint === subscription.endpoint);
  if (existing) {
    existing.subscription = subscription;
    existing.lastUsedAt = now;
    return { subscriptionId: existing.id, reused: true };
  }
  const record = { id: createId(), endpoint: subscription.endpoint, subscription, createdAt: now, lastUsedAt: now };
  store.subscriptions.push(record);
  return { subscriptionId: record.id, reused: false };
}

export function replaceReminderSchedule(store, subscriptionId, reminders, now = new Date().toISOString()) {
  store.reminders = store.reminders.filter(item => item.subscriptionId !== subscriptionId);
  for (const reminder of reminders) {
    store.reminders.push({
      id: `${subscriptionId}:${reminder.id}`,
      clientReminderId: reminder.id,
      subscriptionId,
      sendAt: new Date(reminder.sendAt).toISOString(),
      title: reminder.title,
      body: reminder.body,
      status: 'pending',
      attempts: 0,
      createdAt: now,
      sentAt: null,
      failedAt: null,
      lastError: null
    });
  }
  return store.reminders.filter(item => item.subscriptionId === subscriptionId).length;
}

export function updateReminderStatus(store, { subscriptionId, reminderId, status, snoozeUntil }, now = new Date()) {
  const id = `${subscriptionId}:${reminderId}`;
  const record = store.reminders.find(item => item.id === id && item.subscriptionId === subscriptionId);
  if (!record) return false;
  if (status === 'snoozed') {
    const timestamp = Date.parse(snoozeUntil || '');
    if (!Number.isFinite(timestamp) || timestamp <= now.getTime() || timestamp > now.getTime() + 24 * 60 * 60 * 1000) {
      throw new RangeError('Snooze must be within the next 24 hours.');
    }
    record.sendAt = new Date(timestamp).toISOString();
    record.status = 'pending';
    record.attempts = 0;
    record.failedAt = null;
    record.lastError = null;
    record.sentAt = null;
    return true;
  }
  record.status = status;
  record.sentAt = now.toISOString();
  record.failedAt = null;
  record.lastError = null;
  return true;
}

export function removeSubscription(store, subscriptionId) {
  const before = store.subscriptions.length;
  store.subscriptions = store.subscriptions.filter(item => item.id !== subscriptionId);
  store.reminders = store.reminders.filter(item => item.subscriptionId !== subscriptionId);
  return before !== store.subscriptions.length;
}

export function getDueReminders(store, now = new Date()) {
  const timestamp = now.getTime();
  return store.reminders.filter(item => item.status === 'pending' && item.attempts < 3 && Date.parse(item.sendAt) <= timestamp);
}

export function makeReminderPayload(reminder) {
  return {
    title: String(reminder.title).slice(0, 100),
    body: String(reminder.body).slice(0, 220),
    tag: String(reminder.clientReminderId || reminder.id).slice(0, 120),
    url: './'
  };
}
