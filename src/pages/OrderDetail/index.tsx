import { useEffect, useState, useMemo, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { Button, Tag, Descriptions, Card, Empty, Modal, message, Space, Tabs, Spin, Result } from 'antd'
import {
  CheckOutlined, ClockCircleOutlined, CloseOutlined,
  ShopOutlined, FileTextOutlined, DollarOutlined,
  ExclamationCircleOutlined, RollbackOutlined, DownOutlined, RightOutlined,
  BarChartOutlined, EyeOutlined, AimOutlined, FireOutlined, HourglassOutlined,
} from '@ant-design/icons'
import DetailPageHeader from '../../components/DetailPageHeader'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  fetchAdOrderDetail,
  fetchAdPricingActive,
  fetchAdRevivePricingActive,
  fetchAdSignboardPricingActive,
  refundAdOrder,
  cancelAdOrder,
} from '../../api/adPromotion'
import { AlgorithmType, REGION_LABEL_KEY } from '../Recommend/constants'
import { BIZ_CHANNEL } from '../../constants/bizChannel'
import { loadTrafficPricing } from '../AdSales/types'
import { useCountUp } from '../../hooks/useCountUp'
import AnimatedNumber from '../../components/AnimatedNumber'
import { OrderStatus, AppType, RecommendChannel, RecommendType, MEAL_SLOT_LABEL, RECOMMEND_TYPE_ICON, ORDER_CHANNEL_TO_TRAFFIC_BIZ, getStageIndex, getStageTime, parseCancelFeeTiers, parseDiscountTiers, parseDayDiscountTiers } from './orderUtils'
import type { OrderItem, SlotPriceItem, PromoRecord } from './orderUtils'
import { toDetailOrder, REFUNDED_BEFORE_PROMO_IDS, TERMINAL_STATUSES } from './mockOrderData'

/* ---- 动画百分比组件 ---- */
function AnimatedPercent({ values, suffix = '%' }: { values: number[]; suffix?: string }) {
  const avg = values.length > 0 ? values.reduce((s, v) => s + v, 0) / values.length : 0
  const [display, setDisplay] = useState(0)
  const rafRef = useRef<number>(0)
  useEffect(() => {
    const start = performance.now()
    const duration = 1200
    const animate = (now: number) => {
      const elapsed = now - start
      const progress = Math.min(elapsed / duration, 1)
      const eased = progress === 1 ? 1 : 1 - Math.pow(2, -10 * progress)
      setDisplay(+(avg * eased).toFixed(1))
      if (progress < 1) {
        rafRef.current = requestAnimationFrame(animate)
      }
    }
    rafRef.current = requestAnimationFrame(animate)
    return () => cancelAnimationFrame(rafRef.current)
  }, [avg])
  return <>{display}{suffix}</>
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
  const { t } = useTranslation()

  // 枚舉標籤（依賴 t，定義在組件內以便響應語言切換）
  const statusLabel = (v: OrderStatus) => {
    const map: Partial<Record<OrderStatus, { label: string; color: string }>> = {
      [OrderStatus.PENDING_PROMOTION]: { label: t('promotionOrderManage.statusPending'), color: 'blue' },
      [OrderStatus.PROMOTING]: { label: t('promotionOrderManage.statusPromoting'), color: 'green' },
      [OrderStatus.PROMOTED]: { label: t('promotionOrderManage.statusCompleted'), color: 'purple' },
      [OrderStatus.CANCELLED]: { label: t('promotionOrderManage.statusCancelled'), color: 'red' },
      [OrderStatus.ABORTED]: { label: t('promotionOrderManage.statusAborted'), color: 'orange' },
      [OrderStatus.REFUNDED]: { label: t('promotionOrderManage.statusRefunded'), color: 'red' },
    }
    return map[v] || { label: String(v), color: 'default' }
  }
  const appLabel = (v: AppType) => (v === AppType.SHANFENG ? t('common.flashBee') : 'mFood')
  const channelLabel = (v: RecommendChannel) => ({
    [RecommendChannel.DELIVERY]: t('promotionOrderManage.chDelivery'),
    [RecommendChannel.GROUP_BUY]: t('promotionOrderManage.chGroupBuy'),
    [RecommendChannel.SUPERMARKET]: t('promotionOrderManage.chSupermarket'),
  }[v])
  const recommendTypeLabel = (v: RecommendType) => {
    const map: Partial<Record<RecommendType, string>> = {
      [RecommendType.INVINCIBLE_STAR]: t('promotionReport.recTypeInvincibleStar'),
      [RecommendType.HOT_REVIVE_AD]: t('promotionReport.recTypeHotRevive'),
      [RecommendType.NEW_STORE_AD]: t('promotionReport.recTypeNewStore'),
      [RecommendType.TRAFFIC_AD]: t('promotionReport.recTypeTraffic'),
      [RecommendType.POPULAR_MERCHANT_KA]: t('promotionOrderManage.recTypePopular'),
      [RecommendType.GOLDEN_SIGNBOARD]: t('recommend.algoGoldenSignboard'),
    }
    return map[v] || String(v)
  }
  // 餐段時段名（數據層 key → 展示名，響應語言切換）
  const slotLabel = (v: string) => {
    // 1. 全天
    if (v === '全天' || v === 'All Day') return t('orderDetail.allDay')
    // 2. API 原始 key（breakfast/lunch/afternoon/dinner/supper）→ 直接翻譯
    const keyMap: Record<string, string> = {
      breakfast: t('orderDetail.slotBreakfast'),
      lunch: t('orderDetail.slotLunch'),
      afternoon: t('orderDetail.slotAfternoon'),
      dinner: t('orderDetail.slotDinner'),
      supper: t('orderDetail.slotSupper'),
    }
    if (keyMap[v]) return keyMap[v]
    // 3. 中文標籤（mock 數據 / 已轉換數據）→ 反查 key 再翻譯
    const key = Object.entries(MEAL_SLOT_LABEL).find(([, label]) => label === v)?.[0]
    if (key && keyMap[key]) return keyMap[key]
    // 4. 無法識別 → 原樣返回
    return v
  }
  const [searchParams] = useSearchParams()
  const orderId = searchParams.get('id')
  const orderType = searchParams.get('type') || ''
  // 来源标识：透传回訂單列表，保證返回鏈路（廣告銷售 vs 店鋪推廣）不丟失
  const fromSource = searchParams.get('from') || ''
  const backToListPath = `/promotion-order-manage?type=${encodeURIComponent(orderType)}${fromSource ? `&from=${encodeURIComponent(fromSource)}` : ''}`
  const [order, setOrder] = useState<OrderItem | null>(null)
  const [refundModalVisible, setRefundModalVisible] = useState(false)
  const [slotsCollapsed, setSlotsCollapsed] = useState(false)
  const [promoAnimKey, setPromoAnimKey] = useState(0)
  /** 真實訂單後端加載中（初始即為 true，避免首幀閃現「訂單不存在」） */
  const [apiLoading, setApiLoading] = useState(() => {
    const oid = new URLSearchParams(window.location.hash.split('?')[1] || '').get('id')
    return !!oid
  })
  /** 加載失敗原因：not-found=訂單不存在 transient=後端暫不可用/網絡異常 */
  const [loadError, setLoadError] = useState<'not-found' | 'transient' | null>(null)
  /** 重試計數: 臨時失敗時點「重新加載」觸發重新請求 */
  const [retryKey, setRetryKey] = useState(0)

  // 从后端加载真实订单详情（id 即订单号），含计价配置中的退款规则与梯度折扣
  const loadApiOrder = async (orderNo: string): Promise<OrderItem> => {
    const detail = await fetchAdOrderDetail(orderNo)
    let pricing: {
      cancelFeeRules: { maxDays: number; feePercent: number }[]
      refundEnabled: boolean
      discountTiers: { minSlots: number; discount: number }[]
    } | undefined
    try {
      // 按算法類型取對應計價配置：盤活復蘇(3)/金字招牌(13)/無敵星星分開處理，避免聯合類型收窄丟失各自字段
      if (detail.algoType === 3) {
        const p = await fetchAdRevivePricingActive(detail.algoId).catch(() => null)
        if (p) {
          pricing = {
            cancelFeeRules: parseCancelFeeTiers(p.cancelFeeTiers ?? undefined),
            refundEnabled: p.refundEnabled === 1,
            discountTiers: parseDayDiscountTiers(p.discountTiers),
          }
        }
      } else if (detail.algoType === 13) {
        // 金字招牌無時段梯度折扣，僅取退款開關與取消扣費梯度（globalDiscountTiers 為全局折扣，不映射為梯度展示）
        const p = await fetchAdSignboardPricingActive(detail.algoId).catch(() => null)
        if (p) {
          pricing = {
            cancelFeeRules: parseCancelFeeTiers(p.cancelFeeTiers ?? undefined),
            refundEnabled: p.refundEnabled === 1,
            discountTiers: [],
          }
        }
      } else {
        const p = await fetchAdPricingActive(detail.algoId).catch(() => null)
        if (p) {
          pricing = {
            cancelFeeRules: parseCancelFeeTiers(p.cancelFeeTiers),
            refundEnabled: p.refundEnabled === 1,
            discountTiers: parseDiscountTiers(p.discountTiers),
          }
        }
      }
    } catch {
      // 计价配置缺失时使用默认规则
    }
    return toDetailOrder(detail, pricing)
  }

  useEffect(() => {
    if (!orderId) return
    // 真實訂單：id 即訂單號，從後端加載（區分加載中 / 訂單不存在 / 臨時失敗）
    let cancelled = false
    setApiLoading(true)
    setLoadError(null)
    loadApiOrder(orderId)
      .then(o => { if (!cancelled) setOrder(o) })
      .catch((err: unknown) => {
        if (cancelled) return
        setOrder(null)
        const msg = err instanceof Error ? err.message : ''
        setLoadError(msg.includes('訂單不存在') ? 'not-found' : 'transient')
      })
      .finally(() => { if (!cancelled) setApiLoading(false) })
    return () => { cancelled = true }
  }, [orderId, retryKey])

  // 计算退款信息
  const refundInfo = useMemo(() => {
    if (!order) return null
    const rules = [...order.cancelFeeRules].sort((a, b) => a.maxDays - b.maxDays)
    const today = new Date()
    const promoStart = order.promoStartDate ? new Date(order.promoStartDate) : null

    // 已退款 → 以退款金額為源，反推扣費比例並匹配到對應規則
    if (order.status === OrderStatus.REFUNDED) {
      const refundAmount = order.refundAmount ?? 0
      const feePercent = order.actualPrice > 0
        ? Math.round((1 - refundAmount / order.actualPrice) * 100)
        : 0
      // 根據扣費比例匹配到對應的規則（feePercent 為0表示超出規則全額退款）
      const matchedRule = rules.find(r => r.feePercent === feePercent) ?? null
      const daysBefore = matchedRule?.maxDays ?? 0
      return { daysBefore, feePercent, refundAmount, matchedRule, isPromoting: false }
    }

    // 推广中或已完成 → 退款金额为0
    if (order.status === OrderStatus.PROMOTING || order.status === OrderStatus.PROMOTED) {
      return { daysBefore: 0, feePercent: 100, refundAmount: 0, matchedRule: null, isPromoting: true }
    }

    // 待推广 → 基于规则计算
    if (promoStart) {
      const diffMs = promoStart.getTime() - today.getTime()
      const daysBefore = Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)))
      // 找到匹配的扣费规则
      let feePercent = 100
      let matchedRule: { maxDays: number; feePercent: number } | null = null
      for (const rule of rules) {
        if (daysBefore <= rule.maxDays) {
          feePercent = rule.feePercent
          matchedRule = rule
          break
        }
      }
      // 如果天数大于所有规则的maxDays，不扣费
      if (daysBefore > rules[rules.length - 1]?.maxDays) {
        feePercent = 0
      }
      const refundAmount = Math.round(order.actualPrice * (1 - feePercent / 100))
      const refundGiftDays = Math.round((order.giftDays ?? 0) * (1 - feePercent / 100))
      return { daysBefore, feePercent, refundAmount, refundGiftDays, matchedRule, isPromoting: false }
    }
    return null
  }, [order])

  if (!order) {
    return (
      <div className="content-area" style={{ minHeight: 400, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {apiLoading ? (
          <Spin size="large" tip={t('orderDetail.loading')}>
            <div style={{ width: 200, height: 80 }} />
          </Spin>
        ) : loadError === 'transient' ? (
          <Result
            status="warning"
            title={t('orderDetail.loadFailed')}
            subTitle={t('orderDetail.loadFailedSub')}
            extra={<Button type="primary" onClick={() => setRetryKey(k => k + 1)}>{t('orderDetail.reload')}</Button>}
          />
        ) : (
          <Empty description={t('orderDetail.notFound')} />
        )}
      </div>
    )
  }

  const statusInfo = statusLabel(order.status)
  const isRefunded = order.status === OrderStatus.REFUNDED
  const isNewStore = order.recommendType === RecommendType.NEW_STORE_AD
  const isPopular = order.recommendType === RecommendType.POPULAR_MERCHANT_KA
  const isRevive = order.recommendType === RecommendType.HOT_REVIVE_AD
  const isGoldenSignboard = order.recommendType === RecommendType.GOLDEN_SIGNBOARD
  const isTrafficAd = order.recommendType === RecommendType.TRAFFIC_AD

  /** 金字招牌標籤類型 → 中文翻譯映射 */
  const SIGNBOARD_LABEL_CN: Record<string, { label: string; icon: string; color: string }> = {
    hot: { label: '熱門', icon: '\uD83D\uDD25', color: '#FF4D4F' },
    popular: { label: '人氣', icon: '\uD83D\uDC51', color: '#FAAD14' },
    sales: { label: '銷量', icon: '\uD83D\uDCC8', color: '#1890FF' },
    rating: { label: '好評', icon: '\u2B50', color: '#52C41A' },
    repurchase: { label: '復購', icon: '\uD83D\uDD04', color: '#722ED1' },
    favorites: { label: '收藏', icon: '\u2764\uFE0F', color: '#EB2F96' },
    customers: { label: '顧客數', icon: '\uD83D\uDC65', color: '#13C2C2' },
  }

  /** 金字招牌場景 → 中文後綴 */
  const SIGNBOARD_SCENARIO_CN: Record<string, string> = {
    all_macau: '全澳對比',
    district: '商圈對比',
  }

  /** 格式化標籤+場景顯示（如：熱門-全澳對比） */
  const fmtSignboardLabel = (label: string, scenario?: string | null) => {
    const cfg = SIGNBOARD_LABEL_CN[label]
    const name = cfg?.label || label
    const suffix = scenario ? SIGNBOARD_SCENARIO_CN[scenario] : null
    return suffix ? `${name}-${suffix}` : name
  }

  /** 根據場景獲取推廣商圈顯示文案 */
  const getSignboardRegionDisplay = (scenario?: string | null) => {
    if (scenario === 'all_macau' || !scenario) {
      // 全澳對比 或 統計類（無場景）→ 全澳區域
      return '全澳區域'
    }
    if (scenario === 'district') {
      // 商圈對比 → 門店所在區域
      const regionVal = Array.isArray(order.region) ? order.region[0] : order.region
      return regionVal ? t(REGION_LABEL_KEY[regionVal]) : '—'
    }
    return '—'
  }

  // 新店廣告已取消：保留「待推廣 / 推廣中」節點展示，但因未推廣即取消，兩節點以另色標記並打叉
  const isCancelledBeforePromo = isNewStore && order.status === OrderStatus.CANCELLED
  const progressStagesBase = [
    { key: 'ordered', label: t('orderDetail.stageOrdered') },
    { key: 'pending', label: t('orderDetail.stagePending') },
    { key: 'promoting', label: t('orderDetail.stagePromoting') },
    { key: 'done', label: t('orderDetail.stageDone') },
  ]
  const progressStages = isCancelledBeforePromo
    ? [
        { key: 'ordered', label: t('orderDetail.stageOrdered') },
        { key: 'pending', label: t('orderDetail.stagePending') },
        { key: 'promoting', label: t('orderDetail.stagePromoting') },
        { key: 'cancelled', label: t('orderDetail.stageCancelled') },
      ]
    : progressStagesBase
  const lastStageIdx = progressStages.length - 1
  const currentStage = isCancelledBeforePromo ? lastStageIdx : getStageIndex(order.status)
  // 無敵星星 / 盤活復蘇：部分已退款訂單為「未推廣即退款」，待推廣 + 推廣中節點需打叉
  const isRefundedBeforePromo = isRefunded && REFUNDED_BEFORE_PROMO_IDS.has(order.id)
  // 未推廣即結束（已取消 / 未推廣即退款）：待推廣(1)、推廣中(2) 兩節點以叉號 + 另色標記
  const skipStageIdxs: number[] = (isCancelledBeforePromo || isRefundedBeforePromo) ? [1, 2] : []

  // 最後一個節點（終態）的主題色：已完成維持橙色，已退款/已取消/已中止分別區分
  const terminalTheme = (() => {
    switch (order.status) {
      case OrderStatus.REFUNDED:  // 已退款（無敵星星、盤活復蘇）→ 紅色
        return { grad: 'linear-gradient(135deg, #FF4D4F, #FF7875)', main: '#FF4D4F', shadow: 'rgba(255,77,79,', ripple: 'rgba(255,77,79,' }
      case OrderStatus.CANCELLED: // 已取消（新店廣告）→ 灰色
        return { grad: 'linear-gradient(135deg, #8C8C8C, #BFBFBF)', main: '#8C8C8C', shadow: 'rgba(140,140,140,', ripple: 'rgba(140,140,140,' }
      case OrderStatus.ABORTED:   // 已中止（新店廣告）→ 紅色
        return { grad: 'linear-gradient(135deg, #FF4D4F, #FF7875)', main: '#FF4D4F', shadow: 'rgba(255,77,79,', ripple: 'rgba(255,77,79,' }
      default:                    // 已完成（維持橙色）
        return { grad: 'linear-gradient(135deg, #E8720C, #F59432)', main: '#E8720C', shadow: 'rgba(232,114,12,', ripple: 'rgba(232,114,12,' }
    }
  })()

  // 新店廣告：計算每推廣日的狀態
  const getDayStatus = (day: string): OrderStatus => {
    const today = new Date().toISOString().split('T')[0]
    if (order.status === OrderStatus.PROMOTED) return OrderStatus.PROMOTED
    if (order.status === OrderStatus.CANCELLED) {
      return day < today ? OrderStatus.PROMOTED : OrderStatus.CANCELLED
    }
    if (order.status === OrderStatus.ABORTED) {
      return day < today ? OrderStatus.PROMOTED : OrderStatus.ABORTED
    }
    if (order.status === OrderStatus.PROMOTING) {
      if (day < today) return OrderStatus.PROMOTED
      if (day === today) return OrderStatus.PROMOTING
      return OrderStatus.PENDING_PROMOTION
    }
    // PENDING_PROMOTION
    return day < today ? OrderStatus.PROMOTED : OrderStatus.PENDING_PROMOTION
  }

  // 按日期分组时段（普通计算，不用 useMemo，因为已在条件返回之后）
  const slotsByDateMap = new Map<string, SlotPriceItem[]>()
  order.slotPrices.forEach(sp => {
    if (!slotsByDateMap.has(sp.date)) slotsByDateMap.set(sp.date, [])
    slotsByDateMap.get(sp.date)!.push(sp)
  })
  const slotsByDate = Array.from(slotsByDateMap.entries())

  const totalOriginal = order.slotPrices.reduce((s, sp) => s + sp.originalPrice, 0)
  const slotSubtotal = order.slotPrices.reduce((s, sp) => s + sp.actualPrice, 0)
  const gradientMultiplier = order.gradientDiscount ? order.gradientDiscount.discount / 10 : 1
  // finalPrice = 梯度折後總額（贈送抵扣前）；明細已還原為抵扣前口徑，梯度步得出折後總額
  const finalPrice = Math.round(slotSubtotal * gradientMultiplier)
  // 贈送天數抵扣快照：區分純推廣金 / 純贈送抵扣 / 混合支付三種展示
  const giftDays = order.giftDays ?? 0
  const giftAmount = order.giftAmount ?? 0
  // 實付推廣金（贈送抵扣後）
  const actualPaid = Math.max(0, finalPrice - giftAmount)
  const totalSaved = totalOriginal - actualPaid
  // 支付方式检测：直接使用后端存储的 actualAmount 判断，避免 slot 价格反推精度误差
  const payMode: 'promo' | 'gift' | 'mixed' = giftDays > 0 ? (order.actualPrice > 0 ? 'mixed' : 'gift') : 'promo'

  // 已退款：以「實付推廣金額」(actualPaid) 為基準計算退款，保證與費用明細一致，一目了然
  const refundAmountByPaid = Math.round(actualPaid * (1 - (refundInfo?.feePercent ?? 0) / 100))

  // 投流廣告退款：商家購買的是曝光次數，按「投流廣告定價配置」的計算公式退款 ——
  // 已消耗曝光按訂單實際單價扣除不予退還，剩餘未消耗曝光價值退還商家，手續費比例取自頻道定價配置
  // 退款金額 = 剩餘未消耗曝光 × 訂單實際單價 − 退款手續費；實際單價 = 實付金額 ÷ 購買次數；手續費 = 可退金額 × 手續費比例
  const trafficRefund = isTrafficAd ? (() => {
    const purchased = order.trafficImpressions ?? 0
    const consumed = (order.promoData ?? []).reduce((s, d) => s + d.impressions, 0)
    const remaining = Math.max(0, purchased - consumed)
    const unitPrice = purchased > 0 ? order.actualPrice / purchased : 0
    const channelPricing = loadTrafficPricing().find(p => p.bizChannel === ORDER_CHANNEL_TO_TRAFFIC_BIZ[order.channel])
    const feePercent = channelPricing?.refundFeePercent ?? 0
    const grossRefund = Math.round(remaining * unitPrice * 100) / 100
    const feeAmount = Math.round(grossRefund * feePercent) / 100
    const refundAmount = Math.max(0, Math.round((grossRefund - feeAmount) * 100) / 100)
    return {
      purchased, consumed, remaining, unitPrice, feePercent, grossRefund, feeAmount, refundAmount,
      allowRefund: channelPricing?.allowRefund !== false,
    }
  })() : null

  const handleRefund = () => {
    setRefundModalVisible(true)
  }

  const confirmRefund = async () => {
    // 真實訂單：調用後端退款/取消接口
    if (order?.source === 'api') {
      try {
        // 新店廣告調用取消接口（狀態→已取消），其它類型調用退款接口（狀態→已退款）
        if (isNewStore) {
          await cancelAdOrder(order.orderNo)
        } else {
          await refundAdOrder(order.orderNo)
        }
        const fresh = await loadApiOrder(order.orderNo)
        setOrder(fresh)
        setRefundModalVisible(false)
        message.success(isNewStore ? t('orderDetail.cancelSuccess') : t('orderDetail.refundSuccess'))
      } catch (err) {
        message.error((err as Error).message || (isNewStore ? t('orderDetail.cancelFail') : t('orderDetail.refundFail')))
      }
      return
    }
    // 投流廣告：退款按剩餘曝光折算，退款後狀態為「已退款」並記錄退款金額
    const newStatus = isNewStore ? OrderStatus.CANCELLED : isTrafficAd ? OrderStatus.REFUNDED : OrderStatus.PROMOTED
    setOrder(prev => prev ? { ...prev, status: newStatus, ...(isTrafficAd ? { refundAmount: trafficRefund?.refundAmount } : {}) } : null)
    setRefundModalVisible(false)
    message.success(isNewStore ? t('orderDetail.cancelSuccess') : t('orderDetail.refundSuccessShort'))
  }

  return (
    <div className="content-area">
      {/* 顶部导航栏（全局詳情頁統一規範：紫色頂條 + 橙色返回；訂單無編輯頁，不展示編輯按鈕） */}
      <DetailPageHeader
        title={t('orderDetail.detailTitle')}
        tags={
          <Tag color={statusInfo.color} style={{
            fontSize: 12, padding: '2px 10px', borderRadius: 4,
            fontWeight: 500, animation: 'statusPulse 2.5s ease-in-out infinite',
            margin: 0,
          }}>{statusInfo.label}</Tag>
        }
        onBack={() => navigate(backToListPath)}
      />

      {/* 订单状态流程 */}
      <div style={{
        position: 'relative', background: '#fff', marginBottom: 16,
        borderRadius: 12, boxShadow: '0 2px 12px rgba(0,0,0,0.06)',
        overflow: 'hidden',
      }}>
        <div style={{ padding: '24px 32px 20px', animation: 'headerFadeSlideIn 0.5s ease' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'center' }}>
            {progressStages.map((stage, idx) => {
              const isPast = idx < currentStage
              const isCurrent = idx === currentStage
              const isFuture = idx > currentStage
              const isSkip = skipStageIdxs.includes(idx)
              const stageTime = isSkip ? '' : getStageTime(order.status, idx, order)
              // 終態節點（已退款/已取消/已中止）：展示發起方信息（業務人員：姓名+工號；商家：門店名稱+ID）
              const isTerminalNode = idx === lastStageIdx && TERMINAL_STATUSES.includes(order.status)
              const isMerchantActor = order.terminalActor === 'merchant'
              const showActor = isTerminalNode && (isMerchantActor ? !!order.storeName : !!order.operatorName)
              const terminalActionWord = order.status === OrderStatus.REFUNDED ? t('orderDetail.actionRefund')
                : order.status === OrderStatus.CANCELLED ? t('orderDetail.actionCancel')
                : order.status === OrderStatus.ABORTED ? t('orderDetail.actionAbort') : ''
              const terminalActorTypeLabel = (isMerchantActor ? t('orderDetail.actorMerchant') : t('orderDetail.actorStaff')) + terminalActionWord

              /** 阶段图标 */
              const stageIcon = () => {
                if (isSkip) return <CloseOutlined style={{ fontSize: 15, color: '#fff' }} />
                if (isRefunded && idx === lastStageIdx) return <RollbackOutlined style={{ fontSize: 15, color: '#fff' }} />
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
              const nodeBg = isSkip
                ? 'linear-gradient(135deg, #FF7875, #FFA39E)'
                : isPast
                  ? 'linear-gradient(135deg, #52C41A, #73D13D)'
                  : isCurrent
                    ? terminalTheme.grad
                    : '#fff'

              return (
                <div key={stage.key} style={{
                  display: 'flex', alignItems: 'flex-start',
                  flex: idx < lastStageIdx ? 1 : 'none',
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
                        ? `0 0 0 4px ${terminalTheme.shadow}0.12), 0 2px 8px ${terminalTheme.shadow}0.25)`
                        : isSkip
                          ? '0 2px 6px rgba(255,77,79,0.25)'
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
                      fontWeight: isCurrent ? 700 : (isSkip || isPast) ? 600 : 400,
                      color: isSkip ? '#FF4D4F' : isPast ? '#52C41A' : isCurrent ? terminalTheme.main : '#8C8C8C',
                      whiteSpace: 'nowrap', transition: 'color 0.3s',
                      animation: isCurrent ? 'nodeBreath 2s ease-in-out infinite' : 'none',
                      textShadow: isCurrent ? `0 0 8px ${terminalTheme.ripple}0.3)` : 'none',
                    }}>
                      {idx === lastStageIdx
                        ? (isRefunded ? t('promotionOrderManage.statusRefunded')
                          : order.status === OrderStatus.CANCELLED ? t('promotionOrderManage.statusCancelled')
                          : order.status === OrderStatus.ABORTED ? t('promotionOrderManage.statusAborted')
                          : stage.label)
                        : stage.label}
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
                    {/* 發起方信息（終態節點：已退款/已取消/已中止） */}
                    {showActor && (
                      <div style={{
                        marginTop: 6, textAlign: 'center', whiteSpace: 'nowrap',
                        padding: '3px 10px', background: '#FFF1F0',
                        border: '1px solid #FFCCC7', borderRadius: 4,
                      }}>
                        <div style={{ fontSize: 11, fontWeight: 600, color: '#cf1322', marginBottom: 2 }}>
                          {terminalActorTypeLabel}
                        </div>
                        {isMerchantActor ? (
                          <>
                            <div style={{ fontSize: 11, color: '#595959' }}>
                              {t('orderDetail.storeLabel', { name: order.storeName })}
                            </div>
                            <div style={{ fontSize: 11, color: '#8C8C8C' }}>
                              {t('orderDetail.storeIdLabel', { id: order.storeId })}
                            </div>
                          </>
                        ) : (
                          <>
                            <div style={{ fontSize: 11, color: '#595959' }}>
                              {t('orderDetail.operatorLabel', { name: order.operatorName })}
                            </div>
                            <div style={{ fontSize: 11, color: '#8C8C8C' }}>
                              {t('orderDetail.empIdLabel', { id: order.operatorId })}
                            </div>
                          </>
                        )}
                      </div>
                    )}
                    {/* 当前阶段波纹动效 */}
                    {isCurrent && (
                      <>
                        {/* 波纹 1 - 从节点边缘向外扩散 */}
                        <div style={{
                          position: 'absolute', top: -4, left: '50%',
                          width: 46, height: 46, borderRadius: '50%',
                          border: `2px solid ${terminalTheme.ripple}0.35)`,
                          marginLeft: -23,
                          animation: 'rippleExpand 2s ease-out infinite',
                          pointerEvents: 'none',
                        }} />
                        {/* 波纹 2（延迟） */}
                        <div style={{
                          position: 'absolute', top: -4, left: '50%',
                          width: 46, height: 46, borderRadius: '50%',
                          border: `2px solid ${terminalTheme.ripple}0.25)`,
                          marginLeft: -23,
                          animation: 'rippleExpand 2s ease-out infinite 0.8s',
                          pointerEvents: 'none',
                        }} />
                      </>
                    )}
                  </div>
                  {/* 连接线 */}
                  {idx < lastStageIdx && (
                    <div style={{
                      flex: 1, height: 3, marginTop: 18, minWidth: 32,
                      background: skipStageIdxs.length > 0
                        ? '#F0F0F0'
                        : idx < currentStage
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

      {/* Tab 切换区域 */}
      <div style={{
        background: '#fff', borderRadius: 12, boxShadow: '0 2px 12px rgba(0,0,0,0.06)',
        overflow: 'hidden', marginBottom: 16,
      }}>
        <Tabs
          defaultActiveKey="orderInfo"
          onChange={(key) => { if (key === 'promoData') setPromoAnimKey(k => k + 1) }}
          style={{ padding: '0 24px' }}
          items={[
            {
              key: 'orderInfo',
              label: (
                <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 14, fontWeight: 600 }}>
                  <FileTextOutlined style={{ color: '#1890ff' }} /> {t('orderDetail.tabOrderInfo')}
                </span>
              ),
              children: (
                <div style={{ padding: '8px 0 0' }}>
                  {/* 购买商家信息 */}
                  <Card title={<CardTitle icon={<ShopOutlined style={{ fontSize: 12, color: '#1890ff' }} />} text={t('orderDetail.buyMerchantInfo')} />}
                    style={{ marginBottom: 16, borderRadius: 8, border: 'none' }} styles={{ body: { padding: '16px 24px' } }}>
        <Descriptions column={3} labelStyle={{ color: '#8c8c8c', fontSize: 13 }} contentStyle={{ fontSize: 13 }}>
          <Descriptions.Item label={t('orderDetail.colGroup')}>
            <span>{order.groupName}</span>
            <span style={{ color: '#8C8C8C', fontSize: 12 }}>{t('orderDetail.idSuffix', { id: order.groupId })}</span>
          </Descriptions.Item>
          <Descriptions.Item label={t('orderDetail.colStore')}>
            <span>{order.storeName}</span>
            <span style={{ color: '#8C8C8C', fontSize: 12 }}>{t('orderDetail.idSuffix', { id: order.storeId })}</span>
          </Descriptions.Item>
          <Descriptions.Item label={t('orderDetail.colStoreRegion')}>
            {order.storeAddress || <span style={{ color: '#BFBFBF' }}>—</span>}
          </Descriptions.Item>
        </Descriptions>
                  </Card>

                  {/* 订单信息 */}
      <Card title={
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <CardTitle icon={<FileTextOutlined style={{ fontSize: 12, color: '#1890ff' }} />} text={t('orderDetail.orderInfo')} />
          <div style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '4px 12px', background: '#FFF7E6',
            borderRadius: 4, border: '1px solid #FFD591',
            marginLeft: 4,
          }}>
            <span style={{ fontSize: 11, color: '#E8720C', fontWeight: 600 }}>{t('orderDetail.orderNo')}</span>
            <span style={{ fontSize: 13, color: '#262626', fontWeight: 700, letterSpacing: 0.5 }}>
              {order.orderNo}
            </span>
          </div>
        </div>
      }
        style={{ marginBottom: 16, borderRadius: 8, border: 'none' }} styles={{ body: { padding: '16px 24px' } }}>
        <Descriptions column={3} labelStyle={{ color: '#8c8c8c', fontSize: 13 }} contentStyle={{ fontSize: 13 }}>
          <Descriptions.Item label={t('orderDetail.colAdType')}>
            <Tag color="gold">{RECOMMEND_TYPE_ICON[order.recommendType]} {recommendTypeLabel(order.recommendType)}</Tag>
          </Descriptions.Item>
          <Descriptions.Item label={t('common.colBrand')}>{appLabel(order.app)}</Descriptions.Item>
          <Descriptions.Item label={t('common.colChannel')}>{channelLabel(order.channel)}</Descriptions.Item>
          <Descriptions.Item label={isPopular ? '配置ID' : t('orderDetail.colAlgorithmId')}>
            <span style={{ color: '#8C8C8C', fontSize: 12 }}>{order.algorithmId}</span>
          </Descriptions.Item>
          <Descriptions.Item label={isPopular ? '人氣名稱' : t('orderDetail.colAlgorithmName')}>{order.promotionName}</Descriptions.Item>
          {isGoldenSignboard ? (
            <Descriptions.Item label="購買標籤">
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {order.labelDates?.map((ld, idx) => {
                  const labelCfg = SIGNBOARD_LABEL_CN[ld.label]
                  return (
                    <Tag key={idx} color={labelCfg?.color || 'geekblue'}>
                      {labelCfg ? `${labelCfg.icon} ${fmtSignboardLabel(ld.label, ld.scenario)}` : fmtSignboardLabel(ld.label, ld.scenario)}
                    </Tag>
                  )
                }) || (order.skinName && (
                  <Tag color={SIGNBOARD_LABEL_CN[order.skinName]?.color || 'geekblue'}>
                    {SIGNBOARD_LABEL_CN[order.skinName] ? `${SIGNBOARD_LABEL_CN[order.skinName].icon} ${SIGNBOARD_LABEL_CN[order.skinName].label}` : order.skinName}
                  </Tag>
                ))}
              </div>
            </Descriptions.Item>
          ) : isTrafficAd ? (
            <Descriptions.Item label="購買內容">
              <Space size={4}>
                <Tag color={order.trafficMode === 'custom' ? 'purple' : 'orange'} style={{ margin: 0 }}>
                  {order.trafficMode === 'custom' ? '自定義' : (order.trafficPackageName || '-')}
                </Tag>
                <span style={{ fontSize: 13, color: '#595959' }}>
                  {(order.trafficImpressions ?? 0).toLocaleString()} 次曝光
                </span>
              </Space>
            </Descriptions.Item>
          ) : order.skinName && (
            <Descriptions.Item label={t('orderDetail.skinKit')}>
              <Tag color="geekblue">{order.skinName}</Tag>
            </Descriptions.Item>
          )}
        </Descriptions>
                  </Card>

                  {/* 购买时段与价格明细 */}
      <Card
        title={
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}
            onClick={() => setSlotsCollapsed(!slotsCollapsed)}>
            <CardTitle icon={<DollarOutlined style={{ fontSize: 12, color: '#1890ff' }} />} text={isNewStore ? t('orderDetail.slotTitleNewStore') : (isPopular || isRevive) ? t('orderDetail.slotTitlePopular') : isGoldenSignboard ? t('orderDetail.slotTitleGoldenSignboard') : isTrafficAd ? '購買流量包' : t('orderDetail.slotTitleStar')} />
            <span style={{ fontSize: 12, color: '#8C8C8C', marginLeft: 4 }}>
              {slotsCollapsed ? <RightOutlined /> : <DownOutlined />}
            </span>
            <span style={{ fontSize: 12, color: '#8C8C8C' }}>{slotsCollapsed ? t('orderDetail.expand') : t('orderDetail.collapse')}</span>
          </div>
        }
        style={{ marginBottom: 16, borderRadius: 8, border: 'none' }} styles={{ body: { padding: slotsCollapsed ? '0 24px' : '16px 24px' } }}>

        {!slotsCollapsed && (<>
        {/* 投流廣告：流量包購買信息（按曝光計價，無日期/時段明細） */}
        {isTrafficAd && (
          <div style={{ border: '1px solid #f0f0f0', borderRadius: 8, overflow: 'hidden', marginBottom: 12 }}>
            <div style={{
              background: '#FAFAFA', padding: '8px 16px', borderBottom: '1px solid #f0f0f0',
              fontSize: 13, fontWeight: 600, color: '#262626',
            }}>
              {order.trafficMode === 'custom' ? '自定義曝光次數' : (order.trafficPackageName || '流量包')}
            </div>
            <div style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 16, fontSize: 13 }}>
              <span style={{ color: '#8C8C8C' }}>購買曝光次數：</span>
              <span style={{ fontWeight: 700, color: '#E8720C', fontSize: 16 }}>
                {(order.trafficImpressions ?? 0).toLocaleString()} 次
              </span>
            </div>
          </div>
        )}
        {/* 无敌星星：按日期分组，每天展示商圈、时段、原价、折扣、折后价 */}
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
                <col style={{ width: '18%' }} />
                <col style={{ width: '18%' }} />
                <col style={{ width: '20%' }} />
                <col style={{ width: '16%' }} />
                <col style={{ width: '28%' }} />
              </colgroup>
              <thead>
                <tr style={{ background: '#FAFAFA' }}>
                  <th style={{ padding: '8px 16px', textAlign: 'center', fontWeight: 600, color: '#262626', fontSize: 12, background: '#F0F5FF', borderBottom: '1px solid #D6E4FF' }}>{t('promotionOrderManage.colRegion')}</th>
                  <th style={{ padding: '8px 16px', textAlign: 'center', fontWeight: 600, color: '#262626', fontSize: 12, background: '#F0F5FF', borderBottom: '1px solid #D6E4FF' }}>{t('orderDetail.colSlot')}</th>
                  <th style={{ padding: '8px 16px', textAlign: 'center', fontWeight: 600, color: '#262626', fontSize: 12, background: '#F0F5FF', borderBottom: '1px solid #D6E4FF' }}>{t('orderDetail.colOriginalPrice')}</th>
                  <th style={{ padding: '8px 16px', textAlign: 'center', fontWeight: 600, color: '#262626', fontSize: 12, background: '#F0F5FF', borderBottom: '1px solid #D6E4FF' }}>{t('orderDetail.colDiscount')}</th>
                  <th style={{ padding: '8px 16px', textAlign: 'center', fontWeight: 600, color: '#262626', fontSize: 12, background: '#F0F5FF', borderBottom: '1px solid #D6E4FF' }}>{t('orderDetail.colFinalPrice')}</th>
                </tr>
              </thead>
              <tbody>
                {(() => {
                  // 按商圈分组，同一商圈的时段连续排列并用 rowSpan 合并
                  const defaultRegion = Array.isArray(order.region) ? order.region[0] : order.region
                  const regionGroups: { region: number; slots: typeof slots }[] = []
                  const regionMap = new Map<number, typeof slots>()
                  slots.forEach(sp => {
                    const r = sp.region ?? defaultRegion
                    if (!regionMap.has(r)) {
                      regionMap.set(r, [])
                      regionGroups.push({ region: r, slots: regionMap.get(r)! })
                    }
                    regionMap.get(r)!.push(sp)
                  })
                  let rowIdx = 0
                  return regionGroups.map(({ region: r, slots: rSlots }) => {
                    return rSlots.map((sp, si) => {
                      const idx = rowIdx++
                      return (
                        <tr key={idx} style={{ borderTop: idx > 0 ? '1px solid #f0f0f0' : 'none' }}>
                          {si === 0 && (
                            <td rowSpan={rSlots.length} style={{
                              padding: '8px 16px', textAlign: 'center', verticalAlign: 'middle',
                              background: 'transparent',
                              borderLeft: rSlots.length > 1 ? '1px dashed #E8E8E8' : 'none',
                              borderRight: rSlots.length > 1 ? '1px dashed #E8E8E8' : 'none',
                            }}>
                              <Tag color="blue" style={{ margin: 0 }}>{t(REGION_LABEL_KEY[r])}</Tag>
                            </td>
                          )}
                          <td style={{ padding: '8px 16px', textAlign: 'center' }}>{slotLabel(sp.slot)}</td>
                          <td style={{ padding: '8px 16px', textAlign: 'center', color: '#595959' }}>{sp.originalPrice}</td>
                          <td style={{ padding: '8px 16px', textAlign: 'center' }}>
                            {sp.discount < 10 ? <Tag color="green">{t('orderDetail.discountFold', { n: sp.discount })}</Tag> : <span style={{ color: '#8C8C8C' }}>{t('orderDetail.noDiscount')}</span>}
                          </td>
                          <td style={{ padding: '8px 16px', textAlign: 'center', fontWeight: 500, color: '#E8720C' }}>{sp.actualPrice}</td>
                        </tr>
                      )
                    })
                  })
                })()}
              </tbody>
            </table>
          </div>
        ))}

        {/* 盘活复苏/人氣商家（按天計價）：单商圈，商圈为标题，下方平铺推广日期 */}
        {(order.recommendType === RecommendType.HOT_REVIVE_AD || isPopular) && (() => {
          const regionVal = Array.isArray(order.region) ? order.region[0] : order.region
          return (
            <div style={{ border: '1px solid #f0f0f0', borderRadius: 8, overflow: 'hidden', marginBottom: 12 }}>
              <div style={{
                background: '#FAFAFA', padding: '8px 16px', borderBottom: '1px solid #f0f0f0',
                fontSize: 13, fontWeight: 600, color: '#262626', display: 'flex', alignItems: 'center', gap: 8,
              }}>
                {isPopular ? (
                  <>
                    {/* 人氣商家：購買皮膚，無推廣商圈，只展示皮膚名稱 */}
                    <span style={{ fontSize: 12, color: '#8C8C8C', fontWeight: 400 }}>{t('orderDetail.skinKit')}</span>
                    <Tag style={{ margin: 0, color: '#E8720C', background: '#FFF7E6', borderColor: '#FFD591' }}>🎨 {order.skinName}</Tag>
                    <span style={{ marginLeft: 'auto', fontSize: 11, color: '#8C8C8C', fontWeight: 400 }}>{t('orderDetail.skinDailyNote')}</span>
                  </>
                ) : (
                  <>
                    {/* 盤活復蘇：同樣標註投放商圈字段前綴，與人氣商家保持一致 */}
                    <span style={{ fontSize: 12, color: '#8C8C8C', fontWeight: 400 }}>{t('orderDetail.investRegion')}</span>
                    <Tag color="blue" style={{ margin: 0 }}>{t(REGION_LABEL_KEY[regionVal])}</Tag>
                  </>
                )}
              </div>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, tableLayout: 'fixed' }}>
                <colgroup>
                  {isPopular ? (
                    <>
                      <col style={{ width: '30%' }} />
                      <col style={{ width: '30%' }} />
                      <col style={{ width: '40%' }} />
                    </>
                  ) : (
                    <>
                      <col style={{ width: '25%' }} />
                      <col style={{ width: '25%' }} />
                      <col style={{ width: '20%' }} />
                      <col style={{ width: '30%' }} />
                    </>
                  )}
                </colgroup>
                <thead>
                  <tr style={{ background: '#FAFAFA' }}>
                    <th style={{ padding: '8px 16px', textAlign: 'center', fontWeight: 600, color: '#262626', fontSize: 12, background: '#F0F5FF', borderBottom: '1px solid #D6E4FF' }}>{(isPopular || isRevive) ? t('orderDetail.promoDate') : t('orderDetail.colSlot')}</th>
                    <th style={{ padding: '8px 16px', textAlign: 'center', fontWeight: 600, color: '#262626', fontSize: 12, background: '#F0F5FF', borderBottom: '1px solid #D6E4FF' }}>{isPopular ? t('orderDetail.dailyPrice') : isRevive ? t('orderDetail.dayPrice') : t('orderDetail.colOriginalPrice')}</th>
                    {!isPopular && <th style={{ padding: '8px 16px', textAlign: 'center', fontWeight: 600, color: '#262626', fontSize: 12, background: '#F0F5FF', borderBottom: '1px solid #D6E4FF' }}>{t('orderDetail.colDiscount')}</th>}
                    {!isPopular && <th style={{ padding: '8px 16px', textAlign: 'center', fontWeight: 600, color: '#262626', fontSize: 12, background: '#F0F5FF', borderBottom: '1px solid #D6E4FF' }}>{t('orderDetail.colFinalPrice')}</th>}
                    {isPopular && <th style={{ padding: '8px 16px', textAlign: 'center', fontWeight: 600, color: '#262626', fontSize: 12, background: '#F0F5FF', borderBottom: '1px solid #D6E4FF' }}>{t('orderDetail.promoStatus')}</th>}
                  </tr>
                </thead>
                <tbody>
                  {order.slotPrices.map((sp, i) => (
                    <tr key={i} style={{ borderTop: i > 0 ? '1px solid #f0f0f0' : 'none' }}>
                      <td style={{ padding: '8px 16px', textAlign: 'center' }}>{(isPopular || isRevive) ? sp.date : slotLabel(sp.slot)}</td>
                      <td style={{ padding: '8px 16px', textAlign: 'center', color: '#595959' }}>{sp.originalPrice}</td>
                      {!isPopular && <td style={{ padding: '8px 16px', textAlign: 'center' }}>
                        {sp.discount < 10 ? <Tag color="green">{t('orderDetail.discountFold', { n: sp.discount })}</Tag> : <span style={{ color: '#8C8C8C' }}>{t('orderDetail.noDiscount')}</span>}
                      </td>}
                      {!isPopular && <td style={{ padding: '8px 16px', textAlign: 'center', fontWeight: 500, color: '#E8720C' }}>{sp.actualPrice}</td>}
                      {isPopular && (() => {
                        const dayStatus = getDayStatus(sp.date)
                        return (
                          <td style={{ padding: '8px 16px', textAlign: 'center' }}>
                            <Tag color={statusLabel(dayStatus).color} style={{ margin: 0 }}>
                              {statusLabel(dayStatus).label}
                            </Tag>
                          </td>
                        )
                      })()}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        })()}

        {/* 新店廣告：推廣商圈與日期（無價格） */}
        {isNewStore && (() => {
          const regionVal = Array.isArray(order.region) ? order.region[0] : order.region
          return (
            <div style={{ border: '1px solid #f0f0f0', borderRadius: 8, overflow: 'hidden', marginBottom: 12 }}>
              <div style={{
                background: '#FAFAFA', padding: '8px 16px', borderBottom: '1px solid #f0f0f0',
                fontSize: 13, fontWeight: 600, color: '#262626', display: 'flex', alignItems: 'center', gap: 8,
              }}>
                {/* 新店廣告：同樣標註投放商圈字段前綴，與人氣商家保持一致 */}
                <span style={{ fontSize: 12, color: '#8C8C8C', fontWeight: 400 }}>{t('orderDetail.investRegion')}</span>
                <Tag color="blue" style={{ margin: 0 }}>{t(REGION_LABEL_KEY[regionVal])}</Tag>
              </div>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, tableLayout: 'fixed' }}>
                <colgroup>
                  <col style={{ width: '40%' }} />
                  <col style={{ width: '30%' }} />
                  <col style={{ width: '30%' }} />
                </colgroup>
                <thead>
                  <tr style={{ background: '#FAFAFA' }}>
                    <th style={{ padding: '8px 16px', textAlign: 'center', fontWeight: 600, color: '#262626', fontSize: 12, background: '#F0F5FF', borderBottom: '1px solid #D6E4FF' }}>{t('orderDetail.promoDate')}</th>
                    <th style={{ padding: '8px 16px', textAlign: 'center', fontWeight: 600, color: '#262626', fontSize: 12, background: '#F0F5FF', borderBottom: '1px solid #D6E4FF' }}>{t('orderDetail.deductDays')}</th>
                    <th style={{ padding: '8px 16px', textAlign: 'center', fontWeight: 600, color: '#262626', fontSize: 12, background: '#F0F5FF', borderBottom: '1px solid #D6E4FF' }}>{t('orderDetail.promoStatus')}</th>
                  </tr>
                </thead>
                <tbody>
                  {(order.purchaseDays || []).map((day, i) => {
                    const dayStatus = getDayStatus(day)
                    return (
                      <tr key={i} style={{ borderTop: i > 0 ? '1px solid #f0f0f0' : 'none' }}>
                        <td style={{ padding: '8px 16px', textAlign: 'center' }}>{day}</td>
                        <td style={{ padding: '8px 16px', textAlign: 'center', fontWeight: 500, color: '#E8720C' }}>1</td>
                        <td style={{ padding: '8px 16px', textAlign: 'center' }}>
                          <Tag color={statusLabel(dayStatus).color} style={{ margin: 0 }}>
                            {statusLabel(dayStatus).label}
                          </Tag>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )
        })()}

        {/* 金字招牌：標籤 + 推廣商圈 + 購買日期與價格 */}
        {isGoldenSignboard && (() => {
          // 構建日期 → (label, scenario) 映射，供每行查找所屬標籤
          const dateToLabel = new Map<string, { label: string; scenario?: string | null }>()
          order.labelDates?.forEach(ld => {
            ld.dates.forEach(d => dateToLabel.set(d, { label: ld.label, scenario: ld.scenario }))
          })
          // 計算標籤名稱 + 推廣商圈的 rowSpan 合併
          const rows = order.slotPrices.map((sp) => {
            const info = dateToLabel.get(sp.date)
            return info ? `${info.label}|${info.scenario || ''}` : '__none__'
          })
          const rowSpans = rows.map((key, i) => {
            if (i === 0) {
              // 往前看無，往後看連續相同
              let span = 1
              while (i + span < rows.length && rows[i + span] === key) span++
              return span
            }
            if (rows[i] === rows[i - 1]) return 0 // 被合併
            let span = 1
            while (i + span < rows.length && rows[i + span] === key) span++
            return span
          })
          return (
            <div style={{ border: '1px solid #f0f0f0', borderRadius: 8, overflow: 'hidden', marginBottom: 12 }}>
              <div style={{
                background: '#FAFAFA', padding: '8px 16px', borderBottom: '1px solid #f0f0f0',
                fontSize: 13, fontWeight: 600, color: '#262626',
              }}>
                {t('orderDetail.slotTitleGoldenSignboard')}
              </div>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, tableLayout: 'fixed' }}>
                <colgroup>
                  <col style={{ width: '18%' }} />
                  <col style={{ width: '14%' }} />
                  <col style={{ width: '28%' }} />
                  <col style={{ width: '15%' }} />
                  <col style={{ width: '25%' }} />
                </colgroup>
                <thead>
                  <tr style={{ background: '#FAFAFA' }}>
                    <th style={{ padding: '8px 16px', textAlign: 'center', fontWeight: 600, color: '#262626', fontSize: 12, background: '#F0F5FF', borderBottom: '1px solid #D6E4FF' }}>{'標籤名稱'}</th>
                    <th style={{ padding: '8px 16px', textAlign: 'center', fontWeight: 600, color: '#262626', fontSize: 12, background: '#F0F5FF', borderBottom: '1px solid #D6E4FF' }}>{'推廣商圈'}</th>
                    <th style={{ padding: '8px 16px', textAlign: 'center', fontWeight: 600, color: '#262626', fontSize: 12, background: '#F0F5FF', borderBottom: '1px solid #D6E4FF' }}>{t('orderDetail.promoDate')}</th>
                    <th style={{ padding: '8px 16px', textAlign: 'center', fontWeight: 600, color: '#262626', fontSize: 12, background: '#F0F5FF', borderBottom: '1px solid #D6E4FF' }}>{t('orderDetail.dailyPrice')}</th>
                    <th style={{ padding: '8px 16px', textAlign: 'center', fontWeight: 600, color: '#262626', fontSize: 12, background: '#F0F5FF', borderBottom: '1px solid #D6E4FF' }}>{t('orderDetail.promoStatus')}</th>
                  </tr>
                </thead>
                <tbody>
                  {order.slotPrices.map((sp, i) => {
                    const dayStatus = getDayStatus(sp.date)
                    const labelInfo = dateToLabel.get(sp.date)
                    const labelCfg = labelInfo ? SIGNBOARD_LABEL_CN[labelInfo.label] : null
                    const rs = rowSpans[i]
                    return (
                      <tr key={i} style={{ borderTop: i > 0 ? '1px solid #f0f0f0' : 'none' }}>
                        {rs > 0 && (
                          <td rowSpan={rs} style={{
                            padding: '8px 16px', textAlign: 'center', verticalAlign: 'middle',
                            background: rs > 1 ? `${labelCfg?.color || '#8C8C8C'}08` : 'transparent',
                            borderRight: '1px dashed #E8E8E8',
                          }}>
                            {labelCfg ? (
                              <Tag style={{ margin: 0, color: labelCfg.color, background: `${labelCfg.color}10`, borderColor: `${labelCfg.color}40` }}>
                                {labelCfg.icon} {fmtSignboardLabel(labelInfo!.label, labelInfo!.scenario)}
                              </Tag>
                            ) : <span style={{ color: '#8C8C8C' }}>—</span>}
                          </td>
                        )}
                        {rs > 0 && (
                          <td rowSpan={rs} style={{
                            padding: '8px 16px', textAlign: 'center', verticalAlign: 'middle',
                            background: 'transparent',
                            borderRight: '1px dashed #E8E8E8',
                          }}>
                            <Tag color="blue" style={{ margin: 0 }}>{labelInfo ? getSignboardRegionDisplay(labelInfo.scenario) : '—'}</Tag>
                          </td>
                        )}
                        <td style={{ padding: '8px 16px', textAlign: 'center' }}>{sp.date}</td>
                        <td style={{ padding: '8px 16px', textAlign: 'center', color: '#595959' }}>{sp.originalPrice}</td>
                        <td style={{ padding: '8px 16px', textAlign: 'center' }}>
                          <Tag color={statusLabel(dayStatus).color} style={{ margin: 0 }}>
                            {statusLabel(dayStatus).label}
                          </Tag>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )
        })()}

        {/* 費用明細（新店廣告：贈送天數抵扣，無現金支付） */}
        {isNewStore && (() => {
          const days = order.purchaseDays || []
          const deductDays = days.length
          return (
            <div style={{
              padding: '20px', background: 'linear-gradient(135deg, #FFF9F0, #FFF4E6)', borderRadius: 12,
              border: '1px solid #FFE0B2',
            }}>
              {/* 标题 */}
              <div style={{ fontSize: 14, fontWeight: 700, color: '#E8720C', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 16 }}>💰</span> {t('orderDetail.feeDetail')}
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {/* 推廣天數 */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 12, color: '#8C8C8C', minWidth: 90 }}>{t('orderDetail.promoDays')}</span>
                  <span style={{ fontSize: 14, fontWeight: 600, color: '#262626' }}>{t('orderDetail.daysUnit', { count: deductDays })}</span>
                  {deductDays > 0 && (
                    <span style={{ fontSize: 11, color: '#BFBFBF' }}>{t('orderDetail.dateRangeTip', { start: days[0], end: days[deductDays - 1] })}</span>
                  )}
                </div>

                {/* 分隔线 */}
                <div style={{ height: 1, background: '#FFE0B2', margin: '4px 0' }} />

                {/* 使用抵扣天數 */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 14, fontWeight: 700, color: '#262626' }}>{t('orderDetail.useDeductDays')}</span>
                    <span style={{ fontSize: 11, color: '#8C8C8C' }}>{t('orderDetail.deductRule')}</span>
                  </div>
                  <div style={{
                    padding: '6px 20px', background: 'linear-gradient(135deg, #E8720C, #F59432)',
                    borderRadius: 8, boxShadow: '0 2px 8px rgba(232,114,12,0.3)',
                  }}>
                    <span style={{ fontSize: 22, fontWeight: 700, color: '#fff' }}>{t('orderDetail.daysUnit', { count: deductDays })}</span>
                  </div>
                </div>
              </div>

              {/* 计算公式详解 */}
              <div style={{
                marginTop: 16, padding: '10px 14px', background: '#fff', borderRadius: 8,
                border: '1px dashed #FFD591', fontSize: 12, color: '#8C8C8C', lineHeight: 2,
              }}>
                <div style={{ fontWeight: 600, color: '#595959', marginBottom: 4 }}>{t('orderDetail.calcFormula')}</div>
                {t('orderDetail.perDayCalc', { count: deductDays })}<strong style={{ color: '#E8720C' }}>{deductDays}</strong>
                <span style={{ color: '#BFBFBF' }}>{t('orderDetail.dayUnit')}</span>
              </div>
            </div>
          )
        })()}

        {/* 费用汇总 */}
        {!isNewStore && <div style={{
          padding: '20px', background: 'linear-gradient(135deg, #FFF9F0, #FFF4E6)', borderRadius: 12,
          border: '1px solid #FFE0B2',
        }}>
          {/* 标题 */}
          <div style={{ fontSize: 14, fontWeight: 700, color: '#E8720C', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 16 }}>💰</span> {t('orderDetail.feeDetail')}
            {/* 盤活復蘇/人氣商家：標註支付方式（純推廣金 / 純贈送抵扣 / 混合支付） */}
            {(isRevive || isPopular) && (
              <Tag color={payMode === 'gift' ? 'orange' : payMode === 'mixed' ? 'green' : 'gold'} style={{ margin: 0, fontSize: 11, borderRadius: 4, padding: '0 8px', lineHeight: '20px' }}>
                {payMode === 'gift' ? t('orderDetail.payModeGift') : payMode === 'mixed' ? t('orderDetail.payModeMixed') : t('orderDetail.payModePromo')}
              </Tag>
            )}
          </div>

          {/* 分步计算 */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {/* 第1步：时段小计 */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 12, color: '#8C8C8C', minWidth: 90 }}>{(isPopular || isRevive) ? t('orderDetail.step1DailyTotal') : t('orderDetail.step1SlotTotal')}</span>
              <span style={{ fontSize: 14, fontWeight: 600, color: '#262626' }}>MOP {totalOriginal}</span>
            </div>

            {/* ② 梯度折扣（所有訂單類型統一展示，固定第二步） */}
            {!order.gradientDiscount && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 12, color: '#8C8C8C', minWidth: 90 }}>{'②'} {t('orderDetail.gradientDiscountLabel')}</span>
                <span style={{ fontSize: 13, color: '#8C8C8C' }}>{t('orderDetail.noDiscount')}</span>
              </div>
            )}

            {order.gradientDiscount && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 12, color: '#8C8C8C', minWidth: 90 }}>{'②'} {t('orderDetail.gradientDiscountLabel')}</span>
                <span style={{ fontSize: 13, color: '#595959' }}>
                  {t('orderDetail.gradientRulePrefix', { count: order.gradientDiscount.count, unit: (isPopular || isRevive) ? t('orderDetail.daysSuffix') : t('orderDetail.slotsSuffix') })} <strong style={{ color: '#E8720C' }}>{order.gradientDiscount.discount}{t('orderDetail.foldSuffix')}</strong>
                </span>
              </div>
            )}

            {/* ③ 訂單優惠（折扣金額，無折扣時顯示 0） */}
            {!isNewStore && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 12, color: '#8C8C8C', minWidth: 90 }}>{'③'} {t('orderDetail.orderDiscountLabel')}</span>
                <span style={{ fontSize: 14, fontWeight: 600, color: '#fa8c16' }}>
                  {order.gradientDiscount ? `MOP ${totalOriginal - finalPrice}` : 'MOP 0'}
                </span>
              </div>
            )}

            {/* ④ 折後價格（所有訂單類型統一展示） */}
            {!isNewStore && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 12, color: '#8C8C8C', minWidth: 90 }}>{'④'} {t('orderDetail.step3FinalPrice')}</span>
                <span style={{ fontSize: 14, fontWeight: 600, color: '#E8720C' }}>MOP {order.gradientDiscount ? finalPrice : totalOriginal}</span>
                {(order.gradientDiscount ? totalSaved > 0 : false) && (
                  <span style={{ fontSize: 11, color: '#52C41A', background: '#F6FFED', padding: '1px 8px', borderRadius: 4, border: '1px solid #B7EB8F' }}>
                    {t('orderDetail.savedAmount', { amount: totalSaved })}
                  </span>
                )}
              </div>
            )}



            {/* 分隔线 */}
            <div style={{ height: 1, background: '#FFE0B2', margin: '4px 0' }} />

            {/* 混合支付：贈送天數抵扣 + 抵扣現金（獨立展示） */}
            {payMode === 'mixed' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {/* 使用赠送天数抵扣 */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 14, fontWeight: 700, color: '#262626' }}>{t('orderDetail.giftDeductDaysLabel')}</span>
                    <span style={{ fontSize: 11, color: '#8C8C8C' }}>{t('orderDetail.giftDeductTip', { days: giftDays })}</span>
                  </div>
                  <div style={{
                    padding: '4px 16px', background: '#FFF7E6', border: '1px solid #FFD591',
                    borderRadius: 8,
                  }}>
                    <span style={{ fontSize: 18, fontWeight: 700, color: '#E8720C' }}>{giftDays} {t('orderDetail.daysSuffix')}</span>
                  </div>
                </div>
                {/* 赠送天数抵扣现金（仅人气商家定价配置了现金价值） */}
                {isPopular && <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 14, fontWeight: 700, color: '#262626' }}>{t('orderDetail.giftDeductCashLabel')}</span>
                  </div>
                  <div style={{
                    padding: '4px 16px', background: '#FFF7E6', border: '1px solid #FFD591',
                    borderRadius: 8,
                  }}>
                    <span style={{ fontSize: 18, fontWeight: 700, color: '#E8720C' }}>MOP {giftAmount}</span>
                  </div>
                </div>}
              </div>
            )}

            {/* 最终实付 */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 14, fontWeight: 700, color: '#262626' }}>{payMode === 'gift' ? t('orderDetail.giftDeductLabel') : t('orderDetail.actualPaid')}</span>
                {payMode !== 'gift' && <span style={{ fontSize: 11, color: '#8C8C8C' }}>
                  {order.gradientDiscount
                    ? ((isPopular || isRevive)
                      ? t(order.gradientDiscount.count > order.slotPrices.length ? 'orderDetail.paidCalcDetailNoGrad' : 'orderDetail.paidCalcDetailGrad', { count: order.slotPrices.length, discount: order.gradientDiscount.discount })
                      : t(order.gradientDiscount.count > order.slotPrices.length ? 'orderDetail.paidCalcSlotNoGrad' : 'orderDetail.paidCalcSlotGrad', { count: order.slotPrices.length, discount: order.gradientDiscount.discount }))
                    : ((isPopular || isRevive) ? t('orderDetail.paidCalcDetail', { count: order.slotPrices.length }) : t('orderDetail.paidCalcSlot', { count: order.slotPrices.length }))
                  }
                </span>}
              </div>
              {payMode === 'gift' ? (
                <div style={{
                  padding: '6px 20px', background: 'linear-gradient(135deg, #E8720C, #F59432)',
                  borderRadius: 8, boxShadow: '0 2px 8px rgba(232,114,12,0.3)',
                }}>
                  <span style={{ fontSize: 22, fontWeight: 700, color: '#fff' }}>{giftDays} {t('orderDetail.daysSuffix')}</span>
                </div>
              ) : isRefunded ? (
                <div style={{
                  padding: '5px 18px', background: '#FFF7E6', border: '1px solid #FFD591',
                  borderRadius: 8,
                }}>
                  <span style={{ fontSize: 20, fontWeight: 700, color: '#E8720C' }}>MOP {actualPaid}</span>
                </div>
              ) : (
                <div style={{
                  padding: '6px 20px', background: 'linear-gradient(135deg, #E8720C, #F59432)',
                  borderRadius: 8, boxShadow: '0 2px 8px rgba(232,114,12,0.3)',
                }}>
                  <span style={{ fontSize: 22, fontWeight: 700, color: '#fff' }}>MOP {actualPaid}</span>
                </div>
              )}
            </div>
          </div>

          {/* 计算公式详解 */}
          <div style={{
            marginTop: 16, padding: '10px 14px', background: '#fff', borderRadius: 8,
            border: '1px dashed #FFD591', fontSize: 12, color: '#8C8C8C', lineHeight: 2,
          }}>
            <div style={{ fontWeight: 600, color: '#595959', marginBottom: 4 }}>{t('orderDetail.calcFormula')}</div>
            {(isPopular || isRevive) ? (
              // 人氣商家/盤活復蘇：按天計價
              <>
                {t('orderDetail.dailyCalc', { count: order.slotPrices.length, price: order.slotPrices[0]?.originalPrice || 0 })}<strong style={{ color: '#262626' }}>{totalOriginal}</strong>
                {order.gradientDiscount && (
                  <> × {order.gradientDiscount.discount / 10} = <strong style={{ color: '#E8720C' }}>{finalPrice}</strong>
                    {giftDays > 0 && (
                      <> → {t('orderDetail.giftDeductShort', { days: giftDays })}
                        {payMode === 'mixed' && isPopular ? (
                          <> <strong style={{ color: '#E8720C' }}>{giftDays} {t('orderDetail.daysSuffix')}</strong> + <strong style={{ color: '#FF4D4F' }}>MOP {actualPaid}</strong></>
                        ) : (
                          <> <strong style={{ color: '#E8720C' }}>{giftDays} {t('orderDetail.daysSuffix')}</strong></>
                        )}
                      </>
                    )}
                  </>
                )}
                {!order.gradientDiscount && giftDays > 0 && (
                  <> → {t('orderDetail.giftDeductShort', { days: giftDays })}
                    {payMode === 'mixed' && isPopular ? (
                      <> <strong style={{ color: '#E8720C' }}>{giftDays} {t('orderDetail.daysSuffix')}</strong> + <strong style={{ color: '#FF4D4F' }}>MOP {actualPaid}</strong></>
                    ) : (
                      <> <strong style={{ color: '#E8720C' }}>{giftDays} {t('orderDetail.daysSuffix')}</strong></>
                    )}
                  </>
                )}
                <span style={{ color: '#BFBFBF' }}>{t('orderDetail.mopUnit')}</span>
              </>
            ) : (
              // 其他類型：顯示各時段明細
              <>
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
                <span style={{ color: '#BFBFBF' }}>{t('orderDetail.mopUnit')}</span>
              </>
            )}
          </div>
        </div>}

        </>
                  )}
                  </Card>

                  {/* 訂單退款扣費比例 - 独立区块，新店廣告不顯示 */}
                  {!isNewStore && <div style={{
                    marginBottom: 16, padding: '14px 20px', borderRadius: 8,
                    background: order.refundEnabled === false ? '#fff2f0' : '#FAFAFA',
                    border: order.refundEnabled === false ? '1px solid #ffccc7' : '1px solid #F0F0F0',
                  }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#262626', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ width: 4, height: 14, background: '#FF4D4F', borderRadius: 2, display: 'inline-block' }} />
                      {t('orderDetail.refundRuleTitle')}
                      {order.refundEnabled === false && (
                        <Tag color="error" style={{ fontSize: 10, borderRadius: 4, margin: 0, padding: '0 6px', lineHeight: '18px' }}>
                          {t('orderDetail.refundNotAllowed')}
                        </Tag>
                      )}
                      {isRefunded && (
                        <Tag color="red" style={{ fontSize: 10, borderRadius: 4, margin: 0, padding: '0 6px', lineHeight: '18px' }}>
                          {t('orderDetail.refundedTag')}
                        </Tag>
                      )}
                    </div>
                    {order.refundEnabled === false ? (
                      <div style={{
                        fontSize: 14,
                        fontWeight: 600,
                        color: '#cf1322',
                        padding: '12px 16px',
                        background: '#fff1f0',
                        borderRadius: 6,
                        border: '1px solid #ffa39e',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                      }}>
                        <ExclamationCircleOutlined style={{ fontSize: 16, color: '#cf1322' }} />
                        <span>{t('orderDetail.refundNotAllowedTip')}</span>
                      </div>
                    ) : (
                      <>
                        <div style={{ fontSize: 12, color: '#8C8C8C' }}>
                          {order.cancelFeeRules.map((rule, i) => (
                            <span key={i}>
                              {i > 0 && ' | '}
                              {t('orderDetail.refundRuleText', { days: rule.maxDays, percent: rule.feePercent })}
                            </span>
                          ))}
                        </div>
                        {/* 已退款訂單：展示退款金額與匹配到的規則 */}
                        {isRefunded && (
                          <div style={{
                            marginTop: 12, padding: '12px 16px', borderRadius: 8,
                            background: '#fff2f0', border: '1px solid #ffccc7',
                            display: 'flex', flexDirection: 'column', gap: 8,
                          }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                              <span style={{ fontSize: 12, color: '#8C8C8C' }}>{t('orderDetail.matchedRule')}</span>
                              <span style={{ fontSize: 13, fontWeight: 600, color: '#cf1322' }}>
                                {refundInfo?.matchedRule
                                  ? t('orderDetail.refundRuleText', { days: refundInfo.matchedRule.maxDays, percent: refundInfo.matchedRule.feePercent })
                                  : t('orderDetail.refundNoFee', { days: refundInfo?.daysBefore ?? 0 })}
                              </span>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                              <span style={{ fontSize: 12, color: '#8C8C8C' }}>{t('orderDetail.feePercentLabel')}</span>
                              <span style={{ fontSize: 13, fontWeight: 600, color: '#262626' }}>{refundInfo?.feePercent ?? 0}%</span>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderTop: '1px dashed #ffccc7', paddingTop: 12, marginTop: 4 }}>
                              <span style={{ fontSize: 14, fontWeight: 700, color: '#cf1322' }}>{t('orderDetail.refundAmountLabel')}</span>
                              <div style={{
                                padding: '6px 20px', background: 'linear-gradient(135deg, #FF4D4F, #FF7875)',
                                borderRadius: 8, boxShadow: '0 2px 8px rgba(255,77,79,0.35)',
                              }}>
                                <span style={{ fontSize: 22, fontWeight: 700, color: '#fff' }}>MOP {refundAmountByPaid}</span>
                              </div>
                            </div>
                            <div style={{ fontSize: 11, color: '#bfbfbf' }}>
                              {t('orderDetail.refundFormula', { paid: finalPrice, percent: refundInfo?.feePercent ?? 0, amount: refundAmountByPaid })}
                            </div>
                          </div>
                        )}
                      </>
                    )}
                  </div>}
                </div>
              ),
            },
            ...([{
              key: 'promoData',
              label: (
                <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 14, fontWeight: 600 }}>
                  <BarChartOutlined style={{ color: '#E8720C' }} /> {t('orderDetail.tabPromoData')}
                </span>
              ),
              children: (
                <div style={{ padding: '8px 0 0' }}>
                  {/* 待推广状态：显示全0 + 提醒 */}
                  {order.status === OrderStatus.PENDING_PROMOTION && (
                    <div style={{
                      background: '#fffbe6', border: '1px solid #ffe58f', borderRadius: 8,
                      padding: '12px 16px', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 10,
                    }}>
                      <ExclamationCircleOutlined style={{ fontSize: 16, color: '#faad14' }} />
                      <span style={{ fontSize: 13, color: '#8c6e00' }}>{t('orderDetail.promoWaitTip')}</span>
                    </div>
                  )}
                  {/* 汇总统计 */}
                  <div key={promoAnimKey} style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 20 }}>
                    {(() => {
                      const isStar = order.recommendType === RecommendType.INVINCIBLE_STAR
                      const data = order.promoData || []
                      const uniqueDates = new Set(data.map(d => d.date)).size
                      const uniqueSlots = new Set(data.filter(d => d.slot).map(d => `${d.date}-${d.slot}`)).size
                      const totalImpressions = data.reduce((s, d) => s + d.impressions, 0)
                      const totalClicks = data.reduce((s, d) => s + d.clicks, 0)
                      // 投流廣告：購買曝光量 / 已消耗曝光量 / 剩余曝光量 / 平均點擊率
                      const trafficStats = isTrafficAd ? [
                        { label: '購買曝光量', value: <AnimatedNumber value={order.trafficImpressions ?? 0} />, icon: <EyeOutlined />, color: '#1890ff', bg: '#E6F7FF' },
                        { label: '已消耗曝光量', value: <AnimatedNumber value={totalImpressions} />, icon: <FireOutlined />, color: '#E8720C', bg: '#FFF7E6' },
                        { label: '剩余曝光量', value: <AnimatedNumber value={Math.max(0, (order.trafficImpressions ?? 0) - totalImpressions)} />, icon: <HourglassOutlined />, color: '#52C41A', bg: '#F6FFED' },
                        { label: t('orderDetail.statAvgCtr'), value: data.length > 0 ? <AnimatedPercent values={data.map(d => d.clickRate)} /> : <span>0%</span>, icon: <BarChartOutlined />, color: '#722ED1', bg: '#F9F0FF' },
                      ] : null
                      const stats = trafficStats ?? [
                        { label: t('orderDetail.statTotalImpressions'), value: <AnimatedNumber value={totalImpressions} />, icon: <EyeOutlined />, color: '#1890ff', bg: '#E6F7FF' },
                        { label: t('orderDetail.statTotalClicks'), value: <AnimatedNumber value={totalClicks} />, icon: <AimOutlined />, color: '#52C41A', bg: '#F6FFED' },
                        { label: isStar ? t('orderDetail.statPromoSlots') : t('orderDetail.statPromoDays'), value: isStar ? <AnimatedNumber value={uniqueSlots} suffix={t('orderDetail.slotsSuffix')} /> : <AnimatedNumber value={uniqueDates} suffix={t('orderDetail.daysSuffix')} />, icon: <ClockCircleOutlined />, color: '#722ED1', bg: '#F9F0FF' },
                        { label: t('orderDetail.statAvgCtr'), value: data.length > 0 ? <AnimatedPercent values={data.map(d => d.clickRate)} /> : <span>0%</span>, icon: <BarChartOutlined />, color: '#E8720C', bg: '#FFF7E6' },
                      ]
                      return stats.map((stat, i) => (
                        <div key={i} style={{
                          padding: '16px', borderRadius: 12, background: stat.bg,
                          border: `1px solid ${stat.color}22`, textAlign: 'center',
                          transition: 'all 0.35s cubic-bezier(0.4, 0, 0.2, 1)', cursor: 'default',
                          position: 'relative', overflow: 'hidden',
                        }}
                          onMouseEnter={e => {
                            e.currentTarget.style.transform = 'translateY(-4px)'
                            e.currentTarget.style.boxShadow = '0 8px 24px rgba(0, 0, 0, 0.1)'
                          }}
                          onMouseLeave={e => {
                            e.currentTarget.style.transform = 'translateY(0)'
                            e.currentTarget.style.boxShadow = 'none'
                          }}
                        >
                          <div style={{ fontSize: 20, color: stat.color, marginBottom: 6 }}>{stat.icon}</div>
                          <div style={{ fontSize: 22, fontWeight: 700, color: stat.color }}>{stat.value}</div>
                          <div style={{ fontSize: 12, color: '#8C8C8C', marginTop: 2 }}>{stat.label}</div>
                        </div>
                      ))
                    })()}
                  </div>

                  {/* 推广数据明细 - 按日期分组，商圈 rowSpan 合并 */}
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#262626', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ width: 4, height: 14, background: '#E8720C', borderRadius: 2, display: 'inline-block' }} />
                    {RECOMMEND_TYPE_ICON[order.recommendType]} {recommendTypeLabel(order.recommendType)} · {t('orderDetail.promoDetailTitle')}
                  </div>
                  {(order.promoData || []).length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '24px 0', color: '#8C8C8C', fontSize: 13 }}>{t('orderDetail.noPromoData')}</div>
                  ) : isGoldenSignboard ? (
                    /* 金字招牌：按標籤分組，標籤名稱 + 推廣商圈 + 日期明細 */
                    (() => {
                      const data = order.promoData || []
                      // 按 label+scenario 分組
                      const labelGroups: { label: string; scenario: string | null | undefined; recs: PromoRecord[] }[] = []
                      const labelMap = new Map<string, { label: string; scenario: string | null | undefined; recs: PromoRecord[] }>()
                      data.forEach(rec => {
                        const key = `${rec.labelName || ''}|${rec.scenario || ''}`
                        if (!labelMap.has(key)) {
                          labelMap.set(key, { label: rec.labelName || '', scenario: rec.scenario, recs: [] })
                          labelGroups.push(labelMap.get(key)!)
                        }
                        labelMap.get(key)!.recs.push(rec)
                      })
                      return labelGroups.map(({ label: lbl, scenario: sc, recs: gRecs }, gi) => {
                        const labelCfg = SIGNBOARD_LABEL_CN[lbl]
                        const labelText = fmtSignboardLabel(lbl, sc)
                        const regionDisplay = getSignboardRegionDisplay(sc)
                        return (
                          <div key={gi} style={{ border: '1px solid #f0f0f0', borderRadius: 8, overflow: 'hidden', marginBottom: 12 }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, tableLayout: 'fixed' }}>
                              <colgroup>
                                <col style={{ width: '18%' }} />
                                <col style={{ width: '14%' }} />
                                <col style={{ width: '20%' }} />
                                <col style={{ width: '16%' }} />
                                <col style={{ width: '14%' }} />
                                <col style={{ width: '18%' }} />
                              </colgroup>
                              <thead>
                                <tr style={{ background: '#FAFAFA' }}>
                                  <th style={{ padding: '8px 16px', textAlign: 'center', fontWeight: 600, color: '#262626', fontSize: 12, background: '#F0F5FF', borderBottom: '1px solid #D6E4FF' }}>{'標籤名稱'}</th>
                                  <th style={{ padding: '8px 16px', textAlign: 'center', fontWeight: 600, color: '#262626', fontSize: 12, background: '#F0F5FF', borderBottom: '1px solid #D6E4FF' }}>{'推廣商圈'}</th>
                                  <th style={{ padding: '8px 16px', textAlign: 'center', fontWeight: 600, color: '#262626', fontSize: 12, background: '#F0F5FF', borderBottom: '1px solid #D6E4FF' }}>{t('orderDetail.promoDate')}</th>
                                  <th style={{ padding: '8px 16px', textAlign: 'center', fontWeight: 600, color: '#262626', fontSize: 12, background: '#F0F5FF', borderBottom: '1px solid #D6E4FF' }}>{t('orderDetail.colImpressions')}</th>
                                  <th style={{ padding: '8px 16px', textAlign: 'center', fontWeight: 600, color: '#262626', fontSize: 12, background: '#F0F5FF', borderBottom: '1px solid #D6E4FF' }}>{t('orderDetail.colClicks')}</th>
                                  <th style={{ padding: '8px 16px', textAlign: 'center', fontWeight: 600, color: '#262626', fontSize: 12, background: '#F0F5FF', borderBottom: '1px solid #D6E4FF' }}>{t('orderDetail.colCtr')}</th>
                                </tr>
                              </thead>
                              <tbody>
                                {gRecs.map((rec, ri) => (
                                  <tr key={ri} style={{ borderTop: ri > 0 ? '1px solid #f0f0f0' : 'none' }}>
                                    {ri === 0 && (
                                      <td rowSpan={gRecs.length} style={{
                                        padding: '8px 16px', textAlign: 'center', verticalAlign: 'middle',
                                        background: `${labelCfg?.color || '#8C8C8C'}08`,
                                        borderRight: '1px dashed #E8E8E8',
                                      }}>
                                        {labelCfg ? (
                                          <Tag style={{ margin: 0, color: labelCfg.color, background: `${labelCfg.color}10`, borderColor: `${labelCfg.color}40` }}>
                                            {labelCfg.icon} {labelText}
                                          </Tag>
                                        ) : <span style={{ color: '#8C8C8C' }}>{labelText || '—'}</span>}
                                      </td>
                                    )}
                                    {ri === 0 && (
                                      <td rowSpan={gRecs.length} style={{
                                        padding: '8px 16px', textAlign: 'center', verticalAlign: 'middle',
                                        borderRight: '1px dashed #E8E8E8',
                                      }}>
                                        <Tag color="blue" style={{ margin: 0 }}>{regionDisplay}</Tag>
                                      </td>
                                    )}
                                    <td style={{ padding: '8px 16px', textAlign: 'center' }}>{rec.date}</td>
                                    <td style={{ padding: '8px 16px', textAlign: 'center', fontWeight: 500 }}>{rec.impressions.toLocaleString()}</td>
                                    <td style={{ padding: '8px 16px', textAlign: 'center', color: '#52C41A', fontWeight: 500 }}>{rec.clicks}</td>
                                    <td style={{ padding: '8px 16px', textAlign: 'center' }}>
                                      <span style={{
                                        color: rec.clickRate >= 8 ? '#52C41A' : rec.clickRate >= 5 ? '#E8720C' : '#FF4D4F',
                                        fontWeight: 600,
                                      }}>{rec.clickRate}%</span>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )
                      })
                    })()
                  ) : order.recommendType === RecommendType.HOT_REVIVE_AD || order.recommendType === RecommendType.NEW_STORE_AD || isPopular || isTrafficAd ? (
                    /* 盤活復蘇/人氣商家/投流廣告：平铺推廣日期明細（投流按曝光計價） */
                    (() => {
                      const regionVal = Array.isArray(order.region) ? order.region[0] : order.region
                      const data = order.promoData || []
                      return (
                        <div style={{ border: '1px solid #f0f0f0', borderRadius: 8, overflow: 'hidden', marginBottom: 12 }}>
                          <div style={{
                            background: '#FAFAFA', padding: '8px 16px', borderBottom: '1px solid #f0f0f0',
                            fontSize: 13, fontWeight: 600, color: '#262626', display: 'flex', alignItems: 'center', gap: 8,
                          }}>
                            {isPopular ? (
                              <>
                                <span style={{ fontSize: 12, color: '#8C8C8C', fontWeight: 400 }}>{t('orderDetail.skinKit')}</span>
                                <Tag style={{ margin: 0, color: '#E8720C', background: '#FFF7E6', borderColor: '#FFD591' }}>🎨 {order.skinName}</Tag>
                              </>
                            ) : isTrafficAd ? (
                              <>
                                <span style={{ fontSize: 12, color: '#8C8C8C', fontWeight: 400 }}>流量包</span>
                                <Tag style={{
                                  margin: 0,
                                  color: order.trafficMode === 'custom' ? '#722ED1' : '#E8720C',
                                  background: order.trafficMode === 'custom' ? '#F9F0FF' : '#FFF7E6',
                                  borderColor: order.trafficMode === 'custom' ? '#D3ADF7' : '#FFD591',
                                }}>
                                  📊 {order.trafficMode === 'custom' ? '自定義' : (order.trafficPackageName || '-')}
                                </Tag>
                                <span style={{ fontSize: 12, color: '#8C8C8C', fontWeight: 400 }}>
                                  {(order.trafficImpressions ?? 0).toLocaleString()} 次曝光
                                </span>
                              </>
                            ) : (
                              <Tag color="blue" style={{ margin: 0 }}>{t(REGION_LABEL_KEY[regionVal])}</Tag>
                            )}
                          </div>
                          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, tableLayout: 'fixed' }}>
                            <colgroup>
                              {isTrafficAd ? (
                                <>
                                  <col style={{ width: '20%' }} />
                                  <col style={{ width: '20%' }} />
                                  <col style={{ width: '20%' }} />
                                  <col style={{ width: '20%' }} />
                                  <col style={{ width: '20%' }} />
                                </>
                              ) : (
                                <>
                                  <col style={{ width: '25%' }} />
                                  <col style={{ width: '25%' }} />
                                  <col style={{ width: '25%' }} />
                                  <col style={{ width: '25%' }} />
                                </>
                              )}
                            </colgroup>
                            <thead>
                              <tr style={{ background: '#FAFAFA' }}>
                                <th style={{ padding: '8px 16px', textAlign: 'center', fontWeight: 600, color: '#262626', fontSize: 12, background: '#F0F5FF', borderBottom: '1px solid #D6E4FF' }}>{t('orderDetail.promoDate')}</th>
                                <th style={{ padding: '8px 16px', textAlign: 'center', fontWeight: 600, color: '#262626', fontSize: 12, background: '#F0F5FF', borderBottom: '1px solid #D6E4FF' }}>{t('orderDetail.colImpressions')}</th>
                                {isTrafficAd && (
                                  <th style={{ padding: '8px 16px', textAlign: 'center', fontWeight: 600, color: '#262626', fontSize: 12, background: '#F0F5FF', borderBottom: '1px solid #D6E4FF' }}>消耗金額</th>
                                )}
                                <th style={{ padding: '8px 16px', textAlign: 'center', fontWeight: 600, color: '#262626', fontSize: 12, background: '#F0F5FF', borderBottom: '1px solid #D6E4FF' }}>{t('orderDetail.colClicks')}</th>
                                <th style={{ padding: '8px 16px', textAlign: 'center', fontWeight: 600, color: '#262626', fontSize: 12, background: '#F0F5FF', borderBottom: '1px solid #D6E4FF' }}>{t('orderDetail.colCtr')}</th>
                              </tr>
                            </thead>
                            <tbody>
                              {data.map((rec, i) => (
                                <tr key={i} style={{ borderTop: i > 0 ? '1px solid #f0f0f0' : 'none' }}>
                                  <td style={{ padding: '8px 16px', textAlign: 'center' }}>{rec.date}</td>
                                  <td style={{ padding: '8px 16px', textAlign: 'center', fontWeight: 500 }}>{rec.impressions.toLocaleString()}</td>
                                  {isTrafficAd && (
                                    <td style={{ padding: '8px 16px', textAlign: 'center', color: '#E8720C', fontWeight: 500 }}>
                                      MOP {(rec.impressions * (trafficRefund?.unitPrice ?? 0)).toFixed(2)}
                                    </td>
                                  )}
                                  <td style={{ padding: '8px 16px', textAlign: 'center', color: '#52C41A', fontWeight: 500 }}>{rec.clicks}</td>
                                  <td style={{ padding: '8px 16px', textAlign: 'center' }}>
                                    <span style={{
                                      color: rec.clickRate >= 8 ? '#52C41A' : rec.clickRate >= 5 ? '#E8720C' : '#FF4D4F',
                                      fontWeight: 600,
                                    }}>{rec.clickRate}%</span>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )
                    })()
                  ) : (
                    /* 无敌星星：按日期分组，商圈 rowSpan 合并 */
                    (() => {
                      const data = order.promoData || []
                      const dateGroups = new Map<string, PromoRecord[]>()
                      data.forEach(rec => {
                        if (!dateGroups.has(rec.date)) dateGroups.set(rec.date, [])
                        dateGroups.get(rec.date)!.push(rec)
                      })
                      return Array.from(dateGroups.entries()).map(([date, recs]) => (
                        <div key={date} style={{ border: '1px solid #f0f0f0', borderRadius: 8, marginBottom: 12, overflow: 'hidden' }}>
                          <div style={{
                            background: '#FAFAFA', padding: '8px 16px', borderBottom: '1px solid #f0f0f0',
                            fontSize: 13, fontWeight: 600, color: '#262626',
                          }}>
                            {date}
                          </div>
                          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, tableLayout: 'fixed' }}>
                            <colgroup>
                              <col style={{ width: '15%' }} />
                              <col style={{ width: '15%' }} />
                              <col style={{ width: '20%' }} />
                              <col style={{ width: '18%' }} />
                              <col style={{ width: '16%' }} />
                            </colgroup>
                            <thead>
                              <tr style={{ background: '#FAFAFA' }}>
                                <th style={{ padding: '8px 16px', textAlign: 'center', fontWeight: 600, color: '#262626', fontSize: 12, background: '#F0F5FF', borderBottom: '1px solid #D6E4FF' }}>{t('promotionOrderManage.colRegion')}</th>
                                <th style={{ padding: '8px 16px', textAlign: 'center', fontWeight: 600, color: '#262626', fontSize: 12, background: '#F0F5FF', borderBottom: '1px solid #D6E4FF' }}>{t('orderDetail.colSlot')}</th>
                                <th style={{ padding: '8px 16px', textAlign: 'center', fontWeight: 600, color: '#262626', fontSize: 12, background: '#F0F5FF', borderBottom: '1px solid #D6E4FF' }}>{t('orderDetail.colImpressions')}</th>
                                <th style={{ padding: '8px 16px', textAlign: 'center', fontWeight: 600, color: '#262626', fontSize: 12, background: '#F0F5FF', borderBottom: '1px solid #D6E4FF' }}>{t('orderDetail.colClicks')}</th>
                                <th style={{ padding: '8px 16px', textAlign: 'center', fontWeight: 600, color: '#262626', fontSize: 12, background: '#F0F5FF', borderBottom: '1px solid #D6E4FF' }}>{t('orderDetail.colCtr')}</th>
                              </tr>
                            </thead>
                            <tbody>
                              {(() => {
                                const regionGroups: { region: string; recs: PromoRecord[] }[] = []
                                const regionMap = new Map<string, PromoRecord[]>()
                                recs.forEach(rec => {
                                  if (!regionMap.has(rec.region)) {
                                    regionMap.set(rec.region, [])
                                    regionGroups.push({ region: rec.region, recs: regionMap.get(rec.region)! })
                                  }
                                  regionMap.get(rec.region)!.push(rec)
                                })
                                let rowIdx = 0
                                return regionGroups.map(({ region: r, recs: rRecs }) => {
                                  // 按時段分組
                                  const slotGroups: { slot: string; recs: PromoRecord[] }[] = []
                                  const slotMap = new Map<string, PromoRecord[]>()
                                  rRecs.forEach(rec => {
                                    const slotName = rec.slot || t('orderDetail.fullDaySlot')
                                    if (!slotMap.has(slotName)) {
                                      slotMap.set(slotName, [])
                                      slotGroups.push({ slot: slotName, recs: slotMap.get(slotName)! })
                                    }
                                    slotMap.get(slotName)!.push(rec)
                                  })
                                  const regionRowCount = rRecs.length
                                  return slotGroups.flatMap(({ slot: s, recs: sRecs }, slotIdx) => {
                                    return sRecs.map((rec, si) => {
                                      const idx = rowIdx++
                                      return (
                                        <tr key={idx} style={{ borderTop: idx > 0 ? '1px solid #f0f0f0' : 'none' }}>
                                          {si === 0 && slotIdx === 0 && (
                                            <td rowSpan={regionRowCount} style={{
                                              padding: '8px 16px', textAlign: 'center', verticalAlign: 'middle',
                                              background: '#FAFAFA', borderRight: '1px solid #f0f0f0',
                                            }}>
                                              <Tag color="blue" style={{ margin: 0 }}>{r}</Tag>
                                            </td>
                                          )}
                                          {si === 0 && (
                                            <td rowSpan={sRecs.length} style={{
                                              padding: '8px 16px', textAlign: 'center', verticalAlign: 'middle',
                                              borderRight: '1px solid #f0f0f0',
                                            }}>
                                              <Tag color="default" style={{ margin: 0 }}>{s}</Tag>
                                            </td>
                                          )}
                                          <td style={{ padding: '8px 16px', textAlign: 'center', fontWeight: 500 }}>{rec.impressions.toLocaleString()}</td>
                                          <td style={{ padding: '8px 16px', textAlign: 'center', color: '#52C41A', fontWeight: 500 }}>{rec.clicks}</td>
                                          <td style={{ padding: '8px 16px', textAlign: 'center' }}>
                                            <span style={{
                                              color: rec.clickRate >= 8 ? '#52C41A' : rec.clickRate >= 5 ? '#E8720C' : '#FF4D4F',
                                              fontWeight: 600,
                                            }}>{rec.clickRate}%</span>
                                          </td>
                                        </tr>
                                      )
                                    })
                                  })
                                })
                              })()}
                            </tbody>
                          </table>
                        </div>
                      ))
                    })()
                  )}
                </div>
              ),
            }]),
          ]}
        />
      </div>

      {/* 底部操作栏 */}
      <div className="form-footer">
        <Button onClick={() => navigate(backToListPath)}>
          {t('orderDetail.backToList')}
        </Button>
        {(order.status === OrderStatus.PENDING_PROMOTION || order.status === OrderStatus.PROMOTING) && order.refundEnabled !== false
          && !(isTrafficAd && trafficRefund?.allowRefund === false) && (
          <Button type="primary" danger icon={<RollbackOutlined />}
            onClick={handleRefund}>
            {isNewStore ? t('orderDetail.cancelPromo') : t('orderDetail.applyRefund')}
          </Button>
        )}
      </div>

      {/* 退款/取消推廣确认弹窗 */}
      <Modal
        title={
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <ExclamationCircleOutlined style={{ color: '#FF4D4F', fontSize: 18 }} />
            <span style={{ fontSize: 16, fontWeight: 600, color: '#262626' }}>{isNewStore ? t('orderDetail.confirmCancelTitle') : t('orderDetail.confirmRefundTitle')}</span>
          </div>
        }
        open={refundModalVisible}
        onOk={confirmRefund}
        onCancel={() => setRefundModalVisible(false)}
        okText={isNewStore ? t('orderDetail.okCancel') : t('orderDetail.okRefund')}
        cancelText={t('orderDetail.cancel')}
        okButtonProps={{ danger: true }}
      >
        {isNewStore ? (
          <div>
            <div style={{
              background: '#FFF7E6', border: '1px solid #FFD591', borderRadius: 8,
              padding: 16, marginBottom: 16,
            }}>
              <div style={{ fontSize: 13, color: '#595959', lineHeight: 2 }}>
                <div style={{ marginBottom: 8 }}>
                  {t('orderDetail.newStoreTip1Prefix')}<strong style={{ color: '#E8720C' }}>{t('orderDetail.daysUnit', { count: 60 })}</strong>{t('orderDetail.newStoreTip1Suffix')}
                </div>
                <div style={{ paddingLeft: 8 }}>
                  {t('orderDetail.newStoreTip2')}<br />
                  {t('orderDetail.newStoreTip3')}<br />
                  {t('orderDetail.newStoreTip4', { count: 60 })}
                </div>
              </div>
            </div>
            <div style={{
              background: '#FFF1F0', border: '1px solid #FFA39E', borderRadius: 8,
              padding: 12, marginBottom: 12,
            }}>
              <div style={{ fontSize: 13, color: '#FF4D4F', fontWeight: 600 }}>
                ⚠️ {t('orderDetail.newStoreWarn')}
              </div>
            </div>
            <Descriptions column={1} size="small" labelStyle={{ color: '#8C8C8C' }} contentStyle={{ fontWeight: 500 }}>
              <Descriptions.Item label={t('orderDetail.orderNo')}>{order.orderNo}</Descriptions.Item>
              <Descriptions.Item label={t('orderDetail.remainingDays')}>
                <span style={{ color: '#E8720C', fontWeight: 600 }}>{t('orderDetail.daysUnit', { count: order.purchaseDays?.length || 0 })}</span>
              </Descriptions.Item>
            </Descriptions>
          </div>
        ) : trafficRefund ? (
          <div>
            {/* 投流廣告：按定價配置的計算公式退款（退還剩餘未消耗曝光價值 − 手續費） */}
            <div style={{
              background: '#FFF7E6', border: '1px solid #FFD591', borderRadius: 8,
              padding: 16, marginBottom: 16,
            }}>
              <div style={{ fontSize: 13, color: '#595959', lineHeight: 1.8 }}>
                投流廣告按曝光次數計費：已消耗曝光按實際單價扣除不予退還，剩餘未消耗曝光折算金額退還至推廣金餘額
                <br />
                · 發起退款後，該訂單立即停止投放
                <br />
                · 僅退還實付部分，贈送曝光（如有）不予退款
              </div>
            </div>
            <Descriptions column={1} size="small" labelStyle={{ color: '#8C8C8C' }} contentStyle={{ fontWeight: 500 }}>
              <Descriptions.Item label={t('orderDetail.orderNo')}>{order.orderNo}</Descriptions.Item>
              <Descriptions.Item label="購買曝光量">{trafficRefund.purchased.toLocaleString()} 次</Descriptions.Item>
              <Descriptions.Item label="已消耗曝光量">
                <span style={{ color: '#E8720C', fontWeight: 600 }}>{trafficRefund.consumed.toLocaleString()} 次</span>
              </Descriptions.Item>
              <Descriptions.Item label="剩餘未消耗曝光">
                <span style={{ color: '#52C41A', fontWeight: 600 }}>{trafficRefund.remaining.toLocaleString()} 次</span>
              </Descriptions.Item>
              <Descriptions.Item label="訂單實際單價">MOP {trafficRefund.unitPrice.toFixed(4)} / 次</Descriptions.Item>
              <Descriptions.Item label="退款手續費">
                {trafficRefund.feePercent}% · MOP {trafficRefund.feeAmount.toFixed(2)}
              </Descriptions.Item>
              <Descriptions.Item label={t('orderDetail.refundAmountLabel')}>
                <span style={{ color: '#52C41A', fontSize: 16, fontWeight: 700 }}>
                  MOP {trafficRefund.refundAmount.toFixed(2)}
                </span>
              </Descriptions.Item>
            </Descriptions>
            <div style={{ marginTop: 12, fontSize: 12, color: '#8C8C8C', background: '#FAFAFA', padding: '8px 12px', borderRadius: 6 }}>
              退款金額 = 剩餘未消耗曝光 {trafficRefund.remaining.toLocaleString()} × 實際單價 {trafficRefund.unitPrice.toFixed(4)} − 手續費 {trafficRefund.feePercent}% = MOP {trafficRefund.refundAmount.toFixed(2)}
              <br />（實際單價 = 實付金額 MOP {order.actualPrice} ÷ 購買曝光 {trafficRefund.purchased.toLocaleString()} 次）
            </div>
          </div>
        ) : payMode === 'gift' && refundInfo?.isPromoting ? (
          <div>
            <div style={{
              background: '#FFF1F0', border: '1px solid #FFA39E', borderRadius: 8,
              padding: 16, marginBottom: 16,
            }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: '#FF4D4F', marginBottom: 8 }}>
                {t('orderDetail.refundGiftZeroTitle')}
              </div>
              <div style={{ fontSize: 13, color: '#595959', lineHeight: 1.8 }}>
                {t('orderDetail.refundGiftPromotingTip')}
              </div>
            </div>
            <Descriptions column={1} size="small" labelStyle={{ color: '#8C8C8C' }} contentStyle={{ fontWeight: 500 }}>
              <Descriptions.Item label={t('orderDetail.orderNo')}>{order.orderNo}</Descriptions.Item>
              <Descriptions.Item label={t('orderDetail.giftDeductLabel')}>
                <span style={{ color: '#E8720C', fontWeight: 600 }}>{giftDays} {t('orderDetail.daysSuffix')}</span>
              </Descriptions.Item>
              <Descriptions.Item label={t('orderDetail.refundGiftDaysLabel')}><span style={{ color: '#FF4D4F', fontSize: 16, fontWeight: 700 }}>0 {t('orderDetail.daysSuffix')}</span></Descriptions.Item>
            </Descriptions>
          </div>
        ) : payMode === 'gift' ? (
          <div>
            <div style={{
              background: '#F6FFED', border: '1px solid #B7EB8F', borderRadius: 8,
              padding: 16, marginBottom: 16,
            }}>
              <div style={{ fontSize: 13, color: '#595959', lineHeight: 1.8 }}>
                {t('orderDetail.refundGiftDaysTip')}<strong style={{ color: '#52C41A' }}>{t('orderDetail.daysUnit', { count: refundInfo?.refundGiftDays ?? 0 })}</strong>
              </div>
            </div>
            <Descriptions column={1} size="small" labelStyle={{ color: '#8C8C8C' }} contentStyle={{ fontWeight: 500 }}>
              <Descriptions.Item label={t('orderDetail.orderNo')}>{order.orderNo}</Descriptions.Item>
              <Descriptions.Item label={t('orderDetail.giftDeductLabel')}>
                <span style={{ color: '#E8720C', fontWeight: 600 }}>{giftDays} {t('orderDetail.daysSuffix')}</span>
              </Descriptions.Item>
              <Descriptions.Item label={t('orderDetail.feePercentLabel')}>{refundInfo?.feePercent ?? 0}%</Descriptions.Item>
              <Descriptions.Item label={t('orderDetail.refundGiftDaysLabel')}>
                <span style={{ color: '#52C41A', fontSize: 16, fontWeight: 700 }}>
                  {refundInfo?.refundGiftDays ?? 0} {t('orderDetail.daysSuffix')}
                </span>
              </Descriptions.Item>
            </Descriptions>
            <div style={{ marginTop: 12, fontSize: 12, color: '#8C8C8C', background: '#FAFAFA', padding: '8px 12px', borderRadius: 6 }}>
              {t('orderDetail.refundGiftFormula', { total: giftDays, percent: refundInfo?.feePercent ?? 0, days: refundInfo?.refundGiftDays ?? 0 })}
            </div>
          </div>
        ) : refundInfo?.isPromoting ? (
          <div>
            <div style={{
              background: '#FFF1F0', border: '1px solid #FFA39E', borderRadius: 8,
              padding: 16, marginBottom: 16,
            }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: '#FF4D4F', marginBottom: 8 }}>
                {t('orderDetail.refundZeroTitle')}
              </div>
              <div style={{ fontSize: 13, color: '#595959', lineHeight: 1.8 }}>
                {t('orderDetail.refundPromotingTip1')}<strong style={{ color: '#FF4D4F' }}>{t('orderDetail.refundPromotingTip1Strong')}</strong>{t('orderDetail.refundPromotingTip2')}
                <br />
                <strong>{t('orderDetail.refundPromotingTip3')}</strong>
              </div>
            </div>
            <Descriptions column={1} size="small" labelStyle={{ color: '#8C8C8C' }} contentStyle={{ fontWeight: 500 }}>
              <Descriptions.Item label={t('orderDetail.orderNo')}>{order.orderNo}</Descriptions.Item>
              <Descriptions.Item label={t('orderDetail.paidAmount')}>MOP {order.actualPrice}</Descriptions.Item>
              <Descriptions.Item label={t('orderDetail.refundAmountLabel')}><span style={{ color: '#FF4D4F', fontSize: 16, fontWeight: 700 }}>MOP 0</span></Descriptions.Item>
            </Descriptions>
          </div>
        ) : (
          <div>
            <div style={{
              background: '#FFF7E6', border: '1px solid #FFD591', borderRadius: 8,
              padding: 16, marginBottom: 16,
            }}>
              <div style={{ fontSize: 13, color: '#595959', lineHeight: 1.8 }}>
                {t('orderDetail.refundPendingTip1')}<strong style={{ color: '#E8720C' }}>{t('orderDetail.daysUnit', { count: refundInfo?.daysBefore ?? 0 })}</strong>{t('orderDetail.refundPendingTip2', { percent: refundInfo?.feePercent ?? 0 })}
              </div>
            </div>
            <Descriptions column={1} size="small" labelStyle={{ color: '#8C8C8C' }} contentStyle={{ fontWeight: 500 }}>
              <Descriptions.Item label={t('orderDetail.orderNo')}>{order.orderNo}</Descriptions.Item>
              <Descriptions.Item label={t('orderDetail.paidAmount')}>MOP {order.actualPrice}</Descriptions.Item>
              <Descriptions.Item label={t('orderDetail.feePercentLabel')}>{refundInfo?.feePercent ?? 0}%</Descriptions.Item>
              <Descriptions.Item label={t('orderDetail.refundAmountLabel')}>
                <span style={{ color: '#52C41A', fontSize: 16, fontWeight: 700 }}>
                  MOP {refundInfo?.refundAmount ?? 0}
                </span>
              </Descriptions.Item>
              {payMode === 'mixed' && (
                <Descriptions.Item label={t('orderDetail.refundGiftDaysLabel')}>
                  <span style={{ color: '#E8720C', fontSize: 16, fontWeight: 700 }}>
                    {refundInfo?.refundGiftDays ?? 0} {t('orderDetail.daysSuffix')}
                  </span>
                </Descriptions.Item>
              )}
            </Descriptions>
            <div style={{ marginTop: 12, fontSize: 12, color: '#8C8C8C', background: '#FAFAFA', padding: '8px 12px', borderRadius: 6 }}>
              {t('orderDetail.refundFormula2', { paid: order.actualPrice, percent: refundInfo?.feePercent ?? 0, amount: refundInfo?.refundAmount ?? 0 })}
              {payMode === 'mixed' && (
                <> <br />{t('orderDetail.refundGiftFormula', { total: giftDays, percent: refundInfo?.feePercent ?? 0, days: refundInfo?.refundGiftDays ?? 0 })}</>
              )}
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
