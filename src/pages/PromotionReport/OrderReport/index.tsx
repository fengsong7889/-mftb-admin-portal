import { useState, useMemo } from 'react'
import { Table, Tag, Space, Select, Input, Button, DatePicker, message, Modal, Card, Row, Col, Statistic } from 'antd'
import {
  SearchOutlined,
  ExportOutlined,
  EyeOutlined,
  ReloadOutlined,
} from '@ant-design/icons'
import { Line, Column } from '@ant-design/charts'
import dayjs from 'dayjs'
import type { ColumnsType } from 'antd/es/table'
import { useAuth } from '../../../contexts/AuthContext'
import {
  OrderReportItem,
  TimeSlotReport,
  DailyTrend,
  ReportApp,
  ReportChannel,
  ReportRegion,
  ReportRecommendType,
  ReportAdStatus,
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
  const [loading, setLoading] = useState(false)
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
      '訂單編號', '推廣活動名稱', '推薦類型', '所屬品牌', '業務頻道', '商圈',
      '推廣期間', '曝光量', '點擊量', '點擊率(%)', '點擊成本', '轉化訂單數',
      '轉化率(%)', '消耗金額', '產出金額', 'ROI', '廣告狀態'
    ]
    
    const rows = filteredReports.map(item => [
      item.orderNo,
      item.promotionName,
      REPORT_RECOMMEND_TYPE_LABEL[item.recommendType],
      REPORT_APP_LABEL[item.app],
      REPORT_CHANNEL_LABEL[item.channel],
      REPORT_REGION_LABEL[item.region],
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
      REPORT_AD_STATUS_LABEL[item.adStatus].label,
    ])
    
    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.join(','))
    ].join('\n')
    
    const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' })
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = `訂單效果報表_${dayjs().format('YYYY-MM-DD')}.csv`
    link.click()
    
    message.success('導出成功')
  }

  // 查看详情
  const handleViewDetail = (record: OrderReportItem) => {
    setSelectedOrder(record)
    setDetailModalVisible(true)
  }

  // 表格列定义
  const columns: ColumnsType<OrderReportItem> = [
    {
      title: '訂單編號',
      dataIndex: 'orderNo',
      key: 'orderNo',
      width: 150,
      render: (text: string, record: OrderReportItem) => (
        <a onClick={() => handleViewDetail(record)}>{text}</a>
      ),
    },
    {
      title: '推廣活動名稱',
      dataIndex: 'promotionName',
      key: 'promotionName',
      width: 180,
      ellipsis: true,
    },
    {
      title: '推薦類型',
      dataIndex: 'recommendType',
      key: 'recommendType',
      width: 120,
      render: (type: ReportRecommendType) => (
        <Tag color={REPORT_RECOMMEND_TYPE_COLOR[type]}>
          {REPORT_RECOMMEND_TYPE_LABEL[type]}
        </Tag>
      ),
    },
    {
      title: '所屬品牌',
      dataIndex: 'app',
      key: 'app',
      width: 90,
      render: (app: ReportApp) => REPORT_APP_LABEL[app],
    },
    {
      title: '業務頻道',
      dataIndex: 'channel',
      key: 'channel',
      width: 110,
      render: (channel: ReportChannel) => REPORT_CHANNEL_LABEL[channel],
    },
    {
      title: '商圈',
      dataIndex: 'region',
      key: 'region',
      width: 80,
      render: (region: ReportRegion) => REPORT_REGION_LABEL[region],
    },
    {
      title: '推廣期間',
      dataIndex: 'promotionPeriod',
      key: 'promotionPeriod',
      width: 160,
    },
    {
      title: '曝光量',
      dataIndex: 'impressions',
      key: 'impressions',
      width: 100,
      render: (val: number) => val.toLocaleString(),
      sorter: (a, b) => a.impressions - b.impressions,
    },
    {
      title: '點擊量',
      dataIndex: 'clicks',
      key: 'clicks',
      width: 100,
      render: (val: number) => val.toLocaleString(),
      sorter: (a, b) => a.clicks - b.clicks,
    },
    {
      title: '點擊率',
      dataIndex: 'ctr',
      key: 'ctr',
      width: 90,
      render: (val: number) => `${val}%`,
      sorter: (a, b) => a.ctr - b.ctr,
    },
    {
      title: '點擊成本',
      dataIndex: 'cpc',
      key: 'cpc',
      width: 100,
      render: (val: number) => `MOP ${val.toFixed(2)}`,
      sorter: (a, b) => a.cpc - b.cpc,
    },
    {
      title: '轉化訂單',
      dataIndex: 'conversions',
      key: 'conversions',
      width: 100,
      render: (val: number) => val.toLocaleString(),
      sorter: (a, b) => a.conversions - b.conversions,
    },
    {
      title: '轉化率',
      dataIndex: 'cvr',
      key: 'cvr',
      width: 90,
      render: (val: number) => `${val}%`,
      sorter: (a, b) => a.cvr - b.cvr,
    },
    {
      title: '消耗金額',
      dataIndex: 'cost',
      key: 'cost',
      width: 110,
      render: (val: number) => `MOP ${val.toLocaleString()}`,
      sorter: (a, b) => a.cost - b.cost,
    },
    {
      title: 'ROI',
      dataIndex: 'roi',
      key: 'roi',
      width: 80,
      render: (val: number) => val.toFixed(2),
      sorter: (a, b) => a.roi - b.roi,
    },
    {
      title: '廣告狀態',
      dataIndex: 'adStatus',
      key: 'adStatus',
      width: 90,
      render: (status: ReportAdStatus) => {
        const { label, color } = REPORT_AD_STATUS_LABEL[status]
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
      timeSlot: item.timeSlotLabel,
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
            <label style={{ display: 'block', marginBottom: 4, color: '#666' }}>時間範圍</label>
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
            <label style={{ display: 'block', marginBottom: 4, color: '#666' }}>訂單編號</label>
            <Input
              placeholder="請輸入訂單編號"
              allowClear
              value={orderNo}
              onChange={(e) => setOrderNo(e.target.value)}
            />
          </div>
          <div style={{ flex: '0 0 calc(25% - 9px)' }}>
            <label style={{ display: 'block', marginBottom: 4, color: '#666' }}>推廣活動名稱</label>
            <Input
              placeholder="請輸入活動名稱"
              allowClear
              value={promotionName}
              onChange={(e) => setPromotionName(e.target.value)}
            />
          </div>
          <div style={{ flex: '0 0 calc(25% - 9px)' }}>
            <label style={{ display: 'block', marginBottom: 4, color: '#666' }}>推薦類型</label>
            <Select
              mode="multiple"
              placeholder="全部"
              allowClear
              value={recommendType}
              onChange={setRecommendType}
              options={Object.entries(REPORT_RECOMMEND_TYPE_LABEL).map(([value, label]) => ({
                value: Number(value),
                label,
              }))}
            />
          </div>
          {canViewAllBrands && (
            <div style={{ flex: '0 0 calc(25% - 9px)' }}>
              <label style={{ display: 'block', marginBottom: 4, color: '#666' }}>所屬品牌</label>
              <Select
                placeholder="全部"
                allowClear
                value={app}
                onChange={setApp}
                options={Object.entries(REPORT_APP_LABEL).map(([value, label]) => ({
                  value: Number(value),
                  label,
                }))}
              />
            </div>
          )}
          <div style={{ flex: '0 0 calc(25% - 9px)' }}>
            <label style={{ display: 'block', marginBottom: 4, color: '#666' }}>業務頻道</label>
            <Select
              placeholder="全部"
              allowClear
              value={channel}
              onChange={setChannel}
              options={Object.entries(REPORT_CHANNEL_LABEL).map(([value, label]) => ({
                value: Number(value),
                label,
              }))}
            />
          </div>
          <div style={{ flex: '0 0 calc(25% - 9px)' }}>
            <label style={{ display: 'block', marginBottom: 4, color: '#666' }}>商圈</label>
            <Select
              placeholder="全部"
              allowClear
              value={region}
              onChange={setRegion}
              options={Object.entries(REPORT_REGION_LABEL).map(([value, label]) => ({
                value: Number(value),
                label,
              }))}
            />
          </div>
          <div style={{ flex: '0 0 calc(25% - 9px)' }}>
            <label style={{ display: 'block', marginBottom: 4, color: '#666' }}>廣告狀態</label>
            <Select
              placeholder="全部"
              allowClear
              value={adStatus}
              onChange={setAdStatus}
              options={Object.entries(REPORT_AD_STATUS_LABEL).map(([value, { label }]) => ({
                value: Number(value),
                label,
              }))}
            />
          </div>
          <div style={{ flex: '0 0 auto', paddingTop: 26 }}>
            <Space>
              <Button type="primary" icon={<SearchOutlined />}>查詢</Button>
              <Button icon={<ReloadOutlined />}>重置</Button>
              <Button className="btn-export" icon={<ExportOutlined />} onClick={handleExport}>導出</Button>
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
          showTotal: (total) => `共 ${total} 條`,
        }}
        scroll={{ x: 1600 }}
        style={{ marginTop: 16 }}
      />

      {/* 详情弹窗 */}
      <Modal
        title="訂單效果詳情"
        open={detailModalVisible}
        onCancel={() => setDetailModalVisible(false)}
        footer={null}
        width={1200}
      >
        {selectedOrder && (
          <div>
            {/* 基本信息 */}
            <Card title="基本信息" style={{ marginBottom: 16 }}>
              <Row gutter={[16, 16]}>
                <Col span={6}>
                  <div style={{ fontSize: 12, color: '#999' }}>訂單編號</div>
                  <div style={{ fontSize: 16, fontWeight: 500 }}>{selectedOrder.orderNo}</div>
                </Col>
                <Col span={6}>
                  <div style={{ fontSize: 12, color: '#999' }}>推廣活動</div>
                  <div style={{ fontSize: 16, fontWeight: 500 }}>{selectedOrder.promotionName}</div>
                </Col>
                <Col span={6}>
                  <div style={{ fontSize: 12, color: '#999' }}>推薦類型</div>
                  <Tag color={REPORT_RECOMMEND_TYPE_COLOR[selectedOrder.recommendType]}>
                    {REPORT_RECOMMEND_TYPE_LABEL[selectedOrder.recommendType]}
                  </Tag>
                </Col>
                <Col span={6}>
                  <div style={{ fontSize: 12, color: '#999' }}>推廣期間</div>
                  <div style={{ fontSize: 16 }}>{selectedOrder.promotionPeriod}</div>
                </Col>
              </Row>
            </Card>

            {/* 核心指标 */}
            <Card title="核心指標" style={{ marginBottom: 16 }}>
              <Row gutter={[16, 16]}>
                <Col span={6}>
                  <Statistic title="曝光量" value={selectedOrder.impressions} suffix="次" />
                </Col>
                <Col span={6}>
                  <Statistic title="點擊量" value={selectedOrder.clicks} suffix="次" />
                </Col>
                <Col span={6}>
                  <Statistic title="點擊率" value={selectedOrder.ctr} suffix="%" precision={1} />
                </Col>
                <Col span={6}>
                  <Statistic title="點擊成本" value={selectedOrder.cpc} prefix="MOP" precision={2} />
                </Col>
                <Col span={6}>
                  <Statistic title="轉化訂單" value={selectedOrder.conversions} suffix="單" />
                </Col>
                <Col span={6}>
                  <Statistic title="轉化率" value={selectedOrder.cvr} suffix="%" precision={1} />
                </Col>
                <Col span={6}>
                  <Statistic title="消耗金額" value={selectedOrder.cost} prefix="MOP" />
                </Col>
                <Col span={6}>
                  <Statistic title="ROI" value={selectedOrder.roi} precision={2} />
                </Col>
              </Row>
            </Card>

            {/* 日趋势图 */}
            <Card title="近7天曝光趨勢" style={{ marginBottom: 16 }}>
              <Line {...detailTrendConfig} style={{ height: 250 }} />
            </Card>

            {/* 时段分析 */}
            <Card title="時段效果分析">
              <Row gutter={[16, 16]}>
                <Col span={24}>
                  <Column {...timeSlotConfig} style={{ height: 250 }} />
                </Col>
              </Row>
              <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
                {mockTimeSlotReports.map(item => (
                  <Col span={6} key={item.timeSlot}>
                    <Card size="small">
                      <div style={{ fontWeight: 500, marginBottom: 8 }}>{item.timeSlotLabel}</div>
                      <div style={{ fontSize: 12, color: '#999' }}>曝光: {item.impressions.toLocaleString()}</div>
                      <div style={{ fontSize: 12, color: '#999' }}>點擊: {item.clicks.toLocaleString()}</div>
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
