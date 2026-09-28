import { useCallback, useEffect, useMemo, useState } from 'react'
import { Button, Input, Select, Space, Table, Tag, Typography } from 'antd'
import type { TableColumnsType } from 'antd'
import { ReloadOutlined, SearchOutlined } from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
import { useNavigate, useSearchParams } from 'react-router-dom'
import dayjs from 'dayjs'
import { useColumnConfig } from '../../hooks/useColumnConfig'
import {
  type PerfCalibrationLog, fetchCalibrationLogs,
} from '../../api/hrPerfReport'
import { type PerfPlan, fetchPerfPlans } from '../../api/hrPerformance'
import { GRADE_LABEL_KEY } from '../Performance/meta'
import ScoreDrawer from '../Performance/ScoreDrawer'
import { LOG_ACTION_LABEL_KEY, LOG_ACTION_ORDER, LOG_ACTION_TAG_COLOR, PERF_APPEAL_PATH, PERF_REPORT_MENU } from './meta'

/**
 * 改判留痕追溯：谁在何时把谁的几分几等改成几分几等、理由是什么。
 * <p>
 * 例外放行（DIST_WAIVER）是计划级动作，没有具体考核单，因此"员工"列显示计划编号，
 * 且不能点开详情——这里不伪装成能打开的按钮。
 */
export default function PerfAuditTrail() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()

  const [plans, setPlans] = useState<PerfPlan[]>([])
  const [planId, setPlanId] = useState<number | undefined>(() => {
    const raw = searchParams.get('planId')
    return raw ? Number(raw) : undefined
  })
  const [assessmentId, setAssessmentId] = useState<number | undefined>(() => {
    const raw = searchParams.get('assessmentId')
    return raw ? Number(raw) : undefined
  })
  const [action, setAction] = useState<string>()
  const [keyword, setKeyword] = useState<string>()
  const [input, setInput] = useState('')
  const [rows, setRows] = useState<PerfCalibrationLog[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [size, setSize] = useState(20)
  const [loading, setLoading] = useState(false)
  const [detailId, setDetailId] = useState<number | null>(null)

  useEffect(() => {
    fetchPerfPlans({ page: 1, size: 100 }).then(r => setPlans(r.records || [])).catch(() => undefined)
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetchCalibrationLogs({
        page, size, planId, assessmentId, action, keyword: keyword || undefined,
      })
      setRows(res.records || [])
      setTotal(res.total || 0)
    } catch {
      // 请求层已统一提示
    } finally {
      setLoading(false)
    }
  }, [page, size, planId, assessmentId, action, keyword])

  useEffect(() => { load() }, [load])

  const gradeText = useCallback((code?: string | null) => (!code ? '-'
    : (GRADE_LABEL_KEY[code] ? t(GRADE_LABEL_KEY[code]) : code)), [t])
  const actionText = useCallback((code: string) => (LOG_ACTION_LABEL_KEY[code] ? t(LOG_ACTION_LABEL_KEY[code]) : code), [t])

  const columns = useMemo<TableColumnsType<PerfCalibrationLog>>(() => [
    {
      title: t('hrPerfReport.logTime'), dataIndex: 'createdAt', key: 'createdAt', width: 160,
      render: (v: string) => (v ? dayjs(v).format('YYYY-MM-DD HH:mm') : '-'),
    },
    {
      title: t('hrPerfReport.logAction'), dataIndex: 'action', key: 'action', width: 120,
      render: (v: string) => <Tag color={LOG_ACTION_TAG_COLOR[v]}>{actionText(v)}</Tag>,
    },
    {
      title: t('hrPerf.employee'), key: 'emp', width: 170,
      // 例外放行没有具体被考核人，退而显示计划编号，避免出现一列空白
      render: (_, r) => (r.empName
        ? `${r.empName}${r.empNo ? ` (${r.empNo})` : ''}`
        : `${t('hrPerf.plan')}: ${r.planName || r.planId || '-'}`),
    },
    { title: t('hrPerf.department'), dataIndex: 'deptName', key: 'deptName', width: 150, render: (v: string) => v || '-' },
    { title: t('hrPerf.plan'), dataIndex: 'planName', key: 'planName', width: 190, render: (v: string) => v || '-' },
    {
      title: t('hrPerfReport.before'), key: 'before', width: 130,
      render: (_, r) => (r.beforeScore == null && !r.beforeGrade
        ? '-'
        : <Space size={4}>{r.beforeScore ?? '-'}<Tag>{gradeText(r.beforeGrade)}</Tag></Space>),
    },
    {
      title: t('hrPerfReport.after'), key: 'after', width: 130,
      render: (_, r) => (r.afterScore == null && !r.afterGrade
        ? '-'
        : <Space size={4}>{r.afterScore ?? '-'}<Tag color="gold">{gradeText(r.afterGrade)}</Tag></Space>),
    },
    { title: t('hrPerfReport.reason'), dataIndex: 'reason', key: 'reason', width: 260, render: (v: string) => v || '-' },
    { title: t('hrPerfReport.operator'), dataIndex: 'operatorName', key: 'operatorName', width: 120, render: (v: string) => v || '-' },
    {
      title: t('common.colAction'), key: 'action-col', width: 150, fixed: 'right',
      render: (_, r) => (
        <Space size={0}>
          {r.assessmentId && (<>
            <Button type="link" size="small" onClick={() => setDetailId(r.assessmentId as number)}>
              {t('hrPerfReport.viewAssessment')}
            </Button>
            <span className="action-split">|</span>
          </>)}
          {r.refAppealId && (
            <Button type="link" size="small" onClick={() => navigate(`${PERF_APPEAL_PATH}?id=${r.refAppealId}`)}>
              {t('hrPerfReport.viewAppeal')}
            </Button>
          )}
        </Space>
      ),
    },
  ], [t, navigate, gradeText, actionText])

  const { configComponent, applyConfig } = useColumnConfig(PERF_REPORT_MENU.AUDIT,
    columns.map(c => ({ key: String(c.key), title: String(c.title) })),
    [{ key: 'action-col', visible: true, locked: 'tail' }])

  return (
    <div className="content-area">
      <div className="search-section">
        <Space size={12} wrap>
          <span>{t('hrPerf.plan')}</span>
          <Select style={{ width: 230 }} allowClear showSearch optionFilterProp="label"
            placeholder={t('common.pleaseSelect')} value={planId}
            onChange={v => { setPlanId(v); setAssessmentId(undefined); setPage(1) }}
            options={plans.map(p => ({ value: p.id as number, label: `${p.name}（${p.reqNo}）` }))} />
          <span>{t('hrPerfReport.logAction')}</span>
          <Select style={{ width: 150 }} allowClear value={action} placeholder={t('common.pleaseSelect')}
            onChange={v => { setAction(v); setPage(1) }}
            options={LOG_ACTION_ORDER.map(code => ({ value: code, label: actionText(code) }))} />
          <span>{t('hrPerf.employee')}</span>
          <Input style={{ width: 190 }} allowClear value={input}
            placeholder={t('hrPerfReport.auditKeywordPlaceholder')}
            onChange={e => setInput(e.target.value)}
            onPressEnter={() => { setKeyword(input.trim() || undefined); setPage(1) }} />
          <Button type="primary" icon={<SearchOutlined />}
            onClick={() => { setKeyword(input.trim() || undefined); setPage(1) }}>
            {t('common.search')}
          </Button>
          <Button icon={<ReloadOutlined />} onClick={() => {
            setPlanId(undefined); setAssessmentId(undefined); setAction(undefined)
            setInput(''); setKeyword(undefined); setPage(1)
          }}>{t('common.reset')}</Button>
          {assessmentId && (
            <Tag closable onClose={() => { setAssessmentId(undefined); setPage(1) }}>
              {t('hrPerf.assessmentReqNo')}: {assessmentId}
            </Tag>
          )}
        </Space>
      </div>

      <div className="action-section">
        <div className="action-section-left">
          <Typography.Text type="secondary">{t('hrPerfReport.auditScopeTip')}</Typography.Text>
        </div>
        <div className="action-section-right">{configComponent}</div>
      </div>

      <Table<PerfCalibrationLog>
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

      <ScoreDrawer open={!!detailId} assessmentId={detailId ?? undefined} mode="view"
        onClose={() => setDetailId(null)} />
    </div>
  )
}
