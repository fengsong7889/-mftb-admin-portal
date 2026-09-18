/**
 * 通知渠道配置 API
 * 支持多平台、多场景、多渠道 CRUD 及测试
 */
import request from './request'

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
