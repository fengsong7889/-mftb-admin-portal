/**
 * 移动 APP 原型 · 共享常量与视图模型
 *
 * 本模块只服务于 /app-preview 原型外壳，不复用后台业务页的类型耦合。
 * 品牌 / 区域 / 餐段口径与后台 `AdSales` 保持一致，保证同一批真实接口数据在
 * 移动端渲染出的语义与桌面端一致（下单请求体可直接被后端接受）。
 *
 * 界面文案第一阶段临时硬编码繁中（与后台默认语言一致），待 i18n 解耦后统一替换为 t() 调用。
 */
import { REGION_LIST } from '../_shared/ad-promotion/gridConstants'
import { MEAL_SLOT_TIME_LABEL } from '../../api/adPromotion'

/** 品牌 UI 值（与 gridConstants 的 UI_TO_BACKEND_BRAND 键一致） */
export type MobileBrand = 'shanfeng' | 'mfood'

/** 品牌下拉（真实下单需要按品牌过滤门店与算法） */
export const BRAND_OPTIONS: { value: MobileBrand; label: string; short: string }[] = [
  { value: 'shanfeng', label: '閃蜂', short: '閃' },
  { value: 'mfood', label: 'mFood', short: 'M' },
]

/** 餐段展示顺序（无敌星星按 商圈 × 日期 × 餐段 售卖） */
export const MEAL_SLOT_ORDER = ['breakfast', 'lunch', 'afternoon', 'dinner', 'supper'] as const

/** 餐段名称（繁中） */
export const MEAL_SLOT_NAME: Record<string, string> = {
  breakfast: '早餐',
  lunch: '午餐',
  afternoon: '下午茶',
  dinner: '晚餐',
  supper: '宵夜',
}

/** 餐段 key → 「名称 时间段」组合标签 */
export function mealSlotLabel(slot: string): string {
  const name = MEAL_SLOT_NAME[slot] || slot
  const time = MEAL_SLOT_TIME_LABEL[slot] || ''
  return time ? `${name} ${time}` : name
}

/** 商圈编号 → 名称（来源后台 REGION_LIST，保证与桌面端同一口径） */
export const REGION_NAME_MAP: Record<number, string> = Object.fromEntries(
  REGION_LIST.map((r) => [Number(r.key), r.name]),
)

/** 商圈名称（找不到时回退为「商圈{编号}」，避免门店数据缺失导致界面空白） */
export function regionName(region: number): string {
  return REGION_NAME_MAP[region] || `商圈${region}`
}

/** 订单状态：1=待推廣 2=推廣中 3=已推廣 4=已退款 5=已取消（与后端 AdOrderVO.status 对齐） */
export const ORDER_STATUS_NAME: Record<number, string> = {
  1: '待推廣',
  2: '推廣中',
  3: '已推廣',
  4: '已退款',
  5: '已取消',
}

/** 订单状态语义色（复用 §A.1 设计令牌，不新增色值） */
export const ORDER_STATUS_COLOR: Record<number, { fg: string; bg: string }> = {
  1: { fg: '#FAAD14', bg: '#FFFBE6' },
  2: { fg: '#52C41A', bg: '#F6FFED' },
  3: { fg: '#1890FF', bg: '#E6F7FF' },
  4: { fg: '#FF4D4F', bg: '#FFEBEE' },
  5: { fg: '#8C8C8C', bg: '#FAFAFA' },
}

/** 首页广告商品入口配置：available=true 的才接真实下单闭环，其余展示「敬請期待」 */
export interface MobileProduct {
  key: string
  name: string
  /** 算法类型编号（仅无敌星星在 Phase 0 接通） */
  algoType: number | null
  desc: string
  emoji: string
  tone: string
  available: boolean
}

export const MOBILE_PRODUCTS: MobileProduct[] = [
  { key: 'star', name: '無敵星星', algoType: 1, desc: '商圈 × 日期 × 餐段 黃金時段曝光', emoji: '⭐', tone: '#E8720C', available: true },
  { key: 'revive', name: '盤活復蘇', algoType: 3, desc: '按天售賣，激活沉睡門店', emoji: '🔥', tone: '#FF4D4F', available: false },
  { key: 'signboard', name: '金字招牌', algoType: 13, desc: '標籤位曝光，強化品牌記憶', emoji: '🏆', tone: '#FAAD14', available: false },
  { key: 'popular', name: '人氣商家', algoType: 5, desc: '皮膚套裝，提升店鋪人氣', emoji: '💛', tone: '#EB2F96', available: false },
  { key: 'newstore', name: '新店廣告', algoType: 2, desc: '新店冷啟動流量扶持', emoji: '🌱', tone: '#52C41A', available: false },
  { key: 'traffic', name: '投流廣告', algoType: 6, desc: '流量包按曝光計費', emoji: '📈', tone: '#1890FF', available: false },
]
