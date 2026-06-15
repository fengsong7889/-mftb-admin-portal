import { useState } from 'react'
import { Button, Card, Select, Space, Tag, Empty, Form } from 'antd'
import { SearchOutlined, ReloadOutlined, FireOutlined, WifiOutlined } from '@ant-design/icons'

/** 搜索界面 */
const searchPageOptions = [
  { label: '大首頁', value: 'home' },
  { label: '外賣頁', value: 'takeaway' },
  { label: '團購頁', value: 'groupBuy' },
  { label: '超市頁', value: 'supermarket' },
]

const brandOptions = [
  { label: 'mFood', value: 'mFood' },
  { label: '閃蜂', value: 'flashBee' },
]

const terminalOptions = [
  { label: 'APP', value: 'app' },
  { label: '微信小程序', value: 'wechatMini' },
  { label: 'Mpay小應用', value: 'mpayMini' },
  { label: '微信H5', value: 'wechatH5' },
]

const regionOptions = [
  { label: '澳門', value: 'macau' },
  { label: '氹仔', value: 'taipa' },
]

const timeSlotOptions = [
  { label: '全天', value: 'allDay' },
  { label: '早餐', value: 'breakfast' },
  { label: '午餐', value: 'lunch' },
  { label: '下午茶', value: 'afternoonTea' },
  { label: '晚餐', value: 'dinner' },
  { label: '宵夜', value: 'midnightSnack' },
]

/** 模擬預覽數據 */
interface HotSearchItem {
  word: string
  rank: number
  type: string
  style: { borderColor: string; bgColor: string; fontColor: string }
}

const previewData: Record<string, HotSearchItem[]> = {
  'home-mFood-app-macau-lunch': [
    { word: '🔥 限時火鍋優惠', rank: 1, type: 'activity', style: { borderColor: '#E8720C', bgColor: '#FFF7ED', fontColor: '#333' } },
    { word: '🆕 美味漢堡', rank: 2, type: 'merchant', style: { borderColor: '#1890FF', bgColor: '#E6F7FF', fontColor: '#333' } },
    { word: '漢堡包', rank: 3, type: 'hotSearchLib', style: { borderColor: '#F0F0F0', bgColor: '#FAFAFA', fontColor: '#333' } },
    { word: '🧋 珍珠奶茶', rank: 4, type: 'operation', style: { borderColor: '#52C41A', bgColor: '#F6FFED', fontColor: '#333' } },
    { word: '炸雞', rank: 5, type: 'hotSearchLib', style: { borderColor: '#F0F0F0', bgColor: '#FAFAFA', fontColor: '#333' } },
    { word: '🎁 下午茶限時折扣', rank: 6, type: 'activity', style: { borderColor: '#722ED1', bgColor: '#F9F0FF', fontColor: '#333' } },
    { word: '壽司', rank: 7, type: 'merchant', style: { borderColor: '#F0F0F0', bgColor: '#FAFAFA', fontColor: '#333' } },
    { word: '⭐ 咖喱魚蛋', rank: 8, type: 'operation', style: { borderColor: '#FAAD14', bgColor: '#FFFBE6', fontColor: '#333' } },
    { word: '水蟹粥', rank: 9, type: 'hotSearchLib', style: { borderColor: '#F0F0F0', bgColor: '#FAFAFA', fontColor: '#333' } },
    { word: '葡撻', rank: 10, type: 'hotSearchLib', style: { borderColor: '#F0F0F0', bgColor: '#FAFAFA', fontColor: '#333' } },
  ],
  'home-flashBee-app-macau-dinner': [
    { word: '🎉 新鮮水果送到家', rank: 1, type: 'activity', style: { borderColor: '#E8720C', bgColor: '#FFF7ED', fontColor: '#333' } },
    { word: '珍珠奶茶', rank: 2, type: 'hotSearchLib', style: { borderColor: '#F0F0F0', bgColor: '#FAFAFA', fontColor: '#333' } },
    { word: '炸雞', rank: 3, type: 'hotSearchLib', style: { borderColor: '#F0F0F0', bgColor: '#FAFAFA', fontColor: '#333' } },
    { word: '壽司', rank: 4, type: 'merchant', style: { borderColor: '#1890FF', bgColor: '#E6F7FF', fontColor: '#333' } },
    { word: '🍕 披薩', rank: 5, type: 'operation', style: { borderColor: '#52C41A', bgColor: '#F6FFED', fontColor: '#333' } },
  ],
}

const promotionTypeMap: Record<string, string> = { activity: '活動推廣', merchant: '商家推廣', operation: '運營推廣', hotSearchLib: '熱搜詞庫' }

export default function HotSearchPreview() {
  const [searchPage, setSearchPage] = useState('home')
  const [brand, setBrand] = useState('mFood')
  const [terminal, setTerminal] = useState('app')
  const [region, setRegion] = useState('macau')
  const [timeSlot, setTimeSlot] = useState('lunch')
  const [previewItems, setPreviewItems] = useState<HotSearchItem[]>(previewData['home-mFood-app-macau-lunch'] || [])

  const handlePreview = () => {
    const key = `${searchPage}-${brand}-${terminal}-${region}-${timeSlot}`
    setPreviewItems(previewData[key] || [])
  }

  return (
    <div className="content-area">
      {/* 筛选区域 */}
      <div className="search-section">
        <Form layout="inline">
          <Form.Item label="搜索界面">
            <Select value={searchPage} onChange={setSearchPage} options={searchPageOptions} />
          </Form.Item>
          <Form.Item label="所屬品牌">
            <Select value={brand} onChange={setBrand} options={brandOptions} />
          </Form.Item>
          <Form.Item label="展示終端">
            <Select value={terminal} onChange={setTerminal} options={terminalOptions} />
          </Form.Item>
          <Form.Item label="區域">
            <Select value={region} onChange={setRegion} options={regionOptions} />
          </Form.Item>
          <Form.Item label="時段">
            <Select value={timeSlot} onChange={setTimeSlot} options={timeSlotOptions} />
          </Form.Item>
          <Form.Item>
            <div className="search-actions">
              <Button type="primary" icon={<SearchOutlined />} onClick={handlePreview}>預覽</Button>
              <Button icon={<ReloadOutlined />}>重置</Button>
            </div>
          </Form.Item>
        </Form>
      </div>

      {/* 预览区域 */}
      <div style={{ background: '#fff', borderRadius: 8, padding: 24 }}>
        <h3 style={{ marginBottom: 16, fontSize: 15, color: '#333' }}>熱搜詞預覽效果</h3>

        <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
          {/* 手机模型 - 统一样式 */}
          <div style={{
            width: 375,
            height: 720,
            background: 'linear-gradient(180deg, #f5f5f5 0%, #e8e8e8 100%)',
            borderRadius: 40,
            padding: '60px 20px 30px',
            boxShadow: '0 12px 32px rgba(0, 0, 0, 0.25), inset 0 0 0 2px rgba(255,255,255,0.1)',
            border: '10px solid #1a1a1a',
            position: 'relative',
            flexShrink: 0,
          }}>
            {/* 顶部状态栏 */}
            <div style={{
              position: 'absolute',
              top: 16,
              left: 0,
              right: 0,
              padding: '0 24px',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              fontSize: 12,
              color: '#333',
              fontWeight: 600,
            }}>
              <span>9:41</span>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <WifiOutlined style={{ fontSize: 14 }} />
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
              {/* 搜索框 */}
              <div style={{
                background: '#F5F5F5',
                borderRadius: 20,
                padding: '10px 16px',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                color: '#999',
                fontSize: 14,
                marginBottom: 20,
                border: '1px solid #EEEEEE',
              }}>
                <SearchOutlined style={{ color: '#BFBFBF', fontSize: 16 }} />
                <span style={{ color: '#BFBFBF' }}>搜索你想要的...</span>
              </div>

              {/* 热搜词列表 */}
              <div style={{ padding: '0 4px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 14 }}>
                  <FireOutlined style={{ color: '#E8720C', fontSize: 15 }} />
                  <span style={{ fontSize: 14, fontWeight: 600, color: '#333' }}>熱搜</span>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                  {previewItems.length > 0 ? previewItems.map((item) => (
                    <span key={item.rank} style={{
                      display: 'inline-block',
                      padding: '6px 14px',
                      borderRadius: 16,
                      fontSize: 13,
                      border: `2px solid ${item.style.borderColor}`,
                      background: item.style.bgColor,
                      color: item.style.fontColor,
                      boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
                    }}>
                      {item.rank <= 3 && <span style={{ color: item.rank === 1 ? '#E8720C' : item.rank === 2 ? '#F58A2E' : '#FAAD14', fontWeight: 700, marginRight: 3 }}>{item.rank}</span>}
                      {item.word}
                    </span>
                  )) : (
                    <span style={{ color: '#999', fontSize: 13 }}>暫無熱搜詞</span>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* 列表视图 */}
          <div style={{ flex: 1, minWidth: 360 }}>
            <h4 style={{ marginBottom: 12, color: '#666' }}>當前生效熱搜詞列表</h4>
            {previewItems.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {previewItems.map((item) => (
                  <Card key={item.rank} size="small" style={{ borderRadius: 6 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{
                          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                          width: 22, height: 22, borderRadius: 4, fontSize: 12,
                          background: item.rank <= 3 ? '#E8720C' : '#F0F0F0',
                          color: item.rank <= 3 ? '#fff' : '#999', fontWeight: 600,
                        }}>
                          {item.rank}
                        </span>
                        <span style={{ fontSize: 14 }}>{item.word}</span>
                      </div>
                      <Tag color={item.type === 'activity' ? 'orange' : item.type === 'merchant' ? 'blue' : item.type === 'operation' ? 'green' : 'default'}>
                        {promotionTypeMap[item.type]}
                      </Tag>
                    </div>
                  </Card>
                ))}
              </div>
            ) : (
              <Empty description="暫無生效的熱搜詞配置" />
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
