/**
 * 纪要入口可见性判定（我的会议 / 预约记录 / 会议详情三处共用）。
 *
 * <p>为什么前端也要有一份：列表一行一个按钮，等后端逐行回传权限再渲染等于每行多打一次接口；
 * 但同一份判定写在三处必然漂移（同一场会在列表能点、在详情不能点）。
 *
 * <p>口径与后端一致并且**只收窄不放宽**：
 *   1. 相关人（myRole ≠ none）且持有使用侧 edit，或行政视野（meeting-record:edit）可代录——
 *      与"代取消/代释放"同源，都是行政替他人操作预约的权力；
 *   2. 会议已进入或已收尾才谈得上纪要；cancelled / released 不产生入口（没开成的会没有纪要事实）；
 *   3. 后端一旦下发 canMinutes，即以服务端结论为准，本函数只在字段缺省时兜底，
 *      避免旧版本后端还没返回该字段时界面无端丢入口。
 */
import type { MeetingVO } from '../../../api/meeting'

/** 已进入或已收尾的阶段/状态：与后端「可录入纪要」判定逐字同口径 */
const MINUTES_ALLOWED_PHASES = new Set(['ongoing', 'ended', 'finished'])
const MINUTES_ALLOWED_STATUSES = new Set(['checked_in', 'finished'])

interface Capability {
  /** 是否持有 meeting-my:edit（员工侧：给自己的会记纪要） */
  canRecordOwn: boolean
  /** 是否持有 meeting-record:edit（行政侧：可代他人录入与发送） */
  canManageRecords: boolean
}

export function deriveCanRecordMinutes(meeting: MeetingVO, capability: Capability): boolean {
  if (meeting.canMinutes != null) return meeting.canMinutes
  const related = meeting.myRole !== 'none' && meeting.myRole != null
  const who = (related && capability.canRecordOwn) || capability.canManageRecords
  if (!who) return false
  return MINUTES_ALLOWED_PHASES.has(meeting.phase) || MINUTES_ALLOWED_STATUSES.has(meeting.status)
}

/** 纪要跳转：已录入进只读查看页，未录入进表单页——同一个按钮位两种语义要分得开 */
export function minutesPathOf(meeting: MeetingVO): string {
  return meeting.minutesId
    ? `/meeting-minutes?id=${meeting.minutesId}`
    : `/meeting-minutes-form?bookingId=${meeting.id}`
}

/** 本会是否已有纪要（列表行的按钮文案用） */
export function hasMinutesRecord(meeting: MeetingVO): boolean {
  return Boolean(meeting.minutesId) || (meeting.minutesStatus != null && meeting.minutesStatus !== 'none')
}
