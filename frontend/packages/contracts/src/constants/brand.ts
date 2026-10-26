/**
 * 全局品牌常量
 *
 * 公司品牌（闪蜂/mFood）已迁移至后端 sys_company_brand 表管理，
 * EAM 模块请通过 useCompanyBrand() hook 从后端动态加载。
 *
 * 本文件仅保留推广模块使用的字符串品牌选项（flashBee/mFood），
 * 这些与 EAM 的「公司品牌」是不同概念。
 */

// ─── 標籤文本（推广模块使用） ─────────────────────────────────
/** 品牌 1 的顯示名稱 */
export const BRAND_SHANFENG_LABEL = '閃蜂'
/** 品牌 2 的顯示名稱 */
export const BRAND_MFOOD_LABEL = 'mFood'

// ─── Select 選項（推广模块使用，字符串值） ─────────────────────
/** 帶「全部」的品牌選項（搜索篩選用） */
export const BRAND_OPTIONS_WITH_ALL = [
  { label: '全部', value: 'all' },
  { label: BRAND_MFOOD_LABEL, value: 'mFood' },
  { label: BRAND_SHANFENG_LABEL, value: 'flashBee' },
]

/** 不含「全部」的品牌選項（表單/編輯用） */
export const BRAND_OPTIONS = [
  { label: BRAND_MFOOD_LABEL, value: 'mFood' },
  { label: BRAND_SHANFENG_LABEL, value: 'flashBee' },
]

// ─── 判斷工具（推广模块使用） ─────────────────────────────────
/** 判斷是否為閃蜂（兼容多種數據格式） */
export const isShanfeng = (value: number | string | null | undefined): boolean => {
  if (value === 1 || value === '1') return true
  if (value === BRAND_SHANFENG_LABEL) return true
  if (typeof value === 'string') {
    const v = value.toLowerCase()
    if (v === 'shanfeng' || v === 'flashbee') return true
  }
  return false
}

/** 根據任意格式的品牌值取得顯示標籤 */
export const getBrandLabel = (value: number | string | null | undefined): string => {
  if (value == null) return ''
  if (typeof value === 'number') {
    const map: Record<number, string> = { 1: BRAND_SHANFENG_LABEL, 2: BRAND_MFOOD_LABEL }
    return map[value] || String(value)
  }
  const strMap: Record<string, string> = {
    flashBee: BRAND_SHANFENG_LABEL,
    mFood: BRAND_MFOOD_LABEL,
    '1': BRAND_SHANFENG_LABEL,
    '2': BRAND_MFOOD_LABEL,
    shanfeng: BRAND_SHANFENG_LABEL,
    flashbee: BRAND_SHANFENG_LABEL,
    mfood: BRAND_MFOOD_LABEL,
  }
  return strMap[value.toLowerCase()] || value
}
