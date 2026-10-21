import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { Alert, Button, DatePicker, Form, Select, Space, Table, Tag } from 'antd'
import type { TableColumnsType } from 'antd'
import { EyeOutlined, ReloadOutlined, SearchOutlined } from '@ant-design/icons'
import type { Dayjs } from 'dayjs'
import { fetchDailyReportRecords, type DailyReportRecord } from '../../../api/rdmDailyReport'
import '../index.css'

/**
 * 進度日報 > 發送記錄（只读）。
 *
 * <p>只展示事实：哪天哪档、由哪条规则/哪个项目（哪个迭代）发出、推了几次、谁触发的。
 * 「查看日報」直接跳移动端日报页（/rdm-daily?date&type）——那页读的就是同一份快照，
 * 因此记录与内容永远一致，不需要在这里再实现一套快照渲染。
 *
 * <p>为什么 pushCount 会大于 1：手动补发写的是 report_type='manual' 行，同一天重复补发
 * 会累加次数并覆盖同一行（同一范围），既不会被定时幂等拦住，也不会产生多份互相矛盾的快照。
 *
 * <p>为什么筛选放前端：记录接口一次最多取 365 行（约一年），量级可控；项目/迭代候选
 * 直接从已加载记录里派生，既不会出现「筛选项里有、记录里没有」的空结果，也避免为了
 * 两个下拉再依赖项目/迭代菜单权限。
 */
interface RecordFilters {
  reportDate?: string
  reportType?: string
  triggerType?: string
  lastPushDate?: string
  projectId?: number
  iterationCode?: string
}

/** 表单值：DatePicker 是 Dayjs，提交时格式化为 yyyy-MM-dd 再参与匹配 */
type RecordSearchValues = Omit<RecordFilters, 'reportDate' | 'lastPushDate'> & {
  reportDate?: Dayjs
  lastPushDate?: Dayjs
}

export default function DailyReportRecords() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [searchForm] = Form.useForm<RecordSearchValues>()
  const selectedProjectId = Form.useWatch('projectId', searchForm)

  const [rows, setRows] = useState<DailyReportRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filters, setFilters] = useState<RecordFilters>({})
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      // 365 是该接口允许的上限；筛选在本地做，避免每次改条件都重新请求
      setRows(await fetchDailyReportRecords(365))
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  /** 项目候选从记录派生：只保留实际出现过的项目，标签沿用「编号 名称」 */
  const projectOptions = useMemo(() => {
    const seen = new Map<number, string>()
    rows.forEach(r => {
      if (r.projectId == null || seen.has(r.projectId)) return
      const name = `${r.projectNo ? r.projectNo + ' ' : ''}${r.projectName ?? '#' + r.projectId}`
      seen.set(r.projectId, name)
    })
    return Array.from(seen, ([value, label]) => ({ value, label }))
  }, [rows])

  /** 迭代候选跟随所选项目收敛；未选项目时下拉禁用，避免跨项目误选 */
  const iterationOptions = useMemo(() => {
    const codes = new Set<string>()
    rows.forEach(r => {
      if (!r.iterationCode) return
      if (selectedProjectId != null && r.projectId !== selectedProjectId) return
      codes.add(r.iterationCode)
    })
    return Array.from(codes).sort().map(code => ({ value: code, label: code }))
  }, [rows, selectedProjectId])

  const data = useMemo(() => rows.filter(r => {
    if (filters.reportDate && r.reportDate !== filters.reportDate) return false
    if (filters.reportType && r.reportType !== filters.reportType) return false
    if (filters.triggerType && r.triggerType !== filters.triggerType) return false
    if (filters.lastPushDate && !(r.lastPushAt ?? '').startsWith(filters.lastPushDate)) return false
    if (filters.projectId != null && r.projectId !== filters.projectId) return false
    if (filters.iterationCode && r.iterationCode !== filters.iterationCode) return false
    return true
  }), [rows, filters])

  const handleSearch = (values: RecordSearchValues) => {
    setFilters({
      reportDate: values.reportDate?.format('YYYY-MM-DD'),
      reportType: values.reportType,
      triggerType: values.triggerType,
      lastPushDate: values.lastPushDate?.format('YYYY-MM-DD'),
      projectId: values.projectId,
      iterationCode: values.iterationCode,
    })
    setPage(1)
  }

  const handleReset = () => {
    searchForm.resetFields()
    setFilters({})
    setPage(1)
  }

  const columns: TableColumnsType<DailyReportRecord> = [
    { title: t('rdm.dailyRecord.colDate'), dataIndex: 'reportDate', key: 'reportDate', width: 115 },
    {
      title: t('rdm.dailyRecord.colType'), dataIndex: 'reportType', key: 'reportType', width: 100,
      render: (v: string) => <Tag color={v === 'manual' ? 'blue' : v === 'evening' ? 'purple' : 'gold'}>
        {v === 'manual' ? t('rdm.dailyRecord.typeManual')
          : v === 'evening' ? t('rdm.dailyRecord.typeEvening') : t('rdm.dailyRecord.typeMorning')}
      </Tag>,
    },
    {
      title: t('rdm.dailyRecord.colRule'), key: 'rule', width: 160,
      render: (_, r) => r.ruleName
        ? <span>{r.ruleName}</span>
        : <span style={{ color: '#bfbfbf' }}>{t('rdm.dailyRecord.noRule')}</span>,
    },
    {
      title: t('rdm.dailyRecord.colProject'), key: 'project', width: 220,
      render: (_, r) => (r.projectId != null || r.scopeLabel
        ? <span style={{ fontSize: 12 }}>
          {r.projectId != null
            ? `${r.projectNo ? `${r.projectNo} ` : ''}${r.projectName ?? `#${r.projectId}`}`
            : r.scopeLabel}
        </span>
        : <span style={{ color: '#bfbfbf' }}>—</span>),
    },
    {
      title: t('rdm.dailyRecord.colIteration'), dataIndex: 'iterationCode', key: 'iteration', width: 150,
      render: (v: string | null) => (v
        ? <Tag color="blue" style={{ marginInlineEnd: 0 }}>{v}</Tag>
        : <Tag style={{ marginInlineEnd: 0 }}>{t('rdm.dailyRecord.allIterations')}</Tag>),
    },
    {
      title: t('rdm.dailyRecord.colProjectCount'), dataIndex: 'projectCount', key: 'projectCount', width: 90,
      render: (v: number | null) => v ?? '—',
    },
    {
      title: t('rdm.dailyRecord.colPersonalCount'), dataIndex: 'personalCount', key: 'personalCount', width: 100,
      render: (v: number | null) => v ?? '—',
    },
    {
      title: t('rdm.dailyRecord.colPushCount'), dataIndex: 'pushCount', key: 'pushCount', width: 100,
      render: (v: number | null) => (v && v > 1
        ? <Tag color="orange">{t('rdm.dailyRecord.pushTimes', { count: v })}</Tag>
        : (v ?? '—')),
    },
    {
      title: t('rdm.dailyRecord.colTrigger'), key: 'trigger', width: 180,
      render: (_, r) => (
        <Space size={4} wrap>
          <Tag color={r.triggerType === 'manual' ? 'blue' : 'default'} style={{ marginInlineEnd: 0 }}>
            {r.triggerType === 'manual' ? t('rdm.dailyRecord.triggerManual') : t('rdm.dailyRecord.triggerSchedule')}
          </Tag>
          {r.triggerBy && <span style={{ fontSize: 12, color: '#8c8c8c' }}>{r.triggerBy}</span>}
        </Space>
      ),
    },
    {
      title: t('rdm.dailyRecord.colLastPushAt'), dataIndex: 'lastPushAt', key: 'lastPushAt', width: 165,
      render: (v: string | null) => v ?? '—',
    },
    {
      title: t('rdm.dailyRecord.colActions'), key: 'actions', width: 110, fixed: 'right',
      render: (_, r) => (
        <Button type="link" size="small" icon={<EyeOutlined />}
          // 带上 scopeKey/projectId/iterationCode：同一天同一档位可能有多份快照，
          // 多项目/全部项目没有单一 projectId，只有 scopeKey 能精确定位
          onClick={() => navigate(`/rdm-daily?date=${r.reportDate}&type=${r.reportType}`
            + (r.projectId == null ? '' : `&projectId=${r.projectId}`)
            + (r.iterationCode ? `&iterationCode=${encodeURIComponent(r.iterationCode)}` : '')
            + (r.scopeKey ? `&scopeKey=${encodeURIComponent(r.scopeKey)}` : ''))}>
          {t('rdm.dailyRecord.viewReport')}
        </Button>
      ),
    },
  ]

  return (
    <div className="content-area">
      {error && (
        <Alert type="error" showIcon style={{ marginBottom: 12 }} message={t('rdm.dailyRecord.loadFailed')}
          description={error} action={<Button size="small" onClick={() => void load()}>{t('rdm.dailyRecord.retry')}</Button>} />
      )}

      {/* 搜索区：日报日期 / 档位 / 触发方式 / 最近推送时间 / 项目 / 迭代 */}
      <div className="search-section">
        <Form form={searchForm} layout="inline" onFinish={handleSearch}>
          <Form.Item label={t('rdm.dailyRecord.colDate')} name="reportDate">
            <DatePicker format="YYYY-MM-DD" placeholder={t('rdm.dailyRecord.filterDatePh')} />
          </Form.Item>
          <Form.Item label={t('rdm.dailyRecord.colType')} name="reportType">
            <Select allowClear placeholder={t('rdm.dailyRecord.filterAll')}
              options={[
                { label: t('rdm.dailyRecord.typeMorning'), value: 'morning' },
                { label: t('rdm.dailyRecord.typeEvening'), value: 'evening' },
                { label: t('rdm.dailyRecord.typeManual'), value: 'manual' },
              ]} />
          </Form.Item>
          <Form.Item label={t('rdm.dailyRecord.colTrigger')} name="triggerType">
            <Select allowClear placeholder={t('rdm.dailyRecord.filterAll')}
              options={[
                { label: t('rdm.dailyRecord.triggerSchedule'), value: 'schedule' },
                { label: t('rdm.dailyRecord.triggerManual'), value: 'manual' },
              ]} />
          </Form.Item>
          <Form.Item label={t('rdm.dailyRecord.colLastPushAt')} name="lastPushDate">
            <DatePicker format="YYYY-MM-DD" placeholder={t('rdm.dailyRecord.filterDatePh')} />
          </Form.Item>
          <Form.Item label={t('rdm.dailyRecord.colProject')} name="projectId">
            <Select allowClear showSearch optionFilterProp="label"
              placeholder={t('rdm.dailyRecord.filterProjectPh')}
              options={projectOptions}
              onChange={() => searchForm.setFieldValue('iterationCode', undefined)} />
          </Form.Item>
          <Form.Item label={t('rdm.dailyRecord.colIteration')} name="iterationCode">
            <Select allowClear showSearch optionFilterProp="label"
              disabled={selectedProjectId == null}
              placeholder={selectedProjectId == null
                ? t('rdm.dailyRecord.filterIterationFirst')
                : t('rdm.dailyRecord.filterIterationPh')}
              options={iterationOptions} />
          </Form.Item>
          <Form.Item>
            <div className="search-actions">
              <Button type="primary" htmlType="submit" icon={<SearchOutlined />}>{t('common.search')}</Button>
              <Button icon={<ReloadOutlined />} onClick={handleReset}>{t('common.reset')}</Button>
            </div>
          </Form.Item>
        </Form>
      </div>

      {/* 操作区：说明在左、刷新在右 */}
      <div className="action-section">
        <div className="action-section-left">
          <span style={{ fontSize: 12, color: '#8c8c8c' }}>{t('rdm.dailyRecord.hint')}</span>
        </div>
        <div className="action-section-right">
          <Button size="small" icon={<ReloadOutlined />} onClick={() => void load()} loading={loading}>
            {t('rdm.dailyRecord.refresh')}
          </Button>
        </div>
      </div>

      <Table rowKey="id" size="small" loading={loading} columns={columns} dataSource={data}
        scroll={{ x: 1450 }}
        pagination={{
          current: page,
          pageSize,
          showSizeChanger: true,
          onChange: (p, size) => { setPage(p); setPageSize(size) },
          showTotal: total => t('rdm.dailyRecord.totalRows', { total }),
        }} />
    </div>
  )
}
