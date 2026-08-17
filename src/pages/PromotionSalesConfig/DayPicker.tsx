import { useState, useMemo, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Tag, Button, Space, message, Table, Empty, Modal, Select, Card, Form, InputNumber, Alert, Radio } from 'antd'
import {
  ShoppingCartOutlined,
  CalendarOutlined,
  SearchOutlined,
  ReloadOutlined,
} from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import type { InventoryItem } from './types'
import { RECOMMEND_TYPE_CONFIGS } from './types'
import GradientDiscountBanner from './GradientDiscountBanner'
import { AlgorithmType, REGION_LABEL_KEY } from '../Recommend/constants'
import dayjs from 'dayjs'
import type { Dayjs } from 'dayjs'
import {
  fetchAdAlgorithms,
  fetchAdReviveInventory,
  placeAdReviveOrder,
  lockAdReviveCells,
  unlockAdReviveCells,
  type AdReviveInventoryVO,
  type AdReviveInventoryCell,
} from '../../api/adPromotion'
import { fetchStores, type StoreItem } from '../../api/store'
import { fetchFinAccounts } from '../../api/finance'
import { fetchGiftAvailableDays } from '../../api/gift'
import { usePaymentRule } from '../../hooks/usePaymentRule'
import { getSystemRuleValue } from '../../hooks/useSystemRules'

/** 赠送管理中盘活复苏的广告类型标识（与后端一致） */
const GIFT_AD_TYPE = 'revival'

/** 后端品牌 → 前端品牌值（flashBee=閃蜂 mFood=mFood） */
const BACKEND_TO_UI_BRAND: Record<string, string> = { flashBee: 'shanfeng', mFood: 'mfood' }
/** 前端品牌值 → 后端品牌 */
const UI_TO_BACKEND_BRAND: Record<string, string> = { shanfeng: 'flashBee', mfood: 'mFood' }

// WEEKDAY_LABELS 移入組件內部以使用 t() 翻譯

/** 可售天数兜底（真实数据以定价预售天数为准） */
const DEFAULT_SELLABLE_DAYS = 180
/** 月份选择器每页展示数（超出用上下页按钮切换） */
const MONTHS_PER_PAGE = 6
/** 开售时间（火车票式，每日该时点放出新一天的可购买日期） */
const PRESALE_OPEN_HOUR = 10
/** 加购锁定时长（秒），从规则配置动态读取 */
const DEFAULT_LOCK_SECONDS = 60

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

/** 解析定价配置的多天梯度折扣 JSON（后端 discount=95 表示 95 折） */
function parseDayTiers(json?: string): Array<{ minDays: number; discount: number }> {
  if (!json) return []
  try {
    const arr = JSON.parse(json)
    if (!Array.isArray(arr)) return []
    return (arr as Array<{ minDays?: number; discount?: number }>)
      .filter(t => t && Number(t.minDays) > 0 && Number(t.discount) > 0)
      .map(t => ({ minDays: Number(t.minDays), discount: Number(t.discount) }))
      .sort((a, b) => a.minDays - b.minDays)
  } catch {
    return []
  }
}

/** 购物车项（一次加购批次） */
interface CartItem {
  key: string
  dates: string[]
  days: number
  originalPrice: number
  discount: number
  salePrice: number
  lockTime: number
}

/** 购物车展平行 */
interface CartRow {
  key: string
  date: string
  cartKey: string
  salePrice: number
  lockTime: number
}

interface DayPickerProps {
  inventoryItem: InventoryItem
}

export default function DayPicker({ inventoryItem }: DayPickerProps) {
  const { t } = useTranslation('adSales')
  const WEEKDAY_LABELS = t('weekdayShort', { returnObjects: true }) as string[]
  const navigate = useNavigate()
  // 从规则配置动态读取锁定时长
  const LOCK_SECONDS = getSystemRuleValue<number>('ad_click_cart_lock_seconds') || DEFAULT_LOCK_SECONDS
  const [selectedDates, setSelectedDates] = useState<string[]>([])
  const [currentMonth, setCurrentMonth] = useState<Dayjs>(dayjs())
  const [hoveredMonth, setHoveredMonth] = useState<string | null>(null)
  const [monthPage, setMonthPage] = useState(0)
  const [cartItems, setCartItems] = useState<CartItem[]>([])
  // 推广金余额（真实账户，按集团+品牌查询）
  const [merchantBalance, setMerchantBalance] = useState<number | null>(null)
  // 贈送天數抵扣：贈送管理發放的真實天數餘額與本單使用天數
  const [giftDaysBalance, setGiftDaysBalance] = useState(0)
  const [giftDaysUsed, setGiftDaysUsed] = useState(0)
  // 支付成功彈窗展示的實付金額
  const [paidAmount, setPaidAmount] = useState(0)
  const [isPaymentModalVisible, setIsPaymentModalVisible] = useState(false)
  const [isSuccessModalVisible, setIsSuccessModalVisible] = useState(false)
  const [currentTime, setCurrentTime] = useState(Date.now())
  // 待开售日期提醒弹窗
  const [presaleInfo, setPresaleInfo] = useState<{ date: string; weekday: string; openTime: string } | null>(null)
  const [paying, setPaying] = useState(false)
  const [locking, setLocking] = useState(false)
  // 支付規則（是否支持混合支付）
  const { mixedPayment } = usePaymentRule(GIFT_AD_TYPE)
  // 非混合支付時的選擇模式：'promo' = 推廣金支付, 'gift' = 贈送天數抵扣
  const [paymentMode, setPaymentMode] = useState<'promo' | 'gift'>('promo')

  // 查询条件状态
  const [searchBrand, setSearchBrand] = useState<string | null>(null)
  const [searchAlgorithm, setSearchAlgorithm] = useState<string | null>(null)
  const [searchStoreName, setSearchStoreName] = useState<string | null>(null)
  const [searchBD, setSearchBD] = useState<string | null>(null)
  const [hasSearched, setHasSearched] = useState(false)
  const [isConflictModalVisible, setIsConflictModalVisible] = useState(false)
  const [pendingAction, setPendingAction] = useState<(() => void) | null>(null)

  // ===== 真实接口接线 =====
  // 算法下拉（盘活复苏加载真实算法库数据，value=算法ID）
  const [algorithmOptions, setAlgorithmOptions] = useState<Array<{ label: string; value: string }>>([])
  const [_algorithmBrandOverrides, setAlgorithmBrandOverrides] = useState<Record<string, string>>({})
  // 门店下拉（真实门店，value=storeCode）
  const [storeOptions, setStoreOptions] = useState<Array<{ label: string; value: string }>>([])
  const [storeMap, setStoreMap] = useState<Record<string, StoreItem>>({})
  const [bdOptions, setBdOptions] = useState<Array<{ label: string; value: string }>>([])
  // 真实库存（查询后加载：日期售罄状态 + 预售窗口 + 折扣梯度 + 退款开关）
  const [inventoryData, setInventoryData] = useState<AdReviveInventoryVO | null>(null)

  // 可售天数：真实库存以预售天数为准，否则兜底 180 天
  const sellableDays = inventoryData ? inventoryData.presaleDays : DEFAULT_SELLABLE_DAYS
  // 多天梯度折扣（来自定价配置）
  const dayTiers = useMemo(() => parseDayTiers(inventoryData?.discountTiers), [inventoryData])
  // 退款开关（来自定价配置）
  const currentAlgorithmRefundEnabled = inventoryData ? inventoryData.refundEnabled === 1 : null

  // 商圈跟随门店：购买商圈 = 所选门店的所在区域（门店管理配置），不可手动选择
  const selectedStore = searchStoreName ? storeMap[searchStoreName] : undefined
  const storeRegion = selectedStore?.region ?? null

  // 真实格子索引：date → 格子（门店所在商圈）
  const realCellMap = useMemo(() => {
    const map: Record<string, AdReviveInventoryCell> = {}
    if (storeRegion == null) return map
    inventoryData?.cells
      .filter(c => c.region === storeRegion)
      .forEach(c => { map[c.bizDate] = c })
    return map
  }, [inventoryData, storeRegion])
  const getRealCell = (dateStr: string) => realCellMap[dateStr]

  // 当前商圈名称（跟随门店所在区域）
  const regionLabel = storeRegion != null
    ? (REGION_LABEL_KEY[storeRegion] ? t(`translation:${REGION_LABEL_KEY[storeRegion]}`) : '')
    : ''
  // 定价未覆盖门店所在商圈（查询后无可购格子）
  const regionNotConfigured = hasSearched && storeRegion != null
    && (inventoryData?.cells ?? []).length > 0
    && !(inventoryData?.cells ?? []).some(c => c.region === storeRegion)
  // 商圈不可购（门店未配置所在区域 / 定价未覆盖）：仅展示提醒，
  // 隐藏折扣横幅与购买日历，避免展示无关价格信息造成误导
  const regionBlocked = hasSearched && (storeRegion == null || regionNotConfigured)

  // 检查购物车是否有加购数据
  const hasCartItems = cartItems.length > 0

  // 初始化：加载门店下拉（真实门店，含集团编码与BD）
  useEffect(() => {
    fetchStores({ page: 1, size: 100 }).then(res => {
      const map: Record<string, StoreItem> = {}
      const options = res.records.map(s => {
        map[s.storeCode] = s
        return { label: `${s.storeName}（ID：${s.storeCode}）`, value: s.storeCode }
      })
      setStoreOptions(options)
      setStoreMap(map)
    }).catch(() => {})
  }, [])

  // 真实算法下拉：按品牌过滤，选择门店后进一步过滤
  useEffect(() => {
    if (!searchBrand) {
      setAlgorithmOptions([])
      setAlgorithmBrandOverrides({})
      return
    }
    const backendBrand = UI_TO_BACKEND_BRAND[searchBrand]
    fetchAdAlgorithms({ page: 1, size: 200, algoType: AlgorithmType.HOT_REVIVE_AD, brand: backendBrand, status: 1, hasPricing: true, storeCode: searchStoreName || undefined })
      .then(res => {
        if (!res) return
        const brandOverrides: Record<string, string> = {}
        const records = res.records.filter(a => a.updatedBy !== '系統')
        const options = records.map(a => {
          const value = String(a.id)
          const uiBrand = BACKEND_TO_UI_BRAND[a.brand || '']
          if (uiBrand) brandOverrides[value] = uiBrand
          return { label: a.algoName, value }
        })
        setAlgorithmOptions(options)
        setAlgorithmBrandOverrides(brandOverrides)
        if (searchAlgorithm && !options.some(o => o.value === searchAlgorithm)) {
          setSearchAlgorithm(null)
          message.warning(t('currentAlgorithmBlocked'))
        }
      }).catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchBrand, searchStoreName])

  // 贈送天數餘額：按門店查詢真實餘額，切換門店時刷新並清零已選抵扣天數
  useEffect(() => {
    if (!searchStoreName || !storeMap[searchStoreName]) {
      setGiftDaysBalance(0)
      setGiftDaysUsed(0)
      return
    }
    const store = storeMap[searchStoreName]
    fetchGiftAvailableDays(store.id, GIFT_AD_TYPE).then(setGiftDaysBalance).catch(() => setGiftDaysBalance(0))
    setGiftDaysUsed(0)
  }, [searchStoreName, storeMap, hasSearched])

  // 算法名称变更处理：自动带出品牌，并检查购物车冲突
  // 品牌变更处理：清空已选算法
  const handleBrandChange = (value: string | null) => {
    setSearchBrand(value)
    setSearchAlgorithm(null)
    setAlgorithmOptions([])
  }

  // 算法名称变更处理（品牌已由用户预先选择）
  const handleAlgorithmChange = (value: string | null) => {
    const apply = () => {
      setSearchAlgorithm(value)
    }
    if (hasCartItems && value !== searchAlgorithm) {
      setPendingAction(apply)
      setIsConflictModalVisible(true)
      return
    }
    apply()
  }

  // 门店名称变更处理：自动带出BD，并检查购物车冲突
  const handleStoreChange = (value: string | null) => {
    const apply = () => {
      setSearchStoreName(value)
      const store = value ? storeMap[value] : undefined
      const bds = (store?.bdList ?? []).map(b => ({ label: b.bdName || b.bdEmpId, value: b.bdEmpId }))
      setBdOptions(bds)
      setSearchBD(bds[0]?.value ?? null)
    }
    if (hasCartItems && value !== searchStoreName) {
      setPendingAction(apply)
      setIsConflictModalVisible(true)
      return
    }
    apply()
  }

  // 确认切换（清空已选）
  const handleConfirmSwitch = () => {
    setIsConflictModalVisible(false)
    if (pendingAction) {
      pendingAction()
      setPendingAction(null)
    }
    setCartItems([])
    setSelectedDates([])
    setHasSearched(false)
    setInventoryData(null)
    message.success(t('clearedReselect'))
  }

  // 取消切换
  const handleCancelSwitch = () => {
    setIsConflictModalVisible(false)
    setPendingAction(null)
  }

  // 查询：必须选择算法名称、品牌、门店名称，加载真实库存
  const handleSearch = () => {
    if (!searchAlgorithm) { message.warning(t('selectAlgorithm')); return }
    if (!searchBrand) { message.warning(t('selectBrand')); return }
    if (!searchStoreName) { message.warning(t('selectStore')); return }
    const store = storeMap[searchStoreName]
    // 商圈跟随门店：门店未配置所在区域时拦截并提醒
    if (store && !store.region) {
      message.warning(t('storeNoRegion'))
      return
    }
    const algoId = Number(searchAlgorithm)
    fetchAdReviveInventory(algoId, store?.storeCode, store?.groupCode)
      .then(inv => {
        setInventoryData(inv)
        setHasSearched(true)
        setCurrentMonth(dayjs())
        setSelectedDates([])
        setCartItems([])
        // 定价未覆盖门店所在商圈：不再弹 toast，页面仅展示提醒卡片（regionBlocked 分支），避免重复与无关信息展示
        // 推广金余额（集团+品牌）
        const backendBrand = UI_TO_BACKEND_BRAND[searchBrand] || searchBrand
        fetchFinAccounts({ groupId: store?.groupCode, brand: backendBrand, page: 1, size: 10 })
          .then(res => {
            const acc = (res.records ?? [])[0]
            setMerchantBalance(acc ? Number(acc.virtualBalance) : null)
          }).catch(() => setMerchantBalance(null))
      })
      .catch(err => message.error(err instanceof Error ? err.message : t('inventoryQueryFailed')))
  }

  // 重置查询条件
  const handleReset = () => {
    setSearchBrand(null); setSearchAlgorithm(null)
    setSearchStoreName(null); setSearchBD(null)
    setHasSearched(false)
    setInventoryData(null)
    setCartItems([])
    setSelectedDates([])
    setAlgorithmOptions([])
  }

  // 倒计时：每秒更新当前时间
  useEffect(() => {
    const timer = setInterval(() => { setCurrentTime(Date.now()) }, 1000)
    return () => clearInterval(timer)
  }, [])

  // 自动释放过期锁定（60秒后）
  useEffect(() => {
    const expiredItems = cartItems.filter(item => currentTime - item.lockTime >= LOCK_SECONDS * 1000)
    if (expiredItems.length > 0) {
      setCartItems(prev => prev.filter(item => currentTime - item.lockTime < LOCK_SECONDS * 1000))
      expiredItems.forEach(item => {
        message.info(t('lockExpiredBatch', { days: item.dates.length }))
      })
    }
  }, [currentTime, cartItems])

  // 可售月份范围（今天起预售窗口，补齐至整页）
  const months = useMemo(() => {
    const startDate = dayjs()
    const endDate = dayjs().add(sellableDays - 1, 'day')
    const result: Dayjs[] = []
    let current = startDate.startOf('month')
    while (current.isBefore(endDate) || current.isSame(endDate, 'month')) {
      result.push(current)
      current = current.add(1, 'month')
    }
    while (result.length % MONTHS_PER_PAGE !== 0) {
      result.push(current)
      current = current.add(1, 'month')
    }
    return result
  }, [sellableDays])

  // 月份分页：每页 6 个，超出用上下页按钮切换
  const monthPageCount = Math.ceil(months.length / MONTHS_PER_PAGE)
  const visibleMonths = months.slice(monthPage * MONTHS_PER_PAGE, (monthPage + 1) * MONTHS_PER_PAGE)

  // 生成当前月份的日历网格
  const calendarGrid = useMemo(() => {
    const year = currentMonth.year()
    const month = currentMonth.month()
    const firstDay = dayjs(new Date(year, month, 1))
    const lastDay = dayjs(new Date(year, month + 1, 0))
    const firstDayOfWeek = firstDay.day()
    const daysInMonth = lastDay.date()

    const weeks: (Dayjs | null)[][] = []
    let currentWeek: (Dayjs | null)[] = []

    for (let i = 0; i < firstDayOfWeek; i++) { currentWeek.push(null) }
    for (let day = 1; day <= daysInMonth; day++) {
      const date = dayjs(new Date(year, month, day))
      currentWeek.push(date)
      if (currentWeek.length === 7) { weeks.push(currentWeek); currentWeek = [] }
    }
    if (currentWeek.length > 0) {
      while (currentWeek.length < 7) { currentWeek.push(null) }
      weeks.push(currentWeek)
    }
    return weeks
  }, [currentMonth])

  // 日期状态：以真实库存为准（未查询或无格子数据 → 不可售）
  const isDateSoldOut = (date: Dayjs | null) => {
    if (!date) return false
    const cell = getRealCell(date.format('YYYY-MM-DD'))
    return !!cell && cell.remaining <= 0
  }

  const isDateUnavailable = (date: Dayjs | null) => {
    if (!date) return false
    if (!hasSearched || !inventoryData) return true
    const dateStr = date.format('YYYY-MM-DD')
    const cell = getRealCell(dateStr)
    if (!cell) return true
    // 过去日期不可售
    return date.isBefore(dayjs(), 'day')
  }

  // 判断日期是否已在购物车锁定
  const isDateLocked = (dateStr: string) => {
    return cartItems.some(item => item.dates.includes(dateStr))
  }

  // 获取锁定项的倒计时
  const getLockedRemaining = (dateStr: string) => {
    const item = cartItems.find(it => it.dates.includes(dateStr))
    if (!item) return 0
    return Math.max(0, LOCK_SECONDS - Math.floor((currentTime - item.lockTime) / 1000))
  }

  // 计算当前折扣（按已选天数匹配梯度）
  const currentDiscount = useMemo(() => {
    const days = selectedDates.length
    let matched: { minDays: number; discount: number } | null = null
    for (const tier of dayTiers) {
      if (days >= tier.minDays) matched = tier
    }
    return matched
  }, [selectedDates, dayTiers])

  // 计算待加购总价（真实日单价按日期取）
  const pendingPrice = useMemo(() => {
    if (selectedDates.length === 0) return 0
    const basePrice = selectedDates.reduce((sum, d) => sum + (getRealCell(d)?.dailyPrice ?? 0), 0)
    if (currentDiscount) return Math.round(basePrice * currentDiscount.discount / 100)
    return basePrice
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDates, currentDiscount, realCellMap])

  // 购物车汇总
  const cartSummary = useMemo(() => {
    const totalOriginal = cartItems.reduce((sum, item) => sum + item.originalPrice, 0)
    const totalSale = cartItems.reduce((sum, item) => sum + item.salePrice, 0)
    const totalDays = cartItems.reduce((sum, item) => sum + item.days, 0)
    return { totalOriginal, totalSale, totalDays, totalDiscount: totalOriginal - totalSale }
  }, [cartItems])

  // 贈送天數抵扣：本單最多可用 = min(贈送餘額, 購物車總天數)；抵扣金額按折後日均價計算
  const maxGiftDaysUsable = Math.min(giftDaysBalance, cartSummary.totalDays)
  // 非混合支付選擇贈送天數抵扣時自動全部抵扣（無需用戶操作）；混合支付時才允許用戶手動選擇抵扣天數
  const effectiveGiftDays = !mixedPayment && paymentMode === 'gift'
    ? maxGiftDaysUsable
    : Math.min(giftDaysUsed, maxGiftDaysUsable)
  const giftDeduction = useMemo(() => {
    // 非混合支付且選擇推廣金模式時，不使用贈送天數抵扣
    if (!mixedPayment && paymentMode === 'promo') return 0
    if (effectiveGiftDays <= 0 || cartSummary.totalDays === 0) return 0
    return Math.min(cartSummary.totalSale, Math.round(cartSummary.totalSale / cartSummary.totalDays * effectiveGiftDays))
  }, [effectiveGiftDays, cartSummary, mixedPayment, paymentMode])
  const payableAmount = cartSummary.totalSale - giftDeduction

  // 按月分组已选日期
  const datesByMonth = useMemo(() => {
    const grouped: Record<string, number[]> = {}
    selectedDates.forEach(dateStr => {
      const date = dayjs(dateStr)
      const monthKey = date.format('YYYY-MM')
      const day = date.date()
      if (!grouped[monthKey]) grouped[monthKey] = []
      grouped[monthKey].push(day)
    })
    return Object.entries(grouped)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, days]) => ({ month, days: days.sort((a, b) => a - b) }))
  }, [selectedDates])

  // 切换日期选择
  const handleDateClick = (date: Dayjs | null) => {
    if (!date) return
    if (isPresaleDate(date, sellableDays)) {
      setPresaleInfo({
        date: date.format('YYYY-MM-DD'),
        weekday: WEEKDAY_LABELS[date.day()],
        openTime: getPresaleOpenTime(date, sellableDays).format(t('presaleDateFormat')),
      })
      return
    }
    if (isDateUnavailable(date)) { message.warning(t('dateUnavailable')); return }
    if (isDateSoldOut(date)) { message.warning(t('dateSoldOut')); return }
    if (isDateLocked(date.format('YYYY-MM-DD'))) { message.info(t('dateLocked')); return }
    const dateStr = date.format('YYYY-MM-DD')
    if (selectedDates.includes(dateStr)) { setSelectedDates(selectedDates.filter(d => d !== dateStr)) }
    else { setSelectedDates([...selectedDates, dateStr].sort()) }
  }

  // 加购（真实锁定 60 秒）
  const handleAddToCart = async () => {
    if (selectedDates.length === 0) { message.warning(t('selectPurchaseDate')); return }
    if (!searchAlgorithm || !searchStoreName) { message.warning(t('completeQueryFirst')); return }
    if (storeRegion == null) { message.warning(t('storeNoRegionCannotAdd')); return }
    const store = storeMap[searchStoreName]
    const algoId = Number(searchAlgorithm)
    const cells = selectedDates.map(d => ({ bizDate: d, region: storeRegion }))

    setLocking(true)
    try {
      await lockAdReviveCells({
        algoId,
        groupCode: store?.groupCode || '',
        storeCode: store?.storeCode,
        cells,
      })
    } catch (err) {
      message.error(err instanceof Error ? err.message : t('lockFailed'))
      // 锁定失败后刷新库存，同步售罄状态
      fetchAdReviveInventory(algoId, store?.storeCode, store?.groupCode).then(setInventoryData).catch(() => {})
      setLocking(false)
      return
    }
    setLocking(false)

    const days = selectedDates.length
    const basePrice = selectedDates.reduce((sum, d) => sum + (getRealCell(d)?.dailyPrice ?? 0), 0)
    const discount = currentDiscount?.discount ?? 100
    const salePrice = Math.round(basePrice * discount / 100)
    const newItem: CartItem = {
      key: `cart-${Date.now()}`,
      dates: [...selectedDates],
      days, originalPrice: basePrice, discount, salePrice,
      lockTime: Date.now(),
    }
    setCartItems(prev => [...prev, newItem])
    setSelectedDates([])
  }

  // 切换月份（整月待开售时弹窗提示开售时间）
  const handleMonthChange = (month: Dayjs) => {
    const firstDay = month.startOf('month')
    if (isPresaleDate(firstDay, sellableDays)) {
      setPresaleInfo({
        date: firstDay.format('YYYY-MM-DD'),
        weekday: WEEKDAY_LABELS[firstDay.day()],
        openTime: getPresaleOpenTime(firstDay, sellableDays).format(t('presaleDateFormat')),
      })
      return
    }
    setCurrentMonth(month)
  }

  // 获取单元格样式
  const getCellStyle = (date: Dayjs | null) => {
    if (!date) return { background: '#fafafa', cursor: 'default', border: '1px solid #e8e8e8' }
    if (isPresaleDate(date, sellableDays)) return { background: '#fafafa', cursor: 'pointer', border: '1px dashed #d9d9d9', color: '#bfbfbf' }
    const dateStr = date.format('YYYY-MM-DD')
    const isSelected = selectedDates.includes(dateStr)
    const isSoldOut = isDateSoldOut(date)
    const isUnavailable = isDateUnavailable(date)
    const inCart = isDateLocked(dateStr)
    if (inCart) return { background: '#f9f0ff', cursor: 'not-allowed', border: '1px solid #d3adf7', color: '#722ed1' }
    if (isSoldOut) return { background: '#fff2f0', cursor: 'not-allowed', border: '1px solid #ffccc7', color: '#ff4d4f' }
    if (isUnavailable) return { background: '#f5f5f5', cursor: 'not-allowed', border: '1px solid #d9d9d9', color: '#8c8c8c' }
    if (isSelected) return { background: '#f6ffed', cursor: 'pointer', border: '2px solid #52c41a', color: '#52c41a', fontWeight: 600 }
    return { background: '#fff', cursor: 'pointer', border: '1px solid #e8e8e8', color: '#333' }
  }

  const handlePayment = () => {
    if (cartItems.length === 0) return
    // 校驗餘額是否充足
    if (!mixedPayment && paymentMode === 'promo') {
      if (cartSummary.totalSale > (merchantBalance ?? 0)) {
        message.error('推廣金餘額不足，請充值後再試')
        return
      }
    } else if (!mixedPayment && paymentMode === 'gift') {
      if (giftDaysBalance < cartSummary.totalDays) {
        message.error('贈送天數餘額不足，無法抵扣')
        return
      }
    } else if (mixedPayment) {
      if (payableAmount > (merchantBalance ?? 0)) {
        message.error('推廣金餘額不足，請充值後再試')
        return
      }
    }
    setIsPaymentModalVisible(true)
  }

  // 确认支付：真实下单（推广金扣款 + 赠送天数抵扣）
  const handleConfirmPayment = async () => {
    if (!searchAlgorithm || !searchStoreName) return
    if (storeRegion == null) { message.warning(t('storeNoRegionCannotOrder')); return }
    const store = storeMap[searchStoreName]
    const algoId = Number(searchAlgorithm)
    const cells = cartItems.flatMap(item => item.dates.map(d => ({ bizDate: d, region: storeRegion })))
    setPaying(true)
    try {
      await placeAdReviveOrder({
        algoId,
        groupCode: store?.groupCode || '',
        storeCode: store?.storeCode,
        bdEmpId: searchBD || undefined,
        giftDays: effectiveGiftDays > 0 ? effectiveGiftDays : undefined,
        cells,
      })
      setPaidAmount(payableAmount)
      setGiftDaysUsed(0)
      setIsPaymentModalVisible(false)
      setCartItems([])
      setIsSuccessModalVisible(true)
      // 刷新库存与余额
      fetchAdReviveInventory(algoId, store?.storeCode, store?.groupCode).then(setInventoryData).catch(() => {})
      if (store) {
        fetchFinAccounts({ groupId: store.groupCode, brand: UI_TO_BACKEND_BRAND[searchBrand || ''] || searchBrand || undefined, page: 1, size: 10 })
          .then(res => {
            const acc = (res.records ?? [])[0]
            setMerchantBalance(acc ? Number(acc.virtualBalance) : null)
          }).catch(() => {})
        fetchGiftAvailableDays(store.id, GIFT_AD_TYPE).then(setGiftDaysBalance).catch(() => {})
      }
    } catch (err) {
      message.error(err instanceof Error ? err.message : t('orderFailed'))
      fetchAdReviveInventory(algoId, store?.storeCode, store?.groupCode).then(setInventoryData).catch(() => {})
    } finally {
      setPaying(false)
    }
  }

  const handleViewOrder = () => {
    setIsSuccessModalVisible(false)
    const typeName = RECOMMEND_TYPE_CONFIGS.find(c => c.type === inventoryItem.algorithmType)?.name || ''
    navigate(`/promotion-order-manage?type=${encodeURIComponent(typeName)}&from=ad-sales`)
  }
  const handleContinuePurchase = () => { setIsSuccessModalVisible(false); message.success(t('continueBuy')) }

  // 移除购物车日期（真实解锁）
  const handleRemoveCartDate = (cartKey: string, date: string) => {
    const item = cartItems.find(i => i.key === cartKey)
    setCartItems(prev => prev.map(it => {
      if (it.key === cartKey) {
        const newDates = it.dates.filter(d => d !== date)
        if (newDates.length === 0) return null as unknown as CartItem
        return { ...it, dates: newDates, days: newDates.length }
      }
      return it
    }).filter(Boolean))
    message.success(t('common:remove'))
    if (item && searchAlgorithm && searchStoreName && storeRegion != null) {
      const store = storeMap[searchStoreName]
      unlockAdReviveCells({
        algoId: Number(searchAlgorithm),
        groupCode: store?.groupCode || '',
        storeCode: store?.storeCode,
        cells: [{ bizDate: date, region: storeRegion }],
      }).catch(() => {})
      // 剩余日期重新续锁（保持 60 秒倒计时）
      const remaining = item.dates.filter(d => d !== date)
      if (remaining.length > 0) {
        lockAdReviveCells({
          algoId: Number(searchAlgorithm),
          groupCode: store?.groupCode || '',
          storeCode: store?.storeCode,
          cells: remaining.map(d => ({ bizDate: d, region: storeRegion })),
        }).catch(() => {})
      }
    }
  }

  return (
    <div>
      {/* 查询区域 - 始终显示 */}
      <div className="search-section" style={{ marginBottom: 16 }}>
          <Form layout="inline" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px 12px' }}>
            <Form.Item label={t('brandLabel')}>
              <Select placeholder={t('brandAutoHint')} value={searchBrand} onChange={handleBrandChange} allowClear
                options={[{ label: t('flashBee'), value: 'shanfeng' }, { label: 'mFood', value: 'mfood' }]} />
            </Form.Item>
            <Form.Item label={t('algoNameLabel')}>
              <Select placeholder={searchBrand ? t('dpAlgoPlaceholder') : t('selectBrandFirst')} value={searchAlgorithm} onChange={handleAlgorithmChange} allowClear showSearch optionFilterProp="label"
                options={algorithmOptions} disabled={!searchBrand} />
            </Form.Item>
            <Form.Item label={t('storeNameLabel')}>
              <Select placeholder={t('storeSearchHint')} value={searchStoreName} onChange={handleStoreChange} allowClear showSearch optionFilterProp="label" options={storeOptions} />
            </Form.Item>
            <Form.Item label={t('bdLabel')}>
              <Select placeholder={t('bdAutoHint')} value={searchBD} onChange={(v) => setSearchBD(v)} allowClear showSearch
                filterOption={(input, option) => { const keyword = input.toLowerCase(); const label = (option?.label ?? '').toString().toLowerCase(); return label.includes(keyword) }}
                options={bdOptions} />
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
            {t('dpSwitchWarnLine2')}
          </p>
          <ul style={{ margin: '8px 0 0', paddingLeft: 20, fontSize: 13, color: '#595959' }}>
            <li>{t('dpSwitchOption1')}</li>
            <li>{t('dpSwitchOption2')}</li>
          </ul>
        </div>
      </Modal>

      {!hasSearched ? (
        <Card bodyStyle={{ padding: '48px 24px' }}>
          <Empty description={t('searchFirstHint')} image={Empty.PRESENTED_IMAGE_SIMPLE} />
        </Card>
      ) : regionBlocked ? (
        // 商圈不可购：仅展示提醒，不展示折扣规则与购买日历，避免信息误导
        <Card bodyStyle={{ padding: '48px 24px' }}>
          <Alert
            type="warning"
            showIcon
            style={{ maxWidth: 680, margin: '0 auto' }}
            message={storeRegion == null
              ? t('storeRegionNotConfigured')
              : t('pricingNotConfigured', { region: regionLabel })}
            description={storeRegion == null
              ? t('storeRegionHint')
              : t('noInventoryInRegion')}
          />
        </Card>
      ) : (
      <>
      {/* 梯度折扣横幅：展示定价配置的多天折扣规则与退款警示 */}
      <GradientDiscountBanner
        tiers={dayTiers.map(g => ({ threshold: g.minDays, discount: g.discount }))}
        unitLabel={t('unitDay')}
        currentCount={selectedDates.length + cartSummary.totalDays}
        refundDisabled={currentAlgorithmRefundEnabled === false}
      />
      <div style={{ display: 'flex', gap: 16 }}>
        {/* 左侧：月份选择 + 日历 */}
        <div style={{ flex: 1 }}>
        {/* 当前商圈提示（跟随门店所在区域，不可手动选择） */}
        <div style={{ marginBottom: 12, fontSize: 13, color: '#595959' }}>
          {t('currentRegion')}<Tag color="orange">{regionLabel}</Tag>
          <span style={{ fontSize: 12, color: '#8c8c8c' }}>{t('sellByDayRegion')}</span>
        </div>
        {/* 月份横向选择器 */}
        <Card title={<Space><CalendarOutlined /><span>{t('selectMonth')}</span></Space>} style={{ marginBottom: 16 }} bodyStyle={{ padding: '12px 20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Button
              size="small"
              disabled={monthPage === 0}
              onClick={() => setMonthPage(prev => Math.max(0, prev - 1))}
            >
              ◀
            </Button>
            <div style={{ flex: 1, display: 'flex', gap: 4 }}>
            {visibleMonths.map(month => {
              const monthStr = month.format('YYYY-MM')
              const isSelected = currentMonth.format('YYYY-MM') === monthStr
              const isHovered = hoveredMonth === monthStr
              const hasSelectedDates = datesByMonth.some(g => g.month === monthStr)
              // 整月待开售：月初首日即超出可售窗口
              const monthPresale = isPresaleDate(month.startOf('month'), sellableDays)
              return (
                <div
                  key={monthStr}
                  onClick={() => handleMonthChange(month)}
                  onMouseEnter={() => setHoveredMonth(monthStr)}
                  onMouseLeave={() => setHoveredMonth(null)}
                  style={{
                    flex: 1, padding: '8px 4px', borderRadius: 6, position: 'relative',
                    border: monthPresale
                      ? '1px dashed #d9d9d9'
                      : isSelected ? '2px solid #fa8c16' : isHovered ? '2px solid #fa8c16' : '1px solid #e8e8e8',
                    background: monthPresale
                      ? '#fafafa'
                      : isSelected ? '#fff7e6' : isHovered ? '#fff7e6' : '#fff',
                    cursor: 'pointer', textAlign: 'center', transition: 'all 0.2s', whiteSpace: 'nowrap', overflow: 'hidden',
                  }}
                >
                  <span style={{ fontSize: 15, fontWeight: !monthPresale && (isSelected || isHovered) ? 700 : 500, color: monthPresale ? '#bfbfbf' : isSelected || isHovered ? '#fa8c16' : '#333' }}>
                    {month.year() === dayjs().year() ? month.format(t('monthFormat')) : month.format(t('yearMonthFormat'))}
                  </span>
                  {monthPresale && (
                    <span style={{ fontSize: 11, color: '#8c8c8c', marginLeft: 4, border: '1px solid #d9d9d9', borderRadius: 3, padding: '0 3px', background: '#f5f5f5' }}>{t('presaleTag')}</span>
                  )}
                  {hasSelectedDates && (
                    <div style={{
                      position: 'absolute', top: 3, right: 3,
                      width: 8, height: 8, borderRadius: '50%',
                      background: '#ff4d4f',
                      animation: 'dotPulse 1.5s ease-in-out infinite',
                    }} />
                  )}
                </div>
              )
            })}
            </div>
            <Button
              size="small"
              disabled={monthPage >= monthPageCount - 1}
              onClick={() => setMonthPage(prev => Math.min(monthPageCount - 1, prev + 1))}
            >
              ▶
            </Button>
          </div>
        </Card>

        {/* 日历网格 */}
        <div style={{ border: '1px solid #e8e8e8', borderRadius: 8, overflow: 'hidden' }}>
          {/* 星期表头 */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', background: '#f5f5f5', borderBottom: '1px solid #e8e8e8' }}>
            {WEEKDAY_LABELS.map((label, index) => (
              <div key={label} style={{ padding: '10px 8px', textAlign: 'center', fontWeight: 600, fontSize: 13, color: index === 0 || index === 6 ? '#fa541c' : '#333', borderRight: index < 6 ? '1px solid #e8e8e8' : 'none' }}>
                {label}
              </div>
            ))}
          </div>
          {/* 日期网格 */}
          {calendarGrid.map((week, weekIndex) => (
            <div key={weekIndex} style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', borderBottom: weekIndex < calendarGrid.length - 1 ? '1px solid #e8e8e8' : 'none' }}>
              {week.map((date, dayIndex) => {
                const cellStyle = getCellStyle(date)
                const isSelected = date ? selectedDates.includes(date.format('YYYY-MM-DD')) : false
                const isToday = date?.isSame(dayjs(), 'day')
                const inCart = date ? isDateLocked(date.format('YYYY-MM-DD')) : false
                const remaining = date ? getLockedRemaining(date.format('YYYY-MM-DD')) : 0
                const presale = date ? isPresaleDate(date, sellableDays) : false
                const realCell = date ? getRealCell(date.format('YYYY-MM-DD')) : undefined
                return (
                  <div key={`${weekIndex}-${dayIndex}`} onClick={() => handleDateClick(date)}
                    style={{ padding: '8px 6px', textAlign: 'center', minHeight: 56, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', borderRight: dayIndex < 6 ? '1px solid #e8e8e8' : 'none', ...cellStyle, transition: 'all 0.2s' }}>
                    {date ? (
                      <>
                        <div style={{ fontSize: 14, fontWeight: isSelected ? 700 : (isToday ? 600 : 400), position: 'relative' }}>
                          {date.date()}
                          {isToday && !isSelected && <span style={{ position: 'absolute', bottom: -2, left: '50%', transform: 'translateX(-50%)', width: 4, height: 4, borderRadius: '50%', background: '#1890ff' }} />}
                        </div>
                        {presale && (
                          <span style={{ fontSize: 10, color: '#8c8c8c', marginTop: 2, border: '1px solid #d9d9d9', borderRadius: 3, padding: '0 3px', background: '#f5f5f5' }}>{t('presaleTag')}</span>
                        )}
                        {!presale && inCart && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 2, marginTop: 1 }}>
                            <span style={{ fontSize: 9, color: '#722ed1' }}>{t('lockedTag')}</span>
                            <span style={{ fontSize: 11, fontWeight: 700, color: '#ff4d4f' }}>{remaining}</span>
                            <span style={{ fontSize: 8, color: '#ff7875' }}>{t('secondUnit')}</span>
                          </div>
                        )}
                        {!presale && !inCart && isDateSoldOut(date) && (
                          <>
                            <span style={{ fontSize: 9, marginTop: 1 }}>{t('soldOutTag')}</span>
                            <span style={{ fontSize: 9, color: '#bfbfbf', textDecoration: 'line-through' }}>${realCell?.dailyPrice ?? ''}</span>
                            <span style={{ fontSize: 9, color: '#bfbfbf' }}>{t('inventoryLabel')}：0</span>
                          </>
                        )}
                        {!presale && !inCart && !isDateSoldOut(date) && isDateUnavailable(date) && (
                          <>
                            <span style={{ fontSize: 9, marginTop: 1 }}>{t('unavailableTag')}</span>
                            <span style={{ fontSize: 9, color: '#bfbfbf' }}>—</span>
                          </>
                        )}
                        {!presale && !inCart && !isDateSoldOut(date) && !isDateUnavailable(date) && (
                          <>
                            {isSelected
                              ? <span style={{ fontSize: 9, color: '#E8720C', marginTop: 1, fontWeight: 600 }}>{t('selectedTag')}</span>
                              : <span style={{ fontSize: 9, color: '#52c41a', marginTop: 1 }}>{t('availableTag')}</span>
                            }
                            <span style={{ fontSize: 9, color: '#ff4d4f', fontWeight: 500 }}>${realCell?.dailyPrice ?? ''}</span>
                            {realCell && (
                              <span style={{ fontSize: 9, color: realCell.remaining <= 1 ? '#ff4d4f' : '#8c8c8c', fontWeight: realCell.remaining <= 1 ? 600 : 400 }}>{t('inventoryLabel')}：{realCell.remaining}</span>
                            )}
                          </>
                        )}
                      </>
                    ) : null}
                  </div>
                )
              })}
            </div>
          ))}
        </div>
      </div>

      {/* 右侧面板 */}
      <div style={{ width: 400, display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* 当前所选 */}
        <Card size="small" title={<Space><CalendarOutlined /><span>{t('currentSelection')}</span></Space>}>
          {selectedDates.length > 0 ? (
            <div>
              <Space direction="vertical" size={12} style={{ width: '100%' }}>
                {/* 按月展示已选日期 */}
                {datesByMonth.map(({ month, days }) => (
                  <div key={month} style={{ background: '#fafafa', borderRadius: 6, padding: '10px 12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                      <span style={{ fontSize: 12, color: '#8c8c8c', whiteSpace: 'nowrap' }}>{t('selectedMonth')}</span>
                      <span style={{ fontSize: 14, fontWeight: 600 }}>{month}</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 12, color: '#8c8c8c', whiteSpace: 'nowrap' }}>{t('selectedDatesLabel')}</span>
                      <span style={{ fontSize: 13, fontWeight: 500 }}>{days.map(d => `${d}${t('dayUnitSuffix')}`).join('、')}</span>
                    </div>
                  </div>
                ))}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 12, color: '#8c8c8c', whiteSpace: 'nowrap' }}>{t('totalDaysSelected')}</span>
                  <span style={{ fontSize: 14, fontWeight: 600, color: '#52c41a' }}>{t('dayCount', { count: selectedDates.length })}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 12, color: '#8c8c8c', whiteSpace: 'nowrap' }}>{t('discount')}</span>
                  {currentDiscount ? <Tag color="green">{currentDiscount.discount % 10 === 0 ? currentDiscount.discount / 10 : currentDiscount.discount}{t('discountUnit')}</Tag> : <Tag>{t('noDiscount')}</Tag>}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 12, color: '#8c8c8c', whiteSpace: 'nowrap' }}>{t('salePriceCol')}</span>
                  <span style={{ fontSize: 20, fontWeight: 700, color: '#ff4d4f' }}>${pendingPrice}</span>
                </div>
              </Space>
              <Button type="primary" icon={<ShoppingCartOutlined />} block onClick={handleAddToCart} loading={locking}
                style={{ marginTop: 12, height: 40, fontSize: 15, background: '#fa8c16', borderColor: '#fa8c16' }}>
                {t('addCart')}
              </Button>
            </div>
          ) : (
            <Empty description={t('selectDateInCalendar')} image={Empty.PRESENTED_IMAGE_SIMPLE} />
          )}
        </Card>

        {/* 已选择购买天数 */}
        <Card size="small" title={t('selectedDays')}>
          <div style={{ fontSize: 11, color: '#ff4d4f', marginBottom: 12, lineHeight: 1.4 }}>
            {t('lockWarningDay', { seconds: LOCK_SECONDS })}
          </div>
          {cartItems.length > 0 ? (
            <Table<CartRow>
              dataSource={cartItems.flatMap(item =>
                item.dates.map((date): CartRow => ({
                  key: `${item.key}-${date}`, date, cartKey: item.key,
                  salePrice: Math.round(item.originalPrice * item.discount / 100 / item.dates.length),
                  lockTime: item.lockTime,
                }))
              )}
              pagination={false} size="small"
              locale={{ emptyText: <Empty description={t('noSelectedDate')} image={Empty.PRESENTED_IMAGE_SIMPLE} /> }}
              columns={[
                { title: t('purchaseDateCol'), dataIndex: 'date', key: 'date', width: 110, render: (text: string) => <span style={{ fontSize: 12 }}>{text}</span> },
                { title: t('cartColLockTime'), key: 'countdown', width: 100, align: 'center' as const,
                  render: (_, record) => {
                    const remaining = Math.max(0, LOCK_SECONDS - Math.floor((currentTime - record.lockTime) / 1000))
                    if (remaining <= 0) return <span style={{ fontSize: 11, color: '#bfbfbf' }}>{t('lockReleased')}</span>
                    return (
                      <span style={{ fontSize: 12 }}>
                        <span style={{ fontWeight: 700, color: remaining <= 10 ? '#ff4d4f' : '#fa8c16' }}>{remaining}</span>
                        <span style={{ fontSize: 10, color: '#8c8c8c', marginLeft: 2 }}>{t('secondUnit')}</span>
                      </span>
                    )
                  }
                },
                { title: t('salePriceCol'), dataIndex: 'salePrice', key: 'salePrice', width: 80, align: 'right' as const, render: (price: number) => <span style={{ fontSize: 12, color: '#ff4d4f', fontWeight: 600 }}>${price}</span> },
                { title: t('common:action'), key: 'action', width: 60, align: 'center' as const,
                  render: (_, record) => (
                    <Button type="link" size="small" danger style={{ padding: 0, fontSize: 12 }}
                      onClick={() => handleRemoveCartDate(record.cartKey, record.date)}
                    >{t('common:remove')}</Button>
                  ),
                },
              ]}
            />
          ) : (
            <Empty description={t('noSelectedDate')} image={Empty.PRESENTED_IMAGE_SIMPLE} />
          )}
        </Card>

        {/* 订单结算（與新店廣告購買頁訂單結算同款風格） */}
        <Card size="small" title={t('orderSettlement')}>
          {/* 支付方式選擇（非混合支付時顯示） */}
          {!mixedPayment && (
            <div style={{ marginBottom: 12, padding: '10px 12px', background: '#F6FFED', border: '1px solid #B7EB8F', borderRadius: 6 }}>
              <div style={{ fontSize: 12, color: '#595959', marginBottom: 8, fontWeight: 500 }}>支付方式選擇</div>
              <Radio.Group value={paymentMode} onChange={(e) => setPaymentMode(e.target.value)}>
                <Radio value="promo">推廣金支付</Radio>
                <Radio value="gift">贈送天數抵扣</Radio>
              </Radio.Group>
            </div>
          )}
          {/* 推廣金餘額（混合支付時或非混合支付選擇推廣金時顯示） */}
          {(mixedPayment || paymentMode === 'promo') && (
            <div style={{ padding: '12px 16px', marginBottom: 12, background: 'linear-gradient(135deg, #E8720C 0%, #F39C12 100%)', borderRadius: 6, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 13, color: '#fff', opacity: 0.9 }}>{t('promoBalance')}</span>
              <span style={{ fontSize: 22, fontWeight: 700, color: '#fff' }}>{merchantBalance == null ? '--' : `$${merchantBalance.toLocaleString()}`}</span>
            </div>
          )}
          {/* 贈送天數抵扣（與新店廣告購買頁訂單結算同款樣式：橙色橫幅 + 明細盒） */}
          {(mixedPayment || paymentMode === 'gift') && (
            <>
              <div style={{ padding: '12px 16px', marginBottom: 12, background: 'linear-gradient(135deg, #E8720C 0%, #F39C12 100%)', borderRadius: 6, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 13, color: '#fff', opacity: 0.9 }}>{t('remainingGiftDays')}</span>
                <span style={{ fontSize: 22, fontWeight: 700, color: '#fff' }}>{giftDaysBalance} {t('dayUnitSuffix')}</span>
              </div>
              <div style={{ background: '#fafafa', borderRadius: 6, padding: '12px 16px', marginBottom: 12, fontSize: 13 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                  <span style={{ color: '#595959' }}>{t('useGiftDays')}</span>
                  <span style={{ fontWeight: 600, color: '#E8720C' }}>{effectiveGiftDays} {t('dayUnitSuffix')}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                  <span style={{ color: '#595959' }}>{t('afterSubmitRemaining')}</span>
                  <span style={{ fontWeight: 600, color: '#52c41a' }}>{giftDaysBalance - effectiveGiftDays} {t('dayUnitSuffix')}</span>
                </div>
                {giftDaysBalance === 0 ? (
                  <div style={{ fontSize: 11, color: '#bfbfbf' }}>{t('noGiftDaysAvailable')}</div>
                ) : cartSummary.totalDays === 0 ? (
                  <div style={{ fontSize: 11, color: '#bfbfbf' }}>{t('addCartToDeduct')}</div>
                ) : mixedPayment ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 12, color: '#8c8c8c', whiteSpace: 'nowrap' }}>{t('deductLabel')}</span>
                    <InputNumber
                      size="small" min={0} max={maxGiftDaysUsable} value={effectiveGiftDays} precision={0}
                      onChange={(v) => setGiftDaysUsed(typeof v === 'number' ? v : 0)}
                      style={{ width: 72 }}
                    />
                    <span style={{ fontSize: 12, color: '#8c8c8c', whiteSpace: 'nowrap' }}>{t('dayUnitSuffix')}</span>
                    <Button size="small" type="link" style={{ padding: 0, fontSize: 12, marginLeft: 'auto' }}
                      onClick={() => setGiftDaysUsed(maxGiftDaysUsable)}>{t('deductAll')}</Button>
                  </div>
                ) : null}
                {/* 加購天數超出贈送天數餘額：超出部分需推廣金支付（規則不允許混合時提醒） */}
                {cartSummary.totalDays > effectiveGiftDays && (
                  <div style={{ borderTop: '1px dashed #d9d9d9', marginTop: 8, paddingTop: 8 }}>
                    {mixedPayment ? (
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ color: '#595959' }}>{t('promoPayDays')}</span>
                        <span style={{ fontWeight: 600, color: '#ff4d4f' }}>{cartSummary.totalDays - effectiveGiftDays} {t('dayUnitSuffix')}</span>
                      </div>
                    ) : (
                      <div style={{ fontSize: 12, color: '#ff4d4f', lineHeight: 1.6 }}>{t('giftInsufficientNoMix', { days: cartSummary.totalDays - effectiveGiftDays })}</div>
                    )}
                  </div>
                )}
              </div>
            </>
          )}
          {/* 價格明細（無敵星星風格：flex 左右佈局） */}
          <div style={{ background: '#fafafa', padding: 16, borderRadius: 8, marginBottom: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
              <span style={{ color: '#595959' }}>{t('orderOriginal')}：</span>
              <span style={{ fontWeight: 600 }}>${cartSummary.totalOriginal}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
              <span style={{ color: '#595959' }}>享受折扣：</span>
              {currentDiscount ? (
                <span style={{ fontWeight: 600, color: '#52C41A' }}>满{currentDiscount.minDays}天{currentDiscount.discount > 10 ? currentDiscount.discount / 10 : currentDiscount.discount}折</span>
              ) : (
                <span style={{ color: '#BFBFBF' }}>无折扣</span>
              )}
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, color: '#fa8c16' }}>
              <span>{t('orderDiscount')}：</span>
              <span style={{ fontWeight: 600 }}>-${cartSummary.totalDiscount}</span>
            </div>
            {/* 混合支付：抵扣天數（borderTop 之後） */}
            {mixedPayment && (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid #d9d9d9', paddingTop: 8, marginTop: 8 }}>
                <span style={{ color: '#595959' }}>抵扣天數：</span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  {giftDaysBalance === 0 || cartSummary.totalDays === 0 ? (
                    <span style={{ fontWeight: 600, color: '#E8720C' }}>{effectiveGiftDays}天</span>
                  ) : (
                    <>
                      <InputNumber
                        size="small" min={0} max={maxGiftDaysUsable} value={effectiveGiftDays} precision={0}
                        onChange={(v) => setGiftDaysUsed(typeof v === 'number' ? v : 0)}
                        style={{ width: 64 }}
                      />
                      <span style={{ fontSize: 12, color: '#8c8c8c' }}>天</span>
                      <Button size="small" type="link" style={{ padding: 0, fontSize: 12 }}
                        onClick={() => setGiftDaysUsed(maxGiftDaysUsable)}>{t('deductAll')}</Button>
                    </>
                  )}
                </span>
              </div>
            )}
            {/* 赠送天数抵扣（borderTop 之後） */}
            {paymentMode === 'gift' && !mixedPayment && (
              <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid #d9d9d9', paddingTop: 8, marginTop: 8 }}>
                <span style={{ color: '#595959' }}>抵扣天數：</span>
                <span style={{ fontWeight: 600, color: '#E8720C' }}>{effectiveGiftDays}天</span>
              </div>
            )}
            {/* 實付總額（推廣金 / 混合支付） */}
            {(mixedPayment || paymentMode === 'promo') && (
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 16, color: '#ff4d4f', borderTop: '1px solid #d9d9d9', paddingTop: 8, marginTop: 8 }}>
                <span style={{ fontWeight: 600 }}>{t('totalPayable')}：</span>
                <span style={{ fontWeight: 700 }}>${payableAmount}</span>
              </div>
            )}
          </div>
          <Button type="primary" block size="large" icon={<ShoppingCartOutlined />} disabled={cartItems.length === 0} onClick={handlePayment}
            style={{ background: cartItems.length > 0 ? '#ff4d4f' : '#d9d9d9', borderColor: cartItems.length > 0 ? '#ff4d4f' : '#d9d9d9', height: 44, fontSize: 16, fontWeight: 600 }}>
            {t('payButton')}
          </Button>
        </Card>
      </div>
      </div>
      </>
      )}

      {/* 支付确认弹窗 */}
      <Modal title={t('confirmOrder')} open={isPaymentModalVisible} onOk={handleConfirmPayment} onCancel={() => setIsPaymentModalVisible(false)}
        okText={t('confirmPay')} cancelText={t('common:cancel')} confirmLoading={paying} okButtonProps={{ style: { background: '#ff4d4f', borderColor: '#ff4d4f' } }} width={600}>
        <div style={{ marginBottom: 16 }}>
          <h4 style={{ marginBottom: 12, fontSize: 14, color: '#595959' }}>{t('purchaseDetail')}</h4>
          <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
            <thead><tr style={{ background: '#fafafa' }}>
              <th style={{ padding: '8px', border: '1px solid #e8e8e8', textAlign: 'left' }}>{t('purchaseDateCol')}</th>
              <th style={{ padding: '8px', border: '1px solid #e8e8e8', textAlign: 'center' }}>{t('dayCountCol')}</th>
              <th style={{ padding: '8px', border: '1px solid #e8e8e8', textAlign: 'center' }}>{t('discountCol')}</th>
              <th style={{ padding: '8px', border: '1px solid #e8e8e8', textAlign: 'right' }}>{t('salePriceCol')}</th>
            </tr></thead>
            <tbody>{cartItems.map(item => (
              <tr key={item.key}>
                <td style={{ padding: '8px', border: '1px solid #e8e8e8' }}>{item.dates.length <= 3 ? item.dates.join(', ') : `${item.dates.slice(0, 3).join(', ')} ...共${item.dates.length}${t('dayUnitSuffix')}`}</td>
                <td style={{ padding: '8px', border: '1px solid #e8e8e8', textAlign: 'center' }}>{item.days}{t('dayUnitSuffix')}</td>
                <td style={{ padding: '8px', border: '1px solid #e8e8e8', textAlign: 'center' }}>{item.discount < 100 ? `${item.discount % 10 === 0 ? item.discount / 10 : item.discount}${t('discountUnit')}` : '-'}</td>
                <td style={{ padding: '8px', border: '1px solid #e8e8e8', textAlign: 'right', color: '#ff4d4f', fontWeight: 600 }}>${item.salePrice}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
        <div style={{ background: '#fafafa', padding: 16, borderRadius: 8 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
            <span style={{ color: '#595959' }}>{t('orderOriginalFull')}</span>
            <span style={{ fontWeight: 600 }}>${cartSummary.totalOriginal}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
            <span style={{ color: '#595959' }}>享受折扣：</span>
            {currentDiscount ? (
              <span style={{ fontWeight: 600, color: '#52C41A' }}>满{currentDiscount.minDays}天{currentDiscount.discount > 10 ? currentDiscount.discount / 10 : currentDiscount.discount}折</span>
            ) : (
              <span style={{ color: '#BFBFBF' }}>无折扣</span>
            )}
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, color: '#fa8c16' }}>
            <span>{t('orderDiscountLabel')}</span>
            <span style={{ fontWeight: 600 }}>-${cartSummary.totalDiscount}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 16, color: '#ff4d4f', borderTop: '1px solid #d9d9d9', paddingTop: 8, marginTop: 8 }}>
            <span style={{ fontWeight: 600 }}>{t('actualAmountFull')}</span>
            <span style={{ fontWeight: 700 }}>${payableAmount}</span>
          </div>
        </div>
      </Modal>

      {/* 支付成功弹窗 */}
      <Modal title={t('purchaseSuccess')} open={isSuccessModalVisible} onCancel={() => setIsSuccessModalVisible(false)}
        footer={[<Button key="view" type="primary" onClick={handleViewOrder}>{t('viewOrder')}</Button>, <Button key="continue" onClick={handleContinuePurchase} style={{ background: '#fa8c16', borderColor: '#fa8c16', color: '#fff' }}>{t('continueBuy')}</Button>]} width={400}>
        <div style={{ textAlign: 'center', padding: '20px 0' }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>✅</div>
          <p style={{ fontSize: 16, color: '#595959', marginBottom: 24 }}>{t('successMessage')}</p>
          <div style={{ background: 'linear-gradient(135deg, #fff7e6 0%, #ffe58f 100%)', padding: '20px 16px', borderRadius: 8, marginBottom: 16 }}>
            <p style={{ fontSize: 14, color: '#8c8c8c', marginBottom: 8 }}>{t('deductedPromoFull')}</p>
            <p style={{ fontSize: 36, fontWeight: 700, color: '#fa541c', margin: 0, lineHeight: 1.2 }}>${paidAmount}</p>
          </div>
        </div>
      </Modal>

      {/* 待开售日期提醒弹窗 */}
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
          </Button>
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
