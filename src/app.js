import { loadPlan, loadFoodMaster } from './modules/plan-loader.js';
import { calculateNutrition } from './modules/nutrition-calculator.js';
import { getProgramDay, getTodayISO, formatDateMarathi, addDaysISO } from './utils/date-time.js';
import { getRecord, putRecord, getAllRecords, exportLocalBackup, importLocalBackup, clearAllHealthData } from './services/storage.js';
import { validateProfile } from './utils/validation.js';
import { addWater, getTodayWaterTotal, getTodayWaterEntries, removeWaterEntry } from './modules/water-tracker.js';
import { saveDailyProgress, getProgressHistory, calculateSevenDayAverage, getTodayProgress } from './modules/progress.js';
import { setReminderStatus, startReminderEngine } from './modules/reminder-engine.js';

const $ = (selector, root = document) => root.querySelector(selector);
const app = $('#app');
let plan;
let foodMaster;
let profile;
let activeView = 'today';
let dayOverride = null;
let stopReminderEngine = null;
let installPrompt = null;

const icons = { water:'💧', meal:'🍱', wake:'🌞', mobility:'🤸', cardio:'🚶', cooldown:'🌿', movement_break:'🕺', sleep_prep:'🌙', sleep:'😴' };

function toast(message, type = 'success') {
  const host = $('#toastHost');
  const node = document.createElement('div');
  node.className = `toast-message toast-${type}`;
  node.textContent = message;
  host.append(node);
  setTimeout(() => node.remove(), 3500);
}


function showReminderActions(reminder) {
  const host = $('#toastHost');
  const node = document.createElement('div');
  node.className = 'toast-message toast-info reminder-action-toast';
  const copy = document.createElement('div');
  copy.textContent = `${icons[reminder.type] || '🔔'} ${reminder.title} · ${reminder.message}`;
  const actions = document.createElement('div');
  actions.className = 'reminder-actions';
  const makeAction = (label, status) => {
    const button = document.createElement('button');
    button.type = 'button'; button.textContent = label;
    button.addEventListener('click', async () => {
      try {
        const extra = status === 'snoozed' ? { snoozeUntil: new Date(Date.now() + 10 * 60_000).toISOString(), notifiedAt: null } : {};
        await setReminderStatus(reminder.id, status, extra);
        node.remove();
        toast(status === 'completed' ? 'छान! Reminder पूर्ण झाला. 🎉' : status === 'skipped' ? 'Reminder Skip केला.' : '10 मिनिटांनी पुन्हा आठवण करून देऊ. ⏰');
      } catch (error) { toast(error.message, 'error'); }
    });
    return button;
  };
  actions.append(makeAction('पूर्ण ✓', 'completed'), makeAction('10 मिनिटे', 'snoozed'), makeAction('Skip', 'skipped'));
  node.append(copy, actions); host.append(node);
  while (host.children.length > 3) host.firstElementChild.remove();
}

function escapeHTML(value = '') {
  return String(value).replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
}

function getProgramContext() {
  return getProgramDay(profile.startDate);
}

function getSelectedDay() {
  const context = getProgramContext();
  return plan.days[(dayOverride || context.day) - 1] || plan.days[0];
}

function renderShell() {
  app.innerHTML = `
    <aside class="desktop-sidebar" aria-label="मुख्य मेनू">
      <div class="brand-lockup"><img src="./assets/icons/healthify-mascot.svg" alt="" class="brand-mascot"><div><div class="brand-name">healthify<span>.</span></div><div class="brand-subtitle">तुमचा healthy buddy</div></div></div>
      <nav class="desktop-nav">
        <button data-view="today" class="desktop-nav-item active"><span>01</span>Dashboard</button>
        <button data-view="plan" class="desktop-nav-item"><span>02</span>My 21-Day Plan</button>
        <button data-view="water" class="desktop-nav-item"><span>03</span>Water Tracker</button>
        <button data-view="workout" class="desktop-nav-item"><span>04</span>Exercise & Activity</button>
        <button data-view="progress" class="desktop-nav-item"><span>05</span>My Progress</button>
        <button data-view="settings" class="desktop-nav-item"><span>06</span>Settings</button>
      </nav>
      <button class="sidebar-profile" data-view="settings"><img src="./assets/icons/mascot-happy.svg" alt=""><span><strong id="sidebarProfileName">Healthify</strong><small>Local profile</small></span></button>
    </aside>
    <section class="desktop-main">
      <header class="app-header">
        <div class="mobile-brand brand-lockup"><img src="./assets/icons/healthify-mascot.svg" alt="" class="brand-mascot"><div><div class="brand-name">healthify<span>.</span></div></div></div>
        <div class="desktop-greeting"><span id="desktopGreeting">Good morning</span><strong id="desktopDate"></strong></div>
        <div class="header-actions"><button class="theme-button" id="themeToggle" type="button" aria-label="Dark theme switch">Dark</button><button class="icon-button" id="openSettings" aria-label="Settings">Settings</button></div>
      </header>
      <main id="viewRoot" class="view-root" tabindex="-1"></main>
    </section>
    <aside class="context-panel" aria-label="आजची माहिती">
      <div class="context-heading"><span class="eyebrow">TODAY</span><strong id="contextDay">Day 1</strong></div>
      <div class="context-card"><span class="eyebrow">NEXT REMINDER</span><strong id="contextReminder">Loading...</strong><small id="contextReminderText"></small></div>
      <div class="context-card"><span class="eyebrow">QUICK ACTIONS</span><button data-view="water" class="context-action">Add water</button><button data-view="workout" class="context-action">Start activity</button></div>
    </aside>
    <nav class="bottom-nav" aria-label="मुख्य मेनू">
      <button data-view="today" class="nav-item active"><span aria-hidden="true">Home</span><small>आज</small></button>
      <button data-view="plan" class="nav-item"><span aria-hidden="true">Plan</span><small>21 दिवस</small></button>
      <button data-view="water" class="nav-item"><span aria-hidden="true">Water</span><small>पाणी</small></button>
      <button data-view="progress" class="nav-item"><span aria-hidden="true">Progress</span><small>प्रगती</small></button>
      <button data-view="settings" class="nav-item"><span aria-hidden="true">Profile</span><small>Profile</small></button>
    </nav>
    <div id="toastHost" class="toast-host" aria-live="polite"></div>
    <dialog class="profile-dialog" id="profileModal" aria-labelledby="profileModalTitle">
      <div class="modal-content custom-modal">
        <div class="modal-header border-0"><div><span class="eyebrow">तुमची वैयक्तिक जागा</span><h2 class="modal-title" id="profileModalTitle">तुमचा profile तयार करूया ✨</h2></div><button type="button" class="dialog-close" id="closeProfile" aria-label="Close">×</button></div>
        <div class="modal-body"><p class="muted-copy">ही माहिती फक्त या डिव्हाइसवर जतन होते. कोणत्याही server कडे पाठवली जात नाही.</p>
          <form id="profileForm" class="form-grid">
            <label class="field field-wide">तुमचे नाव<input name="name" required maxlength="80" autocomplete="name" placeholder="तुमचे नाव"></label>
            <label class="field">वय<input name="ageYears" type="number" min="18" max="100" required inputmode="numeric" placeholder="वर्षे"></label>
            <label class="field">लिंग<select name="sex"><option value="male">पुरुष</option><option value="female">स्त्री</option><option value="other">इतर</option></select></label>
            <label class="field">उंची (cm)<input name="heightCm" type="number" min="100" max="230" required inputmode="decimal" placeholder="उदा. 170"></label>
            <label class="field">सध्याचे वजन (kg)<input name="currentWeightKg" type="number" min="30" max="300" step="0.1" required inputmode="decimal" placeholder="उदा. 70.0"></label>
            <label class="field">कंबर (इंच)<input name="waistInches" type="number" min="15" max="100" step="0.1" required inputmode="decimal" placeholder="उदा. 30"></label>
            <label class="field">आहार<select name="dietPreference"><option value="both">Veg + Non-Veg</option><option value="veg">फक्त Veg</option><option value="both-eggs">Veg + Eggs</option></select></label>
            <label class="field field-wide">कार्यक्रम सुरू होण्याची तारीख<input name="startDate" type="date" required value="2026-11-27"></label>
            <label class="field field-wide">गुडघेदुखी<select name="kneeSymptoms"><option value="mild">कधीकधी सौम्य वेदना</option><option value="none">सध्या वेदना नाहीत</option><option value="moderate">चालताना/जिना चढताना त्रास</option><option value="severe">जास्त वेदना</option></select></label>
            <div class="field-wide local-note">🔒 आरोग्य माहिती तुमच्या डिव्हाइसवरच राहील. सार्वजनिक Repository मध्ये ती नसते.</div>
            <div class="field-wide"><button class="primary-button w-100" type="submit">माझा Healthify सुरू करा <span>→</span></button></div>
          </form>
        </div>
      </div>
    </dialog>`;
  app.querySelectorAll('[data-view]').forEach(button => button.addEventListener('click', () => navigate(button.dataset.view)));
  $('#openSettings').addEventListener('click', () => navigate('settings'));
  $('#closeProfile').addEventListener('click', () => { if (profile) $('#profileModal').close(); else toast('सुरू करण्यासाठी Profile पूर्ण करा.', 'error'); });
  $('#themeToggle').addEventListener('click', toggleTheme);
  applySavedTheme();
  updateHeader();
}

function navigate(view) {
  activeView = view;
  dayOverride = null;
  app.querySelectorAll('.nav-item').forEach(button => button.classList.toggle('active', button.dataset.view === view));
  app.querySelectorAll('.desktop-nav-item').forEach(button => button.classList.toggle('active', button.dataset.view === view));
  renderView().catch(error => toast(error.message, 'error'));
}

function applySavedTheme() {
  const saved = localStorage.getItem('healthify-theme');
  const theme = saved === 'dark' ? 'dark' : 'light';
  document.documentElement.dataset.theme = theme;
  const button = $('#themeToggle');
  if (button) {
    button.textContent = theme === 'dark' ? 'Light' : 'Dark';
    button.setAttribute('aria-label', theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme');
  }
}

function toggleTheme() {
  const theme = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  document.documentElement.dataset.theme = theme;
  localStorage.setItem('healthify-theme', theme);
  applySavedTheme();
}

function updateHeader() {
  if (!profile) return;
  const hour = new Date().getHours();
  $('#desktopGreeting').textContent = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  $('#desktopDate').textContent = formatDateMarathi(getTodayISO());
  $('#sidebarProfileName').textContent = profile.name;
  const context = getProgramContext();
  $('#contextDay').textContent = context.beforeStart ? 'Starting soon' : `Day ${context.day} / 21`;
}

function profileBMI() {
  return Number(profile.currentWeightKg) / ((Number(profile.heightCm) / 100) ** 2);
}

async function renderToday() {
  const context = getProgramContext();
  const day = getSelectedDay();
  const nextReminder = (context.beforeStart ? plan.dailyReminderTemplate[0] : plan.dailyReminderTemplate.find(item => item.time > new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Kolkata',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(new Date())));
  const done = await awaitCountDone(day);
  const phaseLabel = day.phase.replace('Phase 1 - ', '').replace('Phase 2 - ', '').replace('Phase 3 - ', '');
  return `
    <section class="hero-card">
      <div class="hero-copy"><span class="eyebrow">${context.beforeStart ? 'उद्या सुरुवात' : `DAY ${context.day} / 21`}</span><h1>हाय ${escapeHTML(profile.name.split(' ')[0])}!<br>आजचा दिवस तुझाच</h1><p>${context.beforeStart ? `${formatDateMarathi(profile.startDate)} पासून आपली journey सुरू होईल.` : 'छोट्या सवयी, मोठा बदल. आजचा प्लॅन पूर्ण करूया!'}</p><div class="hero-pills"><span>${phaseLabel}</span><span>${done}/6 meals complete</span></div><button class="hero-action" data-action="start-day">${context.beforeStart ? 'Program पूर्वतयारी' : 'Start My Day'}</button></div>
      <img class="hero-mascot" src="./assets/icons/mascot-happy.svg" alt="हसरा fitness cartoon buddy">
      <div class="hero-spark spark-one">✦</div><div class="hero-spark spark-two">✦</div>
    </section>
    <section class="stats-grid">
      <article class="stat-card"><span class="stat-icon coral">⚖️</span><span class="stat-label">आजचे वजन</span><strong>${Number(profile.currentWeightKg).toFixed(1)} <small>kg</small></strong><small class="stat-foot">सध्याची नोंद</small></article>
      <article class="stat-card"><span class="stat-icon lilac">📐</span><span class="stat-label">कंबर</span><strong>${Number(profile.waistInches).toFixed(1)} <small>in</small></strong><small class="stat-foot">${(profile.waistInches*2.54).toFixed(1)} cm</small></article>
      <article class="stat-card"><span class="stat-icon mint">💧</span><span class="stat-label">आजचे पाणी</span><strong id="waterTotalToday">… <small>ml</small></strong><small class="stat-foot">लवचिक लक्ष्य 2–2.5 L</small></article>
    </section>
    <section class="section-heading"><div><span class="eyebrow">YOUR ROUTINE</span><h2>आजचा प्लॅन</h2></div><button class="text-button" data-action="open-plan">सर्व पाहा →</button></section>
    <section class="next-reminder-card"><img src="./assets/icons/mascot-water.svg" alt="पाणी reminder cartoon"><div><span class="eyebrow">NEXT REMINDER</span><strong>${nextReminder ? `${nextReminder.time} · ${escapeHTML(nextReminder.title)}` : 'आजचे सर्व Reminder झाले!'}</strong><small>${nextReminder?.message || 'छान काम केलं!'}</small></div><span class="reminder-dot"></span></section>
    <section class="timeline-card"><div class="timeline-head"><strong>आजची Checklist</strong><span>${done}/6 meals</span></div><div class="progress-track"><span style="width:${Math.round(done/6*100)}%"></span></div>${day.meals.map(meal => `<div class="meal-row"><div class="meal-time">${meal.time}</div><div class="meal-emoji">${meal.time==='06:45'?'🥛':meal.time==='07:15'?'🍳':meal.time==='11:00'?'🍛':meal.time==='14:00'?'🍎':meal.time==='16:30'?'🥗':'🍽️'}</div><div class="meal-info"><strong>${escapeHTML(meal.label)}</strong><small>${meal.items.map(item=>`${escapeHTML(item.name)} · ${item.quantity} ${escapeHTML(item.unit)}`).join(' • ')}</small></div><button class="check-button" data-meal-time="${meal.time}" aria-label="${meal.time} पूर्ण करा" ${context.beforeStart ? 'disabled title="कार्यक्रम सुरू झाल्यावर उपलब्ध"' : ''}>✓</button></div>`).join('')}</section>
    <section class="nutrition-status-card"><span class="nutrition-icon">🥑</span><div><strong>Nutrition Calculator</strong><p>Food Master मधील सत्यापित Calories आणि Protein माहिती जोडणे बाकी आहे. चुकीचे आकडे दाखवले जाणार नाहीत.</p></div><span class="nutrition-badge">Pending</span></section>
    <section class="buddy-tip"><img src="./assets/icons/mascot-happy.svg" alt="cartoon buddy"><div><strong>आजचा छोटा सल्ला 💛</strong><p>लॅपटॉपसमोर सलग बसू नकोस. दर तासाला थोडी हालचाल कर.</p></div></section>`;
}

async function awaitCountDone(day) {
  const date = getTodayISO();
  const entries = await getAllRecords('reminders');
  const doneIds = new Set(entries.filter(entry => entry.status === 'completed' && entry.id.startsWith(date)).map(entry => entry.id));
  return day.meals.filter(meal => doneIds.has(`${date}-${meal.time.replace(':','')}-meal`)).length;
}

function renderPlan() {
  const context = getProgramContext();
  const day = getSelectedDay();
  const selectedDate = addDaysISO(profile.startDate, day.day - 1);
  const futureDay = selectedDate > getTodayISO();
  return `<section class="page-intro"><span class="eyebrow">YOUR 21 DAY JOURNEY</span><h1>एकवीस दिवसांचा प्लॅन 🗓️</h1><p>प्रत्येक दिवस, प्रत्येक छोटं पाऊल.</p></section>
    <section class="phase-tabs"><button class="phase-tab selected" data-phase="1">01–07 <small>Routine</small></button><button class="phase-tab" data-phase="2">08–14 <small>Consistency</small></button><button class="phase-tab" data-phase="3">15–21 <small>Progress</small></button></section>
    <section class="day-picker" id="dayPicker">${plan.days.map(item=>`<button class="day-chip ${item.day===day.day?'selected':''} ${item.day<context.day?'past':''}" data-day="${item.day}"><small>DAY</small><strong>${String(item.day).padStart(2,'0')}</strong><span>${item.day<context.day?'✓':item.day===context.day?'●':'○'}</span></button>`).join('')}</section>
    <section class="day-detail-card"><div class="day-detail-title"><div><span class="eyebrow">DAY ${day.day} · ${escapeHTML(day.phase)}</span><h2>${['पहिली पायरी','सातत्याची ताकद','प्रगतीची मजा'][Math.min(2,Math.floor((day.day-1)/7))]}</h2></div><span class="day-badge">${day.day}/21</span></div>
      <div class="meal-list">${day.meals.map(meal=>`<article class="meal-card"><div class="meal-card-head"><div class="meal-card-time">${meal.time}</div><div><strong>${escapeHTML(meal.label)}</strong><small>${meal.items.length} पदार्थ</small></div><span class="meal-card-emoji">${meal.time==='06:45'?'🥛':meal.time==='07:15'?'🍳':meal.time==='11:00'?'🍲':meal.time==='14:00'?'🍎':meal.time==='16:30'?'🥚':'🍽️'}</span></div><ul>${meal.items.map(item=>`<li><span>${escapeHTML(item.name)}</span><strong>${item.quantity} ${escapeHTML(item.unit)}</strong><small>${weightLabel(item.weightState)}</small>${item.preparationNote?`<small class="prep-note">${escapeHTML(item.preparationNote)}</small>`:''}</li>`).join('')}</ul><div class="meal-nutrition-status">🥑 ${nutritionLabel(meal.items)}</div><button class="outline-button meal-done" data-meal-time="${meal.time}" ${futureDay ? 'disabled title="हा दिवस सुरू झालेला नाही"' : ''}>✓ पूर्ण झाले</button></article>`).join('')}</div>
      <div class="workout-mini"><strong>🏃 आजचा व्यायाम</strong><p>Warm-up ${day.exercise.warmUpMin} मिनिटे · चालणे ${day.exercise.walkingMin} मिनिटे · Cool-down ${day.exercise.coolDownMin} मिनिटे</p><small>${day.exercise.strengthExercises.map(escapeHTML).join(' · ')}</small></div>
    </section>`;
}

function nutritionLabel(items) {
  const nutrition = calculateNutrition(items, foodMaster);
  if (nutrition.isComplete && nutrition.caloriesKcal != null) return `${nutrition.caloriesKcal} kcal · ${nutrition.proteinG} g protein`;
  return `Nutrition माहिती बाकी · ${nutrition.missingItems} पदार्थ`;
}

function weightLabel(state) { return ({raw:'कच्चे वजन',cooked:'शिजवलेले वजन',dry:'कोरडे वजन',as_served:'दिलेल्या स्वरूपात'})[state] || state || ''; }

async function renderWater() {
  const total = await getTodayWaterTotal();
  const entries = await getTodayWaterEntries();
  return `<section class="page-intro"><span class="eyebrow">HYDRATION TIME</span><h1>पाणी पिण्याची मजा 💧</h1><p>तहान आणि हवामानानुसार पाणी प्या. जबरदस्ती नाही!</p></section>
    <section class="water-hero"><img src="./assets/icons/mascot-water.svg" alt="हसरा पाण्याचा थेंब"><div><span>आजपर्यंत प्यायलेले</span><strong id="waterTotal">${total.toLocaleString('en-IN')} <small>ml</small></strong><small>लक्ष्य मार्गदर्शक: 2,000–2,500 ml</small></div></section>
    <div class="water-progress"><div class="progress-track"><span style="width:${Math.min(100,total/2500*100)}%"></span></div><small>${Math.round(total/2500*100)}% of 2,500 ml guide</small></div>
    <section class="section-heading"><div><span class="eyebrow">QUICK ADD</span><h2>किती पाणी प्यायलात?</h2></div></section><div class="water-add-grid"><button data-water="150">+150 ml</button><button data-water="250">+250 ml</button><button data-water="300">+300 ml</button><button data-water="500">+500 ml</button></div>
    <form id="customWaterForm" class="custom-water form-grid"><label class="field field-wide">Custom quantity (ml)<input name="quantityMl" type="number" min="50" max="3000" step="50" required inputmode="numeric" placeholder="उदा. 350"></label><div class="field-wide"><button class="primary-button w-100" type="submit">पाणी नोंदवा</button></div></form>
    <section class="timeline-card"><div class="timeline-head"><strong>आजच्या नोंदी</strong><span>${entries.length} entries</span></div>${entries.length?entries.map(item=>`<div class="water-entry"><span>💧 ${item.quantityMl} ml</span><small>${new Date(item.createdAt).toLocaleTimeString('mr-IN',{hour:'2-digit',minute:'2-digit'})}</small><button data-remove-water="${item.id}" aria-label="नोंद काढा">×</button></div>`).join(''):'<p class="empty-state">अजून पाणी नोंदवलेले नाही. पहिली नोंद करा!</p>'}</section>`;
}

function renderWorkout() {
  const day = getSelectedDay();
  return `<section class="page-intro"><span class="eyebrow">MOVE WITH CARE</span><h1>आजची हालचाल 🏃</h1><p>गुडघ्यांची काळजी घेऊन आरामात पुढे चला.</p></section>
    <section class="workout-hero"><img src="./assets/icons/mascot-move.svg" alt="व्यायाम करणारा cartoon buddy"><div><span class="eyebrow">DAY ${day.day} WORKOUT</span><h2>${day.exercise.walkingMin} मिनिटे चालणे</h2><p>Warm-up आणि Cool-down सह हलका व्यायाम</p></div></section>
    <section class="timeline-card workout-steps"><div class="workout-step"><span>🤸</span><div><strong>Warm-up</strong><small>${day.exercise.warmUpMin} मिनिटे · हलकी हालचाल</small></div></div><div class="workout-step"><span>🚶</span><div><strong>आरामदायी चालणे</strong><small>${day.exercise.walkingMin} मिनिटे · वेदना नसल्यास</small></div></div><div class="workout-step"><span>🌿</span><div><strong>Cool-down</strong><small>${day.exercise.coolDownMin} मिनिटे</small></div></div></section>
    <section class="timeline-card"><h3>Strength / Mobility</h3><ul class="simple-list">${day.exercise.strengthExercises.map(item=>`<li>${escapeHTML(item)}</li>`).join('')}</ul><div class="safety-note">⚠️ ${escapeHTML(day.exercise.painRule)} खोल बैठका, उड्या आणि धावणे टाळा. गुडघेदुखी वाढल्यास व्यायाम थांबवा.</div></section>
    <section class="timeline-card"><label class="field">व्यायामानंतर Knee Pain Score (0–10)<input type="range" id="kneeSlider" min="0" max="10" value="1"><strong id="kneeValue">1 / 10</strong></label><button class="outline-button w-100 mt-2" id="completeWorkout">✓ आजचा Workout पूर्ण केला</button><button class="primary-button w-100 mt-2" id="saveKnee">Pain Score सेव्ह करा</button></section>`;
}

async function renderProgress() {
  const history = await getProgressHistory();
  const avg = calculateSevenDayAverage(history);
  const today = await getTodayProgress();
  const recent = history.filter(item=>Number.isFinite(item.weightKg)).slice(-7);
  return `<section class="page-intro"><span class="eyebrow">SMALL STEPS, BIG WINS</span><h1>तुझी प्रगती 📈</h1><p>प्रत्येक नोंद म्हणजे स्वतःसाठी केलेली गुंतवणूक.</p></section>
    <section class="stats-grid"><article class="stat-card"><span class="stat-icon coral">⚖️</span><span class="stat-label">सध्याचे वजन</span><strong>${today?.weightKg ?? profile.currentWeightKg} <small>kg</small></strong></article><article class="stat-card"><span class="stat-icon mint">📊</span><span class="stat-label">7 दिवसांची सरासरी</span><strong>${avg?avg.toFixed(1):'—'} <small>kg</small></strong></article><article class="stat-card"><span class="stat-icon lilac">📐</span><span class="stat-label">शेवटचे कंबर माप</span><strong>${[...history].reverse().find(item=>item.waistInches)?.waistInches ?? profile.waistInches} <small>in</small></strong></article></section>
    <section class="timeline-card"><div class="timeline-head"><strong>आजची नोंद</strong><span>${formatDateMarathi(getTodayISO())}</span></div><form id="progressForm" class="form-grid"><label class="field">वजन (kg)<input name="weightKg" type="number" step="0.1" min="30" max="300" value="${today?.weightKg ?? ''}" placeholder="उदा. 77.4"></label><label class="field">झोप (तास)<input name="sleepHours" type="number" step="0.5" min="0" max="24" value="${today?.sleepHours ?? ''}" placeholder="उदा. 7.5"></label><label class="field">कंबर (इंच)<input name="waistInches" type="number" step="0.1" min="15" max="100" value="${today?.waistInches ?? ''}" placeholder="फक्त मोजल्यावर"></label><label class="field field-wide">Knee Pain Score (0–10)<input name="kneePain" type="number" min="0" max="10" step="1" value="${today?.kneePain ?? ''}" placeholder="0 = वेदना नाही"></label><label class="field field-wide">टीप<textarea name="notes" rows="2" maxlength="500" placeholder="आज कसे वाटले?">${escapeHTML(today?.notes || '')}</textarea></label><div class="field-wide"><button class="primary-button w-100" type="submit">आजची प्रगती सेव्ह करा</button></div></form></section>
    <section class="timeline-card"><strong>वजनाचा ट्रेंड</strong>${recent.length>1?`<div class="weight-chart">${recent.map(item=>`<div class="chart-column"><div class="chart-bar" style="height:${Math.max(12,Math.min(100,(item.weightKg-50)*2))}%"></div><small>${item.date.slice(5)}</small><strong>${item.weightKg.toFixed(1)}</strong></div>`).join('')}</div>`:'<p class="empty-state">Trend पाहण्यासाठी किमान दोन वजनाच्या नोंदी करा.</p>'}</section>
    <section class="buddy-tip"><img src="./assets/icons/mascot-happy.svg" alt="cartoon buddy"><div><strong>Consistency is the key! 🌟</strong><p>दररोजच्या वजनापेक्षा 7 दिवसांची सरासरी अधिक उपयोगी ठरते.</p></div></section>`;
}

async function renderSettings() {
  return `<section class="page-intro"><span class="eyebrow">YOUR SPACE</span><h1>Settings ⚙️</h1><p>तुमचा App, तुमचे नियम.</p></section>
    <section class="timeline-card"><div class="section-heading"><div><span class="eyebrow">PROFILE</span><h2>वैयक्तिक माहिती</h2></div><button class="text-button" id="editProfile">Edit</button></div><p><strong>${escapeHTML(profile.name)}</strong></p><p class="muted-copy">${profile.ageYears} वर्षे · ${profile.heightCm} cm · ${profile.currentWeightKg} kg · Waist ${profile.waistInches} in</p><p class="local-note">🔒 Profile आणि Progress फक्त IndexedDB मध्ये जतन होतात.</p></section>
    <section class="timeline-card"><span class="eyebrow">BACKUP & PRIVACY</span><h2>तुमचा डेटा</h2><div class="settings-actions"><button class="outline-button" id="exportBackup">⬇ Backup Download</button><label class="outline-button file-button">⬆ Backup Restore<input type="file" id="importBackup" accept="application/json" hidden></label><button class="danger-button" id="resetData">सर्व Local Data Delete करा</button></div></section>`;
}

async function renderView() {
  const root = $('#viewRoot');
  if (activeView === 'today') root.innerHTML = await renderToday();
  else if (activeView === 'plan') root.innerHTML = renderPlan();
  else if (activeView === 'water') root.innerHTML = await renderWater();
  else if (activeView === 'workout') root.innerHTML = renderWorkout();
  else if (activeView === 'progress') root.innerHTML = await renderProgress();
  else if (activeView === 'settings') root.innerHTML = await renderSettings();
  bindViewEvents(root);
  if (activeView === 'today') $('#waterTotalToday').innerHTML = `${(await getTodayWaterTotal()).toLocaleString('en-IN')} <small>ml</small>`;
  updateHeader();
  updateContextPanel();
}

async function updateContextPanel() {
  if (!plan || !profile) return;
  const context = getProgramContext();
  const now = new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Kolkata',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(new Date());
  const reminder = context.beforeStart
    ? plan.dailyReminderTemplate[0]
    : plan.dailyReminderTemplate.find(item => item.time > now);
  $('#contextReminder').textContent = reminder ? `${reminder.time} · ${reminder.title}` : 'आजचे सर्व Reminder झाले!';
  $('#contextReminderText').textContent = reminder?.message || 'छान काम केलं!';
}

function bindViewEvents(root) {
  root.querySelector('[data-action="open-plan"]')?.addEventListener('click',()=>navigate('plan'));
  root.querySelector('[data-action="start-day"]')?.addEventListener('click',()=>navigate(getProgramContext().beforeStart ? 'plan' : 'water'));
  root.querySelectorAll('[data-meal-time]').forEach(button=>button.addEventListener('click',async()=>{
    const time=button.dataset.mealTime; const date=activeView==='plan' ? addDaysISO(profile.startDate, (dayOverride || getProgramContext().day)-1) : getTodayISO(); const id=`${date}-${time.replace(':','')}-meal`;
    await setReminderStatus(id,'completed',{completedAt:new Date().toISOString()}); toast(`${time} चे Meal पूर्ण झाले! 🎉`); await renderView();
  }));
  root.querySelectorAll('[data-day]').forEach(button=>button.addEventListener('click',()=>{dayOverride=Number(button.dataset.day);renderView();}));
  root.querySelectorAll('[data-phase]').forEach(button=>button.addEventListener('click',()=>{
    const phase=Number(button.dataset.phase); root.querySelectorAll('[data-phase]').forEach(b=>b.classList.toggle('selected',b===button));
    dayOverride=(phase-1)*7+1; renderView();
  }));
  root.querySelectorAll('[data-water]').forEach(button=>button.addEventListener('click',async()=>{try{await addWater(button.dataset.water);toast(`${button.dataset.water} ml पाणी नोंदवले! 💧`);await renderView();}catch(error){toast(error.message,'error');}}));
  root.querySelector('#customWaterForm')?.addEventListener('submit',async event=>{
    event.preventDefault();
    const quantity=Number(new FormData(event.currentTarget).get('quantityMl'));
    if(!Number.isFinite(quantity)||quantity<50||quantity>3000){toast('50 ते 3000 ml मधील प्रमाण भरा.','error');return;}
    try{await addWater(quantity);toast(`${quantity} ml पाणी नोंदवले!`);await renderView();}catch(error){toast(error.message,'error');}
  });
  root.querySelectorAll('[data-remove-water]').forEach(button=>button.addEventListener('click',async()=>{await removeWaterEntry(button.dataset.removeWater);await renderView();}));
  root.querySelector('#kneeSlider')?.addEventListener('input',event=>$('#kneeValue').textContent=`${event.target.value} / 10`);
  root.querySelector('#saveKnee')?.addEventListener('click',async()=>{const current=await getTodayProgress()||{};await saveDailyProgress({...current,kneePain:$('#kneeSlider').value});toast('Knee Pain Score सेव्ह केला.');});
  root.querySelector('#completeWorkout')?.addEventListener('click',async()=>{const current=await getTodayProgress()||{};await saveDailyProgress({...current,exerciseCompleted:true});toast('Workout पूर्ण! छान काम केलं. 💪');});
  root.querySelector('#progressForm')?.addEventListener('submit',async event=>{event.preventDefault();const form=Object.fromEntries(new FormData(event.currentTarget));try{await saveDailyProgress(form);toast('आजची प्रगती सेव्ह झाली!');await renderView();}catch(error){toast(error.message,'error');}});
  root.querySelector('#editProfile')?.addEventListener('click',openProfileModal);
  root.querySelector('#exportBackup')?.addEventListener('click',downloadBackup);
  root.querySelector('#importBackup')?.addEventListener('change',restoreBackup);
  root.querySelector('#resetData')?.addEventListener('click',resetData);
}

async function openProfileModal() {
  const form=$('#profileForm');
  if(profile){for(const [key,value] of Object.entries(profile)){if(form.elements[key])form.elements[key].value=value;}}
  $('#profileModal').showModal();
}

async function saveProfile(event) {
  event.preventDefault();
  const form=Object.fromEntries(new FormData(event.currentTarget));
  const data={...form,ageYears:Number(form.ageYears),heightCm:Number(form.heightCm),currentWeightKg:Number(form.currentWeightKg),waistInches:Number(form.waistInches),waistCircumferenceCm:Number((Number(form.waistInches)*2.54).toFixed(2)),createdAt:profile?.createdAt||new Date().toISOString(),updatedAt:new Date().toISOString()};
  const errors=validateProfile(data);
  if(errors.length){toast(errors.join(' '),'error');return;}
  await putRecord('settings',{id:'profile',...data});
  profile=data;
  $('#profileModal').close();
  if(stopReminderEngine)stopReminderEngine();
  startReminders();
  await renderView(); toast('Profile फक्त या डिव्हाइसवर सेव्ह झाला! 🔒');
}

function startReminders() {
  if(stopReminderEngine) stopReminderEngine();
  stopReminderEngine = null;
  if(profile) stopReminderEngine = startReminderEngine(plan,profile,async reminder=>{
    showReminderActions(reminder);
    if('Notification' in window && Notification.permission==='granted') new Notification(reminder.title,{body:reminder.message,icon:'./assets/icons/healthify-icon-192.png',tag:reminder.id});
    if('vibrate' in navigator) navigator.vibrate([120,60,120]);
  });
}

async function downloadBackup() {
  const backup=await exportLocalBackup();
  const blob=new Blob([JSON.stringify(backup,null,2)],{type:'application/json'});
  const url=URL.createObjectURL(blob); const link=document.createElement('a');link.href=url;link.download=`healthify-local-backup-${getTodayISO()}.json`;link.click();URL.revokeObjectURL(url);toast('Local Backup Download झाला.');
}

async function restoreBackup(event) {
  const file=event.target.files?.[0]; if(!file)return;
  try{const content=JSON.parse(await file.text());if(!confirm('Backup Restore केल्यास सध्याचा Local Data overwrite होईल. पुढे जायचे?'))return;await importLocalBackup(content);profile=await getRecord('settings','profile');await renderView();toast('Backup Restore यशस्वी.');}catch(error){toast(error.message,'error');}
  event.target.value='';
}

async function resetData() {
  if(!confirm('सर्व Profile, Weight, Water आणि Reminder Logs कायमचे Delete करायचे आहेत का? आधी Backup घ्या.'))return;
  await clearAllHealthData();profile=null;if(stopReminderEngine)stopReminderEngine();$('#profileModal').showModal();toast('Local Data Delete केला.','info');
}

function registerPWA() {
  if('serviceWorker' in navigator) navigator.serviceWorker.register('./service-worker.js').catch(error=>console.warn('Service worker registration failed',error));
  window.addEventListener('beforeinstallprompt',event=>{event.preventDefault();installPrompt=event;$('#installApp')?.classList.remove('d-none');});
  $('#installApp')?.addEventListener('click',async()=>{if(!installPrompt)return;installPrompt.prompt();await installPrompt.userChoice;installPrompt=null;});
}

async function init() {
  try {
    [plan, foodMaster]=await Promise.all([loadPlan(), loadFoodMaster()]);
    renderShell();
    const db=await import('./services/storage.js'); await db.openDatabase();
    await db.deleteRecord('settings','push-config');
    profile=await getRecord('settings','profile');
    registerPWA();
    $('#profileForm').addEventListener('submit',saveProfile);
    if(!profile){activeView='today';await openProfileModal();}
    else {startReminders();await renderView();}
    window.addEventListener('online',()=>toast('Internet पुन्हा जोडले गेले.','info'));
  }catch(error){
    app.innerHTML=`<div class="fatal-error"><img src="./assets/icons/healthify-mascot.svg" alt=""><h1>अरेरे! काहीतरी चुकले.</h1><p>${escapeHTML(error.message)}</p><button class="primary-button" onclick="location.reload()">पुन्हा प्रयत्न करा</button></div>`;
  }
}

init();
