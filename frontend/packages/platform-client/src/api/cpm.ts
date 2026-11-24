/**
 * Copyright (c) 2026 fengsong7889. All Rights Reserved.
 *
 * 本文件为「MFTB 企业一体化管理平台软件」的组成部分。
 * 未经著作权人书面许可，不得使用、复制、修改、再分发或用于任何商业目的。
 * 完整许可条款见仓库根目录 LICENSE 文件。
 */
import request, { SILENT_HEADER } from './request'

/**
 * 持續績效系統（cpm）API 契约。
 *
 * 与后端 CpmDto / CpmController / CpmAiController 逐字对应；
 * 「通知里的数字 = 页面数字」的同源约束由后端快照保证，前端不得自行重算任何聚合指标。
 */

/* ==================== 类型（与 CpmDto 对齐） ==================== */

export interface CpmItemVO {
  id: number
  title: string
  detail?: string | null
  category: string
  categoryLabel: string
  /** 阶段三扩到六值：cancelled=不再该做，deferred=改期；与后端 CHECK 同一集合 */
  status: 'todo' | 'doing' | 'done' | 'blocked' | 'cancelled' | 'deferred'
  progress: number
  workDate: string
  workHours?: number | null
  sourceType: 'manual' | 'ai' | 'rdm_requirement' | 'rdm_task' | 'meeting_action'
  sourceRef?: string | null
  sourceLabel?: string | null
  templateKey?: string | null
  version: number
  recognized?: boolean
  /* ---------- 阶段三：时间维度与 RDM 回写（全部是服务端派生值，前端不自行计算） ---------- */
  /** 首次开工时点（时段回算） */
  firstStartAt?: string | null
  /** 最近收工时点（时段回算） */
  lastEndAt?: string | null
  /** segment=时段回算 / manual=手工快填 / none=两者都无；精度不同的来源必须可见 */
  workHoursSource?: 'segment' | 'manual' | 'none' | null
  /** 当日投入分钟（跟随查询日期） */
  dayMinutes?: number | null
  /** 期间累计投入分钟 */
  totalMinutes?: number | null
  /** 任务级关联才有值；需求/手工/会议来源为 null，界面据此不出回写徽标 */
  rdmSync?: CpmRdmSyncVO | null
}

export interface CpmDayVO {
  date: string
  items: CpmItemVO[]
  carryCandidates: CpmItemVO[]
  /**
   * 当日各条目的投入时段明细，随日视图一次返回。
   *
   * 刻意不拆成「逐条目再查一次」：条目数没有上限，N 次请求会把打开日视图变成一次小型请求风暴
   * （首页那种已经记在案）。
   */
  times?: CpmItemTimeVO[]
}

export interface CpmItemForm {
  title: string
  detail?: string
  category?: string
  status?: string
  progress?: number
  workDate?: string
  workHours?: number
  templateKey?: string
  sourceType?: string
  sourceRef?: string
  sourceLabel?: string
  /** 仅 sourceType='rdm_task' 时服务端读取：关掉后 CPM 记录照常保存，只是不再推 RDM */
  rdmSyncEnabled?: boolean
  version?: number
}

/** 关联业务对象候选（后端 CpmDto.SourceVO）：状态与角色只给原始码，词表归各自域 */
export interface CpmSourceVO {
  /** rdm_requirement（只读关联）/ rdm_task（可回写）/ meeting_action */
  sourceType: 'rdm_requirement' | 'rdm_task' | 'meeting_action'
  sourceRef: string
  title: string
  subtitle?: string | null
  statusCode?: string | null
  role?: string | null
  progress?: number | null
  dueDate?: string | null
  terminated: boolean
  imported: boolean
  /** PRD 任务的 100% 只能走「提交評審」：界面预先标出，不让用户撞后端拒绝 */
  prdTask?: boolean
  /** 任务号（任务档素材） */
  externalNo?: string | null
  /** 所属需求标题（任务档副行素材，词表仍归 RDM 域） */
  parentTitle?: string | null
  /** 计划工时（小时）：只作展示素材，不参与 CPM 工时统计 */
  planHours?: number | null
}

export interface CpmProgressForm {
  progress: number
  status: string
  note?: string
  updateDate?: string
  /** 行内补记投入工时（仅分布统计；服务端夹 0~200，不进任何评价口径） */
  workHours?: number
}

export interface CpmSnapshotEntry {
  itemId: number
  title: string
  status: string
  progress: number
  workDate?: string | null
  trail: number[]
  sourceType?: string | null
  sourceLabel?: string | null
  /** 期间投入分钟；null = 既无时段也无手工工时（0 会被读成「这件事没花时间」） */
  minutes?: number | null
  /** segment=精确时段 / manual=手工估算 / none=无；两种精度不能混说 */
  minutesSource?: 'segment' | 'manual' | 'none' | null
  /** 冻结在快照里的时段区间：历史版本的导出件也读得到当时那几段 */
  segments?: CpmSnapshotSegment[]
}

/** 快照内的一段投入（比时段表本体少归属字段，专为阅读面与导出冻结） */
export interface CpmSnapshotSegment {
  workDate?: string | null
  startTime?: string | null
  endTime?: string | null
  crossesMidnight?: boolean | null
  durationMinutes?: number | null
  note?: string | null
}

export interface CpmSnapshotGroup {
  category: string
  categoryLabel: string
  items: CpmSnapshotEntry[]
  /** 本分类期间投入分钟 */
  minutes?: number | null
}

export interface CpmSnapshotTotals {
  total: number
  done: number
  doing: number
  todo: number
  blocked: number
  /** 阶段三新增两桶；V1 老快照反序列化后 undefined，按 0 处理即可 */
  cancelled?: number
  deferred?: number
}

/** 工时汇总（全部由服务端算出，前端不得二次聚合） */
export interface CpmTimeByCategory {
  category: string
  categoryLabel?: string | null
  minutes: number
}
/**
 * 单日投入。
 *
 * 字段名与后端 `CpmDto.TimeByDay` 逐字对齐（workDate 而不是 date）：契约层改名
 * 会让前端静默读到 undefined，趋势图直接变成空轴而接口一切正常。
 * 服务端只返回有投入的日期——「按日历补 0 占位」是展示层的事，不是统计层的事。
 */
export interface CpmTimeByDay { workDate: string; minutes: number }
export interface CpmTimeByItem { itemId: number; title?: string | null; minutes: number }

export interface CpmTimeTotals {
  totalMinutes: number
  /** 来自精确时段 */
  preciseMinutes: number
  /** 来自手工工时回退（估算）：与精确值分列，两者精度不同 */
  manualFallbackMinutes: number
  /** 有投入的天数——日均分母用它，不用周期自然天数 */
  activeDays: number
  avgMinutesPerActiveDay: number
  peakDate?: string | null
  peakMinutes?: number | null
  byCategory: CpmTimeByCategory[]
  byDay: CpmTimeByDay[]
  topItems: CpmTimeByItem[]
}

export interface CpmSnapshot {
  /** 1=阶段二（无工时维度），2=阶段三；V1 快照的 time 为 null，界面必须显示空态而不是全 0 */
  schemaVersion: number
  periodType: string
  periodStart: string
  periodEnd: string
  groups: CpmSnapshotGroup[]
  totals: CpmSnapshotTotals
  time?: CpmTimeTotals | null
}

/* ==================== 阶段三：投入时段 / 版本 / 日报 / 回写 ==================== */

export interface CpmTimeEntryVO {
  id: number
  itemId: number
  workDate: string
  startTime?: string | null
  endTime?: string | null
  crossesMidnight: boolean
  /** 服务端算出后固化的值；允许显式覆盖但不允许查询时二次计算 */
  durationMinutes: number
  note?: string | null
  version: number
}

export interface CpmTimeEntryForm {
  workDate?: string
  startTime?: string
  endTime?: string
  crossesMidnight?: boolean
  durationMinutes?: number
  note?: string
  version?: number
}

export interface CpmItemTimeVO {
  itemId: number
  segments: CpmTimeEntryVO[]
  dayMinutes: number
}

export interface CpmRevisionVO {
  revisionNo: number
  publishedAt?: string | null
  publisherName?: string | null
  publisherEmpNo?: string | null
  changeNote?: string | null
  current?: boolean
  schemaVersion?: number
  /** 该版条目数：让「这一版比上一版多了什么」在列表就能看见 */
  itemDelta?: number | null
}

export interface CpmRepublishForm {
  reportId: number
  changeNote: string
  summary?: string
  aiSummary?: boolean
}

export interface CpmDailyVO {
  date: string
  snapshot?: CpmSnapshot | null
  self?: boolean
  ownerName?: string | null
  ownerEmpId?: string | null
}

export type CpmSyncState = 'pending' | 'success' | 'conflict' | 'rejected' | 'error'

/**
 * RDM 回写状态。
 *
 * 它存在的唯一理由是<b>让失败看得见</b>：回写被 RDM 规则拒绝或与他人的上报冲突时，
 * CPM 的保存仍然成功（过程层不该被交付层拒掉），但界面必须如实说明「RDM 那侧没改成」和原因，
 * 否则用户会以为两边已经一致——那比不一致更糟。
 */
export interface CpmRdmSyncVO {
  enabled?: boolean
  state?: CpmSyncState | null
  message?: string | null
  syncedAt?: string | null
  taskNo?: string | null
  taskId?: number | null
  /** RDM 侧当前进度：conflict 时界面据此给出「以 X% 重新对齐」的出路 */
  rdmProgress?: number | null
}

export interface CpmReportVO {
  id?: number | null
  userId: number
  ownerName?: string | null
  ownerEmpId?: string | null
  periodType: string
  periodStart: string
  periodEnd: string
  status: 'draft' | 'published'
  summary?: string | null
  aiSummary: boolean
  publishedAt?: string | null
  snapshot?: CpmSnapshot | null
  /** 阶段三：当前生效版本号；null 表示阶段二遗留的旧发布（无版本行，界面标「歷史發送快照」） */
  revisionNo?: number | null
  publishedRevisionId?: number | null
  /** 期间内又发生了新事实：修订按钮的可见性依据，不是「我改过草稿」 */
  hasUnpublishedChanges?: boolean | null
  revisions?: CpmRevisionVO[]
  receiverCount: number
  readCount: number
  commentCount: number
  likeCount: number
  likedByMe: boolean
  version?: number | null
}

export interface CpmDraftForm {
  periodType: string
  periodStart: string
  summary?: string
  aiSummary?: boolean
}

export interface CpmTeamRow {
  userId: number
  name: string
  empId?: string | null
  department?: string | null
  submitStatus: 'published' | 'missing'
  reportId?: number | null
  publishedAt?: string | null
  totalItems?: number | null
  doneItems?: number | null
  readCount?: number | null
  receiverCount?: number | null
  commentCount?: number | null
  likeCount?: number | null
  recognizedByMe?: number | null
}

export interface CpmTeamVO {
  periodType: string
  periodStart: string
  periodEnd: string
  rows: CpmTeamRow[]
  stats: {
    memberCount: number
    publishedCount: number
    submitRate: number
    doneItemsTotal: number
    itemsTotal: number
    recognitionSentCount: number
    pendingFeedbackCount: number
  }
}

export interface CpmCommentVO {
  id: number
  targetType: string
  targetId: number
  userId: number
  authorName?: string | null
  content: string
  createdAt?: string | null
  parentId?: number | null
  mine: boolean
}

export interface CpmCommentForm {
  targetType: 'item' | 'report'
  targetId: number
  content: string
  parentId?: number
}

export interface CpmRecognitionVO {
  id: number
  targetType: string
  targetId: number
  targetTitle?: string | null
  fromUserId?: number | null
  fromName?: string | null
  toUserId?: number | null
  toName?: string | null
  kind: 'highlight' | 'milestone'
  comment: string
  periodTag: string
  createdAt?: string | null
}

export interface CpmRecognitionForm {
  targetType: 'item' | 'report'
  targetId: number
  kind: 'highlight' | 'milestone'
  comment: string
}

export interface CpmCategoryDef {
  key: string
  label: string
  hint?: string | null
}

export interface CpmTemplateVO {
  id: number
  templateKey: string
  name: string
  roleHint: string
  categories: CpmCategoryDef[]
  workHoursEnabled: boolean
  builtin: boolean
  enabled: boolean
  remark?: string | null
  updatedBy?: string | null
  updatedAt?: string | null
}

export interface CpmTemplateForm {
  templateKey: string
  name: string
  roleHint?: string
  categories: CpmCategoryDef[]
  workHoursEnabled?: boolean
  remark?: string
}

export interface CpmRuleVO {
  enabled: boolean
  periodTypes: string[]
  deadlineDay: number
  deadlineTime: string
  remindBeforeHours: number
  receiverManager: boolean
  extraReceiverIds: number[]
  extraReceiverNames: string[]
  groupPush: boolean
  personalPush: boolean
  notifyDryRun: boolean
  remark?: string | null
  updatedBy?: string | null
  updatedAt?: string | null
}

export interface CpmRuleForm {
  enabled: boolean
  periodTypes: string[]
  deadlineDay: number
  deadlineTime: string
  remindBeforeHours: number
  receiverManager: boolean
  extraReceiverIds?: number[]
  groupPush: boolean
  personalPush: boolean
  remark?: string
}

export interface CpmHomeSummaryVO {
  todayCount: number
  weekPublished: boolean
  weekPeriodStart: string
  weekFeedbackCount: number
}

export interface CpmAiCheck {
  key: string
  status: 'passed' | 'blocked' | 'not_checked'
  reasonCode?: string | null
  message?: string | null
  action?: string | null
}

export interface CpmAiStatusVO {
  enabled: boolean
  available: boolean
  authorized: boolean
  reasonCode?: string | null
  message?: string | null
  checks?: CpmAiCheck[] | null
  maxInputChars: number
  asrAvailable: boolean
  asrMaxSeconds: number
}

export interface CpmAiCandidate {
  title: string
  category: string
  status: string
  progress: number
  detail?: string | null
  sourceRefs: string[]
}

export interface CpmAiExtractionVO {
  requestKey: string
  status: 'processing' | 'succeeded' | 'failed' | 'expired'
  errorCode?: string | null
  promptVersion?: string | null
  extractionSchemaVersion?: number | null
  candidates: CpmAiCandidate[]
  summary?: string | null
  tomorrowPlan: string[]
}

export interface CpmAiExtractionForm {
  requestKey: string
  rawText: string
  templateKey?: string
}

export interface CpmAiConfirmForm {
  requestKey: string
  selected: CpmAiCandidate[]
  workDate?: string
}

/* ==================== 使用侧：条目 ==================== */

export function fetchCpmDay(date?: string): Promise<CpmDayVO> {
  return request.get<unknown, CpmDayVO>('/cpm/items/day', { params: { date } })
}

/** 条目详情（编辑页刷新/直链进入；后端仍按登录人校验，不存在则 4xx） */
export function fetchCpmItem(id: number): Promise<CpmItemVO> {
  return request.get<unknown, CpmItemVO>(`/cpm/items/${id}`)
}

export function createCpmItem(form: CpmItemForm): Promise<CpmItemVO> {
  return request.post<unknown, CpmItemVO>('/cpm/items', form)
}

export function updateCpmItem(id: number, form: CpmItemForm): Promise<CpmItemVO> {
  return request.put<unknown, CpmItemVO>(`/cpm/items/${id}`, form)
}

export function deleteCpmItem(id: number): Promise<void> {
  return request.delete<unknown, void>(`/cpm/items/${id}`)
}

export function addCpmProgress(id: number, form: CpmProgressForm): Promise<void> {
  return request.post<unknown, void>(`/cpm/items/${id}/progress`, form)
}

export function carryCpmItem(id: number): Promise<void> {
  return request.post<unknown, void>(`/cpm/items/${id}/carry`)
}

/* ==================== 使用侧：汇报 ==================== */

export function fetchCpmPreview(periodType: string, periodStart: string): Promise<CpmSnapshot> {
  return request.get<unknown, CpmSnapshot>('/cpm/reports/preview', { params: { periodType, periodStart } })
}

export function fetchCpmCurrent(periodType: string, periodStart: string): Promise<CpmReportVO> {
  return request.get<unknown, CpmReportVO>('/cpm/reports/current', { params: { periodType, periodStart } })
}

export function listMyCpmReports(periodType?: string): Promise<CpmReportVO[]> {
  return request.get<unknown, CpmReportVO[]>('/cpm/reports/mine', { params: { periodType } })
}

export function saveCpmDraft(form: CpmDraftForm): Promise<CpmReportVO> {
  return request.post<unknown, CpmReportVO>('/cpm/reports/draft', form)
}

export function publishCpmReport(form: CpmDraftForm): Promise<CpmReportVO> {
  return request.post<unknown, CpmReportVO>('/cpm/reports/publish', form)
}

export function fetchCpmReportDetail(id: number): Promise<CpmReportVO> {
  return request.get<unknown, CpmReportVO>(`/cpm/reports/${id}`)
}

/* ==================== 治理侧：团队 ==================== */

export function fetchCpmTeamBoard(periodType: string, periodStart: string): Promise<CpmTeamVO> {
  return request.get<unknown, CpmTeamVO>('/cpm/team/board', { params: { periodType, periodStart } })
}

export function remindCpmMember(userId: number, periodType: string, periodStart: string): Promise<void> {
  return request.post<unknown, void>('/cpm/team/remind', null, { params: { userId, periodType, periodStart } })
}

/* ==================== CFR ==================== */

export function addCpmComment(form: CpmCommentForm): Promise<CpmCommentVO> {
  return request.post<unknown, CpmCommentVO>('/cpm/cfr/comments', form)
}

export function listCpmComments(targetType: string, targetId: number): Promise<CpmCommentVO[]> {
  return request.get<unknown, CpmCommentVO[]>('/cpm/cfr/comments', { params: { targetType, targetId } })
}

export function deleteCpmComment(id: number): Promise<void> {
  return request.delete<unknown, void>(`/cpm/cfr/comments/${id}`)
}

export function toggleCpmReaction(targetType: string, targetId: number): Promise<{ liked: boolean }> {
  return request.post<unknown, { liked: boolean }>('/cpm/cfr/reactions', null, { params: { targetType, targetId } })
}

export function createCpmRecognition(form: CpmRecognitionForm): Promise<CpmRecognitionVO> {
  return request.post<unknown, CpmRecognitionVO>('/cpm/cfr/recognitions', form)
}

export function fetchMyRecognitions(): Promise<CpmRecognitionVO[]> {
  return request.get<unknown, CpmRecognitionVO[]>('/cpm/cfr/recognitions/mine')
}

/* ==================== 模板与规则 ==================== */

export function fetchCpmTemplates(): Promise<CpmTemplateVO[]> {
  return request.get<unknown, CpmTemplateVO[]>('/cpm/templates')
}

export function createCpmTemplate(form: CpmTemplateForm): Promise<CpmTemplateVO> {
  return request.post<unknown, CpmTemplateVO>('/cpm/templates', form)
}

export function updateCpmTemplate(id: number, form: CpmTemplateForm): Promise<CpmTemplateVO> {
  return request.put<unknown, CpmTemplateVO>(`/cpm/templates/${id}`, form)
}

export function setCpmTemplateStatus(id: number, enabled: boolean): Promise<CpmTemplateVO> {
  return request.put<unknown, CpmTemplateVO>(`/cpm/templates/${id}/status`, null, { params: { enabled } })
}

export function deleteCpmTemplate(id: number): Promise<void> {
  return request.delete<unknown, void>(`/cpm/templates/${id}`)
}

export function fetchCpmRule(): Promise<CpmRuleVO> {
  return request.get<unknown, CpmRuleVO>('/cpm/rule')
}

export function saveCpmRule(form: CpmRuleForm): Promise<CpmRuleVO> {
  return request.put<unknown, CpmRuleVO>('/cpm/rule', form)
}

/* ==================== 关联业务对象（导入候选） ==================== */

/** 本人相关且未结案的 RDM 需求（口径由 RDM 域「某人视角」裁定，前端不传身份字段） */
export function fetchCpmSourceRdm(keyword?: string): Promise<CpmSourceVO[]> {
  return request.get<unknown, CpmSourceVO[]>('/cpm/sources/rdm', { params: keyword ? { keyword } : {} })
}

/** 本人负责（含协办）的未完成会议行动项 */
export function fetchCpmSourceMeetingActions(): Promise<CpmSourceVO[]> {
  return request.get<unknown, CpmSourceVO[]>('/cpm/sources/meeting-actions')
}

/**
 * 未取消会议候选（導入會議用）。
 *
 * <p>与行动项档分开而不是合入一个接口：行动项的日期口径是「完成时限」（单日），
 * 而会议本身占着一整段预定时间，导入后要做的是甘特的<b>计划起止</b>；
 * 合成一档就会在一个列表里出现两种日期语义。
 *
 * <p>候选范围（我组织 + 我参会，含未开始与已结束）与「哪些算未取消」全部由服务端
 * 会议域端口按登录态判定；前端不传身份字段。导入后会议才被取消的联动不在这里判，
 * 那是台账读取时的对账职责。
 */
export interface CpmMeetingSourceVO {
  /** 会议 biz_meeting_booking.id，导入后落 source_ref */
  bookingId: number
  bookingNo: string
  title: string
  /** 预定开始（ISO 白日期时间）：导入后作为子任務的计划起日 */
  startTime: string
  /** 预定结束（ISO 白日期时间）：导入后作为子任務的计止日 */
  endTime: string
  /** booked / checked_in / finished；cancelled 与 released 不会出现在候选里 */
  statusCode: string
  /** organizer=我发起的，participant=我参与的 */
  role: 'organizer' | 'participant'
  roomName?: string | null
  /** 本人是否已导入过该会议（真防重仍靠条目唯一键） */
  imported?: boolean
}

export function fetchCpmSourceMeetings(keyword?: string): Promise<CpmMeetingSourceVO[]> {
  return request.get<unknown, CpmMeetingSourceVO[]>('/cpm/sources/meetings', { params: keyword ? { keyword } : {} })
}

/**
 * 本人相关的未结案 RDM <b>任务</b>（阶段三）。
 *
 * 与需求档分开而不是合并：只有任务级关联具备进度回写落点，需求档是只读关联。
 * 合并后界面就无法告诉用户「这条关联以后能不能同步进度」，而用户会按能同步的预期去填。
 */
export function fetchCpmSourceRdmTasks(keyword?: string): Promise<CpmSourceVO[]> {
  return request.get<unknown, CpmSourceVO[]>('/cpm/sources/rdm-tasks', { params: keyword ? { keyword } : {} })
}

/* ==================== 投入时段（阶段三） ==================== */

export function fetchCpmTimeEntries(itemId: number): Promise<CpmTimeEntryVO[]> {
  return request.get<unknown, CpmTimeEntryVO[]>(`/cpm/items/${itemId}/time-entries`)
}

export function createCpmTimeEntry(itemId: number, form: CpmTimeEntryForm): Promise<CpmTimeEntryVO> {
  return request.post<unknown, CpmTimeEntryVO>(`/cpm/items/${itemId}/time-entries`, form)
}

export function updateCpmTimeEntry(id: number, form: CpmTimeEntryForm): Promise<CpmTimeEntryVO> {
  return request.put<unknown, CpmTimeEntryVO>(`/cpm/time-entries/${id}`, form)
}

export function deleteCpmTimeEntry(id: number): Promise<void> {
  return request.delete<unknown, void>(`/cpm/time-entries/${id}`)
}

/* ==================== RDM 进度回写（阶段三） ==================== */

/** 条目级回写开关：关掉后 CPM 记录照常保存，只是不再推 RDM */
export function setCpmRdmSync(itemId: number, enabled: boolean): Promise<void> {
  return request.put<unknown, void>(`/cpm/items/${itemId}/rdm-sync`, null, { params: { enabled } })
}

/**
 * 重新對齊：以 RDM 当前值刷新本地基准，<b>不</b>推送本地值。
 *
 * 客户端不得把它实现成「这次不带 expectedProgress 再提交一次」——那等于关掉 RDM 的乐观锁，
 * 别人的上报会被静默顶掉。后端只读对方真值、只写本地基准列。
 */
export function realignCpmRdmSync(itemId: number): Promise<CpmRdmSyncVO> {
  return request.post<unknown, CpmRdmSyncVO>(`/cpm/items/${itemId}/rdm-sync/realign`)
}

/** 回写总闸状态：关闭时界面要说「系統未開啟回寫」而不是「同步失败」 */
export function fetchCpmRdmSyncStatus(): Promise<{ enabled: boolean }> {
  return request.get<unknown, { enabled: string | boolean }>('/cpm/rdm-sync/status',
    { headers: { [SILENT_HEADER]: '1' } }).then(r => ({ enabled: r.enabled === true || r.enabled === 'true' }))
}

/* ==================== 日报与版本（阶段三） ==================== */

/** 日报只读投影：没有发布动作，也不产生正式版本 */
export function fetchCpmDaily(date?: string, userId?: string): Promise<CpmDailyVO> {
  return request.get<unknown, CpmDailyVO>('/cpm/reports/daily', {
    params: { ...(date ? { date } : {}), ...(userId ? { userId } : {}) },
  })
}

export function fetchCpmRevisions(reportId: number): Promise<CpmRevisionVO[]> {
  return request.get<unknown, CpmRevisionVO[]>(`/cpm/reports/${reportId}/revisions`)
}

/** 读历史版本不登记已读回执：回执说的是「收到了这一期」，翻旧账不算 */
export function fetchCpmRevision(reportId: number, revisionNo: number): Promise<CpmReportVO> {
  return request.get<unknown, CpmReportVO>(`/cpm/reports/${reportId}/revisions/${revisionNo}`)
}

/** 修订重发布：服务端重新聚合后冻结为 V(n+1)；内容无变化时不产生新版本 */
export function republishCpmReport(form: CpmRepublishForm): Promise<CpmReportVO> {
  return request.post<unknown, CpmReportVO>('/cpm/reports/republish', form)
}

/**
 * Word 导出（服务端 .docx）。
 *
 * 走 blob 而不是 window.open：授权头只有 request 拦截器会加，直接开新窗口等于用无凭据请求，
 * 拿到的是 401 页面却被当成「导出功能坏了」。
 */
export async function exportCpmReportDocx(reportId: number, revisionNo?: number): Promise<Blob> {
  return request.get<unknown, Blob>(`/cpm/reports/${reportId}/export.docx`, {
    params: revisionNo ? { revisionNo } : {},
    responseType: 'blob',
  })
}

/* ==================== 工作台与 AI ==================== */

export function fetchCpmHomeSummary(): Promise<CpmHomeSummaryVO> {
  // 首页卡片静默请求：后端不可用时整栏隐藏而不是弹 toast（TodayMeetingCard 同口径）
  return request.get<unknown, CpmHomeSummaryVO>('/cpm/summary/home', { headers: { [SILENT_HEADER]: '1' } })
}

export function fetchCpmAiStatus(): Promise<CpmAiStatusVO> {
  // 预检静默：不就绪只是按钮置灰显示原因，不是错误
  return request.get<unknown, CpmAiStatusVO>('/cpm/ai/status', { headers: { [SILENT_HEADER]: '1' } })
}

/** 模型可能较慢：与纪要同口径，超时放宽到 75s */
export function extractCpmAi(form: CpmAiExtractionForm): Promise<CpmAiExtractionVO> {
  return request.post<unknown, CpmAiExtractionVO>('/cpm/ai/extractions', form, { timeout: 75000 })
}

/** 断线重连：按请求号只读查询，不重调模型 */
export function fetchCpmAiExtraction(requestKey: string): Promise<CpmAiExtractionVO> {
  return request.get<unknown, CpmAiExtractionVO>(`/cpm/ai/extractions/${requestKey}`)
}

export function confirmCpmAi(form: CpmAiConfirmForm): Promise<CpmItemVO[]> {
  return request.post<unknown, CpmItemVO[]>('/cpm/ai/extractions/confirm', form, { timeout: 30000 })
}

/** 汇报 AI 摘要：服务端以重算的确定性快照为输入，只返回概述文字（数字不经模型） */
export function fetchCpmReportAiSummary(form: { requestKey: string; periodType: string; periodStart: string }): Promise<{ text: string }> {
  return request.post<unknown, { text: string }>('/cpm/ai/report-summary', form, { timeout: 75000 })
}

/** 录音转写：音频只在请求体中一次性传递；未配置 ASR 时后端 4xx，前端按提示回落粘贴 */
export function transcribeCpmAudio(blob: Blob): Promise<{ text: string }> {
  const form = new FormData()
  form.append('audio', blob, 'speech.webm')
  return request.post<unknown, { text: string }>('/cpm/ai/transcriptions', form, { timeout: 90000 })
}
