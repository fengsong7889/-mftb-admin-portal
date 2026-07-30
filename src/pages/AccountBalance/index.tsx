import { useState, useMemo, useEffect, useCallback } from 'react'
import { Button, Space, Input, Select, Table, Tag, Form, message, Modal } from 'antd'
import type { TableColumnsType } from 'antd'
import { useNavigate } from 'react-router-dom'
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
  withFinanceFallback,
} from '../../api/finance'
import type { FinAccount, FinAccountQuery } from '../../api/finance'

/** 账户状态选项 */
const statusOptions = [
  { label: '全部', value: 'all' },
  { label: '正常', value: 'normal' },
  { label: '凍結', value: 'frozen' },
  { label: '合併凍結', value: 'mergeFrozen' },
]

/** 状态显示映射 */
const statusMap: Record<string, { text: string; color: string }> = {
  normal: { text: '正常', color: 'green' },
  frozen: { text: '凍結', color: 'red' },
  mergeFrozen: { text: '合併凍結', color: 'orange' },
}

/** 账户记录（后端 FinAccountVO，Mock 降级时结构一致） */
type AccountRecord = FinAccount & { key?: string }

/** 后端不可用时的降级演示数据（保留原有 Mock，凍結/解凍在会话内生效） */
const mockData: AccountRecord[] = [
  { key: '1', groupId: 'G10001', groupName: '美味集團有限公司', brand: 'mFood', virtualBalance: 128560.50, actualBalance: 120000.00, status: 'normal' },
  { key: '2', groupId: 'G10002', groupName: '閃蜂科技有限公司', brand: 'flashBee', virtualBalance: 89230.75, actualBalance: 85000.00, status: 'normal' },
  { key: '3', groupId: 'G10003', groupName: '鮮味餐飲集團', brand: 'mFood', virtualBalance: 45600.00, actualBalance: 45000.00, status: 'frozen' },
  { key: '4', groupId: 'G10004', groupName: '速達物流有限公司', brand: 'flashBee', virtualBalance: 23100.30, actualBalance: 22000.00, status: 'mergeFrozen' },
  { key: '5', groupId: 'G10005', groupName: '金龍餐飲管理公司', brand: 'mFood', virtualBalance: 567890.00, actualBalance: 560000.00, status: 'normal' },
  { key: '6', groupId: 'G10006', groupName: '星輝餐飲集團', brand: 'flashBee', virtualBalance: 0.00, actualBalance: 0.00, status: 'mergeFrozen' },
  { key: '7', groupId: 'G10007', groupName: '佳味食品科技有限公司', brand: 'mFood', virtualBalance: 345200.80, actualBalance: 340000.00, status: 'normal' },
  { key: '8', groupId: 'G10008', groupName: '鵬程餐飲有限公司', brand: 'mFood', virtualBalance: 78900.00, actualBalance: 75000.00, status: 'frozen' },
  { key: '9', groupId: 'G10009', groupName: '雲端科技餐飲集團', brand: 'flashBee', virtualBalance: 112400.60, actualBalance: 110000.00, status: 'normal' },
  { key: '10', groupId: 'G10010', groupName: '合眾餐飲管理有限公司', brand: 'mFood', virtualBalance: 90560.25, actualBalance: 88000.00, status: 'normal' },
  { key: '11', groupId: 'G10011', groupName: '星辰飲食集團', brand: 'flashBee', virtualBalance: 135600.80, actualBalance: 130000.00, status: 'normal' },
  { key: '12', groupId: 'G10012', groupName: '萬象餐飲控股有限公司', brand: 'mFood', virtualBalance: 98750.50, actualBalance: 95000.00, status: 'normal' },
]

/** 格式化金额 */
const formatAmount = (val: number) => {
  return val.toLocaleString('zh-TW', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

/** 降級數據源（會話內可變，凍結/解凍後同步狀態） */
let mockAccounts: AccountRecord[] = mockData.map(r => ({ ...r }))

/** 降級查詢：本地篩選 + 分頁 */
function mockFetchAccounts(query: FinAccountQuery) {
  const filtered = mockAccounts.filter(r => {
    if (query.groupId && !r.groupId.includes(query.groupId)) return false
    if (query.groupName && !r.groupName.includes(query.groupName)) return false
    if (query.brand && query.brand !== 'all' && r.brand !== query.brand) return false
    if (query.status && query.status !== 'all' && r.status !== query.status) return false
    return true
  })
  const page = query.page ?? 1
  const size = query.size ?? 10
  return { records: filtered.slice((page - 1) * size, page * size), total: filtered.length }
}

/** 降級狀態變更 */
function mockUpdateAccountStatus(groupId: string, status: string) {
  mockAccounts = mockAccounts.map(r => (r.groupId === groupId ? { ...r, status } : r))
}

/** 搜索篩選條件 */
interface AccountFilters {
  groupId?: string
  groupName?: string
  brand?: string
  status?: string
}

export default function AccountBalance() {
  const navigate = useNavigate()
  const { hasPermission } = useAuth()
  const [form] = Form.useForm<AccountFilters>()
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([])
  const [data, setData] = useState<AccountRecord[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [filters, setFilters] = useState<AccountFilters>({})
  const [pagination, setPagination] = useState({ page: 1, size: 10 })

  /** 加載賬戶列表（後端不可用時降級到本地演示數據） */
  const loadAccounts = useCallback(async () => {
    const query: FinAccountQuery = { ...filters, page: pagination.page, size: pagination.size }
    setLoading(true)
    try {
      const res = await withFinanceFallback(
        () => fetchFinAccounts(query),
        () => mockFetchAccounts(query),
      )
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
      title: '確認凍結',
      content: `確定要凍結「${record.groupName}」的賬戶嗎？凍結後將無法進行充值、轉賬、扣款操作。`,
      okText: '確定凍結',
      cancelText: '取消',
      okButtonProps: { danger: true },
      onOk: async () => {
        await withFinanceFallback(
          () => freezeFinAccount(record.groupId, record.brand),
          () => mockUpdateAccountStatus(record.groupId, 'frozen'),
        )
        message.success(`已凍結「${record.groupName}」賬戶`)
        await loadAccounts()
      },
    })
  }

  /** 解凍賬戶 */
  const handleUnfreeze = (record: AccountRecord) => {
    Modal.confirm({
      title: '確認解凍',
      content: `確定要解凍「${record.groupName}」的賬戶嗎？解凍後可恢復充值、轉賬、扣款操作。`,
      okText: '確定解凍',
      cancelText: '取消',
      onOk: async () => {
        await withFinanceFallback(
          () => unfreezeFinAccount(record.groupId, record.brand),
          () => mockUpdateAccountStatus(record.groupId, 'normal'),
        )
        message.success(`已解凍「${record.groupName}」賬戶`)
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
      {hasPermission('edit') && (
        <>
          <Button type="link" size="small" onClick={() => openRecharge(record)}>充值</Button>
          <Button type="link" size="small" onClick={() => openTransfer(record)}>轉賬</Button>
          <Button type="link" size="small" onClick={() => openDeduct(record)}>扣款</Button>
          <Button type="link" size="small" danger onClick={() => handleFreeze(record)}>凍結</Button>
        </>
      )}
      <Button type="link" size="small" onClick={() => navigate('/detail-query')}>明細</Button>
      <Button type="link" size="small" onClick={() => navigate('/batch-query')}>批次查詢</Button>
    </Space>
  )

  /** 操作按钮 - 冻结状态 */
  const FrozenActions = ({ record }: { record: AccountRecord }) => (
    <Space size={0} split={<span className="action-split">|</span>}>
      {hasPermission('edit') && (
        <Button type="link" size="small" onClick={() => handleUnfreeze(record)}>解凍</Button>
      )}
      <Button type="link" size="small" onClick={() => navigate('/detail-query')}>明細</Button>
      <Button type="link" size="small" onClick={() => navigate('/batch-query')}>批次查詢</Button>
    </Space>
  )

  /** 操作按钮 - 合并冻结状态 */
  const MergeFrozenActions = ({ record }: { record: AccountRecord }) => (
    <Space size={0} split={<span className="action-split">|</span>}>
      <Button type="link" size="small" onClick={() => navigate('/detail-query')}>明細</Button>
      <Button type="link" size="small" onClick={() => navigate('/batch-query')}>批次查詢</Button>
    </Space>
  )

  /** 列配置元数据 */
  const columnMeta = useMemo(() => [
    { key: 'groupId', title: '集團ID' },
    { key: 'groupName', title: '集團名稱' },
    { key: 'brand', title: '所屬品牌' },
    { key: 'virtualBalance', title: '虛擬賬戶餘額' },
    { key: 'actualBalance', title: '實收賬戶餘額' },
    { key: 'status', title: '賬戶狀態' },
    { key: 'action', title: '操作' },
  ], [])

  const { configComponent, applyConfig } = useColumnConfig('account-balance', columnMeta, [
    { key: 'action', visible: true, locked: 'tail' },
  ])

  const columns: TableColumnsType<AccountRecord> = [
    {
      title: '集團ID',
      dataIndex: 'groupId',
      key: 'groupId',
      width: 120,
    },
    {
      title: '集團名稱',
      dataIndex: 'groupName',
      key: 'groupName',
      width: 200,
    },
    {
      title: '所屬品牌',
      dataIndex: 'brand',
      key: 'brand',
      width: 100,
      render: (val: string) => (
        <BrandTag value={val} />
      ),
    },
    {
      title: '虛擬賬戶餘額',
      dataIndex: 'virtualBalance',
      key: 'virtualBalance',
      width: 160,
      align: 'right',
      render: (val: number) => <span style={{ color: '#333', fontWeight: 500 }}>¥{formatAmount(val)}</span>,
    },
    {
      title: '實收賬戶餘額',
      dataIndex: 'actualBalance',
      key: 'actualBalance',
      width: 160,
      align: 'right',
      render: (val: number) => <span style={{ color: '#333', fontWeight: 500 }}>¥{formatAmount(val)}</span>,
    },
    {
      title: '賬戶狀態',
      dataIndex: 'status',
      key: 'status',
      width: 110,
      render: (status: string) => {
        const info = statusMap[status]
        return info ? <Tag color={info.color}>{info.text}</Tag> : status
      },
    },
    {
      title: '操作',
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
          <Form.Item label="集團ID" name="groupId">
            <Input placeholder="請輸入集團ID" allowClear />
          </Form.Item>
          <Form.Item label="集團名稱" name="groupName">
            <Input placeholder="請輸入集團名稱" allowClear />
          </Form.Item>
          <Form.Item label="所屬品牌" name="brand">
            <Select placeholder="請選擇" options={brandOptions} allowClear />
          </Form.Item>
          <Form.Item label="賬戶狀態" name="status">
            <Select placeholder="請選擇" options={statusOptions} allowClear />
          </Form.Item>
          <Form.Item>
            <div className="search-actions">
              <Button type="primary" icon={<SearchOutlined />} onClick={handleSearch}>查詢</Button>
              <Button icon={<ReloadOutlined />} onClick={handleReset}>重置</Button>
            </div>
          </Form.Item>
        </Form>
      </div>

      {/* 功能区域 */}
      <div className="action-section">
        <div className="action-section-left">
          {hasPermission('edit') && (
            <Button icon={<MergeCellsOutlined />} onClick={() => navigate('/merge-add')}>
              商戶合併
            </Button>
          )}
          <Button className="btn-export" icon={<ExportOutlined />}>
            導出
          </Button>
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
            showTotal: (t) => `共 ${t} 條`,
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
