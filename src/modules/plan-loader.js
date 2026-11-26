import { validatePlan } from '../utils/validation.js';

export async function loadPlan() {
  const response = await fetch('./data/21-day-fat-loss-plan.json', { cache: 'no-cache' });
  if (!response.ok) throw new Error(`Diet Plan लोड झाला नाही (${response.status}).`);
  const plan = await response.json();
  const errors = validatePlan(plan);
  if (errors.length) throw new Error(`Diet Plan Validation Failed: ${errors.join(' ')}`);
  return plan;
}

export async function loadFoodMaster() {
  const response = await fetch('./data/food-master.json', { cache: 'no-cache' });
  if (!response.ok) throw new Error(`Food Master लोड झाला नाही (${response.status}).`);
  const master = await response.json();
  if (!Array.isArray(master.foods)) throw new Error('Food Master format invalid आहे.');
  return master;
}

export function getDayPlan(plan, dayNumber) {
  return plan.days.find(day => day.day === dayNumber) || plan.days[0];
}
