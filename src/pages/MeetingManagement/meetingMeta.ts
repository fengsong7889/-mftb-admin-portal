/**
 * 会议域展示元数据（状态 / 身份 / 投递态 / 事件码 → 文案 + Tag 颜色）。
 *
 * 列表、详情、日程三处共用同一份映射：文案与颜色分散定义必然出现「列表是绿色、详情是蓝色」，
 * 用户就会怀疑两个页面讲的是不是一件事。颜色遵循既有口径：
 * 蓝=进行中/待处理，绿=成功/已完成，橙=需要注意，红=失败/终止，灰=已取消。
 *
 * key 必须逐字等于后端 MeetingConstants 的取值，改一边不改另一边会静默回落到 FALLBACK。
 */
import type { TagProps } from 'antd'

/** 会议状态（biz_meeting_booking.status） */
export const MEETING_STATUS: Record<string, { label: string; color: NonNullable<TagProps['color']> }> = {
  booked: { label: '已預約', color: 'blue' },
  checked_in: { label: '已簽到', color: 'cyan' },
  finished: { label: '已完成', color: 'green' },
  cancelled: { label: '已取消', color: 'default' },
  released: { label: '已釋放', color: 'orange' },
}

/** 派生展示态（后端 phase 字段，进行中不落库） */
export const MEETING_PHASE: Record<string, { label: string; color: NonNullable<TagProps['color']> }> = {
  pending: { label: '待開會', color: 'blue' },
  ongoing: { label: '進行中', color: 'processing' },
  ended: { label: '已結束', color: 'green' },
  finished: { label: '已完成', color: 'green' },
  cancelled: { label: '已取消', color: 'default' },
  released: { label: '已釋放', color: 'orange' },
}

/** 会议室状态 */
export const ROOM_STATUS: Record<string, { label: string; color: NonNullable<TagProps['color']> }> = {
  active: { label: '使用中', color: 'green' },
  maintenance: { label: '維護中', color: 'orange' },
  disabled: { label: '已停用', color: 'default' },
}

/** 设备代码 → 名称（与后端 MeetingConstants.FACILITY_CODES 对齐） */
export const FACILITY_LABELS: Record<string, string> = {
  PROJECTION: '投影機',
  WHITEBOARD: '白板',
  VIDEO_TERMINAL: '視頻終端',
  PHONE: '電話會議',
  WIRELESS_CAST: '無線投屏',
}

export const FACILITY_OPTIONS = Object.entries(FACILITY_LABELS).map(([value, label]) => ({ value, label }))

/** 关联业务类型 */
export const BIZ_TYPE_LABELS: Record<string, string> = {
  general: '一般會議',
  rdm_review: '需求評審',
  interview: '面試',
  training: '培訓',
}

/** 参会人身份 */
export const ATTENDEE_TYPE_LABELS: Record<string, string> = {
  organizer: '組織者',
  required: '必參',
  optional: '選參',
  external: '外部人員',
}

/** 邀约响应 */
export const RESPONSE_META: Record<string, { label: string; color: NonNullable<TagProps['color']> }> = {
  pending: { label: '待響應', color: 'orange' },
  accepted: { label: '已接受', color: 'green' },
  declined: { label: '已婉拒', color: 'default' },
  invalid: { label: '已失效', color: 'red' },
}

/** 投递态：skipped 与 failed 必须分得开——一个是"发不出去但已查明原因"，一个是"渠道失败还要重试" */
export const NOTIFY_STATUS_META: Record<string, { label: string; color: NonNullable<TagProps['color']> }> = {
  pending: { label: '待發送', color: 'blue' },
  sending: { label: '發送中', color: 'processing' },
  success: { label: '已送達', color: 'green' },
  skipped: { label: '未送達', color: 'warning' },
  failed: { label: '發送失敗', color: 'red' },
}

/** 审计事件码（后端 MeetingConstants.EVENT_*） */
export const EVENT_LABELS: Record<string, string> = {
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

/** 通知事件码：invite_updated 带版本号（invite_updated_v3），前缀匹配即可 */
export function notifyEventLabel(code: string): string {
  if (code.startsWith('invite_created')) return '會議邀約'
  if (code.startsWith('invite_updated')) return `會議變更（v${code.split('_v')[1] ?? '?'}）`
  if (code.startsWith('invite_cancelled')) return '會議取消'
  if (code.startsWith('remind_before_start')) return '開始前提醒'
  if (code.startsWith('ops_released')) return '會議室釋放'
  return code
}

export function statusMeta(status?: string | null) {
  return MEETING_STATUS[status ?? ''] ?? { label: status || '-', color: 'default' as const }
}

export function phaseMeta(phase?: string | null) {
  return MEETING_PHASE[phase ?? ''] ?? statusMeta(phase)
}

export function roomStatusMeta(status?: string | null) {
  return ROOM_STATUS[status ?? ''] ?? { label: status || '-', color: 'default' as const }
}

export function eventLabel(code?: string | null): string {
  if (!code) return '-'
  return EVENT_LABELS[code] ?? code
}

/** 会议室位置展示：园区 · 楼栋 · 楼层 · 描述，空段自动跳过 */
export function roomLocationText(parts: Array<string | null | undefined>): string {
  return parts.filter((p): p is string => Boolean(p && p.trim())).map(p => p.trim()).join(' · ')
}
