/**
 * 「當前處理人 / 人員」展示口径的唯一来源。
 *
 * <p>表格、看板、导出三处都必须走这里：历史上看板把 PM 当处理人显示、表格显示流程推演值、
 * 导出又是另一套，同一需求在三个入口给出三个不同的「该找谁」，是口径分裂而非渲染差异。
 */
import type { RdmHandlerPerson } from '../../api/rdm'
import { formatEmployee } from '../../utils/employeeDisplay'

/** 单人文本：姓名（工号）；无工号时只给姓名，不留空括号（admin 等系统账号不显示工号） */
export function formatPerson(p: { name?: string | null; empNo?: string | null }): string {
  return formatEmployee(p.name, p.empNo)
}

/**
 * 处理人全量文本，用于不能折叠的场景（导出单元格、Tooltip）。
 * <p>无未完成任务时回退流程推演值（審批人/技術負責人等），避免「找不到人」显示成空白。
 */
export function formatHandlers(
  handlers: RdmHandlerPerson[] | null | undefined,
  fallback?: string | null,
): string {
  if (!handlers || handlers.length === 0) return fallback ?? ''
  return handlers.map(formatPerson).filter(Boolean).join('、')
}

/** 表格单元格用的折叠切分：前 max 位直出，其余归入 +N 悬浮明细；无处理人返回 null 交给回退值 */
export function splitHandlers(
  handlers: RdmHandlerPerson[] | null | undefined,
  max = 2,
): { shown: RdmHandlerPerson[]; rest: RdmHandlerPerson[] } | null {
  if (!handlers || handlers.length === 0) return null
  return { shown: handlers.slice(0, max), rest: handlers.slice(max) }
}

/** 回退处理人所需的最小行数据（列表行与导出共用） */
export interface HandlerFallbackRow {
  currentHandler?: string | null
  submitterName?: string | null
  submitterEmpNo?: string | null
  pmName?: string | null
  pmEmpNo?: string | null
  dispatcherName?: string | null
  dispatcherEmpNo?: string | null
}

/** 「姓名（工号）」结尾：已带工号（正常流转写入的口径）不再补，避免出现双括号 */
const WITH_EMP_NO = /[（(][A-Za-z0-9]+[）)]$/

/**
 * 无未完成任务时的回退处理人文本。
 *
 * <p>currentHandler 是流程推演快照：正常流转写入的是「姓名（工号）」，
 * 但存量导入等历史数据只有姓名。这里只补工号、不改姓名：
 * 按姓名匹配行内的提出人/产品经理/分派人取工号，匹配不上（「審批人」「技術部（待指派）」）原样返回。
 */
export function fallbackHandlerText(row: HandlerFallbackRow): string {
  const raw = row.currentHandler?.trim()
  if (!raw) return ''
  if (WITH_EMP_NO.test(raw)) return raw
  if (raw === row.submitterName?.trim()) return formatPerson({ name: raw, empNo: row.submitterEmpNo })
  if (raw === row.pmName?.trim()) return formatPerson({ name: raw, empNo: row.pmEmpNo })
  if (raw === row.dispatcherName?.trim()) return formatPerson({ name: raw, empNo: row.dispatcherEmpNo })
  return raw
}
