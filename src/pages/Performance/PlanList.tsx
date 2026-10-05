import { useCallback, useEffect, useMemo, useState } from 'react'
import { Button, Select, Space, Table, Tabs, Tag, Tooltip, message } from 'antd'
import type { TableColumnsType } from 'antd'
import { PlusOutlined, ReloadOutlined } from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
import { useNavigate, useSearchParams } from 'react-router-dom'
import dayjs from 'dayjs'
import { useAuth } from '../../contexts/AuthContext'
import { useColumnConfig } from '../../hooks/useColumnConfig'
import {
  type PerfCycle, type PerfPlan, fetchPerfCycles, fetchPerfPlans,
} from '../../api/hrPerformance'
import {
  PERF_MENU, PLAN_STATUS_LABEL_KEY, PLAN_STATUS_TABS, PLAN_STATUS_TAG_COLOR, planDetailPath, planFormPath,
} from './meta'

/**
 * 考核计划台账：一次发起对应一批人，进度按状态分列展示。
 * <p>
 * 待指派评估人数必须显式暴露——发起时部门负责人姓名歧义会自动落待指派，
 * 不点出来就会在提交审批时被后端拦下，HR 找不到原因。
 */
export default function PerfPlanList() {
  const navigate = useNavigate()
  const { t } = useTranslation()
  const { hasPermission } = useAuth()
  const canCreate = hasPermission(`${PERF_MENU.ADMIN}:create`)
  const [searchParams] = useSearchParams()

  const [rows, setRows] = useState<PerfPlan[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [page, setPage] = useState(1)
  const [size, setSize] = useState(20)
  const [status, setStatus] = useState('all')
  const [cycleId, setCycleId] = useState<number | undefined>(() => {
    const raw = searchParams.get('cycleId')
    return raw ? Number(raw) : undefined
  })
  const [cycles, setCycles] = useState<PerfCycle[]>([])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetchPerfPlans({
        page, size, cycleId, status: status === 'all' ? undefined : status,
      })
      setRows(res.records || [])
      setTotal(res.total || 0)
    } catch {
      // 请求层已统一提示
    } finally {
      setLoading(false)
    }
  }, [page, size, status, cycleId])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    fetchPerfCycles({ page: 1, size: 100 })
      .then(res => setCycles(res.records || []))
      .catch(() => { message.error(t('common.queryFailed')) })
  }, [t])

  const statusLabel = (code?: string) => (code && PLAN_STATUS_LABEL_KEY[code]
    ? t(PLAN_STATUS_LABEL_KEY[code]) : (code || '-'))

  const columns = useMemo<TableColumnsType<PerfPlan>>(() => [
    { title: t('hrPerf.planReqNo'), dataIndex: 'reqNo', key: 'reqNo', width: 150, fixed: 'left' },
    { title: t('hrPerf.planName'), dataIndex: 'name', key: 'name', width: 220 },
    { title: t('hrPerf.cycle'), dataIndex: 'cycleName', key: 'cycleName', width: 160, render: (v: string) => v || '-' },
    { title: t('hrPerf.template'), dataIndex: 'templateName', key: 'templateName', width: 160, render: (v: string) => v || '-' },
    {
      title: t('hrPerf.window'), key: 'window', width: 210,
      render: (_, r) => `${r.selfStart} ~ ${r.calibEnd}`,
    },
    {
      title: t('hrPerf.headcount'), dataIndex: 'total', key: 'total', width: 90,
      render: (v: number) => v ?? 0,
    },
    {
      title: t('hrPerf.progress'), key: 'progress', width: 240,
      render: (_, r) => {
        const done = (r.confirmed ?? 0) + (r.confirmPending ?? 0)
        const pct = r.total ? Math.round((done / r.total) * 100) : 0
        return (
          <Tooltip title={`${t('hrPerf.confirmedCount')}: ${r.confirmed ?? 0} / ${r.total ?? 0}`}>
            <Space size={4} split={<span style={{ color: '#D9D9D9' }}>|</span>}>
              <span style={{ color: '#8C8C8C' }}>{t('hrPerf.shortSelf')}{r.selfPending ?? 0}</span>
              <span style={{ color: '#8C8C8C' }}>{t('hrPerf.shortSup')}{r.supervisorPending ?? 0}</span>
              <span style={{ color: '#8C8C8C' }}>{t('hrPerf.shortCalib')}{r.calibrationPending ?? 0}</span>
              <span style={{ color: '#E8720C', fontWeight: 600 }}>{pct}%</span>
            </Space>
          </Tooltip>
        )
      },
    },
    {
      title: t('hrPerf.unassignedEvaluator'), dataIndex: 'unassigned', key: 'unassigned', width: 120,
      render: (v: number) => (v ? <Tag color="error">{v}</Tag> : <span style={{ color: '#8C8C8C' }}>0</span>),
    },
    {
      title: t('common.colStatus'), dataIndex: 'status', key: 'status', width: 110,
      render: (v: string) => <Tag color={PLAN_STATUS_TAG_COLOR[v]}>{statusLabel(v)}</Tag>,
    },
    {
      title: t('hrPerf.flowNo'), dataIndex: 'flowNo', key: 'flowNo', width: 150,
      render: (v: string) => v || '-',
    },
    {
      title: t('common.colUpdateTime'), dataIndex: 'updatedAt', key: 'updatedAt', width: 160,
      render: (v: string) => (v ? dayjs(v).format('YYYY-MM-DD HH:mm') : '-'),
    },
    {
      title: t('common.colAction'), key: 'action', width: 120, fixed: 'right',
      render: (_, r) => (
        <Button type="link" size="small" onClick={() => navigate(planDetailPath(r.id as number))}>
          {t('common.detail')}
        </Button>
      ),
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [t, navigate])

  const { configComponent, applyConfig } = useColumnConfig('hr-perf-plan',
    columns.map(c => ({ key: String(c.key), title: String(c.title) })),
    [{ key: 'action', visible: true, locked: 'tail' }])

  return (
    <div className="content-area">
      <div className="search-section">
        <Space size={12} wrap>
          <span>{t('hrPerf.cycle')}</span>
          <Select style={{ width: 240 }} allowClear showSearch optionFilterProp="label"
            placeholder={t('common.pleaseSelect')} value={cycleId}
            onChange={v => { setCycleId(v); setPage(1) }}
            options={cycles.map(c => ({
              value: c.id as number,
              label: `${c.name}（${c.code}）`,
            }))} />
          <Button icon={<ReloadOutlined />}
            onClick={() => { setCycleId(undefined); setStatus('all'); setPage(1) }}>
            {t('common.reset')}
          </Button>
        </Space>
      </div>

      <Tabs
        activeKey={status}
        items={PLAN_STATUS_TABS.map(key => ({
          key, label: key === 'all' ? t('common.all') : statusLabel(key),
        }))}
        onChange={key => { setStatus(key); setPage(1) }}
        style={{ marginBottom: 0 }}
      />

      <div className="action-section">
        <div className="action-section-left" />
        <div className="action-section-right">
          {canCreate && (
            <Button type="primary" icon={<PlusOutlined />} onClick={() => navigate(planFormPath())}>
              {t('hrPerf.launchPlan')}
            </Button>
          )}
          {configComponent}
        </div>
      </div>

      <Table<PerfPlan>
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
    </div>
  )
}
