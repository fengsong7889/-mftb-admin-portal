import { useState } from 'react'
import { Card, Row, Col, Statistic, Table, Tag, Badge, Select, DatePicker, Space, Alert, Progress } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { ArrowUpOutlined, ArrowDownOutlined, WarningOutlined, CheckCircleOutlined } from '@ant-design/icons'
import { 
  AppType, 
  RecommendChannel, 
  RecallDimension,
  RECOMMEND_CHANNEL_OPTIONS,
  RECALL_DIMENSION_OPTIONS,
  RECALL_DIMENSION_COLOR,
} from '../constants'
import { 
  Line, 
  Column,
  Pie,
} from '@ant-design/charts'
import dayjs from 'dayjs'

const { RangePicker } = DatePicker

const CHANNEL_LABEL: Record<RecommendChannel, string> = {
  [RecommendChannel.HOME]: '大首頁',
  [RecommendChannel.DELIVERY]: '外賣',
  [RecommendChannel.GROUP_BUY]: '團購',
  [RecommendChannel.SUPERMARKET]: '超市',
}

const DIMENSION_LABEL: Record<RecallDimension, string> = {
  [RecallDimension.MERCHANT]: '商家維度',
  [RecommendChannel.ITEM]: '商品維度',
  [RecallDimension.COMMERCIAL]: '商業維度',
  [RecallDimension.USER]: '用戶維度',
  [RecallDimension.PLATFORM]: '平台維度',
}

// Mock数据 - 核心指标
const metricsData = {
  totalRecallCoverage: 78.5, // 召回覆盖率 %
  avgHitRate: 45.2, // 平均命中率 %
  avgConversionRate: 12.8, // 平均转化率 %
  activeStrategies: 18, // 活跃策略数
  totalRecallCount: 15680, // 总召回数量
  yesterdayComparison: {
    coverage: +2.3,
    hitRate: -1.5,
    conversion: +0.8,
  }
}

// Mock数据 - 召回路效果对比
const recallPerformanceData = [
  {
    id: 1,
    name: '外賣午市多路召回',
    dimension: RecallDimension.MERCHANT,
    recallCount: 200,
    hitRate: 52.3,
    conversionRate: 15.2,
    ctr: 8.5,
    cvr: 3.2,
    trend: 'up',
  },
  {
    id: 2,
    name: '團購個性化召回',
    dimension: RecallDimension.USER,
    recallCount: 150,
    hitRate: 48.7,
    conversionRate: 14.8,
    ctr: 7.9,
    cvr: 2.9,
    trend: 'up',
  },
  {
    id: 3,
    name: '超市熱門商品召回',
    dimension: RecallDimension.PLATFORM,
    recallCount: 180,
    hitRate: 41.2,
    conversionRate: 11.5,
    ctr: 6.8,
    cvr: 2.5,
    trend: 'down',
  },
  {
    id: 4,
    name: '商業廣告主優先召回',
    dimension: RecallDimension.COMMERCIAL,
    recallCount: 100,
    hitRate: 65.8,
    conversionRate: 22.3,
    ctr: 12.5,
    cvr: 5.8,
    trend: 'up',
  },
  {
    id: 5,
    name: '大首頁混合召回',
    dimension: RecallDimension.MERCHANT,
    recallCount: 250,
    hitRate: 38.5,
    conversionRate: 10.2,
    ctr: 5.9,
    cvr: 2.1,
    trend: 'stable',
  },
  {
    id: 6,
    name: '外賣早餐時段召回',
    dimension: RecallDimension.ITEM,
    recallCount: 120,
    hitRate: 35.2,
    conversionRate: 9.8,
    ctr: 5.2,
    cvr: 1.9,
    trend: 'down',
  },
]

// Mock数据 - 业务频道对比
const channelComparisonData = {
  [RecommendChannel.DELIVERY]: {
    recallCount: 8500,
    hitRate: 48.5,
    conversionRate: 14.2,
    timeSlots: [
      { time: '早餐', hitRate: 35.2, conversion: 9.8 },
      { time: '午餐', hitRate: 52.3, conversion: 15.2 },
      { time: '下午茶', hitRate: 42.1, conversion: 11.5 },
      { time: '晚餐', hitRate: 55.8, conversion: 16.8 },
      { time: '夜宵', hitRate: 38.5, conversion: 10.2 },
    ]
  },
  [RecommendChannel.GROUP_BUY]: {
    recallCount: 4200,
    hitRate: 46.8,
    conversionRate: 13.5,
    timeSlots: [
      { time: '全天', hitRate: 46.8, conversion: 13.5 },
    ]
  },
  [RecommendChannel.SUPERMARKET]: {
    recallCount: 2980,
    hitRate: 41.2,
    conversionRate: 11.5,
    timeSlots: [
      { time: '全天', hitRate: 41.2, conversion: 11.5 },
    ]
  },
}

// Mock数据 - 优化建议
const optimizationSuggestions = [
  {
    id: 1,
    type: 'warning',
    title: '低效召回策略告警',
    content: '「外賣早餐時段召回」命中率僅35.2%，低於平均值45.2%，建議優化召回源配置或調整召回數量',
    strategyName: '外賣早餐時段召回',
    metric: '命中率',
    value: 35.2,
    threshold: 40,
  },
  {
    id: 2,
    type: 'success',
    title: '高效召回策略推薦',
    content: '「商業廣告主優先召回」轉化率達22.3%，高於平均值12.8%，建議擴大召回數量或複製策略到其他頻道',
    strategyName: '商業廣告主優先召回',
    metric: '轉化率',
    value: 22.3,
    threshold: 20,
  },
  {
    id: 3,
    type: 'warning',
    title: '召回數量過少',
    content: '「商業廣告主優先召回」僅召回100條，可能影響最終展示效果，建議增加到150-200條',
    strategyName: '商業廣告主優先召回',
    metric: '召回數量',
    value: 100,
    threshold: 150,
  },
]

// 召回趋势图数据
const trendData = Array.from({ length: 30 }, (_, i) => {
  const date = dayjs().subtract(29 - i, 'day').format('YYYY-MM-DD')
  return {
    date,
    recallCount: Math.floor(12000 + Math.random() * 6000),
    hitRate: 40 + Math.random() * 15,
    conversionRate: 10 + Math.random() * 8,
  }
})

export default function RecallAnalysis() {
  const [activeChannel, setActiveChannel] = useState<RecommendChannel>(RecommendChannel.DELIVERY)
  const [dateRange, setDateRange] = useState<[dayjs.Dayjs, dayjs.Dayjs]>([
    dayjs().subtract(30, 'day'),
    dayjs(),
  ])

  // 召回路效果对比表格列
  const performanceColumns: ColumnsType<typeof recallPerformanceData[0]> = [
    {
      title: '召回策略',
      dataIndex: 'name',
      key: 'name',
      width: 180,
      render: (text) => <strong>{text}</strong>,
    },
    {
      title: '召回維度',
      dataIndex: 'dimension',
      key: 'dimension',
      width: 110,
      render: (v: RecallDimension) => (
        <Tag color={RECALL_DIMENSION_COLOR[v]}>{DIMENSION_LABEL[v]}</Tag>
      ),
    },
    {
      title: '召回數量',
      dataIndex: 'recallCount',
      key: 'recallCount',
      width: 100,
      sorter: (a, b) => a.recallCount - b.recallCount,
      render: (v: number) => `${v}條`,
    },
    {
      title: '命中率',
      dataIndex: 'hitRate',
      key: 'hitRate',
      width: 100,
      sorter: (a, b) => a.hitRate - b.hitRate,
      render: (v: number) => (
        <Space>
          <Progress 
            type="circle" 
            percent={v} 
            size={40} 
            strokeColor={v > 50 ? '#52c41a' : v > 40 ? '#faad14' : '#ff4d4f'}
            format={() => `${v}%`}
          />
        </Space>
      ),
    },
    {
      title: '轉化率',
      dataIndex: 'conversionRate',
      key: 'conversionRate',
      width: 100,
      sorter: (a, b) => a.conversionRate - b.conversionRate,
      render: (v: number) => (
        <Space>
          <Progress 
            type="circle" 
            percent={v * 5} 
            size={40} 
            strokeColor={v > 15 ? '#52c41a' : v > 10 ? '#faad14' : '#ff4d4f'}
            format={() => `${v}%`}
          />
        </Space>
      ),
    },
    {
      title: 'CTR',
      dataIndex: 'ctr',
      key: 'ctr',
      width: 80,
      render: (v: number) => `${v}%`,
    },
    {
      title: 'CVR',
      dataIndex: 'cvr',
      key: 'cvr',
      width: 80,
      render: (v: number) => `${v}%`,
    },
    {
      title: '趨勢',
      dataIndex: 'trend',
      key: 'trend',
      width: 80,
      render: (v: string) => {
        if (v === 'up') return <Tag color="success" icon={<ArrowUpOutlined />}>上升</Tag>
        if (v === 'down') return <Tag color="error" icon={<ArrowDownOutlined />}>下降</Tag>
        return <Tag>穩定</Tag>
      },
    },
  ]

  // 趋势图配置
  const lineConfig = {
    data: trendData,
    xField: 'date',
    yField: 'hitRate',
    seriesField: 'date',
    smooth: true,
    animation: {
      appear: {
        animation: 'path-in',
        duration: 1000,
      },
    },
    color: ['#1890ff'],
  }

  // 时段对比柱状图配置
  const columnConfig = {
    data: channelComparisonData[activeChannel]?.timeSlots || [],
    xField: 'time',
    yField: 'hitRate',
    seriesField: 'time',
    color: ['#1890ff', '#52c41a', '#faad14', '#722ed1', '#13c2c2'],
    label: {
      position: 'middle',
      style: {
        fill: '#FFFFFF',
        opacity: 0.6,
      },
    },
  }

  return (
    <div className="content-area">
      {/* 筛选区域 */}
      <div className="search-section" style={{ marginBottom: 16 }}>
        <Space size="middle">
          <span style={{ fontWeight: 500 }}>業務頻道:</span>
          <Select
            value={activeChannel}
            onChange={setActiveChannel}
            options={RECOMMEND_CHANNEL_OPTIONS}
            style={{ width: 160 }}
          />
          <RangePicker 
            value={dateRange}
            onChange={(dates) => {
              if (dates && dates[0] && dates[1]) {
                setDateRange([dates[0], dates[1]])
              }
            }}
          />
        </Space>
      </div>

      {/* 核心指标卡片 */}
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col span={6}>
          <Card>
            <Statistic
              title="召回覆蓋率"
              value={metricsData.totalRecallCoverage}
              precision={1}
              suffix="%"
              valueStyle={{ color: '#1890ff' }}
              prefix={<ArrowUpOutlined />}
            />
            <div style={{ marginTop: 8, fontSize: 12, color: '#999' }}>
              較昨日 <span style={{ color: metricsData.yesterdayComparison.coverage > 0 ? '#52c41a' : '#ff4d4f' }}>
                {metricsData.yesterdayComparison.coverage > 0 ? '+' : ''}{metricsData.yesterdayComparison.coverage}%
              </span>
            </div>
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic
              title="平均命中率"
              value={metricsData.avgHitRate}
              precision={1}
              suffix="%"
              valueStyle={{ color: '#52c41a' }}
              prefix={metricsData.yesterdayComparison.hitRate > 0 ? <ArrowUpOutlined /> : <ArrowDownOutlined />}
            />
            <div style={{ marginTop: 8, fontSize: 12, color: '#999' }}>
              較昨日 <span style={{ color: metricsData.yesterdayComparison.hitRate > 0 ? '#52c41a' : '#ff4d4f' }}>
                {metricsData.yesterdayComparison.hitRate > 0 ? '+' : ''}{metricsData.yesterdayComparison.hitRate}%
              </span>
            </div>
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic
              title="平均轉化率"
              value={metricsData.avgConversionRate}
              precision={1}
              suffix="%"
              valueStyle={{ color: '#722ed1' }}
              prefix={<ArrowUpOutlined />}
            />
            <div style={{ marginTop: 8, fontSize: 12, color: '#999' }}>
              較昨日 <span style={{ color: metricsData.yesterdayComparison.conversion > 0 ? '#52c41a' : '#ff4d4f' }}>
                {metricsData.yesterdayComparison.conversion > 0 ? '+' : ''}{metricsData.yesterdayComparison.conversion}%
              </span>
            </div>
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic
              title="活躍策略數"
              value={metricsData.activeStrategies}
              suffix="個"
              valueStyle={{ color: '#fa8c16' }}
            />
            <div style={{ marginTop: 8, fontSize: 12, color: '#999' }}>
              總召回 <strong style={{ color: '#1890ff' }}>{metricsData.totalRecallCount.toLocaleString()}</strong> 條
            </div>
          </Card>
        </Col>
      </Row>

      {/* 召回趋势图 */}
      <Card title="召回趨勢 (近30天)" style={{ marginBottom: 24 }}>
        <Line {...lineConfig} height={300} />
      </Card>

      {/* 召回路效果对比 */}
      <Card title="召回路效果對比" style={{ marginBottom: 24 }}>
        <Table
          rowKey="id"
          columns={performanceColumns}
          dataSource={recallPerformanceData}
          pagination={{
            pageSize: 10,
            showTotal: (total) => `共 ${total} 條`,
            showSizeChanger: true,
            pageSizeOptions: ['10', '20'],
            showQuickJumper: true,
          }}
        />
      </Card>

      {/* 业务频道时段对比 */}
      <Card title={`業務頻道時段對比 - ${CHANNEL_LABEL[activeChannel]}`} style={{ marginBottom: 24 }}>
        <Row gutter={24}>
          <Col span={12}>
            <Column {...columnConfig} height={300} />
          </Col>
          <Col span={12}>
            <div style={{ padding: '20px 0' }}>
              <h4 style={{ marginBottom: 16 }}>時段數據明細</h4>
              {channelComparisonData[activeChannel]?.timeSlots.map((slot, index) => (
                <div key={index} style={{ marginBottom: 12, padding: 12, background: '#f5f5f5', borderRadius: 4 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                    <strong>{slot.time}</strong>
                    <Space>
                      <Tag color="blue">命中率: {slot.hitRate}%</Tag>
                      <Tag color="green">轉化率: {slot.conversion}%</Tag>
                    </Space>
                  </div>
                  <div style={{ fontSize: 12, color: '#999' }}>
                    召回數量: {channelComparisonData[activeChannel].recallCount.toLocaleString()} 條
                  </div>
                </div>
              ))}
            </div>
          </Col>
        </Row>
      </Card>

      {/* 优化建议 */}
      <Card title="優化建議">
        <Space direction="vertical" style={{ width: '100%' }} size="middle">
          {optimizationSuggestions.map(suggestion => (
            <Alert
              key={suggestion.id}
              message={suggestion.title}
              description={suggestion.content}
              type={suggestion.type === 'warning' ? 'warning' : 'success'}
              icon={suggestion.type === 'warning' ? <WarningOutlined /> : <CheckCircleOutlined />}
              showIcon
              style={{ marginBottom: 0 }}
            />
          ))}
        </Space>
      </Card>
    </div>
  )
}
