import type { AssetCategory, ParamField, ParamType } from '../api/eam'

/** 兼容台账对象及历史业务接口的 JSON 字符串；参数值仅取实物记录。 */
export interface AssetParameterSource {
  params?: unknown
  categoryCode?: string | null
  categoryId?: number | null
}

export interface AssetParameterCatalog {
  categories: AssetCategory[]
  types: ParamType[]
}

export function normalizeAssetParams(value: unknown): Record<string, string> {
  if (typeof value === 'string') {
    try { value = JSON.parse(value) } catch { return {} }
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return Object.fromEntries(Object.entries(value).flatMap(([key, item]) => {
    if (typeof item === 'string' || typeof item === 'number' || typeof item === 'boolean') {
      return [[key, String(item).trim()]]
    }
    if (Array.isArray(item) && item.every(v => ['string', 'number', 'boolean'].includes(typeof v))) {
      return [[key, item.map(String).join('、')]]
    }
    return []
  }))
}

/** 分类内解析名称，子分类覆盖父分类；保留已停用/已删除定义对应的历史实物值。 */
export function assetParameterFields(source: AssetParameterSource, catalog: AssetParameterCatalog): ParamField[] {
  const values = normalizeAssetParams(source.params)
  const code = source.categoryCode || catalog.categories.find(c => c.id === source.categoryId)?.code
  const fields = new Map<string, ParamField>()
  if (code) {
    catalog.categories.filter(c => code.startsWith(c.code)).sort((a, b) => a.code.length - b.code.length)
      .forEach(c => (c.paramTemplate || []).forEach(f => fields.set(f.key, f)))
    catalog.types.filter(p => code.startsWith(p.categoryCode) && (p.status === 'enabled' || p.code in values))
      .sort((a, b) => a.categoryCode.length - b.categoryCode.length || a.sort - b.sort)
      .forEach(p => fields.set(p.code, { key: p.code, label: p.name, type: p.valueType, unit: p.unit }))
  }
  Object.keys(values).forEach(key => {
    if (!fields.has(key)) fields.set(key, { key, label: key, type: 'text' })
  })
  return [...fields.values()]
}
