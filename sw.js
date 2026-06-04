// ── Firebase Messaging (background push) ─────────────────────────────────
importScripts('https://www.gstatic.com/firebasejs/10.14.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.14.1/firebase-messaging-compat.js');
firebase.initializeApp({
  apiKey:'AIzaSyAryr-3RdZxNEA2dorchvuoCdonemAkZr4',
  authDomain:'cardremind-358c5.firebaseapp.com',
  projectId:'cardremind-358c5',
  messagingSenderId:'1001565844177',
  appId:'1:1001565844177:web:f6d58d8c62611a8e024bf0'
});
const messaging = firebase.messaging();
messaging.onBackgroundMessage(payload => {
  const {title='CardRemind', body=''} = payload.notification || {};
  return self.registration.showNotification(title, {
    body, icon:'/CcardReminder/icon-192.png', badge:'/CcardReminder/icon-192.png',
    tag: payload.data?.tag || 'cardremind',
    requireInteraction: payload.data?.requireInteraction === 'true'
  });
});

// ── Cache ────────────────────────────────────────────────────────────────
const CACHE = 'cardremind-v5';
const BASE  = '/CcardReminder';
const ASSETS = [BASE+'/', BASE+'/index.html', BASE+'/manifest.json'];

self.addEventListener('install', e => {
  // No skipWaiting — prevents disrupting active auth sessions on mobile
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)));
});

self.addEventListener('activate', e => {
  // No clients.claim() — avoids reloading page mid sign-in on Android
  e.waitUntil(caches.keys().then(keys =>
    Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
  ));
});

self.addEventListener('fetch', e => {
  const url = e.request.url;
  // Never intercept Firebase, Google auth, or API calls
  if (url.includes('googleapis.com') || url.includes('firebaseapp.com') ||
      url.includes('gstatic.com') || url.includes('google.com')) return;
  e.respondWith(
    caches.match(e.request).then(cached => cached || fetch(e.request)
      .catch(() => caches.match(BASE + '/index.html'))
    )
  );
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(clients.matchAll({type:'window',includeUncontrolled:true}).then(list => {
    for (const c of list) if ('focus' in c) return c.focus();
    return clients.openWindow(BASE + '/');
  }));
});

self.addEventListener('periodicsync', e => {
  if (e.tag === 'daily-reminder') e.waitUntil(sendLocalReminders());
});

self.addEventListener('message', e => {
  if (e.data?.type === 'CHECK_REMINDERS') sendLocalReminders();
});

async function sendLocalReminders() {
  let cards = [];
  try {
    const idb = await new Promise((res, rej) => {
      const r = indexedDB.open('cardremind-db', 1);
      r.onupgradeneeded = e => e.target.result.createObjectStore('kv');
      r.onsuccess = e => res(e.target.result);
      r.onerror = () => rej();
    });
    cards = await new Promise((res, rej) => {
      const tx = idb.transaction('kv','readonly');
      const r = tx.objectStore('kv').get('cards');
      r.onsuccess = () => res(r.result || []);
      r.onerror = rej;
    });
  } catch { return; }
  if (!cards.length) return;

  // Cooldown: once per day
  let lastRun = null;
  try {
    const idb2 = await new Promise((res,rej)=>{const r=indexedDB.open('cardremind-db',1);r.onsuccess=e=>res(e.target.result);r.onerror=()=>rej();});
    lastRun = await new Promise(res=>{const tx=idb2.transaction('kv','readonly');const r=tx.objectStore('kv').get('lastRun');r.onsuccess=()=>res(r.result||null);r.onerror=()=>res(null);});
  } catch {}
  const todayStr = new Date().toDateString();
  if (lastRun === todayStr) return;
  try {
    const idb3 = await new Promise((res,rej)=>{const r=indexedDB.open('cardremind-db',1);r.onsuccess=e=>res(e.target.result);r.onerror=()=>rej();});
    const tx = idb3.transaction('kv','readwrite'); tx.objectStore('kv').put(todayStr,'lastRun');
  } catch {}

  const today = new Date();
  function daysUntil(day) {
    const a=new Date(today.getFullYear(),today.getMonth(),day);
    const b=new Date(today.getFullYear(),today.getMonth()+1,day);
    return Math.ceil(((a>=today?a:b)-today)/86400000);
  }
  function cycleKey(day) {
    const d=today.getDate(),m=today.getMonth(),y=today.getFullYear();
    if(d>=day)return`${y}-${String(m+1).padStart(2,'0')}`;
    const pm=m===0?11:m-1,py=m===0?y-1:y;
    return`${py}-${String(pm+1).padStart(2,'0')}`;
  }
  const unpaid = cards.filter(c => c.paidCycle !== cycleKey(c.day));
  const urgent = unpaid.filter(c => daysUntil(c.day) <= (c.remindDays||3));
  const soon   = unpaid.filter(c => { const d=daysUntil(c.day); return d>(c.remindDays||3)&&d<=7; });
  if (urgent.length > 1) {
    const total = urgent.reduce((s,c)=>s+(Number(c.amount)||0),0);
    await self.registration.showNotification('💳 Payments Due Very Soon!',{body:`${urgent.map(c=>c.name).join(', ')} — ${urgent[0]?.currency||''}${total.toLocaleString()}`,icon:BASE+'/icon-192.png',tag:'urgent-group',requireInteraction:true});
  } else if (urgent.length === 1) {
    const c=urgent[0],d=daysUntil(c.day);
    await self.registration.showNotification(d===0?`🚨 ${c.name} due TODAY!`:`⚠️ ${c.name} due in ${d} day${d>1?'s':''}`,{body:`Min: ${c.currency}${Number(c.amount).toLocaleString()}`,icon:BASE+'/icon-192.png',tag:`urgent-${c.id}`,requireInteraction:true});
  }
  if (soon.length) {
    await self.registration.showNotification('📅 Upcoming Payments',{body:soon.map(c=>`${c.name} (${daysUntil(c.day)}d)`).join(', '),icon:BASE+'/icon-192.png',tag:'soon-group'});
  }
}
