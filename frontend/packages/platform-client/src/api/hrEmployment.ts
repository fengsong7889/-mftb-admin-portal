import request from './request'

/**
 * 雇佣期间与雇佣数据核对（方案 §7.1 双轨第一阶段）。
 *
 * 与员工列表接口是分开的：列表仍以 sys_user 投影为准，这两组端点读的是新增的雇佣期间层，
 * 界面上也必须分开呈现 —— 混在一列里会让人以为「已登记的雇佣期间」就是系统认定的当前事实。
 */

export type EmploymentPeriodStatus = 'ACTIVE' | 'ENDED'

/** 入职日来源：决定这一行的「入职日期」能不能当事实用 */
export type StartDateSource = 'POSITION_RECORD' | 'MANUAL' | 'UNVERIFIED'

export interface EmploymentPeriodItem {
  id: number
  userId: number
  periodSeq: number
  employerCompany?: string | null
  workLocation?: string | null
  employeeCategory?: string | null
  startDate?: string | null
  startDateSource: StartDateSource
  probationEndDate?: string | null
  regularDate?: string | null
  endDate?: string | null
  endReason?: string | null
  status: EmploymentPeriodStatus
  sourceReqNo?: string | null
}

/** 差异类别码 —— 与后端 HrProfileDiff 逐值对齐（界面文案走 i18n hrEmployment.diff.*） */
export const DIFF_CODE = {
  NO_POSITION_RECORD: 'NO_POSITION_RECORD',
  START_ANCHOR_MISSING: 'START_ANCHOR_MISSING',
  DEPT_MISMATCH: 'DEPT_MISMATCH',
  POSITION_MISMATCH: 'POSITION_MISMATCH',
  RESIGNED_ACCOUNT_ACTIVE: 'RESIGNED_ACCOUNT_ACTIVE',
  ACTIVE_EMPLOYMENT_ACCOUNT_DISABLED: 'ACTIVE_EMPLOYMENT_ACCOUNT_DISABLED',
  PERIOD_NOT_REGISTERED: 'PERIOD_NOT_REGISTERED',
  PERIOD_COUNT_MISMATCH: 'PERIOD_COUNT_MISMATCH',
  PERIOD_END_DATE_UNKNOWN: 'PERIOD_END_DATE_UNKNOWN',
  FUTURE_ASSIGNMENT: 'FUTURE_ASSIGNMENT',
} as const

export type DiffCode = (typeof DIFF_CODE)[keyof typeof DIFF_CODE]

export type DiffSeverity = 'INFO' | 'WARN' | 'ERROR'

export interface ProfileDiffItem {
  userId: number
  empId?: string | null
  name?: string | null
  accountStatus?: number | null
  employmentStatus?: string | null
  snapshotDept?: string | null
  snapshotPosition?: string | null
  asOfDept?: string | null
  asOfPosition?: string | null
  asOfCompany?: string | null
  employmentStart?: string | null
  startDateSource?: StartDateSource | null
  registeredPeriods: number
  derivedPeriods: number
  futureAssignments: number
  codes: DiffCode[]
  severity: DiffSeverity
}

export interface ProfileDiffReport {
  asOf: string
  generatedAt?: string
  scannedUsers: number
  diffUsers: number
  countsByCategory: Partial<Record<DiffCode, number>>
  items: ProfileDiffItem[]
  truncated: boolean
  registerableUsers: number
}

export interface EmploymentPeriodSyncResult {
  requested: number
  updatedUsers: number
  periods: number
  skippedUsers: number
}

/** 查询雇佣数据差异报告（服务端按当前登录人的组织数据范围收敛） */
export function fetchProfileDiffReport(asOf?: string) {
  return request.get<unknown, ProfileDiffReport>('/hr/employment/diff-report', {
    params: asOf ? { asOf } : undefined,
  })
}

/**
 * 按任职事实登记/修复雇佣期间。
 * 必须逐人点名（上限 200），后端会再校验一次归属与入职锚点。
 */
export function syncEmploymentPeriods(userIds: number[]) {
  return request.post<unknown, EmploymentPeriodSyncResult>('/hr/employment/periods/sync', { userIds })
}

/** 某位员工的雇佣期间列表 */
export function fetchEmploymentPeriods(userId: number) {
  return request.get<unknown, EmploymentPeriodItem[]>(`/employees/${userId}/employment-periods`)
}
