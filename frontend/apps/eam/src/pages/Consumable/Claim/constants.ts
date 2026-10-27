/**
 * 耗材领用状态常量（避免魔法字符串，列表/详情共用）
 */
export type ClaimStatus = 'pending' | 'approved' | 'rejected' | 'issued' | 'cancelled'

/**
 * 状态 → i18n 文案 key（列表/详情统一走 t() 渲染，避免多处维护语言文案）
 * 文案定义在 src/i18n/locales/{zh-TW,en}.json 的 consumable 段
 */
export const CLAIM_STATUS_LABEL_KEY: Record<ClaimStatus, string> = {
  pending: 'consumable.statusPending',
  approved: 'consumable.statusApproved',
  rejected: 'consumable.statusRejected',
  issued: 'consumable.statusIssued',
  cancelled: 'consumable.statusCancelled',
}

/** 状态下拉选项顺序（Select options 按此顺序渲染） */
export const CLAIM_STATUS_ORDER: ClaimStatus[] = ['pending', 'approved', 'rejected', 'issued', 'cancelled']

/** antd Tag 颜色 */
export const CLAIM_STATUS_COLOR: Record<ClaimStatus, string> = {
  pending: 'processing',
  approved: 'warning',
  rejected: 'error',
  issued: 'success',
  cancelled: 'default',
}

/** 出入库流水类型标签 */
export const TXN_TYPE_LABEL: Record<string, string> = {
  in_purchase: '採購入庫',
  in_manual: '手工入庫',
  in_adjust: '盤盈調整',
  out_claim: '領用出庫',
  out_adjust: '盤虧調整',
}

export const TXN_TYPE_COLOR: Record<string, string> = {
  in_purchase: 'blue',
  in_manual: 'cyan',
  in_adjust: 'green',
  out_claim: 'orange',
  out_adjust: 'red',
}
