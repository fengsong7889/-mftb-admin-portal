/**
 * 广告销售 / 推广销售配置 — 共享常量与工具函数
 * 被 AdSales/DateTimeGrid 与 PromotionSalesConfig/DateTimeGrid 共同使用
 */
import dayjs from 'dayjs'
import type { Dayjs } from 'dayjs'
import { Region, AlgorithmType } from '../../Recommend/constants'

// ─── 商圈 ────────────────────────────────────────────────────────────────────

/** 商圈列表（表格行）—— name 仅作 fallback，实际展示用组件内翻译 */
export const REGION_LIST = [
  { key: Region.KOKSAA, name: '黑沙環區' },
  { key: Region.COSTA, name: '高士德區' },
  { key: Region.SANMA, name: '新馬路區' },
  { key: Region.SANWONG, name: '新皇朝區' },
  { key: Region.HKM, name: '港珠澳區' },
  { key: Region.FAHUA, name: '花城市區' },
  { key: Region.AIRPORT, name: '北安機場' },
  { key: Region.LHOTEL, name: '左酒店區' },
  { key: Region.RHOTEL, name: '右酒店區' },
  { key: Region.UM, name: '澳大專區' },
  { key: Region.HACS, name: '黑沙灘區' },
  // 珠海區域
  { key: Region.GONGBEI, name: '拱北區域' },
  { key: Region.HENGQIN, name: '橫琴區域' },
]

// ─── 品牌映射 ─────────────────────────────────────────────────────────────────

/** 后端品牌 → 前端品牌值（flashBee=閃蜂 mFood=mFood） */
export const BACKEND_TO_UI_BRAND: Record<string, string> = { flashBee: 'shanfeng', mFood: 'mfood' }
/** 前端品牌值 → 后端品牌 */
export const UI_TO_BACKEND_BRAND: Record<string, string> = { shanfeng: 'flashBee', mfood: 'mFood' }

// ─── Mock 店铺 ────────────────────────────────────────────────────────────────

export interface MockStore {
  id: string
  name: string
  bd: string
  bdName: string
}

/** Mock数据 - 店铺列表（含BD信息） */
export const MOCK_STORES: MockStore[] = [
  { id: '10001', name: '威尼斯人酒店', bd: 'bd-001', bdName: '張偉' },
  { id: '10002', name: '皇朝廣場店', bd: 'bd-002', bdName: '李娜' },
  { id: '10003', name: '黑馬仕美食街', bd: 'bd-003', bdName: '王強' },
  { id: '10004', name: '新葡京旗艦店', bd: 'bd-001', bdName: '張偉' },
  { id: '10005', name: '官也街老店', bd: 'bd-004', bdName: '劉敏' },
]

/** 店铺下拉选项（展示ID） */
export const STORE_OPTIONS = MOCK_STORES.map(s => ({
  label: `${s.name}（ID：${s.id}）`,
  value: s.id,
  name: s.name,
  bd: s.bd,
  bdName: s.bdName,
}))

/** BD选项 */
export const BD_OPTIONS = [
  { label: '張偉', value: 'bd-001' },
  { label: '李娜', value: 'bd-002' },
  { label: '王強', value: 'bd-003' },
  { label: '劉敏', value: 'bd-004' },
]

// ─── 默认折扣梯度 ──────────────────────────────────────────────────────────────

export interface DiscountTierDef {
  minSlots: number
  discount: number
  label: string
}

/** 默认多时段折扣梯度（演示配置，真实数据由定价配置覆盖） */
export const DEFAULT_MULTI_SLOT_DISCOUNT_TIERS: Omit<DiscountTierDef, 'label'>[] = [
  { minSlots: 10, discount: 80 },
  { minSlots: 8, discount: 85 },
  { minSlots: 5, discount: 90 },
  { minSlots: 3, discount: 95 },
]

// ─── 预售 / 可售窗口 ──────────────────────────────────────────────────────────

/** 可售天数（含当天），盘活复苏用 */
export const REVIVE_SELLABLE_DAYS = 180
/** 可售天数（含当天），普通算法用 */
export const DEFAULT_SELLABLE_DAYS = 12
/** 开售时间（每日该时点放出新一天的可购买日期，火车票式） */
export const PRESALE_OPEN_HOUR = 10

/** 根据算法类型取可售天数 */
export function getSellableDays(algorithmType: AlgorithmType): number {
  return algorithmType === AlgorithmType.HOT_REVIVE_AD ? REVIVE_SELLABLE_DAYS : DEFAULT_SELLABLE_DAYS
}

/** 计算某日期相对今天的天数偏移（今天=0） */
export function getDayOffset(date: Dayjs): number {
  return date.startOf('day').diff(dayjs().startOf('day'), 'day')
}

/** 是否为待开售日期（超出可售窗口，暂不可购买） */
export function isPresaleDate(date: Dayjs, sellableDays: number): boolean {
  return getDayOffset(date) >= sellableDays
}

/** 待开售日期的开售时间（提前 sellableDays 天、于 PRESALE_OPEN_HOUR 点开售） */
export function getPresaleOpenTime(date: Dayjs, sellableDays: number): Dayjs {
  return date.startOf('day').subtract(sellableDays - 1, 'day').hour(PRESALE_OPEN_HOUR).minute(0).second(0)
}

// ─── 解析定价配置折扣梯度 ──────────────────────────────────────────────────────

/** 解析定价配置的多时段梯度折扣 JSON（后端 discount=95 表示 95 折） */
export function parseDiscountTiers(
  json?: string,
  discountUnitLabel?: string,
): DiscountTierDef[] {
  if (!json) return []
  try {
    const arr = JSON.parse(json)
    if (!Array.isArray(arr)) return []
    return (arr as Array<{ minSlots?: number; discount?: number }>)
      .filter(t => t && Number(t.minSlots) > 0 && Number(t.discount) > 0)
      .map(t => {
        const d = Number(t.discount)
        const label = d > 10 ? `${d / 10}${discountUnitLabel ?? '折'}` : `${d}${discountUnitLabel ?? '折'}`
        return { minSlots: Number(t.minSlots), discount: d, label }
      })
      .sort((a, b) => b.minSlots - a.minSlots)
  } catch {
    return []
  }
}
