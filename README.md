# Healthify · 21-Day Fat Loss & Healthy Routine PWA

A mobile, tablet, and desktop-first Marathi Progressive Web App built with HTML, CSS, JavaScript ES Modules, JSON plan data, and IndexedDB. It does not contain Android or iOS native app projects.

## Privacy design

- Public repository files contain the 21-day meal/workout reference plan only. Personal profile fields and profile-specific nutrition targets have been removed from the public JSON.
- Name, age, height, weight, waist, knee score, daily progress, food/water logs, reminder status, and backup data are stored on the user's device in IndexedDB.
- Profile, weight, waist, daily progress, food/water logs, reminder status, and backup data are stored on the user's device in IndexedDB. Health data is not sent to a backend.
- Routine reminders are shown only while the app is open. Closed-app Push notifications and a Push backend are not included.

## Run the PWA locally

Use a local HTTP server (ES modules, Service Worker, IndexedDB, and Push require localhost/HTTPS):

```bash
python -m http.server 5500
```

Open `http://localhost:5500`. Complete the profile form; values are saved only in the browser's IndexedDB. The default 21-day start date is 27 November 2026.

## Run validation and tests

```bash
npm install
npm run check
```

The static deployment output is generated in `dist/` by `npm run build:static`.

The check validates all 21 days, 126 meal entries, the 22-event daily reminder template, quantities/units/weight states, privacy stripping, push-schedule construction, and syntax of application modules.

## PWA installation

Deploy the static project to HTTPS (for example GitHub Pages). Open on mobile and use the browser's Install App / Add to Home Screen action. The service worker caches the app shell and plan JSON for offline plan viewing and logging.

Google fonts are CDN resources; the app's custom CSS and cached core data remain available offline. If the CDN is unavailable, system fonts and the local layout remain usable.

## Reminders

Reminders are evaluated locally while Healthify is open. The app does not request Push credentials or schedule closed-app notifications. Browser or OS alarms are not guaranteed when the app is closed.

## Nutrition data status

The source meal plan contains 41 distinct food labels. `data/food-master.json` provides 41 mapped Food Master records, but verified per-100g/ml nutrient values and recipe-level oil quantities are not present in the source. Values remain null by design; Healthify must not fabricate calories/protein. Add verified food master values and measured recipe ingredients before enabling numerical nutrition totals.

## Health safety

This app is a routine and logging tool, not a diagnosis or treatment. The supplied plan warns against running, jumping and deep squats while knee pain is present. Stop movements that increase pain and seek a clinician/physiotherapist's advice for worsening or persistent symptoms. Supplement dose and timing are not inferred.

## Tech stack

- HTML5 / CSS3 / JavaScript ES Modules
- Custom responsive CSS design system
- JSON meal and reminder data
- IndexedDB local health data
- Service Worker + Web App Manifest
