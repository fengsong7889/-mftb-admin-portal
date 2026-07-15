import { useEffect, useState, useMemo } from 'react'
import { Button, Tag, Space, Descriptions, Card, Empty, Modal, message } from 'antd'
import {
  ArrowLeftOutlined, CheckOutlined, ClockCircleOutlined,
  ShopOutlined, FileTextOutlined, DollarOutlined,
  ExclamationCircleOutlined, RollbackOutlined, DownOutlined, RightOutlined,
} from '@ant-design/icons'
import { useNavigate, useSearchParams } from 'react-router-dom'

/* ---- 枚举 ---- */
enum OrderStatus {
  PENDING_PROMOTION = 1,
  PROMOTING = 2,
  PROMOTED = 3,
  REFUNDED = 4,
}
const ORDER_STATUS_MAP: Record<OrderStatus, { label: string; color: string }> = {
  [OrderStatus.PENDING_PROMOTION]: { label: '待推廣', color: 'blue' },
  [OrderStatus.PROMOTING]: { label: '推廣中', color: 'green' },
  [OrderStatus.PROMOTED]: { label: '已完成', color: 'purple' },
  [OrderStatus.REFUNDED]: { label: '已退款', color: 'orange' },
}

enum AppType { SHANFENG = 1, MFOOD = 2 }
const APP_LABEL: Record<AppType, string> = { [AppType.SHANFENG]: '閃峰', [AppType.MFOOD]: 'mFood' }

enum RecommendChannel { DELIVERY = 2, GROUP_BUY = 3, SUPERMARKET = 4 }
const CHANNEL_LABEL: Record<RecommendChannel, string> = {
  [RecommendChannel.DELIVERY]: '美食外賣',
  [RecommendChannel.GROUP_BUY]: '團購到店',
  [RecommendChannel.SUPERMARKET]: '超市百貨',
}

const REGION_LABEL: Record<number, string> = {
  1: '黑沙環區', 2: '高士德區', 3: '新馬路區', 4: '新皇朝區', 5: '港珠澳區',
  6: '花城市區', 7: '北安機場', 8: '左酒店區', 9: '右酒店區', 10: '澳大專區', 11: '黑沙灘區',
}

enum RecommendType { INVINCIBLE_STAR = 1, REVITALIZATION_AD = 2, NEW_STORE_AD = 3, TRAFFIC_AD = 4 }
const RECOMMEND_TYPE_LABEL: Record<RecommendType, string> = {
  [RecommendType.INVINCIBLE_STAR]: '無敵星星',
  [RecommendType.REVITALIZATION_AD]: '盤活復蘇',
  [RecommendType.NEW_STORE_AD]: '新店廣告',
  [RecommendType.TRAFFIC_AD]: '流量廣告',
}
const RECOMMEND_TYPE_ICON: Record<RecommendType, string> = {
  [RecommendType.INVINCIBLE_STAR]: '⭐',
  [RecommendType.REVITALIZATION_AD]: '🔥',
  [RecommendType.NEW_STORE_AD]: '🏪',
  [RecommendType.TRAFFIC_AD]: '📊',
}

/* ---- 接口 ---- */
interface SlotPriceItem {
  slot: string       // 时段名称，如「早餐」「午餐」
  date: string       // 日期，如「2026-07-16」
  originalPrice: number
  discount: number   // 折扣，10=无折扣，8=8折
  actualPrice: number
}

interface OrderItem {
  id: string
  orderNo: string
  algorithmId: string
  promotionName: string
  app: AppType
  channel: RecommendChannel
  region: number
  recommendType: RecommendType
  slotPosition: number
  groupId: string
  groupName: string
  storeId: string
  storeName: string
  purchaseDate: string
  originalPrice: number
  discountPrice: number
  actualPrice: number
  status: OrderStatus
  orderTime: string
  payTime?: string
  slotPrices: SlotPriceItem[]
  gradientDiscount?: { count: number; discount: number } | null
  cancelFeeRules: { maxDays: number; feePercent: number }[]
  refundAmount?: number
  promoStartDate?: string // 推广开始日期
}

/* ---- Mock ---- */
const slotDefs = [
  { slot: '早餐', originalPrice: 80 },
  { slot: '午餐', originalPrice: 150 },
  { slot: '下午茶', originalPrice: 90 },
  { slot: '晚餐', originalPrice: 180 },
  { slot: '宵夜', originalPrice: 60 },
] as const

const dates = ['2026-07-16', '2026-07-17', '2026-07-18', '2026-07-19', '2026-07-20']
const pastDates = ['2025-06-20', '2025-06-21', '2025-06-22', '2025-06-23', '2025-06-24']

function genOrder(
  id: string, orderNo: string, algoId: string, promoName: string,
  app: AppType, channel: RecommendChannel, region: number,
  recType: RecommendType, slotPos: number, gid: string, gname: string,
  sid: string, sname: string, pdate: string, orig: number, disc: number,
  actual: number, status: OrderStatus, otime: string, ptime: string | undefined,
  slotPattern: number[], dateIdx: number, gradDisc: { count: number; discount: number } | null,
  refundAmt?: number,
): OrderItem {
  const isRevive = recType === RecommendType.REVITALIZATION_AD
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
  const cancelFeeRules = [
    { maxDays: 0, feePercent: 100 },
    { maxDays: 3, feePercent: 80 },
    { maxDays: 7, feePercent: 50 },
  ]
  return {
    id, orderNo, algorithmId: algoId, promotionName: promoName, app, channel, region,
    recommendType: recType, slotPosition: slotPos, groupId: gid, groupName: gname,
    storeId: sid, storeName: sname, purchaseDate: pdate, originalPrice: orig,
    discountPrice: disc, actualPrice: actual, status, orderTime: otime, payTime: ptime,
    promoStartDate: isPast ? '2025-06-15' : '2026-07-16',
    slotPrices, gradientDiscount: gradDisc, cancelFeeRules,
    ...(refundAmt !== undefined ? { refundAmount: refundAmt } : {}),
  }
}

const mockOrders: OrderItem[] = [
  // 無敵星星訂單 (id: 1-15)
  genOrder('1','ORD20250705001','ALG001','無敵星星·黃金展位',AppType.SHANFENG,RecommendChannel.DELIVERY,1,RecommendType.INVINCIBLE_STAR,3,'G10001','澳門美食集團','S20001','澳門總店','2025-07-05',2000,1800,1440,OrderStatus.PROMOTING,'2025-07-05 10:30:00','2025-07-05 10:35:00',[0,1,2,3,4,0,1,2,3,4],0,{count:10,discount:8}),
  genOrder('2','ORD20250706002','ALG002','無敵星星·首頁推薦',AppType.MFOOD,RecommendChannel.DELIVERY,6,RecommendType.INVINCIBLE_STAR,5,'G10002','閃峰餐飲連鎖','S20002','氹仔分店','2025-07-06',1500,1350,1350,OrderStatus.PENDING_PROMOTION,'2025-07-06 14:20:00','2025-07-06 14:25:00',[3],0,null),
  genOrder('3','ORD20250707003','ALG003','盤活復蘇·外賣熱推',AppType.SHANFENG,RecommendChannel.GROUP_BUY,3,RecommendType.INVINCIBLE_STAR,2,'G10003','大灣區餐飲集團','S20003','珠海旗艦店','2025-07-08',3000,2700,2700,OrderStatus.PROMOTED,'2025-07-07 09:15:00',undefined,[0,1,2,3,4],0,null),
  genOrder('4','ORD20250703004','ALG004','流量廣告·團購精選',AppType.MFOOD,RecommendChannel.SUPERMARKET,1,RecommendType.INVINCIBLE_STAR,4,'G10001','澳門美食集團','S20004','黑沙環店','2025-07-03',1000,900,900,OrderStatus.REFUNDED,'2025-07-03 16:40:00','2025-07-03 16:45:00',[0],0,null,900),
  genOrder('5','ORD20250702005','ALG001','無敵星星·週末專場',AppType.SHANFENG,RecommendChannel.SUPERMARKET,6,RecommendType.INVINCIBLE_STAR,1,'G10002','閃峰餐飲連鎖','S20005','新馬路店','2025-07-02',2500,2250,2250,OrderStatus.REFUNDED,'2025-07-02 11:20:00',undefined,[3,4],0,null,2250),
  genOrder('6','ORD20250701006','ALG001','無敵星星·早鳥優惠',AppType.MFOOD,RecommendChannel.GROUP_BUY,1,RecommendType.INVINCIBLE_STAR,2,'G10003','大灣區餐飲集團','S20001','澳門總店','2025-07-01',1800,1620,1620,OrderStatus.PENDING_PROMOTION,'2025-07-01 08:30:00','2025-07-01 08:35:00',[0,1,2,3,4],0,null),
  genOrder('7','ORD20250630007','ALG002','新店廣告·零售閃購',AppType.SHANFENG,RecommendChannel.DELIVERY,3,RecommendType.INVINCIBLE_STAR,3,'G10001','澳門美食集團','S20002','氹仔分店','2025-06-30',1200,1080,1080,OrderStatus.PENDING_PROMOTION,'2025-06-30 10:15:00','2025-06-30 10:20:00',[1],0,null),
  genOrder('8','ORD20250629008','ALG003','盤活復蘇·團購到店',AppType.MFOOD,RecommendChannel.GROUP_BUY,6,RecommendType.INVINCIBLE_STAR,4,'G10002','閃峰餐飲連鎖','S20003','珠海旗艦店','2025-06-29',2800,2520,2520,OrderStatus.PROMOTED,'2025-06-29 15:45:00',undefined,[0,1,2,3,4],0,null),
  genOrder('9','ORD20250628009','ALG004','流量廣告·大首頁推薦',AppType.SHANFENG,RecommendChannel.SUPERMARKET,1,RecommendType.INVINCIBLE_STAR,1,'G10003','大灣區餐飲集團','S20004','黑沙環店','2025-06-28',1600,1440,1440,OrderStatus.REFUNDED,'2025-06-28 09:20:00','2025-06-28 09:25:00',[0,2],0,null,1440),
  genOrder('10','ORD20250627010','ALG001','無敵星星·夜宵專場',AppType.MFOOD,RecommendChannel.DELIVERY,3,RecommendType.INVINCIBLE_STAR,5,'G10001','澳門美食集團','S20005','新馬路店','2025-06-27',2200,1980,1980,OrderStatus.PROMOTED,'2025-06-27 20:10:00','2025-06-27 20:15:00',[4],0,null),
  genOrder('11','ORD20250626011','ALG002','新店廣告·澳門專區',AppType.SHANFENG,RecommendChannel.DELIVERY,1,RecommendType.INVINCIBLE_STAR,2,'G10002','閃峰餐飲連鎖','S20001','澳門總店','2025-06-26',1900,1710,1710,OrderStatus.PENDING_PROMOTION,'2025-06-26 11:30:00','2025-06-26 11:35:00',[1,3],0,null),
  genOrder('12','ORD20250625012','ALG003','盤活復蘇·氹仔熱推',AppType.MFOOD,RecommendChannel.GROUP_BUY,6,RecommendType.INVINCIBLE_STAR,3,'G10003','大灣區餐飲集團','S20002','氹仔分店','2025-06-25',1400,1260,1260,OrderStatus.REFUNDED,'2025-06-25 13:50:00',undefined,[1,3],0,null,1260),
  genOrder('13','ORD20250624013','ALG004','流量廣告·珠海精選',AppType.SHANFENG,RecommendChannel.SUPERMARKET,3,RecommendType.INVINCIBLE_STAR,4,'G10001','澳門美食集團','S20003','珠海旗艦店','2025-06-24',2100,1890,1890,OrderStatus.PROMOTED,'2025-06-24 07:40:00',undefined,[0,1],0,null),
  genOrder('14','ORD20250623014','ALG001','無敵星星·全時段推廣',AppType.MFOOD,RecommendChannel.SUPERMARKET,1,RecommendType.INVINCIBLE_STAR,1,'G10002','閃峰餐飲連鎖','S20004','黑沙環店','2025-06-23',3500,3150,3150,OrderStatus.REFUNDED,'2025-06-23 06:20:00','2025-06-23 06:25:00',[0,1,2,3,4,0,1],0,null,3150),
  genOrder('15','ORD20250622015','ALG002','新店廣告·閃購特惠',AppType.SHANFENG,RecommendChannel.DELIVERY,6,RecommendType.INVINCIBLE_STAR,5,'G10003','大灣區餐飲集團','S20005','新馬路店','2025-06-22',1700,1530,1530,OrderStatus.REFUNDED,'2025-06-22 10:05:00','2025-06-22 10:10:00',[0,1,2],0,null,1530),
  // 盤活復甦訂單 (id: 101-115)
  genOrder('101','ORD20250715101','ALG003','盤活復甦·黃金展位',AppType.SHANFENG,RecommendChannel.DELIVERY,1,RecommendType.REVITALIZATION_AD,3,'G10001','澳門美食集團','S20001','澳門總店','2025-07-15',3000,2700,2700,OrderStatus.PROMOTING,'2025-07-15 10:30:00','2025-07-15 10:35:00',[0,1,2],0,{count:3,discount:9}),
  genOrder('102','ORD20250714102','ALG003','盤活復甦·首頁推薦',AppType.MFOOD,RecommendChannel.DELIVERY,6,RecommendType.REVITALIZATION_AD,5,'G10002','閃峰餐飲連鎖','S20002','氹仔分店','2025-07-14',2500,2250,2250,OrderStatus.PENDING_PROMOTION,'2025-07-14 14:20:00','2025-07-14 14:25:00',[0,1],0,null),
  genOrder('103','ORD20250713103','ALG003','盤活復甦·外賣熱推',AppType.SHANFENG,RecommendChannel.GROUP_BUY,3,RecommendType.REVITALIZATION_AD,2,'G10003','大灣區餐飲集團','S20003','珠海旗艦店','2025-07-13',4000,3600,3600,OrderStatus.PROMOTED,'2025-07-13 09:15:00',undefined,[0,1,2,3],0,null),
  genOrder('104','ORD20250712104','ALG003','盤活復甦·團購精選',AppType.MFOOD,RecommendChannel.SUPERMARKET,1,RecommendType.REVITALIZATION_AD,4,'G10001','澳門美食集團','S20004','黑沙環店','2025-07-12',1500,1350,1350,OrderStatus.REFUNDED,'2025-07-12 16:40:00','2025-07-12 16:45:00',[0],0,null,1350),
  genOrder('105','ORD20250711105','ALG003','盤活復甦·週末專場',AppType.SHANFENG,RecommendChannel.SUPERMARKET,6,RecommendType.REVITALIZATION_AD,1,'G10002','閃峰餐飲連鎖','S20005','新馬路店','2025-07-11',5000,4500,4500,OrderStatus.REFUNDED,'2025-07-11 11:20:00',undefined,[0,1,2,3,4],0,null,4500),
  genOrder('106','ORD20250710106','ALG003','盤活復甦·早鳥優惠',AppType.MFOOD,RecommendChannel.GROUP_BUY,1,RecommendType.REVITALIZATION_AD,2,'G10003','大灣區餐飲集團','S20001','澳門總店','2025-07-10',2000,1800,1800,OrderStatus.PENDING_PROMOTION,'2025-07-10 08:30:00','2025-07-10 08:35:00',[0,1],0,null),
  genOrder('107','ORD20250709107','ALG003','盤活復甦·零售閃購',AppType.SHANFENG,RecommendChannel.DELIVERY,3,RecommendType.REVITALIZATION_AD,3,'G10001','澳門美食集團','S20002','氹仔分店','2025-07-09',3500,3150,3150,OrderStatus.PENDING_PROMOTION,'2025-07-09 10:15:00','2025-07-09 10:20:00',[0,1,2],0,null),
  genOrder('108','ORD20250708108','ALG003','盤活復甦·團購到店',AppType.MFOOD,RecommendChannel.GROUP_BUY,6,RecommendType.REVITALIZATION_AD,4,'G10002','閃峰餐飲連鎖','S20003','珠海旗艦店','2025-07-08',2800,2520,2520,OrderStatus.PROMOTED,'2025-07-08 15:45:00',undefined,[0,1],0,null),
  genOrder('109','ORD20250707109','ALG003','盤活復甦·大首頁推薦',AppType.SHANFENG,RecommendChannel.SUPERMARKET,1,RecommendType.REVITALIZATION_AD,1,'G10003','大灣區餐飲集團','S20004','黑沙環店','2025-07-07',4500,4050,4050,OrderStatus.REFUNDED,'2025-07-07 09:20:00','2025-07-07 09:25:00',[0,1,2,3],0,null,4050),
  genOrder('110','ORD20250706110','ALG003','盤活復甦·夜宵專場',AppType.MFOOD,RecommendChannel.DELIVERY,3,RecommendType.REVITALIZATION_AD,5,'G10001','澳門美食集團','S20005','新馬路店','2025-07-06',2200,1980,1980,OrderStatus.PROMOTED,'2025-07-06 20:10:00','2025-07-06 20:15:00',[0,1],0,null),
  genOrder('111','ORD20250705111','ALG003','盤活復甦·澳門專區',AppType.SHANFENG,RecommendChannel.DELIVERY,1,RecommendType.REVITALIZATION_AD,2,'G10002','閃峰餐飲連鎖','S20001','澳門總店','2025-07-05',6000,5400,5400,OrderStatus.PENDING_PROMOTION,'2025-07-05 11:30:00','2025-07-05 11:35:00',[0,1,2,3,4,0],0,null),
  genOrder('112','ORD20250704112','ALG003','盤活復甦·氹仔熱推',AppType.MFOOD,RecommendChannel.GROUP_BUY,6,RecommendType.REVITALIZATION_AD,3,'G10003','大灣區餐飲集團','S20002','氹仔分店','2025-07-04',1400,1260,1260,OrderStatus.REFUNDED,'2025-07-04 13:50:00',undefined,[0,1],0,null,1260),
  genOrder('113','ORD20250703113','ALG003','盤活復甦·珠海精選',AppType.SHANFENG,RecommendChannel.SUPERMARKET,3,RecommendType.REVITALIZATION_AD,4,'G10001','澳門美食集團','S20003','珠海旗艦店','2025-07-03',3200,2880,2880,OrderStatus.PROMOTED,'2025-07-03 07:40:00',undefined,[0,1,2],0,null),
  genOrder('114','ORD20250702114','ALG003','盤活復甦·全時段推廣',AppType.MFOOD,RecommendChannel.SUPERMARKET,1,RecommendType.REVITALIZATION_AD,1,'G10002','閃峰餐飲連鎖','S20004','黑沙環店','2025-07-02',7000,6300,6300,OrderStatus.REFUNDED,'2025-07-02 06:20:00','2025-07-02 06:25:00',[0,1,2,3,4,0,1],0,null,6300),
  genOrder('115','ORD20250701115','ALG003','盤活復甦·閃購特惠',AppType.SHANFENG,RecommendChannel.DELIVERY,6,RecommendType.REVITALIZATION_AD,5,'G10003','大灣區餐飲集團','S20005','新馬路店','2025-07-01',3800,3420,3420,OrderStatus.REFUNDED,'2025-07-01 10:05:00','2025-07-01 10:10:00',[0,1,2],0,null,3420),
]

/* ---- 进度阶段定义 ---- */
const PROGRESS_STAGES = [
  { key: 'ordered', label: '下單成功' },
  { key: 'pending', label: '待推廣' },
  { key: 'promoting', label: '推廣中' },
  { key: 'done', label: '已完成' },
]

function getStageIndex(status: OrderStatus): number {
  switch (status) {
    case OrderStatus.PENDING_PROMOTION: return 1
    case OrderStatus.PROMOTING: return 2
    case OrderStatus.PROMOTED: return 3
    case OrderStatus.REFUNDED: return 3
    default: return 0
  }
}

function getStageTime(status: OrderStatus, stageIdx: number, order: OrderItem): string {
  if (stageIdx === 0) return order.orderTime
  if (stageIdx === 1) return order.payTime || ''
  if (stageIdx === 2) return order.promoStartDate || ''
  if (stageIdx === 3) {
    if (order.status === OrderStatus.REFUNDED) return '已退款'
    return ''
  }
  return ''
}

/* ---- 卡片标题组件 ---- */
function CardTitle({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <div style={{
        width: 24, height: 24, borderRadius: 6, background: '#e6f7ff',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        {icon}
      </div>
      <span style={{ fontSize: 15, fontWeight: 600, color: '#262626' }}>{text}</span>
    </div>
  )
}

/* ---- 主组件 ---- */
export default function OrderDetail() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const orderId = searchParams.get('id')
  const orderType = searchParams.get('type') || ''
  const [order, setOrder] = useState<OrderItem | null>(null)
  const [refundModalVisible, setRefundModalVisible] = useState(false)
  const [slotsCollapsed, setSlotsCollapsed] = useState(false)

  useEffect(() => {
    if (orderId) {
      setOrder(mockOrders.find(o => o.id === orderId) || null)
    }
  }, [orderId])

  // 计算退款信息
  const refundInfo = useMemo(() => {
    if (!order) return null
    const rules = order.cancelFeeRules
    const today = new Date()
    const promoStart = order.promoStartDate ? new Date(order.promoStartDate) : null

    // 推广中或已完成 → 退款金额为0
    if (order.status === OrderStatus.PROMOTING || order.status === OrderStatus.PROMOTED) {
      return { daysBefore: 0, feePercent: 100, refundAmount: 0, isPromoting: true }
    }
    if (order.status === OrderStatus.REFUNDED) {
      return { daysBefore: 0, feePercent: 0, refundAmount: order.refundAmount || 0, isPromoting: false }
    }

    // 待推广 → 基于规则计算
    if (promoStart) {
      const diffMs = promoStart.getTime() - today.getTime()
      const daysBefore = Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)))
      // 找到匹配的扣费规则
      let feePercent = 100
      for (const rule of rules.sort((a, b) => a.maxDays - b.maxDays)) {
        if (daysBefore <= rule.maxDays) {
          feePercent = rule.feePercent
          break
        }
      }
      // 如果天数大于所有规则的maxDays，不扣费
      if (daysBefore > rules[rules.length - 1]?.maxDays) {
        feePercent = 0
      }
      const refundAmount = Math.round(order.actualPrice * (1 - feePercent / 100))
      return { daysBefore, feePercent, refundAmount, isPromoting: false }
    }
    return null
  }, [order])

  if (!order) {
    return (
      <div className="content-area" style={{ minHeight: 400, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Empty description="訂單不存在" />
      </div>
    )
  }

  const statusInfo = ORDER_STATUS_MAP[order.status]
  const currentStage = getStageIndex(order.status)
  const isRefunded = order.status === OrderStatus.REFUNDED

  // 按日期分组时段（普通计算，不用 useMemo，因为已在条件返回之后）
  const slotsByDateMap = new Map<string, SlotPriceItem[]>()
  order.slotPrices.forEach(sp => {
    if (!slotsByDateMap.has(sp.date)) slotsByDateMap.set(sp.date, [])
    slotsByDateMap.get(sp.date)!.push(sp)
  })
  const slotsByDate = Array.from(slotsByDateMap.entries())

  const totalOriginal = order.slotPrices.reduce((s, sp) => s + sp.originalPrice, 0)
  const slotSubtotal = order.slotPrices.reduce((s, sp) => s + sp.actualPrice, 0)
  const slotDiscountSaved = totalOriginal - slotSubtotal
  const gradientMultiplier = order.gradientDiscount ? order.gradientDiscount.discount / 10 : 1
  const finalPrice = Math.round(slotSubtotal * gradientMultiplier)
  const totalSaved = totalOriginal - finalPrice

  const handleRefund = () => {
    setRefundModalVisible(true)
  }

  const confirmRefund = () => {
    setOrder(prev => prev ? { ...prev, status: OrderStatus.REFUNDED, refundAmount: refundInfo?.refundAmount || 0 } : null)
    setRefundModalVisible(false)
    message.success('退款成功')
  }

  return (
    <div className="content-area">
      {/* 顶部导航栏 */}
      <div style={{
        position: 'relative', background: '#fff', marginBottom: 16,
        borderRadius: 12, boxShadow: '0 2px 12px rgba(0,0,0,0.06)',
        overflow: 'hidden',
      }}>
        {/* 顶部渐变装饰线 */}
        <div style={{
          height: 3, background: 'linear-gradient(90deg, #E8720C, #F59432, #FFB347, #F59432, #E8720C)',
          backgroundSize: '200% 100%', animation: 'headerGradientShift 4s ease infinite',
        }} />
        <div style={{
          padding: '16px 24px', display: 'flex', alignItems: 'center',
          justifyContent: 'space-between', animation: 'headerFadeSlideIn 0.5s ease',
        }}>
          {/* 左侧：返回 + 标题 */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <Button type="primary" icon={<ArrowLeftOutlined />}
              onClick={() => navigate(`/promotion-order-manage?type=${encodeURIComponent(orderType)}`)}
              style={{
                backgroundColor: '#E8720C', borderColor: '#E8720C',
                borderRadius: 8, height: 36, padding: '0 16px',
                display: 'flex', alignItems: 'center', gap: 6,
                boxShadow: '0 2px 6px rgba(232,114,12,0.25)',
                transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
              }}>返回</Button>
            {/* 分隔线 */}
            <div style={{ width: 1, height: 20, background: '#E8E8E8' }} />
            {/* 标题区 */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#1890ff' }}>訂單詳情</h2>
              <Tag color={statusInfo.color} style={{
                fontSize: 12, padding: '2px 10px', borderRadius: 4,
                fontWeight: 500, animation: 'statusPulse 2.5s ease-in-out infinite',
                margin: 0,
              }}>{statusInfo.label}</Tag>
            </div>
          </div>
        </div>
      </div>

      {/* 订单状态流程 */}
      <div style={{
        position: 'relative', background: '#fff', marginBottom: 16,
        borderRadius: 12, boxShadow: '0 2px 12px rgba(0,0,0,0.06)',
        overflow: 'hidden',
      }}>
        <div style={{ padding: '24px 32px 20px', animation: 'headerFadeSlideIn 0.5s ease' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'center' }}>
            {PROGRESS_STAGES.map((stage, idx) => {
              const isPast = idx < currentStage
              const isCurrent = idx === currentStage
              const isFuture = idx > currentStage
              const stageTime = getStageTime(order.status, idx, order)

              /** 阶段图标 */
              const stageIcon = () => {
                if (isRefunded && idx === 3) return <RollbackOutlined style={{ fontSize: 15, color: '#fff' }} />
                if (isPast) return <CheckOutlined style={{ fontSize: 15, color: '#fff' }} />
                if (isCurrent) return (
                  <div style={{
                    width: 10, height: 10, borderRadius: '50%', background: '#fff',
                    animation: 'nodeBreath 1.5s ease-in-out infinite',
                  }} />
                )
                return <ClockCircleOutlined style={{ fontSize: 14, color: '#BFBFBF' }} />
              }

              /** 阶段背景渐变 */
              const nodeBg = isPast
                ? 'linear-gradient(135deg, #52C41A, #73D13D)'
                : isCurrent
                  ? 'linear-gradient(135deg, #E8720C, #F59432)'
                  : '#fff'

              return (
                <div key={stage.key} style={{
                  display: 'flex', alignItems: 'flex-start',
                  flex: idx < PROGRESS_STAGES.length - 1 ? 1 : 'none',
                }}>
                  {/* 阶段节点 + 标签 */}
                  <div style={{
                    display: 'flex', flexDirection: 'column', alignItems: 'center',
                    minWidth: 90, position: 'relative',
                  }}>
                    {/* 圆形节点 */}
                    <div style={{
                      width: 38, height: 38, borderRadius: '50%',
                      background: nodeBg,
                      border: isFuture ? '2px solid #E8E8E8' : 'none',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      boxShadow: isCurrent
                        ? '0 0 0 4px rgba(232,114,12,0.12), 0 2px 8px rgba(232,114,12,0.25)'
                        : isPast
                          ? '0 2px 6px rgba(82,196,26,0.25)'
                          : '0 1px 3px rgba(0,0,0,0.06)',
                      transition: 'all 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
                      zIndex: 2,
                      animation: isCurrent
                        ? 'nodeBreath 2s ease-in-out infinite'
                        : (idx === currentStage + 1 ? 'nextNodeReact 2s ease-in-out infinite' : 'none'),
                    }}>
                      {stageIcon()}
                    </div>
                    {/* 阶段标签 */}
                    <div style={{
                      marginTop: 10, fontSize: 13,
                      fontWeight: isCurrent ? 700 : isPast ? 600 : 400,
                      color: isPast ? '#52C41A' : isCurrent ? '#E8720C' : '#8C8C8C',
                      whiteSpace: 'nowrap', transition: 'color 0.3s',
                      animation: isCurrent ? 'nodeBreath 2s ease-in-out infinite' : 'none',
                      textShadow: isCurrent ? '0 0 8px rgba(232,114,12,0.3)' : 'none',
                    }}>
                      {isRefunded && idx === 3 ? '已退款' : stage.label}
                    </div>
                    {/* 时间信息 */}
                    {stageTime && (
                      <div style={{
                        fontSize: 11, color: '#8C8C8C',
                        whiteSpace: 'nowrap', textAlign: 'center',
                        padding: '2px 8px', background: '#FAFAFA',
                        borderRadius: 4, marginTop: 6,
                      }}>
                        {stageTime}
                      </div>
                    )}
                    {/* 当前阶段波纹动效 */}
                    {isCurrent && (
                      <>
                        {/* 波纹 1 - 从节点边缘向外扩散 */}
                        <div style={{
                          position: 'absolute', top: -4, left: '50%',
                          width: 46, height: 46, borderRadius: '50%',
                          border: '2px solid rgba(232,114,12,0.35)',
                          marginLeft: -23,
                          animation: 'rippleExpand 2s ease-out infinite',
                          pointerEvents: 'none',
                        }} />
                        {/* 波纹 2（延迟） */}
                        <div style={{
                          position: 'absolute', top: -4, left: '50%',
                          width: 46, height: 46, borderRadius: '50%',
                          border: '2px solid rgba(232,114,12,0.25)',
                          marginLeft: -23,
                          animation: 'rippleExpand 2s ease-out infinite 0.8s',
                          pointerEvents: 'none',
                        }} />
                      </>
                    )}
                  </div>
                  {/* 连接线 */}
                  {idx < PROGRESS_STAGES.length - 1 && (
                    <div style={{
                      flex: 1, height: 3, marginTop: 18, minWidth: 32,
                      background: idx < currentStage
                        ? 'linear-gradient(90deg, #52C41A, #73D13D)'
                        : idx === currentStage
                          ? 'linear-gradient(90deg, #E8720C, #F59432)'
                          : '#F0F0F0',
                      borderRadius: 2,
                      position: 'relative',
                      overflow: 'hidden',
                    }}>
                      {/* 当前阶段前进动画线条 */}
                      {idx === currentStage && (
                        <div style={{
                          position: 'absolute', top: 0, left: 0, height: '100%',
                          width: '40%', borderRadius: 2,
                          background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.6), transparent)',
                          animation: 'progressShimmer 2s ease-in-out infinite',
                        }} />
                      )}
                      {/* 下一阶段连接线渐变流动 */}
                      {idx === currentStage && (
                        <div style={{
                          position: 'absolute', top: 0, left: 0, height: '100%',
                          width: '50%', borderRadius: 2,
                          background: 'linear-gradient(90deg, transparent, rgba(232,114,12,0.5), rgba(245,148,50,0.3), transparent)',
                          animation: 'lineGlow 2s ease-in-out infinite',
                        }} />
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* 购买商家信息 */}
      <Card title={<CardTitle icon={<ShopOutlined style={{ fontSize: 12, color: '#1890ff' }} />} text="購買商家信息" />}
        style={{ marginBottom: 16, borderRadius: 8 }} styles={{ body: { padding: '16px 24px' } }}>
        <Descriptions column={2} labelStyle={{ color: '#8c8c8c', fontSize: 13 }} contentStyle={{ fontSize: 13 }}>
          <Descriptions.Item label="集團">
            <span>{order.groupName}</span>
            <span style={{ color: '#8C8C8C', fontSize: 12 }}>（ID：{order.groupId}）</span>
          </Descriptions.Item>
          <Descriptions.Item label="門店">
            <span>{order.storeName}</span>
            <span style={{ color: '#8C8C8C', fontSize: 12 }}>（ID：{order.storeId}）</span>
          </Descriptions.Item>
        </Descriptions>
      </Card>

      {/* 订单信息 */}
      <Card title={
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <CardTitle icon={<FileTextOutlined style={{ fontSize: 12, color: '#1890ff' }} />} text="訂單信息" />
          <div style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '4px 12px', background: '#FFF7E6',
            borderRadius: 4, border: '1px solid #FFD591',
            marginLeft: 4,
          }}>
            <span style={{ fontSize: 11, color: '#E8720C', fontWeight: 600 }}>訂單編號</span>
            <span style={{ fontSize: 13, color: '#262626', fontWeight: 700, letterSpacing: 0.5 }}>
              {order.orderNo}
            </span>
          </div>
        </div>
      }
        style={{ marginBottom: 16, borderRadius: 8 }} styles={{ body: { padding: '16px 24px' } }}>
        <Descriptions column={3} labelStyle={{ color: '#8c8c8c', fontSize: 13 }} contentStyle={{ fontSize: 13 }}>
          <Descriptions.Item label="廣告類型">
            <Tag color="gold">{RECOMMEND_TYPE_ICON[order.recommendType]} {RECOMMEND_TYPE_LABEL[order.recommendType]}</Tag>
          </Descriptions.Item>
          <Descriptions.Item label="所屬品牌">{APP_LABEL[order.app]}</Descriptions.Item>
          <Descriptions.Item label="業務頻道">{CHANNEL_LABEL[order.channel]}</Descriptions.Item>
          <Descriptions.Item label="所屬商圈">{REGION_LABEL[order.region] || '-'}</Descriptions.Item>
          <Descriptions.Item label="算法ID">
            <span style={{ color: '#8C8C8C', fontSize: 12 }}>{order.algorithmId}</span>
          </Descriptions.Item>
          <Descriptions.Item label="算法名稱">{order.promotionName}</Descriptions.Item>
        </Descriptions>
      </Card>

      {/* 购买时段与价格明细 */}
      <Card
        title={
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}
            onClick={() => setSlotsCollapsed(!slotsCollapsed)}>
            <CardTitle icon={<DollarOutlined style={{ fontSize: 12, color: '#1890ff' }} />} text="購買時段與價格明細" />
            <span style={{ fontSize: 12, color: '#8C8C8C', marginLeft: 4 }}>
              {slotsCollapsed ? <RightOutlined /> : <DownOutlined />}
            </span>
            <span style={{ fontSize: 12, color: '#8C8C8C' }}>{slotsCollapsed ? '展開' : '收起'}</span>
          </div>
        }
        style={{ marginBottom: 16, borderRadius: 8 }} styles={{ body: { padding: slotsCollapsed ? '0 24px' : '16px 24px' } }}>

        {!slotsCollapsed && (<>
        {/* 无敌星星：按日期分组 */}
        {order.recommendType === RecommendType.INVINCIBLE_STAR && slotsByDate.map(([date, slots]) => (
          <div key={date} style={{
            border: '1px solid #f0f0f0', borderRadius: 8, marginBottom: 12, overflow: 'hidden',
          }}>
            <div style={{
              background: '#FAFAFA', padding: '8px 16px', borderBottom: '1px solid #f0f0f0',
              fontSize: 13, fontWeight: 600, color: '#262626',
            }}>
              {date}
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, tableLayout: 'fixed' }}>
              <colgroup>
                <col style={{ width: '20%' }} />
                <col style={{ width: '25%' }} />
                <col style={{ width: '20%' }} />
                <col style={{ width: '35%' }} />
              </colgroup>
              <thead>
                <tr style={{ background: '#FAFAFA' }}>
                  <th style={{ padding: '8px 16px', textAlign: 'center', fontWeight: 600, color: '#262626', fontSize: 12, background: '#F0F5FF', borderBottom: '1px solid #D6E4FF' }}>時段</th>
                  <th style={{ padding: '8px 16px', textAlign: 'center', fontWeight: 600, color: '#262626', fontSize: 12, background: '#F0F5FF', borderBottom: '1px solid #D6E4FF' }}>原價（MOP）</th>
                  <th style={{ padding: '8px 16px', textAlign: 'center', fontWeight: 600, color: '#262626', fontSize: 12, background: '#F0F5FF', borderBottom: '1px solid #D6E4FF' }}>折扣</th>
                  <th style={{ padding: '8px 16px', textAlign: 'center', fontWeight: 600, color: '#262626', fontSize: 12, background: '#F0F5FF', borderBottom: '1px solid #D6E4FF' }}>折後價（MOP）</th>
                </tr>
              </thead>
              <tbody>
                {slots.map((sp, i) => (
                  <tr key={i} style={{ borderTop: i > 0 ? '1px solid #f0f0f0' : 'none' }}>
                    <td style={{ padding: '8px 16px', textAlign: 'center' }}>{sp.slot}</td>
                    <td style={{ padding: '8px 16px', textAlign: 'center', color: '#595959' }}>{sp.originalPrice}</td>
                    <td style={{ padding: '8px 16px', textAlign: 'center' }}>
                      {sp.discount < 10 ? <Tag color="green">{sp.discount}折</Tag> : <span style={{ color: '#8C8C8C' }}>無折扣</span>}
                    </td>
                    <td style={{ padding: '8px 16px', textAlign: 'center', fontWeight: 500, color: '#E8720C' }}>{sp.actualPrice}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}

        {/* 盘活复苏：按天展示 */}
        {order.recommendType === RecommendType.REVITALIZATION_AD && (
          <div style={{ border: '1px solid #f0f0f0', borderRadius: 8, overflow: 'hidden', marginBottom: 12 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, tableLayout: 'fixed' }}>
              <colgroup>
                <col style={{ width: '20%' }} />
                <col style={{ width: '25%' }} />
                <col style={{ width: '20%' }} />
                <col style={{ width: '35%' }} />
              </colgroup>
              <thead>
                <tr style={{ background: '#FAFAFA' }}>
                  <th style={{ padding: '8px 16px', textAlign: 'center', fontWeight: 600, color: '#262626', fontSize: 12, background: '#F0F5FF', borderBottom: '1px solid #D6E4FF' }}>日期</th>
                  <th style={{ padding: '8px 16px', textAlign: 'center', fontWeight: 600, color: '#262626', fontSize: 12, background: '#F0F5FF', borderBottom: '1px solid #D6E4FF' }}>原價（MOP）</th>
                  <th style={{ padding: '8px 16px', textAlign: 'center', fontWeight: 600, color: '#262626', fontSize: 12, background: '#F0F5FF', borderBottom: '1px solid #D6E4FF' }}>折扣</th>
                  <th style={{ padding: '8px 16px', textAlign: 'center', fontWeight: 600, color: '#262626', fontSize: 12, background: '#F0F5FF', borderBottom: '1px solid #D6E4FF' }}>折後價（MOP）</th>
                </tr>
              </thead>
              <tbody>
                {order.slotPrices.map((sp, i) => (
                  <tr key={i} style={{ borderTop: i > 0 ? '1px solid #f0f0f0' : 'none' }}>
                    <td style={{ padding: '8px 16px', textAlign: 'center' }}>{sp.date}</td>
                    <td style={{ padding: '8px 16px', textAlign: 'center', color: '#595959' }}>{sp.originalPrice}</td>
                    <td style={{ padding: '8px 16px', textAlign: 'center' }}>
                      {sp.discount < 10 ? <Tag color="green">{sp.discount}折</Tag> : <span style={{ color: '#8C8C8C' }}>無折扣</span>}
                    </td>
                    <td style={{ padding: '8px 16px', textAlign: 'center', fontWeight: 500, color: '#E8720C' }}>{sp.actualPrice}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* 费用汇总 */}
        <div style={{
          padding: '20px', background: 'linear-gradient(135deg, #FFF9F0, #FFF4E6)', borderRadius: 12,
          border: '1px solid #FFE0B2',
        }}>
          {/* 标题 */}
          <div style={{ fontSize: 14, fontWeight: 700, color: '#E8720C', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 16 }}>💰</span> 費用明細
          </div>

          {/* 分步计算 */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {/* 第1步：时段小计 */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 12, color: '#8C8C8C', minWidth: 90 }}>① 時段原價合計</span>
              <span style={{ fontSize: 14, fontWeight: 600, color: '#262626' }}>MOP {totalOriginal}</span>
              <span style={{ fontSize: 11, color: '#BFBFBF' }}>（共 {order.slotPrices.length} 個時段）</span>
            </div>

            {/* 第2步：时段折扣 */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 12, color: '#8C8C8C', minWidth: 90 }}>② 時段折扣後</span>
              <span style={{ fontSize: 14, fontWeight: 600, color: '#52C41A' }}>MOP {slotSubtotal}</span>
              {slotDiscountSaved > 0 && (
                <span style={{ fontSize: 11, color: '#52C41A', background: '#F6FFED', padding: '1px 8px', borderRadius: 4, border: '1px solid #B7EB8F' }}>
                  已省 {slotDiscountSaved} 元
                </span>
              )}
            </div>

            {/* 第3步：梯度折扣 */}
            {order.gradientDiscount && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 12, color: '#8C8C8C', minWidth: 90 }}>③ 梯度折扣</span>
                <span style={{ fontSize: 13, color: '#595959' }}>
                  滿 {order.gradientDiscount.count} 個時段享 <strong style={{ color: '#E8720C' }}>{order.gradientDiscount.discount}折</strong>
                </span>
                <span style={{ fontSize: 14, fontWeight: 600, color: '#E8720C' }}>
                  → MOP {finalPrice}
                </span>
                {totalSaved > slotDiscountSaved && (
                  <span style={{ fontSize: 11, color: '#E8720C', background: '#FFF7E6', padding: '1px 8px', borderRadius: 4, border: '1px solid #FFD591' }}>
                    再省 {totalSaved - slotDiscountSaved} 元
                  </span>
                )}
              </div>
            )}

            {/* 分隔线 */}
            <div style={{ height: 1, background: '#FFE0B2', margin: '4px 0' }} />

            {/* 最终实付 */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 14, fontWeight: 700, color: '#262626' }}>商家需支付</span>
                <span style={{ fontSize: 11, color: '#8C8C8C' }}>
                  {order.gradientDiscount
                    ? `（${order.slotPrices.length}個時段 × 各時段折扣${order.gradientDiscount.count > order.slotPrices.length ? '，未觸發梯度' : `，已享${order.gradientDiscount.discount}折梯度`}）`
                    : `（${order.slotPrices.length}個時段 × 各時段折扣）`
                  }
                </span>
              </div>
              <div style={{
                padding: '6px 20px', background: 'linear-gradient(135deg, #E8720C, #F59432)',
                borderRadius: 8, boxShadow: '0 2px 8px rgba(232,114,12,0.3)',
              }}>
                <span style={{ fontSize: 22, fontWeight: 700, color: '#fff' }}>MOP {finalPrice}</span>
              </div>
            </div>
          </div>

          {/* 计算公式详解 */}
          <div style={{
            marginTop: 16, padding: '10px 14px', background: '#fff', borderRadius: 8,
            border: '1px dashed #FFD591', fontSize: 12, color: '#8C8C8C', lineHeight: 2,
          }}>
            <div style={{ fontWeight: 600, color: '#595959', marginBottom: 4 }}>📐 計算公式：</div>
            {order.slotPrices.map((sp, i) => (
              <span key={i}>
                {sp.slot} {sp.originalPrice}×{sp.discount / 10}{i < order.slotPrices.length - 1 ? ' + ' : ''}
              </span>
            ))}
            {' = '}
            <strong style={{ color: '#52C41A' }}>{slotSubtotal}</strong>
            {order.gradientDiscount && (
              <> × {order.gradientDiscount.discount / 10} = <strong style={{ color: '#E8720C' }}>{finalPrice}</strong></>
            )}
            <span style={{ color: '#BFBFBF' }}>（MOP）</span>
          </div>
        </div>

        {/* 取消扣费规则 */}
        <div style={{
          marginTop: 12, padding: '10px 16px', borderRadius: 8,
          background: '#FAFAFA', border: '1px solid #F0F0F0',
        }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: '#8C8C8C', marginBottom: 4 }}>
            取消扣費規則
          </div>
          <div style={{ fontSize: 12, color: '#8C8C8C' }}>
            {order.cancelFeeRules.map((rule, i) => (
              <span key={i}>
                {i > 0 && ' | '}
                推廣前 {rule.maxDays} 天內扣 {rule.feePercent}%
              </span>
            ))}
          </div>
        </div>
        </>)}
      </Card>

      {/* 底部操作栏 */}
      <div className="form-footer">
        <Button onClick={() => navigate(`/promotion-order-manage?type=${encodeURIComponent(orderType)}`)}>
          返回列表
        </Button>
        {(order.status === OrderStatus.PENDING_PROMOTION || order.status === OrderStatus.PROMOTING) && (
          <Button type="primary" danger icon={<RollbackOutlined />}
            onClick={handleRefund}>
            申請退款
          </Button>
        )}
      </div>

      {/* 退款确认弹窗 */}
      <Modal
        title={
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <ExclamationCircleOutlined style={{ color: '#FF4D4F', fontSize: 18 }} />
            <span style={{ fontSize: 16, fontWeight: 600, color: '#262626' }}>確認退款</span>
          </div>
        }
        open={refundModalVisible}
        onOk={confirmRefund}
        onCancel={() => setRefundModalVisible(false)}
        okText="確認退款"
        cancelText="取消"
        okButtonProps={{ danger: true }}
      >
        {refundInfo?.isPromoting ? (
          <div>
            <div style={{
              background: '#FFF1F0', border: '1px solid #FFA39E', borderRadius: 8,
              padding: 16, marginBottom: 16,
            }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: '#FF4D4F', marginBottom: 8 }}>
                當前退款金額為 MOP 0
              </div>
              <div style={{ fontSize: 13, color: '#595959', lineHeight: 1.8 }}>
                訂單已進入推廣階段，確認退款將<strong style={{ color: '#FF4D4F' }}>立即取消推廣</strong>，且無法退回任何費用。
                <br />
                <strong>請慎重操作！</strong>
              </div>
            </div>
            <Descriptions column={1} size="small" labelStyle={{ color: '#8C8C8C' }} contentStyle={{ fontWeight: 500 }}>
              <Descriptions.Item label="訂單編號">{order.orderNo}</Descriptions.Item>
              <Descriptions.Item label="實付金額">MOP {order.actualPrice}</Descriptions.Item>
              <Descriptions.Item label="退款金額"><span style={{ color: '#FF4D4F', fontSize: 16, fontWeight: 700 }}>MOP 0</span></Descriptions.Item>
            </Descriptions>
          </div>
        ) : (
          <div>
            <div style={{
              background: '#FFF7E6', border: '1px solid #FFD591', borderRadius: 8,
              padding: 16, marginBottom: 16,
            }}>
              <div style={{ fontSize: 13, color: '#595959', lineHeight: 1.8 }}>
                距推廣開始還有 <strong style={{ color: '#E8720C' }}>{refundInfo?.daysBefore ?? 0} 天</strong>，
                根據取消扣費規則，扣費比例為 <strong>{refundInfo?.feePercent ?? 0}%</strong>。
              </div>
            </div>
            <Descriptions column={1} size="small" labelStyle={{ color: '#8C8C8C' }} contentStyle={{ fontWeight: 500 }}>
              <Descriptions.Item label="訂單編號">{order.orderNo}</Descriptions.Item>
              <Descriptions.Item label="實付金額">MOP {order.actualPrice}</Descriptions.Item>
              <Descriptions.Item label="扣費比例">{refundInfo?.feePercent ?? 0}%</Descriptions.Item>
              <Descriptions.Item label="退款金額">
                <span style={{ color: '#52C41A', fontSize: 16, fontWeight: 700 }}>
                  MOP {refundInfo?.refundAmount ?? 0}
                </span>
              </Descriptions.Item>
            </Descriptions>
            <div style={{ marginTop: 12, fontSize: 12, color: '#8C8C8C', background: '#FAFAFA', padding: '8px 12px', borderRadius: 6 }}>
              計算公式：退款金額 = 實付 MOP {order.actualPrice} × (1 - {refundInfo?.feePercent ?? 0}%) = MOP {refundInfo?.refundAmount ?? 0}
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
