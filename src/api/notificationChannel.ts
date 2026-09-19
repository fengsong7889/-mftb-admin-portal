/**
 * 通知渠道配置 API
 * 支持多平台、多场景、多渠道 CRUD 及测试
 */
import request, { SILENT_HEADER } from './request'

/** 通知渠道数据 */
export interface ChannelItem {
  id: number
  name: string
  channel: string
  webhookUrl: string
  secret: string
  atMobiles: string
  enabled: number
  isDefault: number
  scenarios: string
  remark: string
  createdBy: string
  updatedBy: string
  createdAt: string
  updatedAt: string
}

/** 渠道保存参数 */
export interface ChannelSaveDTO {
  name: string
  channel: string
  webhookUrl: string
  secret?: string
  atMobiles?: string
  enabled?: number
  isDefault?: number
  scenarios?: string
  remark?: string
}

/** 渠道查询参数 */
export interface ChannelQuery {
  channel?: string
  name?: string
  enabled?: number
  updatedBy?: string
  updatedAfter?: string
  updatedBefore?: string
}

/** 列出所有渠道（支持筛选） */
export function fetchChannels(params?: ChannelQuery): Promise<ChannelItem[]> {
  const qs = new URLSearchParams()
  if (params?.channel) qs.set('channel', params.channel)
  if (params?.name) qs.set('name', params.name)
  if (params?.enabled !== undefined) qs.set('enabled', String(params.enabled))
  if (params?.updatedBy) qs.set('updatedBy', params.updatedBy)
  if (params?.updatedAfter) qs.set('updatedAfter', params.updatedAfter)
  if (params?.updatedBefore) qs.set('updatedBefore', params.updatedBefore)
  const query = qs.toString()
  return request.get<unknown, ChannelItem[]>(`/notification-channels${query ? `?${query}` : ''}`)
}

/** 按 ID 查详情 */
export function getChannelDetail(id: number): Promise<ChannelItem> {
  return request.get<unknown, ChannelItem>(`/notification-channels/${id}`)
}

/** 新增渠道 */
export function createChannel(data: ChannelSaveDTO): Promise<number> {
  return request.post<unknown, number>('/notification-channels', data)
}

/** 更新渠道 */
export function updateChannel(id: number, data: ChannelSaveDTO): Promise<void> {
  return request.put(`/notification-channels/${id}`, data)
}

/** 删除渠道 */
export function deleteChannel(id: number): Promise<void> {
  return request.delete(`/notification-channels/${id}`)
}

/** 启停切换 */
export function toggleChannel(id: number, enabled: boolean): Promise<void> {
  return request.patch(`/notification-channels/${id}/toggle`, { enabled })
}

/** 发送测试消息 */
export function testChannel(id: number): Promise<string> {
  return request.post<unknown, string>(`/notification-channels/${id}/test`)
}

/** 企业内部应用读取契约：不包含任何密钥明文。 */
export interface AppNotificationConfig {
  id: number
  name: string
  platform: 'dingtalk'
  enabled: boolean
  remark: string
  updatedBy: string
  updatedAt: string
  scenarios: string[]
  appKey: string
  agentId: string
  baseUrl: string
  appSecretConfigured: boolean
  tokenSecretConfigured: boolean
}

/** AppSecret 留空/省略保留原值，更换 AppKey 时必须重新提供。 */
export interface AppNotificationConfigPayload {
  name: string
  remark?: string
  appKey: string
  appSecret?: string
  agentId: string
  baseUrl: string
}

export interface NotificationAppQuery {
  name?: string
  enabled?: boolean
}

export interface NotificationScenario {
  key: string
  name: string
  triggerDescription: string
  recipientRule: string
  appId: number | null
  appName: string | null
  enabled: boolean
  appEnabled: boolean
  updatedBy: string
  updatedAt: string
}

export interface NotificationScenarioPayload {
  appId: number | null
  enabled: boolean
}

export function fetchNotificationApps(params?: NotificationAppQuery, signal?: AbortSignal): Promise<AppNotificationConfig[]> {
  return request.get<unknown, AppNotificationConfig[]>('/notification-apps', {
    params, signal, headers: { [SILENT_HEADER]: '1' },
  })
}

export function fetchAppConfig(id: number, signal?: AbortSignal): Promise<AppNotificationConfig> {
  // 读取失败由页内错误态和重试按钮承接，卸载取消不弹出全局错误。
  return request.get<unknown, AppNotificationConfig>(`/notification-apps/${id}`, {
    signal, headers: { [SILENT_HEADER]: '1' },
  })
}

export async function saveAppConfig(data: AppNotificationConfigPayload, id?: number): Promise<void> {
  if (id === undefined) await request.post('/notification-apps', data)
  else await request.put(`/notification-apps/${id}`, data)
}

export function toggleNotificationApp(id: number, enabled: boolean): Promise<void> {
  return request.patch(`/notification-apps/${id}/toggle`, { enabled })
}

export function deleteNotificationApp(id: number): Promise<void> {
  return request.delete(`/notification-apps/${id}`)
}

/** 只验证指定应用已保存的凭证，不发送通知、不返回 token。 */
export function testAppConnection(id: number): Promise<void> {
  return request.post(`/notification-apps/${id}/test`)
}

export function fetchNotificationScenarios(signal?: AbortSignal): Promise<NotificationScenario[]> {
  return request.get<unknown, NotificationScenario[]>('/notification-apps/scenarios', {
    signal, headers: { [SILENT_HEADER]: '1' },
  })
}

export function saveNotificationScenario(key: string, data: NotificationScenarioPayload): Promise<void> {
  return request.put(`/notification-apps/scenarios/${encodeURIComponent(key)}`, data)
}
