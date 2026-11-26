import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { validateProfile, validatePlan } from '../src/utils/validation.js';
import { buildPushSchedule, isWithinReminderWindow } from '../src/modules/reminder-engine.js';
import { addDaysISO, diffDays, istDateTimeToISO, getProgramDay } from '../src/utils/date-time.js';
import { calculateNutrition } from '../src/modules/nutrition-calculator.js';
import { validatePushSubscription, validateSchedulePayload, makeReminderPayload } from '../push-service/schedule-utils.js';
import { calculateSevenDayAverage } from '../src/modules/progress.js';

const plan = JSON.parse(fs.readFileSync(new URL('../data/21-day-fat-loss-plan.json', import.meta.url), 'utf8'));

test('21-day reference plan has valid structure and retains all meal data', () => {
  assert.deepEqual(validatePlan(plan), []);
  assert.equal(plan.days.length, 21);
  assert.equal(plan.days.reduce((sum, day) => sum + day.meals.length, 0), 126);
  assert.equal(plan.dailyReminderTemplate.length, 22);
  assert.equal(plan.waterReminderDetails.length, 9);
});

test('public plan contains no personal profile or user-specific measurements', () => {
  assert.equal(Object.hasOwn(plan, 'userProfile'), false);
  assert.equal(plan.progressTracking.waistCircumferenceCmInitial, null);
  assert.equal(plan.planSettings.dailyCaloriesKcal.min, null);
  assert.equal(plan.planSettings.dailyProteinG.min, null);
  const serialized = JSON.stringify(plan);
  assert.equal(serialized.includes('Test User'), false);
  assert.equal(serialized.includes('70.0'), false);
  assert.equal(serialized.includes('76.2'), false);
});

test('profile validator accepts expected onboarding fields', () => {
  const profile = { name:'Test User', ageYears:39, sex:'male', heightCm:170, currentWeightKg:70, waistInches:30, dietPreference:'both', startDate:'2026-11-27' };
  assert.deepEqual(validateProfile(profile), []);
});

test('profile validator rejects invalid values and missing required fields', () => {
  const profile = { name:'', ageYears:12, sex:'unknown', heightCm:0, currentWeightKg:500, waistInches:0, dietPreference:'x', startDate:'27/11/2026' };
  assert.ok(validateProfile(profile).length >= 7);
});

test('21-day schedule builder creates 462 IST-local reminders in chronological order', () => {
  const reminders = buildPushSchedule('2026-11-27', plan.dailyReminderTemplate);
  assert.equal(reminders.length, 462);
  assert.equal(reminders[0].sendAt, '2026-11-26T23:30:00.000Z');
  assert.equal(reminders.at(-1).date, '2026-12-17');
  assert.ok(reminders.every((item, index) => index === 0 || reminders[index - 1].sendAt <= item.sendAt));
});

test('in-app reminders tolerate timer drift and short tab wake-up delays without replaying stale reminders', () => {
  const dueAt = '2026-11-26T23:30:00.000Z';
  assert.equal(isWithinReminderWindow(dueAt, new Date('2026-11-26T23:30:01.000Z')), true);
  assert.equal(isWithinReminderWindow(dueAt, new Date('2026-11-26T23:38:00.000Z')), true);
  assert.equal(isWithinReminderWindow(dueAt, new Date('2026-11-26T23:41:00.000Z')), false);
  assert.equal(isWithinReminderWindow(dueAt, new Date('2026-11-26T23:29:59.000Z')), false);
});

test('date utilities handle program day boundaries and leap-year-safe day arithmetic', () => {
  assert.equal(addDaysISO('2026-11-27', 20), '2026-12-17');
  assert.equal(diffDays('2026-11-27', '2026-12-17'), 20);
  assert.deepEqual(getProgramDay('2026-11-27', '2026-11-26'), { offset:-1, day:1, beforeStart:true, completed:false });
  assert.equal(getProgramDay('2026-11-27', '2026-12-17').day, 21);
  assert.equal(istDateTimeToISO('2026-11-27','05:00'),'2026-11-26T23:30:00.000Z');
});

test('push subscription validation rejects incomplete or insecure subscriptions', () => {
  assert.notEqual(validatePushSubscription({ endpoint:'http://not-secure', keys:{} }), null);
  assert.equal(validatePushSubscription({ endpoint:'https://push.example/abc', keys:{p256dh:'abc',auth:'xyz'} }), null);
});

test('push schedule validation verifies timezone, local time, uniqueness and event count', () => {
  const events = buildPushSchedule('2026-11-27', plan.dailyReminderTemplate);
  const valid = validateSchedulePayload({ subscriptionId:'12345678-1234-1234-1234-123456789012', timezone:'Asia/Kolkata', startDate:'2026-11-27', reminders:events });
  assert.equal(valid, null);
  const invalid = validateSchedulePayload({ subscriptionId:'12345678-1234-1234-1234-123456789012', timezone:'UTC', startDate:'2026-11-27', reminders:events });
  assert.match(invalid, /Timezone/);
});

test('push payload contains only reminder copy and route, not health profile fields', () => {
  const payload = makeReminderPayload({ title:'पाणी प्या', body:'250 ml साधे पाणी प्या', id:'rem-1' });
  assert.deepEqual(Object.keys(payload).sort(), ['body','tag','title','url']);
  assert.equal(payload.tag, 'rem-1');
  assert.equal(makeReminderPayload({ title:'पाणी', body:'250 ml', id:'subscription-uuid:2026-11-27-0505-water' }).tag, '2026-11-27-0505-water');
});

test('nutrition calculator does not invent values when food master is empty', () => {
  const result = calculateNutrition([{ name:'पोहे', quantity:40, unit:'g' }], { foods:[] });
  assert.equal(result.caloriesKcal, null);
  assert.equal(result.proteinG, null);
  assert.equal(result.isComplete, false);
  assert.equal(result.missingItems, 1);
});

test('7-day average ignores missing weight entries', () => {
  assert.equal(calculateSevenDayAverage([{weightKg:77.5},{weightKg:null},{weightKg:77.1}]), 77.3);
  assert.equal(calculateSevenDayAverage([{weightKg:null}]), null);
});

test('push state store supports subscription upsert, scheduling, snooze, completion and unsubscribe', async () => {
  const { createEmptyStore, upsertSubscription, replaceReminderSchedule, updateReminderStatus, removeSubscription, getDueReminders } = await import('../push-service/state-store.js');
  const store = createEmptyStore();
  const subscription = { endpoint:'https://push.example/device', keys:{p256dh:'p',auth:'a'} };
  const first = upsertSubscription(store, subscription, ()=>'subscription-1234', '2026-11-26T08:00:00.000Z');
  assert.equal(first.reused, false);
  const second = upsertSubscription(store, subscription, ()=>'should-not-be-used', '2026-11-26T08:01:00.000Z');
  assert.equal(second.reused, true);
  assert.equal(second.subscriptionId, first.subscriptionId);
  const scheduleCount = replaceReminderSchedule(store, first.subscriptionId, [{id:'event-1',sendAt:'2026-11-27T00:00:00.000Z',title:'पाणी',body:'पाणी प्या'}]);
  assert.equal(scheduleCount, 1);
  assert.equal(getDueReminders(store, new Date('2026-11-26T23:59:00.000Z')).length, 0);
  assert.equal(updateReminderStatus(store,{subscriptionId:first.subscriptionId,reminderId:'event-1',status:'snoozed',snoozeUntil:'2026-11-27T00:10:00.000Z'},new Date('2026-11-27T00:00:00.000Z')),true);
  assert.equal(getDueReminders(store,new Date('2026-11-27T00:05:00.000Z')).length,0);
  assert.equal(getDueReminders(store,new Date('2026-11-27T00:11:00.000Z')).length,1);
  assert.equal(updateReminderStatus(store,{subscriptionId:first.subscriptionId,reminderId:'event-1',status:'completed'},new Date('2026-11-27T00:12:00.000Z')),true);
  assert.equal(getDueReminders(store,new Date('2026-11-28T00:00:00.000Z')).length,0);
  assert.equal(removeSubscription(store,first.subscriptionId),true);
  assert.equal(store.reminders.length,0);
});
