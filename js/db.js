/* ============ IndexedDB ============ */
const DB_NAME = 'xingce_db';
const DB_VERSION = 4;
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
        if (!d.objectStoreNames.contains('words')) d.createObjectStore('words', { keyPath: 'id' });
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
let words = [];
let settings = {};
let dirtyQ = new Set();
let dirtyW = new Set();
let flushTimer = null;
let deletedIds = [];
let lastSyncedAt = 0;
let pushTimer = null;
let syncing = false;

function idbPutImage(blob) {
  return new Promise((resolve, reject) => {
    const id = 'img_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    const rec = { id, blob, createdAt: Date.now() };
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
  const info = await loadImageInfo(imageId);
  return info ? info.url : null;
}

/* 返回图片信息 */
async function loadImageInfo(imageId) {
  if (!imageId) return null;
  try {
    const rec = await idbGetImage(imageId);
    if (rec && rec.blob) {
      if (_imageUrlCache.has(imageId)) return { url: _imageUrlCache.get(imageId), isThumb: false };
      const url = URL.createObjectURL(rec.blob);
      _imageUrlCache.set(imageId, url);
      return { url, isThumb: false };
    }
    // 本地无原图 → 从图床 URL 加载
    const urlMap = await getMeta('imageUrlMap') || {};
    if (urlMap[imageId]) {
      return { url: urlMap[imageId], isThumb: false, fromHost: true };
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
    if (!useIDB) {
      // 降级：写回 localStorage
      try { localStorage.setItem('xc_questions', JSON.stringify(questions)); } catch {}
      try { localStorage.setItem('xc_words', JSON.stringify(words)); } catch {}
      dirtyQ.clear();
      dirtyW.clear();
      return;
    }
    try {
      if (dirtyQ.size) {
        const toSave = questions.filter(q => dirtyQ.has(q.id));
        if (toSave.length) await idbBulkPut('questions', toSave);
        dirtyQ.clear();
      }
      if (dirtyW.size) {
        const toSave = words.filter(w => dirtyW.has(w.id));
        if (toSave.length) await idbBulkPut('words', toSave);
        dirtyW.clear();
      }
    } catch (e) { console.warn('IDB 写入失败：', e); }
  }, 300);
}
function saveWord(w) {
  w.updatedAt = Date.now();
  const idx = words.findIndex(x => x.id === w.id);
  if (idx >= 0) words[idx] = w; else words.push(w);
  dirtyW.add(w.id);
  scheduleFlush();
  schedulePush();
  invalidateStorageCache();
}

function saveWordsAll() {
  words.forEach(w => dirtyW.add(w.id));
  scheduleFlush();
  schedulePush();
  invalidateStorageCache();
}

async function deleteWord(id) {
  words = words.filter(w => w.id !== id);
  if (useIDB) { try { await idbDelete('words', id); } catch (e) { console.warn(e); } }
  schedulePush();
  invalidateStorageCache();
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
async function saveExamRecord(record) {
  if (!useIDB) return;
  try {
    let list = await getMeta('examRecords') || [];
    list.unshift(record); // 最新记录在前
    if (list.length > 20) list = list.slice(0, 20); // 只保留最近 20 次
    await setMeta('examRecords', list);
  } catch (e) { console.warn('保存考试记录失败', e); }
}
async function clearAllStores() {
  if (useIDB) {
    await idbClear('questions');
    await idbClear('words');
    await idbClear('images');
    await idbClear('meta');
  }
  questions = [];
  words = [];
  settings = {};
  dirtyQ.clear();
  dirtyW.clear();
  localStorage.removeItem('xc_browse_state');
}