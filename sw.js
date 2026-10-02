// ── CardRemind service worker ─────────────────────────────────────────────
// Caches the app shell for offline use and shows local repayment reminders.
// The page mirrors the signed-in user's cards and reminder settings into
// IndexedDB (cardremind-db / kv) so reminders can be computed here.

const CACHE = 'cardremind-v6';
const BASE = new URL(self.registration.scope).pathname; // e.g. /CcardReminder/
const ICON = BASE + 'icon-192.png';
const ASSETS = [BASE, BASE + 'index.html', BASE + 'manifest.json', ICON, BASE + 'icon-512.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys =>
    Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
  ));
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  // Only handle our own files; card data (Supabase) and CDNs go straight to the network
  if (url.origin !== location.origin) return;
  // Network first so updates show up, cache as the offline fallback
  e.respondWith(
    fetch(req).then(res => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
      return res;
    }).catch(() => caches.match(req).then(hit => hit || caches.match(BASE + 'index.html')))
  );
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
    for (const c of list) if ('focus' in c) return c.focus();
    return clients.openWindow(BASE);
  }));
});

// Android (installed Chrome) can wake us roughly daily; iOS has no equivalent
self.addEventListener('periodicsync', e => {
  if (e.tag === 'daily-reminder') e.waitUntil(sendReminders());
});

self.addEventListener('message', e => {
  if (e.data?.type === 'CHECK_REMINDERS') e.waitUntil(sendReminders());
  if (e.data?.type === 'TEST_NOTIFICATION') e.waitUntil(self.registration.showNotification('💳 CardRemind', {
    body: 'Notifications are working. You will be reminded before each due date.',
    icon: ICON, badge: ICON, tag: 'test',
  }));
});

// ── IndexedDB helpers ─────────────────────────────────────────────────────
function openDb() {
  return new Promise((res, rej) => {
    const r = indexedDB.open('cardremind-db', 1);
    r.onupgradeneeded = e => e.target.result.createObjectStore('kv');
    r.onsuccess = e => res(e.target.result);
    r.onerror = () => rej(r.error);
  });
}
async function kvGet(key) {
  const db = await openDb();
  return new Promise(res => {
    const r = db.transaction('kv', 'readonly').objectStore('kv').get(key);
    r.onsuccess = () => res(r.result);
    r.onerror = () => res(undefined);
  });
}
async function kvSet(key, value) {
  const db = await openDb();
  return new Promise(res => {
    const tx = db.transaction('kv', 'readwrite');
    tx.objectStore('kv').put(value, key);
    tx.oncomplete = tx.onerror = () => res();
  });
}

// ── Date helpers (same rules as index.html) ───────────────────────────────
function dueDateIn(day, y, m) {
  const last = new Date(y, m + 1, 0).getDate();
  return new Date(y, m, Math.min(day, last));
}
function daysUntilDue(day) {
  const n = new Date();
  const today = new Date(n.getFullYear(), n.getMonth(), n.getDate());
  let due = dueDateIn(day, today.getFullYear(), today.getMonth());
  if (due < today) due = dueDateIn(day, today.getFullYear(), today.getMonth() + 1);
  return Math.round((due - today) / 86400000);
}
const monthKey = () => `${new Date().getFullYear()}-${new Date().getMonth()}`;
const money = v => `$${(parseFloat(v) || 0).toFixed(2)}`;

// ── Reminders: at most once per day ───────────────────────────────────────
async function sendReminders() {
  let cards, settings;
  try {
    cards = (await kvGet('cards')) || [];
    settings = (await kvGet('settings')) || {};
  } catch { return; }
  if (!settings.enabled || !cards.length) return;

  const todayStr = new Date().toDateString();
  if ((await kvGet('lastRun')) === todayStr) return;

  const before = Number(settings.daysBefore) || 3;
  const key = monthKey();
  const due = cards
    .filter(c => !(c.paidMonths || []).includes(key))
    .map(c => ({ ...c, days: daysUntilDue(c.dueDay) }))
    .filter(c => c.days <= before)
    .sort((a, b) => a.days - b.days);

  await kvSet('lastRun', todayStr);
  if (!due.length) return;

  const when = d => d === 0 ? 'today' : d === 1 ? 'tomorrow' : `in ${d} days`;
  if (due.length === 1) {
    const c = due[0];
    await self.registration.showNotification(
      c.days === 0 ? `🚨 ${c.name} payment due today` : `💳 ${c.name} due ${when(c.days)}`,
      { body: c.minPayment ? `Minimum payment ${money(c.minPayment)}` : 'Tap to open CardRemind',
        icon: ICON, badge: ICON, tag: `due-${c.id}`, requireInteraction: c.days === 0 });
  } else {
    const total = due.reduce((s, c) => s + (parseFloat(c.minPayment) || 0), 0);
    await self.registration.showNotification(`💳 ${due.length} card payments due soon`, {
      body: due.map(c => `${c.name} ${when(c.days)}`).join(', ') + (total ? ` · min ${money(total)}` : ''),
      icon: ICON, badge: ICON, tag: 'due-group', requireInteraction: due[0].days === 0,
    });
  }
}
