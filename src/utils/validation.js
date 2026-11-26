export function validateProfile(profile) {
  const errors = [];
  if (!profile || typeof profile !== 'object') return ['Profile माहिती आवश्यक आहे.'];
  if (!profile.name?.trim()) errors.push('नाव भरा.');
  if (!Number.isInteger(Number(profile.ageYears)) || Number(profile.ageYears) < 18 || Number(profile.ageYears) > 100) errors.push('वय 18 ते 100 दरम्यान असावे.');
  if (!Number.isFinite(Number(profile.heightCm)) || Number(profile.heightCm) < 100 || Number(profile.heightCm) > 230) errors.push('उंची 100 ते 230 cm दरम्यान असावी.');
  if (!Number.isFinite(Number(profile.currentWeightKg)) || Number(profile.currentWeightKg) < 30 || Number(profile.currentWeightKg) > 300) errors.push('वजन 30 ते 300 kg दरम्यान असावे.');
  if (!Number.isFinite(Number(profile.waistInches)) || Number(profile.waistInches) < 15 || Number(profile.waistInches) > 100) errors.push('कंबर माप 15 ते 100 इंच दरम्यान असावे.');
  if (!['male', 'female', 'other'].includes(profile.sex)) errors.push('लिंग निवडा.');
  if (!['both', 'veg', 'both-eggs'].includes(profile.dietPreference)) errors.push('आहार प्रकार निवडा.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(profile.startDate || '')) errors.push('प्रोग्राम सुरू करण्याची तारीख योग्य नाही.');
  return errors;
}

export function validatePlan(plan, foodMaster = null) {
  const errors = [];
  if (!plan || !Array.isArray(plan.days) || plan.days.length !== 21) return ['Plan मध्ये नेमके 21 दिवस असणे आवश्यक आहे.'];
  const expectedReminders = plan.dailyReminderTemplate;
  if (!Array.isArray(expectedReminders) || expectedReminders.length === 0) errors.push('Reminder template रिकामे आहे.');
  const seenDays = new Set();
  plan.days.forEach((day, index) => {
    if (day.day !== index + 1) errors.push(`Day sequence चुकीचा: index ${index}, day ${day.day}.`);
    if (seenDays.has(day.day)) errors.push(`Day ${day.day} duplicate आहे.`);
    seenDays.add(day.day);
    if (!Array.isArray(day.meals) || day.meals.length !== 6) errors.push(`Day ${day.day}: 6 meal entries अपेक्षित आहेत.`);
    for (const meal of day.meals || []) {
      if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(meal.time || '')) errors.push(`Day ${day.day}: Meal time invalid (${meal.time}).`);
      if (!Array.isArray(meal.items) || meal.items.length === 0) errors.push(`Day ${day.day}: ${meal.label} मध्ये items नाहीत.`);
      for (const item of meal.items || []) {
        if (!item.name || !Number.isFinite(Number(item.quantity)) || Number(item.quantity) <= 0 || !item.unit) errors.push(`Day ${day.day}: Food item quantity/name/unit invalid.`);
        if (!['raw', 'cooked', 'dry', 'as_served'].includes(item.weightState)) errors.push(`Day ${day.day}: ${item.name} weightState invalid.`);
        if (foodMaster && !foodMaster.foods?.some(food => food.foodId === item.foodMasterId)) errors.push(`Day ${day.day}: ${item.name} Food Master reference missing.`);
      }
    }
    if (!day.exercise || !Number.isFinite(day.exercise.walkingMin)) errors.push(`Day ${day.day}: Exercise plan incomplete.`);
  });
  const times = new Set();
  for (const reminder of expectedReminders || []) {
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(reminder.time || '')) errors.push(`Reminder time invalid: ${reminder.time}.`);
    if (!reminder.title || !reminder.type) errors.push(`Reminder ${reminder.time} मध्ये title/type नाही.`);
    if (times.has(reminder.time)) errors.push(`Duplicate reminder time: ${reminder.time}.`);
    times.add(reminder.time);
  }
  return errors;
}
