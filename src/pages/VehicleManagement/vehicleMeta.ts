/**
 * 用车管理 — 枚举文案与颜色映射（车辆档案 / 我的用车 / 用车办理 / 用车台账 共用）
 *
 * 目的：同一状态在四个页面只有一份文案口径，避免列表显示「待出车」而详情显示「已安排」。
 * antd Tag 颜色沿用项目既有语义：processing=进行中 success=完成 default=终态
 * warning=需关注 error=异常/拒绝。
 */
import {
  APPROVAL_OUTCOME, DRIVING_MODE, QUALIFICATION_RESULT, TRIP_FLAG, TRIP_STATUS,
  USE_SOURCE, USE_STATUS, VEHICLE_STATUS,
} from './vehicleTypes'

/** 数据来源 */
export const USE_SOURCE_LABEL: Record<string, string> = {
  [USE_SOURCE.OA_APPROVAL]: '審批用車',
  [USE_SOURCE.DIRECT_REGISTER]: '授權直接登記',
  [USE_SOURCE.BACKFILL]: '事後補錄',
}

export const USE_SOURCE_COLOR: Record<string, string> = {
  [USE_SOURCE.OA_APPROVAL]: 'blue',
  [USE_SOURCE.DIRECT_REGISTER]: 'purple',
  [USE_SOURCE.BACKFILL]: 'orange',
}

/** 审批结论 */
export const APPROVAL_LABEL: Record<string, string> = {
  [APPROVAL_OUTCOME.NOT_SUBMITTED]: '未提交',
  [APPROVAL_OUTCOME.APPROVING]: '審批中',
  [APPROVAL_OUTCOME.APPROVED]: '審批通過',
  [APPROVAL_OUTCOME.REJECTED]: '已駁回',
  [APPROVAL_OUTCOME.CANCELLED]: '已撤銷',
  [APPROVAL_OUTCOME.DIRECT]: '授權直接登記',
  [APPROVAL_OUTCOME.NOT_APPLICABLE]: '不適用（補錄）',
}

export const APPROVAL_COLOR: Record<string, string> = {
  [APPROVAL_OUTCOME.NOT_SUBMITTED]: 'default',
  [APPROVAL_OUTCOME.APPROVING]: 'processing',
  [APPROVAL_OUTCOME.APPROVED]: 'success',
  [APPROVAL_OUTCOME.REJECTED]: 'error',
  [APPROVAL_OUTCOME.CANCELLED]: 'default',
  [APPROVAL_OUTCOME.DIRECT]: 'purple',
  [APPROVAL_OUTCOME.NOT_APPLICABLE]: 'orange',
}

/** 用车单业务状态 */
export const USE_STATUS_LABEL: Record<string, string> = {
  [USE_STATUS.DRAFT]: '草稿',
  [USE_STATUS.APPROVING]: '審批中',
  [USE_STATUS.TO_ASSIGN]: '待安排',
  [USE_STATUS.TO_DEPART]: '待出車',
  [USE_STATUS.IN_USE]: '使用中',
  [USE_STATUS.TO_CONFIRM]: '待歸還確認',
  [USE_STATUS.COMPLETED]: '已完成',
  [USE_STATUS.REJECTED]: '已駁回',
  [USE_STATUS.CANCELLED]: '已取消',
}

export const USE_STATUS_COLOR: Record<string, string> = {
  [USE_STATUS.DRAFT]: 'default',
  [USE_STATUS.APPROVING]: 'processing',
  [USE_STATUS.TO_ASSIGN]: 'warning',
  [USE_STATUS.TO_DEPART]: 'cyan',
  [USE_STATUS.IN_USE]: 'blue',
  [USE_STATUS.TO_CONFIRM]: 'orange',
  [USE_STATUS.COMPLETED]: 'success',
  [USE_STATUS.REJECTED]: 'error',
  [USE_STATUS.CANCELLED]: 'default',
}

/** 车辆运行状态 */
export const VEHICLE_STATUS_LABEL: Record<string, string> = {
  [VEHICLE_STATUS.NORMAL]: '正常',
  [VEHICLE_STATUS.REPAIRING]: '維修中',
  [VEHICLE_STATUS.SUSPENDED]: '已停用',
  [VEHICLE_STATUS.RETIRED]: '已退出使用',
}

export const VEHICLE_STATUS_COLOR: Record<string, string> = {
  [VEHICLE_STATUS.NORMAL]: 'success',
  [VEHICLE_STATUS.REPAIRING]: 'warning',
  [VEHICLE_STATUS.SUSPENDED]: 'default',
  [VEHICLE_STATUS.RETIRED]: 'error',
}

/** 行程状态 */
export const TRIP_STATUS_LABEL: Record<string, string> = {
  [TRIP_STATUS.DEPARTED]: '行駛中',
  [TRIP_STATUS.RETURNED]: '待歸還確認',
  [TRIP_STATUS.CONFIRMED]: '已確認',
  [TRIP_STATUS.PENDING_CHECK]: '補錄待核對',
  [TRIP_STATUS.DISPUTED]: '爭議核對中',
}

export const TRIP_STATUS_COLOR: Record<string, string> = {
  [TRIP_STATUS.DEPARTED]: 'blue',
  [TRIP_STATUS.RETURNED]: 'orange',
  [TRIP_STATUS.CONFIRMED]: 'success',
  [TRIP_STATUS.PENDING_CHECK]: 'warning',
  [TRIP_STATUS.DISPUTED]: 'error',
}

/** 驾驶方式 */
export const DRIVING_MODE_LABEL: Record<string, string> = {
  [DRIVING_MODE.SELF]: '員工自駕',
  [DRIVING_MODE.COMPANY_DRIVER]: '公司司機駕駛',
}

/** 行程异常标识 */
export const TRIP_FLAG_LABEL: Record<string, string> = {
  [TRIP_FLAG.OVERDUE]: '超出批准時段',
  [TRIP_FLAG.BACKFILL]: '事後補錄',
  [TRIP_FLAG.CORRECTED]: '已授權更正',
  [TRIP_FLAG.MILEAGE_ANOMALY]: '里程異常待核',
  [TRIP_FLAG.KEY_PENDING]: '鑰匙未交還',
  [TRIP_FLAG.CONDITION_ABNORMAL]: '車況異常',
  [TRIP_FLAG.AFFECTED_BY_LATE_RETURN]: '受前車晚歸影響',
}

export const TRIP_FLAG_COLOR: Record<string, string> = {
  [TRIP_FLAG.OVERDUE]: 'volcano',
  [TRIP_FLAG.BACKFILL]: 'orange',
  [TRIP_FLAG.CORRECTED]: 'purple',
  [TRIP_FLAG.MILEAGE_ANOMALY]: 'red',
  [TRIP_FLAG.KEY_PENDING]: 'gold',
  [TRIP_FLAG.CONDITION_ABNORMAL]: 'red',
  [TRIP_FLAG.AFFECTED_BY_LATE_RETURN]: 'magenta',
}

/** 驾驶资格核验结果 */
export const QUALIFICATION_LABEL: Record<string, string> = {
  [QUALIFICATION_RESULT.VERIFIED]: '已核驗',
  [QUALIFICATION_RESULT.PENDING]: '待核驗',
  [QUALIFICATION_RESULT.EXPIRED]: '已失效',
}

export const QUALIFICATION_COLOR: Record<string, string> = {
  [QUALIFICATION_RESULT.VERIFIED]: 'success',
  [QUALIFICATION_RESULT.PENDING]: 'warning',
  [QUALIFICATION_RESULT.EXPIRED]: 'error',
}

/** 车型候选（一期硬编码，阶段 B 迁到参数库/字典） */
export const VEHICLE_TYPE_OPTIONS = [
  { value: '轎車', label: '轎車' },
  { value: 'SUV', label: 'SUV' },
  { value: '商務車', label: '商務車' },
  { value: '貨車', label: '貨車' },
  { value: '新能源車', label: '新能源車' },
]

/**
 * 运行状态下拉候选（由 label 映射派生，避免枚举文案在两处漂移）。
 * 「预约中/使用中」不在此列：那是由时段与行程推导的占用视图，不是车辆自身运行状态。
 */
export const VEHICLE_STATUS_OPTIONS = Object.entries(VEHICLE_STATUS_LABEL)
  .map(([value, label]) => ({ value, label }))

/** 驾照适用地区候选 */
export const LICENSE_REGION_OPTIONS = [
  { value: '澳門', label: '澳門' },
  { value: '中國內地', label: '中國內地' },
  { value: '香港', label: '香港' },
]

/** 准驾范围候选 */
export const LICENSE_CLASS_OPTIONS = [
  { value: 'A1', label: 'A1' },
  { value: 'B2', label: 'B2' },
  { value: 'C1', label: 'C1' },
]
