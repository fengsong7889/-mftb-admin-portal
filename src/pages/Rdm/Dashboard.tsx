/**
 * 需求全局看板 —— 项目经理 / 公司视角
 *
 * 本页只回答「整体怎么样」，自上而下四块：
 * 1. 交付结果与效能指标（吞吐、响应时长、交付周期、按时率、驳回率）
 * 2. 需求结构（类型分布、阶段耗时瓶颈、提交/交付趋势）
 * 3. 阶段流水线（各阶段当前卡了多少条）
 * 4. 風險與產出入口（只给计数）
 *
 * <p>逐条风险明细与部门/个人负载已拆为独立菜单（rdm-dashboard-risk / rdm-efficiency-output）：
 * 前者是每天要动手跟催的工作页，后者是需要逐行复盘的表，
 * 留在总看板会让一页同时承担“扫一眼”和“逐行看”两种不同任务。
 */
import { useCallback, useEffect, useState } from 'react'
import { Button, Segmented, Space, Spin, Tag, message } from 'antd'
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

  const { overview, typeDist, stageDuration, trend, board } = data

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

      {/* ── 风险与产出入口：明细与两张排名表已拆为独立菜单，这里只留计数与入口，不再复制一份明细 ── */}
      <div className="rdm-card">
        <div className="rdm-card-title">
          <span className="rdm-icon-block" style={{ background: '#FFF1F0', color: '#FF4D4F' }}><AlertOutlined /></span>
          風險與產出
          <span className="rdm-card-title-split" />
          <Space size={6} wrap>
            <Tag color="error" style={{ margin: 0 }}>逾期 {overview.overdueTotal}</Tag>
            <Tag color="purple" style={{ margin: 0 }}>阻塞 {overview.blockedTotal}</Tag>
            <Tag color="orange" style={{ margin: 0 }}>無主 {overview.unassignedTotal}</Tag>
            <Tag color="gold" style={{ margin: 0 }}>審批停滯 {overview.intakeStuckTotal}</Tag>
          </Space>
        </div>
        <div style={{ fontSize: 12, color: '#8C8C8C', marginBottom: 12 }}>
          風險按「当前狀態停留時長」統計；逐條明細跟催請進風險中心，部門與個人負載在另一頁復盤。
        </div>
        <Space size={8} wrap>
          <Button type="primary" ghost icon={<AlertOutlined />} onClick={() => navigate('/rdm-risk')}>
            風險中心
          </Button>
          <Button icon={<TeamOutlined />} onClick={() => navigate('/rdm-output')}>
            部門與人員產出
          </Button>
        </Space>
      </div>
    </div>
  )
}
