import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { Button, Input, Select, DatePicker, Table, Form, Card, Row, Col, Statistic } from 'antd'
import type { TableColumnsType } from 'antd'
import {
  SearchOutlined,
  ReloadOutlined,
  ExportOutlined,
  ArrowUpOutlined,
} from '@ant-design/icons'
import { Line, Column, Pie } from '@ant-design/charts'
import { useColumnConfig } from '../../hooks/useColumnConfig'
import { BRAND_OPTIONS_WITH_ALL as brandOptions } from '../../constants/brand'

const { RangePicker } = DatePicker

interface ReportData {
  key: string
  date: string
  hintWord: string
  hintType: string
  searchPage: string
  brand: string
  terminal: string
  region: string
  showCount: number
  clickCount: number
  clickRate: string
  jumpCount: number
}

const mockData: ReportData[] = [
  { key: '1', date: '2026-06-05', hintWord: '今日特惠外賣', hintType: '運營推廣', searchPage: '大首頁', brand: 'mFood', terminal: 'APP', region: '澳門', showCount: 3250, clickCount: 428, clickRate: '13.17%', jumpCount: 312 },
  { key: '2', date: '2026-06-05', hintWord: '新鮮水果送到家', hintType: '運營推廣', searchPage: '超市頁', brand: '閃蜂', terminal: 'APP', region: '澳門', showCount: 2180, clickCount: 196, clickRate: '8.99%', jumpCount: 183 },
  { key: '3', date: '2026-06-05', hintWord: '（熱搜）漢堡包', hintType: '熱搜推廣', searchPage: '大首頁', brand: 'mFood', terminal: 'APP', region: '氹仔', showCount: 1890, clickCount: 267, clickRate: '14.13%', jumpCount: 0 },
  { key: '4', date: '2026-06-04', hintWord: '下午茶限時折扣', hintType: '運營推廣', searchPage: '外賣頁', brand: '閃蜂', terminal: 'APP', region: '澳門', showCount: 1540, clickCount: 89, clickRate: '5.78%', jumpCount: 76 },
  { key: '5', date: '2026-06-04', hintWord: '團購好券天天領', hintType: '運營推廣', searchPage: '團購頁', brand: 'mFood', terminal: '微信小程序', region: '氹仔', showCount: 980, clickCount: 145, clickRate: '14.80%', jumpCount: 132 },
  { key: '6', date: '2026-06-04', hintWord: '（熱搜）珍珠奶茶', hintType: '熱搜推廣', searchPage: '大首頁', brand: '閃蜂', terminal: 'APP', region: '澳門', showCount: 2450, clickCount: 334, clickRate: '13.63%', jumpCount: 0 },
  { key: '7', date: '2026-06-03', hintWord: '今日特惠外賣', hintType: '運營推廣', searchPage: '大首頁', brand: 'mFood', terminal: 'APP', region: '澳門', showCount: 3100, clickCount: 402, clickRate: '12.97%', jumpCount: 295 },
  { key: '8', date: '2026-06-03', hintWord: '（熱搜）炸雞', hintType: '熱搜推廣', searchPage: '大首頁', brand: '閃蜂', terminal: 'APP', region: '氹仔', showCount: 1670, clickCount: 223, clickRate: '13.35%', jumpCount: 0 },
  { key: '9', date: '2026-06-02', hintWord: '宵夜狂歡', hintType: '商家推廣', searchPage: '外賣頁', brand: 'mFood', terminal: 'APP', region: '澳門', showCount: 2340, clickCount: 312, clickRate: '13.33%', jumpCount: 267 },
  { key: '10', date: '2026-06-02', hintWord: '（熱搜）壽司', hintType: '熱搜推廣', searchPage: '大首頁', brand: '閃蜂', terminal: 'APP', region: '澳門', showCount: 1980, clickCount: 278, clickRate: '14.04%', jumpCount: 0 },
  { key: '11', date: '2026-06-01', hintWord: '週末日特惠', hintType: '運營推廣', searchPage: '大首頁', brand: 'mFood', terminal: 'APP', region: '澳門', showCount: 2780, clickCount: 389, clickRate: '13.99%', jumpCount: 312 },
  { key: '12', date: '2026-06-01', hintWord: '（熱搜）酸菜魚', hintType: '熱搜推廣', searchPage: '外賣頁', brand: '閃蜂', terminal: 'APP', region: '氹仔', showCount: 2150, clickCount: 298, clickRate: '13.86%', jumpCount: 0 },
]

// 趋势数据
const trendData = [
  { date: '2026-06-01', type: '展示次數', value: 12500 },
  { date: '2026-06-01', type: '點擊次數', value: 1680 },
  { date: '2026-06-02', type: '展示次數', value: 13200 },
  { date: '2026-06-02', type: '點擊次數', value: 1756 },
  { date: '2026-06-03', type: '展示次數', value: 14800 },
  { date: '2026-06-03', type: '點擊次數', value: 1945 },
  { date: '2026-06-04', type: '展示次數', value: 15100 },
  { date: '2026-06-04', type: '點擊次數', value: 2012 },
  { date: '2026-06-05', type: '展示次數', value: 16320 },
  { date: '2026-06-05', type: '點擊次數', value: 2234 },
  { date: '2026-06-06', type: '展示次數', value: 17800 },
  { date: '2026-06-06', type: '點擊次數', value: 2456 },
  { date: '2026-06-07', type: '展示次數', value: 18500 },
  { date: '2026-06-07', type: '點擊次數', value: 2589 },
]

// 词源分布数据
const sourceData = [
  { type: '運營推廣', value: 6580, percentage: 62.5 },
  { type: '熱搜推廣', value: 3950, percentage: 37.5 },
]

// 品牌对比数据
const _brandData = [
  { brand: 'mFood', showCount: 9850, clickCount: 1342, clickRate: 13.62 },
  { brand: '閃蜂', value: 6520, clickCount: 898, clickRate: 13.77 },
]

const brandCompareData = [
  { brand: 'mFood', type: '展示次數', value: 9850 },
  { brand: 'mFood', type: '點擊次數', value: 1342 },
  { brand: '閃蜂', type: '展示次數', value: 6520 },
  { brand: '閃蜂', type: '點擊次數', value: 898 },
]

const trendConfig = {
  data: trendData,
  xField: 'date',
  yField: 'value',
  seriesField: 'type',
  smooth: true,
  animation: {
    appear: {
      animation: 'path-in',
      duration: 1000,
    },
  },
  color: ['#1890ff', '#52c41a'],
  legend: {
    position: 'top' as const,
  },
  tooltip: {
    showMarkers: false,
  },
  point: {
    size: 3,
    shape: 'circle',
  },
}

const sourcePieConfig = {
  data: sourceData,
  angleField: 'value',
  colorField: 'type',
  radius: 0.8,
  label: {
    type: 'outer' as const,
    content: '{name} {percentage}',
  },
  interactions: [
    {
      type: 'element-active',
    },
  ],
  color: ['#fa8c16', '#722ed1'],
  legend: {
    position: 'bottom' as const,
  },
}

const brandColumnConfig = {
  data: brandCompareData,
  isGroup: true,
  xField: 'brand',
  yField: 'value',
  seriesField: 'type',
  color: ['#1890ff', '#52c41a'],
  label: {
    position: 'middle' as const,
    layout: [
      { type: 'interval-adjust-position' },
      { type: 'interval-hide-overlap' },
      { type: 'adjust-color' },
    ],
  },
  legend: {
    position: 'top' as const,
  },
}

export default function HintReport() {
  const { t } = useTranslation()

  /** 列配置元数据 */
  const columnMeta = useMemo(() => [
    { key: 'date', title: t('hintReport.colDate') },
    { key: 'hintWord', title: t('hintReport.colHintWord') },
    { key: 'hintType', title: t('hintReport.colHintType') },
    { key: 'searchPage', title: t('hintReport.colSearchPage') },
    { key: 'brand', title: t('hintReport.colBrand') },
    { key: 'terminal', title: t('hintReport.colTerminal') },
    { key: 'region', title: t('hintReport.colRegion') },
    { key: 'showCount', title: t('hintReport.colShowCount') },
    { key: 'clickCount', title: t('hintReport.colClickCount') },
    { key: 'clickRate', title: t('hintReport.colClickRate') },
    { key: 'jumpCount', title: t('hintReport.colJumpCount') },
  ], [t])

  const columns: TableColumnsType<ReportData> = [
    { title: t('hintReport.colDate'), dataIndex: 'date', key: 'date', width: 120 },
    { title: t('hintReport.colHintWord'), dataIndex: 'hintWord', key: 'hintWord', width: 140 },
    { title: t('hintReport.colHintType'), dataIndex: 'hintType', key: 'hintType', width: 100 },
    { title: t('hintReport.colSearchPage'), dataIndex: 'searchPage', key: 'searchPage', width: 100 },
    { title: t('hintReport.colBrand'), dataIndex: 'brand', key: 'brand', width: 80 },
    { title: t('hintReport.colTerminal'), dataIndex: 'terminal', key: 'terminal', width: 120 },
    { title: t('hintReport.colRegion'), dataIndex: 'region', key: 'region', width: 80 },
    { title: t('hintReport.colShowCount'), dataIndex: 'showCount', key: 'showCount', width: 100, sorter: true },
    { title: t('hintReport.colClickCount'), dataIndex: 'clickCount', key: 'clickCount', width: 100, sorter: true },
    { title: t('hintReport.colClickRate'), dataIndex: 'clickRate', key: 'clickRate', width: 100, sorter: true },
    { title: t('hintReport.colJumpCount'), dataIndex: 'jumpCount', key: 'jumpCount', width: 100, sorter: true },
  ]

  const terminalOptions = [
    { label: t('common.all'), value: 'all' },
    { label: t('dict.terminal.app'), value: 'app' },
    { label: t('dict.terminal.wechatMini'), value: 'wechatMini' },
    { label: t('dict.terminal.mpayMini'), value: 'mpayMini' },
    { label: t('dict.terminal.wechatH5'), value: 'wechatH5' },
  ]

  const regionOptions = [
    { label: t('common.all'), value: 'all' },
    { label: t('dict.region.macau'), value: 'macau' },
    { label: t('dict.region.taipa'), value: 'taipa' },
  ]

  const hintTypeOptions = [
    { label: t('common.all'), value: 'all' },
    { label: t('dict.hintSource.operation'), value: 'operation' },
    { label: t('dict.promotionType.hotSearch'), value: 'hotSearch' },
  ]

  const { configComponent, applyConfig } = useColumnConfig('hint-report', columnMeta)

  return (
    <div className="content-area">
      {/* 查询区域 */}
      <div className="search-section">
        <Form layout="inline">
          <Form.Item label={t('hintReport.searchHintWord')}>
            <Input placeholder={t('hintReport.searchHintWordPlaceholder')} allowClear />
          </Form.Item>
          <Form.Item label={t('hintReport.searchHintType')}>
            <Select placeholder={t('common.all')} allowClear options={hintTypeOptions} />
          </Form.Item>
          <Form.Item label={t('hintReport.searchBrand')}>
            <Select placeholder={t('common.all')} allowClear options={brandOptions} />
          </Form.Item>
          <Form.Item label={t('hintReport.searchTerminal')}>
            <Select placeholder={t('common.all')} allowClear options={terminalOptions} />
          </Form.Item>
          <Form.Item label={t('hintReport.searchRegion')}>
            <Select placeholder={t('common.all')} allowClear options={regionOptions} />
          </Form.Item>
          <Form.Item label={t('hintReport.searchDate')}>
            <RangePicker />
          </Form.Item>
          <Form.Item>
            <div className="search-actions">
              <Button type="primary" icon={<SearchOutlined />}>{t('common.search')}</Button>
              <Button icon={<ReloadOutlined />}>{t('common.reset')}</Button>
            </div>
          </Form.Item>
        </Form>
      </div>

      {/* 功能区域 */}
      <div className="action-section">
        <div className="action-section-left">
          <Button className="btn-export" icon={<ExportOutlined />}>{t('common.export')}</Button>
        </div>
        <div className="action-section-right">
          {configComponent}
        </div>
      </div>

      {/* 统计卡片 */}
      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col span={6}>
          <Card>
            <Statistic
              title={t('hintReport.totalShow')}
              value={16370}
              precision={0}
              valueStyle={{ color: '#1890ff' }}
              prefix={<ArrowUpOutlined />}
              suffix={t('common.times')}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic
              title={t('hintReport.totalClick')}
              value={2240}
              precision={0}
              valueStyle={{ color: '#52c41a' }}
              prefix={<ArrowUpOutlined />}
              suffix={t('common.times')}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic
              title={t('hintReport.avgClickRate')}
              value={13.68}
              precision={2}
              valueStyle={{ color: '#fa8c16' }}
              suffix="%"
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic
              title={t('hintReport.totalJump')}
              value={1098}
              precision={0}
              valueStyle={{ color: '#722ed1' }}
              prefix={<ArrowUpOutlined />}
              suffix={t('common.times')}
            />
          </Card>
        </Col>
      </Row>

      {/* 图表区域 */}
      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col span={16}>
          <Card title={`📈 ${t('hintReport.trendTitle')}`} bordered={false}>
            <Line {...trendConfig} height={300} />
          </Card>
        </Col>
        <Col span={8}>
          <Card title={`🥧 ${t('hintReport.sourceTitle')}`} bordered={false}>
            <Pie {...sourcePieConfig} height={300} />
          </Card>
        </Col>
      </Row>

      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col span={24}>
          <Card title={`📊 ${t('hintReport.brandTitle')}`} bordered={false}>
            <Column {...brandColumnConfig} height={280} />
          </Card>
        </Col>
      </Row>

      {/* 列表区域 */}
      <div className="table-section">
        <Card title={`📋 ${t('hintReport.detailTitle')}`} bordered={false}>
          <Table<ReportData>
            columns={applyConfig(columns)}
            dataSource={mockData}
            pagination={{
              total: mockData.length,
              pageSize: 10,
              showTotal: (total) => t('common.total', { count: total }),
              showSizeChanger: true,
              pageSizeOptions: ['10', '20', '50', '100'],
              defaultPageSize: 10,
              showQuickJumper: true,
            }}
            size="middle"
            bordered={false}
            scroll={{ x: 1300 }}
          />
        </Card>
      </div>
    </div>
  )
}
