import request from './request'

/**
 * 人事操作审计查询（方案 §5.5）。
 *
 * 审计值在<b>写入时</b>就已脱敏，所以这里没有任何「显示原文」的开关：
 * 前端拿到的 beforeValue/afterValue 就是审计表里存的样子，不存在二次解密这条路。
 */

/** 动作码 —— 与后端 HrAuditAction 逐值对齐 */
export const HR_AUDIT_ACTION = {
  EMPLOYEE_CREATE: 'EMPLOYEE_CREATE',
  EMPLOYEE_UPDATE: 'EMPLOYEE_UPDATE',
  EMPLOYEE_DELETE: 'EMPLOYEE_DELETE',
  PROFILE_UPDATE: 'PROFILE_UPDATE',
  SENSITIVE_VIEW: 'SENSITIVE_VIEW',
  ACCOUNT_DISABLE: 'ACCOUNT_DISABLE',
  ACCOUNT_ENABLE: 'ACCOUNT_ENABLE',
  PASSWORD_RESET: 'PASSWORD_RESET',
  ROLE_BIND: 'ROLE_BIND',
  POSITION_WRITE: 'POSITION_WRITE',
  PERIOD_REGISTER: 'PERIOD_REGISTER',
  CONTRACT_WRITE: 'CONTRACT_WRITE',
  SALARY_WRITE: 'SALARY_WRITE',
  LIFECYCLE_EXECUTE: 'LIFECYCLE_EXECUTE',
  ROSTER_EXPORT: 'ROSTER_EXPORT',
} as const

export type HrAuditActionKey = (typeof HR_AUDIT_ACTION)[keyof typeof HR_AUDIT_ACTION]

export interface HrAuditItem {
  id: number
  userId: number
  empNo?: string | null
  action: HrAuditActionKey | string
  fieldName?: string | null
  beforeValue?: string | null
  afterValue?: string | null
  detail?: string | null
  reason?: string | null
  sourceReqNo?: string | null
  effectiveDate?: string | null
  occurredAt?: string | null
  sensitive?: number | null
  operator?: string | null
}

export interface HrAuditPage {
  records: HrAuditItem[]
  total: number
}

export interface HrAuditQuery {
  userId?: number
  action?: string
  operator?: string
  from?: string
  to?: string
  page?: number
  pageSize?: number
}

/** 分页查询审计（需 employee-management:auditView） */
export function fetchHrAudit(params: HrAuditQuery) {
  return request.get<unknown, HrAuditPage>('/hr/audit', { params })
}

/** 后端支持的动作码清单 */
export function fetchHrAuditActions() {
  return request.get<unknown, string[]>('/hr/audit/actions')
}
