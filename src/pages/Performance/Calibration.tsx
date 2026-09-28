import { useCallback, useEffect, useMemo, useState } from 'react'
import { Alert, Button, Checkbox, Input, InputNumber, Modal, Select, Space, Table, Tabs, Tag, Typography, message } from 'antd'
import type { TableColumnsType } from 'antd'
import { ReloadOutlined, SearchOutlined } from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
import { useSearchParams } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { useColumnConfig } from '../../hooks/useColumnConfig'
import {
  ASSESS_STATUS, INDICATOR_SCORE_MAX, PLAN_STATUS, type PerfAssessment, type PerfPlan,
  calibratePerfAssessment, fetchEvaluatorOptions, fetchPerfCalibration, fetchPerfPlans, fetchPlanGrades,
  reassignEvaluator, submitPerfConfirm,
} from '../../api/hrPerformance'
import {
  ASSESS_STATUS_LABEL_KEY, ASSESS_STATUS_TAG_COLOR, CALIBRATION_STATUS_TABS, GRADE_LABEL_KEY,
  GRADE_ORDER, PERF_MENU,
} from './meta'
import { type PerfGradeCount, fetchDistributionGap } from '../../api/hrPerfReport'
import ScoreDrawer from './ScoreDrawer'

interface EvaluatorOption { userId: number; empId: string; name: string; department?: string | null }

/**
 * 校準與確認：整批打分结果拉齐、必要时改判，最后按计划整批提交审批。
 * <p>
 * 改判必须写理由（服务端强校验），审批中（待确认）的单子不能再改，
 * 由服务端拒绝并提示需先在审批中心驳回流程。
 */
export default function PerfCalibration() {
  const { t } = useTranslation()
  const { hasPermission } = useAuth()
  const [searchParams] = useSearchParams()
  const canEdit = hasPermission(`${PERF_MENU.CALIBRATION}:edit`)

  const [plans, setPlans] = useState<PerfPlan[]>([])
  const [planId, setPlanId] = useState<number | undefined>(() => {
    const raw = searchParams.get('planId')
    return raw ? Number(raw) : undefined
  })
  const [rows, setRows] = useState<PerfAssessment[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [size, setSize] = useState(20)
  const [status, setStatus] = useState('all')
  const [keyword, setKeyword] = useState<string>()
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)

  const [drawerId, setDrawerId] = useState<number | null>(null)
  const [calTarget, setCalTarget] = useState<PerfAssessment | null>(null)
  const [calScore, setCalScore] = useState<number | null>(null)
  const [calGrade, setCalGrade] = useState<string>()
  const [calReason, setCalReason] = useState('')
  const [saving, setSaving] = useState(false)

  const [reassignTarget, setReassignTarget] = useState<PerfAssessment | null>(null)
  const [candidates, setCandidates] = useState<EvaluatorOption[]>([])
  const [picked, setPicked] = useState<number>()
  /** 模板等级方案：改判下拉只能选模板内等级，不能拿全局五档去碰运气 */
  const [planGrades, setPlanGrades] = useState<Array<{ code: string; minScore: number }>>([])
  /** 强制分布缺口（建议占比上限）与例外放行声明 */
  const [gap, setGap] = useState<PerfGradeCount[]>([])
  const [submitOpen, setSubmitOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [waive, setWaive] = useState(false)
  const [waiveReason, setWaiveReason] = useState('')

  const refreshPlans = useCallback(() => {
    fetchPerfPlans({ page: 1, size: 100 })
      .then(res => setPlans(res.records || []))
      .catch(() => undefined)
  }, [])

  useEffect(() => { refreshPlans() }, [refreshPlans])

  useEffect(() => {
    if (!planId) { setPlanGrades([]); setGap([]); return }
    fetchPlanGrades(planId).then(setPlanGrades).catch(() => setPlanGrades([]))
    // 缺口预览与提交分开算：提交前就看见超编，而不是等后端报错才知道
    fetchDistributionGap(planId).then(setGap).catch(() => setGap([]))
  }, [planId])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetchPerfCalibration({
        page, size, planId, keyword: keyword || undefined,
        status: status === 'all' ? undefined : status,
      })
      setRows(res.records || [])
      setTotal(res.total || 0)
    } catch {
      // 请求层已统一提示
    } finally {
      setLoading(false)
    }
  }, [page, size, planId, status, keyword])

  useEffect(() => { load() }, [load])

  const statusText = (code?: string) => (code && ASSESS_STATUS_LABEL_KEY[code]
    ? t(ASSESS_STATUS_LABEL_KEY[code]) : (code || '-'))
  const gradeText = (code?: string | null) => (code ? (GRADE_LABEL_KEY[code] ? t(GRADE_LABEL_KEY[code]) : code) : '-')
  const selectedPlan = useMemo(() => plans.find(p => p.id === planId), [plans, planId])

  /** 本页等级分布：只统计已改判/已下发的行，缺模板等级方案时不猜分布 */
  const gradeDistribution = useMemo(() => {
    const map = new Map<string, number>()
    rows.forEach(r => {
      const code = r.calibratedGrade || r.finalGrade
      if (code) map.set(code, (map.get(code) || 0) + 1)
    })
    return [...map.entries()].sort((a, b) => GRADE_ORDER.indexOf(a[0]) - GRADE_ORDER.indexOf(b[0]))
  }, [rows])

  const openCalibrate = (row: PerfAssessment) => {
    setCalTarget(row)
    setCalScore(row.calibratedScore ?? row.supervisorScore ?? null)
    setCalGrade(row.calibratedGrade || undefined)
    setCalReason(row.calibratedReason || '')
  }

  const handleCalibrate = async () => {
    if (!calTarget?.id) return
    if (!calReason.trim()) {
      message.warning(t('hrPerf.reasonRequired'))
      return
    }
    setSaving(true)
    try {
      await calibratePerfAssessment(calTarget.id, {
        score: calScore ?? undefined, grade: calGrade, reason: calReason.trim(),
      })
      message.success(t('hrPerf.calibrationSaved'))
      setCalTarget(null)
      // 顶部统计与缺口都来自计划视图，只刷列表会造成“待校準 N 人”长驻不动
      refreshPlans()
      load()
      if (planId) fetchDistributionGap(planId).then(setGap).catch(() => undefined)
    } catch {
      // 请求层已提示（审批中不可改判/等级不在模板方案内）
    } finally {
      setSaving(false)
    }
  }

  const openReassign = (row: PerfAssessment) => {
    setReassignTarget(row)
    setPicked(row.evaluatorUserId ?? undefined)
    setCandidates(row.evaluatorUserId
      ? [{ userId: row.evaluatorUserId, empId: '', name: row.evaluatorName || '' }] : [])
    fetchEvaluatorOptions().then(list => setCandidates(prev => {
      const merged = [...prev]
      list.forEach(c => { if (!merged.some(m => m.userId === c.userId)) merged.push(c) })
      return merged
    })).catch(() => undefined)
  }

  const handleReassign = async () => {
    if (!picked || !reassignTarget?.id) return
    try {
      await reassignEvaluator(reassignTarget.id, picked)
      message.success(t('hrPerf.evaluatorReassigned'))
      setReassignTarget(null)
      refreshPlans()
      load()
    } catch {
      // 请求层已提示（评估人不存在/不能是被考核人本人/结果已确认）
    }
  }

  const openSubmitConfirm = () => {
    if (!planId || !selectedPlan?.id) return
    setWaive(gap.length === 0)
    setWaiveReason('')
    setSubmitOpen(true)
  }

  const handleConfirmSubmit = async () => {
    if (!planId || !selectedPlan?.id) return
    setSubmitting(true)
    try {
      const next = await submitPerfConfirm(planId, {
        waiveDistribution: gap.length > 0 ? true : undefined,
        waiveReason: gap.length > 0 ? waiveReason.trim() : undefined,
      })
      message.success(t('hrPerf.submittedApproval'))
      setSubmitOpen(false)
      // 计划状态与人数统计都变了，只刷列表会让按钮停在“可提交”的假象上
      setSelectedPlanState(next)
      refreshPlans()
      load()
    } catch {
      // 请求层已提示（未完成评分/未指派评估人/无分数/超编未放行）
    } finally {
      setSubmitting(false)
    }
  }

  /** 把提交后返回的计划写回下拉数据源，按钮 disabled 与顶部提示才能立即跟上 */
  const setSelectedPlanState = (next: PerfPlan) => {
    setPlans(prev => prev.map(p => (p.id === next.id ? next : p)))
  }

  const columns = useMemo<TableColumnsType<PerfAssessment>>(() => [
    { title: t('hrPerf.assessmentReqNo'), dataIndex: 'reqNo', key: 'reqNo', width: 150, fixed: 'left' },
    {
      title: t('hrPerf.employee'), key: 'emp', width: 170,
      render: (_, r) => `${r.empName || '-'}${r.empNo ? ` (${r.empNo})` : ''}`,
    },
    { title: t('hrPerf.department'), dataIndex: 'deptName', key: 'deptName', width: 150, render: (v: string) => v || '-' },
    {
      title: t('hrPerf.evaluator'), key: 'evaluator', width: 140,
      render: (_, r) => (r.evaluatorUserId ? (r.evaluatorName || '-') : <Tag color="error">{t('hrPerf.notAssigned')}</Tag>),
    },
    { title: t('hrPerf.plan'), dataIndex: 'planName', key: 'planName', width: 190, render: (v: string) => v || '-' },
    {
      title: t('hrPerf.selfScore'), dataIndex: 'selfScore', key: 'selfScore', width: 90,
      render: (v: number | null) => (v ?? '-'),
    },
    {
      title: t('hrPerf.supervisorScore'), dataIndex: 'supervisorScore', key: 'supervisorScore', width: 100,
      render: (v: number | null) => (v ?? '-'),
    },
    {
      title: t('hrPerf.calibrated'), key: 'calibrated', width: 140,
      render: (_, r) => (r.calibratedScore == null && !r.calibratedGrade
        ? '-'
        : <Space size={4}>{r.calibratedScore ?? '-'}<Tag color="purple">{gradeText(r.calibratedGrade)}</Tag></Space>),
    },
    {
      title: t('hrPerf.finalResult'), key: 'final', width: 130,
      render: (_, r) => (r.finalScore == null && !r.finalGrade
        ? '-'
        : <Space size={4}>{r.finalScore ?? '-'}<Tag color="gold">{gradeText(r.finalGrade)}</Tag></Space>),
    },
    {
      title: t('common.colStatus'), dataIndex: 'status', key: 'status', width: 110,
      render: (v: string) => <Tag color={ASSESS_STATUS_TAG_COLOR[v]}>{statusText(v)}</Tag>,
    },
    {
      title: t('common.colAction'), key: 'action', width: 210, fixed: 'right',
      render: (_, r) => (
        <Space size={0}>
          <Button type="link" size="small" onClick={() => setDrawerId(r.id)}>{t('common.detail')}</Button>
          {canEdit && r.status === ASSESS_STATUS.CALIBRATION_PENDING && (<>
            <span className="action-split">|</span>
            <Button type="link" size="small" onClick={() => openCalibrate(r)}>{t('hrPerf.calibrate')}</Button>
          </>)}
          {canEdit && r.status !== ASSESS_STATUS.CONFIRMED && (<>
            <span className="action-split">|</span>
            <Button type="link" size="small" onClick={() => openReassign(r)}>{t('hrPerf.reassign')}</Button>
          </>)}
        </Space>
      ),
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [t, canEdit, gradeText])

  const { configComponent, applyConfig } = useColumnConfig(PERF_MENU.CALIBRATION,
    columns.map(c => ({ key: String(c.key), title: String(c.title) })),
    [{ key: 'action', visible: true, locked: 'tail' }])

  const submitDisabled = !planId || !selectedPlan
    || selectedPlan.status !== PLAN_STATUS.RUNNING
    || (selectedPlan.selfPending ?? 0) + (selectedPlan.supervisorPending ?? 0) > 0
    || (selectedPlan.unassigned ?? 0) > 0

  return (
    <div className="content-area">
      <div className="search-section">
        <Space size={12} wrap>
          <span>{t('hrPerf.plan')}</span>
          <Select style={{ width: 280 }} allowClear showSearch optionFilterProp="label"
            placeholder={t('hrPerf.planPlaceholder')} value={planId}
            onChange={v => { setPlanId(v); setPage(1) }}
            options={plans.map(p => ({ value: p.id as number, label: `${p.name}（${p.reqNo}）` }))} />
          <span>{t('hrPerf.employee')}</span>
          <Input style={{ width: 200 }} allowClear value={input}
            placeholder={t('hrPerf.calibrationKeywordPlaceholder')}
            onChange={e => setInput(e.target.value)}
            onPressEnter={() => { setKeyword(input.trim() || undefined); setPage(1) }} />
          <Button type="primary" icon={<SearchOutlined />}
            onClick={() => { setKeyword(input.trim() || undefined); setPage(1) }}>
            {t('common.search')}
          </Button>
          <Button icon={<ReloadOutlined />} onClick={() => {
            setInput(''); setKeyword(undefined); setPage(1)
          }}>
            {t('common.reset')}
          </Button>
        </Space>
      </div>

      <Tabs
        activeKey={status}
        items={CALIBRATION_STATUS_TABS.map(key => ({
          key, label: key === 'all' ? t('common.all') : statusText(key),
        }))}
        onChange={key => { setStatus(key); setPage(1) }}
        style={{ marginBottom: 0 }}
      />

      <div className="action-section">
        <div className="action-section-left">
          {canEdit && (
            <Button type="primary" disabled={submitDisabled} onClick={openSubmitConfirm}>
              {t('hrPerf.submitConfirm')}
            </Button>
          )}
          {selectedPlan && (
            <Typography.Text type="secondary">
              {t('hrPerf.planProgress', {
                total: selectedPlan.total ?? 0,
                calibrated: selectedPlan.calibrationPending ?? 0,
                unassigned: selectedPlan.unassigned ?? 0,
              })}
            </Typography.Text>
          )}
          {!planId && <Typography.Text type="secondary">{t('hrPerf.pickPlanFirstTip')}</Typography.Text>}
        </div>
        <div className="action-section-right">{configComponent}</div>
      </div>

      {gap.length > 0 && (
        <Alert type="warning" showIcon style={{ marginBottom: 10 }}
          message={t('hrPerf.distributionGapTitle')}
          description={gap.map(g => `${gradeText(g.grade)}：${g.gapNote || ''}`).join('；')} />
      )}
      {selectedPlan?.status === PLAN_STATUS.CONFIRM_PENDING && (
        <Alert type="info" showIcon style={{ marginBottom: 10 }} message={t('hrPerf.approvingAlert')}
          description={selectedPlan.flowNo ? `${t('hrPerf.flowNo')}: ${selectedPlan.flowNo}` : undefined} />
      )}
      {gradeDistribution.length > 0 && (
        <Alert type="info" showIcon style={{ marginBottom: 10 }}
          message={`${t('hrPerf.gradeDistribution')}：${gradeDistribution.map(([code, count]) => `${gradeText(code)} ${count}`).join(' / ')}`}
          description={t('hrPerf.gradeDistributionScopeTip')} />
      )}

      <Table<PerfAssessment>
        className="nowrap-table"
        columns={applyConfig(columns)}
        dataSource={rows}
        rowKey="id"
        loading={loading}
        scroll={{ x: 'max-content' }}
        pagination={{
          current: page, pageSize: size, total, showSizeChanger: true, showQuickJumper: true,
          showTotal: (c) => t('common.total', { count: c }),
          onChange: (p, s) => { setPage(s !== size ? 1 : p); setSize(s) },
        }}
      />

      <ScoreDrawer open={!!drawerId} assessmentId={drawerId ?? undefined} mode="view"
        onClose={() => setDrawerId(null)} onChanged={load} />

      <Modal title={t('hrPerf.calibrateTitle')} open={!!calTarget} confirmLoading={saving}
        onOk={handleCalibrate} onCancel={() => setCalTarget(null)} destroyOnClose>
        <Typography.Paragraph type="secondary">
          {calTarget ? `${calTarget.empName || '-'} · ${calTarget.deptName || '-'}` : ''}
        </Typography.Paragraph>
        <Space direction="vertical" style={{ width: '100%' }} size={12}>
          <div>
            <Typography.Text>{t('hrPerf.calibratedScore')}</Typography.Text>
            <InputNumber style={{ width: '100%', marginTop: 4 }} min={0} max={INDICATOR_SCORE_MAX}
              precision={2} value={calScore} placeholder={t('hrPerf.calibratedScorePlaceholder')}
              onChange={v => setCalScore(v == null ? null : Number(v))} />
          </div>
          <div>
            <Typography.Text>{t('hrPerf.calibratedGrade')}</Typography.Text>
            <Select style={{ width: '100%', marginTop: 4 }} allowClear value={calGrade}
              placeholder={t('hrPerf.calibratedGradePlaceholder')} onChange={setCalGrade}
              options={(planGrades.length ? planGrades : GRADE_ORDER.map(code => ({ code, minScore: 0 })))
                .map(g => ({ value: g.code, label: g.minScore ? `${gradeText(g.code)} ≥ ${g.minScore}` : gradeText(g.code) }))} />
          </div>
          <div>
            <Typography.Text strong>{t('hrPerf.calibratedReason')}<span style={{ color: '#CF1322' }}> *</span></Typography.Text>
            <Input.TextArea rows={3} maxLength={500} showCount style={{ marginTop: 4 }}
              value={calReason} placeholder={t('hrPerf.reasonPlaceholder')}
              onChange={e => setCalReason(e.target.value)} />
          </div>
        </Space>
      </Modal>

      <Modal title={t('hrPerf.submitConfirmTitle')} open={submitOpen} confirmLoading={submitting}
        okText={t('common.confirmSubmit')}
        okButtonProps={{ disabled: gap.length > 0 && !(waive && !!waiveReason.trim()) }}
        onOk={handleConfirmSubmit} onCancel={() => setSubmitOpen(false)} destroyOnClose>
        <Typography.Paragraph>{`${selectedPlan?.reqNo} · ${selectedPlan?.name}`}</Typography.Paragraph>
        <Typography.Paragraph>
          {t('hrPerf.submitConfirmHeadcount', { count: selectedPlan?.total ?? 0 })}
        </Typography.Paragraph>
        {gradeDistribution.length > 0 && (
          <Typography.Paragraph type="secondary">
            {t('hrPerf.gradeDistribution')}：{gradeDistribution.map(([code, count]) => `${gradeText(code)} ${count}`).join(' / ')}
          </Typography.Paragraph>
        )}
        <Typography.Paragraph type="secondary">{t('hrPerf.submitConfirmLockedTip')}</Typography.Paragraph>
        {gap.length > 0 && (
          <>
            <Alert type="warning" showIcon style={{ marginBottom: 12 }}
              message={t('hrPerf.distributionGapTitle')}
              description={gap.map(g => `${gradeText(g.grade)}：${g.gapNote || ''}`).join('；')} />
            <Checkbox checked={waive} onChange={e => setWaive(e.target.checked)}>
              {t('hrPerf.waiveDistribution')}
            </Checkbox>
            {waive && (
              <Input.TextArea rows={2} maxLength={500} showCount style={{ marginTop: 8 }}
                value={waiveReason} placeholder={t('hrPerf.waiveReasonPlaceholder')}
                onChange={e => setWaiveReason(e.target.value)} />
            )}
          </>
        )}
      </Modal>

      <Modal title={t('hrPerf.reassignTitle')} open={!!reassignTarget}
        onOk={handleReassign} onCancel={() => setReassignTarget(null)}
        okButtonProps={{ disabled: !picked }} destroyOnClose>
        <Typography.Paragraph type="secondary">{t('hrPerf.reassignTip')}</Typography.Paragraph>
        <Select style={{ width: '100%' }} showSearch allowClear optionFilterProp="label"
          placeholder={t('hrPerf.evaluatorPlaceholder')} value={picked} onChange={setPicked}
          options={candidates.map(c => ({
            value: c.userId,
            label: `${c.name}${c.empId ? `（${c.empId}）` : ''}${c.department ? ` · ${c.department}` : ''}`,
          }))} />
      </Modal>
    </div>
  )
}
