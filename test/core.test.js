import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { validateProfile, validatePlan } from '../src/utils/validation.js';
import { isWithinReminderWindow } from '../src/modules/reminder-engine.js';
import { addDaysISO, diffDays, istDateTimeToISO, getProgramDay } from '../src/utils/date-time.js';
import { calculateNutrition } from '../src/modules/nutrition-calculator.js';
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
