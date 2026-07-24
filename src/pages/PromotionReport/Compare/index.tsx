import { useState } from 'react'
import { Card, Row, Col, Select, DatePicker, Table, Tag, Statistic } from 'antd'
import {
  Line,
  Scatter,
} from '@ant-design/charts'
import dayjs from 'dayjs'
import type { ColumnsType } from 'antd/es/table'
import { useAuth } from '../../../contexts/AuthContext'
import {
  ReportApp,
  ReportChannel,
  ReportRegion,
  ReportRecommendType,
  REPORT_APP_LABEL,
  REPORT_CHANNEL_LABEL,
  REPORT_REGION_LABEL,
  REPORT_RECOMMEND_TYPE_LABEL,
  REPORT_RECOMMEND_TYPE_COLOR,
} from '../types'
import { mockRecommendTypeCompare, mockDailyTrends } from '../mockData'
import '../index.css'

const { RangePicker } = DatePicker

export default function PromotionReportCompare() {
  const { user } = useAuth()
  const [dateRange, setDateRange] = useState<[dayjs.Dayjs, dayjs.Dayjs]>([
    dayjs().subtract(29, 'day'),
    dayjs(),
  ])
  const [app, setApp] = useState<ReportApp | undefined>(undefined)
  const [channel, setChannel] = useState<ReportChannel | undefined>(undefined)
  const [region, setRegion] = useState<ReportRegion | undefined>(undefined)

  // 权限控制
  const canViewAllBrands = user?.role === 'admin'

  // 对比表格列定义
  const columns: ColumnsType<typeof mockRecommendTypeCompare[0]> = [
    {
      title: '推薦類型',
      dataIndex: 'recommendTypeLabel',
      key: 'recommendTypeLabel',
      width: 120,
      fixed: 'left' as const,
      render: (text: string, record: typeof mockRecommendTypeCompare[0]) => (
        <Tag color={REPORT_RECOMMEND_TYPE_COLOR[record.recommendType]} style={{ fontSize: 14 }}>
          {text}
        </Tag>
      ),
    },
    {
      title: '訂單數量',
      dataIndex: 'orderCount',
      key: 'orderCount',
      width: 100,
      render: (val: number) => `${val} 個`,
    },
    {
      title: '總曝光量',
      dataIndex: 'totalImpressions',
      key: 'totalImpressions',
      width: 120,
      render: (val: number) => val.toLocaleString(),
      sorter: (a, b) => a.totalImpressions - b.totalImpressions,
    },
    {
      title: '總點擊量',
      dataIndex: 'totalClicks',
      key: 'totalClicks',
      width: 120,
      render: (val: number) => val.toLocaleString(),
      sorter: (a, b) => a.totalClicks - b.totalClicks,
    },
    {
      title: '平均CTR',
      dataIndex: 'avgCtr',
      key: 'avgCtr',
      width: 100,
      render: (val: number) => `${val}%`,
      sorter: (a, b) => a.avgCtr - b.avgCtr,
    },
    {
      title: '平均CPC',
      dataIndex: 'avgCpc',
      key: 'avgCpc',
      width: 110,
      render: (val: number) => `MOP ${val.toFixed(2)}`,
      sorter: (a, b) => a.avgCpc - b.avgCpc,
    },
    {
      title: '平均CVR',
      dataIndex: 'avgCvr',
      key: 'avgCvr',
      width: 100,
      render: (val: number) => `${val}%`,
      sorter: (a, b) => a.avgCvr - b.avgCvr,
    },
    {
      title: '總消耗',
      dataIndex: 'totalCost',
      key: 'totalCost',
      width: 120,
      render: (val: number) => `MOP ${val.toLocaleString()}`,
      sorter: (a, b) => a.totalCost - b.totalCost,
    },
    {
      title: '總產出',
      dataIndex: 'totalRevenue',
      key: 'totalRevenue',
      width: 120,
      render: (val: number) => `MOP ${val.toLocaleString()}`,
      sorter: (a, b) => a.totalRevenue - b.totalRevenue,
    },
    {
      title: '平均ROI',
      dataIndex: 'avgRoi',
      key: 'avgRoi',
      width: 100,
      render: (val: number) => (
        <span style={{ fontWeight: 500, color: val >= 3 ? '#52c41a' : val >= 2 ? '#faad14' : '#ff4d4f' }}>
          {val.toFixed(2)}
        </span>
      ),
      sorter: (a, b) => a.avgRoi - b.avgRoi,
    },
  ]

  // 趋势图配置
  const ctrTrendConfig = {
    data: mockDailyTrends.map(d => ({
      date: d.date,
      type: 'CTR',
      value: (d.clicks / d.impressions * 100).toFixed(2),
    })),
    xField: 'date',
    yField: 'value',
    seriesField: 'type',
    smooth: true,
    color: ['#1890ff'],
    yAxis: {
      label: {
        formatter: (v: string) => `${v}%`,
      },
    },
  }

  const cpcTrendConfig = {
    ...ctrTrendConfig,
    data: mockDailyTrends.map(d => ({
      date: d.date,
      type: 'CPC',
      value: (d.cost / d.clicks).toFixed(2),
    })),
    color: ['#52c41a'],
    yAxis: {
      label: {
        formatter: (v: string) => `MOP ${v}`,
      },
    },
  }

  const costTrendConfig = {
    ...ctrTrendConfig,
    data: mockDailyTrends.map(d => ({
      date: d.date,
      type: '消耗',
      value: d.cost,
    })),
    color: ['#faad14'],
    yAxis: {
      label: {
        formatter: (v: string) => `MOP ${(Number(v) / 1000).toFixed(0)}K`,
      },
    },
  }

  // 散点图配置 (效益矩阵)
  const scatterConfig = {
    data: mockRecommendTypeCompare.map(item => ({
      type: item.recommendTypeLabel,
      cpc: item.avgCpc,
      cvr: item.avgCvr,
      cost: item.totalCost,
    })),
    xField: 'cpc',
    yField: 'cvr',
    sizeField: 'cost',
    colorField: 'type',
    size: [10, 30],
    shape: 'circle',
    xAxis: {
      title: {
        text: '點擊成本 (CPC)',
      },
      label: {
        formatter: (v: string) => `MOP ${v}`,
      },
    },
    yAxis: {
      title: {
        text: '轉化率 (CVR)',
      },
      label: {
        formatter: (v: string) => `${v}%`,
      },
    },
    label: {
      content: (data: any) => data.type,
    },
    color: ['#faad14', '#52c41a', '#1890ff', '#722ed1'],
    tooltip: {
      formatter: (data: any) => ({
        name: data.type,
        value: `CPC: MOP ${data.cpc}<br/>CVR: ${data.cvr}%<br/>消耗: MOP ${data.cost.toLocaleString()}`,
      }),
    },
  }

  return (
    <div className="promotion-report-compare">
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
                }
              }}
              style={{ width: '100%' }}
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
        </form>
      </div>

      {/* 数据卡片对比 */}
      <Card title="推薦類型核心指標對比" style={{ marginTop: 16, marginBottom: 16 }}>
        <Row gutter={[16, 16]}>
          {mockRecommendTypeCompare.map(item => (
            <Col xs={24} sm={12} lg={6} key={item.recommendType}>
              <Card
                size="small"
                style={{
                  border: `2px solid ${REPORT_RECOMMEND_TYPE_COLOR[item.recommendType]}`,
                  borderRadius: 8,
                }}
              >
                <div style={{ textAlign: 'center', marginBottom: 16 }}>
                  <Tag color={REPORT_RECOMMEND_TYPE_COLOR[item.recommendType]} style={{ fontSize: 16, padding: '4px 12px' }}>
                    {item.recommendTypeLabel}
                  </Tag>
                </div>
                <Row gutter={[8, 12]}>
                  <Col span={12}>
                    <Statistic title="總曝光" value={item.totalImpressions} suffix="" precision={0} valueStyle={{ fontSize: 16 }} />
                  </Col>
                  <Col span={12}>
                    <Statistic title="總點擊" value={item.totalClicks} suffix="" precision={0} valueStyle={{ fontSize: 16 }} />
                  </Col>
                  <Col span={12}>
                    <Statistic title="平均CTR" value={item.avgCtr} suffix="%" precision={1} valueStyle={{ fontSize: 16 }} />
                  </Col>
                  <Col span={12}>
                    <Statistic title="平均CVR" value={item.avgCvr} suffix="%" precision={1} valueStyle={{ fontSize: 16 }} />
                  </Col>
                  <Col span={12}>
                    <Statistic title="平均CPC" value={item.avgCpc} prefix="MOP" precision={2} valueStyle={{ fontSize: 16 }} />
                  </Col>
                  <Col span={12}>
                    <Statistic title="平均ROI" value={item.avgRoi} precision={2} valueStyle={{ fontSize: 16, color: item.avgRoi >= 3 ? '#52c41a' : '#faad14' }} />
                  </Col>
                  <Col span={24}>
                    <Statistic title="總消耗" value={item.totalCost} prefix="MOP" precision={0} valueStyle={{ fontSize: 18, fontWeight: 500 }} />
                  </Col>
                </Row>
              </Card>
            </Col>
          ))}
        </Row>
      </Card>

      {/* 对比表格 */}
      <Card title="詳細數據對比" style={{ marginBottom: 16 }}>
        <Table
          columns={columns}
          dataSource={mockRecommendTypeCompare}
          rowKey="recommendType"
          pagination={false}
          scroll={{ x: 1200 }}
        />
      </Card>

      {/* 趋势图 */}
      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={24} lg={8}>
          <Card title="CTR趨勢對比">
            <Line {...ctrTrendConfig} style={{ height: 280 }} />
          </Card>
        </Col>
        <Col xs={24} lg={8}>
          <Card title="CPC趨勢對比">
            <Line {...cpcTrendConfig} style={{ height: 280 }} />
          </Card>
        </Col>
        <Col xs={24} lg={8}>
          <Card title="消耗趨勢對比">
            <Line {...costTrendConfig} style={{ height: 280 }} />
          </Card>
        </Col>
      </Row>

      {/* 效益矩阵图 */}
      <Card title="效益矩陣 (低成本高轉化)">
        <div style={{ marginBottom: 12, padding: 12, background: '#f6ffed', borderRadius: 4 }}>
          <strong>💡 解讀指南:</strong> 
          <span style={{ marginLeft: 8 }}>
            散點圖展示各推薦類型的成本效益關係。
            <strong style={{ color: '#52c41a' }}> 左上角</strong> = 低成本高轉化(最優)，
            <strong style={{ color: '#ff4d4f' }}> 右下角</strong> = 高成本低轉化(需優化)
          </span>
        </div>
        <Scatter {...scatterConfig} style={{ height: 400 }} />
      </Card>
    </div>
  )
}
