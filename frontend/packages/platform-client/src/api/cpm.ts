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
  status: 'todo' | 'doing' | 'done' | 'blocked'
  progress: number
  workDate: string
  workHours?: number | null
  sourceType: 'manual' | 'ai' | 'rdm_requirement' | 'meeting_action'
  sourceRef?: string | null
  sourceLabel?: string | null
  templateKey?: string | null
  version: number
  recognized?: boolean
}

export interface CpmDayVO {
  date: string
  items: CpmItemVO[]
  carryCandidates: CpmItemVO[]
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
  version?: number
}

/** 关联业务对象候选（后端 CpmDto.SourceVO）：状态与角色只给原始码，词表归各自域 */
export interface CpmSourceVO {
  sourceType: 'rdm_requirement' | 'meeting_action'
  sourceRef: string
  title: string
  subtitle?: string | null
  statusCode?: string | null
  role?: string | null
  progress?: number | null
  dueDate?: string | null
  terminated: boolean
  imported: boolean
}

export interface CpmProgressForm {
  progress: number
  status: string
  note?: string
  updateDate?: string
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
}

export interface CpmSnapshotGroup {
  category: string
  categoryLabel: string
  items: CpmSnapshotEntry[]
}

export interface CpmSnapshotTotals {
  total: number
  done: number
  doing: number
  todo: number
  blocked: number
}

export interface CpmSnapshot {
  schemaVersion: number
  periodType: string
  periodStart: string
  periodEnd: string
  groups: CpmSnapshotGroup[]
  totals: CpmSnapshotTotals
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
