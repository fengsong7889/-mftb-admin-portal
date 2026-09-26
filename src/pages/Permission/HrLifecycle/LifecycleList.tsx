import { useCallback, useEffect, useMemo, useState } from 'react'
import { Button, Form, Input, Modal, Space, Table, Tabs, Tag, message } from 'antd'
import type { TableColumnsType } from 'antd'
import { PlusOutlined, ReloadOutlined, SearchOutlined } from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import dayjs from 'dayjs'
import { useAuth } from '../../../contexts/AuthContext'
import { useColumnConfig } from '../../../hooks/useColumnConfig'
import {
  HR_LIFECYCLE_LIST_PATH,
  HR_LIFECYCLE_MENU_KEY,
  HR_LIFECYCLE_ROUTE,
  fetchLifecycleRequests,
  fetchLifecycleStats,
  deleteLifecycleRequest,
  type HrLifecycleItem,
  type HrLifecycleType,
} from '../../../api/hrLifecycle'
import { STATUS_LABEL_KEY, STATUS_TABS, STATUS_TAG_COLOR, EDITABLE_STATUSES, DIMISSION_TYPE_LABEL_KEY } from './meta'

interface Props {
  type: HrLifecycleType
}

/** 入转调离单据列表（状态 Tab + 搜索 + 表格，四类共用） */
export default function LifecycleList({ type }: Props) {
  const navigate = useNavigate()
  const { t } = useTranslation()
  const { hasPermission } = useAuth()
  const menuKey = HR_LIFECYCLE_MENU_KEY[type]
  const listPath = HR_LIFECYCLE_LIST_PATH[type]
  /** 表单/详情路由前缀（续签为 /hr-contract-renew） */
  const routeBase = HR_LIFECYCLE_ROUTE[type]
  const canCreate = hasPermission(`${menuKey}:create`)
  const canEdit = hasPermission(`${menuKey}:edit`)
  const canDelete = hasPermission(`${menuKey}:delete`)

  const [dataSource, setDataSource] = useState<HrLifecycleItem[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [page, setPage] = useState(1)
  const [size, setSize] = useState(10)
  const [status, setStatus] = useState<string>('all')
  const [keyword, setKeyword] = useState<string>()
  const [stats, setStats] = useState<Record<string, number>>({})
  const [searchForm] = Form.useForm<{ keyword?: string }>()

  /** 入职单列名差异化（候选人/计划入职日期，其余类型用员工/生效日期；续签显示新旧合同号） */
  const isOnboard = type === 'onboard'
  const isDimission = type === 'dimission'
  const isRenew = type === 'renew'

  const fetchList = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetchLifecycleRequests({
        page, size, type,
        status: status === 'all' ? undefined : status,
        keyword: keyword || undefined,
      })
      setDataSource(res.records || [])
      setTotal(res.total || 0)
    } catch {
      // 错误提示由请求层统一处理
    } finally {
      setLoading(false)
    }
  }, [page, size, type, status, keyword])

  const fetchStatsData = useCallback(async () => {
    try {
      setStats(await fetchLifecycleStats(type))
    } catch {
      // 徽标为增强信息，失败静默
    }
  }, [type])

  useEffect(() => {
    fetchList()
  }, [fetchList])

  useEffect(() => {
    fetchStatsData()
  }, [fetchStatsData])

  const handleSearch = () => {
    setKeyword(searchForm.getFieldValue('keyword')?.trim() || undefined)
    setPage(1)
  }

  const handleReset = () => {
    searchForm.resetFields()
    setKeyword(undefined)
    setPage(1)
  }

  const refresh = useCallback(() => {
    fetchList()
    fetchStatsData()
  }, [fetchList, fetchStatsData])

  const handleDelete = (record: HrLifecycleItem) => {
    Modal.confirm({
      title: t('hrLifecycle.confirmDeleteTitle'),
      content: (
        <div className="confirm-info-card">
          <div className="confirm-info-row"><span>{t('hrLifecycle.reqNo')}：</span><b>{record.reqNo}</b></div>
          <div className="confirm-info-row"><span>{t('hrLifecycle.empName')}：</span><b>{record.empName}</b></div>
        </div>
      ),
      okText: t('common.delete'),
      okButtonProps: { danger: true },
      cancelText: t('common.cancel'),
      onOk: async () => {
        await deleteLifecycleRequest(record.id)
        message.success(t('hrLifecycle.deleted'))
        refresh()
      },
    })
  }

  const baseColumns = useMemo<TableColumnsType<HrLifecycleItem>>(() => [
    { title: t('hrLifecycle.reqNo'), dataIndex: 'reqNo', key: 'reqNo', width: 150, fixed: 'left' },
    {
      title: isOnboard ? t('hrLifecycle.empName') : t('hrLifecycle.employee'), key: 'emp', width: 160,
      render: (_, r) => (
        <Space size={4}>
          <span>{r.empName}</span>
          {r.empNo && <span style={{ color: '#8C8C8C' }}>({r.empNo})</span>}
        </Space>
      ),
    },
    { title: t('hrLifecycle.dept'), dataIndex: 'deptName', key: 'deptName', width: 140, render: (v: string) => v || '-' },
    { title: t('hrLifecycle.position'), dataIndex: 'positionName', key: 'positionName', width: 140, render: (v: string) => v || '-' },
    ...(isRenew ? [{
      title: t('hrLifecycle.originContract'), dataIndex: 'contractNo', key: 'contractNo', width: 150,
      render: (v: string) => v || '-',
    }, {
      title: t('hrLifecycle.newContractNo'), dataIndex: 'newContractNo', key: 'newContractNo', width: 150,
      // 草稿阶段允许留空（后端按「原编号-R{n}」派生），不回退显示其它字段以免误导
      render: (v: string) => v || '-',
    }] : []),
    ...(isDimission ? [{
      title: t('hrLifecycle.dimissionType'), dataIndex: 'dimissionType', key: 'dimissionType', width: 110,
      render: (v: string) => (v && DIMISSION_TYPE_LABEL_KEY[v] ? t(DIMISSION_TYPE_LABEL_KEY[v]) : (v || '-')),
    }] : []),
    {
      title: isOnboard ? t('hrLifecycle.hireDate') : t('hrLifecycle.effectiveDate'),
      dataIndex: 'effectiveDate', key: 'effectiveDate', width: 130,
      render: (v: string) => (v ? dayjs(v).format('YYYY-MM-DD') : '-'),
    },
    {
      title: t('common.colStatus'), dataIndex: 'status', key: 'status', width: 100,
      render: (v: HrLifecycleItem['status']) => (
        <Tag color={STATUS_TAG_COLOR[v]}>{STATUS_LABEL_KEY[v] ? t(STATUS_LABEL_KEY[v]) : v}</Tag>
      ),
    },
    {
      title: t('hrLifecycle.flowNo'), dataIndex: 'flowNo', key: 'flowNo', width: 140,
      render: (v: string) => v || '-',
    },
    { title: t('common.colUpdater'), dataIndex: 'updatedBy', key: 'updatedBy', width: 120, render: (v: string) => v || '-' },
    {
      title: t('common.colUpdateTime'), dataIndex: 'updatedAt', key: 'updatedAt', width: 180,
      render: (v: string) => (v ? <span style={{ whiteSpace: 'nowrap' }}>{dayjs(v).format('YYYY-MM-DD HH:mm:ss')}</span> : '-'),
    },
    {
      title: t('common.colAction'), key: 'action', width: 190, fixed: 'right',
      render: (_, r) => {
        const editable = EDITABLE_STATUSES.includes(r.status)
        return (
          <Space size={0}>
            <Button type="link" size="small" onClick={() => navigate(`${routeBase}-detail?id=${r.id}`)}>
              {t('common.detail')}
            </Button>
            {canEdit && editable && (
              <>
                <span className="action-split">|</span>
                <Button type="link" size="small" onClick={() => navigate(`${routeBase}-form?id=${r.id}`)}>
                  {t('common.edit')}
                </Button>
              </>
            )}
            {canDelete && editable && (
              <>
                <span className="action-split">|</span>
                <Button type="link" size="small" className="ant-btn-dangerous" onClick={() => handleDelete(r)}>
                  {t('common.delete')}
                </Button>
              </>
            )}
          </Space>
        )
      },
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [t, type, page, status, keyword, canEdit, canDelete])

  const { configComponent, applyConfig } = useColumnConfig(menuKey, baseColumns.map(col => ({ key: String(col.key), title: String(col.title) })), [
    { key: 'action', visible: true, locked: 'tail' },
  ])

  const tabItems = STATUS_TABS.map(tab => ({
    key: tab.key,
    label: tab.key === 'all'
      ? `${t('hrLifecycle.statusAll')} (${stats.all ?? 0})`
      : `${STATUS_LABEL_KEY[tab.key as HrLifecycleItem['status']] ? t(STATUS_LABEL_KEY[tab.key as HrLifecycleItem['status']]) : tab.key} (${stats[tab.key] ?? 0})`,
  }))

  return (
    <div className="content-area">
      {/* 搜索区 */}
      <div className="search-section">
        <Form form={searchForm} layout="inline">
          <Form.Item label={t('hrLifecycle.keyword')} name="keyword">
            <Input placeholder={t('hrLifecycle.keywordPlaceholder')} allowClear onPressEnter={handleSearch} />
          </Form.Item>
          <Form.Item>
            <div className="search-actions">
              <Button type="primary" icon={<SearchOutlined />} onClick={handleSearch}>{t('common.search')}</Button>
              <Button icon={<ReloadOutlined />} onClick={handleReset}>{t('common.reset')}</Button>
            </div>
          </Form.Item>
        </Form>
      </div>

      {/* 操作区 */}
      <div className="action-section">
        <div className="action-section-left">
          {canCreate && (
            <Button type="primary" icon={<PlusOutlined />} onClick={() => navigate(`${routeBase}-form`)}>
              {isOnboard ? t('hrLifecycle.addOnboard') : t('hrLifecycle.addRequest')}
            </Button>
          )}
        </div>
        <div className="action-section-right">{configComponent}</div>
      </div>

      {/* 状态 Tab */}
      <Tabs
        activeKey={status}
        items={tabItems}
        onChange={key => { setStatus(key); setPage(1) }}
        style={{ marginBottom: 0 }}
      />

      <Table<HrLifecycleItem>
        className="nowrap-table"
        columns={applyConfig(baseColumns)}
        dataSource={dataSource}
        rowKey="id"
        loading={loading}
        scroll={{ x: 'max-content' }}
        pagination={{
          current: page,
          pageSize: size,
          total,
          showSizeChanger: true,
          showQuickJumper: true,
          showTotal: (count) => t('common.total', { count }),
          onChange: (p, s) => {
            setPage(s !== size ? 1 : p)
            setSize(s)
          },
        }}
      />
    </div>
  )
}
