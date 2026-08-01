const CACHE = "bali-phrases-v20";
const ASSETS = [
  "./",
  "./index.html",
  "./style.css",
  "./app.js",
  "./manifest.json",
  "./icon.svg",
  "./data/scenes.json",
  "./data/cards.json",
  "./data/patterns.json",
  "./data/dialogs.json",
  "./data/episodes.json",
  "./audio/ep01-flight-meal.mp3",
  "./audio/ep02-announcements.mp3",
  "./audio/ep03-immigration.mp3",
  "./audio/ep04-pickup.mp3",
  "./audio/ep05-checkin.mp3",
  "./audio/ep06-pool.mp3",
  "./audio/ep07-restaurant.mp3",
  "./audio/ep08-spa.mp3",
  "./audio/ep09-tour.mp3",
  "./audio/ep10-checkout.mp3",
];

self.addEventListener("install", e => {
  // no-cache: HTTPキャッシュを飛ばして必ずサーバの最新を取る
  e.waitUntil(
    caches.open(CACHE)
      .then(c => c.addAll(ASSETS.map(u => new Request(u, { cache: "no-cache" }))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// stale-while-revalidate: 即キャッシュ応答＋裏で更新（次回反映）
self.addEventListener("fetch", e => {
  if (e.request.method !== "GET") return;
  e.respondWith(
    caches.open(CACHE).then(async cache => {
      const cached = await cache.match(e.request, { ignoreSearch: true });
      const network = fetch(new Request(e.request, { cache: "no-cache" }))
        .then(res => {
          if (res.ok && new URL(e.request.url).origin === location.origin) {
            cache.put(e.request, res.clone());
          }
          return res;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});
