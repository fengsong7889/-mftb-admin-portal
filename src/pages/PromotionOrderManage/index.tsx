import { useState, useMemo, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Table, Tag, Space, Select, Input, Button, Form, DatePicker, message, Popover, TreeSelect } from 'antd'
import BrandTag from '../../components/BrandTag'
import { fetchAdOrders } from '../../api/adPromotion'
import {
  SearchOutlined,
  ExportOutlined,
} from '@ant-design/icons'
import type { ColumnsType } from 'antd/es/table'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useColumnConfig } from '../../hooks/useColumnConfig'
import { AppType, RecommendChannel, Region } from '../Recommend/constants'
import {
  OrderStatus,
  RecommendType,
  type BaseOrderItem,
  toBaseOrderItem,
  usePromotionOrderLabels,
  PromotionOrderPageHeader,
  createPurchaseContentRenderer,
} from '../_shared/promotion-order'

const { RangePicker } = DatePicker

export default function PromotionOrderManage() {
  const navigate = useNavigate()
  const { t } = useTranslation()
  const [searchParams] = useSearchParams()
  const orderType = searchParams.get('type') || ''
  const fromSource = searchParams.get('from') || ''

  // 使用共享 Hook 獲取標籤函數和商圈樹
  const {
    statusLabel,
    appLabel,
    channelLabel,
    regionLabel,
    recommendTypeLabel,
    regionTreeData,
    orderTypeKey,
  } = usePromotionOrderLabels(orderType)

  // 订单数据：直接调用后端 API
  const [orders, setOrders] = useState<BaseOrderItem[]>([])
  const loadOrders = () => {
    fetchAdOrders({ page: 1, size: 200 })
      .then(res => {
        const rows = (res.records ?? []).map(toBaseOrderItem)
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
  const columns: ColumnsType<BaseOrderItem> = [
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
      width: 140,
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
      width: orderType === '金字招牌' ? 320 : 140,
      render: createPurchaseContentRenderer({ t, orderType, regionLabel }),
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
      width: 175,
      render: (time: string) => time ? <span style={{ whiteSpace: 'nowrap' }}>{time}</span> : '-',
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
      <PromotionOrderPageHeader
        t={t}
        orderType={orderType}
        orderTypeKey={orderTypeKey}
        recommendTypeLabel={recommendTypeLabel}
        onBack={() => navigate('/ad-sales')}
        onBuyAd={() => navigate(`/ad-sales?type=${encodeURIComponent(orderType)}`)}
      />

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
