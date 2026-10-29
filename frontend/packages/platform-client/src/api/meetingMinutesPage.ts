/**
 * 会议纪要免登查看页 API（钉钉卡片里的「查看完整紀要」直达，签名令牌鉴权）
 *
 * 与免登签到页同构：后端在安全白名单放行 /api/meeting/minutes-page/**，身份由 HMAC 令牌校验，
 * 不需要后台登录态——纪要常常发给没有后台账号的人（外部协作者、其他部门同事）。
 *
 * 两条硬口径：
 *   1. 请求一律带静默头：免登页没有后台的全局 message 容器，令牌失效要用整页提示讲清楚；
 *   2. 刻意不带任何后台 JWT：免登页一旦依赖登录态，钉钉里点开的人就看不到内容。
 */
import request, { SILENT_HEADER } from './request'
import type { MinutesContent, MinutesDocument } from './meetingMinutes'

const SILENT = { headers: { [SILENT_HEADER]: '1' } }

/**
 * 免登页视图：只回"这份纪要是什么内容、谁在什么时候发给你的"。
 * 字段限定为 姓名/工号，不含手机号、参会人钉钉 ID、投递明细等内部信息——
 * 免登链接可能被转发，输出面越窄，外泄半径越小。
 */
export interface MinutesPageView {
  document?: MinutesDocument
  revisionNo?: number
  valid: boolean
  message?: string | null
  minutesNo?: string | null
  title?: string | null
  bookingNo?: string | null
  meetingTimeText?: string | null
  roomText?: string | null
  organizerName?: string | null
  recorderName?: string | null
  recorderEmpNo?: string | null
  batchSeq?: number | null
  sentByName?: string | null
  sentAt?: string | null
  expireAt?: string | null
  content?: MinutesContent | null
}

export function fetchMinutesPage(token: string): Promise<MinutesPageView> {
  return request.get<unknown, MinutesPageView>('/meeting/minutes-page/detail', { params: { token }, ...SILENT })
}
