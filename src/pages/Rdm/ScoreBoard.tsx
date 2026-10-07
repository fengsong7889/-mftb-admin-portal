/**
 * 个人产出积分 —— 绩效口径看板（M4）
 *
 * 设计口径：积分会被 HR 引用进考核，所以这一页的第一职责是"把分算清楚"，
 * 而不是做报表美化。三个必须点：
 * 1. 顶部常驻标注「规则版本 + 生效日期 + 分配模式」——换版本等于换口径，不写出来必然扯皮；
 * 2. 每条流水可展开看逐项因子与中文说明（复杂度/类型/优先级/按时/质量/角色系数）；
 * 3. 推送给绩效的是**建议值**，HR 仍要在考核单校准留痕，本页不假装能替 HR 定分。
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Alert, Button, Modal, Select, Space, Table, Tag, Tooltip, message } from 'antd'
import type { TableColumnsType } from 'antd'
import {
  CalculatorOutlined,
  CrownOutlined,
  ExportOutlined,
  LineChartOutlined,
  ReloadOutlined,
  RiseOutlined,
  SendOutlined,
  SettingOutlined,
  TeamOutlined,
} from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import StatCards from '../../components/StatCards'
/** 阶段 6：页内展开预算、HR 建议与指标口径（不新建路由，避开菜单页名兜底表上限） */
import GovernancePanel from './components/GovernancePanel'
import { useAuth } from '../../contexts/AuthContext'
import {
  fetchScoreBoard,
  pushScoreToPerf,
  recalcScore,
  type RdmPersonalScore,
  type RdmScoreBoardData,
  type RdmScoreRecord,
} from '../../api/rdm'
import {
  RDM_COMPLEXITY_LABEL,
  RDM_PRIORITY_LABEL,
  RDM_REQ_TYPE_LABEL,
  RDM_ROLE_LABEL,
  RDM_SCORE_ALLOC_MODE,
  RDM_SCORE_ALLOC_MODE_LABEL,
  RDM_SCORE_PUSH_STATUS,
  RDM_SCORE_PUSH_STATUS_COLOR,
  RDM_SCORE_PUSH_STATUS_LABEL,
  type RdmComplexity,
  type RdmPriority,
  type RdmReqType,
  type RdmRoleCode,
  type RdmScorePushStatus,
} from '../../constants/rdm'
import './index.css'

/** 排名表展开行：把该人在本周期内的每条得分与成因列出来 */
function ScoreTracePanel({ records }: { records: RdmScoreRecord[] }) {
  if (records.length === 0) {
    return <div className="rdm-empty-hint">本週期該人員沒有可計分的交付需求。</div>
  }
  return (
    <div className="rdm-score-trace">
      {records.map(r => (
        <div key={r.id} className="rdm-score-trace-item">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <b style={{ fontWeight: 600, color: '#262626' }}>{r.score.toFixed(2)} 分</b>
            <span style={{ color: '#595959' }}>{r.reqNo}</span>
            <span style={{ color: '#8C8C8C', fontSize: 12 }}>{r.reqTitle}</span>
            <Tag color="geekblue" style={{ margin: 0 }}>{RDM_ROLE_LABEL[r.roleCode as RdmRoleCode] ?? r.roleCode}</Tag>
            <Tag style={{ margin: 0 }}>{RDM_COMPLEXITY_LABEL[r.complexity as RdmComplexity] ?? r.complexity ?? '-'}</Tag>
            <Tag color="orange" style={{ margin: 0 }}>{RDM_PRIORITY_LABEL[r.priority as RdmPriority] ?? r.priority ?? '-'}</Tag>
            {r.onTime === false && <Tag color="error" style={{ margin: 0 }}>逾期</Tag>}
            {(r.reworkCount ?? 0) > 0 && <Tag color="warning" style={{ margin: 0 }}>返工 {r.reworkCount} 次</Tag>}
          </div>
          {r.breakdown && (
            <div className="rdm-score-trace-formula">
              <span className="rdm-score-trace-label">計算式</span>
              基準 {r.breakdown.base} × 類型 {r.breakdown.typeFactor} × 優先級 {r.breakdown.priorityFactor}
              × 按時 {r.breakdown.onTimeFactor} × 質量 {r.breakdown.qualityFactor}
              × 角色 {r.breakdown.roleFactor} × 單位分 = <b>{r.score.toFixed(2)}</b>
            </div>
          )}
          {r.breakdown?.reasons.map(reason => (
            <div key={reason.code} className="rdm-score-trace-reason">
              <span className="rdm-score-trace-label">{reason.label}</span>
              {reason.memo ?? '—'}
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}

export default function ScoreBoard() {
  const navigate = useNavigate()
  const { hasPermission } = useAuth()
  const [data, setData] = useState<RdmScoreBoardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [periodCode, setPeriodCode] = useState<string>()
  const [busy, setBusy] = useState<'recalc' | 'push' | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setData(await fetchScoreBoard({ periodCode }))
    } catch {
      message.error('積分數據載入失敗')
    } finally {
      setLoading(false)
    }
  }, [periodCode])

  useEffect(() => { void load() }, [load])

  /** 流水按人聚合，供排名表展开使用 */
  const recordsByPerson = useMemo(() => {
    const map = new Map<string, RdmScoreRecord[]>()
    ;(data?.records ?? []).forEach(r => {
      const list = map.get(r.userName) ?? []
      list.push(r)
      map.set(r.userName, list)
    })
    return map
  }, [data])

  /** 重算属于破坏性批量写（会覆盖当期流水），必须先确认 */
  const handleRecalc = () => {
    Modal.confirm({
      title: '確認按當前規則版本重算積分？',
      className: 'custom-confirm-modal',
      icon: <span className="confirm-icon-wrapper"><span className="confirm-icon-text">!</span></span>,
      content: (
        <div className="confirm-info-card">
          <div className="confirm-info-row"><span>週期：</span><b>{periodCode ?? '全部未關閉週期'}</b></div>
          <div className="confirm-info-row"><span>影響：</span><b>已生成的積分流水會被重新覆蓋，已推送到績效的建議值不受影響</b></div>
        </div>
      ),
      okText: '確認重算',
      cancelText: '取消',
      onOk: runRecalc,
    })
  }

  const runRecalc = async () => {
    setBusy('recalc')
    try {
      const count = await recalcScore(periodCode)
      message.success(`已按當前規則版本重算 ${count ?? 0} 條積分流水`)
      await load()
    } catch {
      message.error('重算失敗，請稍後重試')
    } finally {
      setBusy(null)
    }
  }

  /** 推送会写进人事绩效考核单，必须确认 */
  const handlePush = () => {
    if (!data?.period.code) {
      message.warning('請先選擇績效週期')
      return
    }
    Modal.confirm({
      title: '確認推送積分建議值到績效？',
      className: 'custom-confirm-modal',
      icon: <span className="confirm-icon-wrapper"><span className="confirm-icon-text">!</span></span>,
      content: (
        <div className="confirm-info-card">
          <div className="confirm-info-row"><span>週期：</span><b>{data.period.code}</b></div>
          <div className="confirm-info-row"><span>寫入位置：</span><b>績效考核單的建議值通道（suggested_*）</b></div>
          <div className="confirm-info-row"><span>不會做的事：</span><b>不直接算最終得分，評分與校準仍由 HR 完成</b></div>
        </div>
      ),
      okText: '確認推送',
      cancelText: '取消',
      onOk: runPush,
    })
  }

  const runPush = async () => {
    if (!data?.period.code) return
    setBusy('push')
    try {
      const count = await pushScoreToPerf(data.period.code)
      message.success(`已推送 ${count ?? 0} 條建議值到考核單，HR 仍需在校準環節確認`)
      await load()
    } catch {
      message.error('推送失敗，請稍後重試')
    } finally {
      setBusy(null)
    }
  }

  const rankColumns: TableColumnsType<RdmPersonalScore> = useMemo(() => [
    {
      title: '排名', key: 'rank', width: 70,
      render: (_, __, i) => (i < 3
        ? <Tooltip title={`第 ${i + 1} 名`}><Tag color={['gold', 'orange', 'red'][i]} style={{ margin: 0 }} icon={<CrownOutlined />}>{i + 1}</Tag></Tooltip>
        : <span style={{ color: '#8C8C8C' }}>{i + 1}</span>),
    },
    {
      title: '人員', key: 'person', width: 170,
      render: (_, r) => (
        <div style={{ lineHeight: 1.4 }}>
          <div style={{ color: '#262626', fontWeight: 500 }}>{r.userName}</div>
          <div style={{ fontSize: 12, color: '#8C8C8C' }}>{r.empNo}{r.deptName ? ` · ${r.deptName}` : ''}</div>
        </div>
      ),
    },
    {
      title: '總積分', dataIndex: 'totalScore', key: 'totalScore', width: 110,
      sorter: (a, b) => a.totalScore - b.totalScore,
      render: (v: number) => <b style={{ color: '#E8720C', fontSize: 15 }}>{v.toFixed(2)}</b>,
    },
    { title: '參與需求', dataIndex: 'reqCount', key: 'reqCount', width: 100, render: (v: number) => v ?? 0 },
    {
      title: '按時率', dataIndex: 'onTimeRate', key: 'onTimeRate', width: 95,
      render: (v: number) => <span style={{ color: v >= 0.85 ? '#52C41A' : v >= 0.6 ? '#FA8C16' : '#FF4D4F' }}>{Math.round((v ?? 0) * 100)}%</span>,
    },
    {
      title: '一次通過率', dataIndex: 'firstPassRate', key: 'firstPassRate', width: 110,
      render: (v: number) => `${Math.round((v ?? 0) * 100)}%`,
    },
    {
      title: '返工', dataIndex: 'reworkCount', key: 'reworkCount', width: 80,
      render: (v: number) => (v > 0 ? <Tag color="warning" style={{ margin: 0 }}>{v} 次</Tag> : <span style={{ color: '#52C41A' }}>無</span>),
    },
    {
      title: '績效推送', dataIndex: 'pushStatus', key: 'pushStatus', width: 120,
      render: (v?: string | null) => {
        const key = (v ?? RDM_SCORE_PUSH_STATUS.NONE) as RdmScorePushStatus
        return <Tag color={RDM_SCORE_PUSH_STATUS_COLOR[key] ?? 'default'} style={{ margin: 0 }}>{RDM_SCORE_PUSH_STATUS_LABEL[key] ?? v}</Tag>
      },
    },
  ], [])

  const recordColumns: TableColumnsType<RdmScoreRecord> = useMemo(() => [
    { title: '需求編號', dataIndex: 'reqNo', key: 'reqNo', width: 150 },
    {
      title: '需求標題', dataIndex: 'reqTitle', key: 'reqTitle',
      render: (v: string, r) => <a style={{ color: '#E8720C' }} onClick={() => navigate(`/rdm-detail?id=${r.reqId}`)}>{v}</a>,
    },
    { title: '人員', dataIndex: 'userName', key: 'userName', width: 100 },
    {
      title: '角色', dataIndex: 'roleCode', key: 'roleCode', width: 110,
      render: (v: string) => <Tag color="geekblue" style={{ margin: 0 }}>{RDM_ROLE_LABEL[v as RdmRoleCode] ?? v}</Tag>,
    },
    {
      title: '類型', dataIndex: 'reqType', key: 'reqType', width: 110,
      render: (v?: string | null) => RDM_REQ_TYPE_LABEL[v as RdmReqType] ?? v ?? '-',
    },
    {
      title: '得分', dataIndex: 'score', key: 'score', width: 90,
      sorter: (a, b) => a.score - b.score,
      render: (v: number) => <b style={{ color: '#E8720C' }}>{v.toFixed(2)}</b>,
    },
    {
      title: '規則版本', dataIndex: 'ruleVersion', key: 'ruleVersion', width: 100,
      render: (v?: number | null) => <span style={{ fontSize: 12, color: '#8C8C8C' }}>v{v ?? '-'}</span>,
    },
  ], [navigate])

  if (!data && !loading) {
    return <div className="content-area"><Alert type="error" showIcon message="積分數據不可用" /></div>
  }

  const summary = data?.summary
  const splitMode = data?.allocMode === RDM_SCORE_ALLOC_MODE.SPLIT

  return (
    <div className="content-area">
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        gap: 12, flexWrap: 'wrap', marginBottom: 12,
      }}>
        <div style={{ fontSize: 18, fontWeight: 700, color: '#262626', display: 'flex', alignItems: 'center', gap: 8 }}>
          <CalculatorOutlined style={{ color: '#722ED1' }} />
          個人產出積分
          <span style={{ fontSize: 12, fontWeight: 400, color: '#8C8C8C' }}>
            複雜度 × 難度 × 按時 × 質量 × 角色，逐條可追溯
          </span>
        </div>
        <Space size={8} wrap>
          <Select
            style={{ width: 240 }}
            placeholder="績效週期"
            value={periodCode ?? data?.period.code}
            onChange={setPeriodCode}
            options={(data?.cycles ?? []).map(c => ({ value: c.code, label: c.name }))}
          />
          <Button icon={<ReloadOutlined />} onClick={load}>刷新</Button>
          <Button icon={<LineChartOutlined />} onClick={() => navigate('/rdm-metric-trend')}>效能量趨勢</Button>
          <Button icon={<SettingOutlined />} onClick={() => navigate('/rdm-score-rule')}>規則配置</Button>
          <Button icon={<RiseOutlined />} onClick={handleRecalc} loading={busy === 'recalc'}>按當前規則重算</Button>
          <Button
            type="primary"
            icon={<SendOutlined />}
            loading={busy === 'push'}
            onClick={handlePush}
            style={{ backgroundColor: '#722ED1', borderColor: '#722ED1' }}
          >
            推送建議值
          </Button>
        </Space>
      </div>

      {/* 口径标注：换规则版本等于换分数口径，必须常驻显示而不是藏在提示里 */}
      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
        message={(
          <Space size={10} wrap>
            <span>規則版本：<b>v{data?.ruleVersion ?? '-'}</b></span>
            <span>生效日期：<b>{data?.ruleEffectiveFrom ?? '-'}</b></span>
            <span>
              分配模式：
              <b>{RDM_SCORE_ALLOC_MODE_LABEL[(data?.allocMode ?? RDM_SCORE_ALLOC_MODE.EACH) as RdmScoreAllocModeKey] ?? data?.allocMode}</b>
            </span>
            <span>統計週期：<b>{data?.period.name ?? '-'}</b></span>
          </Space>
        )}
        description={splitMode
          ? '當前為「總額按角色瓜分」：單條需求總分固定，參與人越多單人得分越低。適合算人均產能，不適合鼓勵協作。'
          : '當前為「各角色分別計分」：每個參與角色各拿一份含角色係數的分，鼓勵協作，但團隊總分會隨參與人數放大，橫向比較時請看「人均分」。'}
      />

      {summary && (
        <div style={{ marginBottom: 16 }}>
          <StatCards
            animationKey={`${data?.period.code}-${data?.ruleVersion}`}
            items={[
              { key: 'total', icon: <CalculatorOutlined />, value: Number(summary.totalScore.toFixed(1)), decimals: 1, label: '積分總量', color: 'brand' },
              { key: 'person', icon: <TeamOutlined />, value: summary.personCount, label: '計分人數', color: 'info' },
              { key: 'avg', icon: <CrownOutlined />, value: Number(summary.avgScore.toFixed(1)), decimals: 1, label: '人均積分', color: 'system' },
              { key: 'req', icon: <RiseOutlined />, value: summary.deliveredCount, label: '計分需求數', color: 'success' },
              { key: 'ontime', icon: <RiseOutlined />, value: Math.round(summary.onTimeRate * 100), suffix: ' %', label: '按時上線率', color: summary.onTimeRate >= 0.8 ? 'success' : 'brand' },
              { key: 'pass', icon: <RiseOutlined />, value: Math.round(summary.firstPassRate * 100), suffix: ' %', label: '驗收一次通過率', color: 'info' },
              { key: 'rework', icon: <RiseOutlined />, value: summary.reworkTotal, label: '返工扣分次數', color: 'system' },
              { key: 'push', icon: <SendOutlined />, value: summary.pushedCount, label: '已推績效條數', color: 'brand' },
            ]}
          />
        </div>
      )}

      <div className="rdm-card">
        <div className="rdm-card-title">
          <span className="rdm-icon-block" style={{ background: '#F9F0FF', color: '#722ED1' }}><CrownOutlined /></span>
          人員積分排名
          <span className="rdm-card-title-split" />
          <span style={{ fontSize: 12, color: '#8C8C8C', fontWeight: 400 }}>展開行可看每條分的計算式與成因（績效申訴依據）</span>
        </div>
        <Table<RdmPersonalScore>
          rowKey="userName"
          size="small"
          loading={loading}
          columns={rankColumns}
          dataSource={data?.ranking ?? []}
          pagination={false}
          scroll={{ x: 1020 }}
          expandable={{
            expandedRowRender: r => <ScoreTracePanel records={recordsByPerson.get(r.userName) ?? []} />,
          }}
          locale={{ emptyText: '本週期還沒有可計分的交付需求' }}
        />
      </div>

      <div className="rdm-card">
        <div className="rdm-card-title">
          <span className="rdm-icon-block" style={{ background: '#FFF7E6', color: '#E8720C' }}><TeamOutlined /></span>
          部門產出對比
          <span className="rdm-card-title-split" />
          <span style={{ fontSize: 12, color: '#8C8C8C', fontWeight: 400 }}>總分受規模影響，橫向比較請看人均</span>
        </div>
        <Table
          rowKey="deptName"
          size="small"
          columns={[
            { title: '部門', dataIndex: 'deptName', key: 'deptName', width: 160 },
            { title: '總積分', dataIndex: 'totalScore', key: 'totalScore', width: 110, render: (v: number) => v.toFixed(2) },
            { title: '人數', dataIndex: 'personCount', key: 'personCount', width: 90 },
            {
              title: '人均積分', dataIndex: 'avgScore', key: 'avgScore', width: 110,
              sorter: (a, b) => a.avgScore - b.avgScore,
              render: (v: number) => <b style={{ color: '#722ED1' }}>{v.toFixed(2)}</b>,
            },
            {
              title: '按時率', dataIndex: 'onTimeRate', key: 'onTimeRate', width: 110,
              render: (v: number) => `${Math.round(v * 100)}%`,
            },
          ]}
          dataSource={data?.deptRank ?? []}
          pagination={false}
        />
      </div>

      <div className="rdm-card">
        <div className="rdm-card-title">
          <span className="rdm-icon-block" style={{ background: '#E6F7FF', color: '#1890FF' }}><CalculatorOutlined /></span>
          積分明細流水
          <span className="rdm-card-title-split" />
          <Button size="small" icon={<ExportOutlined />} onClick={() => navigate('/rdm-weekly-report')}>週報導出</Button>
        </div>
        <Table<RdmScoreRecord>
          rowKey="id"
          size="small"
          columns={recordColumns}
          dataSource={data?.records ?? []}
          scroll={{ x: 1000 }}
          pagination={{ pageSize: 10, showTotal: t => `共 ${t} 條` }}
          expandable={{ expandedRowRender: r => <ScoreTracePanel records={[r]} /> }}
          locale={{ emptyText: '還沒有積分流水，可點「按當前規則重算」生成' }}
        />
      </div>

      {/* 阶段 6：预算超限、人工复核的绩效建议、指标口径字典 */}
      <GovernancePanel
        periodCode={periodCode ?? data?.period.code}
        editable={hasPermission('rdm-config-score:edit') || hasPermission('rdm-dashboard-score:edit')}
      />

      <div className="rdm-tip-card">
        口徑說明：只對實際參與產出的角色（產品/研發負責人/開發/UI/測試/項目經理/技術負責人）計分，
        提出人、上級、審批人、驗收人不計分；質量因子設 {`下限`} 保護，避免單條返工多次把分數抹平；
        規則改版後歷史流水保留當時版本，不會被新規則重算覆蓋。
      </div>
    </div>
  )
}

/** 分配模式标签类型（避免在 label 查表里写死字符串） */
type RdmScoreAllocModeKey = keyof typeof RDM_SCORE_ALLOC_MODE_LABEL
