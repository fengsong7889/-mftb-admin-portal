/**
 * 證明開具（員工自助）API
 * 对应后端 HrCertificateController（/api/hr/certificate）
 * <p>
 * 所有端点只服务登录人本人：请求体不含 userId，服务端按当前用户强制归属与过滤。
 */
import request from './request'
import type { PageResult } from './employee'

/** 证明类型（与后端 HrCertificateConstants / HR 字典 CERT_TYPE 一致） */
export const CERT_TYPE = {
  EMPLOYMENT: 'EMPLOYMENT', INCOME: 'INCOME',
  RESIGNATION: 'RESIGNATION', OTHER: 'OTHER',
} as const
export type CertType = (typeof CERT_TYPE)[keyof typeof CERT_TYPE]

/** 证明语种 */
export const CERT_LANGUAGE = { ZH: 'ZH', EN: 'EN', BOTH: 'BOTH' } as const
export type CertLanguage = (typeof CERT_LANGUAGE)[keyof typeof CERT_LANGUAGE]

/** 单据状态（与请假/入转调离同口径） */
export const CERT_STATUS = {
  DRAFT: 'draft', PENDING: 'pending', APPROVED: 'approved',
  REJECTED: 'rejected', CANCELLED: 'cancelled', COMPLETED: 'completed',
} as const
export type CertStatus = (typeof CERT_STATUS)[keyof typeof CERT_STATUS]

/** 领取方式（与后端 HrCertificateConstants 一致） */
export const CERT_PICKUP = { SELF: 'SELF', DELIVERY: 'DELIVERY', ELECTRONIC: 'ELECTRONIC' } as const
export type CertPickup = (typeof CERT_PICKUP)[keyof typeof CERT_PICKUP]

/** 可编辑/提交/删除的草稿态 */
export const CERT_EDITABLE: string[] = [CERT_STATUS.DRAFT, CERT_STATUS.REJECTED, CERT_STATUS.CANCELLED]

export interface CertificateItem {
  id: number
  reqNo: string
  userId: number
  empName: string
  empNo?: string | null
  deptName?: string | null
  certType: CertType | string
  purpose: string
  recipient?: string | null
  language: CertLanguage | string
  copies: number
  expectDate?: string | null
  remark?: string | null
  status: CertStatus | string
  flowNo?: string | null
  /** 证明编号（人事开具后登记） */
  certNo?: string | null
  /** 开具日期 */
  issueDate?: string | null
  /** 领取方式 */
  pickupType?: CertPickup | string | null
  /** 开具办理人 */
  issuedBy?: string | null
  /** 办理结果（待开具=等待提示；已开具=含真实编号） */
  resultRemark?: string | null
  createdBy?: string
  updatedBy?: string
  createdAt?: string
  updatedAt?: string
}

export interface CertificatePayload {
  certType: string
  purpose: string
  recipient?: string
  language?: string
  copies: number
  expectDate?: string
  remark?: string
}

export const fetchCertificates = (params: { page: number; size: number; status?: string; keyword?: string }) =>
  request.get<unknown, PageResult<CertificateItem>>('/hr/certificate', { params })
/** 查询：GET /hr/certificate/stats */
export const fetchCertificateStats = () =>
  request.get<unknown, Record<string, number>>('/hr/certificate/stats')
/** 查询：GET /hr/certificate/{id} */
export const fetchCertificateDetail = (id: number) =>
  request.get<unknown, CertificateItem>(`/hr/certificate/${id}`)
/** 保存：POST /hr/certificate */
export const saveCertificateDraft = (data: CertificatePayload) =>
  request.post<unknown, CertificateItem>('/hr/certificate', data)
/** 修改：PUT /hr/certificate/{id} */
export const updateCertificate = (id: number, data: CertificatePayload) =>
  request.put<unknown, CertificateItem>(`/hr/certificate/${id}`, data)
/** 提交：POST /hr/certificate/{id}/submit */
export const submitCertificate = (id: number) =>
  request.post<unknown, CertificateItem>(`/hr/certificate/${id}/submit`)
/** 取消：POST /hr/certificate/{id}/cancel */
export const cancelCertificate = (id: number) =>
  request.post<unknown, void>(`/hr/certificate/${id}/cancel`)
/** 删除：DELETE /hr/certificate/{id} */
export const deleteCertificate = (id: number) =>
  request.delete<unknown, void>(`/hr/certificate/${id}`)

/** 审批流程编码（与后端 HrCertificateConstants.PROCESS_CODE 一致）：审批详情页据此识别单据域 */
export const CERT_PROCESS_CODE = 'hr_certificate'

/** 人事台账查询参数 */
export interface CertificateLedgerQuery {
  page: number
  size: number
  status?: string
  certType?: string
  keyword?: string
}

/** 开具登记请求（人事填写实际出具的编号） */
export interface CertificateIssuePayload {
  certNo: string
  issueDate: string
  pickupType: string
  remark?: string
}

/** 证明开具台账（人事视角，跨员工；需 hr-certificate 菜单） */
export const fetchCertificateLedger = (params: CertificateLedgerQuery) =>
  request.get<unknown, PageResult<CertificateItem>>('/hr/certificate/ledger', { params })
/** 查询：GET /hr/certificate/ledger/stats */
export const fetchCertificateLedgerStats = () =>
  request.get<unknown, Record<string, number>>('/hr/certificate/ledger/stats')
/** 发放：POST /hr/certificate/{id}/issue */
export const issueCertificate = (id: number, data: CertificateIssuePayload) =>
  request.post<unknown, CertificateItem>(`/hr/certificate/${id}/issue`, data)

/** 列表/详情页路由（自助入口与审批落地回跳共用） */
export const CERT_LIST_PATH = '/ess-certificate'
export const CERT_DETAIL_PATH = '/ess-certificate-detail'
export const CERT_FORM_PATH = '/ess-certificate-form'

/** 人事台账与开具登记页 */
export const CERT_LEDGER_PATH = '/hr-certificate'
export const CERT_ISSUE_PATH = '/hr-certificate-issue'

/** 保存草稿 + 提交审批（表单页「提交申請」组合动作） */
export async function saveAndSubmitCertificate(id: number | undefined, data: CertificatePayload) {
  const current = id == null ? await saveCertificateDraft(data) : await updateCertificate(id, data)
  return submitCertificate(current.id)
}
