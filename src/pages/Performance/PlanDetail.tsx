import { useCallback, useEffect, useMemo, useState } from 'react'
import { Alert, Button, Card, Col, Descriptions, Modal, Row, Select, Space, Table, Tag, Typography, message } from 'antd'
import type { TableColumnsType } from 'antd'
import { useTranslation } from 'react-i18next'
import { useNavigate, useSearchParams } from 'react-router-dom'
import dayjs from 'dayjs'
import DetailPageHeader from '../../components/DetailPageHeader'
import { useAuth } from '../../contexts/AuthContext'
import {
  ASSESS_STATUS, PLAN_STATUS, type PerfAssessment, type PerfPlan,
  fetchEvaluatorOptions, fetchPerfPlan, fetchPlanAssessments, reassignEvaluator, submitPerfConfirm,
} from '../../api/hrPerformance'
import {
  ASSESS_STATUS_LABEL_KEY, ASSESS_STATUS_TAG_COLOR, GRADE_LABEL_KEY, PERF_MENU, PLAN_STATUS_LABEL_KEY,
  PLAN_STATUS_TAG_COLOR, PLAN_STAGES, calibrationPath, planFormPath,
} from './meta'
import ScoreDrawer from './ScoreDrawer'

interface EvaluatorOption { userId: number; empId: string; name: string; department?: string | null }

/**
 * 计划详情 = 进度看板 + 本计划考核单清单（改派评估人、查看评分）。
 * <p>
 * 整批提交审批放在本页：一次计划一条流程，避免审批中心被逐人单据刷爆；
 * 未完成评分或存在未指派评估人时按钮直接给出缺口数字，服务端仍会二次把关。
 */
export default function PerfPlanDetail() {
  const navigate = useNavigate()
  const { t } = useTranslation()
  const { hasPermission } = useAuth()
  const [searchParams] = useSearchParams()
  const planId = Number(searchParams.get('id'))

  const canCalibrate = hasPermission(`${PERF_MENU.CALIBRATION}:edit`)

  const [plan, setPlan] = useState<PerfPlan | null>(null)
  const [rows, setRows] = useState<PerfAssessment[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [size, setSize] = useState(20)
  const [status, setStatus] = useState<string>('all')
  const [loading, setLoading] = useState(false)

  const [drawer, setDrawer] = useState<{ id: number; mode: 'self' | 'supervisor' | 'view' } | null>(null)
  const [reassignTarget, setReassignTarget] = useState<PerfAssessment | null>(null)
  const [candidates, setCandidates] = useState<EvaluatorOption[]>([])
  const [picked, setPicked] = useState<number>()
  const [submitting, setSubmitting] = useState(false)

  const load = useCallback(async () => {
    if (!planId) return
    setLoading(true)
    try {
      const [detail, list] = await Promise.all([
        fetchPerfPlan(planId),
        fetchPlanAssessments(planId, { page, size, status: status === 'all' ? undefined : status }),
      ])
      setPlan(detail)
      setRows(list.records || [])
      setTotal(list.total || 0)
    } catch {
      // 请求层已统一提示
    } finally {
      setLoading(false)
    }
  }, [planId, page, size, status])

  useEffect(() => { load() }, [load])

  const planStatusText = (code?: string) => (code && PLAN_STATUS_LABEL_KEY[code]
    ? t(PLAN_STATUS_LABEL_KEY[code]) : (code || '-'))
  const assessStatusText = (code?: string) => (code && ASSESS_STATUS_LABEL_KEY[code]
    ? t(ASSESS_STATUS_LABEL_KEY[code]) : (code || '-'))
  const gradeText = (code?: string | null) => (code ? (GRADE_LABEL_KEY[code] ? t(GRADE_LABEL_KEY[code]) : code) : '-')

  const notScored = (plan?.selfPending ?? 0) + (plan?.supervisorPending ?? 0)
  const canSubmit = plan?.status === PLAN_STATUS.RUNNING && !notScored && !(plan?.unassigned ?? 0) && (plan?.total ?? 0) > 0

  const openReassign = (row: PerfAssessment) => {
    setReassignTarget(row)
    setPicked(row.evaluatorUserId ?? undefined)
    setCandidates(row.evaluatorUserId ? [{
      userId: row.evaluatorUserId, empId: '', name: row.evaluatorName || '',
    }] : [])
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
      load()
    } catch {
      // 请求层已提示（评估人不能是被考核人本人等）
    }
  }

  const handleSubmitConfirm = () => {
    if (!plan?.id) return
    Modal.confirm({
      title: t('hrPerf.submitConfirmTitle'),
      content: (
        <div>
          <Typography.Paragraph>{t('hrPerf.submitConfirmHeadcount', { count: plan.total ?? 0 })}</Typography.Paragraph>
          <Typography.Paragraph type="secondary">{t('hrPerf.submitConfirmLockedTip')}</Typography.Paragraph>
        </div>
      ),
      okText: t('common.confirmSubmit'),
      onOk: async () => {
        setSubmitting(true)
        try {
          const next = await submitPerfConfirm(plan.id as number)
          message.success(t('hrPerf.submittedApproval'))
          setPlan(next)
          load()
        } catch {
          // 请求层已提示（未完成评分/未指派评估人/无分数）
        } finally {
          setSubmitting(false)
        }
      },
    })
  }

  const columns = useMemo<TableColumnsType<PerfAssessment>>(() => [
    { title: t('hrPerf.assessmentReqNo'), dataIndex: 'reqNo', key: 'reqNo', width: 150 },
    {
      title: t('hrPerf.employee'), key: 'emp', width: 170,
      render: (_, r) => `${r.empName || '-'}${r.empNo ? ` (${r.empNo})` : ''}`,
    },
    { title: t('hrPerf.department'), dataIndex: 'deptName', key: 'deptName', width: 150, render: (v: string) => v || '-' },
    {
      title: t('hrPerf.evaluator'), key: 'evaluator', width: 150,
      render: (_, r) => (r.evaluatorUserId
        ? r.evaluatorName || '-'
        : <Tag color="error">{t('hrPerf.notAssigned')}</Tag>),
    },
    {
      title: t('hrPerf.selfScore'), dataIndex: 'selfScore', key: 'selfScore', width: 90,
      render: (v: number | null) => (v == null ? '-' : v),
    },
    {
      title: t('hrPerf.supervisorScore'), dataIndex: 'supervisorScore', key: 'supervisorScore', width: 110,
      render: (v: number | null) => (v == null ? '-' : v),
    },
    {
      title: t('hrPerf.calibrated'), key: 'calibrated', width: 130,
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
      render: (v: string) => <Tag color={ASSESS_STATUS_TAG_COLOR[v]}>{assessStatusText(v)}</Tag>,
    },
    {
      title: t('common.colAction'), key: 'action', width: 170, fixed: 'right',
      render: (_, r) => (
        <Space size={0}>
          <Button type="link" size="small" onClick={() => setDrawer({ id: r.id, mode: 'view' })}>
            {t('common.detail')}
          </Button>
          {canCalibrate && (<>
            <span className="action-split">|</span>
            <Button type="link" size="small" onClick={() => openReassign(r)}>{t('hrPerf.reassign')}</Button>
          </>)}
          {canCalibrate && r.status === ASSESS_STATUS.CALIBRATION_PENDING && (<>
            <span className="action-split">|</span>
            <Button type="link" size="small" onClick={() => navigate(calibrationPath(planId))}>
              {t('hrPerf.goCalibration')}
            </Button>
          </>)}
        </Space>
      ),
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [t, canCalibrate, navigate, planId])

  if (!planId) {
    return <Alert type="error" showIcon message={t('hrPerf.missingPlanId')} />
  }

  return (
    <div className="content-area">
      <DetailPageHeader
        title={t('hrPerf.planDetailTitle')}
        tags={<>
          <Tag color={PLAN_STATUS_TAG_COLOR[plan?.status || '']}>{planStatusText(plan?.status)}</Tag>
          {plan?.flowNo && (
            <Tag color="blue">{t('hrPerf.flowNo')}: {plan.flowNo}</Tag>
          )}
        </>}
        meta={plan ? `${plan.reqNo} · ${plan.name} · ${t('hrPerf.headcount')}: ${plan.total ?? 0}` : '-'}
        onBack={() => navigate(-1)}
        extra={(<>
          {canCalibrate && plan?.status === PLAN_STATUS.CONFIRM_PENDING && plan?.flowNo && (
            <Button onClick={() => navigate(`/hr-flow-detail?flowNo=${encodeURIComponent(plan.flowNo!)}`)}>
              {t('hrPerf.viewFlow')}
            </Button>
          )}
          {canCalibrate && (
            <Button type="primary" disabled={!canSubmit} loading={submitting} onClick={handleSubmitConfirm}>
              {t('hrPerf.submitConfirm')}
            </Button>
          )}
        </>)}
      />

      {plan?.status === PLAN_STATUS.RUNNING && notScored > 0 && (
        <Alert type="warning" showIcon style={{ marginBottom: 10 }}
          message={t('hrPerf.notScoredAlert', { count: notScored })} />
      )}
      {(plan?.unassigned ?? 0) > 0 && (
        <Alert type="error" showIcon style={{ marginBottom: 10 }}
          message={t('hrPerf.unassignedAlert', { count: plan?.unassigned ?? 0 })}
          description={t('hrPerf.unassignedAlertDesc')} />
      )}
      {plan?.status === PLAN_STATUS.CONFIRM_PENDING && (
        <Alert type="info" showIcon style={{ marginBottom: 10 }} message={t('hrPerf.approvingAlert')} />
      )}

      <Row gutter={[10, 10]} style={{ marginBottom: 12 }}>
        {PLAN_STAGES.map(stage => {
          const value = Number(plan?.[stage.field] ?? 0)
          return (
            <Col key={String(stage.field)} flex="1 1 150px">
              <Card size="small">
                <Typography.Text type="secondary">{t(stage.labelKey)}</Typography.Text>
                <div style={{ fontSize: 22, fontWeight: 600, color: value ? '#E8720C' : '#8C8C8C' }}>{value}</div>
              </Card>
            </Col>
          )
        })}
        <Col flex="1 1 150px">
          <Card size="small">
            <Typography.Text type="secondary">{t('hrPerf.unassignedEvaluator')}</Typography.Text>
            <div style={{ fontSize: 22, fontWeight: 600, color: plan?.unassigned ? '#CF1322' : '#8C8C8C' }}>
              {plan?.unassigned ?? 0}
            </div>
          </Card>
        </Col>
      </Row>

      <Card size="small" style={{ marginBottom: 12 }}
        title={t('hrPerf.basicInfo')}
        extra={<Button type="link" size="small" onClick={() => navigate(planFormPath())}>{t('hrPerf.launchAnother')}</Button>}>
        <Descriptions size="small" column={2} items={[
          { key: 'cycle', label: t('hrPerf.cycle'), children: plan?.cycleName || '-' },
          { key: 'template', label: t('hrPerf.template'), children: plan?.templateName || '-' },
          {
            key: 'selfWindow',
            label: t('hrPerf.selfWindow'),
            children: plan ? `${plan.selfStart} ~ ${plan.selfEnd}` : '-',
          },
          {
            key: 'supWindow',
            label: t('hrPerf.supWindow'),
            children: plan ? `${plan.supStart} ~ ${plan.supEnd}` : '-',
          },
          { key: 'calibEnd', label: t('hrPerf.calibEnd'), children: plan?.calibEnd || '-' },
          {
            key: 'updated',
            label: t('common.lastEditTime'),
            children: plan?.updatedAt ? dayjs(plan.updatedAt).format('YYYY-MM-DD HH:mm') : '-',
          },
          { key: 'summary', label: t('hrPerf.planSummary'), span: 2, children: plan?.summary || '-' },
        ]} />
      </Card>

      <div className="search-section">
        <Space size={12} wrap>
          <span>{t('common.colStatus')}</span>
          <Select style={{ width: 180 }} value={status}
            onChange={v => { setStatus(v); setPage(1) }}
            options={[
              { value: 'all', label: t('common.all') },
              ...Object.values(ASSESS_STATUS).map(code => ({
                value: code, label: assessStatusText(code),
              })),
            ]} />
          <Button onClick={() => navigate(calibrationPath(planId))}>{t('hrPerf.goCalibration')}</Button>
        </Space>
      </div>

      <Table<PerfAssessment>
        className="nowrap-table"
        columns={columns}
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

      <ScoreDrawer open={!!drawer} assessmentId={drawer?.id} mode={drawer?.mode || 'view'}
        onClose={() => setDrawer(null)} onChanged={load} />

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
