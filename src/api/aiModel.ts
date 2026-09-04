/**
 * AI 模型信息管理 API
 * 模型是 LLM 服务的具体规格（如 GPT-4o、Claude 3.5 Sonnet 等），归属于某个供应商
 *
 * 2026-09 整改：
 * - 增加能力维度（visionSupport/functionCalling/jsonMode/streaming/thinkingMode）
 * - 增加多模态（modalities）与 API 兼容（apiCompat）
 * - 增加计费扩展（cachedInputPrice/currency）与限流（concurrencyLimit）
 * - 增加模型版本（version）
 */
import request from './request'
import type { EnabledStatus } from './aiProvider'

/** 复用供应商模块的启用状态类型，避免重复导出冲突 */
export type { EnabledStatus }

/** 模型类型 */
export type ModelType = 'chat' | 'completion' | 'embedding' | 'token_count'

/** API 兼容格式 */
export type ApiCompat = 'openai' | 'anthropic' | 'gemini'

/** 模态类型 */
export type Modality = 'text' | 'image' | 'audio' | 'video'

/** 计费币种 */
export type Currency = 'CNY' | 'USD'

/** 模型响应对象 - 与后端 AiModelDTO.ModelVO 对应 */
export interface AiModel {
  id: number
  providerId: number | null
  /** 关联供应商名称（后端关联查询填充） */
  providerName?: string | null
  modelKey: string
  name: string
  /** 模型版本号 */
  version?: string
  description?: string
  /** API 兼容格式 */
  apiCompat?: ApiCompat
  /** 支持模态（逗号分隔） */
  modalities?: string
  /** 是否支持图像理解 */
  visionSupport?: 0 | 1
  /** 是否支持工具调用 */
  functionCalling?: 0 | 1
  /** 是否支持 JSON 模式 */
  jsonMode?: 0 | 1
  /** 是否支持流式响应 */
  streaming?: 0 | 1
  /** 是否支持思考模式 */
  thinkingMode?: 0 | 1
  type?: ModelType
  /** 部署类型：cloud=公有云 private=私有化部署（數據不出域策略僅可選私有化模型） */
  deployType?: 'cloud' | 'private'
  contextWindow?: number
  maxOutputTokens?: number
  inputPrice?: number
  outputPrice?: number
  /** 缓存命中价（部分模型支持） */
  cachedInputPrice?: number
  currency?: Currency
  /** 并发限制 (TPM) */
  concurrencyLimit?: number
  status: EnabledStatus
  sortOrder?: number
  updatedBy?: string
  createdAt?: string
  updatedAt?: string
}

/** 模型查询参数 - 与后端 AiModelDTO.ModelQueryRequest 对应 */
export interface ModelQueryParams {
  modelKey?: string
  name?: string
  type?: string
  status?: number
  /** 模态过滤：text/image/audio/video */
  modality?: string
}

/** 新增/编辑模型请求 - 与后端 AiModelDTO.ModelSaveRequest 对应 */
export interface ModelSaveRequest {
  modelKey: string
  name: string
  providerId?: number
  version?: string
  description?: string
  apiCompat?: ApiCompat
  modalities?: string
  visionSupport?: 0 | 1
  functionCalling?: 0 | 1
  jsonMode?: 0 | 1
  streaming?: 0 | 1
  thinkingMode?: 0 | 1
  type?: string
  /** 部署类型：cloud=公有云 private=私有化部署 */
  deployType?: 'cloud' | 'private'
  contextWindow?: number
  maxOutputTokens?: number
  inputPrice?: number
  outputPrice?: number
  cachedInputPrice?: number
  currency?: Currency
  concurrencyLimit?: number
  status?: number
  sortOrder?: number
  updatedBy?: string
}

/**
 * 查询模型列表
 */
export function fetchModels(params?: ModelQueryParams): Promise<AiModel[]> {
  return request.get('/ai/models', { params })
}

/**
 * 获取单个模型详情
 */
export function getModelById(id: number): Promise<AiModel> {
  return request.get(`/ai/models/${id}`)
}

/**
 * 新增模型
 */
export function createModel(data: ModelSaveRequest): Promise<boolean> {
  return request.post('/ai/models', data)
}

/**
 * 更新模型
 */
export function updateModel(id: number, data: ModelSaveRequest): Promise<boolean> {
  return request.put(`/ai/models/${id}`, data)
}

/**
 * 删除模型
 */
export function deleteModel(id: number): Promise<boolean> {
  return request.delete(`/ai/models/${id}`)
}

/**
 * 工具函数：解析模态字符串为数组
 */
export function parseModalities(modalities?: string): Modality[] {
  if (!modalities) return []
  return modalities.split(',').map((s) => s.trim()).filter(Boolean) as Modality[]
}

/**
 * 工具函数：判断模型是否支持指定模态
 */
export function hasModality(model: AiModel, modality: Modality): boolean {
  return parseModalities(model.modalities).includes(modality)
}
