/**
 * 推廣訂單共享枚舉
 *
 * AppType / RecommendChannel / Region / AlgorithmType 統一引用 Recommend/constants，
 * 此處僅定義訂單專屬枚舉。
 */

/** 订单状态枚举（取两个页面的并集） */
export enum OrderStatus {
  PENDING_PROMOTION = 1,
  PROMOTING = 2,
  PROMOTED = 3,
  REFUNDED = 4,
  CANCELLED = 5,
  ABORTED = 6,
}

/** 下单人类型枚举 */
export enum OrderOperatorType {
  MERCHANT = 1,  // 商家
  STAFF = 2,     // 业务人员
}
