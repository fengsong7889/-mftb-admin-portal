/**
 * 系统配置 API
 * 供规则配置页面同步配置值到后端 DB（如空闲超时时间）
 */
import request, { SILENT_HEADER } from './request'

/** 读取指定 key 的配置值 */
export function getSystemConfig(key: string): Promise<{ key: string; value: string }> {
  return request.get(`/sys-config/${key}`)
}

/**
 * 静默读取配置值：key 不存在或后端不可用时返回 null，不弹错误提示
 * 适用于「配置可选、缺失即走默认值」的场景（如 AI 模型账号白名单）
 */
export function getSystemConfigSilent(key: string): Promise<string | null> {
  return request
    .get<unknown, { key: string; value: string } | null>(`/sys-config/${key}`, { headers: { [SILENT_HEADER]: '1' } })
    .then((res) => res?.value ?? null)
    .catch(() => null)
}

/** 更新指定 key 的配置值 */
export function updateSystemConfig(key: string, value: string): Promise<void> {
  return request.put(`/sys-config/${key}`, { value })
}
