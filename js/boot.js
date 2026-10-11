/* ============ 启动 ============ */
document.getElementById('themeToggle').addEventListener('click', toggleTheme);
document.getElementById('settingsBtn').addEventListener('click', openSettings);

document.querySelectorAll('.nav button').forEach(btn => {
  btn.addEventListener('click', () => {
    state.mode = btn.dataset.mode;
    if (btn.dataset.mode !== 'settings') state.prevMode = btn.dataset.mode;
    saveCurrentMode();
    renderView();
  });
});

(async function boot() {
  await openDB();
  if (useIDB) {
    try {
      questions = (await idbGetAll('questions')) || [];
      settings = (await getMeta('settings')) || {};
      deletedIds = (await getMeta('deletedIds')) || [];
      const lastSync = await getMeta('lastSyncedAt');
      if (lastSync) lastSyncedAt = lastSync;
    } catch (e) { console.warn('IDB 读取失败', e); }
  }

  // 一次性清理旧格式 AI 报告缓存（只执行一次）
  try {
    const CLEAN_FLAG = 'xc_analysis_cleaned_v2';
    if (!localStorage.getItem(CLEAN_FLAG)) {
      const allMeta = useIDB ? await idbGetAll('meta') : [];
      const oldKeys = allMeta
        .filter(m => m.key && m.key.startsWith('analysis:'))
        .filter(m => !m.value || !m.value.level || m.value._v !== 2)
        .map(m => m.key);
      if (oldKeys.length && useIDB) {
        for (const k of oldKeys) {
          await new Promise(r => {
            const tx = db.transaction('meta', 'readwrite');
            tx.objectStore('meta').delete(k);
            tx.oncomplete = r; tx.onerror = r;
          });
        }
        console.log(`[清理] 删除 ${oldKeys.length} 条旧报告缓存`);
      }
      localStorage.setItem(CLEAN_FLAG, '1');
    }
  } catch (e) { console.warn('清理旧缓存失败：', e); }

  // 恢复上次所在 Tab（含设置页）
  const savedMode = localStorage.getItem('xc_mode');
  const validModes = ['collect','exam','browse','notes','analysis','settings'];
  if (savedMode && validModes.includes(savedMode)) {
    state.mode = savedMode;
    state.prevMode = savedMode === 'settings' ? (state.prevMode || 'collect') : savedMode;
  }
    // 恢复 AI 分析页当前层级的缓存报告（14 天内有效）
  if (state.mode === 'analysis') {
    try {
      const key = analysisCacheKey();
      const cached = await getMeta(key);
      const CACHE_TTL = 14 * 24 * 3600 * 1000;
      if (cached && cached.generatedAt && Date.now() - cached.generatedAt < CACHE_TTL) {
        state.analysis.report = cached;
        console.log('[AI分析] 已从缓存恢复报告');
      }
    } catch (e) { console.warn('[AI分析] 恢复缓存失败：', e); }
  }

  // 恢复更细的浏览状态
  const lastBrowse = loadBrowseState();
  let restoreScrollY = 0;

  // 只有当前 Tab 是 browse 时，才恢复它的详细状态
  // 其他 Tab 忽略 lastBrowse，避免被强行拉回错题查看
  if (lastBrowse && state.mode === 'browse') {
    restoreScrollY = Number(lastBrowse.scrollY) || 0;

    // 恢复筛选条件
    if (lastBrowse.filter && typeof lastBrowse.filter === 'object') {
      state.browse.filter = {
        module: lastBrowse.filter.module || 'all',
        type: lastBrowse.filter.type || 'all',
        source: lastBrowse.filter.source || 'all',
        knowledgePoints: Array.isArray(lastBrowse.filter.knowledgePoints)
          ? lastBrowse.filter.knowledgePoints
          : []
      };
    }
    if (['createdAt', 'wrongCount', 'stars'].includes(lastBrowse.sortBy)) {
      state.browse.sortBy = lastBrowse.sortBy;
    }

    if (Number.isInteger(lastBrowse.page) && lastBrowse.page > 0) {
      state.browse.page = lastBrowse.page;
    }
    if (lastBrowse.pageSize === 'all' || Number.isInteger(lastBrowse.pageSize)) {
      state.browse.pageSize = lastBrowse.pageSize;
    }

    if (lastBrowse.selectedId) {
      const q = questions.find(x => x.id === lastBrowse.selectedId);
      if (q) {
        state.browse.selectedId = q.id;
        state.browse.detail = { question: q, similar: [] };
        state.browse.generating = { analysis: false, similar: false };
        const filtered = filterQuestions(state.browse.filter);
        state.browse.listIds = sortBrowseList(filtered, state.browse.sortBy).map(x => x.id);
        state.browse.listScrollY = 0;
        state.browse.pendingScrollRestore = null;
      }
    }
  }

    // 一次性清掉历史遗留的 stale selectedId（只在非 browse 页时）
  if (state.mode !== 'browse') {
    try {
      const raw = localStorage.getItem('xc_browse_state');
      if (raw) {
        const s = JSON.parse(raw);
        if (s.selectedId) {
          s.selectedId = null;
          localStorage.setItem('xc_browse_state', JSON.stringify(s));
        }
      }
    } catch {}
  }

  renderView();

  // 页面打开后 2 秒，自动 PULL 一次
  if (getGistId() && getGistToken()) {
    setTimeout(() => {
      pullFromGist().then(() => renderView()).catch(() => {});
    }, 2000);
  }
    // 清洗历史数据：去掉选项内容里可能残留的 "A." "B、" 等前缀
  let cleaned = 0;
  questions.forEach(q => {
    if (!Array.isArray(q.options)) return;
    if (typeof q.personalNote !== 'string') q.personalNote = '';
    if (typeof q.personalNoteUpdatedAt !== 'number') q.personalNoteUpdatedAt = 0;
    if (typeof q.stars !== 'number') q.stars = 0;
    if (!Array.isArray(q.imageIds)) q.imageIds = [];
    const cleanedOpts = q.options.map(s => stripOptionPrefix(s));
    if (JSON.stringify(cleanedOpts) !== JSON.stringify(q.options)) {
      q.options = cleanedOpts;
      dirtyQ.add(q.id);
      cleaned++;
    }
  });
  if (cleaned) {
    console.log(`[清洗] 修复了 ${cleaned} 道题的选项前缀`);
    scheduleFlush();
  }

  // 后台预热 PaddleOCR
  if (canUsePaddle() && !_paddleFailed) {
    setTimeout(() => {
      console.log('[预热] 开始加载 PaddleOCR…');
      const t0 = performance.now();
      initPaddleOCR()
        .then(() => {
          console.log(`[预热] PaddleOCR 就绪，耗时 ${((performance.now() - t0) / 1000).toFixed(1)}s`);
          // 如果当前在错题收录页，自动刷新 UI 以更新状态文字
          if (state.mode === 'collect') renderView();
        })
        .catch(e => console.warn('[预热] PaddleOCR 加载失败：', e.message));
    }, 2000);
  }
  // 注册 Service Worker 缓存 OCR 资源
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('sw.js').then(reg => {
      console.log('[SW] 已注册');
      // 每次打开检查更新
      reg.update().catch(() => {});
      // 监听更新
      reg.addEventListener('updatefound', () => {
        const newWorker = reg.installing;
        if (!newWorker) return;
        newWorker.addEventListener('statechange', () => {
          if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
            // 有新版本，提示用户
            console.log('[SW] 检测到新版本');
            if (confirm('检测到新版本，是否立即刷新页面？')) {
              newWorker.postMessage('SKIP_WAITING');
              location.reload();
            }
          }
        });
      });
    }).catch(err => {
      console.warn('[SW] 注册失败：', err.message);
    });

    // 监听 SW 控制变化 → 自动刷新
    let refreshing = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (refreshing) return;
      refreshing = true;
      location.reload();
    });
  }
    // 恢复滚动位置
  if (restoreScrollY > 0) {
    requestAnimationFrame(() => requestAnimationFrame(() => {
      window.scrollTo({ top: restoreScrollY, behavior: 'instant' });
      document.documentElement.scrollTop = restoreScrollY;
      document.body.scrollTop = restoreScrollY;
    }));
  }

  // 首次打开引导（只提示一次）
  if (!localStorage.getItem('xc_welcomed')) {
    localStorage.setItem('xc_welcomed', '1');
    setTimeout(() => showWelcome(), 800);
  }
  window.addEventListener('beforeunload', () => {
    if (!useIDB) return;
    try {
      if (dirtyQ.size) {
        const toSave = questions.filter(q => dirtyQ.has(q.id));
        if (toSave.length) idbBulkPut('questions', toSave);
      }
      if (lastSyncedAt) setMeta('lastSyncedAt', lastSyncedAt);
    } catch {}
  });
  // 滚动时持续记录位置（仅在有 selectedId 或处于列表页时）
  window.addEventListener('scroll', () => {
    // 只记录错题查看页的滚动位置（其他页面无意义）
    if (state.mode === 'browse') {
      persistScrollThrottled();
    }
  }, { passive: true });
})();

function showWelcome() {
  const tip = document.createElement('div');
  tip.id = 'welcomeTip';
  tip.innerHTML = `
    <div class="head">
      <b>👋 欢迎使用行测错题本</b>
      <button id="welcomeClose" title="关闭">×</button>
    </div>
    <p>三步开始：<br>
      1️⃣ 到设置页配置 DeepSeek API Key<br>
      2️⃣ 到「错题收录」截图，<code>Ctrl/Cmd + V</code> 粘贴<br>
      3️⃣ 之后在考试、查看、分析里使用
    </p>
    <div class="acts">
      <button class="btn sm primary" id="welcomeGo">去配置</button>
      <button class="btn sm ghost" id="welcomeSkip">知道了</button>
    </div>
  `;
  document.body.appendChild(tip);
  requestAnimationFrame(() => tip.classList.add('show'));

  const close = () => {
    tip.classList.remove('show');
    setTimeout(() => tip.remove(), 300);
  };
  tip.querySelector('#welcomeClose').addEventListener('click', close);
  tip.querySelector('#welcomeSkip').addEventListener('click', close);
  tip.querySelector('#welcomeGo').addEventListener('click', () => {
    close();
    openSettings();
  });
  setTimeout(close, 15000); // 15 秒后自动消失
}

window.xc = {
  info: () => ({ mode: state.mode, questions: questions.length, useIDB, dirty: dirtyQ.size, theme: getTheme() }),
  questions: () => questions,
  categories: CATEGORIES,
  reset: () => clearAllStores(),
  setTheme: (t) => { localStorage.setItem(K_THEME, t); applyTheme(t); }
};