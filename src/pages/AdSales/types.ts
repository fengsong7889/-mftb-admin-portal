/**
 * AdSales 模块类型定义
 * 共享类型从 _shared/ad-promotion/types 重导出，本文件仅保留 AdSales 独有项
 */

// 重导出所有共享类型
export {
  TimeSlotStatus,
  TIME_SLOT_COLORS,
  TIME_SLOT_LABELS,
  type InventoryItem,
  type RecommendTypeConfig,
  type TimeSlotDef,
  generateTimeSlotDefs,
  RECOMMEND_TYPE_CONFIGS,
  CHANNEL_LABEL,
  getRowIndexByDate,
  generateMockInventory,
  generateTimeSlotStatuses,
  calcSlotPrice,
  getNoDiscountSlotsByRow,
  type TrafficPackageTier,
  type TrafficPriceLadderRow,
  type TrafficChannelPricing,
  generateDefaultTrafficPricing,
  loadTrafficPricing,
  findLadderUnitPrice,
  calcCustomAmount,
} from '../_shared/ad-promotion/types'

import { BizChannelValue } from '../../constants/bizChannel'

/** 流量包訂單 */
export interface TrafficPackageOrder {
  orderNo: string
  merchantName: string
  bizChannel: BizChannelValue
  mode: 'tier' | 'custom'       // 購買方式：預設檔位 / 自定義數量
  tierName?: string             // 檔位名稱（档位購買時）
  impressions: number           // 購買曝光次數
  amount: number                // 訂單金額 (MOP)
  validityDays?: number         // 有效期 — 已停用（消耗完畢即退出）
  deliverySlot?: 'business' | 'allday'  // 投流時段：主營時段投流 / 全天投流
  status: 'paid'                // Mock：提交即已支付
  createTime: string
}

const TRAFFIC_ORDER_STORAGE_KEY = 'traffic-package-orders'

/** 讀取流量包訂單列表 */
export function loadTrafficOrders(): TrafficPackageOrder[] {
  try {
    const raw = localStorage.getItem(TRAFFIC_ORDER_STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as TrafficPackageOrder[]
      if (Array.isArray(parsed)) return parsed
    }
  } catch { /* 解析失敗返回空列表 */ }
  return []
}

/** 保存流量包訂單 */
export function saveTrafficOrder(order: TrafficPackageOrder): void {
  const orders = loadTrafficOrders()
  orders.unshift(order)
  localStorage.setItem(TRAFFIC_ORDER_STORAGE_KEY, JSON.stringify(orders))
}

/** Mock 門店列表（購買時選擇商家） */
export const MOCK_TRAFFIC_MERCHANTS = [
  { value: 'M1001', label: 'M1001 · 澳門張記牛雜（新馬路店）' },
  { value: 'M1002', label: 'M1002 · 氹仔貓山王榴蓮甜品' },
  { value: 'M1003', label: 'M1003 · 皇朝區金龍茶餐廳' },
  { value: 'M1004', label: 'M1004 · 筷子基順德公魚腐火鍋' },
  { value: 'M1005', label: 'M1005 · 路環安德魯餅店' },
  { value: 'M1006', label: 'M1006 · 新橋區大利來豬扒包' },
  { value: 'M1007', label: 'M1007 · 皇朝區御品軒日式拉麵' },
  { value: 'M1008', label: 'M1008 · 氹仔官也街誠昌飯店' },
]
