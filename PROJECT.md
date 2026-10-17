# 行测错题本 · AI 学习助手

## 一、项目概述

纯浏览器端（无后端）的行测备考错题本应用。支持截图 OCR 识别 → AI 自动归类 → 错题练习 → AI 深度分析 → 云同步的完整闭环。

**核心目标**：把"做错的题"变成"吃透的知识点"，用 AI 辅助查漏补缺。

**部署方式**：

- 本地：`python -m http.server`（**必须走 HTTP，不能 file://**）
- 线上：GitHub Pages（HTTPS）

**依赖**：

- DeepSeek API（AI 结构化、分析、对话、出题）
- PaddleOCR.js + Tesseract.js（OCR 识别）
- pinyin-pro（词库拼音排序）
- GitHub Gist（云同步）
- ImgBB / 蜜蜂图床（图片同步）

---

## 二、文件结构

```

/
├── index.html              # 主页面（唯一入口）
├── PROJECT.md              # 本文档
├── 启动.bat / 启动.command   # 本地启动脚本
├── 启动.py                  # 带 no-cache 的 HTTP 服务器
├── sw.js                   # Service Worker（缓存 OCR CDN 资源）
├── css/
│   └── style.css           # 全部样式
└── js/
    ├── config.js           # 常量、state 定义、工具配置
    ├── db.js               # IndexedDB 层 + 图片存储
    ├── tools.js            # 通用工具函数
    ├── ocr.js              # OCR 处理（PaddleOCR / Tesseract）
    ├── sync.js             # Gist 同步 + 图床上传
    ├── render.js           # 所有视图渲染（最核心，超长）
    └── boot.js             # 启动流程、快捷键、事件委托



**加载顺序**（index.html 里）：
```

config.js → db.js → tools.js → ocr.js → sync.js → render.js → boot.js

```

---

## 三、数据模型

### 3.1 题目（questions）

IndexedDB store `questions`，keyPath = `id`。

```javascript
{
  id: string,
  stem: string,                 // 题干，用 ____ 表示空缺
  options: [string×4],          // ABCD 四项（不带前缀）
  correctIdx: 0..3,
  module: string,               // 模块（言语理解 / 数量关系 / 判断推理 / 资料分析 / 常识判断 / 政治理论）
  type: string,                 // 题型（如"逻辑填空""图形推理"）
  knowledgePoints: [string],    // 知识点（AI 生成，用户可改）
  originalExplanation: string,  // 原解析
  source: string,               // 来源（如"2023国考第32题"）
  stars: 0..5,                  // 重要程度（用户标记）
  imageIds: [string],           // 关联图片 ID
  wrongCount: number,           // 累计答错次数
  rightCount: number,           // 累计答对次数
  wrongHistory: [number],       // 曾错选的选项索引
  attemptHistory: [{ t, sel, ok }],  // 最近 20 次作答
  personalNote: string,         // 个人笔记（"珍贵的个人笔记"）
  personalNoteUpdatedAt: number,
  aiAnalysis: {                 // AI 单题分析结果
    myAnswerIdx: 0..3,          // AI 独立判断的答案
    myAnswerConfidence: 'high'|'medium'|'low',
    answerMismatch: boolean,    // 是否与用户录入答案不一致
    coreIdea: string,
    keyPoints: [{ text, reason }],  // 破题题眼
    breakthrough: string,
    optionAnalysis: [{ label, type, why }],
    easyMistake: string,
    betterSolution: string,
    generalTip: string,
    reasoning: string,          // 深度思考时的思维链
    thinkingUsed: boolean,
    generatedAt: number
  } | null,
  chatHistory: [{ role, text, t }],  // 追问 AI 历史（最多 40 条）
  chatSuggestions: [string],     // AI 建议的下一轮问题
  updatedAt: number,
  createdAt: number
}
```

### 3.2 词语（words）

IndexedDB store `words`，keyPath = `id`。

```javascript
{
  id: string,
  word: string,                 // 词语（如"大相径庭"）
  correct: string,              // 正确释义
  distractors: [string],        // 干扰项释义（3 个）
  synonyms: [{ word, definition }],  // 近义词（2-4 个）
  note: string,                 // 辨析笔记
  wrong: number,                // 累计答错次数
  right: number,                // 连续答对次数（答错归零）
  lastPracticedAt: number,      // 上次练习时间（用于艾宾浩斯曲线）
  updatedAt: number,
  createdAt: number
}
```

### 3.3 图片（images）

IndexedDB store `images`，keyPath = `id`。

```javascript
{
  id: string,                   // 'img_xxx'
  blob: Blob,                   // 原图
  createdAt: number
}
```

**图片同步机制**：上传到图床（ImgBB / 蜜蜂图床），URL 存到 `meta` 表的 `imageUrlMap`（`{ imgId: url }`）。Gist 里只存 URL，不存图片本体。

### 3.4 meta 表

| key                               | value              | 用途                             |
| --------------------------------- | ------------------ | -------------------------------- |
| `deletedIds`                    | `[string]`       | 已删除题的 id 列表（跨设备同步） |
| `lastSyncedAt`                  | `number`         | 上次同步时间戳                   |
| `imageUrlMap`                   | `{ imgId: url }` | 图片 ID 到图床 URL 的映射        |
| `settings`                      | `{}`             | 预留                             |
| `analysis:<module>:<type>:<kp>` | AI 报告对象        | AI 深度分析缓存（TTL 14 天）     |

---

## 四、核心功能模块

### 4.1 错题收录（`renderCollect`）

**流程**：

1. 上传/粘贴截图 → 存 IDB → OCR（PaddleOCR 优先，失败降级 Tesseract）
2. 用户可编辑 OCR 文本
3. 点「AI 结构化」→ 调 DeepSeek → 返回题目数组
4. 逐题确认：题干、选项、答案、模块、题型、知识点、重要星级、关联图片
5. 「全部保存」→ 查重 → 入库

**关键特性**：

- 支持多图（材料 + 小题），OCR 文本合并后整体交给 AI
- 图片编辑器（裁剪/旋转，点击上传时触发）
- 题目来源全局共享（保存后**不清空**，方便连续录入）
- 图形推理跳过查重（题目文字太像）
- 图形推理/资料分析默认**不勾选**图片，需手动选

### 4.2 错题考试（`renderExam`）

**流程**：

1. 筛选：模块 → 题型 → 知识点（多选）
2. 抽题数量（默认 10 题）
3. 逐题作答：选对变绿，选错变红并显示正确答案
4. 交卷 → 成绩页（速度表 + 对错对抗条 + 错题回顾）

**速度表**：根据模块基准用时算实际/理想比，显示"快/正常/慢"评级。

### 4.3 错题查看（`renderBrowse`）

**列表页**：

- 筛选：模块 / 题型 / 来源 / 知识点 / 关键词搜索
- 排序：按错误次数 / 按添加时间 / 按重要性（星）
- 分页：10/20/30/50/100/全部
- 每条显示：模块、题型、🖼️图文标记、知识点、来源、星级、错误/正确次数

**详情页**：

- 题目信息（含图片，可点击放大）
- 快速编辑：来源输入框、星级点击
- 原解析 + 作答历史
- **AI 智能分析**（折叠卡片）：
  - 核心：AI 独立作答，与用户答案对比（一致绿/不一致红）
  - 破题题眼（题干中高亮关键片段）
  - 逐项剖析、易错点、更好解法、通用方法
  - 支持"深度思考"（DeepSeek-Reasoner + 思维链）
- **追问 AI**（折叠卡片）：
  - 支持上下文对话
  - AI 建议的追问问题
  - 可编辑历史消息重发
  - 自定义头像和名字
- **举一反三**（折叠卡片）：
  - AI 生成 1-5 道同类题
  - 可作答、可存入错题库
- **珍贵的个人笔记**（折叠卡片）

### 4.4 AI 深度分析（`renderAnalysis`）

**钻取式诊断**（4 层）：

```
全部错题 → 模块 → 题型 → 知识点
```

每层独立生成 AI 报告（缓存 14 天）：

- 诊断结论（headline）
- 数据证据（引用具体数字）
- 根源分析（现象/原因/习惯）
- 薄弱环节（带严重程度）
- 行动计划（阶段/目标/动作/检验）
- 避坑提示

**关键设计**：不讲"正确率"（错题本天然 0%），只看错题分布、错误次数、误选内容。

### 4.5 个人笔记（`renderNotes`）

- 汇总所有有笔记的题
- 按模块筛选、按更新时间/收录时间/模块排序
- 点击笔记跳转到对应题详情

### 4.6 词库（`renderWords`）

**子 Tab 1：词语练习**

- 设置面板：范围（全部/只错过的/只没练过的）+ 本轮题数（5/10/20/50）
- 答题：艾宾浩斯记忆曲线加权抽题
- 结算页：正确率 + 本轮错词列表

**子 Tab 2：词库管理**

- 顶部工具栏：`[输入词语] [➕添加] [按拼音/按时间] [导出] [导入] [清空]`
- 批量添加：逗号/顿号/分号分隔，串行 AI 查询
- 拼音排序 + A-Z 索引条（按首字母筛选）
- 分页（10/20/30/50/100/全部）
- 每条词条可展开：近义词辨析 + 笔记
- 近义词旁「+ 快速添加」按钮（词库中不存在时显示）
- 编辑模式弹窗（完整表单）

### 4.7 云同步（`sync.js`）

**Gist 同步内容**：

```javascript
{
  questions: [...],
  words: [...],
  deletedIds: [...],
  imageUrls: { imgId: url },
  lastSyncedAt: number
}
```

**同步机制**：

- 打开页面 2 秒后自动 PULL
- 保存后 3 秒防抖 PUSH
- 冲突处理：比 `updatedAt`，新的赢
- 删除的 id 加入 `deletedIds`，两边都过滤

**图床**：

- ImgBB（主）/ 蜜蜂图床（备）
- 上传失败自动降级
- URL 存 `imageUrlMap`，上传成功立即保存防中断

### 4.8 设置（`renderSettings`）

- **AI 设置**：DeepSeek API Key + 默认模型（Chat / Reasoner）
- **云同步**：Gist ID + Token + 图床配置
- **对话角色**：用户和 AI 的名字、头像（emoji 或上传）
- **数据管理**：导出、导入、重置统计、清孤立图片、清 OCR 缓存、修复数据库、清空所有数据
- **关于**：版本、快捷键说明

---

## 五、分类体系（CATEGORIES）

```javascript
{
  '言语理解': ['逻辑填空','主旨概括','意图判断','细节判断','标题选择','态度理解','词句理解','语句排序','语句填空','接语选择'],
  '数量关系': ['和差倍比','行程问题','工程问题','利润问题','浓度问题','排列组合','概率问题','几何问题','容斥问题','最值问题','年龄问题','日期问题','计算问题'],
  '判断推理': ['图形推理','定义判断','类比推理','翻译推理','真假推理','分析推理','加强削弱','原因解释','日常结论'],
  '资料分析': ['增长率','增长量','比重','平均数','倍数','综合分析'],
  '常识判断': ['时政','马哲','党史','法律','经济','历史人文','地理国情','科技生活'],
  '政治理论': ['时政','重要会议','重要文件','领导人讲话']
}
```

**知识点**不预定义，由 AI 每次识别时动态生成。

**各模块基准用时**（秒/题，用于考试速度评级）：

```javascript
{
  '言语理解': 50,
  '数量关系': 90,
  '判断推理': 55,
  '资料分析': 65,
  '常识判断': 30,
  '政治理论': 30
}
```

---

## 六、关键技术细节

### 6.1 AI 调用

**模型选择**：

- `deepseek-chat`：支持 `response_format: { type: 'json_object' }`，用于需要严格 JSON 的场景
- `deepseek-reasoner`：深度推理，**不支持 JSON 模式**，用于单题分析、深度报告、举一反三

**函数**：

| 函数                     | 用途           | 模型              |
| ------------------------ | -------------- | ----------------- |
| `aiStructure()`        | OCR 文本结构化 | chat（必须 JSON） |
| `fetchWordInfo()`      | 词语辨析信息   | chat（必须 JSON） |
| `generateAnalysis()`   | 单题 AI 分析   | chat / reasoner   |
| `generateReport()`     | 深度分析报告   | chat / reasoner   |
| `tryGenerateSimilar()` | 举一反三       | chat / reasoner   |
| `askAIAboutQuestion()` | 追问 AI        | chat              |

**深度思考开关**：

- 全局单一状态，存在 `localStorage.xc_default_thinking`
- 打开后调用 `deepseek-reasoner`
- 思维链存在 `aiAnalysis.reasoning`

**容错 JSON 解析**（`robustParseJSON`）：

1. 直接 `JSON.parse`
2. 剥 markdown 代码块后解析
3. 提取 `{...}` 后解析

### 6.2 IndexedDB

- 数据库：`xingce_db`，**版本 4**
- 4 个 store：`questions`、`words`、`images`、`meta`
- 降级：IDB 打不开时退到 `localStorage`（不保存图片）

**写入调度**：

- 修改数据 → 标记脏（`dirtyQ` / `dirtyW`）→ 300ms 后批量写 IDB
- 页面关闭时 `beforeunload` 强制落盘

**版本兼容**：

- 用 `indexedDB.databases()` 查询实际版本，取 `max(实际, 代码版本)` 打开
- 兼容 Safari（无 `databases()` API）

### 6.3 Service Worker（`sw.js`）

- **只缓存 CDN 模型资源**（PaddleOCR / onnxruntime / Tesseract）
- **不缓存 HTML/JS/CSS**（避免旧版本）
- 注册路径：`navigator.serviceWorker.register('js/sw.js')`
- **不要用 `<script src="js/sw.js">` 引入**（会报错）

### 6.4 图片处理

**上传流程**：

1. 点击上传 → 弹图片编辑器（裁剪/旋转）
2. 粘贴上传 → 跳过编辑器
3. 存 IDB → 生成 `imageId`
4. 保存题目时勾选要关联的图片

**图床同步**：

- 触发 PUSH 时，遍历所有 `imageId`
- `imageUrlMap` 里没有 URL 的，上传到图床
- 上传成功立即保存 URL 到 meta（防中断丢失）

**加载优先级**：

1. 本地 IDB `blob`
2. meta 里的 `imageUrlMap` 图床 URL

### 6.5 状态持久化

| 数据                         | 存储                                                | 说明                   |
| ---------------------------- | --------------------------------------------------- | ---------------------- |
| 当前 Tab                     | `localStorage.xc_mode`                            | 刷新后恢复             |
| 错题查看的筛选/分页/滚动位置 | `localStorage.xc_browse_state`                    | 只在 browse Tab 恢复   |
| 词库子 Tab                   | `localStorage.xc_words_tab`                       | 记住是"练习"还是"管理" |
| 主题                         | `localStorage.xc_theme`                           | light / dark           |
| API Key                      | `localStorage.xc_api_key`                         | —                     |
| 模型选择                     | `localStorage.xc_ai_model`                        | chat / reasoner        |
| 深度思考                     | `localStorage.xc_default_thinking`                | 0 / 1                  |
| Gist 配置                    | `localStorage.xc_gist_id` / `xc_gist_token`     | —                     |
| 图床 Key                     | `localStorage.xc_imghost_key_imgbb` / `_beeimg` | —                     |
| 对话角色                     | `localStorage.xc_chat_me` / `xc_chat_ai`        | JSON                   |
| 折叠状态                     | `localStorage.xc_collapse_*`                      | 各个折叠卡片的开合状态 |

### 6.6 快捷键

| 快捷键           | 功能                    |
| ---------------- | ----------------------- |
| `F1`           | 错题收录                |
| `F2`           | 错题考试                |
| `F3`           | 错题查看                |
| `F4`           | 个人笔记                |
| `Ctrl/Cmd + K` | 跳到错题查看 + 聚焦搜索 |
| `Ctrl/Cmd + S` | 立即同步到 Gist         |
| `Ctrl/Cmd + E` | 导出 JSON 备份          |
| `Esc`          | 从详情页/设置页返回     |
| `1-4`          | 考试/词语练习中选答案   |
| `Enter`        | 考试/词语练习中下一题   |

---

## 七、开发约定

### 7.1 不要做的事

- **不要用 `<script src="js/sw.js">`**（Service Worker 不能用普通 script 引入）
- **不要在主线程做重 CPU 计算**（PaddleOCR 已放 Worker）
- **不要给旧版本 DB 用高版本号打开**（用 `indexedDB.databases()` 兼容）
- **不要在编辑用户输入时 `renderView()`**（会丢数据，改用局部 DOM 更新或 `syncAllParsedCardsToState()`）

### 7.2 渲染模式

**核心函数 `renderView()` 按 `state.mode` 分发**：

```javascript
if (state.mode === 'collect') renderCollect(view);
else if (state.mode === 'exam') renderExam(view);
else if (state.mode === 'browse') renderBrowse(view);
else if (state.mode === 'notes') renderNotes(view);
else if (state.mode === 'words') renderWords(view);
else if (state.mode === 'analysis') renderAnalysis(view);
else if (state.mode === 'settings') renderSettings(view);
```

**局部渲染优先**：能不 renderView 就不 renderView，特别是：

- 输入框内容可能丢失的场景
- 折叠状态可能重置的场景

### 7.3 数据修改流程

**正确做法**：

```javascript
const q = questions.find(x => x.id === id);
q.field = newValue;
saveQuestion(q);      // 标记脏 + 调度 IDB 写 + 调度 Gist 推送
renderView();          // 或局部 DOM 更新
```

**不要直接操作 IDB**，除非你知道自己在干什么。

### 7.4 错误处理

- API 调用要有 `try/catch`，失败要有用户提示
- 网络请求建议加超时（`fetchWithTimeout`）
- 用户数据（输入框）修改前要 `syncAllParsedCardsToState()`（错题收录场景）

---

## 八、已知问题 / 待办

### 8.1 已知问题

- **旧缩略图数据残留**：早期版本存过 `thumbnail` 字段，现不再使用，但 IDB 里可能还有旧数据
- **词库页码不持久化**：刷新后回到第 1 页
- **错题查看的页码持久化**：正常，存在 `xc_browse_state`

### 8.2 未来可扩展方向

1. **多模态 AI 分析**：接 GPT-4V / Claude Vision，直接分析图片题
2. **账号系统**：Supabase / Firebase 登录，替代 Gist
3. **学习曲线**：Chart.js 画正确率、知识点掌握度随时间变化
4. **AI 出题模式**：按薄弱知识点批量生成新题（非错题）
5. **导出 PDF**：错题本打印成纸质版
6. **PWA**：离线安装、桌面图标

---

## 九、快速启动

### 本地开发

```bash
# 1. 启动服务（必须 HTTP，不能 file://）
python -m http.server 8000

# 或带 no-cache 的版本
python 启动.py

# 2. 浏览器打开
http://localhost:8000/index.html
```

### 首次配置

1. 顶栏齿轮 → 设置页
2. **AI 设置**：填 DeepSeek API Key
3. **云同步**（可选）：填 Gist ID + Token + 图床 Key
4. 回「错题收录」→ 粘贴截图 → 开始使用

### 部署到 GitHub Pages

1. 新建公开仓库
2. 上传 `index.html` + `css/` + `js/` + `sw.js` + `.nojekyll`（空文件）
3. Settings → Pages → Source: main / root
4. 访问 `https://<用户名>.github.io/<仓库名>/`

---

## 十、排错速查

| 现象                  | 原因                    | 修复                                         |
| --------------------- | ----------------------- | -------------------------------------------- |
| 页面白屏              | 某个 js 报错            | F12 看红字，通常是某函数未定义               |
| IDB 降级 localStorage | 版本冲突                | 关所有标签页，重开；或用设置页「修复数据库」 |
| 刷新后回到旧版        | Service Worker 缓存     | Ctrl+Shift+R；或设置页「修复数据库」         |
| AI 一直转圈           | 没超时机制              | F12 Network 看请求；换 `fetchWithTimeout`  |
| 保存词条刷新丢失      | words 表没创建 / 未加载 | 检查 IDB 版本 4、words 表存在                |
| 拼音排序失效          | pinyin-pro 未加载       | F12 里 `window.pinyinPro` 是否为 undefined |
| 图片同步失败          | 图床 Key 未配置         | 设置页填 ImgBB Key                           |
| Gist 同步失败         | Token 权限不足          | 只需 gist 权限的 classic token               |
| 重复题误判            | 图形推理题              | 已跳过（`findDuplicate` 里判断 type）      |

---

## 十一、版本记录

| 版本 | 主要变更                                   |
| ---- | ------------------------------------------ |
| v1.0 | 骨架 + OCR + AI 归类 + 错题考试 + 错题查看 |
| v1.5 | AI 深度分析（钻取式）                      |
| v2.0 | 云同步（Gist）+ 图片存储                   |
| v2.5 | 图床同步 + 个人笔记 + 追问 AI              |
| v3.0 | 词库整合（练习 + 管理）+ 艾宾浩斯曲线      |
| v3.5 | 深度思考（Reasoner）+ 多模型选择           |
| v3.8 | 批量添加词条 + 拼音排序 + 近义词快速添加   |

---

*文档最后更新：2026-10-16*
