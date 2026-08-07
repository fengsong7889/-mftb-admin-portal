import { useState, useMemo, useEffect, useCallback } from 'react'
import { Button, Space, Input, Select, Table, Tag, Form, message, Modal } from 'antd'
import type { TableColumnsType } from 'antd'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  SearchOutlined,
  ReloadOutlined,
  MergeCellsOutlined,
  ExportOutlined,
} from '@ant-design/icons'
import { useColumnConfig } from '../../hooks/useColumnConfig'
import BrandTag from '../../components/BrandTag'
import { useAuth } from '../../contexts/AuthContext'
import { BRAND_OPTIONS_WITH_ALL as brandOptions } from '../../constants/brand'
import {
  fetchFinAccounts,
  freezeFinAccount,
  unfreezeFinAccount,
} from '../../api/finance'
import type { FinAccount, FinAccountQuery } from '../../api/finance'

/** 账户状态选项（label 为 i18n key，组件内按语言取词） */
const STATUS_OPTION_KEYS = [
  { key: 'common.all', value: 'all' },
  { key: 'accountBalance.statusNormal', value: 'normal' },
  { key: 'accountBalance.statusFrozen', value: 'frozen' },
  { key: 'accountBalance.statusMergeFrozen', value: 'mergeFrozen' },
]

/** 状态显示映射（text 为 i18n key） */
const STATUS_MAP_KEYS: Record<string, { key: string; color: string }> = {
  normal: { key: 'accountBalance.statusNormal', color: 'green' },
  frozen: { key: 'accountBalance.statusFrozen', color: 'red' },
  mergeFrozen: { key: 'accountBalance.statusMergeFrozen', color: 'orange' },
}

/** 账户记录（后端 FinAccountVO，Mock 降级时结构一致） */
type AccountRecord = FinAccount & { key?: string }

/** 格式化金额 */
const formatAmount = (val: number) => {
  return val.toLocaleString('zh-TW', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

/** 搜索筛选条件 */
interface AccountFilters {
  groupId?: string
  groupName?: string
  brand?: string
  status?: string
}

export default function AccountBalance() {
  const navigate = useNavigate()
  const { t } = useTranslation()
  const { hasPermission } = useAuth()
  const statusOptions = STATUS_OPTION_KEYS.map(o => ({ label: t(o.key), value: o.value }))
  const [form] = Form.useForm<AccountFilters>()
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([])
  const [data, setData] = useState<AccountRecord[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [filters, setFilters] = useState<AccountFilters>({})
  const [pagination, setPagination] = useState({ page: 1, size: 10 })

  /** 加載賬戶列表 */
  const loadAccounts = useCallback(async () => {
    const query: FinAccountQuery = { ...filters, page: pagination.page, size: pagination.size }
    setLoading(true)
    try {
      const res = await fetchFinAccounts(query)
      setData(res.records ?? [])
      setTotal(res.total ?? 0)
    } finally {
      setLoading(false)
    }
  }, [filters, pagination])

  useEffect(() => {
    void loadAccounts()
  }, [loadAccounts])

  /** 查詢 */
  const handleSearch = () => {
    setFilters(form.getFieldsValue())
    setPagination(prev => ({ ...prev, page: 1 }))
  }

  /** 重置 */
  const handleReset = () => {
    form.resetFields()
    setFilters({})
    setPagination(prev => ({ ...prev, page: 1 }))
  }

  /** 凍結賬戶 */
  const handleFreeze = (record: AccountRecord) => {
    Modal.confirm({
      title: t('accountBalance.freezeTitle'),
      content: t('accountBalance.freezeContent', { name: record.groupName }),
      okText: t('accountBalance.freezeOk'),
      cancelText: t('common.cancel'),
      okButtonProps: { danger: true },
      onOk: async () => {
        await freezeFinAccount(record.groupId, record.brand)
        message.success(t('accountBalance.freezeSuccess', { name: record.groupName }))
        await loadAccounts()
      },
    })
  }

  /** 解凍賬戶 */
  const handleUnfreeze = (record: AccountRecord) => {
    Modal.confirm({
      title: t('accountBalance.unfreezeTitle'),
      content: t('accountBalance.unfreezeContent', { name: record.groupName }),
      okText: t('accountBalance.unfreezeOk'),
      cancelText: t('common.cancel'),
      onOk: async () => {
        await unfreezeFinAccount(record.groupId, record.brand)
        message.success(t('accountBalance.unfreezeSuccess', { name: record.groupName }))
        await loadAccounts()
      },
    })
  }

  /** 跳轉充值頁面 */
  const openRecharge = (record: AccountRecord) => {
    navigate(`/recharge-add?groupId=${record.groupId}&groupName=${encodeURIComponent(record.groupName)}&brand=${record.brand}`)
  }

  /** 跳轉轉賬頁面 */
  const openTransfer = (record: AccountRecord) => {
    navigate(`/transfer-add?groupId=${record.groupId}&groupName=${encodeURIComponent(record.groupName)}&brand=${record.brand}`)
  }

  /** 跳轉扣款頁面 */
  const openDeduct = (record: AccountRecord) => {
    navigate(`/deduct-add?groupId=${record.groupId}&groupName=${encodeURIComponent(record.groupName)}&brand=${record.brand}`)
  }

  /** 操作按钮 - 正常状态 */
  const NormalActions = ({ record }: { record: AccountRecord }) => (
    <Space size={0} split={<span className="action-split">|</span>}>
      {hasPermission('account-balance:edit') && (
        <>
          <Button type="link" size="small" onClick={() => openRecharge(record)}>{t('accountBalance.recharge')}</Button>
          <Button type="link" size="small" onClick={() => openTransfer(record)}>{t('accountBalance.transfer')}</Button>
          <Button type="link" size="small" onClick={() => openDeduct(record)}>{t('accountBalance.deduct')}</Button>
          <Button type="link" size="small" danger onClick={() => handleFreeze(record)}>{t('accountBalance.freeze')}</Button>
        </>
      )}
      <Button type="link" size="small" onClick={() => navigate('/detail-query')}>{t('accountBalance.detail')}</Button>
      <Button type="link" size="small" onClick={() => navigate('/batch-query')}>{t('accountBalance.batchQuery')}</Button>
    </Space>
  )

  /** 操作按钮 - 冻结状态 */
  const FrozenActions = ({ record }: { record: AccountRecord }) => (
    <Space size={0} split={<span className="action-split">|</span>}>
      {hasPermission('account-balance:edit') && (
        <Button type="link" size="small" onClick={() => handleUnfreeze(record)}>{t('accountBalance.unfreeze')}</Button>
      )}
      <Button type="link" size="small" onClick={() => navigate('/detail-query')}>{t('accountBalance.detail')}</Button>
      <Button type="link" size="small" onClick={() => navigate('/batch-query')}>{t('accountBalance.batchQuery')}</Button>
    </Space>
  )

  /** 操作按钮 - 合并冻结状态 */
  const MergeFrozenActions = ({ record: _record }: { record: AccountRecord }) => (
    <Space size={0} split={<span className="action-split">|</span>}>
      <Button type="link" size="small" onClick={() => navigate('/detail-query')}>{t('accountBalance.detail')}</Button>
      <Button type="link" size="small" onClick={() => navigate('/batch-query')}>{t('accountBalance.batchQuery')}</Button>
    </Space>
  )

  /** 列配置元数据 */
  const columnMeta = useMemo(() => [
    { key: 'groupId', title: t('accountBalance.colGroupId') },
    { key: 'groupName', title: t('accountBalance.colGroupName') },
    { key: 'brand', title: t('accountBalance.colBrand') },
    { key: 'virtualBalance', title: t('accountBalance.colVirtualBalance') },
    { key: 'actualBalance', title: t('accountBalance.colActualBalance') },
    { key: 'status', title: t('accountBalance.colStatus') },
    { key: 'action', title: t('accountBalance.colAction') },
  ], [t])

  const { configComponent, applyConfig } = useColumnConfig('account-balance', columnMeta, [
    { key: 'action', visible: true, locked: 'tail' },
  ])

  const columns: TableColumnsType<AccountRecord> = [
    {
      title: t('accountBalance.colGroupId'),
      dataIndex: 'groupId',
      key: 'groupId',
      width: 120,
    },
    {
      title: t('accountBalance.colGroupName'),
      dataIndex: 'groupName',
      key: 'groupName',
      width: 200,
    },
    {
      title: t('accountBalance.colBrand'),
      dataIndex: 'brand',
      key: 'brand',
      width: 100,
      render: (val: string) => (
        <BrandTag value={val} />
      ),
    },
    {
      title: t('accountBalance.colVirtualBalance'),
      dataIndex: 'virtualBalance',
      key: 'virtualBalance',
      width: 160,
      align: 'right',
      render: (val: number) => <span style={{ color: '#333', fontWeight: 500 }}>¥{formatAmount(val)}</span>,
    },
    {
      title: t('accountBalance.colActualBalance'),
      dataIndex: 'actualBalance',
      key: 'actualBalance',
      width: 160,
      align: 'right',
      render: (val: number) => <span style={{ color: '#333', fontWeight: 500 }}>¥{formatAmount(val)}</span>,
    },
    {
      title: t('accountBalance.colStatus'),
      dataIndex: 'status',
      key: 'status',
      width: 110,
      render: (status: string) => {
        const info = STATUS_MAP_KEYS[status]
        return info ? <Tag color={info.color}>{t(info.key)}</Tag> : status
      },
    },
    {
      title: t('accountBalance.colAction'),
      key: 'action',
      width: 280,
      render: (_, record) => {
        if (record.status === 'normal') {
          return <NormalActions record={record} />
        }
        if (record.status === 'frozen') {
          return <FrozenActions record={record} />
        }
        if (record.status === 'mergeFrozen') {
          return <MergeFrozenActions record={record} />
        }
        return null
      },
    },
  ]

  return (
    <div className="content-area">
      {/* 查询区域 */}
      <div className="search-section">
        <Form layout="inline" form={form}>
          <Form.Item label={t('accountBalance.colGroupId')} name="groupId">
            <Input placeholder={t('accountBalance.groupIdPlaceholder')} allowClear />
          </Form.Item>
          <Form.Item label={t('accountBalance.colGroupName')} name="groupName">
            <Input placeholder={t('accountBalance.groupNamePlaceholder')} allowClear />
          </Form.Item>
          <Form.Item label={t('accountBalance.colBrand')} name="brand">
            <Select placeholder={t('common.all')} options={brandOptions} allowClear />
          </Form.Item>
          <Form.Item label={t('accountBalance.colStatus')} name="status">
            <Select placeholder={t('common.all')} options={statusOptions} allowClear />
          </Form.Item>
          <Form.Item>
            <div className="search-actions">
              <Button type="primary" icon={<SearchOutlined />} onClick={handleSearch}>{t('common.search')}</Button>
              <Button icon={<ReloadOutlined />} onClick={handleReset}>{t('common.reset')}</Button>
            </div>
          </Form.Item>
        </Form>
      </div>

      {/* 功能区域 */}
      <div className="action-section">
        <div className="action-section-left">
          {hasPermission('account-balance:edit') && (
            <Button icon={<MergeCellsOutlined />} onClick={() => navigate('/merge-add')}>
              {t('accountBalance.merge')}
            </Button>
          )}
          {hasPermission('account-balance:export') && (
            <Button className="btn-export" icon={<ExportOutlined />}>
              {t('common.export')}
            </Button>
          )}
        </div>
        <div className="action-section-right">
          {configComponent}
        </div>
      </div>

      {/* 数据列表区域 */}
      <div className="table-section">
        <Table<AccountRecord>
          rowKey="groupId"
          loading={loading}
          rowSelection={{
            selectedRowKeys,
            onChange: setSelectedRowKeys,
          }}
          columns={applyConfig(columns)}
          dataSource={data}
          pagination={{
            current: pagination.page,
            pageSize: pagination.size,
            total,
            showTotal: (total) => t('common.total', { count: total }),
            showSizeChanger: true,
            pageSizeOptions: ['10', '20', '50', '100'],
            showQuickJumper: true,
            onChange: (page, size) => setPagination({ page, size }),
          }}
          size="middle"
          bordered={false}
          scroll={{ x: 1200 }}
        />
      </div>
    </div>
  )
}
