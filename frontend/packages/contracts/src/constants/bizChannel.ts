/**
 * 業務頻道全局統一枚舉（對應系統規範字段枚舉值）
 * 1=美食外賣 2=超市百貨 3=團購到店
 */
export const BIZ_CHANNEL = {
  FOOD_DELIVERY: '1',
  SUPERMARKET: '2',
  GROUP_BUY: '3',
} as const

export type BizChannelValue = (typeof BIZ_CHANNEL)[keyof typeof BIZ_CHANNEL]

/** 業務頻道碼值 -> 中文標籤 */
export const BIZ_CHANNEL_LABEL_MAP: Record<string, string> = {
  [BIZ_CHANNEL.FOOD_DELIVERY]: '美食外賣',
  [BIZ_CHANNEL.SUPERMARKET]: '超市百貨',
  [BIZ_CHANNEL.GROUP_BUY]: '團購到店',
}

/** 業務頻道下拉選項 */
export const BIZ_CHANNEL_OPTIONS = Object.entries(BIZ_CHANNEL_LABEL_MAP).map(
  ([value, label]) => ({ label, value }),
)

/**
 * 格式化業務頻道展示文本（支持逗號分隔多值，如 "1,2" -> "美食外賣、超市百貨"）
 */
export function formatBizChannel(value?: string | null): string {
  if (!value) return '-'
  return value
    .split(',')
    .map(v => v.trim())
    .filter(Boolean)
    .map(v => BIZ_CHANNEL_LABEL_MAP[v] || v)
    .join('、')
}
