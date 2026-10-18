/**
 * 考勤日报 —— 按「日期 × 考勤组」的结论汇总
 *
 * 日报是打卡流水与异常处理之后的**计算结果**，不是原始数据：
 * ① 页面不提供人工改数入口，修正一律回到「异常处理」发起补卡/请假后由系统重算；
 * ② 「重算」只影响未冻结日期，重算口径与月度汇总完全一致（同一份人日结论聚合），
 *    因此不会出现"日报对、月报错"；
 * ③ 重算返回的 `skippedFrozen` 必须显示出来：已冻结月份被整体跳过，
 *    不告诉用户的话他会以为整段都重算过了，而薪酬引用的仍是旧值。
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Alert, Button, DatePicker, Form, Modal, Select, Space, Table, TreeSelect, message } from 'antd'
import type { TableColumnsType } from 'antd'
import {
  CalculatorOutlined, ExportOutlined, FileSearchOutlined, ReloadOutlined, SearchOutlined,
  TeamOutlined, WarningOutlined,
} from '@ant-design/icons'
import dayjs, { type Dayjs } from 'dayjs'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import StatCards from '../../components/StatCards'
import { useColumnConfig } from '../../hooks/useColumnConfig'
import { useAuth } from '../../contexts/AuthContext'
import { useServerSort } from '../../hooks/useServerSort'
import {
  fetchDailyStats, fetchDailySummaries, isMonthFrozen, recalculateDaily, type DailyVO,
} from '../../api/attendance'
import { useAttendanceOptions } from './useAttendanceOptions'
import { exportToCSV } from '../../utils/exportCSV'
import '@/styles/components.css'
import OrgScopeNotice from '../../components/OrgScopeNotice'

/** 列 key → i18n key：列标题唯一来源，表格与列配置面板共用 */
const COL_KEY: Record<string, string> = {
  workDate: 'attendance.colWorkDate',
  deptName: 'attendance.colDept',
  groupName: 'attendance.colGroup',
  shouldCount: 'attendance.colShouldAttend',
  actualCount: 'attendance.colActualAttend',
  lateCount: 'attendance.exTypeLate',
  earlyCount: 'attendance.exTypeEarly',
  missingCount: 'attendance.exTypeMissing',
  absentCount: 'attendance.exTypeAbsent',
  leaveCount: 'attendance.colLeaveCount',
  overtimeHours: 'attendance.colOvertimeHours',
  attendRate: 'attendance.colAttendRate',
  calculatedAt: 'attendance.colCalculatedAt',
}

const { RangePicker } = DatePicker

interface FilterValues {
  range?: [Dayjs, Dayjs] | null
  deptId?: number
  groupId?: number
}

export default function AttendanceDailyReport() {
  const navigate = useNavigate()
  const { t } = useTranslation()
  const { hasPermission } = useAuth()
  // 重算属写操作，动作集由 attendance:menu:v1.1 补齐 edit 后才可授权
  const canRecalculate = hasPermission('attendance-daily:edit')
  const canExport = hasPermission('attendance-daily:export')
  const { groupOptions, deptTree } = useAttendanceOptions()

  const [form] = Form.useForm<FilterValues>()
  const [rows, setRows] = useState<DailyVO[]>([])
  const [total, setTotal] = useState(0)
  const [stats, setStats] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(false)
  const [loadFailed, setLoadFailed] = useState(false)
  const [filters, setFilters] = useState<FilterValues>({})
  const [pagination, setPagination] = useState({ page: 1, size: 20 })
  const { sort, applySorter } = useServerSort()
  const [selectedKeys, setSelectedKeys] = useState<React.Key[]>([])
  const [recalculating, setRecalculating] = useState(false)

  const queryParams = useCallback((values: FilterValues) => ({
    from: values.range?.[0]?.format('YYYY-MM-DD'),
    to: values.range?.[1]?.format('YYYY-MM-DD'),
    deptId: values.deptId,
    groupId: values.groupId,
  }), [])

  const statsKey = useMemo(() => JSON.stringify(queryParams(filters)), [filters, queryParams])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetchDailySummaries({ ...queryParams(filters), page: pagination.page, size: pagination.size, sortField: sort.field, sortOrder: sort.order })
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
    fetchDailyStats(queryParams(filters)).then(setStats).catch(() => setStats({}))
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
    setFilters({})
    setPagination(p => ({ ...p, page: 1 }))
    setSelectedKeys([])
  }

  /** 重算属于批量副作用：二次确认 + 明确区间 + 事先告知已冻结月份会被跳过 */
  const handleRecalculate = async () => {
    const values = form.getFieldsValue()
    const from = values.range?.[0] ?? dayjs().startOf('month')
    const to = values.range?.[1] ?? dayjs()
    const fromStr = from.format('YYYY-MM-DD')
    const toStr = to.format('YYYY-MM-DD')
    // 事先查一次冻结状态：等用户点完确认才告诉他"整段被跳过"太晚了
    const months = Array.from(new Set(
      Array.from({ length: to.diff(from, 'day') + 1 }, (_, i) => from.add(i, 'day').format('YYYY-MM')),
    ))
    const frozen = (await Promise.all(months.map(m => isMonthFrozen(m).catch(() => false))))
      .map((frozenFlag, index) => (frozenFlag ? months[index] : null))
      .filter((m): m is string => !!m)

    Modal.confirm({
      title: t('attendance.recalcConfirmTitle'),
      className: 'custom-confirm-modal',
      icon: <span className="confirm-icon-wrapper"><span className="confirm-icon-text">!</span></span>,
      okText: t('common.confirm'),
      cancelText: t('common.cancel'),
      content: (
        <div className="confirm-info-card">
          <div className="confirm-info-row">
            <span>{t('attendance.recalcRangeLabel')}</span><b>{fromStr} ~ {toStr}</b>
          </div>
          <div className="confirm-info-row">
            <span>{t('attendance.recalcScopeLabel')}</span>
            <b>{values.groupId
              ? (groupOptions.find(g => g.value === values.groupId)?.label ?? String(values.groupId))
              : t('attendance.recalcAllGroups')}</b>
          </div>
          <div className="confirm-info-row">
            <span>{t('attendance.recalcEffectLabel')}</span><b>{t('attendance.recalcEffect')}</b>
          </div>
          {frozen.length > 0 && (
            <div className="confirm-info-row">
              <span>{t('attendance.recalcFrozenLabel')}</span>
              <b>{t('attendance.recalcFrozenMonths', { months: frozen.join('、') })}</b>
            </div>
          )}
        </div>
      ),
      onOk: async () => {
        setRecalculating(true)
        try {
          const result = await recalculateDaily(fromStr, toStr, values.groupId)
          message.success(t('attendance.recalcResult', {
            days: result.recalculated ?? 0,
            skipped: result.skippedFrozen ?? 0,
            exceptions: result.exceptions ?? 0,
          }))
          refresh()
        } catch {
          // 请求层已统一提示（区间非法、超过 92 天上限等）
        } finally {
          setRecalculating(false)
        }
      },
    })
  }

  const handleExport = () => {
    const selected = selectedKeys.length > 0 ? rows.filter(r => selectedKeys.includes(r.id)) : rows
    if (selected.length === 0) {
      message.warning(t('common.noDataToExport'))
      return
    }
    exportToCSV(
      `${t('attendance.dailyTitle')}_${dayjs().format('YYYY-MM-DD')}`,
      [
        { title: t('attendance.colWorkDate'), dataIndex: 'workDate' },
        { title: t('attendance.colGroup'), dataIndex: 'groupName', render: v => v ?? '-' },
        { title: t('attendance.colDept'), dataIndex: 'deptName', render: v => v ?? '-' },
        { title: t('attendance.colShouldAttend'), dataIndex: 'shouldCount', render: v => String(v ?? 0) },
        { title: t('attendance.colActualAttend'), dataIndex: 'actualCount', render: v => String(v ?? 0) },
        { title: t('attendance.exTypeLate'), dataIndex: 'lateCount', render: v => String(v ?? 0) },
        { title: t('attendance.exTypeEarly'), dataIndex: 'earlyCount', render: v => String(v ?? 0) },
        { title: t('attendance.exTypeMissing'), dataIndex: 'missingCount', render: v => String(v ?? 0) },
        { title: t('attendance.exTypeAbsent'), dataIndex: 'absentCount', render: v => String(v ?? 0) },
        { title: t('attendance.colLeaveCount'), dataIndex: 'leaveCount', render: v => String(v ?? 0) },
        { title: t('attendance.colOvertimeHours'), dataIndex: 'overtimeHours', render: v => String(v ?? 0) },
        { title: t('attendance.colAttendRate'), dataIndex: 'attendRate', render: v => `${v ?? 0}%` },
        { title: t('attendance.colCalculatedAt'), dataIndex: 'calculatedAt', render: v => v ?? '-' },
      ],
      selected,
    )
    message.success(t('common.exportSuccess'))
  }

  const columns: TableColumnsType<DailyVO> = [
    { title: t(COL_KEY.workDate), dataIndex: 'workDate', key: 'workDate', width: 120, fixed: 'left', sorter: true },
    { title: t(COL_KEY.groupName), dataIndex: 'groupName', key: 'groupName', width: 200, ellipsis: true, render: (v?: string) => v || '-' },
    { title: t(COL_KEY.deptName), dataIndex: 'deptName', key: 'deptName', width: 150, ellipsis: true, render: (v?: string) => v || '-' },
    { title: t(COL_KEY.shouldCount), dataIndex: 'shouldCount', key: 'shouldCount', width: 90, align: 'right' },
    { title: t(COL_KEY.actualCount), dataIndex: 'actualCount', key: 'actualCount', width: 90, align: 'right' },
    { title: t(COL_KEY.lateCount), dataIndex: 'lateCount', key: 'lateCount', width: 80, align: 'right' },
    { title: t(COL_KEY.earlyCount), dataIndex: 'earlyCount', key: 'earlyCount', width: 80, align: 'right' },
    { title: t(COL_KEY.missingCount), dataIndex: 'missingCount', key: 'missingCount', width: 80, align: 'right' },
    { title: t(COL_KEY.absentCount), dataIndex: 'absentCount', key: 'absentCount', width: 80, align: 'right' },
    { title: t(COL_KEY.leaveCount), dataIndex: 'leaveCount', key: 'leaveCount', width: 80, align: 'right' },
    {
      title: t(COL_KEY.overtimeHours), dataIndex: 'overtimeHours', key: 'overtimeHours', width: 100, align: 'right',
      render: (v?: number) => `${v ?? 0} h`,
    },
    {
      title: t(COL_KEY.attendRate), dataIndex: 'attendRate', key: 'attendRate', width: 100, align: 'right', sorter: true,
      render: (v?: number) => `${v ?? 0}%`,
    },
    { title: t(COL_KEY.calculatedAt), dataIndex: 'calculatedAt', key: 'calculatedAt', width: 170, render: (v?: string) => v || '-' },
  ]

  const columnMeta = useMemo(
    () => Object.entries(COL_KEY).map(([key, i18nKey]) => ({ key, title: t(i18nKey) })),
    [t],
  )

  const { configComponent, applyConfig } = useColumnConfig('attendance-daily', columnMeta, [
    { key: 'workDate', visible: true, locked: 'head' as const },
  ])

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
      <OrgScopeNotice />
      <Alert type="info" showIcon message={t('attendance.dailyPageHint')} style={{ marginBottom: 16 }} />

      <div className="search-section">
        <Form form={form} layout="inline">
          <Form.Item label={t('attendance.colWorkDate')} name="range">
            <RangePicker style={{ width: 240 }} />
          </Form.Item>
          <Form.Item label={t('attendance.colDept')} name="deptId">
            <TreeSelect
              treeData={deptTree}
              allowClear
              showSearch
              treeNodeFilterProp="title"
              placeholder={t('common.all')}
              style={{ width: 180 }}
            />
          </Form.Item>
          <Form.Item label={t('attendance.colGroup')} name="groupId">
            <Select
              placeholder={t('common.all')}
              allowClear
              showSearch
              optionFilterProp="label"
              style={{ width: 200 }}
              options={groupOptions}
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
            { key: 'should', icon: <TeamOutlined />, color: 'info', value: stats.should ?? 0, label: t('attendance.statDailyShould') },
            { key: 'actual', icon: <FileSearchOutlined />, color: 'success', value: stats.actual ?? 0, label: t('attendance.statDailyActual') },
            { key: 'abnormal', icon: <WarningOutlined />, color: 'brand', value: stats.abnormal ?? 0, label: t('attendance.statDailyAbnormal') },
            { key: 'rate', icon: <CalculatorOutlined />, color: 'system', value: stats.rate ?? 0, label: t('attendance.statDailyRate'), suffix: '%', decimals: 1 },
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
            {canRecalculate && (
              <Button icon={<CalculatorOutlined />} loading={recalculating} onClick={handleRecalculate}>
                {t('attendance.recalcButton')}
              </Button>
            )}
          </Space>
        </div>
        <div className="action-section-right">
          {configComponent}
        </div>
      </div>

      <Table<DailyVO>
        rowKey="id"
        loading={loading}
        columns={applyConfig(columns)}
        dataSource={rows}
        rowSelection={{ selectedRowKeys: selectedKeys, onChange: setSelectedKeys }}
        scroll={{ x: 1560 }}
        size="middle"
        onRow={record => ({
          // 双击行下钻到当天该部门的打卡明细：日报是结论，明细才是解释
          onDoubleClick: () => navigate(`/attendance-punch?date=${record.workDate}`),
        })}
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
