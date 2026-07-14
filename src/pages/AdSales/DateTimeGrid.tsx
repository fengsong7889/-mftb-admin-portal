import { useState, useMemo, useEffect } from 'react'
import { Card, Tag, Space, message, Empty, DatePicker, Button, Table, Select, Radio, Modal, TreeSelect, Input, Form } from 'antd'
import { CalendarOutlined, DeleteOutlined, ShopOutlined, SearchOutlined, ReloadOutlined } from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import dayjs from 'dayjs'
import type { Dayjs } from 'dayjs'
import {
  TimeSlotStatus,
  generateTimeSlotStatuses,
  calcSlotPrice,
  getNoDiscountSlotsByRow,
  type InventoryItem,
  RECOMMEND_TYPE_CONFIGS,
} from './types'
import { Region, REGION_TREE_DATA, AREA_TO_REGIONS, AREA_PARENT_VALUES } from '../Recommend/constants'

interface CartItem {
  key: string
  date: string
  region: Region           // 商圈
  regionName: string       // 商圈名称
  mealSlot: string
  timeSlots: number[]
  originalPrice: number  // 原价
  salePrice: number      // 售价
  storeId: string        // 店铺ID
  storeName: string      // 店铺名称
  lockTime: number       // 锁定时间戳（毫秒）
}

/** 组合商圈接口 */
interface RegionCombination {
  id: number
  name: string
  regions: Region[]
  hasDiscount: boolean  // 是否有折扣
}

/** Mock数据 - 组合商圈 */
const MOCK_REGION_COMBINATIONS: RegionCombination[] = [
  {
    id: 1,
    name: '澳門區域組合',
    regions: [Region.KOKSAA, Region.COSTA, Region.SANMA, Region.SANWONG, Region.HKM],
    hasDiscount: true,
  },
  {
    id: 2,
    name: '氹仔區域組合',
    regions: [Region.FAHUA, Region.AIRPORT, Region.LHOTEL, Region.RHOTEL, Region.UM, Region.HACS],
    hasDiscount: true,
  },
  {
    id: 3,
    name: '全區域組合',
    regions: [Region.KOKSAA, Region.COSTA, Region.SANMA, Region.SANWONG, Region.HKM, Region.FAHUA, Region.AIRPORT, Region.LHOTEL, Region.RHOTEL, Region.UM, Region.HACS],
    hasDiscount: false,
  },
]

interface DateTimeGridProps {
  inventoryItem: InventoryItem
}

/** Mock数据 - 店铺列表（含BD信息） */
const MOCK_STORES = [
  { id: '10001', name: '威尼斯人酒店', bd: 'bd-001', bdName: '張偉' },
  { id: '10002', name: '皇朝廣場店', bd: 'bd-002', bdName: '李娜' },
  { id: '10003', name: '黑馬仕美食街', bd: 'bd-003', bdName: '王強' },
  { id: '10004', name: '新葡京旗艦店', bd: 'bd-001', bdName: '張偉' },
  { id: '10005', name: '官也街老店', bd: 'bd-004', bdName: '劉敏' },
]

/** 店铺下拉选项（展示ID） */
const STORE_OPTIONS = MOCK_STORES.map(s => ({
  label: `${s.name}（ID：${s.id}）`,
  value: s.id,
  name: s.name,
  bd: s.bd,
  bdName: s.bdName,
}))

/** 算法 → 品牌映射（选择算法后自动带出品牌） */
const ALGORITHM_BRAND_MAP: Record<string, string> = {
  invincible_star: 'shanfeng',
  new_store_ad: 'mfood',
  hot_revive: 'shanfeng',
  exclusive_merchant: 'mfood',
  traffic_ad: 'shanfeng',
  guess_you_like: 'shanfeng',
  organic_traffic: 'mfood',
  search_algo: 'shanfeng',
}

/** BD选项 */
const BD_OPTIONS = [
  { label: '張偉', value: 'bd-001' },
  { label: '李娜', value: 'bd-002' },
  { label: '王強', value: 'bd-003' },
  { label: '劉敏', value: 'bd-004' },
]

// 时段定义（早餐/午餐/下午茶/晚餐/夜宵）
const MEAL_TIME_SLOTS = [
  { key: 'breakfast', label: '早餐', timeRange: '07:00-10:00', slots: [14, 15, 16, 17, 18, 19] },
  { key: 'lunch', label: '午餐', timeRange: '11:00-14:00', slots: [22, 23, 24, 25, 26, 27] },
  { key: 'afternoon', label: '下午茶', timeRange: '14:00-17:00', slots: [28, 29, 30, 31, 32, 33] },
  { key: 'dinner', label: '晚餐', timeRange: '17:00-21:00', slots: [34, 35, 36, 37, 38, 39, 40, 41] },
  { key: 'supper', label: '夜宵', timeRange: '21:00-02:00', slots: [42, 43, 44, 45, 46, 47, 0, 1, 2, 3] },
]

/** 商圈列表（表格行） */
const REGION_LIST = [
  { key: Region.KOKSAA, name: '黑沙環區' },
  { key: Region.COSTA, name: '高士德區' },
  { key: Region.SANMA, name: '新馬路區' },
  { key: Region.SANWONG, name: '新皇朝區' },
  { key: Region.HKM, name: '港珠澳區' },
  { key: Region.FAHUA, name: '花城市區' },
  { key: Region.AIRPORT, name: '北安機場' },
  { key: Region.LHOTEL, name: '左酒店區' },
  { key: Region.RHOTEL, name: '右酒店區' },
  { key: Region.UM, name: '澳大專區' },
  { key: Region.HACS, name: '黑沙灘區' },
]

const WEEKDAY_LABELS = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六']

export default function DateTimeGrid({ inventoryItem }: DateTimeGridProps) {
  const navigate = useNavigate()
  const [selectedDate, setSelectedDate] = useState<Dayjs | null>(null)
  const [hoveredDate, setHoveredDate] = useState<string | null>(null)
  const [selectedMealSlot, setSelectedMealSlot] = useState<string | null>(null)
  const [cartItems, setCartItems] = useState<CartItem[]>([])
  const [currentPage, setCurrentPage] = useState(1)
  const [selectedRegion, setSelectedRegion] = useState<Region | string | undefined>(undefined)
  const [selectedCombination, setSelectedCombination] = useState<number | undefined>(undefined)
  const [regionMode, setRegionMode] = useState<'single' | 'combination'>('single')
  const pageSize = 7
  const [isPaymentModalVisible, setIsPaymentModalVisible] = useState(false)
  const [isSuccessModalVisible, setIsSuccessModalVisible] = useState(false)
  const [selectedStore, setSelectedStore] = useState<string | undefined>(undefined)
  const [currentTime, setCurrentTime] = useState(Date.now())

  // 倒计时：每秒更新当前时间
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(Date.now())
    }, 1000)
    return () => clearInterval(timer)
  }, [])

  // 自动释放过期锁定（60秒后）
  useEffect(() => {
    const expiredItems = cartItems.filter(item => currentTime - item.lockTime >= 60000)
    if (expiredItems.length > 0) {
      setCartItems(prev => prev.filter(item => currentTime - item.lockTime < 60000))
      expiredItems.forEach(item => {
        message.info(`${item.date} ${item.regionName} ${item.mealSlot} 鎖定已到期，自動釋放`)
      })
    }
  }, [currentTime, cartItems])

  // 查询条件状态
  const [searchBrand, setSearchBrand] = useState<string | null>(null)
  const [searchAlgorithm, setSearchAlgorithm] = useState<string | null>(null)
  const [searchStoreName, setSearchStoreName] = useState<string | null>(null)
  const [searchDate, setSearchDate] = useState<Dayjs | null>(null)
  const [searchBD, setSearchBD] = useState<string | null>(null)
  const [hasSearched, setHasSearched] = useState(false)
  const [isConflictModalVisible, setIsConflictModalVisible] = useState(false)
  const [pendingAction, setPendingAction] = useState<(() => void) | null>(null)

  // 检查购物车是否有加购数据
  const hasCartItems = cartItems.length > 0

  // 算法名称变更处理：自动带出品牌，并检查购物车冲突
  const handleAlgorithmChange = (value: string | null) => {
    if (hasCartItems && value !== searchAlgorithm) {
      setPendingAction(() => {
        setSearchAlgorithm(value)
        // 自动带出品牌
        if (value && ALGORITHM_BRAND_MAP[value]) {
          setSearchBrand(ALGORITHM_BRAND_MAP[value])
        } else {
          setSearchBrand(null)
        }
      })
      setIsConflictModalVisible(true)
      return
    }
    setSearchAlgorithm(value)
    // 自动带出品牌
    if (value && ALGORITHM_BRAND_MAP[value]) {
      setSearchBrand(ALGORITHM_BRAND_MAP[value])
    } else {
      setSearchBrand(null)
    }
  }

  // 门店名称变更处理：自动带出BD，并检查购物车冲突
  const handleStoreChange = (value: string | null) => {
    if (hasCartItems && value !== searchStoreName) {
      setPendingAction(() => {
        setSearchStoreName(value)
        // 自动带出BD
        const store = MOCK_STORES.find(s => s.id === value)
        if (store) {
          setSearchBD(store.bd)
        } else {
          setSearchBD(null)
        }
      })
      setIsConflictModalVisible(true)
      return
    }
    setSearchStoreName(value)
    // 自动带出BD
    const store = MOCK_STORES.find(s => s.id === value)
    if (store) {
      setSearchBD(store.bd)
    } else {
      setSearchBD(null)
    }
  }

  // 确认切换（清空已选）
  const handleConfirmSwitch = () => {
    setIsConflictModalVisible(false)
    if (pendingAction) {
      pendingAction()
      setPendingAction(null)
    }
    // 清空购物车
    setCartItems([])
    setHasSearched(false)
    message.success('已清空已選商圈、時段，請重新查詢')
  }

  // 取消切换
  const handleCancelSwitch = () => {
    setIsConflictModalVisible(false)
    setPendingAction(null)
  }

  // 查询：必须选择算法名称（品牌已自动带出）、门店名称
  const handleSearch = () => {
    if (!searchAlgorithm) { message.warning('請選擇算法名稱'); return }
    if (!searchBrand) { message.warning('請選擇所屬品牌'); return }
    if (!searchStoreName) { message.warning('請選擇門店名稱'); return }
    setHasSearched(true)
  }

  // 重置查询条件
  const handleReset = () => {
    setSearchBrand(null)
    setSearchAlgorithm(null)
    setSearchStoreName(null)
    setSearchDate(null)
    setSearchBD(null)
    setHasSearched(false)
  }
  
  // Mock数据 - 商家推广金余额
  const [merchantBalance, setMerchantBalance] = useState(15800)

  // 点击订单支付
  const handlePayment = () => {
    setIsPaymentModalVisible(true)
  }

  // 确认支付
  const handleConfirmPayment = () => {
    const totalAmount = cartItems.reduce((sum, item) => sum + item.salePrice, 0)
    
    // 扣除推广金余额
    setMerchantBalance(prev => prev - totalAmount)
    
    // 关闭支付弹窗
    setIsPaymentModalVisible(false)
    
    // 清空购物车
    setCartItems([])
    
    // 显示成功弹窗
    setIsSuccessModalVisible(true)
  }

  // 查看订单
  const handleViewOrder = () => {
    setIsSuccessModalVisible(false)
    const typeName = RECOMMEND_TYPE_CONFIGS.find(c => c.type === inventoryItem.algorithmType)?.name || ''
    navigate(`/promotion-order-manage?type=${encodeURIComponent(typeName)}&from=ad-sales`)
  }

  // 继续购买
  const handleContinuePurchase = () => {
    setIsSuccessModalVisible(false)
    message.success('繼續購買')
  }

  // 生成所有日期列表
  const allDates = useMemo(() => {
    const startDate = dayjs(inventoryItem.availableStartDate)
    const endDate = dayjs(inventoryItem.availableEndDate)
    const dates: Dayjs[] = []
    
    let current = startDate
    while (current <= endDate) {
      dates.push(current)
      current = current.add(1, 'day')
    }
    return dates
  }, [inventoryItem.availableStartDate, inventoryItem.availableEndDate])

  // 当前页的日期列表
  const dateList = useMemo(() => {
    const startIndex = (currentPage - 1) * pageSize
    return allDates.slice(startIndex, startIndex + pageSize)
  }, [allDates, currentPage])

  const totalPages = Math.ceil(allDates.length / pageSize)

  // 单个时段价格（使用固定总时段数48，不随选择变化）
  const slotPrice = useMemo(() => {
    // 固定使用48个时段作为基准（去除凌晨0-6点的12个不可售时段，实际36个）
    const totalAvailableSlots = 36
    return calcSlotPrice(inventoryItem.dailyPrice, totalAvailableSlots)
  }, [inventoryItem.dailyPrice])

  // 检查某个日期的某个时段是否已被加购到购物车
  const isMealSlotLocked = (date: Dayjs, mealSlot: typeof MEAL_TIME_SLOTS[0]) => {
    const dateStr = date.format('YYYY-MM-DD')
    return cartItems.some(item => 
      item.date === dateStr && 
      mealSlot.slots.some(slotIndex => item.timeSlots.includes(slotIndex))
    )
  }

  // 获取某个日期某时段的综合状态
  const getMealSlotStatus = (date: Dayjs, mealSlot: typeof MEAL_TIME_SLOTS[0]) => {
    const dateStr = date.format('YYYY-MM-DD')
    const statuses = generateTimeSlotStatuses(inventoryItem.id, dateStr)
    
    // 检查是否已被锁定（已加购到购物车）
    const locked = isMealSlotLocked(date, mealSlot)
    
    // 统计该时段内所有半小时的状态
    const slotStates = mealSlot.slots.map(slotIndex => statuses[slotIndex])
    
    // 如果已被锁定，显示为"已锁定"
    if (locked) {
      return {
        status: 'locked' as const,
        availableSlots: slotStates.filter(s => s === TimeSlotStatus.AVAILABLE).length,
        totalSlots: mealSlot.slots.length,
      }
    }
    
    // 统计各状态的数量
    const availableCount = slotStates.filter(s => s === TimeSlotStatus.AVAILABLE).length
    const soldOutCount = slotStates.filter(s => s === TimeSlotStatus.SOLD_OUT).length
    const unavailableCount = slotStates.filter(s => s === TimeSlotStatus.UNAVAILABLE).length
    
    // 【修改逻辑】如果有售罄时段且无可用时段，显示为"售罄"
    if (soldOutCount > 0 && availableCount === 0) {
      return { 
        status: 'soldOut' as const, 
        availableSlots: 0, 
        totalSlots: mealSlot.slots.length 
      }
    }
    
    // 如果有可售时段（即使有部分售罄也显示为可售）
    if (availableCount > 0) {
      return {
        status: 'available' as const,
        availableSlots: availableCount,
        totalSlots: mealSlot.slots.length,
      }
    }
    
    // 否则显示为"不可售"
    return { 
      status: 'unavailable' as const, 
      availableSlots: 0, 
      totalSlots: mealSlot.slots.length 
    }
  }

  // 计算时段总价
  const getMealSlotPrice = (mealSlot: typeof MEAL_TIME_SLOTS[0], availableSlots: number) => {
    // 使用固定总时段数36计算单价
    const totalAvailableSlots = 36
    const pricePerSlot = calcSlotPrice(inventoryItem.dailyPrice, totalAvailableSlots)
    return pricePerSlot * availableSlots
  }

  // 点击日期
  const handleDateClick = (date: Dayjs) => {
    setSelectedDate(date)
    setSelectedMealSlot(null)
  }

  // 点击时段格子
  const handleMealSlotClick = (date: Dayjs, mealSlot: typeof MEAL_TIME_SLOTS[0]) => {
    const status = getMealSlotStatus(date, mealSlot)
    if (status.status !== 'available') {
      message.info('該時段暫不可購買')
      return
    }
    
    setSelectedDate(date)
    setSelectedMealSlot(mealSlot.key)
  }

  return (
    <div>
      {/* 查询区域 - 始终显示 */}
      <div className="search-section" style={{ marginBottom: 16 }}>
          <Form layout="inline" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px 12px' }}>
            <Form.Item label="算法名稱">
              <Select
                placeholder="請輸入搜索"
                value={searchAlgorithm}
                onChange={handleAlgorithmChange}
                allowClear
                showSearch
                optionFilterProp="label"
                options={[
                  { label: '無敵星星-首頁版', value: 'invincible_star' },
                  { label: '新店廣告-外賣版', value: 'new_store_ad' },
                  { label: '盤活復蘇-團購版', value: 'hot_revive' },
                  { label: '獨家商家-超市版', value: 'exclusive_merchant' },
                  { label: '流量廣告-全渠道', value: 'traffic_ad' },
                  { label: '猜你喜歡-主力版', value: 'guess_you_like' },
                  { label: '自然流量-默認', value: 'organic_traffic' },
                  { label: '搜索算法-綜合版', value: 'search_algo' },
                ]}
              />
            </Form.Item>
            <Form.Item label="所屬品牌">
              <Select
                placeholder="選擇算法後自動帶出"
                value={searchBrand}
                onChange={(v) => setSearchBrand(v)}
                allowClear
                options={[
                  { label: '閃峰', value: 'shanfeng' },
                  { label: 'mFood', value: 'mfood' },
                ]}
              />
            </Form.Item>
            <Form.Item label="門店名稱">
              <Select
                placeholder="支持ID和名稱搜索"
                value={searchStoreName}
                onChange={handleStoreChange}
                allowClear
                showSearch
                optionFilterProp="label"
                options={STORE_OPTIONS}
              />
            </Form.Item>
            <Form.Item label="選擇BD">
              <Select
                placeholder="選擇門店後自動帶出"
                value={searchBD}
                onChange={(v) => setSearchBD(v)}
                allowClear
                showSearch
                filterOption={(input, option) => {
                  const keyword = input.toLowerCase()
                  const label = (option?.label ?? '').toString().toLowerCase()
                  return label.includes(keyword)
                }}
                options={BD_OPTIONS}
              />
            </Form.Item>
            <Form.Item label="選擇日期">
              <DatePicker
                value={searchDate}
                onChange={(date) => setSearchDate(date)}
                format="YYYY-MM-DD"
                style={{ width: '100%' }}
              />
            </Form.Item>
            <Form.Item>
              <div className="search-actions">
                <Button type="primary" icon={<SearchOutlined />} onClick={handleSearch}>查詢</Button>
                <Button icon={<ReloadOutlined />} onClick={handleReset}>重置</Button>
              </div>
            </Form.Item>
          </Form>
      </div>

      {/* 购物车冲突提醒弹窗 */}
      <Modal
        title="提示"
        open={isConflictModalVisible}
        onOk={handleConfirmSwitch}
        onCancel={handleCancelSwitch}
        okText="確認切換"
        cancelText="取消"
        okButtonProps={{ danger: true }}
      >
        <div style={{ padding: '8px 0' }}>
          <p style={{ marginBottom: 12, fontSize: 14, color: '#262626' }}>
            您當前已有加購數據，同一門店同一訂單僅支持選擇相同算法的廣告位。
          </p>
          <p style={{ marginBottom: 0, fontSize: 13, color: '#595959' }}>
            切換算法或門店後，已選的商圈、時段將被清空。您可以：
          </p>
          <ul style={{ margin: '8px 0 0', paddingLeft: 20, fontSize: 13, color: '#595959' }}>
            <li>確認切換：清空已選商圈、時段，重新查詢</li>
            <li>取消：保留當前選擇，先完成下單後再選擇其他門店或算法</li>
          </ul>
        </div>
      </Modal>

      {!hasSearched ? (
        <Card bodyStyle={{ padding: '48px 24px' }}>
          <Empty description="請先選擇所屬品牌、算法名稱、門店名稱，點擊查詢後展示可選購區域" image={Empty.PRESENTED_IMAGE_SIMPLE} />
        </Card>
      ) : (
      <div style={{ display: 'flex', gap: 16 }}>
        {/* 左侧：日期×时段表格 */}
        <div style={{ flex: 1 }}>
        {/* 日期×时段表格 */}
        <Card 
        title={
          <div style={{ display: 'flex', alignItems: 'center', width: '100%' }}>
            {/* 12306风格日期选择器 */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1 }}>
              <Button
                size="small"
                disabled={currentPage === 1}
                onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
              >
                ◀
              </Button>
              <div style={{ flex: 1, display: 'flex', gap: 4, padding: '4px 0' }}>
                {dateList.map(date => {
                  const dateStr = date.format('YYYY-MM-DD')
                  const isSelected = selectedDate?.format('YYYY-MM-DD') === dateStr
                  const isToday = dateStr === dayjs().format('YYYY-MM-DD')
                  const isHovered = hoveredDate === dateStr
                  return (
                    <div
                      key={dateStr}
                      onClick={() => handleDateClick(date)}
                      onMouseEnter={() => setHoveredDate(dateStr)}
                      onMouseLeave={() => setHoveredDate(null)}
                      style={{
                        flex: 1,
                        padding: '6px 4px',
                        borderRadius: 6,
                        border: isSelected ? '2px solid #fa8c16' : isHovered ? '2px solid #fa8c16' : '1px solid #e8e8e8',
                        background: isSelected ? '#fff7e6' : isHovered ? '#fff7e6' : isToday ? '#f6ffed' : '#fff',
                        cursor: 'pointer',
                        textAlign: 'center',
                        transition: 'all 0.2s',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                      }}
                    >
                      <span style={{ fontSize: 14, fontWeight: isSelected || isHovered ? 700 : 500, color: isSelected || isHovered ? '#fa8c16' : '#333' }}>
                        {date.format('MM-DD')}
                      </span>
                      <span style={{ fontSize: 12, color: isSelected || isHovered ? '#fa8c16' : '#8c8c8c', marginLeft: 4 }}>
                        {isToday ? '今天' : WEEKDAY_LABELS[date.day()]}
                      </span>
                    </div>
                  )
                })}
              </div>
              <Button
                size="small"
                disabled={currentPage === totalPages}
                onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
              >
                ▶
              </Button>
            </div>
          </div>
        }
        style={{ flex: 1 }}
      >

        {/* 表格 */}
        <div style={{ overflowX: 'auto' }}>
          <table style={{ 
            width: '100%', 
            borderCollapse: 'collapse',
            fontSize: 13,
          }}>
            {/* 表头 */}
            <thead>
              <tr style={{ background: '#f5f5f5' }}>
                <th style={{ 
                  padding: '12px 8px', 
                  border: '1px solid #e8e8e8',
                  fontWeight: 600,
                  color: '#333',
                  width: 120,
                }}>
                  商圈
                </th>
                {MEAL_TIME_SLOTS.map(meal => (
                  <th 
                    key={meal.key}
                    style={{ 
                      padding: '12px 8px', 
                      border: '1px solid #e8e8e8',
                      fontWeight: 600,
                      color: '#333',
                      minWidth: 120,
                    }}
                  >
                    <div>{meal.label}</div>
                    <div style={{ fontSize: 11, color: '#8c8c8c', marginTop: 2 }}>{meal.timeRange}</div>
                  </th>
                ))}
              </tr>
            </thead>

            {/* 数据行 - 商圈为行 */}
            <tbody>
              {REGION_LIST.map(region => {
                const activeDate = selectedDate || (allDates.length > 0 ? allDates[0] : dayjs())
                const dateStr = activeDate.format('YYYY-MM-DD')
                return (
                  <tr key={region.key}>
                    {/* 商圈名称列 */}
                    <td style={{ 
                      padding: '10px 8px', 
                      border: '1px solid #e8e8e8',
                      textAlign: 'center',
                      fontWeight: 600,
                      color: '#333',
                      background: '#fafafa',
                    }}>
                      <div style={{ fontSize: 13 }}>{region.name}</div>
                    </td>

                    {/* 时段列 */}
                    {MEAL_TIME_SLOTS.map(meal => {
                      const statuses = generateTimeSlotStatuses(inventoryItem.id + region.key, dateStr)
                      const slotStates = meal.slots.map(slotIndex => statuses[slotIndex])
                      const availableCount = slotStates.filter(s => s === TimeSlotStatus.AVAILABLE).length
                      const soldOutCount = slotStates.filter(s => s === TimeSlotStatus.SOLD_OUT).length
                      
                      const isLocked = cartItems.some(item => 
                        item.date === dateStr && 
                        item.region === region.key &&
                        meal.slots.some(slotIndex => item.timeSlots.includes(slotIndex))
                      )
                      
                      // 获取锁定的购物车项以计算倒计时
                      const lockedCartItem = cartItems.find(item => 
                        item.date === dateStr && 
                        item.region === region.key &&
                        meal.slots.some(slotIndex => item.timeSlots.includes(slotIndex))
                      )
                      const remainingSeconds = lockedCartItem 
                        ? Math.max(0, 60 - Math.floor((currentTime - lockedCartItem.lockTime) / 1000))
                        : 0
                      
                      let status: 'available' | 'soldOut' | 'unavailable' | 'locked'
                      let availableSlots: number
                      
                      if (isLocked) {
                        status = 'locked'
                        availableSlots = availableCount
                      } else if (soldOutCount > 0 && availableCount === 0) {
                        status = 'soldOut'
                        availableSlots = 0
                      } else if (availableCount > 0) {
                        status = 'available'
                        availableSlots = availableCount
                      } else {
                        status = 'unavailable'
                        availableSlots = 0
                      }
                      
                      const slotsForPrice = status === 'soldOut' ? meal.slots.length : availableSlots
                      const totalAvailableSlots = 36
                      const pricePerSlot = calcSlotPrice(inventoryItem.dailyPrice, totalAvailableSlots)
                      const price = pricePerSlot * slotsForPrice
                      const isSelected = selectedDate?.format('YYYY-MM-DD') === dateStr && selectedMealSlot === meal.key && selectedRegion === region.key
                      const isAvailable = status === 'available'
                      const isSoldOut = status === 'soldOut'
                      const isLockedStatus = status === 'locked'
                      
                      const noDiscountSlots = getNoDiscountSlotsByRow(dateStr)
                      const hasNoDiscount = meal.slots.some(slotIndex => noDiscountSlots.includes(slotIndex))
                      
                      return (
                        <td 
                          key={meal.key}
                          onClick={() => {
                            if (isAvailable) {
                              setSelectedDate(activeDate)
                              setSelectedMealSlot(meal.key)
                              setSelectedRegion(region.key)
                            } else {
                              message.info('該時段暫不可購買')
                            }
                          }}
                          style={{ 
                            padding: '8px 6px', 
                            textAlign: 'center',
                            cursor: isAvailable ? 'pointer' : 'not-allowed',
                            background: isSelected ? '#f6ffed' : 
                                       isLockedStatus ? '#f9f0ff' :
                                       isSoldOut ? '#fff2f0' : 
                                       !isAvailable ? '#f5f5f5' : '#fff',
                            border: isSelected ? '2px solid #52c41a' : 
                                    isLockedStatus ? '1px solid #d3adf7' : 
                                    isSoldOut ? '1px solid #ffccc7' :
                                    '1px solid #e8e8e8',
                            transition: 'all 0.2s',
                            opacity: !isAvailable && !isLockedStatus && !isSoldOut ? 0.6 : 1,
                          }}
                        >
                          {/* 状态标签 */}
                          <div style={{ marginBottom: 4, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                            {status === 'available' && (
                              isSelected
                                ? <Tag color="#E8720C" style={{ fontSize: 10, padding: '1px 4px' }}>已選擇</Tag>
                                : <Tag color="success" style={{ fontSize: 10, padding: '1px 4px' }}>可購買</Tag>
                            )}
                            {status === 'locked' && (
                              <>
                                <Tag color="#722ed1" style={{ fontSize: 10, padding: '1px 4px' }}>已鎖定</Tag>
                                <span>
                                  <span style={{ fontSize: 16, fontWeight: 700, color: '#ff4d4f' }}>
                                    {remainingSeconds}
                                  </span>
                                  <span style={{ fontSize: 10, color: '#ff7875' }}>秒後釋放</span>
                                </span>
                              </>
                            )}
                            {status === 'soldOut' && (
                              <Tag color="error" style={{ fontSize: 10, padding: '1px 4px' }}>已售罄</Tag>
                            )}
                            {status === 'unavailable' && (
                              <Tag color="default" style={{ fontSize: 10, padding: '1px 4px' }}>不可售</Tag>
                            )}
                          </div>

                          {/* 价格 */}
                          {(isAvailable || isSoldOut || isLockedStatus) && (
                            <>
                              <div style={{ 
                                fontSize: 16, 
                                fontWeight: 700, 
                                color: isSoldOut ? '#bfbfbf' : isLockedStatus ? '#722ed1' : '#fa541c',
                                marginBottom: 2,
                              }}>
                                ${price}
                              </div>
                              {hasNoDiscount ? (
                                <div style={{ fontSize: 10, color: '#fa541c', marginBottom: 2, fontWeight: 600 }}>無折扣</div>
                              ) : (
                                <div style={{ fontSize: 10, color: '#8c8c8c', marginBottom: 2, textDecoration: 'line-through' }}>
                                  原價：${inventoryItem.dailyPrice}
                                </div>
                              )}
                            </>
                          )}
                          {!isAvailable && !isSoldOut && !isLockedStatus && (
                            <div style={{ fontSize: 11, color: '#bfbfbf', marginTop: 4 }}>--</div>
                          )}
                        </td>
                      )
                    })}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        </Card>
      </div>

      {/* 右侧：当前所选 + 已选时段 + 费用结算 */}
      <div style={{ width: 400, display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* 当前所选 - 信息展示 */}
        <Card size="small" title={<Space><CalendarOutlined /><span>當前所選</span></Space>}>
          {selectedDate && selectedMealSlot ? (
            <div>
              <Space direction="vertical" size={12} style={{ width: '100%' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 12, color: '#8c8c8c', whiteSpace: 'nowrap' }}>所選日期：</span>
                  <span style={{ fontSize: 14, fontWeight: 600 }}>{selectedDate.format('YYYY-MM-DD')}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 12, color: '#8c8c8c', whiteSpace: 'nowrap' }}>所屬商圈：</span>
                  <span style={{ fontSize: 14, fontWeight: 600, color: '#722ed1' }}>
                    {(() => {
                      return REGION_LIST.find(r => r.key === (selectedRegion || inventoryItem.region))?.name || '-'
                    })()}
                  </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 12, color: '#8c8c8c', whiteSpace: 'nowrap' }}>查看時段：</span>
                  <span style={{ fontSize: 14, color: '#52c41a', fontWeight: 600 }}>
                    {MEAL_TIME_SLOTS.find(m => m.key === selectedMealSlot)?.label}
                  </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 12, color: '#8c8c8c', whiteSpace: 'nowrap' }}>可售狀態：</span>
                  <Tag color="success">可售</Tag>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 12, color: '#8c8c8c', whiteSpace: 'nowrap' }}>售賣價格：</span>
                  <span style={{ fontSize: 20, fontWeight: 700, color: '#ff4d4f' }}>
                    ${(() => {
                      const meal = MEAL_TIME_SLOTS.find(m => m.key === selectedMealSlot)
                      if (!meal) return 0
                      const status = getMealSlotStatus(selectedDate, meal)
                      return getMealSlotPrice(meal, status.availableSlots)
                    })()}
                  </span>
                </div>
              </Space>

              {/* 底部加购按钮 */}
              <Button 
                type="primary" 
                block 
                size="large"
                onClick={() => {
                  if (!selectedDate || !selectedMealSlot) {
                    message.warning('請先選擇日期和時段')
                    return
                  }
                  
                  const meal = MEAL_TIME_SLOTS.find(m => m.key === selectedMealSlot)
                  if (!meal) return
                  
                  const dateStr = selectedDate.format('YYYY-MM-DD')
                  const statuses = generateTimeSlotStatuses(inventoryItem.id, dateStr)
                  const availableSlots = meal.slots.filter(slotIndex => statuses[slotIndex] === TimeSlotStatus.AVAILABLE)
                  
                  if (availableSlots.length === 0) {
                    message.warning('該時段暫無可售庫存')
                    return
                  }
                  
                  // 计算价格
                  const salePrice = getMealSlotPrice(meal, availableSlots.length)
                  const noDiscountSlots = getNoDiscountSlotsByRow(dateStr)
                  const hasNoDiscount = meal.slots.some(slotIndex => noDiscountSlots.includes(slotIndex))
                  const originalPrice = hasNoDiscount ? salePrice : inventoryItem.dailyPrice
                  
                  // 获取商圈名称
                  const activeRegion = selectedRegion || inventoryItem.region
                  const regionName = REGION_LIST.find(r => r.key === activeRegion)?.name || '-'
                  
                  // 添加到购物车
                  const newItem: CartItem = {
                    key: `${dateStr}-${selectedMealSlot}-${Date.now()}`,
                    date: dateStr,
                    region: activeRegion as Region,
                    regionName,
                    mealSlot: meal.label,
                    timeSlots: availableSlots,
                    originalPrice,
                    salePrice,
                    storeId: searchStoreName || '',
                    storeName: searchStoreName ? STORE_OPTIONS.find(s => s.value === searchStoreName)?.name || '' : '',
                    lockTime: Date.now(),
                  }
                  
                  setCartItems(prev => [...prev, newItem])
                  message.success(`已加購 ${dateStr} ${regionName} ${meal.label}`)
                  
                  // 重置选择
                  setSelectedDate(null)
                  setSelectedMealSlot(null)
                  setSelectedRegion(undefined)
                }}
                style={{ 
                  marginTop: 16, 
                  height: 40, 
                  fontSize: 15,
                  background: '#fa8c16',
                  borderColor: '#fa8c16',
                }}
              >
                加購
              </Button>
            </div>
          ) : (
            <Empty description="請選擇日期和時段" image={Empty.PRESENTED_IMAGE_SIMPLE} />
          )}
        </Card>

        {/* 已选商圈，时段 */}
        <Card 
          size="small" 
          title="已選商圈，時段"
        >
          <div style={{ 
            fontSize: 11, 
            color: '#ff4d4f', 
            marginBottom: 12,
            lineHeight: 1.4,
          }}>
            (已加購的時段會被鎖定，鎖定狀態下其他商家無法購買，如需解除需手動移除)
          </div>
          <Table<CartItem>
            dataSource={cartItems}
            pagination={false}
            size="small"
            locale={{ emptyText: <Empty description="暫無已選時段" image={Empty.PRESENTED_IMAGE_SIMPLE} /> }}
            columns={[
              {
                title: '日期',
                dataIndex: 'date',
                key: 'date',
                width: 110,
                render: (text: string) => (
                  <span style={{ fontSize: 12 }}>{text}</span>
                ),
              },
              {
                title: '商圈',
                dataIndex: 'regionName',
                key: 'regionName',
                width: 70,
                render: (text: string) => (
                  <span style={{ fontSize: 12, fontWeight: 600 }}>{text}</span>
                ),
              },
              {
                title: '門店',
                dataIndex: 'storeName',
                key: 'storeName',
                width: 90,
                render: (text: string) => (
                  <span style={{ fontSize: 12, fontWeight: 600, color: '#722ed1' }}>{text}</span>
                ),
              },
              {
                title: '時段',
                dataIndex: 'mealSlot',
                key: 'mealSlot',
                width: 70,
                render: (text: string) => (
                  <span style={{ fontSize: 12, fontWeight: 600 }}>{text}</span>
                ),
              },
              {
                title: '售價',
                dataIndex: 'salePrice',
                key: 'salePrice',
                width: 80,
                align: 'right' as const,
                render: (price: number) => (
                  <span style={{ fontSize: 12, color: '#ff4d4f', fontWeight: 600 }}>${price}</span>
                ),
              },
              {
                title: '鎖定時間',
                key: 'countdown',
                width: 100,
                align: 'center' as const,
                render: (_, record) => {
                  const remaining = Math.max(0, 60 - Math.floor((currentTime - record.lockTime) / 1000))
                  if (remaining <= 0) return <span style={{ fontSize: 11, color: '#bfbfbf' }}>已釋放</span>
                  return (
                    <span style={{ fontSize: 12 }}>
                      <span style={{ fontWeight: 700, color: remaining <= 10 ? '#ff4d4f' : '#fa8c16' }}>{remaining}</span>
                      <span style={{ fontSize: 10, color: '#8c8c8c', marginLeft: 2 }}>秒</span>
                    </span>
                  )
                },
              },
              {
                title: '操作',
                key: 'action',
                width: 60,
                align: 'center' as const,
                render: (_, record) => (
                  <Button
                    type="link"
                    size="small"
                    danger
                    icon={<DeleteOutlined />}
                    style={{ padding: 0, fontSize: 12 }}
                    onClick={() => {
                      setCartItems(prev => prev.filter(item => item.key !== record.key))
                      message.success('已移除')
                    }}
                  >
                    移除
                  </Button>
                ),
              },
            ]}
          />
        </Card>

        {/* 费用结算 */}
        <Card 
          size="small" 
          title="費用結算"
        >
          {/* 推广金余额 */}
          <div style={{ 
            padding: '12px 16px', 
            marginBottom: 12, 
            background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
            borderRadius: 6,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}>
            <span style={{ fontSize: 13, color: '#fff', opacity: 0.9 }}>
              推廣金餘額
            </span>
            <span style={{ 
              fontSize: 22, 
              fontWeight: 700, 
              color: '#fff',
            }}>
              ${merchantBalance.toLocaleString()}
            </span>
          </div>

          <table style={{ width: '100%', fontSize: 12, marginBottom: 12 }}>
            <thead>
              <tr style={{ background: '#fafafa' }}>
                <th style={{ padding: '10px 8px', border: '1px solid #e8e8e8', color: '#595959', fontSize: 12, fontWeight: 600 }}>
                  訂單金額（原價）
                </th>
                <th style={{ padding: '10px 8px', border: '1px solid #e8e8e8', color: '#fa8c16', fontSize: 12, fontWeight: 600 }}>
                  訂單優惠
                </th>
                <th style={{ padding: '10px 8px', border: '1px solid #e8e8e8', color: '#ff4d4f', fontSize: 12, fontWeight: 600 }}>
                  實付總額
                </th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td style={{ padding: '14px 8px', border: '1px solid #e8e8e8', textAlign: 'center' }}>
                  <span style={{ fontSize: 16, fontWeight: 600, color: '#595959' }}>
                    ${cartItems.reduce((sum, item) => sum + item.originalPrice, 0)}
                  </span>
                </td>
                <td style={{ padding: '14px 8px', border: '1px solid #e8e8e8', textAlign: 'center' }}>
                  <span style={{ fontSize: 16, fontWeight: 600, color: '#fa8c16' }}>
                    -${cartItems.reduce((sum, item) => sum + (item.originalPrice - item.salePrice), 0)}
                  </span>
                </td>
                <td style={{ padding: '14px 8px', border: '1px solid #e8e8e8', textAlign: 'center', background: '#fff7f7' }}>
                  <span style={{ fontSize: 20, fontWeight: 700, color: '#ff4d4f' }}>
                    ${cartItems.reduce((sum, item) => sum + item.salePrice, 0)}
                  </span>
                </td>
              </tr>
            </tbody>
          </table>
          <Button 
            type="primary"
            block 
            size="large"
            disabled={cartItems.length === 0}
            onClick={handlePayment}
            style={{ 
              background: cartItems.length > 0 ? '#ff4d4f' : '#d9d9d9', 
              borderColor: cartItems.length > 0 ? '#ff4d4f' : '#d9d9d9',
              height: 44,
              fontSize: 16,
              fontWeight: 600,
            }}
          >
            訂單支付
          </Button>
        </Card>
      </div>
      </div>
      )}

      {/* 支付确认弹窗 */}
      <Modal
        title="確認訂單"
        open={isPaymentModalVisible}
        onOk={handleConfirmPayment}
        onCancel={() => setIsPaymentModalVisible(false)}
        okText="確定支付"
        cancelText="取消"
        okButtonProps={{ style: { background: '#ff4d4f', borderColor: '#ff4d4f' } }}
        width={600}
      >
        <div style={{ marginBottom: 16 }}>
          <h4 style={{ marginBottom: 12, fontSize: 14, color: '#595959' }}>購買明細：</h4>
          <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#fafafa' }}>
                <th style={{ padding: '8px', border: '1px solid #e8e8e8', textAlign: 'left' }}>日期</th>
                <th style={{ padding: '8px', border: '1px solid #e8e8e8', textAlign: 'left' }}>商圈</th>
                <th style={{ padding: '8px', border: '1px solid #e8e8e8', textAlign: 'left' }}>時段</th>
                <th style={{ padding: '8px', border: '1px solid #e8e8e8', textAlign: 'right' }}>售價</th>
              </tr>
            </thead>
            <tbody>
              {cartItems.map(item => (
                <tr key={item.key}>
                  <td style={{ padding: '8px', border: '1px solid #e8e8e8' }}>{item.date}</td>
                  <td style={{ padding: '8px', border: '1px solid #e8e8e8' }}>{item.regionName}</td>
                  <td style={{ padding: '8px', border: '1px solid #e8e8e8' }}>{item.mealSlot}</td>
                  <td style={{ padding: '8px', border: '1px solid #e8e8e8', textAlign: 'right', color: '#ff4d4f', fontWeight: 600 }}>
                    ${item.salePrice}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div style={{ background: '#fafafa', padding: 16, borderRadius: 4 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
            <span style={{ color: '#595959' }}>訂單金額（原價）：</span>
            <span style={{ fontWeight: 600 }}>${cartItems.reduce((sum, item) => sum + item.originalPrice, 0)}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, color: '#fa8c16' }}>
            <span>訂單優惠：</span>
            <span style={{ fontWeight: 600 }}>-${cartItems.reduce((sum, item) => sum + (item.originalPrice - item.salePrice), 0)}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 16, color: '#ff4d4f', borderTop: '1px solid #d9d9d9', paddingTop: 8, marginTop: 8 }}>
            <span style={{ fontWeight: 600 }}>實付金額：</span>
            <span style={{ fontWeight: 700 }}>${cartItems.reduce((sum, item) => sum + item.salePrice, 0)}</span>
          </div>
        </div>
      </Modal>

      {/* 支付成功弹窗 */}
      <Modal
        title="購買成功"
        open={isSuccessModalVisible}
        onCancel={() => setIsSuccessModalVisible(false)}
        footer={[
          <Button key="view" type="primary" onClick={handleViewOrder}>
            查看訂單
          </Button>,
          <Button key="continue" onClick={handleContinuePurchase} style={{ background: '#fa8c16', borderColor: '#fa8c16', color: '#fff' }}>
            繼續購買
          </Button>,
        ]}
        width={400}
      >
        <div style={{ textAlign: 'center', padding: '20px 0' }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>✅</div>
          <p style={{ fontSize: 16, color: '#595959', marginBottom: 24 }}>
            恭喜！購買成功
          </p>
          <div style={{ 
            background: 'linear-gradient(135deg, #fff7e6 0%, #ffe58f 100%)',
            padding: '20px 16px',
            borderRadius: 8,
            marginBottom: 16,
          }}>
            <p style={{ fontSize: 14, color: '#8c8c8c', marginBottom: 8 }}>
              已扣除推廣金
            </p>
            <p style={{ 
              fontSize: 36, 
              fontWeight: 700, 
              color: '#fa541c',
              margin: 0,
              lineHeight: 1.2,
            }}>
              $1985.89
            </p>
          </div>
        </div>
      </Modal>
    </div>
  )
}
