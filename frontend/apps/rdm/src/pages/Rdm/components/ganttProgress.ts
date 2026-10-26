/**
 * 甘特图进度口径（纯函数，独立成文件便于单测与复用）。
 *
 * <p>为什么 PRD 任务封顶 99%：PRD 任务的 100% 不是普通进度，而是「PRD 已提交评审」
 * 这一业务事实（后端 completeTask 只在提交评审时置 done+100%）。允许手动拖满会出现
 * 「任务显示完成、需求却仍在 PRD 产出中」，因此 100% 必须由提交评审产生。
 */

/** PRD 任务进度封顶值 */
export const PRD_PROGRESS_MAX = 99

/** 进度封顶：PRD 任务 0-99，普通任务 0-100，按整数百分比取整 */
export function clampGanttProgress(taskType: string, value: number): number {
  const max = taskType === 'prd' ? PRD_PROGRESS_MAX : 100
  return Math.max(0, Math.min(max, Math.round(value)))
}
