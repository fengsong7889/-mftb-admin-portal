import { useState, useMemo, useEffect } from 'react'
import { Table, Tag, Space, Select, Input, Button, Form, DatePicker, message, Popover, TreeSelect } from 'antd'
import BrandTag from '../../components/BrandTag'
import { fetchAdOrders, brandToAppType, MEAL_SLOT_TIME_LABEL, type AdOrder } from '../../api/adPromotion'
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
  [AppType.SHANFENG]: '閃蜂',
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

/** 商圈树形数据（一级：区域，二级：商圈） */
const REGION_TREE_DATA = [
  {
    value: 'macau_area',
    title: '澳門區域',
    selectable: true,
    children: [
      { value: Region.KOKSAA, title: '黑沙環區' },
      { value: Region.COSTA, title: '高士德區' },
      { value: Region.SANMA, title: '新馬路區' },
      { value: Region.SANWONG, title: '新皇朝區' },
      { value: Region.HKM, title: '港珠澳區' },
    ],
  },
  {
    value: 'taipa_area',
    title: '氹仔區域',
    selectable: true,
    children: [
      { value: Region.FAHUA, title: '花城市區' },
      { value: Region.AIRPORT, title: '北安機場' },
      { value: Region.LHOTEL, title: '左酒店區' },
      { value: Region.RHOTEL, title: '右酒店區' },
      { value: Region.UM, title: '澳大專區' },
      { value: Region.HACS, title: '黑沙灘區' },
    ],
  },
]

// 推荐类型枚举（统一引用 AlgorithmType，避免重复定义导致枚举值不一致）
type RecommendType = AlgorithmType
const RecommendType = AlgorithmType

const RECOMMEND_TYPE_LABEL: Partial<Record<RecommendType, string>> = {
  [RecommendType.INVINCIBLE_STAR]: '無敵星星',
  [RecommendType.HOT_REVIVE_AD]: '盤活復蘇',
  [RecommendType.NEW_STORE_AD]: '新店廣告',
  [RecommendType.TRAFFIC_AD]: '流量廣告',
}

const RECOMMEND_TYPE_ICON: Partial<Record<RecommendType, string>> = {
  [RecommendType.INVINCIBLE_STAR]: '⭐',
  [RecommendType.HOT_REVIVE_AD]: '🔥',
  [RecommendType.NEW_STORE_AD]: '🏪',
  [RecommendType.TRAFFIC_AD]: '📊',
}

const _RECOMMEND_TYPE_COLOR: Partial<Record<RecommendType, string>> = {
  [RecommendType.INVINCIBLE_STAR]: 'gold',
  [RecommendType.HOT_REVIVE_AD]: 'green',
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
  region: Region | Region[]  // 所屬商圈（無敵星星可能有多個）
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
  // 購買時段: 餐段 key → 時間段標籤
  const mealSlots = (vo.mealSlots || []).map(s => MEAL_SLOT_TIME_LABEL[s] || s)
  // 盤活復蘇按天售賣無時段維度：優先用後端返回的購買日期列表，無日期時以明細格子數佔位
  const purchaseDays = vo.algoType === 3 && (vo.mealSlots || []).length === 0
    ? ((vo.purchaseDays && vo.purchaseDays.length > 0)
        ? vo.purchaseDays
        : Array.from({ length: vo.itemCount || 0 }, () => ''))
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
    purchaseDays,
    purchaseDate: fmt(vo.orderTime).slice(0, 10),
    originalPrice: vo.originalAmount,
    discountPrice: vo.originalAmount - vo.discountAmount,
    actualPrice: vo.actualAmount,
    status: vo.status as OrderStatus,
    orderTime: fmt(vo.orderTime),
    payTime: vo.payTime ? fmt(vo.payTime) : undefined,
    source: 'api',
  }
}

export default function PromotionOrderManage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const orderType = searchParams.get('type') || ''
  const fromSource = searchParams.get('from') || ''

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
  }, [filters, orderType, orders])

  // 列配置元数据
  const columnMeta = useMemo(() => [
    { key: 'orderNo', title: '訂單編號' },
    { key: 'groupInfo', title: '集團ID/集團名稱' },
    { key: 'storeInfo', title: '門店ID/門店名稱' },
    { key: 'promotionName', title: '算法名稱' },
    { key: 'app', title: '所屬品牌' },
    { key: 'channel', title: '業務頻道' },
    { key: 'region', title: '所屬商圈' },
    { key: 'purchaseContent', title: orderType === '無敵星星' ? '購買時段' : orderType === '盤活復蘇' ? '購買天數' : '購買內容' },
    { key: 'originalPrice', title: '訂單金額' },
    { key: 'discount', title: '優惠金額' },
    { key: 'actualPrice', title: '實付推廣金額' },
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
      title: '算法名稱',
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
        <BrandTag value={app} />
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
                {REGION_LABEL[r]}
              </Tag>
            ))}
          </Space>
        )

        return (
          <Space direction="vertical" size={2}>
            {visibleRegions.map((r, index) => (
              <Tag key={index} color="blue" style={{ margin: 0 }}>
                {REGION_LABEL[r]}
              </Tag>
            ))}
            {hasMore && (
              <Popover
                content={allContent}
                title="全部所屬商圈"
                trigger="click"
                placement="bottomLeft"
              >
                <Button type="link" size="small" style={{ padding: 0, height: 'auto', fontSize: 12 }}>
                  +{hiddenRegions.length} 更多
                </Button>
              </Popover>
            )}
          </Space>
        )
      },
    },
    {
      title: orderType === '無敵星星' ? '購買時段' : orderType === '盤活復蘇' ? '購買天數' : '購買內容',
      key: 'purchaseContent',
      width: 220,
      render: (_, record) => {
        if (orderType === '盤活復蘇' || record.recommendType === RecommendType.HOT_REVIVE_AD) {
          // 盤活復蘇：只展示天數+日期
          if (record.purchaseDays && record.purchaseDays.length > 0) {
            const days = record.purchaseDays.length
            const hasDates = record.purchaseDays.some(d => !!d)
            const first = record.purchaseDays[0]
            const last = record.purchaseDays[record.purchaseDays.length - 1]
            return (
              <Space direction="vertical" size={2}>
                <Tag color="green" style={{ margin: 0 }}>{days}天</Tag>
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
      title: '實付推廣金額',
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
        <Button type="link" size="small" onClick={() => navigate(`/order-detail?id=${record.id}&type=${encodeURIComponent(orderType)}${fromSource ? `&from=${encodeURIComponent(fromSource)}` : ''}`)}>
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
  const _handleAdd = () => {
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
              }}>返回</Button>
            <div style={{ width: 1, height: 20, background: '#E8E8E8' }} />
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#1890ff' }}>訂單列表</h2>
              {orderType && (
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  padding: '3px 12px', background: '#FFF7E6',
                  border: '1px solid #FFD591', borderRadius: 4,
                  fontSize: 13, color: '#E8720C', fontWeight: 500,
                }}>
                  {(() => {
                    const typeKey = Number(Object.entries(RECOMMEND_TYPE_LABEL).find(([_, label]) => label === orderType)?.[0]) as RecommendType
                    return <span style={{ fontSize: 14 }}>{RECOMMEND_TYPE_ICON[typeKey]}</span>
                  })()}
                  {orderType}
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
            }}>購買廣告</Button>
        </div>
      </div>

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
              <TreeSelect
                placeholder="全部"
                allowClear
                showSearch
                treeDefaultExpandAll
                treeNodeFilterProp="title"
                value={filters.region}
                onChange={value => setFilters({ ...filters, region: value })}
                treeData={REGION_TREE_DATA}
                style={{ width: '100%' }}
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
                <Button type="primary" icon={<SearchOutlined />} onClick={loadOrders}>
                  查詢
                </Button>
                <Button onClick={handleReset}>重置</Button>
              </div>
            </Form.Item>
          </Form>
      </div>

      {/* 操作区域 */}
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Space>
          <Button className="btn-export" icon={<ExportOutlined />} onClick={handleExport}>
            導出
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
