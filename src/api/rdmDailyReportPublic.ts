/**
 * 进度日报看板开放页 API（钉钉通知直达，签名令牌鉴权）
 *
 * 与会议纪要免登页同构：后端在安全白名单放行 /api/public/rdm-daily-view，
 * 身份由 HMAC 令牌校验，不需要后台登录态——日报推给项目经理/产品负责人与钉钉群，
 * 读者常常没有后台账号，要求登录等于把推送做成白发。
 *
 * 两条硬口径：
 *   1. 请求一律带静默头：开放页没有后台的全局 message 容器，令牌失效要用整页提示讲清楚；
 *   2. 刻意不带任何后台 JWT：一旦依赖登录态，钉钉里点开的人就看不到内容。
 */
import request, { SILENT_HEADER } from './request'
import type { DailyReportSnapshot } from './rdmDailyReport'

const SILENT = { headers: { [SILENT_HEADER]: '1' } }

/**
 * 看板开放页视图。
 * <p>showRequirements/showOwners/showUnassigned 是后端实际生效的展示参数：
 * 前端只按它裁剪渲染，<b>看板样式固定不变</b>，不提供任何样式配置。
 */
export interface DailyReportPublicView {
  valid: boolean
  message?: string | null
  /** 链接到期时间 yyyy-MM-dd HH:mm:ss */
  expireAt?: string | null
  showRequirements: boolean
  showOwners: boolean
  showUnassigned: boolean
  snapshot?: DailyReportSnapshot | null
}

export function fetchDailyReportPublicView(token: string): Promise<DailyReportPublicView> {
  return request.get<unknown, DailyReportPublicView>('/public/rdm-daily-view', {
    params: { token },
    ...SILENT,
  })
}
