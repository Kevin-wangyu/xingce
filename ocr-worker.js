/* ============ PaddleOCR Web Worker ============
   在独立线程运行 PaddleOCR，避免阻塞主线程 UI
   主线程通过 postMessage 发送图片，等待识别结果
   ============================================ */

let ocr = null;
let initPromise = null;

async function initOcr() {
  if (ocr) return ocr;
  if (initPromise) return initPromise;
  initPromise = (async () => {
    const mod = await import('https://cdn.jsdelivr.net/npm/@paddleocr/paddleocr-js@0.4.2/+esm');
    ocr = await mod.PaddleOCR.create({
      lang: 'ch',
      ocrVersion: 'PP-OCRv5',
      ortOptions: { backend: 'wasm' }
    });
    return ocr;
  })();
  try {
    return await initPromise;
  } catch (e) {
    initPromise = null;
    throw e;
  }
}

self.onmessage = async (e) => {
  const { id, buffer, mime, type } = e.data;

  /* 预热消息：只触发模型加载，不识别 */
  if (type === 'warmup') {
    try {
      await initOcr();
      self.postMessage({ id, ok: true, warmup: true });
    } catch (err) {
      self.postMessage({ id, ok: false, error: err.message || String(err) });
    }
    return;
  }

  /* 识别消息 */
  try {
    const engine = await initOcr();
    const blob = new Blob([buffer], { type: mime || 'image/png' });
    const [result] = await engine.predict(blob);
    const text = (result?.items || []).map(it => it.text).join('\n');
    self.postMessage({ id, ok: true, text });
  } catch (err) {
    self.postMessage({ id, ok: false, error: err.message || String(err) });
  }
};

