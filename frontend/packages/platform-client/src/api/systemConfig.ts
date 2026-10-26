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

/**
 * 批量读取配置值（规则配置页一次拉取整版块，避免 N 次单 key 往返）。
 * @param keys 需要读取的 config key 列表
 * @returns key → 值；后端不存在或本地专用的 key 不会出现在结果中
 */
export function batchGetSystemConfig(keys: string[]): Promise<Record<string, string>> {
  if (keys.length === 0) return Promise.resolve({})
  return request.get('/sys-config/batch', { params: { keys: keys.join(',') } })
}

/** 静默批量读取：后端不可用时返回空映射，不弹错误提示 */
export function batchGetSystemConfigSilent(keys: string[]): Promise<Record<string, string>> {
  if (keys.length === 0) return Promise.resolve({})
  return request
    .get<unknown, Record<string, string>>('/sys-config/batch', {
      params: { keys: keys.join(',') },
      headers: { [SILENT_HEADER]: '1' },
    })
    .then((res) => res ?? {})
    .catch(() => ({}))
}

/**
 * 批量更新配置值（单事务落库）。失败时抛出，由调用方决定提示。
 * @param values key → 新值（本地专用布尔 key 由后端自动跳过）
 */
export function batchUpdateSystemConfig(values: Record<string, string>): Promise<void> {
  return request.put('/sys-config/batch', values)
}
