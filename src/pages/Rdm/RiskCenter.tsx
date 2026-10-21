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
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Alert, Button, Form, Input, Segmented, Select, Space, Spin, Table, Tag, message } from 'antd'
import type { TableColumnsType } from 'antd'
import {
  AlertOutlined,
  BranchesOutlined,
  BulbOutlined,
  ReloadOutlined,
  RiseOutlined,
  SafetyCertificateOutlined,
  SearchOutlined,
} from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import StatCards from '../../components/StatCards'
import { useColumnConfig } from '../../hooks/useColumnConfig'
import { fetchDashboard, fetchRiskSummary, type RdmDashboardData, type RdmRiskItem, type RdmRiskSummary } from '../../api/rdm'
import {
  RDM_RISK_COLOR,
  RDM_RISK_LABEL,
  RDM_STATUS,
  RDM_STATUS_LABEL,
  formatRdmReqNo,
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
  const { t } = useTranslation()
  const [minStayDays, setMinStayDays] = useState(0)
  const [board, setBoard] = useState<RdmDashboardData | null>(null)
  const [summary, setSummary] = useState<RdmRiskSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [form] = Form.useForm()
  /** 搜索条件（查詢点击后生效；阈值 Segmented 仍属筛选的一部分） */
  const [filters, setFilters] = useState<{ keyword?: string; riskType?: string; status?: string }>({})
  /** 摘要请求序号：阈值快速切换时丢弃过期响应，避免旧摘要盖住新口径 */
  const summarySeq = useRef(0)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    setSummary(null)
    const seq = ++summarySeq.current
    // 先取明细/KPI，摘要单独异步：AI 摘要慢或失败不能挡住整页首屏（历史上会空白 13s+）
    try {
      // 明细先取：看板是首屏唯一依赖，AI 叙述（可能等上游 8s）放后台补齐，
      // 否则整页白屏时间被 AI 调用拖住
      const data = await fetchDashboard('month')
      setBoard(data)
    } catch (err) {
      // 看板接口是静默请求，失败必须在这里说明，不能停在转圈假象上
      const text = err instanceof Error && err.message ? err.message : '風險數據載入失敗'
      setError(text)
      message.error(text)
    } finally {
      setLoading(false)
    }
    // 摘要/要点只影响叙述区，后端超时会自己回落结构化要点
    fetchRiskSummary(minStayDays)
      .then(sum => { if (seq === summarySeq.current) setSummary(sum) })
      .catch(() => { if (seq === summarySeq.current) setSummary(null) })
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

  /** 搜索是在阈值切片上再收窄，卡/表/明细计数同源 */
  const filteredRisks = useMemo(() => {
    const kw = filters.keyword?.trim().toLowerCase()
    return risks.filter(r => {
      if (kw && !`${r.reqNo ?? ''} ${r.title ?? ''} ${r.handler ?? ''}`.toLowerCase().includes(kw)) return false
      if (filters.riskType && r.riskType !== filters.riskType) return false
      if (filters.status && r.status !== filters.status) return false
      return true
    })
  }, [risks, filters])

  /** 状态候选只列当前风险里实际出现的值，避免 23 个状态的噪音 */
  const statusOptions = useMemo(() => {
    const set = new Set<string>()
    risks.forEach(r => { if (r.status) set.add(r.status) })
    return [...set].map(s => ({ value: s, label: RDM_STATUS_LABEL[s as RdmStatus] ?? s }))
  }, [risks])

  const columnMeta = useMemo(() => ([
    { key: 'riskType', title: '風險類型' },
    { key: 'title', title: '需求標題' },
    { key: 'reqNo', title: '需求編號' },
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

  const filteredCounts = useMemo(() => {
    const acc: Record<string, number> = {}
    filteredRisks.forEach(r => { acc[r.riskType] = (acc[r.riskType] ?? 0) + 1 })
    return acc
  }, [filteredRisks])

  /** 摘要是全量口径（服务端按阈值生成），有搜索条件时隐藏，避免与筛后卡/表冲突 */
  const hasSearchFilters = !!(filters.keyword || filters.riskType || filters.status)

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
      title: '需求標題', dataIndex: 'title', key: 'title', width: 260, ellipsis: true,
    },
    /*
     * 審批卡殼（INTAKE_STUCK）行属准入前需求，还没有正式编号；
     * 直接空着会被读成「数据丢了」，必须给「尚未生成」。
     */
    { title: '需求編號', dataIndex: 'reqNo', key: 'reqNo', width: 150, render: (v?: string | null) => formatRdmReqNo(v) },
    {
      title: '當前狀態', dataIndex: 'status', key: 'status', width: 130,
      render: (v?: string | null) => (v ? (RDM_STATUS_LABEL[v as RdmStatus] ?? v) : '-'),
    },
    { title: '當前處理人', dataIndex: 'handler', key: 'handler', width: 100 },
    { title: '提出人', dataIndex: 'submitterName', key: 'submitterName', width: 100 },
    {
      title: '停留天數', dataIndex: 'days', key: 'days', width: 110, align: 'right',
      render: (v: number, r) => {
        // 已归档需求不再计停留：归档是终点，天数只增不减
        if (r.status === RDM_STATUS.CLOSED) return '-'
        return (
          <span style={{ color: v >= 30 ? '#CF1322' : v >= 14 ? '#FA8C16' : '#595959', fontWeight: 600 }}>
            {v} 天
          </span>
        )
      },
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

      <div className="search-section">
        <Form
          form={form}
          layout="inline"
          onFinish={v => setFilters({ keyword: v.keyword, riskType: v.riskType, status: v.status })}
        >
          <Form.Item name="keyword" label={t('rdm.risk.keywordLabel')}>
            <Input allowClear placeholder={t('rdm.risk.keywordPlaceholder')} />
          </Form.Item>
          <Form.Item name="riskType" label={t('rdm.risk.typeLabel')}>
            <Select
              allowClear
              placeholder={t('common.all')}
              options={(Object.keys(RDM_RISK_LABEL) as RdmRiskType[]).map(k => ({ value: k, label: RDM_RISK_LABEL[k] }))}
            />
          </Form.Item>
          <Form.Item name="status" label={t('rdm.risk.statusLabel')}>
            <Select allowClear placeholder={t('common.all')} options={statusOptions} />
          </Form.Item>
          <Form.Item colon={false}>
            <div className="search-actions">
              <Button type="primary" htmlType="submit" icon={<SearchOutlined />}>{t('common.search')}</Button>
              <Button onClick={() => { form.resetFields(); setFilters({}) }}>{t('common.reset')}</Button>
            </div>
          </Form.Item>
        </Form>
      </div>

      <div style={{ marginBottom: 16 }}>
        <StatCards
          animationKey={`risk-${minStayDays}-${JSON.stringify(filters)}`}
          items={[
            { key: 'total', icon: <AlertOutlined />, value: filteredRisks.length, label: '風險需求', color: filteredRisks.length > 0 ? 'brand' : 'success' },
            { key: 'blocked', icon: <AlertOutlined />, value: filteredCounts.BLOCKED ?? 0, label: '阻塞中', color: 'system' },
            { key: 'overdue', icon: <RiseOutlined />, value: filteredCounts.OVERDUE ?? 0, label: '已逾期', color: 'brand' },
            { key: 'unassigned', icon: <AlertOutlined />, value: filteredCounts.UNASSIGNED ?? 0, label: '無主待分配', color: 'info' },
            { key: 'stuck', icon: <SafetyCertificateOutlined />, value: filteredCounts.INTAKE_STUCK ?? 0, label: '審批停滯', color: 'system' },
            { key: 'stagnant', icon: <BranchesOutlined />, value: filteredCounts.STAGNANT ?? 0, label: '超 7 天無進展', color: 'info' },
          ]}
        />
      </div>

      {summary?.narrative && !hasSearchFilters && (
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
          風險明細（{filteredRisks.length}）
          <span className="rdm-card-title-split" />
          {configComponent}
        </div>
        <Table<RdmRiskItem>
          className="nowrap-table"
          rowKey="reqId"
          size="small"
          loading={loading}
          columns={applyConfig(columns) as TableColumnsType<RdmRiskItem>}
          dataSource={filteredRisks}
          scroll={{ x: 1080 }}
          pagination={{
            defaultPageSize: 20,
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
