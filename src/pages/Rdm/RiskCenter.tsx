/**
 * 風險中心 —— 当前在途风险的唯一工作页（M4+ 从总看板拆出）
 *
 * 为什么独立成页：
 * 1. 频次与角色不同。风险是技术负责人/PMO **每天**要看并要动手的（跟催、解塞、分发），
 *    而交付看板是周度复盘看的；放在一起导致每天的日常动作要先滚过 KPI 与阶段条。
 * 2. 收敛口径。拆之前同一批风险有三份 SQL（看板雷达 LIMIT 20、AI 摘要 LIMIT 12、周报另算），
 *    同页并列会出现「上面说 5 条、下面列 6 条」。现在明细与摘要都走
 *    RdmAnalyticsService.riskList 这一份取数。
 * 3. 原来「近 7/14/30 天」是假的：服务端压根没把这个参数用于筛选。这里改成真实可用的
 *    「停留 ≥ N 天」阈值——风险的意义就是「现在卡在谁手上卡了多久」。
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Alert, Button, Segmented, Space, Spin, Table, Tag, message } from 'antd'
import type { TableColumnsType } from 'antd'
import {
  AlertOutlined,
  BranchesOutlined,
  BulbOutlined,
  ReloadOutlined,
  RiseOutlined,
  SafetyCertificateOutlined,
} from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import StatCards from '../../components/StatCards'
import { useColumnConfig } from '../../hooks/useColumnConfig'
import { fetchDashboard, fetchRiskSummary, type RdmDashboardData, type RdmRiskItem, type RdmRiskSummary } from '../../api/rdm'
import {
  RDM_RISK_COLOR,
  RDM_RISK_LABEL,
  RDM_STATUS_LABEL,
  type RdmRiskType,
  type RdmStatus,
} from '../../constants/rdm'
import './index.css'

/** 停留天数阈值选项：0 表示看全部风险，不做时长筛选 */
const STAY_OPTIONS = [
  { label: '全部', value: '0' },
  { label: '停留 ≥ 7 天', value: '7' },
  { label: '停留 ≥ 14 天', value: '14' },
  { label: '停留 ≥ 30 天', value: '30' },
]

export default function RiskCenter() {
  const navigate = useNavigate()
  const [minStayDays, setMinStayDays] = useState(0)
  const [board, setBoard] = useState<RdmDashboardData | null>(null)
  const [summary, setSummary] = useState<RdmRiskSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      // 明细与摘要并行取；两者在后端共用同一份 riskList，所以不会出现两套数字
      const [data, sum] = await Promise.all([
        fetchDashboard('month'),
        fetchRiskSummary(minStayDays),
      ])
      setBoard(data)
      setSummary(sum)
    } catch (err) {
      // 看板接口是静默请求，失败必须在这里说明，不能停在转圈假象上
      const text = err instanceof Error && err.message ? err.message : '風險數據載入失敗'
      setError(text)
      message.error(text)
    } finally {
      setLoading(false)
    }
  }, [minStayDays])

  useEffect(() => { void load() }, [load])

  /**
   * 列表以看板 risks 为准（它按 riskList 全量给），摘要接口只负责叙述与要点。
   * <p>不在前端用 topRisks 兜底：那会让「筛选阈值」生效与否取决于哪个请求先回来。
   */
  const risks = useMemo<RdmRiskItem[]>(() => {
    const all = board?.risks ?? []
    return minStayDays > 0 ? all.filter(r => (r.days ?? 0) >= minStayDays) : all
  }, [board, minStayDays])

  const columnMeta = useMemo(() => ([
    { key: 'riskType', title: '風險類型' },
    { key: 'title', title: '需求' },
    { key: 'status', title: '當前狀態' },
    { key: 'handler', title: '當前處理人' },
    { key: 'submitterName', title: '提出人' },
    { key: 'days', title: '停留天數' },
    { key: 'action', title: '操作' },
  ]), [])
  const { configComponent, applyConfig } = useColumnConfig('rdm-risk-center', columnMeta, [
    { key: 'riskType', visible: true, locked: 'head' as const },
    { key: 'action', visible: true, locked: 'tail' as const },
  ])

  const counts = useMemo(() => {
    const acc: Record<string, number> = {}
    risks.forEach(r => { acc[r.riskType] = (acc[r.riskType] ?? 0) + 1 })
    return acc
  }, [risks])

  const columns: TableColumnsType<RdmRiskItem> = [
    {
      title: '風險類型', dataIndex: 'riskType', key: 'riskType', width: 120,
      render: (v: string) => {
        const color = RDM_RISK_COLOR[v as RdmRiskType] ?? '#8C8C8C'
        return (
          <Tag style={{ margin: 0, color, borderColor: `${color}66`, background: `${color}12` }}>
            {RDM_RISK_LABEL[v as RdmRiskType] ?? v}
          </Tag>
        )
      },
    },
    {
      title: '需求', key: 'title', width: 320,
      render: (_, r) => (
        <div style={{ lineHeight: 1.5 }}>
          <span style={{ color: '#262626' }}>{r.title}</span>
          <span style={{ display: 'block', fontSize: 12, color: '#8C8C8C' }}>{r.reqNo}</span>
        </div>
      ),
    },
    {
      title: '當前狀態', dataIndex: 'status', key: 'status', width: 130,
      render: (v?: string | null) => (v ? (RDM_STATUS_LABEL[v as RdmStatus] ?? v) : '-'),
    },
    { title: '當前處理人', dataIndex: 'handler', key: 'handler', width: 120 },
    { title: '提出人', dataIndex: 'submitterName', key: 'submitterName', width: 110 },
    {
      title: '停留天數', dataIndex: 'days', key: 'days', width: 110, align: 'right',
      render: (v: number) => (
        <span style={{ color: v >= 30 ? '#CF1322' : v >= 14 ? '#FA8C16' : '#595959', fontWeight: 600 }}>
          {v} 天
        </span>
      ),
    },
    {
      title: '操作', key: 'action', width: 90, fixed: 'right',
      render: (_, r) => (
        <Button type="link" size="small" onClick={() => navigate(`/rdm-detail?id=${r.reqId}`)}>詳情</Button>
      ),
    },
  ]

  if (loading && !board) {
    return (
      <div className="content-area" style={{ textAlign: 'center', padding: 80 }}>
        <Spin size="large" />
      </div>
    )
  }

  return (
    <div className="content-area">
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        gap: 12, flexWrap: 'wrap', marginBottom: 16,
      }}>
        <div style={{ fontSize: 18, fontWeight: 700, color: '#262626', display: 'flex', alignItems: 'center', gap: 8 }}>
          <AlertOutlined style={{ color: '#FF4D4F' }} />
          風險中心
          <span style={{ fontSize: 12, fontWeight: 400, color: '#8C8C8C' }}>
            逾期 · 阻塞 · 無主 · 審批停滯 · 超 7 天無進展（按當前狀態停留時長統計）
          </span>
        </div>
        <Space size={8} wrap>
          <Segmented
            value={String(minStayDays)}
            options={STAY_OPTIONS}
            onChange={v => setMinStayDays(Number(v))}
          />
          <Button icon={<ReloadOutlined />} onClick={load}>刷新</Button>
          <Button onClick={() => navigate('/rdm-dashboard')}>交付看板</Button>
          <Button onClick={() => navigate('/rdm-requirement')}>需求台賬</Button>
        </Space>
      </div>

      {error && !board && (
        <Alert
          type="error"
          showIcon
          style={{ marginBottom: 16 }}
          message="風險數據載入失敗"
          description={`${error}。可點「刷新」重試。`}
        />
      )}

      <div style={{ marginBottom: 16 }}>
        <StatCards
          animationKey={`risk-${minStayDays}`}
          items={[
            { key: 'total', icon: <AlertOutlined />, value: risks.length, label: '風險需求', color: risks.length > 0 ? 'brand' : 'success' },
            { key: 'blocked', icon: <AlertOutlined />, value: counts.BLOCKED ?? 0, label: '阻塞中', color: 'system' },
            { key: 'overdue', icon: <RiseOutlined />, value: counts.OVERDUE ?? 0, label: '已逾期', color: 'brand' },
            { key: 'unassigned', icon: <AlertOutlined />, value: counts.UNASSIGNED ?? 0, label: '無主待分配', color: 'info' },
            { key: 'stuck', icon: <SafetyCertificateOutlined />, value: counts.INTAKE_STUCK ?? 0, label: '審批停滯', color: 'system' },
            { key: 'stagnant', icon: <BranchesOutlined />, value: counts.STAGNANT ?? 0, label: '超 7 天無進展', color: 'info' },
          ]}
        />
      </div>

      {summary?.narrative && (
        <div className="rdm-risk-narrative" style={{ marginBottom: 16 }}>
          <div className="rdm-risk-narrative-text">{summary.narrative}</div>
          <Space size={6} wrap style={{ marginTop: 6 }}>
            {summary.aiUsed
              ? (
                <Tag color="purple" icon={<BulbOutlined />} style={{ margin: 0 }}>
                  AI 生成 · {summary.model ?? '模型'} · 僅描述文字，數字來自統計
                </Tag>
              )
              : <Tag style={{ margin: 0 }}>結構化摘要（未經 AI）</Tag>}
            {summary.notice && <Tag color="warning" style={{ margin: 0 }}>{summary.notice}</Tag>}
          </Space>
          {summary.highlights && summary.highlights.length > 0 && (
            <ul className="rdm-risk-highlights">
              {summary.highlights.map(h => <li key={h}>{h}</li>)}
            </ul>
          )}
        </div>
      )}

      <div className="rdm-card">
        <div className="rdm-card-title">
          <span className="rdm-icon-block" style={{ background: '#FFF1F0', color: '#FF4D4F' }}><AlertOutlined /></span>
          風險明細（{risks.length}）
          <span className="rdm-card-title-split" />
          {configComponent}
        </div>
        <Table<RdmRiskItem>
          className="nowrap-table"
          rowKey="reqId"
          size="small"
          loading={loading}
          columns={applyConfig(columns) as TableColumnsType<RdmRiskItem>}
          dataSource={risks}
          scroll={{ x: 1100 }}
          pagination={{
            pageSize: 20,
            showSizeChanger: true,
            showQuickJumper: true,
            pageSizeOptions: ['10', '20', '50', '100'],
            showTotal: t => `共 ${t} 條`,
          }}
        />
      </div>
    </div>
  )
}
