const CATEGORIES = {
  '言语理解': ['逻辑填空','主旨概括','意图判断','细节判断','标题选择','态度理解','词句理解','语句排序','语句填空','接语选择'],
  '数量关系': ['和差倍比','行程问题','工程问题','利润问题','浓度问题','排列组合','概率问题','几何问题','容斥问题','最值问题','年龄问题','日期问题','计算问题'],
  '判断推理': ['图形推理','定义判断','类比推理','翻译推理','真假推理','分析推理','加强削弱','原因解释','日常结论'],
  '资料分析': ['增长率','增长量','比重','平均数','倍数','综合分析'],
  '常识判断': ['时政','马哲','党史','法律','经济','历史人文','地理国情','科技生活'],
  '政治理论': ['时政','重要会议','重要文件','领导人讲话']
};
const MODULES = Object.keys(CATEGORIES);
const ATTEMPT_HISTORY_LIMIT = 20;
/* 各模块每题参考用时（秒），用于判断考试速度快慢 */
const MODULE_TIME_PER_Q = {
  '言语理解': 50,
  '数量关系': 90,
  '判断推理': 55,
  '资料分析': 65,
  '常识判断': 30,
  '政治理论': 30
};
const K_API_KEY = 'xc_api_key';
const K_THEME = 'xc_theme';
const K_GIST_ID = 'xc_gist_id';
const K_GIST_TOKEN = 'xc_gist_token';
const GIST_FILENAME = 'xingce-backup.json';
const getApiKey = () => localStorage.getItem(K_API_KEY) || '';
const setApiKey = k => localStorage.setItem(K_API_KEY, k);
const getTheme = () => localStorage.getItem(K_THEME) || 'light';
const applyTheme = t => document.documentElement.setAttribute('data-theme', t);
/* ============ 对话角色配置 ============ */
const K_CHAT_ME = 'xc_chat_me';
const K_CHAT_AI = 'xc_chat_ai';

const DEFAULT_CHAT_ROLES = {
  me: { name: '我', avatar: '👤' },
  ai: { name: 'AI', avatar: '🤖' }
};


/* ============ 状态 ============ */
const state = {
  mode: 'collect',
  prevMode: 'collect',
  collect: {
    images: [],
    parsedList: [],
    sourceInput: '',
    editedOcrText: '',   // ← 新增
    busy: false
  },
  exam: {
    stage: 'idle',           // idle | running | finished
    filter: {
      module: 'all',
      type: 'all',
      knowledgePoints: []
    },
    count: 10,
    quiz: [],                // 抽取的题目
    current: 0,
    startTime: 0,
    endTime: 0,
    results: []              // [{ qid, selected, isRight, t }]
  },
  browse: {
    filter: { module: 'all', type: 'all', source: 'all', knowledgePoints: [] },
    selectedId: null,
    listIds: [],
    listScrollY: 0,
    pendingScrollRestore: null,
    detail: null,
    editing: false,
    editDraft: null,
    generating: { analysis: false, similar: false },
    chatInput: '',
    chatLoading: false,
    chatEditingIdx: null,   // 正在编辑第几条用户消息（null=不在编辑）
    sortBy: 'wrongCount',
    page: 1,
    pageSize: 20,
  },
  notes: {
    sort: 'updatedAt',  // 'updatedAt' | 'createdAt' | 'module'
    filterModule: 'all'
  },
   analysis: {
    module: null,       // null=全部
    type: null,         // null=未进入题型
    kp: null,           // null=未进入知识点
    report: null,       // 当前范围的 AI 报告
    loading: false,
    search: ''
  }
};
