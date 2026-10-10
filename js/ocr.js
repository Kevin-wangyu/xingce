/* OCR 带圈数字统一转换为 (1)(2)(3) 形式，便于 AI 理解语句排序题 */
function normalizeCircledNumbers(text) {
  const map = {
    '①':'1','②':'2','③':'3','④':'4','⑤':'5','⑥':'6','⑦':'7','⑧':'8','⑨':'9','⑩':'10',
    '⑪':'11','⑫':'12','⑬':'13','⑭':'14','⑮':'15','⑯':'16','⑰':'17','⑱':'18','⑲':'19','⑳':'20'
  };
  return String(text || '').replace(/[①-⑳]/g, ch => `(${map[ch]})`);
}

/* 清理 OCR 在汉字/标点之间插入的碎片空格（Tesseract 中文常见问题） */
function cleanOCRSpace(text) {
  let s = String(text || '');
  let prev = '';
  let iter = 0;
  while (prev !== s && iter < 6) {
    prev = s;
    s = s
      .replace(/([\u4e00-\u9fa5])[ \t]+(?=[\u4e00-\u9fa5])/g, '$1')
      .replace(/([\u4e00-\u9fa5])[ \t]+(?=[，。；：！？、""''（）《》【】—…])/g, '$1')
      .replace(/([，。；：！？、""''（）《》【】—…])[ \t]+(?=[\u4e00-\u9fa5])/g, '$1')
      .replace(/([①-⑳])[ \t]+(?=[\u4e00-\u9fa5①-⑳])/g, '$1')
      .replace(/([\u4e00-\u9fa5])[ \t]+(?=[①-⑳])/g, '$1')
      .replace(/([A-Za-z])[ \t]+(?=[\.、。）])/g, '$1')
      .replace(/([\.、）])[ \t]+(?=[①-⑳(（A-Za-z0-9\u4e00-\u9fa5])/g, '$1');
    iter++;
  }
  return s;
}


/* ============ AI 结构化（支持多题） ============ */
async function aiStructure(ocrText) {
  const apiKey = getApiKey();
  if (!apiKey) throw new Error('请先到设置页配置 API Key');

  const categoryBlock = Object.entries(CATEGORIES)
    .map(([m, types]) => `${m}: ${types.join('、')}`).join('\n');

  const sys = `你是行测题目结构化助手。用户会给你一段试卷 OCR 文字，可能包含 **1 道题，也可能包含多道题**，也可能夹杂题号、页眉页脚噪音。

分类体系（module 与 type 必须严格从下表选择）：
${categoryBlock}

返回严格的 JSON：
{
  "questions": [
    {
      "stem": "完整题干；逻辑填空的空缺处用 ____ 表示；语句排序题保留句子序号 (1)(2)(3) 格式",
      "options": ["A选项内容","B选项内容","C选项内容","D选项内容"],
      "correctIdx": 0,
      "answerConfidence": "explicit",
      "module": "言语理解|数量关系|判断推理|资料分析|常识判断|政治理论 之一",
      "type": "该模块下的题型",
      "knowledgePoints": ["知识点1","知识点2"],
      "originalExplanation": "解析，没有就留空字符串",
      "source": "来源，没有就留空字符串"
    }
  ]
}

关键规则：
0. **题干清理**：题干开头的题号（如"12." "15、" "115．" "二、" "第3题："）必须去掉，stem 以正文开始。
   注意区分：语句排序题的 (1)(2)(3) 是**内容编号**不能删；题号是"(12)"或"12."且后面紧跟题目正文。
1. **多段内容**：OCR 文本可能来自多张图片，用"【第N段】"分隔。
   - 如果多段内容**属于同一道题**（如第1段是材料，第2段是题目），请把它们**合并成一道题的完整题干**：材料放前面，问题放后面，中间用换行。
   - 如果多段内容**包含多道题**（如资料分析一拖五：一段材料 + 5 个小题），请为每道小题输出一个对象，**每道题的 stem 都包含前面的材料 + 该小题的题干**。虽然题干看起来长，但这样每道题都是自包含的。
   - 判断依据：如果后面的段落有明确的"根据上述材料，回答以下问题"或题号（1、2、3…），说明是一拖多；否则可能是同一道题的不同部分。
2. **语句排序题**（言语理解-语句排序）：题干会包含 (1)(2)(3)(4)(5)(6) 形式排列的句子，选项形如 A. (1)(2)(3)(4) 这样的排列组合。**必须完整保留句子序号和选项排列**，不要漏掉任何数字。
3. **逻辑填空**：题干横线用 ____ 表示，选项通常是 2-4 字的词语或成语。
4. options 必须 4 个，不带 "A." "B." 前缀。
5. **correctIdx 判断**：
   - **优先**：OCR 文本里明确出现"答案""正确答案""应选"等字样且后跟字母/项时，据此填写，answerConfidence 填 "explicit"。
     例如"答案为 B"→correctIdx=1，answerConfidence="explicit"。
   - **其次**：没有明确答案时，**必须根据语义、逻辑、常识推断最可能的正确答案**，填 correctIdx，answerConfidence 填 "inferred"。
     推断时优先使用：题目类型规律、常见错误选项特征、选项间逻辑关系、学科常识。
   - **最后**：只有在完全无法判断（如选项缺失、OCR 严重乱码）时，才填 -1。
   - 返回字段新增："answerConfidence": "explicit" | "inferred" | "unknown"。
   - 如果 user prompt 或题干里写了"正确答案是X"，视为 explicit。
6. knowledgePoints：2-4 个，具体可复用（如"转折关系""搭桥""主题词识别""排列组合"），不要填模块名或题型名。
7. 只返回 JSON，不要 markdown 代码块，不要解释性文字。
8. 如果 OCR 文本完全不像题目（乱码、纯噪音），返回 {"error":"原因"}。`;

  const res = await fetch('https://api.deepseek.com/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: 'deepseek-chat',
      messages: [
        { role: 'system', content: sys },
        { role: 'user', content: ocrText }
      ],
      response_format: { type: 'json_object' },
      temperature: 0.2
    })
  });
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error(`API 失败 (${res.status})：${t.slice(0, 120)}`);
  }
  const data = await res.json();
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error('AI 返回为空');
  const parsed = JSON.parse(content);
  if (parsed.error) throw new Error(parsed.error);

  // 兼容三种返回格式
  let list = [];
  if (Array.isArray(parsed.questions)) list = parsed.questions;
  else if (Array.isArray(parsed)) list = parsed;
  else if (parsed.stem) list = [parsed];   // 单题回退

  const normalized = list.map(q => normalizeParsedQuestion(q)).filter(Boolean);
  if (!normalized.length) throw new Error('未识别到有效题目');
  return normalized;
}

function normalizeParsedQuestion(q) {
  if (!q || !q.stem) return null;
  const opts = Array.isArray(q.options) ? q.options.map(s => stripOptionPrefix(s)) : [];
  while (opts.length < 4) opts.push('');
  return {
    stem: stripStemPrefix(q.stem),
    options: opts.slice(0, 4),
    correctIdx: Number.isInteger(q.correctIdx) ? q.correctIdx : -1,
    answerConfidence: ['explicit','inferred','unknown'].includes(q.answerConfidence)
      ? q.answerConfidence
      : (Number.isInteger(q.correctIdx) && q.correctIdx >= 0 ? 'inferred' : 'unknown'),
    module: MODULES.includes(q.module) ? q.module : MODULES[0],
    type: String(q.type || '').trim(),
    knowledgePoints: (Array.isArray(q.knowledgePoints) ? q.knowledgePoints : [])
      .map(s => String(s).trim()).filter(Boolean).slice(0, 6),
    originalExplanation: String(q.originalExplanation || '').trim(),
    source: String(q.source || '').trim()
  };
}


/* ============ OCR ============ */
/* ============ OCR 引擎管理 ============ */
let _paddleFailed = false;
let _paddleOcr = null;
let _paddleOcrPromise = null;

function canUsePaddle() {
  return location.protocol === 'http:' || location.protocol === 'https:';
}

async function initPaddleOCR() {
  if (_paddleOcr) return _paddleOcr;
  if (_paddleFailed) throw new Error('PaddleOCR 已失败');
  if (_paddleOcrPromise) return _paddleOcrPromise;
  if (!canUsePaddle()) {
    _paddleFailed = true;
    throw new Error('需要 HTTP(S) 环境');
  }
  _paddleOcrPromise = (async () => {
    try {
      const mod = await import('https://cdn.jsdelivr.net/npm/@paddleocr/paddleocr-js@0.4.2/+esm');
      const ocr = await mod.PaddleOCR.create({
        lang: 'ch',
        ocrVersion: 'PP-OCRv5',
        ortOptions: { backend: 'wasm' }
      });
      _paddleOcr = ocr;
      return ocr;
    } catch (e) {
      _paddleFailed = true;
      throw e;
    } finally {
      _paddleOcrPromise = null;
    }
  })();
  return _paddleOcrPromise;
}

async function ocrWithPaddle(file) {
  const ocr = await initPaddleOCR();
  const [result] = await ocr.predict(file);
  return (result?.items || []).map(it => it.text).join('\n');
}


/* ============ 多图 OCR ============ */
s.editedOcrText = '';   // 新一批识别开始，清空旧编辑
async function processAllImages() {
  const s = state.collect;
  if (s._ocrRunning) return;
  s._ocrRunning = true;
  s.busy = true;
  updateCollectFooter();
  await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));

  try {
    let i = 0;
    while (i < s.images.length) {
      const img = s.images[i];
      if (img.status === 'done' || img.status === 'error') { i++; continue; }

      img.status = 'ocr';
      updateImageStatusDOM(img);
      updateOcrProgressText();

      await processOneImage(img, i);

      if (img.status === 'ocr') img.status = 'done';
      updateImageStatusDOM(img);
      updateOcrProgressText();

      i++;
    }
  } finally {
    s._ocrRunning = false;
    s.busy = false;
  }

  // 全部识别完：清 parsedList，整页渲染以显示 ② 卡片
  // 但要先记下用户当前 scrollY，避免跳动
  const scrollY = window.scrollY || document.documentElement.scrollTop || 0;
  s.parsedList = [];
  renderView();
  // 等两帧后恢复滚动位置
  requestAnimationFrame(() => requestAnimationFrame(() => {
    window.scrollTo({ top: scrollY, behavior: 'instant' });
    document.documentElement.scrollTop = scrollY;
    document.body.scrollTop = scrollY;
  }));
}
/* 更新底部按钮区的显示/隐藏（不整页渲染） */
function updateCollectFooter() {
  const s = state.collect;
  const footer = document.getElementById('collectFooter');
  if (!footer) return;
  const hasDone = s.images.some(img => img.status === 'done');
  footer.style.display = (!s.busy && hasDone) ? 'flex' : 'none';
  // 更新按钮文案（图片数量变化时）
  const aiBtn = document.getElementById('aiBtn');
  if (aiBtn) {
    aiBtn.innerHTML = `🤖 AI 结构化并归类${s.images.length > 1 ? `（共 ${s.images.length} 张图）` : ''}`;
  }
}

/* 更新图片计数标签 */
function updateImagesCountLabel() {
  const el = document.getElementById('imagesCountLabel');
  if (!el) return;
  const n = state.collect.images.length;
  el.textContent = n
    ? `已添加 ${n} 张 · 识别顺序即拼接顺序`
    : '图片显示区';
  const section = document.getElementById('imagesSection');
  if (section) section.style.display = 'flex';
}

/* 往缩略图容器里追加一张图（不整页渲染） */
function appendImageThumb(img) {
  const list = document.getElementById('imagesList');
  if (!list) return;
  const idx = state.collect.images.indexOf(img);
  const div = document.createElement('div');
  div.dataset.imgId = img.id;
  div.style.cssText = 'position:relative;width:130px;border-radius:8px;overflow:hidden;border:1px solid var(--border);background:var(--bg)';
  div.innerHTML = `
    <img src="${img.dataUrl}" style="width:100%;height:90px;object-fit:cover;display:block">
    <div style="padding:6px 8px;font-size:11px;color:var(--text-2);display:flex;align-items:center;justify-content:space-between;gap:4px">
      <span>#${idx + 1}</span>
      <span class="img-status" style="font-weight:700;color:var(--text-3)">待识别</span>
    </div>
    <button data-del-img="${img.id}" title="删除这张图"
      style="position:absolute;top:4px;right:4px;width:22px;height:22px;border-radius:50%;
             border:none;background:rgba(220,38,38,0.9);color:#fff;cursor:pointer;
             font-weight:800;font-size:14px;line-height:1;display:flex;align-items:center;justify-content:center;padding:0">×</button>
  `;
  list.appendChild(div);
  div.querySelector('[data-del-img]').addEventListener('click', (e) => {
    e.stopPropagation();
    state.collect.images = state.collect.images.filter(x => x.id !== img.id);
    div.remove();
    updateImagesCountLabel();
    updateCollectFooter();
  });
}
/* 只更新单张缩略图的识别状态，不整页重渲染 */
function updateImageStatusDOM(img) {
  const el = document.querySelector(`[data-img-id="${img.id}"] .img-status`);
  if (!el) return;
  const map = {
    done: { text: '✓ 已识别', color: 'var(--success)' },
    error: { text: '✗ 失败', color: 'var(--danger)' },
    ocr: { text: '识别中…', color: 'var(--primary)' },
    pending: { text: '待识别', color: 'var(--text-3)' }
  };
  const cfg = map[img.status] || map.pending;
  el.textContent = cfg.text;
  el.style.color = cfg.color;
}

/* 更新顶部"识别中 X/Y"提示 */
function updateOcrProgressText() {
  const s = state.collect;
  const statusEl = document.getElementById('ocrStatus');
  if (!statusEl) return;
  const done = s.images.filter(i => i.status === 'done').length;
  const total = s.images.length;
  if (s.busy) {
    statusEl.innerHTML = `<span class="spinner"></span>识别中… ${done}/${total}`;
  } else if (done === total && total > 0) {
    statusEl.innerHTML = `✅ 全部识别完成（${total} 张）`;
  } else {
    statusEl.innerHTML = '';
  }
}

async function processOneImage(img, idx) {
  const total = state.collect.images.length;
  const prefix = total > 1 ? `第 ${idx + 1}/${total} 张 · ` : '';

  /* 首选 PaddleOCR */
  if (canUsePaddle() && !_paddleFailed) {
    try {
      const t0 = performance.now();
      img.ocrText = await ocrWithPaddle(img.file);
      img.status = 'done';
      console.log(`[OCR] 第${idx+1}张 PaddleOCR 完成，耗时 ${((performance.now() - t0) / 1000).toFixed(1)}s`);
      return;
    } catch (e) {
      console.warn(`[OCR] 第${idx+1}张 PaddleOCR 失败，降级 Tesseract`, e);
    }
  }

  /* 降级 Tesseract */
  try {
    const { data: { text } } = await Tesseract.recognize(img.file, 'chi_sim');
    img.ocrText = text || '';
    img.status = 'done';
  } catch (e) {
    img.status = 'error';
    img.error = e.message;
  }
}

/* 合并所有图的 OCR 文本，交给 AI */
function mergedOcrText() {
  return state.collect.images
    .filter(img => img.status === 'done' && img.ocrText)
    .map((img, i) => {
      const txt = img.ocrText.trim();
      return state.collect.images.length > 1 ? `【第${i + 1}段】\n${txt}` : txt;
    })
    .join('\n\n');
}
/* 检测 OCR 结果是否可疑 */
function detectBadOCR(text) {
  const reasons = [];
  const t = String(text || '');
  const hanCount = (t.match(/[\u4e00-\u9fa5]/g) || []).length;

  if (hanCount < 10) reasons.push('汉字数过少');
  if (/@/.test(t)) reasons.push('出现 @ 符号');
  if (/[^\u4e00-\u9fa5\s，。；：！？、""''（）《》【】—…A-Za-z0-9\.\(\)]O{1,}/.test(t) && /\sO\s|^O|O$|@O|O@/.test(t)) {
    reasons.push('出现疑似带圈数字误识别的 O');
  }
  if (/GOG|OOG|⑧|⊚|⊛|δ/.test(t)) reasons.push('出现符号乱码');
  // 汉字之间大量碎片空格（未清理前 > 汉字数 30% 的空白数）
  //const spaceCount = (t.match(/[ \t]/g) || []).length;
  //if (hanCount > 20 && spaceCount / hanCount > 0.7) reasons.push('碎片空格过多');

  return { bad: reasons.length > 0, reasons };
}

/* 保存后清理：删除本次上传但未被任何题目引用的图片 */
async function cleanupUnusedImages(toSaveList) {
  const usedIds = new Set();
  toSaveList.forEach(q => (q.imageIds || []).forEach(id => usedIds.add(id)));
  for (const img of state.collect.images) {
    if (img.imageId && !usedIds.has(img.imageId)) {
      // 检查其他题目是否引用（防止删到已存在题目的图）
      if (!isImageReferenced(img.imageId, null)) {
        try { await tryDeleteImage(img.imageId, null); } catch (e) {}
      }
    }
  }
}

/* 在重新渲染前，把所有卡片的当前编辑值同步回 parsedList */
function syncAllParsedCardsToState() {
  const s = state.collect;
  const cards = document.querySelectorAll('.parsed-card');
  cards.forEach(card => {
    const qi = parseInt(card.dataset.qi);
    const p = s.parsedList[qi];
    if (!p) return;
    const stemEl = card.querySelector('[data-field="stem"]');
    if (stemEl) p.stem = stemEl.value;
    [0,1,2,3].forEach(i => {
      const el = card.querySelector(`[data-field="opt-${i}"]`);
      if (el) p.options[i] = el.value;
    });
    const corr = card.querySelector('[data-field="correct"]');
    if (corr) p.correctIdx = parseInt(corr.value);
    const mod = card.querySelector('[data-field="module"]');
    if (mod) p.module = mod.value;
    const typ = card.querySelector('[data-field="type"]');
    if (typ) p.type = typ.value;
    const src = card.querySelector('[data-field="source"]');
    if (src) p.source = src.value;
    const expl = card.querySelector('[data-field="expl"]');
    if (expl) p.originalExplanation = expl.value;
    // 知识点从 DOM 重建
    const tags = [...card.querySelectorAll('.kp-wrap .kp-tag')];
    p.kpDraft = tags.map(t => (t.childNodes[0]?.textContent || '').trim());
  });
}

function bindCollectEvents() {
  const s = state.collect;
  const view = document.getElementById('view');

  const goto = document.getElementById('gotoSettingsBtn');
  if (goto) goto.addEventListener('click', () => openSettings());

  const drop = document.getElementById('dropZone');
  const fileInput = document.getElementById('ocrFile');

  const handleFiles = async (files) => {
    const s2 = state.collect;
    const arr = Array.from(files).filter(f => f && f.type.startsWith('image/'));
    if (!arr.length) return;

    state.collect.editedOcrText = '';

    const items = await Promise.all(arr.map(async f => {
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
        } catch (e) { console.warn('图片存储失败：', e); }
      }
      return { id: uid(), file: f, dataUrl, imageId, ocrText: '', status: 'pending', error: '' };
    }));

    for (const it of items) {
      s2.images.push(it);
      appendImageThumb(it);
    }
    updateImagesCountLabel();
    updateCollectFooter();
    setTimeout(() => processAllImages(), 30);
  };


  if (drop && fileInput) {
    drop.addEventListener('click', () => fileInput.click());
    drop.addEventListener('dragover', e => { e.preventDefault(); drop.classList.add('dragover'); });
    drop.addEventListener('dragleave', () => drop.classList.remove('dragover'));
    drop.addEventListener('drop', e => {
      e.preventDefault(); drop.classList.remove('dragover');
      handleFiles(e.dataTransfer.files);
    });
    fileInput.addEventListener('change', e => {
      handleFiles(e.target.files);
      fileInput.value = '';
    });
  }


  // 删除图片
  view.querySelectorAll('[data-del-img]').forEach(b => {
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      const s2 = state.collect;
      s2.images = s2.images.filter(x => x.id !== b.dataset.delImg);
      s2.parsedList = [];
      renderView();
    });
  });

  const srcInput = document.getElementById('collect-source-input');
  if (srcInput) {
    srcInput.addEventListener('input', e => {
      state.collect.sourceInput = e.target.value;
    });
  }

  // AI 结构化
  const aiBtn = document.getElementById('aiBtn');
  if (aiBtn) aiBtn.addEventListener('click', async () => {
    const st = document.getElementById('aiStatus');
    const raw = (document.getElementById('ocrTextarea')?.value || '').trim() || mergedOcrText();
    if (!raw) { st.className = 'status-line err'; st.textContent = 'OCR 文本为空'; return; }
    if (!getApiKey()) { st.className = 'status-line err'; st.textContent = '请先到设置页配置 API Key'; return; }
    aiBtn.disabled = true;
    st.className = 'status-line info';
    st.innerHTML = '<span class="spinner"></span>AI 正在结构化…';
    try {
      const list = await aiStructure(raw);
      const src = (state.collect.sourceInput || '').trim();
      s.parsedList = list.map(q => ({
        ...q,
        source: src,
        kpDraft: q.knowledgePoints.slice(),
        stars: q.stars || 0
      }));
      s.editedOcrText = raw;   // 保留用户编辑后的内容
      renderView();
    } catch (e) {
      st.className = 'status-line err';
      st.textContent = '❌ ' + e.message;
      aiBtn.disabled = false;
    }
  });


  // 清空
  const clearBtn = document.getElementById('clearBtn');
  if (clearBtn) clearBtn.addEventListener('click', () => {
    state.collect.images = [];
    state.collect.parsedList = [];
    state.collect.editedOcrText = '';
    renderView();
  });

  // OCR 文本编辑时同步到内存（不直接用）
  const ta = document.getElementById('ocrTextarea');
  if (ta) {
    ta.addEventListener('input', () => {
      state.collect.editedOcrText = ta.value;
    });
  }
  if (ta) ta.dataset.edited = '0';

  const moduleSel = document.getElementById('f-module');
  const typeSel = document.getElementById('f-type');
  if (moduleSel && typeSel) {
    moduleSel.addEventListener('change', () => {
      const types = CATEGORIES[moduleSel.value] || [];
      typeSel.innerHTML = types.map(t => `<option value="${esc(t)}">${esc(t)}</option>`).join('');
    });
  }

  const kpInput = document.getElementById('kpInput');
  if (kpInput) {
    kpInput.addEventListener('keydown', e => {
      if (e.key === 'Enter') {
        e.preventDefault();
        const v = kpInput.value.trim();
        if (!v) return;
        if (s.kpDraft.includes(v)) { kpInput.value = ''; return; }
        s.kpDraft.push(v);
        kpInput.value = '';
        const wrap = document.getElementById('kpWrap');
        const newTag = document.createElement('span');
        newTag.className = 'kp-tag';
        newTag.innerHTML = `${esc(v)}<button title="删除">×</button>`;
        wrap.insertBefore(newTag, kpInput);
        newTag.querySelector('button').addEventListener('click', () => {
          newTag.remove();
          const tags = [...kpWrap.querySelectorAll('.kp-tag')];
          p.kpDraft = tags.map(t => (t.childNodes[0]?.textContent || '').trim());
        });
      }
    });
  }
  view.querySelectorAll('[data-kp-del]').forEach(b => {
    b.addEventListener('click', () => {
      const i = parseInt(b.dataset.kpDel);
      s.kpDraft.splice(i, 1);
      renderView();
    });
  });

  /* ---- 每张卡片的模块联动、知识点编辑、删除 ---- */
  view.querySelectorAll('.parsed-card').forEach(card => {
    const qi = parseInt(card.dataset.qi);
    const p = s.parsedList[qi];
    if (!p) return;

    // 模块 → 题型联动
    const moduleSel = card.querySelector('[data-field="module"]');
    const typeSel = card.querySelector('[data-field="type"]');
    if (moduleSel && typeSel) {
      moduleSel.addEventListener('change', () => {
        const types = CATEGORIES[moduleSel.value] || [];
        typeSel.innerHTML = types.map(t => `<option value="${esc(t)}">${esc(t)}</option>`).join('');
      });
    }

    // 知识点输入框回车
    const kpInput = card.querySelector('[data-field="kp-input"]');
    const kpWrap = card.querySelector('[data-kp-wrap]');
    if (kpInput && kpWrap) {
      kpInput.addEventListener('keydown', e => {
        if (e.key !== 'Enter') return;
        e.preventDefault();
        const v = kpInput.value.trim();
        if (!v) return;
        if (p.kpDraft.includes(v)) { kpInput.value = ''; return; }
        p.kpDraft.push(v);
        kpInput.value = '';
        const newTag = document.createElement('span');
        newTag.className = 'kp-tag';
        newTag.innerHTML = `${esc(v)}<button title="删除">×</button>`;
        kpWrap.insertBefore(newTag, kpInput);
        newTag.querySelector('button').addEventListener('click', () => {
          p.kpDraft = p.kpDraft.filter(x => x !== v);
          newTag.remove();
        });
      });
    }

    // 已存在的知识点删除（纯 DOM 操作，不 renderView）
    card.querySelectorAll('[data-kp-del]').forEach(b => {
      b.addEventListener('click', e => {
        e.preventDefault();
        const tagEl = b.closest('.kp-tag');
        if (tagEl) tagEl.remove();
        // 从 DOM 重建 kpDraft
        const tags = [...card.querySelectorAll('.kp-wrap .kp-tag')];
        p.kpDraft = tags.map(t => {
          // 取第一个文本节点（不含 × 按钮）
          const txt = t.childNodes[0]?.textContent || '';
          return txt.trim();
        });
      });
    });

    // 删除这道题
    const delBtn = card.querySelector('[data-del-qi]');
    if (delBtn) {
      delBtn.addEventListener('click', e => {
        e.preventDefault();
        if (!confirm(`删除第 ${qi + 1} 题？`)) return;
        syncAllParsedCardsToState();   // ← 先同步
        s.parsedList.splice(qi, 1);
        renderView();
      });
    }
    // 绑定星级
    const starTarget = card.querySelector(`[data-star-target="${qi}"]`);
    if (starTarget) {
      bindStarPickers(starTarget, (v) => {
        p.stars = v;
      });
    }

    // 绑定图片选择
    card.querySelectorAll('[data-img-pick]').forEach(el => {
      el.addEventListener('click', () => {
        const imgId = el.dataset.imgId;
        if (!Array.isArray(p.selectedImageIds)) p.selectedImageIds = [];
        const i = p.selectedImageIds.indexOf(imgId);
        if (i >= 0) p.selectedImageIds.splice(i, 1);
        else p.selectedImageIds.push(imgId);
        // 更新当前这张卡片的视觉
        const nowSel = p.selectedImageIds.includes(imgId);
        el.style.borderColor = nowSel ? 'var(--primary)' : 'var(--border)';
        const checkEl = el.querySelector('div > span:last-child');
        if (checkEl) {
          checkEl.textContent = nowSel ? '✓' : '';
          checkEl.style.color = nowSel ? 'var(--primary)' : 'var(--text-3)';
        }
      });
    });

    // 全选 / 全不选
    const selAllBtn = card.querySelector('[data-img-select-all]');
    if (selAllBtn) selAllBtn.addEventListener('click', () => {
      p.selectedImageIds = state.collect.images.filter(img => img.imageId).map(img => img.imageId);
      renderView();
    });
    const selNoneBtn = card.querySelector('[data-img-select-none]');
    if (selNoneBtn) selNoneBtn.addEventListener('click', () => {
      p.selectedImageIds = [];
      renderView();
    });
  });

  /* ---- 全部取消 ---- */
  const cancelAllBtn = document.getElementById('cancelAllBtn');
  if (cancelAllBtn) cancelAllBtn.addEventListener('click', () => {
    if (!confirm('放弃本次识别结果？')) return;
    s.parsedList = [];
    renderView();
  });

  /* ---- 全部保存 ---- */
  const saveAllBtn = document.getElementById('saveAllBtn');
  if (saveAllBtn) saveAllBtn.addEventListener('click', async () => {
    const cards = view.querySelectorAll('.parsed-card');
    if (!cards.length) return;

    const toSave = [];
    const errors = [];

    cards.forEach(card => {
      const qi = parseInt(card.dataset.qi);
      const p = s.parsedList[qi];
      if (!p) return;

      const stem = stripStemPrefix(card.querySelector('[data-field="stem"]').value);
      const options = [0,1,2,3].map(i => stripOptionPrefix(card.querySelector(`[data-field="opt-${i}"]`).value.trim()));
      const correctIdx = parseInt(card.querySelector('[data-field="correct"]').value);
      const module = card.querySelector('[data-field="module"]').value;
      const type = card.querySelector('[data-field="type"]').value;
      const explanation = card.querySelector('[data-field="expl"]').value.trim();
      const source = card.querySelector('[data-field="source"]').value.trim();

      if (!stem) { errors.push(`第 ${qi + 1} 题：题干为空`); return; }
      if (options.some(o => !o)) { errors.push(`第 ${qi + 1} 题：选项不完整`); return; }
      if (correctIdx < 0 || correctIdx > 3) { errors.push(`第 ${qi + 1} 题：未选正确答案`); return; }
      if (!p.kpDraft.length) { errors.push(`第 ${qi + 1} 题：未填知识点`); return; }

      // 读取"保存图片"复选框状态
      // 使用用户在图片选择器里选中的图片
      const imageIds = Array.isArray(p.selectedImageIds) ? p.selectedImageIds.slice() : [];

      toSave.push({
        id: uid(),
        stem, options, correctIdx,
        module, type,
        knowledgePoints: p.kpDraft.slice(),
        originalExplanation: explanation,
        aiEasyMistake: '', aiBetterSolution: '',
        source,
        stars: p.stars || 0,
        imageIds,
        wrongCount: 1, rightCount: 0,
        attemptHistory: [],
        personalNote: '',
        personalNoteUpdatedAt: 0,
        createdAt: Date.now()
      });
    });

    if (errors.length) {
      if (!confirm('以下题目存在问题：\n\n' + errors.join('\n') + '\n\n是否保存其他 ' + toSave.length + ' 道通过校验的题目？')) return;
    }
    if (!toSave.length) { alert('没有可保存的题目'); return; }

    // ---- 检测重复 ----
    const dups = [];
    const uniqueNew = [];
    toSave.forEach(q => {
      const existing = findDuplicate(q);
      if (existing) dups.push({ newQ: q, existing });
      else uniqueNew.push(q);
    });

    const finalize = (savedCount, skippedCount, overwrittenCount) => {
      s.images = [];
      s.parsedList = [];
      s.busy = false;
      renderView();
      let tip = `已保存 ${savedCount} 题`;
      if (overwrittenCount) tip += ` · 覆盖 ${overwrittenCount} 题`;
      if (skippedCount) tip += ` · 跳过 ${skippedCount} 题`;
      showToast(tip);
    };

    // 保存题目
    if (!dups.length) {
      toSave.forEach(q => saveQuestion(q));
      await cleanupUnusedImages(toSave);
      finalize(toSave.length, 0, 0);
      return;
    }

    showDupModal(dups, uniqueNew, async (action) => {
      if (action === 'skip') {
        uniqueNew.forEach(q => saveQuestion(q));
        await cleanupUnusedImages(uniqueNew);
        finalize(uniqueNew.length, dups.length, 0);
      } else if (action === 'overwrite') {
        uniqueNew.forEach(q => saveQuestion(q));
        dups.forEach(d => overwriteQuestion(d.existing.id, d.newQ));
        await cleanupUnusedImages(toSave);
        finalize(uniqueNew.length, 0, dups.length);
      } else if (action === 'append') {
        toSave.forEach(q => saveQuestion(q));
        await cleanupUnusedImages(toSave);
        finalize(toSave.length, 0, 0);
      }
    });
  });

    // 最近收录：点击跳到错题查看详情
  view.querySelectorAll('[data-open-recent]').forEach(el => {
    el.addEventListener('click', () => {
      const id = el.dataset.openRecent;
      const q = questions.find(x => x.id === id);
      if (!q) return;

      // 切换到错题查看 Tab
      state.mode = 'browse';
      state.prevMode = 'browse';

      // 用这道题所在模块的筛选条件，让上/下题切换连贯
      state.browse.filter = { module: q.module, type: 'all', source: 'all', knowledgePoints: [] };
      state.browse.listIds = questions
        .filter(x => x.module === q.module)
        .sort((a, b) => (b.wrongCount || 0) - (a.wrongCount || 0) || (b.createdAt || 0) - (a.createdAt || 0))
        .map(x => x.id);
      state.browse.selectedId = id;
      state.browse.detail = { question: q, similar: [] };
      state.browse.generating = { analysis: false, similar: false };
      state.browse.editing = false;
      state.browse.editDraft = null;
      state.browse.listScrollY = 0;
      state.browse.pendingScrollRestore = null;

      renderView();
      window.scrollTo({ top: 0, behavior: 'instant' });
      document.documentElement.scrollTop = 0;
      document.body.scrollTop = 0;
    });
  });
}
