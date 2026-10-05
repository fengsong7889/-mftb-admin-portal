/**
 * 需求全局看板 —— 项目经理 / 公司视角
 *
 * 四块内容按「先看结果 → 再看效率 → 再看风险 → 最后看人」的顺序排布：
 * 1. 交付结果与效能指标（吞吐、响应时长、交付周期、按时率、驳回率）
 * 2. 需求结构（类型分布、阶段耗时瓶颈、提交/交付趋势）
 * 3. 风险雷达（逾期、无主、阻塞、审批停滞、长期无进展）
 * 4. 部门与产品经办法人产出排名（M4 转积分入绩效）
 */
import { useCallback, useEffect, useState } from 'react'
import { Button, Progress, Segmented, Space, Spin, Table, Tag, message } from 'antd'
import type { TableColumnsType } from 'antd'
import { Column, Line, Pie } from '@ant-design/charts'
import {
  AlertOutlined,
  BarChartOutlined,
  BranchesOutlined,
  CalculatorOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  ExportOutlined,
  InboxOutlined,
  ReloadOutlined,
  RiseOutlined,
  SafetyCertificateOutlined,
  TeamOutlined,
} from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import StatCards from '../../components/StatCards'
import RiskSummaryCard from './components/RiskSummaryCard'
import { RiskTag } from './components/Tags'
import { fetchDashboard, type RdmDashboardData } from '../../api/rdm'
import { RDM_REQ_TYPE_LABEL, RDM_STAGE_LABEL, type RdmReqType, type RdmStage } from '../../constants/rdm'
import './index.css'

/** 阶段耗时（小时 → 天，图表用） */
const toDays = (hours: number) => Number((hours / 24).toFixed(1))

export default function RdmDashboard() {
  const navigate = useNavigate()
  const [period, setPeriod] = useState('month')
  const [data, setData] = useState<RdmDashboardData | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setData(await fetchDashboard(period))
    } catch {
      message.error('看板數據載入失敗')
    } finally {
      setLoading(false)
    }
  }, [period])

  useEffect(() => { load() }, [load])

  if (loading || !data) {
    return <div className="content-area" style={{ textAlign: 'center', padding: 80 }}><Spin size="large" /></div>
  }

  const { overview, typeDist, deptRank, pmRank, stageDuration, trend, risks, board } = data

  const deptColumns: TableColumnsType<typeof deptRank[number]> = [
    { title: '部門', dataIndex: 'deptName', key: 'deptName', width: 160 },
    { title: '提交需求', dataIndex: 'submitted', key: 'submitted', width: 100, sorter: (a, b) => a.submitted - b.submitted },
    { title: '已交付', dataIndex: 'delivered', key: 'delivered', width: 100 },
    {
      title: '按時交付率', key: 'onTimeRate', width: 180,
      render: (_, r) => (
        <Space>
          <Progress
            percent={Math.round(r.onTimeRate * 100)}
            size="small"
            style={{ width: 90 }}
            strokeColor={r.onTimeRate >= 0.8 ? '#52C41A' : r.onTimeRate >= 0.6 ? '#FA8C16' : '#FF4D4F'}
          />
          <span style={{ fontSize: 12, color: '#595959' }}>{Math.round(r.onTimeRate * 100)}%</span>
        </Space>
      ),
    },
    {
      title: '平均交付天數', dataIndex: 'avgDays', key: 'avgDays', width: 120,
      render: (v: number) => <span style={{ color: v > 20 ? '#CF1322' : '#595959' }}>{v.toFixed(1)} 天</span>,
    },
    {
      title: '操作', key: 'action', width: 90,
      render: () => <Button type="link" size="small" onClick={() => navigate('/rdm-requirement?scope=all')}>明細</Button>,
    },
  ]

  const pmColumns: TableColumnsType<typeof pmRank[number]> = [
    { title: '產品經理', dataIndex: 'pmName', key: 'pmName', width: 120 },
    { title: '在途需求', dataIndex: 'active', key: 'active', width: 100, render: (v: number) => <Tag color={v > 6 ? 'orange' : 'blue'}>{v}</Tag> },
    { title: '已交付', dataIndex: 'delivered', key: 'delivered', width: 100 },
    { title: '逾期', dataIndex: 'overdue', key: 'overdue', width: 80, render: (v: number) => <span style={{ color: v > 0 ? '#CF1322' : '#52C41A' }}>{v}</span> },
    { title: '平均交付天數', dataIndex: 'avgDays', key: 'avgDays', width: 130, render: (v: number) => `${v.toFixed(1)} 天` },
  ]

  return (
    <div className="content-area">
      {/* ── 顶部 ── */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        gap: 12, flexWrap: 'wrap', marginBottom: 16,
      }}>
        <div style={{ fontSize: 18, fontWeight: 700, color: '#262626', display: 'flex', alignItems: 'center', gap: 8 }}>
          <BarChartOutlined style={{ color: '#E8720C' }} />
          產研需求全局看板
          <span style={{ fontSize: 12, fontWeight: 400, color: '#8C8C8C' }}>
            需求吞吐 · 交付效率 · 風險預警 · 個人產出
          </span>
        </div>
        <Space size={8}>
          <Segmented
            value={period}
            onChange={v => setPeriod(v as string)}
            options={[
              { label: '本週', value: 'week' },
              { label: '本月', value: 'month' },
              { label: '本季', value: 'quarter' },
              { label: '本年', value: 'year' },
            ]}
          />
          <Button icon={<ReloadOutlined />} onClick={load}>刷新</Button>
          {/* 質量口徑/版本追溯/週報都是看板子页（不占菜单位），在这里给出唯一入口 */}
          <Button icon={<SafetyCertificateOutlined />} onClick={() => navigate('/rdm-quality')}>質量口徑</Button>
          <Button icon={<BranchesOutlined />} onClick={() => navigate('/rdm-version-trace')}>版本追溯</Button>
          <Button icon={<CalculatorOutlined />} onClick={() => navigate('/rdm-score')}>產出積分</Button>
          <Button className="btn-export" icon={<ExportOutlined />} onClick={() => navigate('/rdm-weekly-report')}>導出週報</Button>
        </Space>
      </div>

      {/* ── 结果指标 ── */}
      <div style={{ marginBottom: 16 }}>
        <StatCards
          animationKey={period}
          items={[
            { key: 'total', icon: <InboxOutlined />, value: overview.reqTotal, label: '需求總量', color: 'info' },
            { key: 'submitted', icon: <RiseOutlined />, value: overview.submittedThisMonth, label: '本期新提交', color: 'brand' },
            { key: 'delivered', icon: <CheckCircleOutlined />, value: overview.deliveredThisMonth, label: '本期已交付', color: 'success' },
            { key: 'response', icon: <ClockCircleOutlined />, value: overview.avgResponseHours, decimals: 1, suffix: ' h', label: '平均響應時長', color: 'system' },
            { key: 'cycle', icon: <ClockCircleOutlined />, value: overview.avgDeliveryDays, decimals: 1, suffix: ' 天', label: '平均交付週期', color: 'info' },
            { key: 'ontime', icon: <CheckCircleOutlined />, value: Math.round(overview.onTimeRate * 100), suffix: '%', label: '按時交付率', color: 'success' },
            { key: 'reject', icon: <AlertOutlined />, value: Math.round(overview.rejectRate * 100), suffix: '%', label: '需求駁回率', color: 'brand' },
            { key: 'risk', icon: <AlertOutlined />, value: overview.overdueTotal, label: '當前逾期', color: 'system' },
          ]}
        />
      </div>

      {/* ── 交付流水线（阶段负载） ── */}
      <div className="rdm-card">
        <div className="rdm-card-title">
          <span className="rdm-icon-block" style={{ background: '#FFF7E6', color: '#E8720C' }}><RiseOutlined /></span>
          交付流水線負載
          <span className="rdm-card-title-split" />
          <span style={{ fontSize: 12, color: '#8C8C8C', fontWeight: 400 }}>點列可進入對應視角處理</span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${board.columns.length}, 1fr)`, gap: 12 }}>
          {board.columns.map(col => (
            <div
              key={col.key}
              onClick={() => navigate('/rdm-requirement')}
              style={{
                border: '1px solid #e8eaed', borderRadius: 8, padding: '12px 14px', cursor: 'pointer',
                background: col.overdue > 0 ? '#FFF7F0' : '#FAFBFC',
                transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
              }}
            >
              <div style={{ fontSize: 12, color: '#8C8C8C' }}>{col.title}</div>
              <div style={{ fontSize: 22, fontWeight: 700, color: '#262626', margin: '4px 0' }}>{col.count}</div>
              {col.overdue > 0
                ? <Tag color="error" style={{ margin: 0 }}>逾期 {col.overdue}</Tag>
                : <span style={{ fontSize: 12, color: '#52C41A' }}>無逾期</span>}
            </div>
          ))}
        </div>
      </div>

      {/* ── 图表区 ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
        <div className="rdm-card" style={{ marginBottom: 0 }}>
          <div className="rdm-card-title">
            <span className="rdm-icon-block" style={{ background: '#E6F7FF', color: '#1890FF' }}><BarChartOutlined /></span>
            需求類型分佈
          </div>
          <Pie
            height={260}
            data={typeDist.map(d => ({ ...d, name: RDM_REQ_TYPE_LABEL[d.name as RdmReqType] ?? d.name }))}
            angleField="value"
            colorField="name"
            radius={0.85}
            innerRadius={0.5}
            label={{ text: 'value', style: { fontWeight: 600 } }}
            legend={{ color: { position: 'right', itemMarker: 'circle' } }}
          />
        </div>
        <div className="rdm-card" style={{ marginBottom: 0 }}>
          <div className="rdm-card-title">
            <span className="rdm-icon-block" style={{ background: '#F9F0FF', color: '#722ED1' }}><ClockCircleOutlined /></span>
            各階段平均停留（天）—— 定位流程瓶頸
          </div>
          <Column
            height={260}
            data={stageDuration.map(d => ({ stage: RDM_STAGE_LABEL[d.stage as RdmStage] ?? d.stage, days: toDays(d.avgHours) }))}
            xField="stage"
            yField="days"
            style={{ maxWidth: 42 }}
            label={{ text: (d: { days: number }) => `${d.days}`, position: 'top', style: { fill: '#8C8C8C' } }}
            tooltip={{ title: (d: { stage: string }) => RDM_STAGE_LABEL[d.stage as RdmStage] ?? d.stage }}
          />
        </div>
      </div>

      <div className="rdm-card">
        <div className="rdm-card-title">
          <span className="rdm-icon-block" style={{ background: '#F6FFED', color: '#52C41A' }}><RiseOutlined /></span>
          提交 / 交付趨勢
        </div>
        <Line
          height={240}
          data={trend.flatMap(d => [
            { date: d.date, type: '新提交', value: d.submitted },
            { date: d.date, type: '已交付', value: d.delivered },
          ])}
          xField="date"
          yField="value"
          colorField="type"
          point={{ sizeField: 3 }}
          legend={{ color: { position: 'top-right' } }}
        />
      </div>

      {/* ── 风险摘要（M4+ AI 辅助：数字来自统计，AI 只写叙述）── */}
      <RiskSummaryCard />

      {/* ── 风险雷达 ── */}
      <div className="rdm-card">
        <div className="rdm-card-title">
          <span className="rdm-icon-block" style={{ background: '#FFF1F0', color: '#FF4D4F' }}><AlertOutlined /></span>
          風險雷達
          <span className="rdm-card-title-split" />
          <Space size={6} style={{ fontSize: 12, color: '#8C8C8C', fontWeight: 400 }}>
            <Tag color="error" style={{ margin: 0 }}>逾期 {overview.overdueTotal}</Tag>
            <Tag color="purple" style={{ margin: 0 }}>阻塞 {overview.blockedTotal}</Tag>
            <Tag color="orange" style={{ margin: 0 }}>無主 {overview.unassignedTotal}</Tag>
            <Tag color="gold" style={{ margin: 0 }}>審批停滯 {overview.intakeStuckTotal}</Tag>
          </Space>
        </div>
        {risks.map(r => (
          <div key={r.reqId} className="rdm-risk-item">
            <RiskTag riskType={r.riskType} />
            <a style={{ color: '#E8720C' }} onClick={() => navigate(`/rdm-detail?id=${r.reqId}`)}>{r.title}</a>
            <span style={{ color: '#8C8C8C', fontSize: 12 }}>{r.reqNo}</span>
            <span style={{ color: '#595959', fontSize: 12 }}>提出人 {r.submitterName}</span>
            <span style={{ color: '#595959', fontSize: 12 }}>處理人 {r.handler}</span>
            <span style={{ marginLeft: 'auto', fontSize: 12, color: '#CF1322' }}>已 {r.days} 天</span>
          </div>
        ))}
      </div>

      {/* ── 产出排名 ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 16 }}>
        <div className="rdm-card" style={{ marginBottom: 0 }}>
          <div className="rdm-card-title">
            <span className="rdm-icon-block" style={{ background: '#E6F7FF', color: '#1890FF' }}><TeamOutlined /></span>
            部門需求產出
          </div>
          <Table
            rowKey="deptName"
            size="small"
            columns={deptColumns}
            dataSource={deptRank}
            pagination={false}
            scroll={{ x: 760 }}
          />
        </div>
        <div className="rdm-card" style={{ marginBottom: 0 }}>
          <div className="rdm-card-title">
            <span className="rdm-icon-block" style={{ background: '#F9F0FF', color: '#722ED1' }}><TeamOutlined /></span>
            產品經理負載
          </div>
          <Table
            rowKey="pmName"
            size="small"
            columns={pmColumns}
            dataSource={pmRank}
            pagination={false}
          />
          <div style={{ fontSize: 12, color: '#8C8C8C', marginTop: 8 }}>
            產出積分規則與績效對接在 M4 上線，當前先沉澱原始數據。
          </div>
        </div>
      </div>
    </div>
  )
}
