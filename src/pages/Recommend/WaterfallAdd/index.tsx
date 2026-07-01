import { useState, Fragment } from 'react'
import { Button, Form, Input, InputNumber, Select, Space, Card, message, Divider, Tag, DatePicker, Switch, Radio, Modal, Checkbox, Table, Tree } from 'antd'
import { ArrowLeftOutlined, SaveOutlined, PlusOutlined, MinusOutlined, DeleteFilled, FileTextOutlined, SettingOutlined, DownOutlined } from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import { MapContainer, TileLayer } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import { 
  AppType, 
  RecommendChannel, 
  AlgorithmType,
  Region,
  TimeSlot,
  ServiceStatus,
  APP_OPTIONS,
  REGION_OPTIONS,
  SERVICE_STATUS_OPTIONS,
} from '../constants'
import dayjs from 'dayjs'

// Mock数据 - 从瀑布流策略读取启用的广告位
const mockEnabledPositions = [1, 5, 8, 9, 12, 15, 18]

// Mock数据 - 广告位关联的算法
const mockPositionAlgorithm = [
  { position: 1, algorithmId: 1001, algorithmName: '無敵星星-首頁版' },
  { position: 5, algorithmId: 1002, algorithmName: '無敵星星-外賣版' },
  { position: 8, algorithmId: 1003, algorithmName: '無敵星星-團購版' },
  { position: 9, algorithmId: 1004, algorithmName: '無敵星星-超市版' },
  { position: 12, algorithmId: 1005, algorithmName: '無敵星星-零售版' },
  { position: 15, algorithmId: 1006, algorithmName: '無敵星星-美食版' },
  { position: 18, algorithmId: 1007, algorithmName: '無敵星星-閃購版' },
]

// Mock数据 - 盤活復蘇广告位关联的算法
const mockRevivePositionAlgorithm = [
  { position: 1, algorithmId: 2001, algorithmName: '盤活復蘇-首頁版' },
  { position: 5, algorithmId: 2002, algorithmName: '盤活復蘇-外賣版' },
  { position: 8, algorithmId: 2003, algorithmName: '盤活復蘇-團購版' },
  { position: 9, algorithmId: 2004, algorithmName: '盤活復蘇-超市版' },
  { position: 12, algorithmId: 2005, algorithmName: '盤活復蘇-零售版' },
  { position: 15, algorithmId: 2006, algorithmName: '盤活復蘇-美食版' },
  { position: 18, algorithmId: 2007, algorithmName: '盤活復蘇-閃購版' },
]

// 时段枚举
const TIME_SLOTS = [
  { key: 'fullDay', label: '全時段' },
  { key: 'breakfast', label: '早餐' },
  { key: 'lunch', label: '午餐' },
  { key: 'afternoon', label: '下午茶' },
  { key: 'dinner', label: '晚餐' },
  { key: 'night', label: '宵夜' },
]

// 商圈选择树形数据
const regionTreeData = [
  {
    key: '1',
    title: '澳門區域',
    children: [
      { key: '1-1', title: '黑沙環區' },
      { key: '1-2', title: '高士德區' },
      { key: '1-3', title: '新馬路區' },
      { key: '1-4', title: '新皇朝區' },
      { key: '1-5', title: '港珠澳區' },
    ],
  },
  {
    key: '2',
    title: '氹仔區域',
    children: [
      { key: '2-1', title: '花城市區' },
      { key: '2-2', title: '北安機場' },
      { key: '2-3', title: '左酒店區' },
      { key: '2-4', title: '右酒店區' },
      { key: '2-5', title: '澳大專區' },
      { key: '2-6', title: '黑沙灘區' },
    ],
  },
  {
    key: '3',
    title: '珠海區域',
    children: [
      { key: '3-1', title: '拱北區域' },
      { key: '3-2', title: '橫琴區域' },
    ],
  },
]

// 区域计价配置接口
interface RegionPricingConfig {
  region: Region
  regionLabel: string // 显示名称（区域或商圈名称）
  pricing: Record<string, number | undefined>
  discountEnabled: boolean
  discounts: Record<string, number | undefined>
  limitedTimeDiscount: boolean // 限时折扣开关
  discountDateRange?: [dayjs.Dayjs, dayjs.Dayjs] // 限时折扣日期周期
}

// 梯度配置接口
interface TimeSlotGradient {
  count: number
  discount: number
}

// 区域组合折扣接口
interface RegionCombinationDiscount {
  name: string // 组合名称
  regions: Region[]
  discount: number
}

export default function WaterfallAdd() {
  const navigate = useNavigate()
  const [form] = Form.useForm()
  const [loading, setLoading] = useState(false)

  // 基础信息
  const [promotionName, setPromotionName] = useState('')
  const [selectedApp, setSelectedApp] = useState<AppType | undefined>(undefined)
  const [selectedChannel, setSelectedChannel] = useState<RecommendChannel | undefined>(undefined)
  const [selectedAlgorithmType, setSelectedAlgorithmType] = useState<AlgorithmType | undefined>(undefined)
  
  // 广告位选择
  const [selectedPosition, setSelectedPosition] = useState<number | undefined>(undefined)
  const [selectedAlgorithmInfo, setSelectedAlgorithmInfo] = useState<{ id: number; name: string } | null>(null)
  
  // 区域计价配置
  const [selectedRegions, setSelectedRegions] = useState<Region[]>([])
  const [regionPricingConfigs, setRegionPricingConfigs] = useState<RegionPricingConfig[]>([])
  const [newRegionSelect, setNewRegionSelect] = useState<Region | undefined>(undefined) // 新增区域选择器
  
  // 商圈选择弹窗
  const [regionSelectModalVisible, setRegionSelectModalVisible] = useState(false)
  const [selectedRegionNode, setSelectedRegionNode] = useState<{ key: string; title: string; level: number } | null>(null)
  
  // 销售日期
  const [salesDateRange, setSalesDateRange] = useState<[dayjs.Dayjs, dayjs.Dayjs] | undefined>(undefined)
  
  // 状态
  const [status, setStatus] = useState<ServiceStatus>(ServiceStatus.ENABLED)
  
  // 算法规则弹窗
  const [algorithmRuleModalVisible, setAlgorithmRuleModalVisible] = useState(false)
  
  // 时段个数折扣 - 梯度配置
  const [gradients, setGradients] = useState<TimeSlotGradient[]>([])
  const [gradientEnabled, setGradientEnabled] = useState(false) // 梯度配置开关
  
  // 多区域组合折扣
  const [regionCombinations, setRegionCombinations] = useState<RegionCombinationDiscount[]>([])
  const [regionCombinationEnabled, setRegionCombinationEnabled] = useState(false) // 区域组合折扣开关
  
  // 销售策略（仅无敌星星）
  const [presaleMode, setPresaleMode] = useState<'fixed' | 'rolling'>('fixed') // 预售模式：固定/滚动
  const [presaleDays, setPresaleDays] = useState<number>(7) // 预售天数
  const [continuousPurchase, setContinuousPurchase] = useState(false) // 连续购买
  const [purchaseLimitDays, setPurchaseLimitDays] = useState<number>(30) // 购买上限：X天内
  const [purchaseLimitSlots, setPurchaseLimitSlots] = useState<number>(3) // 最多可购买X个时段
  const [purchaseLimitMeals, setPurchaseLimitMeals] = useState<string[]>([]) // 统计时段（多选）
  const [continuousInterval, setContinuousInterval] = useState<number>(7) // 连续购买=不支持时间隔天数
  const [merchantLimit, setMerchantLimit] = useState(false) // 商家限制
  const [selectedMerchants, setSelectedMerchants] = useState<string[]>([]) // 选择的商家
  const [onlySellTimeSlots, setOnlySellTimeSlots] = useState<string[]>(['fullDay']) // 只销售时段
  
  // 显示广告位的条件：仅無敵星星和盤活復蘇
  const canShowPositions = selectedApp && selectedChannel && selectedAlgorithmType &&
    (selectedAlgorithmType === AlgorithmType.INVINCIBLE_STAR || selectedAlgorithmType === AlgorithmType.HOT_REVIVE_AD)
  
  // 推荐类型为其它条件时显示暂未开通提示
  const showNotAvailable = selectedAlgorithmType && !canShowPositions
  
  // 是否为盤活復蘇算法类型
  const isReviveAlgorithm = selectedAlgorithmType === AlgorithmType.HOT_REVIVE_AD

  // 自定义美化 Switch
  const CustomSwitch = ({
    checked,
    onChange,
    leftText,
    rightText,
    leftColor = '#ff4d4f',
    rightColor = '#1890ff',
  }: {
    checked?: boolean
    onChange?: (checked: boolean) => void
    leftText: string
    rightText: string
    leftColor?: string
    rightColor?: string
  }) => {
    const isChecked = checked ?? false
    return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <span
        style={{
          fontSize: 14,
          fontWeight: isChecked ? 400 : 600,
          color: isChecked ? '#8c8c8c' : '#1890ff',
          transition: 'all 0.3s ease',
          minWidth: 36,
          textAlign: 'right',
        }}
      >
        {leftText}
      </span>

      <div
        style={{
          position: 'relative',
          width: 72,
          height: 28,
          borderRadius: 999,
          background: isChecked ? rightColor : leftColor,
          cursor: 'pointer',
          userSelect: 'none',
          transition: 'background 0.3s ease',
          boxShadow: 'inset 0 2px 6px rgba(0,0,0,0.12)',
        }}
        onClick={() => onChange && onChange(!isChecked)}
      >
        <div
          style={{
            position: 'absolute',
            top: 3,
            left: 3,
            width: 22,
            height: 22,
            background: '#ffffff',
            borderRadius: '50%',
            boxShadow: '0 2px 6px rgba(0,0,0,0.18)',
            transform: isChecked ? 'translateX(44px)' : 'translateX(0)',
            transition: 'transform 0.35s cubic-bezier(0.34, 1.56, 0.64, 1)',
          }}
        />
      </div>

      <span
        style={{
          fontSize: 14,
          fontWeight: isChecked ? 600 : 400,
          color: isChecked ? '#1890ff' : '#8c8c8c',
          transition: 'all 0.3s ease',
          minWidth: 36,
          textAlign: 'left',
        }}
      >
        {rightText}
      </span>
    </div>
  )
}



  // 选择广告位
  const handlePositionSelect = (position: number) => {
    setSelectedPosition(position)
    
    // 根据推荐类型选择不同的算法数据
    const algorithmData = selectedAlgorithmType === AlgorithmType.HOT_REVIVE_AD 
      ? mockRevivePositionAlgorithm 
      : mockPositionAlgorithm
    const algorithm = algorithmData.find(p => p.position === position)
    if (algorithm) {
      setSelectedAlgorithmInfo({
        id: algorithm.algorithmId,
        name: algorithm.algorithmName,
      })
    }
  }

  // 添加区域计价配置
  const handleAddRegionConfig = (region: Region, label: string) => {
    if (regionPricingConfigs.find(c => c.region === region)) {
      message.warning('該區域已添加計價配置')
      return
    }
    
    const newConfig: RegionPricingConfig = {
      region,
      regionLabel: label,
      pricing: {},
      discountEnabled: false,
      discounts: {},
      limitedTimeDiscount: false,
      discountDateRange: undefined,
    }
    setRegionPricingConfigs([...regionPricingConfigs, newConfig])
    setSelectedRegions([...selectedRegions, region])
  }

  // 删除区域计价配置
  const handleRemoveRegionConfig = (region: Region) => {
    setRegionPricingConfigs(regionPricingConfigs.filter(c => c.region !== region))
    setSelectedRegions(selectedRegions.filter(r => r !== region))
  }

  // 更新区域计价
  const handleUpdateRegionPricing = (region: Region, slotKey: string, value: number | null) => {
    setRegionPricingConfigs(configs => 
      configs.map(config => {
        if (config.region === region) {
          return {
            ...config,
            pricing: { ...config.pricing, [slotKey]: value ?? undefined }
          }
        }
        return config
      })
    )
  }

  // 更新区域折扣
  const handleUpdateRegionDiscount = (region: Region, slotKey: string, value: number | null) => {
    setRegionPricingConfigs(configs => 
      configs.map(config => {
        if (config.region === region) {
          return {
            ...config,
            discounts: { ...config.discounts, [slotKey]: value ?? undefined }
          }
        }
        return config
      })
    )
  }

  // 切换区域折扣开关
  const handleToggleRegionDiscount = (region: Region, enabled: boolean) => {
    setRegionPricingConfigs(configs => 
      configs.map(config => {
        if (config.region === region) {
          return { ...config, discountEnabled: enabled }
        }
        return config
      })
    )
  }

  // 切换限时折扣开关
  const handleToggleLimitedTimeDiscount = (region: Region, enabled: boolean) => {
    setRegionPricingConfigs(configs => 
      configs.map(config => {
        if (config.region === region) {
          return { 
            ...config, 
            limitedTimeDiscount: enabled,
            // 如果关闭限时折扣，清空日期范围
            discountDateRange: enabled ? config.discountDateRange : undefined
          }
        }
        return config
      })
    )
  }

  // 更新限时折扣日期范围
  const handleUpdateDiscountDateRange = (region: Region, dates: [dayjs.Dayjs, dayjs.Dayjs] | null) => {
    setRegionPricingConfigs(configs => 
      configs.map(config => {
        if (config.region === region) {
          return { ...config, discountDateRange: dates ?? undefined }
        }
        return config
      })
    )
  }

  // 添加梯度
  const handleAddGradient = () => {
    setGradients([...gradients, { count: 0, discount: 0 }])
  }

  // 删除梯度
  const handleRemoveGradient = (index: number) => {
    setGradients(gradients.filter((_, i) => i !== index))
  }

  // 更新梯度
  const handleUpdateGradient = (index: number, field: 'count' | 'discount', value: number | null) => {
    setGradients(gradients.map((g, i) => {
      if (i === index) {
        return { ...g, [field]: value ?? 0 }
      }
      return g
    }))
  }

  // 添加区域组合折扣
  const handleAddRegionCombination = () => {
    if (selectedRegions.length < 2) {
      message.warning('至少需要选择2个区域才能组合')
      return
    }
    setRegionCombinations([...regionCombinations, { name: '', regions: [], discount: 0 }])
  }

  // 删除区域组合折扣
  const handleRemoveRegionCombination = (index: number) => {
    setRegionCombinations(regionCombinations.filter((_, i) => i !== index))
  }

  // 更新组合名称
  const handleUpdateCombinationName = (index: number, name: string) => {
    setRegionCombinations(combinations => 
      combinations.map((c, i) => {
        if (i === index) {
          return { ...c, name }
        }
        return c
      })
    )
  }

  // 更新区域组合
  const handleUpdateCombinationRegions = (index: number, regions: Region[]) => {
    setRegionCombinations(combinations => 
      combinations.map((c, i) => {
        if (i === index) {
          return { ...c, regions }
        }
        return c
      })
    )
  }

  // 更新组合折扣
  const handleUpdateCombinationDiscount = (index: number, discount: number | null) => {
    setRegionCombinations(combinations => 
      combinations.map((c, i) => {
        if (i === index) {
          return { ...c, discount: discount ?? 0 }
        }
        return c
      })
    )
  }

  // 生成区域组合选项(排除已使用的组合)
  const getRegionCombinationOptions = (currentIndex: number) => {
    if (selectedRegions.length < 2) return []
    
    // 生成所有可能的组合(2个区域到所有区域)
    const combinations: Region[] = []
    const regions = selectedRegions
    
    // 2个区域的组合
    for (let i = 0; i < regions.length; i++) {
      for (let j = i + 1; j < regions.length; j++) {
        combinations.push(regions[i], regions[j])
      }
    }
    
    // 3个及以上区域的组合
    if (regions.length >= 3) {
      combinations.push(...regions)
    }
    
    return regions
  }

  // 返回列表
  const handleBack = () => {
    navigate('/promotion-waterfall')
  }

  // 提交表单
  const handleSubmit = async () => {
    try {
      const values = await form.validateFields()
      setLoading(true)
      
      const submitData = {
        promotionName,
        app: selectedApp,
        channel: selectedChannel,
        algorithmType: selectedAlgorithmType,
        slotPosition: selectedPosition,
        algorithmId: selectedAlgorithmInfo?.id,
        algorithmName: selectedAlgorithmInfo?.name,
        regions: regionPricingConfigs.map(c => ({
          region: c.region,
          pricing: c.pricing,
          discountEnabled: c.discountEnabled,
          discounts: c.discountEnabled ? c.discounts : undefined,
        })),
        salesDateRange,
        gradients,
        regionCombinations,
      }
      
      console.log('提交數據:', submitData)
      message.success('新增成功')
      navigate('/promotion-waterfall')
    } catch (error) {
      console.error('表單驗證失敗:', error)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="content-area">
      {/* 顶部标题栏 */}
      <div style={{
        background: '#fff', padding: '12px 20px', marginBottom: 12,
        borderRadius: 8, boxShadow: '0 2px 8px rgba(0, 0, 0, 0.06)',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
      }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 17, fontWeight: 600, color: '#1890ff' }}>
            新增定價銷售配置
          </h2>
        </div>
        <Button
          type="primary"
          icon={<ArrowLeftOutlined />}
          onClick={handleBack}
          style={{ fontSize: 14 }}
        >
          返回
        </Button>
      </div>

      {/* 表单内容区域 */}
      <div style={{ padding: 0 }}>
        <Form form={form} layout="vertical">
          {/* 基础信息 */}
          <Card title="基礎信息" size="small" style={{ marginBottom: 12, borderRadius: 8 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
              <Form.Item 
                label="活動名稱" 
                name="promotionName" 
                rules={[{ required: true, message: '請輸入活動名稱' }]}
              >
                <Input 
                  placeholder="請輸入活動名稱（最多10個字）" 
                  maxLength={10}
                  value={promotionName}
                  onChange={(e) => setPromotionName(e.target.value)}
                />
              </Form.Item>

              <Form.Item 
                label="所屬品牌" 
                name="app" 
                rules={[{ required: true, message: '請選擇所屬品牌' }]}
              >
                <Select 
                  placeholder="請選擇所屬品牌" 
                  options={APP_OPTIONS}
                  onChange={(value) => setSelectedApp(value)}
                />
              </Form.Item>

              <Form.Item 
                label="業務頻道" 
                name="channel" 
                rules={[{ required: true, message: '請選擇業務頻道' }]}
              >
                <Select 
                  placeholder="請選擇業務頻道" 
                  options={[
                    { label: '美食外賣', value: RecommendChannel.DELIVERY },
                    { label: '超市百貨', value: RecommendChannel.SUPERMARKET },
                    { label: '團購到店', value: RecommendChannel.GROUP_BUY },
                  ]}
                  onChange={(value) => setSelectedChannel(value)}
                />
              </Form.Item>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
              <Form.Item 
                label="廣告類型" 
                name="algorithmType" 
                rules={[{ required: true, message: '請選擇廣告類型' }]}
              >
                <Select 
                  placeholder="請選擇廣告類型" 
                  options={[
                    { label: '無敵星星', value: AlgorithmType.INVINCIBLE_STAR },
                    { label: '新店廣告', value: AlgorithmType.NEW_STORE_AD },
                    { label: '盤活復蘇', value: AlgorithmType.HOT_REVIVE_AD },
                    { label: '獨家商家', value: AlgorithmType.EXCLUSIVE_MERCHANT },
                    { label: '流量廣告', value: AlgorithmType.TRAFFIC_AD },
                    { label: '猜你喜歡', value: AlgorithmType.GUESS_YOU_LIKE },
                    { label: '自然流量', value: AlgorithmType.ORGANIC_TRAFFIC },
                    { label: '搜索算法', value: AlgorithmType.SEARCH_ALGORITHM },
                  ]}
                  onChange={(value) => setSelectedAlgorithmType(value)}
                />
              </Form.Item>

              <Form.Item 
                label="算法落地頁" 
                name="algorithmLandingPage" 
                rules={[{ required: true, message: '請選擇算法落地頁' }]}
              >
                <Select
                  placeholder="請選擇算法落地頁"
                  options={[
                    { label: '大首頁-Feed', value: 'home' },
                    { label: '外賣頻道-Feed', value: 'delivery' },
                    { label: '超市頻道-Feed', value: 'supermarket' },
                    { label: '團購頻道-Feed', value: 'groupBuy' },
                  ]}
                />
              </Form.Item>
            </div>
          </Card>

          {/* 广告位选择 */}
          {canShowPositions && (
            <Card 
              title="選擇廣告位" 
              size="small"
              style={{ marginBottom: 12, borderRadius: 8 }}
              extra={<Tag color="blue">必填</Tag>}
            >
              <div style={{ background: '#fafafa', borderRadius: 6, padding: 12 }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(10, 40px)', gap: 8, justifyContent: 'start' }}>
                  {mockPositionAlgorithm.map((item) => {
                    const position = item.position
                    const isSelected = selectedPosition === position
                    
                    return (
                      <div
                        key={position}
                        onClick={() => handlePositionSelect(position)}
                        style={{
                          width: 40,
                          height: 40,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          background: isSelected ? '#52c41a' : '#fff',
                          border: isSelected ? '2px solid #52c41a' : '2px solid #d9d9d9',
                          color: isSelected ? '#fff' : '#595959',
                          borderRadius: 6,
                          cursor: 'pointer',
                          fontSize: 13,
                          fontWeight: 600,
                          transition: 'all 0.2s',
                          boxShadow: isSelected ? '0 2px 8px rgba(82, 196, 26, 0.3)' : 'none',
                        }}
                      >
                        {position}
                      </div>
                    )
                  })}
                </div>
              </div>

              {selectedAlgorithmInfo && (
                <div style={{ marginTop: 12, padding: '10px 12px', background: '#f6ffed', border: '1px solid #b7eb8f', borderRadius: 6 }}>
                  <Space size="middle">
                    <div style={{ fontSize: 12, color: '#595959', display: 'flex', alignItems: 'center', gap: 4 }}>
                      <span style={{ color: '#8c8c8c' }}>算法ID:</span>
                      <code style={{ background: '#fff', padding: '2px 8px', borderRadius: 4 }}>
                        {String(selectedAlgorithmInfo.id).padStart(6, '0')}
                      </code>
                    </div>
                    <div style={{ fontSize: 12, color: '#595959', display: 'flex', alignItems: 'center', gap: 4 }}>
                      <span style={{ color: '#8c8c8c' }}>算法名稱:</span>
                      <strong style={{ color: '#262626' }}>
                        {selectedAlgorithmInfo.name}
                      </strong>
                    </div>
                    <Button 
                      type="link" 
                      size="small" 
                      icon={<FileTextOutlined />}
                      onClick={() => setAlgorithmRuleModalVisible(true)}
                      style={{ padding: 0 }}
                    >
                      查看算法规则
                    </Button>
                  </Space>
                </div>
              )}
            </Card>
          )}

          {/* 销售策略（仅无敌星星） */}
          {selectedPosition && !isReviveAlgorithm && (
            <Card 
              title="銷售策略" 
              size="small"
              style={{ marginBottom: 12, borderRadius: 8 }}
            >
              {/* 预售模式 + 预售天数 并排 */}
              <div style={{ display: 'flex', gap: 16, marginBottom: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 200 }}>
                  <span style={{ fontSize: 13, color: '#595959', minWidth: 80 }}>預售模式:</span>
                  <Switch 
                    checked={presaleMode === 'rolling'}
                    onChange={(checked) => setPresaleMode(checked ? 'rolling' : 'fixed')}
                    checkedChildren="滾動"
                    unCheckedChildren="固定"
                  />
                </div>
                <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 1 }}>
                  <span style={{ fontSize: 13, color: '#595959', minWidth: 80 }}>預售天數:</span>
                  <InputNumber
                    min={1}
                    max={90}
                    value={presaleDays}
                    onChange={(value) => setPresaleDays(value || 7)}
                    addonAfter="天"
                    style={{ width: 160 }}
                  />
                  <span style={{ fontSize: 12, color: '#8c8c8c' }}>
                    {presaleMode === 'fixed' 
                      ? `系統僅銷售 ${presaleDays} 天內的廣告，每過一天減少一天，售完即止`
                      : `系統持續銷售 ${presaleDays} 天內的廣告，每過一天自動補充一天，循環銷售`}
                  </span>
                </div>
              </div>

              {/* 连续购买：Switch + 右侧参数 */}
              <div style={{ display: 'flex', gap: 16, marginBottom: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 200 }}>
                  <span style={{ fontSize: 13, color: '#595959', minWidth: 80 }}>連續購買:</span>
                  <Switch 
                    checked={continuousPurchase}
                    onChange={(checked) => setContinuousPurchase(checked)}
                    checkedChildren="支持"
                    unCheckedChildren="不支持"
                  />
                </div>
                {/* 右侧参数区 */}
                {continuousPurchase ? (
                  <div style={{ flex: 1, padding: 12, background: '#f6ffed', borderRadius: 6, border: '1px solid #b7eb8f' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 12, color: '#595959' }}>購買上限：</span>
                      <InputNumber min={1} max={365} value={purchaseLimitDays} onChange={(value) => setPurchaseLimitDays(value || 30)} style={{ width: 80 }} size="small" />
                      <span style={{ fontSize: 12, color: '#595959' }}>天內，最多可購買</span>
                      <InputNumber min={1} max={20} value={purchaseLimitSlots} onChange={(value) => setPurchaseLimitSlots(value || 3)} style={{ width: 70 }} size="small" />
                      <span style={{ fontSize: 12, color: '#595959' }}>個時段，只統計</span>
                    </div>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      {TIME_SLOTS.filter(t => t.key !== 'fullDay').map(slot => (
                        <Checkbox
                          key={slot.key}
                          checked={purchaseLimitMeals.includes(slot.key)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setPurchaseLimitMeals([...purchaseLimitMeals, slot.key])
                            } else {
                              setPurchaseLimitMeals(purchaseLimitMeals.filter(k => k !== slot.key))
                            }
                          }}
                        >
                          {slot.label}
                        </Checkbox>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div style={{ flex: 1, padding: 12, background: '#fff7e6', borderRadius: 6, border: '1px solid #ffd591' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 12, color: '#595959' }}>間隔</span>
                      <InputNumber min={1} max={365} value={continuousInterval} onChange={(value) => setContinuousInterval(value || 7)} style={{ width: 80 }} size="small" />
                      <span style={{ fontSize: 12, color: '#595959' }}>天，可再次購買</span>
                    </div>
                  </div>
                )}
              </div>

              {/* 商家限制：Switch + 右侧按钮 */}
              <div style={{ display: 'flex', gap: 16, marginBottom: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 200 }}>
                  <span style={{ fontSize: 13, color: '#595959', minWidth: 80 }}>商家限制:</span>
                  <Switch 
                    checked={merchantLimit}
                    onChange={(checked) => setMerchantLimit(checked)}
                    checkedChildren="限制"
                    unCheckedChildren="不限制"
                  />
                </div>
                {merchantLimit && (
                  <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 12 }}>
                    <Button icon={<PlusOutlined />} onClick={() => message.info('打開商家選擇界面')}>
                      選擇商家
                    </Button>
                    {selectedMerchants.length > 0 && (
                      <span style={{ fontSize: 12, color: '#8c8c8c' }}>已選 {selectedMerchants.length} 個商家</span>
                    )}
                  </div>
                )}
              </div>

              {/* 可售时段 */}
              <div style={{ display: 'flex', gap: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 200 }}>
                  <span style={{ fontSize: 13, color: '#595959', minWidth: 80 }}>可售時段:</span>
                  <Switch 
                    checked={!onlySellTimeSlots.includes('fullDay')}
                    onChange={(checked) => {
                      if (checked) {
                        // 指定：清空选择，让用户自己勾选
                        setOnlySellTimeSlots([])
                      } else {
                        // 全部
                        setOnlySellTimeSlots(['fullDay'])
                      }
                    }}
                    checkedChildren="指定"
                    unCheckedChildren="全部"
                  />
                </div>
                {/* 指定时显示5个时段勾选 */}
                {!onlySellTimeSlots.includes('fullDay') && (
                  <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 16, padding: 12, background: '#f6ffed', borderRadius: 6, border: '1px solid #b7eb8f' }}>
                    {TIME_SLOTS.filter(t => t.key !== 'fullDay').map(slot => (
                      <Checkbox
                        key={slot.key}
                        checked={onlySellTimeSlots.includes(slot.key)}
                        onChange={(e) => {
                          let next: string[]
                          if (e.target.checked) {
                            next = [...onlySellTimeSlots, slot.key]
                          } else {
                            next = onlySellTimeSlots.filter(k => k !== slot.key)
                          }
                          setOnlySellTimeSlots(next)
                        }}
                      >
                        {slot.label}
                      </Checkbox>
                    ))}
                  </div>
                )}
              </div>
            </Card>
          )}

          {/* 暂未开通提示 */}
          {showNotAvailable && (
            <Card 
              size="small"
              style={{ marginBottom: 12, borderRadius: 8 }}
            >
              <div style={{ textAlign: 'center', padding: '32px 0', color: '#8c8c8c' }}>
                <div style={{ fontSize: 32, marginBottom: 12 }}>🚧</div>
                <div style={{ fontSize: 15, fontWeight: 500, color: '#595959', marginBottom: 6 }}>
                  暫未開通
                </div>
                <div style={{ fontSize: 13 }}>
                  當前推薦類型暫不支持廣告位選擇，僅「無敵星星」和「盤活復蘇」類型可用
                </div>
              </div>
            </Card>
          )}


          {/* 区域计价配置 */}
          {selectedPosition && (
            <Card 
              title="商圈計價配置" 
              size="small"
              style={{ marginBottom: 12, borderRadius: 8 }}
              extra={
                <Button 
                  type="primary" 
                  size="small"
                  icon={<PlusOutlined />}
                  onClick={() => {
                    setSelectedRegionNode(null)
                    setRegionSelectModalVisible(true)
                  }}
                >
                  選擇商圈
                </Button>
              }
            >
              {regionPricingConfigs.length === 0 ? (
                <div style={{ textAlign: 'center', padding: 40, color: '#8c8c8c', fontSize: 13 }}>
                  請選擇商圈並點擊"新增"按鈕添加計價配置
                </div>
              ) : (
                <>
              {/* 每个区域的计价配置 */}
              {regionPricingConfigs.map((config, index) => (
                <div key={config.region} style={{ marginBottom: index < regionPricingConfigs.length - 1 ? 24 : 0, padding: 16, background: '#fafafa', borderRadius: 6 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                    <Tag color="cyan" style={{ fontSize: 14, padding: '4px 12px' }}>
                      {config.regionLabel}
                    </Tag>
                    {regionPricingConfigs.length > 1 && (
                      <Button 
                        type="text" 
                        danger 
                        icon={<DeleteFilled style={{ fontSize: 16 }} />}
                        onClick={() => handleRemoveRegionConfig(config.region)}
                      />
                    )}
                  </div>

                  {/* 时段售价 / 按天售价 */}
                  {isReviveAlgorithm ? (
                    // 盤活復蘇：按天计价
                    <Form.Item
                      label="每天售價"
                      style={{ marginBottom: 0 }}
                    >
                      <InputNumber
                        min={0}
                        precision={2}
                        placeholder="請輸入每天售價"
                        style={{ width: '100%' }}
                        addonAfter="MOP/天"
                        value={config.pricing['fullDay']}
                        onChange={(value) => handleUpdateRegionPricing(config.region, 'fullDay', value)}
                      />
                    </Form.Item>
                  ) : (
                    // 無敵星星：按时段计价
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 12 }}>
                      {TIME_SLOTS.map(slot => (
                        <Form.Item
                          key={slot.key}
                          label={`${slot.label}售價`}
                          style={{ marginBottom: 0 }}
                        >
                          <InputNumber
                            min={0}
                            precision={2}
                            placeholder={`請輸入${slot.label}售價`}
                            style={{ width: '100%' }}
                            addonAfter="MOP"
                            value={config.pricing[slot.key]}
                            onChange={(value) => handleUpdateRegionPricing(config.region, slot.key, value)}
                          />
                        </Form.Item>
                      ))}
                    </div>
                  )}

                  {/* 时段折扣开关 - 仅無敵星星显示 */}
                  {!isReviveAlgorithm && (
                    <>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: config.discountEnabled ? 12 : 0 }}>
                    <span style={{ fontSize: 13, color: '#595959' }}>时段折扣配置:</span>
                    <Switch 
                      checked={config.discountEnabled} 
                      onChange={(checked) => handleToggleRegionDiscount(config.region, checked)}
                      size="small"
                    />
                    <span style={{ fontSize: 12, color: '#8c8c8c' }}>單獨購買時段可享受的折扣</span>
                  </div>

                  {/* 时段折扣配置 */}
                  {config.discountEnabled && (
                    <>
                      {/* 限时折扣开关 */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: config.limitedTimeDiscount ? 12 : 16 }}>
                        <span style={{ fontSize: 13, color: '#595959' }}>限时折扣:</span>
                        <Switch 
                          checked={config.limitedTimeDiscount} 
                          onChange={(checked) => handleToggleLimitedTimeDiscount(config.region, checked)}
                          size="small"
                        />
                        <span style={{ fontSize: 12, color: '#8c8c8c' }}>
                          {config.limitedTimeDiscount ? '在指定周期内执行打折' : '一直执行打折'}
                        </span>
                      </div>

                      {/* 限时折扣日期周期 */}
                      {config.limitedTimeDiscount && (
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 12 }}>
                          <Form.Item
                            label="折扣周期"
                            style={{ marginBottom: 0 }}
                          >
                            <DatePicker.RangePicker
                              style={{ width: '100%' }}
                              placeholder={['開始日期', '結束日期']}
                              value={config.discountDateRange}
                              onChange={(dates) => handleUpdateDiscountDateRange(config.region, dates as [dayjs.Dayjs, dayjs.Dayjs] | null)}
                            />
                          </Form.Item>
                        </div>
                      )}

                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
                      {TIME_SLOTS.map(slot => (
                        <Form.Item
                          key={slot.key}
                          label={`${slot.label}折扣`}
                          style={{ marginBottom: 0 }}
                        >
                          <InputNumber
                            min={1}
                            max={100}
                            placeholder={`請輸入${slot.label}折扣`}
                            style={{ width: '100%' }}
                            addonAfter="折"
                            value={config.discounts[slot.key]}
                            onChange={(value) => handleUpdateRegionDiscount(config.region, slot.key, value)}
                          />
                        </Form.Item>
                      ))}
                    </div>
                    </>
                  )}
                    </>
                  )}
                </div>
              ))}
              </>
              )}
            </Card>
          )}

          {/* 购买多天折扣配置（梯度）/ 时段个数折扣配置 */}
          {selectedRegions.length > 0 && (
            <Card 
              title={
                <Space>
                  {isReviveAlgorithm ? '購買多天折扣配置（梯度）' : '時段個數折扣配置（梯度）'}
                  <Switch 
                    checked={gradientEnabled}
                    onChange={(checked) => {
                      setGradientEnabled(checked)
                      // 开启时默认添加一个梯度
                      if (checked && gradients.length === 0) {
                        setGradients([{ count: 0, discount: 0 }])
                      }
                    }}
                    size="small"
                    style={{ marginLeft: 8 }}
                  />
                  <span style={{ fontSize: 12, color: '#8c8c8c', fontWeight: 'normal' }}>
                    {isReviveAlgorithm ? '購買多天時匹配以下折扣' : '購買多個時段時匹配以下折扣'}
                  </span>
                </Space>
              }
              size="small"
              style={{ marginBottom: 12, borderRadius: 8 }}
              extra={
                gradientEnabled && (
                  <Button 
                    type="primary" 
                    size="small" 
                    icon={<PlusOutlined />}
                    onClick={handleAddGradient}
                  >
                    添加梯度
                  </Button>
                )
              }
            >
              {gradientEnabled ? (
                gradients.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: 24, color: '#8c8c8c', fontSize: 13 }}>
                    暫無梯度配置，請點擊右上角"添加梯度"
                  </div>
                ) : (
                  <Space direction="vertical" size={12} style={{ width: '100%' }}>
                  {gradients.map((gradient, index) => (
                    <div key={index} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: 12, background: '#fafafa', borderRadius: 6 }}>
                      <Tag color="blue">梯度 {index + 1}</Tag>
                      <span style={{ fontSize: 13, color: '#595959' }}>{isReviveAlgorithm ? '購買天數≥' : '時段個數≥'}</span>
                      <InputNumber
                        min={1}
                        max={isReviveAlgorithm ? 30 : 6}
                        placeholder={isReviveAlgorithm ? '天數' : '時段個數'}
                        style={{ width: 80 }}
                        value={gradient.count}
                        onChange={(value) => handleUpdateGradient(index, 'count', value)}
                      />
                      <span style={{ fontSize: 13, color: '#595959' }}>{isReviveAlgorithm ? '天，對應折扣：' : '個時段，對應折扣：'}</span>
                      <InputNumber
                        min={1}
                        max={100}
                        placeholder="折扣"
                        style={{ width: 80 }}
                        addonAfter="折"
                        value={gradient.discount}
                        onChange={(value) => handleUpdateGradient(index, 'discount', value)}
                      />
                      <Button 
                        type="text" 
                        danger 
                        icon={<DeleteFilled style={{ fontSize: 16 }} />}
                        onClick={() => handleRemoveGradient(index)}
                      />
                    </div>
                  ))}
                </Space>
                )
              ) : null}
            </Card>
          )}

          {/* 商圈选择弹窗 */}
          <Modal
            title="選擇商圈"
            open={regionSelectModalVisible}
            onCancel={() => setRegionSelectModalVisible(false)}
            onOk={() => {
              if (!selectedRegionNode) {
                message.warning('請選擇一個區域或商圈')
                return
              }
              // 根据树节点映射到Region
              const nodeKey = selectedRegionNode.key
              let regionValue: Region
              if (nodeKey.startsWith('1')) regionValue = Region.MACAU
              else if (nodeKey.startsWith('2')) regionValue = Region.TAIPA
              else regionValue = Region.ZHUHAI
              
              if (regionPricingConfigs.find(c => c.region === regionValue)) {
                message.warning('該區域已添加計價配置')
                return
              }
              handleAddRegionConfig(regionValue, selectedRegionNode.title)
              setRegionSelectModalVisible(false)
            }}
            okText="確認"
            cancelText="取消"
            width={800}
          >
            <div style={{ display: 'flex', gap: 16, padding: '8px 0' }}>
              {/* 左侧树形结构 */}
              <div style={{ width: 240, flexShrink: 0 }}>
                <div style={{ marginBottom: 8, fontSize: 13, color: '#8c8c8c' }}>
                  請選擇區域或商圈：
                </div>
                <Tree
                  treeData={regionTreeData}
                  defaultExpandAll
                  showIcon={false}
                  switcherIcon={<DownOutlined />}
                  selectedKeys={selectedRegionNode ? [selectedRegionNode.key] : []}
                  onSelect={(keys, info) => {
                    setSelectedRegionNode({
                      key: keys[0] as string,
                      title: info.node.title as string,
                      level: info.node.children ? 1 : 2,
                    })
                  }}
                  style={{ padding: 12, background: '#fafafa', borderRadius: 6, border: '1px solid #f0f0f0', minHeight: 300 }}
                />
                {selectedRegionNode && (
                  <div style={{ marginTop: 8, padding: '8px 12px', background: '#f6ffed', border: '1px solid #b7eb8f', borderRadius: 6 }}>
                    <span style={{ fontSize: 12, color: '#595959' }}>已選擇：</span>
                    <Tag color="green">{selectedRegionNode.title}</Tag>
                    <span style={{ fontSize: 12, color: '#8c8c8c' }}>({selectedRegionNode.level === 1 ? '區域' : '商圈'})</span>
                  </div>
                )}
              </div>
              {/* 右侧地图区域 */}
              <div style={{ flex: 1, borderRadius: 6, overflow: 'hidden', border: '1px solid #f0f0f0', minHeight: 350 }}>
                <MapContainer
                  center={[22.1987, 113.5439]}
                  zoom={13}
                  style={{ height: '100%', width: '100%' }}
                >
                  <TileLayer
                    attribution='&copy; <a href="https://www.amap.com/">高德地图</a>'
                    url="https://webrd0{s}.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=8&x={x}&y={y}&z={z}"
                    subdomains="1234"
                  />
                </MapContainer>
              </div>
            </div>
          </Modal>

          {/* 多区域组合折扣 - 仅無敵星星显示 */}
          {!isReviveAlgorithm && selectedRegions.length > 0 && (
            <Card 
              title={
                <Space>
                  商圈組合折扣
                  <Switch 
                    checked={regionCombinationEnabled}
                    onChange={(checked) => {
                      setRegionCombinationEnabled(checked)
                      // 开启时默认添加一个组合折扣
                      if (checked && regionCombinations.length === 0) {
                        setRegionCombinations([{ name: '', regions: [], discount: 0 }])
                      }
                    }}
                    size="small"
                    style={{ marginLeft: 8 }}
                  />
                  <span style={{ fontSize: 12, color: '#8c8c8c', fontWeight: 'normal' }}>
                    選擇多個區域時可享受的組合折扣
                  </span>
                </Space>
              }
              size="small"
              style={{ marginBottom: 12, borderRadius: 8 }}
              extra={
                regionCombinationEnabled && (
                  <Button 
                    type="primary" 
                    size="small" 
                    icon={<PlusOutlined />}
                    onClick={handleAddRegionCombination}
                  >
                    添加組合
                  </Button>
                )
              }
            >
              {regionCombinationEnabled ? (
                regionCombinations.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: 24, color: '#8c8c8c', fontSize: 13 }}>
                    暫無區域組合折扣，請點擊右上角"添加組合"
                  </div>
                ) : (
                  <Space direction="vertical" size={12} style={{ width: '100%' }}>
                  {regionCombinations.map((combination, index) => (
                    <div key={index} style={{ display: 'flex', gap: 12, alignItems: 'center', padding: 12, background: '#fafafa', borderRadius: 6 }}>
                      <Tag color="purple">組合 {index + 1}</Tag>
                      <Form.Item label="組合名稱" style={{ marginBottom: 0, flex: 1.5 }}>
                        <Input
                          placeholder="請輸入組合名稱"
                          value={combination.name}
                          onChange={(e) => handleUpdateCombinationName(index, e.target.value)}
                        />
                      </Form.Item>
                      <Form.Item label="選擇商圈" style={{ marginBottom: 0, flex: 2 }}>
                        <Select
                          mode="multiple"
                          placeholder="請選擇組合區域"
                          style={{ width: '100%' }}
                          options={REGION_OPTIONS.filter((opt) => selectedRegions.includes(opt.value))}
                          value={combination.regions}
                          onChange={(value) => handleUpdateCombinationRegions(index, value)}
                        />
                      </Form.Item>
                      <span style={{ color: '#8c8c8c' }}>→</span>
                      <Form.Item label="組合折扣" style={{ marginBottom: 0, flex: 1 }}>
                        <InputNumber
                          min={1}
                          max={100}
                          placeholder="折扣"
                          style={{ width: '100%' }}
                          addonAfter="折"
                          value={combination.discount}
                          onChange={(value) => handleUpdateCombinationDiscount(index, value)}
                        />
                      </Form.Item>
                      <Button 
                        type="text" 
                        danger 
                        icon={<DeleteFilled style={{ fontSize: 16 }} />}
                        onClick={() => handleRemoveRegionCombination(index)}
                      />
                    </div>
                  ))}
                </Space>
                )
              ) : null}
            </Card>
          )}

          {/* 销售日期 */}
          {selectedRegions.length > 0 && (
            <Card 
              title="銷售日期" 
              size="small"
              style={{ marginBottom: 12, borderRadius: 8 }}
              extra={<Tag color="blue">必填</Tag>}
            >
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, alignItems: 'center' }}>
                <Form.Item 
                  name="salesDateRange" 
                  rules={[{ required: true, message: '請選擇銷售日期' }]}
                  style={{ marginBottom: 0 }}
                >
                  <DatePicker.RangePicker 
                    style={{ width: '100%' }} 
                    placeholder={['開始日期', '結束日期']}
                    onChange={(dates) => setSalesDateRange(dates as [dayjs.Dayjs, dayjs.Dayjs] | undefined)}
                  />
                </Form.Item>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 14, color: '#595959', whiteSpace: 'nowrap' }}>狀態:</span>
                  <Switch 
                    checked={status === ServiceStatus.ENABLED}
                    onChange={(checked) => setStatus(checked ? ServiceStatus.ENABLED : ServiceStatus.DISABLED)}
                    checkedChildren="啟用"
                    unCheckedChildren="停用"
                  />
                </div>
              </div>
            </Card>
          )}
        </Form>
      </div>

      {/* 底部操作按钮 - 固定 */}
      <div style={{ 
        padding: '12px 20px',
        background: '#fff',
        borderTop: '1px solid #f0f0f0',
        borderRadius: 8,
        boxShadow: '0 2px 8px rgba(0, 0, 0, 0.06)',
        display: 'flex',
        justifyContent: 'flex-end',
        gap: 12,
      }}>
        <Button onClick={handleBack} style={{ fontSize: 14 }}>
          取消
        </Button>
        <Button
          type="primary"
          icon={<SaveOutlined />}
          onClick={handleSubmit}
          loading={loading}
          style={{ fontSize: 14 }}
        >
          提交
        </Button>
      </div>

      {/* 算法规则弹窗 */}
      <Modal
        title={
          <Space>
            <FileTextOutlined />
            <span>算法规则配置</span>
          </Space>
        }
        open={algorithmRuleModalVisible}
        onCancel={() => setAlgorithmRuleModalVisible(false)}
        footer={[
          <Button key="close" onClick={() => setAlgorithmRuleModalVisible(false)}>
            關閉
          </Button>
        ]}
        width={800}
      >
        {selectedAlgorithmInfo && (
          <div>
            <div style={{ marginBottom: 16, padding: 12, background: '#f6ffed', borderRadius: 6 }}>
              <Space>
                <span style={{ color: '#8c8c8c' }}>算法ID:</span>
                <code style={{ background: '#fff', padding: '2px 8px', borderRadius: 4 }}>
                  {String(selectedAlgorithmInfo.id).padStart(6, '0')}
                </code>
                <span style={{ color: '#8c8c8c', marginLeft: 16 }}>算法名稱:</span>
                <strong>{selectedAlgorithmInfo.name}</strong>
              </Space>
            </div>

            <Divider style={{ margin: '16px 0' }} />

            <h4 style={{ marginBottom: 12 }}>規則參數配置</h4>
            <div style={{ background: '#fafafa', padding: 16, borderRadius: 6 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: '#fff', borderBottom: '2px solid #d9d9d9' }}>
                    <th style={{ padding: '8px 12px', textAlign: 'left', fontSize: 13 }}>參數名稱</th>
                    <th style={{ padding: '8px 12px', textAlign: 'left', fontSize: 13 }}>參數值</th>
                    <th style={{ padding: '8px 12px', textAlign: 'left', fontSize: 13 }}>說明</th>
                  </tr>
                </thead>
                <tbody>
                  <tr style={{ borderBottom: '1px solid #f0f0f0' }}>
                    <td style={{ padding: '8px 12px', fontSize: 13 }}>匹配策略</td>
                    <td style={{ padding: '8px 12px', fontSize: 13 }}><code>weighted_score</code></td>
                    <td style={{ padding: '8px 12px', fontSize: 13, color: '#8c8c8c' }}>加權評分匹配</td>
                  </tr>
                  <tr style={{ borderBottom: '1px solid #f0f0f0' }}>
                    <td style={{ padding: '8px 12px', fontSize: 13 }}>召回數量</td>
                    <td style={{ padding: '8px 12px', fontSize: 13 }}><code>100</code></td>
                    <td style={{ padding: '8px 12px', fontSize: 13, color: '#8c8c8c' }}>初始召回商品數</td>
                  </tr>
                  <tr style={{ borderBottom: '1px solid #f0f0f0' }}>
                    <td style={{ padding: '8px 12px', fontSize: 13 }}>精排閾值</td>
                    <td style={{ padding: '8px 12px', fontSize: 13 }}><code>0.75</code></td>
                    <td style={{ padding: '8px 12px', fontSize: 13, color: '#8c8c8c' }}>精排過濾閾值</td>
                  </tr>
                  <tr style={{ borderBottom: '1px solid #f0f0f0' }}>
                    <td style={{ padding: '8px 12px', fontSize: 13 }}>重排策略</td>
                    <td style={{ padding: '8px 12px', fontSize: 13 }}><code>diversity_boost</code></td>
                    <td style={{ padding: '8px 12px', fontSize: 13, color: '#8c8c8c' }}>多樣性提升重排</td>
                  </tr>
                  <tr>
                    <td style={{ padding: '8px 12px', fontSize: 13 }}>打散規則</td>
                    <td style={{ padding: '8px 12px', fontSize: 13 }}><code>category_interval=3</code></td>
                    <td style={{ padding: '8px 12px', fontSize: 13, color: '#8c8c8c' }}>同類目間隔3個</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <Divider style={{ margin: '16px 0' }} />

            <h4 style={{ marginBottom: 12 }}>權重配置</h4>
            <div style={{ background: '#fafafa', padding: 16, borderRadius: 6 }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 }}>
                <div style={{ padding: 12, background: '#fff', borderRadius: 4 }}>
                  <div style={{ fontSize: 12, color: '#8c8c8c', marginBottom: 4 }}>銷量權重</div>
                  <div style={{ fontSize: 18, fontWeight: 600, color: '#1890ff' }}>0.35</div>
                </div>
                <div style={{ padding: 12, background: '#fff', borderRadius: 4 }}>
                  <div style={{ fontSize: 12, color: '#8c8c8c', marginBottom: 4 }}>評分權重</div>
                  <div style={{ fontSize: 18, fontWeight: 600, color: '#52c41a' }}>0.25</div>
                </div>
                <div style={{ padding: 12, background: '#fff', borderRadius: 4 }}>
                  <div style={{ fontSize: 12, color: '#8c8c8c', marginBottom: 4 }}>距離權重</div>
                  <div style={{ fontSize: 18, fontWeight: 600, color: '#faad14' }}>0.20</div>
                </div>
                <div style={{ padding: 12, background: '#fff', borderRadius: 4 }}>
                  <div style={{ fontSize: 12, color: '#8c8c8c', marginBottom: 4 }}>轉化權重</div>
                  <div style={{ fontSize: 18, fontWeight: 600, color: '#f5222d' }}>0.20</div>
                </div>
              </div>
            </div>
          </div>
        )}
      </Modal>

    </div>
  )
}
