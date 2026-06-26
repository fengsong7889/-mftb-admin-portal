import { useState, Fragment } from 'react'
import { Button, Form, Input, InputNumber, Select, Space, Card, message, Divider, Tag, DatePicker, Switch, Radio, Modal, Checkbox, Table } from 'antd'
import { ArrowLeftOutlined, SaveOutlined, PlusOutlined, MinusOutlined, DeleteFilled, FileTextOutlined, SettingOutlined } from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import { 
  AppType, 
  RecommendChannel, 
  AlgorithmType,
  Region,
  TimeSlot,
  ServiceStatus,
  APP_OPTIONS,
  RECOMMEND_CHANNEL_OPTIONS,
  ALGORITHM_TYPE_OPTIONS,
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

// 时段枚举
const TIME_SLOTS = [
  { key: 'fullDay', label: '全時段' },
  { key: 'breakfast', label: '早餐' },
  { key: 'lunch', label: '午餐' },
  { key: 'afternoon', label: '下午茶' },
  { key: 'dinner', label: '晚餐' },
  { key: 'night', label: '宵夜' },
]

// 区域计价配置接口
interface RegionPricingConfig {
  region: Region
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
  
  // 显示广告位的条件
  const canShowPositions = selectedApp && selectedChannel && selectedAlgorithmType

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
    
    const algorithm = mockPositionAlgorithm.find(p => p.position === position)
    if (algorithm) {
      setSelectedAlgorithmInfo({
        id: algorithm.algorithmId,
        name: algorithm.algorithmName,
      })
    }
  }

  // 添加区域计价配置
  const handleAddRegionConfig = (region: Region) => {
    if (regionPricingConfigs.find(c => c.region === region)) {
      message.warning('該區域已添加計價配置')
      return
    }
    
    const newConfig: RegionPricingConfig = {
      region,
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
                  options={RECOMMEND_CHANNEL_OPTIONS}
                  onChange={(value) => setSelectedChannel(value)}
                />
              </Form.Item>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
              <Form.Item 
                label="推薦類型" 
                name="algorithmType" 
                rules={[{ required: true, message: '請選擇推薦類型' }]}
              >
                <Select 
                  placeholder="請選擇推薦類型" 
                  options={ALGORITHM_TYPE_OPTIONS}
                  onChange={(value) => setSelectedAlgorithmType(value)}
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


          {/* 区域计价配置 */}
          {selectedPosition && (
            <Card 
              title="商圈計價配置" 
              size="small"
              style={{ marginBottom: 12, borderRadius: 8 }}
              extra={
                <Space>
                  <Select
                    placeholder="選擇商圈"
                    style={{ width: 150 }}
                    size="small"
                    options={REGION_OPTIONS.filter(opt => !selectedRegions.includes(opt.value))}
                    value={newRegionSelect}
                    onChange={(value) => setNewRegionSelect(value)}
                  />
                  <Button 
                    type="primary" 
                    size="small"
                    icon={<PlusOutlined />}
                    onClick={() => {
                      if (!newRegionSelect) {
                        message.warning('請先選擇商圈')
                        return
                      }
                      handleAddRegionConfig(newRegionSelect)
                      setNewRegionSelect(undefined)
                    }}
                  >
                    新增
                  </Button>
                </Space>
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
                      {REGION_OPTIONS.find((opt) => opt.value === config.region)?.label}
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

                  {/* 时段售价 */}
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

                  {/* 时段折扣开关 */}
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
                </div>
              ))}
              </>
              )}
            </Card>
          )}

          {/* 时段个数折扣 - 梯度配置 */}
          {selectedRegions.length > 0 && (
            <Card 
              title={
                <Space>
                  時段個數折扣配置（梯度）
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
                    購買多個時段時匹配以下折扣
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
                      <span style={{ fontSize: 13, color: '#595959' }}>時段個數≥</span>
                      <InputNumber
                        min={1}
                        max={6}
                        placeholder="時段個數"
                        style={{ width: 80 }}
                        value={gradient.count}
                        onChange={(value) => handleUpdateGradient(index, 'count', value)}
                      />
                      <span style={{ fontSize: 13, color: '#595959' }}>個時段，對應折扣：</span>
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

          {/* 多区域组合折扣 */}
          {selectedRegions.length > 0 && (
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
