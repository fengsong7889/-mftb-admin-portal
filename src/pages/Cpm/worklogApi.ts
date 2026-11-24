/**
 * Copyright (c) 2026 fengsong7889. All Rights Reserved.
 *
 * 本文件为「MFTB 企业一体化管理平台软件」的组成部分。
 * 未经著作权人书面许可，不得使用、复制、修改、再分发或用于任何商业目的。
 * 完整许可条款见仓库根目录 LICENSE 文件。
 */
import request from '@/api/request'
import type { GanttData, GanttGroup, GanttTask } from './worklogGanttModel'
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
  note?: string | null
  planType?: 'planned' | 'inserted'
  insertedAt?: string | null
  hours: number
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
    note: t.note ?? '',
    history: t.history?.map(h => ({ at: h.at, progress: h.progress })),
    planType: t.planType ?? 'planned',
    insertedAt: t.insertedAt ?? null,
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

export interface LedgerResult {
  data: GanttData
  /** 服务端算好的区间工时/统计所需天数，界面不再自己数工作日 */
  rangeStart: string | null
  rangeEnd: string | null
  /** 未分组虚拟分组的标题（服务端不本地化，由界面给词） */
  hasUngrouped: boolean
}

export async function fetchLedger(start?: string, end?: string): Promise<LedgerResult> {
  const dto = await request.get<unknown, LedgerDTO>('/cpm/worklog/ledger', { params: { start, end } })
  const groups = (dto.groups ?? []).map(g => ({ ...toGroup(g), virtual: isVirtualGroup(g.id) }))
  return {
    data: {
      // 虚拟分组的标题留空，由界面按当前语言渲染「未分組記錄」，避免服务端回传中文
      groups: groups.map(g => ({ id: g.id, title: g.title, hue: g.hue, tasks: g.tasks })),
      holidays: dto.holidays ?? [],
      makeup: dto.makeups ?? [],
      compOff: dto.compOffs ?? [],
      leave: dto.leaves ?? [],
    },
    rangeStart: dto.rangeStart ?? null,
    rangeEnd: dto.rangeEnd ?? null,
    hasUngrouped: groups.some(g => g.virtual),
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
  pStart: number
  pEnd: number
  delta: number
  hours: number
  doneAt?: string | null
  overdueDays: number
  planType: 'planned' | 'inserted'
  insertedAt?: string | null
  note?: string
  state: string
}

export interface ReportGroupDTO {
  groupId: number
  title?: string | null
  hue: number
  hours: number
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
    backlog: number; risks: number; hours: number; avgProgress: number; avgStart: number; avgEnd: number
  }
  groups: ReportGroupDTO[]
  risks: ReportRowDTO[]
  notes: ReportRowDTO[]
  plan: ReportRowDTO[]
  insertedRows: ReportRowDTO[]
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
      progress: r.pEnd, note: r.note ?? '', planType: r.planType, insertedAt: r.insertedAt ?? null,
    },
    group: { id: String(r.groupId ?? 0), title: r.groupTitle ?? '', hue: 0, tasks: [] },
    pStart: r.pStart, pEnd: r.pEnd, delta: r.delta, hours: r.hours,
    doneAt: r.doneAt ?? null, overdueDays: r.overdueDays,
  })
  return {
    start: dto.start,
    end: dto.end,
    rows: dto.groups.flatMap(g => g.rows.map(row)),
    groups: dto.groups.map(g => ({
      group: { id: String(g.groupId), title: g.title ?? '', hue: g.hue, tasks: [] },
      rows: g.rows.map(row),
      hours: g.hours, avgStart: g.avgStart, avgEnd: g.avgEnd, doneCount: g.doneCount,
    })),
    totals: {
      done: dto.totals.done, inProgress: dto.totals.doing, avgStart: dto.totals.avgStart, avgEnd: dto.totals.avgEnd,
      hours: dto.totals.hours, risks: dto.totals.risks, backlog: dto.totals.backlog,
      total: dto.totals.total, inserted: dto.totals.inserted,
    },
    outputs: [],
    insertedRows: dto.insertedRows.map(row),
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
