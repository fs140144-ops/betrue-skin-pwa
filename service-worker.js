/**
 * オフライン動作のためのService Worker。
 * 初回アクセス時に全アセット（HTML/JS/WASM/モデル/アイコン）をキャッシュし、
 * 以降はネットワークなしで（Wi-Fi不要・Macとの接続不要で）完全に端末内動作する。
 */
const CACHE_VERSION = "betrue-skin-pwa-v8";

// 修正が入り得る「アプリ本体」ファイル。サイズが小さいため、
// 通信があれば常に最新を優先し、オフライン時のみキャッシュへフォールバックする
// （network-first）。これまではここもcache-first（＝一度キャッシュされたら
// ネットワークに新しい版があっても古いままそれを使い続ける）だったため、
// アプリ側のバグを直してデプロイしても、端末側でキャッシュが更新されるまで
// 修正が反映されない、という問題が起きていた。
const SHELL_ASSETS = [
  "./",
  "./index.html",
  "./manifest.json",
  "./js/app.js",
  "./js/regions.js",
  "./js/metrics.js",
  "./js/scoring.js",
  "./js/history.js",
  "./js/report.js",
  "./js/landmarker-worker.js",
  "./js/landmarker-client.js",
];

// サイズが大きく（数MB〜10MB超）、めったに変わらない静的アセット。
// 一度取得できればキャッシュを優先し、通信量・待ち時間を減らす（cache-first）。
const STATIC_ASSETS = [
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

const ASSETS = [...SHELL_ASSETS, ...STATIC_ASSETS];

// cache.addAll()は「1つでも取得に失敗したら全滅」という全か無かの挙動のため、
// モバイル回線で大きなWASM/モデルファイル(数MB〜10MB超)を含む多数のアセットを
// 一括取得しようとすると、途中で1つでもタイムアウト・失敗した場合に
// Service Worker全体のインストールが失敗し、skipWaiting()も呼ばれず、
// 古い（バグ入りの）Service Workerがいつまでも有効なままになってしまう。
// これを避けるため、各アセットは個別にfetch→cache.putし、失敗しても
// 他のアセットの取得とインストール自体はブロックしないようにする
// （取得できなかったアセットはfetchハンドラ側で初回アクセス時に再取得を試みる）。
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) =>
      Promise.allSettled(
        ASSETS.map((url) =>
          fetch(url, { cache: "no-store" })
            .then((response) => {
              if (response && response.ok) return cache.put(url, response);
              return null;
            })
            .catch(() => null),
        ),
      )
    ).then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k))),
    ).then(() => self.clients.claim()),
  );
});

function isShellRequest(request, url) {
  if (request.mode === "navigate") return true; // index.html本体
  if (url.pathname.endsWith("/manifest.json")) return true;
  if (url.pathname.includes("/js/")) return true;
  return false;
}

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);

  if (isShellRequest(event.request, url)) {
    // network-first: 常に最新のアプリ本体を優先して取得する。
    // HTTPキャッシュも経由しないよう cache: "no-store" を指定し、
    // オフライン等でネットワーク取得に失敗した場合のみキャッシュへ逃がす。
    event.respondWith(
      fetch(event.request, { cache: "no-store" })
        .then((response) => {
          if (response && response.ok) {
            const clone = response.clone();
            caches.open(CACHE_VERSION).then((cache) => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(() => caches.match(event.request)),
    );
    return;
  }

  // cache-first: 大きな静的アセット（WASM/モデル/opencv等）は一度取得すれば使い回す。
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
