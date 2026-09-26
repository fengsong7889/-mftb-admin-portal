import { LEAVE_STATUS, LEAVE_TYPE } from '../../../api/hrLeave'

/** 假期类型 → i18n key（与后端 HR 字典 LEAVE_TYPE code 一致） */
export const LEAVE_TYPE_LABEL_KEY: Record<string, string> = {
  [LEAVE_TYPE.ANNUAL]: 'hrLeave.typeAnnual',
  [LEAVE_TYPE.PERSONAL]: 'hrLeave.typePersonal',
  [LEAVE_TYPE.SICK]: 'hrLeave.typeSick',
  [LEAVE_TYPE.MARRIAGE]: 'hrLeave.typeMarriage',
  [LEAVE_TYPE.MATERNITY]: 'hrLeave.typeMaternity',
  [LEAVE_TYPE.BEREAVEMENT]: 'hrLeave.typeBereavement',
  [LEAVE_TYPE.COMPENSATORY]: 'hrLeave.typeCompensatory',
}

/** 状态 → i18n key / Tag 颜色 */
export const LEAVE_STATUS_LABEL_KEY: Record<string, string> = {
  [LEAVE_STATUS.DRAFT]: 'hrLeave.statusDraft',
  [LEAVE_STATUS.PENDING]: 'hrLeave.statusPending',
  [LEAVE_STATUS.APPROVED]: 'hrLeave.statusApproved',
  [LEAVE_STATUS.REJECTED]: 'hrLeave.statusRejected',
  [LEAVE_STATUS.CANCELLED]: 'hrLeave.statusCancelled',
  [LEAVE_STATUS.COMPLETED]: 'hrLeave.statusCompleted',
}
export const LEAVE_STATUS_TAG_COLOR: Record<string, string> = {
  [LEAVE_STATUS.DRAFT]: 'default', [LEAVE_STATUS.PENDING]: 'processing',
  [LEAVE_STATUS.APPROVED]: 'warning', [LEAVE_STATUS.REJECTED]: 'error',
  [LEAVE_STATUS.CANCELLED]: 'default', [LEAVE_STATUS.COMPLETED]: 'success',
}

/** 列表状态页签（all=全部） */
export const LEAVE_STATUS_TABS = ['all', LEAVE_STATUS.DRAFT, LEAVE_STATUS.PENDING,
  LEAVE_STATUS.REJECTED, LEAVE_STATUS.APPROVED, LEAVE_STATUS.COMPLETED]

/** 请假类型下拉（按展示顺序） */
export const LEAVE_TYPE_ORDER = [LEAVE_TYPE.ANNUAL, LEAVE_TYPE.PERSONAL, LEAVE_TYPE.SICK,
  LEAVE_TYPE.MARRIAGE, LEAVE_TYPE.MATERNITY, LEAVE_TYPE.BEREAVEMENT, LEAVE_TYPE.COMPENSATORY]
