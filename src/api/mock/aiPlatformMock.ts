/**
 * 智能中心(AI) 一期 Mock 数据层
 *
 * 覆盖：模型接入（供应商/模型/参数/价格/健康）、授权与配额（部门授权/员工覆盖/
 * 额度策略/路由策略/账号白名单）、工具注册中心（L0-L4 分级）、我的用量。
 * 一期纯前端演示用，界面确认后二期由后端统一网关提供真实接口替换。
 */

/* ────────────────── 通用类型 ────────────────── */

/** 启用状态（与系统既有枚举一致：1=启用 0=停用） */
export const ENABLED = 1 as const
export const DISABLED = 0 as const
export type EnabledStatus = 1 | 0

/** 币种 */
export type Currency = 'CNY' | 'USD'

/* ────────────────── 供应商管理 ────────────────── */

/** 供应商类型：公有云 / 私有化 */
export type ProviderType = 'cloud' | 'private'

/** 供应商健康状态 */
export type ProviderHealth = 'healthy' | 'degraded' | 'down'

export interface AiProvider {
  id: string
  name: string
  code: string
  type: ProviderType
  status: EnabledStatus
  baseUrl: string
  health: ProviderHealth
  avgLatencyMs: number
  errorRate: number
  /** 接入模型數（接口計算回填，非持久化字段） */
  modelCount?: number
  remark: string
  /** 最後更新人 */
  updatedBy?: string
  /** 最後更新時間 */
  updatedAt?: string
}

export const PROVIDER_TYPE_LABEL: Record<ProviderType, string> = {
  cloud: '公有雲',
  private: '私有化',
}

export const PROVIDER_HEALTH_LABEL: Record<ProviderHealth, string> = {
  healthy: '健康',
  degraded: '輕微異常',
  down: '故障',
}

/* ────────────────── 模型管理 ────────────────── */

/** 模型能力标签 */
export type ModelCapability = 'chat' | 'longContext' | 'code' | 'functionCall'

export const MODEL_CAPABILITY_LABEL: Record<ModelCapability, string> = {
  chat: '對話',
  longContext: '長文本',
  code: '代碼',
  functionCall: '函數調用',
}

/** 模型價格（按每百萬 Token 計價，快照來源見 priceSource） */
export interface ModelPrice {
  input: number
  output: number
  cachedInput: number | null
  currency: Currency
  source: string
  asOf: string
}

/** 模型運行參數 */
export interface ModelParams {
  temperature: number
  topP: number
  maxTokens: number
  timeoutSeconds: number
  retryCount: number
}

/** 模型健康監控指標 */
export interface ModelHealth {
  latencyMs: number
  errorRate: number
  availability: number
  /** 累計請求數 */
  requestCount: number
  trend: number[]
}

export interface AiModel {
  id: string
  name: string
  displayName: string
  providerId: string
  version: string
  contextLength: number
  capabilities: ModelCapability[]
  price: ModelPrice
  params: ModelParams
  status: EnabledStatus
  health: ModelHealth
  remark: string
  /** 最後更新人 */
  updatedBy?: string
  /** 最後更新時間 */
  updatedAt?: string
}

/* ────────────────── 模型授權（部門 / 員工） ────────────────── */

export interface DeptModelAuth {
  deptId: string
  deptName: string
  /** 該部門可用的模型（模型 id 列表） */
  modelIds: string[]
  /** 數據不出域：勾選後僅可使用私有化模型 */
  dataResidency: boolean
  employeeCount: number
}

export interface EmployeeModelOverride {
  username: string
  empName: string
  empId: string
  deptName: string
  /** 額外授權模型（在部門授權基礎上的追加） */
  extraModelIds: string[]
  remark: string
}

/** 賬號白名單兜底（沿用現有能耗管控邏輯的目標形態：空數組 = 全部賬號可用） */
export interface AccountWhitelist {
  modelId: string
  accounts: string[]
}

/* ────────────────── 額度策略 ────────────────── */

export type QuotaPeriod = 'daily' | 'monthly'
export type QuotaType = 'token' | 'cost' | 'request'
/** 超額動作：拒絕請求 / 進入審批 / 自動降級 */
export type OverLimitAction = 'reject' | 'approve' | 'downgrade'
export type QuotaScopeType = 'company' | 'dept' | 'employee'

export const QUOTA_PERIOD_LABEL: Record<QuotaPeriod, string> = {
  daily: '按日',
  monthly: '按月',
}

export const QUOTA_TYPE_LABEL: Record<QuotaType, string> = {
  token: 'Token 數',
  cost: '費用金額',
  request: '請求次數',
}

export const OVER_LIMIT_ACTION_LABEL: Record<OverLimitAction, string> = {
  reject: '拒絕請求',
  approve: '進入審批',
  downgrade: '自動降級',
}

export const QUOTA_SCOPE_LABEL: Record<QuotaScopeType, string> = {
  company: '全員',
  dept: '部門',
  employee: '員工',
}

export interface QuotaPolicy {
  id: string
  name: string
  scopeType: QuotaScopeType
  scopeName: string
  /** 適用部門名稱列表（scopeType === 'dept' 時使用） */
  deptNames?: string[]
  period: QuotaPeriod
  quotaType: QuotaType
  quotaValue: number
  currency: Currency
  /** 軟限額提醒閾值（百分比，達到後通知員工與主管） */
  softThreshold: number
  overLimitAction: OverLimitAction
  /** 超額動作爲降級時的目標模型 */
  downgradeModelId: string | null
  status: EnabledStatus
  /** 最後更新人 */
  updatedBy?: string
  /** 最後更新時間 */
  updatedAt?: string
}

/* ────────────────── 路由策略（Auto） ────────────────── */

export type RouteStrategyId = 'cost' | 'performance'

export interface RouteStrategy {
  id: RouteStrategyId
  name: string
  desc: string
  /** 模型池優先順序（從高到低） */
  modelPool: string[]
  isDefault: boolean
}

/* ────────────────── 工具註冊中心 ────────────────── */

/** 工具權限等級 */
export type ToolLevel = 'L0' | 'L1' | 'L2' | 'L3' | 'L4'

export const TOOL_LEVEL_META: Record<ToolLevel, { name: string; desc: string; human: string; color: string; tagColor: string }> = {
  L0: { name: '禁止調用', desc: 'AI 完全不可調用，必須人工操作', human: '完全人工', color: '#FF4D4F', tagColor: 'error' },
  L1: { name: '只讀查詢', desc: 'AI 可直接查詢，無需人工確認', human: '無需確認', color: '#1890FF', tagColor: 'processing' },
  L2: { name: '生成草稿', desc: 'AI 生成內容或表單草稿，用戶確認後提交', human: '用戶確認', color: '#E8720C', tagColor: 'warning' },
  L3: { name: '需審批', desc: 'AI 發起後進入審批流，審批通過才執行', human: '審批流', color: '#722ED1', tagColor: 'purple' },
  L4: { name: '完全自動', desc: 'AI 可直接執行，全程留痕供事後審計', human: '事後審計', color: '#52C41A', tagColor: 'success' },
}

export interface ToolParam {
  name: string
  type: string
  required: boolean
  /** 參數白名單取值（空數組 = 允許自由輸入） */
  whitelist: string[]
  desc: string
}

export interface ToolDefinition {
  id: string
  name: string
  code: string
  menuName: string
  level: ToolLevel
  description: string
  params: ToolParam[]
  status: EnabledStatus
  callCount30d: number
  lastCalledAt: string | null
  /** 最後更新人 */
  updatedBy?: string
  /** 最後更新時間 */
  updatedAt?: string
}

/* ────────────────── 我的用量 ────────────────── */

export interface MyUsageCostEntry {
  currency: Currency
  cost: number
}

export interface MyUsageRecord {
  id: string
  time: string
  model: string
  mode: string
  scene: string
  promptTokens: number
  completionTokens: number
  cost: number
  currency: Currency
}

export interface MyUsage {
  todayTokens: number
  monthTokens: number
  monthQuota: number
  todayRequests: number
  monthRequests: number
  todayCosts: MyUsageCostEntry[]
  monthCosts: MyUsageCostEntry[]
  softThreshold: number
  recentRecords: MyUsageRecord[]
}

/* ────────────────── Mock 數據 ────────────────── */

const providers: AiProvider[] = [
  {
    id: 'bailian',
    name: '阿里雲百煉',
    code: 'bailian',
    type: 'cloud',
    status: ENABLED,
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    health: 'healthy',
    avgLatencyMs: 860,
    errorRate: 0.4,
    remark: '華北 2（北京），主通道，原生 Function Calling',
    updatedBy: 'admin',
    updatedAt: '2026-08-28 14:30:00',
  },
  {
    id: 'deepseek',
    name: 'DeepSeek 官方',
    code: 'deepseek',
    type: 'cloud',
    status: ENABLED,
    baseUrl: 'https://api.deepseek.com/v1',
    health: 'healthy',
    avgLatencyMs: 1240,
    errorRate: 0.8,
    remark: '固定餘額通道，手動切換時消耗已充值餘額',
    updatedBy: 'admin',
    updatedAt: '2026-08-25 09:15:00',
  },
  {
    id: 'openai',
    name: 'OpenAI（示例）',
    code: 'openai',
    type: 'cloud',
    status: DISABLED,
    baseUrl: 'https://api.openai.com/v1',
    health: 'degraded',
    avgLatencyMs: 2380,
    errorRate: 2.6,
    remark: '演示用接入配置，未實際啟用',
    updatedBy: 'admin',
    updatedAt: '2026-07-15 11:20:00',
  },
  {
    id: 'qwen-private',
    name: 'Qwen 私有化部署',
    code: 'qwen-private',
    type: 'private',
    status: DISABLED,
    baseUrl: 'http://10.20.8.66:8000/v1',
    health: 'healthy',
    avgLatencyMs: 640,
    errorRate: 0.2,
    remark: '數據不出域，財務等敏感部門專用；上線需先完成網關接入',
    updatedBy: 'chenwei',
    updatedAt: '2026-08-20 16:45:00',
  },
]

const models: AiModel[] = [
  {
    id: 'qwen3.7-flash',
    name: 'qwen3.7-flash',
    displayName: 'Qwen3.7 Flash',
    providerId: 'bailian',
    version: 'qwen3.7-flash-2026-08',
    contextLength: 131072,
    capabilities: ['chat', 'functionCall'],
    price: { input: 0.2, output: 0.8, cachedInput: 0.04, currency: 'CNY', source: '阿里雲百煉官方價目表', asOf: '2026-09' },
    params: { temperature: 0.3, topP: 0.9, maxTokens: 4096, timeoutSeconds: 60, retryCount: 2 },
    status: ENABLED,
    health: { latencyMs: 860, errorRate: 0.4, availability: 99.9, requestCount: 1284500, trend: [820, 910, 880, 840, 900, 860, 850] },
    remark: '現役主通道模型（省錢優先默認）',
    updatedBy: 'admin',
    updatedAt: '2026-08-28 14:30:00',
  },
  {
    id: 'qwen3.7-max',
    name: 'qwen3.7-max',
    displayName: 'Qwen3.7 Max',
    providerId: 'bailian',
    version: 'qwen3.7-max-2026-08',
    contextLength: 131072,
    capabilities: ['chat', 'longContext', 'functionCall'],
    price: { input: 2.4, output: 9.6, cachedInput: null, currency: 'CNY', source: '阿里雲百煉官方價目表', asOf: '2026-09' },
    params: { temperature: 0.5, topP: 0.9, maxTokens: 8192, timeoutSeconds: 90, retryCount: 2 },
    status: ENABLED,
    health: { latencyMs: 1580, errorRate: 0.6, availability: 99.7, requestCount: 864200, trend: [1520, 1600, 1550, 1620, 1590, 1570, 1580] },
    remark: '性能優先候選模型',
    updatedBy: 'admin',
    updatedAt: '2026-08-26 10:00:00',
  },
  {
    id: 'deepseek-chat',
    name: 'deepseek-chat',
    displayName: 'DeepSeek Chat',
    providerId: 'deepseek',
    version: 'deepseek-v4-flash（非思考別名）',
    contextLength: 65536,
    capabilities: ['chat', 'functionCall'],
    price: { input: 0.22, output: 0.66, cachedInput: null, currency: 'USD', source: 'DeepSeek 官方價目表', asOf: '2026-09' },
    params: { temperature: 0.3, topP: 0.9, maxTokens: 4096, timeoutSeconds: 60, retryCount: 2 },
    status: ENABLED,
    health: { latencyMs: 1240, errorRate: 0.8, availability: 99.6, requestCount: 2156800, trend: [1200, 1290, 1250, 1220, 1280, 1240, 1230] },
    remark: '固定餘額通道模型',
    updatedBy: 'admin',
    updatedAt: '2026-08-25 09:20:00',
  },
  {
    id: 'deepseek-coder',
    name: 'deepseek-coder',
    displayName: 'DeepSeek Coder',
    providerId: 'deepseek',
    version: 'deepseek-coder-2026-07',
    contextLength: 131072,
    capabilities: ['chat', 'code', 'functionCall'],
    price: { input: 0.35, output: 1.1, cachedInput: null, currency: 'USD', source: 'DeepSeek 官方價目表', asOf: '2026-09' },
    params: { temperature: 0.2, topP: 0.9, maxTokens: 8192, timeoutSeconds: 90, retryCount: 2 },
    status: ENABLED,
    health: { latencyMs: 1420, errorRate: 1.1, availability: 99.4, requestCount: 486300, trend: [1380, 1450, 1410, 1480, 1440, 1420, 1420] },
    remark: '代碼場景專用',
    updatedBy: 'chenwei',
    updatedAt: '2026-08-22 15:40:00',
  },
  {
    id: 'gpt-4o',
    name: 'gpt-4o',
    displayName: 'GPT-4o',
    providerId: 'openai',
    version: 'gpt-4o-2026-05',
    contextLength: 131072,
    capabilities: ['chat', 'longContext', 'code', 'functionCall'],
    price: { input: 2.5, output: 10, cachedInput: 1.25, currency: 'USD', source: 'OpenAI 官方價目表', asOf: '2026-09' },
    params: { temperature: 0.4, topP: 0.9, maxTokens: 16384, timeoutSeconds: 120, retryCount: 1 },
    status: DISABLED,
    health: { latencyMs: 2380, errorRate: 2.6, availability: 98.2, requestCount: 12400, trend: [2260, 2410, 2350, 2330, 2400, 2380, 2380] },
    remark: '演示用，啟用前需完成合規審批',
    updatedBy: 'admin',
    updatedAt: '2026-07-15 11:25:00',
  },
  {
    id: 'qwen-private',
    name: 'qwen-private',
    displayName: 'Qwen 私有化',
    providerId: 'qwen-private',
    version: 'Qwen3-32B-Instruct',
    contextLength: 32768,
    capabilities: ['chat', 'functionCall'],
    price: { input: 0, output: 0, cachedInput: null, currency: 'CNY', source: '私有化部署按算力攤銷，不按 Token 計費', asOf: '2026-09' },
    params: { temperature: 0.3, topP: 0.9, maxTokens: 4096, timeoutSeconds: 60, retryCount: 2 },
    status: DISABLED,
    health: { latencyMs: 640, errorRate: 0.2, availability: 99.9, requestCount: 35600, trend: [620, 650, 640, 630, 660, 640, 640] },
    remark: '數據不出域專用，費用按部署成本另計',
    updatedBy: 'chenwei',
    updatedAt: '2026-08-20 16:50:00',
  },
]

const baseDeptAuths: DeptModelAuth[] = [
  {
    deptId: 'dev',
    deptName: '研發部',
    modelIds: ['qwen3.7-flash', 'qwen3.7-max', 'deepseek-chat', 'deepseek-coder'],
    dataResidency: false,
    employeeCount: 46,
  },
  {
    deptId: 'cs',
    deptName: '客服部',
    modelIds: ['qwen3.7-flash', 'deepseek-chat'],
    dataResidency: false,
    employeeCount: 128,
  },
  {
    deptId: 'fin',
    deptName: '財務部',
    modelIds: ['qwen-private'],
    dataResidency: true,
    employeeCount: 22,
  },
  {
    deptId: 'ops',
    deptName: '運營部',
    modelIds: ['qwen3.7-flash', 'qwen3.7-max'],
    dataResidency: false,
    employeeCount: 64,
  },
]

/** 門店/分支部門規格（批量生成，模擬真實企業部門眾多的配置場景） */
const STORE_DEPT_SPEC: Array<{ prefix: string; count: number }> = [
  { prefix: '澳門門店', count: 18 },
  { prefix: '氹仔門店', count: 12 },
  { prefix: '珠海門店', count: 6 },
]

/** 門店輪轉使用的模型授權模板 */
const STORE_MODEL_POOL: string[][] = [
  ['qwen3.7-flash', 'deepseek-chat'],
  ['qwen3.7-flash'],
  ['qwen3.7-flash', 'qwen3.7-max', 'deepseek-chat'],
]

const generatedDeptAuths: DeptModelAuth[] = STORE_DEPT_SPEC.flatMap((spec) =>
  Array.from({ length: spec.count }, (_, i) => {
    const seq = i + 1
    return {
      deptId: `store-${spec.prefix}-${seq}`,
      deptName: `${spec.prefix}${String(seq).padStart(2, '0')}`,
      // 每 9 家門店未授權，用於演示「授權狀態」篩選
      modelIds: seq % 9 === 0 ? [] : [...STORE_MODEL_POOL[(seq + spec.count) % STORE_MODEL_POOL.length]],
      dataResidency: false,
      employeeCount: 8 + ((seq * 7) % 30),
    }
  })
)

const deptAuths: DeptModelAuth[] = [...baseDeptAuths, ...generatedDeptAuths]

const employeeOverrides: EmployeeModelOverride[] = [
  {
    username: 'chenwei',
    empName: '陳偉',
    empId: 'EMP1024',
    deptName: '研發部',
    extraModelIds: ['qwen3.7-max'],
    remark: '架構師，長文本方案評估需要',
  },
  {
    username: 'liuyang',
    empName: '劉陽',
    empId: 'EMP0933',
    deptName: '研發部',
    extraModelIds: ['deepseek-coder'],
    remark: '代碼生成場景',
  },
  {
    username: 'zhaomin',
    empName: '趙敏',
    empId: 'EMP0765',
    deptName: '運營部',
    extraModelIds: ['qwen3.7-max', 'deepseek-chat'],
    remark: '數據分析崗位額外開放',
  },
]

const accountWhitelists: AccountWhitelist[] = [
  { modelId: 'qwen3.7-flash', accounts: [] },
  { modelId: 'deepseek-chat', accounts: ['admin', 'chenwei', 'liuyang', 'zhaomin'] },
]

const quotaPolicies: QuotaPolicy[] = [
  {
    id: 'p1',
    name: '普通員工日限額',
    scopeType: 'company',
    scopeName: '全員',
    period: 'daily',
    quotaType: 'token',
    quotaValue: 100000,
    currency: 'CNY',
    softThreshold: 80,
    overLimitAction: 'reject',
    downgradeModelId: null,
    status: ENABLED,
    updatedBy: 'admin',
    updatedAt: '2026-08-28 10:00:00',
  },
  {
    id: 'p2',
    name: '部門月預算（運營部）',
    scopeType: 'dept',
    scopeName: '運營部',
    deptNames: ['運營部', '市場部', '品牌部', '客服部'],
    period: 'monthly',
    quotaType: 'cost',
    quotaValue: 5000,
    currency: 'CNY',
    softThreshold: 80,
    overLimitAction: 'approve',
    downgradeModelId: null,
    status: ENABLED,
    updatedBy: 'admin',
    updatedAt: '2026-08-26 14:20:00',
  },
  {
    id: 'p3',
    name: 'VIP 員工月限額',
    scopeType: 'employee',
    scopeName: '陳偉、劉陽等 5 人',
    period: 'monthly',
    quotaType: 'token',
    quotaValue: 30000000,
    currency: 'CNY',
    softThreshold: 90,
    overLimitAction: 'downgrade',
    downgradeModelId: 'qwen3.7-flash',
    status: ENABLED,
    updatedBy: 'chenwei',
    updatedAt: '2026-08-25 09:30:00',
  },
  {
    id: 'p4',
    name: '客服部請求次數限制',
    scopeType: 'dept',
    scopeName: '客服部',
    deptNames: ['客服部', '運營部', '財務部', '人力資源部', '行政部'],
    period: 'daily',
    quotaType: 'request',
    quotaValue: 500,
    currency: 'CNY',
    softThreshold: 80,
    overLimitAction: 'reject',
    downgradeModelId: null,
    status: DISABLED,
    updatedBy: 'admin',
    updatedAt: '2026-08-20 16:00:00',
  },
]

const routeStrategies: RouteStrategy[] = [
  {
    id: 'cost',
    name: '省錢優先',
    desc: '在滿足基本能力要求的前提下選擇價格最低的模型；故障時按池內順序自動切換',
    modelPool: ['qwen3.7-flash', 'deepseek-chat', 'qwen-private'],
    isDefault: true,
  },
  {
    id: 'performance',
    name: '性能優先',
    desc: '優先選擇響應質量與速度最佳的模型，不考慮成本；網關支持後生效',
    modelPool: ['qwen3.7-max', 'deepseek-chat', 'qwen3.7-flash'],
    isDefault: false,
  },
]

const toolRegistry: ToolDefinition[] = [
  {
    id: 't1',
    name: '訂單查詢',
    code: 'order_query',
    menuName: '推廣訂單管理',
    level: 'L1',
    description: '按訂單號、集團名稱、時間範圍查詢推廣訂單狀態與金額',
    params: [
      { name: 'orderNo', type: 'string', required: false, whitelist: [], desc: '訂單號精確匹配' },
      { name: 'groupName', type: 'string', required: false, whitelist: [], desc: '集團名稱模糊匹配' },
      { name: 'orderStatus', type: 'string', required: false, whitelist: ['pending', 'paid', 'refunded', 'closed'], desc: '訂單狀態' },
    ],
    status: ENABLED,
    callCount30d: 1846,
    lastCalledAt: '2026-09-02 10:24:18',
    updatedBy: 'admin',
    updatedAt: '2026-08-28 14:30:00',
  },
  {
    id: 't2',
    name: '門店信息查詢',
    code: 'store_query',
    menuName: '門店管理',
    level: 'L1',
    description: '查詢門店基礎信息、營業狀態與所屬集團',
    params: [
      { name: 'storeCode', type: 'string', required: false, whitelist: [], desc: '門店編碼' },
      { name: 'region', type: 'string', required: false, whitelist: ['1', '2', '3'], desc: '所屬區域：1=澳門 2=氹仔 3=珠海' },
    ],
    status: ENABLED,
    callCount30d: 962,
    lastCalledAt: '2026-09-01 16:47:02',
    updatedBy: 'admin',
    updatedAt: '2026-08-26 10:15:00',
  },
  {
    id: 't3',
    name: '生成推廣周報',
    code: 'report_weekly_promotion',
    menuName: '推廣報表',
    level: 'L2',
    description: 'AI 匯總推廣數據生成周報草稿，經用戶確認後方可發送',
    params: [
      { name: 'dateRange', type: 'string', required: true, whitelist: [], desc: '報表週期（自然週）' },
      { name: 'brand', type: 'string', required: false, whitelist: ['1', '2'], desc: '品牌：1=閃蜂 2=mFood' },
    ],
    status: ENABLED,
    callCount30d: 87,
    lastCalledAt: '2026-08-31 09:12:44',
    updatedBy: 'chenwei',
    updatedAt: '2026-08-25 16:40:00',
  },
  {
    id: 't4',
    name: '修改集團信息',
    code: 'merchant_group_update',
    menuName: '集團管理',
    level: 'L3',
    description: 'AI 可發起集團資料修改，需業務主管審批通過後才執行',
    params: [
      { name: 'groupId', type: 'string', required: true, whitelist: [], desc: '集團 ID' },
      { name: 'field', type: 'string', required: true, whitelist: ['contactName', 'contactPhone', 'address'], desc: '允許修改的字段（白名單）' },
    ],
    status: ENABLED,
    callCount30d: 12,
    lastCalledAt: '2026-08-28 14:31:09',
    updatedBy: 'admin',
    updatedAt: '2026-08-22 09:00:00',
  },
  {
    id: 't5',
    name: '推廣金扣款',
    code: 'fin_deduct',
    menuName: '賬戶餘額管理',
    level: 'L3',
    description: '涉及資金變動，AI 僅可發起扣款草稿並進入審批流（金額 ≥ 10,000 自動升級為 L0）',
    params: [
      { name: 'groupId', type: 'string', required: true, whitelist: [], desc: '集團 ID' },
      { name: 'amount', type: 'number', required: true, whitelist: [], desc: '扣款金額（風控閾值校驗）' },
    ],
    status: ENABLED,
    callCount30d: 5,
    lastCalledAt: '2026-08-30 11:05:56',
    updatedBy: 'admin',
    updatedAt: '2026-08-20 11:30:00',
  },
  {
    id: 't6',
    name: '刪除訂單',
    code: 'order_delete',
    menuName: '推廣訂單管理',
    level: 'L0',
    description: '禁止 AI 調用；AI 可提示用戶前往訂單管理頁面人工處理',
    params: [],
    status: ENABLED,
    callCount30d: 0,
    lastCalledAt: null,
    updatedBy: 'admin',
    updatedAt: '2026-08-15 10:00:00',
  },
  {
    id: 't7',
    name: '付款操作',
    code: 'payment_execute',
    menuName: '財務管理',
    level: 'L0',
    description: '禁止 AI 調用，資金操作必須人工執行',
    params: [],
    status: ENABLED,
    callCount30d: 0,
    lastCalledAt: null,
    updatedBy: 'admin',
    updatedAt: '2026-08-10 14:00:00',
  },
]

const myUsage: MyUsage = {
  todayTokens: 38420,
  monthTokens: 812560,
  monthQuota: 3000000,
  todayRequests: 26,
  monthRequests: 412,
  todayCosts: [
    { currency: 'CNY', cost: 2.86 },
    { currency: 'USD', cost: 0.42 },
  ],
  monthCosts: [
    { currency: 'CNY', cost: 61.35 },
    { currency: 'USD', cost: 9.87 },
  ],
  softThreshold: 80,
  recentRecords: [
    { id: 'r100236', time: '2026-09-02 10:24:18', model: 'qwen3.7-flash', mode: 'auto', scene: '智能對話', promptTokens: 1120, completionTokens: 486, cost: 0.06, currency: 'CNY' },
    { id: 'r100235', time: '2026-09-02 10:21:03', model: 'qwen3.7-flash', mode: 'auto', scene: '訂單查詢', promptTokens: 860, completionTokens: 1220, cost: 0.12, currency: 'CNY' },
    { id: 'r100234', time: '2026-09-02 09:58:41', model: 'deepseek-chat', mode: 'primary', scene: '智能對話', promptTokens: 640, completionTokens: 380, cost: 0.03, currency: 'USD' },
    { id: 'r100233', time: '2026-09-02 09:47:15', model: 'qwen3.7-flash', mode: 'auto', scene: '報表草稿', promptTokens: 2140, completionTokens: 1860, cost: 0.19, currency: 'CNY' },
  ],
}

/* ────────────────── Mock 接口（模擬 300ms 延遲） ────────────────── */

const delay = (ms = 300) => new Promise<void>((resolve) => { setTimeout(resolve, ms) })

/** 供應商列表（含實時統計的接入模型數） */
export async function fetchMockProviders(): Promise<AiProvider[]> {
  await delay()
  return providers.map((p) => ({
    ...p,
    modelCount: models.filter((m) => m.providerId === p.id).length,
  }))
}

/** 模型列表 */
export async function fetchMockModels(): Promise<AiModel[]> {
  await delay()
  return models.map((m) => ({ ...m }))
}

/** 部門模型授權 */
export async function fetchMockDeptAuths(): Promise<DeptModelAuth[]> {
  await delay()
  return deptAuths.map((d) => ({ ...d, modelIds: [...d.modelIds] }))
}

/* ────────────────── 部門模型授權分組（規則模式） ────────────────── */

/** 部門授權分組：一條規則可關聯多個部門，共享同一組模型配置 */
export interface DeptAuthGroup {
  id: string
  /** 規則名稱 */
  name: string
  /** 關聯的部門 id 列表 */
  deptIds: string[]
  /** 關聯的部門名稱列表（展示用） */
  deptNames: string[]
  /** 該分組可用的模型 id 列表 */
  modelIds: string[]
  /** 數據不出域 */
  dataResidency: boolean
  /** 狀態：1=啟用，0=停用 */
  status: number
  /** 關聯部門總人數 */
  totalEmployeeCount: number
  /** 創建時間 */
  createdAt: string
  /** 更新時間 */
  updatedAt: string
  /** 最後更新人 */
  updatedBy: string
}

/** 所有部門平鋪列表（供分組選擇用） */
export interface DeptOption {
  deptId: string
  deptName: string
  employeeCount: number
}

const allDeptOptions: DeptOption[] = deptAuths.map((d) => ({
  deptId: d.deptId,
  deptName: d.deptName,
  employeeCount: d.employeeCount,
}))

const baseDeptAuthGroups: DeptAuthGroup[] = [
  {
    id: 'grp-dev',
    name: '研發通用',
    deptIds: ['dev'],
    deptNames: ['研發部'],
    modelIds: ['qwen3.7-flash', 'qwen3.7-max', 'deepseek-chat', 'deepseek-coder'],
    dataResidency: false,
    status: 1,
    totalEmployeeCount: 46,
    createdAt: '2026-08-10 09:30:00',
    updatedAt: '2026-09-01 14:20:00',
    updatedBy: 'chenwei',
  },
  {
    id: 'grp-cs-ops',
    name: '客服 + 運營標準',
    deptIds: ['cs', 'ops'],
    deptNames: ['客服部', '運營部'],
    modelIds: ['qwen3.7-flash', 'deepseek-chat'],
    dataResidency: false,
    status: 1,
    totalEmployeeCount: 192,
    createdAt: '2026-08-12 11:00:00',
    updatedAt: '2026-08-28 16:45:00',
    updatedBy: 'liuyang',
  },
  {
    id: 'grp-fin',
    name: '財務數據不出域',
    deptIds: ['fin'],
    deptNames: ['財務部'],
    modelIds: ['qwen-private'],
    dataResidency: true,
    status: 1,
    totalEmployeeCount: 22,
    createdAt: '2026-08-15 10:00:00',
    updatedAt: '2026-09-02 09:10:00',
    updatedBy: 'zhaomin',
  },
  {
    id: 'grp-store-mo',
    name: '澳門門店標準配置',
    deptIds: allDeptOptions.filter((d) => d.deptName.startsWith('澳門門店')).map((d) => d.deptId),
    deptNames: allDeptOptions.filter((d) => d.deptName.startsWith('澳門門店')).map((d) => d.deptName),
    modelIds: ['qwen3.7-flash', 'deepseek-chat'],
    dataResidency: false,
    status: 1,
    totalEmployeeCount: allDeptOptions.filter((d) => d.deptName.startsWith('澳門門店')).reduce((s, d) => s + d.employeeCount, 0),
    createdAt: '2026-08-20 08:00:00',
    updatedAt: '2026-09-01 10:00:00',
    updatedBy: 'liuyang',
  },
  {
    id: 'grp-store-tz',
    name: '氹仔門店標準配置',
    deptIds: allDeptOptions.filter((d) => d.deptName.startsWith('氹仔門店')).map((d) => d.deptId),
    deptNames: allDeptOptions.filter((d) => d.deptName.startsWith('氹仔門店')).map((d) => d.deptName),
    modelIds: ['qwen3.7-flash'],
    dataResidency: false,
    status: 0,
    totalEmployeeCount: allDeptOptions.filter((d) => d.deptName.startsWith('氹仔門店')).reduce((s, d) => s + d.employeeCount, 0),
    createdAt: '2026-08-20 08:30:00',
    updatedAt: '2026-08-25 11:30:00',
    updatedBy: 'chenwei',
  },
]

/** 部門授權分組列表 */
export async function fetchMockDeptAuthGroups(): Promise<DeptAuthGroup[]> {
  await delay()
  return baseDeptAuthGroups.map((g) => ({ ...g, deptIds: [...g.deptIds], deptNames: [...g.deptNames], modelIds: [...g.modelIds] }))
}

/** 所有部門選項（供新增/編輯時勾選） */
export async function fetchMockDeptOptions(): Promise<DeptOption[]> {
  await delay()
  return [...allDeptOptions]
}

/** 員工額外授權 */
export async function fetchMockEmployeeOverrides(): Promise<EmployeeModelOverride[]> {
  await delay()
  return employeeOverrides.map((e) => ({ ...e, extraModelIds: [...e.extraModelIds] }))
}

/** 賬號白名單兜底 */
export async function fetchMockAccountWhitelists(): Promise<AccountWhitelist[]> {
  await delay()
  return accountWhitelists.map((w) => ({ ...w, accounts: [...w.accounts] }))
}

/** 額度策略 */
export async function fetchMockQuotaPolicies(): Promise<QuotaPolicy[]> {
  await delay()
  return quotaPolicies.map((p) => ({ ...p }))
}

/** 路由策略（Auto） */
export async function fetchMockRouteStrategies(): Promise<RouteStrategy[]> {
  await delay()
  return routeStrategies.map((r) => ({ ...r, modelPool: [...r.modelPool] }))
}

/** 工具註冊中心 */
export async function fetchMockToolRegistry(): Promise<ToolDefinition[]> {
  await delay()
  return toolRegistry.map((t) => ({ ...t, params: t.params.map((p) => ({ ...p, whitelist: [...p.whitelist] })) }))
}

/** 我的用量 */
export async function fetchMockMyUsage(): Promise<MyUsage> {
  await delay()
  return { ...myUsage, recentRecords: myUsage.recentRecords.map((r) => ({ ...r })) }
}

/* ────────────────── 展示輔助 ────────────────── */

/** 幣種符號 */
export const CURRENCY_SYMBOL: Record<Currency, string> = { CNY: '¥', USD: '$' }

/** 首頁「指定模型」分組的擴充展示項（尚未接入網關，僅 UI 呈現） */
export const PENDING_MODEL_OPTIONS: Array<{ label: string; note: string }> = [
  { label: 'Qwen3.7 Max', note: '百煉 · 性能款，尚未接入網關' },
  { label: 'DeepSeek Coder', note: 'DeepSeek · 代碼專用，尚未接入網關' },
  { label: 'Qwen 私有化', note: '私有化 · 數據不出域，尚未接入網關' },
]

/** 價格文案：每百萬 Token 單價（無價格配置時顯示 --） */
export function priceText(price: ModelPrice, field: 'input' | 'output' | 'cachedInput'): string {
  const value = price[field]
  if (value === null || value === undefined) return '--'
  return `${CURRENCY_SYMBOL[price.currency]}${value}/百萬`
}

/** 上下文長度展示（131072 → 128K） */
export function contextLengthText(length: number): string {
  return length >= 1024 ? `${Math.round(length / 1024)}K` : String(length)
}
