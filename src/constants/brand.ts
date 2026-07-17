/**
 * 全局品牌常量
 * 所有品牌相關的枚舉值、標籤、選項統一由此導出，改一處即全局生效。
 *
 * 所屬品牌：1=閃蜂, 2=mFood
 */

// ─── 標籤文本 ───────────────────────────────────────────────
/** 品牌 1 的顯示名稱 */
export const BRAND_SHANFENG_LABEL = '閃蜂'
/** 品牌 2 的顯示名稱 */
export const BRAND_MFOOD_LABEL = 'mFood'

// ─── 數值枚舉 ───────────────────────────────────────────────
/** 所屬品牌數值枚舉（與後端約定一致） */
export enum BrandEnum {
  SHANFENG = 1,
  MFOOD = 2,
}

// ─── 標籤映射 ───────────────────────────────────────────────
/** 數值 → 標籤 */
export const BRAND_LABEL_MAP: Record<number, string> = {
  [BrandEnum.SHANFENG]: BRAND_SHANFENG_LABEL,
  [BrandEnum.MFOOD]: BRAND_MFOOD_LABEL,
}

/** 字符串值 → 標籤（兼容 flashBee / mFood / 1 / 2 等） */
export const BRAND_LABEL_FROM_STR: Record<string, string> = {
  flashBee: BRAND_SHANFENG_LABEL,
  mFood: BRAND_MFOOD_LABEL,
  '1': BRAND_SHANFENG_LABEL,
  '2': BRAND_MFOOD_LABEL,
  shanfeng: BRAND_SHANFENG_LABEL,
  flashbee: BRAND_SHANFENG_LABEL,
  mfood: BRAND_MFOOD_LABEL,
}

// ─── Select 選項 ────────────────────────────────────────────
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

/** 數值枚舉版品牌選項（推薦系統等使用數值 brand 的場景） */
export const BRAND_OPTIONS_NUMERIC = [
  { label: BRAND_SHANFENG_LABEL, value: BrandEnum.SHANFENG },
  { label: BRAND_MFOOD_LABEL, value: BrandEnum.MFOOD },
]

// ─── 判斷工具 ───────────────────────────────────────────────
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
  if (typeof value === 'number') return BRAND_LABEL_MAP[value] || String(value)
  return BRAND_LABEL_FROM_STR[value.toLowerCase()] || value
}
