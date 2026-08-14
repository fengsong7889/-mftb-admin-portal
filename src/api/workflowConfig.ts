/**
 * 流程配置 API
 *
 * 對接後端 biz_workflow_config 表，控制各業務流程審批開關。
 * 後端不可用時降級到 localStorage（與 useWorkflowConfig hook 既有行為一致）。
 */
import request, { SILENT_HEADER } from './request'

/** 流程配置 VO（與後端 WorkflowConfigVO 對齊） */
export interface WorkflowConfigVO {
  id: number
  flowType: string
  flowName: string
  approvalEnabled: boolean
  description: string
  updatedBy: string
  updatedAt: string
}

/** 查詢所有流程配置 */
export async function fetchWorkflowConfigs(): Promise<WorkflowConfigVO[]> {
  const res = await request.get<unknown, WorkflowConfigVO[]>('/workflow-config', {
    headers: { [SILENT_HEADER]: '1' },
  })
  return res
}

/** 更新指定流程的審批開關 */
export async function updateApprovalEnabled(
  flowType: string,
  approvalEnabled: boolean,
): Promise<void> {
  console.log('[workflowConfig] 同步后端:', flowType, '→', approvalEnabled)
  await request.put(`/workflow-config/${flowType}/approval-enabled`, { value: approvalEnabled }, {
    headers: { [SILENT_HEADER]: '1' },
  })
  console.log('[workflowConfig] 后端同步成功')
}
