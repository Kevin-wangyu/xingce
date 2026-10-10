/* ============ GitHub Gist 同步 ============ */
const getGistId = () => localStorage.getItem(K_GIST_ID) || '';
const getGistToken = () => localStorage.getItem(K_GIST_TOKEN) || '';
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

async function pullFromGist() {
  if (!getGistId() || !getGistToken()) return;
  if (syncing) return;
  syncing = true;
  try {
    const data = await gistFetch();
    const file = data.files[GIST_FILENAME];
    if (!file || !file.content) { syncing = false; return; }
    const remote = JSON.parse(file.content);
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

    // 逐个读取缩略图，转 base64
    const thumbnails = {};
    for (const imgId of allImageIds) {
      try {
        const rec = await idbGetImage(imgId);
        if (rec && rec.thumbnail) {
          thumbnails[imgId] = await blobToDataURL(rec.thumbnail);
        }
      } catch (e) { console.warn('[同步] 读取缩略图失败：', imgId, e); }
    }

    const payload = {
      files: {
        [GIST_FILENAME]: {
          content: JSON.stringify({
            questions,
            deletedIds,
            thumbnails,   // ← 新增
            lastSyncedAt: Date.now()
          }, null, 2)
        }
      }
    };
    const res = await fetch(`https://api.github.com/gists/${id}`, {
      method: 'PATCH',
      headers: {
        'Authorization': `token ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });
    if (!res.ok) throw new Error('GitHub 返回 ' + res.status);
    lastSyncedAt = Date.now();
    console.log(`[同步] PUSH 完成（含 ${Object.keys(thumbnails).length} 张缩略图）`);
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

    /* ============ 合并缩略图 ============ */
  const remoteThumbs = remote.thumbnails || {};
  let thumbAdded = 0;
  for (const [imgId, dataURL] of Object.entries(remoteThumbs)) {
    try {
      // 如果本地已有原图，跳过（保留原图）
      const localRec = await idbGetImage(imgId);
      if (localRec && localRec.blob) continue;
      // 没有原图 → 把缩略图存进去（作为 blob 的替代）
      const thumbBlob = dataURLToBlob(dataURL);
      if (!thumbBlob) continue;
      const rec = { id: imgId, thumbnail: thumbBlob, createdAt: Date.now() };
      await new Promise((resolve, reject) => {
        const r = db.transaction('images', 'readwrite').objectStore('images').put(rec);
        r.onsuccess = () => resolve();
        r.onerror = () => reject(r.error);
      });
      thumbAdded++;
    } catch (e) {
      console.warn('[同步] 合并缩略图失败：', imgId, e);
    }
  }
  if (thumbAdded) console.log(`[同步] 新增 ${thumbAdded} 张缩略图`);

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