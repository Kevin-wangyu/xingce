const CACHE = 'paddleocr-cache-v1';
const PATTERNS = [
  'cdn.jsdelivr.net/npm/@paddleocr',
  'cdn.jsdelivr.net/npm/onnxruntime',
  'cdn.jsdelivr.net/npm/tesseract'
];

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', e => {
  e.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', e => {
  const url = e.request.url;
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