import { useState } from 'react'
import { Card, Col, Row, Statistic, Table, Select, Tag, Space } from 'antd'
import { RiseOutlined, FundOutlined, EyeOutlined, DollarOutlined, EnvironmentOutlined } from '@ant-design/icons'
import { Line, Column } from '@ant-design/charts'
import { useTranslation } from 'react-i18next'
import AppTabs from '../components/AppTabs'
import { AppType } from '../constants'

const { Option } = Select

// 广告营收数据
const REVENUE_STATS = {
  today: 128640,
  week: 856320,
  month: 3425680,
  total: 15680000,
}

// 运行中的广告数据
interface RunningAd {
  id: number
  name: string
  type: string
  channel: string
  region: string
  budget: number
  spent: number
  impressions: number
  clicks: number
  ctr: number
  status: 'running' | 'paused' | 'ended'
  startDate: string
  endDate: string
}

const RUNNING_ADS: RunningAd[] = [
  { id: 1, name: '無敵星星-首頁推廣', type: '無敵星星', channel: '大首頁', region: '澳門', budget: 50000, spent: 32000, impressions: 1250000, clicks: 58750, ctr: 4.7, status: 'running', startDate: '2026-06-01', endDate: '2026-06-30' },
  { id: 2, name: '猜你喜歡-外賣推廣', type: '猜你喜歡', channel: '外賣', region: '澳門', budget: 30000, spent: 18500, impressions: 850000, clicks: 38250, ctr: 4.5, status: 'running', startDate: '2026-06-10', endDate: '2026-07-10' },
  { id: 3, name: '流量廣告-團購推廣', type: '流量廣告', channel: '團購', region: '氹仔', budget: 25000, spent: 15200, impressions: 620000, clicks: 24800, ctr: 4.0, status: 'running', startDate: '2026-06-15', endDate: '2026-07-15' },
  { id: 4, name: '盤活復蘇-超市推廣', type: '盤活復蘇', channel: '超市', region: '珠海', budget: 20000, spent: 12800, impressions: 480000, clicks: 19200, ctr: 4.0, status: 'running', startDate: '2026-06-05', endDate: '2026-06-25' },
  { id: 5, name: '新店推送-外賣推廣', type: '新店推送', channel: '外賣', region: '澳門', budget: 15000, spent: 8900, impressions: 320000, clicks: 12800, ctr: 4.0, status: 'running', startDate: '2026-06-20', endDate: '2026-07-20' },
  { id: 6, name: '獨家商店-首頁推廣', type: '獨家商店', channel: '大首頁', region: '氹仔', budget: 40000, spent: 28000, impressions: 950000, clicks: 47500, ctr: 5.0, status: 'running', startDate: '2026-06-01', endDate: '2026-06-30' },
]

// 区域数据
const REGION_DATA = [
  { region: '澳門', revenue: 528000, ads: 45, impressions: 2850000, clicks: 128250, avgCtr: 4.5 },
  { region: '氹仔', revenue: 286000, ads: 28, impressions: 1520000, clicks: 63840, avgCtr: 4.2 },
  { region: '珠海', revenue: 185000, ads: 13, impressions: 980000, clicks: 39200, avgCtr: 4.0 },
]

// 广告趋势数据
const TREND_DATA = [
  { date: '6/1', revenue: 42000, impressions: 125000, clicks: 5625 },
  { date: '6/2', revenue: 45000, impressions: 132000, clicks: 5940 },
  { date: '6/3', revenue: 38000, impressions: 118000, clicks: 5310 },
  { date: '6/4', revenue: 51000, impressions: 145000, clicks: 6525 },
  { date: '6/5', revenue: 48000, impressions: 138000, clicks: 6210 },
  { date: '6/6', revenue: 52000, impressions: 148000, clicks: 6660 },
  { date: '6/7', revenue: 55000, impressions: 155000, clicks: 6975 },
  { date: '6/8', revenue: 49000, impressions: 142000, clicks: 6390 },
  { date: '6/9', revenue: 53000, impressions: 150000, clicks: 6750 },
  { date: '6/10', revenue: 58000, impressions: 162000, clicks: 7290 },
  { date: '6/11', revenue: 61000, impressions: 168000, clicks: 7560 },
  { date: '6/12', revenue: 56000, impressions: 158000, clicks: 7110 },
  { date: '6/13', revenue: 62000, impressions: 172000, clicks: 7740 },
  { date: '6/14', revenue: 65000, impressions: 178000, clicks: 8010 },
]

const AD_TYPE_COLORS: Record<string, string> = {
  '猜你喜歡': 'blue',
  '無敵星星': 'purple',
  '新店推送': 'green',
  '盤活復蘇': 'orange',
  '獨家商店': 'red',
  '流量廣告': 'gold',
}

export default function Dashboard() {
  const { t } = useTranslation()
  const [activeApp, setActiveApp] = useState<AppType>(AppType.SHANFENG)
  const [selectedAd, setSelectedAd] = useState<string>('all')
  const [selectedRegion, setSelectedRegion] = useState<string>('all')

  /** 广告状态配置（依赖 t，定义在组件内以便响应语言切换） */
  const STATUS_CONFIG = {
    running: { color: 'success' as const, text: t('recommendDashboard.statusRunning') },
    paused: { color: 'default' as const, text: t('recommendDashboard.statusPaused') },
    ended: { color: 'error' as const, text: t('recommendDashboard.statusEnded') },
  }

  // 广告表格列
  const adColumns = [
    { title: t('recommendDashboard.colAdName'), dataIndex: 'name', key: 'name', width: 180 },
    { 
      title: t('recommendDashboard.colAdType'), 
      dataIndex: 'type', 
      key: 'type',
      render: (type: string) => <Tag color={AD_TYPE_COLORS[type]}>{type}</Tag>
    },
    { title: t('recommendDashboard.colChannel'), dataIndex: 'channel', key: 'channel', width: 80 },
    { title: t('recommendDashboard.colRegion'), dataIndex: 'region', key: 'region', width: 80 },
    { 
      title: t('recommendDashboard.colBudgetSpent'), 
      key: 'budget',
      render: (_: unknown, record: RunningAd) => (
        <span>
          <span style={{ color: '#999' }}>MOP {record.budget.toLocaleString()}</span>
          {' / '}
          <span style={{ color: '#1677ff', fontWeight: 500 }}>MOP {record.spent.toLocaleString()}</span>
        </span>
      ),
    },
    { 
      title: t('recommendDashboard.colImpressions'), 
      dataIndex: 'impressions', 
      key: 'impressions',
      render: (v: number) => v.toLocaleString(),
    },
    { 
      title: t('recommendDashboard.colClicks'), 
      dataIndex: 'clicks', 
      key: 'clicks',
      render: (v: number) => v.toLocaleString(),
    },
    { 
      title: t('recommendDashboard.colCtr'), 
      dataIndex: 'ctr', 
      key: 'ctr',
      render: (v: number) => `${v}%`,
    },
    { 
      title: t('common.colStatus'), 
      dataIndex: 'status', 
      key: 'status',
      render: (status: 'running' | 'paused' | 'ended') => (
        <Tag color={STATUS_CONFIG[status].color}>{STATUS_CONFIG[status].text}</Tag>
      ),
    },
  ]

  // 区域表格列
  const regionColumns = [
    { title: t('recommendDashboard.colRegion'), dataIndex: 'region', key: 'region', width: 100 },
    { 
      title: t('recommendDashboard.colAdRevenue'), 
      dataIndex: 'revenue', 
      key: 'revenue',
      render: (v: number) => (
        <span style={{ color: '#3f8600', fontWeight: 600, fontSize: 16 }}>
          MOP {v.toLocaleString()}
        </span>
      ),
    },
    { title: t('recommendDashboard.colRunningAdsCount'), dataIndex: 'ads', key: 'ads', width: 120 },
    { 
      title: t('recommendDashboard.colTotalImpressions'), 
      dataIndex: 'impressions', 
      key: 'impressions',
      render: (v: number) => v.toLocaleString(),
    },
    { 
      title: t('recommendDashboard.colTotalClicks'), 
      dataIndex: 'clicks', 
      key: 'clicks',
      render: (v: number) => v.toLocaleString(),
    },
    { 
      title: t('recommendDashboard.colAvgCtr'), 
      dataIndex: 'avgCtr', 
      key: 'avgCtr',
      render: (v: number) => `${v}%`,
    },
  ]

  // 营收趋势图配置
  const revenueChartConfig = {
    data: TREND_DATA,
    xField: 'date',
    yField: 'revenue',
    smooth: true,
    color: '#1677ff',
    point: {
      size: 4,
      shape: 'circle',
    },
    areaStyle: {
      fill: 'l(270) 0:#ffffff 0.5:#bae7ff 1:#1677ff',
    },
    label: {
      position: 'top',
      formatter: (v: Record<string, number>) => `MOP ${(v.revenue / 1000).toFixed(0)}k`,
    },
    xAxis: {
      label: {
        autoRotate: false,
      },
    },
    yAxis: {
      label: {
        formatter: (v: number) => `MOP ${(v / 1000).toFixed(0)}k`,
      },
    },
    tooltip: {
      formatter: (v: Record<string, number>) => ({
        name: t('recommendDashboard.chartAdRevenue'),
        value: `MOP ${v.revenue.toLocaleString()}`,
      }),
    },
  }

  // 区域营收柱状图配置
  const regionChartConfig = {
    data: REGION_DATA,
    xField: 'region',
    yField: 'revenue',
    color: ['#1677ff', '#722ed1', '#52c41a'],
    label: {
      position: 'top',
      formatter: (v: Record<string, number>) => `MOP ${(v.revenue / 1000).toFixed(0)}k`,
    },
    yAxis: {
      label: {
        formatter: (v: number) => `MOP ${(v / 1000).toFixed(0)}k`,
      },
    },
    tooltip: {
      formatter: (v: Record<string, number>) => ({
        name: t('recommendDashboard.chartAdRevenue'),
        value: `MOP ${v.revenue.toLocaleString()}`,
      }),
    },
  }

  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <h2>{t('recommendDashboard.pageTitle')}</h2>
      </div>
      <AppTabs value={activeApp} onChange={setActiveApp} />

      {/* 1. 广告营收统计卡片 */}
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col span={6}>
          <Card>
            <Statistic
              title={t('recommendDashboard.statTodayRevenue')}
              value={REVENUE_STATS.today}
              precision={2}
              prefix={<DollarOutlined style={{ color: '#3f8600' }} />}
              suffix="MOP"
              valueStyle={{ color: '#3f8600' }}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic
              title={t('recommendDashboard.statWeekRevenue')}
              value={REVENUE_STATS.week}
              precision={2}
              prefix={<RiseOutlined style={{ color: '#1677ff' }} />}
              suffix="MOP"
              valueStyle={{ color: '#1677ff' }}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic
              title={t('recommendDashboard.statRunningAds')}
              value={RUNNING_ADS.filter(ad => ad.status === 'running').length}
              prefix={<FundOutlined style={{ color: '#722ed1' }} />}
              valueStyle={{ color: '#722ed1' }}
              suffix={t('recommendDashboard.statAdsSuffix')}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic
              title={t('recommendDashboard.statTotalImpressions')}
              value={RUNNING_ADS.reduce((sum, ad) => sum + ad.impressions, 0)}
              prefix={<EyeOutlined style={{ color: '#fa8c16' }} />}
              valueStyle={{ color: '#fa8c16' }}
            />
          </Card>
        </Col>
      </Row>

      {/* 2. 运行中的广告列表 */}
      <Card 
        title={t('recommendDashboard.runningAdsTitle')} 
        style={{ marginBottom: 24 }}
        extra={
          <Space>
            <Select
              placeholder={t('recommendDashboard.placeholderAdType')}
              style={{ width: 150 }}
              allowClear
              value={selectedAd}
              onChange={setSelectedAd}
            >
              <Option value="all">{t('recommendDashboard.allAds')}</Option>
              <Option value="猜你喜歡">猜你喜歡</Option>
              <Option value="無敵星星">無敵星星</Option>
              <Option value="新店推送">新店推送</Option>
              <Option value="盤活復蘇">盤活復蘇</Option>
              <Option value="獨家商店">獨家商店</Option>
              <Option value="流量廣告">流量廣告</Option>
            </Select>
            <Select
              placeholder={t('recommendDashboard.placeholderRegion')}
              style={{ width: 120 }}
              allowClear
              value={selectedRegion}
              onChange={setSelectedRegion}
            >
              <Option value="all">{t('recommendDashboard.allRegions')}</Option>
              <Option value="澳門">澳門</Option>
              <Option value="氹仔">氹仔</Option>
              <Option value="珠海">珠海</Option>
            </Select>
          </Space>
        }
      >
        <Table<RunningAd>
          rowKey="id"
          columns={adColumns}
          dataSource={RUNNING_ADS.filter(ad => {
            if (selectedAd !== 'all' && ad.type !== selectedAd) return false
            if (selectedRegion !== 'all' && ad.region !== selectedRegion) return false
            return true
          })}
          pagination={{ pageSize: 10, showTotal: (total) => t('common.total', { count: total }), showSizeChanger: true, pageSizeOptions: ['10', '20', '50'], showQuickJumper: true }}
          size="small"
        />
      </Card>

      {/* 3. 广告推广趋势图 */}
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col span={16}>
          <Card title={t('recommendDashboard.chartRevenueTrend')} style={{ minHeight: 320 }}>
            <Line {...revenueChartConfig} height={260} />
          </Card>
        </Col>
        <Col span={8}>
          <Card title={t('recommendDashboard.chartRegionDistribution')} style={{ minHeight: 320 }}>
            <Column {...regionChartConfig} height={260} />
          </Card>
        </Col>
      </Row>

      {/* 4. 区域数据地图 */}
      <Card 
        title={
          <span>
            <EnvironmentOutlined style={{ marginRight: 8, color: '#1677ff' }} />
            {t('recommendDashboard.regionOverview')}
          </span>
        }
        style={{ marginBottom: 24 }}
      >
        <Row gutter={[16, 16]}>
          <Col span={16}>
            {/* 模拟地图展示 */}
            <div style={{ 
              height: 300, 
              background: 'linear-gradient(135deg, #E8720C 0%, #F39C12 100%)',
              borderRadius: 8,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              position: 'relative',
              overflow: 'hidden'
            }}>
              <div style={{ color: '#fff', textAlign: 'center', zIndex: 1 }}>
                <h3 style={{ margin: '0 0 16px 0', fontSize: 24 }}>{t('recommendDashboard.heatmapTitle')}</h3>
                <p style={{ margin: 0, opacity: 0.9 }}>{t('recommendDashboard.heatmapSubtitle', { count: 3, ads: 86 })}</p>
              </div>
              {/* 模拟区域标记 */}
              <div style={{
                position: 'absolute',
                top: '30%',
                left: '25%',
                width: 120,
                height: 80,
                background: 'rgba(255,255,255,0.2)',
                borderRadius: '50%',
                filter: 'blur(20px)'
              }} />
              <div style={{
                position: 'absolute',
                top: '50%',
                left: '50%',
                width: 150,
                height: 100,
                background: 'rgba(255,255,255,0.3)',
                borderRadius: '50%',
                filter: 'blur(25px)'
              }} />
              <div style={{
                position: 'absolute',
                top: '40%',
                left: '70%',
                width: 100,
                height: 70,
                background: 'rgba(255,255,255,0.25)',
                borderRadius: '50%',
                filter: 'blur(18px)'
              }} />
            </div>
          </Col>
          <Col span={8}>
            <Table
              columns={regionColumns}
              dataSource={REGION_DATA}
              pagination={false}
              size="small"
            />
          </Col>
        </Row>
      </Card>
    </div>
  )
}
