import { useState, useMemo, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Table, Tag, Space, Select, Input, Button, Form, DatePicker, message, Popover, TreeSelect } from 'antd'
import BrandTag from '../../components/BrandTag'
import { fetchAdOrders, brandToAppType, MEAL_SLOT_TIME_LABEL, type AdOrder, type DateSlotGroup, type LabelDateGroup } from '../../api/adPromotion'
import dayjs from 'dayjs'
const { RangePicker } = DatePicker
import {
  SearchOutlined,
  ExportOutlined,
  ArrowLeftOutlined,
  ShoppingCartOutlined,
} from '@ant-design/icons'
import type { ColumnsType } from 'antd/es/table'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useColumnConfig } from '../../hooks/useColumnConfig'
import { AlgorithmType } from '../Recommend/constants'

// 订单状态枚举
enum OrderStatus {
  PENDING_PROMOTION = 1,
  PROMOTING = 2,
  PROMOTED = 3,
  REFUNDED = 4,
  CANCELLED = 5,
}

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
  [RecommendType.GOLDEN_SIGNBOARD]: '金字招牌',
}

const RECOMMEND_TYPE_ICON: Partial<Record<RecommendType, string>> = {
  [RecommendType.INVINCIBLE_STAR]: '⭐',
  [RecommendType.HOT_REVIVE_AD]: '🔥',
  [RecommendType.NEW_STORE_AD]: '🏪',
  [RecommendType.TRAFFIC_AD]: '📊',
  [RecommendType.POPULAR_MERCHANT_KA]: '🏆',
  [RecommendType.GOLDEN_SIGNBOARD]: '🏅',
}

const _RECOMMEND_TYPE_COLOR: Partial<Record<RecommendType, string>> = {
  [RecommendType.INVINCIBLE_STAR]: 'gold',
  [RecommendType.HOT_REVIVE_AD]: 'green',
  [RecommendType.NEW_STORE_AD]: 'blue',
  [RecommendType.TRAFFIC_AD]: 'purple',
}

/** 金字招牌標籤類型 → 中文翻譯映射 */
const SIGNBOARD_LABEL_CN: Record<string, { label: string; icon: string; color: string }> = {
  hot: { label: '熱門', icon: '🔥', color: '#FF4D4F' },
  popular: { label: '人氣', icon: '👑', color: '#FAAD14' },
  sales: { label: '銷量', icon: '📈', color: '#1890FF' },
  rating: { label: '好評', icon: '⭐', color: '#52C41A' },
  repurchase: { label: '復購', icon: '🔄', color: '#722ED1' },
  favorites: { label: '收藏', icon: '❤️', color: '#EB2F96' },
  customers: { label: '顧客數', icon: '👥', color: '#13C2C2' },
}

// 订单接口定义
interface OrderItem {
  id: string
  orderNo: string
  promotionName: string
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
  dateSlots?: DateSlotGroup[] // 無敵星星：按日期分組的購買時段
  purchaseDays?: string[]    // 盤活復蘇/金字招牌：購買日期列表
  labelDates?: LabelDateGroup[] // 金字招牌：按標籤分組的購買日期
  purchaseDate: string
  originalPrice: number
  discountPrice: number
  actualPrice: number
  discountAmount?: number    // 定價折扣
  giftDays?: number          // 贈送天數抵扣
  giftAmount?: number        // 贈送抵扣金額
  status: OrderStatus
  orderTime: string
  payTime?: string
  /** 数据来源：api=后端真实数据 mock=演示数据 */
  source?: 'api' | 'mock'
}

/** 后端订单 → 列表行（id 使用订单号，与详情页跳转对齐） */
function toOrderItem(vo: AdOrder): OrderItem {
  const channelMap: Record<number, RecommendChannel> = {
    2: RecommendChannel.DELIVERY,
    3: RecommendChannel.SUPERMARKET,
    4: RecommendChannel.GROUP_BUY,
  }
  // 後端 LocalDateTime 統一序列化為毫秒時間戳，兼容字符串/數字兩種格式
  const fmt = (t?: string | number) => {
    if (t == null || t === '') return ''
    if (typeof t === 'number') return dayjs(t).format('YYYY-MM-DD HH:mm:ss')
    return String(t).replace('T', ' ').slice(0, 19)
  }
  // 所屬商圈: 後端由訂單明細去重聚合返回
  const regions = (vo.regions || []).map(r => r as Region)
  // 購買時段: 餐段 key → 中文名稱
  const MEAL_SLOT_CN: Record<string, string> = {
    breakfast: '早餐', lunch: '午餐', afternoon: '下午茶', dinner: '晚餐', supper: '宵夜',
  }
  const mealSlots = (vo.mealSlots || []).map(s => MEAL_SLOT_CN[s] || MEAL_SLOT_TIME_LABEL[s] || s)
  // 按日期分組時段：後端返回每個日期對應的時段列表
  const dateSlots = vo.dateSlots?.map(g => ({
    date: g.date,
    slots: g.slots.map(s => MEAL_SLOT_CN[s] || MEAL_SLOT_TIME_LABEL[s] || s),
  }))
  // 購買日期: 無敵星星和盤活復蘇均傳遞日期列表
  const hasNoMealSlots = (vo.mealSlots || []).length === 0
  const isDayBasedType = vo.algoType === 3 || vo.algoType === 13
  const isStarType = vo.algoType === 1
  const purchaseDays = (isDayBasedType && hasNoMealSlots) || isStarType
    ? ((vo.purchaseDays && vo.purchaseDays.length > 0)
        ? vo.purchaseDays
        : isDayBasedType ? Array.from({ length: vo.itemCount || 0 }, () => '') : undefined)
    : undefined
  return {
    id: vo.orderNo,
    orderNo: vo.orderNo,
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
    dateSlots,
    purchaseDays,
    labelDates: vo.labelDates,
    purchaseDate: fmt(vo.orderTime).slice(0, 10),
    originalPrice: vo.originalAmount,
    discountPrice: vo.originalAmount - vo.discountAmount,
    actualPrice: vo.actualAmount,
    discountAmount: vo.discountAmount,
    giftDays: vo.giftDays ?? undefined,
    giftAmount: vo.giftAmount ?? undefined,
    status: vo.status as OrderStatus,
    orderTime: fmt(vo.orderTime),
    payTime: vo.payTime ? fmt(vo.payTime) : undefined,
    source: 'api',
  }
}

export default function PromotionOrderManage() {
  const navigate = useNavigate()
  const { t } = useTranslation()
  const [searchParams] = useSearchParams()
  const orderType = searchParams.get('type') || ''
  const fromSource = searchParams.get('from') || ''

  // 枚舉標籤（依賴 t，定義在組件內以便響應語言切換）
  const statusLabel = (v: OrderStatus) => {
    const map: Partial<Record<OrderStatus, { label: string; color: string }>> = {
      [OrderStatus.PENDING_PROMOTION]: { label: t('promotionOrderManage.statusPending'), color: 'blue' },
      [OrderStatus.PROMOTING]: { label: t('promotionOrderManage.statusPromoting'), color: 'green' },
      [OrderStatus.PROMOTED]: { label: t('promotionOrderManage.statusPromoted'), color: 'purple' },
      [OrderStatus.REFUNDED]: { label: t('promotionOrderManage.statusRefunded'), color: 'orange' },
      [OrderStatus.CANCELLED]: { label: t('promotionOrderManage.statusCancelled'), color: 'red' },
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

  // 订单数据：直接调用后端 API
  const [orders, setOrders] = useState<OrderItem[]>([])
  const loadOrders = () => {
    fetchAdOrders({ page: 1, size: 200 })
      .then(res => {
        const rows = (res.records ?? []).map(toOrderItem)
        setOrders(rows)
      })
      .catch(() => {})
  }
  useEffect(() => {
    loadOrders()
  }, [])

  const [filters, setFilters] = useState({
    orderNo: '',
    app: undefined as AppType | undefined,
    channel: undefined as RecommendChannel | undefined,
    groupName: '',
    storeName: '',
    region: undefined as Region | undefined,
    status: undefined as OrderStatus | undefined,
    orderTimeRange: undefined as [string, string] | undefined,
    promoTimeRange: undefined as [string, string] | undefined,
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
      if (filters.groupName) {
        if (!order.groupName.toLowerCase().includes(filters.groupName.toLowerCase())) {
          return false
        }
      }
      if (filters.storeName) {
        if (!order.storeName.toLowerCase().includes(filters.storeName.toLowerCase())) {
          return false
        }
      }
      if (filters.region !== undefined && order.region !== filters.region) {
        return false
      }
      if (filters.status !== undefined && order.status !== filters.status) {
        return false
      }
      return true
    })
  }, [filters, orderType, orders])

  // 列配置元数据
  const columnMeta = useMemo(() => [
    { key: 'orderNo', title: t('promotionOrderManage.colOrderNo') },
    { key: 'groupInfo', title: t('promotionOrderManage.colGroupInfo') },
    { key: 'storeInfo', title: t('promotionOrderManage.colStoreInfo') },
    { key: 'promotionName', title: t('promotionOrderManage.colAlgoName') },
    { key: 'app', title: t('common.colBrand') },
    { key: 'channel', title: t('common.colChannel') },
    { key: 'region', title: t('promotionOrderManage.colRegion') },
    { key: 'purchaseContent', title: orderType === '無敵星星' ? t('promotionOrderManage.purchaseSlots') : orderType === '盤活復蘇' ? t('promotionOrderManage.purchaseDaysTitle') : t('promotionOrderManage.purchaseContent') },
    { key: 'originalPrice', title: t('promotionOrderManage.colOrderAmount') },
    { key: 'discount', title: t('promotionOrderManage.colDiscount') },
    { key: 'payMode', title: t('promotionOrderManage.colPayMode') },
    { key: 'giftDays', title: t('promotionOrderManage.colGiftDays') },
    { key: 'actualPrice', title: t('promotionOrderManage.colActualPay') },
    { key: 'status', title: t('promotionOrderManage.colOrderStatus') },
    { key: 'orderTime', title: t('promotionOrderManage.colOrderTime') },
    { key: 'action', title: t('common.colAction') },
  ], [orderType, t])

  const { configComponent, applyConfig } = useColumnConfig('promotion-order-manage', columnMeta, [
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
      title: t('promotionOrderManage.colAlgoName'),
      dataIndex: 'promotionName',
      key: 'promotionName',
      width: 180,
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
      title: orderType === '無敵星星' ? t('promotionOrderManage.purchaseSlots') : orderType === '盤活復蘇' ? t('promotionOrderManage.purchaseDaysTitle') : orderType === '金字招牌' ? t('promotionOrderManage.purchaseContent') : t('promotionOrderManage.purchaseContent'),
      key: 'purchaseContent',
      width: 220,
      render: (_, record) => {
        // 金字招牌：展示標籤 + 日期（類似無敵星星購買時段風格）
        if (orderType === '金字招牌' || record.recommendType === RecommendType.GOLDEN_SIGNBOARD) {
          if (record.labelDates && record.labelDates.length > 0) {
            return (
              <Space direction="vertical" size={2}>
                {record.labelDates.map((lg, li) => {
                  const cfg = SIGNBOARD_LABEL_CN[lg.label]
                  const firstDate = lg.dates[0]
                  const moreCount = lg.dates.length - 1
                  const allDatesContent = (
                    <Space direction="vertical" size={4}>
                      {lg.dates.map((d, di) => (
                        <Tag key={di} color="green" style={{ margin: 0 }}>{d}</Tag>
                      ))}
                    </Space>
                  )
                  return (
                    <div key={li} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <Tag color={cfg?.color || 'default'} style={{ margin: 0 }}>{cfg?.icon} {cfg?.label || lg.label}</Tag>
                      {firstDate && (
                        <span style={{ fontSize: 12, color: '#595959' }}>{firstDate.slice(5)}</span>
                      )}
                      {moreCount > 0 && (
                        <Popover
                          content={allDatesContent}
                          title={`${cfg?.label || lg.label} 全部日期`}
                          trigger="click"
                          placement="bottomLeft"
                        >
                          <span style={{ fontSize: 11, color: '#1890ff', cursor: 'pointer' }}>+{moreCount}日期</span>
                        </Popover>
                      )}
                    </div>
                  )
                })}
              </Space>
            )
          }
          return <span style={{ color: '#bfbfbf' }}>-</span>
        }
        if (orderType === '盤活復蘇' || record.recommendType === RecommendType.HOT_REVIVE_AD) {
          // 盤活復蘇：只展示天數+日期
          if (record.purchaseDays && record.purchaseDays.length > 0) {
            const days = record.purchaseDays.length
            const hasDates = record.purchaseDays.some(d => !!d)
            const first = record.purchaseDays[0]
            const last = record.purchaseDays[record.purchaseDays.length - 1]
            return (
              <Space direction="vertical" size={2}>
                <Tag color="green" style={{ margin: 0 }}>{t('promotionOrderManage.daysUnit', { count: days })}</Tag>
                {hasDates && (
                  <span style={{ fontSize: 12, color: '#595959' }}>
                    {first.slice(5)} ~ {last.slice(5)}
                  </span>
                )}
              </Space>
            )
          }
          return <span style={{ color: '#bfbfbf' }}>-</span>
        }
        // 無敵星星：按日期分組展示時段（每個日期標注對應的購買時段）
        if (record.mealSlots && record.mealSlots.length > 0) {
          const hasDateSlots = record.dateSlots && record.dateSlots.length > 0
          // 按日期分組的詳細內容（弹窗展示）
          const dateSlotDetail = hasDateSlots ? (
            <Space direction="vertical" size={6}>
              {record.dateSlots!.map((g, gi) => (
                <div key={gi} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: 12, color: '#595959', minWidth: 48 }}>{g.date.slice(5)}</span>
                  {g.slots.map((slot, si) => (
                    <Tag key={si} color="blue" style={{ margin: 0 }}>{slot}</Tag>
                  ))}
                </div>
              ))}
            </Space>
          ) : null

          // 主列展示：優先按日期分組簡要展示（最多3排日期，每排最多2個時段）
          if (hasDateSlots && record.dateSlots!.length > 0) {
            const maxShowDates = 3
            const maxSlotsPerDate = 2
            const visibleDates = record.dateSlots!.slice(0, maxShowDates)
            const hiddenDates = record.dateSlots!.slice(maxShowDates)
            return (
              <Space direction="vertical" size={2}>
                {visibleDates.map((g, i) => {
                  const visibleSlots = g.slots.slice(0, maxSlotsPerDate)
                  const hiddenSlots = g.slots.slice(maxSlotsPerDate)
                  return (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <span style={{ fontSize: 11, color: '#8C8C8C', minWidth: 40 }}>{g.date.slice(5)}</span>
                      {visibleSlots.map((slot, si) => (
                        <Tag key={si} color="blue" style={{ margin: 0, fontSize: 11 }}>{slot}</Tag>
                      ))}
                      {hiddenSlots.length > 0 && (
                        <Popover
                          content={<Space wrap size={4}>{g.slots.map((s, si) => <Tag key={si} color="blue" style={{ margin: 0 }}>{s}</Tag>)}</Space>}
                          title={`${g.date.slice(5)} 全部時段`}
                          trigger="click"
                          placement="bottomLeft"
                        >
                          <span style={{ fontSize: 11, color: '#1890ff', cursor: 'pointer' }}>+{hiddenSlots.length}</span>
                        </Popover>
                      )}
                    </div>
                  )
                })}
                {hiddenDates.length > 0 && dateSlotDetail && (
                  <Popover content={dateSlotDetail} title={t('promotionOrderManage.allSlots')} trigger="click" placement="bottomLeft">
                    <Button type="link" size="small" style={{ padding: 0, height: 'auto', fontSize: 12 }}>
                      {t('promotionOrderManage.moreLabel', { count: hiddenDates.length })}
                    </Button>
                  </Popover>
                )}
              </Space>
            )
          }

          // 降級：無 dateSlots 時保持原邏輯
          return (
            <Space direction="vertical" size={2}>
              {record.mealSlots.map((slot, index) => (
                <Tag key={index} color="blue" style={{ margin: 0 }}>
                  {slot}
                </Tag>
              ))}
            </Space>
          )
        }
        return <span style={{ color: '#bfbfbf' }}>-</span>
      },
    },
    {
      title: t('promotionOrderManage.colOrderAmount'),
      dataIndex: 'originalPrice',
      key: 'originalPrice',
      width: 120,
      align: 'right' as const,
      render: (price: number) => `$${price}`,
    },
    {
      title: t('promotionOrderManage.colDiscount'),
      key: 'discount',
      width: 120,
      align: 'right' as const,
      render: (_, record) => {
        const disc = record.discountAmount ?? (record.originalPrice - record.actualPrice)
        return disc > 0 ? <span style={{ color: '#fa8c16' }}>-${disc}</span> : <span style={{ color: '#bfbfbf' }}>-</span>
      },
    },
    {
      title: t('promotionOrderManage.colPayMode'),
      key: 'payMode',
      width: 110,
      render: (_, record) => {
        const gd = record.giftDays ?? 0
        const isGift = gd > 0 && record.actualPrice === 0
        const isMixed = gd > 0 && record.actualPrice > 0
        if (isGift) return <Tag color="orange">{t('promotionOrderManage.payModeGift')}</Tag>
        if (isMixed) return <Tag color="green">{t('promotionOrderManage.payModeMixed')}</Tag>
        return <Tag color="gold">{t('promotionOrderManage.payModePromo')}</Tag>
      },
    },
    {
      title: t('promotionOrderManage.colGiftDays'),
      key: 'giftDays',
      width: 90,
      render: (_, record) => {
        const gd = record.giftDays ?? 0
        return gd > 0
          ? <span style={{ color: '#E8720C', fontWeight: 600 }}>{gd} {t('promotionOrderManage.dayUnit')}</span>
          : <span style={{ color: '#bfbfbf' }}>-</span>
      },
    },
    {
      title: t('promotionOrderManage.colActualPay'),
      dataIndex: 'actualPrice',
      key: 'actualPrice',
      width: 120,
      align: 'right' as const,
      render: (price: number) => (
        <span style={{ color: '#ff4d4f', fontWeight: 600 }}>${price}</span>
      ),
    },
    {
      title: t('promotionOrderManage.colOrderStatus'),
      dataIndex: 'status',
      key: 'status',
      width: 100,
      render: (status: OrderStatus) => {
        const { label, color } = statusLabel(status)
        return <Tag color={color}>{label}</Tag>
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
        <Button type="link" size="small" onClick={() => navigate(`/order-detail?id=${record.id}&type=${encodeURIComponent(orderType)}${fromSource ? `&from=${encodeURIComponent(fromSource)}` : ''}`)}>
          {t('promotionOrderManage.viewDetail')}
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
      groupName: '',
      storeName: '',
      region: undefined,
      status: undefined,
      orderTimeRange: undefined,
      promoTimeRange: undefined,
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
        <div style={{
          height: 3, background: 'linear-gradient(90deg, #E8720C, #F59432, #FFB347, #F59432, #E8720C)',
          backgroundSize: '200% 100%', animation: 'headerGradientShift 4s ease infinite',
        }} />
        <div style={{
          padding: '16px 24px', display: 'flex', alignItems: 'center',
          justifyContent: 'space-between', animation: 'headerFadeSlideIn 0.5s ease',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <Button type="primary" icon={<ArrowLeftOutlined />}
              onClick={() => navigate('/ad-sales')}
              style={{
                backgroundColor: '#E8720C', borderColor: '#E8720C',
                borderRadius: 8, height: 36, padding: '0 16px',
                display: 'flex', alignItems: 'center', gap: 6,
                boxShadow: '0 2px 6px rgba(232,114,12,0.25)',
                transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
              }}>{t('common.back')}</Button>
            <div style={{ width: 1, height: 20, background: '#E8E8E8' }} />
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#1890ff' }}>{t('promotionOrderManage.orderListTitle')}</h2>
              {orderType && (
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  padding: '3px 12px', background: '#FFF7E6',
                  border: '1px solid #FFD591', borderRadius: 4,
                  fontSize: 13, color: '#E8720C', fontWeight: 500,
                }}>
                  {orderTypeKey !== undefined && <span style={{ fontSize: 14 }}>{RECOMMEND_TYPE_ICON[orderTypeKey]}</span>}
                  {orderTypeKey !== undefined ? recommendTypeLabel(orderTypeKey) : orderType}
                </div>
              )}
            </div>
          </div>
          <Button type="primary" icon={<ShoppingCartOutlined />}
            onClick={() => navigate(`/ad-sales?type=${encodeURIComponent(orderType)}`)}
            style={{
              backgroundColor: '#E8720C', borderColor: '#E8720C',
              borderRadius: 8, height: 36, padding: '0 18px',
              boxShadow: '0 2px 6px rgba(232,114,12,0.25)',
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
            <Form.Item label={t('common.colGroupName')}>
              <Input
                placeholder={t('common.groupNamePlaceholder')}
                allowClear
                value={filters.groupName}
                onChange={e => setFilters({ ...filters, groupName: e.target.value })}
              />
            </Form.Item>
            <Form.Item label={t('common.colStoreName')}>
              <Input
                placeholder={t('promotionOrderManage.storeNamePlaceholder')}
                allowClear
                value={filters.storeName}
                onChange={e => setFilters({ ...filters, storeName: e.target.value })}
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
            <Form.Item>
              <div className="search-actions">
                <Button type="primary" icon={<SearchOutlined />} onClick={loadOrders}>
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
            onChange: (_selectedRowKeys, _selectedRows) => {
            },
          }}
          scroll={{ x: 2200 }}
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
