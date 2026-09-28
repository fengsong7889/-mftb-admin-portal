import { APPEAL_STATUS, PERF_LOG_ACTION } from '../../api/hrPerfReport'

/**
 * 績效台账域（M2）的展示口径：留痕动作、申诉状态、路由与菜单 key。
 * 未知 code 一律回退原值——申诉状态进了字典表后 HR 可自定义，页面不能因为新状态而空白。
 */

export const LOG_ACTION_LABEL_KEY: Record<string, string> = {
  [PERF_LOG_ACTION.CALIBRATE]: 'hrPerfReport.actionCalibrate',
  [PERF_LOG_ACTION.APPEAL_REVISE]: 'hrPerfReport.actionAppealRevise',
  [PERF_LOG_ACTION.DIST_WAIVER]: 'hrPerfReport.actionWaiver',
  [PERF_LOG_ACTION.REASSIGN]: 'hrPerfReport.actionReassign',
}
export const LOG_ACTION_TAG_COLOR: Record<string, string> = {
  [PERF_LOG_ACTION.CALIBRATE]: 'purple',
  [PERF_LOG_ACTION.APPEAL_REVISE]: 'geekblue',
  [PERF_LOG_ACTION.DIST_WAIVER]: 'orange',
  [PERF_LOG_ACTION.REASSIGN]: 'cyan',
}
export const LOG_ACTION_ORDER: string[] = [PERF_LOG_ACTION.CALIBRATE,
  PERF_LOG_ACTION.APPEAL_REVISE, PERF_LOG_ACTION.DIST_WAIVER, PERF_LOG_ACTION.REASSIGN]

export const APPEAL_STATUS_LABEL_KEY: Record<string, string> = {
  [APPEAL_STATUS.PENDING]: 'hrPerfReport.appealPending',
  [APPEAL_STATUS.PROCESSING]: 'hrPerfReport.appealProcessing',
  [APPEAL_STATUS.RESOLVED]: 'hrPerfReport.appealResolved',
  [APPEAL_STATUS.REJECTED]: 'hrPerfReport.appealRejected',
}
export const APPEAL_STATUS_TAG_COLOR: Record<string, string> = {
  [APPEAL_STATUS.PENDING]: 'default',
  [APPEAL_STATUS.PROCESSING]: 'processing',
  [APPEAL_STATUS.RESOLVED]: 'success',
  [APPEAL_STATUS.REJECTED]: 'error',
}
/** 申诉台账页签：待受理放最前，是 HR 的默认工作面 */
export const APPEAL_STATUS_TABS: string[] = ['all', APPEAL_STATUS.PENDING, APPEAL_STATUS.PROCESSING,
  APPEAL_STATUS.RESOLVED, APPEAL_STATUS.REJECTED]

/* ---------- 路由与菜单 key（登记点见 types.ts / menuDataSource.ts） ---------- */

export const PERF_LEDGER_PATH = '/hr-perf-ledger'
export const PERF_AUDIT_PATH = '/hr-perf-audit'
export const PERF_APPEAL_PATH = '/hr-perf-appeal'

export const PERF_REPORT_MENU = {
  DOMAIN: 'perf-report-center',
  LEDGER: 'hr-perf-ledger',
  AUDIT: 'hr-perf-audit',
  APPEAL: 'hr-perf-appeal',
} as const

/** 从台账跳到某计划的留痕/申诉，避免 HR 再手动筛一次 */
export const auditPathOfPlan = (planId: number) => `${PERF_AUDIT_PATH}?planId=${planId}`
export const appealPathOfPlan = (planId: number) => `${PERF_APPEAL_PATH}?planId=${planId}`
