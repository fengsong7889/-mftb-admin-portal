/**
 * 节假日日历 —— 列表页（假勤基础数据）
 *
 * 为什么单独成页而不是并进班次：节假日直接改变「应出勤」基数与加班倍率判定，
 * 属于按年度维护的日历数据，与按时间模式维护的班次是两类主数据。
 *
 * 数据口径：
 * - 列表与统计都走服务端，统计请求带当前 filters（§E.8：统计卡必须跟随筛选条件）；
 * - 停用与删除的后果不同，二次确认里必须分别讲清楚：停用只是让该日回归正常工时判定，
 *   删除会直接改变应出勤口径，因此历史月份一律建议停用而不是删除；
 * - 「導入年度日曆」目前只有说明不落地：按国务院历批量生成需要后端导入端点，
 *   没有端点却放一个能点的按钮，就是让用户以为导进去了。
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Alert, Button, Form, Input, Modal, Select, Space, Switch, Table, Tag, message } from 'antd'
import type { TableColumnsType } from 'antd'
import {
  CalendarOutlined, CheckCircleOutlined, ExportOutlined, FieldTimeOutlined, GiftOutlined,
  PlusOutlined, ReloadOutlined, SearchOutlined,
} from '@ant-design/icons'
import dayjs from 'dayjs'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import StatCards from '../../components/StatCards'
import { useColumnConfig } from '../../hooks/useColumnConfig'
import { useAuth } from '../../contexts/AuthContext'
import { useServerSort } from '../../hooks/useServerSort'
import {
  ENABLE_STATUS, HOLIDAY_TYPE, changeHolidayStatus, deleteHoliday, fetchHolidayStats, fetchHolidays,
  type HolidayVO,
} from '../../api/attendance'
import { HOLIDAY_TYPE_LABEL_KEY, HOLIDAY_TYPE_TAG_COLOR } from './meta'
import { exportToCSV } from '../../utils/exportCSV'
import '@/styles/components.css'

/** 列 key → i18n key：列标题唯一来源，表格与列配置面板共用 */
const COL_KEY: Record<string, string> = {
  holidayDate: 'attendance.holidayDate',
  weekday: 'attendance.holidayWeekday',
  holidayName: 'attendance.holidayName',
  holidayType: 'attendance.holidayType',
  status: 'common.colStatus',
  updatedBy: 'attendance.colLastUpdater',
  updatedAt: 'attendance.colLastUpdateTime',
  action: 'common.colAction',
}

/** 年度下拉：当前年 ±2，写死年份会让页面过期后无法维护历史与未来日历 */
const YEAR_OPTIONS = (() => {
  const current = dayjs().year()
  return [-2, -1, 0, 1, 2].map(offset => ({ value: current + offset, label: String(current + offset) }))
})()

interface FilterValues {
  yearNo?: number
  keyword?: string
  holidayType?: number
  status?: string
}

export default function AttendanceHolidayList() {
  const navigate = useNavigate()
  const { t } = useTranslation()
  const { hasPermission } = useAuth()
  const canCreate = hasPermission('attendance-holiday:create')
  const canEdit = hasPermission('attendance-holiday:edit')
  const canDelete = hasPermission('attendance-holiday:delete')
  const canExport = hasPermission('attendance-holiday:export')
  const canImport = hasPermission('attendance-holiday:import')

  const [form] = Form.useForm<FilterValues>()
  const [rows, setRows] = useState<HolidayVO[]>([])
  const [total, setTotal] = useState(0)
  const [stats, setStats] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(false)
  const [loadFailed, setLoadFailed] = useState(false)
  const [filters, setFilters] = useState<FilterValues>({ yearNo: dayjs().year() })
  const [pagination, setPagination] = useState({ page: 1, size: 20 })
  const { sort, applySorter } = useServerSort()
  const [selectedKeys, setSelectedKeys] = useState<React.Key[]>([])

  const statsKey = useMemo(
    () => `${filters.yearNo ?? 'all'}-${filters.keyword ?? ''}-${filters.holidayType ?? 'all'}-${filters.status ?? 'all'}`,
    [filters],
  )

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetchHolidays({ ...filters, page: pagination.page, size: pagination.size, sortField: sort.field, sortOrder: sort.order })
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
  }, [filters, pagination.page, pagination.size, sort.field, sort.order])

  const loadStats = useCallback(() => {
    fetchHolidayStats(filters).then(setStats).catch(() => setStats({}))
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
    form.setFieldValue('yearNo', dayjs().year())
    setFilters({ yearNo: dayjs().year() })
    setPagination(p => ({ ...p, page: 1 }))
    setSelectedKeys([])
  }

  const handleToggleStatus = (record: HolidayVO) => {
    const enabling = record.status !== ENABLE_STATUS.ENABLED
    const next = enabling ? ENABLE_STATUS.ENABLED : ENABLE_STATUS.DISABLED
    Modal.confirm({
      title: enabling
        ? t('attendance.enableConfirmTitle', { name: record.holidayName })
        : t('attendance.disableConfirmTitle', { name: record.holidayName }),
      className: 'custom-confirm-modal',
      icon: <span className="confirm-icon-wrapper"><span className="confirm-icon-text">!</span></span>,
      okText: t('common.confirm'),
      cancelText: t('common.cancel'),
      content: (
        <div className="confirm-info-card">
          <div className="confirm-info-row">
            <span>{t('attendance.holidayDate')}：</span><b>{record.holidayDate}</b>
          </div>
          <div className="confirm-info-row">
            <span>{t('attendance.impactLabel')}</span><b>{t('attendance.holidayDisableImpact')}</b>
          </div>
        </div>
      ),
      onOk: async () => {
        try {
          await changeHolidayStatus(record.id, next)
          message.success(enabling ? t('common.enableSuccess') : t('common.disableSuccess'))
          refresh()
        } catch {
          // 失败已由请求层 toast，吞掉异常以关闭确认框。
        }
      },
    })
  }

  const handleDelete = (record: HolidayVO) => {
    Modal.confirm({
      title: t('attendance.deleteConfirmTitle', { name: `${record.holidayDate} ${record.holidayName}` }),
      className: 'custom-confirm-modal',
      icon: <span className="confirm-icon-wrapper"><span className="confirm-icon-text">!</span></span>,
      okText: t('common.confirm'),
      cancelText: t('common.cancel'),
      okButtonProps: { danger: true },
      content: (
        <div className="confirm-info-card">
          <div className="confirm-info-row">
            <span>{t('attendance.riskLabel')}</span><b>{t('attendance.holidayDeleteWarn')}</b>
          </div>
        </div>
      ),
      onOk: async () => {
        try {
          await deleteHoliday(record.id)
          message.success(t('common.deleteSuccess'))
          refresh()
        } catch {
          // 失败已由请求层 toast，吞掉异常以关闭确认框。
        }
      },
    })
  }

  /** 星期按本地日期算：用 T00:00:00 避免被当成 UTC 而跨日 */
  const weekdayOf = (date: string) => t(`attendance.weekday${dayjs(`${date}T00:00:00`).day()}`)

  const handleExport = () => {
    const selected = selectedKeys.length > 0 ? rows.filter(r => selectedKeys.includes(r.id)) : rows
    if (selected.length === 0) {
      message.warning(t('common.noDataToExport'))
      return
    }
    exportToCSV(
      `${t('attendance.holidayTitle')}_${dayjs().format('YYYY-MM-DD')}`,
      [
        { title: t('attendance.holidayDate'), dataIndex: 'holidayDate' },
        { title: t('attendance.holidayWeekday'), dataIndex: 'holidayDate', render: v => weekdayOf(v) },
        { title: t('attendance.holidayName'), dataIndex: 'holidayName' },
        {
          title: t('attendance.holidayType'), dataIndex: 'holidayType',
          render: v => t(HOLIDAY_TYPE_LABEL_KEY[v as number] ?? 'common.underDev'),
        },
        {
          title: t('common.colStatus'), dataIndex: 'status',
          render: v => (v === ENABLE_STATUS.ENABLED ? t('attendance.statusEnabled') : t('attendance.statusDisabled')),
        },
        { title: t('attendance.colLastUpdater'), dataIndex: 'updatedBy', render: v => v ?? '-' },
        { title: t('attendance.colLastUpdateTime'), dataIndex: 'updatedAt', render: v => v ?? '-' },
      ],
      selected,
    )
    message.success(t('common.exportSuccess'))
  }

  const columns: TableColumnsType<HolidayVO> = [
    { title: t(COL_KEY.holidayDate), dataIndex: 'holidayDate', key: 'holidayDate', width: 140, sorter: true },
    {
      title: t(COL_KEY.weekday), key: 'weekday', width: 90, align: 'center',
      render: (_, record) => weekdayOf(record.holidayDate),
    },
    { title: t(COL_KEY.holidayName), dataIndex: 'holidayName', key: 'holidayName', width: 200, ellipsis: true },
    {
      title: t(COL_KEY.holidayType), dataIndex: 'holidayType', key: 'holidayType', width: 140,
      render: (v: number) => {
        const key = HOLIDAY_TYPE_LABEL_KEY[v]
        // 未知码值显示原始数字：后端新增类型而前端未跟上时能当场发现，比空白更容易排查
        return <Tag color={HOLIDAY_TYPE_TAG_COLOR[v] ?? 'default'}>{key ? t(key) : v}</Tag>
      },
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
    { title: t(COL_KEY.updatedAt), dataIndex: 'updatedAt', key: 'updatedAt', width: 170, sorter: true, render: (v?: string) => v || '-' },
    {
      title: t(COL_KEY.action), key: 'action', width: 160, fixed: 'right',
      render: (_, record) => (
        <Space size={0} split={<span className="action-split">|</span>}>
          <Button type="link" size="small" onClick={() => navigate(`/attendance-holiday-detail?id=${record.id}`)}>
            {t('common.detail')}
          </Button>
          {canEdit && (
            <Button type="link" size="small" onClick={() => navigate(`/attendance-holiday-form?id=${record.id}`)}>
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

  const { configComponent, applyConfig } = useColumnConfig('attendance-holiday', columnMeta, [
    { key: 'holidayDate', visible: true, locked: 'head' as const },
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
        <Form form={form} layout="inline" initialValues={{ yearNo: dayjs().year() }}>
          <Form.Item label={t('attendance.holidayYear')} name="yearNo">
            <Select style={{ width: 120 }} options={YEAR_OPTIONS} />
          </Form.Item>
          <Form.Item label={t('attendance.holidayName')} name="keyword">
            <Input placeholder={t('attendance.holidaySearchPlaceholder')} style={{ width: 200 }} allowClear />
          </Form.Item>
          <Form.Item label={t('attendance.holidayType')} name="holidayType">
            <Select
              placeholder={t('common.all')}
              allowClear
              style={{ width: 150 }}
              options={[
                { value: HOLIDAY_TYPE.LEGAL, label: t(HOLIDAY_TYPE_LABEL_KEY[HOLIDAY_TYPE.LEGAL]) },
                { value: HOLIDAY_TYPE.SWAP_WORKDAY, label: t(HOLIDAY_TYPE_LABEL_KEY[HOLIDAY_TYPE.SWAP_WORKDAY]) },
                { value: HOLIDAY_TYPE.COMPANY, label: t(HOLIDAY_TYPE_LABEL_KEY[HOLIDAY_TYPE.COMPANY]) },
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
            { key: 'total', icon: <CalendarOutlined />, color: 'info', value: stats.total ?? 0, label: t('attendance.statHolidayTotal') },
            { key: 'legal', icon: <CheckCircleOutlined />, color: 'brand', value: stats.legal ?? 0, label: t('attendance.statHolidayLegal') },
            { key: 'swap', icon: <FieldTimeOutlined />, color: 'system', value: stats.swap ?? 0, label: t('attendance.statHolidaySwap') },
            { key: 'company', icon: <GiftOutlined />, color: 'success', value: stats.company ?? 0, label: t('attendance.statHolidayCompany') },
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
            {canImport && (
              <Button
                className="btn-import"
                icon={<PlusOutlined />}
                onClick={() => Modal.info({
                  title: t('attendance.holidayImportYear'),
                  content: t('attendance.holidayImportHint'),
                  className: 'custom-confirm-modal',
                })}
              >
                {t('attendance.holidayImportYear')}
              </Button>
            )}
          </Space>
        </div>
        <div className="action-section-right">
          {canCreate && (
            <Button type="primary" icon={<PlusOutlined />} onClick={() => navigate('/attendance-holiday-form')}>
              {t('attendance.holidayAdd')}
            </Button>
          )}
          {configComponent}
        </div>
      </div>

      <Table<HolidayVO>
        rowKey="id"
        loading={loading}
        columns={applyConfig(columns)}
        dataSource={rows}
        rowSelection={{ selectedRowKeys: selectedKeys, onChange: setSelectedKeys }}
        scroll={{ x: 1240 }}
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
