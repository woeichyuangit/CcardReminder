const CACHE = 'cardremind-v2';
const ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  'https://fonts.googleapis.com/css2?family=DM+Serif+Display:ital@0;1&family=DM+Mono:wght@300;400;500&display=swap'
];

// ── Install & cache ──────────────────────────────────────────────────────────
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting())
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
      .then(cached => cached || fetch(e.request).catch(() => caches.match('/index.html')))
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
      return clients.openWindow('/');
    })
  );
});

// ── Periodic background sync (fires ~daily when supported) ──────────────────
self.addEventListener('periodicsync', e => {
  if (e.tag === 'daily-reminder') {
    e.waitUntil(sendDailyReminders());
  }
});

// ── Message from page: schedule or fire reminders now ───────────────────────
self.addEventListener('message', e => {
  if (e.data?.type === 'CHECK_REMINDERS') {
    sendDailyReminders();
  }
  if (e.data?.type === 'SCHEDULE_ALARM') {
    // Store next alarm time in SW scope
    self.__nextAlarm = e.data.time;
  }
});

// ── Core reminder logic ──────────────────────────────────────────────────────
async function sendDailyReminders() {
  // Read cards from IndexedDB (shared with main page via idb-keyval pattern)
  let cards = [];
  try {
    cards = await getCards();
  } catch { return; }

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

  // Group notifications: urgent (≤3 days), soon (≤7 days), others
  const urgent = unpaid.filter(c => daysUntil(c.day) <= 3);
  const soon   = unpaid.filter(c => daysUntil(c.day) > 3 && daysUntil(c.day) <= 7);

  // Fire one grouped notification if multiple urgent
  if (urgent.length > 1) {
    const names = urgent.map(c => c.name).join(', ');
    const total = urgent.reduce((s, c) => s + (Number(c.amount) || 0), 0);
    const currency = urgent[0].currency;
    await self.registration.showNotification('💳 Payments Due Very Soon!', {
      body: `${names}\nTotal: ${currency} ${total.toLocaleString()} — pay now to avoid late fees`,
      icon: 'icons/icon-192.png',
      badge: 'icons/icon-192.png',
      tag: 'urgent-group',
      requireInteraction: true,
      actions: [{ action: 'open', title: 'View Cards' }]
    });
  } else if (urgent.length === 1) {
    const c = urgent[0];
    const days = daysUntil(c.day);
    await self.registration.showNotification(
      days === 0 ? `🚨 ${c.name} is due TODAY!` : `⚠️ ${c.name} due in ${days} day${days > 1 ? 's' : ''}`,
      {
        body: `Minimum payment: ${c.currency} ${Number(c.amount).toLocaleString()} — due ${dueDate(c.day)}`,
        icon: 'icons/icon-192.png',
        badge: 'icons/icon-192.png',
        tag: `urgent-${c.id}`,
        requireInteraction: true,
        actions: [{ action: 'open', title: 'Mark as Paid' }]
      }
    );
  }

  // One summary for "soon" cards
  if (soon.length) {
    const names = soon.map(c => `${c.name} (${daysUntil(c.day)}d)`).join(', ');
    await self.registration.showNotification('📅 Upcoming Payments This Week', {
      body: names,
      icon: 'icons/icon-192.png',
      tag: 'soon-group'
    });
  }
}

// ── Read cards from localStorage via client message ──────────────────────────
// Since SW can't access localStorage directly, we use a simple IDB store
function getCards() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('cardremind-db', 1);
    req.onupgradeneeded = e => {
      e.target.result.createObjectStore('kv');
    };
    req.onsuccess = e => {
      const db = e.target.result;
      const tx = db.transaction('kv', 'readonly');
      const store = tx.objectStore('kv');
      const get = store.get('cards');
      get.onsuccess = () => resolve(get.result || []);
      get.onerror = () => reject();
    };
    req.onerror = () => reject();
  });
}
