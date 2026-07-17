import { useState } from 'react'
import { Button, Card, Col, Row, Select, Space, Table } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { ExportOutlined } from '@ant-design/icons'
import AppTabs from '../components/AppTabs'
import { AppType, RecommendChannel, AlgorithmType, RECOMMEND_CHANNEL_OPTIONS, ALGORITHM_TYPE_OPTIONS } from '../constants'

interface RevenueRecord {
  id: number
  date: string
  channel: RecommendChannel
  algorithmType: AlgorithmType
  revenue: number
  proportion: string
}

const CHANNEL_LABEL: Record<RecommendChannel, string> = {
  [RecommendChannel.HOME]: '大首頁瀑布流',
  [RecommendChannel.DELIVERY]: '外賣頻道瀑布流',
  [RecommendChannel.GROUP_BUY]: '團購頻道瀑布流',
  [RecommendChannel.SUPERMARKET]: '超市頻道瀑布流',
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

const PERIOD_OPTIONS = [
  { label: '按日', value: 'day' },
  { label: '按週', value: 'week' },
  { label: '按月', value: 'month' },
]

const mockData: RevenueRecord[] = [
  { id: 1, date: '2024-06-01', channel: RecommendChannel.HOME, algorithmType: AlgorithmType.INVINCIBLE_STAR, revenue: 42800, proportion: '33.3%' },
  { id: 2, date: '2024-06-01', channel: RecommendChannel.DELIVERY, algorithmType: AlgorithmType.GUESS_YOU_LIKE, revenue: 36600, proportion: '28.5%' },
  { id: 3, date: '2024-06-01', channel: RecommendChannel.SUPERMARKET, algorithmType: AlgorithmType.TRAFFIC_AD, revenue: 29200, proportion: '22.7%' },
]

export default function RevenueReport() {
  const [activeApp, setActiveApp] = useState<AppType>(AppType.SHANFENG)
  const [selectedChannel, setSelectedChannel] = useState<RecommendChannel | undefined>(undefined)
  const [selectedPeriod, setSelectedPeriod] = useState<string>('day')

  const columns: ColumnsType<RevenueRecord> = [
    { title: '日期', dataIndex: 'date', key: 'date', width: 120 },
    { title: '頻道', dataIndex: 'channel', key: 'channel', render: (v: RecommendChannel) => CHANNEL_LABEL[v] },
    { title: '廣告類型', dataIndex: 'algorithmType', key: 'algorithmType', render: (v: AlgorithmType) => ALG_LABEL[v] },
    { title: '營收金額 (MOP)', dataIndex: 'revenue', key: 'revenue', render: (v: number) => v.toLocaleString() },
    { title: '佔比', dataIndex: 'proportion', key: 'proportion' },
  ]

  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <h2>營收報表</h2>
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
            style={{ width: 100 }}
            options={PERIOD_OPTIONS}
            value={selectedPeriod}
            onChange={setSelectedPeriod}
          />
          <Select
            placeholder="選擇廣告類型"
            allowClear
            style={{ width: 160 }}
            options={ALGORITHM_TYPE_OPTIONS}
          />
          <Button type="primary">查詢</Button>
          <Button className="btn-export" icon={<ExportOutlined />}>導出</Button>
        </Space>
      </Card>

      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col span={14}>
          <Card title="營收增長趨勢" style={{ minHeight: 240 }}>
            <div
              style={{
                height: 180,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#bfbfbf',
                border: '1px dashed #d9d9d9',
                borderRadius: 6,
              }}
            >
              折線圖（待接入真實數據）
            </div>
          </Card>
        </Col>
        <Col span={10}>
          <Card title="各頻道佔比" style={{ minHeight: 240 }}>
            <div
              style={{
                height: 180,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#bfbfbf',
                border: '1px dashed #d9d9d9',
                borderRadius: 6,
              }}
            >
              餅圖（待接入真實數據）
            </div>
          </Card>
        </Col>
      </Row>

      <Table<RevenueRecord>
        rowKey="id"
        columns={columns}
        dataSource={mockData}
        pagination={{ pageSize: 10, total: 3, showTotal: (t) => `共 ${t} 條`, showSizeChanger: true, pageSizeOptions: ['10', '20', '50'], showQuickJumper: true }}
      />
    </div>
  )
}
