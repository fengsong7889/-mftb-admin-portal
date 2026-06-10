import { useState, useMemo } from 'react'
import { Button, Space, Input, Select, Table, Tag, Form, message } from 'antd'
import type { TableColumnsType } from 'antd'
import { useNavigate } from 'react-router-dom'
import {
  SearchOutlined,
  ReloadOutlined,
  MergeCellsOutlined,
  ExportOutlined,
} from '@ant-design/icons'
import { useColumnConfig } from '../../hooks/useColumnConfig'
import RechargeModal from './RechargeModal'

/** 品牌选项 */
const brandOptions = [
  { label: '全部', value: 'all' },
  { label: 'mFood', value: 'mFood' },
  { label: '閃蜂', value: 'flashBee' },
]

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

/** 模拟数据类型 */
interface AccountRecord {
  key: string
  groupId: string
  groupName: string
  brand: string
  virtualBalance: number
  actualBalance: number
  status: string
}

/** 模拟数据 */
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
  { key: '11', groupId: 'G10011', groupName: '華盛餐飲集團', brand: 'mFood', virtualBalance: 234500.00, actualBalance: 230000.00, status: 'normal' },
  { key: '12', groupId: 'G10012', groupName: '新鮮蜂物流科技有限公司', brand: 'flashBee', virtualBalance: 67800.00, actualBalance: 65000.00, status: 'frozen' },
]

/** 格式化金额 */
const formatAmount = (val: number) => {
  return val.toLocaleString('zh-TW', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export default function AccountBalance() {
  const navigate = useNavigate()
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([])
  const [rechargeOpen, setRechargeOpen] = useState(false)
  const [rechargeRecord, setRechargeRecord] = useState<AccountRecord | null>(null)

  /** 打开充值弹窗 */
  const openRecharge = (record: AccountRecord) => {
    setRechargeRecord(record)
    setRechargeOpen(true)
  }

  /** 操作按钮 - 正常状态 */
  const NormalActions = ({ record }: { record: AccountRecord }) => (
    <Space size={0} split={<span className="action-split">|</span>}>
      <Button type="link" size="small" onClick={() => openRecharge(record)}>充值</Button>
      <Button type="link" size="small" onClick={() => message.info(`轉賬：${record.groupName}`)}>轉賬</Button>
      <Button type="link" size="small" onClick={() => message.info(`扣款：${record.groupName}`)}>扣款</Button>
      <Button type="link" size="small" danger onClick={() => message.info(`凍結：${record.groupName}`)}>凍結</Button>
      <Button type="link" size="small" onClick={() => navigate('/detail-query')}>明細</Button>
      <Button type="link" size="small" onClick={() => navigate('/batch-query')}>批次查詢</Button>
    </Space>
  )

  /** 操作按钮 - 冻结状态 */
  const FrozenActions = ({ record }: { record: AccountRecord }) => (
    <Space size={0} split={<span className="action-split">|</span>}>
      <Button type="link" size="small" onClick={() => openRecharge(record)}>充值</Button>
      <Button type="link" size="small" onClick={() => message.info(`轉賬：${record.groupName}`)}>轉賬</Button>
      <Button type="link" size="small" onClick={() => message.info(`扣款：${record.groupName}`)}>扣款</Button>
      <Button type="link" size="small" onClick={() => message.info(`解凍：${record.groupName}`)}>解凍</Button>
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
      render: (val: string) => val === 'mFood' ? 'mFood' : '閃蜂',
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
        <Form layout="inline">
          <Form.Item label="集團ID">
            <Input placeholder="請輸入集團ID" allowClear />
          </Form.Item>
          <Form.Item label="集團名稱">
            <Input placeholder="請輸入集團名稱" allowClear />
          </Form.Item>
          <Form.Item label="所屬品牌">
            <Select placeholder="請選擇" options={brandOptions} />
          </Form.Item>
          <Form.Item label="賬戶狀態">
            <Select placeholder="請選擇" options={statusOptions} />
          </Form.Item>
          <Form.Item>
            <div className="search-actions">
              <Button type="primary" icon={<SearchOutlined />}>查詢</Button>
              <Button icon={<ReloadOutlined />}>重置</Button>
            </div>
          </Form.Item>
        </Form>
      </div>

      {/* 功能区域 */}
      <div className="action-section">
        <Space>
          <Button icon={<MergeCellsOutlined />}>
            商戶合併
          </Button>
          <Button icon={<ExportOutlined />}>
            數據導出
          </Button>
        </Space>
        {configComponent}
      </div>

      {/* 数据列表区域 */}
      <div className="table-section">
        <Table<AccountRecord>
          rowSelection={{
            selectedRowKeys,
            onChange: setSelectedRowKeys,
          }}
          columns={applyConfig(columns)}
          dataSource={mockData}
          pagination={{
            total: mockData.length,
            pageSize: 10,
            showTotal: (total) => `共 ${total} 條`,
            showSizeChanger: true,
            showQuickJumper: true,
          }}
          size="middle"
          bordered={false}
          scroll={{ x: 1200 }}
        />
      </div>

      {/* 充值弹窗 */}
      <RechargeModal
        open={rechargeOpen}
        onClose={() => setRechargeOpen(false)}
        record={rechargeRecord ? { groupId: rechargeRecord.groupId, groupName: rechargeRecord.groupName, brand: rechargeRecord.brand } : null}
      />
    </div>
  )
}
