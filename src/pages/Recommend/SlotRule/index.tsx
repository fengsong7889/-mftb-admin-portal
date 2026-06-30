import { useState } from 'react'
import { Button, Card, Select, Space, Table, Badge } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { PlusOutlined } from '@ant-design/icons'
import AppTabs from '../components/AppTabs'
import { AppType, ServiceStatus, AlgorithmType, RecommendChannel, RECOMMEND_CHANNEL_OPTIONS } from '../constants'

interface SlotRuleRecord {
  id: number
  name: string
  slot: string
  timePeriod: string
  region: string
  algorithm: AlgorithmType
  priority: number
  status: ServiceStatus
}

const ALG_LABEL: Record<AlgorithmType, string> = {
  [AlgorithmType.INVINCIBLE_STAR]: '無敵星星',
  [AlgorithmType.NEW_STORE_AD]: '新店廣告',
  [AlgorithmType.HOT_REVIVE_AD]: '盤活復蘇',
  [AlgorithmType.EXCLUSIVE_MERCHANT]: '獨家商家',
  [AlgorithmType.TRAFFIC_AD]: '流量廣告',
  [AlgorithmType.GUESS_YOU_LIKE]: '猜你喜歡',
  [AlgorithmType.ORGANIC_TRAFFIC]: '自然流量',
  [AlgorithmType.SEARCH_ALGORITHM]: '搜索算法',
} as Record<AlgorithmType, string>

const mockData: SlotRuleRecord[] = [
  { id: 1, name: '週末首頁推廣規則', slot: '首頁第一坑', timePeriod: '10:00-22:00', region: '澳門', algorithm: AlgorithmType.INVINCIBLE_STAR, priority: 1, status: ServiceStatus.ENABLED },
  { id: 2, name: '外賣午市規則', slot: '外賣第一坑', timePeriod: '11:00-14:00', region: '氹仔', algorithm: AlgorithmType.GUESS_YOU_LIKE, priority: 2, status: ServiceStatus.ENABLED },
  { id: 3, name: '超市夜間規則', slot: '超市第二坑', timePeriod: '20:00-23:00', region: '珠海', algorithm: AlgorithmType.HOT_REVIVE_AD, priority: 3, status: ServiceStatus.DISABLED },
]

const SLOT_OPTIONS = [
  { label: '首頁第一坑', value: 'slot1' },
  { label: '外賣第一坑', value: 'slot2' },
  { label: '超市第二坑', value: 'slot3' },
]

export default function SlotRule() {
  const [activeApp, setActiveApp] = useState<AppType>(AppType.SHANFENG)
  const [selectedChannel, setSelectedChannel] = useState<RecommendChannel | undefined>(undefined)
  const [selectedSlot, setSelectedSlot] = useState<string | undefined>(undefined)

  const columns: ColumnsType<SlotRuleRecord> = [
    { title: '規則名稱', dataIndex: 'name', key: 'name' },
    { title: '坑位', dataIndex: 'slot', key: 'slot' },
    { title: '時段', dataIndex: 'timePeriod', key: 'timePeriod' },
    { title: '區域', dataIndex: 'region', key: 'region' },
    { title: '綁定算法', dataIndex: 'algorithm', key: 'algorithm', render: (v: AlgorithmType) => ALG_LABEL[v] },
    { title: '優先級', dataIndex: 'priority', key: 'priority' },
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
          <Button type="link" size="small" danger>刪除</Button>
        </Space>
      ),
    },
  ]

  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <h2>投放規則</h2>
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
            placeholder="選擇坑位"
            allowClear
            style={{ width: 160 }}
            options={SLOT_OPTIONS}
            value={selectedSlot}
            onChange={setSelectedSlot}
          />
          <Button type="primary" icon={<PlusOutlined />}>新增規則</Button>
        </Space>
      </Card>
      <Table<SlotRuleRecord>
        rowKey="id"
        columns={columns}
        dataSource={mockData}
        pagination={false}
      />
    </div>
  )
}
