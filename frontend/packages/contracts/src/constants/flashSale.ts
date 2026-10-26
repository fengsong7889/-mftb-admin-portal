/**
 * 秒杀模块常量（登记/统计/总览共用）
 * 补贴类型/商品类型与后端 biz_flash_sale_* 表枚举一致
 */

/** 补贴类型（Excel 实际 5 类） */
export const SUBSIDY_TYPE = {
  KA: 'ka',
  PROCUREMENT: 'procurement',
  BD_SUBMIT: 'bd_submit',
  PLATFORM: 'platform',
  MERCHANT: 'merchant',
} as const

export const SUBSIDY_TYPE_LABEL: Record<string, string> = {
  [SUBSIDY_TYPE.KA]: 'KA補貼',
  [SUBSIDY_TYPE.PROCUREMENT]: '採購補貼',
  [SUBSIDY_TYPE.BD_SUBMIT]: 'BD提報',
  [SUBSIDY_TYPE.PLATFORM]: '平台建議',
  [SUBSIDY_TYPE.MERCHANT]: '商家報名',
}

export const SUBSIDY_TYPE_TAG_COLOR: Record<string, string> = {
  [SUBSIDY_TYPE.KA]: 'orange',
  [SUBSIDY_TYPE.PROCUREMENT]: 'blue',
  [SUBSIDY_TYPE.BD_SUBMIT]: 'cyan',
  [SUBSIDY_TYPE.PLATFORM]: 'purple',
  [SUBSIDY_TYPE.MERCHANT]: 'green',
}

export const SUBSIDY_TYPE_OPTIONS = Object.entries(SUBSIDY_TYPE_LABEL).map(([value, label]) => ({ value, label }))

/** 补贴品判定: 除商家報名外均為補貼品（与 Excel「是否補貼品」列一致） */
export const SUBSIDIZED_TYPES: string[] = [
  SUBSIDY_TYPE.KA,
  SUBSIDY_TYPE.PROCUREMENT,
  SUBSIDY_TYPE.BD_SUBMIT,
  SUBSIDY_TYPE.PLATFORM,
]

/** 是否补贴品: 否 */
export const SUBSIDY_NONE = 'none'
/** 上期有无补贴: 无上期数据 */
export const LAST_PERIOD_NONE_DATA = 'none_data'

/** 商品类型 */
export const FLASH_PRODUCT_TYPE = {
  TUAN_DAN: 'tuan_dan',
  VOUCHER: 'voucher',
} as const

export const FLASH_PRODUCT_TYPE_LABEL: Record<string, string> = {
  [FLASH_PRODUCT_TYPE.TUAN_DAN]: '團單',
  [FLASH_PRODUCT_TYPE.VOUCHER]: '代金券',
}

export const FLASH_PRODUCT_TYPE_OPTIONS = Object.entries(FLASH_PRODUCT_TYPE_LABEL).map(([value, label]) => ({ value, label }))

/** 价格类型（复用 PRICE_FLAG 语义: single/tier） */
export const FLASH_PRICE_TYPE = {
  SINGLE: 'single',
  TIER: 'tier',
} as const

export const FLASH_PRICE_TYPE_LABEL: Record<string, string> = {
  [FLASH_PRICE_TYPE.SINGLE]: '單一價格',
  [FLASH_PRICE_TYPE.TIER]: '階梯價格',
}

/** 每人最多购买常用预设（可自定义） */
export const MAX_PURCHASE_PRESETS = ['不限購', '限購1', '每人1份', '每人限購1', '階梯限購1']

/** 补贴类型中文 -> 枚举（导入解析用） */
export const SUBSIDY_TYPE_LABEL_REVERSE: Record<string, string> = Object.entries(SUBSIDY_TYPE_LABEL)
  .reduce<Record<string, string>>((acc, [value, label]) => {
    acc[label] = value
    return acc
  }, {})

/** 商品类型中文 -> 枚举（导入解析用，兼容简体「团单」） */
export const FLASH_PRODUCT_TYPE_LABEL_REVERSE: Record<string, string> = {
  團單: FLASH_PRODUCT_TYPE.TUAN_DAN,
  团单: FLASH_PRODUCT_TYPE.TUAN_DAN,
  代金券: FLASH_PRODUCT_TYPE.VOUCHER,
}

/** 价格类型中文 -> 枚举（导入解析用） */
export const FLASH_PRICE_TYPE_LABEL_REVERSE: Record<string, string> = {
  單一價格: FLASH_PRICE_TYPE.SINGLE,
  階梯價格: FLASH_PRICE_TYPE.TIER,
}
