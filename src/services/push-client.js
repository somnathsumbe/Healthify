export async function requestNotificationPermission() {
  if (!('Notification' in window)) throw new Error('या Browser मध्ये Notifications उपलब्ध नाहीत.');
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) throw new Error('या Browser मध्ये Web Push उपलब्ध नाही.');
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') throw new Error('Notification Permission मिळाली नाही. Browser Settings मध्ये परवानगी द्या.');
  return permission;
}

export async function subscribeToPush({ endpoint, token, applicationServerKey }) {
  if (!endpoint || !token || !applicationServerKey) throw new Error('Push Service URL, Access Token आणि VAPID Public Key आवश्यक आहेत.');
  await requestNotificationPermission();
  const registration = await navigator.serviceWorker.ready;
  let subscription = await registration.pushManager.getSubscription();
  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: decodeBase64Url(applicationServerKey)
    });
  }
  const response = await fetch(`${endpoint.replace(/\/$/, '')}/api/push/subscribe`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ subscription: subscription.toJSON() })
  });
  if (!response.ok) throw new Error(`Subscription सेव्ह झाले नाही (${response.status}).`);
  return response.json();
}

export async function getVapidPublicKey(endpoint) {
  const response = await fetch(`${endpoint.replace(/\/$/, '')}/api/push/vapid-public-key`);
  if (!response.ok) throw new Error('Push Service कडून VAPID Key मिळाली नाही.');
  const data = await response.json();
  return data.publicKey;
}

export async function removePushSubscription({ endpoint, token, subscriptionId }) {
  const response = await fetch(`${endpoint.replace(/\/$/, '')}/api/push/unsubscribe`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ subscriptionId })
  });
  if (!response.ok) throw new Error('Push Subscription रद्द करता आली नाही.');
  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.getSubscription();
  if (subscription) await subscription.unsubscribe();
  return response.json();
}

function decodeBase64Url(value) {
  const padding = '='.repeat((4 - value.length % 4) % 4);
  const base64 = (value + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  return Uint8Array.from(raw, character => character.charCodeAt(0));
}
