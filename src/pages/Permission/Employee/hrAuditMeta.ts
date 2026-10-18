/**
 * 人事审计动作码 → i18n key。
 *
 * 与后端 `com.mftb.admin.constant.HrAuditAction` 逐值对齐（真值在那边）；
 * 这里只是文案映射，界面不许再散落动作码字面量。
 */
export const HR_AUDIT_ACTION_LABEL_KEY: Record<string, string> = {
  EMPLOYEE_CREATE: 'hrAudit.action.EMPLOYEE_CREATE',
  EMPLOYEE_UPDATE: 'hrAudit.action.EMPLOYEE_UPDATE',
  EMPLOYEE_DELETE: 'hrAudit.action.EMPLOYEE_DELETE',
  PROFILE_UPDATE: 'hrAudit.action.PROFILE_UPDATE',
  SENSITIVE_VIEW: 'hrAudit.action.SENSITIVE_VIEW',
  ACCOUNT_DISABLE: 'hrAudit.action.ACCOUNT_DISABLE',
  ACCOUNT_ENABLE: 'hrAudit.action.ACCOUNT_ENABLE',
  PASSWORD_RESET: 'hrAudit.action.PASSWORD_RESET',
  ROLE_BIND: 'hrAudit.action.ROLE_BIND',
  POSITION_WRITE: 'hrAudit.action.POSITION_WRITE',
  PERIOD_REGISTER: 'hrAudit.action.PERIOD_REGISTER',
  CONTRACT_WRITE: 'hrAudit.action.CONTRACT_WRITE',
  SALARY_WRITE: 'hrAudit.action.SALARY_WRITE',
  LIFECYCLE_EXECUTE: 'hrAudit.action.LIFECYCLE_EXECUTE',
  ROSTER_EXPORT: 'hrAudit.action.ROSTER_EXPORT',
  UNKNOWN: 'hrAudit.action.UNKNOWN',
}
