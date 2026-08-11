import { useState, useMemo, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Card, Tag, Space, message, Empty, DatePicker, Button, Table, Select, Modal, Form } from 'antd'
import {
  CalendarOutlined,
  ShopOutlined,
  SearchOutlined,
  ReloadOutlined,
} from '@ant-design/icons'
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
import { Region, AlgorithmType } from '../Recommend/constants'
import { fetchAdAlgorithms } from '../../api/adPromotion'

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
const _MOCK_REGION_COMBINATIONS: RegionCombination[] = [
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

/** 後端品牌名 → UI 品牌值 映射 */
const BACKEND_TO_UI_BRAND: Record<string, string> = { flashBee: 'shanfeng', mFood: 'mfood' }

/** BD选项 */
const _BD_OPTIONS = [
  { label: '張偉', value: 'bd-001' },
  { label: '李娜', value: 'bd-002' },
  { label: '王強', value: 'bd-003' },
  { label: '劉敏', value: 'bd-004' },
]

// MEAL_TIME_SLOTS 定义移入组件内部以使用 t() 翻譯 labels
// 在组件内部通过 useMemo 创建

/** 商圈列表（表格行）—— name 仅作 fallback，实际展示用组件内翻译 */
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
  // 珠海區域
  { key: Region.GONGBEI, name: '拱北區域' },
  { key: Region.HENGQIN, name: '橫琴區域' },
]

// WEEKDAY_LABELS 移入组件内部以使用 t() 翻譯

/** 时段锁定时长（秒），调整此值即可同步更新倒计时、过期释放、弹窗提示 */
const LOCK_DURATION_SECONDS = 60
const LOCK_DURATION_MS = LOCK_DURATION_SECONDS * 1000

/** 可售天数（含当天），超出该窗口即为待开售日期：盘活复苏 150 天，其他类型 12 天 */
const REVIVE_SELLABLE_DAYS = 150
const DEFAULT_SELLABLE_DAYS = 12
/** 开售时间（每日该时点放出新一天的可购买日期，火车票式） */
const PRESALE_OPEN_HOUR = 10

/** 根据算法类型取可售天数 */
function getSellableDays(algorithmType: AlgorithmType): number {
  return algorithmType === AlgorithmType.HOT_REVIVE_AD ? REVIVE_SELLABLE_DAYS : DEFAULT_SELLABLE_DAYS
}

/** 计算某日期相对今天的天数偏移（今天=0） */
function getDayOffset(date: Dayjs): number {
  return date.startOf('day').diff(dayjs().startOf('day'), 'day')
}
/** 是否为待开售日期（超出可售窗口，暂不可购买） */
function isPresaleDate(date: Dayjs, sellableDays: number): boolean {
  return getDayOffset(date) >= sellableDays
}
/** 待开售日期的开售时间（提前 sellableDays 天、于 PRESALE_OPEN_HOUR 点开售） */
function getPresaleOpenTime(date: Dayjs, sellableDays: number): Dayjs {
  return date.startOf('day').subtract(sellableDays - 1, 'day').hour(PRESALE_OPEN_HOUR).minute(0).second(0)
}

export default function DateTimeGrid({ inventoryItem }: DateTimeGridProps) {
  const { t } = useTranslation('adSales')
  const navigate = useNavigate()
  // 时段定义（含翻译）
  const MEAL_TIME_SLOTS = useMemo(() => [
    { key: 'breakfast', label: t('breakfast'), timeRange: '07:00-10:00', slots: [14, 15, 16, 17, 18, 19] },
    { key: 'lunch', label: t('lunch'), timeRange: '11:00-14:00', slots: [22, 23, 24, 25, 26, 27] },
    { key: 'afternoon', label: t('afternoon'), timeRange: '14:00-17:00', slots: [28, 29, 30, 31, 32, 33] },
    { key: 'dinner', label: t('dinner'), timeRange: '17:00-21:00', slots: [34, 35, 36, 37, 38, 39, 40, 41] },
    { key: 'supper', label: t('supper'), timeRange: '21:00-02:00', slots: [42, 43, 44, 45, 46, 47, 0, 1, 2, 3] },
  ], [t])

  // 星期标签（含翻译）
  const WEEKDAY_LABELS = t('weekdayFull', { returnObjects: true }) as string[]

  // 商圈名称翻译映射
  const REGION_NAME_MAP: Record<number, string> = useMemo(() => ({
    [Region.KOKSAA]: t('regionKOKSAA'),
    [Region.COSTA]: t('regionCOSTA'),
    [Region.SANMA]: t('regionSANMA'),
    [Region.SANWONG]: t('regionSANWONG'),
    [Region.HKM]: t('regionHKM'),
    [Region.FAHUA]: t('regionFAHUA'),
    [Region.AIRPORT]: t('regionAIRPORT'),
    [Region.LHOTEL]: t('regionLHOTEL'),
    [Region.RHOTEL]: t('regionRHOTEL'),
    [Region.UM]: t('regionUM'),
    [Region.HACS]: t('regionHACS'),
    [Region.GONGBEI]: t('regionGONGBEI'),
    [Region.HENGQIN]: t('regionHENGQIN'),
  }), [t])

  // 翻译后的商圈列表
  const translatedRegionList = useMemo(() =>
    REGION_LIST.map(r => ({ ...r, name: REGION_NAME_MAP[Number(r.key)] || r.name })),
  [REGION_NAME_MAP])

  // 当前库存项的可售天数（盘活复苏 150 天，其他 12 天）
  const sellableDays = getSellableDays(inventoryItem.algorithmType)
  const [selectedDates, setSelectedDates] = useState<Dayjs[]>([])
  const [activeDate, setActiveDate] = useState<Dayjs | null>(null) // 当前查看的日期
  const [hoveredDate, setHoveredDate] = useState<string | null>(null)
  const [selectedCells, setSelectedCells] = useState<Array<{date: string; regionKey: Region | string; mealSlotKey: string}>>([])
  const [cartItems, setCartItems] = useState<CartItem[]>([])
  const [currentPage, setCurrentPage] = useState(1)
  const [_selectedRegion, _setSelectedRegion] = useState<Region | string | undefined>(undefined)
  const [_selectedCombination, _setSelectedCombination] = useState<number | undefined>(undefined)
  const [_regionMode, _setRegionMode] = useState<'single' | 'combination'>('single')
  const pageSize = 7
  const [isPaymentModalVisible, setIsPaymentModalVisible] = useState(false)
  const [isSuccessModalVisible, setIsSuccessModalVisible] = useState(false)
  const [isSoldOutModalVisible, setIsSoldOutModalVisible] = useState(false)
  const [soldOutDetails, setSoldOutDetails] = useState<Array<{date: string; regionName: string; mealSlot: string}>>([])
  const [_selectedStore, _setSelectedStore] = useState<string | undefined>(undefined)
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
    const expiredItems = cartItems.filter(item => currentTime - item.lockTime >= LOCK_DURATION_MS)
    if (expiredItems.length > 0) {
      setCartItems(prev => prev.filter(item => currentTime - item.lockTime < LOCK_DURATION_MS))
      expiredItems.forEach(item => {
        message.info(`${item.date} ${item.regionName} ${item.mealSlot} ${t('lockExpired')}`)
      })
    }
  }, [currentTime, cartItems])

  // 查询条件状态
  const [searchBrand, setSearchBrand] = useState<string | null>(null)
  const [searchAlgorithm, setSearchAlgorithm] = useState<string | null>(null)
  const [searchStoreName, setSearchStoreName] = useState<string | null>(null)
  const [searchDate, setSearchDate] = useState<Dayjs | null>(null)
  const [_searchBD, setSearchBD] = useState<string | null>(null)
  const [hasSearched, setHasSearched] = useState(false)
  const [isConflictModalVisible, setIsConflictModalVisible] = useState(false)
  const [pendingAction, setPendingAction] = useState<(() => void) | null>(null)
  // 预售日期提醒弹窗
  const [presaleInfo, setPresaleInfo] = useState<{ date: string; weekday: string; openTime: string } | null>(null)
  // 真实算法下拉（從算法庫 API 動態加載，value=算法ID）
  const [algorithmOptions, setAlgorithmOptions] = useState<Array<{ label: string; value: string }>>([])
  const [algorithmBrandOverrides, setAlgorithmBrandOverrides] = useState<Record<string, string>>({})

  // 加载算法库已启用的算法
  useEffect(() => {
    fetchAdAlgorithms({ page: 1, size: 200, status: 1, hasPricing: true })
      .then(res => {
        if (!res) return
        // 过滤系统预置算法（SQL seed），仅展示算法库菜单中用户创建的算法
        const records = res.records.filter(a => a.updatedBy !== '系統')
        const brandOverrides: Record<string, string> = {}
        const options = records.map(a => {
          const value = String(a.id)
          const uiBrand = BACKEND_TO_UI_BRAND[a.brand || '']
          if (uiBrand) brandOverrides[value] = uiBrand
          return { label: a.algoName, value }
        })
        setAlgorithmOptions(options)
        setAlgorithmBrandOverrides(brandOverrides)
      }).catch(() => {})
  }, [])

  // 当前活动日期的字符串
  const activeDateStr = activeDate?.format('YYYY-MM-DD') || ''

  // 检查购物车是否有加购数据
  const hasCartItems = cartItems.length > 0

  // 算法名称变更处理：自动带出品牌，并检查购物车冲突
  const handleAlgorithmChange = (value: string | null) => {
    if (hasCartItems && value !== searchAlgorithm) {
      setPendingAction(() => {
        setSearchAlgorithm(value)
        setSearchBrand(value ? (algorithmBrandOverrides[value] ?? null) : null)
      })
      setIsConflictModalVisible(true)
      return
    }
    setSearchAlgorithm(value)
    setSearchBrand(value ? (algorithmBrandOverrides[value] ?? null) : null)
  }

  // 门店名称变更处理：自动带出BD，并检查购物车冲突
  const _handleStoreChange = (value: string | null) => {
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
    message.success(t('clearedRegionSlot'))
  }

  // 取消切换
  const handleCancelSwitch = () => {
    setIsConflictModalVisible(false)
    setPendingAction(null)
  }

  // 查询：必须选择算法名称（品牌已自动带出）
  const handleSearch = () => {
    if (!searchAlgorithm) { message.warning(t('selectAlgorithm')); return }
    if (!searchBrand) { message.warning(t('selectBrand')); return }
    setHasSearched(true)
    // 自动选中第一个可用日期
    if (allDates.length > 0) {
      setSelectedDates([allDates[0]])
      setActiveDate(allDates[0])
      setSelectedCells([])
    }
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
    // 计算含折扣的总价
    const grouped: Record<string, CartItem[]> = {}
    cartItems.forEach(item => {
      if (!grouped[item.date]) grouped[item.date] = []
      grouped[item.date].push(item)
    })
    let totalAmount = 0
    Object.entries(grouped).forEach(([dateStr, items]) => {
      const subtotal = items.reduce((sum, item) => sum + item.salePrice, 0)
      const discount = getDateDiscount(dateStr)
      totalAmount += discount ? Math.round(subtotal * discount.discount / 100) : subtotal
    })
    
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
    const _typeName = RECOMMEND_TYPE_CONFIGS.find(c => c.type === inventoryItem.algorithmType)?.name || ''
    navigate('/promotion-order-manage')
  }

  // 继续购买
  const handleContinuePurchase = () => {
    setIsSuccessModalVisible(false)
    message.success(t('continueBuy'))
  }

  // 生成所有日期列表（从当天开始，不展示已过去的日期）
  const allDates = useMemo(() => {
    const availableStart = dayjs(inventoryItem.availableStartDate)
    const availableEnd = dayjs(inventoryItem.availableEndDate)
    const today = dayjs().startOf('day')
    // 起始日期取当天和可购买起始日期的较晚者
    const startDate = today.isAfter(availableStart) ? today : availableStart
    const endDate = availableEnd
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
  const _slotPrice = useMemo(() => {
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
    const _unavailableCount = slotStates.filter(s => s === TimeSlotStatus.UNAVAILABLE).length
    
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

  // 点击日期（单选切换：点击新日期取消之前的选中）
  const handleDateClick = (date: Dayjs) => {
    // 预售日期：暂不可购买，弹窗提示开售时间
    if (isPresaleDate(date, sellableDays)) {
      setPresaleInfo({
        date: date.format('YYYY-MM-DD'),
        weekday: WEEKDAY_LABELS[date.day()],
        openTime: getPresaleOpenTime(date, sellableDays).format('M月D日 HH:mm'),
      })
      return
    }
    const dateStr = date.format('YYYY-MM-DD')
    setSelectedDates(prev => {
      const exists = prev.some(d => d.format('YYYY-MM-DD') === dateStr)
      if (exists) return prev.filter(d => d.format('YYYY-MM-DD') !== dateStr)
      return [date]
    })
    setActiveDate(date)
  }

  // 多时段折扣配置
  const MULTI_SLOT_DISCOUNT_TIERS = [
    { minSlots: 10, discount: 80, label: '8折' },
    { minSlots: 8, discount: 85, label: '85折' },
    { minSlots: 5, discount: 90, label: '9折' },
    { minSlots: 3, discount: 95, label: '95折' },
  ]

  // 计算某日期下的折扣（按格子数，每个格子=1个时段）
  const getDateDiscount = (dateStr: string) => {
    const dateItems = cartItems.filter(item => item.date === dateStr)
    const totalSlots = dateItems.length  // 每个 cartItem 代表一个格子（商圈×餐段）
    for (const tier of MULTI_SLOT_DISCOUNT_TIERS) {
      if (totalSlots >= tier.minSlots) return tier
    }
    return null
  }

  // 点击时段格子（多选切换，带日期）
  const handleMealSlotClick = (date: Dayjs, mealSlot: typeof MEAL_TIME_SLOTS[0], regionKey: Region | string) => {
    const status = getMealSlotStatus(date, mealSlot)
    if (status.status !== 'available') {
      message.info(t('dateNotForSale'))
      return
    }
    const dateStr = date.format('YYYY-MM-DD')
    setActiveDate(date)
    setSelectedCells(prev => {
      const exists = prev.some(c => c.date === dateStr && c.regionKey === regionKey && c.mealSlotKey === mealSlot.key)
      if (exists) return prev.filter(c => !(c.date === dateStr && c.regionKey === regionKey && c.mealSlotKey === mealSlot.key))
      return [...prev, { date: dateStr, regionKey, mealSlotKey: mealSlot.key }]
    })
  }

  return (
    <div>
      {/* 查询区域 - 始终显示 */}
      <div className="search-section" style={{ marginBottom: 16 }}>
          <Form layout="inline" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px 12px' }}>
            <Form.Item label={t('algoNameLabel')}>
              <Select
                placeholder={t('algoSearchPlaceholder')}
                value={searchAlgorithm}
                onChange={handleAlgorithmChange}
                allowClear
                showSearch
                optionFilterProp="label"
                options={algorithmOptions}
              />
            </Form.Item>
            <Form.Item label={t('brandLabel')}>
              <Select
                placeholder={t('brandAutoHint')}
                value={searchBrand}
                onChange={(v) => setSearchBrand(v)}
                allowClear
                disabled
                options={[
                  { label: t('flashBee'), value: 'shanfeng' },
                  { label: 'mFood', value: 'mfood' },
                ]}
              />
            </Form.Item>
            <Form.Item label={t('selectDateLabel')}>
              <DatePicker
                value={searchDate}
                onChange={(date) => setSearchDate(date)}
                format="YYYY-MM-DD"
                style={{ width: '100%' }}
              />
            </Form.Item>
            <Form.Item>
              <div className="search-actions">
                <Button type="primary" icon={<SearchOutlined />} onClick={handleSearch}>{t('searchQuery')}</Button>
                <Button icon={<ReloadOutlined />} onClick={handleReset}>{t('common:reset')}</Button>
              </div>
            </Form.Item>
          </Form>
      </div>

      {/* 购物车冲突提醒弹窗 */}
      <Modal
        title={t('switchConfirmTitle')}
        open={isConflictModalVisible}
        onOk={handleConfirmSwitch}
        onCancel={handleCancelSwitch}
        okText={t('switchConfirmOk')}
        cancelText={t('common:cancel')}
        okButtonProps={{ danger: true }}
      >
        <div style={{ padding: '8px 0' }}>
          <p style={{ marginBottom: 12, fontSize: 14, color: '#262626' }}>
            {t('switchWarnLine1')}
          </p>
          <p style={{ marginBottom: 0, fontSize: 13, color: '#595959' }}>
            {t('dtgSwitchWarnLine2')}
          </p>
          <ul style={{ margin: '8px 0 0', paddingLeft: 20, fontSize: 13, color: '#595959' }}>
            <li>{t('switchOption1')}</li>
            <li>{t('switchOption2')}</li>
          </ul>
        </div>
      </Modal>

      {!hasSearched ? (
        <Card bodyStyle={{ padding: '48px 24px' }}>
          <Empty description={t('dtgSearchFirstHint')} image={Empty.PRESENTED_IMAGE_SIMPLE} />
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
                  const isSelected = selectedDates.some(d => d.format('YYYY-MM-DD') === dateStr)
                  const isToday = dateStr === dayjs().format('YYYY-MM-DD')
                  const isHovered = hoveredDate === dateStr
                  const presale = isPresaleDate(date, sellableDays)
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
                        border: presale
                          ? '1px dashed #d9d9d9'
                          : isSelected ? '2px solid #fa8c16' : isHovered ? '2px solid #fa8c16' : '1px solid #e8e8e8',
                        background: presale
                          ? '#fafafa'
                          : isSelected ? '#fff7e6' : isHovered ? '#fff7e6' : isToday ? '#f6ffed' : '#fff',
                        cursor: 'pointer',
                        textAlign: 'center',
                        transition: 'all 0.2s',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        position: 'relative',
                      }}
                    >
                      {selectedCells.some(c => c.date === dateStr) && (
                        <div style={{
                          position: 'absolute', top: 2, right: 2,
                          width: 8, height: 8, borderRadius: '50%',
                          background: '#ff4d4f',
                          animation: 'dotPulse 1.5s ease-in-out infinite',
                        }} />
                      )}
                      <span style={{ fontSize: 14, fontWeight: isSelected || isHovered ? 700 : 500, color: presale ? '#bfbfbf' : isSelected || isHovered ? '#fa8c16' : '#333' }}>
                        {date.format('MM-DD')}
                      </span>
                      {presale ? (
                        <span style={{ fontSize: 11, color: '#8c8c8c', marginLeft: 4, border: '1px solid #d9d9d9', borderRadius: 3, padding: '0 3px', background: '#f5f5f5' }}>{t('presaleTag')}</span>
                      ) : (
                        <span style={{ fontSize: 12, color: isSelected || isHovered ? '#fa8c16' : '#8c8c8c', marginLeft: 4 }}>
                          {isToday ? t('today') : WEEKDAY_LABELS[date.day()]}
                        </span>
                      )}
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

        {/* 表格 - 仅展示 activeDate */}
        {!activeDate ? (
          <div style={{ padding: '48px 24px', textAlign: 'center' }}>
            <Empty description={t('selectDateHint')} image={Empty.PRESENTED_IMAGE_SIMPLE} />
          </div>
        ) : (
          <div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
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
                  {t('cartColRegion')}
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
              {translatedRegionList.map(region => {
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
                      const statuses = generateTimeSlotStatuses(inventoryItem.id + region.key, activeDateStr)
                      const slotStates = meal.slots.map(slotIndex => statuses[slotIndex])
                      const availableCount = slotStates.filter(s => s === TimeSlotStatus.AVAILABLE).length
                      const soldOutCount = slotStates.filter(s => s === TimeSlotStatus.SOLD_OUT).length
                      
                      const isLocked = cartItems.some(item => 
                        item.date === activeDateStr && 
                        item.region === region.key &&
                        meal.slots.some(slotIndex => item.timeSlots.includes(slotIndex))
                      )
                      
                      // 获取锁定的购物车项以计算倒计时
                      const lockedCartItem = cartItems.find(item => 
                        item.date === activeDateStr && 
                        item.region === region.key &&
                        meal.slots.some(slotIndex => item.timeSlots.includes(slotIndex))
                      )
                      const remainingSeconds = lockedCartItem 
                        ? Math.max(0, LOCK_DURATION_SECONDS - Math.floor((currentTime - lockedCartItem.lockTime) / 1000))
                        : 0
                      
                      let status: 'available' | 'soldOut' | 'unavailable' | 'locked'
                      let availableSlots: number
                      
                      if (isLocked) {
                        status = 'locked'
                        availableSlots = availableCount
                      } else if (soldOutCount > 0) {
                        // 有已售罄時段 → 顯示為已售罄
                        status = 'soldOut'
                        availableSlots = 0
                      } else if (availableCount < meal.slots.length) {
                        // 有不可售時段 → 顯示為不可售
                        status = 'unavailable'
                        availableSlots = 0
                      } else if (availableCount > 0) {
                        // 全部可售
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
                      const isSelected = selectedCells.some(c => c.date === activeDateStr && c.regionKey === region.key && c.mealSlotKey === meal.key)
                      const isAvailable = status === 'available'
                      const isSoldOut = status === 'soldOut'
                      const isLockedStatus = status === 'locked'
                      
                      const noDiscountSlots = getNoDiscountSlotsByRow(activeDateStr)
                      const hasNoDiscount = meal.slots.some(slotIndex => noDiscountSlots.includes(slotIndex))
                      
                      // Mock: 生成确定性库存数量（基于 region + meal 的 hash）
                      const mockInventory = ((Number(region.key) * 7 + meal.slots[0] * 13) % 20) + 3
                      
                      return (
                        <td 
                          key={meal.key}
                          onClick={() => {
                            if (isAvailable) {
                              handleMealSlotClick(activeDate, meal, region.key)
                            } else {
                              message.info(t('dateNotForSale'))
                            }
                          }}
                          style={{ 
                            padding: '6px 4px', 
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
                          <div style={{ marginBottom: 2, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                            {status === 'available' && (
                              isSelected
                                ? <Tag color="#E8720C" style={{ fontSize: 10, padding: '0 3px', lineHeight: '16px' }}>{t('selectedTag')}</Tag>
                                : <Tag color="success" style={{ fontSize: 10, padding: '0 3px', lineHeight: '16px' }}>{t('availableTag')}</Tag>
                            )}
                            {status === 'locked' && (
                              <>
                                <Tag color="#722ed1" style={{ fontSize: 10, padding: '0 3px', lineHeight: '16px' }}>{t('lockedTag')}</Tag>
                                <span>
                                  <span style={{ fontSize: 14, fontWeight: 700, color: '#ff4d4f' }}>
                                    {remainingSeconds}
                                  </span>
                                  <span style={{ fontSize: 9, color: '#ff7875' }}>{t('secondUnit')}</span>
                                </span>
                              </>
                            )}
                            {status === 'soldOut' && (
                              <Tag color="error" style={{ fontSize: 10, padding: '0 3px', lineHeight: '16px' }}>{t('soldOutTag')}</Tag>
                            )}
                            {status === 'unavailable' && (
                              <Tag color="default" style={{ fontSize: 10, padding: '0 3px', lineHeight: '16px' }}>{t('unavailableTag')}</Tag>
                            )}
                          </div>

                          {/* 价格 */}
                          {(isAvailable || isSoldOut || isLockedStatus) && (
                            <div style={{ 
                              fontSize: 14, 
                              fontWeight: 700, 
                              color: isSoldOut ? '#bfbfbf' : isLockedStatus ? '#722ed1' : '#fa541c',
                              marginBottom: 1,
                            }}>
                              ${price}
                            </div>
                          )}
                          {/* 原价横杠 / 无折扣 */}
                          {(isAvailable || isLockedStatus) && (
                            hasNoDiscount ? (
                              <div style={{ fontSize: 10, color: '#8c8c8c', marginBottom: 1 }}>{t('noDiscount')}</div>
                            ) : (
                              <div style={{ fontSize: 10, color: '#bfbfbf', textDecoration: 'line-through', marginBottom: 1 }}>
                                ${inventoryItem.dailyPrice}
                              </div>
                            )
                          )}
                          {/* 库存 */}
                          {(isAvailable || isLockedStatus) && (
                            <div style={{ fontSize: 10, color: '#8c8c8c', marginBottom: 1 }}>
                              {t('inventoryLabel')}：<span style={{ color: mockInventory <= 5 ? '#ff4d4f' : '#595959', fontWeight: mockInventory <= 5 ? 600 : 400 }}>{mockInventory}</span>
                            </div>
                          )}
                          {isSoldOut && (
                            <div style={{ fontSize: 10, color: '#bfbfbf', marginBottom: 1 }}>{t('inventoryLabel')}：0</div>
                          )}
                          {!isAvailable && !isSoldOut && !isLockedStatus && (
                            <div style={{ fontSize: 11, color: '#bfbfbf', marginTop: 2 }}>--</div>
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
          </div>
        )}
        </Card>
      </div>

      {/* 右侧：当前所选 + 已选时段 + 费用结算 */}
      <div style={{ width: 400, display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* 当前所选 - 按日期统筹展示 */}
        <Card size="small" title={<Space><CalendarOutlined /><span>{t('adSales.currentSelection')}</span></Space>}>
          {selectedCells.length > 0 ? (
            <div>
              {/* 按日期分组展示所有选中的格子 */}
              {(() => {
                // 按日期分组
                const cellsByDate: Record<string, typeof selectedCells> = {}
                selectedCells.forEach(cell => {
                  if (!cellsByDate[cell.date]) cellsByDate[cell.date] = []
                  cellsByDate[cell.date].push(cell)
                })
                const sortedDates = Object.keys(cellsByDate).sort()
                
                // 计算每个日期的预览数据
                const datePreviews: Array<{dateStr: string; items: Array<{regionKey: Region | string; regionName: string; mealSlotKey: string; mealSlotLabel: string; salePrice: number; originalPrice: number; timeSlots: number[]}>}> = []
                
                sortedDates.forEach(dateStr => {
                  const cells = cellsByDate[dateStr]
                  const items: typeof datePreviews[0]['items'] = []
                  
                  cells.forEach(cell => {
                    const meal = MEAL_TIME_SLOTS.find(m => m.key === cell.mealSlotKey)
                    if (!meal) return
                    const regionName = translatedRegionList.find(r => r.key === cell.regionKey)?.name || '-'
                    const statuses = generateTimeSlotStatuses(inventoryItem.id + Number(cell.regionKey), dateStr)
                    const availableSlots = meal.slots.filter(slotIndex => statuses[slotIndex] === TimeSlotStatus.AVAILABLE)
                    if (availableSlots.length === 0) return
                    
                    const salePrice = getMealSlotPrice(meal, availableSlots.length)
                    const noDiscountSlots = getNoDiscountSlotsByRow(dateStr)
                    const hasNoDiscount = meal.slots.some(slotIndex => noDiscountSlots.includes(slotIndex))
                    const originalPrice = hasNoDiscount ? salePrice : inventoryItem.dailyPrice
                    
                    items.push({
                      regionKey: cell.regionKey,
                      regionName,
                      mealSlotKey: cell.mealSlotKey,
                      mealSlotLabel: meal.label,
                      salePrice,
                      originalPrice,
                      timeSlots: availableSlots,
                    })
                  })
                  
                  if (items.length > 0) {
                    datePreviews.push({ dateStr, items })
                  }
                })
                
                return (
                  <>
                    {datePreviews.map(({ dateStr, items }) => {
                      
                      // 按商圈分组
                      const byRegion: Record<string, typeof items> = {}
                      items.forEach(item => {
                        if (!byRegion[item.regionName]) byRegion[item.regionName] = []
                        byRegion[item.regionName].push(item)
                      })
                      
                      return (
                        <div key={dateStr} style={{ marginBottom: 12, border: '1px solid #d9f7be', borderRadius: 8, overflow: 'hidden', background: '#fcfff5' }}>
                          <div style={{ 
                            padding: '8px 12px', background: '#f6ffed', borderBottom: '1px solid #d9f7be',
                          }}>
                            <span style={{ fontSize: 13, fontWeight: 600, color: '#389e0d' }}>📅 {dateStr}</span>
                          </div>
                          <div style={{ padding: '8px 12px' }}>
                            {Object.entries(byRegion).map(([rName, rItems]) => (
                              <div key={rName} style={{ marginBottom: 6 }}>
                                <div style={{ fontSize: 12, fontWeight: 600, color: '#722ed1', marginBottom: 3 }}>
                                  <ShopOutlined style={{ marginRight: 4 }} />{rName}
                                </div>
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                                  {rItems.map(item => (
                                    <Tag key={`${item.mealSlotKey}`} color="orange" style={{ fontSize: 11, margin: 0 }}>{item.mealSlotLabel}</Tag>
                                  ))}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )
                    })}
                    
                    {/* 多时段折扣 */}
                    <div style={{ 
                      padding: '10px 12px', borderRadius: 8, marginBottom: 12,
                      background: 'linear-gradient(135deg, #fff7e6, #fff1cc)',
                      border: '1px solid #ffe58f',
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    }}>
                      <span style={{ fontSize: 13, color: '#595959' }}>{t('multiSlotDiscount')}</span>
                      {(() => {
                        // 汇总所有日期的时段数（按格子数计算，每个格子=1个时段）
                        // 购物车已有的格子数
                        const cartCellCount = cartItems.length
                        // 当前预览的格子数
                        const previewCellCount = selectedCells.length
                        const allSlots = cartCellCount + previewCellCount
                        let discount = null
                        if (allSlots >= 3) {
                          for (const tier of MULTI_SLOT_DISCOUNT_TIERS) {
                            if (allSlots >= tier.minSlots) { discount = tier; break }
                          }
                        }
                        return discount ? (
                          <Tag color="orange" style={{ fontSize: 13, fontWeight: 600 }}>{discount.label}</Tag>
                        ) : (
                          <span style={{ fontSize: 13, color: '#bfbfbf' }}>{t('noDiscount')}</span>
                        )
                      })()}
                    </div>
                    
                    {/* 加购按钮 */}
                    <Button 
                      type="primary" 
                      block 
                      size="large"
                      onClick={() => {
                        // 构建所有待加购项
                        const allItems: Array<{cell: typeof selectedCells[0]; item: CartItem}> = []
                        
                        selectedCells.forEach(cell => {
                          const meal = MEAL_TIME_SLOTS.find(m => m.key === cell.mealSlotKey)
                          if (!meal) return
                          const regionName = translatedRegionList.find(r => r.key === cell.regionKey)?.name || '-'
                          const dateStr = cell.date
                          const statuses = generateTimeSlotStatuses(inventoryItem.id + Number(cell.regionKey), dateStr)
                          const availableSlots = meal.slots.filter(slotIndex => statuses[slotIndex] === TimeSlotStatus.AVAILABLE)
                          if (availableSlots.length === 0) return
                          
                          const salePrice = getMealSlotPrice(meal, availableSlots.length)
                          const noDiscountSlots = getNoDiscountSlotsByRow(dateStr)
                          const hasNoDiscount = meal.slots.some(slotIndex => noDiscountSlots.includes(slotIndex))
                          const originalPrice = hasNoDiscount ? salePrice : inventoryItem.dailyPrice
                          
                          allItems.push({
                            cell,
                            item: {
                              key: `${dateStr}-${cell.regionKey}-${meal.key}-${Date.now()}-${Math.random()}`,
                              date: dateStr,
                              region: cell.regionKey as Region,
                              regionName,
                              mealSlot: meal.label,
                              timeSlots: availableSlots,
                              originalPrice,
                              salePrice,
                              storeId: searchStoreName || '',
                              storeName: searchStoreName ? STORE_OPTIONS.find(s => s.value === searchStoreName)?.name || '' : '',
                              lockTime: Date.now(),
                            }
                          })
                        })
                        
                        if (allItems.length === 0) {
                          message.warning(t('noStockForSlot'))
                          return
                        }
                        
                        // 当选择时段≥2个时，随机抽取部分时段变为售罄
                        let finalItems = allItems
                        if (allItems.length >= 2) {
                          // 随机抽取 20%~30% 的时段售罄（至少1个）
                          const soldOutCount = Math.max(1, Math.floor(allItems.length * (0.2 + Math.random() * 0.1)))
                          const indices = [...Array(allItems.length).keys()]
                          // Fisher-Yates 洗牌
                          for (let i = indices.length - 1; i > 0; i--) {
                            const j = Math.floor(Math.random() * (i + 1));
                            [indices[i], indices[j]] = [indices[j], indices[i]]
                          }
                          const soldOutIndices = new Set(indices.slice(0, Math.min(soldOutCount, allItems.length - 1)))
                          
                          const soldOut: Array<{date: string; regionName: string; mealSlot: string}> = []
                          finalItems = allItems.filter((_, idx) => {
                            if (soldOutIndices.has(idx)) {
                              soldOut.push({
                                date: allItems[idx].item.date,
                                regionName: allItems[idx].item.regionName,
                                mealSlot: allItems[idx].item.mealSlot,
                              })
                              return false
                            }
                            return true
                          })
                          
                          if (soldOut.length > 0) {
                            setSoldOutDetails(soldOut)
                            setIsSoldOutModalVisible(true)
                          }
                        }
                        
                        if (finalItems.length > 0) {
                          setCartItems(prev => [...prev, ...finalItems.map(fi => fi.item)])
                        }
                        setSelectedCells([])
                      }}
                      style={{ height: 40, fontSize: 15, background: '#fa8c16', borderColor: '#fa8c16' }}
                    >
                      {t('confirmAddCart', { dates: datePreviews.length, slots: selectedCells.length })}
                    </Button>
                  </>
                )
              })()}
            </div>
          ) : (
            <Empty description={t('clickSlotHint')} image={Empty.PRESENTED_IMAGE_SIMPLE} />
          )}
        </Card>

        {/* 已选商圈，时段 */}
        <Card 
          size="small" 
          title={t('selectedRegionSlots')}
        >
          <div style={{ 
            fontSize: 11, 
            color: '#ff4d4f', 
            marginBottom: 12,
            lineHeight: 1.4,
          }}>
            {t('lockWarning')}
          </div>
          <Table<CartItem>
            dataSource={cartItems}
            pagination={false}
            size="small"
            locale={{ emptyText: <Empty description={t('noSelectedSlots')} image={Empty.PRESENTED_IMAGE_SIMPLE} /> }}
            columns={[
              {
                title: t('cartColDate'),
                dataIndex: 'date',
                key: 'date',
                width: 110,
                render: (text: string) => (
                  <span style={{ fontSize: 12 }}>{text}</span>
                ),
              },
              {
                title: t('cartColRegion'),
                dataIndex: 'regionName',
                key: 'regionName',
                width: 70,
                render: (text: string) => (
                  <span style={{ fontSize: 12, fontWeight: 600 }}>{text}</span>
                ),
              },
              {
                title: t('cartColStore'),
                dataIndex: 'storeName',
                key: 'storeName',
                width: 90,
                render: (text: string) => (
                  <span style={{ fontSize: 12, fontWeight: 600, color: '#722ed1' }}>{text}</span>
                ),
              },
              {
                title: t('cartColSlot'),
                dataIndex: 'mealSlot',
                key: 'mealSlot',
                width: 70,
                render: (text: string) => (
                  <span style={{ fontSize: 12, fontWeight: 600 }}>{text}</span>
                ),
              },
              {
                title: t('cartColPrice'),
                dataIndex: 'salePrice',
                key: 'salePrice',
                width: 80,
                align: 'right' as const,
                render: (price: number) => (
                  <span style={{ fontSize: 12, color: '#ff4d4f', fontWeight: 600 }}>${price}</span>
                ),
              },
              {
                title: t('cartColLockTime'),
                key: 'countdown',
                width: 100,
                align: 'center' as const,
                render: (_, record) => {
                  const remaining = Math.max(0, LOCK_DURATION_SECONDS - Math.floor((currentTime - record.lockTime) / 1000))
                  if (remaining <= 0) return <span style={{ fontSize: 11, color: '#bfbfbf' }}>{t('lockReleased')}</span>
                  return (
                    <span style={{ fontSize: 12 }}>
                      <span style={{ fontWeight: 700, color: remaining <= 10 ? '#ff4d4f' : '#fa8c16' }}>{remaining}</span>
                      <span style={{ fontSize: 10, color: '#8c8c8c', marginLeft: 2 }}>{t('secondUnit')}</span>
                    </span>
                  )
                },
              },
              {
                title: t('common:action'),
                key: 'action',
                width: 60,
                align: 'center' as const,
                render: (_, record) => (
                  <Button
                    type="link"
                    size="small"
                    danger
                    
                    style={{ padding: 0, fontSize: 12 }}
                    onClick={() => {
                      setCartItems(prev => prev.filter(item => item.key !== record.key))
                      message.success(t('removed'))
                    }}
                  >
                    {t('remove')}
                  </Button>
                ),
              },
            ]}
          />
        </Card>

        {/* 费用结算 */}
        <Card 
          size="small" 
          title={t('settlementTitle')}
        >
          {/* 推广金余额 */}
          <div style={{ 
            padding: '12px 16px', 
            marginBottom: 12, 
            background: 'linear-gradient(135deg, #E8720C 0%, #F39C12 100%)',
            borderRadius: 6,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}>
            <span style={{ fontSize: 13, color: '#fff', opacity: 0.9 }}>
              {t('promoBalance')}
            </span>
            <span style={{ 
              fontSize: 22, 
              fontWeight: 700, 
              color: '#fff',
            }}>
              ${merchantBalance.toLocaleString()}
            </span>
          </div>

          {/* 多时段折扣汇总 */}
          {(() => {
            const grouped: Record<string, CartItem[]> = {}
            cartItems.forEach(item => {
              if (!grouped[item.date]) grouped[item.date] = []
              grouped[item.date].push(item)
            })
            const totalOriginal = cartItems.reduce((sum, item) => sum + item.originalPrice, 0)
            let totalFinal = 0
            Object.entries(grouped).forEach(([dateStr, items]) => {
              const subtotal = items.reduce((sum, item) => sum + item.salePrice, 0)
              const discount = getDateDiscount(dateStr)
              totalFinal += discount ? Math.round(subtotal * discount.discount / 100) : subtotal
            })
            const totalDiscount = totalOriginal - totalFinal
            return (
              <table style={{ width: '100%', fontSize: 12, marginBottom: 12 }}>
                <thead>
                  <tr style={{ background: '#fafafa' }}>
                    <th style={{ padding: '10px 8px', border: '1px solid #e8e8e8', color: '#595959', fontSize: 12, fontWeight: 600 }}>
                      {t('orderOriginal')}
                    </th>
                    <th style={{ padding: '10px 8px', border: '1px solid #e8e8e8', color: '#fa8c16', fontSize: 12, fontWeight: 600 }}>
                      {t('orderDiscount')}
                    </th>
                    <th style={{ padding: '10px 8px', border: '1px solid #e8e8e8', color: '#ff4d4f', fontSize: 12, fontWeight: 600 }}>
                      {t('totalPayable')}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td style={{ padding: '14px 8px', border: '1px solid #e8e8e8', textAlign: 'center' }}>
                      <span style={{ fontSize: 16, fontWeight: 600, color: '#595959' }}>
                        ${totalOriginal}
                      </span>
                    </td>
                    <td style={{ padding: '14px 8px', border: '1px solid #e8e8e8', textAlign: 'center' }}>
                      <span style={{ fontSize: 16, fontWeight: 600, color: '#fa8c16' }}>
                        -${totalDiscount}
                      </span>
                    </td>
                    <td style={{ padding: '14px 8px', border: '1px solid #e8e8e8', textAlign: 'center', background: '#fff7f7' }}>
                      <span style={{ fontSize: 20, fontWeight: 700, color: '#ff4d4f' }}>
                        ${totalFinal}
                      </span>
                    </td>
                  </tr>
                </tbody>
              </table>
            )
          })()}
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
            {t('payButton')}
          </Button>
        </Card>
      </div>
      </div>
      )}

      {/* 支付确认弹窗 */}
      <Modal
        title={t('confirmOrder')}
        open={isPaymentModalVisible}
        onOk={handleConfirmPayment}
        onCancel={() => setIsPaymentModalVisible(false)}
        okText={t('confirmPay')}
        cancelText={t('common:cancel')}
        okButtonProps={{ style: { background: '#ff4d4f', borderColor: '#ff4d4f' } }}
        width={600}
      >
        <div style={{ marginBottom: 16 }}>
          <h4 style={{ marginBottom: 12, fontSize: 14, color: '#595959' }}>{t('purchaseDetail')}</h4>
          <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#fafafa' }}>
                <th style={{ padding: '8px', border: '1px solid #e8e8e8', textAlign: 'left' }}>{t('cartColDate')}</th>
                <th style={{ padding: '8px', border: '1px solid #e8e8e8', textAlign: 'left' }}>{t('cartColRegion')}</th>
                <th style={{ padding: '8px', border: '1px solid #e8e8e8', textAlign: 'left' }}>{t('cartColSlot')}</th>
                <th style={{ padding: '8px', border: '1px solid #e8e8e8', textAlign: 'right' }}>{t('cartColPrice')}</th>
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

        <div style={{ background: '#fafafa', padding: 16, borderRadius: 8 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
            <span style={{ color: '#595959' }}>{t('orderOriginalFull')}</span>
            <span style={{ fontWeight: 600 }}>${cartItems.reduce((sum, item) => sum + item.originalPrice, 0)}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, color: '#fa8c16' }}>
            <span>{t('orderDiscountMulti')}</span>
            <span style={{ fontWeight: 600 }}>
              {(() => {
                const grouped: Record<string, CartItem[]> = {}
                cartItems.forEach(item => {
                  if (!grouped[item.date]) grouped[item.date] = []
                  grouped[item.date].push(item)
                })
                const totalOriginal = cartItems.reduce((sum, item) => sum + item.originalPrice, 0)
                let totalFinal = 0
                Object.entries(grouped).forEach(([dateStr, items]) => {
                  const subtotal = items.reduce((sum, item) => sum + item.salePrice, 0)
                  const discount = getDateDiscount(dateStr)
                  totalFinal += discount ? Math.round(subtotal * discount.discount / 100) : subtotal
                })
                return `-${totalOriginal - totalFinal}`
              })()}
            </span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 16, color: '#ff4d4f', borderTop: '1px solid #d9d9d9', paddingTop: 8, marginTop: 8 }}>
            <span style={{ fontWeight: 600 }}>{t('actualAmountFull')}</span>
            <span style={{ fontWeight: 700 }}>
              {(() => {
                const grouped: Record<string, CartItem[]> = {}
                cartItems.forEach(item => {
                  if (!grouped[item.date]) grouped[item.date] = []
                  grouped[item.date].push(item)
                })
                let totalFinal = 0
                Object.entries(grouped).forEach(([dateStr, items]) => {
                  const subtotal = items.reduce((sum, item) => sum + item.salePrice, 0)
                  const discount = getDateDiscount(dateStr)
                  totalFinal += discount ? Math.round(subtotal * discount.discount / 100) : subtotal
                })
                return `$${totalFinal}`
              })()}
            </span>
          </div>
        </div>
      </Modal>

      {/* 支付成功弹窗 */}
      <Modal
        title={t('purchaseSuccess')}
        open={isSuccessModalVisible}
        onCancel={() => setIsSuccessModalVisible(false)}
        footer={[
          <Button key="view" type="primary" onClick={handleViewOrder}>
            {t('viewOrder')}
          </Button>,
          <Button key="continue" onClick={handleContinuePurchase} style={{ background: '#fa8c16', borderColor: '#fa8c16', color: '#fff' }}>
            {t('continueBuy')}
          </Button>,
        ]}
        width={400}
      >
        <div style={{ textAlign: 'center', padding: '20px 0' }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>✅</div>
          <p style={{ fontSize: 16, color: '#595959', marginBottom: 24 }}>
            {t('successMessage')}
          </p>
          <div style={{ 
            background: 'linear-gradient(135deg, #fff7e6 0%, #ffe58f 100%)',
            padding: '20px 16px',
            borderRadius: 8,
            marginBottom: 16,
          }}>
            <p style={{ fontSize: 14, color: '#8c8c8c', marginBottom: 8 }}>
              {t('deductedPromo')}
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

      {/* 时段售罄提醒弹窗 */}
      <Modal
        title={
          <Space>
            <span style={{ fontSize: 18 }}>⚠️</span>
            <span style={{ color: '#ff4d4f', fontWeight: 600 }}>{t('partialSoldOut')}</span>
          </Space>
        }
        open={isSoldOutModalVisible}
        onCancel={() => setIsSoldOutModalVisible(false)}
        footer={[
          <Button key="ok" type="primary" onClick={() => setIsSoldOutModalVisible(false)} style={{ background: '#fa8c16', borderColor: '#fa8c16', minWidth: 100 }}>
            {t('gotIt')}
          </Button>
        ]}
        width={460}
      >
        <div style={{ padding: '8px 0' }}>
          <p style={{ fontSize: 14, color: '#262626', marginBottom: 12, lineHeight: 1.6 }}>
            {t('soldOutExplain')}
          </p>
          <div style={{ 
            background: '#fff2f0', border: '1px solid #ffccc7', borderRadius: 8, 
            padding: '12px 16px', marginBottom: 16, maxHeight: 200, overflowY: 'auto',
          }}>
            {soldOutDetails.map((item, idx) => (
              <div key={idx} style={{ 
                display: 'flex', alignItems: 'center', gap: 8, 
                padding: '6px 0', 
                borderBottom: idx < soldOutDetails.length - 1 ? '1px dashed #ffccc7' : 'none',
              }}>
                <span style={{ fontSize: 13, color: '#ff4d4f' }}>✕</span>
                <span style={{ fontSize: 13, color: '#595959' }}>
                  <span style={{ fontWeight: 600, color: '#262626' }}>{item.date}</span>
                  {' · '}
                  <span style={{ color: '#722ed1' }}>{item.regionName}</span>
                  {' · '}
                  <Tag color="orange" style={{ fontSize: 11, margin: 0 }}>{item.mealSlot}</Tag>
                </span>
              </div>
            ))}
          </div>
          <p style={{ fontSize: 13, color: '#ff4d4f', margin: 0, fontWeight: 500 }}>
            {t('lockExpiryWarning', { count: LOCK_DURATION_SECONDS >= 60 ? LOCK_DURATION_SECONDS / 60 : LOCK_DURATION_SECONDS, unit: LOCK_DURATION_SECONDS >= 60 ? '分鐘' : '秒' })}
          </p>
        </div>
      </Modal>

      {/* 預售日期提醒弹窗（火车票式：提示何时開售） */}
      <Modal
        title={
          <Space>
            <span style={{ fontSize: 18 }}>⏳</span>
            <span style={{ color: '#1890ff', fontWeight: 600 }}>{t('notYetOnSale')}</span>
          </Space>
        }
        open={!!presaleInfo}
        onCancel={() => setPresaleInfo(null)}
        footer={[
          <Button key="ok" type="primary" onClick={() => setPresaleInfo(null)} style={{ minWidth: 100 }}>
            {t('gotIt')}
          </Button>,
        ]}
        width={420}
      >
        {presaleInfo && (
          <div style={{ padding: '8px 0' }}>
            <div style={{
              background: '#e6f4ff', border: '1px solid #91caff', borderRadius: 8,
              padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 8,
            }}>
              <span style={{ fontSize: 13, color: '#595959' }}>{t('saleTimeLabel')}</span>
              <span style={{ fontSize: 16, fontWeight: 700, color: '#1890ff' }}>{presaleInfo.openTime}</span>
            </div>
            <p style={{ fontSize: 12, color: '#8c8c8c', marginTop: 12, marginBottom: 0 }}>
              {t('dailyReleaseHint', { hour: PRESALE_OPEN_HOUR })}
            </p>
          </div>
        )}
      </Modal>
    </div>
  )
}
