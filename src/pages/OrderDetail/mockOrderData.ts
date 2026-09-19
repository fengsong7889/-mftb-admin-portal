import i18n from 'i18next'
import dayjs from 'dayjs'
import { AlgorithmType, REGION_LABEL_KEY } from '../Recommend/constants'
import {
  OrderStatus, AppType, RecommendChannel,
  type OrderItem, type SlotPriceItem, type PromoRecord,
  RecommendType, MEAL_SLOT_LABEL,
  mapAdChannel, mapAdStatus,
} from './orderUtils'
import { brandToAppType, type AdOrderDetail } from '../../api/adPromotion'

/* ---- 推广数据 Mock ---- */
const WATERFALL_NAMES = ['推荐瀑布流A', '推荐瀑布流B', '精选瀑布流C']

function genInvincibleStarPromoData(regionName: string, slots: SlotPriceItem[]): PromoRecord[] {
  const dateMap = new Map<string, SlotPriceItem[]>()
  slots.forEach(sp => {
    if (!dateMap.has(sp.date)) dateMap.set(sp.date, [])
    dateMap.get(sp.date)!.push(sp)
  })
  const records: PromoRecord[] = []
  Array.from(dateMap.entries()).forEach(([date, daySlots]) => {
    daySlots.forEach((sp, i) => {
      const imp = 800 + i * 320 + Math.floor(Math.random() * 500)
      const clk = 60 + i * 25 + Math.floor(Math.random() * 40)
      const slotRegion = sp.region !== undefined ? (REGION_LABEL_KEY[sp.region] ? i18n.t(REGION_LABEL_KEY[sp.region]) : regionName) : regionName
      records.push({
        date, region: slotRegion,
        waterfallName: WATERFALL_NAMES[i % WATERFALL_NAMES.length],
        position: (i % 5) + 1, slot: sp.slot,
        impressions: imp, clicks: clk,
        clickRate: +((clk / imp) * 100).toFixed(1),
      })
    })
  })
  return records
}

function genRevivePromoData(regionName: string, slots: SlotPriceItem[]): PromoRecord[] {
  return slots.map((sp, i) => {
    const imp = 1200 + i * 280 + Math.floor(Math.random() * 600)
    const clk = 90 + i * 18 + Math.floor(Math.random() * 50)
    return {
      date: sp.date, region: regionName,
      waterfallName: WATERFALL_NAMES[i % WATERFALL_NAMES.length],
      position: (i % 3) + 1,
      impressions: imp, clicks: clk,
      clickRate: +((clk / imp) * 100).toFixed(1),
    }
  })
}

function genNewStorePromoData(regionName: string, purchaseDays: string[]): PromoRecord[] {
  return purchaseDays.map((date, i) => {
    const imp = 1000 + i * 250 + Math.floor(Math.random() * 500)
    const clk = 80 + i * 15 + Math.floor(Math.random() * 40)
    return {
      date, region: regionName,
      waterfallName: WATERFALL_NAMES[i % WATERFALL_NAMES.length],
      position: (i % 3) + 1,
      impressions: imp, clicks: clk,
      clickRate: +((clk / imp) * 100).toFixed(1),
    }
  })
}

/** 人气商家推广数据：按购买日期逐天生成（与新店广告结构一致，单商圈平铺） */
function genPopularPromoData(regionName: string, purchaseDays: string[]): PromoRecord[] {
  return purchaseDays.map((date, i) => {
    const imp = 900 + i * 220 + Math.floor(Math.random() * 450)
    const clk = 70 + i * 12 + Math.floor(Math.random() * 35)
    return {
      date, region: regionName,
      waterfallName: WATERFALL_NAMES[i % WATERFALL_NAMES.length],
      position: (i % 3) + 1,
      impressions: imp, clicks: clk,
      clickRate: +((clk / imp) * 100).toFixed(1),
    }
  })
}

/** 后端订单详情 → 详情页 OrderItem（明细折扣还原为定价配置的时段折扣口径） */
export function toDetailOrder(
  vo: AdOrderDetail,
  pricing?: {
    cancelFeeRules: { maxDays: number; feePercent: number }[]
    refundEnabled: boolean
    discountTiers: { minSlots: number; discount: number }[]
  },
): OrderItem {
  // 后端 LocalDateTime 统一序列化为毫秒时间戳，兼容字符串/数字两种格式
  const fmt = (t?: string | number) => {
    if (t == null || t === '') return ''
    if (typeof t === 'number') return dayjs(t).format('YYYY-MM-DD HH:mm:ss')
    return String(t).replace('T', ' ').slice(0, 19)
  }
  // 匹配梯度折扣（与后端同算法: minSlots 降序取第一个满足格子数的梯度）
  const cellCount = vo.itemCount ?? vo.items.length
  const matchedTier = [...(pricing?.discountTiers ?? [])]
    .sort((a, b) => b.minSlots - a.minSlots)
    .find(t => cellCount >= t.minSlots)
  const tierPct = matchedTier ? matchedTier.discount : 100
  // 明细 salePrice 已是梯度折后价（含实付分摊）：还原为折前价再参与费用明细计算，
  // 避免梯度折扣在 finalPrice = subtotal × 梯度倍率 中被重复乘两次
  // 赠送抵扣分摊还原：明细 salePrice 按抵扣后实付分摊，有抵扣时先还原为抵扣前（折后）价再还原梯度
  const actualTotalVo = vo.actualAmount ?? 0
  const giftTotalVo = vo.giftAmount ?? 0
  const sumSaleVo = vo.items.reduce((s, i) => s + i.salePrice, 0)
  const giftRatio = sumSaleVo > 0 && actualTotalVo + giftTotalVo > 0 ? (actualTotalVo + giftTotalVo) / sumSaleVo : 1
  const slotPrices: SlotPriceItem[] = vo.items.map(item => {
    // 纯赠送抵扣时 salePrice=0，无法反推 → 直接用 originalPrice × 梯度折扣
    let afterSlot: number
    if (item.salePrice > 0) {
      afterSlot = tierPct > 0 ? (item.salePrice * giftRatio / tierPct) * 100 : item.salePrice * giftRatio
    } else {
      afterSlot = tierPct > 0 ? item.originalPrice * tierPct / 100 : item.originalPrice
    }
    const discount = item.originalPrice > 0
      ? Math.min(10, Math.max(1, Math.round((afterSlot / item.originalPrice) * 10)))
      : 10
    return {
      slot: item.mealSlot ? (MEAL_SLOT_LABEL[item.mealSlot] || item.mealSlot) : '全天',
      date: item.bizDate,
      originalPrice: item.originalPrice,
      discount,
      actualPrice: Math.round(afterSlot * 100) / 100,
      region: item.region,
    }
  })
  const regions = vo.regions && vo.regions.length > 0 ? vo.regions : Array.from(new Set(vo.items.map(i => i.region).filter(Boolean)))
  const firstBizDate = vo.items.map(i => i.bizDate).sort()[0] || fmt(vo.orderTime).slice(0, 10)
  // TODO: 对接推广效果统计 API，当前不再生成 mock 推广数据
  const mappedStatus = mapAdStatus(vo.status)
  void mappedStatus // 未来对接推广 API 时使用
  return {
    id: vo.orderNo,
    orderNo: vo.orderNo,
    algorithmId: vo.algoCode || String(vo.algoId),
    promotionName: vo.algoName,
    app: (brandToAppType(vo.brand) ?? AppType.SHANFENG) as AppType,
    channel: mapAdChannel(vo.channel),
    region: regions.length === 1 ? regions[0] : regions,
    recommendType: vo.algoType as RecommendType,
    slotPosition: 0,
    groupId: vo.groupCode,
    groupName: vo.groupName || '-',
    storeId: vo.storeCode || '-',
    storeName: vo.storeName || '-',
    storeAddress: vo.storeAddress,
    purchaseDate: fmt(vo.orderTime).slice(0, 10),
    originalPrice: vo.originalAmount,
    discountPrice: vo.originalAmount - vo.discountAmount,
    actualPrice: vo.actualAmount,
    status: mapAdStatus(vo.status),
    orderTime: fmt(vo.orderTime),
    payTime: vo.payTime ? fmt(vo.payTime) : undefined,
    slotPrices,
    gradientDiscount: matchedTier ? { count: matchedTier.minSlots, discount: matchedTier.discount / 10 } : null,
    cancelFeeRules: pricing?.cancelFeeRules ?? [],
    refundAmount: vo.refundAmount ? vo.refundAmount : undefined,
    refundEnabled: vo.refundEnabled !== undefined ? vo.refundEnabled === 1 : (pricing?.refundEnabled ?? true),
    promoStartDate: firstBizDate,
    purchaseDays: vo.purchaseDays,
    skinName: vo.skinNames?.[0] || vo.items.find(i => i.skinName)?.skinName || undefined,
    labelDates: vo.labelDates?.map(ld => ({ label: ld.label, scenario: ld.scenario, dates: ld.dates })),
    giftDays: vo.giftDays ?? 0,
    giftAmount: vo.giftAmount ?? 0,
    promoData: undefined,
    source: 'api',
  }
}

/* ---- Mock ---- */
const slotDefs = [
  { slot: '早餐', originalPrice: 80 },
  { slot: '午餐', originalPrice: 150 },
  { slot: '下午茶', originalPrice: 90 },
  { slot: '晚餐', originalPrice: 180 },
  { slot: '宵夜', originalPrice: 60 },
] as const

const dates = ['2026-08-11', '2026-08-12', '2026-08-13', '2026-08-14', '2026-08-15']
const pastDates = ['2025-06-20', '2025-06-21', '2025-06-22', '2025-06-23', '2025-06-24']

// 操作人（用於终态订单：已取消 / 已中止 / 已退款）
const OPERATORS = [
  { name: '陳嘉豪', id: 'EMP10086' },
  { name: '李詠欣', id: 'EMP10237' },
  { name: '黃俊傑', id: 'EMP10555' },
]

// 终态状态（已退款 / 已取消 / 已中止）需要记录发生时间与操作人
export const TERMINAL_STATUSES = [OrderStatus.REFUNDED, OrderStatus.CANCELLED, OrderStatus.ABORTED]

// 无敌星星 / 盘活复苏：这些已退款订单为「未推广即退款」，没有推广数据；其余已退款订单为「推广后才退款」，有推广数据
export const REFUNDED_BEFORE_PROMO_IDS = new Set(['5', '105', '307', '311', '315'])

// 根据订单生成终态时间与操作人信息（仅终态订单使用）
function genTerminalInfo(id: string, baseTime: string): { terminalTime: string; operatorName: string; operatorId: string } {
  const op = OPERATORS[Number(id.replace(/\D/g, '')) % OPERATORS.length]
  const day = (baseTime || '').split(' ')[0]
  return { terminalTime: `${day} 18:32:45`, operatorName: op.name, operatorId: op.id }
}

function genOrder(
  id: string, orderNo: string, algoId: string, promoName: string,
  app: AppType, channel: RecommendChannel, region: number | number[],
  recType: RecommendType, slotPos: number, gid: string, gname: string,
  sid: string, sname: string, pdate: string, orig: number, disc: number,
  actual: number, status: OrderStatus, otime: string, ptime: string | undefined,
  slotPattern: number[], dateIdx: number, gradDisc: { count: number; discount: number } | null,
  refundAmt?: number,
  refundEnabled: boolean = true,
  dateRegions?: number[][],
): OrderItem {
  const isRevive = recType === RecommendType.HOT_REVIVE_AD
  const isPast = status !== OrderStatus.PENDING_PROMOTION && status !== OrderStatus.PROMOTING
  const baseDates = isPast ? pastDates : dates
  const slotPrices: SlotPriceItem[] = []
  if (isRevive) {
    slotPattern.forEach((di, i) => {
      const p = 1000 + (i * 100)
      const d = [10, 9, 8][i % 3]
      slotPrices.push({ slot: `Day${i + 1}`, date: baseDates[di % 5], originalPrice: p, discount: d, actualPrice: Math.round(p * d / 10) })
    })
  } else {
    slotPattern.forEach((si, i) => {
      const dateIdx = Math.floor(i / 5)
      const date = baseDates[dateIdx % 5]
      const def = slotDefs[si % 5]
      const d = [10, 9, 8, 8][i % 4]
      slotPrices.push({ slot: def.slot, date, originalPrice: def.originalPrice, discount: d, actualPrice: Math.round(def.originalPrice * d / 10) })
    })
  }
  // 多商圈：按日期分配商圈（所有订单类型通用）
  if (dateRegions && Array.isArray(region)) {
      // 按日期分组，每个日期使用指定的商圈列表
      const dateGroups = new Map<string, number[]>()
      slotPrices.forEach((sp, i) => {
        if (!dateGroups.has(sp.date)) dateGroups.set(sp.date, [])
        dateGroups.get(sp.date)!.push(i)
      })
      Array.from(dateGroups.entries()).forEach(([_date, indices], di) => {
        const dr = dateRegions[di] || dateRegions[0] || [Array.isArray(region) ? region[0] : region]
        const perR = Math.ceil(indices.length / dr.length)
        indices.forEach((slotIdx, i) => {
          slotPrices[slotIdx].region = dr[Math.min(Math.floor(i / perR), dr.length - 1)]
        })
      })
    } else if (Array.isArray(region) && region.length > 1) {
      const perRegion = Math.ceil(slotPrices.length / region.length)
      slotPrices.forEach((sp, i) => {
        sp.region = region[Math.min(Math.floor(i / perRegion), region.length - 1)]
      })
    } else {
      slotPrices.forEach(sp => { sp.region = Array.isArray(region) ? region[0] : region })
    }
  // 生成推广数据：推广中、已完成，以及「推广后才退款」的已退款订单（未推广即退款的除外）
  let promoData: PromoRecord[] | undefined
  const hasPromoData = status === OrderStatus.PROMOTING
    || status === OrderStatus.PROMOTED
    || (status === OrderStatus.REFUNDED && !REFUNDED_BEFORE_PROMO_IDS.has(id))
  if (hasPromoData) {
    const regionName = (REGION_LABEL_KEY[Array.isArray(region) ? region[0] : region] ? i18n.t(REGION_LABEL_KEY[Array.isArray(region) ? region[0] : region]) : '未知')
    promoData = isRevive
      ? genRevivePromoData(regionName, slotPrices)
      : genInvincibleStarPromoData(regionName, slotPrices)
  }
  const cancelFeeRules = [
    { maxDays: 0, feePercent: 100 },
    { maxDays: 3, feePercent: 80 },
    { maxDays: 7, feePercent: 50 },
  ]
  const isTerminal = TERMINAL_STATUSES.includes(status)
  // 已退款：部分为业务人员退款（顯示姓名+工號），部分为商家退款（顯示门店名称+ID）；取消/中止统一为业务人员
  const terminalActor: 'staff' | 'merchant' = (status === OrderStatus.REFUNDED && Number(id) % 2 === 0) ? 'merchant' : 'staff'
  const lastPromoDate = slotPrices.length ? slotPrices[slotPrices.length - 1].date : (isPast ? pastDates[0] : dates[0])
  const terminalExtra = isTerminal
    ? { ...genTerminalInfo(id, otime), terminalActor }
    : (status === OrderStatus.PROMOTED ? { terminalTime: `${lastPromoDate} 22:10:30` } : {})
  return {
    id, orderNo, algorithmId: algoId, promotionName: promoName, app, channel, region,
    recommendType: recType, slotPosition: slotPos, groupId: gid, groupName: gname,
    storeId: sid, storeName: sname, storeAddress: '',
    purchaseDate: pdate, originalPrice: orig,
    discountPrice: disc, actualPrice: actual, status, orderTime: otime, payTime: ptime,
    promoStartDate: isPast ? '2025-06-15' : '2026-08-11',
    slotPrices, gradientDiscount: gradDisc, cancelFeeRules, promoData,
    ...(refundAmt !== undefined ? { refundAmount: refundAmt } : {}),
    refundEnabled,
    ...terminalExtra,
  }
}

export const mockOrders: OrderItem[] = [
  // 无敌星星订单 (id: 1-15)
  genOrder('1','ORD20250705001','ALG001','无敌星星·黃金展位',AppType.SHANFENG,RecommendChannel.DELIVERY,[1,6,4],RecommendType.INVINCIBLE_STAR,3,'G10001','澳门美食集团','S20001','澳门總店','2025-07-05',2000,1800,1440,OrderStatus.PENDING_PROMOTION,'2025-07-05 10:30:00','2025-07-05 10:35:00',[0,1,2,3,4,0,1,2,3,4],0,{count:10,discount:8},undefined,true,[[1,6,4],[2,3]]),
  genOrder('2','ORD20250706002','ALG002','无敌星星·首页推荐',AppType.MFOOD,RecommendChannel.DELIVERY,6,RecommendType.INVINCIBLE_STAR,5,'G10002','闪蜂餐饮连锁','S20002','氹仔分店','2025-07-06',1500,1350,1350,OrderStatus.PENDING_PROMOTION,'2025-07-06 14:20:00','2025-07-06 14:25:00',[3],0,null,undefined,false),
  genOrder('3','ORD20250707003','ALG003','盘活复苏·外卖热推',AppType.SHANFENG,RecommendChannel.GROUP_BUY,3,RecommendType.INVINCIBLE_STAR,2,'G10003','大湾区餐饮集团','S20003','珠海旗舰店','2025-07-08',3000,2700,2700,OrderStatus.PROMOTED,'2025-07-07 09:15:00',undefined,[0,1,2,3,4],0,null),
  genOrder('4','ORD20250703004','ALG004','流量广告·团购精选',AppType.MFOOD,RecommendChannel.SUPERMARKET,1,RecommendType.INVINCIBLE_STAR,4,'G10001','澳门美食集团','S20004','黑沙环店','2025-07-03',1000,900,900,OrderStatus.REFUNDED,'2025-07-03 16:40:00','2025-07-03 16:45:00',[0],0,null,180),
  genOrder('5','ORD20250702005','ALG001','无敌星星·週末專场',AppType.SHANFENG,RecommendChannel.SUPERMARKET,6,RecommendType.INVINCIBLE_STAR,1,'G10002','闪蜂餐饮连锁','S20005','新馬路店','2025-07-02',2500,2250,2250,OrderStatus.REFUNDED,'2025-07-02 11:20:00',undefined,[3,4],0,null,1125),
  genOrder('6','ORD20250701006','ALG001','无敌星星·早鳥優惠',AppType.MFOOD,RecommendChannel.GROUP_BUY,1,RecommendType.INVINCIBLE_STAR,2,'G10003','大湾区餐饮集团','S20001','澳门總店','2025-07-01',1800,1620,1620,OrderStatus.PENDING_PROMOTION,'2025-07-01 08:30:00','2025-07-01 08:35:00',[0,1,2,3,4],0,null),
  genOrder('7','ORD20250630007','ALG002','新店广告·零售闪购',AppType.SHANFENG,RecommendChannel.DELIVERY,3,RecommendType.INVINCIBLE_STAR,3,'G10001','澳门美食集团','S20002','氹仔分店','2025-06-30',1200,1080,1080,OrderStatus.PENDING_PROMOTION,'2025-06-30 10:15:00','2025-06-30 10:20:00',[1],0,null,undefined,false),
  genOrder('8','ORD20250629008','ALG003','盘活复苏·团购到店',AppType.MFOOD,RecommendChannel.GROUP_BUY,6,RecommendType.INVINCIBLE_STAR,4,'G10002','闪蜂餐饮连锁','S20003','珠海旗舰店','2025-06-29',2800,2520,2520,OrderStatus.PROMOTED,'2025-06-29 15:45:00',undefined,[0,1,2,3,4],0,null),
  genOrder('9','ORD20250628009','ALG004','流量广告·大首页推荐',AppType.SHANFENG,RecommendChannel.SUPERMARKET,1,RecommendType.INVINCIBLE_STAR,1,'G10003','大湾区餐饮集团','S20004','黑沙环店','2025-06-28',1600,1440,1440,OrderStatus.PROMOTED,'2025-06-28 09:20:00','2025-06-28 09:25:00',[0,2],0,null,1440),
  genOrder('10','ORD20250627010','ALG001','无敌星星·夜宵專场',AppType.MFOOD,RecommendChannel.DELIVERY,3,RecommendType.INVINCIBLE_STAR,5,'G10001','澳门美食集团','S20005','新馬路店','2025-06-27',2200,1980,1980,OrderStatus.PROMOTED,'2025-06-27 20:10:00','2025-06-27 20:15:00',[4],0,null),
  genOrder('11','ORD20250626011','ALG002','新店广告·澳门專区',AppType.SHANFENG,RecommendChannel.DELIVERY,1,RecommendType.INVINCIBLE_STAR,2,'G10002','闪蜂餐饮连锁','S20001','澳门總店','2025-06-26',1900,1710,1710,OrderStatus.PENDING_PROMOTION,'2025-06-26 11:30:00','2025-06-26 11:35:00',[1,3],0,null,undefined,false),
  genOrder('12','ORD20250625012','ALG003','盘活复苏·氹仔热推',AppType.MFOOD,RecommendChannel.GROUP_BUY,6,RecommendType.INVINCIBLE_STAR,3,'G10003','大湾区餐饮集团','S20002','氹仔分店','2025-06-25',1400,1260,1260,OrderStatus.PROMOTED,'2025-06-25 13:50:00',undefined,[1,3],0,null,1260),
  genOrder('13','ORD20250624013','ALG004','流量广告·珠海精选',AppType.SHANFENG,RecommendChannel.SUPERMARKET,3,RecommendType.INVINCIBLE_STAR,4,'G10001','澳门美食集团','S20003','珠海旗舰店','2025-06-24',2100,1890,1890,OrderStatus.PROMOTED,'2025-06-24 07:40:00',undefined,[0,1],0,null),
  genOrder('14','ORD20250623014','ALG001','无敌星星·全时段推广',AppType.MFOOD,RecommendChannel.SUPERMARKET,1,RecommendType.INVINCIBLE_STAR,1,'G10002','闪蜂餐饮连锁','S20004','黑沙环店','2025-06-23',3500,3150,3150,OrderStatus.PROMOTED,'2025-06-23 06:20:00','2025-06-23 06:25:00',[0,1,2,3,4,0,1],0,null,3150),
  genOrder('15','ORD20250622015','ALG002','新店广告·闪购特惠',AppType.SHANFENG,RecommendChannel.DELIVERY,6,RecommendType.INVINCIBLE_STAR,5,'G10003','大湾区餐饮集团','S20005','新馬路店','2025-06-22',1700,1530,1530,OrderStatus.PROMOTED,'2025-06-22 10:05:00','2025-06-22 10:10:00',[0,1,2],0,null,1530),
  // 盘活复甦订单 (id: 101-115)
  genOrder('101','ORD20250715101','ALG003','盘活复甦·黃金展位',AppType.SHANFENG,RecommendChannel.DELIVERY,1,RecommendType.HOT_REVIVE_AD,3,'G10001','澳门美食集团','S20001','澳门總店','2025-07-15',3000,2700,2700,OrderStatus.PROMOTING,'2025-07-15 10:30:00','2025-07-15 10:35:00',[0,1,2],0,{count:3,discount:9}),
  genOrder('102','ORD20250714102','ALG003','盘活复甦·首页推荐',AppType.MFOOD,RecommendChannel.DELIVERY,6,RecommendType.HOT_REVIVE_AD,5,'G10002','闪蜂餐饮连锁','S20002','氹仔分店','2025-07-14',2500,2250,2250,OrderStatus.PENDING_PROMOTION,'2025-07-14 14:20:00','2025-07-14 14:25:00',[0,1],0,null,undefined,false),
  genOrder('103','ORD20250713103','ALG003','盘活复甦·外卖热推',AppType.SHANFENG,RecommendChannel.GROUP_BUY,3,RecommendType.HOT_REVIVE_AD,2,'G10003','大湾区餐饮集团','S20003','珠海旗舰店','2025-07-13',4000,3600,3600,OrderStatus.PROMOTED,'2025-07-13 09:15:00',undefined,[0,1,2,3],0,null),
  genOrder('104','ORD20250712104','ALG003','盘活复甦·团购精选',AppType.MFOOD,RecommendChannel.SUPERMARKET,1,RecommendType.HOT_REVIVE_AD,4,'G10001','澳门美食集团','S20004','黑沙环店','2025-07-12',1500,1350,1350,OrderStatus.REFUNDED,'2025-07-12 16:40:00','2025-07-12 16:45:00',[0],0,null,270),
  genOrder('105','ORD20250711105','ALG003','盘活复甦·週末專场',AppType.SHANFENG,RecommendChannel.SUPERMARKET,6,RecommendType.HOT_REVIVE_AD,1,'G10002','闪蜂餐饮连锁','S20005','新馬路店','2025-07-11',5000,4500,4500,OrderStatus.REFUNDED,'2025-07-11 11:20:00',undefined,[0,1,2,3,4],0,null,2250),
  genOrder('106','ORD20250710106','ALG003','盘活复甦·早鳥優惠',AppType.MFOOD,RecommendChannel.GROUP_BUY,1,RecommendType.HOT_REVIVE_AD,2,'G10003','大湾区餐饮集团','S20001','澳门總店','2025-07-10',2000,1800,1800,OrderStatus.PENDING_PROMOTION,'2025-07-10 08:30:00','2025-07-10 08:35:00',[0,1],0,null),
  genOrder('107','ORD20250709107','ALG003','盘活复·零售闪购',AppType.SHANFENG,RecommendChannel.DELIVERY,3,RecommendType.HOT_REVIVE_AD,3,'G10001','澳门美食集团','S20002','氹仔分店','2025-07-09',3500,3150,3150,OrderStatus.PENDING_PROMOTION,'2025-07-09 10:15:00','2025-07-09 10:20:00',[0,1,2],0,null,undefined,false),
  genOrder('108','ORD20250708108','ALG003','盘活复甦·团购到店',AppType.MFOOD,RecommendChannel.GROUP_BUY,6,RecommendType.HOT_REVIVE_AD,4,'G10002','闪蜂餐饮连锁','S20003','珠海旗舰店','2025-07-08',2800,2520,2520,OrderStatus.PROMOTED,'2025-07-08 15:45:00',undefined,[0,1],0,null),
  genOrder('109','ORD20250707109','ALG003','盘活复甦·大首页推荐',AppType.SHANFENG,RecommendChannel.SUPERMARKET,1,RecommendType.HOT_REVIVE_AD,1,'G10003','大湾区餐饮集团','S20004','黑沙环店','2025-07-07',4500,4050,4050,OrderStatus.PROMOTED,'2025-07-07 09:20:00','2025-07-07 09:25:00',[0,1,2,3],0,null,4050),
  genOrder('110','ORD20250706110','ALG003','盘活复甦·夜宵專场',AppType.MFOOD,RecommendChannel.DELIVERY,3,RecommendType.HOT_REVIVE_AD,5,'G10001','澳门美食集团','S20005','新馬路店','2025-07-06',2200,1980,1980,OrderStatus.PROMOTED,'2025-07-06 20:10:00','2025-07-06 20:15:00',[0,1],0,null),
  genOrder('111','ORD20250705111','ALG003','盘活复甦·澳门專区',AppType.SHANFENG,RecommendChannel.DELIVERY,1,RecommendType.HOT_REVIVE_AD,2,'G10002','闪蜂餐饮连锁','S20001','澳门總店','2025-07-05',6000,5400,5400,OrderStatus.PENDING_PROMOTION,'2025-07-05 11:30:00','2025-07-05 11:35:00',[0,1,2,3,4,0],0,null,undefined,false),
  genOrder('112','ORD20250704112','ALG003','盘活复甦·氹仔热推',AppType.MFOOD,RecommendChannel.GROUP_BUY,6,RecommendType.HOT_REVIVE_AD,3,'G10003','大湾区餐饮集团','S20002','氹仔分店','2025-07-04',1400,1260,1260,OrderStatus.PROMOTED,'2025-07-04 13:50:00',undefined,[0,1],0,null,1260),
  genOrder('113','ORD20250703113','ALG003','盘活复甦·珠海精选',AppType.SHANFENG,RecommendChannel.SUPERMARKET,3,RecommendType.HOT_REVIVE_AD,4,'G10001','澳门美食集团','S20003','珠海旗舰店','2025-07-03',3200,2880,2880,OrderStatus.PROMOTED,'2025-07-03 07:40:00',undefined,[0,1,2],0,null),
  genOrder('114','ORD20250702114','ALG003','盘活复甦·全时段推广',AppType.MFOOD,RecommendChannel.SUPERMARKET,1,RecommendType.HOT_REVIVE_AD,1,'G10002','闪蜂餐饮连锁','S20004','黑沙环店','2025-07-02',7000,6300,6300,OrderStatus.PROMOTED,'2025-07-02 06:20:00','2025-07-02 06:25:00',[0,1,2,3,4,0,1],0,null,6300),
  genOrder('115','ORD20250701115','ALG003','盘活复甦·闪购特惠',AppType.SHANFENG,RecommendChannel.DELIVERY,6,RecommendType.HOT_REVIVE_AD,5,'G10003','大湾区餐饮集团','S20005','新馬路店','2025-07-01',3800,3420,3420,OrderStatus.PROMOTED,'2025-07-01 10:05:00','2025-07-01 10:10:00',[0,1,2],0,null,3420),
  // ── TODO: 投流广告订单（与订单列表 mock 对應，樣式调試用），確認后刪除 ──
  {
    id: 'DDLL202609010001', orderNo: 'DDLL202609010001',
    algorithmId: 'SFLL20260818008', promotionName: '投流广告·精準曝光',
    app: AppType.SHANFENG, channel: RecommendChannel.DELIVERY, region: 1,
    recommendType: RecommendType.TRAFFIC_AD, slotPosition: 0,
    groupId: 'G1001', groupName: '澳门張记牛雜', storeId: 'M1001', storeName: '新馬路店', storeAddress: '',
    purchaseDate: '2026-09-01', originalPrice: 900, discountPrice: 810, actualPrice: 810,
    status: OrderStatus.PENDING_PROMOTION, orderTime: '2026-09-01 10:30:00', payTime: '2026-09-01 10:31:00',
    slotPrices: [], gradientDiscount: null, cancelFeeRules: [], refundEnabled: true,
    giftDays: 2, giftAmount: 90,
    trafficMode: 'tier', trafficPackageName: '成長包', trafficImpressions: 5000,
    source: 'mock',
  },
  {
    id: 'DDLL202609010002', orderNo: 'DDLL202609010002',
    algorithmId: 'SFLL20260818008', promotionName: '投流广告·精準曝光',
    app: AppType.MFOOD, channel: RecommendChannel.SUPERMARKET, region: 6,
    recommendType: RecommendType.TRAFFIC_AD, slotPosition: 0,
    groupId: 'G1002', groupName: '氹仔貓山王榴蓮甜品', storeId: 'M1002', storeName: '氹仔官也街店', storeAddress: '',
    purchaseDate: '2026-09-01', originalPrice: 1548, discountPrice: 1548, actualPrice: 1548,
    status: OrderStatus.PROMOTING, orderTime: '2026-09-01 14:05:00', payTime: '2026-09-01 14:06:00',
    slotPrices: [], gradientDiscount: null, cancelFeeRules: [], refundEnabled: true,
    trafficMode: 'custom', trafficImpressions: 8600,
    promoData: Array.from({ length: 3 }, (_, i) => {
      const imp = 2200 + i * 800 + Math.floor(Math.random() * 500)
      const clk = 110 + i * 40 + Math.floor(Math.random() * 30)
      return {
        date: ['2026-09-01', '2026-09-02', '2026-09-03'][i],
        region: i18n.t(REGION_LABEL_KEY[6]) || '花城市区',
        waterfallName: WATERFALL_NAMES[i % WATERFALL_NAMES.length],
        position: (i % 3) + 1,
        impressions: imp, clicks: clk,
        clickRate: +((clk / imp) * 100).toFixed(1),
      }
    }),
    source: 'mock',
  },
]

/* ---- 新店广告 Mock ---- */
function genNewStoreOrder(
  id: string, orderNo: string, app: AppType, channel: RecommendChannel,
  region: number | number[], status: OrderStatus, groupName: string, storeName: string,
  purchaseDays: string[], orderTime: string, payTime?: string,
): OrderItem {
  const pDays = purchaseDays
  const regionName = (REGION_LABEL_KEY[Array.isArray(region) ? region[0] : region] ? i18n.t(REGION_LABEL_KEY[Array.isArray(region) ? region[0] : region]) : '未知')
  return {
    id, orderNo, algorithmId: 'ALG-NS001', promotionName: '新店广告·开业推广',
    app, channel, region, recommendType: RecommendType.NEW_STORE_AD,
    slotPosition: 1, groupId: 'G10001', groupName, storeId: 'S-NS' + id, storeName,
    purchaseDate: pDays[0], originalPrice: 0, discountPrice: 0, actualPrice: 0,
    status, orderTime, payTime, slotPrices: [], gradientDiscount: null,
    cancelFeeRules: [], promoData: genNewStorePromoData(regionName, pDays),
    purchaseDays: pDays, refundEnabled: true, promoStartDate: '2026-07-16',
    ...(TERMINAL_STATUSES.includes(status)
      ? { ...genTerminalInfo(id, orderTime), terminalActor: 'staff' as const }
      : (status === OrderStatus.PROMOTED ? { terminalTime: `${pDays[pDays.length - 1]} 22:10:30` } : {})),
  }
}

export const newStoreOrders: OrderItem[] = [
  genNewStoreOrder('201','ORD20250716201',AppType.SHANFENG,RecommendChannel.DELIVERY,1,OrderStatus.PROMOTING,'澳门美食集团','澳门總店',['2026-07-16','2026-07-17','2026-07-18'],'2025-07-16 10:30:00','2025-07-16 10:35:00'),
  genNewStoreOrder('202','ORD20250715202',AppType.MFOOD,RecommendChannel.DELIVERY,3,OrderStatus.PENDING_PROMOTION,'闪蜂餐饮连锁','氹仔分店',['2026-07-15','2026-07-16','2026-07-17'],'2025-07-15 14:20:00','2025-07-15 14:25:00'),
  genNewStoreOrder('203','ORD20250714203',AppType.SHANFENG,RecommendChannel.GROUP_BUY,6,OrderStatus.PROMOTED,'大湾区餐饮集团','珠海旗舰店',['2025-06-20','2025-06-21','2025-06-22'],'2025-07-14 09:15:00',undefined),
  genNewStoreOrder('204','ORD20250713204',AppType.MFOOD,RecommendChannel.SUPERMARKET,1,OrderStatus.PROMOTED,'澳门美食集团','黑沙环店',['2025-06-18','2025-06-19','2025-06-20','2025-06-21'],'2025-07-13 16:40:00','2025-07-13 16:45:00'),
  genNewStoreOrder('205','ORD20250712205',AppType.SHANFENG,RecommendChannel.DELIVERY,3,OrderStatus.PROMOTING,'闪蜂餐饮连锁','新馬路店',['2026-07-12','2026-07-13','2026-07-14'],'2025-07-12 11:20:00',undefined),
  genNewStoreOrder('206','ORD20250711206',AppType.MFOOD,RecommendChannel.GROUP_BUY,6,OrderStatus.PENDING_PROMOTION,'大湾区餐饮集团','澳门總店',['2026-07-11','2026-07-12'],'2025-07-11 08:30:00','2025-07-11 08:35:00'),
  genNewStoreOrder('207','ORD20250710207',AppType.SHANFENG,RecommendChannel.DELIVERY,1,OrderStatus.PROMOTED,'澳门美食集团','氹仔分店',['2025-06-22','2025-06-23','2025-06-24'],'2025-07-10 10:15:00','2025-07-10 10:20:00'),
  genNewStoreOrder('208','ORD20250709208',AppType.MFOOD,RecommendChannel.GROUP_BUY,6,OrderStatus.PROMOTED,'闪蜂餐饮连锁','珠海旗舰店',['2025-06-25','2025-06-26'],'2025-07-09 15:45:00',undefined),
  genNewStoreOrder('209','ORD20250708209',AppType.SHANFENG,RecommendChannel.SUPERMARKET,3,OrderStatus.PENDING_PROMOTION,'大湾区餐饮集团','黑沙环店',['2026-07-08','2026-07-09','2026-07-10'],'2025-07-08 09:20:00','2025-07-08 09:25:00'),
  genNewStoreOrder('210','ORD20250707210',AppType.MFOOD,RecommendChannel.DELIVERY,1,OrderStatus.PROMOTING,'澳门美食集团','新馬路店',['2026-07-07','2026-07-08','2026-07-09','2026-07-10'],'2025-07-07 20:10:00','2025-07-07 20:15:00'),
  // 5天推广期（当天±2天）- 覆蓋所有状态
  genNewStoreOrder('211','ORD20260723211',AppType.SHANFENG,RecommendChannel.DELIVERY,1,OrderStatus.PROMOTING,'新澳茶餐廳','黑沙环旗舰店',['2026-07-21','2026-07-22','2026-07-23','2026-07-24','2026-07-25'],'2026-07-20 10:00:00','2026-07-20 10:05:00'),
  genNewStoreOrder('212','ORD20260723212',AppType.MFOOD,RecommendChannel.GROUP_BUY,3,OrderStatus.PENDING_PROMOTION,'湾仔海鮮坊','氹仔新店',['2026-07-21','2026-07-22','2026-07-23','2026-07-24','2026-07-25'],'2026-07-20 14:30:00','2026-07-20 14:35:00'),
  genNewStoreOrder('213','ORD20260723213',AppType.SHANFENG,RecommendChannel.SUPERMARKET,6,OrderStatus.PROMOTED,'珠海美食居','珠海旗舰店',['2026-07-21','2026-07-22','2026-07-23','2026-07-24','2026-07-25'],'2026-07-18 09:00:00','2026-07-18 09:10:00'),
  genNewStoreOrder('214','ORD20260723214',AppType.MFOOD,RecommendChannel.DELIVERY,4,OrderStatus.CANCELLED,'澳门甜品屋','高士德新店',['2026-07-21','2026-07-22','2026-07-23','2026-07-24','2026-07-25'],'2026-07-19 11:00:00','2026-07-19 11:05:00'),
  genNewStoreOrder('215','ORD20260723215',AppType.SHANFENG,RecommendChannel.DELIVERY,2,OrderStatus.ABORTED,'新澳茶餐廳','新馬路旗舰店',['2026-07-21','2026-07-22','2026-07-23','2026-07-24','2026-07-25'],'2026-07-17 16:00:00','2026-07-17 16:10:00'),
]

/* ---- 人气商家 Mock ---- */
// 生成连续购买日期（起始日 + 天数）
export function genPopularDays(startDate: string, days: number): string[] {
  const start = new Date(startDate)
  return Array.from({ length: days }, (_, i) => {
    const d = new Date(start)
    d.setDate(start.getDate() + i)
    return d.toISOString().split('T')[0]
  })
}

// 人气商家订单：皮膚名称按天计价（参考盘活复苏按天模式），滿7天享95折梯度；付费购买，支持退款
function genPopularOrder(
  id: string, orderNo: string, algoId: string, promoName: string,
  app: AppType, channel: RecommendChannel, region: number, slotPos: number,
  gid: string, gname: string, sid: string, sname: string,
  skinName: string, pricePerDay: number, startDate: string, days: number,
  status: OrderStatus, otime: string, ptime?: string,
  refundAmt?: number,
): OrderItem {
  const pDays = genPopularDays(startDate, days)
  const slotPrices: SlotPriceItem[] = pDays.map((date, i) => ({
    slot: `Day${i + 1}`, date, originalPrice: pricePerDay, discount: 10, actualPrice: pricePerDay, region,
  }))
  const originalPrice = pricePerDay * days
  const actualPrice = days >= 7 ? Math.round(originalPrice * 0.95) : originalPrice
  const regionName = (REGION_LABEL_KEY[region] ? i18n.t(REGION_LABEL_KEY[region]) : '未知')
  // 推广中：仅已推广日期产生数据；已完成：全部日期；待推广/已退款：无数据
  const today = new Date().toISOString().split('T')[0]
  const promoData = status === OrderStatus.PROMOTED
    ? genPopularPromoData(regionName, pDays)
    : status === OrderStatus.PROMOTING
      ? genPopularPromoData(regionName, pDays.filter(d => d <= today))
      : undefined
  // 退款规则（与盘活复苏一致）
  const cancelFeeRules = [
    { maxDays: 0, feePercent: 100 },
    { maxDays: 3, feePercent: 80 },
    { maxDays: 7, feePercent: 50 },
  ]
  return {
    id, orderNo, algorithmId: algoId, promotionName: promoName, app, channel, region,
    recommendType: RecommendType.POPULAR_MERCHANT_KA, slotPosition: slotPos,
    groupId: gid, groupName: gname, storeId: sid, storeName: sname, skinName,
    purchaseDate: otime.split(' ')[0], originalPrice,
    discountPrice: actualPrice, actualPrice, status, orderTime: otime, payTime: ptime,
    promoStartDate: pDays[0], purchaseDays: pDays,
    slotPrices, gradientDiscount: days >= 7 ? { count: 7, discount: 9.5 } : null,
    cancelFeeRules, promoData, refundEnabled: true,
    ...(refundAmt !== undefined ? { refundAmount: refundAmt } : {}),
    ...(status === OrderStatus.REFUNDED
      ? { ...genTerminalInfo(id, otime), terminalActor: 'staff' as const }
      : (status === OrderStatus.PROMOTED ? { terminalTime: `${pDays[pDays.length - 1]} 22:10:30` } : {})),
  }
}

// 与订单列表一致的15条人气商家订单（待推广×4、推广中×4、已完成×4、已退款×3）
export const popularOrders: OrderItem[] = [
  // 推广中 ×4
  genPopularOrder('301','ORD20260725301','ALG_KA_001','人气商家-首页版',AppType.SHANFENG,RecommendChannel.DELIVERY,1,1,'G10008','威尼斯人餐饮集团','S30021','威尼斯人酒店','紅運当頭',28,'2026-07-26',7,OrderStatus.PROMOTING,'2026-07-25 10:20:00','2026-07-25 10:21:00'),
  genPopularOrder('305','ORD20260724305','ALG_KA_004','人气商家-外卖版',AppType.MFOOD,RecommendChannel.DELIVERY,2,2,'G10011','肯德基餐饮集团','S30025','肯德基','碧海藍天',20,'2026-07-25',7,OrderStatus.PROMOTING,'2026-07-24 11:10:00','2026-07-24 11:12:00'),
  genPopularOrder('308','ORD20260726308','ALG_KA_001','人气商家-首页版',AppType.SHANFENG,RecommendChannel.GROUP_BUY,4,3,'G10012','澳门塔餐饮集团','S30028','澳门塔旋转餐廳','青峰翡翠',24,'2026-07-27',7,OrderStatus.PROMOTING,'2026-07-26 09:30:00','2026-07-26 09:32:00'),
  genPopularOrder('312','ORD20260723312','ALG_KA_004','人气商家-外卖版',AppType.MFOOD,RecommendChannel.DELIVERY,5,4,'G10013','高士德饮食集团','S30032','高士德麵家','極光幻彩',36,'2026-07-24',7,OrderStatus.PROMOTING,'2026-07-23 16:05:00','2026-07-23 16:06:00'),
  // 待推广 ×4
  genPopularOrder('302','ORD20260725302','ALG_KA_004','人气商家-外卖版',AppType.MFOOD,RecommendChannel.DELIVERY,6,2,'G10009','皇朝饮食集团','S30022','皇朝广场店','橙意滿滿',18,'2026-07-28',7,OrderStatus.PENDING_PROMOTION,'2026-07-24 15:40:00','2026-07-24 15:42:00'),
  genPopularOrder('304','ORD20260726304','ALG_KA_001','人气商家-首页版',AppType.SHANFENG,RecommendChannel.DELIVERY,3,1,'G10014','麥当勞餐饮集团','S30024','麥当勞','紫气東來',22,'2026-08-03',7,OrderStatus.PENDING_PROMOTION,'2026-07-26 14:00:00','2026-07-26 14:02:00'),
  genPopularOrder('309','ORD20260726309','ALG_KA_001','人气商家-首页版',AppType.SHANFENG,RecommendChannel.GROUP_BUY,8,5,'G10015','巴黎人餐饮集团','S30029','巴黎人法餐廳','粉黛甜心',26,'2026-08-05',7,OrderStatus.PENDING_PROMOTION,'2026-07-26 17:45:00','2026-07-26 17:46:00'),
  genPopularOrder('313','ORD20260727313','ALG_KA_004','人气商家-外卖版',AppType.MFOOD,RecommendChannel.DELIVERY,1,2,'G10016','黑沙环饮食集团','S30033','黑沙环燒臘','紅運当頭',28,'2026-08-02',7,OrderStatus.PENDING_PROMOTION,'2026-07-27 08:50:00','2026-07-27 08:52:00'),
  // 已完成 ×4
  genPopularOrder('303','ORD20260710303','ALG_KA_001','人气商家-首页版',AppType.SHANFENG,RecommendChannel.DELIVERY,3,3,'G10010','澳门美食集团','S30023','黑馬仕美食街','金碧輝煌',32,'2026-07-11',7,OrderStatus.PROMOTED,'2026-07-10 09:05:00','2026-07-10 09:06:00'),
  genPopularOrder('306','ORD20260704306','ALG_KA_004','人气商家-外卖版',AppType.MFOOD,RecommendChannel.SUPERMARKET,10,1,'G10017','新濠餐饮集团','S30026','新濠天地食府','簡約无框',8,'2026-07-05',7,OrderStatus.PROMOTED,'2026-07-04 10:30:00','2026-07-04 10:31:00'),
  genPopularOrder('310','ORD20260705310','ALG_KA_001','人气商家-首页版',AppType.SHANFENG,RecommendChannel.DELIVERY,9,4,'G10018','银河餐饮集团','S30030','新馬路茶餐廳','暗夜黑金',30,'2026-07-06',7,OrderStatus.PROMOTED,'2026-07-05 13:20:00','2026-07-05 13:21:00'),
  genPopularOrder('314','ORD20260713314','ALG_KA_004','人气商家-外卖版',AppType.MFOOD,RecommendChannel.GROUP_BUY,11,5,'G10019','港珠澳饮食集团','S30034','港珠澳漁港','碧海藍天',20,'2026-07-14',7,OrderStatus.PROMOTED,'2026-07-13 19:10:00','2026-07-13 19:11:00'),
  // 已退款 ×3（未推广即退款，全额退款）
  genPopularOrder('307','ORD20260724307','ALG_KA_001','人气商家-首页版',AppType.SHANFENG,RecommendChannel.DELIVERY,7,2,'G10020','银河酒店集团','S30027','银河酒店餐廳','翠綠生機',20,'2026-08-01',7,OrderStatus.REFUNDED,'2026-07-24 09:40:00','2026-07-24 09:41:00',133),
  genPopularOrder('311','ORD20260725311','ALG_KA_004','人气商家-外卖版',AppType.MFOOD,RecommendChannel.DELIVERY,6,3,'G10021','氹仔饮食集团','S30031','氹仔小食店','橘光暮色',25,'2026-07-30',7,OrderStatus.REFUNDED,'2026-07-25 11:25:00','2026-07-25 11:26:00',166),
  genPopularOrder('315','ORD20260726315','ALG_KA_001','人气商家-首页版',AppType.SHANFENG,RecommendChannel.GROUP_BUY,2,1,'G10022','花城市餐饮集团','S30035','花城市甜品','橙意滿滿',18,'2026-08-04',7,OrderStatus.REFUNDED,'2026-07-26 20:15:00','2026-07-26 20:16:00',119),
]