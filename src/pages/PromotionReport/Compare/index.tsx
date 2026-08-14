import { useState } from 'react'
import { useTranslation } from 'react-i18next'
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
  REPORT_RECOMMEND_TYPE_COLOR,
} from '../types'
import { mockRecommendTypeCompare, mockDailyTrends } from '../mockData'
import '../index.css'

const { RangePicker } = DatePicker

export default function PromotionReportCompare() {
  const { user } = useAuth()
  const { t } = useTranslation()
  const [dateRange, setDateRange] = useState<[dayjs.Dayjs, dayjs.Dayjs]>([
    dayjs().subtract(29, 'day'),
    dayjs(),
  ])
  const [app, setApp] = useState<ReportApp | undefined>(undefined)
  const [channel, setChannel] = useState<ReportChannel | undefined>(undefined)
  const [region, setRegion] = useState<ReportRegion | undefined>(undefined)

  // 权限控制
  const canViewAllBrands = user?.role === 'admin'

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

  // 对比表格列定义
  const columns: ColumnsType<typeof mockRecommendTypeCompare[0]> = [
    {
      title: t('promotionReport.recommendType'),
      dataIndex: 'recommendTypeLabel',
      key: 'recommendTypeLabel',
      width: 120,
      fixed: 'left' as const,
      render: (_text: string, record: typeof mockRecommendTypeCompare[0]) => (
        <Tag color={REPORT_RECOMMEND_TYPE_COLOR[record.recommendType]} style={{ fontSize: 14 }}>
          {recommendTypeLabel(record.recommendType)}
        </Tag>
      ),
    },
    {
      title: t('promotionReport.orderCountTitle'),
      dataIndex: 'orderCount',
      key: 'orderCount',
      width: 100,
      align: 'right' as const,
      render: (val: number) => t('promotionReport.orderCountUnit', { count: val }),
    },
    {
      title: t('promotionReport.totalImpressions'),
      dataIndex: 'totalImpressions',
      key: 'totalImpressions',
      width: 120,
      align: 'right' as const,
      render: (val: number) => val.toLocaleString(),
      sorter: (a, b) => a.totalImpressions - b.totalImpressions,
    },
    {
      title: t('promotionReport.totalClicks'),
      dataIndex: 'totalClicks',
      key: 'totalClicks',
      width: 120,
      align: 'right' as const,
      render: (val: number) => val.toLocaleString(),
      sorter: (a, b) => a.totalClicks - b.totalClicks,
    },
    {
      title: t('promotionReport.avgCtr'),
      dataIndex: 'avgCtr',
      key: 'avgCtr',
      width: 100,
      align: 'right' as const,
      render: (val: number) => `${val}%`,
      sorter: (a, b) => a.avgCtr - b.avgCtr,
    },
    {
      title: t('promotionReport.avgCpc'),
      dataIndex: 'avgCpc',
      key: 'avgCpc',
      width: 110,
      align: 'right' as const,
      render: (val: number) => `MOP ${val.toFixed(2)}`,
      sorter: (a, b) => a.avgCpc - b.avgCpc,
    },
    {
      title: t('promotionReport.avgCvr'),
      dataIndex: 'avgCvr',
      key: 'avgCvr',
      width: 100,
      align: 'right' as const,
      render: (val: number) => `${val}%`,
      sorter: (a, b) => a.avgCvr - b.avgCvr,
    },
    {
      title: t('promotionReport.totalCost'),
      dataIndex: 'totalCost',
      key: 'totalCost',
      width: 120,
      align: 'right' as const,
      render: (val: number) => `MOP ${val.toLocaleString()}`,
      sorter: (a, b) => a.totalCost - b.totalCost,
    },
    {
      title: t('promotionReport.totalRevenue'),
      dataIndex: 'totalRevenue',
      key: 'totalRevenue',
      width: 120,
      align: 'right' as const,
      render: (val: number) => `MOP ${val.toLocaleString()}`,
      sorter: (a, b) => a.totalRevenue - b.totalRevenue,
    },
    {
      title: t('promotionReport.avgRoi'),
      dataIndex: 'avgRoi',
      key: 'avgRoi',
      width: 100,
      align: 'right' as const,
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
      type: t('promotionReport.costTrendType'),
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
      type: recommendTypeLabel(item.recommendType),
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
        text: t('promotionReport.scatterXTitle'),
      },
      label: {
        formatter: (v: string) => `MOP ${v}`,
      },
    },
    yAxis: {
      title: {
        text: t('promotionReport.scatterYTitle'),
      },
      label: {
        formatter: (v: string) => `${v}%`,
      },
    },
    label: {
      content: (data: Record<string, string>) => data.type,
    },
    color: ['#faad14', '#52c41a', '#1890ff', '#722ed1'],
    tooltip: {
      formatter: (data: Record<string, string>) => ({
        name: data.type,
        value: t('promotionReport.scatterTooltip', {
          cpc: data.cpc,
          cvr: data.cvr,
          cost: data.cost.toLocaleString(),
        }),
      }),
    },
  }

  return (
    <div className="promotion-report-compare">
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
                }
              }}
              style={{ width: '100%' }}
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
        </form>
      </div>

      {/* 数据卡片对比 */}
      <Card title={t('promotionReport.recCoreCompareTitle')} style={{ marginTop: 16, marginBottom: 16 }}>
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
                    {recommendTypeLabel(item.recommendType)}
                  </Tag>
                </div>
                <Row gutter={[8, 12]}>
                  <Col span={12}>
                    <Statistic title={t('promotionReport.totalImpressions')} value={item.totalImpressions} suffix="" precision={0} valueStyle={{ fontSize: 16 }} />
                  </Col>
                  <Col span={12}>
                    <Statistic title={t('promotionReport.totalClicks')} value={item.totalClicks} suffix="" precision={0} valueStyle={{ fontSize: 16 }} />
                  </Col>
                  <Col span={12}>
                    <Statistic title={t('promotionReport.avgCtr')} value={item.avgCtr} suffix="%" precision={1} valueStyle={{ fontSize: 16 }} />
                  </Col>
                  <Col span={12}>
                    <Statistic title={t('promotionReport.avgCvr')} value={item.avgCvr} suffix="%" precision={1} valueStyle={{ fontSize: 16 }} />
                  </Col>
                  <Col span={12}>
                    <Statistic title={t('promotionReport.avgCpc')} value={item.avgCpc} prefix="MOP" precision={2} valueStyle={{ fontSize: 16 }} />
                  </Col>
                  <Col span={12}>
                    <Statistic title={t('promotionReport.avgRoi')} value={item.avgRoi} precision={2} valueStyle={{ fontSize: 16, color: item.avgRoi >= 3 ? '#52c41a' : '#faad14' }} />
                  </Col>
                  <Col span={24}>
                    <Statistic title={t('promotionReport.totalCost')} value={item.totalCost} prefix="MOP" precision={0} valueStyle={{ fontSize: 18, fontWeight: 500 }} />
                  </Col>
                </Row>
              </Card>
            </Col>
          ))}
        </Row>
      </Card>

      {/* 对比表格 */}
      <Card title={t('promotionReport.detailCompareTitle')} style={{ marginBottom: 16 }}>
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
          <Card title={t('promotionReport.ctrTrendTitle')}>
            <Line {...ctrTrendConfig} style={{ height: 280 }} />
          </Card>
        </Col>
        <Col xs={24} lg={8}>
          <Card title={t('promotionReport.cpcTrendTitle')}>
            <Line {...cpcTrendConfig} style={{ height: 280 }} />
          </Card>
        </Col>
        <Col xs={24} lg={8}>
          <Card title={t('promotionReport.costTrendTitle')}>
            <Line {...costTrendConfig} style={{ height: 280 }} />
          </Card>
        </Col>
      </Row>

      {/* 效益矩阵图 */}
      <Card title={t('promotionReport.matrixTitle')}>
        <div style={{ marginBottom: 12, padding: 12, background: '#f6ffed', borderRadius: 4 }}>
          <strong>{t('promotionReport.matrixGuideTitle')}</strong>
          <span style={{ marginLeft: 8 }}>
            {t('promotionReport.matrixGuideDesc')}
            <strong style={{ color: '#52c41a' }}> {t('promotionReport.matrixGuideOptimal')}</strong> = {t('promotionReport.matrixGuideOptimalDesc')}，
            <strong style={{ color: '#ff4d4f' }}> {t('promotionReport.matrixGuideNeedOpt')}</strong> = {t('promotionReport.matrixGuideNeedOptDesc')}
          </span>
        </div>
        <Scatter {...scatterConfig} style={{ height: 400 }} />
      </Card>
    </div>
  )
}
