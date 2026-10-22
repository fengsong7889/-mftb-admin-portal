/**
 * 產研交付（RDM）每日日報 API
 *
 * 契約與後端 RdmDailyReportVO 逐字對應：快照結構同時是 content_json 的序列化契約，
 * 因此「通知裡的數字」與「頁面看到的數字」同源，前端不得自行重算任何進度指標。
 */
import request from './request'
import type { OptionItem } from './types'
import type { DailyReportPublicView } from './rdmDailyReportPublic'

/* ==================== 推送规则（多规则模型） ==================== */

/**
 * 一条推送规则：目标（项目 + 可选迭代）+ 时间 + 内容档位 + 模板。
 * <p>为什么是项目维度：实际用法是 A 產品盯 A 項目下的 B1 迭代、B 產品盯 B 項目下的 C1 迭代、
 * W 項目經理盯整個 W 項目——目标/时间/模板都不同，所以可建多条。
 */
export interface DailyReportRule {
  id: number
  name: string
  /** 目标项目；null = 未指定单项目（全部项目或仅未挂项目的迭代） */
  projectId: number | null
  /** 多项目范围；空数组表示单项目/全部项目/仅迭代 */
  projectIds?: number[]
  /** 范围展示文案：全部在途项目 / 项目A、项目B / 项目A / 迭代… */
  projectSummary?: string | null
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
  /** 不传/null = 不挂单项目（全部项目/仅未挂项目的紧急修复迭代） */
  projectId?: number | null
  /** 多项目范围；[] + projectId 为空 + 无迭代 = 全部在途项目 */
  projectIds?: number[]
  /** UI 显式“全部项目”；后端按 projectIds 空 + 无迭代落库 */
  allProjects?: boolean
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

/**
 * 钉钉消息固定框架的字段开关（全局一套）。
 * <p>层级框架（汇总行 → 项目 → 迭代 → 未挂项目迭代 → 查看链接）写死在后端渲染器，
 * 不可增删层级；这里只决定“每行带哪几个字段”。
 */
export interface DailyReportMessageFields {
  projectProductOwner: boolean
  projectDeliveryProgress: boolean
  projectIterationCount: boolean
  projectPeriod: boolean
  projectNextDelivery: boolean
  projectAbnormal: boolean
  iterationStatus: boolean
  iterationOwner: boolean
  iterationProgress: boolean
  iterationReqTotal: boolean
  iterationReqTodayDue: boolean
  iterationReqOverdue: boolean
  iterationPeriod: boolean
}

/** 钉钉消息模式：fixed=固定框架 / template=自定义模板文本 */
export type DailyReportMessageMode = 'fixed' | 'template'

/**
 * 无异常日降噪策略。
 * <p>full=照常发完整摘要；brief=只发一句结论；skip=当日不发（仍生成快照）。
 * <p>仅对定时推送生效；手动触发与预览永远发完整内容。
 */
export type DailyReportQuietPolicy = 'full' | 'brief' | 'skip'

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
  /** @deprecated 后端已停止读写（v3.26），改用 receiverRoles/extra/exclude 三字段 */
  receiverScope: string
  /** 收件角色白名单：pm/product_owner/tech_lead/qa_lead/ui_designer/ops_lead/project_member */
  receiverRoles: string[]
  /** 追加收件人 sys_user.id；视角是规则范围全部项目汇总 */
  extraReceiverUserIds: number[]
  /** 排除收件人 sys_user.id；优先级最高 */
  excludeReceiverUserIds: number[]
  morningTemplateKey: string | null
  eveningTemplateKey: string | null
  personalTemplateKey: string | null
  /** 看板開放連結有效期（天）；後端限制 1~90 */
  boardLinkValidDays: number
  /** 看板是否展示需求明細（樣式固定，只控制內容） */
  boardShowRequirements: boolean
  /** 看板是否展示負責人姓名 */
  boardShowOwners: boolean
  /** 看板是否展示未挂项目的迭代 */
  boardShowUnassigned: boolean
  /** 钉钉消息模式 */
  messageMode: DailyReportMessageMode
  /** 固定框架的字段开关 */
  messageFields: DailyReportMessageFields
  /** 无异常日降噪策略：full/brief/skip（仅对定时推送生效） */
  quietPolicy: DailyReportQuietPolicy
  updatedBy?: string | null
  updatedAt?: string | null
}

export interface DailyReportConfigForm {
  enabled?: boolean
  morningTime?: string
  eveningTime?: string
  groupEnabled?: boolean
  personalEnabled?: boolean
  /** @deprecated 后端忽略该字段 */
  receiverScope?: string
  /** 传 null/undefined = 沿用后端现值；传空数组 = 主动清空 */
  receiverRoles?: string[]
  extraReceiverUserIds?: number[]
  excludeReceiverUserIds?: number[]
  morningTemplateKey?: string | null
  eveningTemplateKey?: string | null
  personalTemplateKey?: string | null
  boardLinkValidDays?: number
  boardShowRequirements?: boolean
  boardShowOwners?: boolean
  boardShowUnassigned?: boolean
  messageMode?: DailyReportMessageMode
  messageFields?: Partial<DailyReportMessageFields>
  /** 传 null/undefined = 沿用后端现值 */
  quietPolicy?: DailyReportQuietPolicy
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
  /** 在途迭代数（含未挂项目的迭代，status != closed） */
  iterationActiveCount?: number
  /** 逾期需求数 */
  overdueReqCount?: number
  /** 阻塞需求数 */
  blockedReqCount?: number
  /** 逾期风险数：逾期或阻塞需求去重计数 */
  overdueRiskReqCount?: number
}

export interface DailyReportTask {
  taskId: number
  taskNo?: string | null
  title?: string | null
  /** design/frontend/app/backend/qa/data：甘特条颜色与我的甘特图同源 */
  taskType?: string | null
  /** 工作项角色编码（PM/DEV/QA/DESIGNER…） */
  roleCode?: string | null
  ownerName?: string | null
  ownerEmpNo?: string | null
  /** 进度百分比 0-100 */
  progress?: number | null
  /** 计划工时（迭代进度/产能权重） */
  planHours?: number | null
  planStartDate?: string | null
  planFinishDate?: string | null
  status?: string | null
}

export interface DailyReportRequirement {
  reqId: number
  /** 延遲發號口徑下認領前可能為空，如實展示為空而非編造 */
  reqNo?: string | null
  title?: string | null
  status?: string | null
  statusLabel?: string | null
  /** 規模：SIMPLE/MEDIUM/COMPLEX/HUGE */
  complexity?: string | null
  priority?: string | null
  assigneePmName?: string | null
  /** 當前狀態已停留天數 */
  stayDays?: number | null
  iterationCode?: string | null
  planReleaseDate?: string | null
  overdueFlag?: number | null
  blockedFlag?: number | null
  progress?: number | null
  detailUrl?: string | null
  /** 甘特數據：任務級排期 */
  tasks?: DailyReportTask[] | null
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
  /** 迭代产能工时；0=未設定 */
  capacityHours?: number | null
  /** 迭代下任务计划工时合计 */
  taskHours?: number | null
  /** 已排计划工时 / 产能；产能未设置时为 null */
  capacityUsagePercent?: number | null
  /** 任务进度按计划工时加权的迭代进度；无任务时为 null */
  progressPercent?: number | null
  taskTotal?: number | null
  taskDone?: number | null
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
  /** 項目角色負責人（有配置才展示） */
  techLeadUserName?: string | null
  qaLeadUserName?: string | null
  uiDesignerUserName?: string | null
  opsLeadUserName?: string | null
  planStartDate?: string | null
  planEndDate?: string | null
  riskFlag?: number | null
  overdueFlag?: number | null
  pausedFlag?: number | null
  requirementTotal: number
  deliveryItemTotal: number
  deliveryItemCompleted: number
  /** 交付进度百分比；交付项总数为 0 时为 null（零承诺≠完成） */
  deliveryProgressPercent?: number | null
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
  /** 快照范围说明（如「項目A / 迭代 SP202610001」） */
  scopeLabel?: string | null
  /** 快照目标项目ID（手动推送为所选项目） */
  scopeProjectId?: number | null
  /** 快照目标迭代编码（null=项目全部迭代） */
  scopeIterationCode?: string | null
  summary: DailyReportSummary
  projects: DailyReportProject[]
  /** 未掛項目的迭代：如實列出，不塞進任何項目下充數 */
  unassignedIterations: DailyReportIteration[]
  /** 全部项目口径：未挂项目、也未挂迭代的执行需求（单项目/多项目为空） */
  unassignedRequirements?: DailyReportRequirement[]
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
  /** 本次快照对应的看板链接（免登）：手动触发页弹窗预览用 */
  detailUrl?: string | null
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
  /** 范围展示文案（多项目/全部项目/未挂项目迭代） */
  scopeLabel?: string | null
  /** 快照范围键（多项目/全部项目没有单一 projectId，跳日报页必须带上它） */
  scopeKey?: string | null
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
  /** 預覽連結（免登看板）：與真實推送同一個地址，供編輯頁直接打開驗證落地頁 */
  detailUrl?: string | null
  /** 本次预览实际走的渲染路径：fixed 时草稿文本框不生效 */
  messageMode?: DailyReportMessageMode | null
}

/* ==================== 請求 ==================== */

const BASE = '/rdm/daily-report'

/** 日報快照（移動端日報頁數據源）；當日該檔未生成時後端返回 null */
export function fetchDailyReportSnapshot(date: string, type: string, projectId?: number | null,
  iterationCode?: string | null, scopeKey?: string | null): Promise<DailyReportSnapshot | null> {
  // projectId/iterationCode/scopeKey 用于多快照收敛：同一日期同一档位可能有多条（多规则 / 手动补发不同范围）
  const params: Record<string, string | number> = { date, type }
  if (projectId != null) {
    params.projectId = projectId
  }
  if (iterationCode) {
    params.iterationCode = iterationCode
  }
  // 多项目/全部项目快照没有单一 projectId，只能按范围键精确命中
  if (scopeKey) {
    params.scopeKey = scopeKey
  }
  return request.get<unknown, DailyReportSnapshot | null>(BASE, { params })
}

export function fetchDailyReportRecords(limit = 60): Promise<DailyReportRecord[]> {
  return request.get<unknown, DailyReportRecord[]>(`${BASE}/records`, { params: { limit } })
}

/**
 * 手动触发页「查看看板」：按当前数据实时生成看板视图（不发送、不落库）。
 * <p>不走公开看板链接：推送前还没有落库快照，读链接只会得到“尚未生成”。
 */
export function fetchDailyReportBoardPreview(params: {
  type: string
  projectId?: number | null
  projectIds?: number[]
  allProjects?: boolean
  iterationCode?: string | null
}): Promise<DailyReportPublicView> {
  return request.get<unknown, DailyReportPublicView>(`${BASE}/board-preview`, {
    // 加时间戳避免浏览器/代理缓存：每次点击都必须取当前数据
    params: {
      ...params,
      projectIds: params.projectIds && params.projectIds.length > 0 ? params.projectIds.join(',') : undefined,
      _t: Date.now(),
    },
  })
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

/**
 * 模板列表「最后更新人」下拉：按姓名/工号搜索启用员工。
 * <p>权限锚定在「模板配置」菜单上，不走通用 /api/employees（后者要求员工管理菜单，
 * 只被授予进度日报菜单的用户会 403，下拉静默为空）。
 */
export function fetchDailyReportEmployeeOptions(keyword: string, ids?: number[]): Promise<OptionItem[]> {
  return request.get<unknown, OptionItem[]>(`${BASE}/employee-options`, {
    params: {
      keyword: keyword || undefined,
      ids: ids && ids.length > 0 ? ids.join(',') : undefined,
    },
  })
}

/* ==================== 收件人预览 ==================== */

/** 单个收件人：来源与可见范围都摆明，避免「凭什么他能收到」说不清 */
export interface DailyReportReceiverPreviewItem {
  userId: number
  userName: string | null
  empId: string | null
  /** 命中来源：角色 code（pm/product_owner/...）或 extra（追加名单） */
  sources: string[]
  /** 该人在本规则下可见的项目数；追加收件人为规则范围全量 */
  projectCount: number
  /** 未绑定钉钉 userId 时不会收到 */
  dingtalkBound: boolean
}

/** 个人日报收件人预览：服务端按当前配置 + 规则实时范围现算，不读快照 */
export interface DailyReportReceiverPreview {
  /** 最终收件人数（已剔除排除名单，含未绑定钉钉者） */
  total: number
  /** 其中未绑定钉钉 userId 的人数 */
  unbound: number
  /** 追加收件人数（这些人的视角是规则范围全量项目） */
  extraCount: number
  receivers: DailyReportReceiverPreviewItem[]
}

/**
 * 拉取收件人预览。
 * <p>ruleId 为空时后端按「全部在途项目」估算，与页面未选规则时的默认范围一致。
 */
export function fetchDailyReportReceiverPreview(ruleId?: number | null): Promise<DailyReportReceiverPreview> {
  return request.get<unknown, DailyReportReceiverPreview>(`${BASE}/receiver-preview`, {
    params: { ruleId: ruleId ?? undefined },
  })
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
 * <p>项目范围三选一：单项目 projectId / 多项目 projectIds / 全部项目 allProjects=true。
 * <p>向項目負責人與釘釘群發消息不可撤回：調用前必須有二次確認彈窗，服務端另有 1 分鐘節流。
 */
export function triggerDailyReport(params: {
  type: string
  /** 单项目兼容参数 */
  projectId?: number
  /** 多项目范围（与 allProjects 互斥） */
  projectIds?: number[]
  /** true = 全部在途项目（不能再指定迭代） */
  allProjects?: boolean
  /** 可選：只推該項目下的某個迭代（仅单项目可用） */
  iterationCode?: string
  dryRun?: boolean
}): Promise<DailyReportTriggerResult> {
  return request.post<unknown, DailyReportTriggerResult>(`${BASE}/trigger`, null, {
    params: {
      ...params,
      projectIds: params.projectIds && params.projectIds.length > 0 ? params.projectIds.join(',') : undefined,
    },
  })
}
