/**
 * 產研交付（RDM）每日日報 API
 *
 * 契約與後端 RdmDailyReportVO 逐字對應：快照結構同時是 content_json 的序列化契約，
 * 因此「通知裡的數字」與「頁面看到的數字」同源，前端不得自行重算任何進度指標。
 */
import request from './request'

/* ==================== 推送规则（多规则模型） ==================== */

/**
 * 一条推送规则：目标（项目 + 可选迭代）+ 时间 + 内容档位 + 模板。
 * <p>为什么是项目维度：实际用法是 A 產品盯 A 項目下的 B1 迭代、B 產品盯 B 項目下的 C1 迭代、
 * W 項目經理盯整個 W 項目——目标/时间/模板都不同，所以可建多条。
 */
export interface DailyReportRule {
  id: number
  name: string
  projectId: number
  projectNo?: string | null
  projectName?: string | null
  /** null = 该项目全部迭代 */
  iterationCode?: string | null
  iterationName?: string | null
  /** HH:mm */
  pushTime: string
  /** morning=今日焦点 / evening=当日复盘 */
  contentType: string
  groupTemplateKey?: string | null
  personalTemplateKey?: string | null
  enabled: boolean
  remark?: string | null
  updatedBy?: string | null
  updatedAt?: string | null
}

export interface DailyReportRuleForm {
  id?: number
  name: string
  projectId?: number
  /** 空 = 项目全部迭代 */
  iterationCode?: string | null
  pushTime: string
  contentType: string
  groupTemplateKey?: string | null
  personalTemplateKey?: string | null
  enabled?: boolean
  remark?: string
}

/* ==================== 推送配置 ==================== */

/** 推送配置（全庫只一行，後端以 config_slot='default' 約束） */
export interface DailyReportConfig {
  /** 日報總開關；關閉後定時與手動觸發都不出站 */
  enabled: boolean
  /** 晨報推送時間 HH:mm */
  morningTime: string
  /** 晚報推送時間 HH:mm */
  eveningTime: string
  groupEnabled: boolean
  personalEnabled: boolean
  /** all_projects=全部在途項目 / risk_only=僅風險逾期項目 */
  receiverScope: string
  morningTemplateKey: string | null
  eveningTemplateKey: string | null
  personalTemplateKey: string | null
  updatedBy?: string | null
  updatedAt?: string | null
}

export interface DailyReportConfigForm {
  enabled?: boolean
  morningTime?: string
  eveningTime?: string
  groupEnabled?: boolean
  personalEnabled?: boolean
  receiverScope?: string
  morningTemplateKey?: string | null
  eveningTemplateKey?: string | null
  personalTemplateKey?: string | null
}

/* ==================== 推送模板 ==================== */

export interface DailyReportTemplate {
  id: number
  templateKey: string
  name: string
  /** group=釘釘群 / personal=工作通知 */
  channel: string
  /** morning / evening / any */
  reportType: string
  titleTpl: string
  contentTpl: string
  /** 預置模板不可刪（只可停用），是「恢復默認」的底線 */
  preset: boolean
  defaultTemplate: boolean
  enabled: boolean
  remark?: string | null
  updatedBy?: string | null
  updatedAt?: string | null
}

export interface DailyReportTemplateForm {
  id?: number
  /** 為空表示「另存為新模板」，由服務端發鍵 */
  templateKey?: string
  name: string
  channel?: string
  reportType?: string
  titleTpl: string
  contentTpl: string
  enabled?: boolean
  remark?: string
  /** 是否同時設為當前使用（寫入配置行對應檔位） */
  applyAsDefault?: boolean
}

/* ==================== 快照（content_json 契約） ==================== */

export interface DailyReportSummary {
  projectCount: number
  todayDueItemCount: number
  overdueItemCount: number
  tomorrowDueItemCount: number
  riskProjectCount: number
  normalProjectCount: number
  todayDoneItemCount: number
  todayReleasedCount: number
  todayChangedCount: number
  requirementTotal: number
  deliveryItemTotal: number
  deliveryItemCompleted: number
  todoTotal: number
}

export interface DailyReportRequirement {
  reqId: number
  /** 延遲發號口徑下認領前可能為空，如實展示為空而非編造 */
  reqNo?: string | null
  title?: string | null
  status?: string | null
  statusLabel?: string | null
  priority?: string | null
  assigneePmName?: string | null
  iterationCode?: string | null
  planReleaseDate?: string | null
  overdueFlag?: number | null
  blockedFlag?: number | null
  progress?: number | null
  detailUrl?: string | null
}

export interface DailyReportIteration {
  iterationId: number
  /** null 表示未掛項目（hotfix 平台級熱修，或存量待補掛） */
  projectId?: number | null
  code?: string | null
  name?: string | null
  iterationType?: string | null
  status?: string | null
  startDate?: string | null
  endDate?: string | null
  ownerName?: string | null
  requirementCount: number
  requirementDoneCount: number
  requirements: DailyReportRequirement[]
}

export interface DailyReportProject {
  projectId: number
  projectNo?: string | null
  projectName?: string | null
  status?: string | null
  pmUserId?: number | null
  pmUserName?: string | null
  productOwnerUserId?: number | null
  productOwnerUserName?: string | null
  planStartDate?: string | null
  planEndDate?: string | null
  riskFlag?: number | null
  overdueFlag?: number | null
  pausedFlag?: number | null
  requirementTotal: number
  deliveryItemTotal: number
  deliveryItemCompleted: number
  /**
   * 剩餘工作 = 交付項總數 − 已完成數。
   * 展示側必須先短路 deliveryItemTotal === 0：新建但尚未排交付項的項目得到 0−0=0，
   * 任何 remaining <= 0 的判定都會把「還沒承諾任何交付項」謊報成「全部完成」。
   */
  remainingCount: number
  deliveryItemOverdue: number
  deliveryItemBlocked: number
  deliveryItemTesting: number
  deliveryItemPendingAcceptance: number
  taskTotal: number
  taskCompleted: number
  todoTotal: number
  nextDeliveryDate?: string | null
  attention: boolean
  detailUrl?: string | null
  iterations: DailyReportIteration[]
  unscheduledRequirements: DailyReportRequirement[]
}

export interface DailyReportSnapshot {
  reportDate: string
  /** morning / evening / manual */
  reportType: string
  reportTypeLabel?: string | null
  generatedAt?: string | null
  summary: DailyReportSummary
  projects: DailyReportProject[]
  /** 未掛項目的迭代：如實列出，不塞進任何項目下充數 */
  unassignedIterations: DailyReportIteration[]
}

/* ==================== 觸發與記錄 ==================== */

export interface DailyReportTriggerResult {
  reportDate: string
  reportType: string
  projectCount: number
  groupDispatched: boolean
  personalSent: number
  personalSkipped: number
  dryRun: boolean
  groupTitle?: string | null
  groupContent?: string | null
  message?: string | null
}

export interface DailyReportRecord {
  id: number
  reportDate: string
  /** morning / evening / manual（手動觸發寫 manual，與定時行分開各自自洽） */
  reportType: string
  /** 推送規則ID（手動觸發為 null） */
  ruleId?: number | null
  ruleName?: string | null
  projectId?: number | null
  projectNo?: string | null
  projectName?: string | null
  iterationCode?: string | null
  projectCount?: number | null
  personalCount?: number | null
  pushCount?: number | null
  /** schedule / manual */
  triggerType?: string | null
  /** 手動觸發人姓名快照（定時為 null） */
  triggerBy?: string | null
  lastPushAt?: string | null
  createdAt?: string | null
  updatedAt?: string | null
}

export interface DailyReportPreviewForm {
  reportType: string
  channel?: string
  /** 草稿模板（不傳則用庫裡選中/默認的模板） */
  titleTpl?: string
  contentTpl?: string
  receiverUserId?: number
  projectId?: number
  /** 預覽目標迭代（不傳=該項目全部迭代） */
  iterationCode?: string
}

export interface DailyReportPreviewResult {
  title: string
  content: string
  /** 模板裡出現但渲染器不認識的佔位符（已原樣輸出，供頁面提示拼寫錯誤） */
  unknownPlaceholders: string[]
  reportDate: string
  reportType: string
}

/* ==================== 請求 ==================== */

const BASE = '/rdm/daily-report'

/** 日報快照（移動端日報頁數據源）；當日該檔未生成時後端返回 null */
export function fetchDailyReportSnapshot(date: string, type: string, projectId?: number | null): Promise<DailyReportSnapshot | null> {
  // projectId 用于多快照收敛：同一日期同一档位可能有多条（多规则 / 手动补发不同项目）
  return request.get<unknown, DailyReportSnapshot | null>(BASE, {
    params: projectId == null ? { date, type } : { date, type, projectId },
  })
}

export function fetchDailyReportRecords(limit = 60): Promise<DailyReportRecord[]> {
  return request.get<unknown, DailyReportRecord[]>(`${BASE}/records`, { params: { limit } })
}

export function fetchDailyReportConfig(): Promise<DailyReportConfig> {
  return request.get<unknown, DailyReportConfig>(`${BASE}/config`)
}

/** 推送规则列表（含项目编号/名称与迭代名称） */
export function fetchDailyReportRules(): Promise<DailyReportRule[]> {
  return request.get<unknown, DailyReportRule[]>(`${BASE}/rules`)
}

/** 保存规则：带 id 为编辑，否则新增 */
export function saveDailyReportRule(form: DailyReportRuleForm): Promise<DailyReportRule> {
  return request.post<unknown, DailyReportRule>(`${BASE}/rule`, form)
}

/** 删除规则（软删除，历史记录保留） */
export function deleteDailyReportRule(id: number): Promise<void> {
  return request.delete(`${BASE}/rule/${id}`)
}

export function saveDailyReportConfig(form: DailyReportConfigForm): Promise<DailyReportConfig> {
  return request.put<unknown, DailyReportConfig>(`${BASE}/config`, form)
}

export function fetchDailyReportTemplates(channel?: string): Promise<DailyReportTemplate[]> {
  return request.get<unknown, DailyReportTemplate[]>(`${BASE}/templates`, { params: channel ? { channel } : {} })
}

export function saveDailyReportTemplate(form: DailyReportTemplateForm): Promise<DailyReportTemplate> {
  return request.post<unknown, DailyReportTemplate>(`${BASE}/template`, form)
}

export function deleteDailyReportTemplate(id: number): Promise<void> {
  return request.delete(`${BASE}/template/${id}`)
}

/** 設為當前使用的模板（寫入配置行對應檔位） */
export function applyDailyReportTemplate(templateKey: string): Promise<void> {
  return request.post<unknown, void>(`${BASE}/template/${encodeURIComponent(templateKey)}/apply`)
}

/** 渲染預覽：用真實數據渲染，不發送、不落庫 */
export function previewDailyReport(form: DailyReportPreviewForm): Promise<DailyReportPreviewResult> {
  return request.post<unknown, DailyReportPreviewResult>(`${BASE}/preview`, form)
}

/**
 * 手動觸發推送（需 rdm-daily-report-trigger:trigger 權限）。
 * <p>項目必選：不選項目等於一次性給全公司刷一遍，服務端會直接拒。
 * <p>向項目負責人與釘釘群發消息不可撤回：調用前必須有二次確認彈窗，服務端另有 1 分鐘節流。
 */
export function triggerDailyReport(params: {
  type: string
  projectId: number
  /** 可選：只推該項目下的某個迭代 */
  iterationCode?: string
  dryRun?: boolean
}): Promise<DailyReportTriggerResult> {
  return request.post<unknown, DailyReportTriggerResult>(`${BASE}/trigger`, null, { params })
}
