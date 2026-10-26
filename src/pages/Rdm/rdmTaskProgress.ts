/**
 * 研發任務的進度口徑（列表顯示 / 上報載荷）
 *
 * 背景：曾經「開始」按鈕把上報面板裡殘留的進度一起帶給後端，任務被寫成
 * 「進行中 + 100%」——100% 屬於完成態，任務永遠推不到完成，列表又因為
 * 「未完成且已過計劃完成日」一直標逾期，界面上就是「100% 卻還標逾期」。
 *
 * 這裡把兩條口徑收成純函數，避免顯示與上報各自實現、再次漂移：
 * 1. 100% 只屬於完成態：未完成的任務顯示按 99% 封頂；
 * 2. 「開始」只推狀態，永遠不帶進度；進度只能按實際填寫上報。
 */
import { RDM_TASK_ACTION, RDM_TASK_STATUS, type RdmTaskAction } from '../../constants/rdm'

export interface RdmTaskReportPayload {
  action: RdmTaskAction
  /** 實際填寫的進度；未完成的任務不得為 100 */
  progress?: number
  actualHours?: number
  remark?: string
}

export interface RdmTaskReportInput {
  progress: number
  actualHours?: number | null
  remark?: string
}

/**
 * 列表顯示用的進度：未完成一律封頂 99%，已完成保證 100%。
 * <p>歷史臟數據（進行中 + 100%）在列表裡不能再原樣渲染，否則「100% 卻還逾期」
 * 會被讀成系統算錯；真實值仍可從「上報進度」改寫，要變 100% 必須走「上報並完成」。
 */
export function displayTaskProgress(status: string, progress?: number | null): number {
  const pct = progress ?? 0
  if (status === RDM_TASK_STATUS.DONE) return Math.max(pct, 100)
  return Math.max(0, Math.min(pct, 99))
}

/**
 * 上報載荷：開始不帶進度，完成固定 100，其餘按填寫值上報。
 * <p>呼叫方不需要再自己判斷 action，避免「開始」再次被寫成滿進度。
 */
export function buildTaskReportPayload(action: RdmTaskAction, input: RdmTaskReportInput): RdmTaskReportPayload {
  if (action === RDM_TASK_ACTION.START) {
    return { action: RDM_TASK_ACTION.START }
  }
  return {
    action,
    progress: action === RDM_TASK_ACTION.DONE ? 100 : input.progress,
    actualHours: input.actualHours ?? undefined,
    // 首尾空白不留：空白說明在後端等於沒填，寧可早一點當作未填
    remark: input.remark?.trim() || undefined,
  }
}
