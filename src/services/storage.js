const DB_NAME = 'healthify-local';
const DB_VERSION = 1;
const STORES = ['settings', 'dailyLogs', 'reminders', 'waterLogs'];

let dbPromise;

export function openDatabase() {
  if (!('indexedDB' in globalThis)) return Promise.reject(new Error('या Browser मध्ये IndexedDB उपलब्ध नाही.'));
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      for (const store of STORES) {
        if (!db.objectStoreNames.contains(store)) db.createObjectStore(store, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Local database उघडता आले नाही.'));
    request.onblocked = () => reject(new Error('Database upgrade दुसऱ्या tab मध्ये अडवले गेले आहे.'));
  });
  return dbPromise;
}

export async function getRecord(storeName, id) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const request = db.transaction(storeName, 'readonly').objectStore(storeName).get(id);
    request.onsuccess = () => resolve(request.result ?? null);
    request.onerror = () => reject(request.error);
  });
}

export async function putRecord(storeName, value) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    tx.objectStore(storeName).put(value);
    tx.oncomplete = () => resolve(value);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error('Local save रद्द झाले.'));
  });
}

export async function deleteRecord(storeName, id) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    tx.objectStore(storeName).delete(id);
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}

export async function getAllRecords(storeName) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const request = db.transaction(storeName, 'readonly').objectStore(storeName).getAll();
    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error);
  });
}

export async function clearAllHealthData() {
  const db = await openDatabase();
  await Promise.all(STORES.map(storeName => new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    tx.objectStore(storeName).clear();
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  })));
}

export async function exportLocalBackup() {
  const result = { schemaVersion: 1, exportedAt: new Date().toISOString(), data: {} };
  for (const store of STORES) {
    result.data[store] = await getAllRecords(store);
    if (store === 'settings') result.data.settings = result.data.settings.map(item => item.id === 'push-config' ? { ...item, token: null } : item);
  }
  return result;
}

export async function importLocalBackup(backup) {
  if (!backup || backup.schemaVersion !== 1 || !backup.data || typeof backup.data !== 'object') {
    throw new Error('Backup format योग्य नाही. विद्यमान डेटा बदललेला नाही.');
  }
  for (const store of STORES) {
    const records = backup.data[store];
    if (!Array.isArray(records) || records.some(item => !item || typeof item.id !== 'string')) {
      throw new Error(`Backup मधील ${store} डेटा वैध नाही.`);
    }
  }
  for (const store of STORES) {
    const db = await openDatabase();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(store, 'readwrite');
      const objectStore = tx.objectStore(store);
      objectStore.clear();
      backup.data[store].forEach(record => objectStore.put(record));
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
  }
}
