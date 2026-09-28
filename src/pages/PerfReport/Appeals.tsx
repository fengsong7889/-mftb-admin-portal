import { useCallback, useEffect, useMemo, useState } from 'react'
import { Alert, Button, Descriptions, Form, Input, InputNumber, Modal, Select, Space, Table, Tabs, Tag, Typography, message } from 'antd'
import type { TableColumnsType } from 'antd'
import { ReloadOutlined, SearchOutlined } from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
import { useNavigate, useSearchParams } from 'react-router-dom'
import dayjs from 'dayjs'
import { useAuth } from '../../contexts/AuthContext'
import { useColumnConfig } from '../../hooks/useColumnConfig'
import {
  APPEAL_STATUS, APPEAL_OPEN, type PerfAppeal, fetchPerfAppeals, handlePerfAppeal, revisePerfAppeal,
} from '../../api/hrPerfReport'
import { type PerfPlan, fetchPerfPlans, fetchPlanGrades } from '../../api/hrPerformance'
import { GRADE_LABEL_KEY } from '../Performance/meta'
import {
  APPEAL_STATUS_LABEL_KEY, APPEAL_STATUS_TABS, APPEAL_STATUS_TAG_COLOR, PERF_AUDIT_PATH, PERF_REPORT_MENU,
} from './meta'

/**
 * 申诉登记（HR 视角）：受理、驳回，或直接修订已下发结果。
 * <p>
 * 修订走后端同一条改判路径，因此必然留下 APPEAL_REVISE 留痕并把申诉置为已办结——
 * 页面不提供"只改分数不结申诉"的口子，否则申诉会变成无痕改分的通道。
 */
export default function PerfAppeals() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { hasPermission } = useAuth()
  const canEdit = hasPermission(`${PERF_REPORT_MENU.APPEAL}:edit`)
  const [searchParams] = useSearchParams()

  const [plans, setPlans] = useState<PerfPlan[]>([])
  const [planId, setPlanId] = useState<number | undefined>(() => {
    const raw = searchParams.get('planId')
    return raw ? Number(raw) : undefined
  })
  const [status, setStatus] = useState('all')
  const [keyword, setKeyword] = useState<string>()
  const [input, setInput] = useState('')
  const [rows, setRows] = useState<PerfAppeal[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [size, setSize] = useState(20)
  const [loading, setLoading] = useState(false)

  const [detail, setDetail] = useState<PerfAppeal | null>(null)
  const [rejectTarget, setRejectTarget] = useState<PerfAppeal | null>(null)
  const [reviseTarget, setReviseTarget] = useState<PerfAppeal | null>(null)
  const [planGrades, setPlanGrades] = useState<Array<{ code: string; minScore: number }>>([])
  const [saving, setSaving] = useState(false)
  const [rejectForm] = Form.useForm<{ conclusion: string }>()
  const [reviseForm] = Form.useForm<{ score?: number; grade?: string; reason: string }>()

  useEffect(() => {
    fetchPerfPlans({ page: 1, size: 100 }).then(r => setPlans(r.records || [])).catch(() => undefined)
  }, [])

  useEffect(() => {
    if (!reviseTarget?.planId) { setPlanGrades([]); return }
    fetchPlanGrades(reviseTarget.planId).then(setPlanGrades).catch(() => setPlanGrades([]))
  }, [reviseTarget])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetchPerfAppeals({
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

  const statusText = (code?: string) => (!code ? '-'
    : (APPEAL_STATUS_LABEL_KEY[code] ? t(APPEAL_STATUS_LABEL_KEY[code]) : code))
  const gradeText = (code?: string | null) => (!code ? '-'
    : (GRADE_LABEL_KEY[code] ? t(GRADE_LABEL_KEY[code]) : code))
  const isOpen = (row: PerfAppeal) => APPEAL_OPEN.includes(row.status)

  const openReject = (row: PerfAppeal) => {
    setRejectTarget(row)
    rejectForm.resetFields()
  }

  const handleReject = async () => {
    const { conclusion } = await rejectForm.validateFields()
    setSaving(true)
    try {
      await handlePerfAppeal(rejectTarget!.id, APPEAL_STATUS.REJECTED, conclusion.trim())
      message.success(t('hrPerfReport.appealHandled'))
      setRejectTarget(null)
      load()
    } catch {
      // 请求层已提示
    } finally {
      setSaving(false)
    }
  }

  const acceptAppeal = async (row: PerfAppeal) => {
    try {
      await handlePerfAppeal(row.id, APPEAL_STATUS.PROCESSING)
      message.success(t('hrPerfReport.appealAccepted'))
      load()
    } catch {
      // 请求层已提示
    }
  }

  const openRevise = (row: PerfAppeal) => {
    setReviseTarget(row)
    reviseForm.setFieldsValue({ score: row.finalScore ?? undefined, grade: row.finalGrade ?? undefined, reason: '' })
  }

  const handleRevise = async () => {
    const values = await reviseForm.validateFields()
    setSaving(true)
    try {
      await revisePerfAppeal(reviseTarget!.id, {
        score: values.score ?? undefined, grade: values.grade, reason: values.reason.trim(),
      })
      message.success(t('hrPerfReport.appealRevised'))
      setReviseTarget(null)
      load()
    } catch {
      // 请求层已提示（模板外等级、缺理由、申诉已办结）
    } finally {
      setSaving(false)
    }
  }

  const columns = useMemo<TableColumnsType<PerfAppeal>>(() => [
    { title: t('hrPerfReport.appealReqNo'), dataIndex: 'reqNo', key: 'reqNo', width: 150, fixed: 'left' },
    {
      title: t('hrPerf.employee'), key: 'emp', width: 170,
      render: (_, r) => `${r.empName || '-'}${r.empNo ? ` (${r.empNo})` : ''}`,
    },
    { title: t('hrPerf.department'), dataIndex: 'deptName', key: 'deptName', width: 150, render: (v: string) => v || '-' },
    { title: t('hrPerf.plan'), dataIndex: 'planName', key: 'planName', width: 190, render: (v: string) => v || '-' },
    { title: t('hrPerfReport.reason'), dataIndex: 'reason', key: 'reason', width: 240, ellipsis: true },
    { title: t('hrPerfReport.expectation'), dataIndex: 'expectation', key: 'expectation', width: 180, render: (v: string) => v || '-' },
    {
      title: t('hrPerf.finalResult'), key: 'final', width: 130,
      render: (_, r) => (r.finalScore == null && !r.finalGrade
        ? '-'
        : <Space size={4}>{r.finalScore ?? '-'}<Tag color="gold">{gradeText(r.finalGrade)}</Tag></Space>),
    },
    {
      title: t('common.colStatus'), dataIndex: 'status', key: 'status', width: 110,
      render: (v: string) => <Tag color={APPEAL_STATUS_TAG_COLOR[v]}>{statusText(v)}</Tag>,
    },
    {
      title: t('hrPerfReport.revised'), dataIndex: 'revised', key: 'revised', width: 100,
      render: (v: boolean | null | undefined) => (v
        ? <Tag color="purple">{t('hrPerfReport.revisedYes')}</Tag>
        : <Typography.Text type="secondary">{t('hrPerfReport.revisedNo')}</Typography.Text>),
    },
    { title: t('hrPerfReport.handler'), dataIndex: 'handlerName', key: 'handlerName', width: 110, render: (v: string) => v || '-' },
    {
      title: t('common.colCreateTime'), dataIndex: 'createdAt', key: 'createdAt', width: 160,
      render: (v: string) => (v ? dayjs(v).format('YYYY-MM-DD HH:mm') : '-'),
    },
    {
      title: t('common.colAction'), key: 'action', width: 250, fixed: 'right',
      render: (_, r) => (
        <Space size={0}>
          <Button type="link" size="small" onClick={() => setDetail(r)}>{t('common.detail')}</Button>
          {canEdit && isOpen(r) && (<>
            <span className="action-split">|</span>
            {r.status === APPEAL_STATUS.PENDING && (
              <Button type="link" size="small" onClick={() => acceptAppeal(r)}>{t('hrPerfReport.accept')}</Button>
            )}
            <Button type="link" size="small" onClick={() => openRevise(r)}>{t('hrPerfReport.revise')}</Button>
            <span className="action-split">|</span>
            <Button type="link" size="small" danger onClick={() => openReject(r)}>{t('hrPerfReport.reject')}</Button>
          </>)}
        </Space>
      ),
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [t, canEdit, statusText, gradeText, load])

  const { configComponent, applyConfig } = useColumnConfig(PERF_REPORT_MENU.APPEAL,
    columns.map(c => ({ key: String(c.key), title: String(c.title) })),
    [{ key: 'action', visible: true, locked: 'tail' }])

  return (
    <div className="content-area">
      <div className="search-section">
        <Space size={12} wrap>
          <span>{t('hrPerf.plan')}</span>
          <Select style={{ width: 230 }} allowClear showSearch optionFilterProp="label"
            placeholder={t('common.pleaseSelect')} value={planId}
            onChange={v => { setPlanId(v); setPage(1) }}
            options={plans.map(p => ({ value: p.id as number, label: `${p.name}（${p.reqNo}）` }))} />
          <span>{t('hrPerf.employee')}</span>
          <Input style={{ width: 190 }} allowClear value={input}
            placeholder={t('hrPerfReport.appealKeywordPlaceholder')}
            onChange={e => setInput(e.target.value)}
            onPressEnter={() => { setKeyword(input.trim() || undefined); setPage(1) }} />
          <Button type="primary" icon={<SearchOutlined />}
            onClick={() => { setKeyword(input.trim() || undefined); setPage(1) }}>{t('common.search')}</Button>
          <Button icon={<ReloadOutlined />} onClick={() => {
            setPlanId(undefined); setInput(''); setKeyword(undefined); setStatus('all'); setPage(1)
          }}>{t('common.reset')}</Button>
        </Space>
      </div>

      <Tabs activeKey={status}
        items={APPEAL_STATUS_TABS.map(key => ({
          key, label: key === 'all' ? t('common.all') : statusText(key),
        }))}
        onChange={key => { setStatus(key); setPage(1) }}
        style={{ marginBottom: 0 }} />

      <div className="action-section">
        <div className="action-section-left">
          <Typography.Text type="secondary">{t('hrPerfReport.appealScopeTip')}</Typography.Text>
        </div>
        <div className="action-section-right">{configComponent}</div>
      </div>

      <Table<PerfAppeal>
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

      <Modal title={t('hrPerfReport.appealDetail')} open={!!detail} footer={<Button onClick={() => setDetail(null)}>{t('common.close')}</Button>}
        onCancel={() => setDetail(null)} destroyOnClose>
        {detail && (
          <Descriptions column={1} size="small" items={[
            { key: 'reqNo', label: t('hrPerfReport.appealReqNo'), children: detail.reqNo || '-' },
            { key: 'emp', label: t('hrPerf.employee'), children: `${detail.empName || '-'}${detail.empNo ? ` (${detail.empNo})` : ''}` },
            { key: 'dept', label: t('hrPerf.department'), children: detail.deptName || '-' },
            { key: 'plan', label: t('hrPerf.plan'), children: detail.planName || '-' },
            { key: 'reason', label: t('hrPerfReport.reason'), children: detail.reason },
            { key: 'expectation', label: t('hrPerfReport.expectation'), children: detail.expectation || '-' },
            {
              key: 'final',
              label: t('hrPerf.finalResult'),
              children: `${detail.finalScore ?? '-'} / ${gradeText(detail.finalGrade)}`,
            },
            { key: 'status', label: t('common.colStatus'), children: statusText(detail.status) },
            { key: 'handler', label: t('hrPerfReport.handler'), children: detail.handlerName || '-' },
            { key: 'conclusion', label: t('hrPerfReport.conclusion'), children: detail.conclusion || '-' },
          ]} />
        )}
        {detail?.assessmentId && (
          <Button type="link" size="small" style={{ paddingLeft: 0 }}
            onClick={() => navigate(`${PERF_AUDIT_PATH}?assessmentId=${detail.assessmentId}`)}>
            {t('hrPerfReport.viewLogs')}
          </Button>
        )}
      </Modal>

      <Modal title={t('hrPerfReport.rejectTitle')} open={!!rejectTarget} confirmLoading={saving}
        onOk={handleReject} onCancel={() => setRejectTarget(null)} destroyOnClose>
        <Form form={rejectForm} layout="vertical">
          <Form.Item label={t('hrPerfReport.conclusion')} name="conclusion"
            rules={[{ required: true, message: t('hrPerfReport.conclusionRequired') }]}>
            <Input.TextArea rows={3} maxLength={500} showCount placeholder={t('hrPerfReport.rejectPlaceholder')} />
          </Form.Item>
        </Form>
      </Modal>

      <Modal title={t('hrPerfReport.reviseTitle')} open={!!reviseTarget} confirmLoading={saving}
        onOk={handleRevise} onCancel={() => setReviseTarget(null)} destroyOnClose>
        <Alert type="warning" showIcon style={{ marginBottom: 12 }}
          message={t('hrPerfReport.reviseTip')}
          description={reviseTarget
            ? `${reviseTarget.empName || '-'} · ${t('hrPerf.finalResult')}: ${reviseTarget.finalScore ?? '-'} / ${gradeText(reviseTarget.finalGrade)}`
            : undefined} />
        <Form form={reviseForm} layout="vertical">
          <Space size={16} wrap>
            <Form.Item label={t('hrPerf.calibratedScore')} name="score">
              <InputNumber min={0} max={100} precision={2} style={{ width: 160 }} />
            </Form.Item>
            <Form.Item label={t('hrPerf.calibratedGrade')} name="grade">
              <Select style={{ width: 190 }} allowClear placeholder={t('hrPerf.calibratedGradePlaceholder')}
                options={(planGrades.length ? planGrades : Object.keys(GRADE_LABEL_KEY).map(code => ({ code, minScore: 0 })))
                  .map(g => ({ value: g.code, label: g.minScore ? `${gradeText(g.code)} ≥ ${g.minScore}` : gradeText(g.code) }))} />
            </Form.Item>
          </Space>
          <Form.Item label={t('hrPerf.calibratedReason')} name="reason"
            rules={[{ required: true, message: t('hrPerfReport.reviseReasonRequired') }]}>
            <Input.TextArea rows={3} maxLength={500} showCount placeholder={t('hrPerf.reasonPlaceholder')} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}
