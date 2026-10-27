// Service Worker: يخلي التطبيق يشتغل من غير إنترنت
// غيّر رقم النسخة مع كل تحديث للملفات علشان الكاش يتجدد
const CACHE = "gym-app-v1";
const FILES = [
  "./",
  "index.html",
  "css/style.css",
  "js/data.js",
  "js/app.js",
  "manifest.json",
  "icons/apple-touch-icon.png",
  "icons/icon-192.png",
  "icons/icon-512.png"
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)));
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
  );
  self.clients.claim();
});

// الشبكة الأول (علشان التحديثات توصل)، ولو مفيش نت نرجع للكاش
self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy));
        return res;
      })
      .catch(() => caches.match(e.request, { ignoreSearch: true }))
  );
});
