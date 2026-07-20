import { useState, useMemo } from 'react'
import { Button, Space, Table, Tag, Badge, Input, Select, Form, Modal, message, InputNumber, Switch, Descriptions, Divider, Card, Checkbox, Alert, DatePicker, Tabs } from 'antd'
const { RangePicker } = DatePicker
import type { ColumnsType } from 'antd/es/table'
import BrandTag from '../../../components/BrandTag'
import { PlusOutlined, SearchOutlined, ReloadOutlined, LayoutOutlined, ArrowLeftOutlined, AppstoreOutlined, WalletOutlined } from '@ant-design/icons'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { 
  AppType, 
  RecommendChannel, 
  AlgorithmType,
  ServiceStatus,
  Region,
  APP_OPTIONS,
  SERVICE_STATUS_OPTIONS,
  RECOMMEND_CHANNEL_OPTIONS,
  ALGORITHM_TYPE_OPTIONS,
  REGION_OPTIONS,
  ALGO_CARD_COLOR_MAP,
} from '../constants'
import type { WaterfallSlotConfig } from '../types'
import { mockAlgorithmData } from '../Algorithm'
import { useColumnConfig } from '../../../hooks/useColumnConfig'

/** 广告类型卡片配置 */
const ALGORITHM_TYPE_CARDS: { type: AlgorithmType; icon: string; description: string }[] = [
  { type: AlgorithmType.INVINCIBLE_STAR, icon: '⭐', description: '超級曝光位，首頁頂部黃金坑位，強勢引流' },
  { type: AlgorithmType.HOT_REVIVE_AD, icon: '🔥', description: '盤活熱門商家流量，提升店鋪曝光' },
  { type: AlgorithmType.NEW_STORE_AD, icon: '🏪', description: '新店專屬推廣位，快速獲取首批顧客' },
  { type: AlgorithmType.POPULAR_MERCHANT_KA, icon: '🏆', description: '人氣商家專屬推薦位，KA商家流量加持' },
  { type: AlgorithmType.EXCLUSIVE_MERCHANT, icon: '👑', description: '獨家商家專屬展示位，彰顯品牌實力' },
  { type: AlgorithmType.TRAFFIC_AD, icon: '📊', description: '精準流量投放，覆蓋目標用戶群體' },
  { type: AlgorithmType.GUESS_YOU_LIKE, icon: '💡', description: '智能推薦，個性化匹配用戶偏好' },
  { type: AlgorithmType.ORGANIC_TRAFFIC, icon: '🌿', description: '自然流量曝光，提升店鋪基礎流量' },
  { type: AlgorithmType.SEARCH_ALGORITHM, icon: '🔍', description: '搜索算法優化，提升搜索轉化率' },
]

const CHANNEL_LABEL: Record<RecommendChannel, string> = {
  [RecommendChannel.HOME]: '大首頁-Feed',
  [RecommendChannel.DELIVERY]: '外賣頻道-Feed',
  [RecommendChannel.SUPERMARKET]: '超市頻道-Feed',
  [RecommendChannel.GROUP_BUY]: '團購頻道-Feed',
}

/** 展示頁面選項（與廣告銷售一致） */
const CHANNEL_OPTIONS = [
  { label: '大首頁-Feed', value: RecommendChannel.HOME },
  { label: '外賣頻道-Feed', value: RecommendChannel.DELIVERY },
  { label: '超市頻道-Feed', value: RecommendChannel.SUPERMARKET },
  { label: '團購頻道-Feed', value: RecommendChannel.GROUP_BUY },
]

/** 業務頻道映射（由展示頁面推导） */
const CHANNEL_TO_BIZ: Record<number, string> = {
  [RecommendChannel.DELIVERY]: 'food',
  [RecommendChannel.SUPERMARKET]: 'supermarket',
  [RecommendChannel.GROUP_BUY]: 'groupBuy',
}
const BIZ_CHANNEL_POOL = ['food', 'supermarket', 'groupBuy']
const BIZ_CHANNEL_LABEL: Record<string, string> = {
  food: '美食外賣',
  supermarket: '超市百貨',
  groupBuy: '團購到店',
}
const BIZ_CHANNEL_OPTIONS = [
  { label: '美食外賣', value: 'food' },
  { label: '超市百貨', value: 'supermarket' },
  { label: '團購到店', value: 'groupBuy' },
]

const ALGORITHM_TYPE_LABEL: Record<AlgorithmType, string> = {
  [AlgorithmType.INVINCIBLE_STAR]: '無敵星星',
  [AlgorithmType.NEW_STORE_AD]: '新店廣告',
  [AlgorithmType.HOT_REVIVE_AD]: '盤活復蘇',
  [AlgorithmType.EXCLUSIVE_MERCHANT]: '獨家商家',
  [AlgorithmType.POPULAR_MERCHANT_KA]: '人氣商家(KA)',
  [AlgorithmType.TRAFFIC_AD]: '流量廣告',
  [AlgorithmType.GUESS_YOU_LIKE]: '猜你喜歡',
  [AlgorithmType.ORGANIC_TRAFFIC]: '自然流量',
  [AlgorithmType.SEARCH_ALGORITHM]: '搜索算法',
}

const ALGORITHM_TYPE_COLOR: Record<AlgorithmType, string> = {
  [AlgorithmType.INVINCIBLE_STAR]: 'gold',
  [AlgorithmType.NEW_STORE_AD]: 'green',
  [AlgorithmType.HOT_REVIVE_AD]: 'volcano',
  [AlgorithmType.EXCLUSIVE_MERCHANT]: 'purple',
  [AlgorithmType.POPULAR_MERCHANT_KA]: 'red',
  [AlgorithmType.TRAFFIC_AD]: 'cyan',
  [AlgorithmType.GUESS_YOU_LIKE]: 'blue',
  [AlgorithmType.ORGANIC_TRAFFIC]: 'lime',
  [AlgorithmType.SEARCH_ALGORITHM]: 'magenta',
}

// Mock数据 - 瀑布流坑位配置（無敵星星15条 + 盤活復蘇15条）
const generateMockData = (): WaterfallSlotConfig[] => {
  const data: WaterfallSlotConfig[] = []
  const channels = [
    RecommendChannel.HOME,
    RecommendChannel.DELIVERY,
    RecommendChannel.GROUP_BUY,
    RecommendChannel.SUPERMARKET,
  ]
  const apps = [AppType.SHANFENG, AppType.MFOOD]
  const algorithms = [
    { id: 1, name: '無敵星星-首頁版', type: AlgorithmType.INVINCIBLE_STAR },
    { id: 2, name: '新店廣告-外賣版', type: AlgorithmType.NEW_STORE_AD },
    { id: 3, name: '盤活復蘇-團購版', type: AlgorithmType.HOT_REVIVE_AD },
    { id: 4, name: '獨家商家-超市版', type: AlgorithmType.EXCLUSIVE_MERCHANT },
    { id: 5, name: '流量廣告-全渠道', type: AlgorithmType.TRAFFIC_AD },
    { id: 6, name: '猜你喜歡-主力版', type: AlgorithmType.GUESS_YOU_LIKE },
    { id: 7, name: '自然流量-默認', type: AlgorithmType.ORGANIC_TRAFFIC },
    { id: 8, name: '搜索算法-綜合版', type: AlgorithmType.SEARCH_ALGORITHM },
  ]
  const users = ['admin', 'operator', 'user001', 'user002']

  // 推广名称虚拟数据
  const promotionNames = [
    '无敌星星国庆推广',
    '新店广告中秋特惠',
    '盘活广告双十一狂欢',
    '独家商家周年庆',
    '流量广告圣诞特卖',
    '猜你喜欢新年推荐',
    '自然流量春季大促',
    '搜索算法开学季',
    '无敌星星情人节专场',
    '新店广告夏季清凉',
    '盘活广告秋季美食',
    '独家商家冬季暖锅',
    '流量广告周末特惠',
    '猜你喜欢月末冲刺',
    '自然流量节日庆典',
    '搜索算法品牌周',
  ]

  let id = 1
  
  // 使用固定种子生成可预期的数据（避免每次刷新数据不同）
  const pseudoRandom = (seed: number) => {
    const x = Math.sin(seed) * 10000
    return x - Math.floor(x)
  }
  
  // 生成30条数据（無敵星星 15 条 + 盤活復蘇 15 条）
  const typeConfigs = [
    { type: AlgorithmType.INVINCIBLE_STAR, algorithm: algorithms[0], count: 15 },
    { type: AlgorithmType.HOT_REVIVE_AD, algorithm: algorithms[2], count: 15 },
  ]
  let globalIndex = 0
  for (const cfg of typeConfigs) {
    for (let j = 0; j < cfg.count; j++) {
      const i = globalIndex
      const seed = i * 100
      const date = new Date()
      date.setDate(date.getDate() - Math.floor(i / 2))
      const dateStr = date.toISOString().split('T')[0]
      
      const app = apps[Math.floor(pseudoRandom(seed + 1) * apps.length)]
      const channel = channels[Math.floor(pseudoRandom(seed + 2) * channels.length)]
      // 大首頁隨機分配業務頻道，其他頻道直接映射
      const bizChannel = channel === RecommendChannel.HOME
        ? BIZ_CHANNEL_POOL[Math.floor(pseudoRandom(seed + 30) * BIZ_CHANNEL_POOL.length)]
        : CHANNEL_TO_BIZ[channel]
      const slotPosition = 1 + Math.floor(pseudoRandom(seed + 3) * 10)
      const algorithm = cfg.algorithm
      const status = j < 10 ? ServiceStatus.ENABLED : ServiceStatus.DISABLED
      const user = users[Math.floor(pseudoRandom(seed + 6) * users.length)]
      const promotionName = promotionNames[i % promotionNames.length]
      
      const hour = 8 + Math.floor(pseudoRandom(seed + 7) * 12)
      const minute = Math.floor(pseudoRandom(seed + 8) * 60)
      
      data.push({
        id: id++,
        adId: `AD${String(id).padStart(6, '0')}`,
        promotionName,
        app,
        channel,
        bizChannel,
        slotPosition,
        region: [Region.KOKSAA, Region.COSTA, Region.SANMA, Region.FAHUA, Region.AIRPORT][Math.floor(pseudoRandom(seed + 8) * 5)],
        algorithmId: algorithm.id,
        algorithmName: algorithm.name,
        algorithmType: algorithm.type,
        salesStartDate: `2024-01-${String(1 + Math.floor(pseudoRandom(seed + 10) * 15)).padStart(2, '0')}`,
        salesEndDate: `2024-01-${String(16 + Math.floor(pseudoRandom(seed + 11) * 15)).padStart(2, '0')}`,
        purchaseLimit: pseudoRandom(seed + 12) > 0.5 ? { days: 7, quantity: 3 + Math.floor(pseudoRandom(seed + 13) * 5) } : undefined,
        purchaseInterval: pseudoRandom(seed + 14) > 0.5 ? 1 + Math.floor(pseudoRandom(seed + 15) * 5) : undefined,
        merchantLimit: pseudoRandom(seed + 16) > 0.5 ? 'limited' : 'unlimited',
        merchantIds: pseudoRandom(seed + 17) > 0.5 ? [100 + Math.floor(pseudoRandom(seed + 18) * 50), 100 + Math.floor(pseudoRandom(seed + 19) * 50)] : undefined,
        regionLimit: pseudoRandom(seed + 20) > 0.5 ? 'limited' : 'unlimited',
        regionIds: pseudoRandom(seed + 21) > 0.5 ? [1, 2, 3].slice(0, 1 + Math.floor(pseudoRandom(seed + 22) * 3)) : undefined,
        status,
        updatedBy: user,
        updatedAt: `${dateStr} ${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00`,
        createdAt: `${dateStr} ${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00`,
      })
      globalIndex++
    }
  }

  // 按更新时间倒序排列（最新的在前面）
  return data.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
}

const mockData: WaterfallSlotConfig[] = generateMockData()

export default function Waterfall() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const urlType = searchParams.get('type') ? Number(searchParams.get('type')) as AlgorithmType : null
  const [searchForm] = Form.useForm()
  const [selectedAlgorithmType, setSelectedAlgorithmType] = useState<AlgorithmType | null>(urlType) // null = 卡片选择页
  const [bizTypeTab, setBizTypeTab] = useState<string>('delivery') // 外賣到家 / 團購到店
  const [filteredData, setFilteredData] = useState<WaterfallSlotConfig[]>(mockData)
  const [modalVisible, setModalVisible] = useState(false)
  const [detailVisible, setDetailVisible] = useState(false)
  const [editingRecord, setEditingRecord] = useState<WaterfallSlotConfig | null>(null)
  const [viewingRecord, setViewingRecord] = useState<WaterfallSlotConfig | null>(null)
  const [form] = Form.useForm()

  // 各算法类型对应的记录数
  const typeCountMap = useMemo(() => {
    const map: Record<number, number> = {}
    mockData.forEach(item => {
      map[item.algorithmType] = (map[item.algorithmType] || 0) + 1
    })
    return map
  }, [])

  // 业务频道选项（根据业务类型过滤）
  const bizChannelOptions = useMemo(() => {
    if (bizTypeTab === 'groupBuy') {
      return BIZ_CHANNEL_OPTIONS.filter(opt => opt.value === 'groupBuy')
    }
    return BIZ_CHANNEL_OPTIONS.filter(opt => opt.value !== 'groupBuy')
  }, [bizTypeTab])

  // 点击卡片进入列表
  const handleSelectType = (type: AlgorithmType) => {
    setSelectedAlgorithmType(type)
    setFilteredData(mockData.filter(item => item.algorithmType === type))
    searchForm.resetFields()
  }

  // 返回卡片选择页
  const handleBackToCards = () => {
    setSelectedAlgorithmType(null)
    setFilteredData(mockData)
    searchForm.resetFields()
  }
  
  // 算法选择相关状态
  const [algorithmType, setAlgorithmType] = useState<AlgorithmType | undefined>(undefined)
  const [algorithmOptions, setAlgorithmOptions] = useState<any[]>([])
  const [continuousPurchase, setContinuousPurchase] = useState<string>('notSupport')
  const [merchantLimit, setMerchantLimit] = useState<'limited' | 'unlimited'>('unlimited')
  const [selectedMerchants, setSelectedMerchants] = useState<number[]>([])
  const [merchantModalVisible, setMerchantModalVisible] = useState(false)
  const [regionLimit, setRegionLimit] = useState<'limited' | 'unlimited'>('unlimited')
  
  // 搜索处理
  const handleSearch = (values: any) => {
    let result = [...mockData]
    
    // 配置ID搜索
    if (values.adId) {
      result = result.filter(item => item.adId?.includes(values.adId))
    }
    
    // 瀑布流名称搜索
    if (values.promotionName) {
      result = result.filter(item => item.promotionName?.includes(values.promotionName))
    }
    
    // 所属品牌搜索
    if (values.app !== undefined && values.app !== null) {
      result = result.filter(item => item.app === values.app)
    }
    
    // 状态搜索
    if (values.status !== undefined && values.status !== null) {
      result = result.filter(item => item.status === values.status)
    }
    
    setFilteredData(result)
  }

  // 重置搜索
  const handleReset = () => {
    searchForm.resetFields()
    setFilteredData(mockData)
  }

  // 算法类型变化
  const handleAlgorithmTypeChange = (type: AlgorithmType) => {
    setAlgorithmType(type)
    const availableAlgorithms = mockAlgorithmData.filter(
      alg => alg.type === type && alg.status === ServiceStatus.ENABLED
    )
    setAlgorithmOptions(availableAlgorithms)
    form.setFieldsValue({ algorithmId: undefined })
  }

  // 算法选择变化
  const handleAlgorithmChange = (algorithmId: number) => {
    const selectedAlgorithm = mockAlgorithmData.find(alg => alg.id === algorithmId)
    if (selectedAlgorithm) {
      form.setFieldsValue({
        algorithmName: selectedAlgorithm.name,
        algorithmType: selectedAlgorithm.type,
      })
      // TODO: 从算法配置中加载continuousPurchase等参数默认值
      setContinuousPurchase('notSupport')
    }
  }

  // 新增/编辑
  const handleSubmit = async () => {
    try {
      const values = await form.validateFields()
      console.log('表单数据:', values)
      message.success(editingRecord ? '編輯成功' : '新增成功')
      setModalVisible(false)
      form.resetFields()
      setEditingRecord(null)
      setAlgorithmType(undefined)
      setAlgorithmOptions([])
    } catch (error) {
      console.error('表单验证失败:', error)
    }
  }

  // 删除
  const handleDelete = (record: WaterfallSlotConfig) => {
    Modal.confirm({
      title: '確認刪除',
      content: `確定要刪除位置${record.slotPosition}的配置嗎？`,
      okText: '確定',
      cancelText: '取消',
      onOk: () => {
        message.success('刪除成功')
      },
    })
  }

  // 切换状态（启用/停用）
  const handleToggleStatus = (record: WaterfallSlotConfig) => {
    const newStatus = record.status === ServiceStatus.ENABLED ? ServiceStatus.DISABLED : ServiceStatus.ENABLED
    const actionText = newStatus === ServiceStatus.ENABLED ? '啟用' : '停用'
    
    Modal.confirm({
      title: `確認${actionText}`,
      content: `確定要${actionText}位置${record.slotPosition}的配置嗎？`,
      okText: '確定',
      cancelText: '取消',
      onOk: () => {
        message.success(`${actionText}成功`)
      },
    })
  }

  /** 列配置元数据 */
  const columnMeta = useMemo(() => [
    { key: 'adId', title: '配置ID' },
    { key: 'promotionName', title: '算法名稱' },
    { key: 'app', title: '所屬品牌' },
    { key: 'bizChannel', title: '業務頻道' },
    { key: 'status', title: '狀態' },
    { key: 'updatedBy', title: '最後更新人' },
    { key: 'updatedAt', title: '最後更新時間' },
    { key: 'action', title: '操作' },
  ], [])

  const { configComponent, applyConfig } = useColumnConfig('waterfall', columnMeta, [
    { key: 'action', visible: true, locked: 'tail' as const },
  ])

  // 完整列定义（带自定义渲染）
  const columns: ColumnsType<WaterfallSlotConfig> = [
    { 
      title: '配置ID',
      dataIndex: 'adId',
      key: 'adId',
      width: 120,
      render: (text: string) => <Tag color="blue">{text}</Tag>,
    },
    { 
      title: '算法名稱',
      dataIndex: 'promotionName',
      key: 'promotionName',
      width: 200,
      render: (text: string) => <strong>{text}</strong>,
    },
    { 
      title: '所屬品牌', 
      dataIndex: 'app', 
      key: 'app', 
      width: 100,
      render: (v: AppType) => (
        <BrandTag value={v} />
      ),
    },
    {
      title: '業務頻道',
      dataIndex: 'bizChannel',
      key: 'bizChannel',
      width: 120,
      render: (v: string) => (
        <Tag color={v === 'food' ? 'orange' : v === 'supermarket' ? 'cyan' : 'purple'}>
          {BIZ_CHANNEL_LABEL[v] || v}
        </Tag>
      ),
    },
    {
      title: '狀態',
      dataIndex: 'status',
      key: 'status',
      width: 100,
      render: (v: ServiceStatus) => (
        <Tag color={v === ServiceStatus.ENABLED ? 'green' : 'default'}>
          {v === ServiceStatus.ENABLED ? '啟用' : '停用'}
        </Tag>
      ),
    },
    {
      title: '最後更新人',
      dataIndex: 'updatedBy',
      key: 'updatedBy',
      width: 120,
      render: (v: string) => (
        <span style={{ whiteSpace: 'nowrap' }}>{v}</span>
      ),
    },
    {
      title: '最後更新時間',
      dataIndex: 'updatedAt',
      key: 'updatedAt',
      width: 180,
      render: (v: string) => (
        <span style={{ whiteSpace: 'nowrap' }}>{v}</span>
      ),
    },
    {
      title: '操作',
      key: 'action',
      width: 200,
      fixed: 'right' as const,
      render: (_, record) => (
        <Space size={0} split={<span style={{ color: '#d9d9d9' }}>|</span>}>
          <Button 
            type="link" 
            size="small" 
            onClick={() => navigate(`/promotion-waterfall-add?id=${record.id}&mode=detail&type=${selectedAlgorithmType}&module=${bizTypeTab}`)}
          >
            詳情
          </Button>
          <Button 
            type="link" 
            size="small" 
            onClick={() => navigate(`/promotion-waterfall-add?id=${record.id}&type=${selectedAlgorithmType}&module=${bizTypeTab}`)}
          >
            編輯
          </Button>
          <Button 
            type="link" 
            size="small" 
            danger={record.status === ServiceStatus.ENABLED}
            style={record.status !== ServiceStatus.ENABLED ? { color: '#52c41a' } : undefined}
            onClick={() => handleToggleStatus(record)}
          >
            {record.status === ServiceStatus.ENABLED ? '停用' : '啟用'}
          </Button>
          <Button 
            type="link" 
            size="small" 
            danger
            onClick={() => handleDelete(record)}
          >
            刪除
          </Button>
        </Space>
      ),
    },
  ]

  // ===== 卡片选择主界面 =====
  if (selectedAlgorithmType === null) {
    return (
      <div className="content-area">
        <div style={{
          position: 'relative', background: '#fff', marginBottom: 16,
          borderRadius: 12, boxShadow: '0 2px 12px rgba(0,0,0,0.06)',
          overflow: 'hidden',
        }}>
          <div style={{
            height: 3, background: 'linear-gradient(90deg, #E8720C, #F59432, #FFB347, #F59432, #E8720C)',
            backgroundSize: '200% 100%', animation: 'headerGradientShift 4s ease infinite',
          }} />
          <div style={{
            padding: '16px 24px', display: 'flex', alignItems: 'center',
            justifyContent: 'space-between', animation: 'headerFadeSlideIn 0.5s ease',
          }}>
            <div>
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#1890ff' }}>
                <WalletOutlined style={{ marginRight: 8 }} />
                銷售定價
              </h2>
              <p style={{ margin: '6px 0 0', color: '#8c8c8c', fontSize: 12 }}>
                管理各廣告類型的銷售定價配置，選擇類型查看詳情
              </p>
            </div>
          </div>
        </div>

        <Card title="請選擇廣告類型" style={{ marginBottom: 16 }} bodyStyle={{ padding: '5px 24px' }}>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
            gap: 16,
          }}>
            {ALGORITHM_TYPE_CARDS.map(card => {
              const enabled = card.type === AlgorithmType.INVINCIBLE_STAR || card.type === AlgorithmType.HOT_REVIVE_AD || card.type === AlgorithmType.POPULAR_MERCHANT_KA
              return (
                <div
                  key={card.type}
                  className={`algo-card-wrapper algo-card-wrapper--${ALGO_CARD_COLOR_MAP[card.type]}${!enabled ? ' disabled' : ''}`}
                  onClick={() => enabled && handleSelectType(card.type)}
                >
                  <div className="algo-card-inner">
                    <div className="algo-card-icon">{card.icon}</div>
                    <h3 className="algo-card-title">{ALGORITHM_TYPE_LABEL[card.type]}</h3>
                    <p className="algo-card-desc">{card.description}</p>
                    <div className="algo-card-tag">
                      {enabled ? (
                        <Tag color="blue">查看/調整定價</Tag>
                      ) : (
                        <Tag color="default">敬請期待</Tag>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </Card>
      </div>
    )
  }

  // ===== 列表视图 =====
  return (
    <div className="content-area">
      {/* 标题区域 */}
      <div style={{
        position: 'relative', background: '#fff', marginBottom: 16,
        borderRadius: 12, boxShadow: '0 2px 12px rgba(0,0,0,0.06)',
        overflow: 'hidden',
      }}>
        <div style={{
          height: 3, background: 'linear-gradient(90deg, #E8720C, #F59432, #FFB347, #F59432, #E8720C)',
          backgroundSize: '200% 100%', animation: 'headerGradientShift 4s ease infinite',
        }} />
        <div style={{
          padding: '16px 24px', display: 'flex', alignItems: 'center',
          justifyContent: 'space-between', animation: 'headerFadeSlideIn 0.5s ease',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <Button type="primary" icon={<ArrowLeftOutlined />}
              onClick={handleBackToCards}
              style={{
                backgroundColor: '#E8720C', borderColor: '#E8720C',
                borderRadius: 8, height: 36, padding: '0 16px',
                display: 'flex', alignItems: 'center', gap: 6,
                boxShadow: '0 2px 6px rgba(232,114,12,0.25)',
                transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
              }}
            >返回</Button>
            <div style={{ width: 1, height: 20, background: '#E8E8E8' }} />
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#1890ff' }}>定價列表</h2>
              {selectedAlgorithmType != null && (
                <span style={{ fontSize: 14, color: '#595959' }}>
                  {ALGORITHM_TYPE_CARDS.find(c => c.type === selectedAlgorithmType)?.icon} {ALGORITHM_TYPE_LABEL[selectedAlgorithmType]}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* 查询区域 */}
      <div className="search-section">
        <Form layout="inline" form={searchForm} onFinish={handleSearch}>
          <Form.Item label="配置ID" name="adId">
            <Input placeholder="請輸入配置ID" allowClear />
          </Form.Item>
          <Form.Item label="算法名稱" name="promotionName">
            <Select 
              placeholder="請輸入搜索" 
              allowClear
              showSearch
              optionFilterProp="label"
              options={[
                { label: '無敵星星-首頁版', value: '無敵星星-首頁版' },
                { label: '新店廣告-外賣版', value: '新店廣告-外賣版' },
                { label: '盤活復蘇-團購版', value: '盤活復蘇-團購版' },
                { label: '獨家商家-超市版', value: '獨家商家-超市版' },
                { label: '流量廣告-全渠道', value: '流量廣告-全渠道' },
                { label: '猜你喜歡-主力版', value: '猜你喜歡-主力版' },
                { label: '自然流量-默認', value: '自然流量-默認' },
                { label: '搜索算法-綜合版', value: '搜索算法-綜合版' },
              ]}
            />
          </Form.Item>
          <Form.Item label="所屬品牌" name="app">
            <Select placeholder="全部" options={APP_OPTIONS} allowClear />
          </Form.Item>
          <Form.Item label="狀態" name="status">
            <Select placeholder="全部" options={SERVICE_STATUS_OPTIONS} allowClear />
          </Form.Item>
          <Form.Item>
            <div className="search-actions">
              <Button type="primary" htmlType="submit" icon={<SearchOutlined />}>查詢</Button>
              <Button onClick={handleReset} icon={<ReloadOutlined />}>重置</Button>
            </div>
          </Form.Item>
        </Form>
      </div>

      {/* 功能区域 */}
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'flex-end', alignItems: 'center' }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <Button 
            type="primary" 
            icon={<PlusOutlined />}
            onClick={() => navigate(`/promotion-waterfall-add?type=${selectedAlgorithmType}&module=${bizTypeTab}`)}
          >
            新增
          </Button>
          {configComponent}
        </div>
      </div>

      {/* 列表区域 */}
      <div className="table-section">
        <Table<WaterfallSlotConfig>
          rowKey="id"
          columns={applyConfig(columns)}
          dataSource={filteredData}
          scroll={{ x: 1300 }}
          pagination={{
            pageSize: 10,
            showTotal: (total) => `共 ${total} 條`,
            showSizeChanger: true,
            pageSizeOptions: ['10', '20', '50'],
            showQuickJumper: true,
          }}
        />
      </div>

      {/* 新增/编辑弹窗 */}
      <Modal
        title={editingRecord ? '編輯坑位配置' : '新增坑位配置'}
        open={modalVisible}
        onOk={handleSubmit}
        onCancel={() => {
          setModalVisible(false)
          form.resetFields()
          setEditingRecord(null)
          setAlgorithmType(undefined)
          setAlgorithmOptions([])
        }}
        width={1100}
        okText="確定"
        cancelText="取消"
      >
        <Form form={form} layout="vertical" style={{ marginTop: 24 }}>
          {/* 基础信息区 */}
          <Card title="基礎信息" size="small" style={{ marginBottom: 16 }}>
            <Form.Item 
              label="所屬品牌" 
              name="app" 
              rules={[{ required: true, message: '請選擇所屬品牌' }]}
            >
              <Select placeholder="請選擇" options={APP_OPTIONS} />
            </Form.Item>

            <Form.Item 
              label="展示頁面" 
              name="channel" 
              rules={[{ required: true, message: '請選擇展示頁面' }]}
            >
              <Select placeholder="請選擇" options={CHANNEL_OPTIONS} />
            </Form.Item>

            <Form.Item 
              label="廣告類型" 
              rules={[{ required: true, message: '請選擇廣告類型' }]}
            >
              <Select 
                placeholder="請選擇廣告類型" 
                options={ALGORITHM_TYPE_OPTIONS}
                onChange={handleAlgorithmTypeChange}
                value={algorithmType}
              />
            </Form.Item>

            <Form.Item 
              label="算法名稱" 
              name="algorithmId"
              rules={[{ required: true, message: '請選擇算法' }]}
            >
              <Select 
                placeholder="請先選擇廣告類型" 
                options={algorithmOptions.map(alg => ({ label: alg.name, value: alg.id }))}
                onChange={handleAlgorithmChange}
                disabled={!algorithmType}
              />
            </Form.Item>

            <Form.Item 
              label="廣告類型"
              name="algorithmType"
            >
              <Input 
                placeholder="選擇算法後自動顯示" 
                disabled 
                suffix={
                  (() => {
                    const algorithmType = form.getFieldValue('algorithmType') as AlgorithmType | undefined
                    return algorithmType ? (
                      <Tag color={ALGORITHM_TYPE_COLOR[algorithmType]}>
                        {ALGORITHM_TYPE_LABEL[algorithmType]}
                      </Tag>
                    ) : null
                  })()
                }
              />
            </Form.Item>
          </Card>

          {/* 关键参数调整区 */}
          <Card title="坑位參數配置" size="small" style={{ marginBottom: 16 }}>
            <Alert
              message="提示"
              description="以下參數將覆蓋算法配置的默認值,僅對當前坑位生效。"
              type="warning"
              showIcon
              style={{ marginBottom: 16 }}
            />

            {/* 购买上限/间隔天数 */}
            {continuousPurchase === 'support' && (
              <Form.Item 
                label="購買上限" 
                name="purchaseLimit"
                rules={[{ required: true, message: '請配置購買上限' }]}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ color: '#595959', fontWeight: 500 }}>近</span>
                  <InputNumber min={1} max={365} placeholder="天數" style={{ width: 100 }} />
                  <span style={{ color: '#595959', fontWeight: 500 }}>天內,最多可購買</span>
                  <InputNumber min={1} max={100} placeholder="數量" style={{ width: 100 }} />
                  <span style={{ color: '#595959', fontWeight: 500 }}>個時段</span>
                </div>
              </Form.Item>
            )}

            {continuousPurchase === 'notSupport' && (
              <Form.Item 
                label="間隔天數" 
                name="purchaseInterval"
                rules={[{ required: true, message: '請配置間隔天數' }]}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ color: '#595959', fontWeight: 500 }}>間隔</span>
                  <InputNumber min={1} max={365} placeholder="天數" style={{ width: 100 }} />
                  <span style={{ color: '#595959', fontWeight: 500 }}>天可購買</span>
                </div>
              </Form.Item>
            )}

            {/* 商家限制 */}
            <Form.Item 
              label="商家限制" 
              name="merchantLimit"
              valuePropName="checked"
              getValueFromEvent={(checked) => checked ? 'unlimited' : 'limited'}
              getValueProps={(value) => ({ checked: value === 'unlimited' })}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                <Switch 
                  checkedChildren="不限制" 
                  unCheckedChildren="限制"
                  defaultChecked
                />
                {merchantLimit === 'limited' && (
                  <Button 
                    size="small"
                    onClick={() => setMerchantModalVisible(true)}
                  >
                    選擇商家
                  </Button>
                )}
              </div>
            </Form.Item>

            {/* 销售区域 */}
            <Form.Item 
              label="销售区域" 
              name="regionLimit"
              valuePropName="checked"
              getValueFromEvent={(checked) => checked ? 'unlimited' : 'limited'}
              getValueProps={(value) => ({ checked: value === 'unlimited' })}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                <Switch 
                  checkedChildren="不限制" 
                  unCheckedChildren="限制"
                  defaultChecked
                />
                {regionLimit === 'limited' && (
                  <Checkbox.Group options={REGION_OPTIONS} />
                )}
              </div>
            </Form.Item>
          </Card>

          {/* 状态区 */}
          <Form.Item 
            label="狀態" 
            name="status" 
            valuePropName="checked"
            getValueFromEvent={(checked) => checked ? ServiceStatus.ENABLED : ServiceStatus.DISABLED}
            getValueProps={(value) => ({ checked: value === ServiceStatus.ENABLED })}
          >
            <Switch checkedChildren="啟用" unCheckedChildren="停用" defaultChecked />
          </Form.Item>
        </Form>
      </Modal>

      {/* 商家选择弹窗 */}
      <Modal
        title="選擇商家"
        open={merchantModalVisible}
        onOk={() => {
          setMerchantModalVisible(false)
          form.setFieldsValue({ merchantIds: selectedMerchants })
        }}
        onCancel={() => setMerchantModalVisible(false)}
        width={800}
      >
        <div style={{ padding: '16px 0' }}>
          <Alert
            message="支持批量選擇商家,選中的商家將在當前坑位生效"
            type="info"
            showIcon
            style={{ marginBottom: 16 }}
          />
          <Table
            rowKey="id"
            columns={[
              { title: '商家ID', dataIndex: 'id', width: 100 },
              { title: '商家名稱', dataIndex: 'name' },
              { title: '所屬區域', dataIndex: 'region' },
            ]}
            dataSource={[
              { id: 101, name: '商家A', region: '澳門' },
              { id: 102, name: '商家B', region: '氹仔' },
              { id: 103, name: '商家C', region: '珠海' },
            ]}
            rowSelection={{
              type: 'checkbox',
              selectedRowKeys: selectedMerchants,
              onChange: (selectedRowKeys) => setSelectedMerchants(selectedRowKeys as number[]),
            }}
            pagination={{ pageSize: 10 }}
          />
        </div>
      </Modal>

      {/* 查看详情弹窗 */}
      <Modal
        title="坑位配置詳情"
        open={detailVisible}
        onCancel={() => {
          setDetailVisible(false)
          setViewingRecord(null)
        }}
        footer={[
          <Button key="close" onClick={() => {
            setDetailVisible(false)
            setViewingRecord(null)
          }}>
            關閉
          </Button>,
        ]}
        width={800}
      >
        {viewingRecord && (
          <>
            <Descriptions bordered column={2} size="small">
              <Descriptions.Item label="所屬品牌" span={2}>
                <BrandTag value={viewingRecord.app} />
              </Descriptions.Item>
              <Descriptions.Item label="展示頁面">
                {CHANNEL_LABEL[viewingRecord.channel]}
              </Descriptions.Item>
              <Descriptions.Item label="算法名稱" span={2}>
                <strong>{viewingRecord.algorithmName}</strong>
              </Descriptions.Item>
              <Descriptions.Item label="廣告類型">
                <Tag color={ALGORITHM_TYPE_COLOR[viewingRecord.algorithmType]}>
                  {ALGORITHM_TYPE_LABEL[viewingRecord.algorithmType]}
                </Tag>
              </Descriptions.Item>
              <Descriptions.Item label="算法ID">
                <code style={{ background: '#f5f5f5', padding: '2px 6px', borderRadius: 4 }}>
                  {String(viewingRecord.algorithmId).padStart(6, '0')}
                </code>
              </Descriptions.Item>
              <Descriptions.Item label="狀態" span={2}>
                <Badge
                  status={viewingRecord.status === ServiceStatus.ENABLED ? 'success' : 'default'}
                  text={viewingRecord.status === ServiceStatus.ENABLED ? '啟用' : '停用'}
                />
              </Descriptions.Item>
            </Descriptions>

            <Divider orientation="left">關鍵參數配置</Divider>
            <Card size="small">
              <Descriptions column={1} size="small">
                {viewingRecord.purchaseLimit && (
                  <Descriptions.Item label="購買上限">
                    近 {viewingRecord.purchaseLimit.days} 天內,最多可購買 {viewingRecord.purchaseLimit.quantity} 個時段
                  </Descriptions.Item>
                )}
                {viewingRecord.purchaseInterval && (
                  <Descriptions.Item label="間隔天數">
                    間隔 {viewingRecord.purchaseInterval} 天可購買
                  </Descriptions.Item>
                )}
                <Descriptions.Item label="商家限制">
                  <Tag color={viewingRecord.merchantLimit === 'limited' ? 'red' : 'green'}>
                    {viewingRecord.merchantLimit === 'limited' ? `限制(${viewingRecord.merchantIds?.length || 0}個商家)` : '不限制'}
                  </Tag>
                  {viewingRecord.merchantLimit === 'limited' && viewingRecord.merchantIds && viewingRecord.merchantIds.length > 0 && (
                    <div style={{ marginTop: 8 }}>
                      已選商家ID: {viewingRecord.merchantIds.join(', ')}
                    </div>
                  )}
                </Descriptions.Item>
                <Descriptions.Item label="销售區域">
                  <Tag color={viewingRecord.regionLimit === 'limited' ? 'red' : 'green'}>
                    {viewingRecord.regionLimit === 'limited' ? `限制(${viewingRecord.regionIds?.length || 0}個區域)` : '不限制'}
                  </Tag>
                  {viewingRecord.regionLimit === 'limited' && viewingRecord.regionIds && viewingRecord.regionIds.length > 0 && (
                    <div style={{ marginTop: 8 }}>
                      已選區域: {viewingRecord.regionIds.map(id => REGION_OPTIONS.find(opt => opt.value === id)?.label).join(', ')}
                    </div>
                  )}
                </Descriptions.Item>
              </Descriptions>
            </Card>

            <Divider orientation="left">更新信息</Divider>
            <Descriptions bordered column={2} size="small">
              <Descriptions.Item label="最後更新人">
                {viewingRecord.updatedBy}
              </Descriptions.Item>
              <Descriptions.Item label="最後更新時間">
                {viewingRecord.updatedAt}
              </Descriptions.Item>
              <Descriptions.Item label="創建時間" span={2}>
                {viewingRecord.createdAt}
              </Descriptions.Item>
            </Descriptions>
          </>
        )}
      </Modal>

    </div>
  )
}
