/**
 * 班次管理 —— 列表页（假勤基础数据）
 *
 * 班次是排班与考勤判定的时间基准：停用不影响历史排班，但会阻止新排班引用，
 * 因此停用时必须在二次确认里把「历史不受影响 / 后续不可选取」两段后果都写清楚，
 * 不能只问「是否停用」。
 *
 * 数据口径：
 * - 列表与统计都走服务端（`/attendance/shifts` + `/attendance/shifts/stats`），
 *   分页后前端只有当页数据，自己求和会得到错误的「标准工时合计」；
 * - 统计请求必须带当前 filters，否则用户改完条件会先看到未过滤的全量数字（§E.8 门禁）；
 * - 不提供 mock 降级：班次是判定真值，拿假班次让用户排班，落库就是脏数据。
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Alert, Button, Form, Input, Modal, Select, Space, Switch, Table, Tag, message } from 'antd'
import type { TableColumnsType } from 'antd'
import {
  CheckCircleOutlined, ClockCircleOutlined, ExportOutlined, PlusOutlined, ReloadOutlined,
  ScheduleOutlined, SearchOutlined, ThunderboltOutlined,
} from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import StatCards from '../../components/StatCards'
import { useColumnConfig } from '../../hooks/useColumnConfig'
import { useAuth } from '../../contexts/AuthContext'
import {
  ENABLE_STATUS, changeShiftStatus, deleteShift, fetchShiftStats, fetchShifts, type ShiftVO,
} from '../../api/attendance'
import { exportToCSV } from '../../utils/exportCSV'
import '@/styles/components.css'

/** 列 key → i18n key：列标题唯一来源，表格与列配置面板共用 */
const COL_KEY: Record<string, string> = {
  shiftCode: 'attendance.shiftCode',
  shiftName: 'attendance.shiftName',
  onTime: 'attendance.shiftOnTime',
  offTime: 'attendance.shiftOffTime',
  workHours: 'attendance.shiftWorkHours',
  restText: 'attendance.colRestPeriod',
  flexFlag: 'attendance.shiftFlexType',
  status: 'common.colStatus',
  updatedBy: 'attendance.colLastUpdater',
  updatedAt: 'attendance.colLastUpdateTime',
  action: 'common.colAction',
}

interface FilterValues {
  keyword?: string
  /** 后端按 flexFlag（0/1）过滤，这里直接存码值而不是布尔，避免多一层转换 */
  flexFlag?: number
  status?: string
}

export default function AttendanceShiftList() {
  const navigate = useNavigate()
  const { t } = useTranslation()
  const { hasPermission } = useAuth()
  const canCreate = hasPermission('attendance-shift:create')
  const canEdit = hasPermission('attendance-shift:edit')
  const canDelete = hasPermission('attendance-shift:delete')
  const canExport = hasPermission('attendance-shift:export')

  const [form] = Form.useForm<FilterValues>()
  const [rows, setRows] = useState<ShiftVO[]>([])
  const [total, setTotal] = useState(0)
  const [stats, setStats] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(false)
  const [loadFailed, setLoadFailed] = useState(false)
  const [filters, setFilters] = useState<FilterValues>({})
  const [pagination, setPagination] = useState({ page: 1, size: 20 })
  const [selectedKeys, setSelectedKeys] = useState<React.Key[]>([])

  /** 统计口径快照：作为 StatCards 的 animationKey，条件变了才重跑计数动画 */
  const statsKey = useMemo(
    () => `${filters.keyword ?? ''}-${filters.flexFlag ?? 'all'}-${filters.status ?? 'all'}`,
    [filters],
  )

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetchShifts({ ...filters, page: pagination.page, size: pagination.size })
      setRows(res.records ?? [])
      setTotal(res.total ?? 0)
      setLoadFailed(false)
    } catch {
      // 请求层已统一提示；这里只负责把页面切到"加载失败"态，不能静默显示空表
      setLoadFailed(true)
      setRows([])
      setTotal(0)
    } finally {
      setLoading(false)
    }
  }, [filters, pagination.page, pagination.size])

  const loadStats = useCallback(() => {
    // 统计卡必须跟随筛选条件，禁止单独发一次不带条件的请求
    fetchShiftStats(filters).then(setStats).catch(() => setStats({}))
  }, [filters])

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

  const handleToggleStatus = (record: ShiftVO) => {
    const enabling = record.status !== ENABLE_STATUS.ENABLED
    const next = enabling ? ENABLE_STATUS.ENABLED : ENABLE_STATUS.DISABLED
    Modal.confirm({
      title: enabling
        ? t('attendance.enableConfirmTitle', { name: record.shiftName })
        : t('attendance.disableConfirmTitle', { name: record.shiftName }),
      className: 'custom-confirm-modal',
      icon: <span className="confirm-icon-wrapper"><span className="confirm-icon-text">!</span></span>,
      okText: t('common.confirm'),
      cancelText: t('common.cancel'),
      content: (
        <div className="confirm-info-card">
          <div className="confirm-info-row"><span>{t('attendance.shiftCode')}：</span><b>{record.shiftCode}</b></div>
          <div className="confirm-info-row">
            <span>{t('attendance.impactLabel')}</span><b>{t('attendance.shiftDisableImpact')}</b>
          </div>
        </div>
      ),
      onOk: async () => {
        await changeShiftStatus(record.id, next)
        message.success(enabling ? t('common.enableSuccess') : t('common.disableSuccess'))
        refresh()
      },
    })
  }

  const handleDelete = (record: ShiftVO) => {
    Modal.confirm({
      title: t('attendance.deleteConfirmTitle', { name: `${record.shiftCode} ${record.shiftName}` }),
      className: 'custom-confirm-modal',
      icon: <span className="confirm-icon-wrapper"><span className="confirm-icon-text">!</span></span>,
      okText: t('common.confirm'),
      cancelText: t('common.cancel'),
      okButtonProps: { danger: true },
      content: (
        <div className="confirm-info-card">
          <div className="confirm-info-row">
            <span>{t('attendance.riskLabel')}</span><b>{t('attendance.shiftDeleteBlocked')}</b>
          </div>
        </div>
      ),
      onOk: async () => {
        await deleteShift(record.id)
        message.success(t('common.deleteSuccess'))
        refresh()
      },
    })
  }

  /** 休息时段由起止时刻拼出：后端存两列，界面读一段 */
  const restText = (r: ShiftVO) => (r.restStart && r.restEnd ? `${r.restStart}-${r.restEnd}` : '-')

  /** 导出选中行；未选中时导出当前页并在提示里说明，避免用户以为导出了全部 */
  const handleExport = () => {
    const selected = selectedKeys.length > 0 ? rows.filter(r => selectedKeys.includes(r.id)) : rows
    if (selected.length === 0) {
      message.warning(t('common.noDataToExport'))
      return
    }
    exportToCSV(
      `${t('attendance.shiftTitle')}_${new Date().toISOString().slice(0, 10)}`,
      [
        { title: t('attendance.shiftCode'), dataIndex: 'shiftCode' },
        { title: t('attendance.shiftName'), dataIndex: 'shiftName' },
        { title: t('attendance.shiftOnTime'), dataIndex: 'onTime', render: v => v ?? '-' },
        { title: t('attendance.shiftOffTime'), dataIndex: 'offTime', render: v => v ?? '-' },
        { title: t('attendance.shiftWorkHours'), dataIndex: 'workHours', render: v => (v == null ? '-' : String(v)) },
        { title: t('attendance.colRestPeriod'), dataIndex: 'restText' },
        {
          title: t('attendance.shiftFlexType'), dataIndex: 'flexFlag',
          render: v => (v === 1 ? t('attendance.shiftFlexElastic') : t('attendance.shiftFlexFixed')),
        },
        {
          title: t('common.colStatus'), dataIndex: 'status',
          render: v => (v === ENABLE_STATUS.ENABLED ? t('attendance.statusEnabled') : t('attendance.statusDisabled')),
        },
        { title: t('attendance.colLastUpdater'), dataIndex: 'updatedBy', render: v => v ?? '-' },
        { title: t('attendance.colLastUpdateTime'), dataIndex: 'updatedAt', render: v => v ?? '-' },
      ],
      selected.map(r => ({ ...r, restText: restText(r) })),
    )
    message.success(t('common.exportSuccess'))
  }

  const columns: TableColumnsType<ShiftVO> = [
    { title: t(COL_KEY.shiftCode), dataIndex: 'shiftCode', key: 'shiftCode', width: 120 },
    { title: t(COL_KEY.shiftName), dataIndex: 'shiftName', key: 'shiftName', width: 220, ellipsis: true },
    { title: t(COL_KEY.onTime), dataIndex: 'onTime', key: 'onTime', width: 110, align: 'center', render: (v?: string) => v || '-' },
    { title: t(COL_KEY.offTime), dataIndex: 'offTime', key: 'offTime', width: 110, align: 'center', render: (v?: string) => v || '-' },
    {
      title: t(COL_KEY.workHours), dataIndex: 'workHours', key: 'workHours', width: 110, align: 'right',
      render: (v?: number) => (v == null ? '-' : `${v} h`),
    },
    { title: t(COL_KEY.restText), key: 'restText', width: 140, align: 'center', render: (_, r) => restText(r) },
    {
      title: t(COL_KEY.flexFlag), dataIndex: 'flexFlag', key: 'flexFlag', width: 100, align: 'center',
      render: (v?: number) => (v === 1
        ? <Tag color="purple">{t('attendance.shiftFlexElastic')}</Tag>
        : <Tag>{t('attendance.shiftFlexFixed')}</Tag>),
    },
    {
      title: t(COL_KEY.status), dataIndex: 'status', key: 'status', width: 120,
      render: (v: string, record) => (
        <Switch
          checked={v === ENABLE_STATUS.ENABLED}
          checkedChildren={t('attendance.enableAction')}
          unCheckedChildren={t('attendance.disableAction')}
          disabled={!canEdit}
          onChange={() => handleToggleStatus(record)}
        />
      ),
    },
    { title: t(COL_KEY.updatedBy), dataIndex: 'updatedBy', key: 'updatedBy', width: 120, render: (v?: string) => v || '-' },
    { title: t(COL_KEY.updatedAt), dataIndex: 'updatedAt', key: 'updatedAt', width: 170, render: (v?: string) => v || '-' },
    {
      title: t(COL_KEY.action), key: 'action', width: 160, fixed: 'right',
      render: (_, record) => (
        <Space size={0} split={<span className="action-split">|</span>}>
          <Button type="link" size="small" onClick={() => navigate(`/attendance-shift-detail?id=${record.id}`)}>
            {t('common.detail')}
          </Button>
          {canEdit && (
            <Button type="link" size="small" onClick={() => navigate(`/attendance-shift-form?id=${record.id}`)}>
              {t('common.edit')}
            </Button>
          )}
          {canDelete && (
            <Button type="link" size="small" danger onClick={() => handleDelete(record)}>
              {t('common.delete')}
            </Button>
          )}
        </Space>
      ),
    },
  ]

  const columnMeta = useMemo(
    () => Object.entries(COL_KEY).map(([key, i18nKey]) => ({ key, title: t(i18nKey) })),
    [t],
  )

  const { configComponent, applyConfig } = useColumnConfig('attendance-shift', columnMeta, [
    { key: 'shiftCode', visible: true, locked: 'head' as const },
    { key: 'action', visible: true, locked: 'tail' as const },
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

      <div className="search-section">
        <Form form={form} layout="inline">
          <Form.Item label={t('attendance.keywordLabel')} name="keyword">
            <Input placeholder={t('attendance.shiftSearchPlaceholder')} style={{ width: 220 }} allowClear />
          </Form.Item>
          <Form.Item label={t('attendance.shiftFlexType')} name="flexFlag">
            <Select
              placeholder={t('common.all')}
              allowClear
              style={{ width: 140 }}
              options={[
                { value: 0, label: t('attendance.shiftFlexFixed') },
                { value: 1, label: t('attendance.shiftFlexElastic') },
              ]}
            />
          </Form.Item>
          <Form.Item label={t('common.colStatus')} name="status">
            <Select
              placeholder={t('common.all')}
              allowClear
              style={{ width: 120 }}
              options={[
                { value: ENABLE_STATUS.ENABLED, label: t('attendance.enableAction') },
                { value: ENABLE_STATUS.DISABLED, label: t('attendance.disableAction') },
              ]}
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
            { key: 'total', icon: <ScheduleOutlined />, color: 'info', value: stats.total ?? 0, label: t('attendance.statShiftTotal') },
            { key: 'enabled', icon: <CheckCircleOutlined />, color: 'success', value: stats.enabled ?? 0, label: t('attendance.statShiftEnabled') },
            { key: 'flex', icon: <ThunderboltOutlined />, color: 'system', value: stats.flex ?? 0, label: t('attendance.statShiftFlex') },
            { key: 'hours', icon: <ClockCircleOutlined />, color: 'brand', value: stats.hours ?? 0, label: t('attendance.statShiftHours'), decimals: 1 },
          ]}
        />
      </div>

      <div className="action-section">
        <div className="action-section-left">
          {canExport && (
            <Button className="btn-export" icon={<ExportOutlined />} onClick={handleExport}>
              {t('common.export')}
            </Button>
          )}
        </div>
        <div className="action-section-right">
          {canCreate && (
            <Button type="primary" icon={<PlusOutlined />} onClick={() => navigate('/attendance-shift-form')}>
              {t('attendance.shiftAdd')}
            </Button>
          )}
          {configComponent}
        </div>
      </div>

      <Table<ShiftVO>
        rowKey="id"
        loading={loading}
        columns={applyConfig(columns)}
        dataSource={rows}
        rowSelection={{ selectedRowKeys: selectedKeys, onChange: setSelectedKeys }}
        scroll={{ x: 1560 }}
        size="middle"
        pagination={{
          current: pagination.page,
          pageSize: pagination.size,
          total,
          showSizeChanger: true,
          showQuickJumper: true,
          pageSizeOptions: ['10', '20', '50', '100'],
          showTotal: (count) => t('common.totalRecords', { count }),
          onChange: (page, size) => setPagination({ page: size !== pagination.size ? 1 : page, size: size || 20 }),
        }}
      />
    </div>
  )
}
