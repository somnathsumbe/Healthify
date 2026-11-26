import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../service-worker.js', import.meta.url), 'utf8');
function createWorkerHarness() {
  const listeners = new Map();
  const calls = { notifications: [], opened: [], cacheAdds: [], skipWaiting: false };
  const self = {
    location: { origin: 'https://example.test', href: 'https://example.test/Healthify/service-worker.js' },
    registration: {
      scope: 'https://example.test/Healthify/',
      showNotification: (title, options) => { calls.notifications.push({ title, options }); return Promise.resolve(); }
    },
    clients: {
      matchAll: async () => [],
      openWindow: async url => { calls.opened.push(url); return {}; }
    },
    addEventListener: (name, callback) => listeners.set(name, callback),
    skipWaiting: async () => { calls.skipWaiting = true; },
    clientsClaimed: false,
    clients: {
      matchAll: async () => [],
      openWindow: async url => { calls.opened.push(url); return {}; },
      claim: async () => { self.clientsClaimed = true; }
    }
  };
  const caches = {
    open: async () => ({ addAll: async files => calls.cacheAdds.push(files), put: async () => {} }),
    keys: async () => ['healthify-shell-v1'],
    delete: async () => true,
    match: async () => null
  };
  vm.runInNewContext(source, { self, caches, URL, Promise, Error, fetch: async () => ({ ok:true, clone(){return this;} }) });
  return { listeners, calls, self };
}

test('service worker installs the full application shell', async () => {
  const { listeners, calls } = createWorkerHarness();
  let installPromise;
  listeners.get('install')({ waitUntil: promise => { installPromise = promise; } });
  await installPromise;
  assert.equal(calls.cacheAdds.length, 1);
  assert.ok(calls.cacheAdds[0].includes('./data/21-day-fat-loss-plan.json'));
  assert.ok(calls.skipWaiting);
});

test('push event renders a notification with mascot icon, tag and click data', async () => {
  const { listeners, calls } = createWorkerHarness();
  let pushPromise;
  listeners.get('push')({ data: { json: () => ({ title:'पाणी पिण्याची वेळ', body:'250 ml पाणी प्या', tag:'2026-11-27-0900-water', url:'./' }) }, waitUntil: promise => { pushPromise = promise; } });
  await pushPromise;
  assert.equal(calls.notifications.length, 1);
  assert.equal(calls.notifications[0].title, 'पाणी पिण्याची वेळ');
  assert.equal(calls.notifications[0].options.data.reminderId, '2026-11-27-0900-water');
  assert.match(calls.notifications[0].options.icon, /192\.png$/);
});

test('notification click opens the PWA with the originating reminder id', async () => {
  const { listeners, calls } = createWorkerHarness();
  let clickPromise;
  listeners.get('notificationclick')({ notification: { data:{ url:'./', reminderId:'2026-11-27-0900-water' }, close(){} }, waitUntil: promise => { clickPromise = promise; } });
  await clickPromise;
  assert.equal(calls.opened.length, 1);
  assert.match(calls.opened[0], /reminderId=2026-11-27-0900-water/);
});
