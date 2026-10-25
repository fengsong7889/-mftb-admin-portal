/** 第一阶段交互样例，禁止用于真实授权、计费或业务执行；正式接线必须使用服务端裁决。 */
export const PREVIEW_PANES = [
  { key: 'overview', label: '平台總覽', description: '從接入到運行，先看到待處理的事' },
  { key: 'applications', label: 'Agent 應用', description: '應用列表 · 場景模板 · 版本與入口' },
  { key: 'tools', label: '工具與接入', description: '系統接入 · 工具目錄 · 連接器管理' },
  { key: 'knowledge', label: '知識與記憶', description: '知識庫 · 知識源 · 術語 · 記憶策略' },
  { key: 'models', label: '模型與成本', description: '模型端點 · 路由 · 預算 · 賬單' },
  { key: 'security', label: '策略與安全', description: '授權 · 護欄 · 審批策略 · 安全審計' },
  { key: 'runs', label: '運行中心', description: '任務 · 執行審批 · 會話 · 投遞與異常' },
  { key: 'evaluation', label: '評測與發布', description: '試驗場 · 評測集 · 發布 · 反饋改進' },
] as const

export type PreviewPane = (typeof PREVIEW_PANES)[number]['key']
export type PreviewScenario = 'knowledge' | 'rdm' | 'eam'
export type PreviewRunStatus = 'idle' | 'prepared' | 'waiting' | 'approved' | 'succeeded' | 'rejected' | 'unknown'

export const SCENARIOS: Record<PreviewScenario, { title: string; system: string; question: string; tool: string; risk: string; preview: string; source: string }> = {
  knowledge: {
    title: '授權知識問答', system: '文檔管理', question: '領用物資需要完成哪些步驟？',
    tool: 'knowledge.search', risk: 'L1 · 只讀查詢',
    preview: '依據示例規範：選擇物資與數量 → 提交申請 → 業務審批 → 由物資系統辦理。\n找不到有權訪問的依據時，應明確說明未收錄，不編造流程。',
    source: '示例文檔 DOC-DEMO-01 · v2 · 已授權片段',
  },
  rdm: {
    title: '產研進度與審批推送', system: '產研交付', question: '匯總我負責項目的風險，審批後發到項目群。',
    tool: 'rdm.progress.notify', risk: 'L3 · 審批後執行',
    preview: '【示例項目週報】\n進度：8 項已完成，2 項待驗收。\n風險：1 項依賴尚未解除，建議負責人確認交付時間。\n接收對象：示例項目群（不是實際群）。',
    source: '示例項目 PRJ-DEMO-01 · 資源版本 7',
  },
  eam: {
    title: '物資申請草稿', system: '物資管理', question: '我需要領用 2 台設備，幫我準備申請。',
    tool: 'eam.request.prepare', risk: 'L2 草稿 → 原業務審批',
    preview: '【示例領用申請】\n物資：示例設備；數量：2 台。\n可用庫存：9 台；若原系統批准並完成辦理，預計剩餘 7 台。\n本階段只產生草稿，不扣減庫存。',
    source: '示例物資 ITEM-DEMO-01 · 資源版本 3',
  },
}

export interface PreviewPolicyInput {
  budgetCents: number
  usedCents: number
  reservedCents: number
  estimatedCents: number
  authorized: boolean
  dataClass: 'public' | 'internal' | 'sensitive'
  endpoint: 'private' | 'cloud'
  approvalRequired: boolean
}

export const DEFAULT_PREVIEW_POLICY: PreviewPolicyInput = {
  budgetCents: 10_000, usedCents: 7_000, reservedCents: 2_000, estimatedCents: 1_500,
  authorized: true, dataClass: 'internal', endpoint: 'private', approvalRequired: false,
}

export interface PreviewDecision {
  kind: 'allow' | 'deny' | 'approval'
  title: string
  reason: string
  availableCents: number
  steps: string[]
}

/** 仅用于原型解释；金额样例以整数分计算，不构成服务端准入结果。 */
export function evaluatePreviewPolicy(input: PreviewPolicyInput): PreviewDecision {
  const availableCents = input.budgetCents - input.usedCents - input.reservedCents
  const steps = [`可用額度 = 預算 − 已用 − 已預占 = ${formatPreviewMoney(availableCents)} 元`]
  const result = (kind: PreviewDecision['kind'], title: string, reason: string): PreviewDecision => ({ kind, title, reason, availableCents, steps })
  if (![input.budgetCents, input.usedCents, input.reservedCents, input.estimatedCents].every(v => Number.isSafeInteger(v) && v >= 0)) {
    return result('deny', '輸入無效', '樣例金額必須是有效的非負值。')
  }
  if (!input.authorized) return result('deny', '拒絕：沒有資源權限', '審批不會自動授予原業務系統的資料權限。')
  steps.push('資源權限：通過（模擬身份）')
  if (input.endpoint === 'cloud' && input.dataClass !== 'public') {
    return result('deny', '拒絕：資料不可出域', '本樣例未批准內部／敏感資料發往外部模型；請選擇私域端點。')
  }
  steps.push(`資料策略：通過，使用${input.endpoint === 'private' ? '私域' : '外部'}端點`)
  if (input.estimatedCents > availableCents) {
    return result('approval', '待處理：需要額度審批', `本次預計 ${formatPreviewMoney(input.estimatedCents)} 元，超出可用額度 ${formatPreviewMoney(input.estimatedCents - availableCents)} 元；未調用模型、未扣費。`)
  }
  steps.push(`預算檢查：通過，本次預計 ${formatPreviewMoney(input.estimatedCents)} 元`)
  if (input.approvalRequired) return result('approval', '等待動作審批', '提案必須綁定參數與資源版本，審批完成後仍需重新校驗。')
  return result('allow', '規則試算通過', '僅表示樣例條件通過；沒有執行工具，也沒有向模型發送資料。')
}

export function formatPreviewMoney(cents: number): string {
  return (cents / 100).toLocaleString('zh-TW', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export const RUN_STATUS_LABEL: Record<PreviewRunStatus, string> = {
  idle: '尚未開始', prepared: '待核對提案', waiting: '等待業務審批', approved: '已批准，待執行',
  succeeded: '模擬完成', rejected: '已拒絕，未執行', unknown: '結果待核實，禁止盲目重試',
}

export function nextPreviewRunStatus(status: PreviewRunStatus, action: 'prepare' | 'submit' | 'approve' | 'reject' | 'execute' | 'reconcile', uncertain = false): PreviewRunStatus {
  if (action === 'prepare' && status === 'idle') return 'prepared'
  if (action === 'submit' && status === 'prepared') return 'waiting'
  if (action === 'approve' && status === 'waiting') return 'approved'
  if (action === 'reject' && status === 'waiting') return 'rejected'
  if (action === 'execute' && status === 'approved') return uncertain ? 'unknown' : 'succeeded'
  if (action === 'reconcile' && status === 'unknown') return 'succeeded'
  return status
}
