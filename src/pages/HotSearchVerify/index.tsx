import { useState } from 'react'
import {
  Card, Input, Button, Select, Space, Tag, Table, Row, Col, Form, Empty,
} from 'antd'
import type { TableColumnsType } from 'antd'
import {
  SearchOutlined, ReloadOutlined, EyeOutlined,
  FireOutlined, WifiOutlined,
} from '@ant-design/icons'
import { BRAND_OPTIONS as BRAND_OPTIONS_IMPORT } from '../../constants/brand'

// ============================
// 常量定义
// ============================

const CHANNELS = [
  { key: 'home', label: '大首頁' },
  { key: 'takeaway', label: '外賣頻道' },
  { key: 'groupBuy', label: '團購頻道' },
  { key: 'supermarket', label: '超市頻道' },
]

const REGION_OPTIONS = [
  { label: '澳門半島', value: 'macau' },
  { label: '氹仔路半島', value: 'taipa' },
  { label: '珠海市', value: 'zhuhai' },
]

const TIME_SLOT_OPTIONS = [
  { label: '全時段', value: 'allDay' },
  { label: '早餐', value: 'breakfast' },
  { label: '午餐', value: 'lunch' },
  { label: '下午茶', value: 'afternoonTea' },
  { label: '晚餐', value: 'dinner' },
  { label: '宵夜', value: 'midnightSnack' },
]

// ============================
// 類型定義
// ============================

interface HotSearchItem {
  word: string
  rank: number
  type: string
  source: string
  status: 'active' | 'inactive'
  style: { borderColor: string; bgColor: string; fontColor: string }
}

// ============================
// Mock 數據
// ============================

const MOCK_DATA: HotSearchItem[] = [
  { word: '🔥 限時火鍋優惠', rank: 1, type: '活動推廣', source: '商業配置', status: 'active', style: { borderColor: '#E8720C', bgColor: '#FFF7ED', fontColor: '#333' } },
  { word: '🆕 美味漢堡', rank: 2, type: '商家推廣', source: '商業配置', status: 'active', style: { borderColor: '#1890FF', bgColor: '#E6F7FF', fontColor: '#333' } },
  { word: '漢堡包', rank: 3, type: '熱搜詞庫', source: '熱搜詞庫', status: 'active', style: { borderColor: '#F0F0F0', bgColor: '#FAFAFA', fontColor: '#333' } },
  { word: '🧋 珍珠奶茶', rank: 4, type: '運營推廣', source: '運營配置', status: 'active', style: { borderColor: '#52C41A', bgColor: '#F6FFED', fontColor: '#333' } },
  { word: '炸雞', rank: 5, type: '熱搜詞庫', source: '熱搜詞庫', status: 'active', style: { borderColor: '#F0F0F0', bgColor: '#FAFAFA', fontColor: '#333' } },
  { word: '🎁 下午茶限時折扣', rank: 6, type: '活動推廣', source: '商業配置', status: 'active', style: { borderColor: '#722ED1', bgColor: '#F9F0FF', fontColor: '#333' } },
  { word: '壽司', rank: 7, type: '商家推廣', source: '商業配置', status: 'active', style: { borderColor: '#F0F0F0', bgColor: '#FAFAFA', fontColor: '#333' } },
  { word: '⭐ 咖喱魚蛋', rank: 8, type: '運營推廣', source: '運營配置', status: 'active', style: { borderColor: '#FAAD14', bgColor: '#FFFBE6', fontColor: '#333' } },
  { word: '水蟹粥', rank: 9, type: '熱搜詞庫', source: '熱搜詞庫', status: 'active', style: { borderColor: '#F0F0F0', bgColor: '#FAFAFA', fontColor: '#333' } },
  { word: '葡撻', rank: 10, type: '熱搜詞庫', source: '熱搜詞庫', status: 'active', style: { borderColor: '#F0F0F0', bgColor: '#FAFAFA', fontColor: '#333' } },
]

const typeColorMap: Record<string, string> = {
  '活動推廣': 'orange',
  '商家推廣': 'blue',
  '運營推廣': 'green',
  '熱搜詞庫': 'default',
}

// ============================
// 主組件
// ============================

export default function HotSearchVerify() {
  const [channel, setChannel] = useState('home')
  const [brand, setBrand] = useState('mFood')
  const [region, setRegion] = useState('macau')
  const [timeSlot, setTimeSlot] = useState('lunch')
  const [results, setResults] = useState<HotSearchItem[]>([])
  const [searched, setSearched] = useState(false)

  const handleSearch = () => {
    setResults(MOCK_DATA)
    setSearched(true)
  }

  const handleReset = () => {
    setChannel('home')
    setBrand('mFood')
    setRegion('macau')
    setTimeSlot('lunch')
    setResults([])
    setSearched(false)
  }

  const columns: TableColumnsType<HotSearchItem> = [
    {
      title: '排名', dataIndex: 'rank', width: 70, align: 'center',
      render: (v: number) => (
        <Tag color={v <= 3 ? 'orange' : 'default'} style={{ fontWeight: 700, minWidth: 28, textAlign: 'center' }}>
          {v}
        </Tag>
      ),
      sorter: (a, b) => a.rank - b.rank,
      defaultSortOrder: 'ascend',
    },
    {
      title: '熱搜詞', dataIndex: 'word', width: 180,
      render: (v: string) => <span style={{ fontWeight: 600, fontSize: 14 }}>{v}</span>,
    },
    {
      title: '類型', dataIndex: 'type', width: 100,
      render: (v: string) => <Tag color={typeColorMap[v] || 'default'}>{v}</Tag>,
    },
    { title: '來源', dataIndex: 'source', width: 100 },
    {
      title: '狀態', dataIndex: 'status', width: 80,
      render: (v: string) => <Tag color={v === 'active' ? 'green' : 'default'}>{v === 'active' ? '生效中' : '已停用'}</Tag>,
    },
  ]

  return (
    <div className="content-area">
      {/* 頁面標題 */}
      <div style={{
        background: '#fff', padding: '12px 20px', marginBottom: 12,
        borderRadius: 8, boxShadow: '0 2px 8px rgba(0, 0, 0, 0.06)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <FireOutlined style={{ fontSize: 20, color: '#E8720C' }} />
          <div>
            <h2 style={{ margin: 0, fontSize: 17, fontWeight: 600, color: '#E8720C' }}>
              熱搜校驗
            </h2>
            <div style={{ fontSize: 12, color: '#999', marginTop: 2 }}>
              校驗熱搜詞在不同頻道、區域、時段下的展示效果
            </div>
          </div>
        </div>
      </div>

      {/* 篩選條件 */}
      <Card
        title={<Space><FireOutlined style={{ color: '#E8720C' }} /><span>熱搜校驗條件</span></Space>}
        style={{ marginBottom: 12, borderRadius: 8 }}
        bodyStyle={{ padding: '16px 24px' }}
      >
        <Form layout="vertical">
          <Row gutter={16}>
            <Col span={6}>
              <Form.Item label="搜索頻道" style={{ marginBottom: 12 }}>
                <Select value={channel} onChange={setChannel}
                  options={CHANNELS.map(c => ({ label: c.label, value: c.key }))} />
              </Form.Item>
            </Col>
            <Col span={6}>
              <Form.Item label="所屬品牌" style={{ marginBottom: 12 }}>
                <Select value={brand} onChange={setBrand} options={BRAND_OPTIONS_IMPORT} />
              </Form.Item>
            </Col>
            <Col span={6}>
              <Form.Item label="展示區域" style={{ marginBottom: 12 }}>
                <Select value={region} onChange={setRegion} options={REGION_OPTIONS} />
              </Form.Item>
            </Col>
            <Col span={6}>
              <Form.Item label="展示時段" style={{ marginBottom: 12 }}>
                <Select value={timeSlot} onChange={setTimeSlot} options={TIME_SLOT_OPTIONS} />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={24}>
              <Form.Item label="&nbsp;" style={{ marginBottom: 12 }}>
                <Space>
                  <Button type="primary" icon={<EyeOutlined />} onClick={handleSearch}
                    style={{ background: '#E8720C', borderColor: '#E8720C' }}>
                    校驗熱搜
                  </Button>
                  <Button icon={<ReloadOutlined />} onClick={handleReset}>重置</Button>
                </Space>
              </Form.Item>
            </Col>
          </Row>
        </Form>
      </Card>

      {/* 結果區域 */}
      {searched && results.length > 0 && (
        <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
          {/* 手機模型 */}
          <div style={{
            width: 375, height: 720, flexShrink: 0,
            background: 'linear-gradient(180deg, #f5f5f5 0%, #e8e8e8 100%)',
            borderRadius: 40, padding: '60px 20px 30px',
            boxShadow: '0 12px 32px rgba(0, 0, 0, 0.25), inset 0 0 0 2px rgba(255,255,255,0.1)',
            border: '10px solid #1a1a1a', position: 'relative',
          }}>
            {/* 頂部狀態欄 */}
            <div style={{
              position: 'absolute', top: 16, left: 0, right: 0,
              padding: '0 24px', display: 'flex', justifyContent: 'space-between',
              alignItems: 'center', fontSize: 12, color: '#333', fontWeight: 600,
            }}>
              <span>9:41</span>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <WifiOutlined style={{ fontSize: 14 }} />
                <span style={{ fontSize: 11 }}>📶</span>
                <span style={{ fontSize: 11 }}>🔋</span>
              </div>
            </div>
            {/* 屏幕內容區 */}
            <div style={{
              background: '#fff', borderRadius: 24, padding: '16px 16px 24px',
              height: 'calc(100% - 20px)', overflow: 'hidden',
              boxShadow: 'inset 0 0 0 1px rgba(0,0,0,0.08)',
            }}>
              {/* 搜索框 */}
              <div style={{
                background: '#F5F5F5', borderRadius: 20, padding: '10px 16px',
                display: 'flex', alignItems: 'center', gap: 8, color: '#999',
                fontSize: 14, marginBottom: 20, border: '1px solid #EEEEEE',
              }}>
                <SearchOutlined style={{ color: '#BFBFBF', fontSize: 16 }} />
                <span style={{ color: '#BFBFBF' }}>搜索你想要的...</span>
              </div>
              {/* 熱搜詞列表 */}
              <div style={{ padding: '0 4px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 14 }}>
                  <FireOutlined style={{ color: '#E8720C', fontSize: 15 }} />
                  <span style={{ fontSize: 14, fontWeight: 600, color: '#333' }}>熱搜</span>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                  {results.map((item) => (
                    <span key={item.rank} style={{
                      display: 'inline-block', padding: '6px 14px', borderRadius: 16,
                      fontSize: 13, border: `2px solid ${item.style.borderColor}`,
                      background: item.style.bgColor, color: item.style.fontColor,
                      boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
                    }}>
                      {item.rank <= 3 && (
                        <span style={{
                          color: item.rank === 1 ? '#E8720C' : item.rank === 2 ? '#F58A2E' : '#FAAD14',
                          fontWeight: 700, marginRight: 3,
                        }}>{item.rank}</span>
                      )}
                      {item.word}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* 列表視圖 */}
          <div style={{ flex: 1, minWidth: 360 }}>
            <Card
              title={
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 15, fontWeight: 600 }}>📋 當前生效熱搜詞列表</span>
                  <Tag color="orange">共 {results.length} 個熱搜詞</Tag>
                </div>
              }
              style={{ borderRadius: 8 }}
            >
              <Table<HotSearchItem>
                columns={columns}
                dataSource={results}
                pagination={{
                  pageSize: 10, showSizeChanger: true, pageSizeOptions: ['10', '20', '50'],
                  showQuickJumper: true, showTotal: (total) => `共 ${total} 條`,
                }}
                size="small"
                rowKey={(r) => `${r.rank}-${r.word}`}
              />
            </Card>
          </div>
        </div>
      )}

      {searched && results.length === 0 && (
        <div style={{ textAlign: 'center', padding: '60px 0' }}>
          <Empty description="暫無生效的熱搜詞配置" />
        </div>
      )}

      {!searched && (
        <div style={{ textAlign: 'center', padding: '60px 0', color: '#bbb' }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>🔥</div>
          <div style={{ fontSize: 15 }}>請設置篩選條件後，點擊「校驗熱搜」查看熱搜詞配置</div>
        </div>
      )}
    </div>
  )
}
