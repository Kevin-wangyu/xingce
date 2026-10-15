const CACHE = 'paddleocr-cache-v2';
const PATTERNS = [
  'cdn.jsdelivr.net/npm/@paddleocr',
  'cdn.jsdelivr.net/npm/onnxruntime',
  'cdn.jsdelivr.net/npm/tesseract'
];

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', e => {
  e.waitUntil(
    Promise.all([
      self.clients.claim(),
      // 清掉旧版本缓存（旧版缓存 HTML，会干扰）
      caches.keys().then(names =>
        Promise.all(names.filter(n => n !== CACHE).map(n => caches.delete(n)))
      )
    ])
  );
});

self.addEventListener('fetch', e => {
  const url = e.request.url;

  // 只处理 CDN 模型资源；HTML/JS/CSS 一律不拦截，走浏览器默认策略
  if (!PATTERNS.some(p => url.includes(p))) return;

  e.respondWith(
    caches.match(e.request).then(hit => {
      if (hit) return hit;
      return fetch(e.request).then(res => {
        if (res.ok) {
          const clone = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, clone));
        }
        return res;
      });
    })
  );
});