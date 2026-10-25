/**
 * 接口文檔結構解析：把後端派生的 JSON 字符串轉成表格可用的節點樹，並計算文檔缺口。
 * 純函數，無 React 依賴，便於單測；舊數據缺字段時按空處理，不拋錯。
 */
import type { DocApiCatalogEntry } from '@/api/docCatalog'

export interface ApiFieldNode {
  path?: string
  name?: string
  type?: string
  typeLabel?: string
  required?: boolean | null
  description?: string | null
  enumValues?: string[]
  children?: ApiFieldNode[]
}

export interface ApiParamNode extends ApiFieldNode {
  location?: string
  annotations?: string[]
}

export interface ApiResponseSchema {
  raw: string
  fields: ApiFieldNode[]
}

export type DocGap = 'name' | 'schema' | 'example' | 'errors'

function safeParse(text?: string | null): unknown {
  if (!text || !text.trim()) return null
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function text(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined
}

function bool(value: unknown): boolean | null {
  return typeof value === 'boolean' ? value : null
}

function toNode(value: unknown): ApiFieldNode | null {
  if (!isRecord(value)) return null
  const name = text(value.name)
  if (!name) return null
  const node: ApiFieldNode = {
    name,
    path: text(value.path),
    type: text(value.type),
    typeLabel: text(value.typeLabel),
    required: bool(value.required),
    description: text(value.description),
  }
  if (Array.isArray(value.enumValues)) {
    node.enumValues = value.enumValues.filter((item): item is string => typeof item === 'string')
  }
  if (Array.isArray(value.children)) {
    const children = value.children.map(toNode).filter((item): item is ApiFieldNode => !!item)
    if (children.length) node.children = children
  }
  return node
}

export function toNodes(value: unknown): ApiFieldNode[] {
  return Array.isArray(value) ? value.map(toNode).filter((item): item is ApiFieldNode => !!item) : []
}

/** 請求參數表：location/required/description 為後端新增字段，舊數據缺失時按未標注處理。 */
export function parseRequestParams(entry: DocApiCatalogEntry | null): ApiParamNode[] {
  const parsed = safeParse(entry?.requestSchema)
  if (!Array.isArray(parsed)) return []
  return parsed.map(raw => {
    const node = toNode(raw)
    if (!node || !isRecord(raw)) return null
    const param: ApiParamNode = { ...node }
    param.location = text(raw.location)
    if (Array.isArray(raw.annotations)) {
      param.annotations = raw.annotations.filter((item): item is string => typeof item === 'string')
    }
    return param
  }).filter((item): item is ApiParamNode => !!item)
}

/** 出參結構：{ raw, fields }；空或損壞時返回空結構，由頁面顯示空態。 */
export function parseResponseSchema(entry: DocApiCatalogEntry | null): ApiResponseSchema {
  const parsed = safeParse(entry?.responseFields)
  if (!isRecord(parsed)) return { raw: '', fields: [] }
  return { raw: text(parsed.raw) ?? '', fields: toNodes(parsed.fields) }
}

/** 對外文檔是否可直接交付：名稱、出參結構、響應示例、錯誤碼四項缺一不可。 */
export function docGaps(entry: DocApiCatalogEntry): DocGap[] {
  const gaps: DocGap[] = []
  if (!entry.apiName?.trim()) gaps.push('name')
  if (parseResponseSchema(entry).fields.length === 0) gaps.push('schema')
  if (!entry.responseExample?.trim()) gaps.push('example')
  if (!entry.errorCodes?.trim()) gaps.push('errors')
  return gaps
}
