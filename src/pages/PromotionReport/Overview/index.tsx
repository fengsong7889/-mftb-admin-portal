import { useState, useMemo } from 'react'
import { Card, Row, Col, Statistic, Select, DatePicker, Space, Tag, Alert } from 'antd'
import {
  ArrowUpOutlined,
  ArrowDownOutlined,
  EyeOutlined,
  MehOutlined,
  DollarOutlined,
  LineChartOutlined,
} from '@ant-design/icons'
import dayjs from 'dayjs'
import { useAuth } from '../../../contexts/AuthContext'
import {
  ReportApp,
  ReportChannel,
  ReportRecommendType,
  REPORT_APP_LABEL,
  REPORT_CHANNEL_LABEL,
  REPORT_RECOMMEND_TYPE_LABEL,
  REPORT_RECOMMEND_TYPE_COLOR,
} from '../types'
import { mockOverviewMetrics, mockRecommendTypeCompare } from '../mockData'
import '../index.css'

const { RangePicker } = DatePicker

export default function PromotionReportOverview() {
  const { user } = useAuth()
  const [dateRange, setDateRange] = useState<[dayjs.Dayjs | null, dayjs.Dayjs | null] | null>([
    dayjs().subtract(6, 'day'),
    dayjs(),
  ])
  const [recommendType, setRecommendType] = useState<ReportRecommendType | undefined>(undefined)
  const [app, setApp] = useState<ReportApp | undefined>(undefined)
  const [channel, setChannel] = useState<ReportChannel | undefined>(undefined)

  // 权限控制: 非admin只能看自己品牌
  const canViewAllBrands = user?.role === 'admin'

  // 计算增长率
  const impressionsGrowth = useMemo(() => {
    const { todayImpressions, yesterdayImpressions } = mockOverviewMetrics
    return ((todayImpressions - yesterdayImpressions) / yesterdayImpressions) * 100
  }, [])

  const clicksGrowth = useMemo(() => {
    const { todayClicks, yesterdayClicks } = mockOverviewMetrics
    return ((todayClicks - yesterdayClicks) / yesterdayClicks) * 100
  }, [])

  return (
    <div className="promotion-report-overview">
      {/* 查询区域 */}
      <div className="search-section">
        <Alert message="數據概覽頁面" description="圖表功能開發中，當前顯示核心指標數據" type="info" showIcon style={{ marginBottom: 16 }} />
        <form className="search-form" style={{ display: 'flex', flexWrap: 'wrap', gap: '16px 12px', alignItems: 'flex-end' }}>
          <div style={{ flex: '0 0 calc(25% - 9px)' }}>
            <label style={{ display: 'block', marginBottom: 4, color: '#666' }}>時間範圍</label>
            <RangePicker
              value={dateRange}
              onChange={(dates) => setDateRange(dates)}
              style={{ width: '100%' }}
            />
          </div>
          <div style={{ flex: '0 0 calc(25% - 9px)' }}>
            <label style={{ display: 'block', marginBottom: 4, color: '#666' }}>推薦類型</label>
            <Select
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
        </form>
      </div>

      {/* 核心指标卡片 */}
      <Row gutter={[16, 16]} style={{ marginTop: 24 }}>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic
              title="今日曝光量"
              value={mockOverviewMetrics.todayImpressions}
              prefix={<EyeOutlined />}
              suffix={
                <span style={{ fontSize: 12, color: impressionsGrowth > 0 ? '#52c41a' : '#ff4d4f' }}>
                  {impressionsGrowth > 0 ? <ArrowUpOutlined /> : <ArrowDownOutlined />}
                  {Math.abs(impressionsGrowth).toFixed(1)}%
                </span>
              }
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic
              title="今日點擊量"
              value={mockOverviewMetrics.todayClicks}
              prefix={<MehOutlined />}
              suffix={
                <span style={{ fontSize: 12, color: clicksGrowth > 0 ? '#52c41a' : '#ff4d4f' }}>
                  {clicksGrowth > 0 ? <ArrowUpOutlined /> : <ArrowDownOutlined />}
                  {Math.abs(clicksGrowth).toFixed(1)}%
                </span>
              }
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic
              title="點擊成本 (CPC)"
              value={mockOverviewMetrics.todayCpc}
              prefix={<DollarOutlined />}
              suffix="MOP"
              precision={2}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic
              title="轉化率 (CVR)"
              value={mockOverviewMetrics.todayCvr}
              suffix="%"
              precision={1}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic
              title="累計消耗"
              value={mockOverviewMetrics.totalCost}
              prefix={<DollarOutlined />}
              suffix="MOP"
              precision={2}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic
              title="平均 ROI"
              value={mockOverviewMetrics.avgRoi}
              prefix={<LineChartOutlined />}
              precision={2}
            />
          </Card>
        </Col>
      </Row>

      {/* 推荐类型效果对比 */}
      <Card title="推薦類型效果對比" style={{ marginTop: 24 }}>
        <Row gutter={[16, 16]}>
          {mockRecommendTypeCompare.map(item => (
            <Col xs={24} sm={12} lg={6} key={item.recommendType}>
              <Card size="small" style={{ background: '#fafafa' }}>
                <div style={{ marginBottom: 12 }}>
                  <Tag color={REPORT_RECOMMEND_TYPE_COLOR[item.recommendType]} style={{ fontSize: 14 }}>
                    {item.recommendTypeLabel}
                  </Tag>
                  <span style={{ marginLeft: 8, color: '#999' }}>{item.orderCount} 個訂單</span>
                </div>
                <Row gutter={[8, 8]}>
                  <Col span={12}>
                    <div style={{ fontSize: 12, color: '#999' }}>總曝光</div>
                    <div style={{ fontSize: 16, fontWeight: 500 }}>{item.totalImpressions.toLocaleString()}</div>
                  </Col>
                  <Col span={12}>
                    <div style={{ fontSize: 12, color: '#999' }}>總點擊</div>
                    <div style={{ fontSize: 16, fontWeight: 500 }}>{item.totalClicks.toLocaleString()}</div>
                  </Col>
                  <Col span={12}>
                    <div style={{ fontSize: 12, color: '#999' }}>平均CTR</div>
                    <div style={{ fontSize: 16, fontWeight: 500 }}>{item.avgCtr}%</div>
                  </Col>
                  <Col span={12}>
                    <div style={{ fontSize: 12, color: '#999' }}>平均CVR</div>
                    <div style={{ fontSize: 16, fontWeight: 500 }}>{item.avgCvr}%</div>
                  </Col>
                  <Col span={12}>
                    <div style={{ fontSize: 12, color: '#999' }}>平均CPC</div>
                    <div style={{ fontSize: 16, fontWeight: 500 }}>MOP {item.avgCpc.toFixed(2)}</div>
                  </Col>
                  <Col span={12}>
                    <div style={{ fontSize: 12, color: '#999' }}>平均ROI</div>
                    <div style={{ fontSize: 16, fontWeight: 500, color: item.avgRoi >= 3 ? '#52c41a' : '#faad14' }}>{item.avgRoi.toFixed(2)}</div>
                  </Col>
                </Row>
              </Card>
            </Col>
          ))}
        </Row>
      </Card>
    </div>
  )
}
