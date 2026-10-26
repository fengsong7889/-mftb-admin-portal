/**
 * 考勤假勤系统 API（system_code = attendance）
 *
 * 后端接口: /api/attendance/*
 *
 * **不提供 mock 降级**：考勤组、班次、节假日、排班是考勤判定与薪酬取数的真值来源，
 * 后端不可用时拿假数据让用户继续排班/确认异常，落库就是无法追溯的脏数据
 * （与 vehicleMaster.ts 同一口径）。后端不可用由页面横幅如实报错。
 *
 * 时间字段契约（由后端 AttendanceJsonContractTest 锁定）：
 * - 班次时间 = `HH:mm` 字符串（AttendanceShiftVO 已收敛，不带秒）
 * - 日期 = `yyyy-MM-dd`，日期时间 = `yyyy-MM-dd HH:mm:ss`
 * - 实体上的 LocalDateTime 是毫秒时间戳，因此**所有面向界面的读取都走 VO**，不要直连实体接口
 */
import request from './request'
import type { PageResult } from './employee'

/* ==================== 枚举（与后端 AttendanceConstants / 实体常量逐字对齐） ==================== */

/** 考勤制度：1=固定班制 2=排班制 3=自由工时 */
export const GROUP_TYPE = { FIXED: 1, ROTATION: 2, FLEX: 3 } as const
export type GroupTypeCode = (typeof GROUP_TYPE)[keyof typeof GROUP_TYPE]

/** 成员范围：1=按部门 2=按门店 3=指定名单 */
export const SCOPE_TYPE = { DEPT: 1, STORE: 2, LIST: 3 } as const

/** 打卡来源：1=钉钉同步 2=手工导入（3=人工补录由服务端写入，表单不可选） */
export const PUNCH_SOURCE = { DINGTALK: 1, IMPORT: 2, REISSUE: 3 } as const
export type PunchSourceCode = (typeof PUNCH_SOURCE)[keyof typeof PUNCH_SOURCE]

/** 卡别：1=上班卡 2=下班卡 */
export const PUNCH_TYPE = { ON: 1, OFF: 2 } as const

/** 打卡判定：1=正常 2=迟到 3=早退 4=外勤 5=无效卡 */
export const PUNCH_RESULT = { NORMAL: 1, LATE: 2, EARLY: 3, OUTSIDE: 4, INVALID: 5 } as const
export type PunchResultCode = (typeof PUNCH_RESULT)[keyof typeof PUNCH_RESULT]

/** 异常类型：1=迟到 2=早退 3=缺卡 4=旷工 5=未排班 */
export const EXCEPTION_TYPE = {
  LATE: 1, EARLY: 2, MISSING_CARD: 3, ABSENT: 4, UNSCHEDULED: 5,
} as const
export type ExceptionTypeCode = (typeof EXCEPTION_TYPE)[keyof typeof EXCEPTION_TYPE]

/** 异常处理状态：1=待处理 2=已补卡 3=已请假抵扣 4=已加班抵扣 5=已确认 */
export const EXCEPTION_STATUS = {
  PENDING: 1, HANDLED: 2, LEAVE: 3, OVERTIME: 4, CONFIRMED: 5,
} as const
export type ExceptionStatusCode = (typeof EXCEPTION_STATUS)[keyof typeof EXCEPTION_STATUS]

/** 节假日类型：1=法定节假日 2=调休上班 3=公司假期 */
export const HOLIDAY_TYPE = { LEGAL: 1, SWAP_WORKDAY: 2, COMPANY: 3 } as const
export type HolidayTypeCode = (typeof HOLIDAY_TYPE)[keyof typeof HOLIDAY_TYPE]

/** 排班来源：1=手工 2=复制上周 3=导入 */
export const SCHEDULE_SOURCE = { MANUAL: 1, COPY: 2, IMPORT: 3 } as const

/** 启停状态（主数据通用） */
export const ENABLE_STATUS = { ENABLED: 'enabled', DISABLED: 'disabled' } as const

/** 月度汇总状态机：严格单向 draft → frozen → synced */
export const MONTHLY_STATUS = { DRAFT: 'draft', FROZEN: 'frozen', SYNCED: 'synced' } as const
export type MonthlyStatusCode = (typeof MONTHLY_STATUS)[keyof typeof MONTHLY_STATUS]

/** 加班类别：1=工作日 2=休息日 3=法定节假日 */
export const OVERTIME_KIND = { WORKDAY: 1, RESTDAY: 2, HOLIDAY: 3 } as const

/* ==================== 类型 ==================== */

/** 班次视图（后端 AttendanceShiftVO） */
export interface ShiftVO {
  id: number
  shiftCode: string
  shiftName: string
  /** HH:mm；弹性班次为空 */
  onTime?: string | null
  offTime?: string | null
  /** 1=下班时间落在次日 */
  crossDay?: number | null
  workHours?: number | null
  restStart?: string | null
  restEnd?: string | null
  /** 1=弹性工时，不判定迟到早退 */
  flexFlag?: number | null
  status: string
  remark?: string | null
  updatedBy?: string | null
  updatedAt?: string | null
}

/** 班次提交体：id 为空即新建；shiftCode 编辑时由服务端以库中值为准 */
export interface ShiftPayload {
  id?: number | null
  shiftCode: string
  shiftName: string
  onTime?: string | null
  offTime?: string | null
  crossDay?: number | null
  workHours?: number | null
  restStart?: string | null
  restEnd?: string | null
  flexFlag?: number | null
  status?: string | null
  remark?: string | null
}

/** 节假日视图（后端 AttendanceHolidayVO） */
export interface HolidayVO {
  id: number
  holidayDate: string
  holidayName: string
  holidayType: HolidayTypeCode | number
  yearNo: number
  status: string
  remark?: string | null
  updatedBy?: string | null
  updatedAt?: string | null
}

/** 节假日提交体：yearNo 由服务端按日期推导，不需要传 */
export interface HolidayPayload {
  id?: number | null
  holidayDate: string
  holidayName: string
  holidayType: number
  status?: string | null
  remark?: string | null
}

/** 考勤组视图（后端 AttendanceGroupVO） */
export interface GroupVO {
  id: number
  groupNo: string
  groupName: string
  groupType: GroupTypeCode | number
  scopeType?: number | null
  scopeText?: string | null
  workPlace?: string | null
  shiftId?: number | null
  shiftName?: string | null
  lateGraceMin?: number | null
  earlyGraceMin?: number | null
  /** 已开通来源码列表（后端由逗号串解析） */
  sources?: number[] | null
  status: string
  /** 当前生效成员数（历史期间不计入） */
  memberCount?: number | null
  remark?: string | null
  updatedBy?: string | null
  updatedAt?: string | null
}

/**
 * 考勤组写操作的返回体（后端直接回 AttGroup 实体）。
 * <p>只取用得到的字段：实体上的 createdAt/updatedAt 是**毫秒时间戳**（全局 Jackson 配置），
 * 要展示可读时间请改走 {@link fetchGroupDetail}（返回 AttendanceGroupVO）。
 */
export interface GroupWriteResult {
  id: number
  groupNo: string
  groupName: string
  status: string
}

/** 考勤组提交体：groupNo 由编号规则生成，不接受前端传入 */
export interface GroupPayload {
  id?: number | null
  groupName: string
  groupType: number
  scopeType?: number | null
  scopeText?: string | null
  workPlace?: string | null
  shiftId?: number | null
  lateGraceMin?: number | null
  earlyGraceMin?: number | null
  /** 逗号分隔来源码，如 "1,2" */
  punchSources?: string | null
  status?: string | null
  remark?: string | null
}

/** 考勤组成员（带生效区间；判定按当时归属，不按今天在册） */
export interface GroupMember {
  id: number
  groupId: number
  userId: number
  empNo?: string | null
  empName?: string | null
  deptId?: number | null
  deptName?: string | null
  validFrom?: string | null
  validTo?: string | null
}

/** 排班周视图（后端 AttendanceScheduleVO） */
export interface ScheduleWeekVO {
  groupId: number
  groupName?: string | null
  weekStart: string
  weekEnd: string
  rows: ScheduleRow[]
  /** 整周没有任何排班记录的人数 */
  unscheduledCount: number
}

export interface ScheduleRow {
  userId: number
  empNo?: string | null
  empName?: string | null
  deptName?: string | null
  /** key = yyyy-MM-dd；value 为 null 表示该日无排班记录（漏排），与 rest=true（排休）不同 */
  cells: Record<string, ScheduleCell | null>
}

export interface ScheduleCell {
  id?: number | null
  shiftId?: number | null
  shiftCode?: string | null
  shiftName?: string | null
  /** true = 显式排休（记录存在但 shiftId 为空，不产生异常） */
  rest?: boolean
  source?: number | null
}

/** 排班保存请求：按条目 upsert，未提交的格子不动（整周全量覆盖会让并发编辑互相抹掉） */
export interface ScheduleSavePayload {
  groupId: number
  weekStart?: string | null
  sourceWeekStart?: string | null
  entries: ScheduleEntry[]
}

export interface ScheduleEntry {
  userId: number
  workDate: string
  /** null = 排休（显式落一行） */
  shiftId?: number | null
  remark?: string | null
}

/** 打卡流水视图（后端 AttendancePunchVO） */
export interface PunchVO {
  id: number
  punchAt: string
  workDate: string
  userId: number
  empNo?: string | null
  empName?: string | null
  deptName?: string | null
  groupId?: number | null
  groupName?: string | null
  punchType?: number | null
  source?: number | null
  location?: string | null
  result?: number | null
}

/** 打卡导入行：文件解析在前端向导完成，后端只认结构化行 */
export interface PunchImportRow {
  empNo: string
  /** yyyy-MM-dd HH:mm:ss */
  punchAt: string
  punchType: number
  location?: string | null
}

/** 考勤异常视图（后端 AttendanceExceptionVO） */
export interface ExceptionVO {
  id: number
  userId: number
  empNo?: string | null
  empName?: string | null
  deptId?: number | null
  deptName?: string | null
  groupId?: number | null
  groupName?: string | null
  workDate: string
  exceptionType: ExceptionTypeCode | number
  /** 引擎写入的量化描述（只读） */
  detail?: string | null
  lateMinutes?: number | null
  status: ExceptionStatusCode | number
  flowNo?: string | null
  oaRequestId?: number | null
  handler?: string | null
  handledAt?: string | null
  /** 处理说明（确认原因/补卡原因），与 detail 分列 */
  handleRemark?: string | null
  updatedAt?: string | null
}

/** 日报视图（后端 AttendanceDailyVO，只读计算结论） */
export interface DailyVO {
  id: number
  workDate: string
  groupId?: number | null
  groupName?: string | null
  deptId?: number | null
  deptName?: string | null
  shouldCount?: number | null
  actualCount?: number | null
  lateCount?: number | null
  earlyCount?: number | null
  missingCount?: number | null
  absentCount?: number | null
  leaveCount?: number | null
  overtimeHours?: number | null
  attendRate?: number | null
  calculatedAt?: string | null
}

/** 月度汇总视图（后端 AttendanceMonthlyVO，薪酬取数出口） */
export interface MonthlyVO {
  id: number
  statMonth: string
  batchNo?: string | null
  userId: number
  empNo?: string | null
  empName?: string | null
  deptId?: number | null
  deptName?: string | null
  groupId?: number | null
  groupName?: string | null
  shouldDays?: number | null
  actualDays?: number | null
  lateTimes?: number | null
  lateMinutes?: number | null
  earlyTimes?: number | null
  missingTimes?: number | null
  absentDays?: number | null
  annualDays?: number | null
  sickDays?: number | null
  personalDays?: number | null
  workdayOtHours?: number | null
  restdayOtHours?: number | null
  holidayOtHours?: number | null
  attendRate?: number | null
  status: MonthlyStatusCode | string
  frozenBy?: string | null
  frozenAt?: string | null
  syncedAt?: string | null
  updatedBy?: string | null
  updatedAt?: string | null
}

/** 工作台结构化预警：文案由前端 i18n 组装，后端不下发句子 */
export interface WorkbenchAlert {
  key: 'unscheduled' | 'unfrozen' | 'noSyncToday' | 'disabledGroups' | string
  level: 'warn' | 'info' | string
  path: string
  params: Record<string, unknown>
}

export interface WorkbenchOverview {
  date: string
  rangeFrom: string
  rangeTo: string
  stats: {
    shouldAttend: number
    punched: number
    late: number
    early: number
    missing: number
    absent: number
    leave: number
    overtimeHours: number
    attendRate: number
    /** false = 今日尚未重算（区别于"今天真的没人应出勤"），界面必须提示 */
    calculated: boolean
    pendingExceptions: number
    rangeExceptions: number
    rangeLate: number
    rangeMissing: number
    rangeAbsent: number
  }
  groups: { total: number; enabled: number; disabled: number; rotation: number }
  alerts: WorkbenchAlert[]
}

/**
 * 假勤设置项。
 * <p>契约原则：后端只给**值与结构**，不给文案。label/hint/只读说明文字全部由
 * 前端按 `key` 从语言包取（见 settingMeta.ts）——后端下发繁体句子会让其它四种语言
 * 永远显示中文。`editable=false` 的项是口径说明而不是配置，改了没人读就是假闭环。
 */
export interface SettingItem {
  /** 前端稳定标识；label/hint 的 i18n 键由它推导 */
  key: string
  /** 分组码：calculation / overtime / source / payroll / retention */
  group: string
  /** 当前值：可编辑项为 sys_config 值（未配置时为引擎默认值），只读运行时项为部署配置值 */
  value?: string | null
  /** 只读说明项的 i18n 键；有该键时忽略 value */
  valueKey?: string | null
  editable: boolean
  configKey?: string | null
}

/** 批量操作通用回报：提交数 / 生效数 / 跳过数 */
export interface BatchResult {
  submitted?: number
  affected?: number
  changed?: number
  skipped?: number
  batchNo?: string
  [key: string]: unknown
}

export interface PageQuery {
  page?: number
  size?: number
  /** 服务端排序列 key（须与后端白名单一致）；不传=默认排序 */
  sortField?: string
  /** 排序方向：ascend/descend（与 antd sorter 一致，后端兼容 asc/desc） */
  sortOrder?: string
}

/* ==================== 考勤组 ==================== */

export interface GroupQuery extends PageQuery {
  keyword?: string
  groupType?: number
  status?: string
}

export function fetchGroups(params: GroupQuery): Promise<PageResult<GroupVO>> {
  return request.get<unknown, PageResult<GroupVO>>('/attendance/groups', { params })
}

/**
 * 与列表同口径的统计。
 * <p>必须传当前 filters：统计卡单独发一次不带条件的请求，会让用户先看到未过滤的
 * 全量数字、改完条件才变（AGENTS.md §E.8 已因此立门禁 check:stat-order）。
 */
export function fetchGroupStats(params: Omit<GroupQuery, 'page' | 'size'>): Promise<Record<string, number>> {
  return request.get<unknown, Record<string, number>>('/attendance/groups/stats', { params })
}

export function fetchGroupDetail(id: number): Promise<GroupVO> {
  return request.get<unknown, GroupVO>(`/attendance/groups/${id}`)
}

export function fetchGroupMembers(id: number): Promise<GroupMember[]> {
  return request.get<unknown, GroupMember[]>(`/attendance/groups/${id}/members`)
}

export function createGroup(payload: GroupPayload): Promise<GroupWriteResult> {
  return request.post<unknown, GroupWriteResult>('/attendance/groups', payload)
}

export function updateGroup(id: number, payload: GroupPayload): Promise<GroupWriteResult> {
  return request.put<unknown, GroupWriteResult>(`/attendance/groups/${id}`, payload)
}

export function changeGroupStatus(id: number, status: string): Promise<GroupWriteResult> {
  return request.put<unknown, GroupWriteResult>(`/attendance/groups/${id}/status`, null, { params: { status } })
}

/** 成员差量同步：返回 added/closed，界面据此提示影响人数，不做静默全量覆盖 */
export function syncGroupMembers(id: number, userIds: number[]): Promise<Record<string, number>> {
  return request.put<unknown, Record<string, number>>(`/attendance/groups/${id}/members`, userIds)
}

export function deleteGroup(id: number) {
  return request.delete(`/attendance/groups/${id}`)
}

/* ==================== 班次 ==================== */

export interface ShiftQuery extends PageQuery {
  keyword?: string
  flexFlag?: number
  status?: string
}

export function fetchShifts(params: ShiftQuery): Promise<PageResult<ShiftVO>> {
  return request.get<unknown, PageResult<ShiftVO>>('/attendance/shifts', { params })
}

/** 与列表同口径的统计：{total, enabled, flex, hours} */
export function fetchShiftStats(params: Omit<ShiftQuery, 'page' | 'size'>): Promise<Record<string, number>> {
  return request.get<unknown, Record<string, number>>('/attendance/shifts/stats', { params })
}

export function fetchShiftDetail(id: number): Promise<ShiftVO> {
  return request.get<unknown, ShiftVO>(`/attendance/shifts/${id}`)
}

/** 启用中班次下拉（考勤组与排班表单共用） */
export function fetchShiftOptions(): Promise<Array<{ id: number; code: string; name: string; flex: boolean }>> {
  return request.get<unknown, Array<{ id: number; code: string; name: string; flex: boolean }>>(
    '/attendance/shifts/options')
}

export function createShift(payload: ShiftPayload): Promise<ShiftVO> {
  return request.post<unknown, ShiftVO>('/attendance/shifts', payload)
}

export function updateShift(id: number, payload: ShiftPayload): Promise<ShiftVO> {
  return request.put<unknown, ShiftVO>(`/attendance/shifts/${id}`, payload)
}

export function changeShiftStatus(id: number, status: string): Promise<ShiftVO> {
  return request.put<unknown, ShiftVO>(`/attendance/shifts/${id}/status`, null, { params: { status } })
}

export function deleteShift(id: number) {
  return request.delete(`/attendance/shifts/${id}`)
}

/* ==================== 节假日日历 ==================== */

export interface HolidayQuery extends PageQuery {
  yearNo?: number
  holidayType?: number
  keyword?: string
  status?: string
}

export function fetchHolidays(params: HolidayQuery): Promise<PageResult<HolidayVO>> {
  return request.get<unknown, PageResult<HolidayVO>>('/attendance/holidays', { params })
}

/** 与列表同口径的统计：{total, legal, swap, company} */
export function fetchHolidayStats(params: Omit<HolidayQuery, 'page' | 'size'>): Promise<Record<string, number>> {
  return request.get<unknown, Record<string, number>>('/attendance/holidays/stats', { params })
}

export function fetchHolidayDetail(id: number): Promise<HolidayVO> {
  return request.get<unknown, HolidayVO>(`/attendance/holidays/${id}`)
}

/** 某年度启用日历（排班页判断应出勤用） */
export function fetchHolidaysByYear(yearNo: number): Promise<HolidayVO[]> {
  return request.get<unknown, HolidayVO[]>(`/attendance/holidays/year/${yearNo}`)
}

export function createHoliday(payload: HolidayPayload): Promise<HolidayVO> {
  return request.post<unknown, HolidayVO>('/attendance/holidays', payload)
}

export function updateHoliday(id: number, payload: HolidayPayload): Promise<HolidayVO> {
  return request.put<unknown, HolidayVO>(`/attendance/holidays/${id}`, payload)
}

export function changeHolidayStatus(id: number, status: string): Promise<HolidayVO> {
  return request.put<unknown, HolidayVO>(`/attendance/holidays/${id}/status`, null, { params: { status } })
}

export function deleteHoliday(id: number) {
  return request.delete(`/attendance/holidays/${id}`)
}

/* ==================== 排班 ==================== */

export function fetchScheduleWeek(groupId: number, weekStart?: string): Promise<ScheduleWeekVO> {
  return request.get<unknown, ScheduleWeekVO>('/attendance/schedules/week', {
    params: { groupId, weekStart },
  })
}

export function fetchScheduleStats(groupId: number, weekStart?: string): Promise<Record<string, number>> {
  return request.get<unknown, Record<string, number>>('/attendance/schedules/stats', {
    params: { groupId, weekStart },
  })
}

export function saveSchedules(payload: ScheduleSavePayload): Promise<Record<string, number>> {
  return request.post<unknown, Record<string, number>>('/attendance/schedules', payload)
}

export function copyScheduleWeek(groupId: number, sourceWeekStart: string, targetWeekStart: string) {
  return request.post<unknown, Record<string, number>>('/attendance/schedules/copy', null, {
    params: { groupId, sourceWeekStart, targetWeekStart },
  })
}

/* ==================== 打卡流水（只读账本，无修改端点） ==================== */

export interface PunchQuery extends PageQuery {
  from?: string
  to?: string
  keyword?: string
  groupId?: number
  deptId?: number
  source?: number
  result?: number
}

export function fetchPunches(params: PunchQuery): Promise<PageResult<PunchVO>> {
  return request.get<unknown, PageResult<PunchVO>>('/attendance/punches', { params })
}

/** 与列表同口径的统计：统计卡必须跟随筛选，禁止单独发无条件请求 */
export function fetchPunchStats(params: Omit<PunchQuery, 'page' | 'size'>): Promise<Record<string, number>> {
  return request.get<unknown, Record<string, number>>('/attendance/punches/stats', { params })
}

export function importPunches(rows: PunchImportRow[]): Promise<Record<string, unknown>> {
  return request.post<unknown, Record<string, unknown>>('/attendance/punches/import', rows)
}

/** 手动触发一次钉钉同步（定时任务之外的补数入口） */
export function syncPunches(from: string, to: string, groupId?: number): Promise<Record<string, number>> {
  return request.post<unknown, Record<string, number>>('/attendance/punches/sync', null, {
    params: { from, to, groupId },
  })
}

/* ==================== 异常处理 ==================== */

export interface ExceptionQuery extends PageQuery {
  from?: string
  to?: string
  groupId?: number
  deptId?: number
  exceptionType?: number
  status?: number
}

export function fetchExceptions(params: ExceptionQuery): Promise<PageResult<ExceptionVO>> {
  return request.get<unknown, PageResult<ExceptionVO>>('/attendance/exceptions', { params })
}

export function fetchExceptionStats(
  params: Omit<ExceptionQuery, 'page' | 'size'>,
): Promise<Record<string, number>> {
  return request.get<unknown, Record<string, number>>('/attendance/exceptions/stats', { params })
}

/** 待处理异常数（工作台预警用） */
export function fetchPendingExceptionCount(from?: string, to?: string): Promise<number> {
  return request.get<unknown, number>('/attendance/exceptions/pending-count', { params: { from, to } })
}

/** 异常详情（处理页按 id 取数） */
export function fetchExceptionDetail(id: number): Promise<ExceptionVO> {
  return request.get<unknown, ExceptionVO>(`/attendance/exceptions/${id}`)
}

/**
 * 关联已核准假单抵扣异常。
 * <p>只传假单 ID：当事人/区间/审批状态全部由后端回查校验，
 * 前端不传结论性字段（传了也不被采信）。
 */
export function deductExceptionByLeave(id: number, leaveId: number): Promise<ExceptionVO> {
  return request.post<unknown, ExceptionVO>(`/attendance/exceptions/${id}/deduct-leave`, { leaveId })
}

/**
 * 可抵扣该异常的候选假单。
 * <p>后端已按「同人 + 已核准 + 区间覆盖该考勤日」筛过，因此候选里不会
 * 出现选了也会被拒的单据；按异常菜单鉴权，操作人无需持有「請假管理」权限。
 */
export interface LeaveCandidate {
  id: number
  reqNo?: string | null
  leaveType?: string | null
  startDate?: string | null
  endDate?: string | null
  days?: number | null
  flowNo?: string | null
}

export function fetchLeaveCandidates(exceptionId: number): Promise<LeaveCandidate[]> {
  return request.get<unknown, LeaveCandidate[]>(`/attendance/exceptions/${exceptionId}/leave-candidates`)
}

/** 批量确认异常无误（不抵扣）：仅待处理行生效 */
export function confirmExceptions(ids: number[], remark?: string): Promise<BatchResult> {
  return request.post<unknown, BatchResult>('/attendance/exceptions/confirm', { ids, remark })
}

/**
 * 人工补录打卡并关闭异常。
 * <p>时间用 `yyyy-MM-dd HH:mm:ss` 字符串：后端 DateTimeFormats.parse 同时兼容 ISO 的 T 分隔，
 * 但不接受毫秒时间戳。已冻结月份会被后端拒绝。
 */
export function reissuePunch(id: number, payload: { onTime: string; offTime?: string | null; reason: string }) {
  return request.post<unknown, ExceptionVO>(`/attendance/exceptions/${id}/reissue`, payload)
}

/* ==================== 汇总（日报 / 月报） ==================== */

export interface DailyQuery extends PageQuery {
  from?: string
  to?: string
  groupId?: number
  deptId?: number
}

export function fetchDailySummaries(params: DailyQuery): Promise<PageResult<DailyVO>> {
  return request.get<unknown, PageResult<DailyVO>>('/attendance/summaries/daily', { params })
}

export function fetchDailyStats(params: Omit<DailyQuery, 'page' | 'size'>): Promise<Record<string, number>> {
  return request.get<unknown, Record<string, number>>('/attendance/summaries/daily/stats', { params })
}

/** 重算区间日报：返回 recalculated / skippedFrozen，界面必须把跳过数显示出来 */
export function recalculateDaily(from: string, to: string, groupId?: number): Promise<Record<string, number>> {
  return request.post<unknown, Record<string, number>>('/attendance/summaries/daily/recalculate', null, {
    params: { from, to, groupId },
    // 宽区间重算是同步批量计算（逐日逐人判定），跨 1~2 个月可耗 20s+，
    // 默认 15s 会假失败（后端其实跑完）→ 单独放宽到此补数接口超时（缺陷 M1）。
    timeout: 180000,
  })
}

export interface MonthlyQuery extends PageQuery {
  month?: string
  groupId?: number
  deptId?: number
  keyword?: string
  status?: string
}

export function fetchMonthlySummaries(params: MonthlyQuery): Promise<PageResult<MonthlyVO>> {
  return request.get<unknown, PageResult<MonthlyVO>>('/attendance/summaries/monthly', { params })
}

export function fetchMonthlyStats(params: Omit<MonthlyQuery, 'page' | 'size'>): Promise<Record<string, number>> {
  return request.get<unknown, Record<string, number>>('/attendance/summaries/monthly/stats', { params })
}

/** 生成/刷新月度汇总：只重建 draft 行 */
export function generateMonthly(month: string, groupId?: number): Promise<Record<string, number>> {
  return request.post<unknown, Record<string, number>>('/attendance/summaries/monthly/generate', null, {
    params: { month, groupId },
    // 月度生成同样为整月批量计算，跨多组可耗过默认 15s → 放宽超时（缺陷 M1）。
    timeout: 180000,
  })
}

/** 某月是否已冻结：日报页重算前的前置提示 */
export function isMonthFrozen(month: string): Promise<boolean> {
  return request.get<unknown, boolean>('/attendance/summaries/monthly/frozen', { params: { month } })
}

/** 冻结 draft → frozen，返回批次号供薪酬对账 */
export function freezeMonthly(ids: number[]): Promise<BatchResult> {
  return request.post<unknown, BatchResult>('/attendance/summaries/monthly/freeze', { ids })
}

/** 同步薪酬 frozen → synced */
export function syncMonthlyToPayroll(ids: number[]): Promise<BatchResult> {
  return request.post<unknown, BatchResult>('/attendance/summaries/monthly/sync-payroll', { ids })
}

/* ==================== 工作台与设置 ==================== */

export function fetchWorkbenchOverview(params?: { date?: string; rangeFrom?: string; rangeTo?: string }) {
  return request.get<unknown, WorkbenchOverview>('/attendance/workbench/overview', { params })
}

export function fetchAttendanceSettings(): Promise<SettingItem[]> {
  return request.get<unknown, SettingItem[]>('/attendance/settings')
}

/** 保存口径参数：只接受 editable 项的 key，混入只读项后端整批拒绝 */
export function saveAttendanceSettings(values: Record<string, string>): Promise<BatchResult> {
  return request.put<unknown, BatchResult>('/attendance/settings', values)
}
