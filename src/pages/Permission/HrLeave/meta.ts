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

/**
 * 请假视图作用域：人事管理端与员工自助端复用同一套列表/表单/详情组件，
 * 差异只在「授权菜单 key」「路由前缀」「列配置隔离 key」；数据范围由服务端收敛，
 * 自助端拿到的列表/额度天然只有本人记录。
 */
export interface LeaveScope {
  /** 授权菜单 key：hr-leave（人事）/ ess-leave（員工自助） */
  permKey: string
  /** 列表页路由；表单页/详情页为 `-form` / `-detail` 后缀 */
  basePath: string
  /** useColumnConfig 隔离 key，避免两个视角的列宽/显隐互相污染 */
  columnKey: string
  /**
   * 只看本人：人事角色打开自助页时也强制收敛，
   * 否则「我的假期」会替管理员列出全员数据。
   */
  mineOnly?: boolean
}

export const HR_LEAVE_SCOPE: LeaveScope = { permKey: 'hr-leave', basePath: '/hr-leave', columnKey: 'hr-leave' }

export const ESS_LEAVE_SCOPE: LeaveScope =
  { permKey: 'ess-leave', basePath: '/ess-leave', columnKey: 'ess-leave', mineOnly: true }

/** 请假表单页路由（id 为空即新增） */
export const leaveFormPath = (scope: LeaveScope, id?: number) =>
  `${scope.basePath}-form${id != null ? `?id=${id}` : ''}`

/** 请假详情页路由 */
export const leaveDetailPath = (scope: LeaveScope, id: number) => `${scope.basePath}-detail?id=${id}`
