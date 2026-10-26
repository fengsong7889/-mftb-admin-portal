/**
 * 考勤假勤系统的枚举 → i18n key / Tag 颜色映射。
 *
 * 为什么单独一个 meta 文件：这些码值来自后端实体常量（AttException.TYPE_*、AttShift.flexFlag…），
 * 列表、表单、详情、工作台四处都要渲染同一套标签。散在各页各写一份 Record，
 * 改一个码值就会漏掉某处，界面上表现为"有的页面显示 3、有的页面显示缺卡"。
 *
 * 约定（对齐 src/pages/Permission/HrLeave/meta.ts）：
 * - 这里只存 **i18n key**，不存中文文案；文案在 locales 的 `attendance.*` 命名空间
 * - key 用后端数字码索引，不用前端自造的字符串枚举，避免多一层双向映射
 */
import {
  EXCEPTION_STATUS, EXCEPTION_TYPE, GROUP_TYPE, HOLIDAY_TYPE, MONTHLY_STATUS,
  PUNCH_RESULT, PUNCH_SOURCE, PUNCH_TYPE, SCOPE_TYPE,
} from '@/api/attendance'

/** 考勤制度 → i18n key */
export const GROUP_TYPE_LABEL_KEY: Record<number, string> = {
  [GROUP_TYPE.FIXED]: 'attendance.groupTypeFixed',
  [GROUP_TYPE.ROTATION]: 'attendance.groupTypeRotation',
  [GROUP_TYPE.FLEX]: 'attendance.groupTypeFlex',
}

/** 成员范围 → i18n key */
export const SCOPE_TYPE_LABEL_KEY: Record<number, string> = {
  [SCOPE_TYPE.DEPT]: 'attendance.scopeDept',
  [SCOPE_TYPE.STORE]: 'attendance.scopeStore',
  [SCOPE_TYPE.LIST]: 'attendance.scopeList',
}

/** 打卡来源 → i18n key。补录只在列表出现，表单不可选 */
export const PUNCH_SOURCE_LABEL_KEY: Record<number, string> = {
  [PUNCH_SOURCE.DINGTALK]: 'attendance.sourceDingtalk',
  [PUNCH_SOURCE.IMPORT]: 'attendance.sourceImport',
  [PUNCH_SOURCE.REISSUE]: 'attendance.sourceReissue',
}

/** 卡别 → i18n key */
export const PUNCH_TYPE_LABEL_KEY: Record<number, string> = {
  [PUNCH_TYPE.ON]: 'attendance.punchOn',
  [PUNCH_TYPE.OFF]: 'attendance.punchOff',
}

/** 打卡判定 → i18n key / Tag 颜色 */
export const PUNCH_RESULT_LABEL_KEY: Record<number, string> = {
  [PUNCH_RESULT.NORMAL]: 'attendance.resultNormal',
  [PUNCH_RESULT.LATE]: 'attendance.resultLate',
  [PUNCH_RESULT.EARLY]: 'attendance.resultEarly',
  [PUNCH_RESULT.OUTSIDE]: 'attendance.resultOutside',
  [PUNCH_RESULT.INVALID]: 'attendance.resultInvalid',
}
export const PUNCH_RESULT_TAG_COLOR: Record<number, string> = {
  [PUNCH_RESULT.NORMAL]: 'success',
  [PUNCH_RESULT.LATE]: 'warning',
  [PUNCH_RESULT.EARLY]: 'warning',
  [PUNCH_RESULT.OUTSIDE]: 'processing',
  [PUNCH_RESULT.INVALID]: 'default',
}

/** 异常类型 → i18n key / Tag 颜色 */
export const EXCEPTION_TYPE_LABEL_KEY: Record<number, string> = {
  [EXCEPTION_TYPE.LATE]: 'attendance.exTypeLate',
  [EXCEPTION_TYPE.EARLY]: 'attendance.exTypeEarly',
  [EXCEPTION_TYPE.MISSING_CARD]: 'attendance.exTypeMissing',
  [EXCEPTION_TYPE.ABSENT]: 'attendance.exTypeAbsent',
  [EXCEPTION_TYPE.UNSCHEDULED]: 'attendance.exTypeUnscheduled',
}
export const EXCEPTION_TYPE_TAG_COLOR: Record<number, string> = {
  [EXCEPTION_TYPE.LATE]: 'warning',
  [EXCEPTION_TYPE.EARLY]: 'warning',
  [EXCEPTION_TYPE.MISSING_CARD]: 'orange',
  // 旷工直接影响薪酬扣减，必须是最重的语义色
  [EXCEPTION_TYPE.ABSENT]: 'error',
  [EXCEPTION_TYPE.UNSCHEDULED]: 'default',
}

/** 异常处理状态 → i18n key / Tag 颜色 */
export const EXCEPTION_STATUS_LABEL_KEY: Record<number, string> = {
  [EXCEPTION_STATUS.PENDING]: 'attendance.exStatusPending',
  [EXCEPTION_STATUS.HANDLED]: 'attendance.exStatusHandled',
  [EXCEPTION_STATUS.LEAVE]: 'attendance.exStatusLeave',
  [EXCEPTION_STATUS.OVERTIME]: 'attendance.exStatusOvertime',
  [EXCEPTION_STATUS.CONFIRMED]: 'attendance.exStatusConfirmed',
}
export const EXCEPTION_STATUS_TAG_COLOR: Record<number, string> = {
  [EXCEPTION_STATUS.PENDING]: 'warning',
  [EXCEPTION_STATUS.HANDLED]: 'success',
  [EXCEPTION_STATUS.LEAVE]: 'processing',
  [EXCEPTION_STATUS.OVERTIME]: 'processing',
  [EXCEPTION_STATUS.CONFIRMED]: 'default',
}

/** 节假日类型 → i18n key / Tag 颜色 */
export const HOLIDAY_TYPE_LABEL_KEY: Record<number, string> = {
  [HOLIDAY_TYPE.LEGAL]: 'attendance.holidayLegal',
  [HOLIDAY_TYPE.SWAP_WORKDAY]: 'attendance.holidaySwap',
  [HOLIDAY_TYPE.COMPANY]: 'attendance.holidayCompany',
}
export const HOLIDAY_TYPE_TAG_COLOR: Record<number, string> = {
  [HOLIDAY_TYPE.LEGAL]: 'error',
  // 调休上班是"周末但要上班"，用 warning 提醒排班别当休息日处理
  [HOLIDAY_TYPE.SWAP_WORKDAY]: 'warning',
  [HOLIDAY_TYPE.COMPANY]: 'processing',
}

/** 月度汇总状态 → i18n key / Tag 颜色（状态机严格单向） */
export const MONTHLY_STATUS_LABEL_KEY: Record<string, string> = {
  [MONTHLY_STATUS.DRAFT]: 'attendance.monthDraft',
  [MONTHLY_STATUS.FROZEN]: 'attendance.monthFrozen',
  [MONTHLY_STATUS.SYNCED]: 'attendance.monthSynced',
}
export const MONTHLY_STATUS_TAG_COLOR: Record<string, string> = {
  [MONTHLY_STATUS.DRAFT]: 'warning',
  [MONTHLY_STATUS.FROZEN]: 'processing',
  [MONTHLY_STATUS.SYNCED]: 'success',
}

/** 启停状态（主数据通用）→ Tag 颜色 */
export const ENABLE_STATUS_TAG_COLOR: Record<string, string> = {
  enabled: 'success',
  disabled: 'default',
}

/**
 * 工作台预警 key → i18n key。
 * <p>后端只下发结构化预警（key/level/path/params），句子在前端拼，
 * 这样五语言才能覆盖到；后端拼句子会让这几条永远只有繁体。
 */
export const WORKBENCH_ALERT_KEY: Record<string, string> = {
  unscheduled: 'attendance.alertUnscheduled',
  unfrozen: 'attendance.alertUnfrozen',
  noSyncToday: 'attendance.alertNoSync',
  disabledGroups: 'attendance.alertDisabledGroups',
}

/**
 * 取码值对应的 i18n key。
 * <p>返回 undefined 而不是兜底文案：调用方据此渲染原始码值，
 * 后端新增枚举而前端未跟上时能当场看到数字，比静默显示空白或错译文更容易发现。
 */
export function keyOf(map: Record<number | string, string>, code: number | string | null | undefined) {
  if (code === null || code === undefined) return undefined
  return map[code]
}
