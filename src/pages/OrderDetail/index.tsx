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
const mockOrders: OrderItem[] = [
  {
    id: '1',
    orderNo: 'ORD20250705001',
    algorithmId: 'ALG001',
    promotionName: '無敵星星·黃金展位',
    app: AppType.SHANFENG,
    channel: RecommendChannel.DELIVERY,
    region: 1,
    recommendType: RecommendType.INVINCIBLE_STAR,
    slotPosition: 3,
    groupId: 'G10001',
    groupName: '澳門美食集團',
    storeId: 'S20001',
    storeName: '澳門總店',
    purchaseDate: '2025-07-05',
    originalPrice: 2000,
    discountPrice: 1800,
    actualPrice: 1440,
    status: OrderStatus.PROMOTING,
    orderTime: '2025-07-05 10:30:00',
    payTime: '2025-07-05 10:35:00',
    promoStartDate: '2026-07-16',
    slotPrices: [
      { slot: '早餐', date: '2026-07-16', originalPrice: 80, discount: 8, actualPrice: 64 },
      { slot: '午餐', date: '2026-07-16', originalPrice: 150, discount: 9, actualPrice: 135 },
      { slot: '下午茶', date: '2026-07-16', originalPrice: 90, discount: 8, actualPrice: 72 },
      { slot: '晚餐', date: '2026-07-16', originalPrice: 180, discount: 8, actualPrice: 144 },
      { slot: '宵夜', date: '2026-07-16', originalPrice: 60, discount: 10, actualPrice: 60 },
      { slot: '早餐', date: '2026-07-17', originalPrice: 80, discount: 8, actualPrice: 64 },
      { slot: '午餐', date: '2026-07-17', originalPrice: 150, discount: 9, actualPrice: 135 },
      { slot: '下午茶', date: '2026-07-17', originalPrice: 90, discount: 8, actualPrice: 72 },
      { slot: '晚餐', date: '2026-07-17', originalPrice: 180, discount: 8, actualPrice: 144 },
      { slot: '宵夜', date: '2026-07-17', originalPrice: 60, discount: 10, actualPrice: 60 },
    ],
    gradientDiscount: { count: 10, discount: 8 },
    cancelFeeRules: [
      { maxDays: 0, feePercent: 100 },
      { maxDays: 3, feePercent: 80 },
      { maxDays: 7, feePercent: 50 },
    ],
  },
  {
    id: '2',
    orderNo: 'ORD20250706002',
    algorithmId: 'ALG002',
    promotionName: '無敵星星·首頁推薦',
    app: AppType.MFOOD,
    channel: RecommendChannel.DELIVERY,
    region: 6,
    recommendType: RecommendType.INVINCIBLE_STAR,
    slotPosition: 5,
    groupId: 'G10002',
    groupName: '閃峰餐飲連鎖',
    storeId: 'S20002',
    storeName: '氹仔分店',
    purchaseDate: '2025-07-06',
    originalPrice: 1500,
    discountPrice: 1350,
    actualPrice: 1350,
    status: OrderStatus.PENDING_PROMOTION,
    orderTime: '2025-07-06 14:20:00',
    payTime: '2025-07-06 14:25:00',
    promoStartDate: '2026-07-16',
    slotPrices: [
      { slot: '晚餐', date: '2026-07-16', originalPrice: 1500, discount: 9, actualPrice: 1350 },
    ],
    gradientDiscount: null,
    cancelFeeRules: [
      { maxDays: 0, feePercent: 100 },
      { maxDays: 3, feePercent: 80 },
      { maxDays: 7, feePercent: 50 },
    ],
  },
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
  const totalActual = order.slotPrices.reduce((s, sp) => s + sp.actualPrice, 0)
  const totalDiscount = totalOriginal - totalActual

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
                          animation: 'rippleExpand 2s ease-out infinite',
                          pointerEvents: 'none',
                        }} />
                        {/* 波纹 2（延迟） */}
                        <div style={{
                          position: 'absolute', top: -4, left: '50%',
                          width: 46, height: 46, borderRadius: '50%',
                          border: '2px solid rgba(232,114,12,0.25)',
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
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: '#FAFAFA' }}>
                  <th style={{ padding: '8px 16px', textAlign: 'left', fontWeight: 500, color: '#8C8C8C', fontSize: 12 }}>時段</th>
                  <th style={{ padding: '8px 16px', textAlign: 'right', fontWeight: 500, color: '#8C8C8C', fontSize: 12 }}>原價（MOP）</th>
                  <th style={{ padding: '8px 16px', textAlign: 'right', fontWeight: 500, color: '#8C8C8C', fontSize: 12 }}>折扣</th>
                  <th style={{ padding: '8px 16px', textAlign: 'right', fontWeight: 500, color: '#8C8C8C', fontSize: 12 }}>折後價（MOP）</th>
                </tr>
              </thead>
              <tbody>
                {slots.map((sp, i) => (
                  <tr key={i} style={{ borderTop: i > 0 ? '1px solid #f0f0f0' : 'none' }}>
                    <td style={{ padding: '8px 16px' }}>{sp.slot}</td>
                    <td style={{ padding: '8px 16px', textAlign: 'right', color: '#595959' }}>{sp.originalPrice}</td>
                    <td style={{ padding: '8px 16px', textAlign: 'right' }}>
                      {sp.discount < 10 ? <Tag color="green">{sp.discount}折</Tag> : <span style={{ color: '#8C8C8C' }}>無折扣</span>}
                    </td>
                    <td style={{ padding: '8px 16px', textAlign: 'right', fontWeight: 500, color: '#E8720C' }}>{sp.actualPrice}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}

        {/* 盘活复苏：按天展示 */}
        {order.recommendType === RecommendType.REVITALIZATION_AD && (
          <div style={{ border: '1px solid #f0f0f0', borderRadius: 8, overflow: 'hidden', marginBottom: 12 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: '#FAFAFA' }}>
                  <th style={{ padding: '8px 16px', textAlign: 'left', fontWeight: 500, color: '#8C8C8C', fontSize: 12 }}>日期</th>
                  <th style={{ padding: '8px 16px', textAlign: 'right', fontWeight: 500, color: '#8C8C8C', fontSize: 12 }}>原價（MOP）</th>
                  <th style={{ padding: '8px 16px', textAlign: 'right', fontWeight: 500, color: '#8C8C8C', fontSize: 12 }}>折扣</th>
                  <th style={{ padding: '8px 16px', textAlign: 'right', fontWeight: 500, color: '#8C8C8C', fontSize: 12 }}>折後價（MOP）</th>
                </tr>
              </thead>
              <tbody>
                {order.slotPrices.map((sp, i) => (
                  <tr key={i} style={{ borderTop: i > 0 ? '1px solid #f0f0f0' : 'none' }}>
                    <td style={{ padding: '8px 16px' }}>{sp.date}</td>
                    <td style={{ padding: '8px 16px', textAlign: 'right', color: '#595959' }}>{sp.originalPrice}</td>
                    <td style={{ padding: '8px 16px', textAlign: 'right' }}>
                      {sp.discount < 10 ? <Tag color="green">{sp.discount}折</Tag> : <span style={{ color: '#8C8C8C' }}>無折扣</span>}
                    </td>
                    <td style={{ padding: '8px 16px', textAlign: 'right', fontWeight: 500, color: '#E8720C' }}>{sp.actualPrice}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* 汇总 */}
        <div style={{
          padding: '16px', background: '#FAFAFA', borderRadius: 8,
        }}>
          <div style={{
            display: 'flex', justifyContent: 'flex-end', gap: 24, flexWrap: 'wrap', alignItems: 'center',
          }}>
            <div style={{ textAlign: 'center', minWidth: 72 }}>
              <div style={{ fontSize: 12, color: '#8C8C8C', marginBottom: 4 }}>時段合計</div>
              <div style={{ fontSize: 14, fontWeight: 600 }}>{order.slotPrices.length} 個</div>
            </div>
            <div style={{ textAlign: 'center', minWidth: 80 }}>
              <div style={{ fontSize: 12, color: '#8C8C8C', marginBottom: 4 }}>原始總價（MOP）</div>
              <div style={{ fontSize: 14, fontWeight: 600 }}>{totalOriginal}</div>
            </div>
            <div style={{ textAlign: 'center', minWidth: 80 }}>
              <div style={{ fontSize: 12, color: '#8C8C8C', marginBottom: 4 }}>折扣優惠（MOP）</div>
              <div style={{ fontSize: 14, fontWeight: 600, color: '#52C41A' }}>-{totalDiscount}</div>
            </div>
            {order.gradientDiscount && (
              <div style={{ textAlign: 'center', minWidth: 100 }}>
                <div style={{ fontSize: 12, color: '#52C41A', marginBottom: 4 }}>梯度折扣</div>
                <div style={{ fontSize: 14, fontWeight: 600, color: '#52C41A' }}>滿{order.gradientDiscount.count}個享{order.gradientDiscount.discount}折</div>
              </div>
            )}
            <div style={{
              textAlign: 'center', minWidth: 120, padding: '8px 16px',
              background: '#FFF7E6', border: '1px solid #FFD591', borderRadius: 8,
            }}>
              <div style={{ fontSize: 12, color: '#E8720C', marginBottom: 4, fontWeight: 500 }}>最終實付總價（MOP）</div>
              <div style={{ fontSize: 22, fontWeight: 700, color: '#E8720C' }}>{totalActual}</div>
            </div>
          </div>
          {/* 计算公式 */}
          <div style={{
            marginTop: 12, padding: '8px 12px', background: '#fff', borderRadius: 6,
            border: '1px dashed #D9D9D9', fontSize: 12, color: '#8C8C8C', lineHeight: 1.8,
          }}>
            <strong style={{ color: '#595959' }}>計算公式：</strong>
            {order.gradientDiscount
              ? <>原始總價 <span style={{ color: '#262626', fontWeight: 500 }}>{totalOriginal}</span> - 時段折扣 <span style={{ color: '#52C41A', fontWeight: 500 }}>{totalDiscount}</span> × 梯度折扣 <span style={{ color: '#52C41A', fontWeight: 500 }}>{order.gradientDiscount.discount}折</span> = 最終實付 <span style={{ color: '#E8720C', fontWeight: 700 }}>{totalActual}</span>（MOP）</>
              : <>原始總價 <span style={{ color: '#262626', fontWeight: 500 }}>{totalOriginal}</span> - 時段折扣 <span style={{ color: '#52C41A', fontWeight: 500 }}>{totalDiscount}</span> = 最終實付 <span style={{ color: '#E8720C', fontWeight: 700 }}>{totalActual}</span>（MOP）</>
            }
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
