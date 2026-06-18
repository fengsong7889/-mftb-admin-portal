import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Card, Input, Button, Select, Space, Tag, Table, Collapse,
  Row, Col, Badge, Modal,
} from 'antd'
import type { TableColumnsType } from 'antd'
import {
  SearchOutlined, CheckCircleOutlined, WarningOutlined,
  ScissorOutlined, StopOutlined, SwapOutlined,
  ShopOutlined, InfoCircleOutlined, EnvironmentOutlined,
  KeyOutlined, TagOutlined,
} from '@ant-design/icons'

// ============================
// 常量定义
// ============================

const CHANNELS = [
  { key: 'home', label: '大首頁', icon: '🏠' },
  { key: 'takeaway', label: '外賣', icon: '🛵' },
  { key: 'supermarket', label: '超市', icon: '🛒' },
  { key: 'groupBuy', label: '團購', icon: '👥' },
]

const BRAND_OPTIONS = [
  { label: 'mFood', value: 'mFood' },
  { label: '閃蜂', value: 'flashBee' },
]

// ============================
// 類型定義
// ============================

interface RuleMatchResult {
  type: 'segmentation' | 'stopWord' | 'synonym' | 'exact' | 'fuzzy' | 'merchantKeyword' | 'productKeyword'
  label: string
  matched: boolean
  details: string
  tags: string[]
}

interface ScoreDetail {
  name: string
  score: number
  description: string
  enabled: boolean
}

interface DimensionScore {
  dimension: string
  score: number
  maxScore: number
  weight: number
  details: ScoreDetail[]
}

interface MerchantResult {
  key: string
  rank: number
  merchantId: string
  merchantName: string
  businessChannel: string
  totalScore: number
  dimensionScores: DimensionScore[]
}

// ============================
// Mock 數據工廠
// ============================

function generateRuleAnalysis(keyword: string): RuleMatchResult[] {
  if (!keyword) return []
  const segs = keyword.length > 2 ? [keyword.slice(0, 2), keyword.slice(2)] : [keyword]
  return [
    {
      type: 'segmentation',
      label: '分詞效果',
      matched: true,
      details: `輸入「${keyword}」經分詞處理後拆分為以下詞組：`,
      tags: segs,
    },
    {
      type: 'stopWord',
      label: '停用詞匹配',
      matched: ['的', '了', '是', '在'].some(w => keyword.includes(w)),
      details: ['的', '了', '是', '在'].some(w => keyword.includes(w))
        ? `命中停用詞，已自動過濾`
        : `未命中任何停用詞`,
      tags: ['的', '了', '是', '在'].filter(w => keyword.includes(w)),
    },
    {
      type: 'synonym',
      label: '同義詞匹配',
      matched: ['漢堡', '奶茶', '火鍋'].some(w => keyword.includes(w)),
      details: ['漢堡', '奶茶', '火鍋'].some(w => keyword.includes(w))
        ? `命中同義詞規則，擴展搜索範圍`
        : `未命中同義詞規則`,
      tags: keyword.includes('漢堡') ? ['汉堡', '堡包', '漢堡包'] : keyword.includes('奶茶') ? ['奶綠', '珍珠奶茶'] : [],
    },
    {
      type: 'merchantKeyword',
      label: '商家關鍵詞命中',
      matched: keyword.length >= 2,
      details: keyword.length >= 2 ? `命中商家關鍵詞規則，匹配商家名稱及標籤` : `輸入過短，未命中商家關鍵詞`,
      tags: keyword.length >= 2 ? ['漢堡王', '必勝客'] : [],
    },
    {
      type: 'productKeyword',
      label: '商品關鍵詞命中',
      matched: ['漢堡', '奶茶', '披薩'].some(w => keyword.includes(w)),
      details: ['漢堡', '奶茶', '披薩'].some(w => keyword.includes(w))
        ? `命中商品關鍵詞規則，匹配商品名稱`
        : `未命中商品關鍵詞規則`,
      tags: keyword.includes('漢堡') ? ['芝士漢堡', '雙層漢堡'] : keyword.includes('奶茶') ? ['珍珠奶茶', '芒果奶茶'] : [],
    },
    {
      type: 'exact',
      label: '精準匹配',
      matched: keyword.length >= 2,
      details: keyword.length >= 2 ? `嘗試精準匹配商家名稱及標籤` : `輸入過短，未觸發精準匹配`,
      tags: [],
    },
    {
      type: 'fuzzy',
      label: '模糊匹配',
      matched: true,
      details: `對原始輸入進行模糊匹配，召回更多結果`,
      tags: [],
    },
  ]
}

function generateMerchantResults(keyword: string, channel: string): MerchantResult[] {
  if (!keyword) return []

  // 基礎門店信息池（按業務頻道分類）
  const takeawayMerchants = [
    { name: '澳門正宗漢堡王', id: 'M100001', score: 892 },
    { name: '漢堡包工坊', id: 'M100002', score: 756 },
    { name: '超級漢堡站', id: 'M100003', score: 645 },
    { name: '漢堡小子', id: 'M100004', score: 520 },
    { name: '必勝客外賣', id: 'M100005', score: 498 },
    { name: '壽司之神', id: 'M100006', score: 475 },
    { name: '麻辣火鍋王', id: 'M100007', score: 450 },
    { name: '珍珠奶茶專門店', id: 'M100008', score: 428 },
    { name: '咖喱魚蛋檔', id: 'M100009', score: 395 },
    { name: '葡撻皇', id: 'M100010', score: 372 },
    { name: '水蟹粥大王', id: 'M100011', score: 348 },
    { name: '酸辣粉之家', id: 'M100012', score: 320 },
    { name: '煲仔飯老店', id: 'M100013', score: 298 },
    { name: '楊枝甘露工坊', id: 'M100014', score: 275 },
    { name: '雞蛋仔小站', id: 'M100015', score: 248 },
    { name: '雲吞麵世家', id: 'M100016', score: 225 },
    { name: '燒臘專門店', id: 'M100017', score: 208 },
    { name: '炒粉小館', id: 'M100018', score: 195 },
    { name: '甜品屋', id: 'M100019', score: 182 },
    { name: '粥品專家', id: 'M100020', score: 168 },
    { name: '快餐便当店', id: 'M100021', score: 155 },
    { name: '日式拉麵', id: 'M100022', score: 142 },
    { name: '泰式料理', id: 'M100023', score: 128 },
    { name: '韓式炸雞', id: 'M100024', score: 115 },
    { name: '西式簡餐', id: 'M100025', score: 102 },
  ]

  const supermarketMerchants = [
    { name: '新苗超市', id: 'S100001', score: 680 },
    { name: '來來超市', id: 'S100002', score: 620 },
    { name: '泰豐超市', id: 'S100003', score: 580 },
    { name: '萬利超市', id: 'S100004', score: 540 },
    { name: '便利生活', id: 'S100005', score: 498 },
    { name: '惠民超市', id: 'S100006', score: 455 },
    { name: '百佳超市', id: 'S100007', score: 420 },
    { name: '大生超市', id: 'S100008', score: 385 },
    { name: '永華超市', id: 'S100009', score: 348 },
    { name: '利源超市', id: 'S100010', score: 312 },
    { name: '興發超市', id: 'S100011', score: 278 },
    { name: '昌盛超市', id: 'S100012', score: 245 },
    { name: '和記超市', id: 'S100013', score: 212 },
    { name: '裕豐超市', id: 'S100014', score: 185 },
    { name: '順利超市', id: 'S100015', score: 158 },
  ]

  const groupBuyMerchants = [
    { name: '威尼斯人團購', id: 'G100001', score: 720 },
    { name: '金沙團購', id: 'G100002', score: 665 },
    { name: '新濠團購', id: 'G100003', score: 610 },
    { name: '銀河團購', id: 'G100004', score: 555 },
    { name: '美高梅團購', id: 'G100005', score: 500 },
    { name: '永利團購', id: 'G100006', score: 450 },
    { name: '英皇團購', id: 'G100007', score: 400 },
    { name: '星際團購', id: 'G100008', score: 355 },
    { name: '金都團購', id: 'G100009', score: 310 },
    { name: '皇冠團購', id: 'G100010', score: 268 },
  ]

  // 各維度默認得分模板（商家關鍵詞與商品關鍵詞已歸類至搜索詞匹配得分）
  const makeDimensionScores = (total: number) => {
    const rel = Math.round(total * 0.18)
    const com = Math.round(total * 0.26)
    const sto = Math.round(total * 0.22)
    const usr = Math.round(total * 0.12)
    const plt = Math.round(total * 0.08)
    const mk = Math.round(total * 0.08)
    const pk = total - rel - com - sto - usr - plt - mk
    return [
      { dimension: '搜索詞匹配得分', score: rel + mk + pk, maxScore: 400, weight: 32, details: [] },
      { dimension: '商業得分', score: com, maxScore: 400, weight: 26, details: [] },
      { dimension: '店鋪得分', score: sto, maxScore: 400, weight: 22, details: [] },
      { dimension: '用戶得分', score: usr, maxScore: 200, weight: 12, details: [] },
      { dimension: '平台得分', score: plt, maxScore: 100, weight: 8, details: [] },
    ]
  }

  // 單頻道生成函數：僅產生該頻道的商家數據
  const generateChannelOnly = (
    merchants: { name: string, id: string, score: number }[],
    channelName: string
  ): MerchantResult[] => {
    const result: MerchantResult[] = []
    let idx = 0
    while (result.length < 50) {
      const m = merchants[idx % merchants.length]
      result.push({
        key: String(result.length + 1),
        rank: result.length + 1,
        merchantId: m.id,
        merchantName: m.name,
        businessChannel: channelName,
        totalScore: m.score,
        dimensionScores: makeDimensionScores(m.score),
      })
      idx++
    }
    return result
  }

  // 按搜索頻道決定生成策略
  if (channel === 'takeaway') {
    return generateChannelOnly(takeawayMerchants, '外賣')
  }
  if (channel === 'supermarket') {
    return generateChannelOnly(supermarketMerchants, '超市')
  }
  if (channel === 'groupBuy') {
    return generateChannelOnly(groupBuyMerchants, '團購')
  }

  // 大首頁：按輪插策略生成 50 條數據：每 3 條外賣 + 1 條團購 + 2 條超市 = 6 條一組
  const result: MerchantResult[] = []
  let tIdx = 0, gIdx = 0, sIdx = 0
  let tRank = 1, gRank = 1, sRank = 1

  while (result.length < 50) {
    // 3 條外賣
    for (let i = 0; i < 3 && result.length < 50; i++) {
      const m = takeawayMerchants[tIdx % takeawayMerchants.length]
      result.push({
        key: String(result.length + 1),
        rank: tRank,
        merchantId: m.id,
        merchantName: m.name,
        businessChannel: '外賣',
        totalScore: m.score,
        dimensionScores: makeDimensionScores(m.score),
      })
      tIdx++
      tRank++
    }
    // 1 條團購
    if (result.length < 50) {
      const m = groupBuyMerchants[gIdx % groupBuyMerchants.length]
      result.push({
        key: String(result.length + 1),
        rank: gRank,
        merchantId: m.id,
        merchantName: m.name,
        businessChannel: '團購',
        totalScore: m.score,
        dimensionScores: makeDimensionScores(m.score),
      })
      gIdx++
      gRank++
    }
    // 2 條超市
    for (let i = 0; i < 2 && result.length < 50; i++) {
      const m = supermarketMerchants[sIdx % supermarketMerchants.length]
      result.push({
        key: String(result.length + 1),
        rank: sRank,
        merchantId: m.id,
        merchantName: m.name,
        businessChannel: '超市',
        totalScore: m.score,
        dimensionScores: makeDimensionScores(m.score),
      })
      sIdx++
      sRank++
    }
  }

  return result
}

// ============================
// 子組件：規則分析面板（折疊）
// ============================

function RuleAnalysisPanel({ rules }: { rules: RuleMatchResult[] }) {
  if (!rules.length) return null
  const iconMap: Record<string, React.ReactNode> = {
    segmentation: <ScissorOutlined />,
    stopWord: <StopOutlined />,
    synonym: <SwapOutlined />,
    merchantKeyword: <KeyOutlined />,
    productKeyword: <TagOutlined />,
    exact: <CheckCircleOutlined />,
    fuzzy: <SearchOutlined />,
  }
  const matchedCount = rules.filter(r => r.matched).length
  return (
    <Collapse
      size="small"
      style={{ marginBottom: 16 }}
      items={[{
        key: 'rule-analysis',
        label: (
          <Space>
            <InfoCircleOutlined style={{ color: '#1890ff' }} />
            <span style={{ fontWeight: 600 }}>規則維度分析</span>
            <Tag color="blue">{matchedCount}/{rules.length} 項命中</Tag>
          </Space>
        ),
        children: (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 }}>
            {rules.map(rule => (
              <div
                key={rule.type}
                style={{
                  padding: '10px 14px',
                  borderRadius: 8,
                  background: rule.matched ? '#f6ffed' : '#fff2f0',
                  border: `1px solid ${rule.matched ? '#b7eb8f' : '#ffccc7'}`,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                  <span style={{ color: rule.matched ? '#52c41a' : '#ff4d4f', fontSize: 14 }}>
                    {iconMap[rule.type]}
                  </span>
                  <span style={{ fontWeight: 600, fontSize: 13 }}>{rule.label}</span>
                  <Badge
                    status={rule.matched ? 'success' : 'error'}
                    text={rule.matched ? '命中' : '未命中'}
                  />
                </div>
                <div style={{ fontSize: 12, color: '#666', marginBottom: rule.tags.length ? 6 : 0 }}>
                  {rule.details}
                </div>
                {rule.tags.length > 0 && (
                  <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                    {rule.tags.map((tag, i) => (
                      <Tag key={i} color={rule.matched ? 'green' : 'red'} style={{ fontSize: 11 }}>
                        {tag}
                      </Tag>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        ),
      }]}
    />
  )
}

// ============================
// 搜索校驗主頁面
// ============================

function SearchVerifyPage() {
  const navigate = useNavigate()
  const [channel, setChannel] = useState('home')
  const [keyword, setKeyword] = useState('')
  const [brand, setBrand] = useState('mFood')
  const [userId, setUserId] = useState('')
  const [location, setLocation] = useState({ name: '澳門旅遊塔', lat: 22.1853, lng: 113.5368 })
  const [isMapModalOpen, setIsMapModalOpen] = useState(false)
  const [mapSearchText, setMapSearchText] = useState('')
  const [selectedLocation, setSelectedLocation] = useState<{name: string, lat: number, lng: number} | null>(null)
  const [ruleResults, setRuleResults] = useState<RuleMatchResult[]>([])
  const [merchantResults, setMerchantResults] = useState<MerchantResult[]>([])
  const [searched, setSearched] = useState(false)

  // 模擬地圖搜索結果
  const mapLocations = [
    { name: '澳門旅遊塔', lat: 22.1853, lng: 113.5368 },
    { name: '大三巴牌坊', lat: 22.1956, lng: 113.5409 },
    { name: '威尼斯人度假村', lat: 22.1355, lng: 113.5645 },
    { name: '澳門大學', lat: 22.1300, lng: 113.5450 },
    { name: '珠海市拱北口岸', lat: 22.2170, lng: 113.5500 },
    { name: '橫琴口岸', lat: 22.1200, lng: 113.5400 },
    { name: '氹仔市中心', lat: 22.1550, lng: 113.5580 },
  ]

  const handleMapConfirm = () => {
    if (selectedLocation) {
      setLocation(selectedLocation)
      setIsMapModalOpen(false)
    }
  }

  const handleSearch = () => {
    if (!keyword.trim()) return
    setRuleResults(generateRuleAnalysis(keyword))
    setMerchantResults(generateMerchantResults(keyword, channel))
    setSearched(true)
  }

  const handleReset = () => {
    setChannel('home')
    setKeyword('')
    setUserId('')
    setLocation({ name: '澳門旅遊塔', lat: 22.1853, lng: 113.5368 })
    setRuleResults([])
    setMerchantResults([])
    setSearched(false)
  }

  const merchantColumns: TableColumnsType<MerchantResult> = [
    {
      title: '排名', dataIndex: 'rank', width: 60, align: 'center',
      render: (v: number) => {
        const colorMap: Record<number, string> = {
          1: '#ff4d4f',
          2: '#fa8c16',
          3: '#faad14',
        }
        return (
          <Tag color={colorMap[v] || 'default'} style={{ fontWeight: 700, minWidth: 28, textAlign: 'center', color: colorMap[v] ? '#fff' : undefined }}>
            {v}
          </Tag>
        )
      },
    },
    {
      title: '門店ID', dataIndex: 'merchantId', width: 100,
      render: (v: string) => <span style={{ color: '#666', fontSize: 12 }}>{v}</span>,
    },
    {
      title: '門店名稱', dataIndex: 'merchantName', width: 160,
      render: (v: string) => <span style={{ fontWeight: 600 }}>{v}</span>,
    },
    {
      title: '業務頻道', dataIndex: 'businessChannel', width: 100,
      render: (v: string) => {
        const colorMap: Record<string, string> = {
          '外賣': 'orange',
          '超市': 'green',
          '團購': 'purple',
        }
        return <Tag color={colorMap[v] || 'blue'}>{v}</Tag>
      },
    },
    {
      title: '加權總分', dataIndex: 'totalScore', width: 90, align: 'center',
      render: (_: number, r: MerchantResult) => {
        const weightedTotal = r.dimensionScores.reduce((sum, ds) => sum + Math.round(ds.score * ds.weight / 100), 0)
        return <span style={{ fontWeight: 700, fontSize: 16, color: '#1890ff' }}>{weightedTotal}</span>
      },
    },
    {
      title: '維度得分', width: 400,
      render: (_: unknown, r: MerchantResult) => (
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          {r.dimensionScores
            .map(ds => (
              <Tag key={ds.dimension} color="blue" style={{ fontSize: 11 }}>
                {ds.dimension}: {Math.round(ds.score * ds.weight / 100)}
              </Tag>
            ))}
        </div>
      ),
    },
    {
      title: '操作', width: 100, align: 'center',
      render: (_: unknown, r: MerchantResult) => (
        <Button type="link" size="small" onClick={() => navigate(`/search-verify-detail/${r.merchantId}`)}>
          查看明細
        </Button>
      ),
    },
  ]

  return (
    <div>
      {/* 查詢區域 */}
      <Card
        title={<Space><SearchOutlined style={{ color: '#1890ff' }} /><span>搜索校驗條件</span></Space>}
        size="small"
        style={{ marginBottom: 16, borderRadius: 8 }}
      >
        <Row gutter={16} style={{ marginBottom: 12 }}>
          <Col span={6}>
            <div style={{ fontSize: 13, color: '#666', marginBottom: 4 }}>搜索頻道</div>
            <Select
              value={channel}
              onChange={setChannel}
              style={{ width: '100%' }}
              options={CHANNELS.map(ch => ({ label: `${ch.icon} ${ch.label}`, value: ch.key }))}
            />
          </Col>
          <Col span={6}>
            <div style={{ fontSize: 13, color: '#666', marginBottom: 4 }}>所屬品牌</div>
            <Select value={brand} onChange={setBrand} options={BRAND_OPTIONS} style={{ width: '100%' }} />
          </Col>
          <Col span={6}>
            <div style={{ fontSize: 13, color: '#666', marginBottom: 4 }}>用戶（可選）</div>
            <Input
              value={userId}
              onChange={e => setUserId(e.target.value)}
              placeholder="輸入用戶ID或手機號"
              allowClear
            />
          </Col>
          <Col span={6}>
            <div style={{ fontSize: 13, color: '#666', marginBottom: 4 }}>地圖位置</div>
            <Input
              value={`${location.name}（${location.lat.toFixed(4)}, ${location.lng.toFixed(4)}）`}
              readOnly
              prefix={<EnvironmentOutlined style={{ color: '#1890ff' }} />}
              style={{ cursor: 'pointer' }}
              placeholder="點擊選擇位置"
              onClick={() => setIsMapModalOpen(true)}
            />
          </Col>
        </Row>

        {/* 搜索輸入框 + 按鈕 */}
        <Row gutter={16}>
          <Col span={18}>
            <Input
              size="large"
              placeholder={`輸入${CHANNELS.find(c => c.key === channel)?.label || ''}搜索內容進行校驗`}
              value={keyword}
              onChange={e => setKeyword(e.target.value)}
              onPressEnter={handleSearch}
              prefix={<SearchOutlined style={{ color: '#1890ff' }} />}
              allowClear
            />
          </Col>
          <Col span={6} style={{ display: 'flex', gap: 8 }}>
            <Button type="primary" size="large" icon={<SearchOutlined />} onClick={handleSearch}
              disabled={!keyword.trim()} style={{ flex: 1 }}>
              校驗搜索
            </Button>
            <Button size="large" icon={<WarningOutlined />} onClick={handleReset}>重置</Button>
          </Col>
        </Row>
      </Card>

      {/* 地圖選點彈窗 */}
      <Modal
        title={
          <div style={{ fontSize: 16, fontWeight: 600, color: '#1890ff' }}>
            🗺️ 地圖選點
          </div>
        }
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
          <Input
            placeholder="搜索位置名稱"
            value={mapSearchText}
            onChange={e => setMapSearchText(e.target.value)}
            prefix={<SearchOutlined />}
            size="large"
            allowClear
            style={{ marginBottom: 16 }}
          />
          {/* 模擬地圖區域 */}
          <div style={{
            width: '100%', height: 320,
            background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
            borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#fff', fontSize: 16, marginBottom: 16, position: 'relative',
          }}>
            <div style={{ textAlign: 'center' }}>
              <EnvironmentOutlined style={{ fontSize: 48, marginBottom: 12 }} />
              <div style={{ fontSize: 14, opacity: 0.9 }}>地圖區域（模擬）</div>
              {selectedLocation && (
                <div style={{ marginTop: 12, padding: '10px', background: 'rgba(255,255,255,0.2)', borderRadius: 8 }}>
                  <div style={{ fontWeight: 600 }}>📍 {selectedLocation.name}</div>
                  <div style={{ fontSize: 13 }}>
                    緯度: {selectedLocation.lat.toFixed(4)} | 經度: {selectedLocation.lng.toFixed(4)}
                  </div>
                </div>
              )}
            </div>
          </div>
          {/* 熱門位置列表 */}
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 10, color: '#666' }}>熱門位置（點擊選擇）</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 200, overflowY: 'auto' }}>
            {mapLocations
              .filter(loc => !mapSearchText || loc.name.includes(mapSearchText))
              .map(loc => (
                <div
                  key={`${loc.lat}-${loc.lng}`}
                  onClick={() => setSelectedLocation(loc)}
                  style={{
                    padding: '10px 14px',
                    background: selectedLocation?.name === loc.name ? '#e6f7ff' : '#f5f5f5',
                    borderRadius: 6, cursor: 'pointer',
                    border: selectedLocation?.name === loc.name ? '2px solid #1890ff' : '2px solid transparent',
                    transition: 'all 0.2s ease',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <span style={{ fontSize: 14, fontWeight: 500, color: '#333' }}>📍 {loc.name}</span>
                      <span style={{ fontSize: 12, color: '#999', marginLeft: 8 }}>
                        {loc.lat.toFixed(4)}, {loc.lng.toFixed(4)}
                      </span>
                    </div>
                    {selectedLocation?.name === loc.name && <Tag color="blue">已選擇</Tag>}
                  </div>
                </div>
              ))
            }
          </div>
        </div>
      </Modal>

      {/* 結果區域 */}
      {searched && (
        <>
          {/* 規則分析 */}
          <RuleAnalysisPanel rules={ruleResults} />

          {/* 商家結果 */}
          <Card
            title={<Space><ShopOutlined style={{ color: '#1890ff' }} /><span>搜索結果 — 門店得分排名</span></Space>}
            size="small"
            extra={<Tag color="blue">共 {merchantResults.length} 個門店</Tag>}
            style={{ borderRadius: 8 }}
          >
            <Table<MerchantResult>
              columns={merchantColumns}
              dataSource={merchantResults}
              pagination={{
                pageSize: 10,
                showSizeChanger: true,
                pageSizeOptions: ['10', '20', '50'],
                showQuickJumper: true,
                showTotal: (total) => `共 ${total} 個門店`,
              }}
              size="small"
            />
          </Card>
        </>
      )}

      {!searched && (
        <div style={{ textAlign: 'center', padding: '60px 0', color: '#bbb' }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>🔍</div>
          <div style={{ fontSize: 15 }}>請在上方輸入搜索內容，點擊「校驗搜索」查看結果</div>
        </div>
      )}
    </div>
  )
}

// ============================
// 主組件
// ============================

export default function SearchVerify() {
  return (
    <div className="content-area">
      {/* 頁面標題 */}
      <div style={{
        background: '#fff', padding: '12px 20px', marginBottom: 12,
        borderRadius: 8, boxShadow: '0 2px 8px rgba(0, 0, 0, 0.06)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <CheckCircleOutlined style={{ fontSize: 20, color: '#1890ff' }} />
          <div>
            <h2 style={{ margin: 0, fontSize: 17, fontWeight: 600, color: '#1890ff' }}>
              搜索校驗
            </h2>
            <div style={{ fontSize: 12, color: '#999', marginTop: 2 }}>
              校驗搜索管理配置的實際效果，包括分詞、停用詞、同義詞、商家關鍵詞、商品關鍵詞規則分析，以及門店得分明細
            </div>
          </div>
        </div>
      </div>

      <SearchVerifyPage />
    </div>
  )
}
