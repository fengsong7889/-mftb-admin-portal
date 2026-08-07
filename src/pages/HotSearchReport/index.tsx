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
import { Line, Column, Pie, Area } from '@ant-design/charts'
import { useColumnConfig } from '../../hooks/useColumnConfig'
import { BRAND_OPTIONS_WITH_ALL as brandOptions } from '../../constants/brand'

const { RangePicker } = DatePicker

interface ReportData {
  key: string
  date: string
  word: string
  promotionType: string
  searchPage: string
  brand: string
  terminal: string
  region: string
  timeSlot: string
  showCount: number
  clickCount: number
  clickRate: string
  shopVisitCount: number
  isSold: string
}

const mockData: ReportData[] = [
  { key: '1', date: '2026-06-05', word: '🔥 限時火鍋優惠', promotionType: '活動推廣', searchPage: '大首頁', brand: 'mFood', terminal: 'APP', region: '澳門', timeSlot: '晚餐', showCount: 5680, clickCount: 892, clickRate: '15.70%', shopVisitCount: 756, isSold: '否' },
  { key: '2', date: '2026-06-05', word: '珍珠奶茶', promotionType: '運營推廣', searchPage: '大首頁', brand: '閃蜂', terminal: 'APP', region: '澳門', timeSlot: '下午茶', showCount: 4320, clickCount: 648, clickRate: '15.00%', shopVisitCount: 0, isSold: '否' },
  { key: '3', date: '2026-06-05', word: '🆕 美味漢堡', promotionType: '商家推廣', searchPage: '外賣頁', brand: 'mFood', terminal: 'APP', region: '氹仔', timeSlot: '午餐', showCount: 3890, clickCount: 712, clickRate: '18.30%', shopVisitCount: 689, isSold: '已售' },
  { key: '4', date: '2026-06-05', word: '炸雞', promotionType: '運營推廣', searchPage: '大首頁', brand: '閃蜂', terminal: 'APP', region: '澳門', timeSlot: '全天', showCount: 3560, clickCount: 467, clickRate: '13.12%', shopVisitCount: 0, isSold: '否' },
  { key: '5', date: '2026-06-04', word: '🎁 下午茶限時折扣', promotionType: '活動推廣', searchPage: '外賣頁', brand: 'mFood', terminal: 'APP', region: '氹仔', timeSlot: '下午茶', showCount: 2140, clickCount: 198, clickRate: '9.25%', shopVisitCount: 156, isSold: '否' },
  { key: '6', date: '2026-06-04', word: '壽司', promotionType: '商家推廣', searchPage: '大首頁', brand: '閃蜂', terminal: 'APP', region: '澳門', timeSlot: '晚餐', showCount: 2980, clickCount: 534, clickRate: '17.92%', shopVisitCount: 498, isSold: '已售' },
  { key: '7', date: '2026-06-03', word: '🔥 限時火鍋優惠', promotionType: '活動推廣', searchPage: '大首頁', brand: 'mFood', terminal: 'APP', region: '澳門', timeSlot: '晚餐', showCount: 5230, clickCount: 810, clickRate: '15.49%', shopVisitCount: 689, isSold: '否' },
  { key: '8', date: '2026-06-03', word: '🧋 珍珠奶茶', promotionType: '運營推廣', searchPage: '大首頁', brand: '閃蜂', terminal: 'APP', region: '氹仔', timeSlot: '下午茶', showCount: 3100, clickCount: 445, clickRate: '14.35%', shopVisitCount: 0, isSold: '否' },
  { key: '9', date: '2026-06-02', word: '🍰 葡撻特賣', promotionType: '活動推廣', searchPage: '團購頁', brand: 'mFood', terminal: 'APP', region: '澳門', timeSlot: '全天', showCount: 1890, clickCount: 234, clickRate: '12.38%', shopVisitCount: 198, isSold: '否' },
  { key: '10', date: '2026-06-02', word: '拉麵', promotionType: '運營推廣', searchPage: '外賣頁', brand: '閃蜂', terminal: 'APP', region: '澳門', timeSlot: '午餐', showCount: 2450, clickCount: 378, clickRate: '15.43%', shopVisitCount: 0, isSold: '否' },
  { key: '11', date: '2026-06-01', word: '🥤 鮮榨果汁', promotionType: '活動推廣', searchPage: '大首頁', brand: 'mFood', terminal: 'APP', region: '氹仔', timeSlot: '下午茶', showCount: 2890, clickCount: 412, clickRate: '14.25%', shopVisitCount: 356, isSold: '否' },
  { key: '12', date: '2026-06-01', word: '燒味飯', promotionType: '運營推廣', searchPage: '外賣頁', brand: '閃蜂', terminal: 'APP', region: '澳門', timeSlot: '午餐', showCount: 2120, clickCount: 298, clickRate: '14.06%', shopVisitCount: 0, isSold: '否' },
]

// 趋势数据
const trendData = [
  { date: '2026-06-01', type: '展示次數', value: 18500 },
  { date: '2026-06-01', type: '點擊次數', value: 2856 },
  { date: '2026-06-01', type: '店鋪訪問', value: 1923 },
  { date: '2026-06-02', type: '展示次數', value: 19800 },
  { date: '2026-06-02', type: '點擊次數', value: 3045 },
  { date: '2026-06-02', type: '店鋪訪問', value: 2134 },
  { date: '2026-06-03', type: '展示次數', value: 21200 },
  { date: '2026-06-03', type: '點擊次數', value: 3289 },
  { date: '2026-06-03', type: '店鋪訪問', value: 2456 },
  { date: '2026-06-04', type: '展示次數', value: 22500 },
  { date: '2026-06-04', type: '點擊次數', value: 3512 },
  { date: '2026-06-04', type: '店鋪訪問', value: 2678 },
  { date: '2026-06-05', type: '展示次數', value: 24800 },
  { date: '2026-06-05', type: '點擊次數', value: 3890 },
  { date: '2026-06-05', type: '店鋪訪問', value: 2934 },
]

// 推广类型分布
const promotionData = [
  { type: '活動推廣', value: 8950, percentage: 42.3 },
  { type: '商家推廣', value: 6580, percentage: 31.1 },
  { type: '運營推廣', value: 5620, percentage: 26.6 },
]

// 时段分布
const timeSlotData = [
  { timeSlot: '早餐', showCount: 2340, clickCount: 312 },
  { timeSlot: '午餐', showCount: 6780, clickCount: 1023 },
  { timeSlot: '下午茶', showCount: 5890, clickCount: 856 },
  { timeSlot: '晚餐', showCount: 7650, clickCount: 1234 },
  { timeSlot: '宵夜', showCount: 1890, clickCount: 245 },
]

// 品牌对比
const brandCompareData = [
  { brand: 'mFood', type: '展示次數', value: 12850 },
  { brand: 'mFood', type: '點擊次數', value: 2012 },
  { brand: 'mFood', type: '店鋪訪問', value: 1567 },
  { brand: '閃蜂', type: '展示次數', value: 9450 },
  { brand: '閃蜂', type: '點擊次數', value: 1456 },
  { brand: '閃蜂', type: '店鋪訪問', value: 1123 },
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
  color: ['#1890ff', '#52c41a', '#fa8c16'],
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

const promotionPieConfig = {
  data: promotionData,
  angleField: 'value',
  colorField: 'type',
  radius: 0.8,
  label: {
    type: 'outer' as const,
    content: '{name} {percentage}%',
  },
  interactions: [
    {
      type: 'element-active',
    },
  ],
  color: ['#f5222d', '#fa8c16', '#1890ff'],
  legend: {
    position: 'bottom' as const,
  },
}

const timeSlotColumnConfig = {
  data: timeSlotData,
  isGroup: true,
  xField: 'timeSlot',
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

const timeSlotAreaConfig = {
  data: [
    { timeSlot: '早餐', type: '展示次數', value: 2340 },
    { timeSlot: '午餐', type: '展示次數', value: 6780 },
    { timeSlot: '下午茶', type: '展示次數', value: 5890 },
    { timeSlot: '晚餐', type: '展示次數', value: 7650 },
    { timeSlot: '宵夜', type: '展示次數', value: 1890 },
  ],
  xField: 'timeSlot',
  yField: 'value',
  seriesField: 'type',
  smooth: true,
  color: ['#1890ff'],
  areaStyle: {
    fill: 'l(270) 0:#ffffff 0.5:#1890ff40 1:#1890ff',
  },
}

const brandColumnConfig = {
  data: brandCompareData,
  isGroup: true,
  xField: 'brand',
  yField: 'value',
  seriesField: 'type',
  color: ['#1890ff', '#52c41a', '#fa8c16'],
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

export default function HotSearchReport() {
  const { t } = useTranslation()

  /** 列配置元数据 */
  const columnMeta = useMemo(() => [
    { key: 'date', title: t('hotSearchReport.colDate') },
    { key: 'word', title: t('hotSearchReport.colWord') },
    { key: 'promotionType', title: t('hotSearchReport.colPromotionType') },
    { key: 'searchPage', title: t('hotSearchReport.colSearchPage') },
    { key: 'brand', title: t('hotSearchReport.colBrand') },
    { key: 'terminal', title: t('hotSearchReport.colTerminal') },
    { key: 'region', title: t('hotSearchReport.colRegion') },
    { key: 'timeSlot', title: t('hotSearchReport.colTimeSlot') },
    { key: 'showCount', title: t('hotSearchReport.colShowCount') },
    { key: 'clickCount', title: t('hotSearchReport.colClickCount') },
    { key: 'clickRate', title: t('hotSearchReport.colClickRate') },
  ], [t])

  const columns: TableColumnsType<ReportData> = [
    { title: t('hotSearchReport.colDate'), dataIndex: 'date', key: 'date', width: 120 },
    { title: t('hotSearchReport.colWord'), dataIndex: 'word', key: 'word', width: 150 },
    { title: t('hotSearchReport.colPromotionType'), dataIndex: 'promotionType', key: 'promotionType', width: 100 },
    { title: t('hotSearchReport.colSearchPage'), dataIndex: 'searchPage', key: 'searchPage', width: 100 },
    { title: t('hotSearchReport.colBrand'), dataIndex: 'brand', key: 'brand', width: 80 },
    { title: t('hotSearchReport.colTerminal'), dataIndex: 'terminal', key: 'terminal', width: 120 },
    { title: t('hotSearchReport.colRegion'), dataIndex: 'region', key: 'region', width: 80 },
    { title: t('hotSearchReport.colTimeSlot'), dataIndex: 'timeSlot', key: 'timeSlot', width: 80 },
    { title: t('hotSearchReport.colShowCount'), dataIndex: 'showCount', key: 'showCount', width: 100, sorter: true },
    { title: t('hotSearchReport.colClickCount'), dataIndex: 'clickCount', key: 'clickCount', width: 100, sorter: true },
    { title: t('hotSearchReport.colClickRate'), dataIndex: 'clickRate', key: 'clickRate', width: 100, sorter: true },
    { title: t('hotSearchReport.colShopVisit'), dataIndex: 'shopVisitCount', key: 'shopVisitCount', width: 120, sorter: true },
    {
      title: t('hotSearchReport.colIsSold'), dataIndex: 'isSold', key: 'isSold', width: 90,
      render: (v: string) => v === '已售' ? t('hotSearchReport.isSoldYes') : t('hotSearchReport.isSoldNo'),
    },
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

  const promotionTypeOptions = [
    { label: t('common.all'), value: 'all' },
    { label: t('dict.promotionType.activity'), value: 'activity' },
    { label: t('dict.promotionType.merchant'), value: 'merchant' },
    { label: t('dict.promotionType.operation'), value: 'operation' },
  ]

  const { configComponent, applyConfig } = useColumnConfig('hot-search-report', columnMeta)

  return (
    <div className="content-area">
      {/* 查询区域 */}
      <div className="search-section">
        <Form layout="inline">
          <Form.Item label={t('hotSearchReport.searchWord')}>
            <Input placeholder={t('hotSearchReport.searchWordPlaceholder')} allowClear style={{ height: 30 }} />
          </Form.Item>
          <Form.Item label={t('hotSearchReport.searchPromotionType')}>
            <Select placeholder={t('common.all')} options={promotionTypeOptions} style={{ height: 30, width: 200 }} />
          </Form.Item>
          <Form.Item label={t('hotSearchReport.searchBrand')}>
            <Select placeholder={t('common.all')} options={brandOptions} style={{ height: 30, width: 200 }} />
          </Form.Item>
          <Form.Item label={t('hotSearchReport.searchTerminal')}>
            <Select placeholder={t('common.all')} options={terminalOptions} style={{ height: 30, width: 200 }} />
          </Form.Item>
          <Form.Item label={t('hotSearchReport.searchRegion')}>
            <Select placeholder={t('common.all')} options={regionOptions} style={{ height: 30, width: 200 }} />
          </Form.Item>
          <Form.Item label={t('hotSearchReport.searchDate')}>
            <RangePicker style={{ height: 30 }} />
          </Form.Item>
          <Form.Item>
            <div className="search-actions">
              <Button type="primary" icon={<SearchOutlined />} style={{ height: 30 }}>{t('common.search')}</Button>
              <Button icon={<ReloadOutlined />} style={{ height: 30 }}>{t('common.reset')}</Button>
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
              title={t('hotSearchReport.totalShow')}
              value={27890}
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
              title={t('hotSearchReport.totalClick')}
              value={4320}
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
              title={t('hotSearchReport.avgClickRate')}
              value={15.49}
              precision={2}
              valueStyle={{ color: '#fa8c16' }}
              suffix="%"
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic
              title={t('hotSearchReport.totalShopVisit')}
              value={3234}
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
          <Card title={`📈 ${t('hotSearchReport.trendTitle')}`} bordered={false}>
            <Line {...trendConfig} height={300} />
          </Card>
        </Col>
        <Col span={8}>
          <Card title={`🥧 ${t('hotSearchReport.pieTitle')}`} bordered={false}>
            <Pie {...promotionPieConfig} height={300} />
          </Card>
        </Col>
      </Row>

      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col span={12}>
          <Card title={`🕐 ${t('hotSearchReport.slotTitle')}`} bordered={false}>
            <Column {...timeSlotColumnConfig} height={280} />
          </Card>
        </Col>
        <Col span={12}>
          <Card title={`📊 ${t('hotSearchReport.slotTrendTitle')}`} bordered={false}>
            <Area {...timeSlotAreaConfig} height={280} />
          </Card>
        </Col>
      </Row>

      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col span={24}>
          <Card title={`🏢 ${t('hotSearchReport.brandTitle')}`} bordered={false}>
            <Column {...brandColumnConfig} height={280} />
          </Card>
        </Col>
      </Row>

      {/* 列表区域 */}
      <div className="table-section">
        <Card title={`📋 ${t('hotSearchReport.detailTitle')}`} bordered={false}>
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
            scroll={{ x: 1500 }}
          />
        </Card>
      </div>
    </div>
  )
}
