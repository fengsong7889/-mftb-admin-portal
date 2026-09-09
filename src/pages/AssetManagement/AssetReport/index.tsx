/**
 * 资产统计报表页
 *
 * 数据看板：
 *  - 顶部 4 个统计卡片（总数/在用/闲置/维修中/已报废/总价值）
 *  - 资产类型分布
 *  - 部门分布
 *  - 来源分布（自购/租用）
 *  - 月度入库趋势
 */
import { useState, useEffect, useCallback } from 'react'
import { Card, Row, Col, Spin, message, Progress, Table, Tag } from 'antd'
import type { TableColumnsType } from 'antd'
import { useTranslation } from 'react-i18next'
import {
  fetchAssetStatistics, type AssetStatistics, type AssetSource,
} from '../../../api/asset'
import AnimatedNumber from '../../../components/AnimatedNumber'

interface DistRow { key: string; name: string; count: number; percent: number }

export default function AssetReport() {
  const { t } = useTranslation()
  const [loading, setLoading] = useState(false)
  const [stats, setStats] = useState<AssetStatistics | null>(null)

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const s = await fetchAssetStatistics()
      setStats(s)
    } catch (e: unknown) {
      message.error(e instanceof Error ? e.message : t('asset.queryFailed'))
    } finally {
      setLoading(false)
    }
  }, [t])

  useEffect(() => { loadData() }, [loadData])

  if (loading || !stats) {
    return (
      <div className="content-area" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 400 }}>
        <Spin size="large" tip={t('common.loading')} />
      </div>
    )
  }

  const typeData: DistRow[] = stats.typeDistribution.map((d) => ({
    key: d.type, name: d.type, count: d.count,
    percent: stats.totalCount ? Math.round((d.count / stats.totalCount) * 100) : 0,
  }))

  const deptData: DistRow[] = stats.departmentDistribution.map((d) => ({
    key: d.department, name: d.department, count: d.count,
    percent: stats.totalCount ? Math.round((d.count / stats.totalCount) * 100) : 0,
  }))

  const sourceTotal = stats.sourceDistribution.reduce((s, d) => s + d.count, 0)
  const sourceRows: { key: AssetSource; name: string; count: number; color: string; percent: number }[] = [
    { key: 'self',  name: t('asset.sourceSelf'),  count: stats.sourceDistribution.find((d) => d.source === 'self')?.count  || 0, color: '#1890FF', percent: sourceTotal ? Math.round(((stats.sourceDistribution.find((d) => d.source === 'self')?.count || 0) / sourceTotal) * 100) : 0 },
    { key: 'lease', name: t('asset.sourceLease'), count: stats.sourceDistribution.find((d) => d.source === 'lease')?.count || 0, color: '#FAAD14', percent: sourceTotal ? Math.round(((stats.sourceDistribution.find((d) => d.source === 'lease')?.count || 0) / sourceTotal) * 100) : 0 },
  ]

  const distColumns: TableColumnsType<DistRow> = [
    { title: t('asset.colName'), dataIndex: 'name', key: 'name', width: 140 },
    { title: t('asset.colCount'), dataIndex: 'count', key: 'count', width: 100, align: 'right' },
    {
      title: t('asset.colRatio'), dataIndex: 'percent', key: 'percent',
      render: (v: number) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Progress percent={v} size="small" showInfo={false} style={{ flex: 1, marginBottom: 0 }} strokeColor="#E8720C" />
          <span style={{ minWidth: 36, textAlign: 'right' }}>{v}%</span>
        </div>
      ),
    },
  ]

  const totalCards = [
    { key: 'total',   label: t('asset.cardTotal'),     value: stats.totalCount,    color: '#1890FF', bg: '#E6F7FF', border: '#1890FF22' },
    { key: 'inUse',   label: t('asset.cardInUse'),     value: stats.inUseCount,    color: '#52C41A', bg: '#F6FFED', border: '#52C41A22' },
    { key: 'idle',    label: t('asset.cardIdle'),      value: stats.idleCount,     color: '#722ED1', bg: '#F9F0FF', border: '#722ED122' },
    { key: 'repair',  label: t('asset.cardInRepair'),  value: stats.inRepairCount, color: '#FAAD14', bg: '#FFF7E6', border: '#FAAD1422' },
    { key: 'scrap',   label: t('asset.cardScrapped'),  value: stats.scrappedCount, color: '#FF4D4F', bg: '#FFF1F0', border: '#FF4D4F22' },
  ]

  return (
    <div className="content-area" style={{ padding: '20px 24px' }}>
      {/* ====== 5 张统计卡（带 hover 动效） ====== */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 16, marginBottom: 20,
      }}>
        {totalCards.map((c) => (
          <div
            key={c.key}
            style={{
              background: c.bg, border: `1px solid ${c.border}`, borderRadius: 12, padding: 16,
              textAlign: 'center', position: 'relative', overflow: 'hidden',
              cursor: 'default', transition: 'all 0.35s cubic-bezier(0.4, 0, 0.2, 1)',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = 'translateY(-4px)'
              e.currentTarget.style.boxShadow = '0 8px 24px rgba(0,0,0,0.1)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'translateY(0)'
              e.currentTarget.style.boxShadow = 'none'
            }}
          >
            <div style={{ color: c.color, fontSize: 22, fontWeight: 700 }}>
              <AnimatedNumber value={c.value} />
            </div>
            <div style={{ color: '#8C8C8C', fontSize: 12, marginTop: 4 }}>{c.label}</div>
          </div>
        ))}
      </div>

      {/* ====== 总价值卡 ====== */}
      <Card style={{ marginBottom: 16, borderRadius: 12, background: 'linear-gradient(135deg, #FFF7E6, #FFE7BA)' }} bordered>
        <Row align="middle" justify="space-between">
          <Col>
            <div style={{ color: '#8C8C8C', fontSize: 12, marginBottom: 4 }}>{t('asset.cardTotalValue')}</div>
            <div style={{ color: '#E8720C', fontSize: 32, fontWeight: 700 }}>
              MOP <AnimatedNumber value={stats.totalValue} />
            </div>
          </Col>
          <Col>
            <Tag color="orange" style={{ fontSize: 13, padding: '4px 12px' }}>
              {t('asset.totalAssetValue')}
            </Tag>
          </Col>
        </Row>
      </Card>

      <Row gutter={16} style={{ marginBottom: 16 }}>
        {/* 资产类型分布 */}
        <Col span={12}>
          <Card title={t('asset.distType')} style={{ borderRadius: 12 }} bordered>
            <Table<DistRow>
              columns={distColumns}
              dataSource={typeData}
              rowKey="key"
              size="middle"
              pagination={false}
            />
          </Card>
        </Col>

        {/* 部门分布 */}
        <Col span={12}>
          <Card title={t('asset.distDepartment')} style={{ borderRadius: 12 }} bordered>
            <Table<DistRow>
              columns={distColumns}
              dataSource={deptData}
              rowKey="key"
              size="middle"
              pagination={false}
            />
          </Card>
        </Col>
      </Row>

      <Row gutter={16}>
        {/* 来源分布 */}
        <Col span={12}>
          <Card title={t('asset.distSource')} style={{ borderRadius: 12 }} bordered>
            {sourceRows.map((r) => (
              <div key={r.key} style={{ marginBottom: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                  <span style={{ fontWeight: 500 }}>{r.name}</span>
                  <span style={{ color: '#8C8C8C' }}>{r.count} ({r.percent}%)</span>
                </div>
                <Progress percent={r.percent} strokeColor={r.color} showInfo={false} />
              </div>
            ))}
          </Card>
        </Col>

        {/* 月度趋势 */}
        <Col span={12}>
          <Card title={t('asset.monthlyTrend')} style={{ borderRadius: 12 }} bordered>
            <Table
              columns={[
                { title: t('asset.colMonth'), dataIndex: 'month', key: 'month', width: 100 },
                { title: t('asset.colMonthlyCount'), dataIndex: 'count', key: 'count', align: 'right' as const, width: 100,
                  render: (v: number) => v || '-' },
                { title: t('asset.colMonthlyValue'), dataIndex: 'value', key: 'value', align: 'right' as const,
                  render: (v: number) => v ? `MOP ${v.toLocaleString()}` : '-' },
              ]}
              dataSource={stats.monthlyTrend.map((m) => ({ key: m.month, ...m }))}
              size="middle"
              pagination={false}
            />
          </Card>
        </Col>
      </Row>
    </div>
  )
}
