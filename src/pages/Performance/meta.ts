import {
  ASSESS_STATUS, CYCLE_STATUS, CYCLE_TYPE, PLAN_STATUS,
  type AssessStatus, type CycleStatus, type PerfPlan, type PlanStatus,
} from '../../api/hrPerformance'

/**
 * 績效域展示口径：状态/等级的文案 key 与颜色，全部对齐后端常量。
 * 未知 code 一律回退显示原值（字典可被 HR 在字典维护页扩展），避免新增等级时页面空白。
 */

export const CYCLE_TYPE_LABEL_KEY: Record<string, string> = {
  [CYCLE_TYPE.QUARTER]: 'hrPerf.cycleTypeQuarter',
  [CYCLE_TYPE.YEAR]: 'hrPerf.cycleTypeYear',
}
export const CYCLE_TYPE_ORDER: string[] = [CYCLE_TYPE.QUARTER, CYCLE_TYPE.YEAR]

export const CYCLE_STATUS_LABEL_KEY: Record<CycleStatus | string, string> = {
  [CYCLE_STATUS.DRAFT]: 'hrPerf.cycleStatusDraft',
  [CYCLE_STATUS.PUBLISHED]: 'hrPerf.cycleStatusPublished',
  [CYCLE_STATUS.CLOSED]: 'hrPerf.cycleStatusClosed',
}
export const CYCLE_STATUS_TAG_COLOR: Record<string, string> = {
  [CYCLE_STATUS.DRAFT]: 'default', [CYCLE_STATUS.PUBLISHED]: 'success', [CYCLE_STATUS.CLOSED]: 'default',
}
export const CYCLE_STATUS_TABS: string[] = ['all', CYCLE_STATUS.DRAFT, CYCLE_STATUS.PUBLISHED, CYCLE_STATUS.CLOSED]

export const PLAN_STATUS_LABEL_KEY: Record<PlanStatus | string, string> = {
  [PLAN_STATUS.DRAFT]: 'hrPerf.planStatusDraft',
  [PLAN_STATUS.RUNNING]: 'hrPerf.planStatusRunning',
  [PLAN_STATUS.CONFIRM_PENDING]: 'hrPerf.planStatusConfirmPending',
  [PLAN_STATUS.CONFIRMED]: 'hrPerf.planStatusConfirmed',
}
export const PLAN_STATUS_TAG_COLOR: Record<string, string> = {
  [PLAN_STATUS.DRAFT]: 'default', [PLAN_STATUS.RUNNING]: 'processing',
  [PLAN_STATUS.CONFIRM_PENDING]: 'warning', [PLAN_STATUS.CONFIRMED]: 'success',
}
export const PLAN_STATUS_TABS: string[] = ['all', PLAN_STATUS.RUNNING, PLAN_STATUS.CONFIRM_PENDING,
  PLAN_STATUS.CONFIRMED]

/**
 * 考核单状态页签：工作台/校准台/自助页共用同一状态机，但可操作范围由服务端判定。
 */
export const ASSESS_STATUS_LABEL_KEY: Record<AssessStatus | string, string> = {
  [ASSESS_STATUS.SELF_PENDING]: 'hrPerf.statusSelfPending',
  [ASSESS_STATUS.SUPERVISOR_PENDING]: 'hrPerf.statusSupervisorPending',
  [ASSESS_STATUS.CALIBRATION_PENDING]: 'hrPerf.statusCalibrationPending',
  [ASSESS_STATUS.CONFIRM_PENDING]: 'hrPerf.statusConfirmPending',
  [ASSESS_STATUS.CONFIRMED]: 'hrPerf.statusConfirmed',
  [ASSESS_STATUS.VOIDED]: 'hrPerf.statusVoided',
}
export const ASSESS_STATUS_TAG_COLOR: Record<string, string> = {
  [ASSESS_STATUS.SELF_PENDING]: 'default',
  [ASSESS_STATUS.SUPERVISOR_PENDING]: 'processing',
  [ASSESS_STATUS.CALIBRATION_PENDING]: 'warning',
  [ASSESS_STATUS.CONFIRM_PENDING]: 'gold',
  [ASSESS_STATUS.CONFIRMED]: 'success',
  [ASSESS_STATUS.VOIDED]: 'error',
}
/** 评分工作台：默认只看待上级评 */
export const REVIEW_STATUS_TABS: string[] = ['all', ASSESS_STATUS.SELF_PENDING,
  ASSESS_STATUS.SUPERVISOR_PENDING, ASSESS_STATUS.CALIBRATION_PENDING, ASSESS_STATUS.CONFIRMED]
/** 校准台：待校准/待确认/已确认 */
export const CALIBRATION_STATUS_TABS: string[] = ['all', ASSESS_STATUS.CALIBRATION_PENDING,
  ASSESS_STATUS.CONFIRM_PENDING, ASSESS_STATUS.CONFIRMED]
/** 员工自助：进行中/已确认 */
export const SELF_STATUS_TABS: string[] = ['all', ASSESS_STATUS.SELF_PENDING,
  ASSESS_STATUS.SUPERVISOR_PENDING, ASSESS_STATUS.CALIBRATION_PENDING, ASSESS_STATUS.CONFIRM_PENDING,
  ASSESS_STATUS.CONFIRMED]

/** 等级（字典 PERF_GRADE 种子五档，HR 可扩展；未知 code 回退原值） */
export const GRADE_LABEL_KEY: Record<string, string> = {
  S: 'hrPerf.gradeS', A: 'hrPerf.gradeA', B: 'hrPerf.gradeB', C: 'hrPerf.gradeC', D: 'hrPerf.gradeD',
}
export const GRADE_TAG_COLOR: Record<string, string> = {
  S: 'magenta', A: 'success', B: 'processing', C: 'warning', D: 'error',
}
export const GRADE_ORDER: string[] = ['S', 'A', 'B', 'C', 'D']

/** 指标类型（字典 PERF_INDICATOR_TYPE） */
export const INDICATOR_TYPE_LABEL_KEY: Record<string, string> = {
  RESULT: 'hrPerf.indicatorTypeResult',
  COMPETENCY: 'hrPerf.indicatorTypeCompetency',
  ATTITUDE: 'hrPerf.indicatorTypeAttitude',
  COMPLIANCE: 'hrPerf.indicatorTypeCompliance',
}
export const INDICATOR_TYPE_ORDER: string[] = ['RESULT', 'COMPETENCY', 'ATTITUDE', 'COMPLIANCE']

/** 计划进度看板的阶段列（顺序即流程顺序，field 对应 PerfPlan 上的人数统计字段） */
export const PLAN_STAGES: Array<{ field: keyof PerfPlan; labelKey: string }> = [
  { field: 'selfPending', labelKey: ASSESS_STATUS_LABEL_KEY[ASSESS_STATUS.SELF_PENDING] },
  { field: 'supervisorPending', labelKey: ASSESS_STATUS_LABEL_KEY[ASSESS_STATUS.SUPERVISOR_PENDING] },
  { field: 'calibrationPending', labelKey: ASSESS_STATUS_LABEL_KEY[ASSESS_STATUS.CALIBRATION_PENDING] },
  { field: 'confirmPending', labelKey: ASSESS_STATUS_LABEL_KEY[ASSESS_STATUS.CONFIRM_PENDING] },
  { field: 'confirmed', labelKey: ASSESS_STATUS_LABEL_KEY[ASSESS_STATUS.CONFIRMED] },
]

/* ---------- 路由（菜单 key 与授权在 types.ts / menuDataSource.ts 登记） ---------- */

export const PERF_CYCLE_PATH = '/hr-perf-cycle'
export const PERF_PLAN_PATH = '/hr-perf-plan'
export const PERF_PLAN_FORM_PATH = '/hr-perf-plan-form'
export const PERF_PLAN_DETAIL_PATH = '/hr-perf-plan-detail'
export const PERF_REVIEW_PATH = '/hr-perf-review'
export const PERF_CALIBRATION_PATH = '/hr-perf-calibration'
export const PERF_TEMPLATE_PATH = '/hr-perf-template'
export const PERF_SELF_PATH = '/ess-performance'

/** 菜单 key（与后端 HrPerfConstants 一致） */
export const PERF_MENU = {
  DOMAIN: 'perf-center',
  ADMIN: 'hr-perf-admin',
  REVIEW: 'hr-perf-review',
  CALIBRATION: 'hr-perf-calibration',
  SELF: 'ess-performance',
} as const

export const planFormPath = (id?: number) => `${PERF_PLAN_FORM_PATH}${id != null ? `?id=${id}` : ''}`
export const planDetailPath = (id: number) => `${PERF_PLAN_DETAIL_PATH}?id=${id}`
/** 校准台带计划过滤进入（发起后从计划详情直接跳到待校准清单） */
export const calibrationPath = (planId?: number) =>
  `${PERF_CALIBRATION_PATH}${planId != null ? `?planId=${planId}` : ''}`
