export function calculateNutrition(items, foodMaster) {
  const foods = new Map((foodMaster?.foods || []).map(food => [food.foodId, food]));
  let calories = 0;
  let protein = 0;
  let complete = 0;
  let missing = 0;
  for (const item of items || []) {
    const food = item.foodMasterId ? foods.get(item.foodMasterId) : null;
    const values = food?.nutritionPer100g;
    const quantity = Number(item.quantity);
    if (!values || !Number.isFinite(values.caloriesKcal) || !Number.isFinite(values.proteinG) || !Number.isFinite(quantity)) {
      missing += 1;
      continue;
    }
    const multiplier = item.unit === 'ml' || item.unit === 'g' ? quantity / 100 : null;
    if (multiplier == null) { missing += 1; continue; }
    calories += values.caloriesKcal * multiplier;
    protein += values.proteinG * multiplier;
    complete += 1;
  }
  return { caloriesKcal: complete ? Math.round(calories) : null, proteinG: complete ? Number(protein.toFixed(1)) : null, completeItems: complete, missingItems: missing, isComplete: missing === 0 };
}
