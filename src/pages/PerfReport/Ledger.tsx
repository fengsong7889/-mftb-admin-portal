import { useCallback, useEffect, useMemo, useState } from 'react'
import { Alert, Button, Card, Col, Form, Input, Row, Select, Space, Statistic, Table, Tag, Typography } from 'antd'
import type { TableColumnsType } from 'antd'
import { DownloadOutlined, ReloadOutlined, SearchOutlined } from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Column, Pie } from '@ant-design/charts'
import dayjs from 'dayjs'
import { useAuth } from '../../contexts/AuthContext'
import { useColumnConfig } from '../../hooks/useColumnConfig'
import { exportToCSV } from '../../utils/exportCSV'
import {
  type PerfAssessment, type PerfCycle, type PerfPlan,
  fetchPerfCycles, fetchPerfPlans,
} from '../../api/hrPerformance'
import {
  type PerfReport, type PerfReportFilter,
  fetchPerfReport, fetchPerfReportDepartments, fetchPerfReportRows,
} from '../../api/hrPerfReport'
import { GRADE_LABEL_KEY, GRADE_ORDER, GRADE_TAG_COLOR } from '../Performance/meta'
import { PERF_AUDIT_PATH, PERF_REPORT_MENU } from './meta'
import ScoreDrawer from '../Performance/ScoreDrawer'

/** 后端单页上限 200：导出逐页取，并设总量闸避免一次拉爆浏览器 */
const EXPORT_PAGE_SIZE = 200
const EXPORT_MAX_ROWS = 5000

/**
 * 結果台账：等级分布 / 部门对比 / 趋势 + 明细钻取与 Excel(CSV) 导出。
 * <p>
 * 只统计已确认结果；建议占比只在单计划口径下比对（跨计划算平均占比没有意义）；
 * 超编项在页面顶部直接列出，让 HR 先看见问题再决定是否走例外放行。
 */
export default function PerfLedger() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { hasPermission } = useAuth()
  const canExport = hasPermission(`${PERF_REPORT_MENU.LEDGER}:export`)
  const [searchParams] = useSearchParams()

  const [cycles, setCycles] = useState<PerfCycle[]>([])
  const [plans, setPlans] = useState<PerfPlan[]>([])
  const [departments, setDepartments] = useState<string[]>([])
  const [filter, setFilter] = useState<PerfReportFilter>(() => {
    const planId = searchParams.get('planId')
    const cycleId = searchParams.get('cycleId')
    return { planId: planId ? Number(planId) : undefined, cycleId: cycleId ? Number(cycleId) : undefined }
  })
  const [deptName, setDeptName] = useState<string>()
  const [grade, setGrade] = useState<string>()
  const [keyword, setKeyword] = useState<string>()
  const [form] = Form.useForm<{ keyword: string }>()

  const [report, setReport] = useState<PerfReport | null>(null)
  const [rows, setRows] = useState<PerfAssessment[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [size, setSize] = useState(20)
  const [loading, setLoading] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [detailId, setDetailId] = useState<number | null>(null)

  const gradeText = useCallback((code?: string | null) => {
    if (!code) return '-'
    return GRADE_LABEL_KEY[code] ? t(GRADE_LABEL_KEY[code]) : code
  }, [t])

  useEffect(() => {
    fetchPerfCycles({ page: 1, size: 100 }).then(r => setCycles(r.records || [])).catch(() => undefined)
    fetchPerfPlans({ page: 1, size: 100 }).then(r => setPlans(r.records || [])).catch(() => undefined)
  }, [])

  useEffect(() => {
    fetchPerfReportDepartments(filter).then(setDepartments).catch(() => setDepartments([]))
  }, [filter])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [summary, list] = await Promise.all([
        fetchPerfReport(filter),
        fetchPerfReportRows({ ...filter, page, size, deptName, grade, keyword: keyword || undefined }),
      ])
      setReport(summary)
      setRows(list.records || [])
      setTotal(list.total || 0)
    } catch {
      // 请求层已统一提示
    } finally {
      setLoading(false)
    }
  }, [filter, page, size, deptName, grade, keyword])

  useEffect(() => { load() }, [load])

  const gapItems = useMemo(() => (report?.gradeDistribution || []).filter(g => g.gapNote), [report])

  /** 图表统一用长格式（xField + 类型 + 数值），饼图单独用 angle/color 两列 */
  const pieData = useMemo(() => (report?.gradeDistribution || []).map(g => ({
    type: gradeText(g.grade),
    value: g.count,
  })), [report, gradeText])
  const deptData = useMemo(() => (report?.deptDistribution || []).flatMap(d => [
    { department: d.deptName, series: t('hrPerfReport.metricHeadcount'), value: d.count },
    { department: d.deptName, series: t('hrPerfReport.metricAvgScore'), value: d.avgScore == null ? 0 : Number(d.avgScore) },
  ]), [report, t])
  const trendData = useMemo(() => (report?.trend || []).flatMap(p => [
    { plan: p.planName || p.planReqNo || String(p.planId), series: t('hrPerfReport.metricAvgScore'), value: p.avgScore == null ? 0 : Number(p.avgScore) },
    { plan: p.planName || p.planReqNo || String(p.planId), series: t('hrPerfReport.metricHeadcount'), value: p.count },
  ]), [report, t])

  const columns = useMemo<TableColumnsType<PerfAssessment>>(() => [
    { title: t('hrPerf.assessmentReqNo'), dataIndex: 'reqNo', key: 'reqNo', width: 150, fixed: 'left' },
    {
      title: t('hrPerf.employee'), key: 'emp', width: 170,
      render: (_, r) => `${r.empName || '-'}${r.empNo ? ` (${r.empNo})` : ''}`,
    },
    { title: t('hrPerf.department'), dataIndex: 'deptName', key: 'deptName', width: 150, render: (v: string) => v || '-' },
    { title: t('hrPerf.positionLevel'), dataIndex: 'positionLevel', key: 'positionLevel', width: 90, render: (v: string) => v || '-' },
    { title: t('hrPerf.plan'), dataIndex: 'planName', key: 'planName', width: 200, render: (v: string) => v || '-' },
    { title: t('hrPerf.evaluator'), dataIndex: 'evaluatorName', key: 'evaluatorName', width: 120, render: (v: string) => v || '-' },
    { title: t('hrPerf.selfScore'), dataIndex: 'selfScore', key: 'selfScore', width: 90, render: (v: number | null) => v ?? '-' },
    { title: t('hrPerf.supervisorScore'), dataIndex: 'supervisorScore', key: 'supervisorScore', width: 100, render: (v: number | null) => v ?? '-' },
    {
      title: t('hrPerf.calibrated'), key: 'calibrated', width: 130,
      render: (_, r) => (r.calibratedScore == null && !r.calibratedGrade ? '-'
        : <Space size={4}>{r.calibratedScore ?? '-'}<Tag color="purple">{gradeText(r.calibratedGrade)}</Tag></Space>),
    },
    {
      title: t('hrPerf.finalResult'), key: 'final', width: 130,
      render: (_, r) => (
        <Space size={4}>
          <span style={{ fontWeight: 600 }}>{r.finalScore ?? '-'}</span>
          <Tag color={GRADE_TAG_COLOR[r.finalGrade || ''] || 'default'}>{gradeText(r.finalGrade)}</Tag>
        </Space>
      ),
    },
    {
      title: t('hrPerf.confirmedAt'), dataIndex: 'confirmedAt', key: 'confirmedAt', width: 160,
      render: (v: string) => (v ? dayjs(v).format('YYYY-MM-DD HH:mm') : '-'),
    },
    {
      title: t('common.colAction'), key: 'action', width: 180, fixed: 'right',
      render: (_, r) => (
        <Space size={0}>
          <Button type="link" size="small" onClick={() => setDetailId(r.id)}>{t('common.detail')}</Button>
          <span className="action-split">|</span>
          <Button type="link" size="small" onClick={() => navigate(`${PERF_AUDIT_PATH}?assessmentId=${r.id}`)}>
            {t('hrPerfReport.viewLogs')}
          </Button>
        </Space>
      ),
    },
  ], [t, navigate, gradeText])

  const { configComponent, applyConfig } = useColumnConfig(PERF_REPORT_MENU.LEDGER,
    columns.map(c => ({ key: String(c.key), title: String(c.title) })),
    [{ key: 'action', visible: true, locked: 'tail' }])

  /** 导出走当前筛选口径的全量（不是当前页），否则导出的表会少于页面看到的人数 */
  const handleExport = async () => {
    setExporting(true)
    try {
      const collected: PerfAssessment[] = []
      let cursor = 1
      let totalCount = 0
      do {
        const res = await fetchPerfReportRows({
          ...filter, page: cursor, size: EXPORT_PAGE_SIZE, deptName, grade, keyword: keyword || undefined,
        })
        totalCount = res.total || 0
        collected.push(...(res.records || []))
        cursor += 1
      } while (collected.length < totalCount && collected.length < EXPORT_MAX_ROWS)
      if (!collected.length) {
        return
      }
      exportToCSV(`${t('hrPerfReport.pageTitle')}_${dayjs().format('YYYYMMDD')}`, [
        { title: t('hrPerf.assessmentReqNo'), dataIndex: 'reqNo' },
        { title: t('hrPerf.employee'), dataIndex: 'empName' },
        { title: t('hrPerf.empNo'), dataIndex: 'empNo' },
        { title: t('hrPerf.department'), dataIndex: 'deptName' },
        { title: t('hrPerf.positionLevel'), dataIndex: 'positionLevel' },
        { title: t('hrPerf.plan'), dataIndex: 'planName' },
        { title: t('hrPerf.evaluator'), dataIndex: 'evaluatorName' },
        { title: t('hrPerf.selfScore'), dataIndex: 'selfScore' },
        { title: t('hrPerf.supervisorScore'), dataIndex: 'supervisorScore' },
        { title: t('hrPerf.calibratedScore'), dataIndex: 'calibratedScore' },
        { title: t('hrPerf.calibratedGrade'), dataIndex: 'calibratedGrade' },
        { title: t('hrPerf.finalScore'), dataIndex: 'finalScore' },
        { title: t('hrPerf.finalGrade'), dataIndex: 'finalGrade' },
        {
          title: t('hrPerf.confirmedAt'),
          dataIndex: 'confirmedAt',
          render: (v: string) => (v ? dayjs(v).format('YYYY-MM-DD HH:mm') : ''),
        },
      ], collected)
    } catch {
      // 请求层已统一提示
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="content-area">
      <div className="search-section">
        <Form form={form} layout="inline">
          <Form.Item label={t('hrPerf.cycle')}>
            <Select style={{ width: 200 }} allowClear showSearch optionFilterProp="label"
              placeholder={t('common.pleaseSelect')} value={filter.cycleId}
              onChange={v => { setFilter({ cycleId: v || undefined, planId: undefined }); setPage(1) }}
              options={cycles.map(c => ({ value: c.id as number, label: `${c.name}（${c.code}）` }))} />
          </Form.Item>
          <Form.Item label={t('hrPerf.plan')}>
            <Select style={{ width: 230 }} allowClear showSearch optionFilterProp="label"
              placeholder={t('common.pleaseSelect')} value={filter.planId}
              onChange={v => { setFilter({ planId: v || undefined, cycleId: undefined }); setPage(1) }}
              options={plans.map(p => ({ value: p.id as number, label: `${p.name}（${p.reqNo}）` }))} />
          </Form.Item>
          <Form.Item label={t('hrPerf.department')}>
            <Select style={{ width: 170 }} allowClear showSearch optionFilterProp="label"
              placeholder={t('common.pleaseSelect')} value={deptName}
              onChange={v => { setDeptName(v); setPage(1) }}
              options={departments.map(d => ({ value: d, label: d }))} />
          </Form.Item>
          <Form.Item label={t('hrPerf.finalGrade')}>
            <Select style={{ width: 110 }} allowClear value={grade}
              onChange={v => { setGrade(v); setPage(1) }}
              options={GRADE_ORDER.map(code => ({ value: code, label: GRADE_LABEL_KEY[code] ? t(GRADE_LABEL_KEY[code]) : code }))} />
          </Form.Item>
          <Form.Item label={t('common.search')} name="keyword">
            <Input style={{ width: 180 }} allowClear placeholder={t('hrPerfReport.keywordPlaceholder')}
              onPressEnter={() => { setKeyword(form.getFieldValue('keyword')?.trim() || undefined); setPage(1) }} />
          </Form.Item>
          <Form.Item>
            <div className="search-actions">
              <Button type="primary" icon={<SearchOutlined />}
                onClick={() => { setKeyword(form.getFieldValue('keyword')?.trim() || undefined); setPage(1) }}>
                {t('common.search')}
              </Button>
              <Button icon={<ReloadOutlined />} onClick={() => {
                form.resetFields()
                setKeyword(undefined); setDeptName(undefined); setGrade(undefined)
                setFilter({}); setPage(1)
              }}>{t('common.reset')}</Button>
            </div>
          </Form.Item>
        </Form>
      </div>

      <Row gutter={[10, 10]} style={{ marginBottom: 12 }}>
        <Col flex="1 1 160px">
          <Card size="small"><Statistic title={t('hrPerfReport.headcount')} value={report?.headcount ?? 0} /></Card>
        </Col>
        <Col flex="1 1 160px">
          <Card size="small"><Statistic title={t('hrPerfReport.planCount')} value={report?.planCount ?? 0} /></Card>
        </Col>
        <Col flex="1 1 160px">
          <Card size="small">
            <Statistic title={t('hrPerfReport.avgScore')} value={report?.avgScore ?? 0} precision={2}
              suffix={report?.avgScore == null ? t('hrPerfReport.noDataShort') : undefined} />
          </Card>
        </Col>
        <Col flex="1 1 140px">
          <Card size="small"><Statistic title={t('hrPerfReport.maxScore')} value={report?.maxScore ?? '-'} /></Card>
        </Col>
        <Col flex="1 1 140px">
          <Card size="small"><Statistic title={t('hrPerfReport.minScore')} value={report?.minScore ?? '-'} /></Card>
        </Col>
      </Row>

      {gapItems.length > 0 && (
        <Alert type="warning" showIcon style={{ marginBottom: 10 }}
          message={t('hrPerfReport.distributionGapTitle')}
          description={gapItems.map(g => `${gradeText(g.grade)}：${g.gapNote}`).join('；')} />
      )}

      <Row gutter={[10, 10]} style={{ marginBottom: 12 }}>
        <Col xs={24} lg={8}>
          <Card size="small" title={t('hrPerfReport.gradePie')}>
            {pieData.length ? (
              <Pie data={pieData} angleField="value" colorField="type" radius={0.85}
                legend={{ position: 'right' }} />
            ) : <Typography.Text type="secondary">{t('common.noData')}</Typography.Text>}
          </Card>
        </Col>
        <Col xs={24} lg={8}>
          <Card size="small" title={t('hrPerfReport.deptCompare')}>
            {deptData.length ? (
              <Column data={deptData} xField="department" yField="value" seriesField="series" isGroup height={260} />
            ) : <Typography.Text type="secondary">{t('common.noData')}</Typography.Text>}
          </Card>
        </Col>
        <Col xs={24} lg={8}>
          <Card size="small" title={t('hrPerfReport.trendTitle')}>
            {trendData.length ? (
              <Column data={trendData} xField="plan" yField="value" seriesField="series" isGroup height={260} />
            ) : <Typography.Text type="secondary">{t('common.noData')}</Typography.Text>}
          </Card>
        </Col>
      </Row>

      <div className="action-section">
        <div className="action-section-left">
          <Typography.Text type="secondary">{t('hrPerfReport.scopeTip')}</Typography.Text>
        </div>
        <div className="action-section-right">
          <Space>
            {canExport && (
              <Button icon={<DownloadOutlined />} loading={exporting} onClick={handleExport}>
                {t('hrPerfReport.exportCsv')}
              </Button>
            )}
            {configComponent}
          </Space>
        </div>
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

      <ScoreDrawer open={!!detailId} assessmentId={detailId ?? undefined} mode="view"
        onClose={() => setDetailId(null)} />
    </div>
  )
}
