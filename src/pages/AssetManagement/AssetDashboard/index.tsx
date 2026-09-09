/**
 * 資產看板（物資管理 - 總覽）
 *
 * 展示資產全局指標：
 *  - 頂部統計卡片：總數/在用/閒置/維修中/已報廢/原值合計/閒置率
 *  - 待辦提醒：借用中/逾期/待定責/待審批/待收貨
 *  - 圖表：類型分布（餅圖）、部門分布（柱圖）、月度入庫趨勢（柱圖）
 */
import { useState, useEffect } from 'react'
import { Card, Row, Col, Statistic, Spin, Badge } from 'antd'
import {
  InboxOutlined, CheckCircleOutlined, PauseCircleOutlined, ToolOutlined,
  DeleteOutlined, DollarOutlined, PieChartOutlined, WarningOutlined,
  BellOutlined, FileTextOutlined, ShoppingCartOutlined, AlertOutlined,
} from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
import { Pie, Column } from '@ant-design/charts'
import { fetchEamDashboard, type EamDashboard } from '../../../api/eam'

export default function AssetDashboard() {
  const { t } = useTranslation()
  const [loading, setLoading] = useState(false)
  const [data, setData] = useState<EamDashboard | null>(null)

  useEffect(() => {
    setLoading(true)
    fetchEamDashboard()
      .then(setData)
      .catch(() => { /* dashboard load failure is non-critical */ })
      .finally(() => setLoading(false))
  }, [])

  if (loading || !data) {
    return <div style={{ textAlign: 'center', padding: 80 }}><Spin size="large" /></div>
  }

  /* ----- 圖表數據 ----- */
  const typePieData = data.typeDistribution.map((d) => ({
    type: d.type,
    count: d.count,
  }))
  const deptColData = data.departmentDistribution
    .sort((a, b) => b.count - a.count)
    .map((d) => ({ department: d.department, count: d.count }))
  const monthlyData = data.monthlyInbound.map((d) => ({
    month: d.month,
    count: d.count,
    value: d.value,
  }))

  const PIECE_COLORS = ['#1890ff', '#52c41a', '#faad14', '#ff4d4f', '#722ed1', '#13c2c2', '#eb2f96']

  const statCards = [
    { title: t('asset.dashTotalAssets'), value: data.totalCount, icon: <InboxOutlined />, color: '#1890ff' },
    { title: t('asset.dashInUse'), value: data.inUseCount, icon: <CheckCircleOutlined />, color: '#52c41a' },
    { title: t('asset.dashIdle'), value: data.idleCount, icon: <PauseCircleOutlined />, color: '#8c8c8c' },
    { title: t('asset.dashInRepair'), value: data.inRepairCount, icon: <ToolOutlined />, color: '#1890ff' },
    { title: t('asset.dashScrapped'), value: data.scrappedCount, icon: <DeleteOutlined />, color: '#ff4d4f' },
  ]

  const alertItems = [
    { label: t('asset.dashBorrowing'), value: data.borrowingCount, icon: <BellOutlined />, color: data.borrowingCount > 0 ? '#1890ff' : '#d9d9d9' },
    { label: t('asset.dashOverdue'), value: data.overdueCount, icon: <WarningOutlined />, color: data.overdueCount > 0 ? '#ff4d4f' : '#d9d9d9' },
    { label: t('asset.dashPendingComp'), value: data.pendingCompCount, icon: <AlertOutlined />, color: data.pendingCompCount > 0 ? '#faad14' : '#d9d9d9' },
    { label: t('asset.dashPendingReq'), value: data.pendingReqCount, icon: <FileTextOutlined />, color: data.pendingReqCount > 0 ? '#722ed1' : '#d9d9d9' },
    { label: t('asset.dashPendingOrder'), value: data.pendingOrderCount, icon: <ShoppingCartOutlined />, color: data.pendingOrderCount > 0 ? '#13c2c2' : '#d9d9d9' },
  ]

  return (
    <div className="content-area" style={{ padding: '20px 24px' }}>
      {/* ====== 標題 ====== */}
      <div style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 12 }}>
        <PieChartOutlined style={{ fontSize: 22, color: '#1890ff' }} />
        <h2 style={{ margin: 0, fontSize: 18, fontWeight: 600 }}>{t('asset.dashboardTitle')}</h2>
      </div>

      {/* ====== 統計卡片 ====== */}
      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        {statCards.map((s) => (
          <Col key={s.title} xs={12} sm={8} md={4} lg={4} xl={4} flex={1}>
            <Card size="small" style={{ borderRadius: 8, borderTop: `3px solid ${s.color}` }}>
              <Statistic
                title={<span style={{ fontSize: 13 }}>{s.title}</span>}
                value={s.value}
                prefix={s.icon}
                valueStyle={{ color: s.color, fontSize: 24, fontWeight: 700 }}
              />
            </Card>
          </Col>
        ))}
        <Col xs={12} sm={8} md={4} lg={4} xl={4} flex={1}>
          <Card size="small" style={{ borderRadius: 8, borderTop: '3px solid #faad14' }}>
            <Statistic
              title={<span style={{ fontSize: 13 }}>{t('asset.dashTotalValue')}</span>}
              value={data.totalValue}
              prefix={<DollarOutlined />}
              suffix="MOP"
              valueStyle={{ fontSize: 20, fontWeight: 700, color: '#faad14' }}
            />
          </Card>
        </Col>
        <Col xs={12} sm={8} md={4} lg={4} xl={4} flex={1}>
          <Card size="small" style={{ borderRadius: 8, borderTop: '3px solid #eb2f96' }}>
            <Statistic
              title={<span style={{ fontSize: 13 }}>{t('asset.dashIdleRate')}</span>}
              value={data.idleRate}
              suffix="%"
              valueStyle={{ fontSize: 24, fontWeight: 700, color: data.idleRate > 30 ? '#ff4d4f' : '#eb2f96' }}
            />
          </Card>
        </Col>
      </Row>

      {/* ====== 待辦提醒 ====== */}
      <Card size="small" title={t('asset.dashAlerts')} style={{ marginBottom: 16, borderRadius: 8 }}>
        <Row gutter={[24, 12]}>
          {alertItems.map((a) => (
            <Col key={a.label} xs={12} sm={8} md={4} lg={4} xl={4} flex={1}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Badge count={a.value} overflowCount={99} style={{ backgroundColor: a.color }}>
                  <span style={{ fontSize: 20, color: a.color, padding: 4 }}>{a.icon}</span>
                </Badge>
                <span style={{ fontSize: 13, color: '#595959' }}>{a.label}</span>
              </div>
            </Col>
          ))}
        </Row>
      </Card>

      {/* ====== 圖表區 ====== */}
      <Row gutter={[16, 16]}>
        {/* 類型分布 */}
        <Col xs={24} lg={8}>
          <Card title={t('asset.dashTypeDist')} size="small" style={{ borderRadius: 8, height: '100%' }}>
            {typePieData.length > 0 ? (
              <Pie
                data={typePieData}
                angleField="count"
                colorField="type"
                radius={0.8}
                innerRadius={0.5}
                color={PIECE_COLORS}
                label={{ type: 'outer', content: '{name} {percentage}' }}
                legend={{ color: { position: 'bottom' as const } }}
                interactions={[{ type: 'element-active' }]}
                height={280}
              />
            ) : (
              <div style={{ textAlign: 'center', padding: 60, color: '#bfbfbf' }}>{t('common.noData')}</div>
            )}
          </Card>
        </Col>

        {/* 部門分布 */}
        <Col xs={24} lg={8}>
          <Card title={t('asset.dashDeptDist')} size="small" style={{ borderRadius: 8, height: '100%' }}>
            {deptColData.length > 0 ? (
              <Column
                data={deptColData}
                xField="department"
                yField="count"
                color="#1890ff"
                label={{ position: 'top' as const }}
                xAxis={{ label: { autoRotate: true } }}
                yAxis={{ title: { text: t('asset.dashAssetCount') } }}
                height={280}
              />
            ) : (
              <div style={{ textAlign: 'center', padding: 60, color: '#bfbfbf' }}>{t('common.noData')}</div>
            )}
          </Card>
        </Col>

        {/* 月度入庫趨勢 */}
        <Col xs={24} lg={8}>
          <Card title={t('asset.dashMonthlyInbound')} size="small" style={{ borderRadius: 8, height: '100%' }}>
            {monthlyData.length > 0 ? (
              <Column
                data={monthlyData}
                xField="month"
                yField="count"
                color="#52c41a"
                label={{ position: 'top' as const }}
                yAxis={{ title: { text: t('asset.dashInboundCount') } }}
                height={280}
              />
            ) : (
              <div style={{ textAlign: 'center', padding: 60, color: '#bfbfbf' }}>{t('common.noData')}</div>
            )}
          </Card>
        </Col>
      </Row>
    </div>
  )
}
