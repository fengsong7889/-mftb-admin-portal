/**
 * 「當前處理人 / 人員」展示口径的唯一来源。
 *
 * <p>表格、看板、导出三处都必须走这里：历史上看板把 PM 当处理人显示、表格显示流程推演值、
 * 导出又是另一套，同一需求在三个入口给出三个不同的「该找谁」，是口径分裂而非渲染差异。
 */
import type { RdmHandlerPerson } from '../../api/rdm'

/** 单人文本：姓名（工号）；无工号时只给姓名，不留空括号 */
export function formatPerson(p: { name?: string | null; empNo?: string | null }): string {
  return p.name ? `${p.name}${p.empNo ? `（${p.empNo}）` : ''}` : ''
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
