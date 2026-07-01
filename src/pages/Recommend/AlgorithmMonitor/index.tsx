import { useState } from 'react'
import { Card, DatePicker, Select, Space, Table } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import AppTabs from '../components/AppTabs'
import { AppType, AlgorithmType, RECOMMEND_CHANNEL_OPTIONS, ALGORITHM_TYPE_OPTIONS } from '../constants'

interface MonitorRecord {
  id: number
  algorithmName: string
  exposure: number
  clicks: number
  ctr: string
  conversionRate: string
  dailyRevenue: number
}

const mockData: MonitorRecord[] = [
  { id: 1, algorithmName: '猜你喜歡-主力版', exposure: 1200000, clicks: 68400, ctr: '5.70%', conversionRate: '3.20%', dailyRevenue: 42800 },
  { id: 2, algorithmName: '無敵星星-外賣版', exposure: 980000, clicks: 51940, ctr: '5.30%', conversionRate: '2.85%', dailyRevenue: 36600 },
  { id: 3, algorithmName: '流量廣告-超市版', exposure: 750000, clicks: 33000, ctr: '4.40%', conversionRate: '2.10%', dailyRevenue: 29200 },
]

export default function AlgorithmMonitor() {
  const [activeApp, setActiveApp] = useState<AppType>(AppType.SHANFENG)
  const [selectedChannel, setSelectedChannel] = useState<number | undefined>(undefined)
  const [selectedAlgorithm, setSelectedAlgorithm] = useState<AlgorithmType | undefined>(undefined)

  const columns: ColumnsType<MonitorRecord> = [
    { title: '算法名稱', dataIndex: 'algorithmName', key: 'algorithmName' },
    { title: '曝光量', dataIndex: 'exposure', key: 'exposure', render: (v: number) => v.toLocaleString() },
    { title: '點擊量', dataIndex: 'clicks', key: 'clicks', render: (v: number) => v.toLocaleString() },
    { title: 'CTR', dataIndex: 'ctr', key: 'ctr' },
    { title: '轉化率', dataIndex: 'conversionRate', key: 'conversionRate' },
    { title: '日均營收 (MOP)', dataIndex: 'dailyRevenue', key: 'dailyRevenue', render: (v: number) => v.toLocaleString() },
  ]

  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <h2>算法效果監控</h2>
      </div>
      <AppTabs value={activeApp} onChange={setActiveApp} />
      <Card style={{ marginBottom: 16 }}>
        <Space wrap>
          <Select
            placeholder="選擇頻道"
            allowClear
            style={{ width: 180 }}
            options={RECOMMEND_CHANNEL_OPTIONS}
            value={selectedChannel}
            onChange={setSelectedChannel}
          />
          <Select
            placeholder="選擇廣告類型"
            allowClear
            style={{ width: 160 }}
            options={ALGORITHM_TYPE_OPTIONS}
            value={selectedAlgorithm}
            onChange={setSelectedAlgorithm}
          />
          <DatePicker.RangePicker />
        </Space>
      </Card>
      <Table<MonitorRecord>
        rowKey="id"
        columns={columns}
        dataSource={mockData}
        pagination={false}
      />
    </div>
  )
}
