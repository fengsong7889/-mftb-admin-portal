/**
 * AI 供应商管理 API
 * 供应商（Provider）是接入 LLM 服务的第三方平台，如阿里云百炼、DeepSeek 等
 */
import request, { TOKEN_KEY } from './request'

/** 供应商类型：公有云 / 私有化 */
export type ProviderType = 'cloud' | 'private'

/** 启用状态 */
export type EnabledStatus = 0 | 1

/**
 * API Key 可用状态——与后端 AiProviderDTO.API_KEY_* 常量一一对应。
 *
 * STALE 是本次改造新增的第三态：库里存过密文、但当前加密密钥解不开
 * （典型成因是轮换 JWT_SECRET 后旧密文作废）。它和 UNSET 的处置动作完全不同——
 * 前者要「重填」，后者要「去配」，合并显示会让管理员误判为「没保存成功」。
 */
export const AI_API_KEY_STATUS = {
  /** 从未配置 */
  UNSET: 0,
  /** 已配置且可正常使用 */
  OK: 1,
  /** 配过但当前加密密钥解不开，需重新填写 */
  STALE: 2,
} as const

/** 解析列表行的 Key 状态；旧后端未回 apiKeyStatus 时按脱敏串兜底，避免升级顺序导致全部显示未配置 */
export function resolveApiKeyStatus(row: Pick<AiProvider, 'apiKeyStatus' | 'apiKeyMasked'>): number {
  if (row.apiKeyStatus != null) return row.apiKeyStatus
  return row.apiKeyMasked && row.apiKeyMasked.length > 0 ? AI_API_KEY_STATUS.OK : AI_API_KEY_STATUS.UNSET
}

/** 供应商响应对象 - 与后端 AiProviderDTO.ProviderVO 对应 */
export interface AiProvider {
  id: number
  providerKey: string
  name: string
  description?: string
  apiUrlBase?: string
  apiKeyMasked?: string
  /** 0=未配置 1=已配置 2=密钥已失效（解不开，需重填）；由服务端实算，不信前端传值 */
  apiKeyStatus?: number
  status: EnabledStatus
  isDefault?: number
  configJson?: string
  sortOrder?: number
  createdAt?: string
  updatedAt?: string
}

/** 供应商查询参数 - 与后端 AiProviderDTO.ProviderQueryRequest 对应 */
export interface ProviderQueryParams {
  providerKey?: string
  name?: string
  status?: number
}

/** 新增/编辑供应商请求 - 与后端 AiProviderDTO.ProviderSaveRequest 对应 */
export interface ProviderSaveRequest {
  providerKey: string
  name: string
  description?: string
  apiUrlBase?: string
  apiKey?: string
  status?: number
  isDefault?: number
  configJson?: string
  sortOrder?: number
}

/** 
 * 查询供应商列表
 */
export function fetchProviders(params?: ProviderQueryParams): Promise<AiProvider[]> {
  return request.get('/ai/providers', { params })
}

/** 
 * 获取单个供应商详情
 */
export function getProviderById(id: number): Promise<AiProvider> {
  return request.get(`/ai/providers/${id}`)
}

/** 
 * 新增供应商
 */
export function createProvider(data: ProviderSaveRequest): Promise<boolean> {
  return request.post('/ai/providers', data)
}

/** 
 * 更新供应商
 */
export function updateProvider(id: number, data: ProviderSaveRequest): Promise<boolean> {
  return request.put(`/ai/providers/${id}`, data)
}

/** 
 * 删除供应商
 */
export function deleteProvider(id: number): Promise<boolean> {
  return request.delete(`/ai/providers/${id}`)
}
