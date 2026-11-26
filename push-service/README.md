# Healthify Push Service

A small Node.js service for closed-app Web Push reminders. It stores **only** the Web Push subscription and reminder delivery schedule (`sendAt`, `title`, `body`). It must not receive weight, waist, food logs, medical notes, or any other health profile data.

## Environment variables

Copy `.env.example` to `.env` on the server only, and set:

- `PUSH_API_TOKEN`: random owner token, at least 32 characters.
- `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY`: generate with `npx web-push generate-vapid-keys`.
- `VAPID_SUBJECT`: `mailto:you@example.com`.
- `DATA_FILE`: persistent JSON state file path on the host.
- `ALLOWED_ORIGIN`: exact PWA origin, for example `https://somnathsumbe.github.io`.

Never commit `.env`, VAPID private keys, or the owner token. Use persistent disk storage for the JSON state file; ephemeral server filesystems will lose subscriptions and schedules on restart.

## Run locally

```bash
npm install
cp .env.example .env
# set real values in .env
npm run push:start
```

Endpoints:

- `GET /api/push/health`
- `GET /api/push/vapid-public-key`
- `POST /api/push/subscribe` (Bearer owner token)
- `POST /api/push/schedule` (Bearer owner token; max 462 reminders)
- `POST /api/push/reminder-status` (Bearer owner token)
- `POST /api/push/unsubscribe` (Bearer owner token)

The scheduler checks once per minute in `Asia/Kolkata`. Push delivery timing depends on network, browser, and push-provider availability; do not treat it as an alarm-clock guarantee.
