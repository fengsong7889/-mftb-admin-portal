import { useState, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { Table, Tag, Space, Select, Input, Button, DatePicker, message, Modal, Card, Row, Col, Statistic } from 'antd'
import {
  SearchOutlined,
  ExportOutlined,
  ReloadOutlined,
} from '@ant-design/icons'
import { Line, Column } from '@ant-design/charts'
import dayjs from 'dayjs'
import type { ColumnsType } from 'antd/es/table'
import { useAuth } from '../../../contexts/AuthContext'
import {
  OrderReportItem,
  ReportApp,
  ReportChannel,
  ReportRegion,
  ReportRecommendType,
  ReportAdStatus,
  ReportTimeSlot,
  REPORT_APP_LABEL,
  REPORT_CHANNEL_LABEL,
  REPORT_REGION_LABEL,
  REPORT_RECOMMEND_TYPE_LABEL,
  REPORT_RECOMMEND_TYPE_COLOR,
  REPORT_AD_STATUS_LABEL,
} from '../types'
import { mockOrderReports, mockTimeSlotReports, mockDailyTrends } from '../mockData'
import '../index.css'

const { RangePicker } = DatePicker

export default function PromotionReportOrder() {
  const { user } = useAuth()
  const { t } = useTranslation()
  const [loading, _setLoading] = useState(false)
  const [dateRange, setDateRange] = useState<[dayjs.Dayjs, dayjs.Dayjs] | undefined>(undefined)
  const [orderNo, setOrderNo] = useState<string | undefined>(undefined)
  const [promotionName, setPromotionName] = useState<string | undefined>(undefined)
  const [recommendType, setRecommendType] = useState<ReportRecommendType[] | undefined>(undefined)
  const [app, setApp] = useState<ReportApp | undefined>(undefined)
  const [channel, setChannel] = useState<ReportChannel | undefined>(undefined)
  const [region, setRegion] = useState<ReportRegion | undefined>(undefined)
  const [adStatus, setAdStatus] = useState<ReportAdStatus | undefined>(undefined)
  const [detailModalVisible, setDetailModalVisible] = useState(false)
  const [selectedOrder, setSelectedOrder] = useState<OrderReportItem | null>(null)

  // 权限控制: 非admin只能看自己品牌
  const canViewAllBrands = user?.role === 'admin'
  const filteredReports = useMemo(() => {
    let data = [...mockOrderReports]
    
    // 品牌权限过滤
    if (!canViewAllBrands && user?.dataPermissions?.merchants) {
      // 根据用户数据权限过滤
      data = data.filter(item => user.dataPermissions!.merchants!.includes(String(item.app)))
    }
    
    // 查询条件过滤
    if (dateRange) {
      const [start, end] = dateRange
      data = data.filter(item => {
        const itemStart = dayjs(item.startDate)
        const itemEnd = dayjs(item.endDate)
        return itemStart.isBefore(end) && itemEnd.isAfter(start)
      })
    }
    if (orderNo) {
      data = data.filter(item => item.orderNo.includes(orderNo))
    }
    if (promotionName) {
      data = data.filter(item => item.promotionName.includes(promotionName))
    }
    if (recommendType && recommendType.length > 0) {
      data = data.filter(item => recommendType.includes(item.recommendType))
    }
    if (app) {
      data = data.filter(item => item.app === app)
    }
    if (channel) {
      data = data.filter(item => item.channel === channel)
    }
    if (region) {
      data = data.filter(item => item.region === region)
    }
    if (adStatus) {
      data = data.filter(item => item.adStatus === adStatus)
    }
    
    return data
  }, [dateRange, orderNo, promotionName, recommendType, app, channel, region, adStatus, canViewAllBrands, user])

  // 导出Excel
  const handleExport = () => {
    const headers = [
      t('promotionReport.colOrderNo'), t('promotionReport.colPromotionName'), t('promotionReport.recommendType'), t('promotionReport.brand'), t('promotionReport.channel'), t('promotionReport.region'),
      t('promotionReport.colPromotionPeriod'), t('promotionReport.colImpressions'), t('promotionReport.colClicks'), t('promotionReport.ctrPct'), t('promotionReport.colCpc'), t('promotionReport.conversionsCount'),
      t('promotionReport.cvrPct'), t('promotionReport.colCost'), t('promotionReport.colRevenue'), t('promotionReport.colRoi'), t('promotionReport.adStatus')
    ]
    
    const rows = filteredReports.map(item => [
      item.orderNo,
      item.promotionName,
      recommendTypeLabel(item.recommendType),
      appLabel(item.app),
      channelLabel(item.channel),
      regionLabel(item.region),
      item.promotionPeriod,
      item.impressions,
      item.clicks,
      item.ctr,
      item.cpc,
      item.conversions,
      item.cvr,
      item.cost,
      item.revenue,
      item.roi,
      adStatusLabel(item.adStatus).label,
    ])
    
    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.join(','))
    ].join('\n')
    
    const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' })
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = `${t('promotionReport.orderReportExportFile')}_${dayjs().format('YYYY-MM-DD')}.csv`
    link.click()
    
    message.success(t('common.exportSuccess'))
  }

  // 枚舉標籤（依賴 t，定義在組件內以便響應語言切換）
  const recommendTypeLabel = (v: ReportRecommendType) => {
    const map: Partial<Record<ReportRecommendType, string>> = {
      [ReportRecommendType.INVINCIBLE_STAR]: t('promotionReport.recTypeInvincibleStar'),
      [ReportRecommendType.HOT_REVIVE_AD]: t('promotionReport.recTypeHotRevive'),
      [ReportRecommendType.NEW_STORE_AD]: t('promotionReport.recTypeNewStore'),
      [ReportRecommendType.TRAFFIC_AD]: t('promotionReport.recTypeTraffic'),
    }
    return map[v] || String(v)
  }
  const appLabel = (v: ReportApp) => (v === ReportApp.SHANFENG ? t('common.flashBee') : 'mFood')
  const channelLabel = (v: ReportChannel) => ({
    [ReportChannel.FOOD_DELIVERY]: t('promotionReport.chFood'),
    [ReportChannel.RETAIL]: t('promotionReport.chRetail'),
    [ReportChannel.GROUP_BUY]: t('promotionReport.chGroupBuy'),
  }[v])
  const regionLabel = (v: ReportRegion) => ({
    [ReportRegion.MACAU]: t('promotionReport.regionMacau'),
    [ReportRegion.TAIPA]: t('promotionReport.regionTaipa'),
    [ReportRegion.ZHUHAI]: t('promotionReport.regionZhuhai'),
  }[v])
  const adStatusLabel = (v: ReportAdStatus) => {
    const map: Partial<Record<ReportAdStatus, { label: string; color: string }>> = {
      [ReportAdStatus.ONLINE]: { label: t('promotionReport.adStatusOnline'), color: 'green' },
      [ReportAdStatus.PAUSED]: { label: t('promotionReport.adStatusPaused'), color: 'orange' },
      [ReportAdStatus.OFFLINE]: { label: t('promotionReport.adStatusOffline'), color: 'red' },
    }
    return map[v] || { label: String(v), color: 'default' }
  }
  const timeSlotLabel = (v: ReportTimeSlot) => ({
    [ReportTimeSlot.BREAKFAST]: t('promotionReport.timeSlotBreakfast'),
    [ReportTimeSlot.LUNCH]: t('promotionReport.timeSlotLunch'),
    [ReportTimeSlot.DINNER]: t('promotionReport.timeSlotDinner'),
    [ReportTimeSlot.NIGHT_SNACK]: t('promotionReport.timeSlotNightSnack'),
  }[v])

  // 查看详情
  const handleViewDetail = (record: OrderReportItem) => {
    setSelectedOrder(record)
    setDetailModalVisible(true)
  }

  // 表格列定义
  const columns: ColumnsType<OrderReportItem> = [
    {
      title: t('promotionReport.colOrderNo'),
      dataIndex: 'orderNo',
      key: 'orderNo',
      width: 150,
      render: (text: string, record: OrderReportItem) => (
        <a onClick={() => handleViewDetail(record)}>{text}</a>
      ),
    },
    {
      title: t('promotionReport.colPromotionName'),
      dataIndex: 'promotionName',
      key: 'promotionName',
      width: 180,
      ellipsis: true,
    },
    {
      title: t('promotionReport.recommendType'),
      dataIndex: 'recommendType',
      key: 'recommendType',
      width: 120,
      render: (type: ReportRecommendType) => (
        <Tag color={REPORT_RECOMMEND_TYPE_COLOR[type]}>
          {recommendTypeLabel(type)}
        </Tag>
      ),
    },
    {
      title: t('promotionReport.brand'),
      dataIndex: 'app',
      key: 'app',
      width: 90,
      render: (app: ReportApp) => appLabel(app),
    },
    {
      title: t('promotionReport.channel'),
      dataIndex: 'channel',
      key: 'channel',
      width: 110,
      render: (channel: ReportChannel) => channelLabel(channel),
    },
    {
      title: t('promotionReport.region'),
      dataIndex: 'region',
      key: 'region',
      width: 80,
      render: (region: ReportRegion) => regionLabel(region),
    },
    {
      title: t('promotionReport.colPromotionPeriod'),
      dataIndex: 'promotionPeriod',
      key: 'promotionPeriod',
      width: 200,
      render: (v: string) => v ? <span style={{ whiteSpace: 'nowrap' }}>{v}</span> : '-',
    },
    {
      title: t('promotionReport.colImpressions'),
      dataIndex: 'impressions',
      key: 'impressions',
      width: 100,
      align: 'right' as const,
      render: (val: number) => val.toLocaleString(),
      sorter: (a, b) => a.impressions - b.impressions,
    },
    {
      title: t('promotionReport.colClicks'),
      dataIndex: 'clicks',
      key: 'clicks',
      width: 100,
      align: 'right' as const,
      render: (val: number) => val.toLocaleString(),
      sorter: (a, b) => a.clicks - b.clicks,
    },
    {
      title: t('promotionReport.colCtr'),
      dataIndex: 'ctr',
      key: 'ctr',
      width: 90,
      align: 'right' as const,
      render: (val: number) => `${val}%`,
      sorter: (a, b) => a.ctr - b.ctr,
    },
    {
      title: t('promotionReport.colCpc'),
      dataIndex: 'cpc',
      key: 'cpc',
      width: 100,
      align: 'right' as const,
      render: (val: number) => `MOP ${val.toFixed(2)}`,
      sorter: (a, b) => a.cpc - b.cpc,
    },
    {
      title: t('promotionReport.colConversions'),
      dataIndex: 'conversions',
      key: 'conversions',
      width: 100,
      align: 'right' as const,
      render: (val: number) => val.toLocaleString(),
      sorter: (a, b) => a.conversions - b.conversions,
    },
    {
      title: t('promotionReport.colCvr'),
      dataIndex: 'cvr',
      key: 'cvr',
      width: 90,
      align: 'right' as const,
      render: (val: number) => `${val}%`,
      sorter: (a, b) => a.cvr - b.cvr,
    },
    {
      title: t('promotionReport.colCost'),
      dataIndex: 'cost',
      key: 'cost',
      width: 110,
      align: 'right' as const,
      render: (val: number) => `MOP ${val.toLocaleString()}`,
      sorter: (a, b) => a.cost - b.cost,
    },
    {
      title: t('promotionReport.colRoi'),
      dataIndex: 'roi',
      key: 'roi',
      width: 80,
      align: 'right' as const,
      render: (val: number) => val.toFixed(2),
      sorter: (a, b) => a.roi - b.roi,
    },
    {
      title: t('promotionReport.adStatus'),
      dataIndex: 'adStatus',
      key: 'adStatus',
      width: 90,
      render: (status: ReportAdStatus) => {
        const { label, color } = adStatusLabel(status)
        return <Tag color={color}>{label}</Tag>
      },
    },
  ]

  // 详情弹窗中的图表配置
  const detailTrendConfig = selectedOrder ? {
    data: mockDailyTrends.slice(-7),
    xField: 'date',
    yField: 'impressions',
    smooth: true,
    color: ['#1890ff'],
  } : {}

  const timeSlotConfig = {
    data: mockTimeSlotReports.map(item => ({
      timeSlot: timeSlotLabel(item.timeSlot),
      impressions: item.impressions,
      clicks: item.clicks,
    })),
    xField: 'timeSlot',
    yField: 'impressions',
    seriesField: 'type',
    isGroup: true,
    color: ['#1890ff', '#52c41a'],
  }

  return (
    <div className="promotion-report-order">
      {/* 查询区域 */}
      <div className="search-section">
        <form className="search-form" style={{ display: 'flex', flexWrap: 'wrap', gap: '16px 12px', alignItems: 'flex-end' }}>
          <div style={{ flex: '0 0 calc(25% - 9px)' }}>
            <label style={{ display: 'block', marginBottom: 4, color: '#666' }}>{t('promotionReport.timeRange')}</label>
            <RangePicker
              value={dateRange}
              onChange={(dates) => {
                if (dates && dates[0] && dates[1]) {
                  setDateRange([dates[0], dates[1]])
                } else {
                  setDateRange(undefined)
                }
              }}
              style={{ width: '100%' }}
            />
          </div>
          <div style={{ flex: '0 0 calc(25% - 9px)' }}>
            <label style={{ display: 'block', marginBottom: 4, color: '#666' }}>{t('promotionReport.colOrderNo')}</label>
            <Input
              placeholder={t('promotionReport.orderNoPlaceholder')}
              allowClear
              value={orderNo}
              onChange={(e) => setOrderNo(e.target.value)}
            />
          </div>
          <div style={{ flex: '0 0 calc(25% - 9px)' }}>
            <label style={{ display: 'block', marginBottom: 4, color: '#666' }}>{t('promotionReport.colPromotionName')}</label>
            <Input
              placeholder={t('promotionReport.promoNamePlaceholder')}
              allowClear
              value={promotionName}
              onChange={(e) => setPromotionName(e.target.value)}
            />
          </div>
          <div style={{ flex: '0 0 calc(25% - 9px)' }}>
            <label style={{ display: 'block', marginBottom: 4, color: '#666' }}>{t('promotionReport.recommendType')}</label>
            <Select
              mode="multiple"
              placeholder={t('common.all')}
              allowClear
              value={recommendType}
              onChange={setRecommendType}
              options={Object.entries(REPORT_RECOMMEND_TYPE_LABEL).map(([value]) => ({
                value: Number(value),
                label: recommendTypeLabel(Number(value) as ReportRecommendType),
              }))}
            />
          </div>
          {canViewAllBrands && (
            <div style={{ flex: '0 0 calc(25% - 9px)' }}>
              <label style={{ display: 'block', marginBottom: 4, color: '#666' }}>{t('promotionReport.brand')}</label>
              <Select
                placeholder={t('common.all')}
                allowClear
                value={app}
                onChange={setApp}
                options={Object.entries(REPORT_APP_LABEL).map(([value]) => ({
                  value: Number(value),
                  label: appLabel(Number(value) as ReportApp),
                }))}
              />
            </div>
          )}
          <div style={{ flex: '0 0 calc(25% - 9px)' }}>
            <label style={{ display: 'block', marginBottom: 4, color: '#666' }}>{t('promotionReport.channel')}</label>
            <Select
              placeholder={t('common.all')}
              allowClear
              value={channel}
              onChange={setChannel}
              options={Object.entries(REPORT_CHANNEL_LABEL).map(([value]) => ({
                value: Number(value),
                label: channelLabel(Number(value) as ReportChannel),
              }))}
            />
          </div>
          <div style={{ flex: '0 0 calc(25% - 9px)' }}>
            <label style={{ display: 'block', marginBottom: 4, color: '#666' }}>{t('promotionReport.region')}</label>
            <Select
              placeholder={t('common.all')}
              allowClear
              value={region}
              onChange={setRegion}
              options={Object.entries(REPORT_REGION_LABEL).map(([value]) => ({
                value: Number(value),
                label: regionLabel(Number(value) as ReportRegion),
              }))}
            />
          </div>
          <div style={{ flex: '0 0 calc(25% - 9px)' }}>
            <label style={{ display: 'block', marginBottom: 4, color: '#666' }}>{t('promotionReport.adStatus')}</label>
            <Select
              placeholder={t('common.all')}
              allowClear
              value={adStatus}
              onChange={setAdStatus}
              options={Object.entries(REPORT_AD_STATUS_LABEL).map(([value]) => ({
                value: Number(value),
                label: adStatusLabel(Number(value) as ReportAdStatus).label,
              }))}
            />
          </div>
          <div style={{ flex: '0 0 auto', paddingTop: 26 }}>
            <Space>
              <Button type="primary" icon={<SearchOutlined />}>{t('common.search')}</Button>
              <Button icon={<ReloadOutlined />}>{t('common.reset')}</Button>
              <Button className="btn-export" icon={<ExportOutlined />} onClick={handleExport}>{t('common.export')}</Button>
            </Space>
          </div>
        </form>
      </div>

      {/* 列表区域 */}
      <Table
        columns={columns}
        dataSource={filteredReports}
        rowKey="id"
        loading={loading}
        pagination={{
          pageSize: 10,
          showSizeChanger: true,
          showQuickJumper: true,
          showTotal: (total) => t('promotionReport.totalCount', { total }),
        }}
        scroll={{ x: 1600 }}
        style={{ marginTop: 16 }}
      />

      {/* 详情弹窗 */}
      <Modal
        title={t('promotionReport.orderDetailTitle')}
        open={detailModalVisible}
        onCancel={() => setDetailModalVisible(false)}
        footer={null}
        width={1200}
      >
        {selectedOrder && (
          <div>
            {/* 基本信息 */}
            <Card title={t('promotionReport.baseInfo')} style={{ marginBottom: 16 }}>
              <Row gutter={[16, 16]}>
                <Col span={6}>
                  <div style={{ fontSize: 12, color: '#999' }}>{t('promotionReport.colOrderNo')}</div>
                  <div style={{ fontSize: 16, fontWeight: 500 }}>{selectedOrder.orderNo}</div>
                </Col>
                <Col span={6}>
                  <div style={{ fontSize: 12, color: '#999' }}>{t('promotionReport.colPromotionName')}</div>
                  <div style={{ fontSize: 16, fontWeight: 500 }}>{selectedOrder.promotionName}</div>
                </Col>
                <Col span={6}>
                  <div style={{ fontSize: 12, color: '#999' }}>{t('promotionReport.recommendType')}</div>
                  <Tag color={REPORT_RECOMMEND_TYPE_COLOR[selectedOrder.recommendType]}>
                    {recommendTypeLabel(selectedOrder.recommendType)}
                  </Tag>
                </Col>
                <Col span={6}>
                  <div style={{ fontSize: 12, color: '#999' }}>{t('promotionReport.colPromotionPeriod')}</div>
                  <div style={{ fontSize: 16 }}>{selectedOrder.promotionPeriod}</div>
                </Col>
              </Row>
            </Card>

            {/* 核心指标 */}
            <Card title={t('promotionReport.coreMetrics')} style={{ marginBottom: 16 }}>
              <Row gutter={[16, 16]}>
                <Col span={6}>
                  <Statistic title={t('promotionReport.colImpressions')} value={selectedOrder.impressions} suffix={t('promotionReport.unitTimes')} />
                </Col>
                <Col span={6}>
                  <Statistic title={t('promotionReport.colClicks')} value={selectedOrder.clicks} suffix={t('promotionReport.unitTimes')} />
                </Col>
                <Col span={6}>
                  <Statistic title={t('promotionReport.colCtr')} value={selectedOrder.ctr} suffix="%" precision={1} />
                </Col>
                <Col span={6}>
                  <Statistic title={t('promotionReport.colCpc')} value={selectedOrder.cpc} prefix="MOP" precision={2} />
                </Col>
                <Col span={6}>
                  <Statistic title={t('promotionReport.colConversions')} value={selectedOrder.conversions} suffix={t('promotionReport.unitOrders')} />
                </Col>
                <Col span={6}>
                  <Statistic title={t('promotionReport.colCvr')} value={selectedOrder.cvr} suffix="%" precision={1} />
                </Col>
                <Col span={6}>
                  <Statistic title={t('promotionReport.colCost')} value={selectedOrder.cost} prefix="MOP" />
                </Col>
                <Col span={6}>
                  <Statistic title={t('promotionReport.colRoi')} value={selectedOrder.roi} precision={2} />
                </Col>
              </Row>
            </Card>

            {/* 日趋势图 */}
            <Card title={t('promotionReport.trend7d')} style={{ marginBottom: 16 }}>
              <Line {...detailTrendConfig} style={{ height: 250 }} />
            </Card>

            {/* 时段分析 */}
            <Card title={t('promotionReport.timeSlotAnalysis')}>
              <Row gutter={[16, 16]}>
                <Col span={24}>
                  <Column {...timeSlotConfig} style={{ height: 250 }} />
                </Col>
              </Row>
              <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
                {mockTimeSlotReports.map(item => (
                  <Col span={6} key={item.timeSlot}>
                    <Card size="small">
                      <div style={{ fontWeight: 500, marginBottom: 8 }}>{timeSlotLabel(item.timeSlot)}</div>
                      <div style={{ fontSize: 12, color: '#999' }}>{t('promotionReport.colImpressions')}: {item.impressions.toLocaleString()}</div>
                      <div style={{ fontSize: 12, color: '#999' }}>{t('promotionReport.colClicks')}: {item.clicks.toLocaleString()}</div>
                      <div style={{ fontSize: 12, color: '#999' }}>CTR: {item.ctr}%</div>
                      <div style={{ fontSize: 12, color: '#999' }}>CPC: MOP {item.cpc}</div>
                    </Card>
                  </Col>
                ))}
              </Row>
            </Card>
          </div>
        )}
      </Modal>
    </div>
  )
}
