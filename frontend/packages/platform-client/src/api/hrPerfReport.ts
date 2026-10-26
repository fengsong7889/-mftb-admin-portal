/**
 * 績效台账 API（对应后端 HrPerfReportController /hr/perf 与自助申诉端点）
 * <p>
 * 台账统计一律只含「已确认」结果；留痕只增不改；申诉在员工侧只能提本人、
 * 在 HR 侧才可见全量，数据范围由服务端收敛，这里不传任何员工标识参数。
 */
import request from './request'
import type { PageResult } from './employee'
import type { PerfAssessment } from './hrPerformance'

/** 留痕动作（与后端 HrPerfConstants.LOG_* 一致） */
export const PERF_LOG_ACTION = {
  CALIBRATE: 'CALIBRATE',
  APPEAL_REVISE: 'APPEAL_REVISE',
  DIST_WAIVER: 'DIST_WAIVER',
  REASSIGN: 'REASSIGN',
} as const
export type PerfLogAction = (typeof PERF_LOG_ACTION)[keyof typeof PERF_LOG_ACTION]

/** 申诉状态机：待受理 → 处理中 → 已办结/已驳回（后两态为终态） */
export const APPEAL_STATUS = {
  PENDING: 'pending', PROCESSING: 'processing', RESOLVED: 'resolved', REJECTED: 'rejected',
} as const
export type AppealStatus = (typeof APPEAL_STATUS)[keyof typeof APPEAL_STATUS]

/** 申诉可被受理/修订的状态（终态不得再动，否则结论会被覆写） */
export const APPEAL_OPEN: string[] = [APPEAL_STATUS.PENDING, APPEAL_STATUS.PROCESSING]

export interface PerfGradeCount {
  grade: string
  count: number
  /** 实际占比（百分数，两位） */
  actualRatio: number
  /** 模板建议占比；跨计划口径下为 null（平均占比没有意义） */
  suggestRatio?: number | null
  /** 按建议占比算出的人数上限；无可比对口径时为 null */
  allowedCount?: number | null
  /** 超出上限的人数（0 表示未超） */
  overCount?: number | null
  /** 超编描述；为空表示未超限 */
  gapNote?: string | null
}

export interface PerfDeptCount {
  deptName: string
  count: number
  avgScore?: number | null
  topGrade?: string | null
}

export interface PerfTrendPoint {
  planId: number
  planReqNo?: string | null
  planName?: string | null
  cycleName?: string | null
  count: number
  avgScore?: number | null
  grades?: PerfGradeCount[]
}

export interface PerfReport {
  headcount: number
  planCount: number
  avgScore?: number | null
  maxScore?: number | null
  minScore?: number | null
  hasSuggestedRatio?: boolean | null
  gradeDistribution: PerfGradeCount[]
  deptDistribution: PerfDeptCount[]
  trend: PerfTrendPoint[]
}

export interface PerfCalibrationLog {
  id: number
  assessmentId?: number | null
  planId?: number | null
  planName?: string | null
  userId?: number | null
  empNo?: string | null
  empName?: string | null
  deptName?: string | null
  action: PerfLogAction | string
  beforeScore?: number | null
  beforeGrade?: string | null
  afterScore?: number | null
  afterGrade?: string | null
  reason?: string | null
  refAppealId?: number | null
  operatorUserId?: number | null
  operatorName?: string | null
  createdAt?: string
}

export interface PerfAppeal {
  id: number
  reqNo?: string
  assessmentId: number
  planId?: number | null
  userId: number
  empNo?: string | null
  empName?: string | null
  deptName?: string | null
  planName?: string | null
  reason: string
  expectation?: string | null
  status: AppealStatus | string
  handlerUserId?: number | null
  handlerName?: string | null
  handledAt?: string | null
  conclusion?: string | null
  createdAt?: string
  /** 关联考核单当前结果（服务端补填，便于受理时当场对照） */
  finalScore?: number | null
  finalGrade?: string | null
  /** 该申诉是否已触发过结果修订 */
  revised?: boolean | null
}

export interface PerfReportFilter {
  cycleId?: number
  planId?: number
}

/* ---------- 结果台账 ---------- */
export const fetchPerfReport = (params: PerfReportFilter) =>
  request.get<unknown, PerfReport>('/hr/perf/report', { params })
/** 查询：GET /hr/perf/report/rows */
export const fetchPerfReportRows = (params: PerfReportFilter & {
  page: number; size: number; deptName?: string; grade?: string; keyword?: string
}) => request.get<unknown, PageResult<PerfAssessment>>('/hr/perf/report/rows', { params })
/** 查询：GET /hr/perf/report/count */
export const fetchPerfReportCount = (params: PerfReportFilter) =>
  request.get<unknown, number>('/hr/perf/report/count', { params })
/** 查询：GET /hr/perf/report/departments */
export const fetchPerfReportDepartments = (params: PerfReportFilter) =>
  request.get<unknown, string[]>('/hr/perf/report/departments', { params })

/* ---------- 强制分布与留痕 ---------- */
export const fetchDistributionGap = (planId: number) =>
  request.get<unknown, PerfGradeCount[]>(`/hr/perf/plans/${planId}/distribution-gap`)
/** 查询：GET /hr/perf/calibration-logs */
export const fetchCalibrationLogs = (params: {
  page: number; size: number; planId?: number; assessmentId?: number; action?: string; keyword?: string
}) => request.get<unknown, PageResult<PerfCalibrationLog>>('/hr/perf/calibration-logs', { params })
/** 查询：GET /hr/perf/assessments/{id}/calibration-logs */
export const fetchAssessmentCalibrationLogs = (assessmentId: number) =>
  request.get<unknown, PerfCalibrationLog[]>(`/hr/perf/assessments/${assessmentId}/calibration-logs`)

/* ---------- 申诉 ---------- */
export const fetchPerfAppeals = (params: {
  page: number; size: number; planId?: number; status?: string; keyword?: string
}) => request.get<unknown, PageResult<PerfAppeal>>('/hr/perf/appeals', { params })
/** 查询：GET /hr/perf/appeals/{id} */
export const fetchPerfAppeal = (id: number) =>
  request.get<unknown, PerfAppeal>(`/hr/perf/appeals/${id}`)
/** 处理：POST /hr/perf/appeals/{id}/handle */
export const handlePerfAppeal = (id: number, status: string, conclusion?: string) =>
  request.post<unknown, PerfAppeal>(`/hr/perf/appeals/${id}/handle`, null, {
    params: { status, conclusion: conclusion || undefined },
  })
export const revisePerfAppeal = (id: number, params: { score?: number; grade?: string; reason: string }) =>
  request.post<unknown, PerfAppeal>(`/hr/perf/appeals/${id}/revise`, null, { params })
/** 员工侧：我的申诉（后端路径 /hr/perf/my/appeals/list，避开与 /my/{id} 详情同层级） */
export const fetchMyAppeals = (params: { page: number; size: number; status?: string }) =>
  request.get<unknown, PageResult<PerfAppeal>>('/hr/perf/my/appeals/list', { params })
/** 员工侧：对本人已确认结果提申诉 */
export const submitMyAppeal = (assessmentId: number, reason: string, expectation?: string) =>
  request.post<unknown, PerfAppeal>(`/hr/perf/my/${assessmentId}/appeal`, { reason, expectation })
