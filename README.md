# Healthify · 21-Day Fat Loss & Healthy Routine PWA

A mobile-first, Marathi-first Progressive Web App built with HTML, CSS, JavaScript ES Modules, Bootstrap 5 styling, JSON plan data, IndexedDB, and a separate minimal Web Push service.

## Privacy design

- Public repository files contain the 21-day meal/workout reference plan only. Personal profile fields and profile-specific nutrition targets have been removed from the public JSON.
- Name, age, height, weight, waist, knee score, daily progress, food/water logs, reminder status, and backup data are stored on the user's device in IndexedDB.
- The Push Service stores only the browser Push Subscription and scheduled reminder delivery fields (`send_at`, `title`, `body`). It does not receive profile, weight, waist, meal logs, or medical notes.
- VAPID private keys and the push owner token must exist only as server environment variables. Never commit `.env` or secrets.

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

The Bootstrap 5.3.3 stylesheet and Google font are CDN resources; the app's custom CSS and cached core data remain available offline. If the CDN is unavailable, layout remains usable with local CSS, though Bootstrap-specific modal layout enhancements may be reduced.

## Closed-app Push setup

The Push backend is separate from GitHub Pages and must run on an HTTPS host with a persistent disk for its JSON state file.

1. Deploy `push-service/` as a Node.js service from this repository.
2. Set the environment variables listed in `.env.example` on the hosting provider.
3. Generate a VAPID key pair with `npx web-push generate-vapid-keys` and set both keys on the server.
4. Set `PUSH_API_TOKEN` to a random token of at least 32 characters; do not add this token to source code.
5. Configure `ALLOWED_ORIGIN` to the exact PWA origin.
6. Open Healthify → Settings → Push Notification Setup. Enter the push service URL and owner token. The app subscribes the current browser and sends only the 21-day reminder schedule.

Push delivery is best-effort, not an alarm-clock guarantee. Browser/OS notification settings, internet access, power management and push-provider availability affect delivery. On iOS, install the app to the Home Screen and grant permission. In-app reminders run only while the app is open.

## Nutrition data status

The source meal plan contains 41 distinct food labels. `data/food-master.json` provides 41 mapped Food Master records, but verified per-100g/ml nutrient values and recipe-level oil quantities are not present in the source. Values remain null by design; Healthify must not fabricate calories/protein. Add verified food master values and measured recipe ingredients before enabling numerical nutrition totals.

## Health safety

This app is a routine and logging tool, not a diagnosis or treatment. The supplied plan warns against running, jumping and deep squats while knee pain is present. Stop movements that increase pain and seek a clinician/physiotherapist's advice for worsening or persistent symptoms. Supplement dose and timing are not inferred.

## Tech stack

- HTML5 / CSS3 / JavaScript ES Modules
- Bootstrap 5.3.3 CDN stylesheet
- JSON meal and reminder data
- IndexedDB local health data
- Service Worker + Web App Manifest
- Node.js / Express / web-push / JSON persistent state / node-cron for optional closed-app Push
