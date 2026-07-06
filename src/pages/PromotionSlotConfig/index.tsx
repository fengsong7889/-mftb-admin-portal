import { useState, useEffect, useMemo } from 'react'
import { Button, Space, Table, Tag, Select, Form, Card, Badge, Modal, InputNumber, message, Input, DatePicker, Tabs } from 'antd'
const { RangePicker } = DatePicker
import type { ColumnsType } from 'antd/es/table'
import { SearchOutlined, ReloadOutlined, MobileOutlined, PlusOutlined, EditOutlined, ControlOutlined } from '@ant-design/icons'
import { useNavigate, useSearchParams } from 'react-router-dom'

/** 瀑布流配置记录 */
interface WaterfallSlotConfig {
  id: number
  slotIndex: number
  businessChannel: string  // 业务频道: food / supermarket / groupBuy
  pageLocation: string     // 页面位置: home / delivery / supermarket / groupBuy
  timeSlot: string         // 时段: allDay / breakfast / lunch / afternoonTea / dinner / midnightSnack
  app: string
  position: number
  algorithmId: number
  algorithmName: string
  algorithmType: string
  weight: number
  status: 'active' | 'inactive'
  updatedBy: string
  updatedAt: string
}

/** 页面位置完整名称 */
const PAGE_LOCATION_FULL_LABEL: Record<string, string> = {
  home: '大首頁瀑布流',
  delivery: '外賣頻道瀑布流',
  groupBuy: '團購頻道瀑布流',
  supermarket: '超市頻道瀑布流',
}

/** 页面位置标签 */
const PAGE_LOCATION_LABEL: Record<string, string> = {
  home: '大首頁',
  delivery: '外賣頻道',
  groupBuy: '團購頻道',
  supermarket: '超市頻道',
}

/** 业务频道标签 */
const BUSINESS_CHANNEL_LABEL: Record<string, string> = {
  food: '美食外賣',
  supermarket: '超市百貨',
  groupBuy: '團購到店',
}

/** 展示頁面标签 */
const PLACEMENT_LABEL: Record<string, string> = {
  home: '大首頁-Feed',
  delivery: '外賣頻道-瀑布流',
  groupBuy: '團購頻道-瀑布流',
  supermarket: '超市頻道-瀑布流',
}

/** 品牌标签 */
const APP_LABEL: Record<string, string> = {
  shanfeng: '閃峰',
  mfood: 'mFood',
}

/** Tab配置：业务频道 → 有效页面位置 + 算法来源 */
const TAB_CONFIG: Record<string, { label: string; pageLocations: string[]; pageLocationOptions: { label: string; value: string }[] }> = {
  home: {
    label: '大首頁',
    pageLocations: ['home'],
    pageLocationOptions: [
      { label: '大首頁', value: 'home' },
    ],
  },
  food: {
    label: '美食外賣',
    pageLocations: ['home', 'delivery'],
    pageLocationOptions: [
      { label: '大首頁', value: 'home' },
      { label: '外賣頻道', value: 'delivery' },
    ],
  },
  supermarket: {
    label: '超市百貨',
    pageLocations: ['home', 'supermarket'],
    pageLocationOptions: [
      { label: '大首頁', value: 'home' },
      { label: '超市頻道', value: 'supermarket' },
    ],
  },
  groupBuy: {
    label: '團購到店',
    pageLocations: ['home', 'groupBuy'],
    pageLocationOptions: [
      { label: '大首頁', value: 'home' },
      { label: '團購頻道', value: 'groupBuy' },
    ],
  },
}

/** 时段配置 */
const TIME_SLOT_CONFIG: { key: string; label: string; timeRange: string }[] = [
  { key: 'fallback', label: '兜底時段', timeRange: '全天' },
  { key: 'breakfast', label: '早餐', timeRange: '06:00-10:00' },
  { key: 'lunch', label: '午餐', timeRange: '10:00-14:00' },
  { key: 'afternoonTea', label: '下午茶', timeRange: '14:00-17:00' },
  { key: 'dinner', label: '晚餐', timeRange: '17:00-21:00' },
  { key: 'midnightSnack', label: '夜宵', timeRange: '21:00-06:00' },
]

/** 时段标签映射 */
const TIME_SLOT_LABEL: Record<string, string> = {}
TIME_SLOT_CONFIG.forEach(ts => { TIME_SLOT_LABEL[ts.key] = ts.label })

/** 算法类型标签 */
const ALGORITHM_TYPE_LABEL: Record<string, string> = {
  invincibleStar: '無敵星星',
  newShopAd: '新店廣告',
  activateAd: '盤活復蘇',
  exclusiveShop: '獨家商家',
  youLike: '猜你喜歡',
}

/** 算法类型颜色 */
const ALGORITHM_TYPE_COLOR: Record<string, string> = {
  invincibleStar: 'magenta',
  newShopAd: 'blue',
  activateAd: 'green',
  exclusiveShop: 'orange',
  youLike: 'purple',
}

/** 状态标签 */
const STATUS_LABEL: Record<string, string> = {
  active: '啟用',
  inactive: '停用',
}

/** 伪随机数生成器 */
const pseudoRandom = (seed: number) => {
  const x = Math.sin(seed) * 10000
  return x - Math.floor(x)
}

/** Mock数据 - 覆盖所有业务频道+页面位置+时段组合 */
const mockData: WaterfallSlotConfig[] = (() => {
  // 业务频道 × 页面位置的有效组合
  const combos: { businessChannel: string; pageLocation: string }[] = [
    { businessChannel: 'food', pageLocation: 'home' },
    { businessChannel: 'food', pageLocation: 'delivery' },
    { businessChannel: 'supermarket', pageLocation: 'home' },
    { businessChannel: 'supermarket', pageLocation: 'supermarket' },
    { businessChannel: 'groupBuy', pageLocation: 'home' },
    { businessChannel: 'groupBuy', pageLocation: 'groupBuy' },
  ]
  const timeSlots = ['breakfast', 'lunch', 'afternoonTea', 'dinner', 'midnightSnack']
  const algorithmTypes = ['invincibleStar', 'youLike', 'newShopAd', 'activateAd', 'exclusiveShop']
  const algorithmNames: Record<string, string[]> = {
    invincibleStar: ['無敵星星-首頁版', '無敵星星-外賣版', '無敵星星-團購版'],
    youLike: ['猜你喜歡-主力版', '猜你喜歡-週末版', '猜你喜歡-夜間版'],
    newShopAd: ['新店廣告-首頁版', '新店廣告-早餐版', '新店廣告-午市版'],
    activateAd: ['盤活復蘇-首頁版', '盤活復蘇-午市版', '盤活復蘇-晚市版'],
    exclusiveShop: ['獨家商家-首頁版', '獨家商家-超市版', '獨家商家-晚市版'],
  }
  const users = ['admin', 'operator', 'user001', 'user002']
  
  const data: WaterfallSlotConfig[] = []
  let id = 1
  
  // 每个组合 × 每个时段生成 2-3 条数据
  for (const combo of combos) {
    for (const ts of timeSlots) {
      const count = 2 + Math.floor(pseudoRandom(id * 77) * 2)
      for (let j = 0; j < count; j++) {
        const seed = id * 100
        const algorithmType = algorithmTypes[Math.floor(pseudoRandom(seed + 1) * algorithmTypes.length)]
        const names = algorithmNames[algorithmType]
        const algorithmName = names[Math.floor(pseudoRandom(seed + 2) * names.length)]
        
        data.push({
          id,
          slotIndex: j + 1,
          businessChannel: combo.businessChannel,
          pageLocation: combo.pageLocation,
          timeSlot: ts,
          app: 'shanfeng',
          position: j + 1,
          algorithmId: Math.floor(pseudoRandom(seed + 3) * 10) + 1,
          algorithmName,
          algorithmType,
          weight: Math.floor(pseudoRandom(seed + 4) * 50) + 40,
          status: pseudoRandom(seed + 5) > 0.2 ? 'active' : 'inactive',
          updatedBy: users[Math.floor(pseudoRandom(seed + 6) * users.length)],
          updatedAt: `2024-01-${String(20 + Math.floor(id / 3)).padStart(2, '0')} ${String(8 + Math.floor(pseudoRandom(seed + 7) * 12)).padStart(2, '0')}:${String(Math.floor(pseudoRandom(seed + 8) * 60)).padStart(2, '0')}:00`,
        })
        id++
      }
    }
  }
  
  return data
})()

export default function PromotionSlotConfig() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const [searchForm] = Form.useForm()
  const [addForm] = Form.useForm()
  const [filteredData, setFilteredData] = useState<WaterfallSlotConfig[]>([])
  const [searched, setSearched] = useState(false)
  const [addModalVisible, setAddModalVisible] = useState(false)
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([])
  const [boothControlVisible, setBoothControlVisible] = useState(false)
  const [boothControlForm] = Form.useForm()
  const [maxSlotCount, setMaxSlotCount] = useState(15)

  // 当前Tab：从URL读取，默认 home
  const activeTab = searchParams.get('tab') || 'home'
  // 当前时段Tab，默认 fallback（兜底時段）
  const [activeTimeSlot, setActiveTimeSlot] = useState('fallback')

  // 当前Tab配置
  const tabConfig = TAB_CONFIG[activeTab] || TAB_CONFIG.home

  // 切换Tab时重置搜索并更新URL
  const handleTabChange = (key: string) => {
    setSearchParams({ tab: key })
    setActiveTimeSlot('breakfast')
    searchForm.resetFields()
    searchForm.setFieldsValue({ app: 'shanfeng' })
    setFilteredData([])
    setSearched(false)
  }

  // 切换时段Tab时重置搜索
  const handleTimeSlotChange = (key: string) => {
    setActiveTimeSlot(key)
    searchForm.resetFields()
    searchForm.setFieldsValue({ app: 'shanfeng' })
    setFilteredData([])
    setSearched(false)
  }

  // 初始化时按默认Tab查询
  useEffect(() => {
    let defaultData: WaterfallSlotConfig[]
    if (activeTab === 'home') {
      defaultData = mockData.filter(
        item => item.pageLocation === 'home' && item.app === 'shanfeng'
      )
    } else {
      defaultData = mockData.filter(
        item => item.businessChannel === activeTab && item.app === 'shanfeng'
      )
    }
    setFilteredData(defaultData)
    setSearched(true)
  }, [])

  // 当前查询条件
  const currentApp = searchForm.getFieldValue('app') || 'shanfeng'
  const currentPageLocation = searchForm.getFieldValue('pageLocation') || ''
  
  // 手机模型标题
  const phoneTitle = currentPageLocation
    ? `${PAGE_LOCATION_FULL_LABEL[currentPageLocation]}-${activeTab === 'home' ? '全部頻道' : BUSINESS_CHANNEL_LABEL[activeTab]}-${APP_LABEL[currentApp]}`
    : `${activeTab === 'home' ? '大首頁' : BUSINESS_CHANNEL_LABEL[activeTab]}-${APP_LABEL[currentApp]}`

    // 新增 - 打开弹窗
  const handleAdd = () => {
    addForm.setFieldsValue({
      businessChannel: activeTab === 'home' ? undefined : activeTab,
    })
    setAddModalVisible(true)
  }

  // 提交新增
  const handleAddSubmit = async () => {
    try {
      const values = await addForm.validateFields()
      
      const maxId = filteredData.length > 0 ? Math.max(...filteredData.map(d => d.id)) : 0
      
      const algorithmTypeNames: Record<string, string> = {
        invincibleStar: '無敵星星',
        youLike: '猜你喜歡',
        newShopAd: '新店廣告',
        activateAd: '盤活復蘇',
        exclusiveShop: '獨家商家',
        trafficAd: '流量廣告',
        organicTraffic: '自然流量',
        searchAlgorithm: '搜索算法',
      }
      
      const algorithmName = algorithmTypeNames[values.algorithmType] || values.algorithmType
      
      const now = new Date()
      const timeStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:00`
      
      const newRecord: WaterfallSlotConfig = {
        id: maxId + 1,
        slotIndex: values.position,
        businessChannel: activeTab === 'home' ? (values.businessChannel || 'food') : activeTab,
        pageLocation: tabConfig.pageLocations[0],
        timeSlot: activeTimeSlot,
        app: values.app,
        position: values.position,
        algorithmId: maxId + 1,
        algorithmName,
        algorithmType: values.algorithmType,
        weight: 50,
        status: 'active',
        updatedBy: 'admin',
        updatedAt: timeStr,
      }
      
      const newData = [...filteredData, newRecord]
      setFilteredData(newData)
      setSearched(true)
      setAddModalVisible(false)
      addForm.resetFields()
      message.success('新增成功')
    } catch (error) {
      console.error('新增失败:', error)
    }
  }

  // 编辑
  const handleEdit = (record: WaterfallSlotConfig) => {
    console.log('编辑:', record)
  }

  // 批量修改
  const handleBatchEdit = () => {
    if (selectedRowKeys.length === 0) {
      message.warning('請先選擇需要修改的數據')
      return
    }
    console.log('批量修改:', selectedRowKeys)
    message.info(`已選擇 ${selectedRowKeys.length} 條數據，批量修改功能開發中`)
  }

  // 展位管控
  const handleBoothControl = () => {
    const currentAppVal = searchForm.getFieldValue('app') || 'shanfeng'
    
    // 计算当前已配置的数量
    const currentMaxPosition = filteredData.length > 0 
      ? Math.max(...filteredData.map(d => d.position)) 
      : 0
    
    boothControlForm.setFieldsValue({
      businessChannel: activeTab === 'home' ? '大首頁(全部)' : (BUSINESS_CHANNEL_LABEL[activeTab] || activeTab),
      app: APP_LABEL[currentAppVal] || currentAppVal,
      maxSlotCount: currentMaxPosition,
    })
    
    setBoothControlVisible(true)
  }

  // 提交展位管控
  const handleBoothControlSubmit = async () => {
    try {
      const values = await boothControlForm.validateFields()
      const newMaxCount = values.maxSlotCount
      
      // 更新最大展示位置数量
      setMaxSlotCount(newMaxCount)
      
      // 存储到 localStorage 供新增页面使用
      localStorage.setItem('waterfall_max_slot_count', String(newMaxCount))
      
      message.success(`展位管控成功，最多可配置 ${newMaxCount} 個展示位置`)
      setBoothControlVisible(false)
    } catch (error) {
      console.error('展位管控提交失败:', error)
    }
  }

  // 启用/停用
  const handleToggleStatus = (record: WaterfallSlotConfig) => {
    console.log('切换状态:', record)
  }

  // 上移
  const handleMoveUp = (record: WaterfallSlotConfig) => {
    console.log('上移:', record)
  }

  // 下移
  const handleMoveDown = (record: WaterfallSlotConfig) => {
    console.log('下移:', record)
  }

  // 删除
  const handleDelete = (record: WaterfallSlotConfig) => {
    console.log('删除:', record)
  }
  const handleSearch = () => {
    const values = searchForm.getFieldsValue()
    // 先按当前Tab过滤：大首頁按pageLocation，其他按businessChannel
    let result = activeTab === 'home'
      ? mockData.filter(item => item.pageLocation === 'home')
      : mockData.filter(item => item.businessChannel === activeTab)
    
    // 时段过滤
    result = result.filter(item => item.timeSlot === activeTimeSlot)
    
    // 页面位置
    if (values.pageLocation) {
      result = result.filter(item => item.pageLocation === values.pageLocation)
    }
    
    // 配置ID
    if (values.id) {
      result = result.filter(item => String(item.id).includes(String(values.id)))
    }
    
    // 所属品牌
    if (values.app) {
      result = result.filter(item => item.app === values.app)
    }
    
    // 算法ID
    if (values.algorithmId) {
      result = result.filter(item => String(item.algorithmId).includes(String(values.algorithmId)))
    }
    
    // 算法名称
    if (values.algorithmName) {
      result = result.filter(item => item.algorithmName.includes(values.algorithmName))
    }
    
    // 展示位置
    if (values.position) {
      result = result.filter(item => item.position === values.position)
    }
    
    // 推荐类型
    if (values.algorithmType) {
      result = result.filter(item => item.algorithmType === values.algorithmType)
    }
    
    // 最后更新人
    if (values.updatedBy) {
      result = result.filter(item => item.updatedBy.includes(values.updatedBy))
    }
    
    // 状态
    if (values.status) {
      result = result.filter(item => item.status === values.status)
    }
    
    // 最后更新时间（日期范围）
    if (values.updatedAt && values.updatedAt.length === 2) {
      const [startDate, endDate] = values.updatedAt
      result = result.filter(item => {
        const itemDate = new Date(item.updatedAt)
        return itemDate >= startDate && itemDate <= endDate
      })
    }
    
    setFilteredData(result)
    setSearched(true)
  }

  // 重置搜索
  const handleReset = () => {
    searchForm.resetFields()
    // 重置为默认值
    searchForm.setFieldsValue({
      app: 'shanfeng',
    })
    setFilteredData([])
    setSearched(false)
  }

  const columns: ColumnsType<WaterfallSlotConfig> = [
    {
      title: '配置ID',
      dataIndex: 'id',
      key: 'id',
      width: 100,
      align: 'center',
      render: (v: number) => (
        <Tag color="blue">{String(v).padStart(6, '0')}</Tag>
      ),
    },
    {
      title: '算法ID',
      dataIndex: 'algorithmId',
      key: 'algorithmId',
      width: 100,
      align: 'center',
      render: (id: number) => (
        <code style={{ background: '#f5f5f5', padding: '2px 6px', borderRadius: 4 }}>
          {String(id).padStart(6, '0')}
        </code>
      ),
    },
    {
      title: '算法名稱',
      dataIndex: 'algorithmName',
      key: 'algorithmName',
      width: 180,
      ellipsis: true,
      render: (text: string) => <strong>{text}</strong>,
    },
    {
      title: '所屬品牌',
      dataIndex: 'app',
      key: 'app',
      width: 100,
      render: (v: string) => (
        <Tag color={v === 'shanfeng' ? 'gold' : 'orange'}>
          {APP_LABEL[v]}
        </Tag>
      ),
    },
    {
      title: '廣告類型',
      dataIndex: 'algorithmType',
      key: 'algorithmType',
      width: 120,
      render: (v: string) => (
        <Tag color={ALGORITHM_TYPE_COLOR[v]}>
          {ALGORITHM_TYPE_LABEL[v]}
        </Tag>
      ),
    },
    {
      title: '展示位置',
      dataIndex: 'position',
      key: 'position',
      width: 100,
      align: 'center',
      render: (v: number) => (
        <Tag color="green">{v}號位</Tag>
      ),
    },
    {
      title: '業務頻道',
      dataIndex: 'businessChannel',
      key: 'businessChannel',
      width: 110,
      align: 'center',
      render: (v: string) => (
        <Tag color="blue">{BUSINESS_CHANNEL_LABEL[v] || v}</Tag>
      ),
    },
    {
      title: '狀態',
      dataIndex: 'status',
      key: 'status',
      width: 80,
      align: 'center',
      render: (v: string) => (
        <Tag color={v === 'active' ? 'green' : 'default'}>
          {STATUS_LABEL[v]}
        </Tag>
      ),
    },
    {
      title: '最後更新人',
      dataIndex: 'updatedBy',
      key: 'updatedBy',
      width: 100,
    },
    {
      title: '最後更新時間',
      dataIndex: 'updatedAt',
      key: 'updatedAt',
      width: 160,
    },
    {
      title: '操作',
      key: 'action',
      width: 280,
      fixed: 'right' as const,
      render: (_, record) => (
        <Space size={0} split={<span style={{ color: '#d9d9d9' }}>|</span>}>
          <Button 
            type="link" 
            size="small"
            onClick={() => handleToggleStatus(record)}
          >
            {record.status === 'active' ? '停用' : '啟用'}
          </Button>
          <Button 
            type="link" 
            size="small"
            onClick={() => handleEdit(record)}
          >
            編輯
          </Button>
          <Button 
            type="link" 
            size="small"
            onClick={() => handleMoveUp(record)}
          >
            上移
          </Button>
          <Button 
            type="link" 
            size="small"
            onClick={() => handleMoveDown(record)}
          >
            下移
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

  return (
    <div className="content-area">
      {/* 业务频道 Tab */}
      <div style={{ marginBottom: 0, borderBottom: '1px solid #f0f0f0' }}>
        <Tabs
          activeKey={activeTab}
          onChange={handleTabChange}
          items={[
            { key: 'home', label: '大首頁-Feed' },
            { key: 'food', label: '美食外賣-Feed' },
            { key: 'supermarket', label: '超市百貨-Feed' },
            { key: 'groupBuy', label: '團購到店-Feed' },
          ]}
        />
      </div>

      {/* 时段子 Tab */}
      <div style={{ marginBottom: 16, paddingLeft: 8 }}>
        <Tabs
          activeKey={activeTimeSlot}
          onChange={handleTimeSlotChange}
          size="small"
          style={{ marginBottom: 0 }}
          items={TIME_SLOT_CONFIG.map(ts => ({
            key: ts.key,
            label: (
              <span style={{ fontSize: 13, color: activeTimeSlot === ts.key ? '#E8720C' : '#8C8C8C' }}>
                {ts.label} <span style={{ fontSize: 11, color: '#BFBFBF' }}>{ts.timeRange}</span>
              </span>
            ),
          }))}
          tabBarExtraContent={
            <span style={{
              fontSize: 12,
              color: '#595959',
              whiteSpace: 'nowrap',
              fontWeight: 500,
            }}>
              💡 每個時段系統會優先獲取該時段的瀑布流配置，若無任何配置，則自動使用兜底時段的配置
            </span>
          }
        />
      </div>

      {/* 查询区域 */}
      <div className="search-section">
        <Form layout="inline" form={searchForm} onFinish={handleSearch}>
          {/* 所屬品牌 - 突出显示 */}
          <Form.Item 
            label={
              <span style={{ 
                fontWeight: 600, 
                color: '#E8720C',
                fontSize: 14
              }}>
                所屬品牌
              </span>
            }
            name="app" 
            initialValue="shanfeng"
            style={{
              background: 'linear-gradient(135deg, #FFF7E6 0%, #FFE7BA 100%)',
              padding: '4px 12px',
              borderRadius: 6,
              border: '1px solid #FFD591',
              marginRight: 16
            }}
          >
            <Select 
              placeholder="請選擇品牌"
              style={{ 
                minWidth: 120,
                fontWeight: 500
              }}
              options={[
                { label: '閃峰', value: 'shanfeng' },
                { label: 'mFood', value: 'mfood' },
              ]}
            />
          </Form.Item>
          <Form.Item label="展示位置" name="position">
            <Select 
              placeholder="請選擇"
              allowClear
              options={Array.from({ length: 20 }, (_, i) => ({
                label: `${i + 1}號位`,
                value: i + 1,
              }))}
            />
          </Form.Item>
          <Form.Item label="廣告類型" name="algorithmType">
            <Select 
              placeholder="全部"
              allowClear
              options={[
                { label: '無敵星星', value: 'invincibleStar' },
                { label: '猜你喜歡', value: 'youLike' },
                { label: '新店廣告', value: 'newShopAd' },
                { label: '盤活復蘇', value: 'activateAd' },
                { label: '獨家商家', value: 'exclusiveShop' },
              ]}
            />
          </Form.Item>
          <Form.Item label="算法ID" name="algorithmId">
            <Input 
              placeholder="請輸入算法ID" 
              allowClear
            />
          </Form.Item>
          <Form.Item label="算法名稱" name="algorithmName">
            <Input 
              placeholder="算法名稱/ID" 
              allowClear
            />
          </Form.Item>
          <Form.Item label="配置ID" name="id">
            <Input 
              placeholder="請輸入配置ID" 
              allowClear
            />
          </Form.Item>
          <Form.Item label="狀態" name="status">
            <Select 
              placeholder="全部"
              allowClear
              options={[
                { label: '啟用', value: 'active' },
                { label: '停用', value: 'inactive' },
              ]}
            />
          </Form.Item>
          <Form.Item label="最後更新人" name="updatedBy">
            <Input 
              placeholder="請輸入更新人" 
              allowClear
            />
          </Form.Item>
          <Form.Item label="最後更新時間" name="updatedAt">
            <RangePicker 
              placeholder={['開始日期', '結束日期']}
              allowClear
            />
          </Form.Item>
          <Form.Item>
            <div className="search-actions">
              <Button type="primary" htmlType="submit" icon={<SearchOutlined />}>查詢</Button>
              <Button onClick={handleReset} icon={<ReloadOutlined />}>重置</Button>
            </div>
          </Form.Item>
        </Form>
      </div>

      {/* 结果区域 */}
      {searched && filteredData.length > 0 && (
        <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
          {/* 左侧：手机模型 */}
          <div style={{
            width: 375, height: 720, flexShrink: 0,
            background: 'linear-gradient(180deg, #f5f5f5 0%, #e8e8e8 100%)',
            borderRadius: 40, padding: '60px 20px 30px',
            boxShadow: '0 12px 32px rgba(0, 0, 0, 0.25), inset 0 0 0 2px rgba(255,255,255,0.1)',
            border: '10px solid #1a1a1a', position: 'relative',
          }}>
            {/* 顶部状态栏 */}
            <div style={{
              position: 'absolute', top: 16, left: 0, right: 0,
              padding: '0 24px', display: 'flex', justifyContent: 'space-between',
              alignItems: 'center', fontSize: 12, color: '#333', fontWeight: 600,
            }}>
              <span>9:41</span>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <span style={{ fontSize: 11 }}>📶</span>
                <span style={{ fontSize: 11 }}>🔋</span>
              </div>
            </div>

            {/* 屏幕内容区 */}
            <div style={{
              background: '#fff', borderRadius: 24, padding: '16px',
              height: 'calc(100% - 20px)', overflow: 'hidden',
              boxShadow: 'inset 0 0 0 1px rgba(0,0,0,0.08)',
              display: 'flex',
              flexDirection: 'column',
            }}>
              {/* 标题栏 - 固定 */}
              <div style={{
                textAlign: 'center', padding: '12px 0', marginBottom: 16,
                borderBottom: '1px solid #f0f0f0',
                flexShrink: 0,
              }}>
                <div style={{ fontSize: 16, fontWeight: 600, color: '#333', marginBottom: 6 }}>
                  {phoneTitle}
                </div>
                <div style={{ fontSize: 12, color: '#8c8c8c', lineHeight: 1.5 }}>
                  (只展示啟用狀態的配置)
                </div>
              </div>

              {/* 瀑布流内容 - 可滚动 */}
              <div style={{ 
                display: 'flex', 
                flexDirection: 'column', 
                gap: 12,
                overflow: 'auto',
                flex: 1,
              }}>
                {filteredData.map((item) => (
                  <div
                    key={item.id}
                    style={{
                      background: '#FAFAFA',
                      borderRadius: 12,
                      padding: 16,
                      border: '1px solid #F0F0F0',
                    }}
                  >
                    <div style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                    }}>
                      <Badge
                        count={`${item.position}號位`}
                        style={{ backgroundColor: '#1890ff' }}
                      />
                      <Tag color={ALGORITHM_TYPE_COLOR[item.algorithmType]}>
                        {ALGORITHM_TYPE_LABEL[item.algorithmType]}
                      </Tag>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* 右侧：列表视图 */}
          <div style={{ flex: 1, minWidth: 360 }}>
            <Card
              title={
                <Space>
                  <MobileOutlined style={{ color: '#1890ff' }} />
                  <span style={{ fontSize: 15, fontWeight: 600 }}>瀑布流規劃詳情</span>
                </Space>
              }
              extra={
                <Space>
                  <Button type="primary" onClick={handleAdd}>
                    <PlusOutlined /> 新增
                  </Button>
                </Space>
              }
              style={{ borderRadius: 8 }}
            >
              <Table<WaterfallSlotConfig>
                columns={columns}
                dataSource={filteredData}
                rowSelection={{
                  selectedRowKeys,
                  onChange: (selectedKeys) => {
                    setSelectedRowKeys(selectedKeys)
                  },
                  getCheckboxProps: (record) => ({
                    disabled: record.status === 'inactive',
                    name: record.algorithmName,
                  }),
                }}
                pagination={{
                  pageSize: 10,
                  showSizeChanger: true,
                  pageSizeOptions: ['10', '20', '50'],
                  showQuickJumper: true,
                  showTotal: (total) => `共 ${total} 條`,
                }}
                size="small"
                rowKey="id"
                scroll={{ x: 1200 }}
              />
            </Card>
          </div>
        </div>
      )}

      {!searched && (
        <div style={{ textAlign: 'center', padding: '60px 0', color: '#bbb' }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>📱</div>
          <div style={{ fontSize: 15 }}>請設置查詢條件後，點擊「查詢」查看瀑布流配置</div>
        </div>
      )}

      {searched && filteredData.length === 0 && (
        <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
          {/* 左侧：手机模型 - 空数据时仍然显示 */}
          <div style={{
            width: 375, height: 720, flexShrink: 0,
            background: 'linear-gradient(180deg, #f5f5f5 0%, #e8e8e8 100%)',
            borderRadius: 40, padding: '60px 20px 30px',
            boxShadow: '0 12px 32px rgba(0, 0, 0, 0.25), inset 0 0 0 2px rgba(255,255,255,0.1)',
            border: '10px solid #1a1a1a', position: 'relative',
          }}>
            {/* 顶部状态栏 */}
            <div style={{
              position: 'absolute', top: 16, left: 0, right: 0,
              padding: '0 24px', display: 'flex', justifyContent: 'space-between',
              alignItems: 'center', fontSize: 12, color: '#333', fontWeight: 600,
            }}>
              <span>9:41</span>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <span style={{ fontSize: 11 }}>📶</span>
                <span style={{ fontSize: 11 }}>🔋</span>
              </div>
            </div>

            {/* 屏幕内容区 */}
            <div style={{
              background: '#fff', borderRadius: 24, padding: '16px',
              height: 'calc(100% - 20px)', overflow: 'hidden',
              boxShadow: 'inset 0 0 0 1px rgba(0,0,0,0.08)',
              display: 'flex',
              flexDirection: 'column',
            }}>
              {/* 标题栏 - 固定 */}
              <div style={{
                textAlign: 'center', padding: '12px 0', marginBottom: 16,
                borderBottom: '1px solid #f0f0f0',
                flexShrink: 0,
              }}>
                <div style={{ fontSize: 16, fontWeight: 600, color: '#333', marginBottom: 6 }}>
                  {phoneTitle}
                </div>
                <div style={{ fontSize: 12, color: '#8c8c8c', lineHeight: 1.5 }}>
                  (只展示啟用狀態的配置)
                </div>
              </div>

              {/* 瀑布流内容 - 可滚动 */}
              <div style={{ 
                display: 'flex', 
                flexDirection: 'column', 
                gap: 12,
                overflow: 'auto',
                flex: 1,
              }}>
                {/* 空数据时展示默认位置和权重分排序 */}
                {[1, 2, 3, 4, 5, 6].map((position) => (
                  <div
                    key={position}
                    style={{
                      background: '#FAFAFA',
                      borderRadius: 12,
                      padding: 16,
                      border: '1px solid #F0F0F0',
                    }}
                  >
                    <div style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                    }}>
                      <Badge
                        count={`${position}號位`}
                        style={{ backgroundColor: '#d9d9d9' }}
                      />
                      <Tag color="default">
                        權重分排序
                      </Tag>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* 右侧：列表视图 - 保留新增按钮 */}
          <div style={{ flex: 1, minWidth: 360 }}>
            <Card
              title={
                <Space>
                  <MobileOutlined style={{ color: '#1890ff' }} />
                  <span style={{ fontSize: 15, fontWeight: 600 }}>瀑布流規劃詳情</span>
                </Space>
              }
              extra={
                <Space>
                  <Button type="primary" onClick={handleAdd}>
                    <PlusOutlined /> 新增
                  </Button>
                </Space>
              }
              style={{ borderRadius: 8 }}
            >
              <div style={{ 
                textAlign: 'center', 
                padding: '60px 0', 
                color: '#bbb' 
              }}>
                <div style={{ fontSize: 48, marginBottom: 16 }}>📭</div>
                <div style={{ fontSize: 14 }}>暫無瀑布流配置</div>
                <div style={{ fontSize: 12, marginTop: 8, color: '#8c8c8c' }}>
                  點擊「新增」按鈕添加配置
                </div>
              </div>
            </Card>
          </div>
        </div>
      )}

      {/* 新增弹窗 */}
      <Modal
        title="新增瀑布流配置"
        open={addModalVisible}
        onOk={handleAddSubmit}
        onCancel={() => setAddModalVisible(false)}
        width={600}
        okText="確定"
        cancelText="取消"
      >
        <Form
          form={addForm}
          layout="vertical"
          style={{ marginTop: 24 }}
        >
          <Form.Item
            label="所屬品牌"
            name="app"
            rules={[{ required: true, message: '請選擇所屬品牌' }]}
          >
            <Select
              placeholder="請選擇所屬品牌"
              options={[
                { label: '閃峰', value: 'shanfeng' },
                { label: 'mFood', value: 'mfood' },
              ]}
            />
          </Form.Item>

          <Form.Item
            label="業務頻道"
            name="businessChannel"
            initialValue={activeTab === 'home' ? undefined : activeTab}
            rules={[{ required: true, message: '請選擇業務頻道' }]}
          >
            <Select
              placeholder="請選擇業務頻道"
              disabled={activeTab !== 'home'}
              options={[
                { label: '美食外賣', value: 'food' },
                { label: '超市百貨', value: 'supermarket' },
                { label: '團購到店', value: 'groupBuy' },
              ]}
            />
          </Form.Item>

          <Form.Item
            label="廣告類型"
            name="algorithmType"
            rules={[{ required: true, message: '請選擇廣告類型' }]}
          >
            <Select
              placeholder="請選擇廣告類型"
              options={[
                { label: '無敵星星', value: 'invincibleStar' },
                { label: '新店廣告', value: 'newShopAd' },
                { label: '盤活復蘇', value: 'activateAd' },
                { label: '獨家商家', value: 'exclusiveShop' },
                { label: '流量廣告', value: 'trafficAd' },
                { label: '猜你喜歡', value: 'youLike' },
                { label: '自然流量', value: 'organicTraffic' },
                { label: '搜索算法', value: 'searchAlgorithm' },
              ]}
            />
          </Form.Item>

          <Form.Item
            label="展示位置"
            name="position"
            rules={[{ required: true, message: '請選擇展示位置' }]}
          >
            <Select
              placeholder="請選擇展示位置"
              options={Array.from({ length: parseInt(localStorage.getItem('waterfall_max_slot_count') || '20') }, (_, i) => ({
                label: `${i + 1}號位`,
                value: i + 1,
              }))}
            />
          </Form.Item>
        </Form>
      </Modal>

      {/* 展位管控弹窗 */}
      <Modal
        title="展位管控"
        open={boothControlVisible}
        onOk={handleBoothControlSubmit}
        onCancel={() => setBoothControlVisible(false)}
        okText="確認"
        cancelText="取消"
        width={600}
      >
        <Form
          form={boothControlForm}
          layout="vertical"
          style={{ marginTop: 24 }}
        >
          <div style={{ 
            background: '#f0f5ff', 
            padding: '16px', 
            borderRadius: 8,
            marginBottom: 24
          }}>
            <div style={{ 
              fontSize: 14, 
              color: '#595959',
              marginBottom: 8
            }}>
              📊 當前配置信息
            </div>
            <Form.Item
              label="所屬品牌"
              name="app"
              style={{ marginBottom: 12 }}
            >
              <Select disabled />
            </Form.Item>
            <Form.Item
              label="業務頻道"
              name="businessChannel"
              style={{ marginBottom: 12 }}
            >
              <Select disabled />
            </Form.Item>
          </div>

          <Form.Item
            label="可配置展示數量"
            name="maxSlotCount"
            rules={[
              { required: true, message: '請輸入可配置展示數量' },
              { 
                type: 'number', 
                min: 1, 
                max: 100, 
                message: '展示數量必須在 1-100 之間' 
              }
            ]}
            extra="修改後，新增界面的展示位置將最多可選擇至此數量"
          >
            <InputNumber
              min={1}
              max={100}
              style={{ width: '100%' }}
              placeholder="請輸入展示位置數量"
              addonAfter="個"
              size="large"
            />
          </Form.Item>

          <div style={{ 
            background: '#fffbe6', 
            padding: '12px 16px', 
            borderRadius: 6,
            border: '1px solid #ffe58f',
            marginTop: 16
          }}>
            <div style={{ 
              fontSize: 13, 
              color: '#8c8c8c',
              lineHeight: 1.6
            }}>
              💡 <strong>說明：</strong>
              <br />
              • 當前最多可選擇 <strong>{maxSlotCount}</strong> 號位置
              <br />
              • 修改後，新增界面的展示位置下拉框將擴展至新的數量
              <br />
              • 例如：修改為 20，則可以選擇 1-20 號位置
            </div>
          </div>
        </Form>
      </Modal>
    </div>
  )
}
