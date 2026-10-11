/* ============ IndexedDB ============ */
const DB_NAME = 'xingce_db';
const DB_VERSION = 2;
let db = null;
let useIDB = true;

function openDB() {
  return new Promise(resolve => {
    if (!('indexedDB' in window)) {
      useIDB = false;
      window._idbError = '浏览器不支持 IndexedDB';
      return resolve();
    }

    window._idbError = null;

    const tryOpen = (version, onFail) => {
      let req;
      try {
        req = version ? indexedDB.open(DB_NAME, version) : indexedDB.open(DB_NAME);
      } catch (e) {
        window._idbError = 'open 异常：' + e.message;
        if (onFail) onFail(); else { useIDB = false; resolve(); }
        return;
      }
      req.onupgradeneeded = e => {
        const d = e.target.result;
        if (!d.objectStoreNames.contains('questions')) d.createObjectStore('questions', { keyPath: 'id' });
        if (!d.objectStoreNames.contains('meta')) d.createObjectStore('meta', { keyPath: 'key' });
        if (!d.objectStoreNames.contains('images')) d.createObjectStore('images', { keyPath: 'id' });
      };
      req.onsuccess = e => {
        db = e.target.result;
        useIDB = true;
        window._idbError = null;
        console.log(`[IDB] 打开成功，版本 ${db.version}`);
        resolve();
      };
      req.onerror = e => {
        const err = e.target.error;
        const msg = err ? `${err.name}: ${err.message}` : '未知错误';
        console.warn('[IDB] 打开失败：', msg);
        window._idbError = msg;
        if (onFail) onFail(); else { useIDB = false; resolve(); }
      };
      req.onblocked = () => {
        window._idbError = 'IDB 被其他标签页占用';
      };
    };

    // 策略：先查询实际版本（Chromium），失败再用 DB_VERSION，再失败不带版本
    const fallback = () => tryOpen(DB_VERSION, () => tryOpen(null, null));

    if (indexedDB.databases) {
      indexedDB.databases().then(list => {
        const cur = list.find(d => d.name === DB_NAME);
        if (cur && cur.version) {
          const v = Math.max(cur.version, DB_VERSION);
          console.log(`[IDB] 实际版本 ${cur.version}，用 ${v} 打开`);
          tryOpen(v, fallback);
        } else {
          fallback();
        }
      }).catch(() => fallback());
    } else {
      // Safari/iPad Chrome 走这里
      fallback();
    }
  });
}

const idbGetAll = s => new Promise((res, rej) => { const r = db.transaction(s,'readonly').objectStore(s).getAll(); r.onsuccess=()=>res(r.result||[]); r.onerror=()=>rej(r.error); });
const idbGet = (s,k) => new Promise((res, rej) => { const r = db.transaction(s,'readonly').objectStore(s).get(k); r.onsuccess=()=>res(r.result); r.onerror=()=>rej(r.error); });
const idbPut = (s,v) => new Promise((res, rej) => { const r = db.transaction(s,'readwrite').objectStore(s).put(v); r.onsuccess=()=>res(); r.onerror=()=>rej(r.error); });
const idbBulkPut = (s,items) => new Promise((res, rej) => {
  if (!items.length) return res();
  const t = db.transaction(s,'readwrite'); const st = t.objectStore(s);
  items.forEach(it => st.put(it));
  t.oncomplete = () => res(); t.onerror = () => rej(t.error);
});
const idbDelete = (s,k) => new Promise((res, rej) => { const r = db.transaction(s,'readwrite').objectStore(s).delete(k); r.onsuccess=()=>res(); r.onerror=()=>rej(r.error); });
const idbClear = s => new Promise((res, rej) => { const r = db.transaction(s,'readwrite').objectStore(s).clear(); r.onsuccess=()=>res(); r.onerror=()=>rej(r.error); });
/* ============ 图片存储 ============ */
const _imageUrlCache = new Map();  // imageId → objectURL

/* ============ 内存 + 落盘调度 ============ */
let questions = [];
let settings = {};
let dirtyQ = new Set();
let flushTimer = null;
let deletedIds = [];
let lastSyncedAt = 0;
let pushTimer = null;
let syncing = false;
/* ============ 图片处理 ============ */
const THUMB_MAX_WIDTH = 640;
const THUMB_QUALITY = 0.9;

/* 生成缩略图（返回 Blob） */
async function generateThumbnail(file) {
  return new Promise((resolve) => {
    try {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          try {
            const ratio = img.width > THUMB_MAX_WIDTH ? THUMB_MAX_WIDTH / img.width : 1;
            const canvas = document.createElement('canvas');
            canvas.width = Math.max(1, Math.round(img.width * ratio));
            canvas.height = Math.max(1, Math.round(img.height * ratio));
            const ctx = canvas.getContext('2d');
            // 白底填充（防止透明 PNG 变黑）
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            canvas.toBlob((blob) => resolve(blob), 'image/jpeg', THUMB_QUALITY);
          } catch (err) {
            console.warn('[缩略图] canvas 失败：', err);
            resolve(null);
          }
        };
        img.onerror = () => resolve(null);
        img.src = e.target.result;
      };
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(file);
    } catch (e) {
      resolve(null);
    }
  });
}
/* ============ 为旧图批量生成缩略图 ============ */
async function generateMissingThumbnails(onProgress, force = false) {
  if (!useIDB) {
    return { total: 0, done: 0, failed: 0, skipped: 0 };
  }

  let allImages = [];
  try {
    allImages = await new Promise((resolve, reject) => {
      const r = db.transaction('images', 'readonly').objectStore('images').getAll();
      r.onsuccess = () => resolve(r.result || []);
      r.onerror = () => reject(r.error);
    });
  } catch (e) {
    throw new Error('读取图片失败：' + e.message);
  }

  // force 模式：所有有原图的记录都处理
  // 默认模式：只处理有原图但无缩略图的记录
  const needWork = force
    ? allImages.filter(rec => rec.blob)
    : allImages.filter(rec => rec.blob && !rec.thumbnail);

  const total = needWork.length;
  let done = 0, failed = 0, skipped = 0;

  if (onProgress) onProgress({ total, done, failed, skipped, phase: 'start' });

  for (let i = 0; i < needWork.length; i++) {
    const rec = needWork[i];
    try {
      const thumbBlob = await generateThumbnail(rec.blob);
      if (!thumbBlob) {
        failed++;
      } else {
        rec.thumbnail = thumbBlob;
        await new Promise((resolve, reject) => {
          const r = db.transaction('images', 'readwrite').objectStore('images').put(rec);
          r.onsuccess = () => resolve();
          r.onerror = () => reject(r.error);
        });
        done++;
      }
    } catch (e) {
      console.warn('[缩略图] 处理失败：', rec.id, e);
      failed++;
    }
    if (onProgress) onProgress({ total, done, failed, skipped, phase: 'progress', current: i + 1 });
    await new Promise(r => setTimeout(r, 0));
  }

  if (onProgress) onProgress({ total, done, failed, skipped, phase: 'done' });
  return { total, done, failed, skipped };
}
/* Blob → base64 dataURL */
function blobToDataURL(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

/* base64 dataURL → Blob */
function dataURLToBlob(dataURL) {
  const parts = String(dataURL || '').split(',');
  if (parts.length !== 2) return null;
  const m = parts[0].match(/:(.*?);/);
  const mime = m ? m[1] : 'image/jpeg';
  const bin = atob(parts[1]);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return new Blob([arr], { type: mime });
}
function idbPutImage(blob, thumbnailBlob) {
  return new Promise((resolve, reject) => {
    const id = 'img_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    const rec = { id, blob, createdAt: Date.now() };
    if (thumbnailBlob) rec.thumbnail = thumbnailBlob;
    const r = db.transaction('images', 'readwrite').objectStore('images').put(rec);
    r.onsuccess = () => resolve(id);
    r.onerror = () => reject(r.error);
  });
}

function idbGetImage(id) {
  return new Promise((resolve, reject) => {
    const r = db.transaction('images', 'readonly').objectStore('images').get(id);
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

function idbDeleteImage(id) {
  return new Promise((resolve, reject) => {
    const r = db.transaction('images', 'readwrite').objectStore('images').delete(id);
    r.onsuccess = () => resolve();
    r.onerror = () => reject(r.error);
  });
}

/* 异步加载图片 objectURL（带缓存） */
async function loadImageUrl(imageId) {
  if (!imageId) return null;
  if (_imageUrlCache.has(imageId)) return _imageUrlCache.get(imageId);
  try {
    const rec = await idbGetImage(imageId);
    if (!rec) return null;
    // 优先原图，没有则用缩略图
    const blob = rec.blob || rec.thumbnail;
    if (!blob) return null;
    const url = URL.createObjectURL(blob);
    _imageUrlCache.set(imageId, url);
    return url;
  } catch (e) {
    console.warn('[图片] 加载失败：', imageId, e);
    return null;
  }
}

/* 返回图片信息 + 是否缩略图 */
async function loadImageInfo(imageId) {
  if (!imageId) return null;
  try {
    const rec = await idbGetImage(imageId);
    if (!rec) return null;
    if (rec.blob) {
      // 原图优先
      if (_imageUrlCache.has(imageId)) return { url: _imageUrlCache.get(imageId), isThumb: false };
      const url = URL.createObjectURL(rec.blob);
      _imageUrlCache.set(imageId, url);
      return { url, isThumb: false };
    }
    if (rec.thumbnail) {
      const key = imageId + '_thumb';
      if (_imageUrlCache.has(key)) return { url: _imageUrlCache.get(key), isThumb: true };
      const url = URL.createObjectURL(rec.thumbnail);
      _imageUrlCache.set(key, url);
      return { url, isThumb: true };
    }
    return null;
  } catch (e) {
    return null;
  }
}

/* 检查图片是否被其他题目引用 */
function isImageReferenced(imageId, excludeQid) {
  return questions.some(q => q.id !== excludeQid && (q.imageIds || []).includes(imageId));
}

/* 尝试删除图片（无引用时才真删） */
async function tryDeleteImage(imageId, excludeQid) {
  if (isImageReferenced(imageId, excludeQid)) return;
  try {
    await idbDeleteImage(imageId);
    if (_imageUrlCache.has(imageId)) {
      URL.revokeObjectURL(_imageUrlCache.get(imageId));
      _imageUrlCache.delete(imageId);
    }
  } catch (e) { console.warn(e); }
}

function scheduleFlush() {
  if (flushTimer) return;
  flushTimer = setTimeout(async () => {
    flushTimer = null;
    if (!useIDB) return;
    try {
      const toSave = questions.filter(q => dirtyQ.has(q.id));
      if (toSave.length) await idbBulkPut('questions', toSave);
      dirtyQ.clear();
    } catch (e) { console.warn('IDB 写入失败：', e); }
  }, 300);
}
function saveQuestion(q) {
  q.updatedAt = Date.now();
  const idx = questions.findIndex(x => x.id === q.id);
  if (idx >= 0) questions[idx] = q; else questions.push(q);
  dirtyQ.add(q.id);
  scheduleFlush();
  schedulePush();
  invalidateStorageCache();
}
async function deleteQuestion(id) {
  const q = questions.find(x => x.id === id);
  questions = questions.filter(q => q.id !== id);
  if (!deletedIds.includes(id)) {
    deletedIds.push(id);
    await setMeta('deletedIds', deletedIds);
  }
  if (useIDB) { try { await idbDelete('questions', id); } catch (e) { console.warn(e); } }
  // 清理图片
  if (q && (q.imageIds || []).length) {
    for (const imgId of q.imageIds) {
      if (!isImageReferenced(imgId, null)) {
        try { await tryDeleteImage(imgId, null); } catch (e) {}
      }
    }
  }
  schedulePush();
  invalidateStorageCache();
}
async function getMeta(key) { if (!useIDB) return null; try { const r = await idbGet('meta', key); return r ? r.value : null; } catch { return null; } }
async function setMeta(key, value) { if (!useIDB) return; try { await idbPut('meta', { key, value }); } catch (e) { console.warn(e); } }
async function clearAllStores() {
  if (useIDB) { await idbClear('questions'); await idbClear('meta'); }
  questions = []; settings = {}; dirtyQ.clear();
  localStorage.removeItem('xc_browse_state');
}