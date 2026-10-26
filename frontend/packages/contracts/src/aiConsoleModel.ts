/**
 * 企業 Agent 控制台 · 第一階段交互樣板資料。
 *
 * <p>本文件只服務界面確認：所有資料寫死、只存在前端記憶體、刷新即重置。
 * 不得在此檔案引入任何請求（fetch/axios/request），也不得把這裡的判斷當成安全邊界；
 * 真實裁決在後端（分级 + 端点批准 + ACL + 预算池 + 提案）。
 */

export type ConsolePane =
  | 'overview' | 'apps' | 'budget' | 'actions'
  | 'knowledge' | 'data' | 'runs' | 'evaluation'

export interface ConsolePaneMeta {
  key: ConsolePane
  label: string
  description: string
  /** 第二階段登記為「企業 Agent」一級菜單下的二級菜單 key。 */
  menuKey: string
}

export const CONSOLE_PANES: ConsolePaneMeta[] = [
  { key: 'overview', label: '平台總覽', description: '就緒狀態與上線阻斷項', menuKey: 'agent-overview' },
  { key: 'apps', label: '應用與版本', description: '誰負責、用哪些工具與知識', menuKey: 'agent-apps' },
  { key: 'budget', label: '預算與配額', description: '上限、已預占、已用與原子准入', menuKey: 'agent-budget' },
  { key: 'actions', label: '動作提案', description: '凍結參數、審批綁定與一次性消費', menuKey: 'agent-actions' },
  { key: 'knowledge', label: '知識授權', description: '文檔 ACL 與可檢索範圍', menuKey: 'agent-knowledge' },
  { key: 'data', label: '數據與端點', description: '系統分級與模型端點批准', menuKey: 'agent-data' },
  { key: 'runs', label: '運行中心', description: '受理、步驟、取消與待核實', menuKey: 'agent-runs' },
  { key: 'evaluation', label: '評測與發布', description: '回歸門禁與不可變快照', menuKey: 'agent-evaluation' },
]

export type AppState = 'published' | 'draft'
export interface DemoApp {
  key: string
  name: string
  system: string
  owner: string
  publishedVersion: number
  tools: string[]
  knowledge: string[]
  state: AppState
}

export const DEMO_APPS: DemoApp[] = [
  {
    key: 'rdm-progress', name: '產研進度助手', system: 'rdm', owner: '林怡君（MF00012）',
    publishedVersion: 3, tools: ['rdm_query_requirements', 'rdm_project_progress', 'rdm_my_todos'],
    knowledge: ['rdm'], state: 'published',
  },
  {
    key: 'finance-qa', name: '財務制度問答', system: 'finance', owner: '陳柏宇（MF00027）',
    publishedVersion: 1, tools: ['query_account_balance', 'query_batches', 'query_approvals'],
    knowledge: ['finance', 'common'], state: 'published',
  },
  {
    key: 'eam-draft', name: '物資申請草稿助手', system: 'eam', owner: '王思婷（MF00031）',
    publishedVersion: 0, tools: [], knowledge: ['eam'], state: 'draft',
  },
]

export interface DemoPool {
  key: string
  scopeType: 'USER' | 'DEPT' | 'APP'
  scopeLabel: string
  period: string
  limit: number
  reserved: number
  used: number
  currency: string
}

export const DEMO_POOLS: DemoPool[] = [
  { key: 'pool-app-rdm', scopeType: 'APP', scopeLabel: '產研進度助手', period: '2026-10', limit: 800, reserved: 120, used: 512.4, currency: 'CNY' },
  { key: 'pool-dept-fin', scopeType: 'DEPT', scopeLabel: '財務部', period: '2026-10', limit: 2000, reserved: 0, used: 1880.75, currency: 'CNY' },
  { key: 'pool-user-31', scopeType: 'USER', scopeLabel: '王思婷（MF00031）', period: '2026-10', limit: 50, reserved: 0, used: 48.2, currency: 'CNY' },
]

export type ActionState = 'pending' | 'approved' | 'unknown' | 'executed'
export interface DemoAction {
  key: string
  tool: string
  target: string
  impact: string
  requester: string
  status: ActionState
  expiresAt: string
  approvalRef?: string
}

export const DEMO_ACTIONS: DemoAction[] = [
  { key: 'AP20261024001', tool: 'rdm_prepare_progress_push', target: '項目 PRJ2026090101', impact: '推送本週進度到項目群（3 人）', requester: '林怡君（MF00012）', status: 'pending', expiresAt: '2026-10-24 18:30' },
  { key: 'AP20261024002', tool: 'send_email', target: '每日經營日報', impact: '發送給 2 位收件人，含金額匯總', requester: '陳柏宇（MF00027）', status: 'approved', expiresAt: '2026-10-24 20:00', approvalRef: 'OA-20261024-0091' },
  { key: 'AP20261023007', tool: 'dingtalk_sender', target: '庫存預警群', impact: '低庫存提醒（可能已送達）', requester: '王思婷（MF00031）', status: 'unknown', expiresAt: '2026-10-23 22:10', approvalRef: 'OA-20261023-0088' },
  { key: 'AP20261023003', tool: 'query_approvals', target: '待審批清單', impact: '只讀查詢，無副作用', requester: '陳柏宇（MF00027）', status: 'executed', expiresAt: '2026-10-23 19:00', approvalRef: 'OA-20261023-0072' },
]

export interface DemoDataClass {
  system: string
  label: string
  level: 'PUBLIC' | 'INTERNAL' | 'SENSITIVE' | 'RESTRICTED'
  note: string
}

export const DEMO_DATA_CLASSES: DemoDataClass[] = [
  { system: 'common', label: '共用助手', level: 'PUBLIC', note: '公開制度與使用說明' },
  { system: 'rdm', label: '產研交付', level: 'INTERNAL', note: '項目、需求與進度' },
  { system: 'finance', label: '財務', level: 'SENSITIVE', note: '賬戶餘額、批次與審批' },
  { system: 'hr', label: '人事', level: 'RESTRICTED', note: '薪酬與個人資料，僅私域端點' },
]

export interface DemoEndpoint {
  model: string
  maxLevel: string
  residency: 'private' | 'external'
  expiresAt: string
  note: string
}

export const DEMO_ENDPOINTS: DemoEndpoint[] = [
  { model: 'qwen3.7-flash', maxLevel: 'SENSITIVE', residency: 'external', expiresAt: '2027-01-20', note: '公有雲，已評估資料駐留' },
  { model: 'deepseek-chat', maxLevel: 'INTERNAL', residency: 'external', expiresAt: '2027-01-20', note: '離峰通道' },
  { model: 'internal-llm-v2', maxLevel: 'RESTRICTED', residency: 'private', expiresAt: '2027-03-31', note: '內網部署，僅限審批過的私域任務' },
]

export interface DemoAcl {
  doc: string
  title: string
  subjects: string
  version: string
  state: '有效' | '已撤權'
}

export const DEMO_ACLS: DemoAcl[] = [
  { doc: 'DOC-128', title: '物資領用規範', subjects: '全員（ROLE_CODE: user）', version: 'v4', state: '有效' },
  { doc: 'DOC-233', title: '財務對賬口徑', subjects: '財務部（DEPT: 21）', version: 'v2', state: '有效' },
  { doc: 'DOC-311', title: '薪酬結構說明', subjects: 'HR 主管（ROLE: 8）', version: 'v1', state: '有效' },
  { doc: 'DOC-145', title: '舊版報銷流程', subjects: '已撤銷', version: 'v3', state: '已撤權' },
]

export type RunState = 'queued' | 'running' | 'succeeded' | 'unknown'
export interface DemoRun {
  key: string
  runNo: string
  appName: string
  requester: string
  status: RunState
  startedAt: string
  steps: { title: string; state: 'finish' | 'process' | 'wait' | 'error'; detail: string }[]
}

export const DEMO_RUNS: DemoRun[] = [
  {
    key: 'run-1', runNo: 'RUN202610240001', appName: '產研進度助手', requester: '林怡君（MF00012）',
    status: 'running', startedAt: '2026-10-24 09:12',
    steps: [
      { title: '受理並持久化', state: 'finish', detail: '冪等鍵已記錄，瀏覽器關閉仍可查' },
      { title: '准入與出域檢查', state: 'finish', detail: '分級 INTERNAL ≤ 端點批准 SENSITIVE' },
      { title: '模型與工具輪次', state: 'process', detail: '第 2 輪：查詢風險需求' },
      { title: '生成報告並投遞', state: 'wait', detail: '待人工確認接收群後再執行' },
    ],
  },
  {
    key: 'run-2', runNo: 'RUN202610230014', appName: '財務制度問答', requester: '陳柏宇（MF00027）',
    status: 'unknown', startedAt: '2026-10-23 21:40',
    steps: [
      { title: '受理並持久化', state: 'finish', detail: '已落庫' },
      { title: '模型調用', state: 'finish', detail: '已完成計量與扣費' },
      { title: '通知投遞', state: 'error', detail: '渠道超時，可能已送達：待核實，禁止重發' },
    ],
  },
  {
    key: 'run-3', runNo: 'RUN202610230009', appName: '產研進度助手', requester: '林怡君（MF00012）',
    status: 'succeeded', startedAt: '2026-10-23 18:02',
    steps: [
      { title: '受理並持久化', state: 'finish', detail: '已落庫' },
      { title: '查詢與生成', state: 'finish', detail: '3 個工具、2 輪模型' },
      { title: '結果留存', state: 'finish', detail: '報告已生成，可回看' },
    ],
  },
]

export interface DemoEvalCase {
  caseNo: string
  title: string
  expected: string
  actual: string
  passed: boolean
}

export const DEMO_EVAL_CASES: DemoEvalCase[] = [
  { caseNo: 'SEC-01', title: '無 ACL 的文檔不可被引用', expected: '拒絕', actual: '拒絕', passed: true },
  { caseNo: 'SEC-02', title: '敏感資料不得走外部端點', expected: '拒絕', actual: '拒絕', passed: true },
  { caseNo: 'SEC-03', title: '未審批的寫操作不得執行', expected: '拒絕', actual: '拒絕', passed: true },
  { caseNo: 'SEC-04', title: '他人會話不得追加事件', expected: '拒絕', actual: '拒絕', passed: true },
  { caseNo: 'FUN-01', title: '合法只讀查詢可通過試算', expected: '允許', actual: '允許', passed: true },
]

export interface DemoRelease {
  key: string
  app: string
  version: string
  releasedBy: string
  releasedAt: string
  state: '生效' | '已回滾'
}

export const DEMO_RELEASES: DemoRelease[] = [
  { key: 'rel-1', app: '產研進度助手', version: 'v3', releasedBy: '林怡君', releasedAt: '2026-10-22 16:20', state: '生效' },
  { key: 'rel-2', app: '財務制度問答', version: 'v1', releasedBy: '陳柏宇', releasedAt: '2026-10-21 11:05', state: '生效' },
  { key: 'rel-3', app: '產研進度助手', version: 'v2', releasedBy: '林怡君', releasedAt: '2026-10-10 09:40', state: '已回滾' },
]

/** 使用率：上限為 0 時視為 100%，避免誤顯示「0% 安全」。 */
export function usageRate(pool: Pick<DemoPool, 'limit' | 'reserved' | 'used'>): number {
  if (!pool.limit || pool.limit <= 0) return 100
  const rate = ((pool.reserved + pool.used) / pool.limit) * 100
  return Math.min(100, Math.max(0, Math.round(rate)))
}

export interface Readiness {
  readyForModelCalls: boolean
  readyForKnowledgeSearch: boolean
  blocking: string[]
}

/**
 * 與後端 /ops/readiness 同構的就緒判斷（僅用於界面預覽）。
 * 真實判定在後端；這裡的結果不得用於放行任何調用。
 */
export function readinessOf(input: {
  dataClasses: number
  approvedEndpoints: number
  acls: number
  publishedApps: number
}): Readiness {
  const blocking: string[] = []
  if (input.dataClasses <= 0) blocking.push('data_class_missing')
  if (input.approvedEndpoints <= 0) blocking.push('endpoint_not_approved')
  if (input.acls <= 0) blocking.push('knowledge_acl_missing')
  if (input.publishedApps <= 0) blocking.push('application_not_published')
  return {
    readyForModelCalls: input.dataClasses > 0 && input.approvedEndpoints > 0,
    readyForKnowledgeSearch: input.acls > 0,
    blocking,
  }
}

export const BLOCKING_LABELS: Record<string, string> = {
  data_class_missing: '尚未登記任何業務系統的資料分級',
  endpoint_not_approved: '尚未批准任何模型端點',
  knowledge_acl_missing: '知識文檔尚未配置 ACL',
  application_not_published: '尚無已發布的應用版本',
}
