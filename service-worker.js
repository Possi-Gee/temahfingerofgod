// TEM Invoice Manager - Robust Offline Service Worker v6
const CACHE_NAME = "tem-invoice-v6";

const CORE_ASSETS = [
  "./",
  "./index.html",
  "./styles.css",
  "./script.js",
  "./jsQR.js",
  "./html2canvas.min.js",
  "./manifest.json",
  "./icon-192.png",
  "./icon-512.png"
];

// Install: Cache all core files safely
self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      console.log("[SW] Caching app files for offline use...");
      for (const asset of CORE_ASSETS) {
        try {
          await cache.add(asset);
          console.log("[SW] Cached:", asset);
        } catch (err) {
          console.warn("[SW] Non-critical cache skip for:", asset, err);
        }
      }
    })
  );
});

// Activate: Take control of open tabs and delete old cache versions
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => {
            console.log("[SW] Removing old cache:", key);
            return caches.delete(key);
          })
      )
    ).then(() => self.clients.claim())
  );
});

// Fetch: Serve from cache immediately when offline
self.addEventListener("fetch", (event) => {
  // Only handle GET requests
  if (event.request.method !== "GET") return;

  event.respondWith(
    caches.match(event.request, { ignoreSearch: true }).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }

      return fetch(event.request)
        .then((networkResponse) => {
          // Cache successful GET responses
          if (networkResponse && networkResponse.status === 200) {
            const responseClone = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, responseClone);
            });
          }
          return networkResponse;
        })
        .catch(() => {
          // Offline fallback for navigation
          if (event.request.mode === "navigate") {
            return caches.match("./index.html") || caches.match("./");
          }
        });
    })
  );
});
