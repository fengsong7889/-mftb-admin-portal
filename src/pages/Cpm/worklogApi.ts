/**
 * Copyright (c) 2026 fengsong7889. All Rights Reserved.
 *
 * 本文件为「MFTB 企业一体化管理平台软件」的组成部分。
 * 未经著作权人书面许可，不得使用、复制、修改、再分发或用于任何商业目的。
 * 完整许可条款见仓库根目录 LICENSE 文件。
 */
import request from '@/api/request'
import type { CpmRdmSyncVO } from '@/api/cpm'
import type { GanttData, GanttGroup, GanttTask, PeriodProgressKind } from './worklogGanttModel'
import type { WorkReport as WorkReportShape } from './worklogReport'

/**
 * 工作台账 API：台账读写、工时口径日历、汇报聚合、本地台账一次性导入。
 *
 * <p>后端返回的形状与前端台账模型逐字对齐（groups/tasks/holidays/makeup/compOff/leave），
 * 因此这里只做类型收窄与字段搬运，不做任何二次计算——工时、期初/期末、完成时点
 * 一律由服务端按日历算。前端一旦自己再算一遍，就会出现「页面与通知两个数字」。
 *
 * <p>未分组条目由服务端汇成 id=0 的虚拟分组返回；它是只读容器（改名/删除不给），
 * 但里面的任务照常编辑——旧的日报流水条目不该在台账里凭空消失。
 */

interface HistoryDTO { at: string; progress: number }

interface TaskDTO {
  id: number
  groupId: number
  title: string
  start?: string | null
  end?: string | null
  progress: number
  /** 服务端按查询周期算好的期初/期末快照；旧后端缺省时适配层回落当前值 */
  periodStartProgress?: number
  periodProgress?: number
  periodProgressKind?: PeriodProgressKind
  latestProgressAt?: string | null
  note?: string | null
  planType?: 'planned' | 'inserted'
  insertedAt?: string | null
  /** 跟进/阻塞独立标记；旧后端缺省 false */
  followUp?: boolean
  blocked?: boolean
  blockedReason?: string | null
  cancelReason?: string | null
  hours: number
  /** 本期加班（服务端由合计减工作日 × 8h 派生）；旧后端未回传时按 0 读 */
  overtimeHours?: number
  /** 手工耗时覆盖值；null=沿用工作日口径（服务端 work_hours 且 source=manual 时回传） */
  hoursOverride?: number | null
  /** 来源已取消（会议）：服务端台账读取时对账得出，界面不得自己推 */
  cancelled?: boolean
  /** RDM 回写状态（只有关联 RDM 任務的行非空）：台账不重造一份回写视图 */
  rdmSync?: CpmRdmSyncVO | null
  periodHours: number
  workdays: number
  state: string
  history?: HistoryDTO[]
  sourceType?: string | null
  sourceRef?: string | null
  rdmSyncEnabled?: number | null
}

interface GroupDTO {
  id: number
  /** 虚拟分组（未分组条目）标题为 null，由界面按语言给「未分組記錄」 */
  title?: string | null
  hue: number
  sortOrder: number
  tasks?: TaskDTO[]
}

interface LedgerDTO {
  rangeStart?: string | null
  rangeEnd?: string | null
  groups: GroupDTO[]
  holidays: string[]
  makeups: string[]
  compOffs: string[]
  leaves: string[]
  loadedTaskCount?: number
  matchingTaskCount?: number
  truncated?: boolean
  hasEarlierArchive?: boolean
  earlierArchiveCount?: number
  archiveCursor?: { date: string; id: number } | null
  nextCursorDate?: string | null
  nextCursorId?: number | null
}

interface HistoryPageDTO {
  history?: HistoryDTO[]
  truncated?: boolean
}

export const UNGROUPED_ID = 0

/** 未分组虚拟分组的稳定 key：React 用它做列表 key，不能每次渲染都变 */
export function isVirtualGroup(id: number): boolean {
  return id === UNGROUPED_ID
}

function toTask(t: TaskDTO): GanttTask {
  return {
    id: String(t.id),
    title: t.title,
    start: t.start ?? null,
    end: t.end ?? null,
    progress: t.progress,
    periodStartProgress: t.periodStartProgress,
    periodProgress: t.periodProgress,
    periodProgressKind: t.periodProgressKind,
    latestProgressAt: t.latestProgressAt ?? null,
    note: t.note ?? '',
    history: t.history?.map(h => ({ at: h.at, progress: h.progress })),
    planType: t.planType ?? 'planned',
    insertedAt: t.insertedAt ?? null,
    followUp: t.followUp ?? false,
    blocked: t.blocked ?? false,
    blockedReason: t.blockedReason ?? null,
    cancelReason: t.cancelReason ?? null,
    hoursOverride: t.hoursOverride ?? null,
    hours: t.hours,
    workdays: t.workdays,
    cancelled: t.cancelled ?? false,
    rdmSync: t.rdmSync ?? null,
  }
}

function toGroup(g: GroupDTO): GanttGroup {
  return {
    id: String(g.id),
    title: g.title ?? '',
    hue: g.hue,
    tasks: (g.tasks ?? []).map(toTask),
  }
}

export interface LedgerQuery {
  start?: string | null
  end?: string | null
  keyword?: string | null
  status?: string | null
  planType?: string | null
  groupId?: string | null
}

export interface LedgerCapacityMeta {
  loadedTaskCount: number
  matchingTaskCount: number
  truncated: boolean
  hasEarlierArchive: boolean
  earlierArchiveCount: number
}

export interface LedgerResult extends LedgerCapacityMeta {
  data: GanttData
  /** 服务端算好的区间工时/统计所需天数，界面不再自己数工作日 */
  rangeStart: string | null
  rangeEnd: string | null
  /** 未分组虚拟分组的标题（服务端不本地化，由界面给词） */
  hasUngrouped: boolean
}

export interface ArchiveResult extends LedgerCapacityMeta {
  groups: GanttGroup[]
  archiveCursor?: { date: string; id: number } | null
  nextCursorDate: string | null
  nextCursorId: number | null
}

function ledgerCapacity(dto: LedgerDTO, groups: GanttGroup[]): LedgerCapacityMeta {
  const loaded = dto.loadedTaskCount ?? groups.reduce((sum, g) => sum + g.tasks.length, 0)
  return {
    loadedTaskCount: loaded,
    matchingTaskCount: dto.matchingTaskCount ?? loaded,
    truncated: dto.truncated ?? false,
    hasEarlierArchive: dto.hasEarlierArchive ?? false,
    earlierArchiveCount: dto.earlierArchiveCount ?? 0,
  }
}

export async function fetchLedger(query: LedgerQuery = {}): Promise<LedgerResult> {
  const params = Object.fromEntries(Object.entries(query).filter(([, v]) => v != null && v !== ''))
  const dto = await request.get<unknown, LedgerDTO>('/cpm/worklog/ledger', { params })
  const groups = (dto.groups ?? []).map(g => ({ ...toGroup(g), virtual: isVirtualGroup(g.id) }))
  const data: GanttData = {
    // 虚拟分组的标题留空，由界面按当前语言渲染「未分組記錄」，避免服务端回传中文；
    // virtual 标记必须透传到台账模型，否则界面会把只读容器当普通工作項给改名/删除入口
    groups: groups.map(g => ({ id: g.id, title: g.title, hue: g.hue, tasks: g.tasks, virtual: g.virtual })),
    holidays: dto.holidays ?? [],
    makeup: dto.makeups ?? [],
    compOff: dto.compOffs ?? [],
    leave: dto.leaves ?? [],
  }
  return {
    data,
    ...ledgerCapacity(dto, groups),
    rangeStart: dto.rangeStart ?? null,
    rangeEnd: dto.rangeEnd ?? null,
    hasUngrouped: groups.some(g => g.virtual),
  }
}

export async function fetchLedgerArchive(query: LedgerQuery, cursorDate?: string, cursorId?: number): Promise<ArchiveResult> {
  const params = Object.fromEntries(Object.entries({ ...query, cursorDate, cursorId, limit: 100 }).filter(([, v]) => v != null && v !== ''))
  const dto = await request.get<unknown, LedgerDTO>('/cpm/worklog/ledger/archive', { params })
  const groups = (dto.groups ?? []).map(g => ({ ...toGroup(g), virtual: isVirtualGroup(g.id) }))
  return {
    groups,
    ...ledgerCapacity(dto, groups),
    archiveCursor: dto.archiveCursor ?? null,
    nextCursorDate: dto.nextCursorDate ?? dto.archiveCursor?.date ?? null,
    nextCursorId: dto.nextCursorId ?? dto.archiveCursor?.id ?? null,
  }
}

export async function fetchTaskHistory(id: string): Promise<{ history: { at: string; progress: number }[]; truncated: boolean }> {
  const dto = await request.get<unknown, HistoryPageDTO>(`/cpm/worklog/tasks/${id}/history`)
  return {
    history: (dto.history ?? []).map(h => ({ at: h.at, progress: h.progress })),
    truncated: dto.truncated ?? false,
  }
}

export interface TaskForm {
  groupId?: number | null
  title: string
  start?: string | null
  end?: string | null
  progress?: number
  note?: string
  planType?: 'planned' | 'inserted'
  insertedAt?: string | null
  /** 跟进/阻塞/取消标记；null=不改动，服务端重验原因与归属 */
  followUp?: boolean
  blocked?: boolean
  blockedReason?: string | null
  cancelled?: boolean
  cancelReason?: string | null
  /**
   * 手工耗时覆盖（小时）。缺省/null = 不改动，沿用「工作日 × 8h」计算值；
   * 传 0 以上即表示用户手改过。服务端落 biz_cpm_item.work_hours（source=manual）。
   */
  hours?: number | null
  /** 显式清除手工覆盖，回到工作日口径（与 start/end 的 clear 标志位同一形态） */
  hoursCleared?: boolean
  /**
   * 来源对象（導入會議/关联导入用）：服务端与 source_ref 成对写入，
   * 重复导入由 uk_cpm_item_source 裁决；手工录入不传（保持 null）。
   */
  sourceType?: string | null
  sourceRef?: string | null
}

export function createGroup(form: { title: string; hue?: number }): Promise<GroupDTO> {
  return request.post<unknown, GroupDTO>('/cpm/worklog/groups', form)
}

export function updateGroup(id: number, form: { title: string; hue?: number }): Promise<GroupDTO> {
  return request.put<unknown, GroupDTO>(`/cpm/worklog/groups/${id}`, form)
}

export function deleteGroup(id: number): Promise<void> {
  return request.delete<unknown, void>(`/cpm/worklog/groups/${id}`)
}

export function restoreGroup(id: number): Promise<void> {
  return request.post<unknown, void>(`/cpm/worklog/groups/${id}/restore`)
}

/** 行序落库：拖拽结果一次批量写回，不逐行发请求 */
export function reorderGroups(ids: number[]): Promise<void> {
  return request.put<unknown, void>('/cpm/worklog/groups/order', ids)
}

export function createTask(form: TaskForm): Promise<TaskDTO> {
  return request.post<unknown, TaskDTO>('/cpm/worklog/tasks', form)
}

export function updateTask(id: number, form: TaskForm): Promise<TaskDTO> {
  return request.put<unknown, TaskDTO>(`/cpm/worklog/tasks/${id}`, form)
}

export function deleteTask(id: number): Promise<void> {
  return request.delete<unknown, void>(`/cpm/worklog/tasks/${id}`)
}

export function restoreTask(id: number): Promise<void> {
  return request.post<unknown, void>(`/cpm/worklog/tasks/${id}/restore`)
}

/** 恢复取消态（与软删 restoreTask 分开）：清 cancelled/cancel_reason，status 按进度重算 */
export function restoreTaskState(id: number): Promise<TaskDTO> {
  return request.post<unknown, TaskDTO>(`/cpm/worklog/tasks/${id}/restore-state`)
}

/** 日历登记：type 传 null 表示恢复该天默认口径 */
export function setCalendarDay(date: string, type: string | null, note?: string): Promise<void> {
  return request.put<unknown, void>('/cpm/worklog/calendar', { date, type, note })
}

/** 清空本人某年口径登记（全局法定名单不动） */
export function clearCalendarYear(year: number): Promise<number> {
  return request.delete<unknown, number>('/cpm/worklog/calendar/year', { params: { year } })
}

/* ==================== 汇报聚合（服务端算，页面只渲染） ==================== */

export interface ReportRowDTO {
  taskId: number
  groupId?: number | null
  title: string
  groupTitle?: string | null
  start?: string | null
  end?: string | null
  /** Jackson 对 pStart/pEnd 的 JavaBean 命名会输出 pstart/pend；两种都兼容 */
  pstart?: number
  pend?: number
  pStart?: number
  pEnd?: number
  delta: number
  hours: number
  /** 本期加班（已含在 hours 里），服务端算 */
  overtimeHours?: number
  doneAt?: string | null
  overdueDays: number
  planType: 'planned' | 'inserted'
  insertedAt?: string | null
  followUp?: boolean
  blocked?: boolean
  blockedReason?: string | null
  cancelReason?: string | null
  note?: string
  state: string
}

export interface ReportGroupDTO {
  groupId: number
  title?: string | null
  hue: number
  hours: number
  /** 本工作項的本期加班合计 */
  overtimeHours?: number
  avgStart: number
  avgEnd: number
  doneCount: number
  rows: ReportRowDTO[]
}

export interface ReportDTO {
  periodType: string
  start: string
  end: string
  totals: {
    total: number; done: number; doing: number; pending: number; inserted: number
    followUpCount?: number; followUpAvg?: number; blockedCount?: number
    backlog: number; risks: number; hours: number; overtimeHours?: number; avgProgress: number; avgStart: number; avgEnd: number
  }
  groups: ReportGroupDTO[]
  risks: ReportRowDTO[]
  notes: ReportRowDTO[]
  plan: ReportRowDTO[]
  insertedRows: ReportRowDTO[]
  followUps?: ReportRowDTO[]
  blockedRows?: ReportRowDTO[]
  daily: { key: string; hours: number; rest: boolean }[]
  peak?: { key: string; hours: number; rest: boolean } | null
}

export function fetchWorkReport(periodType: string, start: string): Promise<ReportDTO> {
  return request.get<unknown, ReportDTO>('/cpm/worklog/report', { params: { periodType, start } })
}

/**
 * 服务端汇报聚合 → 页面阅读模型：只搬运字段，不重算任何一个数字。
 *
 * <p>这一步存在是因为阅读面已经按这套形状写了；把适配留在边界上，
 * 而不是让页面里出现「服务端给一份、前端再算一份」的两套口径。
 */
export function toWorkReport(dto: ReportDTO): WorkReportShape {
  const row = (r: ReportRowDTO): WorkReportShape['rows'][number] => ({
    task: {
      id: String(r.taskId), title: r.title, start: r.start ?? null, end: r.end ?? null,
      progress: r.pEnd ?? r.pend ?? 0, note: r.note ?? '', planType: r.planType, insertedAt: r.insertedAt ?? null,
      followUp: r.followUp ?? false, blocked: r.blocked ?? false,
      blockedReason: r.blockedReason ?? null, cancelReason: r.cancelReason ?? null,
    },
    group: { id: String(r.groupId ?? 0), title: r.groupTitle ?? '', hue: 0, tasks: [] },
    pStart: r.pStart ?? r.pstart ?? 0, pEnd: r.pEnd ?? r.pend ?? 0, delta: r.delta, hours: r.hours,
    overtime: r.overtimeHours ?? 0,
    doneAt: r.doneAt ?? null, overdueDays: r.overdueDays,
  })
  return {
    start: dto.start,
    end: dto.end,
    rows: dto.groups.flatMap(g => g.rows.map(row)),
    groups: dto.groups.map(g => ({
      group: { id: String(g.groupId), title: g.title ?? '', hue: g.hue, tasks: [] },
      rows: g.rows.map(row),
      hours: g.hours, overtime: g.overtimeHours ?? 0, avgStart: g.avgStart, avgEnd: g.avgEnd, doneCount: g.doneCount,
    })),
    totals: {
      done: dto.totals.done, inProgress: dto.totals.doing, avgStart: dto.totals.avgStart, avgEnd: dto.totals.avgEnd,
      hours: dto.totals.hours, overtimeHours: dto.totals.overtimeHours ?? 0, risks: dto.totals.risks, backlog: dto.totals.backlog,
      total: dto.totals.total, inserted: dto.totals.inserted,
      followUpCount: dto.totals.followUpCount ?? 0, followUpAvg: dto.totals.followUpAvg ?? 0,
      blockedCount: dto.totals.blockedCount ?? 0,
    },
    outputs: [],
    insertedRows: dto.insertedRows.map(row),
    followUps: (dto.followUps ?? dto.groups.flatMap(g => g.rows).filter(r => r.followUp)).map(row),
    blockedRows: (dto.blockedRows ?? dto.groups.flatMap(g => g.rows).filter(r => r.blocked)).map(row),
    risks: dto.risks.map(row),
    notes: dto.notes.map(row),
    plan: dto.plan.map(row),
    daily: dto.daily.map(d => ({ key: d.key, hours: d.hours, rest: d.rest })),
    peak: dto.peak ? { key: dto.peak.key, hours: dto.peak.hours } : null,
  }
}

/* ==================== 一次性导入本地台账 ==================== */

export interface LocalLedgerPayload {
  groups: { title: string; hue?: number; tasks: TaskForm[] }[]
  holidays: string[]
  makeups: string[]
  compOffs: string[]
  leaves: string[]
}

export interface ImportResultDTO {
  groups: number
  tasks: number
  skippedGroups: number
  skippedTasks: number
  calendarDays: number
}

/** 把浏览器本地台账整体搬进服务端：幂等，同名工作項与重复子任务只跳过不覆盖 */
export function importLocalLedger(payload: LocalLedgerPayload): Promise<ImportResultDTO> {
  return request.post<unknown, ImportResultDTO>('/cpm/worklog/import-local', payload)
}

/** 台账数据 → 导入载荷（本地 id 是浏览器生成的，服务端不需要也不应接收） */
export function toImportPayload(data: GanttData): LocalLedgerPayload {
  return {
    groups: data.groups.map(g => ({
      title: g.title,
      hue: g.hue,
      tasks: g.tasks.map(t => ({
        title: t.title,
        start: t.start,
        end: t.end,
        progress: t.progress,
        note: t.note,
        planType: t.planType ?? 'planned',
        insertedAt: t.insertedAt ?? null,
      })),
    })),
    holidays: data.holidays,
    makeups: data.makeup,
    compOffs: data.compOff,
    leaves: data.leave,
  }
}
