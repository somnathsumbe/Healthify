import fs from 'node:fs';
import { validatePlan } from '../src/utils/validation.js';

const path = new URL('../data/21-day-fat-loss-plan.json', import.meta.url);
const plan = JSON.parse(fs.readFileSync(path, 'utf8'));
const foodMaster = JSON.parse(fs.readFileSync(new URL('../data/food-master.json', import.meta.url), 'utf8'));
const errors = validatePlan(plan, foodMaster);
const mealCount = plan.days.reduce((sum, day) => sum + day.meals.length, 0);
const foodNames = new Set(plan.days.flatMap(day => day.meals.flatMap(meal => meal.items.map(item => item.name))));
const mappedFoodIds = new Set(plan.days.flatMap(day => day.meals.flatMap(meal => meal.items.map(item => item.foodMasterId))));

if (errors.length) {
  console.error('PLAN VALIDATION FAILED');
  errors.forEach(error => console.error(`- ${error}`));
  process.exitCode = 1;
} else {
  console.log('PLAN VALIDATION PASSED');
  console.log(`Days: ${plan.days.length}/21`);
  console.log(`Meal entries: ${mealCount}/126`);
  console.log(`Distinct food labels: ${foodNames.size}`);
  console.log(`Food Master entries: ${foodMaster.foods.length}; mapped plan IDs: ${mappedFoodIds.size}`);
  console.log(`Daily reminders: ${plan.dailyReminderTemplate.length}`);
  console.log(`Water reminders: ${plan.waterReminderDetails.length}`);
  console.log(`Start date: ${plan.planSettings.startDate}`);
  console.log(`Personal profile embedded: ${Object.hasOwn(plan, 'userProfile') ? 'YES (ERROR)' : 'NO (privacy check passed)'}`);
  if (mealCount !== 126 || foodNames.size !== 41 || foodMaster.foods.length !== 41 || mappedFoodIds.size !== 41 || Object.hasOwn(plan, 'userProfile')) process.exitCode = 1;
}
