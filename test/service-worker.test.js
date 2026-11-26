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
