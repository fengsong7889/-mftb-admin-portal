import { useState, useMemo, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Table, Tag, Space, Select, Input, Button, Form, DatePicker, message, Popover, TreeSelect } from 'antd'
const { RangePicker } = DatePicker
import { SearchOutlined, ExportOutlined, ArrowLeftOutlined, ShoppingCartOutlined } from '@ant-design/icons'
import type { ColumnsType } from 'antd/es/table'
import BrandTag from '../../components/BrandTag'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useColumnConfig } from '../../hooks/useColumnConfig'
import dayjs from 'dayjs'

// 订单状态枚举
enum OrderStatus {
  PENDING_PROMOTION = 1,
  PROMOTING = 2,
  PROMOTED = 3,
  CANCELLED = 4,
  ABORTED = 5,
  REFUNDED = 6,
}

import { BRAND_SHANFENG_LABEL } from '../../constants/brand'
import { AlgorithmType } from '../Recommend/constants'
import { fetchAdOrders, brandToAppType, MEAL_SLOT_TIME_LABEL, type AdOrder } from '../../api/adPromotion'

// 品牌枚举
enum AppType {
  SHANFENG = 1,
  MFOOD = 2,
}

// 业务频道枚举
enum RecommendChannel {
  DELIVERY = 2,
  GROUP_BUY = 3,
  SUPERMARKET = 4,
}

// 商圈枚举（与地圖規劃商圈数据一致）
enum Region {
  KOKSAA = 1,         // 黑沙環區
  COSTA = 2,          // 高士德區
  SANMA = 3,          // 新馬路區
  SANWONG = 4,        // 新皇朝區
  HKM = 5,            // 港珠澳區
  FAHUA = 6,          // 花城市區
  AIRPORT = 7,        // 北安機場
  LHOTEL = 8,         // 左酒店區
  RHOTEL = 9,         // 右酒店區
  UM = 10,            // 澳大專區
  HACS = 11,          // 黑沙灘區
}

// 推荐类型枚举（统一引用 AlgorithmType，避免重复定义导致枚举值不一致）
type RecommendType = AlgorithmType
const RecommendType = AlgorithmType

// 推薦類型中文名（URL 參數協議：AdSales 跳轉時傳入中文名，與語言無關）
const RECOMMEND_TYPE_LABEL: Partial<Record<RecommendType, string>> = {
  [RecommendType.INVINCIBLE_STAR]: '無敵星星',
  [RecommendType.HOT_REVIVE_AD]: '盤活復蘇',
  [RecommendType.NEW_STORE_AD]: '新店廣告',
  [RecommendType.TRAFFIC_AD]: '流量廣告',
  [RecommendType.POPULAR_MERCHANT_KA]: '人氣商家',
}

const RECOMMEND_TYPE_ICON: Partial<Record<RecommendType, string>> = {
  [RecommendType.INVINCIBLE_STAR]: '⭐',
  [RecommendType.HOT_REVIVE_AD]: '🔥',
  [RecommendType.NEW_STORE_AD]: '🏪',
  [RecommendType.TRAFFIC_AD]: '📊',
  [RecommendType.POPULAR_MERCHANT_KA]: '🏆',
}

const _RECOMMEND_TYPE_COLOR: Partial<Record<RecommendType, string>> = {
  [RecommendType.INVINCIBLE_STAR]: 'gold',
  [RecommendType.HOT_REVIVE_AD]: 'green',
  [RecommendType.NEW_STORE_AD]: 'blue',
  [RecommendType.TRAFFIC_AD]: 'purple',
  [RecommendType.POPULAR_MERCHANT_KA]: 'geekblue',
}

// 下单人类型枚举
enum OrderOperatorType {
  MERCHANT = 1,  // 商家
  STAFF = 2,     // 业务人员
}

// 订单接口定义
interface OrderItem {
  id: string
  orderNo: string
  algorithmId: string         // 算法ID
  promotionName: string       // 算法名称
  app: AppType
  channel: RecommendChannel
  region: Region | Region[]  // 所屬商圈（無敵星星可能有多個）
  recommendType: RecommendType
  slotPosition: number
  groupId: string             // 集團ID
  groupName: string           // 集團名稱
  storeId: string             // 門店ID
  storeName: string           // 門店名稱
  mealSlots: string[]       // 無敵星星：購買時段
  purchaseDays?: string[]    // 盤活復蘇/人氣商家：購買日期列表
  skinName?: string          // 人氣商家：皮膚套件名稱
  purchaseDate: string
  originalPrice: number
  discountPrice: number
  actualPrice: number
  status: OrderStatus
  orderTime: string
  payTime?: string
  refundAmount?: number       // 退款推廣金額
  refundTime?: string         // 退款時間
  refundOperatorType?: OrderOperatorType  // 退款人類型
  refundOperatorId?: string   // 退款人ID
  refundOperatorName?: string // 退款人姓名
  cancelTime?: string         // 取消/中止時間
  cancelOperatorId?: string   // 取消/中止人工號
  cancelOperatorName?: string // 取消/中止人姓名
  operatorType?: OrderOperatorType  // 下單人類型
  operatorId?: string         // 下單人ID（商家=門店ID，業務人員=工號）
  operatorName?: string       // 下單人姓名
  /** 数据来源：api=後端真實數據 mock=演示數據 */
  source?: 'api' | 'mock'
}

/** 後端訂單 → 列表行（無敵星星真實數據） */
function toOrderItem(vo: AdOrder): OrderItem {
  const channelMap: Record<number, RecommendChannel> = {
    2: RecommendChannel.DELIVERY,
    3: RecommendChannel.SUPERMARKET,
    4: RecommendChannel.GROUP_BUY,
  }
  // 後端狀態: 1=待推廣 2=推廣中 3=已推廣 4=已退款 5=已取消 → 前端枚舉
  const statusMap: Record<number, OrderStatus> = {
    1: OrderStatus.PENDING_PROMOTION,
    2: OrderStatus.PROMOTING,
    3: OrderStatus.PROMOTED,
    4: OrderStatus.REFUNDED,
    5: OrderStatus.CANCELLED,
  }
  // 後端 LocalDateTime 統一序列化為毫秒時間戳，兼容字符串/數字兩種格式
  const fmt = (t?: string | number) => {
    if (t == null || t === '') return ''
    if (typeof t === 'number') return dayjs(t).format('YYYY-MM-DD HH:mm:ss')
    return String(t).replace('T', ' ').slice(0, 19)
  }
  // 所屬商圈: 後端由訂單明細去重聚合返回
  const regions = (vo.regions || []).map(r => r as Region)
  // 購買時段: 餐段 key → 中文名稱（早餐/午餐/下午茶/晚餐/宵夜）
  const MEAL_SLOT_CN: Record<string, string> = {
    breakfast: '早餐', lunch: '午餐', afternoon: '下午茶', dinner: '晚餐', supper: '宵夜',
  }
  const mealSlots = (vo.mealSlots || []).map(s => MEAL_SLOT_CN[s] || MEAL_SLOT_TIME_LABEL[s] || s)
  // 購買日期: 無敵星星和按天售賣類型均傳遞日期列表，用於列表頁展示
  const hasNoMealSlots = (vo.mealSlots || []).length === 0
  const isDayBasedType = vo.algoType === 2 || vo.algoType === 3 || vo.algoType === 5
  const isStarType = vo.algoType === 1
  const purchaseDays = (isDayBasedType && hasNoMealSlots) || isStarType
    ? ((vo.purchaseDays && vo.purchaseDays.length > 0)
        ? vo.purchaseDays
        : isDayBasedType ? Array.from({ length: vo.itemCount || 0 }, () => '') : undefined)
    : undefined
  return {
    id: vo.orderNo,
    orderNo: vo.orderNo,
    algorithmId: vo.algoCode || String(vo.algoId),
    promotionName: vo.algoName,
    app: (brandToAppType(vo.brand) ?? AppType.SHANFENG) as AppType,
    channel: channelMap[vo.channel ?? 2] ?? RecommendChannel.DELIVERY,
    region: regions.length === 1 ? regions[0] : regions,
    recommendType: vo.algoType as RecommendType,
    slotPosition: 0,
    groupId: vo.groupCode,
    groupName: vo.groupName || '-',
    storeId: vo.storeCode || '-',
    storeName: vo.storeName || '-',
    mealSlots,
    purchaseDays,
    purchaseDate: fmt(vo.orderTime).slice(0, 10),
    originalPrice: vo.originalAmount,
    discountPrice: vo.originalAmount - vo.discountAmount,
    actualPrice: vo.actualAmount,
    status: statusMap[vo.status] ?? OrderStatus.PENDING_PROMOTION,
    orderTime: fmt(vo.orderTime),
    payTime: vo.payTime ? fmt(vo.payTime) : undefined,
    refundAmount: vo.refundAmount || undefined,
    operatorType: vo.operatorType as OrderOperatorType | undefined,
    operatorId: vo.operatorId,
    operatorName: vo.operatorName,
    source: 'api',
  }
}

export default function PromotionOrderManage() {
  const navigate = useNavigate()
  const { t } = useTranslation()
  const [searchParams] = useSearchParams()
  const orderType = searchParams.get('type') || ''
  // 来源标识：从「廣告銷售」(ad-sales) 进入则返回广告销售，否则返回「店鋪推廣」
  const fromSource = searchParams.get('from') || ''
  const backPath = fromSource === 'ad-sales' ? '/ad-sales' : '/promotion-sales-config'

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
  const regionLabel = (v: Region) => {
    const map: Record<number, string> = {
      [Region.KOKSAA]: t('promotionOrderManage.regionKoksaa'),
      [Region.COSTA]: t('promotionOrderManage.regionCosta'),
      [Region.SANMA]: t('promotionOrderManage.regionSanma'),
      [Region.SANWONG]: t('promotionOrderManage.regionSanwong'),
      [Region.HKM]: t('promotionOrderManage.regionHkm'),
      [Region.FAHUA]: t('promotionOrderManage.regionFahua'),
      [Region.AIRPORT]: t('promotionOrderManage.regionAirport'),
      [Region.LHOTEL]: t('promotionOrderManage.regionLhotel'),
      [Region.RHOTEL]: t('promotionOrderManage.regionRhotel'),
      [Region.UM]: t('promotionOrderManage.regionUm'),
      [Region.HACS]: t('promotionOrderManage.regionHacs'),
    }
    return map[v] || String(v)
  }
  const recommendTypeLabel = (v: RecommendType) => {
    const map: Partial<Record<RecommendType, string>> = {
      [RecommendType.INVINCIBLE_STAR]: t('promotionReport.recTypeInvincibleStar'),
      [RecommendType.HOT_REVIVE_AD]: t('promotionReport.recTypeHotRevive'),
      [RecommendType.NEW_STORE_AD]: t('promotionReport.recTypeNewStore'),
      [RecommendType.TRAFFIC_AD]: t('promotionReport.recTypeTraffic'),
      [RecommendType.POPULAR_MERCHANT_KA]: t('promotionOrderManage.recTypePopular'),
    }
    return map[v] || String(v)
  }

  // 商圈樹形數據（title 依賴 t，定義在組件內）
  const regionTreeData = [
    {
      value: 'macau_area',
      title: t('promotionOrderManage.areaMacau'),
      selectable: true,
      children: [
        { value: Region.KOKSAA, title: t('promotionOrderManage.regionKoksaa') },
        { value: Region.COSTA, title: t('promotionOrderManage.regionCosta') },
        { value: Region.SANMA, title: t('promotionOrderManage.regionSanma') },
        { value: Region.SANWONG, title: t('promotionOrderManage.regionSanwong') },
        { value: Region.HKM, title: t('promotionOrderManage.regionHkm') },
      ],
    },
    {
      value: 'taipa_area',
      title: t('promotionOrderManage.areaTaipa'),
      selectable: true,
      children: [
        { value: Region.FAHUA, title: t('promotionOrderManage.regionFahua') },
        { value: Region.AIRPORT, title: t('promotionOrderManage.regionAirport') },
        { value: Region.LHOTEL, title: t('promotionOrderManage.regionLhotel') },
        { value: Region.RHOTEL, title: t('promotionOrderManage.regionRhotel') },
        { value: Region.UM, title: t('promotionOrderManage.regionUm') },
        { value: Region.HACS, title: t('promotionOrderManage.regionHacs') },
      ],
    },
  ]

  // URL 參數為中文類型名（AdSales 傳入），反查枚舉值用於過濾
  const orderTypeKey = useMemo(() => {
    const entry = Object.entries(RECOMMEND_TYPE_LABEL).find(([, label]) => label === orderType)
    return entry ? (Number(entry[0]) as RecommendType) : undefined
  }, [orderType])

  // 訂單數據：直接調用後端 API
  const [orders, setOrders] = useState<OrderItem[]>([])
  useEffect(() => {
    const loadOrders = () => {
      fetchAdOrders({ page: 1, size: 200 })
        .then(res => {
          const rows = (res.records ?? []).map(toOrderItem)
          setOrders(rows)
        })
        .catch(() => {})
    }
    loadOrders()
  }, [])

  const [filters, setFilters] = useState({
    orderNo: '',
    app: undefined as AppType | undefined,
    channel: undefined as RecommendChannel | undefined,
    groupInfo: undefined as string | undefined,
    storeInfo: undefined as string | undefined,
    algorithmKeyword: '',  // 算法名称/ID搜索关键字
    region: undefined as Region | undefined,
    status: undefined as OrderStatus | undefined,
    orderTimeRange: undefined as [string, string] | undefined,
    promoTimeRange: undefined as [string, string] | undefined,
    refundTimeRange: undefined as [string, string] | undefined,
    operatorKeyword: '',   // 下单人搜索关键字
    refundOperatorKeyword: '', // 退款人搜索关键字
    cancelOperatorKeyword: '', // 取消人搜索关键字
  })

  // 根据 orderType 过滤对应类型的订单
  const filteredOrders = useMemo(() => {
    return orders.filter(order => {
      // 按URL参数中的订单类型过滤
      if (orderTypeKey !== undefined && order.recommendType !== orderTypeKey) {
        return false
      }
      if (filters.orderNo && !order.orderNo.includes(filters.orderNo)) {
        return false
      }
      if (filters.app !== undefined && order.app !== filters.app) {
        return false
      }
      if (filters.channel !== undefined && order.channel !== filters.channel) {
        return false
      }
      if (filters.groupInfo) {
        if (order.groupId !== filters.groupInfo) {
          return false
        }
      }
      if (filters.storeInfo) {
        if (order.storeId !== filters.storeInfo) {
          return false
        }
      }
      if (filters.algorithmKeyword) {
        const kw = filters.algorithmKeyword.toLowerCase()
        const matchId = order.algorithmId.toLowerCase().includes(kw)
        const matchName = order.promotionName.toLowerCase().includes(kw)
        if (!matchId && !matchName) return false
      }
      if (filters.region !== undefined) {
        const orderRegions = Array.isArray(order.region) ? order.region : [order.region]
        if (!orderRegions.includes(filters.region)) return false
      }
      if (filters.status !== undefined && order.status !== filters.status) {
        return false
      }
      if (filters.operatorKeyword) {
        const kw = filters.operatorKeyword.toLowerCase()
        const matchId = (order.operatorId || '').toLowerCase().includes(kw)
        const matchName = (order.operatorName || '').toLowerCase().includes(kw)
        if (!matchId && !matchName) return false
      }
      if (filters.refundOperatorKeyword) {
        const kw = filters.refundOperatorKeyword.toLowerCase()
        const matchId = (order.refundOperatorId || '').toLowerCase().includes(kw)
        const matchName = (order.refundOperatorName || '').toLowerCase().includes(kw)
        if (!matchId && !matchName) return false
      }
      if (filters.cancelOperatorKeyword) {
        const kw = filters.cancelOperatorKeyword.toLowerCase()
        const matchId = (order.cancelOperatorId || '').toLowerCase().includes(kw)
        const matchName = (order.cancelOperatorName || '').toLowerCase().includes(kw)
        if (!matchId && !matchName) return false
      }
      return true
    })
  }, [filters, orderType, orders])

  // 列配置元数据
  const columnMeta = useMemo(() => [
    { key: 'orderNo', title: t('promotionOrderManage.colOrderNo') },
    { key: 'groupInfo', title: t('promotionOrderManage.colGroupInfo') },
    { key: 'storeInfo', title: t('promotionOrderManage.colStoreInfo') },
    { key: 'algorithmInfo', title: t('promotionOrderManage.colAlgorithmInfo') },
    { key: 'app', title: t('common.colBrand') },
    { key: 'channel', title: t('common.colChannel') },
    { key: 'region', title: t('promotionOrderManage.colRegion') },
    { key: 'purchaseContent', title: orderType === '無敵星星' ? t('promotionOrderManage.purchaseSlots') : (orderType === '盤活復蘇' || orderType === '新店廣告') ? t('promotionOrderManage.colPromoDays') : orderType === '人氣商家' ? t('promotionOrderManage.colSkinDays') : t('promotionOrderManage.purchaseContent') },
    ...(orderType !== '新店廣告' ? [
      { key: 'originalPrice', title: t('promotionOrderManage.colOrderAmount') },
      { key: 'discount', title: t('promotionOrderManage.colDiscount') },
      { key: 'actualPrice', title: t('promotionOrderManage.colActualPay') },
    ] : []),
    { key: 'status', title: t('promotionOrderManage.colOrderStatus') },
    ...(orderType === '新店廣告' ? [
      { key: 'cancelOperator', title: t('promotionOrderManage.colCancelOperator') },
      { key: 'cancelTime', title: t('promotionOrderManage.colCancelTime') },
    ] : orderType === '人氣商家' ? [
      { key: 'refundOperator', title: t('promotionOrderManage.colRefundOperator') },
      { key: 'refundTime', title: t('promotionOrderManage.colRefundTime') },
    ] : [
      { key: 'refundAmount', title: t('promotionOrderManage.colRefundAmount') },
      { key: 'refundOperator', title: t('promotionOrderManage.colRefundOperator') },
      { key: 'refundTime', title: t('promotionOrderManage.colRefundTime') },
    ]),
    { key: 'operator', title: t('promotionOrderManage.colOperator') },
    { key: 'orderTime', title: t('promotionOrderManage.colOrderTime') },
    { key: 'action', title: t('common.colAction') },
  ], [orderType, t])

  const { configComponent, applyConfig } = useColumnConfig('promotion-order-manage-standalone', columnMeta, [
    { key: 'orderNo', visible: true, locked: 'head' as const },
    { key: 'action', visible: true, locked: 'tail' as const },
  ])

  // 表格列定义
  const columns: ColumnsType<OrderItem> = [
    {
      title: t('promotionOrderManage.colOrderNo'),
      dataIndex: 'orderNo',
      key: 'orderNo',
      width: 180,
      fixed: 'left',
    },
    {
      title: t('promotionOrderManage.colGroupInfo'),
      key: 'groupInfo',
      width: 180,
      render: (_, record) => (
        <Space direction="vertical" size={0}>
          <span style={{ fontSize: 12, color: '#8C8C8C' }}>{record.groupId}</span>
          <span>{record.groupName}</span>
        </Space>
      ),
    },
    {
      title: t('promotionOrderManage.colStoreInfo'),
      key: 'storeInfo',
      width: 180,
      render: (_, record) => (
        <Space direction="vertical" size={0}>
          <span style={{ fontSize: 12, color: '#8C8C8C' }}>{record.storeId}</span>
          <span>{record.storeName}</span>
        </Space>
      ),
    },
    {
      title: t('promotionOrderManage.colAlgorithmInfo'),
      key: 'algorithmInfo',
      width: 180,
      render: (_, record) => (
        <Space direction="vertical" size={0}>
          <span style={{ fontSize: 12, color: '#8C8C8C' }}>{record.algorithmId}</span>
          <span>{record.promotionName}</span>
        </Space>
      ),
    },
    {
      title: t('common.colBrand'),
      dataIndex: 'app',
      key: 'app',
      width: 100,
      render: (app: AppType) => (
        <BrandTag value={app} />
      ),
    },
    {
      title: t('common.colChannel'),
      dataIndex: 'channel',
      key: 'channel',
      width: 120,
      render: (channel: RecommendChannel) => channelLabel(channel),
    },
    {
      title: t('promotionOrderManage.colRegion'),
      dataIndex: 'region',
      key: 'region',
      width: 220,
      render: (region: Region | Region[]) => {
        const regions = Array.isArray(region) ? region : [region]
        const maxShow = 2
        const visibleRegions = regions.slice(0, maxShow)
        const hiddenRegions = regions.slice(maxShow)
        const hasMore = hiddenRegions.length > 0

        const allContent = (
          <Space direction="vertical" size={4}>
            {regions.map((r, index) => (
              <Tag key={index} color="blue" style={{ margin: 0 }}>
                {regionLabel(r)}
              </Tag>
            ))}
          </Space>
        )

        return (
          <Space direction="vertical" size={2}>
            {visibleRegions.map((r, index) => (
              <Tag key={index} color="blue" style={{ margin: 0 }}>
                {regionLabel(r)}
              </Tag>
            ))}
            {hasMore && (
              <Popover
                content={allContent}
                title={t('promotionOrderManage.allRegions')}
                trigger="click"
                placement="bottomLeft"
              >
                <Button type="link" size="small" style={{ padding: 0, height: 'auto', fontSize: 12 }}>
                  {t('promotionOrderManage.moreLabel', { count: hiddenRegions.length })}
                </Button>
              </Popover>
            )}
          </Space>
        )
      },
    },
    {
      title: orderType === '無敵星星' ? t('promotionOrderManage.purchaseSlots') : (orderType === '盤活復蘇' || orderType === '新店廣告') ? t('promotionOrderManage.colPromoDays') : orderType === '人氣商家' ? t('promotionOrderManage.colSkinDays') : t('promotionOrderManage.purchaseContent'),
      key: 'purchaseContent',
      width: 220,
      render: (_, record) => {
        if (orderType === '盤活復蘇' || orderType === '新店廣告' || orderType === '人氣商家' || record.recommendType === RecommendType.HOT_REVIVE_AD || record.recommendType === RecommendType.NEW_STORE_AD || record.recommendType === RecommendType.POPULAR_MERCHANT_KA) {
          // 盤活復蘇/人氣商家：展示天數（人氣商家額外展示皮膚套件），點擊弹窗查看具體日期
          if (record.purchaseDays && record.purchaseDays.length > 0) {
            const days = record.purchaseDays.length

            const dateContent = (
              <Space direction="vertical" size={4}>
                {record.purchaseDays.some(d => !!d) ? record.purchaseDays.map((date, index) => (
                  <Tag key={index} color="green" style={{ margin: 0 }}>
                    {date}
                  </Tag>
                )) : <span style={{ fontSize: 12, color: '#8c8c8c' }}>{t('promotionOrderManage.viewDatesTip')}</span>}
              </Space>
            )

            return (
              <Popover
                content={dateContent}
                title={t('promotionOrderManage.dateDetailTitle')}
                trigger="click"
                placement="bottomLeft"
              >
                <Space size={4} style={{ cursor: 'pointer' }}>
                  {record.skinName && <Tag color="geekblue" style={{ margin: 0 }}>{record.skinName}</Tag>}
                  <Tag color="green" style={{ margin: 0 }}>{t('promotionOrderManage.daysUnit', { count: days })}</Tag>
                  <Button type="link" size="small" style={{ padding: 0, height: 'auto', fontSize: 12, color: '#1890ff' }}>
                    {t('promotionOrderManage.view')}
                  </Button>
                </Space>
              </Popover>
            )
          }
          return <span style={{ color: '#bfbfbf' }}>-</span>
        }
        // 無敵星星：展示日期 + 時段，最多2個時段，超出顯示弹窗
        if (record.mealSlots && record.mealSlots.length > 0) {
          const maxShow = 2
          const visibleSlots = record.mealSlots.slice(0, maxShow)
          const hiddenSlots = record.mealSlots.slice(maxShow)
          const hasMore = hiddenSlots.length > 0
          // 日期展示：如果有購買日期列表，展示日期範圍
          const hasDates = record.purchaseDays && record.purchaseDays.length > 0 && record.purchaseDays.some(d => !!d)
          const firstDate = hasDates ? record.purchaseDays![0] : null
          const lastDate = hasDates ? record.purchaseDays![record.purchaseDays!.length - 1] : null
          const dateRangeText = firstDate && lastDate
            ? (firstDate === lastDate ? firstDate.slice(5) : `${firstDate.slice(5)} ~ ${lastDate.slice(5)}`)
            : null

          const slotContent = (
            <Space direction="vertical" size={4}>
              {record.mealSlots.map((slot, index) => (
                <Tag key={index} color="blue" style={{ margin: 0 }}>
                  {slot}
                </Tag>
              ))}
            </Space>
          )

          return (
            <Space direction="vertical" size={2}>
              {dateRangeText && (
                <span style={{ fontSize: 12, color: '#595959' }}>{dateRangeText}</span>
              )}
              {visibleSlots.map((slot, index) => (
                <Tag key={index} color="blue" style={{ margin: 0 }}>
                  {slot}
                </Tag>
              ))}
              {hasMore && (
                <Popover
                  content={slotContent}
                  title={t('promotionOrderManage.allSlots')}
                  trigger="click"
                  placement="bottomLeft"
                >
                  <Button type="link" size="small" style={{ padding: 0, height: 'auto', fontSize: 12 }}>
                    {t('promotionOrderManage.moreLabel', { count: hiddenSlots.length })}
                  </Button>
                </Popover>
              )}
            </Space>
          )
        }
        return <span style={{ color: '#bfbfbf' }}>-</span>
      },
    },
    // 新店廣告：無金額字段，跳過
    ...(orderType !== '新店廣告' ? [{
      title: t('promotionOrderManage.colOrderAmount'),
      dataIndex: 'originalPrice',
      key: 'originalPrice',
      width: 120,
      render: (price: number) => `$${price}`,
    },
    {
      title: t('promotionOrderManage.colDiscount'),
      key: 'discount',
      width: 120,
      render: (_: unknown, record: OrderItem) => (
        <span style={{ color: '#fa8c16' }}>
          -${record.originalPrice - record.actualPrice}
        </span>
      ),
    },
    {
      title: t('promotionOrderManage.colActualPay'),
      dataIndex: 'actualPrice',
      key: 'actualPrice',
      width: 120,
      render: (price: number) => (
        <span style={{ color: '#ff4d4f', fontWeight: 600 }}>${price}</span>
      ),
    }
    ] : []),
    {
      title: t('promotionOrderManage.colOrderStatus'),
      dataIndex: 'status',
      key: 'status',
      width: 100,
      render: (status: OrderStatus, record: OrderItem) => {
        // 盤活復蘇/無敵星星/人氣商家：已取消/已中止 顯示為已退款；新店廣告保留已取消
        const keepCancelDisplay = record.recommendType === RecommendType.NEW_STORE_AD
        let displayStatus = status
        if (!keepCancelDisplay && (status === OrderStatus.CANCELLED || status === OrderStatus.ABORTED)) {
          displayStatus = OrderStatus.REFUNDED
        }
        const { label, color } = statusLabel(displayStatus)
        return <Tag color={color}>{label}</Tag>
      },
    },
    // 退款推廣金額 - 僅無敵星星和盤活復蘇顯示，放在訂單狀態後面
    ...(orderType !== '新店廣告' && orderType !== '人氣商家' ? [{
      title: t('promotionOrderManage.colRefundAmount'),
      dataIndex: 'refundAmount',
      key: 'refundAmount',
      width: 120,
      render: (amount: number | undefined) => {
        if (amount === undefined || amount === null) return <span style={{ color: '#bfbfbf' }}>-</span>
        return <span style={{ color: '#ff4d4f', fontWeight: 600 }}>${amount}</span>
      },
    }] : []),
    // 退款人 - 無敵星星/盤活復蘇/人氣商家顯示
    ...(orderType !== '新店廣告' ? [{
      title: t('promotionOrderManage.colRefundOperator'),
      key: 'refundOperator',
      width: 160,
      render: (_: unknown, record: OrderItem) => {
        if (!record.refundOperatorId) return <span style={{ color: '#bfbfbf' }}>-</span>
        return (
          <Space direction="vertical" size={0}>
            <span style={{ fontSize: 12, color: '#8C8C8C' }}>{record.refundOperatorId}</span>
            <span>{record.refundOperatorName}</span>
          </Space>
        )
      },
    }] : []),
    // 退款時間 - 無敵星星/盤活復蘇/人氣商家顯示
    ...(orderType !== '新店廣告' ? [{
      title: t('promotionOrderManage.colRefundTime'),
      dataIndex: 'refundTime',
      key: 'refundTime',
      width: 160,
      render: (time: string | undefined) => time || <span style={{ color: '#bfbfbf' }}>-</span>,
    }] : []),
    // 取消人 - 僅新店廣告顯示
    ...(orderType === '新店廣告' ? [{
      title: t('promotionOrderManage.colCancelOperator'),
      key: 'cancelOperator',
      width: 160,
      render: (_: unknown, record: OrderItem) => {
        if (!record.cancelOperatorId) return <span style={{ color: '#bfbfbf' }}>-</span>
        return (
          <Space direction="vertical" size={0}>
            <span style={{ fontSize: 12, color: '#8C8C8C' }}>{record.cancelOperatorId}</span>
            <span>{record.cancelOperatorName}</span>
          </Space>
        )
      },
    },
    {
      title: t('promotionOrderManage.colCancelTime'),
      dataIndex: 'cancelTime',
      key: 'cancelTime',
      width: 160,
      render: (time: string | undefined) => time || <span style={{ color: '#bfbfbf' }}>-</span>,
    }] : []),
    {
      title: t('promotionOrderManage.colOperator'),
      key: 'operator',
      width: 160,
      render: (_: unknown, record: OrderItem) => {
        if (!record.operatorType || !record.operatorId) return <span style={{ color: '#bfbfbf' }}>-</span>
        return (
          <Space direction="vertical" size={0}>
            <span style={{ fontSize: 12, color: '#8C8C8C' }}>{record.operatorId}</span>
            <span>{record.operatorName}</span>
          </Space>
        )
      },
    },
    {
      title: t('promotionOrderManage.colOrderTime'),
      dataIndex: 'orderTime',
      key: 'orderTime',
      width: 160,
    },
    {
      title: t('common.colAction'),
      key: 'action',
      width: 100,
      fixed: 'right',
      render: (_, record) => (
        <Button 
          type="link" 
          size="small"
          onClick={() => navigate(`/order-detail?id=${record.id}&type=${encodeURIComponent(orderType)}${fromSource ? `&from=${encodeURIComponent(fromSource)}` : ''}`)}
        >
          {t('promotionOrderManage.detail')}
        </Button>
      ),
    },
  ]

  // 重置筛选
  const handleReset = () => {
    setFilters({
      orderNo: '',
      app: undefined,
      channel: undefined,
      groupInfo: undefined,
      storeInfo: undefined,
      algorithmKeyword: '',
      region: undefined,
      status: undefined,
      orderTimeRange: undefined,
      promoTimeRange: undefined,
      refundTimeRange: undefined,
      operatorKeyword: '',
      refundOperatorKeyword: '',
      cancelOperatorKeyword: '',
    })
  }

  // 新增订单
  const _handleAdd = () => {
    message.info(t('common.underDev'))
    // TODO: 实现新增订单逻辑
  }

  // 导出订单
  const handleExport = () => {
    message.success(t('common.exportSuccess'))
    // TODO: 实现导出逻辑
  }

  return (
    <div className="content-area">
      {/* 页面标题 */}
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
              onClick={() => navigate(backPath)}
              style={{
                backgroundColor: '#E8720C', borderColor: '#E8720C',
                borderRadius: 8, height: 36, padding: '0 16px',
                display: 'flex', alignItems: 'center', gap: 6,
                boxShadow: '0 2px 6px rgba(232,114,12,0.25)',
                transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
              }}>{t('common.back')}</Button>
            {/* 分隔线 */}
            <div style={{ width: 1, height: 20, background: '#E8E8E8' }} />
            {/* 标题区 */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#1890ff' }}>{t('promotionOrderManage.orderListTitle')}</h2>
              {orderType && (
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  padding: '3px 12px', background: '#FFF7E6',
                  border: '1px solid #FFD591', borderRadius: 4,
                  fontSize: 13, color: '#E8720C', fontWeight: 500,
                }}>
                  {orderTypeKey !== undefined && (
                    <span style={{ fontSize: 14 }}>{RECOMMEND_TYPE_ICON[orderTypeKey]}</span>
                  )}
                  {orderTypeKey !== undefined ? recommendTypeLabel(orderTypeKey) : orderType}
                </div>
              )}
            </div>
          </div>
          {/* 右侧：购买广告按钮 */}
          <Button type="primary" icon={<ShoppingCartOutlined />}
            onClick={() => navigate(`${backPath}?type=${encodeURIComponent(orderType)}`)}
            style={{
              backgroundColor: '#E8720C', borderColor: '#E8720C',
              borderRadius: 8, height: 36, padding: '0 18px',
              boxShadow: '0 2px 6px rgba(232,114,12,0.25)',
              transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
              display: 'flex', alignItems: 'center', gap: 6,
            }}>{t('promotionOrderManage.buyAd')}</Button>
        </div>
      </div>

      {/* 搜索区域 */}
      <div className="search-section">
        <Form layout="inline">
            <Form.Item label={t('promotionOrderManage.colOrderNo')}>
              <Input
                placeholder={t('promotionOrderManage.orderNoPlaceholder')}
                allowClear
                value={filters.orderNo}
                onChange={e => setFilters({ ...filters, orderNo: e.target.value })}
              />
            </Form.Item>
            <Form.Item label={t('common.colBrand')}>
              <Select
                placeholder={t('common.all')}
                allowClear
                value={filters.app}
                onChange={value => setFilters({ ...filters, app: value })}
                options={Object.values(AppType)
                  .filter(v => typeof v === 'number')
                  .map(app => ({
                    label: appLabel(app),
                    value: app,
                  }))}
              />
            </Form.Item>
            <Form.Item label={t('common.colChannel')}>
              <Select
                placeholder={t('common.all')}
                allowClear
                value={filters.channel}
                onChange={value => setFilters({ ...filters, channel: value })}
                options={Object.values(RecommendChannel)
                  .filter(v => typeof v === 'number')
                  .map(channel => ({
                    label: channelLabel(channel),
                    value: channel,
                  }))}
              />
            </Form.Item>
            <Form.Item label={t('promotionOrderManage.colGroupSearch')}>
              <Select
                showSearch
                allowClear
                placeholder={t('promotionOrderManage.placeholderIdName')}
                optionFilterProp="label"
                value={filters.groupInfo}
                onChange={val => setFilters({ ...filters, groupInfo: val })}
                options={[
                  { label: 'G10001 - 澳門美食集團', value: 'G10001' },
                  { label: 'G10002 - 閃蜂餐飲連鎖', value: 'G10002' },
                  { label: 'G10003 - 大灣區餐飲集團', value: 'G10003' },
                ]}
                style={{ width: '100%' }}
              />
            </Form.Item>
            <Form.Item label={t('promotionOrderManage.colStoreSearch')}>
              <Select
                showSearch
                allowClear
                placeholder={t('promotionOrderManage.placeholderIdName')}
                optionFilterProp="label"
                value={filters.storeInfo}
                onChange={val => setFilters({ ...filters, storeInfo: val })}
                options={[
                  { label: 'S20001 - 澳門總店', value: 'S20001' },
                  { label: 'S20002 - 氹仔分店', value: 'S20002' },
                  { label: 'S20003 - 珠海旗艦店', value: 'S20003' },
                  { label: 'S20004 - 黑沙環店', value: 'S20004' },
                  { label: 'S20005 - 新馬路店', value: 'S20005' },
                ]}
                style={{ width: '100%' }}
              />
            </Form.Item>
            <Form.Item label={t('promotionOrderManage.colAlgoName')}>
              <Select
                showSearch
                allowClear
                placeholder={t('promotionOrderManage.placeholderIdName')}
                value={filters.algorithmKeyword || undefined}
                onChange={value => setFilters({ ...filters, algorithmKeyword: value || '' })}
                filterOption={(input, option) => {
                  const keyword = input.toLowerCase()
                  const label = (option?.label ?? '').toString().toLowerCase()
                  const value = (option?.value ?? '').toString().toLowerCase()
                  return label.includes(keyword) || value.includes(keyword)
                }}
                options={orders
                  .filter(o => !orderType || RECOMMEND_TYPE_LABEL[o.recommendType] === orderType)
                  .reduce((acc, o) => {
                    if (!acc.find(item => item.value === o.algorithmId)) {
                      acc.push({ label: `${o.algorithmId} - ${o.promotionName}`, value: o.algorithmId })
                    }
                    return acc
                  }, [] as { label: string; value: string }[])
                }
              />
            </Form.Item>
            <Form.Item label={t('promotionOrderManage.colPromoRegion')}>
              <TreeSelect
                placeholder={t('common.all')}
                allowClear
                showSearch
                treeDefaultExpandAll
                treeNodeFilterProp="title"
                value={filters.region}
                onChange={value => setFilters({ ...filters, region: value })}
                treeData={regionTreeData}
                style={{ width: '100%' }}
              />
            </Form.Item>
            <Form.Item label={t('promotionOrderManage.colOrderStatus')}>
              <Select
                placeholder={t('common.all')}
                allowClear
                value={filters.status}
                onChange={value => setFilters({ ...filters, status: value })}
                options={Object.values(OrderStatus)
                  .filter(v => typeof v === 'number')
                  .filter(status => {
                    // 新店廣告：不顯示已退款
                    if (orderType === '新店廣告') {
                      return status !== OrderStatus.REFUNDED
                    }
                    // 人氣商家：不顯示已取消/已中止（付費購買顯示已退款）
                    if (orderType === '人氣商家') {
                      return status !== OrderStatus.CANCELLED && status !== OrderStatus.ABORTED
                    }
                    // 盤活復蘇/無敵星星：不顯示已取消/已中止
                    return status !== OrderStatus.CANCELLED && status !== OrderStatus.ABORTED
                  })
                  .map(status => ({
                    label: statusLabel(status as OrderStatus).label,
                    value: status,
                  }))}
              />
            </Form.Item>
            <Form.Item label={t('promotionOrderManage.colOrderTime')}>
              <RangePicker style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item label={t('promotionOrderManage.colPromoTime')}>
              <RangePicker style={{ width: '100%' }} />
            </Form.Item>
            {orderType !== '新店廣告' && (
              <>
                <Form.Item label={t('promotionOrderManage.colRefundOperator')}>
                  <Input
                    placeholder={t('promotionOrderManage.operatorIdNamePlaceholder')}
                    allowClear
                    value={filters.refundOperatorKeyword}
                    onChange={e => setFilters({ ...filters, refundOperatorKeyword: e.target.value })}
                  />
                </Form.Item>
                <Form.Item label={t('promotionOrderManage.colRefundTime')}>
                  <RangePicker style={{ width: '100%' }} />
                </Form.Item>
              </>
            )}
            {orderType === '人氣商家' && (
              <>
                <Form.Item label={t('promotionOrderManage.colRefundOperator')}>
                  <Input
                    placeholder={t('promotionOrderManage.operatorNamePlaceholder')}
                    allowClear
                    value={filters.refundOperatorKeyword}
                    onChange={e => setFilters({ ...filters, refundOperatorKeyword: e.target.value })}
                  />
                </Form.Item>
                <Form.Item label={t('promotionOrderManage.colRefundTime')}>
                  <RangePicker style={{ width: '100%' }} />
                </Form.Item>
              </>
            )}
            {orderType === '新店廣告' && (
              <>
                <Form.Item label={t('promotionOrderManage.colCancelOperator')}>
                  <Input
                    placeholder={t('promotionOrderManage.operatorNamePlaceholder')}
                    allowClear
                    value={filters.cancelOperatorKeyword}
                    onChange={e => setFilters({ ...filters, cancelOperatorKeyword: e.target.value })}
                  />
                </Form.Item>
                <Form.Item label={t('promotionOrderManage.colCancelTime')}>
                  <RangePicker style={{ width: '100%' }} />
                </Form.Item>
              </>
            )}
            <Form.Item label={t('promotionOrderManage.colOperator')}>
              <Input
                placeholder={t('promotionOrderManage.operatorIdNamePlaceholder')}
                allowClear
                value={filters.operatorKeyword}
                onChange={e => setFilters({ ...filters, operatorKeyword: e.target.value })}
              />
            </Form.Item>
            <Form.Item>
              <div className="search-actions">
                <Button type="primary" icon={<SearchOutlined />}>
                  {t('common.search')}
                </Button>
                <Button onClick={handleReset}>{t('common.reset')}</Button>
              </div>
            </Form.Item>
          </Form>
      </div>

      {/* 操作区域 */}
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Space>
          <Button className="btn-export" icon={<ExportOutlined />} onClick={handleExport}>
            {t('common.export')}
          </Button>
        </Space>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {configComponent}
        </div>
      </div>

      {/* 订单列表 */}
      <Table
          columns={applyConfig(columns)}
          dataSource={filteredOrders}
          rowKey="id"
          rowSelection={{
            type: 'checkbox',
            onChange: (selectedRowKeys, selectedRows) => {
            },
          }}
          scroll={{ x: 2800 }}
          pagination={{
            total: filteredOrders.length,
            pageSize: 10,
            showTotal: (total) => t('common.total', { count: total }),
            showSizeChanger: true,
            showQuickJumper: true,
            pageSizeOptions: ['10', '20', '50'],
          }}
          locale={{ emptyText: t('promotionOrderManage.emptyText') }}
        />
    </div>
  )
}
