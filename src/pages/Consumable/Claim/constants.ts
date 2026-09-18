/**
 * 耗材领用状态常量（避免魔法字符串，列表/详情共用）
 */
export type ClaimStatus = 'pending' | 'approved' | 'rejected' | 'issued' | 'cancelled'

export const CLAIM_STATUS_LABEL: Record<ClaimStatus, string> = {
  pending: '待審批',
  approved: '待出庫',
  rejected: '已駁回',
  issued: '已出庫',
  cancelled: '已撤銷',
}

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
