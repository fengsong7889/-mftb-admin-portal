/**
 * 会议免登签到页 API（扫码直达，令牌鉴权）
 *
 * 后端已在安全白名单放行 /api/meeting/checkin-page/**，身份由 HMAC 令牌校验，
 * 无需登录后台。请求一律携带静默头：错误由页面自身状态展示，
 * 免登页没有后台的全局 message 容器，弹 toast 只会挡住移动端按钮。
 *
 * 这里刻意不导入 AuthContext / 不发任何带 token 头的请求：免登页若带上后台 JWT，
 * 就会变成"实际依赖登录态"的页面，钉钉里点开的人反而签不了。
 */
import request, { SILENT_HEADER } from './request'

const SILENT = { headers: { [SILENT_HEADER]: '1' } }

/** 免登页视图：只含"我是谁、这场会是什么、现在能不能签"，不返回参会人名单等内部信息 */
export interface CheckinView {
  valid: boolean
  message?: string | null
  bookingId?: number | null
  bookingNo?: string | null
  title?: string | null
  startTime?: string | null
  endTime?: string | null
  roomName?: string | null
  roomLocation?: string | null
  organizerName?: string | null
  myName?: string | null
  myEmpNo?: string | null
  myRole?: string | null
  checkedIn?: boolean
  checkinAt?: string | null
  canCheckin?: boolean
  checkinOpenAt?: string | null
  checkinDeadlineAt?: string | null
  tokenExpireAt?: string | null
}

export function fetchCheckinDetail(token: string): Promise<CheckinView> {
  return request.get<unknown, CheckinView>('/meeting/checkin-page/detail', { params: { token }, ...SILENT })
}

export function submitCheckin(token: string): Promise<CheckinView> {
  return request.post<unknown, CheckinView>('/meeting/checkin-page/sign', { token }, SILENT)
}
