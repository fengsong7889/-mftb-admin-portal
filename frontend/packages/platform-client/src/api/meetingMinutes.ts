/**
 * 会议纪要 API（对接后端 /api/meeting/minutes*，与会议预约接口同源鉴权）。
 *
 * 时间口径与 api/meeting.ts 一致（混用会静默变成 Invalid date）：
 *   - 出参时间已是 'YYYY-MM-DD HH:mm:ss' 字符串，直接展示，不要再 new Date() 解析；
 *   - 入参时间必须传 ISO 带 T 分隔（复用 toMeetingIso / toMeetingIsoDate）。
 *
 * 不使用 mock 降级：纪要与发送批次是"谁在什么时候把什么内容发给了谁"的问责记录，
 * 后端不可用时必须明确报错，绝不能给出「已發送」的假成功。
 *
 * 请求体里没有 recorderUserId / organizerId：记录人由后端从 JWT 取并写快照，
 * 前端传了也不认——否则任何人都能替别人署名记纪要。
 */
import request, { resolveApiBaseUrl } from './request'

/* ==================== 模板结构 ==================== */

/** 議程與結論：一条 = 一个议题（钉钉卡片按有序列表渲染，钉钉 markdown 不支持表格） */
export type MinutesDecisionStatus = 'decided' | 'pending' | 'information'
export type MinutesAttendanceStatus = 'present' | 'absent' | 'unverified'
export const MINUTES_SCHEMA_VERSION = 2
export const MINUTES_LIMITS = { topics: 20, actions: 30, follows: 20, attendance: 100, summary: 300, purpose: 1000, deliverable: 300 } as const

export interface MinutesItem {
  topicKey?: string
  decisionStatus?: MinutesDecisionStatus
  topic: string
  discussion?: string
  conclusion?: string
}

/** 行動項：负责人存 sys_user.id + 姓名/工号快照（员工改名不得改写历史纪要） */
export interface MinutesAction {
  itemId?: number
  topicKey?: string
  deliverable?: string
  content: string
  ownerUserId?: number | null
  ownerName?: string
  ownerEmpNo?: string
  /** 'YYYY-MM-DD'，可空表示未定时限 */
  dueDate?: string | null
}

/** 未決事項：需要后续决策的事项 */
export interface MinutesOpenIssue extends MinutesAction {
  needDecisionBy?: string
}

export interface MinutesAttendance {
  userId?: number | null
  name: string
  empNo?: string
  status: MinutesAttendanceStatus
  reason?: string
  source?: string
  confirmedByName?: string
  confirmedAt?: string
}

export interface MinutesDocument {
  schemaVersion: number
  minutesNo?: string
  bookingNo?: string
  meetingTitle?: string
  meetingTimeText?: string
  roomText?: string
  meetingType?: string
  organizerName?: string
  organizerEmpNo?: string
  recorderName?: string
  recorderEmpNo?: string
  externalAttendees?: string
  revisionNo?: number
  publisherName?: string
  publisherEmpNo?: string
  publishedAt?: string
  changeNote?: string
  content: MinutesContent
  references?: MinutesLinkVO[]
  /** 发布时定格的附件引用快照：历史版本永远能说明当时发了哪几个文件 */
  attachments?: MinutesAttachmentVO[]
}

export interface MinutesRevision {
  id: number
  revisionNo: number
  publisherName?: string
  publisherEmpNo?: string
  publishedAt?: string
  changeNote?: string
  document?: MinutesDocument
}

/** 缺席记录：录入时由参会人名单给出建议值，记录人可手工增删（开会迟到不等于缺席） */
export interface MinutesAbsentee {
  userId?: number | null
  name: string
  empNo?: string
  /** 缺席原因，如「請假」「衝突」 */
  reason?: string
}

/** 纪要正文（落 biz_meeting_minutes.content_json） */
export interface MinutesContent {
  schemaVersion?: number
  purpose?: string
  /** 仅兼容历史纪要；新填写界面统一使用 purpose。 */
  summary?: string
  chairUserId?: number | null
  chairName?: string
  chairEmpNo?: string
  attendance?: MinutesAttendance[]
  items: MinutesItem[]
  actions: MinutesAction[]
  openIssues: MinutesOpenIssue[]
  absentees: MinutesAbsentee[]
  nextMeetingAt?: string | null
  nextMeetingNote?: string
  remark?: string
  /**
   * 补充说明附件号列表（服务端签发，32 位 hex）。
   * null=调用方不带附件字段（旧页面），保存时保留既有绑定；数组（含空）=正文就是这一组。
   */
  attachments?: string[] | null
}

export function emptyMinutesContent(): MinutesContent {
  return { schemaVersion: MINUTES_SCHEMA_VERSION, items: [{ topicKey: crypto.randomUUID(), topic: '', discussion: '', conclusion: '' }], actions: [], openIssues: [], absentees: [], attendance: [] }
}

/** 目的和旧摘要合并为一个阅读／填写字段；仅去除完全重复文本，不截断或改写快照。 */
export function minutesPurposeText(content: Pick<MinutesContent, 'purpose' | 'summary'>): string {
  return [...new Set([content.purpose?.trim(), content.summary?.trim()].filter((value): value is string => Boolean(value)))].join('\n\n')
}

/**
 * 正文字数（用于"至少写一条"与超长提示，不含 JSON 语法字符）。
 * 上限校验以后端为准，这里只用于即时提示，避免提交后才报错。
 */
export function minutesContentLength(content: MinutesContent): number {
  const parts: Array<string | undefined | null> = [content.nextMeetingNote, content.remark, content.summary, content.purpose]
  content.attendance?.forEach(person => parts.push(person.name, person.reason))
  content.items.forEach(item => parts.push(item.topic, item.discussion, item.conclusion))
  content.actions.forEach(item => parts.push(item.content, item.ownerName, item.deliverable))
  content.openIssues.forEach(item => parts.push(item.content, item.needDecisionBy))
  content.absentees.forEach(item => parts.push(item.name, item.reason))
  return parts.reduce((sum, value) => sum + (value?.trim().length ?? 0), 0)
}

/** 正文总字数上限：落库列 TEXT(65535)，这里留一半余量给 JSON 结构与快照字段 */
export const MINUTES_CONTENT_MAX_LENGTH = 8000

/* ==================== 出参 ==================== */

/** 周期会议系列的纪要时间轴条目：同一 series 下按 seriesSeq 排序，便于连续查看 */
export interface MinutesSeriesNode {
  bookingId: number
  seriesSeq: number
  title: string
  startTime: string
  /** 该场是否已录入纪要 */
  hasMinutes: boolean
  minutesId?: number | null
  status: string
  current: boolean
}

export interface MinutesVO {
  meetingTitle?: string
  meetingTimeText?: string
  roomText?: string
  organizerName?: string
  document?: MinutesDocument
  publishedRevisionId?: number
  publishedRevisionNo?: number
  publishedAt?: string
  hasUnpublishedChanges?: boolean
  canReadDraft?: boolean
  canPublish?: boolean
  canManageSends?: boolean
  publicationEnabled?: boolean
  cardEnabled?: boolean
  /** false 表示这场会还没有纪要（不是错误，前端按"录入"态渲染） */
  exists: boolean
  id?: number
  minutesNo?: string
  bookingId: number
  bookingNo?: string
  /** draft=草稿 sent=已发送过（已发出的纪要禁止物理删除） */
  status?: string
  recorderUserId?: number | null
  recorderName?: string
  recorderEmpNo?: string
  content?: MinutesContent
  /** 纪要摘要（结论首条），列表与详情头部展示 */
  digest?: string | null
  sendCount?: number
  lastSendAt?: string | null
  version?: number
  canEdit?: boolean
  canSend?: boolean
  /**
   * 不能编辑的原因（canEdit=false 时服务端才给）：PERMISSION=没权限，
   * MEETING_NOT_RECORDED=这场会还没开始或已取消/释放。两者在界面上都只表现为按钮消失，
   * 但用户该做的事完全不同（一个找管理员开权限，一个是还不到记纪要），提示必须分开。
   */
  editLockReason?: string | null
  /** 灰度开关：后端未开启纪要能力时前端隐藏入口，不在前端写死 */
  minutesEnabled?: boolean
  /** 免登链接使用的站点地址；null=未配置（卡片不会带链接） */
  linkBaseUrl?: string | null
  /** 站点地址是否看起来可从外网访问；false=内网/本地地址，手机打不开 */
  linkBasePublic?: boolean
  createdBy?: string | null
  createdAt?: string | null
  updatedBy?: string | null
  updatedAt?: string | null
  series?: MinutesSeriesNode[]
  /** 行动项与跟进事项（v2：独立成表，含状态与处理结果） */
  items?: MinutesItemView[]
  /** 关联的其他会议纪要（带来源快照） */
  links?: MinutesLinkVO[]
  /** 当前草稿正文引用的附件元数据（仅可写者可见；非可写者看 document.attachments） */
  attachments?: MinutesAttachmentVO[]
  /** 当前登录人是否对本次会议的某个事项负责（负责人回来更新状态不要求菜单写权限） */
  itemOwner?: boolean
  /**
   * 建议缺席名单（仅 exists=false 骨架返回）：服务端给原因码，文案在这里按当前语言翻译。
   * 前端仍可增删——开会迟到十分钟不该被系统直接写成缺席。
   */
  suggestedAbsentees?: { userId?: number | null; name: string; empNo?: string; reasonCode?: string }[]
}

/** 事项（行动项 / 跟进事项）：状态与处理结果由负责人或记录人回填 */
export interface MinutesItemView {
  version?: number
  topicKey?: string
  deliverable?: string
  id: number
  /** ACTION=行動項 FOLLOW=跟進事項 */
  kind: 'ACTION' | 'FOLLOW'
  seq: number
  content: string
  ownerUserId?: number | null
  ownerName?: string
  ownerEmpNo?: string
  /** 'YYYY-MM-DD' */
  dueDate?: string | null
  /** pending/done */
  status: 'pending' | 'done'
  /** completed/partial/cannot */
  result?: string | null
  resolutionNote?: string | null
  doneAt?: string | null
  doneByName?: string | null
  overdue?: boolean
  canResolve?: boolean
}

/** 关联纪要（展示一律用快照：被引用纪要改名/改期后仍能说清“引自哪场会”） */
export interface MinutesLinkVO {
  minutesId: number
  minutesNo?: string
  bookingNo?: string
  title?: string
  timeText?: string
}

/** 附件元数据：只回展示与访问需要的字段，对象键/路径不下发；previewKind 由服务端判定 */
export interface MinutesAttachmentVO {
  attachmentNo: string
  fileName: string
  mimeType: string
  sizeBytes: number
  /** image=站内放大，pdf=浏览器直开，office=查看时转 PDF，none=仅下载 */
  previewKind: 'image' | 'pdf' | 'office' | 'none'
  uploaderName?: string
  uploadedAt?: string
}

/** 站内附件访问票据：新标签页/钉钉外部浏览器带不了 JWT，用 5 分钟短票换文件直链 */
export interface MinutesAttachmentAccess {
  attachmentNo: string
  purpose: 'view' | 'download'
  ticket: string
  expiresAt: string
}

/** 行政侧纪要列表行 */
export interface MinutesAdminRow {
  publishedRevisionId?: number
  publishedRevisionNo?: number
  publishedAt?: string
  hasUnpublishedChanges?: boolean
  minutesId: number
  bookingId: number
  minutesNo?: string
  bookingNo?: string
  meetingTitle?: string
  meetingTimeText?: string
  roomText?: string
  recorderName?: string
  recorderEmpNo?: string
  status?: string
  sendCount?: number
  lastSendAt?: string | null
  itemTotal?: number
  itemPending?: number
  itemOverdue?: number
  digest?: string | null
}

export interface MinutesAdminPage {
  list: MinutesAdminRow[]
  total: number
  pendingItems: number
  overdueItems: number
  sentMinutes: number
}

/** 投递态（biz_meeting_minutes_delivery.send_status）；与参会人行的 notify_status 是两套词表，不得混用 */
export type MinutesSendStatus = 'pending' | 'sending' | 'success' | 'partial' | 'failed' | 'skipped'

export interface MinutesDeliveryVO {
  id: number
  /** GROUP=钉钉群一行，USER=收件人一行 */
  targetType: string
  receiverName?: string | null
  receiverEmpNo?: string | null
  receiverDepartment?: string | null
  groupName?: string | null
  dingtalkBound?: boolean
  sendStatus: string
  retryCount?: number | null
  errorMsg?: string | null
  updatedAt?: string | null
}

export interface MinutesSendBatchVO {
  revisionId?: number
  revisionNo?: number
  messageType?: 'markdown' | 'action_card'
  buttonTitle?: string
  id: number
  minutesId: number
  batchSeq: number
  /** 发送瞬间的正文快照渲染源，与当前纪要正文可能不同（这就是"已发出的内容"） */
  contentSnapshot?: MinutesContent
  markdownSnapshot?: string
  groupChannelId?: number | null
  groupChannelName?: string | null
  receiverCount: number
  sendStatus: string
  successCount?: number
  failedCount?: number
  skippedCount?: number
  errorMsg?: string | null
  /** 免登只读链接（相对路径，绝对地址由前端用自身 origin 拼，开发/生产域名不同） */
  viewUrl?: string | null
  linkExpireAt?: string | null
  /** 链接是否已被作废（全局或单批次） */
  linkRevoked?: boolean
  operatorName?: string
  operatorEmpNo?: string | null
  sentAt?: string | null
  deliveries?: MinutesDeliveryVO[]
}

/** 群候选：只回 id 与名称，webhook/secret/手机号一律不下发（纪要页要给全员看，凭据不能外泄） */
export interface MinutesGroupOption {
  id: number
  name: string
}

export interface MinutesSaveForm {
  /** 新建必填；编辑时后端按 id 定位，忽略该字段 */
  bookingId?: number
  content: MinutesContent
  /**
   * 事项（行动项 + 跟进事项）：v2 起由服务端写独立表。
   * 按位置即身份：同一 kind 的第 N 条在多次保存间保持同一行，状态与处理结果不会被覆盖。
   */
  items?: { kind: 'ACTION' | 'FOLLOW'; content: string; ownerUserId?: number | null; dueDate?: string | null }[]
  /** 关联纪要 id（标题/时间由服务端回查生成快照） */
  linkedMinutesIds?: number[]
  /** 审核为“实际已参会”的员工（钉钉未签到的补录） */
  markPresentUserIds?: number[]
  /** 幂等键：一次提交生成一个，重放不会长出第二条纪要 */
  requestKey?: string
  /** 可选：本次保存所套用的 AI 提取请求号，服务端同事务登记「已应用」，防跨会话重复套用 */
  aiExtractionRequestKey?: string | null
  /** 可选：本次采用的条目键（ref 列表） */
  appliedKeys?: string[]
  /** 编辑必填：乐观锁，冲突时后端拒绝而不是静默覆盖 */
  version?: number
}

export interface MinutesSendForm {
  revisionId?: number
  acknowledgePublicLink?: boolean
  alsoNotifyAttendees?: boolean
  groupChannelId?: number | null
  receiverUserIds: number[]
  requestKey: string
  version: number
}

export interface MinutesSendResult {
  revisionId?: number
  revisionNo?: number
  sendId: number
  batchSeq: number
  /** 本次真的进了投递队列的人数 */
  queued: number
  /** 留痕但未发送的人数（未绑定钉钉、场景未启用等，原因见 deliveries） */
  skipped: number
  /** 工作通知场景已启用并绑定了企业应用；「場景未啟用」提示只能看这个字段 */
  scenarioActive: boolean
  /** 群是否进了投递队列（未选群时为 false） */
  groupQueued: boolean
  /** 本批链接用的站点地址与可达性（与 MinutesVO 同口径） */
  linkBaseUrl?: string | null
  linkBasePublic?: boolean
  deliveries?: MinutesDeliveryVO[]
}

/**
 * 投递明细的收件人展示口径：GROUP 行没有收件人，用群名占位，
 * 否则发送历史里会出现一行空白接收人（同「参会人：待發送」与「投递：已送達」互相否定的老问题）。
 */
export function minutesDeliveryTarget(row: MinutesDeliveryVO): string {
  if (row.targetType === 'GROUP') return row.groupName || '-'
  return `${row.receiverName || '-'}${row.receiverEmpNo ? `（${row.receiverEmpNo}）` : ''}`
}

export function publishMinutes(id: number, payload: { version: number; requestKey: string; changeNote?: string }): Promise<MinutesRevision> {
  return request.post<unknown, MinutesRevision>(`/meeting/minutes/${id}/publish`, payload)
}

export function fetchMinutesRevisions(id: number): Promise<MinutesRevision[]> {
  return request.get<unknown, MinutesRevision[]>(`/meeting/minutes/${id}/revisions`)
}

export function fetchMinutesRevision(id: number, revisionId: number): Promise<MinutesRevision> {
  return request.get<unknown, MinutesRevision>(`/meeting/minutes/${id}/revisions/${revisionId}`)
}

/* ==================== 请求 ==================== */

/** 取某场会的纪要；不存在时后端回 exists=false 骨架（不是 404，前端不需要 catch） */
export function fetchMinutes(bookingId: number): Promise<MinutesVO> {
  return request.get<unknown, MinutesVO>('/meeting/minutes', { params: { bookingId } })
}

/** 按纪要 id 取（站内只读查看页用；被发送过的非参会人也读得到自己收到的那一条） */
export function fetchMinutesById(id: number): Promise<MinutesVO> {
  return request.get<unknown, MinutesVO>(`/meeting/minutes/${id}`)
}

export function createMinutes(payload: MinutesSaveForm): Promise<MinutesVO> {
  return request.post<unknown, MinutesVO>('/meeting/minutes', payload)
}

export function updateMinutes(id: number, payload: MinutesSaveForm): Promise<MinutesVO> {
  return request.put<unknown, MinutesVO>(`/meeting/minutes/${id}`, payload)
}

/** 发送：一个批次 = 一条群消息 + N 个收件人，投递结果异步回写，本接口只回受理结论 */
export function sendMinutes(id: number, payload: MinutesSendForm): Promise<MinutesSendResult> {
  return request.post<unknown, MinutesSendResult>(`/meeting/minutes/${id}/send`, payload)
}

/** 发送历史（批次 + 每批投递明细），「再次编辑发送」的入口数据 */
export function fetchMinutesSends(id: number): Promise<MinutesSendBatchVO[]> {
  return request.get<unknown, MinutesSendBatchVO[]>(`/meeting/minutes/${id}/sends`)
}

/** 作废历史免登链接：token_version 递增，已发出去的链接立刻读不到内容 */
export function revokeMinutesLinks(id: number, version: number): Promise<MinutesVO> {
  return request.post<unknown, MinutesVO>(`/meeting/minutes/${id}/revoke-links`, { version })
}

/** 单批次链接作废：只失效指定批次的免登链接，其他批次不受影响 */
export function revokeBatchLink(minutesId: number, sendId: number): Promise<void> {
  return request.post<unknown, void>(`/meeting/minutes/${minutesId}/sends/${sendId}/revoke-link`)
}

export function fetchMinutesGroups(): Promise<MinutesGroupOption[]> {
  return request.get<unknown, MinutesGroupOption[]>('/meeting/minutes/groups')
}

/* ==================== v2：事项跟踪 / 关联 / 行政检索 ==================== */

/** 更新事项处理结果：部分完成/无法完成必须写原因（“为什么没办成”比“没办成”重要） */
export function resolveMinutesItem(itemId: number, payload: { result: string; note?: string; version?: number }): Promise<MinutesVO> {
  return request.post<unknown, MinutesVO>(`/meeting/minutes/items/${itemId}/resolve`, payload)
}

/** 关联纪要候选（纪要单号/会议单号/主题模糊匹配，最多 20 条） */
export function searchMinutes(keyword: string, excludeId?: number): Promise<MinutesLinkVO[]> {
  return request.get<unknown, MinutesLinkVO[]>('/meeting/minutes/search', { params: { keyword, excludeId } })
}

/** 行政侧纪要检索（會議治理 › 會議紀要）；统计口径跟随搜索条件 */
export function fetchMinutesAdminPage(params: {
  keyword?: string
  startDate?: string
  endDate?: string
  recorderKeyword?: string
  status?: string
  itemState?: string
  page?: number
  size?: number
}): Promise<MinutesAdminPage> {
  return request.get<unknown, MinutesAdminPage>('/meeting/minutes/admin/page', { params })
}

/* ==================== 补充说明附件 ==================== */

/**
 * 原始字节流上传（不走 multipart，不为单个附件放宽全站限制）。
 * requestKey 幂等：重试/双击不重复占用存储；类型/大小服务端重验，前端限制只是 UX。
 */
export function uploadMinutesAttachment(bookingId: number, file: File, requestKey: string): Promise<MinutesAttachmentVO> {
  return request.post<unknown, MinutesAttachmentVO>('/meeting/minutes/attachments', file, {
    params: { bookingId, fileName: file.name, requestKey },
    headers: { 'Content-Type': file.type || 'application/octet-stream' },
    timeout: 120000,
  })
}

/** 删除尚未绑定的附件（仅上传人）；已随纪要保存的只能从正文移除引用 */
export function deleteMinutesAttachment(attachmentNo: string): Promise<void> {
  return request.delete<unknown, void>(`/meeting/minutes/attachments/${attachmentNo}`)
}

/** 签发访问票据：接口走 JWT，票据地址在白名单路径下，新标签页才能直接打开 */
export function fetchMinutesAttachmentAccess(attachmentNo: string, purpose: 'view' | 'download'): Promise<MinutesAttachmentAccess> {
  return request.get<unknown, MinutesAttachmentAccess>(`/meeting/minutes/attachments/${attachmentNo}/access`, { params: { purpose } })
}

/**
 * 拼附件文件直链：生产前端与后端不同源，必须用 resolveApiBaseUrl 而不是站点 origin。
 * 票据/令牌只出现在查询参数里，不拼进任何可被收藏的长期地址。
 */
export function minutesAttachmentFileUrl(params: { attachmentNo: string; ticket?: string; token?: string; purpose?: 'view' | 'download' }): string {
  const base = `${resolveApiBaseUrl()}/public/meeting-minutes/attachment-file`
  const query = new URLSearchParams({ attachmentNo: params.attachmentNo })
  if (params.ticket) query.set('ticket', params.ticket)
  if (params.token) query.set('token', params.token)
  if (params.purpose) query.set('purpose', params.purpose)
  return `${base}?${query.toString()}`
}

/* ==================== AI 辅助录入（笔记 + 提取） ==================== */

/** @员工标记：mentionRef 是临时别名，真实 userId 由服务端回查，前端不自报身份。 */
export interface MinutesNoteMention {
  mentionRef?: string
  userId?: number | null
  name: string
  start?: number | null
  end?: number | null
}

export interface MinutesNoteForm {
  bookingId: number
  rawText: string
  mentions: MinutesNoteMention[]
  /** 乐观锁：新建传 0，编辑传上次读到的版本 */
  noteVersion: number
  requestKey: string
}

export interface MinutesNoteVO {
  exists: boolean
  rawText: string
  mentions: MinutesNoteMention[]
  noteVersion: number
  updatedAt?: string | null
  lastExtractionRequestKey?: string | null
  maxChars: number
}

export interface MinutesAiStatusVO {
  available: boolean
  reasonCode?: string | null
  maxInputChars: number
  enabled: boolean
  /** 当前登录人是否具备会议 AI 整理权限（能记笔记不等于能调 AI）。 */
  authorized?: boolean
  /** 后端映射后的可读原因。 */
  message?: string | null
  /** 就绪检查项，供界面展示「为什么不可用」。 */
  checks?: { key: string; status: 'passed' | 'blocked' | 'not_checked'; reasonCode?: string | null; message?: string | null }[]
}

export interface MinutesAiExtractionForm {
  bookingId: number
  noteVersion: number
  baseMinutesId?: number | null
  baseMinutesVersion?: number | null
  requestKey: string
}

export interface MinutesAiProposalItem {
  ref?: string
  topic: string
  discussion?: string | null
  conclusion?: string | null
  decisionStatus?: MinutesDecisionStatus | null
  sourceRefs: string[]
}

export interface MinutesAiProposalAction {
  ref?: string
  topicRef?: string | null
  content: string
  ownerUserId?: number | null
  ownerName?: string | null
  ownerEmpNo?: string | null
  dueDate?: string | null
  deliverable?: string | null
  sourceRefs: string[]
}

export interface MinutesAiProposalOpenIssue {
  ref?: string
  topicRef?: string | null
  content: string
  ownerUserId?: number | null
  ownerName?: string | null
  dueDate?: string | null
  sourceRefs: string[]
}

export interface MinutesAiProposal {
  purpose?: string | null
  items: MinutesAiProposalItem[]
  actions: MinutesAiProposalAction[]
  openIssues: MinutesAiProposalOpenIssue[]
}

export interface MinutesAiAnnotation {
  proposalKey: string
  field: string
  sourceRefs: string[]
  rawText?: string | null
  parseStatus?: string | null
}

export interface MinutesAiCandidate { userId: number; name: string; empNo?: string | null }

export interface MinutesAiIssue {
  code: string
  proposalKey: string
  field: string
  severity: string
  candidates: MinutesAiCandidate[]
}

export interface MinutesAiUsage { model?: string; promptTokens?: number; completionTokens?: number; meteringStatus?: string }

export type MinutesAiExtractionStatus = 'processing' | 'succeeded' | 'failed' | 'unknown' | 'expired'

export interface MinutesAiExtractionVO {
  requestKey: string
  status: MinutesAiExtractionStatus
  extractionSchemaVersion: number
  promptVersion?: string
  source?: { noteVersion: number; sourceHash: string; baseMinutesId?: number | null; baseMinutesVersion?: number | null }
  context?: { meetingDate?: string; timezone?: string }
  proposal?: MinutesAiProposal
  annotations?: MinutesAiAnnotation[]
  issues?: MinutesAiIssue[]
  usage?: MinutesAiUsage
  errorCode?: string | null
}

/** 读个人笔记（含最近可恢复的提取请求号） */
export function fetchMinutesNote(bookingId: number): Promise<MinutesNoteVO> {
  return request.get<unknown, MinutesNoteVO>('/meeting/minutes/notes', { params: { bookingId } })
}

/** 自动保存个人笔记（不触发模型、不动正式草稿版本） */
export function saveMinutesNote(payload: MinutesNoteForm): Promise<MinutesNoteVO> {
  return request.put<unknown, MinutesNoteVO>('/meeting/minutes/notes', payload)
}

/** AI 可用性预检（不预占、不扣费） */
export function fetchMinutesAiStatus(bookingId: number): Promise<MinutesAiStatusVO> {
  return request.get<unknown, MinutesAiStatusVO>('/meeting/minutes/ai/status', { params: { bookingId } })
}

/** 执行一次提取（幂等：同 requestKey 重放返回原结果）；模型可能较慢，超时放宽到 75s */
export function extractMinutesAi(payload: MinutesAiExtractionForm): Promise<MinutesAiExtractionVO> {
  return request.post<unknown, MinutesAiExtractionVO>('/meeting/minutes/ai/extractions', payload, { timeout: 75000 })
}

/** 重连后按请求号查询本次结果（只读，不重调模型） */
export function fetchMinutesAiExtraction(requestKey: string): Promise<MinutesAiExtractionVO> {
  return request.get<unknown, MinutesAiExtractionVO>(`/meeting/minutes/ai/extractions/${requestKey}`)
}
