/**
 * 会议管理 API（M1：对接真实后端 /api/meeting/*）
 *
 * 时间字段约定（与后端 MeetingBookingDto / MeetingRoomDto 注释一致，混用会静默变成 Invalid date）：
 *   - 出参时间已是 'YYYY-MM-DD HH:mm:ss' 字符串，直接展示，不要再 new Date() 解析；
 *   - 入参时间必须传 ISO 带 T 分隔（toIso() 统一产出），后端口是 LocalDateTime。
 *
 * 不使用 mock 降级：预约是"谁在什么时候占了哪间房"的问责记录，
 * 后端不可用时必须明确报错，绝不能回退到本地假数据或给出「已预约」的假成功。
 *
 * 请求体里没有 organizerId：组织者由后端从 JWT 取，前端传了也不认。
 */
import dayjs from 'dayjs'
import request from './request'

/* ==================== 通用 ==================== */

export interface Page<T> { records: T[]; total: number }
/** 列表响应：分页数据 + 与列表同一组条件算出的统计卡（见 AGENTS.md §E.8） */
export interface PageWithStats<T, S> { page: Page<T>; stats: S }

/** 生成后端 LocalDateTime 可解析的 ISO 串（必须带 T，不含毫秒与时区） */
export function toMeetingIso(value: string | Date | dayjs.Dayjs | null | undefined): string | undefined {
  if (!value) return undefined
  const d = dayjs.isDayjs(value) ? value : dayjs(value as string | Date)
  return d.isValid() ? d.format('YYYY-MM-DDTHH:mm:ss') : undefined
}

export function toMeetingIsoDate(value: string | Date | dayjs.Dayjs | null | undefined): string | undefined {
  if (!value) return undefined
  const d = dayjs.isDayjs(value) ? value : dayjs(value as string | Date)
  return d.isValid() ? d.format('YYYY-MM-DD') : undefined
}

/** 幂等键：一次表单提交生成一个，重放同一提交不会长出第二场会 */
export function newMeetingRequestKey(prefix = 'mt'): string {
  const rand = Math.random().toString(36).slice(2, 8)
  return `${prefix}-${Date.now().toString(36)}-${rand}`
}

/* ==================== 会议室档案 ==================== */

export interface MeetingRoomQuery {
  page?: number
  size?: number
  keyword?: string
  city?: string
  campus?: string
  building?: string
  floorCode?: string
  minCapacity?: number
  facilities?: string[]
  status?: string
  bookableOnly?: boolean
  roomIds?: number[]
}

export interface MeetingRoomVO {
  id: number
  roomNo: string
  roomName: string
  /** 所在城市：跨城办公场景下防订错（后端第二阶段落库，当前仅前端透传） */
  city?: string | null
  campus?: string | null
  building?: string | null
  floorCode?: string | null
  locationDesc?: string | null
  locationText: string
  capacity: number
  facilities: string[]
  photoUrls: string[]
  status: string
  bookable: boolean
  /** 'HH:mm'；为 null 表示未单独配置、由后端回落到全局默认 */
  bookableStartTime?: string | null
  bookableEndTime?: string | null
  minDuration?: number | null
  maxDuration?: number | null
  checkinRequired: boolean
  releaseAfterMinutes?: number | null
  hideTitle: boolean
  adminUserIds: number[]
  adminUserNames?: string | null
  remark?: string | null
  /** 生效值来源：true=房间自身配置，false=回落全局默认（档案页要区分这两者） */
  windowConfigured?: boolean
  durationConfigured?: boolean
  futureBookingCount?: number
  createdBy?: string | null
  createdAt?: string | null
  updatedBy?: string | null
  updatedAt?: string | null
  version: number
}

export interface MeetingRoomForm {
  roomNo: string
  roomName: string
  city?: string
  campus?: string
  building?: string
  floorCode?: string
  locationDesc?: string
  capacity: number
  facilities?: string[]
  photoUrls?: string[]
  status?: string
  bookable?: boolean
  bookableStartTime?: string | null
  bookableEndTime?: string | null
  minDuration?: number | null
  maxDuration?: number | null
  checkinRequired?: boolean
  releaseAfterMinutes?: number | null
  hideTitle?: boolean
  adminUserIds?: number[]
  remark?: string
  /** 编辑必须带回；后端比对失败即拒绝，不静默覆盖别人的修改 */
  expectVersion?: number
}

export interface MeetingRoomStats {
  total: number
  active: number
  bookable: number
  seatsTotal: number
}

export interface AvailabilityQuery {
  from: string
  to: string
  /** 按城市收窄房间候选（跨城办公防订错） */
  city?: string
  roomIds?: number[]
  minCapacity?: number
  facilities?: string[]
}

export interface OccupancySlot {
  roomId: number
  bookingNo?: string | null
  /** hide_title=1 的房间只回「已占用」，主题与组织者一律脱敏 */
  title: string
  organizerName?: string | null
  startTime: string
  endTime: string
}

export interface RoomAvailability {
  roomId: number
  roomNo: string
  roomName: string
  /** 所在城市：预约页单独蓝色徽章，locationText 不含城市 */
  city?: string | null
  locationText: string
  capacity: number
  facilities: string[]
  bookable: boolean
  status: string
  bookableStartTime: string
  bookableEndTime: string
  slots: OccupancySlot[]
}

export interface RoomUpcoming {
  bookingId: number
  bookingNo: string
  title: string
  organizerName?: string | null
  startAt: string
  endAt: string
  status: string
}

export function fetchMeetingRooms(query: MeetingRoomQuery): Promise<PageWithStats<MeetingRoomVO, MeetingRoomStats>> {
  return request.get<unknown, PageWithStats<MeetingRoomVO, MeetingRoomStats>>('/meeting/rooms', { params: query })
}

export function fetchMeetingRoomDetail(id: number): Promise<MeetingRoomVO> {
  return request.get<unknown, MeetingRoomVO>(`/meeting/rooms/${id}`)
}

export function fetchBookableRooms(): Promise<MeetingRoomVO[]> {
  return request.get<unknown, MeetingRoomVO[]>('/meeting/rooms/options')
}

export function fetchRoomAvailability(payload: AvailabilityQuery): Promise<RoomAvailability[]> {
  return request.post<unknown, RoomAvailability[]>('/meeting/rooms/availability', payload)
}

export function fetchRoomUpcoming(id: number): Promise<RoomUpcoming[]> {
  return request.get<unknown, RoomUpcoming[]>(`/meeting/rooms/${id}/upcoming`)
}

export function fetchCities(): Promise<string[]> {
  return request.get<unknown, string[]>('/meeting/rooms/cities')
}

/** 园区清单；传 city 则只返回该城市下的园区（跨城同名园区不串候选） */
export function fetchCampuses(city?: string): Promise<string[]> {
  return request.get<unknown, string[]>('/meeting/rooms/campuses', { params: { city } })
}

export function fetchBuildings(campus?: string): Promise<string[]> {
  return request.get<unknown, string[]>('/meeting/rooms/buildings', { params: { campus } })
}

export function fetchFloors(campus?: string, building?: string): Promise<string[]> {
  return request.get<unknown, string[]>('/meeting/rooms/floors', { params: { campus, building } })
}

export function createMeetingRoom(payload: MeetingRoomForm): Promise<number> {
  return request.post<unknown, number>('/meeting/rooms', payload)
}

export function updateMeetingRoom(id: number, payload: MeetingRoomForm): Promise<void> {
  return request.put(`/meeting/rooms/${id}`, payload)
}

export function changeMeetingRoomStatus(id: number, payload: { status: string; version: number }): Promise<void> {
  return request.put(`/meeting/rooms/${id}/status`, payload)
}

export function deleteMeetingRoom(id: number, payload: { reason: string; version: number }): Promise<void> {
  return request.delete(`/meeting/rooms/${id}`, { data: payload })
}

/* ==================== 会议预约 ==================== */

/** scope=mine 我发起的 / attended 我参与的 / all 全量（仅行政视野生效） */
export type MeetingScope = 'mine' | 'attended' | 'all'
/** group=pending 待开 / ongoing 进行中 / done 已结束 */
export type MeetingGroup = 'pending' | 'ongoing' | 'done'

export interface MeetingQuery {
  page?: number
  size?: number
  scope?: MeetingScope
  from?: string
  to?: string
  roomId?: number
  status?: string
  bizType?: string
  organizerId?: number
  departmentId?: number
  keyword?: string
  group?: MeetingGroup
  /**
   * 响应态筛选：目前只有 'pending'（只看“我还没表态”的邀约）。
   * 不要用 group='pending' 代替 —— 那是会议阶段（待開會），与“我要不要参加”无关。
   */
  respond?: 'pending'
}

export interface MeetingAttendeeVO {
  id: number
  userId?: number | null
  empNo?: string | null
  name: string
  departmentName?: string | null
  attendeeType: string
  response: string
  respondAt?: string | null
  notifyStatus?: string | null
  /** 投递说明，如「未綁定釘釘」「組織者本人不發送邀約」 */
  notifyNote?: string | null
  checkinAt?: string | null
  invalidReason?: string | null
}

export interface MeetingNotifyVO {
  id: number
  eventCode: string
  scenario: string
  receiverName: string
  receiverEmpNo?: string | null
  dingtalkBound: boolean
  sendStatus: string
  retryCount?: number | null
  errorMsg?: string | null
  updatedAt?: string | null
}

export interface MeetingEventVO {
  id: number
  eventCode: string
  reason?: string | null
  operatorName: string
  operatorEmpNo?: string | null
  occurredAt: string
  beforeJson?: string | null
  afterJson?: string | null
}

export interface MeetingVO {
  id: number
  bookingNo: string
  title: string
  status: string
  /** 派生态：pending/ongoing/ended 或终态本身，由后端按时间与状态算出 */
  phase: string
  startTime: string
  endTime: string
  timeText: string
  durationMinutes: number
  roomId: number
  roomNo?: string | null
  roomName: string
  roomLocation?: string | null
  roomBookable?: boolean | null
  organizerId: number
  organizerEmpNo?: string | null
  organizerName: string
  departmentId?: number | null
  departmentName?: string | null
  attendeeCount: number
  description?: string | null
  onlineMeetingUrl?: string | null
  externalAttendees?: string | null
  bizType: string
  bizId?: number | null
  bizNo?: string | null
  bizUrl?: string | null
  delegateForId?: number | null
  delegateForName?: string | null
  /** 我与这场会的身份：organizer/required/optional/external/none，前端据此决定按钮 */
  myRole?: string | null
  /** 我的响应：pending/accepted/declined/invalid；非参会人为 null */
  myResponse?: string | null
  canEdit: boolean
  canCancel: boolean
  canRelease: boolean
  canCheckin: boolean
  /** 服务端按规则算出的签到窗口（前端不自己拼，避免与后端两处口径漂移） */
  checkinOpenAt?: string | null
  checkinDeadlineAt?: string | null
  canFinish: boolean
  checkinRequired: boolean
  /** 周期归属（M2）：单场为 null */
  seriesId?: number | null
  seriesSeq?: number | null
  checkinAt?: string | null
  actualEndAt?: string | null
  noShow?: number | null
  cancelReason?: string | null
  releaseReason?: string | null
  releaseAt?: string | null
  /** 邀约未送达人数（未绑定钉钉等），详情页显式提示而不是静默少发 */
  notifySkippedCount?: number | null
  /**
   * 纪要入口结论（服务端算）：与这场会的关系 + 会议阶段 + 纪要动作权限三者一起判定。
   * 旧版本后端不下发时为 null，前端按 minutesAccess 的同口径派生兜底（只收窄不放宽）。
   */
  canMinutes?: boolean | null
  /** 本会纪要状态：none/draft/sent，列表行据此把「紀要」按钮显示成「查看紀要」 */
  minutesStatus?: string | null
  minutesId?: number | null
  version: number
  createdBy?: string | null
  createdAt?: string | null
  updatedBy?: string | null
  updatedAt?: string | null
  attendees?: MeetingAttendeeVO[]
  notifies?: MeetingNotifyVO[]
}

export interface MeetingCreateForm {
  title: string
  roomId: number
  startTime: string
  endTime: string
  attendeeUserIds?: number[]
  optionalUserIds?: number[]
  externalAttendees?: string[]
  description?: string
  onlineMeetingUrl?: string
  bizType?: string
  bizId?: number
  bizNo?: string
  bizUrl?: string
  /**
   * 行政代订：实际使用人 sys_user.id，仅持有 meeting-record:edit 的行政可传。
   * 姓名快照由服务端按 id 回查，前端不传名字（防止伪造台账）。
   */
  delegateForId?: number
  requestKey?: string
}

/** 改期不迁移使用人（后端刻意不接收该字段），因此类型上直接排除，避免前端以为可改 */
export interface MeetingUpdateForm extends Omit<MeetingCreateForm,
  'requestKey' | 'bizType' | 'bizId' | 'bizNo' | 'bizUrl' | 'delegateForId'> {
  version: number
  changeNote?: string
  bizType?: string
  bizId?: number
  bizNo?: string
  bizUrl?: string
}

export interface MeetingStats {
  total: number
  pending: number
  ongoing: number
  finished: number
  cancelled: number
  released: number
}

export interface MeetingScheduleVO {
  bookingId: number
  bookingNo: string
  title: string
  date: string
  startTime: string
  endTime: string
  roomName: string
  roomLocation?: string | null
  status: string
  phase: string
  myRole?: string | null
  myResponse?: string | null
  canCheckin: boolean
}

export interface MeetingMySummary {
  todayCount: number
  upcomingCount: number
  pendingResponseCount: number
  nextTitle?: string | null
  nextStartTime?: string | null
  nextRoomName?: string | null
}

export interface MeetingCreateResult {
  bookingId: number
  bookingNo: string
  /** 本次是否真的把邀约进了投递队列（只选自己一人时也是 false，不要拿它判场景是否启用） */
  inviteQueued: boolean
  /** 通知场景已启用并绑定了企业应用；「場景未啟用」提示只能看这个字段 */
  scenarioActive?: boolean
  notifySkippedCount: number
}

export function fetchMeetings(query: MeetingQuery): Promise<PageWithStats<MeetingVO, MeetingStats>> {
  return request.get<unknown, PageWithStats<MeetingVO, MeetingStats>>('/meeting/bookings', { params: query })
}

export function fetchMeetingDetail(id: number): Promise<MeetingVO> {
  return request.get<unknown, MeetingVO>(`/meeting/bookings/${id}`)
}

export function fetchMeetingEvents(id: number): Promise<MeetingEventVO[]> {
  return request.get<unknown, MeetingEventVO[]>(`/meeting/bookings/${id}/events`)
}

export function createMeeting(payload: MeetingCreateForm): Promise<MeetingCreateResult> {
  return request.post<unknown, MeetingCreateResult>('/meeting/bookings', payload)
}

export function updateMeeting(id: number, payload: MeetingUpdateForm): Promise<MeetingVO> {
  return request.put<unknown, MeetingVO>(`/meeting/bookings/${id}`, payload)
}

export function cancelMeeting(id: number, payload: { reason: string; version: number }): Promise<void> {
  return request.post(`/meeting/bookings/${id}/cancel`, payload)
}

export function respondMeeting(id: number, payload: { accept: boolean; note?: string }): Promise<MeetingVO> {
  return request.post<unknown, MeetingVO>(`/meeting/bookings/${id}/attendees/me/response`, payload)
}

export function fetchMySchedule(date?: string): Promise<MeetingScheduleVO[]> {
  return request.get<unknown, MeetingScheduleVO[]>('/meeting/my/schedule', { params: { date } })
}

export function fetchMyMeetingSummary(): Promise<MeetingMySummary> {
  return request.get<unknown, MeetingMySummary>('/meeting/my/summary')
}

/* ==================== M2：签到 / 提前结束 / 释放 ==================== */

export function checkinMeeting(id: number): Promise<MeetingVO> {
  return request.post<unknown, MeetingVO>(`/meeting/bookings/${id}/checkin`)
}

export function finishMeeting(id: number): Promise<MeetingVO> {
  return request.post<unknown, MeetingVO>(`/meeting/bookings/${id}/finish`)
}

export function releaseMeeting(id: number, payload: { reason: string; version: number }): Promise<MeetingVO> {
  return request.post<unknown, MeetingVO>(`/meeting/bookings/${id}/release`, payload)
}

/** 本人签到令牌（详情页二维码/复制链接用；只有参会人能领到自己的） */
export interface MeetingCheckinToken {
  token: string
  /** 后端能拼出绝对地址时给出（依赖已绑定的企业应用站点），否则由前端用自身 origin 兜底 */
  url?: string | null
  expireAt: string
  bookingId: number
}

export function issueCheckinToken(id: number): Promise<MeetingCheckinToken> {
  return request.post<unknown, MeetingCheckinToken>(`/meeting/bookings/${id}/checkin-token`)
}

/* ==================== M2：周期会议 ==================== */

export interface SeriesForm {
  title: string
  roomId: number
  startDate: string
  timeStart: string
  timeEnd: string
  freq: string
  intervalN: number
  byWeekday?: number[]
  endDate?: string
  occurrenceLimit?: number
  attendeeUserIds?: number[]
  optionalUserIds?: number[]
  externalAttendees?: string[]
  description?: string
  onlineMeetingUrl?: string
  bizType?: string
  bizId?: number
  bizNo?: string
  bizUrl?: string
  /** 行政代订：实际使用人 sys_user.id，整个系列一次性裁定，实例继承 */
  delegateForId?: number
  requestKey?: string
}

export interface SeriesPreview {
  seq: number
  date: string
  weekdayText: string
  startTime: string
  endTime: string
}

export interface SeriesSkipped {
  seq: number
  startTime: string
  endTime: string
  reason: string
  conflictBookingNo?: string | null
  conflictTitle?: string | null
  conflictOrganizer?: string | null
}

export interface SeriesVO {
  id: number
  seriesNo: string
  freq: string
  intervalN: number
  byWeekday: number[]
  freqText: string
  timeStart: string
  timeEnd: string
  startDate: string
  endDate?: string | null
  occurrenceLimit: number
  generatedCount: number
  skippedCount: number
  roomId: number
  roomNo?: string | null
  roomName: string
  roomLocation?: string | null
  title: string
  description?: string | null
  onlineMeetingUrl?: string | null
  bizType: string
  bizId?: number | null
  bizNo?: string | null
  bizUrl?: string | null
  organizerId: number
  organizerName: string
  organizerEmpNo?: string | null
  departmentName?: string | null
  status: string
  cancelledScope?: string | null
  cancelReason?: string | null
  nextStartTime?: string | null
  version: number
  createdBy?: string | null
  createdAt?: string | null
  updatedBy?: string | null
  updatedAt?: string | null
  instances?: MeetingVO[]
  preview?: SeriesPreview[]
}

export interface SeriesCreateResult {
  seriesId: number
  seriesNo: string
  generatedCount: number
  skippedCount: number
  inviteQueued?: boolean
  /** 通知场景已启用并绑定了企业应用；「場景未啟用」提示只能看这个字段 */
  scenarioActive?: boolean
  notifySkippedCount?: number
  skipped?: SeriesSkipped[]
}

export function previewSeries(form: SeriesForm): Promise<SeriesPreview[]> {
  return request.post<unknown, SeriesPreview[]>('/meeting/series/preview', form)
}

export function createSeries(form: SeriesForm): Promise<SeriesCreateResult> {
  return request.post<unknown, SeriesCreateResult>('/meeting/series', form)
}

export function fetchSeries(id: number): Promise<SeriesVO> {
  return request.get<unknown, SeriesVO>(`/meeting/series/${id}`)
}

export function cancelSeries(id: number, payload: { scope: string; bookingId?: number; reason: string; version: number }) {
  return request.post(`/meeting/series/${id}/cancel`, payload)
}

/* ==================== M2：预约规则与黑名单 ==================== */

export interface MeetingRuleForm {
  advanceDays: number
  minLeadMinutes: number
  defaultDuration: number
  maxDuration: number
  granularityMinutes: number
  bookableStart: string
  bookableEnd: string
  remindMinutes: number
  checkinOpenMinutes: number
  releaseAfterMinutes: number
  noShowThreshold: number
  blacklistDays: number
  changeReason?: string
}

export interface MeetingRuleView {
  rule: MeetingRuleForm
  /** 尚未落库、当前使用后端代码兜底值的键 */
  missingKeys?: string[]
  updatedBy?: string | null
  updatedAt?: string | null
}

export interface BlacklistItem {
  id: number
  userId: number
  empNo?: string | null
  name: string
  departmentName?: string | null
  reason: string
  source: string
  noShowCount: number
  startDate: string
  endDate: string
  status: string
  /** effective/expired/revoked（到期由日期派生，不落库） */
  displayState: string
  remainingDays?: number | null
  revokeReason?: string | null
  revokedByName?: string | null
  revokedAt?: string | null
  version: number
  createdBy?: string | null
  createdAt?: string | null
}

export interface BlacklistStats {
  total: number
  effective: number
  expired: number
  revoked: number
}

export interface BlacklistQuery {
  page?: number
  size?: number
  keyword?: string
  source?: string
  status?: string
  userId?: number
}

export function fetchMeetingRules(): Promise<MeetingRuleView> {
  return request.get<unknown, MeetingRuleView>('/meeting/config')
}

export function saveMeetingRules(payload: MeetingRuleForm) {
  return request.put('/meeting/config', payload)
}

export function fetchBlacklist(query: BlacklistQuery): Promise<PageWithStats<BlacklistItem, BlacklistStats>> {
  return request.get<unknown, PageWithStats<BlacklistItem, BlacklistStats>>('/meeting/blacklist', { params: query })
}

export function addBlacklist(payload: { userId: number; reason: string; days: number }): Promise<number> {
  return request.post<unknown, number>('/meeting/blacklist', payload)
}

export function revokeBlacklist(id: number, payload: { reason: string; version: number }) {
  return request.post(`/meeting/blacklist/${id}/revoke`, payload)
}
