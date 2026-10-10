/* ============ IndexedDB ============ */
const DB_NAME = 'xingce_db';
const DB_VERSION = 2;
let db = null;
let useIDB = true;

function openDB() {
  return new Promise(resolve => {
    if (!('indexedDB' in window)) { useIDB = false; return resolve(); }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = e => {
      const d = e.target.result;
      if (!d.objectStoreNames.contains('questions')) d.createObjectStore('questions', { keyPath: 'id' });
      if (!d.objectStoreNames.contains('meta')) d.createObjectStore('meta', { keyPath: 'key' });
      if (!d.objectStoreNames.contains('images')) d.createObjectStore('images', { keyPath: 'id' });
    };
    req.onsuccess = e => { db = e.target.result; resolve(); };
    req.onerror = () => { useIDB = false; resolve(); };
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

function idbPutImage(blob) {
  return new Promise((resolve, reject) => {
    const id = 'img_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    const r = db.transaction('images', 'readwrite').objectStore('images').put({ id, blob, createdAt: Date.now() });
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
    if (!rec || !rec.blob) return null;
    const url = URL.createObjectURL(rec.blob);
    _imageUrlCache.set(imageId, url);
    return url;
  } catch (e) {
    console.warn('[图片] 加载失败：', imageId, e);
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