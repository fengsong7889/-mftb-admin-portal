/**
 * 门店品类字典（稳定编码 + 中文名），全系统唯一来源。
 * <p>
 * 用途：门店维护表单选择品类；金字招牌「{品類}」标签文案取门店自身品类
 * （如 hotpot → 「全澳火鍋熱門店鋪」），门店未配置品类时文案降级为不带品类。
 * <p>
 * 与后端 {@code com.mftb.admin.constant.StoreCategory} 同源，增删品类必须两端同步。
 */
export const STORE_CATEGORY_LABEL_MAP: Record<string, string> = {
  chinese: '中餐',
  western: '西餐',
  hotpot: '火鍋',
  japanese: '日式料理',
  korean: '韓式料理',
  southeast_asian: '東南亞料理',
  dessert: '甜品',
  snack: '小食',
  drink: '飲品',
  bakery: '烘焙',
  bbq: '燒烤',
  vegetarian: '素食',
  other: '其他',
}

/** 门店品类下拉选项 */
export const STORE_CATEGORY_OPTIONS = Object.entries(STORE_CATEGORY_LABEL_MAP).map(
  ([value, label]) => ({ label, value }),
)

/** 品类编码 → 展示名；未知/空编码返回 null，由调用方决定降级展示 */
export function storeCategoryLabel(value?: string | null): string | null {
  if (!value) return null
  return STORE_CATEGORY_LABEL_MAP[value.trim()] ?? null
}

/** 品类展示文本（列表/详情用，缺失显示 '-'） */
export function formatStoreCategory(value?: string | null): string {
  return storeCategoryLabel(value) ?? '-'
}
