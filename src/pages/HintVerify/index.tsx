import { useState, useEffect, useRef } from 'react'
import {
  Card, Input, Button, Select, Space, Tag, Table, Row, Col, Form, Modal,
} from 'antd'
import type { TableColumnsType } from 'antd'
import {
  SearchOutlined, ReloadOutlined, EyeOutlined,
  FontSizeOutlined, EnvironmentOutlined,
} from '@ant-design/icons'

// ============================
// 常量定义
// ============================

const CHANNELS = [
  { key: 'home', label: '大首頁' },
  { key: 'takeaway', label: '外賣頻道' },
  { key: 'groupBuy', label: '團購頻道' },
  { key: 'supermarket', label: '超市頻道' },
]

const BRAND_OPTIONS = [
  { label: 'mFood', value: 'mFood' },
  { label: '閃蜂', value: 'flashBee' },
]

const REGION_OPTIONS = [
  { label: '澳門半島', value: 'macau' },
  { label: '氹仔路半島', value: 'taipa' },
  { label: '珠海市', value: 'zhuhai' },
  { label: '橫琴粵深度合作區', value: 'hengqin' },
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

interface HintVerifyResult {
  hintId: string
  hintWord: string
  priority: number
  brand: string
  region: string
  crowd: string
  effectDate: string
  jumpType?: string
  jumpTarget?: string
  status: 'active' | 'inactive' | 'expired'
}

// ============================
// Mock 數據
// ============================

const MOCK_DATA: HintVerifyResult[] = [
  {
    hintId: 'DW20261221', hintWord: '今日特惠外賣', priority: 1, brand: 'mFood',
    region: '澳門半島', crowd: '全部用戶', effectDate: '2026-02-28 ~ 2027-02-28',
    jumpType: 'h5', jumpTarget: 'https://mfood.com/special', status: 'active',
  },
  {
    hintId: 'DW20261222', hintWord: '新鮮水果送到家', priority: 2, brand: '閃蜂',
    region: '澳門半島', crowd: '新用戶', effectDate: '2026-02-28 ~ 2027-02-28',
    jumpType: 'none', status: 'active',
  },
  {
    hintId: 'DW20261223', hintWord: '下午茶限時折扣', priority: 3, brand: 'mFood',
    region: '氹仔路半島', crowd: 'VIP用戶', effectDate: '2026-02-28 ~ 2027-02-28',
    jumpType: 'checkInCenter', status: 'active',
  },
  {
    hintId: 'DW20261224', hintWord: '晚餐特惠套餐', priority: 4, brand: 'mFood',
    region: '珠海市', crowd: '老用戶', effectDate: '2026-02-28 ~ 2027-02-28',
    jumpType: 'personalCenter', status: 'active',
  },
  {
    hintId: 'DW20261225', hintWord: '宵夜燒烤特價', priority: 5, brand: 'mFood',
    region: '澳門半島', crowd: '全部用戶', effectDate: '2026-03-01 ~ 2027-03-01',
    jumpType: 'none', status: 'active',
  },
  {
    hintId: 'DW20261226', hintWord: '早餐粥品半價', priority: 6, brand: '閃蜂',
    region: '氹仔路半島', crowd: '新用戶', effectDate: '2026-03-15 ~ 2027-03-15',
    jumpType: 'h5', jumpTarget: 'https://flashbee.com/breakfast', status: 'active',
  },
]

const jumpTypeMap: Record<string, string> = {
  none: '無跳轉',
  h5: 'H5鏈接',
  checkInCenter: '簽到中心',
  personalCenter: '個人中心',
  couponCenter: '領券中心',
  takeawayChannel: '外賣頻道',
}

const statusMap: Record<string, { color: string; text: string }> = {
  active: { color: 'green', text: '生效中' },
  inactive: { color: 'default', text: '已停用' },
  expired: { color: 'red', text: '已過期' },
}

// ============================
// 地圖位置列表
// ============================

const MAP_LOCATIONS = [
  { name: '澳門旅遊塔', lat: 22.1853, lng: 113.5368 },
  { name: '大三巴牌坊', lat: 22.1956, lng: 113.5409 },
  { name: '威尼斯人度假村', lat: 22.1355, lng: 113.5645 },
  { name: '澳門大學', lat: 22.1300, lng: 113.5450 },
  { name: '珠海市拱北口岸', lat: 22.2170, lng: 113.5500 },
  { name: '橫琴口岸', lat: 22.1200, lng: 113.5400 },
  { name: '氹仔市中心', lat: 22.1550, lng: 113.5580 },
]

// ============================
// 主組件
// ============================

export default function HintVerify() {
  const [channel, setChannel] = useState('home')
  const [brand, setBrand] = useState('mFood')
  const [region, setRegion] = useState('macau')
  const [timeSlot, setTimeSlot] = useState('allDay')
  const [userId, setUserId] = useState('')
  const [location, setLocation] = useState({ name: '澳門旅遊塔', lat: 22.1853, lng: 113.5368 })
  const [results, setResults] = useState<HintVerifyResult[]>([])
  const [searched, setSearched] = useState(false)

  // 地圖選點
  const [isMapModalOpen, setIsMapModalOpen] = useState(false)
  const [mapSearchText, setMapSearchText] = useState('')
  const [selectedLocation, setSelectedLocation] = useState<{name: string, lat: number, lng: number} | null>(null)

  // 底紋輪播
  const [currentHintIndex, setCurrentHintIndex] = useState(0)
  const [isAnimating, setIsAnimating] = useState(false)
  const intervalRef = useRef<NodeJS.Timeout | null>(null)

  const handleMapConfirm = () => {
    if (selectedLocation) {
      setLocation(selectedLocation)
      setIsMapModalOpen(false)
    }
  }

  const handleSearch = () => {
    setResults(MOCK_DATA)
    setSearched(true)
    setCurrentHintIndex(0)
  }

  const handleReset = () => {
    setChannel('home')
    setBrand('mFood')
    setRegion('macau')
    setTimeSlot('allDay')
    setUserId('')
    setLocation({ name: '澳門旅遊塔', lat: 22.1853, lng: 113.5368 })
    setResults([])
    setSearched(false)
    setCurrentHintIndex(0)
  }

  // 底紋詞輪播動畫
  useEffect(() => {
    if (results.length > 0) {
      intervalRef.current = setInterval(() => {
        setIsAnimating(true)
        setTimeout(() => {
          setCurrentHintIndex((prev) => (prev + 1) % results.length)
          setIsAnimating(false)
        }, 500)
      }, 3000)
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [results.length])

  const currentHint = results[currentHintIndex]

  const columns: TableColumnsType<HintVerifyResult> = [
    { title: '底紋ID', dataIndex: 'hintId', width: 110 },
    {
      title: '底紋詞', dataIndex: 'hintWord', width: 160,
      render: (v: string) => <span style={{ fontWeight: 600 }}>{v}</span>,
    },
    {
      title: '優先級', dataIndex: 'priority', width: 80, align: 'center',
      render: (v: number) => <Tag color="gold">{v}</Tag>,
      sorter: (a, b) => a.priority - b.priority,
      defaultSortOrder: 'ascend',
    },
    { title: '品牌', dataIndex: 'brand', width: 80 },
    { title: '區域', dataIndex: 'region', width: 100 },
    { title: '人群', dataIndex: 'crowd', width: 90 },
    { title: '生效時間', dataIndex: 'effectDate', width: 190 },
    {
      title: '狀態', dataIndex: 'status', width: 80,
      render: (v: string) => <Tag color={statusMap[v]?.color}>{statusMap[v]?.text}</Tag>,
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
          <FontSizeOutlined style={{ fontSize: 20, color: '#1890ff' }} />
          <div>
            <h2 style={{ margin: 0, fontSize: 17, fontWeight: 600, color: '#1890ff' }}>
              底紋校驗
            </h2>
            <div style={{ fontSize: 12, color: '#999', marginTop: 2 }}>
              校驗底紋詞在不同頻道、區域、人群下的展示效果
            </div>
          </div>
        </div>
      </div>

      {/* 篩選條件 */}
      <Card
        title={<Space><FontSizeOutlined style={{ color: '#1890ff' }} /><span>底紋校驗條件</span></Space>}
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
                <Select value={brand} onChange={setBrand} options={BRAND_OPTIONS} />
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
            <Col span={6}>
              <Form.Item label="用戶（可選）" style={{ marginBottom: 12 }}>
                <Input value={userId} onChange={e => setUserId(e.target.value)}
                  placeholder="輸入用戶ID或手機號" allowClear />
              </Form.Item>
            </Col>
            <Col span={6}>
              <Form.Item label="地圖踩點" style={{ marginBottom: 12 }}>
                <Input
                  value={`${location.name}（${location.lat.toFixed(4)}, ${location.lng.toFixed(4)}）`}
                  readOnly
                  prefix={<EnvironmentOutlined style={{ color: '#1890ff' }} />}
                  style={{ cursor: 'pointer' }}
                  placeholder="點擊選擇位置"
                  onClick={() => setIsMapModalOpen(true)}
                />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item label="&nbsp;" style={{ marginBottom: 12 }}>
                <Space style={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <Button type="primary" icon={<EyeOutlined />} onClick={handleSearch}>
                    校驗底紋
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
        <Row gutter={20}>
          {/* 左側：手機預覽 */}
          <Col span={10}>
            <Card title={<span style={{ fontSize: 15, fontWeight: 600 }}>📱 手機端預覽</span>}
              style={{ borderRadius: 8, position: 'sticky', top: 20 }}>
              <div style={{ display: 'flex', justifyContent: 'center' }}>
                <div style={{
                  width: 375, height: 720,
                  background: 'linear-gradient(180deg, #f5f5f5 0%, #e8e8e8 100%)',
                  borderRadius: 40, padding: '60px 20px 30px',
                  boxShadow: '0 12px 32px rgba(0, 0, 0, 0.25), inset 0 0 0 2px rgba(255,255,255,0.1)',
                  border: '10px solid #1a1a1a', position: 'relative',
                }}>
                  {/* 狀態欄 */}
                  <div style={{
                    position: 'absolute', top: 16, left: 0, right: 0,
                    display: 'flex', justifyContent: 'space-between',
                    padding: '0 24px', fontSize: 12, color: '#333', fontWeight: 600,
                  }}>
                    <span>9:41</span>
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                      <span style={{ fontSize: 14 }}>📶</span>
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
                      marginBottom: 20, display: 'flex', alignItems: 'center', gap: 10,
                      boxShadow: '0 2px 8px rgba(0, 0, 0, 0.06)', border: '1px solid #EEEEEE',
                    }}>
                      <SearchOutlined style={{ color: '#BFBFBF', fontSize: 16 }} />
                      <div style={{ flex: 1, position: 'relative', height: 24, overflow: 'hidden' }}>
                        {/* 當前詞 */}
                        <div style={{
                          position: 'absolute', top: isAnimating ? '-24px' : '0',
                          left: 0, right: 0, height: 24, display: 'flex', alignItems: 'center',
                          transition: 'top 0.5s ease-in-out',
                        }}>
                          <span style={{ fontSize: 14, color: '#666', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {currentHint?.hintWord || '請輸入搜索關鍵詞'}
                          </span>
                        </div>
                        {/* 下一個詞 */}
                        <div style={{
                          position: 'absolute', top: isAnimating ? '0' : '100%',
                          left: 0, right: 0, height: 24, display: 'flex', alignItems: 'center',
                          transition: 'top 0.5s ease-in-out',
                        }}>
                          <span style={{ fontSize: 14, color: '#666', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {results[(currentHintIndex + 1) % results.length]?.hintWord}
                          </span>
                        </div>
                      </div>
                    </div>
                    {/* 輪播指示器 */}
                    <div style={{ textAlign: 'center', marginBottom: 20 }}>
                      <div style={{ display: 'inline-flex', gap: 6, padding: '6px 12px', background: 'rgba(24, 144, 255, 0.05)', borderRadius: 12 }}>
                        {results.map((_, index) => (
                          <div key={index} style={{
                            width: index === currentHintIndex ? 20 : 8, height: 8, borderRadius: 4,
                            background: index === currentHintIndex ? '#1890ff' : '#d9d9d9',
                            transition: 'all 0.3s ease',
                          }} />
                        ))}
                      </div>
                    </div>
                    {/* 當前底紋詞信息 */}
                    {currentHint && (
                      <div style={{ background: '#FAFAFA', padding: 16, borderRadius: 12, border: '1px solid #F0F0F0' }}>
                        <div style={{ fontSize: 13, color: '#999', marginBottom: 8 }}>當前底紋配置</div>
                        <div style={{ fontSize: 16, fontWeight: 600, color: '#1890ff', marginBottom: 8 }}>{currentHint.hintWord}</div>
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                          <Tag color="blue">ID: {currentHint.hintId}</Tag>
                          <Tag color="gold">優先級 {currentHint.priority}</Tag>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </Card>
          </Col>

          {/* 右側：底紋配置詳情列表 */}
          <Col span={14}>
            <Card
              title={
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 15, fontWeight: 600 }}>📋 底紋配置詳情</span>
                  <Tag color="blue">共 {results.length} 個配置</Tag>
                </div>
              }
              style={{ borderRadius: 8 }}
            >
              <Table<HintVerifyResult>
                columns={columns}
                dataSource={results}
                pagination={{
                  pageSize: 10, showSizeChanger: true, pageSizeOptions: ['10', '20', '50'],
                  showQuickJumper: true, showTotal: (total) => `共 ${total} 條`,
                }}
                size="small"
                rowKey="hintId"
              />
            </Card>
          </Col>
        </Row>
      )}

      {!searched && (
        <div style={{ textAlign: 'center', padding: '60px 0', color: '#bbb' }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>💡</div>
          <div style={{ fontSize: 15 }}>請設置篩選條件後，點擊「校驗底紋」查看底紋詞配置</div>
        </div>
      )}

      {/* 地圖選點彈窗 */}
      <Modal
        title={<div style={{ fontSize: 16, fontWeight: 600, color: '#1890ff' }}>🗺️ 地圖踩點</div>}
        open={isMapModalOpen}
        onCancel={() => setIsMapModalOpen(false)}
        width={700}
        footer={
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, padding: '12px 0' }}>
            <Button onClick={() => setIsMapModalOpen(false)}>取消</Button>
            <Button type="primary" onClick={handleMapConfirm} disabled={!selectedLocation}>確認選擇</Button>
          </div>
        }
      >
        <div style={{ padding: '12px 0' }}>
          <Input placeholder="搜索位置名稱" value={mapSearchText} onChange={e => setMapSearchText(e.target.value)}
            prefix={<SearchOutlined />} size="large" allowClear style={{ marginBottom: 16 }} />
          <div style={{
            width: '100%', height: 320,
            background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
            borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#fff', fontSize: 16, marginBottom: 16,
          }}>
            <div style={{ textAlign: 'center' }}>
              <EnvironmentOutlined style={{ fontSize: 48, marginBottom: 12 }} />
              <div style={{ fontSize: 14, opacity: 0.9 }}>地圖區域（模擬）</div>
              {selectedLocation && (
                <div style={{ marginTop: 12, padding: 10, background: 'rgba(255,255,255,0.2)', borderRadius: 8 }}>
                  <div style={{ fontWeight: 600 }}>📍 {selectedLocation.name}</div>
                  <div style={{ fontSize: 13 }}>緯度: {selectedLocation.lat.toFixed(4)} | 經度: {selectedLocation.lng.toFixed(4)}</div>
                </div>
              )}
            </div>
          </div>
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 10, color: '#666' }}>熱門位置（點擊選擇）</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 200, overflowY: 'auto' }}>
            {MAP_LOCATIONS
              .filter(loc => !mapSearchText || loc.name.includes(mapSearchText))
              .map(loc => (
                <div key={`${loc.lat}-${loc.lng}`} onClick={() => setSelectedLocation(loc)}
                  style={{
                    padding: '10px 14px', background: selectedLocation?.name === loc.name ? '#e6f7ff' : '#f5f5f5',
                    borderRadius: 6, cursor: 'pointer',
                    border: selectedLocation?.name === loc.name ? '2px solid #1890ff' : '2px solid transparent',
                    transition: 'all 0.2s ease',
                  }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <span style={{ fontSize: 14, fontWeight: 500, color: '#333' }}>📍 {loc.name}</span>
                      <span style={{ fontSize: 12, color: '#999', marginLeft: 8 }}>{loc.lat.toFixed(4)}, {loc.lng.toFixed(4)}</span>
                    </div>
                    {selectedLocation?.name === loc.name && <Tag color="blue">已選擇</Tag>}
                  </div>
                </div>
              ))}
          </div>
        </div>
      </Modal>
    </div>
  )
}
