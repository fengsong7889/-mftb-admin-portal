import { useState, useMemo } from 'react'
import { Table, Tag, Space, Select, Input, Button, Form, DatePicker, Card, message } from 'antd'
const { RangePicker } = DatePicker
import { SearchOutlined, EyeOutlined, ExportOutlined, ArrowLeftOutlined, ShoppingCartOutlined, ThunderboltOutlined } from '@ant-design/icons'
import type { ColumnsType } from 'antd/es/table'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useColumnConfig } from '../../hooks/useColumnConfig'

// 订单状态枚举
enum OrderStatus {
  PENDING_PROMOTION = 1,
  PROMOTING = 2,
  PROMOTED = 3,
  REFUNDED = 4,
  CANCELLED = 5,
}

// 订单状态标签
const ORDER_STATUS_MAP: Record<OrderStatus, { label: string; color: string }> = {
  [OrderStatus.PENDING_PROMOTION]: { label: '待推廣', color: 'blue' },
  [OrderStatus.PROMOTING]: { label: '推廣中', color: 'green' },
  [OrderStatus.PROMOTED]: { label: '已推廣', color: 'purple' },
  [OrderStatus.REFUNDED]: { label: '已退款', color: 'orange' },
  [OrderStatus.CANCELLED]: { label: '已取消', color: 'red' },
}

// 品牌枚举
enum AppType {
  SHANFENG = 1,
  MFOOD = 2,
}

const APP_LABEL: Record<AppType, string> = {
  [AppType.SHANFENG]: '閃峰',
  [AppType.MFOOD]: 'mFood',
}

// 业务频道枚举
enum RecommendChannel {
  DELIVERY = 2,
  GROUP_BUY = 3,
  SUPERMARKET = 4,
}

const CHANNEL_LABEL: Record<RecommendChannel, string> = {
  [RecommendChannel.DELIVERY]: '美食外賣',
  [RecommendChannel.GROUP_BUY]: '團購到店',
  [RecommendChannel.SUPERMARKET]: '超市百貨',
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

const REGION_LABEL: Record<number, string> = {
  [Region.KOKSAA]: '黑沙環區',
  [Region.COSTA]: '高士德區',
  [Region.SANMA]: '新馬路區',
  [Region.SANWONG]: '新皇朝區',
  [Region.HKM]: '港珠澳區',
  [Region.FAHUA]: '花城市區',
  [Region.AIRPORT]: '北安機場',
  [Region.LHOTEL]: '左酒店區',
  [Region.RHOTEL]: '右酒店區',
  [Region.UM]: '澳大專區',
  [Region.HACS]: '黑沙灘區',
}

// 推荐类型枚举
enum RecommendType {
  INVINCIBLE_STAR = 1,
  REVITALIZATION_AD = 2,
  NEW_STORE_AD = 3,
  TRAFFIC_AD = 4,
}

const RECOMMEND_TYPE_LABEL: Record<RecommendType, string> = {
  [RecommendType.INVINCIBLE_STAR]: '無敵星星',
  [RecommendType.REVITALIZATION_AD]: '盤活復蘇',
  [RecommendType.NEW_STORE_AD]: '新店廣告',
  [RecommendType.TRAFFIC_AD]: '流量廣告',
}

const RECOMMEND_TYPE_COLOR: Record<RecommendType, string> = {
  [RecommendType.INVINCIBLE_STAR]: 'gold',
  [RecommendType.REVITALIZATION_AD]: 'green',
  [RecommendType.NEW_STORE_AD]: 'blue',
  [RecommendType.TRAFFIC_AD]: 'purple',
}

// 订单接口定义
interface OrderItem {
  id: string
  orderNo: string
  promotionName: string
  app: AppType
  channel: RecommendChannel
  region: Region
  recommendType: RecommendType
  slotPosition: number
  groupId: string             // 集團ID
  groupName: string           // 集團名稱
  storeId: string             // 門店ID
  storeName: string           // 門店名稱
  mealSlots: string[]       // 無敵星星：購買時段
  purchaseDays?: string[]    // 盤活復蘇：購買日期列表
  purchaseDate: string
  originalPrice: number
  discountPrice: number
  actualPrice: number
  status: OrderStatus
  orderTime: string
  payTime?: string
}

// Mock 订单数据（15条）
const mockOrders: OrderItem[] = [
  {
    id: '1',
    orderNo: 'ORD20250705001',
    promotionName: '無敵星星·黃金展位',
    app: AppType.SHANFENG,
    channel: RecommendChannel.DELIVERY,
    region: Region.KOKSAA,
    recommendType: RecommendType.INVINCIBLE_STAR,
    slotPosition: 3,
    groupId: 'G10001',
    groupName: '澳門美食集團',
    storeId: 'S20001',
    storeName: '澳門總店',
    purchaseDate: '2025-07-05',
    mealSlots: ['07:00-10:00', '11:00-14:00'],
    originalPrice: 2000,
    discountPrice: 1800,
    actualPrice: 1800,
    status: OrderStatus.PROMOTING,
    orderTime: '2025-07-05 10:30:00',
    payTime: '2025-07-05 10:35:00',
  },
  {
    id: '2',
    orderNo: 'ORD20250706002',
    promotionName: '新店廣告·首頁推薦',
    app: AppType.MFOOD,
    channel: RecommendChannel.DELIVERY,
    region: Region.FAHUA,
    recommendType: RecommendType.NEW_STORE_AD,
    slotPosition: 5,
    groupId: 'G10002',
    groupName: '閃峰餐飲連鎖',
    storeId: 'S20002',
    storeName: '氹仔分店',
    purchaseDate: '2025-07-06',
    mealSlots: ['17:00-21:00'],
    originalPrice: 1500,
    discountPrice: 1350,
    actualPrice: 1350,
    status: OrderStatus.PENDING_PROMOTION,
    orderTime: '2025-07-06 14:20:00',
    payTime: '2025-07-06 14:25:00',
  },
  {
    id: '3',
    orderNo: 'ORD20250707003',
    promotionName: '盤活復蘇·外賣熱推',
    app: AppType.SHANFENG,
    channel: RecommendChannel.GROUP_BUY,
    region: Region.SANMA,
    recommendType: RecommendType.REVITALIZATION_AD,
    slotPosition: 2,
    groupId: 'G10003',
    groupName: '大灣區餐飲集團',
    storeId: 'S20003',
    storeName: '珠海旗艦店',
    purchaseDate: '2025-07-08',
    mealSlots: [],
    purchaseDays: ['2025-07-08', '2025-07-09', '2025-07-10'],
    originalPrice: 3000,
    discountPrice: 2700,
    actualPrice: 2700,
    status: OrderStatus.PROMOTED,
    orderTime: '2025-07-07 09:15:00',
  },
  {
    id: '4',
    orderNo: 'ORD20250703004',
    promotionName: '流量廣告·團購精選',
    app: AppType.MFOOD,
    channel: RecommendChannel.SUPERMARKET,
    region: Region.KOKSAA,
    recommendType: RecommendType.TRAFFIC_AD,
    slotPosition: 4,
    groupId: 'G10001',
    groupName: '澳門美食集團',
    storeId: 'S20004',
    storeName: '黑沙環店',
    purchaseDate: '2025-07-03',
    mealSlots: ['07:00-10:00'],
    originalPrice: 1000,
    discountPrice: 900,
    actualPrice: 900,
    status: OrderStatus.REFUNDED,
    orderTime: '2025-07-03 16:40:00',
    payTime: '2025-07-03 16:45:00',
  },
  {
    id: '5',
    orderNo: 'ORD20250702005',
    promotionName: '無敵星星·週末專場',
    app: AppType.SHANFENG,
    channel: RecommendChannel.SUPERMARKET,
    region: Region.FAHUA,
    recommendType: RecommendType.INVINCIBLE_STAR,
    slotPosition: 1,
    groupId: 'G10002',
    groupName: '閃峰餐飲連鎖',
    storeId: 'S20005',
    storeName: '新馬路店',
    purchaseDate: '2025-07-02',
    mealSlots: ['17:00-21:00', '21:00-02:00'],
    originalPrice: 2500,
    discountPrice: 2250,
    actualPrice: 2250,
    status: OrderStatus.CANCELLED,
    orderTime: '2025-07-02 11:20:00',
  },
  {
    id: '6',
    orderNo: 'ORD20250701006',
    promotionName: '無敵星星·早鳥優惠',
    app: AppType.MFOOD,
    channel: RecommendChannel.GROUP_BUY,
    region: Region.KOKSAA,
    recommendType: RecommendType.INVINCIBLE_STAR,
    slotPosition: 2,
    groupId: 'G10003',
    groupName: '大灣區餐飲集團',
    storeId: 'S20001',
    storeName: '澳門總店',
    purchaseDate: '2025-07-01',
    mealSlots: ['07:00-10:00', '11:00-14:00'],
    originalPrice: 1800,
    discountPrice: 1620,
    actualPrice: 1620,
    status: OrderStatus.PROMOTING,
    orderTime: '2025-07-01 08:30:00',
    payTime: '2025-07-01 08:35:00',
  },
  {
    id: '7',
    orderNo: 'ORD20250630007',
    promotionName: '新店廣告·零售閃購',
    app: AppType.SHANFENG,
    channel: RecommendChannel.DELIVERY,
    region: Region.SANMA,
    recommendType: RecommendType.NEW_STORE_AD,
    slotPosition: 3,
    groupId: 'G10001',
    groupName: '澳門美食集團',
    storeId: 'S20002',
    storeName: '氹仔分店',
    purchaseDate: '2025-06-30',
    mealSlots: ['11:00-14:00'],
    originalPrice: 1200,
    discountPrice: 1080,
    actualPrice: 1080,
    status: OrderStatus.PENDING_PROMOTION,
    orderTime: '2025-06-30 10:15:00',
    payTime: '2025-06-30 10:20:00',
  },
  {
    id: '8',
    orderNo: 'ORD20250629008',
    promotionName: '盤活復蘇·團購到店',
    app: AppType.MFOOD,
    channel: RecommendChannel.GROUP_BUY,
    region: Region.FAHUA,
    recommendType: RecommendType.REVITALIZATION_AD,
    slotPosition: 4,
    groupId: 'G10002',
    groupName: '閃峰餐飲連鎖',
    storeId: 'S20003',
    storeName: '珠海旗艦店',
    purchaseDate: '2025-06-29',
    mealSlots: [],
    purchaseDays: ['2025-06-29', '2025-06-30', '2025-07-01', '2025-07-02'],
    originalPrice: 2800,
    discountPrice: 2520,
    actualPrice: 2520,
    status: OrderStatus.PROMOTED,
    orderTime: '2025-06-29 15:45:00',
  },
  {
    id: '9',
    orderNo: 'ORD20250628009',
    promotionName: '流量廣告·大首頁推薦',
    app: AppType.SHANFENG,
    channel: RecommendChannel.SUPERMARKET,
    region: Region.KOKSAA,
    recommendType: RecommendType.TRAFFIC_AD,
    slotPosition: 1,
    groupId: 'G10003',
    groupName: '大灣區餐飲集團',
    storeId: 'S20004',
    storeName: '黑沙環店',
    purchaseDate: '2025-06-28',
    mealSlots: ['07:00-10:00', '14:00-17:00'],
    originalPrice: 1600,
    discountPrice: 1440,
    actualPrice: 1440,
    status: OrderStatus.REFUNDED,
    orderTime: '2025-06-28 09:20:00',
    payTime: '2025-06-28 09:25:00',
  },
  {
    id: '10',
    orderNo: 'ORD20250627010',
    promotionName: '無敵星星·夜宵專場',
    app: AppType.MFOOD,
    channel: RecommendChannel.DELIVERY,
    region: Region.SANMA,
    recommendType: RecommendType.INVINCIBLE_STAR,
    slotPosition: 5,
    groupId: 'G10001',
    groupName: '澳門美食集團',
    storeId: 'S20005',
    storeName: '新馬路店',
    purchaseDate: '2025-06-27',
    mealSlots: ['21:00-02:00'],
    originalPrice: 2200,
    discountPrice: 1980,
    actualPrice: 1980,
    status: OrderStatus.PROMOTING,
    orderTime: '2025-06-27 20:10:00',
    payTime: '2025-06-27 20:15:00',
  },
  {
    id: '11',
    orderNo: 'ORD20250626011',
    promotionName: '新店廣告·澳門專區',
    app: AppType.SHANFENG,
    channel: RecommendChannel.DELIVERY,
    region: Region.KOKSAA,
    recommendType: RecommendType.NEW_STORE_AD,
    slotPosition: 2,
    groupId: 'G10002',
    groupName: '閃峰餐飲連鎖',
    storeId: 'S20001',
    storeName: '澳門總店',
    purchaseDate: '2025-06-26',
    mealSlots: ['11:00-14:00', '17:00-21:00'],
    originalPrice: 1900,
    discountPrice: 1710,
    actualPrice: 1710,
    status: OrderStatus.PENDING_PROMOTION,
    orderTime: '2025-06-26 11:30:00',
    payTime: '2025-06-26 11:35:00',
  },
  {
    id: '12',
    orderNo: 'ORD20250625012',
    promotionName: '盤活復蘇·氹仔熱推',
    app: AppType.MFOOD,
    channel: RecommendChannel.GROUP_BUY,
    region: Region.FAHUA,
    recommendType: RecommendType.REVITALIZATION_AD,
    slotPosition: 3,
    groupId: 'G10003',
    groupName: '大灣區餐飲集團',
    storeId: 'S20002',
    storeName: '氹仔分店',
    purchaseDate: '2025-06-25',
    mealSlots: [],
    purchaseDays: ['2025-06-25', '2025-06-26'],
    originalPrice: 1400,
    discountPrice: 1260,
    actualPrice: 1260,
    status: OrderStatus.CANCELLED,
    orderTime: '2025-06-25 13:50:00',
  },
  {
    id: '13',
    orderNo: 'ORD20250624013',
    promotionName: '流量廣告·珠海精選',
    app: AppType.SHANFENG,
    channel: RecommendChannel.SUPERMARKET,
    region: Region.SANMA,
    recommendType: RecommendType.TRAFFIC_AD,
    slotPosition: 4,
    groupId: 'G10001',
    groupName: '澳門美食集團',
    storeId: 'S20003',
    storeName: '珠海旗艦店',
    purchaseDate: '2025-06-24',
    mealSlots: ['07:00-10:00', '11:00-14:00'],
    originalPrice: 2100,
    discountPrice: 1890,
    actualPrice: 1890,
    status: OrderStatus.PROMOTED,
    orderTime: '2025-06-24 07:40:00',
  },
  {
    id: '14',
    orderNo: 'ORD20250623014',
    promotionName: '無敵星星·全時段推廣',
    app: AppType.MFOOD,
    channel: RecommendChannel.SUPERMARKET,
    region: Region.KOKSAA,
    recommendType: RecommendType.INVINCIBLE_STAR,
    slotPosition: 1,
    groupId: 'G10002',
    groupName: '閃峰餐飲連鎖',
    storeId: 'S20004',
    storeName: '黑沙環店',
    purchaseDate: '2025-06-23',
    mealSlots: ['07:00-10:00', '11:00-14:00', '17:00-21:00'],
    originalPrice: 3500,
    discountPrice: 3150,
    actualPrice: 3150,
    status: OrderStatus.PROMOTING,
    orderTime: '2025-06-23 06:20:00',
    payTime: '2025-06-23 06:25:00',
  },
  {
    id: '15',
    orderNo: 'ORD20250622015',
    promotionName: '新店廣告·閃購特惠',
    app: AppType.SHANFENG,
    channel: RecommendChannel.DELIVERY,
    region: Region.FAHUA,
    recommendType: RecommendType.NEW_STORE_AD,
    slotPosition: 5,
    groupId: 'G10003',
    groupName: '大灣區餐飲集團',
    storeId: 'S20005',
    storeName: '新馬路店',
    purchaseDate: '2025-06-22',
    mealSlots: ['午餐 11:00-14:00', '下午茶 14:00-17:00'],
    originalPrice: 1700,
    discountPrice: 1530,
    actualPrice: 1530,
    status: OrderStatus.REFUNDED,
    orderTime: '2025-06-22 10:05:00',
    payTime: '2025-06-22 10:10:00',
  },
]

export default function PromotionOrderManage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const orderType = searchParams.get('type') || ''
  // 来源标识：从「銷售訂單」(ad-sales) 进入则返回销售订单，否则返回「店鋪推廣」
  const fromSource = searchParams.get('from') || ''
  const backPath = fromSource === 'ad-sales' ? '/ad-sales' : '/promotion-sales-config'

  const [filters, setFilters] = useState({
    orderNo: '',
    app: undefined as AppType | undefined,
    channel: undefined as RecommendChannel | undefined,
    groupName: '',
    storeName: '',
    region: undefined as Region | undefined,
    status: undefined as OrderStatus | undefined,
    orderTimeRange: undefined as [any, any] | undefined,
    promoTimeRange: undefined as [any, any] | undefined,
  })

  // 根据 orderType 过滤对应类型的订单
  const filteredOrders = useMemo(() => {
    return mockOrders.filter(order => {
      // 按URL参数中的订单类型过滤
      if (orderType) {
        const typeName = RECOMMEND_TYPE_LABEL[order.recommendType]
        if (typeName !== orderType) return false
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
  }, [filters, orderType])

  // 列配置元数据
  const columnMeta = useMemo(() => [
    { key: 'orderNo', title: '訂單編號' },
    { key: 'groupInfo', title: '集團ID/集團名稱' },
    { key: 'storeInfo', title: '門店ID/門店名稱' },
    { key: 'promotionName', title: '推廣名稱' },
    { key: 'app', title: '所屬品牌' },
    { key: 'channel', title: '業務頻道' },
    { key: 'region', title: '所屬商圈' },
    { key: 'purchaseContent', title: orderType === '無敵星星' ? '購買時段' : orderType === '盤活復蘇' ? '購買天數' : '購買內容' },
    { key: 'originalPrice', title: '訂單金額' },
    { key: 'discount', title: '優惠金額' },
    { key: 'actualPrice', title: '實付金額' },
    { key: 'status', title: '訂單狀態' },
    { key: 'orderTime', title: '下單時間' },
    { key: 'action', title: '操作' },
  ], [orderType])

  const { configComponent, applyConfig } = useColumnConfig('promotion-order-manage', columnMeta, [
    { key: 'orderNo', visible: true, locked: 'head' as const },
    { key: 'action', visible: true, locked: 'tail' as const },
  ])

  // 表格列定义
  const columns: ColumnsType<OrderItem> = [
    {
      title: '訂單編號',
      dataIndex: 'orderNo',
      key: 'orderNo',
      width: 180,
      fixed: 'left',
    },
    {
      title: '集團ID/集團名稱',
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
      title: '門店ID/門店名稱',
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
      title: '推廣名稱',
      dataIndex: 'promotionName',
      key: 'promotionName',
      width: 180,
    },
    {
      title: '所屬品牌',
      dataIndex: 'app',
      key: 'app',
      width: 100,
      render: (app: AppType) => (
        <Tag color={app === AppType.SHANFENG ? 'blue' : 'orange'}>
          {APP_LABEL[app]}
        </Tag>
      ),
    },
    {
      title: '業務頻道',
      dataIndex: 'channel',
      key: 'channel',
      width: 120,
      render: (channel: RecommendChannel) => CHANNEL_LABEL[channel],
    },
    {
      title: '所屬商圈',
      dataIndex: 'region',
      key: 'region',
      width: 100,
      render: (region: Region) => REGION_LABEL[region],
    },
    {
      title: orderType === '無敵星星' ? '購買時段' : orderType === '盤活復蘇' ? '購買天數' : '購買內容',
      key: 'purchaseContent',
      width: 220,
      render: (_, record) => {
        if (orderType === '盤活復蘇' || record.recommendType === RecommendType.REVITALIZATION_AD) {
          // 盤活復蘇：只展示天數+日期
          if (record.purchaseDays && record.purchaseDays.length > 0) {
            const first = record.purchaseDays[0]
            const last = record.purchaseDays[record.purchaseDays.length - 1]
            const days = record.purchaseDays.length
            return (
              <Space direction="vertical" size={2}>
                <Tag color="green" style={{ margin: 0 }}>{days}天</Tag>
                <span style={{ fontSize: 12, color: '#595959' }}>
                  {first.slice(5)} ~ {last.slice(5)}
                </span>
              </Space>
            )
          }
          return <span style={{ color: '#bfbfbf' }}>-</span>
        }
        // 無敵星星：只展示時段
        if (record.mealSlots && record.mealSlots.length > 0) {
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
      title: '訂單金額',
      dataIndex: 'originalPrice',
      key: 'originalPrice',
      width: 120,
      render: (price: number) => `$${price}`,
    },
    {
      title: '優惠金額',
      key: 'discount',
      width: 120,
      render: (_, record) => (
        <span style={{ color: '#fa8c16' }}>
          -${record.originalPrice - record.actualPrice}
        </span>
      ),
    },
    {
      title: '實付金額',
      dataIndex: 'actualPrice',
      key: 'actualPrice',
      width: 120,
      render: (price: number) => (
        <span style={{ color: '#ff4d4f', fontWeight: 600 }}>${price}</span>
      ),
    },
    {
      title: '訂單狀態',
      dataIndex: 'status',
      key: 'status',
      width: 100,
      render: (status: OrderStatus) => {
        const { label, color } = ORDER_STATUS_MAP[status]
        return <Tag color={color}>{label}</Tag>
      },
    },
    {
      title: '下單時間',
      dataIndex: 'orderTime',
      key: 'orderTime',
      width: 160,
    },
    {
      title: '操作',
      key: 'action',
      width: 100,
      fixed: 'right',
      render: (_, record) => (
        <Button type="link" size="small" icon={<EyeOutlined />}>
          查看詳情
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
  const handleAdd = () => {
    message.info('新增訂單功能開發中')
    // TODO: 实现新增订单逻辑
  }

  // 导出订单
  const handleExport = () => {
    message.success('導出成功')
    // TODO: 实现导出逻辑
  }

  return (
    <div className="content-area">
      {/* 页面标题 */}
      <Card style={{ marginBottom: 16 }} bodyStyle={{ padding: '5px 24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <Button
              type="primary"
              icon={<ArrowLeftOutlined />}
              onClick={() => navigate(backPath)}
              style={{ backgroundColor: '#E8720C', borderColor: '#E8720C' }}
            >
              返回
            </Button>
            <div>
              <h2 style={{ margin: 0, fontSize: 20 }}>
                <ThunderboltOutlined style={{ marginRight: 8, color: '#faad14' }} />
                {orderType ? `${orderType}訂單` : '推廣通訂單'}
              </h2>
              <p style={{ margin: '8px 0 0', color: '#8c8c8c', fontSize: 13 }}>
                {orderType ? `查看${orderType}的訂單詳情` : '查看廣告訂單詳情'}
              </p>
            </div>
          </div>
          <Space size={12}>
            <Button
              type="primary"
              icon={<ShoppingCartOutlined />}
              onClick={() => navigate(`${backPath}?type=${encodeURIComponent(orderType)}`)}
              style={{ backgroundColor: '#fa8c16', borderColor: '#fa8c16' }}
            >
              購買廣告
            </Button>
          </Space>
        </div>
      </Card>

      {/* 搜索区域 */}
      <div className="search-section">
        <Form layout="inline">
            <Form.Item label="訂單編號">
              <Input
                placeholder="請輸入訂單編號"
                allowClear
                value={filters.orderNo}
                onChange={e => setFilters({ ...filters, orderNo: e.target.value })}
              />
            </Form.Item>
            <Form.Item label="所屬品牌">
              <Select
                placeholder="全部"
                allowClear
                value={filters.app}
                onChange={value => setFilters({ ...filters, app: value })}
                options={Object.values(AppType)
                  .filter(v => typeof v === 'number')
                  .map(app => ({
                    label: APP_LABEL[app],
                    value: app,
                  }))}
              />
            </Form.Item>
            <Form.Item label="業務頻道">
              <Select
                placeholder="全部"
                allowClear
                value={filters.channel}
                onChange={value => setFilters({ ...filters, channel: value })}
                options={Object.values(RecommendChannel)
                  .filter(v => typeof v === 'number')
                  .map(channel => ({
                    label: CHANNEL_LABEL[channel],
                    value: channel,
                  }))}
              />
            </Form.Item>
            <Form.Item label="集團名稱">
              <Input
                placeholder="請輸入集團名稱"
                allowClear
                value={filters.groupName}
                onChange={e => setFilters({ ...filters, groupName: e.target.value })}
              />
            </Form.Item>
            <Form.Item label="門店名稱">
              <Input
                placeholder="請輸入門店名稱"
                allowClear
                value={filters.storeName}
                onChange={e => setFilters({ ...filters, storeName: e.target.value })}
              />
            </Form.Item>
            <Form.Item label="推廣商圈">
              <Select
                placeholder="全部"
                allowClear
                value={filters.region}
                onChange={value => setFilters({ ...filters, region: value })}
                options={Object.values(Region)
                  .filter(v => typeof v === 'number')
                  .map(region => ({
                    label: REGION_LABEL[region],
                    value: region,
                  }))}
              />
            </Form.Item>
            <Form.Item label="訂單狀態">
              <Select
                placeholder="全部"
                allowClear
                value={filters.status}
                onChange={value => setFilters({ ...filters, status: value })}
                options={Object.values(OrderStatus)
                  .filter(v => typeof v === 'number')
                  .map(status => ({
                    label: ORDER_STATUS_MAP[status as OrderStatus].label,
                    value: status,
                  }))}
              />
            </Form.Item>
            <Form.Item label="下單時間">
              <RangePicker style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item label="推廣時間">
              <RangePicker style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item>
              <div className="search-actions">
                <Button type="primary" icon={<SearchOutlined />}>
                  查詢
                </Button>
                <Button onClick={handleReset}>重置</Button>
              </div>
            </Form.Item>
          </Form>
      </div>

      {/* 操作区域 */}
      <div className="action-section">
        <Space>
          <Button type="primary" icon={<ExportOutlined />} onClick={handleExport}>
            導出
          </Button>
        </Space>
        {configComponent}
      </div>

      {/* 订单列表 */}
      <Table
          columns={applyConfig(columns)}
          dataSource={filteredOrders}
          rowKey="id"
          rowSelection={{
            type: 'checkbox',
            onChange: (selectedRowKeys, selectedRows) => {
              console.log('选中行:', selectedRowKeys, selectedRows)
            },
          }}
          scroll={{ x: 2200 }}
          pagination={{
            total: filteredOrders.length,
            pageSize: 10,
            showTotal: (total) => `共 ${total} 條`,
            showSizeChanger: true,
            showQuickJumper: true,
            pageSizeOptions: ['10', '20', '50'],
          }}
          locale={{ emptyText: '暫無訂單數據' }}
        />
    </div>
  )
}
