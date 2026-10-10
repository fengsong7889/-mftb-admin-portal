/**
 * 投流廣告定價配置 —— 後端 biz_ad_pricing_traffic 與前端運行態的橋接層
 *
 * 歷史背景：投流定價曾整份存在瀏覽器 localStorage（每業務頻道一行、配置ID 由前端自編 TP00000x），
 * 造成三個問題：編號不跨賬號/設備唯一、改動只對當前瀏覽器生效、與後端下單接口
 * （AdTrafficOrderRequest.pricingId 要求真實主鍵）口徑對不上。
 * 本模組把真值收斂到後端：讀取走 /api/ad/pricing/traffic，寫回走 create/update/status/delete，
 * 定價編號（DJTL + 年月日 + 3位自增）由後端 BizSeqService 按「編號生成規則」生成。
 */
import { BIZ_CHANNEL, type BizChannelValue } from '../../../constants/bizChannel'
import {
  fetchAdTrafficPricingList,
  type AdPricingTraffic,
  type AdPricingTrafficQuery,
  type AdPricingTrafficRequest,
  type AdTrafficLadderRow,
  type AdTrafficTier,
} from '../../../api/adPromotion'
import type { TrafficChannelPricing, TrafficPackageTier, TrafficPriceLadderRow } from './types'

/** 前端業務頻道枚舉（字符串）→ 後端 bizChannel 碼值 */
const BIZ_CHANNEL_TO_CODE: Record<BizChannelValue, number> = {
  [BIZ_CHANNEL.FOOD_DELIVERY]: 1,
  [BIZ_CHANNEL.SUPERMARKET]: 2,
  [BIZ_CHANNEL.GROUP_BUY]: 3,
}

/** 後端 bizChannel 碼值 → 前端業務頻道枚舉 */
const CODE_TO_BIZ_CHANNEL: Record<number, BizChannelValue> = {
  1: BIZ_CHANNEL.FOOD_DELIVERY,
  2: BIZ_CHANNEL.SUPERMARKET,
  3: BIZ_CHANNEL.GROUP_BUY,
}

/** 後端業務頻道 → 前端枚舉（未知值回落美食外賣，避免列表/表單出現空白頻道） */
export function toBizChannelValue(code?: number): BizChannelValue {
  return (code != null ? CODE_TO_BIZ_CHANNEL[code] : undefined) ?? BIZ_CHANNEL.FOOD_DELIVERY
}

/** 前端業務頻道枚舉 → 後端碼值（未知值回落 1） */
export function toBizChannelCode(channel: BizChannelValue): number {
  return BIZ_CHANNEL_TO_CODE[channel] ?? 1
}

/** 後端檔位 → 前端運行態檔位（1/2 與 1/0 碼值還原為布爾，id 轉字符串供 React key 使用） */
function tierFromVO(tier: AdTrafficTier, index: number): TrafficPackageTier {
  return {
    id: String(tier.id ?? `tier-${index}`),
    name: tier.tierName,
    impressions: tier.impressions,
    price: Number(tier.price),
    validityDays: tier.validityDays ?? undefined,
    onSale: (tier.onSale ?? 1) !== 2,
    sort: tier.sort ?? index + 1,
    discountEnabled: tier.discountEnabled === 1,
    discount: tier.discount != null ? Number(tier.discount) : undefined,
    discountTimeMode: tier.discountTimeMode === 'limited' ? 'limited' : 'unlimited',
    discountStartDate: tier.discountStartDate ?? undefined,
    discountEndDate: tier.discountEndDate ?? undefined,
  }
}

/** 後端階梯單價行 → 前端運行態（maxQty=0 表示無上限，與前端「只填下限」交互一致） */
function ladderFromVO(row: AdTrafficLadderRow, index: number): TrafficPriceLadderRow {
  return {
    id: String(row.id ?? `ladder-${index}`),
    minQty: row.minQty,
    maxQty: row.maxQty ?? 0,
    unitPrice: Number(row.unitPrice),
  }
}

/** 後端計價配置 → 前端運行態模型（定價配置頁與購買頁共用） */
export function trafficVoToChannelPricing(vo: AdPricingTraffic): TrafficChannelPricing {
  return {
    pricingId: vo.id,
    pricingNo: vo.pricingNo,
    algoId: vo.algoId,
    brand: vo.brand,
    bizChannel: toBizChannelValue(vo.bizChannel),
    tiers: (vo.tiers ?? []).map(tierFromVO),
    ladder: (vo.ladder ?? []).map(ladderFromVO),
    customMinQty: vo.customMinQty ?? 100,
    customStep: vo.customStep ?? 100,
    status: (vo.status ?? 1) === 2 ? 'disabled' : 'enabled',
    allowRefund: (vo.refundEnabled ?? 1) !== 2,
    refundFeePercent: vo.refundFeePercent ?? 0,
  }
}

/**
 * 前端運行態模型 → 後端新增/編輯請求。
 * 檔位與階梯按當前順序整體重排 sort（後端整體替換子表），折扣關閉時不下發折扣值避免殘留脏數據。
 */
export function channelPricingToRequest(
  cp: TrafficChannelPricing,
  ctx: { algoId: number; algoName?: string; brand?: string },
): AdPricingTrafficRequest {
  const tiers: AdTrafficTier[] = [...cp.tiers]
    .sort((a, b) => a.sort - b.sort)
    .map((tier, index) => ({
      tierName: tier.name,
      impressions: tier.impressions,
      price: tier.price,
      validityDays: tier.validityDays,
      onSale: tier.onSale ? 1 : 2,
      sort: index + 1,
      discountEnabled: tier.discountEnabled ? 1 : 0,
      discount: tier.discountEnabled ? tier.discount : undefined,
      discountTimeMode: tier.discountTimeMode ?? 'unlimited',
      discountStartDate: tier.discountStartDate,
      discountEndDate: tier.discountEndDate,
    }))
  const ladder: AdTrafficLadderRow[] = [...cp.ladder]
    .sort((a, b) => a.minQty - b.minQty)
    .map(row => ({ minQty: row.minQty, maxQty: row.maxQty ?? 0, unitPrice: row.unitPrice }))
  return {
    algoId: ctx.algoId,
    algoName: ctx.algoName,
    brand: ctx.brand,
    bizChannel: toBizChannelCode(cp.bizChannel),
    customMinQty: cp.customMinQty,
    customStep: cp.customStep,
    refundEnabled: cp.allowRefund === false ? 2 : 1,
    refundFeePercent: cp.refundFeePercent ?? 0,
    status: cp.status === 'disabled' ? 2 : 1,
    tiers,
    ladder,
  }
}

/**
 * 從後端載入投流廣告定價配置（銷售定價列表、購買頁、訂單詳情共用）。
 * 默認取前 200 條：投流定價按「算法 × 業務頻道」配置，量級極小。
 */
export async function loadTrafficChannelPricing(
  query: AdPricingTrafficQuery = {},
): Promise<TrafficChannelPricing[]> {
  const res = await fetchAdTrafficPricingList({ page: 1, size: 200, ...query })
  return (res.records ?? []).map(trafficVoToChannelPricing)
}
