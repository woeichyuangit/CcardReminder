const CACHE = 'cardremind-v3';
const BASE = '/CcardReminder';
const ASSETS = [
  BASE + '/',
  BASE + '/index.html',
  BASE + '/manifest.json',
  BASE + '/icon-192.png',
  BASE + '/icon-512.png',
];
 
// ── Install & cache ──────────────────────────────────────────────────────────
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => c.addAll(ASSETS))
      .then(() => self.skipWaiting())
  );
});
 
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});
 
// ── Fetch (offline support) ──────────────────────────────────────────────────
self.addEventListener('fetch', e => {
  e.respondWith(
    caches.match(e.request)
      .then(cached => cached || fetch(e.request)
        .catch(() => caches.match(BASE + '/index.html'))
      )
  );
});
 
// ── Notification click → open app ───────────────────────────────────────────
self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      for (const client of list) {
        if ('focus' in client) return client.focus();
      }
      return clients.openWindow(BASE + '/');
    })
  );
});
 
// ── Periodic background sync ─────────────────────────────────────────────────
self.addEventListener('periodicsync', e => {
  if (e.tag === 'daily-reminder') {
    e.waitUntil(sendDailyReminders());
  }
});
 
// ── Message from page ────────────────────────────────────────────────────────
self.addEventListener('message', e => {
  if (e.data?.type === 'CHECK_REMINDERS') sendDailyReminders();
});
 
// ── Core reminder logic ──────────────────────────────────────────────────────
async function sendDailyReminders() {
  let cards = [];
  try { cards = await getCards(); } catch { return; }
  if (!cards.length) return;
 
  const today = new Date();
 
  function getCurrentCycleKey(dayOfMonth) {
    const d = today.getDate(), m = today.getMonth(), y = today.getFullYear();
    if (d >= dayOfMonth) return `${y}-${String(m + 1).padStart(2, '0')}`;
    const pm = m === 0 ? 11 : m - 1;
    const py = m === 0 ? y - 1 : y;
    return `${py}-${String(pm + 1).padStart(2, '0')}`;
  }
 
  function isPaid(card) {
    return card.paidCycle && card.paidCycle === getCurrentCycleKey(card.day);
  }
 
  function daysUntil(dayOfMonth) {
    const thisMonth = new Date(today.getFullYear(), today.getMonth(), dayOfMonth);
    const nextMonth = new Date(today.getFullYear(), today.getMonth() + 1, dayOfMonth);
    const target = thisMonth >= today ? thisMonth : nextMonth;
    return Math.ceil((target - today) / 86400000);
  }
 
  function dueDate(dayOfMonth) {
    const thisMonth = new Date(today.getFullYear(), today.getMonth(), dayOfMonth);
    const nextMonth = new Date(today.getFullYear(), today.getMonth() + 1, dayOfMonth);
    const t = thisMonth >= today ? thisMonth : nextMonth;
    return t.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }
 
  const unpaid = cards.filter(c => !isPaid(c));
  if (!unpaid.length) return;
 
  const urgent = unpaid.filter(c => daysUntil(c.day) <= 3);
  const soon   = unpaid.filter(c => daysUntil(c.day) > 3 && daysUntil(c.day) <= 7);
 
  if (urgent.length > 1) {
    const names = urgent.map(c => c.name).join(', ');
    const total = urgent.reduce((s, c) => s + (Number(c.amount) || 0), 0);
    await self.registration.showNotification('💳 Payments Due Very Soon!', {
      body: `${names}\nTotal: ${urgent[0].currency} ${total.toLocaleString()}`,
      icon: BASE + '/icon-192.png',
      tag: 'urgent-group',
      requireInteraction: true,
    });
  } else if (urgent.length === 1) {
    const c = urgent[0];
    const days = daysUntil(c.day);
    await self.registration.showNotification(
      days === 0 ? `🚨 ${c.name} is due TODAY!` : `⚠️ ${c.name} due in ${days} day${days > 1 ? 's' : ''}`,
      {
        body: `Minimum: ${c.currency} ${Number(c.amount).toLocaleString()} — due ${dueDate(c.day)}`,
        icon: BASE + '/icon-192.png',
        tag: `urgent-${c.id}`,
        requireInteraction: true,
      }
    );
  }
 
  if (soon.length) {
    const names = soon.map(c => `${c.name} (${daysUntil(c.day)}d)`).join(', ');
    await self.registration.showNotification('📅 Upcoming Payments This Week', {
      body: names,
      icon: BASE + '/icon-192.png',
      tag: 'soon-group'
    });
  }
}
 
// ── Read cards from IndexedDB ─────────────────────────────────────────────────
function getCards() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('cardremind-db', 1);
    req.onupgradeneeded = e => e.target.result.createObjectStore('kv');
    req.onsuccess = e => {
      const db = e.target.result;
      const tx = db.transaction('kv', 'readonly');
      const get = tx.objectStore('kv').get('cards');
      get.onsuccess = () => resolve(get.result || []);
      get.onerror = () => reject();
    };
    req.onerror = () => reject();
  });
}
