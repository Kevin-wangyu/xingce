const CACHE = 'paddleocr-cache-v1';
const CACHE_VERSION_KEY = 'sw_build_v';   // 用来标记是否需要刷新页面
const PATTERNS = [
  'cdn.jsdelivr.net/npm/@paddleocr',
  'cdn.jsdelivr.net/npm/onnxruntime',
  'cdn.jsdelivr.net/npm/tesseract'
];
// 每次启动都强制检查更新
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => {
  e.waitUntil(
    Promise.all([
      self.clients.claim(),
      // 清除所有旧版本的 cache
      caches.keys().then(names => Promise.all(
        names.filter(n => n !== CACHE).map(n => caches.delete(n))
      ))
    ])
  );
});

// 主线程发消息时，让 SW 立即更新
self.addEventListener('message', e => {
  if (e.data === 'SKIP_WAITING') self.skipWaiting();
});
self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', e => {
  e.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', e => {
  const url = e.request.url;
  const req = e.request;

  // HTML 和同源 JS 文件：始终走网络（不缓存，保证拿到最新版本）
  if (req.mode === 'navigate' ||
      (req.method === 'GET' && req.destination === 'document') ||
      (req.method === 'GET' && /\.(?:js|css|html)$/i.test(new URL(url).pathname))) {
    // 同源 → network first
    const isSameOrigin = url.startsWith(self.location.origin);
    if (isSameOrigin) {
      e.respondWith(
        fetch(req).catch(() => caches.match(req))
      );
      return;
    }
  }

  // CDN 资源：cache first
  if (!PATTERNS.some(p => url.includes(p))) return;
  e.respondWith(
    caches.match(req).then(hit => {
      if (hit) return hit;
      return fetch(req).then(res => {
        if (res.ok) {
          const clone = res.clone();
          caches.open(CACHE).then(c => c.put(req, clone));
        }
        return res;
      });
    })
  );
});