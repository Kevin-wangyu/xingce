

function toggleTheme() {
  const next = getTheme() === 'dark' ? 'light' : 'dark';
  localStorage.setItem(K_THEME, next);
  applyTheme(next);
}

/* 计算本次考试的理想用时（秒） */
function calcIdealTime(quizList) {
  return quizList.reduce((sum, q) => sum + (MODULE_TIME_PER_Q[q.module] || 60), 0);
}


function getChatRoles() {
  try {
    const me = JSON.parse(localStorage.getItem(K_CHAT_ME) || 'null');
    const ai = JSON.parse(localStorage.getItem(K_CHAT_AI) || 'null');
    return {
      me: { ...DEFAULT_CHAT_ROLES.me, ...(me || {}) },
      ai: { ...DEFAULT_CHAT_ROLES.ai, ...(ai || {}) }
    };
  } catch {
    return { ...DEFAULT_CHAT_ROLES };
  }
}

function setChatRoles(me, ai) {
  if (me) localStorage.setItem(K_CHAT_ME, JSON.stringify(me));
  if (ai) localStorage.setItem(K_CHAT_AI, JSON.stringify(ai));
}

/* 渲染单个头像：支持 emoji 或 base64 图片 */
function renderAvatarHTML(avatar) {
  if (!avatar) return '';
  if (avatar.startsWith('data:image/')) {
    return `<img src="${avatar}" alt="">`;
  }
  return avatar;
}


/* ============ 星级 ============ */
function renderStars(stars, opts = {}) {
  const size = opts.size || 16;
  const interactive = opts.interactive !== false;
  const cls = interactive ? 'star-picker interactive' : 'star-picker';
  const v = Math.max(0, Math.min(5, parseInt(stars) || 0));
  let html = `<div class="${cls}" data-value="${v}">`;
  for (let i = 1; i <= 5; i++) {
    html += `<span class="star${i <= v ? ' on' : ''}" data-star-idx="${i}" style="font-size:${size}px">★</span>`;
  }
  html += '</div>';
  return html;
}


/* ============ 视图：错题收录 ============ */
function renderCollect(view) {
  const s = state.collect;
  const hasKey = !!getApiKey();

  let html = '';

    if (location.protocol === 'file:') {
    html += `
      <div class="card" style="border-color:var(--warn);background:linear-gradient(180deg,var(--warn-soft),transparent)">
        <div style="display:flex;align-items:center;gap:14px;flex-wrap:wrap">
          <div style="font-size:22px">⚠️</div>
          <div style="flex:1;min-width:240px">
            <div style="font-size:14px;font-weight:700;color:var(--text);margin-bottom:3px">建议改用启动脚本打开</div>
            <div style="font-size:13px;color:var(--text-2);line-height:1.6">
              当前是 file:// 协议，PaddleOCR 无法使用（带圈数字 ①②③④ 会识别失败）。请关闭此页面，双击同目录的 <b>启动.bat</b>（Windows）或 <b>启动.command</b>（Mac）。
            </div>
          </div>
        </div>
      </div>
    `;
  }

  if (!hasKey) {
    html += `
      <div class="card" style="border-color: var(--warn); background: linear-gradient(180deg, var(--warn-soft), transparent)">
        <div style="display:flex;align-items:center;gap:14px;flex-wrap:wrap">
          <div style="font-size:22px">⚠️</div>
          <div style="flex:1;min-width:220px">
            <div style="font-size:14px;font-weight:700;color:var(--text);margin-bottom:3px">尚未配置 AI</div>
            <div style="font-size:13px;color:var(--text-2);line-height:1.6">前往设置页填写 DeepSeek API Key，即可启用 AI 自动归类。</div>
          </div>
          <button class="btn primary" id="gotoSettingsBtn">去设置</button>
        </div>
      </div>
    `;
  }

  html += `
    <div class="card">
      <div class="card-head" style="align-items:flex-start">
        <div style="flex:1;min-width:0;padding-right:16px">
          <div class="card-title">① 上传题目截图</div>
          <div class="card-sub">支持多张（材料 + 小题）· 粘贴 / 拖拽 / 点击选择</div>
        </div>
        <div style="flex:0 0 33%;min-width:200px;max-width:320px">
          <label style="margin:0 0 4px">题目来源（可选）</label>
          <input id="collect-source-input" class="input" style="padding:6px 10px;font-size:13px" placeholder="如：2023国考第32题" value="${esc(s.sourceInput || '')}">
        </div>
      </div>

      <div style="display:flex;gap:16px;align-items:stretch;flex-wrap:wrap">
        <!-- 左：上传区（固定窄） -->
        <div class="drop-zone" id="dropZone"
          style="flex:0 0 220px;min-width:180px;padding:20px 14px;display:flex;flex-direction:column;justify-content:center;align-items:center;text-align:center">
          <div class="big" style="font-size:26px;margin-bottom:6px">🖼️</div>
          <div class="t" style="font-size:13px">点击 / 拖拽图片</div>
          <div class="d" style="font-size:11px;margin-top:4px;line-height:1.5">
            或按 <kbd>Ctrl</kbd>+<kbd>V</kbd> 粘贴
          </div>
        </div>

        <!-- 右：缩略图列表（自动换行） -->
        <div style="flex:1;min-width:280px;display:flex;flex-direction:column">
          <div id="imagesSection" style="flex:1;display:flex;flex-direction:column;justify-content:center;min-height:120px;padding:10px;border:1px dashed var(--border-strong);border-radius:10px;background:var(--bg)">
            <div id="imagesCountLabel" style="font-size:11.5px;font-weight:700;color:var(--text-3);letter-spacing:0.3px;margin-bottom:8px">
              ${s.images.length ? `已添加 ${s.images.length} 张 · 识别顺序即拼接顺序` : '右侧显示已添加的图片'}
            </div>
            <div id="imagesList" style="display:flex;flex-wrap:wrap;gap:8px;align-content:flex-start">
              ${s.images.map((img, i) => `
                <div data-img-id="${img.id}" style="position:relative;width:104px;border-radius:8px;overflow:hidden;border:1px solid var(--border);background:var(--card)">
                  <img src="${img.dataUrl}" style="width:100%;height:72px;object-fit:cover;display:block">
                  <div style="padding:5px 7px;font-size:10.5px;color:var(--text-2);display:flex;align-items:center;justify-content:space-between;gap:4px">
                    <span>#${i + 1}</span>
                    <span class="img-status" style="font-weight:700;color:${
                      img.status === 'done' ? 'var(--success)'
                      : img.status === 'error' ? 'var(--danger)'
                      : img.status === 'ocr' ? 'var(--primary)'
                      : 'var(--text-3)'
                    }">${
                      img.status === 'done' ? '✓'
                      : img.status === 'error' ? '✗'
                      : img.status === 'ocr' ? '…'
                      : '待'
                    }</span>
                  </div>
                  <button data-del-img="${img.id}" title="删除"
                    style="position:absolute;top:3px;right:3px;width:20px;height:20px;border-radius:50%;
                           border:none;background:rgba(220,38,38,0.9);color:#fff;cursor:pointer;
                           font-weight:800;font-size:12px;line-height:1;display:flex;align-items:center;justify-content:center;padding:0">×</button>
                </div>
              `).join('')}
            </div>
          </div>
        </div>
      </div>

      <input type="file" id="ocrFile" accept="image/*" multiple hidden>

      <div style="display:flex;justify-content:space-between;align-items:flex-end;gap:14px;margin-top:14px;flex-wrap:wrap">
        <div style="flex:1;min-width:220px">
          <div class="status-line" id="ocrStatus"></div>
          <div id="ocrEngineLabel" style="font-size:11px;color:var(--text-3);margin-top:6px;line-height:1.6">
            ${canUsePaddle()
              ? '🟢 主引擎 PaddleOCR（已就绪）· 识别失败时自动降级 Tesseract'
              : '⚠️ 当前是 file:// 协议，仅使用 Tesseract。请改用同目录的启动脚本打开。'}
          </div>
        </div>
        <div id="collectFooter" style="display:none;flex-shrink:0;margin:0;flex-direction:column;align-items:flex-end">
          <span class="status-line" id="aiStatus" style="margin-bottom:8px;min-height:18px;text-align:right"></span>
          <div style="display:flex;gap:8px">
            <button class="btn primary" id="aiBtn" ${!hasKey ? 'disabled title="请先到设置页配置 API Key"' : ''}>
              🤖 AI 结构化并归类
            </button>
            <button class="btn ghost" id="clearBtn">清空重来</button>
          </div>
        </div>
      </div>
    </div>
  `;
  const textForTextarea = s.editedOcrText || mergedOcrText();
  if (textForTextarea) {
    html += `
      <div class="card">
        <div class="card-head">
          <div>
            <div class="card-title">② 核对 OCR 文本</div>
            <div class="card-sub">${s.images.length > 1 ? `已合并 ${s.images.filter(i => i.status === 'done').length} 张图的内容 · ` : ''}发现识别错误可直接修改，改完再让 AI 结构化</div>
          </div>
        </div>
        <textarea id="ocrTextarea" class="input" rows="10" placeholder="OCR 原文...">${esc(textForTextarea)}</textarea>
        <div style="font-size:12px;color:var(--text-3);margin-top:8px;line-height:1.7;padding:10px 12px;background:var(--bg);border-radius:8px;border:1px solid var(--border)">
          💡 <b>常见 OCR 错误</b>：带圈数字 ①②③④ 常被识别为 <code style="background:var(--surface-2);padding:1px 5px;border-radius:3px;font-family:ui-monospace,monospace">@ O @@ GOG@</code>。
          AI 会尝试根据上下文还原；如果错误太多，可手动改成 <code style="background:var(--surface-2);padding:1px 5px;border-radius:3px;font-family:ui-monospace,monospace">(1) (2) (3) (4)</code> 形式，AI 更容易理解。
        </div>
      </div>
    `;
  }

  if (s.parsedList.length) {
    html += `
      <div class="card">
        <div class="card-head">
          <div>
            <div class="card-title">③ 确认并保存</div>
            <div class="card-sub">共识别到 <b>${s.parsedList.length}</b> 道题，核对后保存；可单独编辑或删除</div>
          </div>
          <span class="tag primary">${s.parsedList.length} 题</span>
        </div>

        ${s.parsedList.map((p, qi) => renderParsedCard(p, qi)).join('')}

        <div class="actions" style="margin-top:20px;justify-content:flex-start">
          <button class="btn primary" id="saveAllBtn">全部保存（${s.parsedList.length} 题）</button>
          <button class="btn ghost" id="cancelAllBtn">全部取消</button>
        </div>
      </div>
    `;
  }

  const recent = questions.slice().sort((a,b) => (b.createdAt||0) - (a.createdAt||0)).slice(0, 10);
  if (recent.length) {
    html += `
      <div class="card">
        <div class="card-head">
          <div>
            <div class="card-title">最近收录</div>
          </div>
        </div>
        ${recent.map(q => `
          <div class="recent-item" data-open-recent="${q.id}" style="cursor:pointer" title="点击查看详情">
            <div class="recent-body">
              <div class="recent-stem">${renderStem(q.stem)}</div>
              <div class="recent-meta">
                <span class="tag primary">${esc(q.module)}</span>
                <span class="tag gray">${esc(q.type)}</span>
                ${(q.knowledgePoints||[]).slice(0,3).map(k => `<span class="tag gray">${esc(k)}</span>`).join('')}
                <span style="color:var(--text-3);font-size:11px;margin-left:auto">${timeAgo(q.createdAt)}</span>
              </div>
            </div>
          </div>
        `).join('')}
      </div>
    `;
  }

  view.innerHTML = html;
  // 恢复图片区和底部按钮的显示状态
  updateImagesCountLabel();
  updateCollectFooter();
  updateOcrProgressText();
  bindCollectEvents();
}

function renderParsedCard(p, qi) {
  const typeOptions = CATEGORIES[p.module] || [];
  const knownType = typeOptions.includes(p.type) ? p.type : typeOptions[0];
  const answerLetter = p.correctIdx >= 0 ? String.fromCharCode(65 + p.correctIdx) : '';
  let answerTag;
  if (p.correctIdx < 0) {
    answerTag = `<span class="tag warn" style="animation:pulse 2s infinite">⚠️ 请手动选答案</span>`;
  } else if (p.answerConfidence === 'explicit') {
    answerTag = `<span class="tag success" title="OCR 中有明确答案标记">答案 ${answerLetter}</span>`;
  } else {
    answerTag = `<span class="tag" style="background:var(--warn-soft);color:var(--warn)" title="AI 根据语义推断，请核对">🤖 推断答案 ${answerLetter}</span>`;
  }

  return `
    <details ${qi === 0 ? 'open' : ''} class="parsed-card" data-qi="${qi}" style="margin-top:12px;border:1px solid var(--border);border-radius:10px;overflow:hidden">
      <summary style="padding:13px 16px;cursor:pointer;font-size:13px;font-weight:600;display:flex;align-items:center;gap:10px;background:var(--bg);list-style:none">
        <span class="tag primary" style="flex-shrink:0">第 ${qi + 1} 题</span>
        <span style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--text-2)">${esc((p.stem || '').slice(0, 50))}${(p.stem || '').length > 50 ? '…' : ''}</span>
        ${answerTag}
        <span style="color:var(--text-3);font-size:11px;flex-shrink:0">${esc(p.module)} · ${esc(p.type || '未定')}</span>
      </summary>
      <div style="padding:14px 18px 18px">
        <label>题干 <span class="req">*</span></label>
        <textarea data-field="stem" class="input" rows="3">${esc(p.stem)}</textarea>

        <div class="row4" style="margin-top:6px">
          ${['A','B','C','D'].map((L,i)=>`
            <div>
              <label>选项 ${L}</label>
              <input data-field="opt-${i}" class="input" value="${esc(p.options[i] || '')}">
            </div>
          `).join('')}
        </div>

        <div class="row2">
          <div>
            <label>正确答案 <span class="req">*</span></label>
            <select data-field="correct" class="input">
              <option value="-1" ${p.correctIdx === -1 ? 'selected' : ''}>— 请选择 —</option>
              ${['A','B','C','D'].map((L,i)=>`<option value="${i}" ${p.correctIdx === i ? 'selected' : ''}>选项 ${L}</option>`).join('')}
            </select>
          </div>
          <div>
            <label>模块 <span class="req">*</span></label>
            <select data-field="module" class="input">
              ${MODULES.map(m => `<option value="${esc(m)}" ${m === p.module ? 'selected' : ''}>${esc(m)}</option>`).join('')}
            </select>
          </div>
        </div>

        <div class="row2">
          <div>
            <label>题型 <span class="req">*</span></label>
            <select data-field="type" class="input">
              ${typeOptions.map(t => `<option value="${esc(t)}" ${t === knownType ? 'selected' : ''}>${esc(t)}</option>`).join('')}
            </select>
          </div>
          <div>
            <label>来源（可选）</label>
            <input data-field="source" class="input" value="${esc(p.source)}" placeholder="如：2023国考第32题">
          </div>
        </div>

        <div style="display:flex;gap:14px;align-items:flex-start;margin-top:14px;flex-wrap:wrap">
          <div style="flex:1;min-width:240px">
            <label style="margin-top:0">考察知识点 <span class="req">*</span></label>
            <div class="kp-wrap" data-kp-wrap>
              ${p.kpDraft.map((kp, i) => `
                <span class="kp-tag">${esc(kp)}<button data-kp-del="${i}" title="删除">×</button></span>
              `).join('')}
              <input data-field="kp-input" class="kp-input" placeholder="输入后回车添加" autocomplete="off">
            </div>
          </div>
          <div style="flex-shrink:0;padding-top:2px">
            <label style="margin-top:0">重要性</label>
            <div style="padding:8px 4px 0">
              <div data-star-target="${qi}">${renderStars(p.stars || 0, { size: 20, interactive: true })}</div>
            </div>
          </div>
        </div>

        <label>原解析（可选）</label>
        <textarea data-field="expl" class="input" rows="2" placeholder="AI 未识别到则留空">${esc(p.originalExplanation)}</textarea>

        ${(() => {
          const imgCount = state.collect.images.filter(img => img.imageId).length;
          const isGraphic = (p.module === '判断推理' && p.type === '图形推理') || p.module === '资料分析';
          const disabled = imgCount === 0;
          // 初始化 selectedImageIds（如果还没初始化过）
          if (!Array.isArray(p.selectedImageIds)) {
            p.selectedImageIds = isGraphic
              ? state.collect.images.filter(img => img.imageId).map(img => img.imageId)
              : [];
          }
          const selectedSet = new Set(p.selectedImageIds);
          return `
            <div style="margin-top:16px;padding:12px 16px;background:var(--bg);border-radius:10px;border:1px solid var(--border)">
              <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-bottom:10px">
                <div style="font-size:13px;font-weight:600;color:${disabled ? 'var(--text-3)' : 'var(--text)'}">
                  🖼️ 保存哪些图片
                  <span style="font-size:11px;color:var(--text-3);font-weight:400;margin-left:6px">
                    ${disabled ? '（本次未上传图片）' :
                      isGraphic ? '（已自动全选，可手动取消）' :
                      '（默认不选，点缩略图选中）'}
                  </span>
                </div>
                ${!disabled ? `
                  <div style="display:flex;gap:6px;flex-shrink:0">
                    <button type="button" class="btn ghost sm" data-img-select-all="${qi}">全选</button>
                    <button type="button" class="btn ghost sm" data-img-select-none="${qi}">全不选</button>
                  </div>
                ` : ''}
              </div>
              ${disabled ? '' : `
                <div style="display:flex;flex-wrap:wrap;gap:8px">
                  ${state.collect.images.filter(img => img.imageId).map((img, idx) => {
                    const sel = selectedSet.has(img.imageId);
                    return `
                      <div class="img-select-card ${sel ? 'selected' : ''}" data-img-pick="${qi}" data-img-id="${img.imageId}"
                        style="position:relative;width:100px;border-radius:8px;overflow:hidden;cursor:pointer;
                               border:2px solid ${sel ? 'var(--primary)' : 'var(--border)'};
                               transition:all .15s;background:var(--card)">
                        <img src="${img.dataUrl}" style="width:100%;height:70px;object-fit:cover;display:block">
                        <div style="padding:4px 6px;font-size:10.5px;color:var(--text-2);display:flex;align-items:center;justify-content:space-between">
                          <span>#${idx + 1}</span>
                          <span style="color:${sel ? 'var(--primary)' : 'var(--text-3)'};font-weight:700">${sel ? '✓' : ''}</span>
                        </div>
                      </div>
                    `;
                  }).join('')}
                </div>
              `}
            </div>
          `;
        })()}

        <div class="actions" style="margin-top:14px">
          <button class="btn danger sm" data-del-qi="${qi}">删除这道题</button>
        </div>
      </div>
    </details>
  `;
}


/* ============ 视图：设置 ============ */
function renderSettings(view) {
  const hasKey = !!getApiKey();

  let html = `
    <div class="settings-header">
      <button class="btn ghost sm" id="backBtn" title="返回">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="15 18 9 12 15 6"/>
        </svg>
        返回
      </button>
    </div>
    <div style="margin-top:14px">
      <div class="settings-title">设置</div>
      <div class="settings-sub">配置 AI、数据与账号</div>
    </div>

    <div class="card">
      <div class="card-head">
        <div>
          <div class="card-title">AI 设置</div>
          <div class="card-sub">用于 OCR 文本的自动结构化、归类与分析</div>
        </div>
        <span class="tag ${hasKey ? 'success' : 'warn'}">${hasKey ? '已配置' : '未配置'}</span>
      </div>

      <label style="margin-top:0">DeepSeek API Key</label>
      <input id="apiKeyInput" class="input" type="password" placeholder="sk-..." value="${esc(getApiKey())}">
      <div style="font-size:12px;color:var(--text-3);margin-top:8px;line-height:1.6">
        前往 <a href="https://platform.deepseek.com/api_keys" target="_blank" style="color:var(--primary)">platform.deepseek.com</a> 获取。Key 只保存在本机浏览器，不会上传到任何第三方。约 1 元可用很久。
      </div>

      <div class="actions">
        <button class="btn primary" id="saveKeyBtn">保存</button>
        ${hasKey ? '<button class="btn ghost" id="clearKeyBtn">清除</button>' : ''}
      </div>
    </div>

    <div class="card">
      <div class="card-head">
        <div>
          <div class="card-title">对话角色</div>
          <div class="card-sub">自定义"追问 AI"里的头像和名字</div>
        </div>
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:24px" class="role-grid">
        <div>
          <label style="margin-top:0">我的名字</label>
          <input id="role-me-name" class="input" value="${esc(getChatRoles().me.name)}" maxlength="12" placeholder="如：小明">

          <label>我的头像</label>
          <div style="display:flex;align-items:center;gap:12px">
            <div class="avatar-preview" id="role-me-preview">${renderAvatarHTML(getChatRoles().me.avatar)}</div>
            <div style="flex:1;min-width:0">
              <div class="avatar-picker" id="role-me-picker">
                ${['👤','🙂','😎','🦊','🐱','🐼','🐧','🌱','🎓','📚','🚀','⭐'].map(e => `
                  <button type="button" class="avatar-option ${getChatRoles().me.avatar === e ? 'selected' : ''}" data-role="me" data-emoji="${e}">${e}</button>
                `).join('')}
              </div>
              <div style="margin-top:10px;display:flex;gap:8px;flex-wrap:wrap">
                <button class="btn sm" id="role-me-upload">上传图片</button>
                ${getChatRoles().me.avatar && getChatRoles().me.avatar.startsWith('data:') ? `<button class="btn sm ghost" id="role-me-reset">恢复默认</button>` : ''}
                <input type="file" id="role-me-file" accept="image/*" hidden>
              </div>
            </div>
          </div>
        </div>

        <div>
          <label style="margin-top:0">AI 的名字</label>
          <input id="role-ai-name" class="input" value="${esc(getChatRoles().ai.name)}" maxlength="12" placeholder="如：助教">

          <label>AI 头像</label>
          <div style="display:flex;align-items:center;gap:12px">
            <div class="avatar-preview" id="role-ai-preview">${renderAvatarHTML(getChatRoles().ai.avatar)}</div>
            <div style="flex:1;min-width:0">
              <div class="avatar-picker" id="role-ai-picker">
                ${['🤖','🧠','🎓','📚','💡','🦉','🐙','✨','🌟','🧭','⚡','🎯'].map(e => `
                  <button type="button" class="avatar-option ${getChatRoles().ai.avatar === e ? 'selected' : ''}" data-role="ai" data-emoji="${e}">${e}</button>
                `).join('')}
              </div>
              <div style="margin-top:10px;display:flex;gap:8px;flex-wrap:wrap">
                <button class="btn sm" id="role-ai-upload">上传图片</button>
                ${getChatRoles().ai.avatar && getChatRoles().ai.avatar.startsWith('data:') ? `<button class="btn sm ghost" id="role-ai-reset">恢复默认</button>` : ''}
                <input type="file" id="role-ai-file" accept="image/*" hidden>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div class="actions">
        <button class="btn primary" id="role-save">保存</button>
      </div>
    </div>

    <div class="card">
      <div class="card-head">
        <div>
          <div class="card-title">数据管理</div>
          <div class="card-sub">当前有 ${questions.length} 道错题</div>
        </div>
      </div>
      <div class="setting-row">
        <div class="setting-row-main">
          <div class="setting-row-title">导出备份</div>
          <div class="setting-row-desc">将错题库导出为 JSON 文件，建议定期备份</div>
        </div>
        <button class="btn sm" id="exportBtn">导出</button>
      </div>
      <div class="setting-row">
        <div class="setting-row-main">
          <div class="setting-row-title">导入数据</div>
          <div class="setting-row-desc">从 JSON 文件恢复错题库（合并，不覆盖）</div>
        </div>
        <button class="btn sm" id="importBtn">导入</button>
        <input type="file" id="importFile" accept=".json" hidden>
      </div>
      <div class="setting-row">
        <div class="setting-row-main">
          <div class="setting-row-title">重置作答统计</div>
          <div class="setting-row-desc">把所有题目的错误次数置为 1、正确次数置 0、清空作答历史。题目内容不受影响</div>
        </div>
        <button class="btn sm" id="resetStatsBtn">重置</button>
      </div>
      <div class="setting-row">
        <div class="setting-row-main">
          <div class="setting-row-title">为旧图生成缩略图</div>
          <div class="setting-row-desc">为已上传但缺少缩略图的图片生成缩略图，便于同步到手机端查看</div>
        </div>
        <button class="btn sm" id="genThumbsBtn">生成</button>
      </div>
      <div class="setting-row">
        <div class="setting-row-main">
          <div class="setting-row-title">清理 OCR 缓存</div>
          <div class="setting-row-desc">释放 PaddleOCR 模型占用的空间（约 30MB）。不影响错题库，下次识别会自动重新下载</div>
        </div>
        <button class="btn sm" id="clearCacheBtn">清理</button>
      </div>
      <div class="setting-row">
        <div class="setting-row-main">
          <div class="setting-row-title">清空所有数据</div>
          <div class="setting-row-desc">删除全部错题与设置，不可恢复</div>
        </div>
        <button class="btn sm danger" id="resetBtn">清空</button>
      </div>



    </div>

    <div class="card">
      <div class="card-head">
        <div>
          <div class="card-title">账号</div>
          <div class="card-sub">跨设备同步</div>
        </div>
            <div class="card">
              <div class="card-head">
                <div>
                  <div class="card-title">云同步</div>
                  <div class="card-sub">通过 GitHub Gist 在多设备间同步错题库</div>
                </div>
                <span class="tag ${getGistId() && getGistToken() ? 'success' : 'gray'}">
                  ${getGistId() && getGistToken() ? '已配置' : '未配置'}
                </span>
              </div>

              <label style="margin-top:0">Gist ID</label>
              <input id="gist-id" class="input" placeholder="如 a1b2c3d4e5f6..." value="${esc(getGistId())}">

              <label>Personal Access Token</label>
              <input id="gist-token" class="input" type="password" placeholder="ghp_..." value="${esc(getGistToken())}">
              <div style="font-size:12px;color:var(--text-3);margin-top:8px;line-height:1.6">
                前往 <a href="https://github.com/settings/tokens" target="_blank" style="color:var(--primary)">github.com/settings/tokens</a> 生成 classic token，只需勾选 <code style="background:var(--surface-2);padding:1px 5px;border-radius:3px;font-family:ui-monospace,monospace">gist</code> 权限。
                Gist 建议创建 secret 类型。Token 只保存在本机浏览器。
              </div>

              <div class="actions">
                <button class="btn primary" id="gist-save">保存配置</button>
                ${getGistId() && getGistToken() ? `
                  <button class="btn" id="gist-sync-now">立即同步</button>
                  <button class="btn ghost" id="gist-clear">清除配置</button>
                ` : ''}
              </div>
              ${lastSyncedAt ? `<div style="font-size:12px;color:var(--text-3);margin-top:12px;display:flex;align-items:center;gap:6px">
                <span style="width:6px;height:6px;border-radius:50%;background:var(--success)"></span>
                上次同步：${new Date(lastSyncedAt).toLocaleString('zh-CN')}
              </div>` : ''}
            </div>
      </div>
      <p style="font-size:13px;color:var(--text-3);line-height:1.7">
        登录账号后，可将错题库云端备份，在手机、平板、电脑之间同步。开发中，敬请期待。
      </p>
    </div>

    <div class="card">
      <div class="card-head">
        <div>
          <div class="card-title">关于</div>
          <div class="card-sub">快捷键 · 使用小贴士</div>
        </div>
      </div>
      <div class="about-text">
        <p>行测错题本是一个纯浏览器端应用，所有数据保存在本机 <code>IndexedDB</code>，设置Gist可即时同步和备份数据。</p>
        <div class="about-features">
          <div class="about-feature">
            <b>📸 截图收录</b>
            切到错题收录页，直接 <code>Ctrl/Cmd + V</code> 粘贴截图
          </div>
          <div class="about-feature">
            <b>⌨️ 考试快捷键</b>
            <code>1-4</code> 选项 · <code>Enter</code> 下一题
          </div>
          <div class="about-feature">
            <b>🔀 快速切换</b>
            <code>F1</code>-<code>F4</code> 切换收录/考试/查看/分析
          </div>
          <div class="about-feature">
            <b>🔍 打开搜索</b>
            <code>Ctrl/Cmd + K</code> 跳到错题查看并聚焦搜索
          </div>
          <div class="about-feature">
            <b>☁️ 立即同步</b>
            <code>Ctrl/Cmd + S</code> 同步到 Gist
          </div>
          <div class="about-feature">
            <b>💾 导出备份</b>
            <code>Ctrl/Cmd + E</code> 下载 JSON
          </div>
          <div class="about-feature">
            <b>↩️ 快速返回</b>
            <code>Esc</code> 从详情页/设置页返回
          </div>
          <div class="about-feature">
            <b>💾 备份建议</b>
            每月导出一次 JSON，防止浏览器清缓存丢数据
          </div>
        </div>
      </div>
    </div>
  `;

  view.innerHTML = html;

  /* ---- 事件绑定（全部防御式） ---- */

  const elBack = view.querySelector('#backBtn');
  if (elBack) elBack.addEventListener('click', goBack);

  const elSaveKey = view.querySelector('#saveKeyBtn');
  const elApiKey = view.querySelector('#apiKeyInput');
  if (elSaveKey && elApiKey) {
    elSaveKey.addEventListener('click', () => {
      const v = elApiKey.value.trim();
      setApiKey(v);
      showToast(v ? '已保存' : '已清除');
      renderView();
    });
  }

  const clrKey = view.querySelector('#clearKeyBtn');
  if (clrKey) clrKey.addEventListener('click', () => {
    if (!confirm('清除 API Key？')) return;
    setApiKey('');
    showToast('已清除');
    renderView();
  });

  const elExport = view.querySelector('#exportBtn');
  if (elExport) elExport.addEventListener('click', exportBackup);

  const elClearCache = view.querySelector('#clearCacheBtn');
  if (elClearCache) elClearCache.addEventListener('click', async () => {
    if (!confirm('清理 OCR 缓存？\n\n错题库不受影响。下次识别时会重新下载模型（约需 15 秒）。')) return;
    await clearOcrCache();
  });
  
  const elGenThumbs = view.querySelector('#genThumbsBtn');
  if (elGenThumbs) elGenThumbs.addEventListener('click', async () => {
    if (!useIDB) { alert('当前是 localStorage 模式，无图片数据'); return; }
    if (!confirm('为所有旧图片生成缩略图？\n\n过程中页面可能短暂卡顿，完成后自动同步到云端。')) return;

    // 弹出进度模态框
    const overlay = document.createElement('div');
    overlay.className = 'dup-overlay';
    overlay.innerHTML = `
      <div class="dup-modal" style="max-width:420px">
        <div class="dup-head">
          <div class="dup-title">📐 正在生成缩略图</div>
          <div class="dup-sub" id="thumbProgressText">准备中…</div>
        </div>
        <div style="padding:0 22px 22px">
          <div class="progress-bar" style="height:8px">
            <div class="progress-fill" id="thumbProgressBar" style="width:0%"></div>
          </div>
          <div style="margin-top:14px;font-size:12.5px;color:var(--text-3);line-height:1.7" id="thumbStats">
            统计中…
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    const textEl = overlay.querySelector('#thumbProgressText');
    const barEl = overlay.querySelector('#thumbProgressBar');
    const statsEl = overlay.querySelector('#thumbStats');

    try {
      const result = await generateMissingThumbnails((info) => {
        if (info.phase === 'start') {
          if (info.total === 0) {
            textEl.textContent = '没有需要处理的图片';
            statsEl.innerHTML = '所有图片都已有缩略图。';
            barEl.style.width = '100%';
          } else {
            textEl.textContent = `共 ${info.total} 张待处理`;
            barEl.style.width = '0%';
          }
        } else if (info.phase === 'progress') {
          const pct = Math.round((info.done + info.failed) / info.total * 100);
          barEl.style.width = pct + '%';
          textEl.textContent = `处理中… ${info.current} / ${info.total}`;
          statsEl.innerHTML = `✓ 成功 <b>${info.done}</b> · ✗ 失败 <b>${info.failed}</b>`;
        } else if (info.phase === 'done') {
          barEl.style.width = '100%';
          textEl.textContent = '处理完成';
        }
      });

      // 完成后 2 秒关闭
      setTimeout(() => {
        overlay.remove();
        if (result.total === 0) {
          showToast('所有图片都已有缩略图');
        } else {
          showToast(`已生成 ${result.done} 张缩略图${result.failed ? '（' + result.failed + ' 张失败）' : ''}`);
        }
        // 如果有成功的，触发同步
        if (result.done > 0 && getGistId() && getGistToken()) {
          setTimeout(() => {
            pushToGist().catch(() => {});
          }, 500);
        }
      }, 1500);
    } catch (e) {
      overlay.remove();
      alert('生成失败：' + e.message);
    }
  });

  const importFile = view.querySelector('#importFile');
  const elImport = view.querySelector('#importBtn');
  if (importFile && elImport) {
    elImport.addEventListener('click', () => importFile.click());
    importFile.addEventListener('change', e => {
      const f = e.target.files[0]; if (!f) return;
      const r = new FileReader();
      r.onload = ev => {
        try {
          const arr = JSON.parse(ev.target.result);
          if (!Array.isArray(arr)) throw new Error('格式错误');
          const existing = new Set(questions.map(q => q.id));
          let added = 0;
          arr.forEach(q => {
            if (!q || !q.stem || !Array.isArray(q.options)) return;
            if (existing.has(q.id)) return;
            const item = {
              id: q.id || uid(),
              stem: String(q.stem),
              options: q.options.slice(0, 4),
              correctIdx: Number(q.correctIdx) || 0,
              module: String(q.module || '言语理解'),
              type: String(q.type || ''),
              knowledgePoints: Array.isArray(q.knowledgePoints) ? q.knowledgePoints.map(String) : [],
              originalExplanation: String(q.originalExplanation || ''),
              aiEasyMistake: String(q.aiEasyMistake || ''),
              aiBetterSolution: String(q.aiBetterSolution || ''),
              source: String(q.source || ''),
              wrongCount: Number(q.wrongCount) || 0,
              rightCount: Number(q.rightCount) || 0,
              attemptHistory: Array.isArray(q.attemptHistory) ? q.attemptHistory : [],
              createdAt: Number(q.createdAt) || Date.now()
            };
            saveQuestion(item);
            added++;
          });
          showToast(`导入完成 · 新增 ${added} 题`);
          renderView();
        } catch (err) { alert('导入失败：' + err.message); }
      };
      r.readAsText(f); importFile.value = '';
    });
  }

  const elReset = view.querySelector('#resetBtn');
  if (elReset) elReset.addEventListener('click', async () => {
    if (!questions.length) { alert('当前没有数据'); return; }
    if (!confirm(`确定清空全部 ${questions.length} 道错题？`)) return;
    if (!confirm('再确认一次：此操作不可恢复。')) return;
    await clearAllStores();
    showToast('已清空');
    renderView();
  });

    const gistSave = view.querySelector('#gist-save');
  if (gistSave) gistSave.addEventListener('click', async () => {
    const id = view.querySelector('#gist-id').value.trim();
    const token = view.querySelector('#gist-token').value.trim();
    if (!id || !token) { alert('Gist ID 和 Token 都要填写'); return; }
    setGistConfig(id, token);
    gistSave.disabled = true;
    gistSave.innerHTML = '<span class="spinner"></span> 同步中…';
    await syncNow();
  });

  const gistSync = view.querySelector('#gist-sync-now');
  if (gistSync) gistSync.addEventListener('click', async () => {
    gistSync.disabled = true;
    gistSync.innerHTML = '<span class="spinner"></span> 同步中…';
    await syncNow();
  });

  const gistClear = view.querySelector('#gist-clear');
  if (gistClear) gistClear.addEventListener('click', () => {
    if (!confirm('清除同步配置？本地数据不受影响。')) return;
    localStorage.removeItem(K_GIST_ID);
    localStorage.removeItem(K_GIST_TOKEN);
    renderView();
  });

    /* ============ 对话角色配置 ============ */
  const roleState = {
    me: { ...getChatRoles().me },
    ai: { ...getChatRoles().ai }
  };

  function refreshRolePreview(role) {
    const preview = view.querySelector(`#role-${role}-preview`);
    if (preview) preview.innerHTML = renderAvatarHTML(roleState[role].avatar);
  }
  function refreshRolePicker(role) {
    view.querySelectorAll(`[data-role="${role}"][data-emoji]`).forEach(el => {
      el.classList.toggle('selected', el.dataset.emoji === roleState[role].avatar);
    });
  }

  // emoji 选择
  view.querySelectorAll('[data-role][data-emoji]').forEach(btn => {
    btn.addEventListener('click', () => {
      const role = btn.dataset.role;
      roleState[role].avatar = btn.dataset.emoji;
      refreshRolePreview(role);
      refreshRolePicker(role);
    });
  });

  // 上传图片
  ['me', 'ai'].forEach(role => {
    const upBtn = view.querySelector(`#role-${role}-upload`);
    const fileInput = view.querySelector(`#role-${role}-file`);
    if (upBtn && fileInput) {
      upBtn.addEventListener('click', () => fileInput.click());
      fileInput.addEventListener('change', e => {
        const f = e.target.files[0];
        if (!f) return;
        if (!f.type.startsWith('image/')) { alert('请选择图片'); return; }
        if (f.size > 500 * 1024) { alert('图片不要超过 500KB（否则会占满本地存储）'); return; }
        const reader = new FileReader();
        reader.onload = ev => {
          roleState[role].avatar = ev.target.result;
          refreshRolePreview(role);
          refreshRolePicker(role);
        };
        reader.readAsDataURL(f);
        fileInput.value = '';
      });
    }
    // 恢复默认
    const resetBtn = view.querySelector(`#role-${role}-reset`);
    if (resetBtn) {
      resetBtn.addEventListener('click', () => {
        roleState[role].avatar = DEFAULT_CHAT_ROLES[role].avatar;
        refreshRolePreview(role);
        refreshRolePicker(role);
      });
    }
  });

  // 保存
  const roleSave = view.querySelector('#role-save');
  if (roleSave) roleSave.addEventListener('click', () => {
    const meName = (view.querySelector('#role-me-name').value || '').trim() || '我';
    const aiName = (view.querySelector('#role-ai-name').value || '').trim() || 'AI';
    if (meName.length > 12 || aiName.length > 12) { alert('名字最长 12 个字'); return; }
    setChatRoles(
      { name: meName, avatar: roleState.me.avatar },
      { name: aiName, avatar: roleState.ai.avatar }
    );
    showToast('已保存');
  });

  const elResetStats = view.querySelector('#resetStatsBtn');
  if (elResetStats) elResetStats.addEventListener('click', async () => {
    if (!questions.length) { alert('当前没有题目'); return; }
    if (!confirm(`将重置全部 ${questions.length} 道题的作答统计：\n\n· 错误次数 → 1\n· 正确次数 → 0\n· 清空作答历史\n\n题目内容、AI 分析、对话记录都保留。确定继续？`)) return;
    await resetAllStats();
  });
}

/* ============ 占位视图 ============ */
/* ============ 视图：错题考试 ============ */
function renderExam(view) {
  const e = state.exam;
  if (e.stage === 'idle') renderExamIdle(view);
  else if (e.stage === 'running') renderExamRunning(view);
  else renderExamFinished(view);
}


/* ---- 筛选 ---- */
function filterQuestions(f) {
  return questions.filter(q => {
    if (f.module !== 'all' && q.module !== f.module) return false;
    if (f.type !== 'all' && q.type !== f.type) return false;
    if (f.source && f.source !== 'all' && (q.source || '') !== f.source) return false;
    if (f.knowledgePoints && f.knowledgePoints.length && !(q.knowledgePoints || []).some(k => f.knowledgePoints.includes(k))) return false;
    return true;
  });
}

/* ---- 空闲：筛选页 ---- */
function renderExamIdle(view) {
  const e = state.exam;
  const f = e.filter;
  const available = filterQuestions(f);

  const kpSet = new Set();
  available.forEach(q => (q.knowledgePoints || []).forEach(k => kpSet.add(k)));
  const kpList = [...kpSet].sort();

  const types = f.module === 'all' ? Object.values(CATEGORIES).flat() : (CATEGORIES[f.module] || []);
  const maxCount = available.length;
  const suggested = Math.min(Math.max(1, e.count), Math.max(1, maxCount));

  let html = `
    <div class="card">
      <div class="card-head">
        <div>
          <div class="card-title">错题考试</div>
          <div class="card-sub">筛选范围后随机抽题作答</div>
        </div>
        <span class="tag ${maxCount ? 'primary' : 'gray'}">${maxCount} 题可用</span>
      </div>

      <div class="row2">
        <div>
          <label>模块</label>
          <select id="exam-module" class="input">
            <option value="all" ${f.module === 'all' ? 'selected' : ''}>全部模块</option>
            ${MODULES.map(m => `<option value="${esc(m)}" ${m === f.module ? 'selected' : ''}>${esc(m)}</option>`).join('')}
          </select>
        </div>
        <div>
          <label>题型</label>
          <select id="exam-type" class="input">
            <option value="all" ${f.type === 'all' ? 'selected' : ''}>全部题型</option>
            ${types.map(t => `<option value="${esc(t)}" ${t === f.type ? 'selected' : ''}>${esc(t)}</option>`).join('')}
          </select>
        </div>
      </div>

      <label>知识点（可多选，不选则不限）</label>
      <div class="kp-wrap scrollable" id="exam-kp-wrap" style="min-height:44px">
        ${kpList.length ? kpList.map(k => {
          const sel = f.knowledgePoints.includes(k);
          return `<button class="kp-chip ${sel ? 'on' : ''}" data-kp="${esc(k)}" style="
            padding:5px 12px;border-radius:6px;font-size:12px;font-weight:600;
            border:1px solid ${sel ? 'var(--primary)' : 'var(--border-strong)'};
            background:${sel ? 'var(--primary)' : 'var(--card)'};
            color:${sel ? '#fff' : 'var(--text-2)'};
            cursor:pointer;font-family:inherit;transition:all .15s
          ">${esc(k)}</button>`;
        }).join('') : '<span style="color:var(--text-3);font-size:12px">当前范围内没有知识点</span>'}
      </div>
      <div class="kp-hint">点击切换选中；选多个时，只出包含任一所选知识点的题目。</div>

      <label>抽题数量</label>
      <div style="display:flex;gap:12px;align-items:center;flex-wrap:wrap">
        <input id="exam-count" class="input" type="number" min="1" max="${Math.max(1, maxCount)}" value="${suggested}" style="width:120px">
        <span style="font-size:13px;color:var(--text-3)">最多 ${maxCount} 题</span>
        <div style="margin-left:auto;display:flex;gap:6px">
          ${[5, 10, 20].map(n => `<button class="btn sm ghost exam-count-quick" data-n="${n}">${n} 题</button>`).join('')}
        </div>
      </div>

      <div class="actions">
        <button class="btn primary" id="exam-start" ${maxCount === 0 ? 'disabled' : ''}>
          ${maxCount === 0 ? '没有可用题目' : '开始考试'}
        </button>
      </div>
    </div>
  `;

  if (maxCount === 0) {
    html += `
      <div class="card">
        <div class="empty">
          <div class="empty-icon">📭</div>
          <div class="empty-title">当前筛选下没有题目</div>
          <div class="empty-desc">换一个筛选范围，或先去「错题收录」录入一些题目。</div>
        </div>
      </div>
    `;
  }

  view.innerHTML = html;
  bindExamIdleEvents(view);
}

function bindExamIdleEvents(view) {
  const e = state.exam;
  const f = e.filter;

  view.querySelector('#exam-module').addEventListener('change', ev => {
    f.module = ev.target.value;
    f.type = 'all';
    f.knowledgePoints = [];
    renderView();
  });

  view.querySelector('#exam-type').addEventListener('change', ev => {
    f.type = ev.target.value;
    f.knowledgePoints = [];
    renderView();
  });

  view.querySelectorAll('.kp-chip').forEach(el => {
    el.addEventListener('click', () => {
      const k = el.dataset.kp;
      const idx = f.knowledgePoints.indexOf(k);
      if (idx >= 0) f.knowledgePoints.splice(idx, 1);
      else f.knowledgePoints.push(k);
      renderView();
    });
  });

  view.querySelector('#exam-count').addEventListener('input', ev => {
    e.count = Math.max(1, parseInt(ev.target.value) || 1);
  });

  view.querySelectorAll('.exam-count-quick').forEach(b => {
    b.addEventListener('click', () => {
      e.count = parseInt(b.dataset.n);
      renderView();
    });
  });

  view.querySelector('#exam-start').addEventListener('click', startExam);
}

/* ---- 开始考试 ---- */
function startExam() {
  const e = state.exam;
  const pool = filterQuestions(e.filter);
  if (!pool.length) { alert('没有可用题目'); return; }
  const n = Math.min(e.count || 10, pool.length);
  const shuffled = [...pool].sort(() => Math.random() - 0.5);
  e.quiz = shuffled.slice(0, n).map(q => ({
    id: q.id, stem: q.stem, options: q.options.slice(),
    correctIdx: q.correctIdx, module: q.module, type: q.type,
    knowledgePoints: (q.knowledgePoints || []).slice(),
    originalExplanation: q.originalExplanation || '',
    selected: null, answered: false
  }));
  e.current = 0;
  e.startTime = Date.now();
  e.endTime = 0;
  e.results = [];
  e.stage = 'running';
  renderView();
}

/* ---- 进行中 ---- */
function renderExamRunning(view) {
  const e = state.exam;
  if (!e.quiz[e.current]) { finishExam(); return; }
  const q = e.quiz[e.current];
  const total = e.quiz.length;
  const answered = q.answered;
  const elapsed = Math.floor((Date.now() - e.startTime) / 1000);
  const mm = String(Math.floor(elapsed / 60)).padStart(2, '0');
  const ss = String(elapsed % 60).padStart(2, '0');
  const progress = ((e.current + (answered ? 1 : 0)) / total) * 100;

  let html = `
    <div class="card">
      <div class="card-head" style="margin-bottom:14px">
        <div>
          <div class="card-title">第 ${e.current + 1} / ${total} 题</div>
          <div class="card-sub" id="exam-timer">用时 ${mm}:${ss}</div>
        </div>
        <button class="btn ghost sm" id="exam-exit">退出</button>
      </div>

      <div class="progress-bar" style="margin-bottom:16px">
        <div class="progress-fill" style="width:${progress}%"></div>
      </div>

      <div style="display:flex;gap:6px;margin-bottom:12px;flex-wrap:wrap">
        <span class="tag primary">${esc(q.module)}</span>
        <span class="tag gray">${esc(q.type)}</span>
        ${(q.knowledgePoints||[]).map(k => `<span class="tag gray">${esc(k)}</span>`).join('')}
      </div>

      <div style="font-size:15px;line-height:1.8;color:var(--text);padding:16px;background:var(--bg);border-radius:10px;margin-bottom:18px;white-space:pre-wrap;word-break:break-word">${renderStem(q.stem)}</div>

      <div style="display:flex;flex-direction:column;gap:10px">
        ${q.options.map((opt, i) => {
          let cls = 'exam-opt';
          if (answered) {
            if (i === q.correctIdx) cls += ' correct';
            else if (i === q.selected) cls += ' wrong';
            else cls += ' dim';
          }
          return `<button class="${cls}" data-exam-opt="${i}" ${answered ? 'disabled' : ''}>
            <span class="lbl">${String.fromCharCode(65 + i)}.</span>${esc(opt)}
          </button>`;
        }).join('')}
      </div>
    </div>
  `;

  if (answered) {
    const ok = q.selected === q.correctIdx;
    html += `
      <div class="card">
        <div style="text-align:center;font-size:15px;font-weight:700;color:${ok ? 'var(--success)' : 'var(--danger)'};margin-bottom:12px">
          ${ok ? '✅ 回答正确' : `❌ 答错，正确答案是 ${String.fromCharCode(65 + q.correctIdx)}`}
        </div>
        ${q.originalExplanation ? `<div style="font-size:13px;line-height:1.7;color:var(--text-2);padding:12px 14px;background:var(--warn-soft);border-left:3px solid var(--warn);border-radius:6px">${esc(q.originalExplanation)}</div>` : ''}
        <div class="actions" style="justify-content:center">
          <button class="btn primary" id="exam-next">
            ${e.current === total - 1 ? '交卷' : '下一题 →'}
          </button>
        </div>
      </div>
    `;
  }

  view.innerHTML = html;

  // 计时器
  clearInterval(window._examTimer);
  if (e.stage === 'running') {
    window._examTimer = setInterval(() => {
      const s = Math.floor((Date.now() - e.startTime) / 1000);
      const m = String(Math.floor(s / 60)).padStart(2, '0');
      const ss = String(s % 60).padStart(2, '0');
      const el = document.getElementById('exam-timer');
      if (el) el.textContent = `用时 ${m}:${ss}`;
    }, 1000);
  }

  view.querySelectorAll('[data-exam-opt]').forEach(btn => {
    btn.addEventListener('click', () => selectExamOption(parseInt(btn.dataset.examOpt)));
  });

  view.querySelector('#exam-exit').addEventListener('click', () => {
    if (e.results.length && !confirm('退出后本次作答不保存，确定？')) return;
    clearInterval(window._examTimer);
    e.stage = 'idle';
    e.results = [];
    renderView();
  });

  view.querySelector('#exam-next').addEventListener('click', () => {
    if (e.current === total - 1) finishExam();
    else { e.current++; renderView(); }
  });
}

function selectExamOption(idx) {
  const e = state.exam;
  const q = e.quiz[e.current];
  if (!q || q.answered) return;
  q.selected = idx;
  q.answered = true;
  const isRight = idx === q.correctIdx;

  // 写入全局题目
  const g = questions.find(x => x.id === q.id);
  if (g) {
    if (isRight) g.rightCount = (g.rightCount || 0) + 1;
    else g.wrongCount = (g.wrongCount || 0) + 1;
    const h = g.attemptHistory || [];
    h.unshift({ t: Date.now(), sel: idx, ok: isRight });
    g.attemptHistory = h.slice(0, ATTEMPT_HISTORY_LIMIT);
    saveQuestion(g);
  }

  e.results.push({ qid: q.id, selected: idx, isRight, t: Date.now() });
  renderView();
}

function finishExam() {
  const e = state.exam;
  clearInterval(window._examTimer);
  e.endTime = Date.now();
  e.stage = 'finished';
  renderView();
}

/* ---- 完成页 ---- */
function renderExamFinished(view) {
  const e = state.exam;
  const total = e.results.length;
  const right = e.results.filter(r => r.isRight).length;
  const wrong = total - right;
  const rate = total ? Math.round(right / total * 100) : 0;
  const dur = Math.max(1, Math.floor((e.endTime - e.startTime) / 1000));
  const mm = String(Math.floor(dur / 60)).padStart(2, '0');
  const ss = String(dur % 60).padStart(2, '0');

  /* --- 速度计算 --- */
  const ideal = calcIdealTime(e.quiz);
  const rawRatio = ideal > 0 ? dur / ideal : 1;
  const ratio = Math.max(0.5, Math.min(1.5, rawRatio));
  // 映射到 [0, π]：0=右=最快，π=左=最慢，π/2=正常
  const tAngle = Math.PI * (ratio - 0.5);
  const dotX = 120 + 88 * Math.cos(tAngle);
  const dotY = 120 - 88 * Math.sin(tAngle);

  let speedLabel, speedColor, speedBg;
  if (ratio <= 0.85) {
    speedLabel = '速度很快 · 优于预期';
    speedColor = '#16a34a';
    speedBg = 'rgba(22,163,74,0.12)';
  } else if (ratio <= 1.15) {
    speedLabel = '速度正常';
    speedColor = '#65a30d';
    speedBg = 'rgba(101,163,13,0.12)';
  } else {
    speedLabel = '速度偏慢 · 建议提速';
    speedColor = '#d97706';
    speedBg = 'rgba(217,119,6,0.12)';
  }

  /* --- 对错条 --- */
  const rightPct = total ? (right / total * 100) : 0;
  const wrongPct = total ? (wrong / total * 100) : 0;

  const rateTag = rate >= 80 ? 'success' : rate >= 60 ? 'warn' : 'gray';

  /* --- 错题列表 --- */
  const wrongQs = e.results.filter(r => !r.isRight).map(r => {
    const q = e.quiz.find(x => x.id === r.qid);
    return q ? { ...q, selectedIdx: r.selected } : null;
  }).filter(Boolean);

  let html = `
    <div class="card">
      <div class="card-head">
        <div>
          <div class="card-title">考试完成</div>
          <div class="card-sub">共 ${total} 题 · ${esc(e.filter.module === 'all' ? '全部模块' : e.filter.module)}${e.filter.type !== 'all' ? ' · ' + esc(e.filter.type) : ''}</div>
        </div>
        <span class="tag ${rateTag}" style="font-size:12px;padding:5px 12px">
          正确率 ${rate}%
        </span>
      </div>

      <div style="display:flex;flex-direction:column;gap:26px;padding:8px 0 4px">

        <!-- 速度表 -->
        <div class="speed-gauge">
          <svg viewBox="0 0 240 150" aria-label="用时速度表">
            <defs>
              <linearGradient id="gaugeGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%"  stop-color="#f59e0b"/>
                <stop offset="55%" stop-color="#eab308"/>
                <stop offset="100%" stop-color="#16a34a"/>
              </linearGradient>
            </defs>
            <!-- 底槽 -->
            <path d="M 32 120 A 88 88 0 0 1 208 120"
                  fill="none" stroke="var(--surface-2)" stroke-width="14" stroke-linecap="round"/>
            <!-- 彩色弧 -->
            <path d="M 32 120 A 88 88 0 0 1 208 120"
                  fill="none" stroke="url(#gaugeGrad)" stroke-width="14"
                  stroke-linecap="round" opacity="0.9"/>
            <!-- 中心用时 -->
            <text x="120" y="100" text-anchor="middle"
                  font-size="30" font-weight="800" fill="var(--text)"
                  font-family="ui-monospace, monospace" letter-spacing="1">${mm}:${ss}</text>
            <text x="120" y="122" text-anchor="middle"
                  font-size="11" fill="var(--text-3)" letter-spacing="2">用 时</text>
            <!-- 两端标签 -->
            <text x="32" y="142" text-anchor="start"
                  font-size="11" fill="var(--text-3)">慢</text>
            <text x="208" y="142" text-anchor="end"
                  font-size="11" fill="var(--text-3)">快</text>
            <!-- 指针圆点 -->
            <circle cx="${dotX}" cy="${dotY}" r="8"
                    fill="var(--card)" stroke="${speedColor}" stroke-width="3"/>
            <circle cx="${dotX}" cy="${dotY}" r="3" fill="${speedColor}"/>
          </svg>
          <div class="speed-rating" style="background:${speedBg};color:${speedColor}">
            <span class="dot" style="background:${speedColor}"></span>
            ${speedLabel}
          </div>
        </div>

        <!-- 对错对抗条 -->
        <div>
          <div class="result-bar">
            ${right > 0 ? `<div class="bar-right" style="flex: 0 0 ${rightPct}%"><span>✓ 对 ${right} 题</span></div>` : ''}
            ${right > 0 && wrong > 0 ? '<div class="bar-divider"></div>' : ''}
            ${wrong > 0 ? `<div class="bar-wrong" style="flex: 0 0 ${wrongPct}%"><span>✗ 错 ${wrong} 题</span></div>` : ''}
          </div>
          <div style="display:flex;justify-content:space-between;font-size:12px;color:var(--text-3);padding:0 4px">
            <span>${right} 对</span>
            <span>${wrong} 错</span>
          </div>
        </div>
      </div>

      <div class="actions" style="margin-top:22px;justify-content:center">
        <button class="btn primary" id="exam-again">再来一次</button>
        <button class="btn" id="exam-back">返回筛选</button>
      </div>
    </div>
  `;

  if (wrongQs.length) {
    html += `
      <div class="card">
        <div class="card-head">
          <div>
            <div class="card-title">错题回顾</div>
            <div class="card-sub">${wrongQs.length} 道 · 正确答案已标绿，你的错误选择已标红</div>
          </div>
        </div>
        ${wrongQs.map((q, i) => `
          <div class="wrong-review-item">
            <div class="wrong-review-idx">${i + 1}</div>
            <div class="wrong-review-body">
              <div class="wrong-review-stem">${renderStem(q.stem)}</div>
              <div class="wrong-review-tags">
                <span class="tag gray">${esc(q.module)} · ${esc(q.type)}</span>
                ${(q.knowledgePoints || []).slice(0, 3).map(k => `<span class="tag gray">${esc(k)}</span>`).join('')}
              </div>
              <div class="wrong-review-choice">
                <span class="badge-wrong">你选 ${String.fromCharCode(65 + q.selectedIdx)}</span>
                <span style="color:var(--text-3);font-size:11px">→</span>
                <span class="badge-right">正确 ${String.fromCharCode(65 + q.correctIdx)}</span>
              </div>
              <div class="wrong-review-options">
                ${q.options.map((opt, j) => {
                  let cls = 'wrong-review-opt';
                  if (j === q.correctIdx) cls += ' correct';
                  else if (j === q.selectedIdx) cls += ' wrong';
                  return `<div class="${cls}"><span class="lbl">${String.fromCharCode(65 + j)}.</span>${esc(opt)}</div>`;
                }).join('')}
              </div>
            </div>
          </div>
        `).join('')}
      </div>
    `;
  }

  view.innerHTML = html;

  view.querySelector('#exam-again').addEventListener('click', () => startExam());
  view.querySelector('#exam-back').addEventListener('click', () => {
    e.stage = 'idle';
    e.results = [];
    renderView();
  });
}

/* ============ 视图：错题查看 ============ */
function renderBrowse(view) {
  if (state.browse.selectedId) renderBrowseDetail(view);
  else renderBrowseList(view);
}
/* 分页控件 HTML */
function renderPagination(page, totalPages, total, start, end, pageSize) {
  return `
    <div class="pagination">
      <div class="pagination-info">显示 ${start + 1}-${end} / 共 ${total} 题</div>
      <div class="pagination-controls">
        <button class="btn sm" data-page="first" ${page <= 1 ? 'disabled' : ''}>首页</button>
        <button class="btn sm" data-page="prev" ${page <= 1 ? 'disabled' : ''}>上一页</button>
        <span class="pagination-jump">
          第 <input type="number" class="pagination-input" id="page-input" min="1" max="${totalPages}" value="${page}"> / ${totalPages} 页
        </span>
        <button class="btn sm" data-page="next" ${page >= totalPages ? 'disabled' : ''}>下一页</button>
        <button class="btn sm" data-page="last" ${page >= totalPages ? 'disabled' : ''}>末页</button>
      </div>
      <div class="pagination-size">
        每页
        <select id="page-size" class="input" style="width:auto;padding:4px 26px 4px 10px;font-size:12px">
          ${[10, 20, 30, 50, 100].map(n => `<option value="${n}" ${pageSize === n ? 'selected' : ''}>${n}</option>`).join('')}
          <option value="all" ${pageSize === 'all' ? 'selected' : ''}>全部</option>
        </select>
      </div>
    </div>
  `;
}
/* 错题列表排序：先按错误次数降序，再按创建时间降序 */
function sortBrowseList(list, mode) {
  const m = mode || 'wrongCount';
  if (m === 'createdAt') {
    return [...list].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  }
  if (m === 'stars') {
    return [...list].sort((a, b) =>
      (b.stars || 0) - (a.stars || 0) ||
      (b.wrongCount || 0) - (a.wrongCount || 0) ||
      (b.createdAt || 0) - (a.createdAt || 0)
    );
  }
  return [...list].sort((a, b) =>
    (b.wrongCount || 0) - (a.wrongCount || 0) ||
    (b.createdAt || 0) - (a.createdAt || 0)
  );
}

/* ---- 错题列表 ---- */
function renderBrowseList(view) {
  const b = state.browse;
  const f = b.filter;
  const pool = filterQuestions(f);

  const kw = (state.search || '').trim().toLowerCase();
  const filtered = kw ? pool.filter(q =>
    q.stem.toLowerCase().includes(kw) ||
    (q.knowledgePoints || []).some(k => k.toLowerCase().includes(kw))
  ) : pool;

  const types = f.module === 'all' ? Object.values(CATEGORIES).flat() : (CATEGORIES[f.module] || []);
  const kpSet = new Set();
  filtered.forEach(q => (q.knowledgePoints || []).forEach(k => kpSet.add(k)));
  const kpList = [...kpSet].sort();

  if (!questions.length) {
    view.innerHTML = `
      <div class="card">
        <div class="card-head">
          <div><div class="card-title">错题查看</div><div class="card-sub">按分类浏览</div></div>
        </div>
        <div class="empty">
          <div class="empty-icon">📚</div>
          <div class="empty-title">还没有收录错题</div>
          <div class="empty-desc">去「错题收录」上传截图，AI 会自动归类入库。</div>
        </div>
      </div>
    `;
    return;
  }

  const sortSubtitle = b.sortBy === 'createdAt' ? '按添加时间（新→旧）'
    : b.sortBy === 'stars' ? '按重要性（高→低）'
    : '按错误次数（高→低）';

  let html = `
    <div class="card">
      <div class="card-head">
        <div>
          <div class="card-title">错题查看</div>
          <div class="card-sub">按模块 / 题型 / 知识点筛选</div>
        </div>
      </div>

      <div class="browse-filters">
        <div>
          <label>模块</label>
          <select id="browse-module" class="input">
            <option value="all" ${f.module === 'all' ? 'selected' : ''}>全部模块</option>
            ${MODULES.map(m => `<option value="${esc(m)}" ${m === f.module ? 'selected' : ''}>${esc(m)}</option>`).join('')}
          </select>
        </div>
        <div>
          <label>题型</label>
          <select id="browse-type" class="input">
            <option value="all" ${f.type === 'all' ? 'selected' : ''}>全部题型</option>
            ${types.map(t => `<option value="${esc(t)}" ${t === f.type ? 'selected' : ''}>${esc(t)}</option>`).join('')}
          </select>
        </div>
        <div>
          <label>来源</label>
          <select id="browse-source" class="input">
            <option value="all" ${(f.source || 'all') === 'all' ? 'selected' : ''}>全部来源</option>
            ${(() => {
              // 汇总当前模块/题型范围内的来源
              const srcPool = filterQuestions({ module: f.module, type: f.type, source: 'all', knowledgePoints: [] });
              const srcSet = new Set();
              srcPool.forEach(q => { if (q.source && q.source.trim()) srcSet.add(q.source.trim()); });
              const sources = [...srcSet].sort((a, b) => a.localeCompare(b, 'zh-CN'));
              return sources.map(s => `<option value="${esc(s)}" ${s === f.source ? 'selected' : ''}>${esc(s)}</option>`).join('');
            })()}
          </select>
        </div>
      </div>

      <div class="search-box">
        <svg class="ico" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
        </svg>
        <input id="browse-search" class="input" type="text" placeholder="搜索题干关键词…" value="${esc(state.search || '')}">
        ${state.search ? '<button class="clear" id="browse-search-clear" title="清除">×</button>' : ''}
      </div>

      <label>知识点</label>
      <div class="kp-wrap scrollable" style="min-height:44px">
        ${kpList.length ? kpList.map(k => {
          const sel = f.knowledgePoints.includes(k);
          return `<button class="browse-kp" data-kp="${esc(k)}" style="
            padding:5px 12px;border-radius:6px;font-size:12px;font-weight:600;
            border:1px solid ${sel ? 'var(--primary)' : 'var(--border-strong)'};
            background:${sel ? 'var(--primary)' : 'var(--card)'};
            color:${sel ? '#fff' : 'var(--text-2)'};
            cursor:pointer;font-family:inherit;transition:all .15s
          ">${esc(k)}</button>`;
        }).join('') : '<span style="color:var(--text-3);font-size:12px">当前范围内没有知识点</span>'}
      </div>

      <div class="filter-stats">
        共 <b>${filtered.length}</b> 题
        ${f.module !== 'all' ? ` · 模块 <b>${esc(f.module)}</b>` : ''}
        ${f.type !== 'all' ? ` · 题型 <b>${esc(f.type)}</b>` : ''}
        ${f.knowledgePoints.length ? ` · 知识点 <b>${f.knowledgePoints.length}</b> 个` : ''}
        ${kw ? ` · 搜索 "<b>${esc(kw)}</b>"` : ''}
      </div>
    </div>
  `;

  if (!filtered.length) {
    html += `
      <div class="card">
        <div class="empty">
          <div class="empty-icon">🔍</div>
          <div class="empty-title">当前筛选下没有题目</div>
          <div class="empty-desc">试试切换其他模块或清除知识点筛选。</div>
        </div>
      </div>
    `;
    view.innerHTML = html;
    bindBrowseFilterEvents(view, pool, filtered);
    return;
  }

  /* 排序 + 分页 */
  const sorted = sortBrowseList(filtered, b.sortBy);
  const pageSize = b.pageSize || 20;
  const isAll = pageSize === 'all';
  const total = sorted.length;
  const totalPages = isAll ? 1 : Math.max(1, Math.ceil(total / pageSize));
  let curPage = b.page || 1;
  if (curPage > totalPages) curPage = totalPages;
  if (curPage < 1) curPage = 1;
  b.page = curPage;
  const start = isAll ? 0 : (curPage - 1) * pageSize;
  const end = isAll ? total : Math.min(start + pageSize, total);
  const pageList = sorted.slice(start, end);

  html += `
    <div class="card">
      <div class="card-head">
        <div>
          <div class="card-title">错题列表</div>
          <div class="card-sub">共 ${total} 题 · ${sortSubtitle}</div>
        </div>
        <select id="browse-sort" class="input" style="width:auto;min-width:170px;padding:6px 32px 6px 12px;font-size:12.5px">
          <option value="wrongCount" ${b.sortBy === 'wrongCount' ? 'selected' : ''}>按错误次数</option>
          <option value="createdAt" ${b.sortBy === 'createdAt' ? 'selected' : ''}>按添加时间</option>
          <option value="stars" ${b.sortBy === 'stars' ? 'selected' : ''}>按重要性（星）</option>
        </select>
      </div>
      <div class="q-list" id="q-list">
        ${pageList.map(q => `
          <div class="q-list-item" data-open-q="${q.id}">
            <div class="q-list-head">
              <div class="q-list-meta">
                <span class="tag primary">${esc(q.module)}</span>
                <span class="tag gray">${esc(q.type)}</span>
                ${(q.imageIds || []).length ? `<span class="tag with-image" title="含题目图片">🖼️ 图文</span>` : ''}
                ${(q.knowledgePoints || []).slice(0, 3).map(k => `<span class="tag gray">${esc(k)}</span>`).join('')}
                ${(q.knowledgePoints || []).length > 3 ? `<span class="tag gray">+${q.knowledgePoints.length - 3}</span>` : ''}
              </div>
              <div class="q-list-stats">
                ${q.source ? `<span class="source-badge" title="${esc(q.source)}">📎 ${esc(q.source)}</span>` : ''}
                ${q.stars ? `<span class="star-badge" title="${q.stars} 星重要性">${'★'.repeat(q.stars)}</span>` : ''}
                <span>错 <b>${q.wrongCount || 0}</b></span>
                <span>对 <i>${q.rightCount || 0}</i></span>
              </div>
            </div>
            <div class="q-list-stem">${renderStem(q.stem)}</div>
          </div>
        `).join('')}
      </div>
      ${renderPagination(curPage, totalPages, total, start, end, pageSize)}
    </div>
  `;

  view.innerHTML = html;
  bindBrowseFilterEvents(view, pool, filtered, sorted);
}

function bindBrowseFilterEvents(view, pool, filtered, sorted) {
  const f = state.browse.filter;

  const fm = view.querySelector('#browse-module');
  if (fm) fm.addEventListener('change', e => {
    f.module = e.target.value;
    f.type = 'all';
    f.source = 'all';
    f.knowledgePoints = [];
    state.browse.page = 1;
    renderView();
  });
  const ft = view.querySelector('#browse-type');
  if (ft) ft.addEventListener('change', e => {
    f.type = e.target.value;
    f.source = 'all';
    f.knowledgePoints = [];
    state.browse.page = 1;
    renderView();
  });
  const fs = view.querySelector('#browse-source');
  if (fs) fs.addEventListener('change', e => {
    f.source = e.target.value;
    f.knowledgePoints = [];
    state.browse.page = 1;
    persistBrowseState();
    renderView();
  });
  view.querySelectorAll('.browse-kp').forEach(el => {
    el.addEventListener('click', () => {
      const k = el.dataset.kp;
      const idx = f.knowledgePoints.indexOf(k);
      if (idx >= 0) f.knowledgePoints.splice(idx, 1);
      else f.knowledgePoints.push(k);
      state.browse.page = 1;
      renderView();
    });
  });

  const searchInput = view.querySelector('#browse-search');
  if (searchInput) {
    let composing = false;
    let debounceTimer = null;
    const applySearch = (val) => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        state.search = val;
        state.browse.page = 1;
        const cur = val;
        renderView();
        setTimeout(() => {
          const el = document.getElementById('browse-search');
          if (el) { el.focus(); el.setSelectionRange(cur.length, cur.length); }
        }, 0);
      }, 220);
    };
    searchInput.addEventListener('compositionstart', () => { composing = true; });
    searchInput.addEventListener('compositionend', e => { composing = false; applySearch(e.target.value); });
    searchInput.addEventListener('input', e => { if (!composing) applySearch(e.target.value); });
  }
  const searchClear = view.querySelector('#browse-search-clear');
  if (searchClear) searchClear.addEventListener('click', () => {
    state.search = '';
    state.browse.page = 1;
    renderView();
  });

  const sortSel = view.querySelector('#browse-sort');
  if (sortSel) sortSel.addEventListener('change', e => {
    state.browse.sortBy = e.target.value;
    state.browse.page = 1;
    persistBrowseState();
    renderView();
  });

  /* 点击列表项 → 打开详情 */
  view.querySelectorAll('[data-open-q]').forEach(el => {
    el.addEventListener('click', () => {
      const id = el.dataset.openQ;
      if (!id) return;
      // 用当前页的顺序作为上下题切换顺序
      const curSorted = sorted || sortBrowseList(filtered, state.browse.sortBy);
      state.browse.listIds = curSorted.map(x => x.id);
      openQuestionDetail(id);
    });
  });

  /* 分页 */
  const sortedList = sorted || sortBrowseList(filtered, state.browse.sortBy);
  view.querySelectorAll('[data-page]').forEach(btn => {
    btn.addEventListener('click', () => {
      const action = btn.dataset.page;
      const sz = state.browse.pageSize || 20;
      const tPages = sz === 'all' ? 1 : Math.max(1, Math.ceil(sortedList.length / sz));
      let p = state.browse.page || 1;
      if (action === 'first') p = 1;
      else if (action === 'prev') p = Math.max(1, p - 1);
      else if (action === 'next') p = Math.min(tPages, p + 1);
      else if (action === 'last') p = tPages;
      state.browse.page = p;
      persistBrowseState();
      renderView();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  });

  const pageInput = view.querySelector('#page-input');
  if (pageInput) {
    pageInput.addEventListener('keydown', e => {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      const v = parseInt(e.target.value);
      const sz = state.browse.pageSize || 20;
      const tPages = sz === 'all' ? 1 : Math.max(1, Math.ceil(sortedList.length / sz));
      if (Number.isInteger(v) && v >= 1 && v <= tPages) {
        state.browse.page = v;
        persistBrowseState();
        renderView();
        window.scrollTo({ top: 0, behavior: 'smooth' });
      } else {
        e.target.value = state.browse.page;
      }
    });
  }

  const pageSizeSel = view.querySelector('#page-size');
  if (pageSizeSel) {
    pageSizeSel.addEventListener('change', e => {
      const v = e.target.value;
      state.browse.pageSize = v === 'all' ? 'all' : parseInt(v);
      state.browse.page = 1;
      persistBrowseState();
      renderView();
    });
  }
}
/* ---- 打开详情 ---- */
function openQuestionDetail(id) {
  state.browse.listScrollY = window.scrollY || document.documentElement.scrollTop || 0;
  const q = questions.find(x => x.id === id);
  if (!q) return;
  state.browse.selectedId = id;
  state.browse.detail = { question: q, similar: [] };
  state.browse.generating = { analysis: false, similar: false };
  state.browse.editing = false;
  state.browse.editDraft = null;
  renderView();
  window.scrollTo({ top: 0, behavior: 'instant' });
  document.documentElement.scrollTop = 0;
  document.body.scrollTop = 0;
  persistBrowseState();
}

/* ============ 视图：个人笔记 ============ */
function renderNotes(view) {
  const n = state.notes;

  let list = questions.filter(q => q.personalNote && q.personalNote.trim());
  if (n.filterModule !== 'all') {
    list = list.filter(q => q.module === n.filterModule);
  }
  if (n.sort === 'updatedAt') {
    list.sort((a, b) => (b.personalNoteUpdatedAt || 0) - (a.personalNoteUpdatedAt || 0));
  } else if (n.sort === 'createdAt') {
    list.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  } else if (n.sort === 'module') {
    list.sort((a, b) => {
      const m = (a.module || '').localeCompare(b.module || '');
      if (m) return m;
      return (b.personalNoteUpdatedAt || 0) - (a.personalNoteUpdatedAt || 0);
    });
  }

  const total = questions.length;
  const withNote = questions.filter(q => q.personalNote && q.personalNote.trim()).length;
  const kpCovered = new Set();
  questions.forEach(q => {
    if (q.personalNote && q.personalNote.trim()) {
      (q.knowledgePoints || []).forEach(k => kpCovered.add(k));
    }
  });
  const coverage = total ? Math.round(withNote / total * 100) : 0;

  /* ============ Hero ============ */
  let html = `
    <div class="notes-hero">
      <div class="notes-hero-head">
        <div>
          <div class="notes-hero-title">
            <span class="icon">📝</span>
            个人笔记
          </div>
          <div class="notes-hero-sub">你对每道题的理解与顿悟，都值得被记下来</div>
        </div>
      </div>

      <div class="notes-stats">
        <div class="notes-stat stat-primary">
          <div class="notes-stat-label"><span class="ico">🖊️</span>已写笔记</div>
          <div class="notes-stat-value">${withNote}<span class="unit">条</span></div>
          <div class="notes-stat-progress"><div class="fill" style="width:${coverage}%"></div></div>
          <div class="notes-stat-desc">覆盖 ${coverage}% 的错题</div>
        </div>
        <div class="notes-stat stat-success">
          <div class="notes-stat-label"><span class="ico">🎯</span>涉及知识点</div>
          <div class="notes-stat-value">${kpCovered.size}<span class="unit">个</span></div>
          <div class="notes-stat-progress"><div class="fill" style="width:${Math.min(100, kpCovered.size * 5)}%"></div></div>
          <div class="notes-stat-desc">${kpCovered.size ? '已形成自己的知识网' : '写笔记会自动关联知识点'}</div>
        </div>
      </div>
    </div>
  `;

  if (!questions.length) {
    html += `
      <div class="card">
        <div class="empty">
          <div class="empty-icon">📝</div>
          <div class="empty-title">还没有错题</div>
          <div class="empty-desc">先去「错题收录」上传几道题，就可以在题目详情页写笔记了。</div>
          <div class="actions" style="justify-content:center;margin-top:16px">
            <button class="btn primary" id="notes-goto-collect">去收录</button>
          </div>
        </div>
      </div>
    `;
    view.innerHTML = html;
    view.querySelector('#notes-goto-collect')?.addEventListener('click', () => {
      state.mode = 'collect';
      state.prevMode = 'collect';
      saveCurrentMode();
      renderView();
    });
    return;
  }

  const modulesWithNotes = [...new Set(
    questions.filter(q => q.personalNote && q.personalNote.trim()).map(q => q.module)
  )].filter(Boolean);

  html += `
    <div class="card" style="padding:16px 22px">
      <div class="notes-toolbar">
        <div>
          <label>模块</label>
          <select id="notes-filter-module" class="input">
            <option value="all" ${n.filterModule === 'all' ? 'selected' : ''}>全部模块</option>
            ${modulesWithNotes.map(m => `<option value="${esc(m)}" ${m === n.filterModule ? 'selected' : ''}>${esc(m)}</option>`).join('')}
          </select>
        </div>
        <div>
          <label>排序</label>
          <select id="notes-sort" class="input">
            <option value="updatedAt" ${n.sort === 'updatedAt' ? 'selected' : ''}>最近更新</option>
            <option value="createdAt" ${n.sort === 'createdAt' ? 'selected' : ''}>最近收录</option>
            <option value="module" ${n.sort === 'module' ? 'selected' : ''}>按模块</option>
          </select>
        </div>
      </div>
    </div>
  `;

  if (!list.length) {
    html += `
      <div class="card">
        <div class="empty">
          <div class="empty-icon">✨</div>
          <div class="empty-title">${withNote === 0 ? '还没有任何笔记' : '当前筛选下没有笔记'}</div>
          <div class="empty-desc">
            ${withNote === 0
              ? '去「错题查看」点进任意一道题，在详情页写下你的第一句笔记吧。'
              : '试试切换其他模块。'}
          </div>
        </div>
      </div>
    `;
    view.innerHTML = html;
    bindNotesEvents(view);
    return;
  }

  html += `
    <div class="card">
      <div class="card-head">
        <div>
          <div class="card-title">笔记列表</div>
          <div class="card-sub">共 ${list.length} 条 · 点击跳转到对应题目</div>
        </div>
      </div>
      ${list.map(q => {
        const updateTime = q.personalNoteUpdatedAt
          ? new Date(q.personalNoteUpdatedAt).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
          : '';
        return `
          <div class="note-item" data-open-note="${q.id}">
            <div class="note-head">
              <div class="note-tags">
                <span class="tag primary">${esc(q.module)}</span>
                <span class="tag gray">${esc(q.type)}</span>
                ${(q.knowledgePoints || []).slice(0, 3).map(k => `<span class="tag gray">${esc(k)}</span>`).join('')}
                ${(q.knowledgePoints || []).length > 3 ? `<span class="tag gray">+${q.knowledgePoints.length - 3}</span>` : ''}
              </div>
              ${updateTime ? `<div class="note-time"><span class="ico">🕒</span>${updateTime}</div>` : ''}
            </div>
            <div class="note-stem">${renderStem(q.stem)}</div>
            <div class="note-content">${esc(q.personalNote).replace(/\n/g, '<br>')}</div>
          </div>
        `;
      }).join('')}
    </div>
  `;

  view.innerHTML = html;
  bindNotesEvents(view);
}

function bindNotesEvents(view) {
  const n = state.notes;

  const fm = view.querySelector('#notes-filter-module');
  if (fm) fm.addEventListener('change', e => { n.filterModule = e.target.value; renderView(); });

  const so = view.querySelector('#notes-sort');
  if (so) so.addEventListener('change', e => { n.sort = e.target.value; renderView(); });

  view.querySelectorAll('[data-open-note]').forEach(el => {
    el.addEventListener('click', () => {
      const id = el.dataset.openNote;
      const q = questions.find(x => x.id === id);
      if (!q) return;
      // 直接跳到该题详情页
      state.mode = 'browse';
      state.prevMode = 'browse';
      state.browse.filter = { module: 'all', type: 'all', source: 'all', knowledgePoints: [] };
      state.browse.listIds = sortBrowseList(questions, state.browse.sortBy).map(x => x.id);
      state.browse.selectedId = id;
      state.browse.detail = { question: q, similar: [] };
      state.browse.generating = { analysis: false, similar: false };
      state.browse.editing = false;
      state.browse.editDraft = null;
      state.browse.listScrollY = 0;
      state.browse.pendingScrollRestore = null;
      persistBrowseState();
      renderView();
      window.scrollTo({ top: 0, behavior: 'instant' });
    });
  });
}

/* ---- 详情页 ---- */
function renderBrowseDetail(view) {
  const b = state.browse;
  const q = questions.find(x => x.id === b.selectedId);
  if (!q) { b.selectedId = null; renderView(); return; }
  const g = b.generating;
  if (b.editing && b.editDraft) {
    renderBrowseEdit(view, q);
    return;
  }

  // 作答历史（最近 5 次）
  const history = (q.attemptHistory || []).slice(0, 5);

  const listIds = b.listIds || [];
  const idx = listIds.indexOf(q.id);
  const hasPrev = idx > 0;
  const hasNext = idx >= 0 && idx < listIds.length - 1;
  const posLabel = idx >= 0 && listIds.length ? `${idx + 1} / ${listIds.length}` : '';

  let html = `
    <div class="card">
      <div class="detail-header" style="flex-wrap:wrap;gap:8px">
        <button class="btn ghost sm" id="detail-back">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="15 18 9 12 15 6"/>
          </svg>
          返回列表
        </button>
        <div style="flex:1;display:flex;gap:6px;align-items:center;justify-content:flex-end;flex-wrap:wrap">
          ${posLabel ? `<span style="font-size:12px;color:var(--text-3);margin-right:4px">${posLabel}</span>` : ''}
          <button class="btn sm" id="detail-prev" ${!hasPrev ? 'disabled' : ''} title="上一题">←</button>
          <button class="btn sm" id="detail-next" ${!hasNext ? 'disabled' : ''} title="下一题">→</button>
          <button class="btn sm" id="detail-edit" style="margin-left:6px">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
            </svg>
            编辑
          </button>
          <button class="btn sm danger" id="detail-delete" style="margin-left:6px" title="删除这道题">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="3 6 5 6 21 6"/>
              <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
            </svg>
            删除
          </button>
          <span style="font-size:12px;color:var(--text-3);margin-left:8px">
            错 <b style="color:var(--danger)">${q.wrongCount || 0}</b>
            · 对 <b style="color:var(--success)">${q.rightCount || 0}</b>
          </span>
        </div>
      </div>

      <div style="margin-top:14px;display:flex;gap:6px;flex-wrap:wrap;align-items:center">
        <span class="tag primary">${esc(q.module)}</span>
        <span class="tag gray">${esc(q.type)}</span>
        ${(q.knowledgePoints || []).map(k => `<span class="tag gray">${esc(k)}</span>`).join('')}
        <div style="display:inline-flex;align-items:center;gap:6px;margin-left:auto">
          <span style="font-size:11px;color:var(--text-3);flex-shrink:0">📎 来源</span>
          <input id="detail-source-input" class="input" type="text"
            placeholder="点击填写题目来源"
            value="${esc(q.source || '')}"
            style="width:280px;min-width:180px;max-width:280px;padding:5px 10px;font-size:12.5px"
            title="修改后失焦或按 Enter 保存">
        </div>
        ${q.stars ? `<span class="detail-stars" title="重要性 ${q.stars} 星">${'★'.repeat(q.stars)}${'☆'.repeat(5 - q.stars)}</span>` : ''}
      </div>
      <div id="detail-images-wrap" style="display:${(q.imageIds || []).length ? 'flex' : 'none'};margin-bottom:14px;padding-top:10px"></div>
      <div class="detail-stem" style="margin-top:16px">${
        renderStemWithHighlights(
          q.stem,
          (q.aiAnalysis && q.aiAnalysis.keyPoints) || []
        )
      }</div>

      <div>
        ${q.options.map((opt, i) => {
          let cls = 'detail-opt';
          if (i === q.correctIdx) cls += ' correct';
          return `<div class="${cls}"><span class="lbl">${String.fromCharCode(65 + i)}.</span>${esc(opt)}</div>`;
        }).join('')}
      </div>

      ${q.originalExplanation ? `
        <div style="margin-top:16px;padding:14px 16px;background:var(--bg);border-radius:10px;border:1px solid var(--border)">
          <div style="font-size:12px;font-weight:700;color:var(--text-3);letter-spacing:0.3px;margin-bottom:6px">原解析</div>
          <div style="font-size:13px;line-height:1.8;color:var(--text-2);white-space:pre-wrap">${esc(q.originalExplanation)}</div>
        </div>
      ` : ''}

      ${history.length ? `
        <div style="margin-top:16px">
          <div style="font-size:12px;font-weight:700;color:var(--text-3);letter-spacing:0.3px;margin-bottom:8px">作答历史（最近 ${history.length} 次）</div>
          <div style="display:flex;gap:6px;flex-wrap:wrap">
            ${history.map(h => `
              <span class="tag ${h.ok ? 'success' : ''}" style="${h.ok ? '' : 'background:var(--danger-soft);color:var(--danger)'}">
                ${new Date(h.t).toLocaleDateString('zh-CN',{month:'2-digit',day:'2-digit'})} · 选${String.fromCharCode(65 + h.sel)} · ${h.ok ? '对' : '错'}
              </span>
            `).join('')}
          </div>
        </div>
      ` : ''}
    </div>
  `;

  html += renderPersonalNoteBlock(q);

  /* AI 分析块 */
  const an = q.aiAnalysis;
  const hasAnalysis = an && (an.coreIdea || an.breakthrough);
  const hasImage = (q.imageIds || []).length > 0;

  const analysisCollapsed = localStorage.getItem('xc_collapse_d_analysis') === '1';
  html += `
    <details class="card collapsible" ${analysisCollapsed ? '' : 'open'} data-collapse-key="xc_collapse_d_analysis">
      <summary>
        <div>
          <div class="card-title">AI 智能分析</div>
          <div class="card-sub">${hasImage ? '图文题暂不支持 AI 分析' : '核心思路 · 选项剖析 · 通用方法'}</div>
        </div>
        <div style="display:flex;align-items:center;gap:10px;flex-shrink:0">
          ${hasAnalysis ? `<span class="tag success">已生成</span>` : `<span class="tag gray">未生成</span>`}
          <svg class="chev" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="6 9 12 15 18 9"/>
          </svg>
        </div>
      </summary>
      <div class="card-body">
  `;
  if (hasImage) {
    html += `
      <div class="empty" style="padding:28px 12px">
        <div class="empty-icon">🖼️</div>
        <div class="empty-title">本题包含图片，暂不支持 AI 分析</div>
        <div class="empty-desc">
          图片题需要多模态 AI 才能理解图形。建议在「📝 珍贵的个人笔记」里写下你自己的解题思路。
        </div>
      </div>
    `;
  } else if (!getApiKey()) {
    html += `
      <div class="empty" style="padding:24px 12px">
        <div class="empty-title">需要配置 API Key</div>
        <div class="empty-desc">前往设置页填写 DeepSeek API Key 后才能使用 AI 分析。</div>
        <div class="actions" style="justify-content:center;margin-top:12px">
          <button class="btn primary" id="detail-goto-settings">去设置</button>
        </div>
      </div>
    `;
  } else if (!hasAnalysis) {
    html += `
      <div class="empty" style="padding:28px 12px">
        <div class="empty-icon">✨</div>
        <div class="empty-title">让 AI 深入分析这道题</div>
        <div class="empty-desc">AI 会讲清：核心矛盾、每个选项的对错根本原因、更快的解题路径、同类题的通用方法。</div>
        <div class="actions" style="justify-content:center;margin-top:12px">
          <button class="btn primary" id="gen-analysis" ${g.analysis ? 'disabled' : ''}>
            ${g.analysis ? '<span class="spinner"></span> 分析中…' : '开始分析'}
          </button>
        </div>
      </div>
    `;
  } else {

    // 核心洞察
  if (an.coreIdea) {
      html += `
        <div class="ai-block" style="background:linear-gradient(135deg,rgba(99,102,241,0.08),rgba(139,92,246,0.08));border-color:rgba(99,102,241,0.15)">
          <div class="ai-block-head" style="color:#6366f1">
            <span>🎯</span><span>这道题在考什么</span>
          </div>
          <div style="font-size:15px;font-weight:700;color:var(--text);line-height:1.7">${esc(an.coreIdea)}</div>
        </div>
      `;
    }
        // 破题题眼
  if (an.keyPoints && an.keyPoints.length) {
    html += `
      <div class="ai-block" style="background:linear-gradient(135deg,rgba(250,204,21,0.10),rgba(250,204,21,0.04));border-color:rgba(250,204,21,0.25)">
        <div class="ai-block-head" style="color:#ca8a04">
          <span>🔑</span><span>破题题眼</span>
        </div>
        <div style="font-size:12px;color:var(--text-3);margin-bottom:10px;line-height:1.6">
          题干中以下内容已用黄色高亮标识：
        </div>
        ${an.keyPoints.map(kp => `
          <div class="key-point-item">
            <div class="kpt"><mark>${esc(kp.text)}</mark></div>
            <div class="kpr">${esc(kp.reason)}</div>
          </div>
        `).join('')}
      </div>
    `;
  }

    // 突破口
  if (an.breakthrough) {
      html += `
        <div class="ai-block" style="background:linear-gradient(135deg,rgba(217,119,6,0.06),rgba(245,158,11,0.06));border-color:rgba(217,119,6,0.15)">
          <div class="ai-block-head" style="color:var(--warn)">
            <span>💡</span><span>解题突破口</span>
          </div>
          <div class="ai-block-body">${esc(an.breakthrough)}</div>
        </div>
      `;
    }

    // 逐项剖析
  if (an.optionAnalysis && an.optionAnalysis.length) {
      html += `
        <div style="margin-top:12px">
          <div style="font-size:12px;font-weight:700;color:var(--text-3);letter-spacing:0.3px;margin-bottom:8px">📋 逐项剖析</div>
          ${an.optionAnalysis.map(o => {
            const isRight = o.type === 'right';
            return `
              <div style="display:flex;gap:10px;padding:10px 12px;border-radius:8px;margin-bottom:6px;
                   background:${isRight ? 'var(--success-soft)' : 'var(--surface-2)'};
                   border-left:3px solid ${isRight ? 'var(--success)' : 'var(--text-3)'}">
                <div style="flex-shrink:0;width:22px;height:22px;border-radius:50%;
                     background:${isRight ? 'var(--success)' : 'var(--text-3)'};color:#fff;
                     display:flex;align-items:center;justify-content:center;
                     font-size:12px;font-weight:800">${esc(o.label)}</div>
                <div style="flex:1;font-size:13px;line-height:1.7;color:var(--text);min-width:0">${esc(o.why)}</div>
              </div>
            `;
          }).join('')}
        </div>
      `;
    }

    // 易错点
  if (an.easyMistake) {
      html += `
        <div class="ai-block" style="background:linear-gradient(135deg,rgba(220,38,38,0.05),rgba(239,68,68,0.05));border-color:rgba(220,38,38,0.15)">
          <div class="ai-block-head" style="color:var(--danger)">
            <span>⚠️</span><span>最容易踩的坑</span>
          </div>
          <div class="ai-block-body">${esc(an.easyMistake)}</div>
        </div>
      `;
    }

    // 更好解法
  if (an.betterSolution) {
      html += `
        <div class="ai-block" style="background:linear-gradient(135deg,rgba(22,163,74,0.05),rgba(101,163,13,0.05));border-color:rgba(22,163,74,0.15)">
          <div class="ai-block-head" style="color:var(--success)">
            <span>⚡</span><span>更本质 / 更快的路径</span>
          </div>
          <div class="ai-block-body">${esc(an.betterSolution)}</div>
        </div>
      `;
    }

    // 通用方法
  if (an.generalTip) {
      html += `
        <div class="ai-block" style="background:linear-gradient(135deg,rgba(37,99,235,0.06),rgba(59,130,246,0.04));border-color:rgba(37,99,235,0.15)">
          <div class="ai-block-head" style="color:var(--primary)">
            <span>🧭</span><span>下次遇到同类题怎么做</span>
          </div>
          <div class="ai-block-body">${esc(an.generalTip)}</div>
        </div>
      `;
    }

  html += `
      <div class="actions" style="margin-top:14px">
        <button class="btn ghost sm" id="regen-analysis">重新分析</button>
      </div>
    `;
  }
  html += `</div></details>`;
    /* 个人笔记 */


  html += renderChatBlock(q);

  /* 举一反三 */
  const similarCollapsed = localStorage.getItem('xc_collapse_d_similar') === '1';
  html += `
    <details class="card collapsible" ${similarCollapsed ? '' : 'open'} data-collapse-key="xc_collapse_d_similar">
      <summary>
        <div>
          <div class="card-title">举一反三</div>
          <div class="card-sub">AI 出 1-5 道同类题，实战巩固</div>
        </div>
        <div style="display:flex;align-items:center;gap:10px;flex-shrink:0">
          ${b.detail.similar.length ? `<span class="tag success">${b.detail.similar.length} 道</span>` : ''}
          <svg class="chev" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="6 9 12 15 18 9"/>
          </svg>
        </div>
      </summary>
      <div class="card-body">
  `;

  if (!getApiKey()) {
    html += `<div class="empty" style="padding:20px"><div class="empty-desc">需要先配置 API Key</div></div>`;
  } else if (!b.detail.similar.length) {
    html += `
      <div class="empty" style="padding:20px 12px">
        <div class="empty-icon">🎯</div>
        <div class="empty-title">生成同类练习题</div>
        <div class="empty-desc">AI 会根据当前题目的题型和知识点，出 1-5 道思路相近的题目。</div>
        <div class="actions" style="justify-content:center;margin-top:12px">
          <button class="btn primary" id="gen-similar" ${g.similar ? 'disabled' : ''}>
            ${g.similar ? '<span class="spinner"></span> 生成中…' : '生成同类题'}
          </button>
        </div>
      </div>
    `;
  } else {
    html += b.detail.similar.map((s, i) => {
      const answered = s._selected !== undefined;
      return `
        <div class="similar-card">
          <div class="similar-head">
            <span class="tag primary">同类题 ${i + 1}</span>
            ${s.knowledgePoints && s.knowledgePoints.length ? `<span style="font-size:11px;color:var(--text-3)">${esc(s.knowledgePoints.join(' · '))}</span>` : ''}
          </div>
          <div class="similar-stem">${renderStem(s.stem)}</div>
          <div class="similar-opts">
            ${s.options.map((opt, j) => {
              let cls = 'similar-opt';
              if (answered) {
                if (j === s.correctIdx) cls += ' correct';
                else if (j === s._selected) cls += ' wrong';
              }
              return `<button class="${cls}" data-sim="${i}" data-sim-opt="${j}" ${answered ? 'disabled' : ''}>
                <span class="lbl">${String.fromCharCode(65 + j)}.</span>${esc(opt)}
              </button>`;
            }).join('')}
          </div>
          ${answered ? `
            <div style="margin-top:8px">
              <div style="font-size:13px;font-weight:700;color:${s._selected === s.correctIdx ? 'var(--success)' : 'var(--danger)'};margin-bottom:8px">
                ${s._selected === s.correctIdx ? '✅ 答对了' : `❌ 答错了，正确答案是 ${String.fromCharCode(65 + s.correctIdx)}`}
              </div>
              ${s.explanation ? `<div class="similar-explain">${esc(s.explanation)}</div>` : ''}
            </div>
          ` : ''}
        </div>
      `;
    }).join('');
    html += `
      <div class="actions" style="margin-top:12px">
        <button class="btn ghost sm" id="regen-similar">换一批</button>
        <button class="btn sm" id="save-similar">把答错的存入错题库</button>
      </div>
    `;
  }
  html += `</div>
    </details>
  `;

  view.innerHTML = html;

  /* ---- 事件绑定 ---- */
  view.querySelector('#detail-back').addEventListener('click', () => {
    state.browse.pendingScrollRestore = state.browse.listScrollY || 0;
    state.browse.selectedId = null;
    state.browse.detail = null;
    renderView();
    persistBrowseState();
  });
    /* 来源快速编辑 */
  const sourceInput = view.querySelector('#detail-source-input');
  if (sourceInput) {
    const saveSource = () => {
      const v = sourceInput.value.trim();
      if (v === (q.source || '')) return;
      q.source = v;
      saveQuestion(q);
      showToast(v ? '来源已保存' : '来源已清空');
    };
    sourceInput.addEventListener('blur', saveSource);
    sourceInput.addEventListener('keydown', e => {
      if (e.key === 'Enter') {
        e.preventDefault();
        sourceInput.blur();
      } else if (e.key === 'Escape') {
        sourceInput.value = q.source || '';
        sourceInput.blur();
      }
    });
  }
  const delBtn = view.querySelector('#detail-delete');
  if (delBtn) delBtn.addEventListener('click', async () => {
    if (!confirm('确定删除这道题？\n\n此操作不可恢复。')) return;
    const delId = q.id;
    // 记录图片，删除后检查是否清理
    const imgs = (q.imageIds || []).slice();
    await deleteQuestion(delId);
    // 清理孤立图片
    for (const imgId of imgs) {
      if (!isImageReferenced(imgId, null)) {
        try { await tryDeleteImage(imgId, null); } catch (e) {}
      }
    }
    // 从列表顺序里移除
    state.browse.listIds = (state.browse.listIds || []).filter(id => id !== delId);
    // 切换到大列表
    state.browse.selectedId = null;
    state.browse.detail = null;
    state.browse.editing = false;
    state.browse.editDraft = null;
    persistBrowseState();
    renderView();
    showToast('已删除');
  });

  const prevBtn = view.querySelector('#detail-prev');
  if (prevBtn) prevBtn.addEventListener('click', () => gotoAdjacentDetail(-1));
  const nextBtn = view.querySelector('#detail-next');
  if (nextBtn) nextBtn.addEventListener('click', () => gotoAdjacentDetail(1));
  const editBtn = view.querySelector('#detail-edit');
  if (editBtn) editBtn.addEventListener('click', () => {
    b.editDraft = {
      stem: q.stem,
      options: q.options.slice(),
      correctIdx: q.correctIdx,
      module: q.module,
      type: q.type,
      kpDraft: (q.knowledgePoints || []).slice(),
      originalExplanation: q.originalExplanation || '',
      source: q.source || '',
      stars: q.stars || 0,
      imageIds: (q.imageIds || []).slice()   // ← 新增
    };
    b.editing = true;
    renderView();
    window.scrollTo({ top: 0, behavior: 'instant' });
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
  });

  const gotoSet = view.querySelector('#detail-goto-settings');
  if (gotoSet) gotoSet.addEventListener('click', openSettings);

  const genA = view.querySelector('#gen-analysis');
  if (genA) genA.addEventListener('click', () => generateAnalysis(q));
  const regenA = view.querySelector('#regen-analysis');
  if (regenA) regenA.addEventListener('click', () => {
    if (!confirm('重新生成会覆盖当前分析，确定？')) return;
    generateAnalysis(q, true);
  });

  const genS = view.querySelector('#gen-similar');
  if (genS) genS.addEventListener('click', () => generateSimilar(q));
  const regenS = view.querySelector('#regen-similar');
  if (regenS) regenS.addEventListener('click', () => generateSimilar(q));

  view.querySelectorAll('[data-sim-opt]').forEach(btn => {
    btn.addEventListener('click', () => {
      const si = parseInt(btn.dataset.sim);
      const oi = parseInt(btn.dataset.simOpt);
      const sim = b.detail.similar[si];
      if (!sim || sim._selected !== undefined) return;
      sim._selected = oi;
      renderView();
    });
  });

    // 编辑按钮
  view.querySelectorAll('[data-edit-idx]').forEach(btn => {
    btn.addEventListener('click', () => {
      startEditChat(q, parseInt(btn.dataset.editIdx));
    });
  });

  // 取消编辑
  view.querySelectorAll('[data-cancel-edit]').forEach(btn => {
    btn.addEventListener('click', () => {
      state.browse.chatEditingIdx = null;
      renderView();
    });
  });

  // 提交编辑
  view.querySelectorAll('[data-submit-edit]').forEach(btn => {
    btn.addEventListener('click', () => {
      const idx = parseInt(btn.dataset.submitEdit);
      const ta = document.getElementById('edit-chat-input');
      const text = (ta?.value || '').trim();
      if (!text) { alert('内容不能为空'); return; }
      submitEditChat(q, idx, text);
    });
  });

  // 编辑框快捷键：Enter 提交，Esc 取消
  const editTa = view.querySelector('#edit-chat-input');
  if (editTa) {
    editTa.addEventListener('keydown', e => {
      if (e.key === 'Escape') {
        e.preventDefault();
        state.browse.chatEditingIdx = null;
        renderView();
      } else if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        const idx = state.browse.chatEditingIdx;
        const text = editTa.value.trim();
        if (text) submitEditChat(q, idx, text);
      }
    });
  }

  const saveSim = view.querySelector('#save-similar');
  if (saveSim) saveSim.addEventListener('click', async () => {
    const wrongSims = b.detail.similar.filter(s => s._selected !== undefined && s._selected !== s.correctIdx);
    if (!wrongSims.length) {
      if (b.detail.similar.some(s => s._selected !== undefined)) alert('答对的题目无需入库');
      else alert('请先作答');
      return;
    }
    if (!confirm(`将 ${wrongSims.length} 道答错的题存入错题库？`)) return;
    wrongSims.forEach(s => {
      const qq = {
        id: uid(),
        stem: s.stem, options: s.options.map(stripOptionPrefix),
        correctIdx: s.correctIdx,
        module: s.module || q.module,
        type: s.type || q.type,
        knowledgePoints: (s.knowledgePoints || q.knowledgePoints || []).slice(),
        originalExplanation: s.explanation || '',
        aiEasyMistake: '', aiBetterSolution: '',
        source: 'AI 举一反三',
        wrongCount: 1, rightCount: 0,
        attemptHistory: [{ t: Date.now(), sel: s._selected, ok: false }],
        personalNote: '',
        personalNoteUpdatedAt: 0,
        createdAt: Date.now()
      };
      saveQuestion(qq);
    });
    showToast(`已入库 ${wrongSims.length} 题`);
    b.detail.similar = [];
    renderView();
  });

    /* 个人笔记事件 */
  const noteSave = view.querySelector('#note-save');
  const noteInput = view.querySelector('#personal-note-input');
  if (noteSave && noteInput) {
    noteSave.addEventListener('click', () => {
      const text = noteInput.value.trim();
      const old = (q.personalNote || '').trim();
      if (text === old) { showToast('没有变化'); return; }
      q.personalNote = text;
      q.personalNoteUpdatedAt = text ? Date.now() : 0;
      saveQuestion(q);
      showToast(text ? '笔记已保存' : '笔记已清空');
      renderView();
    });
  }

  const noteClear = view.querySelector('#note-clear');
  if (noteClear && noteInput) {
    noteClear.addEventListener('click', () => {
      if (!confirm('清空笔记？')) return;
      noteInput.value = '';
      q.personalNote = '';
      q.personalNoteUpdatedAt = 0;
      saveQuestion(q);
      showToast('笔记已清空');
      renderView();
    });
  }

  // 支持 Ctrl/Cmd+S 保存当前笔记
  if (noteInput) {
    noteInput.addEventListener('keydown', e => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        noteSave?.click();
      }
    });
  }

    /* 追问 AI 事件 */
  const chatGoto = view.querySelector('#chat-goto-settings');
  if (chatGoto) chatGoto.addEventListener('click', openSettings);

  const chatClear = view.querySelector('#chat-clear');
  if (chatClear) chatClear.addEventListener('click', () => clearChat(q));

  // 快捷提问
  view.querySelectorAll('.chat-suggest-btn').forEach(b => {
    b.addEventListener('click', () => sendChatMessage(q, b.dataset.suggest));
  });

  // 输入框
  const chatInput = view.querySelector('#chat-input');
  if (chatInput) {
    chatInput.addEventListener('input', () => {
      state.browse.chatInput = chatInput.value;
    });
    chatInput.addEventListener('keydown', e => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        const text = chatInput.value.trim();
        if (text) sendChatMessage(q, text);
      }
    });
  }

  // 发送按钮
  const chatSend = view.querySelector('#chat-send');
  if (chatSend) chatSend.addEventListener('click', () => {
    const text = (chatInput?.value || '').trim();
    if (text) sendChatMessage(q, text);
  });

  /* 加载详情页图片 */
  if ((q.imageIds || []).length) {
    setTimeout(async () => {
      const wrap = document.getElementById('detail-images-wrap');
      if (!wrap) return;
      wrap.innerHTML = '';
      for (const id of q.imageIds) {
        const info = await loadImageInfo(id);
        if (!info) continue;
        const box = document.createElement('div');
        box.style.cssText = 'position:relative;display:inline-block;flex:0 0 auto';
        box.innerHTML = `
          <img src="${info.url}" class="detail-image" alt="题目图片">
          ${info.isThumb ? `<span class="thumb-badge" title="这是从其他设备同步过来的缩略图">📱 缩略图</span>` : ''}
        `;
        const img = box.querySelector('img');
        img.addEventListener('click', () => openImageLightbox(info.url));
        wrap.appendChild(box);
      }
    }, 0);
  }
}

/* ============ 个人笔记卡片 ============ */
function renderPersonalNoteBlock(q) {
  const collapsed = localStorage.getItem('xc_collapse_d_note') === '1';
  const hasNote = !!(q.personalNote && q.personalNote.trim());
  const updateTime = q.personalNoteUpdatedAt
    ? new Date(q.personalNoteUpdatedAt).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
    : '';

  return `
    <details class="card collapsible" ${collapsed ? '' : 'open'} data-collapse-key="xc_collapse_d_note">
      <summary>
        <div>
          <div class="card-title">📝 珍贵的个人笔记</div>
          <div class="card-sub">记录你对这道题的理解、顿悟、易错点</div>
        </div>
        <div style="display:flex;align-items:center;gap:10px;flex-shrink:0">
          ${hasNote ? `<span class="tag" style="background:var(--warn-soft);color:var(--warn)">已有笔记</span>` : `<span class="tag gray">未写</span>`}
          <svg class="chev" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="6 9 12 15 18 9"/>
          </svg>
        </div>
      </summary>
      <div class="card-body">
        <textarea id="personal-note-input" class="input" rows="3"
          placeholder="写下你的理解...">${esc(q.personalNote || '')}</textarea>
        <div style="display:flex;justify-content:space-between;align-items:center;margin-top:10px;gap:10px;flex-wrap:wrap">
          <div class="hint" style="font-size:11px;color:var(--text-3)">💡 每次编辑后记得点保存；笔记会自动同步到云端（如已配置）</div>
          <div style="display:flex;gap:8px">
            <button class="btn ghost sm" id="note-clear" ${!hasNote ? 'disabled' : ''}>清空</button>
            <button class="btn primary sm" id="note-save">保存笔记</button>
          </div>
        </div>
        
      </div>
    </details>
  `;
}


/* ============ 追问 AI ============ */
function renderChatBlock(q) {
  const b = state.browse;
  const history = q.chatHistory || [];
  const hasKey = !!getApiKey();
  const suggestions = q.chatSuggestions || [];
  const chatCollapsed = localStorage.getItem('xc_collapse_d_chat') === '1';
  const ROLES = getChatRoles();

  let html = `
    <details class="card collapsible" ${chatCollapsed ? '' : 'open'} data-collapse-key="xc_collapse_d_chat">
      <summary>
        <div>
          <div class="card-title">💬 追问 AI</div>
          <div class="card-sub">基于这道题向 AI 提问，直到彻底搞懂</div>
        </div>
        <div style="display:flex;align-items:center;gap:10px;flex-shrink:0">
          ${history.length ? `<span class="tag primary">${history.length} 条对话</span>` : ''}
          <svg class="chev" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="6 9 12 15 18 9"/>
          </svg>
        </div>
      </summary>
      <div class="card-body">
  `;

  if (!hasKey) {
    html += `
      <div class="empty" style="padding:20px 12px">
        <div class="empty-desc">需要先在设置页配置 API Key</div>
        <div class="actions" style="justify-content:center;margin-top:12px">
          <button class="btn primary" id="chat-goto-settings">去设置</button>
        </div>
      </div>
      </div></details>
    `;
    return html;
  }

  /* ============ 无历史：显示快捷提问 ============ */
  if (!history.length) {
    html += `
      <div class="chat-suggest">
        <div class="chat-suggest-label">💡 试试这样问：</div>
        <div class="chat-suggest-btns">
          <button class="chat-suggest-btn" data-suggest="为什么其他三个选项是错的？逐个讲一下">为什么其他选项错</button>
          <button class="chat-suggest-btn" data-suggest="用最通俗的话讲一遍这道题的解题思路">用最通俗的话讲</button>
          <button class="chat-suggest-btn" data-suggest="这道题最常见的陷阱是什么？我应该怎么避免">常见陷阱</button>
          <button class="chat-suggest-btn" data-suggest="有没有更快的解题方法或秒杀技巧？">有更快的解法吗</button>
          <button class="chat-suggest-btn" data-suggest="能举一个类似的例子，帮我理解这个知识点吗">举个例子</button>
        </div>
      </div>
    `;
  } else {
    /* ============ 有历史：渲染消息 ============ */
    html += `
      <div style="display:flex;justify-content:flex-end;margin-bottom:8px">
        <button class="btn ghost sm" id="chat-clear" title="清空该题的所有对话">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="3 6 5 6 21 6"/>
            <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
            <path d="M10 11v6M14 11v6"/>
            <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
          </svg>
          清空对话
        </button>
      </div>
      <div class="chat-history" id="chat-history">
        ${history.map((m, i) => {
          const isEditing = b.chatEditingIdx === i && m.role === 'user';
          const roleInfo = m.role === 'user' ? ROLES.me : ROLES.ai;
          if (m.role === 'user') {
            return `
              <div class="chat-msg user">
                <div class="chat-role">${renderAvatarHTML(roleInfo.avatar)}</div>
                ${isEditing ? `
                  <div style="flex:1;max-width:calc(100% - 40px);min-width:0">
                    <div class="chat-role-name" style="text-align:right">${esc(roleInfo.name)}</div>
                    <textarea class="input" id="edit-chat-input" rows="2" style="width:100%;font-size:13px;line-height:1.7">${esc(m.text)}</textarea>
                    <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:8px">
                      <button class="btn ghost sm" data-cancel-edit="${i}">取消</button>
                      <button class="btn primary sm" data-submit-edit="${i}">重新发送</button>
                    </div>
                  </div>
                ` : `
                  <div class="chat-user-wrap">
                    <button class="chat-edit-btn" data-edit-idx="${i}" title="编辑后重新发送">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                      </svg>
                    </button>
                    <div class="chat-role-name" style="text-align:right">${esc(roleInfo.name)}</div>
                    <div class="chat-text">${formatChatText(m.text)}</div>
                  </div>
                `}
              </div>
            `;
          } else {
            return `
              <div class="chat-msg ai">
                <div class="chat-role">${renderAvatarHTML(roleInfo.avatar)}</div>
                <div style="max-width:calc(100% - 40px);min-width:0">
                  <div class="chat-role-name">${esc(roleInfo.name)}</div>
                  <div class="chat-text">${formatChatText(m.text)}</div>
                </div>
              </div>
            `;
          }
        }).join('')}
        ${b.chatLoading ? `
          <div class="chat-msg ai">
            <div class="chat-role">${renderAvatarHTML(ROLES.ai.avatar)}</div>
            <div style="max-width:calc(100% - 40px);min-width:0">
              <div class="chat-role-name">${esc(ROLES.ai.name)}</div>
              <div class="chat-text" style="display:flex;align-items:center;gap:8px;color:var(--text-3)">
                <span class="spinner"></span> 思考中…
              </div>
            </div>
          </div>
        ` : ''}
      </div>
    `;

    if (!b.chatLoading && suggestions.length) {
      html += `
        <div class="chat-suggest-inline">
          <div class="label">💡 你可能还想问：</div>
          <div class="chat-suggest-btns">
            ${suggestions.map(s => `<button class="chat-suggest-btn" data-suggest="${esc(s)}">${esc(s)}</button>`).join('')}
          </div>
        </div>
      `;
    }
  }

  html += `
      <div class="chat-input-wrap">
        <textarea id="chat-input" class="input" placeholder="输入你的问题…（Enter 发送，Shift+Enter 换行）" ${b.chatLoading ? 'disabled' : ''}>${esc(b.chatInput)}</textarea>
        <button class="btn primary" id="chat-send" ${b.chatLoading ? 'disabled' : ''}>
          ${b.chatLoading ? '<span class="spinner"></span>' : '发送'}
        </button>
      </div>
      </div>
    </details>
  `;

  return html;
}

/* 简单格式化：加粗、换行、列表 */
function formatChatText(text) {
  let s = esc(text || '');
  // 加粗
  s = s.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
  // 列表项：把连续的 "- xxx" 打包成 ul
  s = s.replace(/^[ \t]*[-*]\s+(.+)$/gm, '<li>$1</li>');
  s = s.replace(/(?:<li>[\s\S]*?<\/li>\n?)+/g, m => `<ul>${m.replace(/\n/g, '')}</ul>`);
  // 把所有连续空行压成一个换行
  s = s.replace(/\n{2,}/g, '\n');
  s = s.replace(/\n/g, '<br>');
  // 保险：把残留的 <br><br>+ 压成一个
  s = s.replace(/(<br>){2,}/g, '<br>');
  return s;
}

/* 发送消息 */
async function sendChatMessage(q, text) {
  const b = state.browse;
  if (!text || !text.trim()) return;
  if (b.chatLoading) return;
  if (!getApiKey()) { alert('请先在设置页配置 API Key'); return; }

  if (!Array.isArray(q.chatHistory)) q.chatHistory = [];
  q.chatHistory.push({ role: 'user', text: text.trim(), t: Date.now() });
  b.chatInput = '';
  b.chatLoading = true;
  q.chatSuggestions = [];   // 提问时清空建议
  saveQuestion(q);
  renderView();

  requestAnimationFrame(() => {
    const h = document.getElementById('chat-history');
    if (h) h.scrollTop = h.scrollHeight;
  });

  try {
    const result = await askAIAboutQuestion(q, text.trim());
    q.chatHistory.push({ role: 'assistant', text: result.answer, t: Date.now() });
    q.chatSuggestions = result.suggestions;
    if (q.chatHistory.length > 40) q.chatHistory = q.chatHistory.slice(-40);
    saveQuestion(q);
  } catch (e) {
    q.chatHistory.push({ role: 'assistant', text: '❌ 出错了：' + e.message, t: Date.now() });
    q.chatSuggestions = [];
    saveQuestion(q);
  } finally {
    b.chatLoading = false;
    renderView();
    requestAnimationFrame(() => {
      const h = document.getElementById('chat-history');
      if (h) h.scrollTop = h.scrollHeight;
    });
  }
}
/* 调用 DeepSeek 对话 */
async function askAIAboutQuestion(q, question) {
  const apiKey = getApiKey();
  const sys = `你是行测答疑老师。学生正在看一道错题，会向你追问各种问题。

**必须只返回 JSON**（不要任何其他文字、不要 markdown 代码块包裹）：
{
  "answer": "回答正文。用通俗语言，不堆术语。简单问题 100 字以内，复杂问题 250 字以内。可以用 **加粗** 和 - 列表。",
  "suggestions": [
    "问题1（15字以内，口语化）",
    "问题2",
    "问题3"
  ]
}

【suggestions 强制要求】
- **每次都必须返回 2-3 条**，这是硬性要求。
- 建议要基于当前回答自然延伸，是学生大概率想接着问的。
- 不要和用户已经问过的问题重复。
- 口语化，像学生自己会问的（如"那 XX 情况怎么办"）。
- 只有当用户问的完全是封闭式问题（如"对不对？"）时，才可以少于 2 条。`;

  const qInfo = `【题目信息】
模块：${q.module}
题型：${q.type}
知识点：${(q.knowledgePoints || []).join('、')}
题干：${q.stem}
选项：
A. ${q.options[0]}
B. ${q.options[1]}
C. ${q.options[2]}
D. ${q.options[3]}
正确答案：${String.fromCharCode(65 + q.correctIdx)}. ${q.options[q.correctIdx]}
${q.originalExplanation ? '原解析：' + q.originalExplanation : ''}
${q.aiAnalysis && q.aiAnalysis.coreIdea ? 'AI 已分析核心：' + q.aiAnalysis.coreIdea : ''}`;

  const history = (q.chatHistory || []).slice(-7, -1);
  const messages = [
    { role: 'system', content: sys },
    { role: 'user', content: qInfo },
    ...history.map(m => ({ role: m.role, content: m.text })),
    { role: 'user', content: question }
  ];

  const res = await fetch('https://api.deepseek.com/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: 'deepseek-chat',
      messages,
      temperature: 0.6
    })
  });
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error(`API 请求失败 (${res.status})：${t.slice(0, 120)}`);
  }
  const data = await res.json();
  const raw = data.choices?.[0]?.message?.content?.trim() || '';

  // ============ 容错解析 ============
  let parsed = null;

  // 尝试 1：直接 JSON
  try { parsed = JSON.parse(raw); } catch {}

  // 尝试 2：剥掉 markdown 代码块再解析
  if (!parsed) {
    const mdMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (mdMatch) {
      try { parsed = JSON.parse(mdMatch[1].trim()); } catch {}
    }
  }

  // 尝试 3：提取第一个 {...} 大括号块
  if (!parsed) {
    const braceMatch = raw.match(/\{[\s\S]*\}/);
    if (braceMatch) {
      try { parsed = JSON.parse(braceMatch[0]); } catch {}
    }
  }

  let answer, suggestions;

  if (parsed && typeof parsed === 'object' && parsed.answer) {
    answer = String(parsed.answer).trim();
    suggestions = (Array.isArray(parsed.suggestions) ? parsed.suggestions : [])
      .map(s => String(s).trim()).filter(Boolean).slice(0, 3);
  } else {
    // 完全解析失败：把原文当答案（剥掉可能的 JSON 片段）
    console.warn('[追问] JSON 解析失败，原文：', raw);
    answer = raw
      .replace(/```[\s\S]*?```/g, '')
      .replace(/\{[\s\S]*\}/g, '')
      .trim() || raw || '（AI 未返回内容）';
    suggestions = [];
  }

  // ============ 兜底建议 ============
  if (!suggestions.length) {
    suggestions = genFallbackSuggestions(q);
  }

  return { answer, suggestions };
}

/* 当 AI 没给建议时，用兜底列表 */
function genFallbackSuggestions(q) {
  const asked = (q.chatHistory || [])
    .filter(m => m.role === 'user')
    .map(m => m.text);
  const candidates = [
    '能举个具体的例子吗',
    '如果考试遇到类似的题，怎么快速识别',
    '这个知识点还有哪些常见考法',
    '我容易在这里犯错，有什么口诀吗',
    '用一句话总结这道题的核心'
  ];
  const out = [];
  for (const c of candidates) {
    if (out.length >= 3) break;
    if (asked.some(a => a.includes(c) || c.includes(a))) continue;
    out.push(c);
  }
  return out;
}

/* 进入编辑态：把第 idx 条用户消息变成可编辑 */
function startEditChat(q, idx) {
  state.browse.chatEditingIdx = idx;
  renderView();
  requestAnimationFrame(() => {
    const ta = document.getElementById('edit-chat-input');
    if (ta) { ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length); }
  });
}

/* 提交编辑：删除该消息及之后的所有消息，重新发送 */
async function submitEditChat(q, idx, newText) {
  const b = state.browse;
  if (!newText || !newText.trim()) return;
  if (b.chatLoading) return;
  if (!getApiKey()) { alert('请先在设置页配置 API Key'); return; }

  // 保留 idx 之前的历史，删除 idx 及之后的所有
  q.chatHistory = (q.chatHistory || []).slice(0, idx);
  q.chatSuggestions = [];
  b.chatEditingIdx = null;

  // 作为新消息加入并发送
  await sendChatMessage(q, newText.trim());
}

/* 清空对话 */
function clearChat(q) {
  if (!q.chatHistory || !q.chatHistory.length) return;
  if (!confirm('清空这道题的所有对话记录？')) return;
  q.chatHistory = [];
  q.chatSuggestions = [];
  saveQuestion(q);
  renderView();
}

/* ---- 上一题 / 下一题 ---- */
function gotoAdjacentDetail(delta) {
  const b = state.browse;
  const ids = b.listIds || [];
  const curIdx = ids.indexOf(b.selectedId);
  const ni = curIdx + delta;
  if (ni < 0 || ni >= ids.length) return;
  const nid = ids[ni];
  const nq = questions.find(q => q.id === nid);
  if (!nq) return;
  b.selectedId = nid;
  b.detail = { question: nq, similar: [] };
  b.editing = false;
  b.editDraft = null;
  b.generating = { analysis: false, similar: false };
  renderView();
  window.scrollTo({ top: 0, behavior: 'instant' });
  document.documentElement.scrollTop = 0;
  document.body.scrollTop = 0;
  persistBrowseState();
}


/* ---- 编辑模式 ---- */
function renderBrowseEdit(view, q) {
  const d = state.browse.editDraft;
  const typeOptions = CATEGORIES[d.module] || [];
  const knownType = typeOptions.includes(d.type) ? d.type : typeOptions[0];

  view.innerHTML = `
    <div class="card">
      <div class="detail-header" style="flex-wrap:wrap;gap:8px">
        <button class="btn ghost sm" id="edit-cancel">← 取消</button>
        <div style="flex:1"></div>
        <span class="tag primary">编辑模式</span>
        <button class="btn primary sm" id="edit-save-top">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="20 6 9 17 4 12"/>
          </svg>
          保存修改
        </button>
      </div>

      <div style="margin-top:14px">
        <label>题干 <span class="req">*</span></label>
        <textarea id="e-stem" class="input" rows="3">${esc(d.stem)}</textarea>

        <div class="row4" style="margin-top:6px">
          ${['A','B','C','D'].map((L,i) => `
            <div>
              <label>选项 ${L}</label>
              <input id="e-opt-${i}" class="input" value="${esc(d.options[i] || '')}">
            </div>
          `).join('')}
        </div>

        <div class="row2">
          <div>
            <label>正确答案 <span class="req">*</span></label>
            <select id="e-correct" class="input">
              <option value="-1" ${d.correctIdx === -1 ? 'selected' : ''}>— 请选择 —</option>
              ${['A','B','C','D'].map((L,i) => `<option value="${i}" ${d.correctIdx === i ? 'selected' : ''}>选项 ${L}</option>`).join('')}
            </select>
          </div>
          <div>
            <label>模块 <span class="req">*</span></label>
            <select id="e-module" class="input">
              ${MODULES.map(m => `<option value="${esc(m)}" ${m === d.module ? 'selected' : ''}>${esc(m)}</option>`).join('')}
            </select>
          </div>
        </div>

        <div class="row2">
          <div>
            <label>题型 <span class="req">*</span></label>
            <select id="e-type" class="input">
              ${typeOptions.map(t => `<option value="${esc(t)}" ${t === knownType ? 'selected' : ''}>${esc(t)}</option>`).join('')}
            </select>
          </div>
          <div>
            <label>来源（可选）</label>
            <input id="e-source" class="input" value="${esc(d.source || '')}" placeholder="如：2023国考第32题">
          </div>
        </div>

        <div style="display:flex;gap:14px;align-items:flex-start;margin-top:14px;flex-wrap:wrap">
          <div style="flex:1;min-width:240px">
            <label style="margin-top:0">考察知识点 <span class="req">*</span></label>
            <div class="kp-wrap" id="e-kp-wrap">
              ${d.kpDraft.map((kp, i) => `
                <span class="kp-tag">${esc(kp)}<button data-kp-del="${i}" title="删除">×</button></span>
              `).join('')}
              <input id="e-kp-input" class="kp-input" placeholder="输入后回车添加" autocomplete="off">
            </div>
          </div>
          <div style="flex-shrink:0;padding-top:2px">
            <label style="margin-top:0">重要性</label>
            <div style="padding:8px 4px 0">
              <div id="edit-stars-wrap">${renderStars(d.stars || 0, { size: 20, interactive: true })}</div>
            </div>
          </div>
        </div>
        ${(q.imageIds || []).length ? `
          <label>题目图片（点右上角 × 可删除）</label>
          <div id="edit-images-wrap" style="display:flex;flex-wrap:wrap;gap:10px;margin-top:4px"></div>
        ` : ''}

        <label>原解析（可选）</label>
        <textarea id="e-expl" class="input" rows="3">${esc(d.originalExplanation || '')}</textarea>

        <div class="actions" style="margin-top:20px">
          <button class="btn primary" id="edit-save">保存修改</button>
          <button class="btn ghost" id="edit-cancel2">取消</button>
        </div>
      </div>
    </div>
  `;

  const backToList = () => {
    state.browse.editing = false;
    state.browse.editDraft = null;
    renderView();
  };

  view.querySelector('#edit-cancel').addEventListener('click', () => {
    if (!confirm('放弃本次修改？')) return;
    backToList();
  });
  view.querySelector('#edit-cancel2').addEventListener('click', () => {
    if (!confirm('放弃本次修改？')) return;
    backToList();
  });

  // 模块 → 题型联动
  const moduleSel = view.querySelector('#e-module');
  const typeSel = view.querySelector('#e-type');
  moduleSel.addEventListener('change', () => {
    const types = CATEGORIES[moduleSel.value] || [];
    typeSel.innerHTML = types.map(t => `<option value="${esc(t)}">${esc(t)}</option>`).join('');
  });

  // 知识点编辑
  const kpInput = view.querySelector('#e-kp-input');
  const kpWrap = view.querySelector('#e-kp-wrap');
  kpInput.addEventListener('keydown', e => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const v = kpInput.value.trim();
    if (!v) return;
    if (d.kpDraft.includes(v)) { kpInput.value = ''; return; }
    d.kpDraft.push(v);
    kpInput.value = '';
    const newTag = document.createElement('span');
    newTag.className = 'kp-tag';
    newTag.innerHTML = `${esc(v)}<button title="删除">×</button>`;
    kpWrap.insertBefore(newTag, kpInput);
    newTag.querySelector('button').addEventListener('click', () => {
      d.kpDraft = d.kpDraft.filter(x => x !== v);
      newTag.remove();
    });
  });
  view.querySelectorAll('[data-kp-del]').forEach(b => {
    b.addEventListener('click', e => {
      e.preventDefault();
      const i = parseInt(b.dataset.kpDel);
      d.kpDraft.splice(i, 1);
      renderView();
    });
  });
    /* 加载编辑页图片 */
  if ((q.imageIds || []).length) {
    setTimeout(async () => {
      const wrap = document.getElementById('edit-images-wrap');
      if (!wrap) return;
      wrap.innerHTML = '';
      for (const id of q.imageIds) {
        const url = await loadImageUrl(id);
        if (!url) continue;
        const box = document.createElement('div');
        box.style.cssText = 'position:relative;display:inline-block';
        box.innerHTML = `
          <img src="${url}" class="detail-image" style="max-height:200px;cursor:zoom-in">
          <button data-del-image="${id}" title="删除此图"
            style="position:absolute;top:6px;right:6px;width:26px;height:26px;border-radius:50%;
                   border:none;background:rgba(220,38,38,0.9);color:#fff;cursor:pointer;
                   font-weight:800;font-size:14px;line-height:1;display:flex;align-items:center;justify-content:center;padding:0">×</button>
        `;
        const img = box.querySelector('img');
        img.addEventListener('click', (e) => {
          if (e.target === img) openImageLightbox(url);
        });
        box.querySelector('[data-del-image]').addEventListener('click', () => {
          if (!confirm('删除这张图片？')) return;
          const idx = d.imageIds.indexOf(id);
          if (idx >= 0) d.imageIds.splice(idx, 1);
          box.remove();
        });
        wrap.appendChild(box);
      }
    }, 0);
  }

  // 星级
  const starsWrap = view.querySelector('#edit-stars-wrap');
  if (starsWrap) {
    bindStarPickers(starsWrap, (v) => { d.stars = v; });
  }

  // 保存
  const doSave = () => {
    const stem = view.querySelector('#e-stem').value.trim();
    if (!stem) { alert('题干不能为空'); return; }
    const options = [0,1,2,3].map(i => view.querySelector('#e-opt-' + i).value.trim());
    if (options.some(o => !o)) { alert('四个选项都要填'); return; }
    const correctIdx = parseInt(view.querySelector('#e-correct').value);
    if (correctIdx < 0 || correctIdx > 3) { alert('请选择正确答案'); return; }
    const module = view.querySelector('#e-module').value;
    const type = view.querySelector('#e-type').value;
    if (!module || !type) { alert('请选择模块和题型'); return; }
    if (!d.kpDraft || !d.kpDraft.length) { alert('至少填一个知识点'); return; }
    const originalExplanation = view.querySelector('#e-expl').value.trim();
    const source = view.querySelector('#e-source').value.trim();

    state.browse.editing = false;
    state.browse.editDraft = null;

    try {
      const stemChanged = stem !== q.stem;
      q.stem = stem;
      q.options = options;
      q.correctIdx = correctIdx;
      q.module = module;
      q.type = type;
      q.knowledgePoints = d.kpDraft.slice();
      q.originalExplanation = originalExplanation;
      q.source = source;
      q.stars = d.stars || 0;
      q.imageIds = (d.imageIds || []).slice();

      if (stemChanged) {
        q.aiEasyMistake = '';
        q.aiBetterSolution = '';
        q.aiAnalysis = null;
      }
    } catch (err) {
      console.error('[编辑] 应用修改失败：', err);
    }

    try {
      saveQuestion(q);
    } catch (err) {
      console.error('[编辑] saveQuestion 失败：', err);
      alert('保存到本地失败：' + err.message);
    }

    renderView();
    window.scrollTo({ top: 0, behavior: 'instant' });
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
    showToast('已保存修改');
  };

  view.querySelector('#edit-save').addEventListener('click', doSave);
  const saveTop = view.querySelector('#edit-save-top');
  if (saveTop) saveTop.addEventListener('click', doSave);
}

/* ---- AI：生成易错点 + 更好解法 ---- */
async function generateAnalysis(q, force = false) {
  if (!getApiKey()) { alert('请先配置 API Key'); return; }
  const b = state.browse;
  b.generating.analysis = true;
  renderView();

  try {
    const apiKey = getApiKey();
    const sys = `你是行测命题分析师，擅长把一道题讲透。用户给你一道行测题，请做深入分析。

返回 JSON：
{
  "coreIdea": "这道题最核心的一句话。20字以内，抓住关键矛盾",
  "keyPoints": [
    {
      "text": "题干中的关键片段，必须与题干原文完全一致，不能改一个字",
      "reason": "为什么这段是破题题眼，30-50字"
    }
  ],
  "breakthrough": "解题第一步应该抓什么？30-60字。具体说清看哪里、想什么",
  "optionAnalysis": [
    { "label": "A", "type": "right|wrong", "why": "选它/不选它的根本原因，30-50字" }
  ],
  "easyMistake": "最常见的错误思路是什么？为什么会掉坑？60-100字",
  "betterSolution": "有没有更本质或更快的分析方法？60-100字",
  "generalTip": "下次遇到同类题，通用的思考步骤是什么？分2-3步写，50-80字"
}

【keyPoints 关键要求】
1. **必须逐字复制题干中的原句片段**（连续的一段文字），不能改写、不能省略标点。
2. 提取 2-4 个片段，是"看到就能秒懂"的关键信息。例如：
   - 逻辑填空：起呼应作用的词、转折词、"相反""类似"等提示词
   - 主旨概括：主题词、转折后的核心句、结论句
   - 意图判断：问题描述、对策句、"意在""想表达"
   - 数量关系：关键数据、"是...倍""比...多""至少/最多"
   - 资料分析：时间限定词、单位、"同比/环比""增长/下降"
3. 每个片段不宜过长，一般 4-20 个字。
4. 如果整段都很关键，优先选最短的、能代表核心逻辑的那一段。
5. 如果实在找不出，keyPoints 返回空数组 []。

其他规则：
- 不要复述题干，直接给分析。
- optionAnalysis 必须逐项分析，不能跳过。
- betterSolution 优先给"换个角度秒杀"或"更稳的通用方法"。
- generalTip 要具体到"看什么→判断什么→选什么"。
- 只返回 JSON，不要 markdown 代码块。`;

    const user = `模块：${q.module}
题型：${q.type}
知识点：${(q.knowledgePoints || []).join('、')}
题干：${q.stem}
选项：
A. ${q.options[0]}
B. ${q.options[1]}
C. ${q.options[2]}
D. ${q.options[3]}
正确答案：${String.fromCharCode(65 + q.correctIdx)}. ${q.options[q.correctIdx]}
${q.originalExplanation ? '原解析：' + q.originalExplanation : ''}`;

    const res = await fetch('https://api.deepseek.com/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: [{ role: 'system', content: sys }, { role: 'user', content: user }],
        response_format: { type: 'json_object' },
        temperature: 0.4
      })
    });
    if (!res.ok) throw new Error('API 请求失败 (' + res.status + ')');
    const data = await res.json();
    const parsed = JSON.parse(data.choices?.[0]?.message?.content || '{}');

    q.aiAnalysis = {
      coreIdea: String(parsed.coreIdea || '').trim(),
      keyPoints: Array.isArray(parsed.keyPoints) ? parsed.keyPoints.map(k => ({
        text: String(k.text || '').trim(),
        reason: String(k.reason || '').trim()
      })).filter(k => k.text).slice(0, 4) : [],
      breakthrough: String(parsed.breakthrough || '').trim(),
      optionAnalysis: Array.isArray(parsed.optionAnalysis) ? parsed.optionAnalysis.map(o => ({
        label: String(o.label || '').toUpperCase().slice(0, 1),
        type: o.type === 'right' ? 'right' : 'wrong',
        why: String(o.why || '').trim()
      })).filter(o => o.label) : [],
      easyMistake: String(parsed.easyMistake || '').trim(),
      betterSolution: String(parsed.betterSolution || '').trim(),
      generalTip: String(parsed.generalTip || '').trim(),
      generatedAt: Date.now()
    };
    // 兼容旧字段
    q.aiEasyMistake = q.aiAnalysis.easyMistake;
    q.aiBetterSolution = q.aiAnalysis.betterSolution;

    saveQuestion(q);
    b.generating.analysis = false;
    renderView();
  } catch (e) {
    b.generating.analysis = false;
    alert('分析失败：' + e.message);
    renderView();
  }
}


/* ---- AI：生成举一反三 ---- */
async function generateSimilar(q) {
  if (!getApiKey()) { alert('请先配置 API Key'); return; }
  const b = state.browse;
  b.generating.similar = true;
  renderView();

  try {
    const apiKey = getApiKey();
    const result = await tryGenerateSimilar(apiKey, q);
    if (!result.length) throw new Error('AI 未能生成有效题目，请重试');
    b.detail.similar = result;
    b.generating.similar = false;
    renderView();
  } catch (e) {
    b.generating.similar = false;
    alert('生成失败：' + e.message);
    renderView();
  }
}

async function tryGenerateSimilar(apiKey, q, attempt = 1) {
  const sys = `你是行测出题人。用户给你一道题，请出**1-5 道**思路相同或知识点相同的题目。

返回 JSON：
{
  "items": [
    {
      "stem": "题干，横线用 ____ 表示。语句排序题保留 (1)(2)(3) 格式",
      "options": ["A选项","B选项","C选项","D选项"],
      "correctIdx": 0,
      "explanation": "本题解析，60-120字。说清为什么这么选",
      "knowledgePoints": ["知识点1","知识点2"]
    }
  ]
}

出题原则（重要）：
1. **宁缺毋滥**：如果只能出 1 道就出 1 道；能出 5 道就出 5 道。**绝不允许凑数、瞎编、或把同一道题换个数字重复**。
2. **知识内核必须一致**：新题必须考原题的核心知识点（如"转折关系"或"搭桥"），不能跑偏到其他题型。
3. **难度相当**：与原题难度持平或略高。
4. **每道题必须 4 个选项**，且**有且仅有一个**正确答案。
5. **选项要有区分度**：错误选项必须看起来像对的，不能是明显错误的。
6. 如果完全无法出同类题（题目太偏、知识点不清晰），返回 {"items":[]}。
7. 只返回 JSON，不要 markdown 代码块。`;

  const user = `模块：${q.module}
题型：${q.type}
知识点：${(q.knowledgePoints || []).join('、')}
原题：${q.stem}
选项：A.${q.options[0]} B.${q.options[1]} C.${q.options[2]} D.${q.options[3]}
正确答案：${String.fromCharCode(65 + q.correctIdx)}`;

  const res = await fetch('https://api.deepseek.com/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: 'deepseek-chat',
      messages: [{ role: 'system', content: sys }, { role: 'user', content: user }],
      response_format: { type: 'json_object' },
      temperature: attempt === 1 ? 0.7 : 0.5
    })
  });
  if (!res.ok) throw new Error('API 请求失败 (' + res.status + ')');
  const data = await res.json();
  const parsed = JSON.parse(data.choices?.[0]?.message?.content || '{}');
  const items = Array.isArray(parsed.items) ? parsed.items : [];

  const valid = items
    .map(it => {
      if (!it || !it.stem) return null;
      const opts = (Array.isArray(it.options) ? it.options : [])
        .map(s => stripOptionPrefix(String(s)));
      if (opts.length !== 4 || opts.some(o => !o)) return null;
      const ci = Number(it.correctIdx);
      if (!Number.isInteger(ci) || ci < 0 || ci > 3) return null;
      // 检查选项不重复
      if (new Set(opts).size !== 4) return null;
      return {
        stem: String(it.stem).trim(),
        options: opts,
        correctIdx: ci,
        explanation: String(it.explanation || '').trim(),
        knowledgePoints: (Array.isArray(it.knowledgePoints) ? it.knowledgePoints : [])
          .map(s => String(s)).filter(Boolean),
        module: q.module,
        type: q.type
      };
    })
    .filter(Boolean)
    .slice(0, 5);

  // 一次都没出 → 重试一次
  if (!valid.length && attempt === 1) {
    console.log('[举一反三] 首次生成失败，重试…');
    return tryGenerateSimilar(apiKey, q, 2);
  }
  return valid;
}

/* ============ 视图：AI 分析 ============ */
function renderAnalysis(view) {
  if (!questions.length) {
    view.innerHTML = `
      <div class="card">
        <div class="card-head">
          <div><div class="card-title">AI 深度分析</div><div class="card-sub">钻取式诊断</div></div>
        </div>
        <div class="empty">
          <div class="empty-icon">🧠</div>
          <div class="empty-title">还没有错题数据</div>
          <div class="empty-desc">去「错题收录」上传截图，AI 会自动归类，之后这里就能生成诊断报告。</div>
        </div>
      </div>
    `;
    return;
  }

  const scope = getAnalysisScope();
  const a = state.analysis;

  const totalAttempts = scope.totalWrong + scope.totalRight;
  const correctRate = totalAttempts ? Math.round(scope.totalRight / totalAttempts * 100) : 0;
  const maxWrongSum = scope.freq.length ? scope.freq[0].wrongSum : 1;
  const scopeTotal = scope.list.length || 1;

  let html = '';

  /* ============ Hero ============ */
  html += `
    <div class="analysis-hero">
      <div class="analysis-hero-head">
        <div>
          <div class="analysis-hero-title">AI 深度分析</div>
          <div class="analysis-hero-sub">钻取式诊断 · 从整体到细节</div>
        </div>
        <span class="tag" style="background:rgba(255,255,255,0.2);color:#fff;font-size:11px">Level ${scope.path.length}</span>
      </div>

      <div class="hero-crumbs">${renderHeroCrumbs(scope)}</div>

      <div class="hero-stats">
        <div class="hero-stat">
          <div class="hero-stat-label">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
            题目数
          </div>
          <div class="hero-stat-value">${scope.list.length}<span class="unit">题</span></div>
        </div>
        <div class="hero-stat">
          <div class="hero-stat-label">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
            累计答错
          </div>
          <div class="hero-stat-value">${scope.totalWrong}<span class="unit">次</span></div>
        </div>
        <div class="hero-stat">
          <div class="hero-stat-label">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
            正确率
          </div>
          <div class="hero-stat-value">${correctRate}<span class="unit">%</span></div>
        </div>
      </div>
    </div>
  `;

  /* ============ 钻取区 ============ */
  if (scope.nextLevel && scope.nextItems.length) {
    html += `
      <div class="card drill-section">
        <div class="drill-section-head">
          <div class="drill-section-title">${esc(scope.nextLevelTitle)}</div>
          <div class="drill-section-hint">点击卡片继续下钻</div>
        </div>
        <div class="drill-grid">
          ${scope.nextItems.map(it => {
            const pct = Math.round((it.count / scopeTotal) * 100);
            return `
              <div class="drill-card" data-nav-level="${scope.nextLevel}" data-nav-value="${esc(it.value)}">
                <div class="drill-card-top">
                  <div class="drill-name">${esc(it.name)}</div>
                  <svg class="drill-arrow" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
                </div>
                <div class="drill-meta">
                  <span class="drill-count-num">${it.count}</span>
                  <span class="drill-count-unit">题</span>
                  <span class="drill-meta-tail">占 ${pct}%</span>
                </div>
                <div class="drill-bar"><div class="drill-bar-fill" style="width:${pct}%"></div></div>
              </div>
            `;
          }).join('')}
        </div>
      </div>
    `;
  } else if (scope.path.length >= 2) {
    html += `
      <div class="card" style="padding:16px 20px;display:flex;align-items:center;gap:12px;background:var(--primary-soft);border-color:rgba(37,99,235,0.2)">
        <span style="font-size:20px">🎯</span>
        <div>
          <div style="font-size:13px;font-weight:700;color:var(--primary)">已到最细层级</div>
          <div style="font-size:12px;color:var(--text-2);margin-top:2px">当前范围共有 ${scope.list.length} 道题，AI 将基于这些题目做精细化诊断</div>
        </div>
      </div>
    `;
  }

  /* ============ 知识点频次 ============ */
  if (scope.freq.length) {
    const collapsed = localStorage.getItem('xc_collapse_freq') === '1';
    html += `
      <details class="card collapsible" ${collapsed ? '' : 'open'} data-collapse-key="xc_collapse_freq">
        <summary>
          <div>
            <div class="card-title">知识点错误频次</div>
            <div class="card-sub">按累计答错次数排序 · 共 ${scope.freq.length} 个知识点</div>
          </div>
          <svg class="chev" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="6 9 12 15 18 9"/>
          </svg>
        </summary>
        <div class="card-body">
          <div class="freq-block">
            ${scope.freq.slice(0, 12).map((f, i) => {
              const pct = Math.max(6, (f.wrongSum / maxWrongSum) * 100);
              const rankCls = i === 0 ? 'gold' : i === 1 ? 'silver' : i === 2 ? 'bronze' : '';
              return `
                <div class="freq-row">
                  <div class="freq-rank ${rankCls}">${i + 1}</div>
                  <div class="freq-body">
                    <div class="freq-name-row">
                      <div class="freq-name" title="${esc(f.kp)}">${esc(f.kp)}</div>
                      <span class="freq-count-chip">错 ${f.wrongSum} 次</span>
                    </div>
                    <div class="freq-bar">
                      <div class="freq-fill" style="width:${pct}%"></div>
                    </div>
                  </div>
                  <div class="freq-total">共 <b>${f.count}</b> 题</div>
                </div>
              `;
            }).join('')}
          </div>
        </div>
      </details>
    `;
  }
  /* ============ AI 报告 ============ */
  const reportCollapsed = localStorage.getItem('xc_collapse_report') === '1';
  html += `
    <details class="card collapsible" ${reportCollapsed ? '' : 'open'} data-collapse-key="xc_collapse_report">
      <summary>
        <div>
          <div class="card-title">AI 诊断报告</div>
          <div class="card-sub">错误原因 · 薄弱知识点 · 下一步方向</div>
        </div>
        <div style="display:flex;align-items:center;gap:10px;flex-shrink:0">
          ${a.report ? `<span class="tag success">已生成</span>` : a.loading ? `<span class="tag warn">生成中</span>` : `<span class="tag gray">未生成</span>`}
          <svg class="chev" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="6 9 12 15 18 9"/>
          </svg>
        </div>
      </summary>
      <div class="card-body">
        ${renderReportBody(scope)}
      </div>
    </details>
  `;

  view.innerHTML = html;
  bindAnalysisEvents(view, scope);
}

/* ---- 计算当前范围 ---- */
function getAnalysisScope() {
  const a = state.analysis;
  let list = questions.slice();
  const path = [{ label: '全部错题', level: 'root', value: null }];

  if (a.module) {
    list = list.filter(q => q.module === a.module);
    path.push({ label: a.module, level: 'module', value: a.module });
  }
  if (a.type) {
    list = list.filter(q => q.type === a.type);
    path.push({ label: a.type, level: 'type', value: a.type });
  }
  if (a.kp) {
    list = list.filter(q => (q.knowledgePoints || []).includes(a.kp));
    path.push({ label: a.kp, level: 'kp', value: a.kp });
  }

  // 累计统计
  const totalWrong = list.reduce((s, q) => s + (q.wrongCount || 0), 0);
  const totalRight = list.reduce((s, q) => s + (q.rightCount || 0), 0);

  // 知识点错误频次（仅当前范围内）
  const kpMap = new Map();
  list.forEach(q => {
    (q.knowledgePoints || []).forEach(k => {
      const e = kpMap.get(k) || { kp: k, count: 0, wrongSum: 0 };
      e.count++;
      e.wrongSum += (q.wrongCount || 0);
      kpMap.set(k, e);
    });
  });
  const freq = [...kpMap.values()].sort((a, b) => b.wrongSum - a.wrongSum);

  // 下一级
  let nextLevel = null, nextLevelTitle = '', nextItems = [];
  if (!a.module) {
    nextLevel = 'module';
    nextLevelTitle = '选择模块继续钻取';
    const m = new Map();
    list.forEach(q => m.set(q.module, (m.get(q.module) || 0) + 1));
    nextItems = [...m.entries()].map(([name, count]) => ({ name, count, value: name }))
      .sort((x, y) => y.count - x.count);
  } else if (!a.type) {
    nextLevel = 'type';
    nextLevelTitle = '选择题型继续钻取';
    const m = new Map();
    list.forEach(q => { if (q.type) m.set(q.type, (m.get(q.type) || 0) + 1); });
    nextItems = [...m.entries()].map(([name, count]) => ({ name, count, value: name }))
      .sort((x, y) => y.count - x.count);
  } else if (!a.kp) {
    nextLevel = 'kp';
    nextLevelTitle = '选择知识点继续钻取';
    nextItems = freq.map(f => ({ name: f.kp, count: f.count, value: f.kp }))
      .sort((x, y) => y.count - x.count);
  }

  return { list, path, totalWrong, totalRight, freq, nextLevel, nextLevelTitle, nextItems };
}

function renderHeroCrumbs(scope) {
  return scope.path.map((p, i) => {
    const isLast = i === scope.path.length - 1;
    const cls = isLast ? 'hero-crumb active' : 'hero-crumb';
    const data = isLast ? '' : `data-crumb-level="${p.level}" data-crumb-value="${esc(p.value || '')}"`;
    return `${i > 0 ? '<span class="hero-crumb-sep">›</span>' : ''}<span class="${cls}" ${data}>${esc(p.label)}</span>`;
  }).join('');
}

/* ---- AI 报告缓存 key ---- */
function analysisCacheKey() {
  const a = state.analysis;
  return `analysis:${a.module || 'ALL'}:${a.type || 'ALL'}:${a.kp || 'ALL'}`;
}

/* ---- 报告区域 HTML ---- */
function renderReportBody(scope) {
  const a = state.analysis;

  if (!getApiKey()) {
    return `
      <div class="report-empty">
        <div class="report-empty-icon">🔐</div>
        <div class="report-empty-title">需要配置 API Key</div>
        <div class="report-empty-desc">前往设置页填写 DeepSeek API Key 后才能生成 AI 报告。</div>
        <div class="actions" style="justify-content:center;margin-top:16px">
          <button class="btn primary" id="analysis-goto-settings">去设置</button>
        </div>
      </div>
    `;
  }

  if (a.loading) {
    return `
      <div class="report-loading">
        <div class="report-loading-ring"></div>
        <div class="report-loading-title">AI 正在深度分析…</div>
        <div class="report-loading-desc">基于 ${scope.list.length} 道错题、${scope.freq.length} 个知识点 · 通常需要 10-20 秒</div>
      </div>
    `;
  }

  if (!a.report) {
    const level = getAnalysisLevel();
    const levelText = {
      'all': '宏观战略诊断',
      'module': '模块深度诊断',
      'type': '题型深度诊断',
      'kp': '知识点专项诊断'
    }[level];
    const size = scope.list.length;
    return `
      <div class="report-empty">
        <div class="report-empty-icon">✨</div>
        <div class="report-empty-title">生成「${levelText}」</div>
        <div class="report-empty-desc">
          当前范围：<b>${scope.path.map(p => p.label).join(' › ')}</b><br>
          AI 会基于 ${size} 道错题、${scope.freq.length} 个知识点，做符合本层级的深度分析。
        </div>
        <div class="report-empty-meta">
          <span>📊 <b>${size}</b> 道错题</span>
          <span>🎯 <b>${scope.freq.length}</b> 个知识点</span>
          <span>⏱ 约 15 秒</span>
        </div>
        <div class="actions" style="justify-content:center;margin-top:18px">
          <button class="btn primary" id="gen-report" ${size === 0 ? 'disabled' : ''}>
            ${size === 0 ? '当前范围无数据' : '生成报告'}
          </button>
        </div>
      </div>
    `;
  }

  const r = a.report;
  const ageMs = Date.now() - r.generatedAt;
  const age = Math.floor(ageMs / 3600000);
  const ageText = age < 1 ? '刚刚生成' : age < 24 ? `${age} 小时前生成` : `${Math.floor(age/24)} 天前生成`;

  const levelLabel = {
    'all': '宏观战略',
    'module': '模块诊断',
    'type': '题型诊断',
    'kp': '知识点诊断'
  }[r.level || 'all'] || '深度分析';

  let html = '';

  /* 诊断结论 */
  if (r.headline) {
    html += `
      <div class="report-hero">
        <div class="report-hero-label">✦ ${levelLabel} · 诊断结论</div>
        <div class="report-hero-text">${esc(r.headline)}</div>
      </div>
    `;
  }

  /* 数据证据 */
  if (r.evidence && r.evidence.length) {
    html += `
      <div class="report-section">
        <div class="report-section-head">
          <div class="report-section-icon danger">📊</div>
          <div class="report-section-title">数据证据</div>
        </div>
        <ul style="list-style:none;padding:0;margin:0">
          ${r.evidence.map(e => `
            <li style="padding:10px 14px;background:var(--bg);border-radius:8px;margin-bottom:6px;
                 font-size:13px;line-height:1.7;color:var(--text);border-left:3px solid var(--primary)">
              ${esc(e)}
            </li>
          `).join('')}
        </ul>
      </div>
    `;
  }

  /* 根源分析 */
  if (r.rootCause && (r.rootCause.symptom || r.rootCause.deeper)) {
    html += `
      <div class="report-section">
        <div class="report-section-head">
          <div class="report-section-icon warn">🔍</div>
          <div class="report-section-title">根源分析</div>
        </div>
        ${r.rootCause.symptom ? `
          <div style="padding:12px 14px;background:var(--warn-soft);border-radius:8px;margin-bottom:8px">
            <div style="font-size:11px;font-weight:700;color:var(--warn);letter-spacing:0.3px;margin-bottom:4px">表面现象</div>
            <div style="font-size:13px;line-height:1.7;color:var(--text)">${esc(r.rootCause.symptom)}</div>
          </div>
        ` : ''}
        ${r.rootCause.deeper ? `
          <div style="padding:12px 14px;background:var(--danger-soft);border-radius:8px;margin-bottom:8px">
            <div style="font-size:11px;font-weight:700;color:var(--danger);letter-spacing:0.3px;margin-bottom:4px">根本原因</div>
            <div style="font-size:13px;line-height:1.7;color:var(--text)">${esc(r.rootCause.deeper)}</div>
          </div>
        ` : ''}
        ${r.rootCause.habit ? `
          <div style="padding:12px 14px;background:var(--surface-2);border-radius:8px">
            <div style="font-size:11px;font-weight:700;color:var(--text-3);letter-spacing:0.3px;margin-bottom:4px">可能形成的不良习惯</div>
            <div style="font-size:13px;line-height:1.7;color:var(--text-2)">${esc(r.rootCause.habit)}</div>
          </div>
        ` : ''}
      </div>
    `;
  }

  /* 薄弱点 */
  if (r.weakPoints && r.weakPoints.length) {
    html += `
      <div class="report-section">
        <div class="report-section-head">
          <div class="report-section-icon danger">🎯</div>
          <div class="report-section-title">薄弱环节</div>
        </div>
        ${r.weakPoints.map(w => {
          const sev = ['high','medium','low'].includes(w.severity) ? w.severity : 'medium';
          const sevLabel = sev === 'high' ? '重点补强' : sev === 'medium' ? '需要加强' : '留意';
          return `
            <div class="weak-item ${sev}">
              <div class="weak-sev-dot"></div>
              <div class="weak-body">
                <div class="weak-head">
                  <div class="weak-name">${esc(w.name || '')}</div>
                  <span class="weak-sev-tag ${sev}">${sevLabel}</span>
                </div>
                ${w.evidence ? `<div style="font-size:12.5px;line-height:1.7;color:var(--text-2);margin-bottom:6px"><b style="color:var(--text)">证据：</b>${esc(w.evidence)}</div>` : ''}
                ${w.impact ? `<div style="font-size:12.5px;line-height:1.7;color:var(--danger)"><b>影响：</b>${esc(w.impact)}</div>` : ''}
              </div>
            </div>
          `;
        }).join('')}
      </div>
    `;
  }

  /* 避坑 */
  if (r.doNot && r.doNot.length) {
    html += `
      <div class="report-section">
        <div class="report-section-head">
          <div class="report-section-icon warn">🚫</div>
          <div class="report-section-title">避坑提示</div>
        </div>
        <ul style="list-style:none;padding:0;margin:0">
          ${r.doNot.map(d => `
            <li style="padding:10px 14px;background:var(--warn-soft);border-radius:8px;margin-bottom:6px;
                 font-size:13px;line-height:1.7;color:var(--text);border-left:3px solid var(--warn)">
              ${esc(d)}
            </li>
          `).join('')}
        </ul>
      </div>
    `;
  }

  html += `
    <div class="report-footer">
      <div class="report-footer-meta">
        <span class="dot-live"></span>
        <span>${ageText} · 缓存 14 天</span>
      </div>
      <button class="btn ghost sm" id="regen-report">重新生成</button>
    </div>
  `;

  return html;
}

/* ---- 事件绑定 ---- */
function bindAnalysisEvents(view, scope) {
  // 面包屑
  view.querySelectorAll('[data-crumb-level]').forEach(el => {
    el.addEventListener('click', () => {
      const lv = el.dataset.crumbLevel;
      if (lv === 'root') navToAnalysis(null, null, null);
      else if (lv === 'module') navToAnalysis(state.analysis.module, null, null);
      else if (lv === 'type') navToAnalysis(state.analysis.module, state.analysis.type, null);
    });
  });

  // 钻取卡片
  view.querySelectorAll('[data-nav-level]').forEach(el => {
    el.addEventListener('click', () => {
      const lv = el.dataset.navLevel;
      const val = el.dataset.navValue;
      if (lv === 'module') navToAnalysis(val, null, null);
      else if (lv === 'type') navToAnalysis(state.analysis.module, val, null);
      else if (lv === 'kp') navToAnalysis(state.analysis.module, state.analysis.type, val);
    });
  });

  const goto = view.querySelector('#analysis-goto-settings');
  if (goto) goto.addEventListener('click', openSettings);

  const gen = view.querySelector('#gen-report');
  if (gen) gen.addEventListener('click', generateReport);

  const regen = view.querySelector('#regen-report');
  if (regen) regen.addEventListener('click', () => {
    if (!confirm('重新生成会覆盖当前报告，确定？')) return;
    generateReport();
  });
    // 记录折叠状态
  view.querySelectorAll('details[data-collapse-key]').forEach(d => {
    d.addEventListener('toggle', () => {
      localStorage.setItem(d.dataset.collapseKey, d.open ? '0' : '1');
    });
  });
}

/* ---- 切换范围 ---- */
async function navToAnalysis(module, type, kp) {
  const a = state.analysis;
  a.module = module || null;
  a.type = type || null;
  a.kp = kp || null;
  a.report = null;
  a.loading = false;
  renderView();

  // 尝试读缓存
  const key = analysisCacheKey();
  try {
    const cached = await getMeta(key);
    // 检查用户是否还在同一范围
    if (analysisCacheKey() !== key) return;
        const CACHE_TTL = 14 * 24 * 3600 * 1000;   // 14 天
    if (cached && cached.generatedAt && Date.now() - cached.generatedAt < CACHE_TTL) {
      a.report = cached;
      renderView();
    }
  } catch (e) { /* ignore */ }
}

/* ---- 生成 AI 报告 ---- */
async function generateReport() {
  if (!getApiKey()) { alert('请先配置 API Key'); return; }
  const a = state.analysis;
  a.loading = true;
  renderView();

  try {
    const scope = getAnalysisScope();
    const apiKey = getApiKey();
    const level = getAnalysisLevel();   // 'all' | 'module' | 'type' | 'kp'

    // 构造用户数据
    const dataPayload = buildAnalysisPayload(scope, level);

    // 按层级选 system prompt
    const sys = buildAnalysisPrompt(level);

    const res = await fetch('https://api.deepseek.com/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: [
          { role: 'system', content: sys },
          { role: 'user', content: dataPayload }
        ],
        response_format: { type: 'json_object' },
        temperature: 0.4
      })
    });
    if (!res.ok) throw new Error('API 请求失败 (' + res.status + ')');
    const data = await res.json();
    const parsed = JSON.parse(data.choices?.[0]?.message?.content || '{}');

    const report = {
      _v: 2,
      level,
      scope: { module: a.module, type: a.type, kp: a.kp },
      ...parsed,
      generatedAt: Date.now()
    };

    a.report = report;
    a.loading = false;
    await setMeta(analysisCacheKey(), report);
    renderView();
  } catch (e) {
    a.loading = false;
    alert('生成失败：' + e.message);
    renderView();
  }
}

/* 判断当前面包屑层级 */
function getAnalysisLevel() {
  const a = state.analysis;
  if (a.kp) return 'kp';
  if (a.type) return 'type';
  if (a.module) return 'module';
  return 'all';
}

/* 构造给 AI 的数据 */
function buildAnalysisPayload(scope, level) {
  const a = state.analysis;
  const lines = [];

  lines.push(`【层级】${scope.path.map(p => p.label).join(' > ')}`);
  lines.push(`【错题总数】${scope.list.length}`);
  lines.push(`【累计答错次数】${scope.totalWrong}`);

  const rep3 = scope.list.filter(q => (q.wrongCount || 0) >= 3).length;
  const rep5 = scope.list.filter(q => (q.wrongCount || 0) >= 5).length;
  lines.push(`【反复错（≥3次）】${rep3} 道`);
  if (rep5) lines.push(`【顽固错（≥5次）】${rep5} 道`);
  lines.push('');

  const dist = { '1次': 0, '2次': 0, '3-4次': 0, '5次+': 0 };
  scope.list.forEach(q => {
    const w = q.wrongCount || 0;
    if (w <= 1) dist['1次']++;
    else if (w === 2) dist['2次']++;
    else if (w <= 4) dist['3-4次']++;
    else dist['5次+']++;
  });
  const distStr = Object.entries(dist).filter(([k,v]) => v).map(([k,v]) => `${k}: ${v}道`).join('，');
  lines.push(`【错误次数分布】${distStr}`);
  lines.push('');

  if (level === 'all') {
    const byModule = {};
    scope.list.forEach(q => {
      const m = q.module || '未分类';
      if (!byModule[m]) byModule[m] = { count: 0, wrong: 0, types: {}, kps: {} };
      byModule[m].count++;
      byModule[m].wrong += q.wrongCount || 0;
      if (q.type) byModule[m].types[q.type] = (byModule[m].types[q.type] || 0) + 1;
      (q.knowledgePoints || []).forEach(k => {
        byModule[m].kps[k] = (byModule[m].kps[k] || 0) + (q.wrongCount || 0);
      });
    });
    lines.push('【各模块错题分布（按累计答错次数降序）】');
    Object.entries(byModule).sort((x, y) => y[1].wrong - x[1].wrong).forEach(([m, s]) => {
      const topTypes = Object.entries(s.types).sort((x, y) => y[1] - x[1]).slice(0, 5)
        .map(([t, c]) => `${t}(${c}题)`).join('、');
      const topKps = Object.entries(s.kps).sort((x, y) => y[1] - x[1]).slice(0, 5)
        .map(([k, c]) => `${k}(错${c}次)`).join('、');
      lines.push(`- ${m}：${s.count} 题，累计错 ${s.wrong} 次`);
      lines.push(`  常错题型：${topTypes || '—'}`);
      lines.push(`  常错知识点：${topKps || '—'}`);
    });
    lines.push('');
  }

  if (level === 'module' || level === 'type') {
    const byType = {};
    scope.list.forEach(q => {
      const t = q.type || '未分类';
      if (!byType[t]) byType[t] = { count: 0, wrong: 0, kps: {}, repeated: 0 };
      byType[t].count++;
      byType[t].wrong += q.wrongCount || 0;
      if ((q.wrongCount || 0) >= 3) byType[t].repeated++;
      (q.knowledgePoints || []).forEach(k => {
        byType[t].kps[k] = (byType[t].kps[k] || 0) + (q.wrongCount || 0);
      });
    });
    lines.push('【各题型错题分布（按累计答错次数降序）】');
    Object.entries(byType).sort((x, y) => y[1].wrong - x[1].wrong).forEach(([t, s]) => {
      const topKps = Object.entries(s.kps).sort((x, y) => y[1] - x[1]).slice(0, 6)
        .map(([k, c]) => `${k}(错${c}次)`).join('、');
      lines.push(`- ${t}：${s.count} 题，累计错 ${s.wrong} 次，反复错 ${s.repeated} 道`);
      lines.push(`  常错知识点：${topKps || '—'}`);
    });
    lines.push('');
  }

  if (scope.freq.length) {
    lines.push('【知识点错误频次】');
    scope.freq.slice(0, 15).forEach(f => {
      lines.push(`- ${f.kp}：${f.count} 题，累计错 ${f.wrongSum} 次`);
    });
    lines.push('');
  }

  /* 误选模式 —— 判断错误类型的关键 */
  const wrongChoiceMap = {};
  scope.list.forEach(q => {
    (q.wrongHistory || []).forEach(sel => {
      const optText = (q.options[sel] || '').slice(0, 20);
      if (!optText) return;
      wrongChoiceMap[optText] = (wrongChoiceMap[optText] || 0) + 1;
    });
    (q.attemptHistory || []).forEach(h => {
      if (h.ok) return;
      const optText = (q.options[h.sel] || '').slice(0, 20);
      if (!optText) return;
      wrongChoiceMap[optText] = (wrongChoiceMap[optText] || 0) + 1;
    });
  });
  const topWrong = Object.entries(wrongChoiceMap).sort((a, b) => b[1] - a[1]).slice(0, 10);
  if (topWrong.length) {
    lines.push('【经常被误选的选项内容（截断 20 字，反映错误模式）】');
    topWrong.forEach(([t, c]) => lines.push(`- "${t}"：误选 ${c} 次`));
    lines.push('');
  }

  lines.push('【错题明细（按错误次数降序，最多 25 条）】');
  const sorted = [...scope.list].sort((a, b) => (b.wrongCount || 0) - (a.wrongCount || 0)).slice(0, 25);
  sorted.forEach((q, i) => {
    lines.push(`${i + 1}. [错${q.wrongCount || 0}次] ${q.module} · ${q.type}`);
    lines.push(`   知识点：${(q.knowledgePoints || []).join('、')}`);
    lines.push(`   题干：${q.stem.slice(0, 100)}${q.stem.length > 100 ? '…' : ''}`);
    lines.push(`   正确答案：${String.fromCharCode(65 + q.correctIdx)}. ${q.options[q.correctIdx]}`);
    const wrongOpts = (q.wrongHistory || []).map(i => `选${String.fromCharCode(65 + i)}. ${q.options[i].slice(0, 15)}`);
    if (wrongOpts.length) lines.push(`   曾错选：${wrongOpts.join('；')}`);
  });

  return lines.join('\n');
}

/* 按层级生成 system prompt */
function buildAnalysisPrompt(level) {
  const commonHead = `【背景说明（极其重要）】
- 这是用户的**错题本**，所有题目都是做错后才被收录的。
- **绝对不要**计算或提及"正确率"，因为天然是 0%，毫无意义。
- 你的任务是分析**错题本身的分布、错误次数、误选内容**，找出薄弱环节。

【判断薄弱的依据】
1. 错题在**哪个模块/题型/知识点**最集中 → 那个方向最薄弱
2. **错误次数多**的题（≥3次）说明反复踩坑，是顽固短板
3. **被误选的选项内容**能反映错误模式（如总选近义词、总被绝对化词骗、总选对策项）
4. 累计答错次数按模块/题型排序，前几名是优先补强对象`;

  const commonTail = `
【输出格式】严格 JSON：
{
  "headline": "一句话诊断，15-25字，直指要害",
  "evidence": ["数据证据1", "证据2", "证据3"],
  "rootCause": {
    "symptom": "表面现象，30-50字",
    "deeper": "根本原因，50-80字",
    "habit": "可能的不良做题习惯，30-50字"
  },
  "weakPoints": [
    {
      "name": "知识点/能力名",
      "severity": "high|medium|low",
      "evidence": "具体证据，引用错题数/错误次数/典型误选",
      "impact": "放任不管的代价"
    }
  ],
  "plan": [
    {
      "phase": "阶段名（如'第1周'）",
      "goal": "可衡量的目标",
      "actions": ["具体动作1", "动作2", "动作3"],
      "check": "检验标准",
      "time": "每天/每周投入"
    }
  ],
  "doNot": ["要避免的误区1", "误区2"]
}

【通用要求】
1. 禁用"加强练习""夯实基础""查漏补缺"这类废话。每条建议都要能落到具体动作。
2. 建议必须可执行：说清楚"做什么、做多少、怎么检验"。
3. 引用数据必须用具体数字（错题数、错误次数、误选内容）。
4. **绝对不要提"正确率"**。
5. 只返回 JSON，不要 markdown 代码块。`;

  if (level === 'all') {
    return `你是行测备考策略师。用户给你的是**全部错题**数据，请做**宏观战略诊断**。

${commonHead}

【核心任务】
1. 从各模块的**错题数量分布**和**累计错误次数**，判断用户整体最大短板在哪。
2. 指出**必须优先补强的 1-2 个模块**，并说明为什么（基于错题集中度）。
3. 识别用户的"系统性弱点"——不是某个知识点，而是某种**能力缺失**（如审题太快、逻辑跳跃、总被近义词骗、对转折词不敏感）。
4. 给出 2-3 个月的**分阶段战略**：第一阶段补什么、第二阶段练什么、第三阶段冲刺什么。
5. 建议要有取舍——明确说"XX模块错题少，可以暂时放一放"。

【输出要求】
- weakPoints 聚焦**模块级**薄弱。
- plan 是**长周期**的（2-3 个月），每阶段目标要体现"从 X 提升到 Y"。
- 最后要有"战略优先级"判断：如果时间有限，先做什么。
${commonTail}`;
  }

  if (level === 'module') {
    return `你是行测单模块教练。用户给你的是**某个模块下的全部错题**，请做**模块级深度诊断**。

${commonHead}

【核心任务】
1. 分析这个模块的错题分布：哪些**题型**错题最多、哪些**知识点**反复出现。
2. 从**误选的选项内容**判断错误模式（如逻辑填空总选近义词、资料分析总算错单位）。
3. 判断失分**根源**：是知识不牢？方法不对？还是某种**做题习惯**？
4. 分题型给出**该模块特有的解题方法**：应该怎么读题、怎么排除、怎么验证。
5. 给出**可操作的分阶段训练计划**。

【输出要求】
- weakPoints 聚焦**题型级或能力级**薄弱。
- plan 具体到"每天做几道/几篇、用什么材料、怎么复盘"。
- 如果能从错题分布看出**做题速度问题**，必须专门指出。
${commonTail}`;
  }

  if (level === 'type') {
    return `你是行测单题型教练。用户给你的是**某个题型下的全部错题**，请做**题型级深度诊断**。

${commonHead}

【核心任务】
1. 分析该题型的**常见陷阱**：用户反复踩的坑是什么（从误选内容看）。
2. 分析该题型的**解题套路**：正确的思考步骤应该是什么，用户在哪一步出错。
3. 判断用户对这个题型的**掌握程度**：是完全不会？还是容易粗心？还是方法不到位？
4. 给出**针对性训练方案**。

【输出要求】
- weakPoints 聚焦**知识点/解题环节级**薄弱。
- plan 具体到"每天几道题、做完怎么复盘、错题怎么归类"。
- 给出该题型的**3-5 条通用解题原则**。
${commonTail}`;
  }

  return `你是行测知识点专项教练。用户给你的是**某个具体知识点下的全部错题**，请做**知识点级深度诊断**。

${commonHead}

【核心任务】
1. 分析用户对这个知识点的**具体误区**：是从概念上就不清楚？还是应用时容易混淆？
2. 指出这个知识点的**本质规律**（用通俗语言讲清楚，不要背定义）。
3. 给出**这个知识点的通用解题步骤**：第一步看什么、第二步判断什么、第三步怎么选。
4. 给出**针对性训练**。

【输出要求】
- headline 要说清"你的问题到底出在哪"（如"你把'转折'当'因果'，方向全错了"）。
- evidence 要引用具体的错误选项和正确选项的对比。
- rootCause.deeper 要讲**知识点的本质**，不是表面描述。
- plan 要极其具体。
${commonTail}`;
}


/* ============ 导航辅助 ============ */
function openSettings() {
  try {
    if (state.mode !== 'settings') {
      // 记住进入设置前的 Tab（供返回用）
      localStorage.setItem('xc_last_non_settings', state.mode);
      state.prevMode = state.mode;
    }
    state.mode = 'settings';
    saveCurrentMode();
    renderView();
  } catch (err) {
    console.error('打开设置失败：', err);
    alert('打开设置失败：' + err.message);
  }
}

function goBack() {
  // 从设置页返回时，优先用最近一次非 settings 的 Tab
  if (state.mode === 'settings') {
    const lastNonSettings = localStorage.getItem('xc_last_non_settings');
    state.mode = (lastNonSettings && ['collect','exam','browse','analysis'].includes(lastNonSettings))
      ? lastNonSettings
      : (state.prevMode && state.prevMode !== 'settings' ? state.prevMode : 'collect');
  } else {
    state.mode = state.prevMode || 'collect';
  }
  saveCurrentMode();
  renderView();
}

/* ============ 主渲染 ============ */
function renderView() {
  // 主 nav 高亮
  document.querySelectorAll('.nav button').forEach(b => b.classList.toggle('active', b.dataset.mode === state.mode));
  // 设置图标高亮
  const setBtn = document.getElementById('settingsBtn');
  if (setBtn) setBtn.classList.toggle('active', state.mode === 'settings');

  const view = document.getElementById('view');
  if (state.mode === 'collect') renderCollect(view);
  else if (state.mode === 'exam') renderExam(view);
  else if (state.mode === 'browse') renderBrowse(view);
  else if (state.mode === 'notes') renderNotes(view);
  else if (state.mode === 'analysis') renderAnalysis(view);
  else if (state.mode === 'settings') renderSettings(view);
  updateStatusChip();
}