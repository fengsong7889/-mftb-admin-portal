import request from './request'
import type { PageResult } from './employee'

/** 假期类型（与后端 HrLeaveConstants / HR 字典 LEAVE_TYPE 对齐） */
export const LEAVE_TYPE = {
  ANNUAL: 'ANNUAL', PERSONAL: 'PERSONAL', SICK: 'SICK', MARRIAGE: 'MARRIAGE',
  MATERNITY: 'MATERNITY', BEREAVEMENT: 'BEREAVEMENT', COMPENSATORY: 'COMPENSATORY',
} as const
export type LeaveType = (typeof LEAVE_TYPE)[keyof typeof LEAVE_TYPE]

/** 请假单状态（与后端状态机一致） */
export const LEAVE_STATUS = {
  DRAFT: 'draft', PENDING: 'pending', APPROVED: 'approved',
  REJECTED: 'rejected', CANCELLED: 'cancelled', COMPLETED: 'completed',
} as const
export type LeaveStatus = (typeof LEAVE_STATUS)[keyof typeof LEAVE_STATUS]

/** 可编辑/提交/删除的草稿态（与后端 EDITABLE_STATUSES 一致） */
export const LEAVE_EDITABLE: string[] = [LEAVE_STATUS.DRAFT, LEAVE_STATUS.REJECTED, LEAVE_STATUS.CANCELLED]

/** 请假审批流程编码（与后端 HrLeaveConstants.PROCESS_CODE 一致）：审批详情页据此识别单据域 */
export const LEAVE_PROCESS_CODE = 'oa_leave'

/** 请假单详情路由（审批详情页回跳与关联单据入口共用） */
export const LEAVE_DETAIL_PATH = '/hr-leave-detail'

export interface LeaveBalance {
  id?: number | null
  userId: number
  empNo?: string | null
  empName?: string | null
  department?: string | null
  year: number
  leaveType: LeaveType | string
  totalDays: number
  carriedDays: number
  usedDays: number
  occupiedDays?: number
  remainingDays?: number
  granted?: boolean
  remark?: string | null
  updatedBy?: string
  updatedAt?: string
}

export interface LeaveRequestItem {
  id: number
  reqNo: string
  userId: number
  empName: string
  empNo?: string | null
  deptName?: string | null
  year: number
  leaveType: string
  startDate: string
  endDate: string
  days: number
  reason?: string | null
  status: LeaveStatus | string
  flowNo?: string | null
  remark?: string | null
  createdBy?: string
  updatedBy?: string
  createdAt?: string
  updatedAt?: string
  remainingDays?: number | null
}

export interface LeaveRequestPayload {
  userId: number
  leaveType: string
  startDate: string
  endDate: string
  reason?: string
}

export interface LeaveEmployeeOption {
  userId: number
  empId: string
  name: string
  department?: string | null
}

/** 单员工 × 单假别的剩余额度（已扣在途占用） */
export interface LeaveQuotaInfo {
  granted: boolean
  year: number
  leaveType: string
  /** 未授予额度时为 null（表示不做强校验） */
  remainingDays: number | null
}

/* ---------- 请假单 ---------- */
export const fetchLeaveRequests = (params: {
  page: number; size: number; status?: string; keyword?: string
  /** 只看本人（員工自助页）：服务端强制收敛，人事角色打开也只看自己 */
  mineOnly?: boolean
}) => request.get<unknown, PageResult<LeaveRequestItem>>('/hr/leave', { params })
export const fetchLeaveStats = (mineOnly?: boolean) =>
  request.get<unknown, Record<string, number>>('/hr/leave/stats', { params: { mineOnly: mineOnly || undefined } })
export const fetchLeaveDetail = (id: number) =>
  request.get<unknown, LeaveRequestItem>(`/hr/leave/${id}`)
export const saveLeaveDraft = (data: LeaveRequestPayload) =>
  request.post<unknown, LeaveRequestItem>('/hr/leave', data)
export const updateLeaveRequest = (id: number, data: LeaveRequestPayload) =>
  request.put<unknown, LeaveRequestItem>(`/hr/leave/${id}`, data)
export const submitLeaveRequest = (id: number) =>
  request.post<unknown, LeaveRequestItem>(`/hr/leave/${id}/submit`)
export const cancelLeaveRequest = (id: number) =>
  request.post<unknown, void>(`/hr/leave/${id}/cancel`)
export const deleteLeaveRequest = (id: number) =>
  request.delete<unknown, void>(`/hr/leave/${id}`)
export const fetchLeaveEmployeeOptions = (keyword?: string) =>
  request.get<unknown, LeaveEmployeeOption[]>('/hr/leave/employee-options', {
    params: { keyword: keyword || undefined },
  })

/* ---------- 假期额度 ---------- */
export const fetchLeaveBalances = (params: {
  page: number; size: number; year?: number; keyword?: string
  /** 只看本人（員工自助页） */
  mineOnly?: boolean
}) => request.get<unknown, PageResult<LeaveBalance>>('/hr/leave/balances', { params })
export const saveLeaveBalance = (data: Partial<LeaveBalance>) =>
  request.post<unknown, LeaveBalance>('/hr/leave/balances', data)
export const deleteLeaveBalance = (id: number) =>
  request.delete<unknown, void>(`/hr/leave/balances/${id}`)
export const batchInitBalances = (params: { year: number; leaveType: string; totalDays: number; userIds?: number[] }) =>
  request.post<unknown, number>('/hr/leave/balances/batch-init', null, { params })

/** 精确查询单员工单假别剩余额度（year 缺省取当前年度） */
export const fetchLeaveQuota = (params: { userId: number; leaveType: string; year?: number }) =>
  request.get<unknown, LeaveQuotaInfo>('/hr/leave/balances/quota', { params })

/** 超额（剩余为负）额度行数，跨分页口径 */
export const fetchLeaveOverdueCount = (year?: number) =>
  request.get<unknown, number>('/hr/leave/balances/overdue-count', { params: { year } })

/** 保存草稿 + 提交审批（表单页「提交申请」组合动作，与入转调离一致） */
export async function saveAndSubmitLeave(id: number | undefined, data: LeaveRequestPayload) {
  const current = id == null ? await saveLeaveDraft(data) : await updateLeaveRequest(id, data)
  return submitLeaveRequest(current.id)
}
