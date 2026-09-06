/**
 * AI 使用申請 API
 * 對應後端 AiAccessRequestController（/api/ai/access-request）
 */
import request from './request'

/** 申請類型 */
export type AiRequestType = 'model_only' | 'model_and_quota' | 'quota_only'

/** 申請狀態 */
export type AiRequestStatus = 'pending' | 'approved' | 'rejected'

/** 使用頻率 */
export type UsageFrequency = 'occasional' | 'regular' | 'heavy'

/** 申請記錄 VO */
export interface AiAccessRequestVO {
  id: number
  applicantId: number
  applicantName: string
  departmentId: number | null
  departmentName: string | null
  positionId: number | null
  positionName: string | null
  requestType: AiRequestType
  requestedModels: number[] | null
  usageDescription: string
  usageScenarios: string[] | null
  usageFrequency: UsageFrequency | null
  status: AiRequestStatus
  workflowInstanceId: number | null
  approvedModels: number[] | null
  approvedQuotaType: string | null
  approvedQuotaValue: number | null
  approvedQuotaPeriod: string | null
  approvedOverLimitAction: string | null
  approverId: number | null
  approverName: string | null
  approveRemark: string | null
  approvedAt: string | null
  createdBy: string | null
  updatedBy: string | null
  createdAt: string | null
  updatedAt: string | null
}

/** 提交申請請求 */
export interface SubmitAiRequest {
  requestType: AiRequestType
  requestedModels?: number[]
  usageDescription: string
  usageScenarios?: string[]
  usageFrequency?: UsageFrequency
}

/** 審批操作請求 */
export interface ApproveAiRequest {
  approvedModels?: number[]
  approvedQuotaType?: string
  approvedQuotaValue?: number
  approvedQuotaPeriod?: string
  approvedOverLimitAction?: string
  approveRemark?: string
}

/** 查詢參數 */
export interface AiRequestQuery {
  status?: AiRequestStatus
  requestType?: AiRequestType
  applicantName?: string
}

/* ==================== API ==================== */

export function submitAiAccessRequest(data: SubmitAiRequest): Promise<number> {
  return request.post('/ai/access-request', data)
}

export function fetchAiAccessRequests(params?: AiRequestQuery): Promise<AiAccessRequestVO[]> {
  return request.get('/ai/access-request', { params })
}

export function fetchMyAiAccessRequests(params?: AiRequestQuery): Promise<AiAccessRequestVO[]> {
  return request.get('/ai/access-request/my', { params })
}

export function fetchAiAccessRequestDetail(id: number): Promise<AiAccessRequestVO> {
  return request.get(`/ai/access-request/${id}`)
}

export function approveAiAccessRequest(id: number, data: ApproveAiRequest): Promise<boolean> {
  return request.post(`/ai/access-request/${id}/approve`, data)
}

export function rejectAiAccessRequest(id: number, remark?: string): Promise<boolean> {
  return request.post(`/ai/access-request/${id}/reject`, null, { params: { remark } })
}
