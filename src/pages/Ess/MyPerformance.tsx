import { useCallback, useEffect, useMemo, useState } from 'react'
import { Alert, Button, Input, Modal, Space, Table, Tabs, Tag, Typography, message } from 'antd'
import type { TableColumnsType } from 'antd'
import { useTranslation } from 'react-i18next'
import dayjs from 'dayjs'
import { useColumnConfig } from '../../hooks/useColumnConfig'
import {
  ASSESS_STATUS, type PerfAssessment, fetchMyAssessments,
} from '../../api/hrPerformance'
import { type PerfAppeal, fetchMyAppeals, submitMyAppeal } from '../../api/hrPerfReport'
import { APPEAL_STATUS_LABEL_KEY, APPEAL_STATUS_TAG_COLOR } from '../PerfReport/meta'
import ScoreDrawer from '../Performance/ScoreDrawer'
import {
  ASSESS_STATUS_LABEL_KEY, ASSESS_STATUS_TAG_COLOR, GRADE_LABEL_KEY, PERF_MENU, SELF_STATUS_TABS,
} from '../Performance/meta'

/**
 * 員工自助「我的績效」。
 * <p>
 * 数据一律以登录人为范围（走 /hr/perf/my 端点），且结果在整批审批确认前
 * 上级评分与最终等级由服务端剔除，页面拿不到也就无从泄露。
 */
export default function MyPerformance() {
  const { t } = useTranslation()
  const [rows, setRows] = useState<PerfAssessment[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [page, setPage] = useState(1)
  const [size, setSize] = useState(20)
  const [status, setStatus] = useState('all')
  const [drawer, setDrawer] = useState<{ id: number; mode: 'self' | 'self-view' } | null>(null)
  const [appealTarget, setAppealTarget] = useState<PerfAssessment | null>(null)
  const [appealReason, setAppealReason] = useState('')
  const [appealExpect, setAppealExpect] = useState('')
  const [appealListOpen, setAppealListOpen] = useState(false)
  const [myAppeals, setMyAppeals] = useState<PerfAppeal[]>([])
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetchMyAssessments({ page, size, status: status === 'all' ? undefined : status })
      setRows(res.records || [])
      setTotal(res.total || 0)
    } catch {
      // 请求层已统一提示
    } finally {
      setLoading(false)
    }
  }, [page, size, status])

  useEffect(() => { load() }, [load])

  const statusText = useCallback((code?: string) => (code && ASSESS_STATUS_LABEL_KEY[code]
    ? t(ASSESS_STATUS_LABEL_KEY[code]) : (code || '-')), [t])
  const gradeText = useCallback((code?: string | null) => (code ? (GRADE_LABEL_KEY[code] ? t(GRADE_LABEL_KEY[code]) : code) : '-'), [t])

  const pendingSelf = rows.filter(r => r.status === ASSESS_STATUS.SELF_PENDING).length

  const appealText = (code?: string) => (code && APPEAL_STATUS_LABEL_KEY[code]
    ? t(APPEAL_STATUS_LABEL_KEY[code]) : (code || '-'))

  const openAppealList = () => {
    setAppealListOpen(true)
    fetchMyAppeals({ page: 1, size: 50 }).then(r => setMyAppeals(r.records || [])).catch(() => setMyAppeals([]))
  }

  const handleSubmitAppeal = async () => {
    if (!appealTarget) return
    if (!appealReason.trim()) {
      message.warning(t('hrPerfReport.appealReasonRequired'))
      return
    }
    setSaving(true)
    try {
      await submitMyAppeal(appealTarget.id, appealReason.trim(), appealExpect.trim() || undefined)
      message.success(t('hrPerfReport.appealSubmitted'))
      setAppealTarget(null)
      setAppealReason('')
      setAppealExpect('')
      load()
    } catch {
      // 请求层已提示（已有在途申诉、结果未确认等）
    } finally {
      setSaving(false)
    }
  }

  const columns = useMemo<TableColumnsType<PerfAssessment>>(() => [
    { title: t('hrPerf.plan'), dataIndex: 'planName', key: 'planName', width: 220, fixed: 'left', render: (v: string) => v || '-' },
    { title: t('hrPerf.assessmentReqNo'), dataIndex: 'reqNo', key: 'reqNo', width: 150 },
    {
      title: t('hrPerf.evaluator'), dataIndex: 'evaluatorName', key: 'evaluatorName', width: 140,
      render: (v: string) => v || <Tag color="default">{t('hrPerf.notAssigned')}</Tag>,
    },
    {
      title: t('hrPerf.selfScore'), dataIndex: 'selfScore', key: 'selfScore', width: 100,
      render: (v: number | null, r) => (v == null
        ? <Typography.Text type="secondary">-</Typography.Text>
        : <span>{v}{r.selfAt ? <Typography.Text type="secondary"> · {dayjs(r.selfAt).format('YYYY-MM-DD')}</Typography.Text> : null}</span>),
    },
    {
      title: t('hrPerf.supervisorScore'), dataIndex: 'supervisorScore', key: 'supervisorScore', width: 120,
      render: (v: number | null, r) => (v != null
        ? v
        : <Typography.Text type="secondary">{r.status === ASSESS_STATUS.CONFIRMED ? '-' : t('hrPerf.hiddenUntilConfirmed')}</Typography.Text>),
    },
    {
      title: t('hrPerf.finalResult'), key: 'final', width: 140,
      render: (_, r) => (r.status === ASSESS_STATUS.CONFIRMED
        ? <Space size={4}><span style={{ fontWeight: 600 }}>{r.finalScore ?? '-'}</span><Tag color="gold">{gradeText(r.finalGrade)}</Tag></Space>
        : <Typography.Text type="secondary">{t('hrPerf.hiddenUntilConfirmed')}</Typography.Text>),
    },
    {
      title: t('common.colStatus'), dataIndex: 'status', key: 'status', width: 110,
      render: (v: string) => <Tag color={ASSESS_STATUS_TAG_COLOR[v]}>{statusText(v)}</Tag>,
    },
    {
      title: t('common.colAction'), key: 'action', width: 160, fixed: 'right',
      render: (_, r) => (
        <Space size={0}>
          <Button type="link" size="small"
            disabled={r.status !== ASSESS_STATUS.SELF_PENDING}
            onClick={() => setDrawer({ id: r.id, mode: 'self' })}>
            {t('hrPerf.doSelfReview')}
          </Button>
          <span className="action-split">|</span>
          <Button type="link" size="small" onClick={() => setDrawer({ id: r.id, mode: 'self-view' })}>
            {t('common.detail')}
          </Button>
          {r.status === ASSESS_STATUS.CONFIRMED && (<>
            <span className="action-split">|</span>
            <Button type="link" size="small" onClick={() => setAppealTarget(r)}>
              {t('hrPerfReport.appeal')}
            </Button>
          </>)}
        </Space>
      ),
    },
  ], [t, gradeText, statusText])

  const { configComponent, applyConfig } = useColumnConfig(PERF_MENU.SELF,
    columns.map(c => ({ key: String(c.key), title: String(c.title) })),
    [{ key: 'action', visible: true, locked: 'tail' }])

  return (
    <div className="content-area">
      <Alert type="info" showIcon style={{ marginBottom: 10 }}
        message={t('hrPerf.selfScopeTip')}
        description={t('hrPerf.selfVisibilityTip')} />

      <div className="search-section">
        <Space size={12} wrap>
          <Typography.Text type="secondary">{t('hrPerf.selfListTip')}</Typography.Text>
        </Space>
      </div>

      <Tabs
        activeKey={status}
        items={SELF_STATUS_TABS.map(key => ({
          key, label: key === 'all' ? t('common.all') : statusText(key),
        }))}
        onChange={key => { setStatus(key); setPage(1) }}
        style={{ marginBottom: 0 }}
      />

      <div className="action-section">
        <div className="action-section-left">
          {pendingSelf > 0 && (
            <Button type="primary" onClick={() => setStatus(ASSESS_STATUS.SELF_PENDING)}>
              {t('hrPerf.pendingSelfCount', { count: pendingSelf })}
            </Button>
          )}
          <Button onClick={openAppealList}>{t('hrPerfReport.myAppeals')}</Button>
        </div>
        <div className="action-section-right">{configComponent}</div>
      </div>

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

      <ScoreDrawer open={!!drawer} assessmentId={drawer?.id} mode={drawer?.mode || 'self-view'}
        onClose={() => setDrawer(null)} onChanged={load} />

      <Modal title={t('hrPerfReport.appealTitle')}
        open={!!appealTarget}
        confirmLoading={saving}
        okText={t('hrPerfReport.appealSubmit')}
        onOk={handleSubmitAppeal}
        onCancel={() => setAppealTarget(null)}
        destroyOnClose>
        <Alert type="info" showIcon style={{ marginBottom: 12 }} message={t('hrPerfReport.appealScopeTip')}
          description={appealTarget
            ? `${appealTarget.planName || '-'} · ${t('hrPerf.finalResult')}: ${appealTarget.finalScore ?? '-'} / ${gradeText(appealTarget.finalGrade)}`
            : undefined} />
        <Typography.Text strong>{t('hrPerfReport.reason')}<span style={{ color: '#CF1322' }}> *</span></Typography.Text>
        <Input.TextArea rows={3} maxLength={500} showCount style={{ margin: '4px 0 12px' }}
          value={appealReason} placeholder={t('hrPerfReport.appealReasonPlaceholder')}
          onChange={e => setAppealReason(e.target.value)} />
        <Typography.Text strong>{t('hrPerfReport.expectation')}</Typography.Text>
        <Input.TextArea rows={2} maxLength={500} showCount style={{ marginTop: 4 }}
          value={appealExpect} placeholder={t('hrPerfReport.appealExpectPlaceholder')}
          onChange={e => setAppealExpect(e.target.value)} />
      </Modal>

      <Modal title={t('hrPerfReport.myAppeals')} open={appealListOpen}
        footer={<Button onClick={() => setAppealListOpen(false)}>{t('common.close')}</Button>}
        onCancel={() => setAppealListOpen(false)} width={760} destroyOnClose>
        <Table<PerfAppeal>
          size="small"
          rowKey="id"
          dataSource={myAppeals}
          pagination={false}
          scroll={{ y: 360 }}
          columns={[
            { title: t('hrPerfReport.appealReqNo'), dataIndex: 'reqNo', key: 'reqNo', width: 150 },
            { title: t('hrPerf.plan'), dataIndex: 'planName', key: 'planName', width: 180, render: (v: string) => v || '-' },
            { title: t('hrPerfReport.reason'), dataIndex: 'reason', key: 'reason', ellipsis: true },
            {
              title: t('common.colStatus'), dataIndex: 'status', key: 'status', width: 100,
              render: (v: string) => <Tag color={APPEAL_STATUS_TAG_COLOR[v]}>{appealText(v)}</Tag>,
            },
            {
              title: t('hrPerfReport.logTime'), dataIndex: 'createdAt', key: 'createdAt', width: 150,
              render: (v: string) => (v ? dayjs(v).format('YYYY-MM-DD HH:mm') : '-'),
            },
            { title: t('hrPerfReport.conclusion'), dataIndex: 'conclusion', key: 'conclusion', width: 220, render: (v: string) => v || '-' },
          ]}
        />
      </Modal>
    </div>
  )
}
