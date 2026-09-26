import request from './request'
import type { PageResult } from './employee'

/** HR 入转调离单据类型（与后端 HrLifecycleConstants 对齐） */
export const HR_LIFECYCLE_TYPE = {
  /** 入职 */
  ONBOARD: 'onboard',
  /** 转正 */
  REGULAR: 'regular',
  /** 调动 */
  TRANSFER: 'transfer',
  /** 离职 */
  DIMISSION: 'dimission',
  /** 合同续签（入口与授权归属合同台账） */
  RENEW: 'renew',
} as const

export type HrLifecycleType = (typeof HR_LIFECYCLE_TYPE)[keyof typeof HR_LIFECYCLE_TYPE]

/** 单据类型 → OA 流程编码（与后端 HrLifecycleConstants.TYPE_TO_PROCESS_CODE 一致） */
export const HR_LIFECYCLE_PROCESS_CODE: Record<HrLifecycleType, string> = {
  [HR_LIFECYCLE_TYPE.ONBOARD]: 'hr_onboard',
  [HR_LIFECYCLE_TYPE.REGULAR]: 'hr_regular',
  [HR_LIFECYCLE_TYPE.TRANSFER]: 'hr_transfer',
  [HR_LIFECYCLE_TYPE.DIMISSION]: 'hr_dimission',
  [HR_LIFECYCLE_TYPE.RENEW]: 'hr_renew',
}

/** OA 流程编码 → 单据类型：审批详情页据此判定 bizId 属于哪张单据，禁止跨域猜测 */
export const HR_PROCESS_CODE_TO_TYPE: Record<string, HrLifecycleType> = Object.fromEntries(
  (Object.entries(HR_LIFECYCLE_PROCESS_CODE) as [HrLifecycleType, string][])
    .map(([type, code]) => [code, type]),
) as Record<string, HrLifecycleType>

/** 单据类型 → 功能授权菜单 key */
export const HR_LIFECYCLE_MENU_KEY: Record<HrLifecycleType, string> = {
  [HR_LIFECYCLE_TYPE.ONBOARD]: 'hr-onboarding',
  [HR_LIFECYCLE_TYPE.REGULAR]: 'hr-regularization',
  [HR_LIFECYCLE_TYPE.TRANSFER]: 'hr-transfer',
  [HR_LIFECYCLE_TYPE.DIMISSION]: 'hr-dimission',
  [HR_LIFECYCLE_TYPE.RENEW]: 'contract-ledger',
}

/** 单据类型 → 列表页路由（续签回到合同台账页） */
export const HR_LIFECYCLE_LIST_PATH: Record<HrLifecycleType, string> = {
  [HR_LIFECYCLE_TYPE.ONBOARD]: '/hr-onboarding',
  [HR_LIFECYCLE_TYPE.REGULAR]: '/hr-regularization',
  [HR_LIFECYCLE_TYPE.TRANSFER]: '/hr-transfer',
  [HR_LIFECYCLE_TYPE.DIMISSION]: '/hr-dimission',
  [HR_LIFECYCLE_TYPE.RENEW]: '/contract-ledger',
}

/** 单据类型 → 表单/详情路由前缀（续签有独立路由，其余为 /hr-xx） */
export const HR_LIFECYCLE_ROUTE: Record<HrLifecycleType, string> = {
  [HR_LIFECYCLE_TYPE.ONBOARD]: '/hr-onboarding',
  [HR_LIFECYCLE_TYPE.REGULAR]: '/hr-regularization',
  [HR_LIFECYCLE_TYPE.TRANSFER]: '/hr-transfer',
  [HR_LIFECYCLE_TYPE.DIMISSION]: '/hr-dimission',
  [HR_LIFECYCLE_TYPE.RENEW]: '/hr-contract-renew',
}

/** 单据状态（与后端状态机对齐） */
export const HR_LIFECYCLE_STATUS = {
  DRAFT: 'draft',
  PENDING: 'pending',
  APPROVED: 'approved',
  REJECTED: 'rejected',
  CANCELLED: 'cancelled',
  COMPLETED: 'completed',
} as const

export type HrLifecycleStatus = (typeof HR_LIFECYCLE_STATUS)[keyof typeof HR_LIFECYCLE_STATUS]

/** 离职类型 */
export const HR_DIMISSION_TYPE = {
  VOLUNTARY: 'voluntary',
  INVOLUNTARY: 'involuntary',
  EXPIRED: 'expired',
} as const

/** 生命周期单据（后端 VO） */
export interface HrLifecycleItem {
  id: number
  reqNo: string
  type: HrLifecycleType
  status: HrLifecycleStatus
  flowNo?: string | null
  userId?: number | null
  empName: string
  empNo?: string | null
  deptId?: number | null
  deptName?: string | null
  positionId?: number | null
  positionName?: string | null
  effectiveDate?: string | null
  reason?: string | null

  // 入职明细
  offerDate?: string | null
  probationMonths?: number | null
  expectedRegularDate?: string | null
  idCardNo?: string | null
  mobile?: string | null
  email?: string | null
  /** 入职资料 JSON 字符串（学历/工作经历/银行信息等） */
  candidateInfo?: string | null

  // 调动明细
  oldDeptName?: string | null
  oldPositionName?: string | null
  newDeptId?: number | null
  newDeptName?: string | null
  newPositionId?: number | null
  newPositionName?: string | null
  newCompany?: string | null
  newSuperior?: string | null

  // 离职明细
  dimissionType?: string | null
  lastWorkDate?: string | null
  settlementInfo?: string | null

  // 合同续签明细
  contractId?: number | null
  /** 原合同编号快照 */
  contractNo?: string | null
  newContractNo?: string | null
  newContractType?: string | null
  newContractCompany?: string | null
  newContractStartDate?: string | null
  newContractEndDate?: string | null

  remark?: string | null
  createdBy?: string
  updatedBy?: string
  createdAt?: string
  updatedAt?: string
}

/** 单据新增/编辑请求 */
export interface HrLifecyclePayload {
  type?: HrLifecycleType
  userId?: number | null
  empName: string
  deptId?: number | null
  positionId?: number | null
  effectiveDate?: string | null
  reason?: string | null
  offerDate?: string | null
  probationMonths?: number | null
  expectedRegularDate?: string | null
  idCardNo?: string | null
  mobile?: string | null
  email?: string | null
  candidateInfo?: string | null
  newDeptId?: number | null
  newPositionId?: number | null
  newCompany?: string | null
  newSuperior?: string | null
  dimissionType?: string | null
  lastWorkDate?: string | null
  settlementInfo?: string | null
  remark?: string | null

  // 合同续签明细
  /** 被续签的原合同ID（续签必填） */
  contractId?: number | null
  /** 新合同编号，留空由后端按「原编号-R{n}」派生 */
  newContractNo?: string | null
  newContractType?: string | null
  newContractCompany?: string | null
  newContractStartDate?: string | null
  newContractEndDate?: string | null
}

/** 查询参数 */
export interface HrLifecycleQuery {
  page: number
  size: number
  type: HrLifecycleType
  status?: string
  keyword?: string
}

/** 发起单据选员工后的概要回填 */
export interface HrEmployeeBrief {
  userId: number
  empId: string
  name: string
  departmentId?: number | null
  department?: string | null
  positionId?: number | null
  position?: string | null
  sequence?: string | null
  jobLevel?: string | null
  rank?: string | null
  company?: string | null
  directSuperior?: string | null
  employmentStatus?: string | null
}

/** 分页查询单据 */
export function fetchLifecycleRequests(params: HrLifecycleQuery) {
  return request.get<unknown, PageResult<HrLifecycleItem>>('/hr/lifecycle', { params })
}

/** 各状态数量（Tab 徽标） */
export function fetchLifecycleStats(type: HrLifecycleType) {
  return request.get<unknown, Record<string, number>>('/hr/lifecycle/stats', { params: { type } })
}

/** 单据详情 */
export function fetchLifecycleRequest(id: number) {
  return request.get<unknown, HrLifecycleItem>(`/hr/lifecycle/${id}`)
}

/** 员工搜索下拉（转正/调动/离职选人） */
export function fetchLifecycleEmployeeOptions(type: HrLifecycleType, keyword?: string) {
  return request.get<unknown, HrEmployeeBrief[]>('/hr/lifecycle/employee-options', {
    params: { type, keyword: keyword || undefined },
  })
}

/** 保存草稿 */
export function saveLifecycleDraft(data: HrLifecyclePayload) {
  return request.post<unknown, HrLifecycleItem>('/hr/lifecycle', data)
}

/** 编辑单据 */
export function updateLifecycleRequest(id: number, data: HrLifecyclePayload) {
  return request.put<unknown, HrLifecycleItem>(`/hr/lifecycle/${id}`, data)
}

/** 提交审批（关联 OA 流程） */
export function submitLifecycleRequest(id: number) {
  return request.post<unknown, HrLifecycleItem>(`/hr/lifecycle/${id}/submit`)
}

/** 撤销审批（单据回到草稿） */
export function cancelLifecycleRequest(id: number) {
  return request.post<unknown, void>(`/hr/lifecycle/${id}/cancel`)
}

/** 删除单据 */
export function deleteLifecycleRequest(id: number) {
  return request.delete<unknown, void>(`/hr/lifecycle/${id}`)
}

/** 保存草稿（或更新已有草稿）+ 提交审批的组合动作 */
export async function saveAndSubmitLifecycle(id: number | undefined, data: HrLifecyclePayload) {
  let current: HrLifecycleItem
  if (id == null) {
    current = await saveLifecycleDraft(data)
  } else {
    current = await updateLifecycleRequest(id, data)
  }
  return submitLifecycleRequest(current.id)
}
