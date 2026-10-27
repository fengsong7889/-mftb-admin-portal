/**
 * 耗材入库单共享元数据（列表 / 新建页 / 详情页共用，避免枚举文案分散硬编码）
 */

/** 入库类型 → i18n 文案 key + Tag 颜色 */
export const INBOUND_TYPE_MAP: Record<string, { labelKey: string; color: string }> = {
  in_purchase: { labelKey: 'consumable.typePurchase', color: 'blue' },
  in_manual: { labelKey: 'consumable.typeManual', color: 'green' },
  in_init: { labelKey: 'consumable.typeInit', color: 'default' },
}

/**
 * 手工建单可选类型：采购入库由采购验收流程自动生成，
 * 不允许在建档页手工选择，避免与采购单据形成两套来源。
 */
export const INBOUND_CREATE_TYPES = ['in_manual', 'in_init'] as const

/** 新建入库单明细行（表单内部结构，提交时映射为后端 items） */
export interface InboundLine {
  itemId?: number
  locationId?: number
  qty?: number
  unitPrice?: number
}
