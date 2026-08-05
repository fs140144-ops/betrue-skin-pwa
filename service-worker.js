/**
 * オフライン動作のためのService Worker。
 * 初回アクセス時に全アセット（HTML/JS/WASM/モデル/アイコン）をキャッシュし、
 * 以降はネットワークなしで（Wi-Fi不要・Macとの接続不要で）完全に端末内動作する。
 */
const CACHE_VERSION = "betrue-skin-pwa-v4";

const ASSETS = [
  "./",
  "./index.html",
  "./manifest.json",
  "./js/app.js",
  "./js/regions.js",
  "./js/metrics.js",
  "./js/scoring.js",
  "./js/history.js",
  "./js/report.js",
  "./vendor/opencv.js",
  "./vendor/mediapipe/vision_bundle.mjs",
  "./vendor/mediapipe/wasm/vision_wasm_internal.js",
  "./vendor/mediapipe/wasm/vision_wasm_internal.wasm",
  "./vendor/mediapipe/wasm/vision_wasm_nosimd_internal.js",
  "./vendor/mediapipe/wasm/vision_wasm_nosimd_internal.wasm",
  "./models/face_landmarker.task",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => cache.addAll(ASSETS)).then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k))),
    ).then(() => self.clients.claim()),
  );
});

// Cache-first: 一度キャッシュされたアセットはネットワークなしで即座に返す。
// キャッシュに無いものだけネットワーク取得を試み、取れればキャッシュに追加する。
self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request)
        .then((response) => {
          if (response && response.ok) {
            const clone = response.clone();
            caches.open(CACHE_VERSION).then((cache) => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(() => cached);
    }),
  );
});
