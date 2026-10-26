/**
 * 会议详情免登页 API（钉钉邀约卡片直达，令牌鉴权）
 *
 * 后端已在安全白名单放行 /api/public/meeting-view/**，身份由 HMAC 令牌校验，
 * 无需登录后台。请求一律携带静默头：错误由页面自身状态展示，
 * 免登页没有后台的全局 message 容器，弹 toast 只会挡住移动端内容。
 *
 * 这里刻意不导入 AuthContext / 不发任何带 token 头的请求：免登页若带上后台 JWT，
 * 就会变成"实际依赖登录态"的页面，钉钉里点开的人反而会被送回登录页。
 */
import request, { SILENT_HEADER } from './request'

const SILENT = { headers: { [SILENT_HEADER]: '1' } }

/** 免登页视图：只含会议本身与状态，不返回参会人名单/手机号/投递明细 */
export interface MeetingViewPage {
  valid: boolean
  message?: string | null
  bookingId?: number | null
  bookingNo?: string | null
  title?: string | null
  status?: string | null
  phase?: string | null
  statusText?: string | null
  /** 已取消/已释放/已结束：页面只回看，不提供任何动作入口 */
  closed?: boolean
  startTime?: string | null
  endTime?: string | null
  timeText?: string | null
  roomName?: string | null
  roomLocation?: string | null
  organizerName?: string | null
  delegateForName?: string | null
  description?: string | null
  onlineMeetingUrl?: string | null
  cancelReason?: string | null
  releaseReason?: string | null
  tokenExpireAt?: string | null
}

export function fetchMeetingViewPage(token: string): Promise<MeetingViewPage> {
  return request.get<unknown, MeetingViewPage>('/public/meeting-view', { params: { token }, ...SILENT })
}
