/**
 * AI 供应商管理 API
 * 供应商（Provider）是接入 LLM 服务的第三方平台，如阿里云百炼、DeepSeek 等
 */
import request, { TOKEN_KEY } from './request'

/** 供应商类型：公有云 / 私有化 */
export type ProviderType = 'cloud' | 'private'

/** 启用状态 */
export type EnabledStatus = 0 | 1

/** 供应商响应对象 - 与后端 AiProviderDTO.ProviderVO 对应 */
export interface AiProvider {
  id: number
  providerKey: string
  name: string
  description?: string
  apiUrlBase?: string
  apiKeyMasked?: string
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
