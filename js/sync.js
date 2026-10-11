/* ============ GitHub Gist 同步 + 图床 ============ */
const getGistId = () => localStorage.getItem(K_GIST_ID) || '';
const getGistToken = () => localStorage.getItem(K_GIST_TOKEN) || '';

/* ============ 图床配置 ============ */
const IMAGE_HOST_CONFIG = {
  imgbb: {
    name: 'ImgBB',
    uploadUrl: 'https://api.imgbb.com/1/upload'
  },
  beeimg: {
    name: '蜜蜂图床',
    uploadUrl: 'https://beeimg.com/api/upload/file/json/'
  }
};

/* API Key 从 localStorage 读（用户填），优先于代码内默认值 */
function getImgHostKey(hostKey) {
  return localStorage.getItem('xc_imghost_key_' + hostKey) || '';
}
function setImgHostKey(hostKey, key) {
  localStorage.setItem('xc_imghost_key_' + hostKey, key || '');
}

/* 当前优先图床 */
let currentImageHost = localStorage.getItem('xc_image_host') || 'imgbb';

/* ============ 图床上传 ============ */
async function uploadToImageHost(blob) {
  const order = currentImageHost === 'imgbb' ? ['imgbb', 'beeimg'] : ['beeimg', 'imgbb'];
  let lastError = null;

  for (const hostKey of order) {
    const config = IMAGE_HOST_CONFIG[hostKey];
    if (!config) continue;
    const apiKey = getImgHostKey(hostKey);
    if (!apiKey) {
      console.log(`[图床] ${config.name} 未配置 API Key，跳过`);
      continue;
    }
    try {
      console.log(`[图床] 尝试 ${config.name}...`);
      const url = await doUpload(hostKey, config, apiKey, blob);
      console.log(`[图床] ${config.name} 上传成功: ${url}`);
      if (currentImageHost !== hostKey) {
        currentImageHost = hostKey;
        localStorage.setItem('xc_image_host', hostKey);
      }
      return url;
    } catch (e) {
      console.warn(`[图床] ${config.name} 失败:`, e.message);
      lastError = e;
    }
  }
  throw new Error('所有图床均失败：' + (lastError?.message || '未配置任何图床 API Key'));
}

async function doUpload(hostKey, config, apiKey, blob) {
  if (hostKey === 'imgbb') {
    const formData = new FormData();
    formData.append('image', blob);
    const res = await fetch(`${config.uploadUrl}?key=${apiKey}`, {
      method: 'POST',
      body: formData
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (!data.success) throw new Error(data.error?.message || 'ImgBB 返回失败');
    return data.data.url;
  }
  if (hostKey === 'beeimg') {
    const formData = new FormData();
    formData.append('file', blob, 'image.jpg');
    if (apiKey) formData.append('apikey', apiKey);
    const res = await fetch(config.uploadUrl, { method: 'POST', body: formData });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const url = data.url || data.data?.url || data.image?.url || data.result?.url || data.link;
    if (!url) throw new Error('蜜蜂图床返回格式异常: ' + JSON.stringify(data).slice(0, 200));
    return url;
  }
  throw new Error('未知图床: ' + hostKey);
}

/* ============ imageUrlMap（imgId → URL）缓存 ============ */
let _imageUrlMapCache = null;

async function getImageUrlMap() {
  if (_imageUrlMapCache) return _imageUrlMapCache;
  try {
    const map = await getMeta('imageUrlMap') || {};
    _imageUrlMapCache = map;
    return map;
  } catch {
    return {};
  }
}
async function saveImageUrlMap(map) {
  _imageUrlMapCache = map;
  await setMeta('imageUrlMap', map);
}
async function setImageUrl(imgId, url) {
  const map = await getImageUrlMap();
  map[imgId] = url;
  await saveImageUrlMap(map);
}
function invalidateImageUrlCache() {
  _imageUrlMapCache = null;
}

/* ============ Gist ============ */
function setGistConfig(id, token) {
  localStorage.setItem(K_GIST_ID, id);
  localStorage.setItem(K_GIST_TOKEN, token);
}

async function gistFetch() {
  const id = getGistId();
  const token = getGistToken();
  if (!id || !token) throw new Error('请先配置 Gist ID 和 Token');
  const res = await fetch(`https://api.github.com/gists/${id}`, {
    headers: { 'Authorization': `token ${token}` }
  });
  if (!res.ok) {
    if (res.status === 404) throw new Error('Gist 不存在或 Token 无权限');
    if (res.status === 401) throw new Error('Token 无效或已过期');
    throw new Error('GitHub 请求失败 (' + res.status + ')');
  }
  return await res.json();
}

async function getGistContent() {
  const data = await gistFetch();
  const file = data.files[GIST_FILENAME];
  if (!file) return null;
  let content = file.content;
  const sizeHint = file.size || 0;
  if (file.truncated || !content || (sizeHint && sizeHint > 900 * 1024)) {
    if (!file.raw_url) throw new Error('Gist 文件被截断，且无 raw_url');
    console.log(`[同步] 文件过大（${Math.round(sizeHint / 1024)} KB），改用 raw_url`);
    const rawRes = await fetch(file.raw_url);
    if (!rawRes.ok) throw new Error('raw_url 下载失败 ' + rawRes.status);
    content = await rawRes.text();
  }
  return content;
}

async function pullFromGist() {
  if (!getGistId() || !getGistToken()) return;
  if (syncing) return;
  syncing = true;
  try {
    const content = await getGistContent();
    if (!content) { syncing = false; return; }
    let remote;
    try {
      remote = JSON.parse(content);
    } catch (e) {
      throw new Error('JSON 解析失败（' + content.length + ' 字符）：' + e.message);
    }
    await mergeRemote(remote);
    lastSyncedAt = Date.now();
    console.log('[同步] PULL 完成');
  } catch (e) {
    console.warn('[同步] PULL 失败：', e.message);
    throw e;
  } finally {
    syncing = false;
  }
}

async function pushToGist() {
  const id = getGistId();
  const token = getGistToken();
  if (!id || !token) return;
  if (syncing) return;
  syncing = true;

  try {
    // 收集所有被题目引用的图片 ID
    const allImageIds = new Set();
    questions.forEach(q => (q.imageIds || []).forEach(i => allImageIds.add(i)));

    // 上传未上传过的图片
    const urlMap = await getImageUrlMap();
    let uploaded = 0, failed = 0;
    for (const imgId of allImageIds) {
      if (urlMap[imgId]) continue;  // 已有 URL，跳过
      try {
        const rec = await idbGetImage(imgId);
        if (!rec) continue;
        const blobToUpload = rec.blob || rec.thumbnail;
        if (!blobToUpload) continue;
        console.log(`[同步] 上传 ${imgId}（${Math.round(blobToUpload.size / 1024)} KB）...`);
        const url = await uploadToImageHost(blobToUpload);
        urlMap[imgId] = url;
        uploaded++;
        await saveImageUrlMap(urlMap);  // 立即保存，防中断丢失
      } catch (e) {
        console.warn(`[同步] 图片 ${imgId} 上传失败:`, e.message);
        failed++;
      }
    }
    if (uploaded) console.log(`[同步] 新上传 ${uploaded} 张${failed ? `，失败 ${failed} 张` : ''}`);

    // 只导出被引用的图片 URL
    const referencedUrls = {};
    for (const imgId of allImageIds) {
      if (urlMap[imgId]) referencedUrls[imgId] = urlMap[imgId];
    }

    const contentStr = JSON.stringify({
      questions,
      deletedIds,
      imageUrls: referencedUrls,
      lastSyncedAt: Date.now()
    }, null, 2);

    console.log(`[同步] Gist 内容 ${Math.round(contentStr.length / 1024)} KB，含 ${Object.keys(referencedUrls).length} 个图片URL`);

    const res = await fetch(`https://api.github.com/gists/${id}`, {
      method: 'PATCH',
      headers: {
        'Authorization': `token ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ files: { [GIST_FILENAME]: { content: contentStr } } })
    });
    if (!res.ok) throw new Error('GitHub 返回 ' + res.status);
    lastSyncedAt = Date.now();
    console.log('[同步] PUSH 完成');
  } catch (e) {
    console.warn('[同步] PUSH 失败：', e.message);
    throw e;
  } finally {
    syncing = false;
  }
}

function schedulePush() {
  if (!getGistId() || !getGistToken()) return;
  if (pushTimer) clearTimeout(pushTimer);
  pushTimer = setTimeout(() => {
    pushTimer = null;
    pushToGist().catch(() => {});
  }, 3000);
}

async function mergeRemote(remote) {
  if (!remote || typeof remote !== 'object') return;

  const remoteDeleted = Array.isArray(remote.deletedIds) ? remote.deletedIds : [];
  deletedIds = [...new Set([...deletedIds, ...remoteDeleted])];

  const localMap = new Map(questions.map(q => [q.id, q]));
  const remoteQs = Array.isArray(remote.questions) ? remote.questions : [];
  let added = 0, updated = 0;

  for (const rq of remoteQs) {
    if (!rq || !rq.id) continue;
    if (deletedIds.includes(rq.id)) continue;
    const lq = localMap.get(rq.id);
    if (!lq) {
      questions.push(rq);
      dirtyQ.add(rq.id);
      added++;
    } else {
      const lt = lq.updatedAt || lq.createdAt || 0;
      const rt = rq.updatedAt || rq.createdAt || 0;
      if (rt > lt) {
        const idx = questions.findIndex(x => x.id === rq.id);
        questions[idx] = rq;
        dirtyQ.add(rq.id);
        updated++;
      }
    }
  }

  const beforeLen = questions.length;
  questions = questions.filter(q => !deletedIds.includes(q.id));
  const removed = beforeLen - questions.length;

  /* 合并 imageUrls */
  if (remote.imageUrls && typeof remote.imageUrls === 'object') {
    const localUrlMap = await getImageUrlMap();
    let urlAdded = 0;
    for (const [imgId, url] of Object.entries(remote.imageUrls)) {
      if (!localUrlMap[imgId]) { localUrlMap[imgId] = url; urlAdded++; }
    }
    if (urlAdded) {
      await saveImageUrlMap(localUrlMap);
      console.log(`[同步] 合并 ${urlAdded} 个图片URL`);
    }
  }

  /* 兼容旧格式 thumbnails（过渡用，将来可删） */
  const remoteThumbs = remote.thumbnails || {};
  let thumbAdded = 0;
  for (const [imgId, dataURL] of Object.entries(remoteThumbs)) {
    try {
      const localRec = await idbGetImage(imgId);
      if (localRec && (localRec.blob || localRec.thumbnail)) continue;
      const thumbBlob = dataURLToBlob(dataURL);
      if (!thumbBlob) continue;
      await new Promise((resolve, reject) => {
        const r = db.transaction('images', 'readwrite').objectStore('images').put({ id: imgId, thumbnail: thumbBlob, createdAt: Date.now() });
        r.onsuccess = () => resolve();
        r.onerror = () => reject(r.error);
      });
      thumbAdded++;
    } catch (e) {
      console.warn('[同步] 兼容旧缩略图失败：', imgId, e);
    }
  }
  if (thumbAdded) console.log(`[同步] 兼容导入 ${thumbAdded} 张旧缩略图`);

  await setMeta('deletedIds', deletedIds);
  scheduleFlush();

  if (added || updated || removed) {
    console.log(`[同步] 合并：+${added} 更新${updated} 删除${removed}`);
  }
}

async function syncNow() {
  try {
    await pullFromGist();
    await pushToGist();
    showToast('同步完成');
  } catch (e) {
    alert('同步失败：' + e.message);
  }
  renderView();
}

/* ============ 清理 Gist 中的旧缩略图 ============ */
async function cleanGistThumbnails() {
  const id = getGistId();
  const token = getGistToken();
  if (!id || !token) throw new Error('请先配置 Gist');

  const content = await getGistContent();
  if (!content) { showToast('Gist 文件为空'); return; }

  let remote;
  try {
    remote = JSON.parse(content);
  } catch (e) {
    throw new Error('Gist 内容解析失败：' + e.message);
  }

  if (!remote.thumbnails) {
    showToast('Gist 中没有旧缩略图字段');
    return;
  }

  const beforeKB = Math.round(JSON.stringify(remote).length / 1024);
  delete remote.thumbnails;
  remote.lastSyncedAt = Date.now();
  const contentStr = JSON.stringify(remote, null, 2);
  const afterKB = Math.round(contentStr.length / 1024);

  const res = await fetch(`https://api.github.com/gists/${id}`, {
    method: 'PATCH',
    headers: {
      'Authorization': `token ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ files: { [GIST_FILENAME]: { content: contentStr } } })
  });
  if (!res.ok) throw new Error('GitHub 返回 ' + res.status);
  console.log(`[清理] ${beforeKB} KB → ${afterKB} KB`);
  showToast(`Gist 旧缩略图已清理（${beforeKB} → ${afterKB} KB）`);
}