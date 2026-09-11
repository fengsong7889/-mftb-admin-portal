/**
 * OA流程事項 API
 * 對應後端 OaRequestController（/api/oa/requests）
 */
import request from './request'

/** 流程狀態 */
export type OaFlowStatus = 'draft' | 'pending' | 'approved' | 'rejected' | 'cancelled'

/** 審批任務節點 */
export interface OaApprovalTaskVO {
  id: number
  nodeName: string
  sortOrder: number
  approvalRule: string
  approver: string | null
  taskStatus: string
  approveTime: string | null
  comment: string | null
}

/** OA流程實例 VO */
export interface OaRequestVO {
  id: number
  flowNo: string
  processCode: string
  processName: string | null
  title: string
  formData: Record<string, unknown> | null
  applicant: string
  flowStatus: OaFlowStatus
  currentNodeName: string | null
  currentApprover: string | null
  rejectReason: string | null
  applyTime: string | null
  completeTime: string | null
  cancelTime: string | null
  // 审批中心专用字段
  groupId: string | null
  groupName: string | null
  brand: string | null
  bizApprover: string | null
  bizApproveTime: string | null
  bizApproveStatus: string | null
  opsApprover: string | null
  opsApproveTime: string | null
  opsApproveStatus: string | null
  finApprover: string | null
  finApproveTime: string | null
  finApproveStatus: string | null
  approvalTasks: OaApprovalTaskVO[]
}

/** 分頁結果 */
export interface PageResult<T> {
  records: T[]
  total: number
}

/** 查詢參數 */
export interface OaRequestQuery {
  page?: number
  size?: number
  flowNo?: string
  processCode?: string
  applicant?: string
  flowStatus?: OaFlowStatus
  applyFrom?: string
  applyTo?: string
}

/** 流程發起請求 */
export interface OaRequestCreateDTO {
  processCode: string
  title: string
  formData?: string
  flowStatus?: OaFlowStatus
}

/** 審批推進結果 */
export interface ApproveResultVO {
  nodeName: string
  finished: boolean
  nextNode: string | null
}

/* ==================== API ==================== */

/** 流程事項分頁列表 */
export function fetchOaRequests(params?: OaRequestQuery): Promise<PageResult<OaRequestVO>> {
  return request.get('/oa/requests', { params })
}

/** 流程詳情（含審批節點列表） */
export function fetchOaRequestDetail(flowNo: string): Promise<OaRequestVO> {
  return request.get(`/oa/requests/${flowNo}`)
}

/** 發起流程 */
export function submitOaRequest(data: OaRequestCreateDTO): Promise<string> {
  return request.post('/oa/requests', data)
}

/** 通過當前待審節點 */
export function approveOaRequest(flowNo: string, comment?: string, formData?: string): Promise<ApproveResultVO> {
  const body: Record<string, unknown> = {}
  if (comment) body.comment = comment
  if (formData) body.formData = formData
  return request.post(`/oa/requests/${flowNo}/approve`, Object.keys(body).length > 0 ? body : undefined)
}

/** 駁回當前待審節點 */
export function rejectOaRequest(flowNo: string, reason: string): Promise<void> {
  return request.post(`/oa/requests/${flowNo}/reject`, { reason })
}

/** 撤銷申請 */
export function cancelOaRequest(flowNo: string): Promise<void> {
  return request.post(`/oa/requests/${flowNo}/cancel`)
}
