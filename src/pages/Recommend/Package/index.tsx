import { useState } from 'react'
import { Button, Space, Table, Badge } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { PlusOutlined } from '@ant-design/icons'
import AppTabs from '../components/AppTabs'
import { AppType, ServiceStatus } from '../constants'

interface PackageRecord {
  id: number
  name: string
  includedSlots: string
  validDays: number
  price: number
  discountRate: string
  status: ServiceStatus
}

const mockData: PackageRecord[] = [
  { id: 1, name: '黃金套餐', includedSlots: '首頁第一坑 + 外賣第一坑', validDays: 30, price: 12800, discountRate: '8折', status: ServiceStatus.ENABLED },
  { id: 2, name: '鉑金套餐', includedSlots: '大首頁全坑位', validDays: 14, price: 8800, discountRate: '85折', status: ServiceStatus.ENABLED },
  { id: 3, name: '試用套餐', includedSlots: '首頁第三坑', validDays: 7, price: 2200, discountRate: '無折扣', status: ServiceStatus.DISABLED },
]

export default function Package() {
  const [activeApp, setActiveApp] = useState<AppType>(AppType.SHANFENG)

  const columns: ColumnsType<PackageRecord> = [
    { title: '套餐名稱', dataIndex: 'name', key: 'name' },
    { title: '包含坑位', dataIndex: 'includedSlots', key: 'includedSlots' },
    { title: '有效天數', dataIndex: 'validDays', key: 'validDays', render: (v: number) => `${v}天` },
    { title: '套餐價格 (MOP)', dataIndex: 'price', key: 'price', render: (v: number) => v.toLocaleString() },
    { title: '折扣比例', dataIndex: 'discountRate', key: 'discountRate' },
    {
      title: '狀態', dataIndex: 'status', key: 'status',
      render: (v: ServiceStatus) => (
        <Badge
          status={v === ServiceStatus.ENABLED ? 'success' : 'default'}
          text={v === ServiceStatus.ENABLED ? '啟用' : '停用'}
        />
      ),
    },
    {
      title: '操作', key: 'action',
      render: () => (
        <Space>
          <Button type="link" size="small">編輯</Button>
          <Button type="link" size="small" danger>下架</Button>
        </Space>
      ),
    },
  ]

  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <h2>套餐管理</h2>
      </div>
      <AppTabs value={activeApp} onChange={setActiveApp} />
      <div style={{ marginBottom: 16 }}>
        <Button type="primary" icon={<PlusOutlined />}>新增套餐</Button>
      </div>
      <Table<PackageRecord>
        rowKey="id"
        columns={columns}
        dataSource={mockData}
        pagination={false}
      />
    </div>
  )
}
