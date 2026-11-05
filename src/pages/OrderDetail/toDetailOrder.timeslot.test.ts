/**
 * Copyright (c) 2026 fengsong7889. All Rights Reserved.
 *
 * 本文件为「MFTB 企业一体化管理平台软件」的组成部分。
 * 未经著作权人书面许可，不得使用、复制、修改、再分发或用于任何商业目的。
 * 完整许可条款见仓库根目录 LICENSE 文件。
 */
/**
 * toDetailOrder 時段推薦(16)兩段式折扣口徑單測：
 * 折扣列=純時段折扣、折後價=原價×時段折扣、timeSlotSummary 按去重天數命中天數檔位。
 */
import { describe, it, expect } from 'vitest'
import { toDetailOrder } from './mockOrderData'
import type { AdOrderDetail } from '@/api/adPromotion'

/** 構造时段推荐订单 VO：午餐 100×2 天(9折)、晚餐 200×1 天(8折) */
function buildVo(): AdOrderDetail {
  return {
    orderNo: 'DDSD2026110400000',
    algoType: 16,
    algoId: 1,
    algoName: '第一个时段推荐的广告',
    algoCode: 'DJSD202611040000',
    brand: 'flashBee',
    channel: 2,
    groupCode: 'JT000001',
    groupName: '测试集团',
    storeCode: 'MD000009',
    storeName: '澳门总店',
    status: 1,
    orderTime: 1762238388000,
    payTime: 1762238388000,
    itemCount: 3,
    originalAmount: 400,
    discountAmount: 60,
    actualAmount: 340,
    refundAmount: 0,
    giftDays: 0,
    giftAmount: 0,
    refundEnabled: 1,
    regions: [],
    items: [
      { id: 1, bizDate: '2026-11-04', mealSlot: '午餐', originalPrice: 100, salePrice: 90 },
      { id: 2, bizDate: '2026-11-05', mealSlot: '午餐', originalPrice: 100, salePrice: 90 },
      { id: 3, bizDate: '2026-11-04', mealSlot: '晚餐', originalPrice: 200, salePrice: 160 },
    ],
  } as unknown as AdOrderDetail
}

const slotPricing = {
  slots: [
    { slotName: '午餐', discountEnabled: true, discount: 9 },
    { slotName: '晚餐', discountEnabled: true, discount: 8 },
  ],
}

describe('toDetailOrder 時段推薦兩段式折扣', () => {
  it('有定價配置：折扣列為純時段折扣，折後價=原價×時段折扣', () => {
    const order = toDetailOrder(buildVo(), undefined, { ...slotPricing, daysTiers: [] })
    expect(order.slotPrices[0]).toMatchObject({ slot: '午餐', discount: 9, actualPrice: 90 })
    expect(order.slotPrices[2]).toMatchObject({ slot: '晚餐', discount: 8, actualPrice: 160 })
  })

  it('未達天數門檻：dayTier=null，折後價=時段折後小計', () => {
    const order = toDetailOrder(buildVo(), undefined, { ...slotPricing, daysTiers: [{ minDays: 10, discount: 8 }] })
    const ts = order.timeSlotSummary!
    expect(ts.slotAfterSubtotal).toBe(340)
    expect(ts.slotDiscountAmount).toBe(60)
    expect(ts.distinctDays).toBe(2)
    expect(ts.dayTier).toBeNull()
    expect(ts.dayDiscountAmount).toBe(0)
    expect(ts.finalSubtotal).toBe(340)
  })

  it('命中天數檔位：按去重天數匹配，finalSubtotal=小計×檔位倍率', () => {
    const order = toDetailOrder(buildVo(), undefined, { ...slotPricing, daysTiers: [{ minDays: 2, discount: 8.5 }] })
    const ts = order.timeSlotSummary!
    expect(ts.dayTier).toEqual({ minDays: 2, discount: 8.5 })
    expect(ts.finalSubtotal).toBe(289) // 340 × 0.85
    expect(ts.dayDiscountAmount).toBe(51)
  })

  it('同一日期跨兩個時段只算一天（去重口徑）', () => {
    const order = toDetailOrder(buildVo(), undefined, { ...slotPricing, daysTiers: [{ minDays: 3, discount: 8 }] })
    // 3 格但去重日期只有 11-04/11-05 兩天 → 未滿 3 天不命中
    expect(order.timeSlotSummary!.distinctDays).toBe(2)
    expect(order.timeSlotSummary!.dayTier).toBeNull()
  })

  it('定價配置缺失：降級舊反推邏輯，不產出 timeSlotSummary', () => {
    const order = toDetailOrder(buildVo())
    expect(order.timeSlotSummary).toBeUndefined()
    // salePrice/originalPrice=90/100 → 反推 9 折
    expect(order.slotPrices[0].discount).toBe(9)
  })
})
