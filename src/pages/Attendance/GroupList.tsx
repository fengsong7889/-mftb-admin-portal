/**
 * 考勤组与规则 —— 列表页
 *
 * 考勤组是考勤结论的最小计算单位（成员范围 + 考勤地 + 班次 + 宽限 + 数据来源），
 * 不挂在部门树上：多门店场景若靠部门树推导"员工当天算哪个考勤地"，月度汇总口径必然漂移。
 *
 * 数据口径：
 * - 列表与统计都走服务端，统计请求带当前 filters（§E.8）；覆盖人数只算「当前生效」成员；
 * - 新增/编辑/详情用独立页面，禁止弹窗（规范 §9.1）；
 * - 停用与删除的后果不同，二次确认分别说明：停用只影响当日起的结论，
 *   删除对已有打卡历史的组不可逆（后端存在成员或排班时会直接拒绝）。
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Alert, Button, Form, Input, Modal, Select, Space, Switch, Table, Tag, message } from 'antd'
import type { TableColumnsType } from 'antd'
import {
  ApartmentOutlined, CheckCircleOutlined, ExportOutlined, PlusOutlined, ReloadOutlined,
  SearchOutlined, TeamOutlined, WarningOutlined,
} from '@ant-design/icons'
import dayjs from 'dayjs'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import StatCards from '../../components/StatCards'
import { useColumnConfig } from '../../hooks/useColumnConfig'
import { useAuth } from '../../contexts/AuthContext'
import { useServerSort } from '../../hooks/useServerSort'
import {
  ENABLE_STATUS, GROUP_TYPE, changeGroupStatus, deleteGroup, fetchGroupStats, fetchGroups,
  type GroupVO,
} from '../../api/attendance'
import { GROUP_TYPE_LABEL_KEY, PUNCH_SOURCE_LABEL_KEY } from './meta'
import { exportToCSV } from '../../utils/exportCSV'
import '@/styles/components.css'

/** 列 key → i18n key：列标题唯一来源，表格与列配置面板共用 */
const COL_KEY: Record<string, string> = {
  groupNo: 'attendance.groupNo',
  groupName: 'attendance.groupName',
  groupType: 'attendance.groupType',
  scopeText: 'attendance.scopeText',
  memberCount: 'attendance.memberCount',
  shiftName: 'attendance.relatedShift',
  workPlace: 'attendance.workPlace',
  sources: 'attendance.colSources',
  grace: 'attendance.colGrace',
  status: 'common.colStatus',
  updatedBy: 'attendance.colLastUpdater',
  updatedAt: 'attendance.colLastUpdateTime',
  action: 'common.colAction',
}

const TYPE_TAG_COLOR: Record<number, string> = {
  [GROUP_TYPE.FIXED]: 'blue',
  [GROUP_TYPE.ROTATION]: 'orange',
  [GROUP_TYPE.FLEX]: 'purple',
}

interface FilterValues {
  keyword?: string
  groupType?: number
  status?: string
}

export default function AttendanceGroupList() {
  const navigate = useNavigate()
  const { t } = useTranslation()
  const { hasPermission } = useAuth()
  const canCreate = hasPermission('attendance-group:create')
  const canEdit = hasPermission('attendance-group:edit')
  const canDelete = hasPermission('attendance-group:delete')
  const canExport = hasPermission('attendance-group:export')

  const [form] = Form.useForm<FilterValues>()
  const [rows, setRows] = useState<GroupVO[]>([])
  const [total, setTotal] = useState(0)
  const [stats, setStats] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(false)
  const [loadFailed, setLoadFailed] = useState(false)
  const [filters, setFilters] = useState<FilterValues>({})
  const [pagination, setPagination] = useState({ page: 1, size: 20 })
  const { sort, applySorter } = useServerSort()
  const [selectedKeys, setSelectedKeys] = useState<React.Key[]>([])

  const statsKey = useMemo(
    () => `${filters.keyword ?? ''}-${filters.groupType ?? 'all'}-${filters.status ?? 'all'}`,
    [filters],
  )

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetchGroups({ ...filters, page: pagination.page, size: pagination.size, sortField: sort.field, sortOrder: sort.order })
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
    fetchGroupStats(filters).then(setStats).catch(() => setStats({}))
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

  /** 来源码 → 文案；未知码值原样显示，便于发现后端新增了前端没跟上的来源 */
  const sourcesText = (sources?: number[] | null) => (sources?.length
    ? sources.map(code => {
      const key = PUNCH_SOURCE_LABEL_KEY[code]
      return key ? t(key) : String(code)
    }).join(' / ')
    : '-')

  const graceText = (r: GroupVO) => `${r.lateGraceMin ?? 0} ${t('attendance.unitMinute')} / ${r.earlyGraceMin ?? 0} ${t('attendance.unitMinute')}`

  const handleToggleStatus = (record: GroupVO) => {
    const enabling = record.status !== ENABLE_STATUS.ENABLED
    const next = enabling ? ENABLE_STATUS.ENABLED : ENABLE_STATUS.DISABLED
    Modal.confirm({
      title: enabling
        ? t('attendance.enableConfirmTitle', { name: record.groupName })
        : t('attendance.disableConfirmTitle', { name: record.groupName }),
      className: 'custom-confirm-modal',
      icon: <span className="confirm-icon-wrapper"><span className="confirm-icon-text">!</span></span>,
      okText: t('common.confirm'),
      cancelText: t('common.cancel'),
      content: (
        <div className="confirm-info-card">
          <div className="confirm-info-row">
            <span>{t('attendance.memberCount')}：</span>
            <b>{record.memberCount ?? 0} {t('attendance.unitPerson')}</b>
          </div>
          <div className="confirm-info-row">
            <span>{t('attendance.impactLabel')}</span><b>{t('attendance.groupDisableImpact')}</b>
          </div>
        </div>
      ),
      onOk: async () => {
        try {
          await changeGroupStatus(record.id, next)
          message.success(enabling ? t('common.enableSuccess') : t('common.disableSuccess'))
          refresh()
        } catch {
          // 失败已由请求层 toast，吞掉异常以关闭确认框（缺陷 M2）。
        }
      },
    })
  }

  const handleDelete = (record: GroupVO) => {
    Modal.confirm({
      title: t('attendance.deleteConfirmTitle', { name: record.groupName }),
      className: 'custom-confirm-modal',
      icon: <span className="confirm-icon-wrapper"><span className="confirm-icon-text">!</span></span>,
      okText: t('common.confirm'),
      cancelText: t('common.cancel'),
      okButtonProps: { danger: true },
      content: (
        <div className="confirm-info-card">
          <div className="confirm-info-row">
            <span>{t('attendance.riskLabel')}</span><b>{t('attendance.groupDeleteWarn')}</b>
          </div>
        </div>
      ),
      onOk: async () => {
        try {
          await deleteGroup(record.id)
          message.success(t('common.deleteSuccess'))
          refresh()
        } catch {
          // 有成员/排班时后端拒绝（改用停用）：请求层已提示，吞掉异常以关闭弹窗（缺陷 M2）。
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
      `${t('attendance.groupTitle')}_${dayjs().format('YYYY-MM-DD')}`,
      [
        { title: t('attendance.groupNo'), dataIndex: 'groupNo' },
        { title: t('attendance.groupName'), dataIndex: 'groupName' },
        {
          title: t('attendance.groupType'), dataIndex: 'groupType',
          render: v => t(GROUP_TYPE_LABEL_KEY[v as number] ?? 'common.underDev'),
        },
        { title: t('attendance.scopeText'), dataIndex: 'scopeText', render: v => v ?? '-' },
        { title: t('attendance.memberCount'), dataIndex: 'memberCount', render: v => String(v ?? 0) },
        { title: t('attendance.relatedShift'), dataIndex: 'shiftName', render: v => v ?? '-' },
        { title: t('attendance.workPlace'), dataIndex: 'workPlace', render: v => v ?? '-' },
        { title: t('attendance.colSources'), dataIndex: 'sourcesText' },
        { title: t('attendance.colGrace'), dataIndex: 'graceText' },
        {
          title: t('common.colStatus'), dataIndex: 'status',
          render: v => (v === ENABLE_STATUS.ENABLED ? t('attendance.statusEnabled') : t('attendance.statusDisabled')),
        },
        { title: t('attendance.colLastUpdater'), dataIndex: 'updatedBy', render: v => v ?? '-' },
        { title: t('attendance.colLastUpdateTime'), dataIndex: 'updatedAt', render: v => v ?? '-' },
      ],
      selected.map(r => ({ ...r, sourcesText: sourcesText(r.sources), graceText: graceText(r) })),
    )
    message.success(t('common.exportSuccess'))
  }

  const columns: TableColumnsType<GroupVO> = [
    { title: t(COL_KEY.groupNo), dataIndex: 'groupNo', key: 'groupNo', width: 150, sorter: true },
    { title: t(COL_KEY.groupName), dataIndex: 'groupName', key: 'groupName', width: 200, ellipsis: true, sorter: true },
    {
      title: t(COL_KEY.groupType), dataIndex: 'groupType', key: 'groupType', width: 110,
      render: (v: number) => {
        const key = GROUP_TYPE_LABEL_KEY[v]
        return <Tag color={TYPE_TAG_COLOR[v] ?? 'default'}>{key ? t(key) : v}</Tag>
      },
    },
    { title: t(COL_KEY.scopeText), dataIndex: 'scopeText', key: 'scopeText', width: 240, ellipsis: true, render: (v?: string) => v || '-' },
    {
      title: t(COL_KEY.memberCount), dataIndex: 'memberCount', key: 'memberCount', width: 100, align: 'right',
      render: (v?: number) => `${v ?? 0} ${t('attendance.unitPerson')}`,
    },
    { title: t(COL_KEY.shiftName), dataIndex: 'shiftName', key: 'shiftName', width: 200, ellipsis: true, render: (v?: string) => v || '-' },
    { title: t(COL_KEY.workPlace), dataIndex: 'workPlace', key: 'workPlace', width: 180, ellipsis: true, render: (v?: string) => v || '-' },
    { title: t(COL_KEY.sources), dataIndex: 'sources', key: 'sources', width: 180, render: (v?: number[]) => sourcesText(v) },
    { title: t(COL_KEY.grace), key: 'grace', width: 150, align: 'center', render: (_, r) => graceText(r) },
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
      title: t(COL_KEY.action), key: 'action', width: 150, fixed: 'right',
      render: (_, record) => (
        <Space size={0} split={<span className="action-split">|</span>}>
          <Button type="link" size="small" onClick={() => navigate(`/attendance-group-detail?id=${record.id}`)}>
            {t('common.detail')}
          </Button>
          {canEdit && (
            <Button type="link" size="small" onClick={() => navigate(`/attendance-group-form?id=${record.id}`)}>
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

  const { configComponent, applyConfig } = useColumnConfig('attendance-group', columnMeta, [
    { key: 'groupNo', visible: true, locked: 'head' as const },
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
            <Input placeholder={t('attendance.groupSearchPlaceholder')} style={{ width: 240 }} allowClear />
          </Form.Item>
          <Form.Item label={t('attendance.groupType')} name="groupType">
            <Select
              placeholder={t('common.all')}
              allowClear
              style={{ width: 140 }}
              options={[GROUP_TYPE.FIXED, GROUP_TYPE.ROTATION, GROUP_TYPE.FLEX].map(code => ({
                value: code,
                label: t(GROUP_TYPE_LABEL_KEY[code]),
              }))}
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
            { key: 'total', icon: <ApartmentOutlined />, color: 'info', value: stats.total ?? 0, label: t('attendance.statGroupTotal') },
            { key: 'enabled', icon: <CheckCircleOutlined />, color: 'success', value: stats.enabled ?? 0, label: t('attendance.statGroupEnabled') },
            { key: 'members', icon: <TeamOutlined />, color: 'brand', value: stats.members ?? 0, label: t('attendance.statGroupMembers') },
            { key: 'noShift', icon: <WarningOutlined />, color: 'system', value: stats.noShift ?? 0, label: t('attendance.statGroupNoShift') },
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
            <Button type="primary" icon={<PlusOutlined />} onClick={() => navigate('/attendance-group-form')}>
              {t('attendance.groupAdd')}
            </Button>
          )}
          {configComponent}
        </div>
      </div>

      <Table<GroupVO>
        rowKey="id"
        loading={loading}
        columns={applyConfig(columns)}
        dataSource={rows}
        rowSelection={{ selectedRowKeys: selectedKeys, onChange: setSelectedKeys }}
        scroll={{ x: 1900 }}
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
