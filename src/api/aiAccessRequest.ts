/**
 * AI 使用申請 API
 * 對應後端 AiAccessRequestController（/api/ai/access-request）
 */
import request from './request'

/** 申請類型 */
export type AiRequestType = 'model_only' | 'model_and_quota' | 'quota_only'

/** 申請狀態 */
export type AiRequestStatus = 'pending' | 'approved' | 'rejected' | 'cancelled'

/** 使用頻率 */
export type UsageFrequency = 'occasional' | 'regular' | 'heavy'

/** 申請場景入口（無權限/無額度/加額度等不同入口發起的申請） */
export type AiApplyReason =
  | 'no-models'
  | 'no-quota'
  | 'no-both'
  | 'topup'
  | 'add-model'
  | 'quota-exhausted'
  | 'needs-approval'

/** 額度生效類型 */
export type QuotaEffectiveType = 'permanent' | 'temporary'

/** 憑證附件項（base64 dataUrl 直存，與頭像上傳模式一致） */
export interface AiCredentialItem {
  name: string
  /** image / pdf */
  type: string
  size: number
  dataUrl: string
}

/** 授權模型能力配置項（審批操作區勾選結果，1=開 0=關） */
export interface AiApprovedModelConfig {
  modelId: number
  visionSupport: number
  functionCalling: number
  jsonMode: number
  streaming: number
  thinkingMode: number
}

/** 憑證上傳結果 */
export interface AiCredentialUploadVO {
  name: string
  type: string
  size: number
  dataUrl: string
}

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
  applyReason: AiApplyReason | null
  requestedModels: number[] | null
  usageDescription: string
  usageScenarios: string[] | null
  usageFrequency: UsageFrequency | null
  credentials: AiCredentialItem[] | null
  status: AiRequestStatus
  workflowInstanceId: number | null
  approvedModels: number[] | null
  approvedModelConfigs: AiApprovedModelConfig[] | null
  approvedQuotaType: string | null
  approvedQuotaValue: number | null
  approvedQuotaPeriod: string | null
  approvedOverLimitAction: string | null
  quotaEffectiveType: QuotaEffectiveType | null
  quotaExpireAt: string | null
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
  applyReason?: AiApplyReason
  requestedModels?: number[]
  usageDescription: string
  usageScenarios?: string[]
  usageFrequency?: UsageFrequency
  credentials?: AiCredentialItem[]
}

/** 審批操作請求（審批即授權：通過後自動下發模型權限與個人額度） */
export interface ApproveAiRequest {
  approvedModels?: number[]
  approvedModelConfigs?: AiApprovedModelConfig[]
  approvedQuotaType?: string
  approvedQuotaValue?: number
  approvedQuotaPeriod?: string
  approvedOverLimitAction?: string
  quotaEffectiveType?: QuotaEffectiveType
  /** yyyy-MM-dd HH:mm:ss，quotaEffectiveType=temporary 時必填 */
  quotaExpireAt?: string
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

/** 撤銷申請（僅申請人本人且待審批狀態） */
export function cancelAiAccessRequest(id: number): Promise<boolean> {
  return request.post(`/ai/access-request/${id}/cancel`)
}

/** 上傳申請憑證附件（圖片/PDF ≤2MB，返回 base64 dataUrl，隨申請一併提交） */
export function uploadAiCredential(file: File): Promise<AiCredentialUploadVO> {
  const formData = new FormData()
  formData.append('file', file)
  return request.post('/ai/access-request/credential/upload', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })
}
