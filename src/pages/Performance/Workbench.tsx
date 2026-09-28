import { useCallback, useEffect, useMemo, useState } from 'react'
import { Alert, Button, Input, Space, Table, Tabs, Tag, Typography } from 'antd'
import type { TableColumnsType } from 'antd'
import { ReloadOutlined, SearchOutlined } from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
import dayjs from 'dayjs'
import { useColumnConfig } from '../../hooks/useColumnConfig'
import {
  ASSESS_STATUS, type PerfAssessment, fetchMyReviews,
} from '../../api/hrPerformance'
import {
  ASSESS_STATUS_LABEL_KEY, ASSESS_STATUS_TAG_COLOR, PERF_MENU, REVIEW_STATUS_TABS,
} from './meta'
import ScoreDrawer from './ScoreDrawer'

/**
 * 评分工作台：只列出「我是评估人」的考核单（服务端按 evaluator_user_id 收敛）。
 * <p>
 * 自评未完成的单子列出来但不能打分，让主管知道为什么点不动，
 * 而不是凭空少几张单却无从解释。
 */
export default function PerfWorkbench() {
  const { t } = useTranslation()
  const [rows, setRows] = useState<PerfAssessment[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [page, setPage] = useState(1)
  const [size, setSize] = useState(20)
  const [status, setStatus] = useState<string>(ASSESS_STATUS.SUPERVISOR_PENDING)
  const [keyword, setKeyword] = useState<string>()
  const [input, setInput] = useState('')
  const [drawer, setDrawer] = useState<{ id: number; mode: 'supervisor' | 'view' } | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetchMyReviews({
        page, size, keyword: keyword || undefined,
        status: status === 'all' ? undefined : status,
      })
      setRows(res.records || [])
      setTotal(res.total || 0)
    } catch {
      // 请求层已统一提示
    } finally {
      setLoading(false)
    }
  }, [page, size, status, keyword])

  useEffect(() => { load() }, [load])

  const statusText = (code?: string) => (code && ASSESS_STATUS_LABEL_KEY[code]
    ? t(ASSESS_STATUS_LABEL_KEY[code]) : (code || '-'))

  const columns = useMemo<TableColumnsType<PerfAssessment>>(() => [
    { title: t('hrPerf.assessmentReqNo'), dataIndex: 'reqNo', key: 'reqNo', width: 150, fixed: 'left' },
    {
      title: t('hrPerf.employee'), key: 'emp', width: 170,
      render: (_, r) => `${r.empName || '-'}${r.empNo ? ` (${r.empNo})` : ''}`,
    },
    { title: t('hrPerf.department'), dataIndex: 'deptName', key: 'deptName', width: 150, render: (v: string) => v || '-' },
    { title: t('hrPerf.position'), key: 'position', width: 160, render: (_, r) => r.positionName || '-' },
    { title: t('hrPerf.plan'), dataIndex: 'planName', key: 'planName', width: 200, render: (v: string) => v || '-' },
    {
      title: t('hrPerf.selfScore'), dataIndex: 'selfScore', key: 'selfScore', width: 100,
      render: (v: number | null, r) => (v == null
        ? <Tag color="default">{t('hrPerf.notStarted')}</Tag>
        : <span>{v}{r.selfAt ? <Typography.Text type="secondary"> · {dayjs(r.selfAt).format('MM-DD HH:mm')}</Typography.Text> : null}</span>),
    },
    {
      title: t('hrPerf.supervisorScore'), dataIndex: 'supervisorScore', key: 'supervisorScore', width: 110,
      render: (v: number | null) => (v == null ? '-' : v),
    },
    {
      title: t('common.colStatus'), dataIndex: 'status', key: 'status', width: 110,
      render: (v: string) => <Tag color={ASSESS_STATUS_TAG_COLOR[v]}>{statusText(v)}</Tag>,
    },
    {
      title: t('common.colAction'), key: 'action', width: 150, fixed: 'right',
      render: (_, r) => (
        <Space size={0}>
          <Button type="link" size="small"
            disabled={r.status !== ASSESS_STATUS.SUPERVISOR_PENDING}
            onClick={() => setDrawer({ id: r.id, mode: 'supervisor' })}>
            {t('hrPerf.score')}
          </Button>
          <span className="action-split">|</span>
          <Button type="link" size="small" onClick={() => setDrawer({ id: r.id, mode: 'view' })}>
            {t('common.detail')}
          </Button>
        </Space>
      ),
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [t])

  const { configComponent, applyConfig } = useColumnConfig(PERF_MENU.REVIEW,
    columns.map(c => ({ key: String(c.key), title: String(c.title) })),
    [{ key: 'action', visible: true, locked: 'tail' }])

  return (
    <div className="content-area">
      <div className="search-section">
        <Space size={12} wrap>
          <span>{t('hrPerf.employee')}</span>
          <Input style={{ width: 220 }} allowClear value={input}
            placeholder={t('hrPerf.reviewKeywordPlaceholder')}
            onChange={e => setInput(e.target.value)}
            onPressEnter={() => { setKeyword(input.trim() || undefined); setPage(1) }} />
          <Button type="primary" icon={<SearchOutlined />}
            onClick={() => { setKeyword(input.trim() || undefined); setPage(1) }}>
            {t('common.search')}
          </Button>
          <Button icon={<ReloadOutlined />} onClick={() => {
            setInput(''); setKeyword(undefined); setStatus(ASSESS_STATUS.SUPERVISOR_PENDING); setPage(1)
          }}>
            {t('common.reset')}
          </Button>
        </Space>
      </div>

      <Tabs
        activeKey={status}
        items={REVIEW_STATUS_TABS.map(key => ({
          key, label: key === 'all' ? t('common.all') : statusText(key),
        }))}
        onChange={key => { setStatus(key); setPage(1) }}
        style={{ marginBottom: 0 }}
      />

      <div className="action-section">
        <div className="action-section-left">
          <Alert type="info" showIcon style={{ border: 'none', padding: 0 }}
            message={t('hrPerf.workbenchScopeTip')} />
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

      <ScoreDrawer open={!!drawer} assessmentId={drawer?.id} mode={drawer?.mode || 'view'}
        onClose={() => setDrawer(null)} onChanged={load} />
    </div>
  )
}
