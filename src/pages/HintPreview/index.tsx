import { useState, useEffect, useRef } from 'react'
import { Button, Card, Select, Space, Tag, Form, Input, Row, Col, Divider, Modal } from 'antd'
import { SearchOutlined, ReloadOutlined, EyeOutlined, EnvironmentOutlined } from '@ant-design/icons'
import { BRAND_OPTIONS as brandOptions } from '../../constants/brand'

/** 搜索频道 */
const searchChannelOptions = [
  { label: '大首頁', value: 'home' },
  { label: '外賣頻道', value: 'takeaway' },
  { label: '團購頻道', value: 'groupBuy' },
  { label: '超市頻道', value: 'supermarket' },
]

const regionOptions = [
  { label: '澳門半島', value: 'macau' },
  { label: '氹仔路半島', value: 'taipa' },
  { label: '珠海市', value: 'zhuhai' },
  { label: '橫琴粵深度合作區', value: 'hengqin' },
]

const timeSlotOptions = [
  { label: '全時段', value: 'allDay' },
  { label: '早餐', value: 'breakfast' },
  { label: '午餐', value: 'lunch' },
  { label: '下午茶', value: 'afternoonTea' },
  { label: '晚餐', value: 'dinner' },
  { label: '宵夜', value: 'midnightSnack' },
]

/** 模擬底紋預覽數據 */
interface HintPreviewItem {
  hintId: string
  hintWord: string
  priority: number
  brand: string
  region: string
  crowd: string
  effectDate: string
  jumpType?: string
  jumpTarget?: string
}

const previewData: HintPreviewItem[] = [
  {
    hintId: 'DW20261221',
    hintWord: '今日特惠外賣',
    priority: 1,
    brand: 'mFood',
    region: '澳門半島',
    crowd: '全部用戶',
    effectDate: '2026-02-28 ~ 2027-02-28',
    jumpType: 'h5',
    jumpTarget: 'https://mfood.com/special',
  },
  {
    hintId: 'DW20261222',
    hintWord: '新鮮水果送到家',
    priority: 2,
    brand: '閃蜂',
    region: '澳門半島',
    crowd: '新用戶',
    effectDate: '2026-02-28 ~ 2027-02-28',
    jumpType: 'none',
  },
  {
    hintId: 'DW20261223',
    hintWord: '下午茶限時折扣',
    priority: 3,
    brand: 'mFood',
    region: '氹仔路半島',
    crowd: 'VIP用戶',
    effectDate: '2026-02-28 ~ 2027-02-28',
    jumpType: 'checkInCenter',
  },
  {
    hintId: 'DW20261224',
    hintWord: '晚餐特惠套餐',
    priority: 4,
    brand: 'mFood',
    region: '珠海市',
    crowd: '老用戶',
    effectDate: '2026-02-28 ~ 2027-02-28',
    jumpType: 'personalCenter',
  },
]

export default function HintPreview() {
  const [searchChannel, setSearchChannel] = useState('home')
  const [brand, setBrand] = useState('mFood')
  const [region, setRegion] = useState('macau')
  const [timeSlot, setTimeSlot] = useState('allDay')
  const [userId, setUserId] = useState('')
  const [location, setLocation] = useState({ lat: 22.1987, lng: 113.5439 })
  const [previewItems, setPreviewItems] = useState<HintPreviewItem[]>(previewData)
  const [currentHintIndex, setCurrentHintIndex] = useState(0)
  const [isAnimating, setIsAnimating] = useState(false)
  const [isMapModalOpen, setIsMapModalOpen] = useState(false)
  const [mapSearchText, setMapSearchText] = useState('')
  const [selectedLocation, setSelectedLocation] = useState<{name: string, lat: number, lng: number} | null>(null)
  const intervalRef = useRef<NodeJS.Timeout | null>(null)

  const handlePreview = () => {
    setPreviewItems(previewData)
    setCurrentHintIndex(0)
  }

  const handleReset = () => {
    setSearchChannel('home')
    setBrand('mFood')
    setRegion('macau')
    setTimeSlot('allDay')
    setUserId('')
    setLocation({ lat: 22.1987, lng: 113.5439 })
    setPreviewItems(previewData)
    setCurrentHintIndex(0)
  }

  // 模拟地图搜索结果
  const mapLocations = [
    { name: '澳門旅遊塔', lat: 22.1853, lng: 113.5368 },
    { name: '大三巴牌坊', lat: 22.1956, lng: 113.5409 },
    { name: '威尼斯人度假村', lat: 22.1355, lng: 113.5645 },
    { name: '澳門大學', lat: 22.1300, lng: 113.5450 },
    { name: '珠海市拱北口岸', lat: 22.2170, lng: 113.5500 },
  ]

  const handleMapLocationSelect = (loc: {name: string, lat: number, lng: number}) => {
    setSelectedLocation(loc)
  }

  const handleMapConfirm = () => {
    if (selectedLocation) {
      setLocation({ lat: selectedLocation.lat, lng: selectedLocation.lng })
      setIsMapModalOpen(false)
    }
  }

  // 底纹词轮播动画
  useEffect(() => {
    if (previewItems.length > 0) {
      intervalRef.current = setInterval(() => {
        setIsAnimating(true)
        setTimeout(() => {
          setCurrentHintIndex((prev) => (prev + 1) % previewItems.length)
          setIsAnimating(false)
        }, 500)
      }, 3000)
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
      }
    }
  }, [previewItems.length])

  const channelMap: Record<string, string> = {
    home: '大首頁',
    takeaway: '外賣頻道',
    groupBuy: '團購頻道',
    supermarket: '超市頻道',
  }

  const jumpTypeMap: Record<string, string> = {
    none: '無跳轉',
    h5: 'H5鏈接',
    checkInCenter: '簽到中心',
    personalCenter: '個人中心',
    couponCenter: '領券中心',
    takeawayChannel: '外賣頻道',
  }

  const currentHint = previewItems[currentHintIndex]

  return (
    <div className="content-area">
      {/* 页面标题 */}
      <div style={{
        background: '#fff',
        padding: '12px 20px',
        marginBottom: 12,
        borderRadius: 8,
        boxShadow: '0 2px 8px rgba(0, 0, 0, 0.06)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <EyeOutlined style={{ fontSize: 20, color: '#1890ff' }} />
          <div>
            <h2 style={{ margin: 0, fontSize: 17, fontWeight: 600, color: '#1890ff' }}>
              底紋效果預覽
            </h2>
            <div style={{ fontSize: 12, color: '#999', marginTop: 2 }}>
              預覽不同場景下搜索框展示的底紋詞效果
            </div>
          </div>
        </div>
      </div>

      {/* 筛选区域 */}
      <Card
        title={
          <div style={{ fontSize: 14, fontWeight: 600 }}>
            🎯 篩選條件
          </div>
        }
        style={{ marginBottom: 12, borderRadius: 8 }}
        bodyStyle={{ padding: '16px 24px' }}
      >
        <Form layout="vertical">
          <Row gutter={16}>
            <Col span={6}>
              <Form.Item label="搜索頻道" style={{ marginBottom: 12 }}>
                <Select value={searchChannel} onChange={setSearchChannel} options={searchChannelOptions} />
              </Form.Item>
            </Col>
            <Col span={6}>
              <Form.Item label="所屬品牌" style={{ marginBottom: 12 }}>
                <Select value={brand} onChange={setBrand} options={brandOptions} />
              </Form.Item>
            </Col>
            <Col span={6}>
              <Form.Item label="展示區域" style={{ marginBottom: 12 }}>
                <Select value={region} onChange={setRegion} options={regionOptions} />
              </Form.Item>
            </Col>
            <Col span={6}>
              <Form.Item label="展示時段" style={{ marginBottom: 12 }}>
                <Select value={timeSlot} onChange={setTimeSlot} options={timeSlotOptions} />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={8}>
              <Form.Item label="用戶" style={{ marginBottom: 12 }}>
                <Input
                  value={userId}
                  onChange={(e) => setUserId(e.target.value)}
                  placeholder="請輸入用戶ID或手機號"
                  allowClear
                />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item label="地圖踩點" style={{ marginBottom: 12 }}>
                <Input
                  value={`${location.lat.toFixed(4)}, ${location.lng.toFixed(4)}`}
                  readOnly
                  prefix={<EnvironmentOutlined style={{ color: '#1890ff' }} />}
                  style={{ cursor: 'pointer' }}
                  placeholder="點擊選擇位置"
                  onClick={() => setIsMapModalOpen(true)}
                />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item label="&nbsp;" style={{ marginBottom: 12 }}>
                <Space style={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <Button type="primary" icon={<EyeOutlined />} onClick={handlePreview}>
                    查詢預覽
                  </Button>
                  <Button icon={<ReloadOutlined />} onClick={handleReset}>
                    重置
                  </Button>
                </Space>
              </Form.Item>
            </Col>
          </Row>
        </Form>
      </Card>

      {/* 预览区域 */}
      <div>
        <Row gutter={20}>
          {/* 左侧：手机预览框 */}
          <Col span={10}>
            <Card
              title={
                <div style={{ fontSize: 15, fontWeight: 600 }}>
                  📱 手機端預覽
                </div>
              }
              style={{ borderRadius: 8, position: 'sticky', top: 20 }}
            >
              <div style={{
                display: 'flex',
                justifyContent: 'center',
              }}>
                <div style={{
                  width: 375,
                  height: 720,
                  background: 'linear-gradient(180deg, #f5f5f5 0%, #e8e8e8 100%)',
                  borderRadius: 40,
                  padding: '60px 20px 30px',
                  boxShadow: '0 12px 32px rgba(0, 0, 0, 0.25), inset 0 0 0 2px rgba(255,255,255,0.1)',
                  border: '10px solid #1a1a1a',
                  position: 'relative',
                }}>
                  {/* 状态栏 */}
                  <div style={{
                    position: 'absolute',
                    top: 16,
                    left: 0,
                    right: 0,
                    display: 'flex',
                    justifyContent: 'space-between',
                    padding: '0 24px',
                    fontSize: 12,
                    color: '#333',
                    fontWeight: 600,
                  }}>
                    <span>9:41</span>
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                      <span style={{ fontSize: 14 }}>📶</span>
                      <span style={{ fontSize: 11 }}>📶</span>
                      <span style={{ fontSize: 11 }}>🔋</span>
                    </div>
                  </div>

                  {/* 屏幕内容区 */}
                  <div style={{
                    background: '#fff',
                    borderRadius: 24,
                    padding: '16px 16px 24px',
                    height: 'calc(100% - 20px)',
                    overflow: 'hidden',
                    boxShadow: 'inset 0 0 0 1px rgba(0,0,0,0.08)',
                  }}>
                    {/* 搜索框 - 顶部直接显示 */}
                    <div style={{
                      background: '#F5F5F5',
                      borderRadius: 20,
                      padding: '10px 16px',
                      marginBottom: 20,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      boxShadow: '0 2px 8px rgba(0, 0, 0, 0.06)',
                      border: '1px solid #EEEEEE',
                    }}>
                      <SearchOutlined style={{ color: '#BFBFBF', fontSize: 16 }} />
                      <div style={{
                        flex: 1,
                        position: 'relative',
                        height: 24,
                        overflow: 'hidden',
                      }}>
                        {/* 当前词 - 向上滑动消失 */}
                        <div style={{
                          position: 'absolute',
                          top: isAnimating ? '-24px' : '0',
                          left: 0,
                          right: 0,
                          height: 24,
                          display: 'flex',
                          alignItems: 'center',
                          transition: 'top 0.5s ease-in-out',
                        }}>
                          <span style={{
                            fontSize: 14,
                            color: '#666',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}>
                            {currentHint?.hintWord || '請輸入搜索關鍵詞'}
                          </span>
                        </div>
                        {/* 下一个词 - 从下方往上滑入 */}
                        <div style={{
                          position: 'absolute',
                          top: isAnimating ? '0' : '100%',
                          left: 0,
                          right: 0,
                          height: 24,
                          display: 'flex',
                          alignItems: 'center',
                          transition: 'top 0.5s ease-in-out',
                        }}>
                          <span style={{
                            fontSize: 14,
                            color: '#666',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}>
                            {previewItems[(currentHintIndex + 1) % previewItems.length]?.hintWord}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* 底纹词轮播指示器 */}
                    {previewItems.length > 0 && (
                      <div style={{
                        textAlign: 'center',
                        marginBottom: 20,
                      }}>
                        <div style={{
                          display: 'inline-flex',
                          gap: 6,
                          padding: '6px 12px',
                          background: 'rgba(24, 144, 255, 0.05)',
                          borderRadius: 12,
                        }}>
                          {previewItems.map((_, index) => (
                            <div
                              key={index}
                              style={{
                                width: index === currentHintIndex ? 20 : 8,
                                height: 8,
                                borderRadius: 4,
                                background: index === currentHintIndex ? '#1890ff' : '#d9d9d9',
                                transition: 'all 0.3s ease',
                              }}
                            />
                          ))}
                        </div>
                      </div>
                    )}

                    {/* 当前底纹词信息 */}
                    {currentHint && (
                      <div style={{
                        background: '#FAFAFA',
                        padding: '16px',
                        borderRadius: 12,
                        border: '1px solid #F0F0F0',
                      }}>
                        <div style={{ fontSize: 13, color: '#999', marginBottom: 8 }}>
                          當前底紋配置
                        </div>
                        <div style={{ fontSize: 16, fontWeight: 600, color: '#1890ff', marginBottom: 8 }}>
                          {currentHint.hintWord}
                        </div>
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                          <Tag color="blue">ID: {currentHint.hintId}</Tag>
                          <Tag color="gold">優先級 {currentHint.priority}</Tag>
                        </div>
                      </div>
                    )}

                    {previewItems.length === 0 && (
                      <div style={{
                        textAlign: 'center',
                        padding: '80px 20px',
                        color: '#999',
                      }}>
                        <div style={{ fontSize: 64, marginBottom: 16 }}>📭</div>
                        <div style={{ fontSize: 15 }}>暫無底紋詞展示</div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </Card>
          </Col>

          {/* 右侧：底紋配置詳情列表 */}
          <Col span={14}>
            <Card
              title={
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 15, fontWeight: 600 }}>
                    📋 底紋配置詳情
                  </span>
                  <Tag color="blue" style={{ fontSize: 13 }}>
                    共 {previewItems.length} 個配置
                  </Tag>
                </div>
              }
              style={{ borderRadius: 8 }}
            >
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {previewItems.map((item, index) => (
                  <Card
                    key={item.hintId}
                    size="small"
                    style={{
                      borderLeft: index === currentHintIndex ? '4px solid #1890ff' : '4px solid #52c41a',
                      borderRadius: 8,
                      background: index === currentHintIndex ? 'linear-gradient(135deg, #f0f5ff 0%, #ffffff 100%)' : '#fff',
                      boxShadow: index === currentHintIndex ? '0 4px 12px rgba(24, 144, 255, 0.15)' : '0 2px 8px rgba(0, 0, 0, 0.08)',
                      transition: 'all 0.3s ease',
                    }}
                  >
                    {/* 头部信息 */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                          <div style={{
                            fontSize: 18,
                            fontWeight: 700,
                            color: index === currentHintIndex ? '#1890ff' : '#52c41a',
                          }}>
                            {item.hintWord}
                          </div>
                          <Tag color="gold" style={{ fontSize: 12 }}>
                            排序 {item.priority}
                          </Tag>
                        </div>
                        <div style={{ fontSize: 13, color: '#666' }}>
                          底紋ID：<span style={{ color: '#1890ff', fontWeight: 600 }}>{item.hintId}</span>
                        </div>
                      </div>
                      {index === currentHintIndex && (
                        <div style={{
                          padding: '6px 12px',
                          background: '#1890ff',
                          color: '#fff',
                          borderRadius: 6,
                          fontSize: 13,
                          fontWeight: 600,
                        }}>
                          ✨ 當前展示
                        </div>
                      )}
                    </div>

                    <Divider style={{ margin: '12px 0' }} />

                    {/* 详细信息 */}
                    <div style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(2, 1fr)',
                      gap: '12px',
                      fontSize: 13,
                    }}>
                      <div>
                        <span style={{ color: '#999' }}>所屬品牌：</span>
                        <span style={{ marginLeft: 4, fontWeight: 500 }}>{item.brand}</span>
                      </div>
                      <div>
                        <span style={{ color: '#999' }}>展示區域：</span>
                        <span style={{ marginLeft: 4 }}>{item.region}</span>
                      </div>
                      <div>
                        <span style={{ color: '#999' }}>指定人群：</span>
                        <Tag color="cyan" style={{ marginLeft: 4 }}>{item.crowd}</Tag>
                      </div>
                      <div>
                        <span style={{ color: '#999' }}>指定搜索：</span>
                        <Tag color={item.jumpType === 'h5' ? 'blue' : item.jumpType === 'none' ? 'default' : 'green'} style={{ marginLeft: 4 }}>
                          {jumpTypeMap[item.jumpType || 'none']}
                        </Tag>
                        {item.jumpType === 'h5' && item.jumpTarget && (
                          <div style={{ marginTop: 4, fontSize: 12, color: '#666', wordBreak: 'break-all' }}>
                            {item.jumpTarget}
                          </div>
                        )}
                      </div>
                      <div style={{ gridColumn: '1 / -1' }}>
                        <span style={{ color: '#999' }}>生效時間：</span>
                        <span style={{ marginLeft: 4, color: '#666' }}>{item.effectDate}</span>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>

              {previewItems.length === 0 && (
                <div style={{
                  textAlign: 'center',
                  padding: '80px 0',
                  color: '#999',
                }}>
                  <div style={{ fontSize: 64, marginBottom: 16 }}>📭</div>
                  <div style={{ fontSize: 15, marginBottom: 8 }}>暫無符合條件的底紋配置</div>
                  <div style={{ fontSize: 13, color: '#bbb' }}>請調整篩選條件後重試</div>
                </div>
              )}
            </Card>
          </Col>
        </Row>
      </div>

      {/* 地图踩点弹窗 */}
      <Modal
        title={
          <div style={{ fontSize: 18, fontWeight: 600, color: '#1890ff' }}>
            🗺️ 地圖踩點
          </div>
        }
        open={isMapModalOpen}
        onCancel={() => setIsMapModalOpen(false)}
        width={700}
        footer={
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, padding: '12px 0' }}>
            <Button onClick={() => setIsMapModalOpen(false)}>
              取消
            </Button>
            <Button type="primary" onClick={handleMapConfirm} disabled={!selectedLocation}>
              確認選擇
            </Button>
          </div>
        }
      >
        <div style={{ padding: '16px 0' }}>
          {/* 搜索框 */}
          <div style={{ marginBottom: 16 }}>
            <Input
              placeholder="搜索位置名稱"
              value={mapSearchText}
              onChange={(e) => setMapSearchText(e.target.value)}
              prefix={<SearchOutlined />}
              size="large"
              allowClear
            />
          </div>

          {/* 地图显示区域 */}
          <div style={{
            width: '100%',
            height: 400,
            background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
            borderRadius: 8,
            position: 'relative',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#fff',
            fontSize: 16,
            marginBottom: 16,
          }}>
            <div style={{ textAlign: 'center' }}>
              <EnvironmentOutlined style={{ fontSize: 48, marginBottom: 12 }} />
              <div style={{ fontSize: 14, opacity: 0.9 }}>
                地圖區域（模擬）
              </div>
              {selectedLocation && (
                <div style={{ marginTop: 16, padding: '12px', background: 'rgba(255, 255, 255, 0.2)', borderRadius: 8 }}>
                  <div style={{ fontWeight: 600, marginBottom: 4 }}>
                    📍 {selectedLocation.name}
                  </div>
                  <div style={{ fontSize: 13 }}>
                    緯度: {selectedLocation.lat.toFixed(4)} | 經度: {selectedLocation.lng.toFixed(4)}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* 搜索结果列表 */}
          <div>
            <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 12, color: '#666' }}>
              熱門位置（點擊選擇）
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {mapLocations
                .filter(loc => !mapSearchText || loc.name.includes(mapSearchText))
                .map((loc) => (
                  <div
                    key={`${loc.lat}-${loc.lng}`}
                    onClick={() => handleMapLocationSelect(loc)}
                    style={{
                      padding: '12px 16px',
                      background: selectedLocation?.name === loc.name ? '#e6f7ff' : '#f5f5f5',
                      borderRadius: 6,
                      cursor: 'pointer',
                      border: selectedLocation?.name === loc.name ? '2px solid #1890ff' : '2px solid transparent',
                      transition: 'all 0.3s ease',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <div style={{ fontSize: 14, fontWeight: 500, color: '#333' }}>
                          📍 {loc.name}
                        </div>
                        <div style={{ fontSize: 12, color: '#999', marginTop: 4 }}>
                          緯度: {loc.lat.toFixed(4)} | 經度: {loc.lng.toFixed(4)}
                        </div>
                      </div>
                      {selectedLocation?.name === loc.name && (
                        <Tag color="blue">已選擇</Tag>
                      )}
                    </div>
                  </div>
                ))}
            </div>
          </div>
        </div>
      </Modal>
    </div>
  )
}
