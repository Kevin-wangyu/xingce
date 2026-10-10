/* ============ 工具 ============ */
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
const renderStem = stem => esc(stem || '').replace(/(_{2,}|＿{2,}|—{2,}|-{3,})/g, '<span style="color:var(--primary);font-weight:700">____</span>');


/* 给一组 .star-picker 绑定交互（hover 预览 + 点击设定） */
function bindStarPickers(rootEl, onChange) {
  rootEl.querySelectorAll('.star-picker.interactive').forEach(picker => {
    const apply = (val) => {
      picker.querySelectorAll('.star').forEach(el => {
        el.classList.toggle('on', parseInt(el.dataset.starIdx) <= val);
      });
    };
    const original = parseInt(picker.dataset.value) || 0;

    picker.querySelectorAll('.star').forEach(star => {
      star.addEventListener('mouseenter', () => {
        apply(parseInt(star.dataset.starIdx));
      });
    });
    picker.addEventListener('mouseleave', () => {
      apply(parseInt(picker.dataset.value) || 0);
    });
    picker.querySelectorAll('.star').forEach(star => {
      star.addEventListener('click', () => {
        const v = parseInt(star.dataset.starIdx);
        // 再点同一颗星 = 取消（归零）
        const nv = (parseInt(picker.dataset.value) === v) ? 0 : v;
        picker.dataset.value = nv;
        apply(nv);
        if (typeof onChange === 'function') onChange(nv);
      });
    });
  });
}

/* 渲染题干 + 破题题眼高亮 */
function renderStemWithHighlights(stem, keyPoints) {
  if (!stem) return '';
  let html = esc(stem);
  // 横线转高亮
  html = html.replace(/(_{2,}|＿{2,}|—{2,}|-{3,})/g,
    '<span style="color:var(--primary);font-weight:700">____</span>');
  // 题眼高亮
  if (Array.isArray(keyPoints) && keyPoints.length) {
    // 按长度降序，避免短片段先匹配导致长片段无法匹配
    const sorted = [...keyPoints]
      .map(k => (typeof k === 'string' ? k : k.text))
      .filter(Boolean)
      .sort((a, b) => b.length - a.length);
    const placed = [];
    for (const raw of sorted) {
      const t = esc(raw);
      if (!t) continue;
      // 转义正则特殊字符
      const safe = t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      // 避免在已放置的 <mark> 内部重复匹配
      if (placed.some(p => p.includes(t))) continue;
      const re = new RegExp(safe, 'g');
      if (re.test(html)) {
        html = html.replace(re, `<mark class="key-point">${t}</mark>`);
        placed.push(t);
      }
    }
  }
  return html;
}
/* 保存浏览状态（Tab + 当前详情题 + 滚动位置） */
let _scrollSaveTimer = null;
function persistBrowseState() {
  try {
    const inBrowse = state.mode === 'browse';
    const payload = {
      selectedId: (inBrowse && state.browse?.selectedId) ? state.browse.selectedId : null,
      filter: {
        module: state.browse?.filter?.module || 'all',
        type: state.browse?.filter?.type || 'all',
        source: state.browse?.filter?.source || 'all',
        knowledgePoints: Array.isArray(state.browse?.filter?.knowledgePoints) ? state.browse.filter.knowledgePoints : []
      },
      sortBy: state.browse?.sortBy || 'wrongCount',
      page: state.browse?.page || 1,
      pageSize: state.browse?.pageSize || 20,
      scrollY: window.scrollY || document.documentElement.scrollTop || 0,
      ts: Date.now()
    };
    localStorage.setItem('xc_browse_state', JSON.stringify(payload));
  } catch {}
}

/* 节流保存滚动位置（200ms） */
function persistScrollThrottled() {
  if (_scrollSaveTimer) return;
  _scrollSaveTimer = setTimeout(() => {
    _scrollSaveTimer = null;
    persistBrowseState();
  }, 200);
}

/* 读取上次浏览状态 */
function loadBrowseState() {
  try {
    const raw = localStorage.getItem('xc_browse_state');
    if (!raw) return null;
    const s = JSON.parse(raw);
    // 超过 7 天的记录忽略
    if (!s.ts || Date.now() - s.ts > 7 * 24 * 3600 * 1000) return null;
    return s;
  } catch { return null; }
}

function saveCurrentMode() {
  try {
    // 设置页也记录，刷新后能回到设置页
    localStorage.setItem('xc_mode', state.mode);
  } catch {}
}

/* 重置所有题目的作答统计：错误次数全部置 1，正确次数置 0，清空作答历史 */
async function resetAllStats() {
  if (!questions.length) {
    showToast('当前没有题目');
    return;
  }
  questions.forEach(q => {
    q.wrongCount = 1;
    q.rightCount = 0;
    q.attemptHistory = [];
    q.updatedAt = Date.now();
    dirtyQ.add(q.id);
    if (typeof q.personalNote !== 'string') q.personalNote = '';
    if (typeof q.personalNoteUpdatedAt !== 'number') q.personalNoteUpdatedAt = 0;
  });
  scheduleFlush();
  schedulePush();
  invalidateStorageCache();
  await setMeta('settings', settings);
  showToast(`已重置 ${questions.length} 道题`);
  renderView();
}
/* 导出错题库为 JSON */
function exportBackup() {
  if (!questions.length) {
    showToast('当前没有数据');
    return;
  }
  try {
    const blob = new Blob([JSON.stringify(questions, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `行测错题库_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
    showToast('已导出备份');
  } catch (e) {
    alert('导出失败：' + e.message);
  }
}

/* 图片灯箱 */
function openImageLightbox(url) {
  const box = document.createElement('div');
  box.className = 'image-lightbox';
  const img = document.createElement('img');
  img.src = url;
  box.appendChild(img);
  box.addEventListener('click', () => box.remove());
  document.addEventListener('keydown', function esc(e) {
    if (e.key === 'Escape') { box.remove(); document.removeEventListener('keydown', esc); }
  });
  document.body.appendChild(box);
}
/* 去掉选项内容里 AI 偶发带入的 "A." "A、" "（A）" 等前缀 */
function stripOptionPrefix(s) {
  return String(s == null ? '' : s)
    .trim()
    .replace(/^[（(【\[]\s*[A-Da-d]\s*[）)】\]]\s*[\.、:：,，]?\s*/, '')
    .replace(/^[A-Da-d]\s*[\.、:：,，\)）]\s*/, '')
    .trim();
}

/* 去除题干开头的题号（如 "12." "15、" "115．" "二、"） */
function stripStemPrefix(stem) {
  if (!stem) return '';
  let s = String(stem).trim();
  let prev = '';
  let iter = 0;
  while (prev !== s && iter < 4) {
    prev = s;
    // 数字 + 分隔符：12. / 15、 / 115． / 12: / 12：
    s = s.replace(/^\d{1,4}\s*[\.、．:：。]\s*/, '');
    // 括号数字：[12] / (15) / 【12】 / （15）—— 只在后面跟分隔符或空格时删，避免误删语句排序题
    s = s.replace(/^[\(\[（【]\s*\d{1,4}\s*[\)\]）】]\s*[\.、．:：]\s*/, '');
    // 中文数字 + 分隔符：一、 二. 三：
    s = s.replace(/^[一二三四五六七八九十]{1,3}\s*[\.、．:：。]\s*/, '');
    // "第12题：" / "第12题." 等
    s = s.replace(/^第\s*\d{1,4}\s*[题小]\s*[\.、．:：]?\s*/, '');
    iter++;
  }
  return s.trim();
}

/* ============ 题目去重 ============ */
function questionFingerprint(stem) {
  return String(stem || '')
    .replace(/[\s，。；：！？、""''（）《》【】—…\.\,\;\:\!\?\"\'\(\)\[\]\<\>]/g, '')
    .slice(0, 40);
}

function findDuplicate(newQ, excludeIds = []) {
  const fp = questionFingerprint(newQ.stem);
  if (!fp) return null;
  return questions.find(q => {
    if (excludeIds.includes(q.id)) return false;
    return questionFingerprint(q.stem) === fp;
  }) || null;
}

/* 把新题覆盖到已有题，保留旧的统计信息 */
function overwriteQuestion(existingId, newQ) {
  const old = questions.find(q => q.id === existingId);
  if (!old) return false;
  const merged = {
    ...newQ,
    id: old.id,
    wrongCount: old.wrongCount || 0,
    rightCount: old.rightCount || 0,
    attemptHistory: old.attemptHistory || [],
    createdAt: old.createdAt || Date.now(),
    // 保留旧的 AI 分析结果，避免重复花钱
    aiEasyMistake: old.aiEasyMistake || '',
    aiBetterSolution: old.aiBetterSolution || ''
  };
  saveQuestion(merged);
  return true;
}

/* 弹出重复处理模态框 */
function showDupModal(dups, uniqueNew, onDone) {
  const overlay = document.createElement('div');
  overlay.className = 'dup-overlay';
  overlay.innerHTML = `
    <div class="dup-modal" role="dialog">
      <div class="dup-head">
        <div class="dup-title"><span class="ico">⚠️</span>检测到 ${dups.length} 道重复题</div>
        <div class="dup-sub">以下几道题在错题库中已存在（按题干前 40 字匹配），请选择处理方式</div>
      </div>
      <div class="dup-body">
        <div class="dup-list">
          ${dups.map((d, i) => `
            <div class="dup-item">
              <div class="dup-item-stem">${i + 1}. ${esc(d.newQ.stem.slice(0, 80))}${d.newQ.stem.length > 80 ? '…' : ''}</div>
              <div class="dup-item-meta">
                <span>${esc(d.newQ.module)} · ${esc(d.newQ.type)}</span>
                <span>原题已错 <b>${d.existing.wrongCount || 0}</b> 次</span>
              </div>
            </div>
          `).join('')}
        </div>
      </div>
      <div class="dup-actions">
        <button class="dup-action-btn primary" data-action="overwrite">
          <div>
            <div>覆盖旧题</div>
            <div class="desc">保留错误次数和作答历史，更新题干、选项、答案</div>
          </div>
          <span>→</span>
        </button>
        <button class="dup-action-btn" data-action="skip">
          <div>
            <div>跳过重复题</div>
            <div class="desc">只保存新的 ${uniqueNew.length} 道不重复的题</div>
          </div>
          <span>→</span>
        </button>
        <button class="dup-action-btn" data-action="append">
          <div>
            <div>仍然新增</div>
            <div class="desc">当作不同题处理，可能导致题库有重复</div>
          </div>
          <span>→</span>
        </button>
        <button class="dup-action-btn cancel" data-action="cancel">
          取消本次保存
        </button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  const close = () => overlay.remove();

  overlay.querySelectorAll('.dup-action-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const action = btn.dataset.action;
      close();
      if (action === 'cancel') return;
      try {
        await onDone(action);
      } catch (e) {
        console.error('[DupModal] onDone 出错：', e);
        alert('操作失败：' + e.message);
      }
    });
  });

  // 点空白处关闭 = 取消
  overlay.addEventListener('click', e => {
    if (e.target === overlay) { close(); }
  });
}

const timeAgo = t => {
  const d = Date.now() - t;
  if (d < 60000) return '刚刚';
  if (d < 3600000) return Math.floor(d / 60000) + ' 分钟前';
  if (d < 86400000) return Math.floor(d / 3600000) + ' 小时前';
  return Math.floor(d / 86400000) + ' 天前';
};

/* ============ Toast ============ */
let toastTimer = null;
function showToast(text) {
  let tip = document.getElementById('saveTip');
  if (!tip) {
    tip = document.createElement('div');
    tip.id = 'saveTip';
    document.body.appendChild(tip);
  }
  tip.textContent = text;
  tip.style.display = 'block';
  void tip.offsetWidth;
  tip.style.opacity = '1';
  tip.style.transform = 'translateX(-50%) translateY(0)';
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    tip.style.opacity = '0';
    tip.style.transform = 'translateX(-50%) translateY(-8px)';
    setTimeout(() => { tip.style.display = 'none'; }, 260);
  }, 1800);
}


/* ============ 存储用量估算 ============ */
function fmtBytes(b) {
  if (!b) return '0 B';
  if (b < 1024) return b + ' B';
  if (b < 1024 * 1024) return (b / 1024).toFixed(1) + ' KB';
  return (b / 1024 / 1024).toFixed(2) + ' MB';
}

async function estimateIndexedDBSize() {
  try {
    // 用缓存值 + 新增题目的估算，避免每次全量序列化
    const base = _cachedStorage.idbSize || 0;
    if (!base) {
      const json = JSON.stringify(questions) + JSON.stringify(settings || {});
      return new Blob([json]).size;
    }
    return base;
  } catch { return 0; }
}

async function estimateCacheSize() {
  if (!('caches' in window)) return 0;
  try {
    const names = await caches.keys();
    let total = 0;
    for (const name of names) {
      const cache = await caches.open(name);
      const keys = await cache.keys();
      for (const req of keys) {
        const res = await cache.match(req);
        if (res) {
          try {
            const blob = await res.clone().blob();
            total += blob.size;
          } catch { /* 忽略无法读取的响应 */ }
        }
      }
    }
    return total;
  } catch { return 0; }
}

/* ============ 清理 OCR 缓存（不动错题库） ============ */
async function clearOcrCache() {
  if (!('caches' in window)) {
    showToast('当前环境不支持缓存清理');
    return;
  }
  try {
    const names = await caches.keys();
    if (!names.length) {
      showToast('没有可清理的缓存');
      return;
    }
    await Promise.all(names.map(n => caches.delete(n)));
    showToast(`已清理 ${names.length} 个 OCR 缓存`);
    updateStatusChip();
    renderView();
  } catch (e) {
    alert('清理失败：' + e.message);
  }
}

let _cachedStorage = { idbSize: 0, cacheSize: 0, ts: 0 };

async function updateStatusChip() {
  const chip = document.getElementById('statusChip');
  const foot = document.getElementById('footerNote');
  if (!chip) return;

  if (!useIDB) {
    chip.className = 'status-chip gray';
    chip.innerHTML = '<span class="dot"></span><span>localStorage 模式</span>';
    return;
  }

  chip.className = 'status-chip';

  // 5 分钟内的缓存直接复用，不重新计算（避免闪烁）
  const cacheFresh = _cachedStorage.ts && (Date.now() - _cachedStorage.ts < 5 * 60 * 1000);
  if (!cacheFresh) {
    // 首次或缓存过期 → 先显示占位，避免闪成"计算中"
    if (!_cachedStorage.ts) {
      chip.innerHTML = `<span class="dot"></span><span>IDB ${questions.length}题</span>`;
    }
    try {
      const [idbSize, cacheSize] = await Promise.all([
        estimateIndexedDBSize(),
        estimateCacheSize()
      ]);
      _cachedStorage = { idbSize, cacheSize, ts: Date.now() };
    } catch {}
  }

  const { idbSize, cacheSize } = _cachedStorage;
  chip.innerHTML = `
    <span class="dot"></span>
    <span>IDB ${questions.length}题 · ${fmtBytes(idbSize)}</span>
    <span style="opacity:.4;margin:0 3px">|</span>
    <span>Cache ${fmtBytes(cacheSize)}</span>
  `;

  if (foot) foot.textContent = `错题库保存在本机 IndexedDB · 定期导出备份`;
}

/* 强制刷新存储缓存（数据变化时调用） */
function invalidateStorageCache() {
  _cachedStorage.ts = 0;
}

/* ============ 全局粘贴 ============ */
document.addEventListener('paste', e => {
  if (state.mode !== 'collect') return;
  const items = e.clipboardData && e.clipboardData.items;
  if (!items) return;
  const files = [];
  for (const item of items) {
    if (item.kind === 'file' && item.type.startsWith('image/')) {
      const f = item.getAsFile();
      if (f) files.push(f);
    }
  }
  if (!files.length) return;
  e.preventDefault();

  const s2 = state.collect;
  state.collect.editedOcrText = '';

  Promise.all(files.map(async f => {
    const dataUrl = await new Promise(res => {
      const r = new FileReader();
      r.onload = ev => res(ev.target.result || '');
      r.onerror = () => res('');
      r.readAsDataURL(f);
    });
    let imageId = '';
    if (useIDB && dataUrl) {
      try {
        const thumbBlob = await generateThumbnail(f);
        imageId = await idbPutImage(f, thumbBlob);
      } catch (err) { console.warn('图片存储失败：', err); }
    }
    return { id: uid(), file: f, dataUrl, imageId, ocrText: '', status: 'pending', error: '' };
  })).then(items2 => {
    for (const it of items2) {
      s2.images.push(it);
      appendImageThumb(it);
    }
    updateImagesCountLabel();
    updateCollectFooter();
    setTimeout(() => processAllImages(), 30);
  });
});

/* ============ 全局快捷键 ============ */
document.addEventListener('keydown', e => {
  const isMac = navigator.platform.toUpperCase().includes('MAC');
  const mod = isMac ? e.metaKey : e.ctrlKey;

  /* F1-F4 切换主界面（F5 不劫持，留给浏览器刷新） */
  if (['F1','F2','F3','F4'].includes(e.key)) {
    e.preventDefault();
    const map = { 'F1': 'collect', 'F2': 'exam', 'F3': 'browse', 'F4': 'notes' };
    const target = map[e.key];
    state.mode = target;
    state.prevMode = target;
    saveCurrentMode();
    renderView();
    return;
  }

  /* Ctrl/Cmd + K：打开搜索框（错题查看页） */
  if (mod && e.key.toLowerCase() === 'k') {
    e.preventDefault();
    // 如果当前在详情页或编辑页，先退回列表
    if (state.mode === 'browse' && (state.browse.selectedId || state.browse.editing)) {
      state.browse.selectedId = null;
      state.browse.detail = null;
      state.browse.editing = false;
      state.browse.editDraft = null;
    }
    if (state.mode !== 'browse') {
      state.mode = 'browse';
      state.prevMode = 'browse';
    }
    renderView();
    setTimeout(() => {
      const inp = document.getElementById('browse-search');
      if (inp) { inp.focus(); inp.select(); }
      else { showToast('当前没有搜索框'); }
    }, 50);
    return;
  }

  /* Ctrl/Cmd + S：立即同步到 Gist */
  if (mod && e.key.toLowerCase() === 's') {
    e.preventDefault();
    if (!getGistId() || !getGistToken()) {
      showToast('未配置云同步');
      return;
    }
    syncNow();
    return;
  }

  /* Ctrl/Cmd + E：导出备份 */
  if (mod && e.key.toLowerCase() === 'e') {
    e.preventDefault();
    exportBackup();
    return;
  }

  /* ESC：原有逻辑 */
  if (e.key === 'Escape') {
    if (state.mode === 'browse' && state.browse.selectedId) {
      state.browse.pendingScrollRestore = state.browse.listScrollY || 0;
      state.browse.selectedId = null;
      state.browse.detail = null;
      renderView();
      persistBrowseState();
      return;
    }
    if (state.mode === 'settings') { goBack(); return; }
  }

  /* 其他快捷键（考试、Enter 等）保持原有代码 */
  const tag = (e.target.tagName || '').toLowerCase();
  const isEditing = tag === 'input' || tag === 'textarea' || tag === 'select';
  if (isEditing) return;

  // 考试模式
  if (state.mode === 'exam') {
    const ex = state.exam;
    if (ex.stage === 'running') {
      const q = ex.quiz[ex.current];
      if (!q) return;
      if (!q.answered && ['1','2','3','4'].includes(e.key)) {
        selectExamOption(parseInt(e.key) - 1);
      } else if (q.answered && (e.key === 'Enter' || e.key === ' ')) {
        e.preventDefault();
        if (ex.current === ex.quiz.length - 1) finishExam();
        else { ex.current++; renderView(); }
      }
    }
  }
});