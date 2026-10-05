/**
 * 績效考核 API（对应后端 HrPerfController /hr/perf 与 HrPerfSelfController /hr/perf/my）
 * <p>
 * 两条入口权限与可见字段不同：员工自助一律走 /my 端点（服务端按登录人收敛并在
 * 结果确认前物理剔除上级评分/校准/最终字段），自评提交仍复用 assessments/{id}/score。
 */
import request from './request'
import type { PageResult } from './employee'

/** 周期类型（与后端 HrPerfConstants 一致） */
export const CYCLE_TYPE = { QUARTER: 'QUARTER', YEAR: 'YEAR' } as const
export type CycleType = (typeof CYCLE_TYPE)[keyof typeof CYCLE_TYPE]

/** 周期状态：草稿 → 已发布（可发起计划）→ 已关闭 */
export const CYCLE_STATUS = { DRAFT: 'draft', PUBLISHED: 'published', CLOSED: 'closed' } as const
export type CycleStatus = (typeof CYCLE_STATUS)[keyof typeof CYCLE_STATUS]

/** 计划状态 */
export const PLAN_STATUS = {
  DRAFT: 'draft', RUNNING: 'running', CONFIRM_PENDING: 'confirm_pending', CONFIRMED: 'confirmed',
} as const
export type PlanStatus = (typeof PLAN_STATUS)[keyof typeof PLAN_STATUS]

/** 考核单状态机（与后端一致，前端不得自行跃迁） */
export const ASSESS_STATUS = {
  SELF_PENDING: 'self_pending',
  SUPERVISOR_PENDING: 'supervisor_pending',
  CALIBRATION_PENDING: 'calibration_pending',
  CONFIRM_PENDING: 'confirm_pending',
  CONFIRMED: 'confirmed',
  VOIDED: 'voided',
} as const
export type AssessStatus = (typeof ASSESS_STATUS)[keyof typeof ASSESS_STATUS]

/** 整批确认流程编码（审批详情页据此识别单据域） */
export const PERF_PROCESS_CODE = 'hr_perf_confirm'

/** 指标打分区间（与后端 INDICATOR_SCORE_MAX 一致） */
export const INDICATOR_SCORE_MAX = 100

export interface PerfCycle {
  id?: number
  reqNo?: string
  code: string
  name: string
  cycleType: CycleType | string
  periodStart: string
  periodEnd: string
  status?: CycleStatus | string
  remark?: string | null
  planCount?: number
  createdBy?: string
  updatedBy?: string
  createdAt?: string
  updatedAt?: string
}

export interface PerfGradeRule {
  code: string
  minScore: number
  /** 建议占比（百分数，可空表示不做强制分布） */
  ratio?: number | null
}

export interface PerfIndicator {
  id?: number
  name: string
  indicatorType?: string | null
  weight: number
  targetDesc?: string | null
  scoringDesc?: string | null
  sortOrder?: number
}

export interface PerfTemplate {
  id?: number
  name: string
  applyCycleType?: string | null
  /** 后端以 JSON 字符串存储，前端用 parseGradeScheme 解析 */
  gradeScheme?: string | null
  weightSum: number
  status?: number
  remark?: string | null
  indicators?: PerfIndicator[]
}

export interface PerfTemplatePayload {
  name: string
  applyCycleType?: string | null
  weightSum: number
  status?: number
  remark?: string | null
  grades: PerfGradeRule[]
  indicators: PerfIndicator[]
}

export interface PerfPlan {
  id?: number
  reqNo?: string
  cycleId: number
  cycleName?: string | null
  templateId: number
  templateName?: string | null
  name: string
  scopeJson?: string | null
  selfStart: string
  selfEnd: string
  supStart: string
  supEnd: string
  calibEnd: string
  status?: PlanStatus | string
  flowNo?: string | null
  summary?: string | null
  total?: number
  selfPending?: number
  supervisorPending?: number
  calibrationPending?: number
  confirmPending?: number
  confirmed?: number
  /** 未指派评估人数：发起后必须让 HR 看到这个缺口 */
  unassigned?: number
  updatedBy?: string | null
  updatedAt?: string | null
}

export interface PerfPlanLaunchPayload {
  cycleId: number
  templateId: number
  name: string
  deptIds: number[]
  positionLevels?: string[]
  selfStart: string
  selfEnd: string
  supStart: string
  supEnd: string
  calibEnd: string
  summary?: string
}

/** 发起前范围预览：命中人数 + 无评估人清单（含原因） */
export interface PerfLaunchPreview {
  total: number
  unassigned: number
  unassignedList: Array<{ userId: number; empName: string; deptName: string; reason: string }>
}

export interface PerfScoreItem {
  id: number
  indicatorId?: number
  indicatorName: string
  weight: number
  targetValue?: string | null
  selfScore?: number | null
  supervisorScore?: number | null
  finalScore?: number | null
  remark?: string | null
}

export interface PerfAssessment {
  id: number
  reqNo?: string
  planId: number
  planName?: string | null
  userId: number
  empNo?: string | null
  empName?: string | null
  deptName?: string | null
  sequenceType?: string | null
  positionName?: string | null
  positionLevel?: string | null
  evaluatorUserId?: number | null
  evaluatorName?: string | null
  status: AssessStatus | string
  selfScore?: number | null
  selfComment?: string | null
  selfAt?: string | null
  /** 以下敏感字段在未确认前对本人不下发（服务端裁剪，不是前端隐藏） */
  supervisorScore?: number | null
  supervisorComment?: string | null
  supervisorAt?: string | null
  calibratedScore?: number | null
  calibratedGrade?: string | null
  calibratedBy?: string | null
  calibratedReason?: string | null
  finalScore?: number | null
  finalGrade?: string | null
  confirmedAt?: string | null
  appliedNote?: string | null
  remark?: string | null
  createdAt?: string
  updatedAt?: string
  items?: PerfScoreItem[]
}

export interface PerfScorePayload {
  comment?: string
  /** true=提交进入下一阶段，false=仅暂存明细 */
  submit: boolean
  items: Array<{ itemId: number; score?: number | null; targetValue?: string; remark?: string }>
}

export interface PerfScopeOptions {
  departments: Array<{ id: number; name: string; parentId: number | null; leader: string }>
  positionLevels: string[]
}

export interface PerfEvaluatorOption {
  userId: number
  empId: string
  name: string
  department?: string | null
}

/* ---------- 周期 ---------- */
export const fetchPerfCycles = (params: { page: number; size: number; status?: string; keyword?: string }) =>
  request.get<unknown, PageResult<PerfCycle>>('/hr/perf/cycles', { params })
/** 新增：POST /hr/perf/cycles */
export const createPerfCycle = (data: PerfCycle) =>
  request.post<unknown, PerfCycle>('/hr/perf/cycles', data)
/** 修改：PUT /hr/perf/cycles/{id} */
export const updatePerfCycle = (id: number, data: PerfCycle) =>
  request.put<unknown, PerfCycle>(`/hr/perf/cycles/${id}`, data)
/** 调用：POST /hr/perf/cycles/{id}/status */
export const changePerfCycleStatus = (id: number, status: string) =>
  request.post<unknown, void>(`/hr/perf/cycles/${id}/status`, null, { params: { status } })

/* ---------- 模板 ---------- */
export const fetchPerfTemplates = (params: { page: number; size: number; keyword?: string }) =>
  request.get<unknown, PageResult<PerfTemplate>>('/hr/perf/templates', { params })
/** 查询：GET /hr/perf/templates/{id} */
export const fetchPerfTemplate = (id: number) =>
  request.get<unknown, PerfTemplate>(`/hr/perf/templates/${id}`)
/** 新增：POST /hr/perf/templates */
export const createPerfTemplate = (data: PerfTemplatePayload) =>
  request.post<unknown, PerfTemplate>('/hr/perf/templates', data)
/** 修改：PUT /hr/perf/templates/{id} */
export const updatePerfTemplate = (id: number, data: PerfTemplatePayload) =>
  request.put<unknown, PerfTemplate>(`/hr/perf/templates/${id}`, data)

/* ---------- 计划 ---------- */
export const fetchPerfScopeOptions = () =>
  request.get<unknown, PerfScopeOptions>('/hr/perf/scope-options')
/** 预览：POST /hr/perf/plans/preview */
export const previewPerfLaunch = (data: PerfPlanLaunchPayload) =>
  request.post<unknown, PerfLaunchPreview>('/hr/perf/plans/preview', data)
/** 发起：POST /hr/perf/plans */
export const launchPerfPlan = (data: PerfPlanLaunchPayload) =>
  request.post<unknown, PerfPlan>('/hr/perf/plans', data)
export const fetchPerfPlans = (params: { page: number; size: number; cycleId?: number; status?: string }) =>
  request.get<unknown, PageResult<PerfPlan>>('/hr/perf/plans', { params })
/** 查询：GET /hr/perf/plans/{id} */
export const fetchPerfPlan = (id: number) =>
  request.get<unknown, PerfPlan>(`/hr/perf/plans/${id}`)
/** 计划内考核单清单（台账视图） */
export const fetchPlanAssessments = (planId: number, params: { page: number; size: number; status?: string; keyword?: string }) =>
  request.get<unknown, PageResult<PerfAssessment>>(`/hr/perf/plans/${planId}/assessments`, { params })
/**
 * 整批提交 HR 审批。等级分布超建议占比时：不勾例外放行会被服务端拒，
 * 勾选则必须带理由（例外本身进改判留痕）。
 */
export const submitPerfConfirm = (planId: number, params?: { waiveDistribution?: boolean; waiveReason?: string }) =>
  request.post<unknown, PerfPlan>(`/hr/perf/plans/${planId}/submit-confirm`, null, { params })
/** 计划所用模板的等级清单（校准改判只能在这些等级里选） */
export const fetchPlanGrades = (planId: number) =>
  request.get<unknown, Array<{ code: string; minScore: number; ratio?: number | null }>>(
    `/hr/perf/plans/${planId}/grades`,
  )

/* ---------- 评分工作台与考核单 ---------- */
export const fetchMyReviews = (params: { page: number; size: number; status?: string; keyword?: string }) =>
  request.get<unknown, PageResult<PerfAssessment>>('/hr/perf/reviews', { params })
/** 查询：GET /hr/perf/assessments/{id} */
export const fetchPerfAssessment = (id: number) =>
  request.get<unknown, PerfAssessment>(`/hr/perf/assessments/${id}`)
/** 提交：POST /hr/perf/assessments/{id}/score */
export const submitPerfScore = (id: number, data: PerfScorePayload) =>
  request.post<unknown, PerfAssessment>(`/hr/perf/assessments/${id}/score`, data)
/** 改派：POST /hr/perf/assessments/{id}/evaluator */
export const reassignEvaluator = (id: number, evaluatorUserId: number) =>
  request.post<unknown, void>(`/hr/perf/assessments/${id}/evaluator`, null, { params: { evaluatorUserId } })
/** 查询：GET /hr/perf/evaluator-options */
export const fetchEvaluatorOptions = (keyword?: string) =>
  request.get<unknown, PerfEvaluatorOption[]>('/hr/perf/evaluator-options', {
    params: { keyword: keyword || undefined },
  })

/* ---------- 校准与整批确认 ---------- */
export const fetchPerfCalibration = (params: {
  page: number; size: number; planId?: number; status?: string; keyword?: string
}) => request.get<unknown, PageResult<PerfAssessment>>('/hr/perf/calibration', { params })
export const calibratePerfAssessment = (id: number, params: { score?: number; grade?: string; reason: string }) =>
  request.post<unknown, PerfAssessment>(`/hr/perf/assessments/${id}/calibrate`, null, { params })

/* ---------- 员工自助 ---------- */
export const fetchMyAssessments = (params: { page: number; size: number; status?: string }) =>
  request.get<unknown, PageResult<PerfAssessment>>('/hr/perf/my', { params })
/** 查询：GET /hr/perf/my/{id} */
export const fetchMyAssessment = (id: number) =>
  request.get<unknown, PerfAssessment>(`/hr/perf/my/${id}`)

/** 模板等级方案 JSON → 结构化（脏数据不炸页面，解析失败按空方案处理） */
export function parseGradeScheme(json?: string | null): PerfGradeRule[] {
  if (!json) return []
  try {
    const raw = JSON.parse(json)
    return Array.isArray(raw) ? (raw as PerfGradeRule[]) : []
  } catch {
    return []
  }
}

/** 等级按分值下限降序（S→D），与后端存储口径一致 */
export function sortGrades(grades: PerfGradeRule[]): PerfGradeRule[] {
  return [...grades].sort((a, b) => (b.minScore ?? 0) - (a.minScore ?? 0))
}

/** 按模板等级方案映射得分对应等级；无匹配返回空（与后端 mapGrade 同口径，仅用于前端预览） */
export function matchGrade(grades: PerfGradeRule[], score?: number | null): string | undefined {
  if (score == null) return undefined
  const hit = sortGrades(grades).find(g => score >= (g.minScore ?? 0))
  return hit?.code
}

/** 加权总分预览（真正口径在服务端，此处只用于录入即时反馈） */
export function previewWeighted(items: Array<{ weight: number; score?: number | null }>): number | null {
  let weightSum = 0
  let acc = 0
  items.forEach(i => {
    if (i.score == null) return
    const w = Number(i.weight) || 0
    weightSum += w
    acc += (Number(i.score) || 0) * w
  })
  if (weightSum <= 0) return null
  return Math.round((acc / weightSum) * 100) / 100
}
