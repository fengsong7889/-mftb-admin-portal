/**
 * 会议域展示元数据（状态 / 身份 / 投递态 / 事件码 → 文案 + Tag 颜色）。
 *
 * 列表、详情、日程三处共用同一份映射：文案与颜色分散定义必然出现「列表是绿色、详情是蓝色」，
 * 用户就会怀疑两个页面讲的是不是一件事。颜色遵循既有口径：
 * 蓝=进行中/待处理，绿=成功/已完成，橙=需要注意，红=失败/终止，灰=已取消。
 *
 * key 必须逐字等于后端 MeetingConstants 的取值，改一边不改另一边会静默回落到 FALLBACK。
 *
 * 为什么 label 是函数内 i18n.t 惰性求值而不是模块级常量：模块级 t() 在 import 那一刻
 * 就把文案定成当时的语言，用户切换语言后组件重渲染也拿不到新词——比不接 i18n 更难查。
 * 因此所有对外导出都改成"调用时求值"的函数（bizTypeLabels() 等），调用点随之加一对括号。
 */
import i18n from '../../i18n'
import type { TagProps } from 'antd'

type Meta = { label: string; color: NonNullable<TagProps['color']> }

const tl = (key: string, zh: string, opts?: Record<string, unknown>): string =>
  i18n.t(key, { defaultValue: zh, ...opts })

/** 会议状态（biz_meeting_booking.status） */
const MEETING_STATUS: Record<string, { key: string; label: string; color: NonNullable<TagProps['color']> }> = {
  booked: { key: 'meeting.meta.status.booked', label: '已預約', color: 'blue' },
  checked_in: { key: 'meeting.meta.status.checkedIn', label: '已簽到', color: 'cyan' },
  finished: { key: 'meeting.meta.status.finished', label: '已完成', color: 'green' },
  cancelled: { key: 'meeting.meta.status.cancelled', label: '已取消', color: 'default' },
  released: { key: 'meeting.meta.status.released', label: '已釋放', color: 'orange' },
}

/** 派生展示态（后端 phase 字段，进行中不落库） */
const MEETING_PHASE: Record<string, { key: string; label: string; color: NonNullable<TagProps['color']> }> = {
  pending: { key: 'meeting.meta.phase.pending', label: '待開會', color: 'blue' },
  ongoing: { key: 'meeting.meta.phase.ongoing', label: '進行中', color: 'processing' },
  ended: { key: 'meeting.meta.phase.ended', label: '已結束', color: 'green' },
  finished: { key: 'meeting.meta.phase.finished', label: '已完成', color: 'green' },
  cancelled: { key: 'meeting.meta.phase.cancelled', label: '已取消', color: 'default' },
  released: { key: 'meeting.meta.phase.released', label: '已釋放', color: 'orange' },
}

/** 会议室状态 */
const ROOM_STATUS: Record<string, { key: string; label: string; color: NonNullable<TagProps['color']> }> = {
  active: { key: 'meeting.meta.room.active', label: '使用中', color: 'green' },
  maintenance: { key: 'meeting.meta.room.maintenance', label: '維護中', color: 'orange' },
  disabled: { key: 'meeting.meta.room.disabled', label: '已停用', color: 'default' },
}

const lazyMeta = (src: Record<string, { key: string; label: string; color: NonNullable<TagProps['color']> }>) => {
  const out: Record<string, Meta> = {}
  for (const [code, item] of Object.entries(src)) {
    out[code] = { label: tl(item.key, item.label), color: item.color }
  }
  return out
}

export const statusMeta = (status?: string | null): Meta =>
  lazyMeta(MEETING_STATUS)[status ?? ''] ?? { label: status || '-', color: 'default' as const }

export const phaseMeta = (phase?: string | null): Meta =>
  lazyMeta(MEETING_PHASE)[phase ?? ''] ?? statusMeta(phase)

export const roomStatusMeta = (status?: string | null): Meta =>
  lazyMeta(ROOM_STATUS)[status ?? ''] ?? { label: status || '-', color: 'default' as const }

/** 设备代码 → 名称（与后端 MeetingConstants.FACILITY_CODES 对齐） */
const FACILITY_SOURCE: Record<string, string> = {
  PROJECTION: '投影機',
  WHITEBOARD: '白板',
  VIDEO_TERMINAL: '視頻終端',
  PHONE: '電話會議',
  WIRELESS_CAST: '無線投屏',
}

export function facilityLabels(): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [code, zh] of Object.entries(FACILITY_SOURCE)) {
    out[code] = tl(`meeting.meta.facility.${code.toLowerCase()}`, zh)
  }
  return out
}

/** Select 选项必须由 facilityLabels() 派生：模块级 Object.entries 会冻结当时的语言 */
export function facilityOptions(): { value: string; label: string }[] {
  return Object.entries(facilityLabels()).map(([value, label]) => ({ value, label }))
}

/** 关联业务类型 */
const BIZ_TYPE_SOURCE: Record<string, string> = {
  general: '一般會議',
  rdm_review: '需求評審',
  interview: '面試',
  training: '培訓',
}

export function bizTypeLabels(): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [code, zh] of Object.entries(BIZ_TYPE_SOURCE)) {
    out[code] = tl(`meeting.meta.bizType.${code.replace(/_(\w)/g, (_, c: string) => c.toUpperCase())}`, zh)
  }
  return out
}

/** 参会人身份 */
const ATTENDEE_TYPE_SOURCE: Record<string, string> = {
  organizer: '組織者',
  required: '必參',
  optional: '選參',
  external: '外部人員',
}

export function attendeeTypeLabels(): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [code, zh] of Object.entries(ATTENDEE_TYPE_SOURCE)) {
    out[code] = tl(`meeting.meta.attendeeType.${code}`, zh)
  }
  return out
}

/** 邀约响应 */
const RESPONSE_SOURCE: Record<string, { key: string; label: string; color: NonNullable<TagProps['color']> }> = {
  pending: { key: 'meeting.meta.response.pending', label: '待響應', color: 'orange' },
  accepted: { key: 'meeting.meta.response.accepted', label: '已接受', color: 'green' },
  declined: { key: 'meeting.meta.response.declined', label: '已婉拒', color: 'default' },
  invalid: { key: 'meeting.meta.response.invalid', label: '已失效', color: 'red' },
}

export const responseMeta = (): Record<string, Meta> => lazyMeta(RESPONSE_SOURCE)

/** 投递态：skipped 与 failed 必须分得开——一个是"发不出去但已查明原因"，一个是"渠道失败还要重试" */
const NOTIFY_STATUS_SOURCE: Record<string, { key: string; label: string; color: NonNullable<TagProps['color']> }> = {
  pending: { key: 'meeting.meta.notify.pending', label: '待發送', color: 'blue' },
  sending: { key: 'meeting.meta.notify.sending', label: '發送中', color: 'processing' },
  success: { key: 'meeting.meta.notify.success', label: '已送達', color: 'green' },
  skipped: { key: 'meeting.meta.notify.skipped', label: '未送達', color: 'warning' },
  failed: { key: 'meeting.meta.notify.failed', label: '發送失敗', color: 'red' },
}

export const notifyStatusMeta = (): Record<string, Meta> => lazyMeta(NOTIFY_STATUS_SOURCE)

/** 审计事件码（后端 MeetingConstants.EVENT_*） */
const EVENT_SOURCE: Record<string, string> = {
  create: '創建預約',
  update: '變更會議',
  cancel: '取消會議',
  checkin: '簽到',
  release: '釋放會議室',
  finish: '會議結束',
  notify: '邀約投遞',
  room_create: '新增會議室',
  room_update: '修改會議室',
  room_delete: '刪除會議室',
}

export function eventLabel(code?: string | null): string {
  if (!code) return '-'
  const zh = EVENT_SOURCE[code]
  if (!zh) return code
  return tl(`meeting.meta.event.${code.replace(/_(\w)/g, (_, c: string) => c.toUpperCase())}`, zh)
}

/** 通知事件码：invite_updated 带版本号（invite_updated_v3），前缀匹配即可 */
export function notifyEventLabel(code: string): string {
  if (code.startsWith('invite_created')) return tl('meeting.meta.notifyEvent.inviteCreated', '會議邀約')
  if (code.startsWith('invite_updated')) {
    return tl('meeting.meta.notifyEvent.inviteUpdated', '會議變更（{{version}}）', { version: `v${code.split('_v')[1] ?? '?'}` })
  }
  if (code.startsWith('invite_cancelled')) return tl('meeting.meta.notifyEvent.inviteCancelled', '會議取消')
  if (code.startsWith('remind_before_start')) return tl('meeting.meta.notifyEvent.remindBeforeStart', '開始前提醒')
  if (code.startsWith('ops_released')) return tl('meeting.meta.notifyEvent.opsReleased', '會議室釋放')
  return code
}

/** 会议室位置展示：园区 · 楼栋 · 楼层 · 描述，空段自动跳过 */
export function roomLocationText(parts: Array<string | null | undefined>): string {
  return parts.filter((p): p is string => Boolean(p && p.trim())).map(p => p.trim()).join(' · ')
}
