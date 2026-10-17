/**
 * 月度考勤汇总 —— 薪酬核算系统的取数出口
 *
 * 状态机（严格单向）：draft 待確認 → frozen 已凍結 → synced 已同步薪酬。
 * 冻结意味着「薪酬按这份数据算工资」，因此：
 * ① 只有 draft 行可被冻结，只有 frozen 行可被同步；按钮按行状态禁用，
 *    但真正的拦截在后端（前端禁用只是 UX，不是安全边界）；
 * ② 冻结后禁止回溯修改，如需更正必须走 HR 数据更正流程并生成新月份版本；
 * ③ 批量操作必须二次确认，并把条数与后果写在确认框里，不能只问「是否确定」；
 * ④ 冻结会生成批次号（AT+年月+序号），薪酬侧按批次对账，因此批次号必须显示出来。
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Alert, Button, DatePicker, Form, Input, Modal, Select, Space, Table, Tag, TreeSelect, message,
} from 'antd'
import type { TableColumnsType } from 'antd'
import {
  DollarCircleOutlined, ExportOutlined, FileSearchOutlined, LockOutlined, ReloadOutlined,
  SearchOutlined, TeamOutlined, ThunderboltOutlined, WarningOutlined,
} from '@ant-design/icons'
import dayjs, { type Dayjs } from 'dayjs'
import { useTranslation } from 'react-i18next'
import StatCards from '../../components/StatCards'
import { useColumnConfig } from '../../hooks/useColumnConfig'
import { useAuth } from '../../contexts/AuthContext'
import { useServerSort } from '../../hooks/useServerSort'
import {
  MONTHLY_STATUS, fetchMonthlyStats, fetchMonthlySummaries, freezeMonthly, generateMonthly,
  syncMonthlyToPayroll, type MonthlyVO,
} from '../../api/attendance'
import { MONTHLY_STATUS_LABEL_KEY, MONTHLY_STATUS_TAG_COLOR } from './meta'
import { useAttendanceOptions } from './useAttendanceOptions'
import { exportToCSV } from '../../utils/exportCSV'
import '@/styles/components.css'

/** 列 key → i18n key：列标题唯一来源，表格与列配置面板共用 */
const COL_KEY: Record<string, string> = {
  statMonth: 'attendance.colStatMonth',
  batchNo: 'attendance.colBatchNo',
  empNo: 'attendance.colEmpNo',
  empName: 'attendance.colEmpName',
  deptName: 'attendance.colDept',
  groupName: 'attendance.colGroup',
  shouldDays: 'attendance.colShouldDays',
  actualDays: 'attendance.colActualDays',
  lateTimes: 'attendance.colLateTimes',
  lateMinutes: 'attendance.colLateMinutes',
  absentDays: 'attendance.colAbsentDays',
  workdayOtHours: 'attendance.colWorkdayOt',
  restdayOtHours: 'attendance.colRestdayOt',
  holidayOtHours: 'attendance.colHolidayOt',
  attendRate: 'attendance.colAttendRate',
  status: 'common.colStatus',
  frozenBy: 'attendance.colFrozenBy',
  frozenAt: 'attendance.colFrozenAt',
  syncedAt: 'attendance.colSyncedAt',
}

interface FilterValues {
  month?: Dayjs
  keyword?: string
  deptId?: number
  groupId?: number
  status?: string
}

export default function AttendanceMonthlyReport() {
  const { t } = useTranslation()
  const { hasPermission } = useAuth()
  const canEdit = hasPermission('attendance-monthly:edit')
  const canExport = hasPermission('attendance-monthly:export')
  const { groupOptions, deptTree } = useAttendanceOptions()

  const [form] = Form.useForm<FilterValues>()
  const [rows, setRows] = useState<MonthlyVO[]>([])
  const [total, setTotal] = useState(0)
  const [stats, setStats] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(false)
  const [loadFailed, setLoadFailed] = useState(false)
  const [filters, setFilters] = useState<FilterValues>({ month: dayjs().subtract(1, 'month') })
  const [pagination, setPagination] = useState({ page: 1, size: 20 })
  const { sort, applySorter } = useServerSort()
  const [selectedKeys, setSelectedKeys] = useState<React.Key[]>([])
  const [acting, setActing] = useState(false)

  const queryParams = useCallback((values: FilterValues) => ({
    month: values.month ? values.month.format('YYYY-MM') : undefined,
    keyword: values.keyword?.trim() || undefined,
    deptId: values.deptId,
    groupId: values.groupId,
    status: values.status,
  }), [])

  const statsKey = useMemo(() => JSON.stringify(queryParams(filters)), [filters, queryParams])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetchMonthlySummaries({ ...queryParams(filters), page: pagination.page, size: pagination.size, sortField: sort.field, sortOrder: sort.order })
      setRows(res.records ?? [])
      setTotal(res.total ?? 0)
      setLoadFailed(false)
    } catch {
      setLoadFailed(true)
      setRows([])
      setTotal(0)
    } finally {
      setLoading(false)
    }
  }, [filters, pagination.page, pagination.size, queryParams, sort.field, sort.order])

  const loadStats = useCallback(() => {
    fetchMonthlyStats(queryParams(filters)).then(setStats).catch(() => setStats({}))
  }, [filters, queryParams])

  useEffect(() => { load() }, [load])
  useEffect(() => { loadStats() }, [loadStats])

  const refresh = useCallback(() => { load(); loadStats() }, [load, loadStats])

  const handleSearch = () => {
    setFilters(form.getFieldsValue())
    setPagination(p => ({ ...p, page: 1 }))
    setSelectedKeys([])
  }

  const handleReset = () => {
    form.resetFields()
    form.setFieldValue('month', dayjs().subtract(1, 'month'))
    setFilters({ month: dayjs().subtract(1, 'month') })
    setPagination(p => ({ ...p, page: 1 }))
    setSelectedKeys([])
  }

  /** 生成/刷新月度汇总：只重建 draft 行，已冻结与已同步不动（后端保证） */
  const handleGenerate = () => {
    const month = (filters.month ?? dayjs().subtract(1, 'month')).format('YYYY-MM')
    Modal.confirm({
      title: t('attendance.generateConfirmTitle', { month }),
      className: 'custom-confirm-modal',
      icon: <span className="confirm-icon-wrapper"><span className="confirm-icon-text">!</span></span>,
      okText: t('common.confirm'),
      cancelText: t('common.cancel'),
      content: (
        <div className="confirm-info-card">
          <div className="confirm-info-row">
            <span>{t('attendance.recalcScopeLabel')}</span>
            <b>{filters.groupId
              ? (groupOptions.find(g => g.value === filters.groupId)?.label ?? String(filters.groupId))
              : t('attendance.recalcAllGroups')}</b>
          </div>
          <div className="confirm-info-row">
            <span>{t('attendance.recalcEffectLabel')}</span><b>{t('attendance.generateEffect')}</b>
          </div>
        </div>
      ),
      onOk: async () => {
        setActing(true)
        try {
          const result = await generateMonthly(month, filters.groupId)
          message.success(t('attendance.generateResult', {
            generated: result.generated ?? 0,
            skipped: result.skippedLocked ?? 0,
          }))
          refresh()
        } catch {
          // 请求层已统一提示（月份格式非法等）
        } finally {
          setActing(false)
        }
      },
    })
  }

  /** 冻结与同步共用一套确认流程：两者的后果不同，文案必须分开写清 */
  const handleTransition = (kind: 'freeze' | 'sync') => {
    const targets = rows.filter(r => selectedKeys.includes(r.id))
    const expected = kind === 'freeze' ? MONTHLY_STATUS.DRAFT : MONTHLY_STATUS.FROZEN
    const valid = targets.filter(r => r.status === expected)
    if (valid.length === 0) {
      message.warning(kind === 'freeze'
        ? t('attendance.freezeNothingValid')
        : t('attendance.syncNothingValid'))
      return
    }
    const months = Array.from(new Set(valid.map(r => r.statMonth))).sort()
    Modal.confirm({
      title: kind === 'freeze'
        ? t('attendance.freezeConfirmTitle', { count: valid.length })
        : t('attendance.syncConfirmTitle', { count: valid.length }),
      className: 'custom-confirm-modal',
      icon: <span className="confirm-icon-wrapper"><span className="confirm-icon-text">!</span></span>,
      okText: t('common.confirm'),
      cancelText: t('common.cancel'),
      okButtonProps: { danger: kind === 'freeze' },
      content: (
        <div className="confirm-info-card">
          <div className="confirm-info-row">
            <span>{t('attendance.colStatMonth')}：</span><b>{months.join('、')}</b>
          </div>
          <div className="confirm-info-row">
            <span>{t('attendance.confirmCountLabel')}：</span>
            <b>{t('common.selectedCount', { count: valid.length })}</b>
          </div>
          {targets.length !== valid.length && (
            <div className="confirm-info-row">
              <span>{t('attendance.transitionSkippedLabel')}</span>
              <b>{t('attendance.transitionSkipped', { count: targets.length - valid.length })}</b>
            </div>
          )}
          <div className="confirm-info-row">
            <span>{t('attendance.recalcEffectLabel')}</span>
            <b>{kind === 'freeze' ? t('attendance.freezeConsequence') : t('attendance.syncConsequence')}</b>
          </div>
        </div>
      ),
      onOk: async () => {
        setActing(true)
        try {
          const ids = valid.map(r => r.id)
          const result = kind === 'freeze' ? await freezeMonthly(ids) : await syncMonthlyToPayroll(ids)
          message.success(kind === 'freeze'
            ? t('attendance.freezeResult', { changed: result.changed ?? 0, skipped: result.skipped ?? 0, batchNo: result.batchNo || '-' })
            : t('attendance.syncResult2', { changed: result.changed ?? 0, skipped: result.skipped ?? 0 }))
          setSelectedKeys([])
          refresh()
        } catch {
          // 请求层已统一提示
        } finally {
          setActing(false)
        }
      },
    })
  }

  const statusLabel = (status?: string | null) => {
    const key = status ? MONTHLY_STATUS_LABEL_KEY[status] : undefined
    return key ? t(key) : String(status ?? '-')
  }

  const handleExport = () => {
    const selected = selectedKeys.length > 0 ? rows.filter(r => selectedKeys.includes(r.id)) : rows
    if (selected.length === 0) {
      message.warning(t('common.noDataToExport'))
      return
    }
    exportToCSV(
      `${t('attendance.monthlyTitle')}_${dayjs().format('YYYY-MM-DD')}`,
      [
        { title: t('attendance.colStatMonth'), dataIndex: 'statMonth' },
        { title: t('attendance.colBatchNo'), dataIndex: 'batchNo', render: v => v ?? '-' },
        { title: t('attendance.colEmpNo'), dataIndex: 'empNo', render: v => v ?? '-' },
        { title: t('attendance.colEmpName'), dataIndex: 'empName', render: v => v ?? '-' },
        { title: t('attendance.colDept'), dataIndex: 'deptName', render: v => v ?? '-' },
        { title: t('attendance.colGroup'), dataIndex: 'groupName', render: v => v ?? '-' },
        { title: t('attendance.colShouldDays'), dataIndex: 'shouldDays', render: v => String(v ?? 0) },
        { title: t('attendance.colActualDays'), dataIndex: 'actualDays', render: v => String(v ?? 0) },
        { title: t('attendance.colLateTimes'), dataIndex: 'lateTimes', render: v => String(v ?? 0) },
        { title: t('attendance.colLateMinutes'), dataIndex: 'lateMinutes', render: v => String(v ?? 0) },
        { title: t('attendance.colAbsentDays'), dataIndex: 'absentDays', render: v => String(v ?? 0) },
        { title: t('attendance.colWorkdayOt'), dataIndex: 'workdayOtHours', render: v => String(v ?? 0) },
        { title: t('attendance.colRestdayOt'), dataIndex: 'restdayOtHours', render: v => String(v ?? 0) },
        { title: t('attendance.colHolidayOt'), dataIndex: 'holidayOtHours', render: v => String(v ?? 0) },
        { title: t('attendance.colAttendRate'), dataIndex: 'attendRate', render: v => `${v ?? 0}%` },
        { title: t('common.colStatus'), dataIndex: 'status', render: v => statusLabel(v as string) },
        { title: t('attendance.colFrozenBy'), dataIndex: 'frozenBy', render: v => v ?? '-' },
        { title: t('attendance.colFrozenAt'), dataIndex: 'frozenAt', render: v => v ?? '-' },
        { title: t('attendance.colSyncedAt'), dataIndex: 'syncedAt', render: v => v ?? '-' },
      ],
      selected,
    )
    message.success(t('common.exportSuccess'))
  }

  const numericColumn = (key: keyof typeof COL_KEY, field: keyof MonthlyVO, width = 90): TableColumnsType<MonthlyVO>[number] => ({
    title: t(COL_KEY[key]), dataIndex: field as string, key: field as string, width, align: 'right',
    render: (v?: number) => String(v ?? 0),
  })

  const columns: TableColumnsType<MonthlyVO> = [
    { title: t(COL_KEY.statMonth), dataIndex: 'statMonth', key: 'statMonth', width: 100, fixed: 'left', sorter: true },
    { title: t(COL_KEY.batchNo), dataIndex: 'batchNo', key: 'batchNo', width: 150, render: (v?: string) => v || '-' },
    { title: t(COL_KEY.empNo), dataIndex: 'empNo', key: 'empNo', width: 110 },
    { title: t(COL_KEY.empName), dataIndex: 'empName', key: 'empName', width: 100 },
    { title: t(COL_KEY.deptName), dataIndex: 'deptName', key: 'deptName', width: 140, ellipsis: true, render: (v?: string) => v || '-' },
    { title: t(COL_KEY.groupName), dataIndex: 'groupName', key: 'groupName', width: 180, ellipsis: true, render: (v?: string) => v || '-' },
    { title: t(COL_KEY.shouldDays), dataIndex: 'shouldDays', key: 'shouldDays', width: 90, align: 'right', render: (v?: number) => String(v ?? 0) },
    { title: t(COL_KEY.actualDays), dataIndex: 'actualDays', key: 'actualDays', width: 90, align: 'right', render: (v?: number) => String(v ?? 0) },
    numericColumn('lateTimes', 'lateTimes', 80),
    numericColumn('lateMinutes', 'lateMinutes', 90),
    { title: t(COL_KEY.absentDays), dataIndex: 'absentDays', key: 'absentDays', width: 90, align: 'right', render: (v?: number) => String(v ?? 0) },
    { title: t(COL_KEY.workdayOtHours), dataIndex: 'workdayOtHours', key: 'workdayOtHours', width: 110, align: 'right', render: (v?: number) => `${v ?? 0} h` },
    { title: t(COL_KEY.restdayOtHours), dataIndex: 'restdayOtHours', key: 'restdayOtHours', width: 110, align: 'right', render: (v?: number) => `${v ?? 0} h` },
    { title: t(COL_KEY.holidayOtHours), dataIndex: 'holidayOtHours', key: 'holidayOtHours', width: 120, align: 'right', render: (v?: number) => `${v ?? 0} h` },
    { title: t(COL_KEY.attendRate), dataIndex: 'attendRate', key: 'attendRate', width: 100, align: 'right', sorter: true, render: (v?: number) => `${v ?? 0}%` },
    {
      title: t(COL_KEY.status), dataIndex: 'status', key: 'status', width: 120,
      render: (v: string) => <Tag color={MONTHLY_STATUS_TAG_COLOR[v] ?? 'default'}>{statusLabel(v)}</Tag>,
    },
    { title: t(COL_KEY.frozenBy), dataIndex: 'frozenBy', key: 'frozenBy', width: 120, render: (v?: string) => v || '-' },
    { title: t(COL_KEY.frozenAt), dataIndex: 'frozenAt', key: 'frozenAt', width: 170, render: (v?: string) => v || '-' },
    { title: t(COL_KEY.syncedAt), dataIndex: 'syncedAt', key: 'syncedAt', width: 170, render: (v?: string) => v || '-' },
  ]

  const columnMeta = useMemo(
    () => Object.entries(COL_KEY).map(([key, i18nKey]) => ({ key, title: t(i18nKey) })),
    [t],
  )

  const { configComponent, applyConfig } = useColumnConfig('attendance-monthly', columnMeta, [
    { key: 'statMonth', visible: true, locked: 'head' as const },
  ])

  const selectedRows = rows.filter(r => selectedKeys.includes(r.id))
  const freezable = selectedRows.filter(r => r.status === MONTHLY_STATUS.DRAFT).length
  const syncable = selectedRows.filter(r => r.status === MONTHLY_STATUS.FROZEN).length

  return (
    <div className="content-area" style={{ padding: '20px 24px' }}>
      {loadFailed && (
        <Alert
          type="error"
          showIcon
          message={t('common.loadFailed')}
          style={{ marginBottom: 16 }}
          action={<Button size="small" onClick={refresh}>{t('common.reset')}</Button>}
        />
      )}
      <Alert type="warning" showIcon message={t('attendance.monthlyPageHint')} style={{ marginBottom: 16 }} />

      <div className="search-section">
        <Form form={form} layout="inline" initialValues={{ month: dayjs().subtract(1, 'month') }}>
          <Form.Item label={t('attendance.colStatMonth')} name="month">
            <DatePicker picker="month" allowClear={false} style={{ width: 140 }} />
          </Form.Item>
          <Form.Item label={t('attendance.keywordLabel')} name="keyword">
            <Input placeholder={t('attendance.monthlyKeywordPlaceholder')} style={{ width: 200 }} allowClear />
          </Form.Item>
          <Form.Item label={t('attendance.colDept')} name="deptId">
            <TreeSelect
              treeData={deptTree}
              allowClear
              showSearch
              treeNodeFilterProp="title"
              placeholder={t('common.all')}
              style={{ width: 170 }}
            />
          </Form.Item>
          <Form.Item label={t('attendance.colGroup')} name="groupId">
            <Select
              placeholder={t('common.all')}
              allowClear
              showSearch
              optionFilterProp="label"
              style={{ width: 190 }}
              options={groupOptions}
            />
          </Form.Item>
          <Form.Item label={t('common.colStatus')} name="status">
            <Select
              placeholder={t('common.all')}
              allowClear
              style={{ width: 140 }}
              options={[MONTHLY_STATUS.DRAFT, MONTHLY_STATUS.FROZEN, MONTHLY_STATUS.SYNCED].map(code => ({
                value: code,
                label: t(MONTHLY_STATUS_LABEL_KEY[code]),
              }))}
            />
          </Form.Item>
          <Form.Item>
            <div className="search-actions">
              <Button type="primary" icon={<SearchOutlined />} onClick={handleSearch}>{t('common.search')}</Button>
              <Button icon={<ReloadOutlined />} onClick={handleReset}>{t('common.reset')}</Button>
            </div>
          </Form.Item>
        </Form>
      </div>

      {/* 统计卡片：搜索区之后、操作区之前（规范 §E.8） */}
      <div style={{ marginBottom: 16 }}>
        <StatCards
          animationKey={statsKey}
          items={[
            { key: 'should', icon: <TeamOutlined />, color: 'info', value: stats.should ?? 0, label: t('attendance.statMonthlyShould'), decimals: 1 },
            { key: 'actual', icon: <FileSearchOutlined />, color: 'success', value: stats.actual ?? 0, label: t('attendance.statMonthlyActual'), decimals: 1 },
            { key: 'abnormal', icon: <WarningOutlined />, color: 'brand', value: stats.abnormal ?? 0, label: t('attendance.statMonthlyAbnormal') },
            { key: 'draft', icon: <ThunderboltOutlined />, color: 'system', value: stats.draft ?? 0, label: t('attendance.statMonthlyDraft') },
          ]}
        />
      </div>

      <div className="action-section">
        <div className="action-section-left">
          <Space>
            {canExport && (
              <Button className="btn-export" icon={<ExportOutlined />} onClick={handleExport}>
                {t('common.export')}
              </Button>
            )}
            {canEdit && (
              <>
                <Button icon={<DollarCircleOutlined />} loading={acting} onClick={handleGenerate}>
                  {t('attendance.generateButton')}
                </Button>
                <Button
                  icon={<LockOutlined />}
                  danger
                  disabled={freezable === 0}
                  loading={acting}
                  onClick={() => handleTransition('freeze')}
                >
                  {t('attendance.freezeButton', { count: freezable })}
                </Button>
                <Button
                  icon={<DollarCircleOutlined />}
                  disabled={syncable === 0}
                  loading={acting}
                  onClick={() => handleTransition('sync')}
                >
                  {t('attendance.syncButton', { count: syncable })}
                </Button>
              </>
            )}
          </Space>
        </div>
        <div className="action-section-right">
          {configComponent}
        </div>
      </div>

      <Table<MonthlyVO>
        rowKey="id"
        loading={loading}
        columns={applyConfig(columns)}
        dataSource={rows}
        rowSelection={{
          selectedRowKeys: selectedKeys,
          onChange: setSelectedKeys,
          // 已同步薪酬的行不可再选：状态机是单向的，选了也不会有任何动作可执行
          getCheckboxProps: record => ({ disabled: record.status === MONTHLY_STATUS.SYNCED }),
        }}
        scroll={{ x: 2400 }}
        size="middle"
        onChange={(pag, _filters, sorter) => {
          const sortChanged = applySorter(sorter)
          setPagination(p => ({ page: sortChanged ? 1 : (pag.current ?? 1), size: pag.pageSize ?? p.size }))
        }}
        pagination={{
          current: pagination.page,
          pageSize: pagination.size,
          total,
          showSizeChanger: true,
          showQuickJumper: true,
          pageSizeOptions: ['10', '20', '50', '100'],
          showTotal: (count) => t('common.totalRecords', { count }),
        }}
      />
    </div>
  )
}
