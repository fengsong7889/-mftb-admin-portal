/**
 * 系统配置 API
 * 供规则配置页面同步配置值到后端 DB（如空闲超时时间）
 */
import request from './request'

/** 读取指定 key 的配置值 */
export function getSystemConfig(key: string): Promise<{ key: string; value: string }> {
  return request.get(`/sys-config/${key}`)
}

/** 更新指定 key 的配置值 */
export function updateSystemConfig(key: string, value: string): Promise<void> {
  return request.put(`/sys-config/${key}`, { value })
}
