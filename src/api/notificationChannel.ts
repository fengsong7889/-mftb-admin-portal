/**
 * 通知渠道配置 API
 * 供通知渠道配置页面管理各渠道（钉钉/企微/飞书）的 Webhook 配置
 */
import request from './request'

/** 渠道配置数据结构 */
export interface ChannelConfig {
  channel: string
  webhookUrl?: string
  secret?: string
  enabled?: string
  atMobiles?: string
  [key: string]: string | undefined
}

/** 读取指定渠道的配置 */
export function getChannelConfig(channel: string): Promise<ChannelConfig> {
  return request.get<unknown, ChannelConfig>(`/notification-channels/${channel}/config`)
}

/** 更新指定渠道的配置 */
export function updateChannelConfig(channel: string, config: Record<string, string>): Promise<void> {
  return request.put(`/notification-channels/${channel}/config`, config)
}

/** 发送测试消息（携带当前表单配置，无需先保存） */
export function testChannel(channel: string, config?: Record<string, string>): Promise<string> {
  return request.post<unknown, string>(`/notification-channels/${channel}/test`, config)
}
