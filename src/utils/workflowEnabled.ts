/**
 * 流程配置工具函數
 *
 * 提供輕量級的流程啟用/停用查詢，無需引入完整 Hook。
 * 數據來源：localStorage（與 useWorkflowConfig hook 共用同一存儲）。
 */
import { DEFAULT_WORKFLOWS } from '../constants/defaultWorkflows'
import { WORKFLOW_STORAGE_KEY } from '../pages/WorkflowConfig/types'

/** 讀取 localStorage 中的流程配置並返回啟用狀態映射 */
function getWorkflowEnabledMap(): Record<string, boolean> {
  const map: Record<string, boolean> = {}
  try {
    const raw = localStorage.getItem(WORKFLOW_STORAGE_KEY)
    if (raw) {
      const workflows = JSON.parse(raw) as Array<{ workflowKey?: string; approvalType?: string; enabled: boolean }>
      for (const wf of workflows) {
        const key = wf.workflowKey || wf.approvalType
        if (key) map[key] = wf.enabled
      }
      return map
    }
  } catch { /* ignore */ }
  // 無配置時使用默認流程（全部啟用）
  for (const wf of DEFAULT_WORKFLOWS) {
    const key = wf.workflowKey || wf.approvalType
    if (key) map[key] = wf.enabled
  }
  return map
}

/**
 * 判斷指定流程是否啟用審批
 * @param flowKey 流程標識（如 'recharge' / 'deduct' / 'transfer' / 'merge' / 'gift'）
 * @returns true = 需要審批, false = 直接執行
 */
export function isWorkflowEnabled(flowKey: string): boolean {
  const map = getWorkflowEnabledMap()
  return map[flowKey] !== false // 默認啟用（未配置時也視為啟用）
}

/** 直接執行標記（後端審批停用時返回此值代替流程編號） */
export const DIRECT_EXEC_MARKER = 'DIRECT-EXEC'

/** 判斷流程編號是否為直接執行標記 */
export function isDirectExec(flowNo: string | undefined | null): boolean {
  return flowNo === DIRECT_EXEC_MARKER
}
