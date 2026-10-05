/**
 * DayPicker 共享 Hook — 日历选择、购物车、查询条件、支付流程的公共状态与逻辑
 * 供 AdSales 与 PromotionSalesConfig 的 DayPicker 共用
 */
import { useState, useMemo, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { message } from 'antd'
import { useNavigate } from 'react-router-dom'
import dayjs from 'dayjs'
import type { Dayjs } from 'dayjs'
import type { InventoryItem } from '../types'
import { RECOMMEND_TYPE_CONFIGS } from '../types'
import {
  GIFT_AD_TYPE,
  BACKEND_TO_UI_BRAND,
  UI_TO_BACKEND_BRAND,
  DEFAULT_SELLABLE_DAYS,
  MONTHS_PER_PAGE,
  DEFAULT_LOCK_SECONDS,
  buildCalendarGrid,
  buildMonthList,
  groupDatesByMonth,
  parseDayTiers,
  isPresaleDate,
  getPresaleOpenTime,
  type CartItem,
  type DayTier,
} from '../dayPickerConstants'
import {
  fetchAdAlgorithms,
  fetchAdReviveInventory,
  placeAdReviveOrder,
  lockAdReviveCells,
  unlockAdReviveCells,
  type AdReviveInventoryVO,
  type AdReviveInventoryCell,
} from '../../../../api/adPromotion'
import { fetchStores, type StoreItem } from '../../../../api/store'
import { fetchFinAccounts } from '../../../../api/finance'
import { fetchGiftAvailableDays } from '../../../../api/gift'
import { usePaymentRule } from '../../../../hooks/usePaymentRule'
import { getSystemRuleValue } from '../../../../hooks/useSystemRules'
import { AlgorithmType, REGION_LABEL_KEY } from '../../../Recommend/constants'

export interface UseDayPickerCommonOptions {
  inventoryItem: InventoryItem
  /** AdSales 独有：storeMode 时隐藏门店/BD 选择 */
  storeMode?: boolean
  /** AdSales 独有：算法标签是否展示 algoCode */
  showAlgoCode?: boolean
}

export function useDayPickerCommon({ inventoryItem, storeMode, showAlgoCode }: UseDayPickerCommonOptions) {
  const { t } = useTranslation('adSales')
  const navigate = useNavigate()

  // 从规则配置动态读取锁定时长
  const LOCK_SECONDS = getSystemRuleValue<number>('ad_click_cart_lock_seconds') || DEFAULT_LOCK_SECONDS

  // ===== 日历与选择 =====
  const [selectedDates, setSelectedDates] = useState<string[]>([])
  const [currentMonth, setCurrentMonth] = useState<Dayjs>(dayjs())
  const [hoveredMonth, setHoveredMonth] = useState<string | null>(null)
  const [monthPage, setMonthPage] = useState(0)

  // ===== 购物车 =====
  const [cartItems, setCartItems] = useState<CartItem[]>([])

  // ===== 支付相关 =====
  const [merchantBalance, setMerchantBalance] = useState<number | null>(null)
  const [giftDaysBalance, setGiftDaysBalance] = useState(0)
  const [giftDaysUsed, setGiftDaysUsed] = useState(0)
  const [paidAmount, setPaidAmount] = useState(0)
  const [isPaymentModalVisible, setIsPaymentModalVisible] = useState(false)
  const [isSuccessModalVisible, setIsSuccessModalVisible] = useState(false)
  const [paying, setPaying] = useState(false)
  const [locking, setLocking] = useState(false)

  // ===== 倒计时 =====
  const [currentTime, setCurrentTime] = useState(Date.now())

  // ===== 待开售弹窗 =====
  const [presaleInfo, setPresaleInfo] = useState<{ date: string; weekday: string; openTime: string } | null>(null)

  // ===== 查询条件 =====
  const [searchBrand, setSearchBrand] = useState<string | null>(null)
  const [searchAlgorithm, setSearchAlgorithm] = useState<string | null>(null)
  const [searchStoreName, setSearchStoreName] = useState<string | null>(null)
  const [searchBD, setSearchBD] = useState<string | null>(null)
  const [hasSearched, setHasSearched] = useState(false)

  // ===== 冲突弹窗 =====
  const [isConflictModalVisible, setIsConflictModalVisible] = useState(false)
  const [pendingAction, setPendingAction] = useState<(() => void) | null>(null)

  // ===== 支付规则 =====
  const { mixedPayment, switchable, mode } = usePaymentRule(GIFT_AD_TYPE)
  const [paymentMode, setPaymentMode] = useState<'promo' | 'gift'>('promo')
  const activeMode: 'promo' | 'gift' = mode === 'promo_only' ? 'promo' : mode === 'gift_only' ? 'gift' : paymentMode

  // ===== 真实接口数据 =====
  const [algorithmOptions, setAlgorithmOptions] = useState<Array<{ label: string; value: string }>>([])
  const [_algorithmBrandOverrides, setAlgorithmBrandOverrides] = useState<Record<string, string>>({})
  const [storeOptions, setStoreOptions] = useState<Array<{ label: string; value: string }>>([])
  const [storeMap, setStoreMap] = useState<Record<string, StoreItem>>({})
  const [bdOptions, setBdOptions] = useState<Array<{ label: string; value: string }>>([])
  const [inventoryData, setInventoryData] = useState<AdReviveInventoryVO | null>(null)

  // ===== 派生状态 =====
  const sellableDays = inventoryData ? inventoryData.presaleDays : DEFAULT_SELLABLE_DAYS
  const dayTiers = useMemo(() => parseDayTiers(inventoryData?.discountTiers), [inventoryData])
  const currentAlgorithmRefundEnabled = inventoryData ? inventoryData.refundEnabled === 1 : null

  const selectedStore = searchStoreName ? storeMap[searchStoreName] : undefined
  const storeRegion = selectedStore?.region ?? null

  const realCellMap = useMemo(() => {
    const map: Record<string, AdReviveInventoryCell> = {}
    if (storeRegion == null) return map
    inventoryData?.cells
      .filter(c => c.region === storeRegion)
      .forEach(c => { map[c.bizDate] = c })
    return map
  }, [inventoryData, storeRegion])
  const getRealCell = (dateStr: string) => realCellMap[dateStr]

  const regionLabel = storeRegion != null
    ? (REGION_LABEL_KEY[storeRegion] ? t(`translation:${REGION_LABEL_KEY[storeRegion]}`) : '')
    : ''
  const regionNotConfigured = hasSearched && storeRegion != null
    && (inventoryData?.cells ?? []).length > 0
    && !(inventoryData?.cells ?? []).some(c => c.region === storeRegion)
  const regionBlocked = hasSearched && (storeRegion == null || regionNotConfigured)

  const hasCartItems = cartItems.length > 0

  // ===== 日历计算 =====
  const months = useMemo(() => buildMonthList(sellableDays), [sellableDays])
  const monthPageCount = Math.ceil(months.length / MONTHS_PER_PAGE)
  const visibleMonths = months.slice(monthPage * MONTHS_PER_PAGE, (monthPage + 1) * MONTHS_PER_PAGE)
  const calendarGrid = useMemo(() => buildCalendarGrid(currentMonth), [currentMonth])
  const datesByMonth = useMemo(() => groupDatesByMonth(selectedDates), [selectedDates])

  // ===== 折扣与价格计算 =====
  const cartSummary = useMemo(() => {
    const totalOriginal = cartItems.reduce((sum, item) => sum + item.originalPrice, 0)
    const totalSale = cartItems.reduce((sum, item) => sum + item.salePrice, 0)
    const totalDays = cartItems.reduce((sum, item) => sum + item.days, 0)
    return { totalOriginal, totalSale, totalDays, totalDiscount: totalOriginal - totalSale }
  }, [cartItems])

  const currentDiscount = useMemo(() => {
    const days = selectedDates.length + cartSummary.totalDays
    let matched: DayTier | null = null
    for (const tier of dayTiers) {
      if (days >= tier.minDays) matched = tier
    }
    return matched
  }, [selectedDates, cartSummary.totalDays, dayTiers])

  const pendingPrice = useMemo(() => {
    if (selectedDates.length === 0) return 0
    const basePrice = selectedDates.reduce((sum, d) => sum + (getRealCell(d)?.dailyPrice ?? 0), 0)
    if (currentDiscount) return Math.round(basePrice * currentDiscount.discount / 100)
    return basePrice
  }, [selectedDates, currentDiscount, realCellMap])

  const maxGiftDaysUsable = Math.min(giftDaysBalance, cartSummary.totalDays)
  const effectiveGiftDays = !mixedPayment && activeMode === 'gift'
    ? maxGiftDaysUsable
    : Math.min(giftDaysUsed, maxGiftDaysUsable)
  const giftDeduction = useMemo(() => {
    if (!mixedPayment && activeMode === 'promo') return 0
    if (effectiveGiftDays <= 0 || cartSummary.totalDays === 0) return 0
    return Math.min(cartSummary.totalSale, Math.round(cartSummary.totalSale / cartSummary.totalDays * effectiveGiftDays))
  }, [effectiveGiftDays, cartSummary, mixedPayment, activeMode])
  const payableAmount = cartSummary.totalSale - giftDeduction

  // ===== 日期状态判断 =====
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
    return date.isBefore(dayjs(), 'day')
  }

  const isDateLocked = (dateStr: string) => cartItems.some(item => item.dates.includes(dateStr))

  const getLockedRemaining = (dateStr: string) => {
    const item = cartItems.find((it: CartItem) => it.dates.includes(dateStr))
    if (!item) return 0
    return Math.max(0, LOCK_SECONDS - Math.floor((currentTime - item.lockTime) / 1000))
  }

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

  // ===== 初始化与副作用 =====
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
        const records = res.records.filter(a => a.updatedBy !== '系統')
        const brandOverrides: Record<string, string> = {}
        const options = records.map(a => {
          const value = String(a.id)
          const uiBrand = BACKEND_TO_UI_BRAND[a.brand || '']
          if (uiBrand) brandOverrides[value] = uiBrand
          const label = showAlgoCode && a.algoCode ? `${a.algoName}(${a.algoCode})` : a.algoName
          return { label, value }
        })
        setAlgorithmOptions(options)
        setAlgorithmBrandOverrides(brandOverrides)
        if (searchAlgorithm && !options.some(o => o.value === searchAlgorithm)) {
          setSearchAlgorithm(null)
          message.warning(t('currentAlgorithmBlocked'))
        }
      }).catch(() => {})
  }, [searchBrand, searchStoreName])

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

  useEffect(() => {
    const timer = setInterval(() => { setCurrentTime(Date.now()) }, 1000)
    return () => clearInterval(timer)
  }, [])

  useEffect(() => {
    const expiredItems = cartItems.filter(item => currentTime - item.lockTime >= LOCK_SECONDS * 1000)
    if (expiredItems.length > 0) {
      setCartItems(prev => prev.filter(item => currentTime - item.lockTime < LOCK_SECONDS * 1000))
      expiredItems.forEach(item => {
        message.info(t('lockExpiredBatch', { days: item.dates.length }))
      })
    }
  }, [currentTime, cartItems])

  // ===== 事件处理 =====
  const handleBrandChange = (value: string | null) => {
    setSearchBrand(value)
    setSearchAlgorithm(null)
    setAlgorithmOptions([])
  }

  const handleAlgorithmChange = (value: string | null) => {
    const apply = () => setSearchAlgorithm(value)
    if (hasCartItems && value !== searchAlgorithm) {
      setPendingAction(apply)
      setIsConflictModalVisible(true)
      return
    }
    apply()
  }

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

  const handleCancelSwitch = () => {
    setIsConflictModalVisible(false)
    setPendingAction(null)
  }

  const handleSearch = () => {
    if (!searchAlgorithm) { message.warning(t('selectAlgorithm')); return }
    if (!searchBrand) { message.warning(t('selectBrand')); return }
    if (!searchStoreName) { message.warning(t('selectStore')); return }
    const store = storeMap[searchStoreName]
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
        const backendBrand = UI_TO_BACKEND_BRAND[searchBrand] || searchBrand
        fetchFinAccounts({ groupId: store?.groupCode, brand: backendBrand, page: 1, size: 10 })
          .then(res => {
            const acc = (res.records ?? [])[0]
            setMerchantBalance(acc ? Number(acc.virtualBalance) : null)
          }).catch(() => setMerchantBalance(null))
      })
      .catch(err => message.error(err instanceof Error ? err.message : t('inventoryQueryFailed')))
  }

  const handleReset = () => {
    setSearchBrand(null); setSearchAlgorithm(null)
    setSearchStoreName(null); setSearchBD(null)
    setHasSearched(false)
    setInventoryData(null)
    setCartItems([])
    setSelectedDates([])
    setAlgorithmOptions([])
  }

  const handleDateClick = (date: Dayjs | null) => {
    if (!date) return
    const WEEKDAY_LABELS = t('weekdayShort', { returnObjects: true }) as string[]
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

  const handleMonthChange = (month: Dayjs) => {
    const WEEKDAY_LABELS = t('weekdayShort', { returnObjects: true }) as string[]
    const firstDay = month.startOf('month')
    if (isPresaleDate(firstDay, sellableDays)) {
      setPresaleInfo({
        date: firstDay.format('YYYY-MM-DD'),
        weekday: WEEKDAY_LABELS[firstDay.day()],
        openTime: getPresaleOpenTime(firstDay, sellableDays).format('M月D日 HH:mm'),
      })
      return
    }
    setCurrentMonth(month)
  }

  const handlePayment = () => {
    if (cartItems.length === 0) return
    if (!mixedPayment && activeMode === 'promo') {
      if (merchantBalance != null && cartSummary.totalSale > merchantBalance) {
        message.error('推廣金餘額不足，請充值後再試')
        return
      }
    } else if (!mixedPayment && activeMode === 'gift') {
      if (giftDaysBalance < cartSummary.totalDays) {
        message.error('贈送天數餘額不足，無法抵扣')
        return
      }
    } else if (mixedPayment) {
      if (merchantBalance != null && payableAmount > merchantBalance) {
        message.error('推廣金餘額不足，請充值後再試')
        return
      }
    }
    setIsPaymentModalVisible(true)
  }

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

  const handleViewOrder = useCallback(() => {
    setIsSuccessModalVisible(false)
    const typeName = RECOMMEND_TYPE_CONFIGS.find(c => c.type === inventoryItem.algorithmType)?.name || ''
    navigate(`/promotion-order-manage?type=${encodeURIComponent(typeName)}&from=ad-sales`)
  }, [inventoryItem, navigate])

  const handleContinuePurchase = () => { setIsSuccessModalVisible(false); message.success(t('continueBuy')) }

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

  return {
    // 状态
    t,
    navigate,
    LOCK_SECONDS,
    selectedDates,
    setSelectedDates,
    currentMonth,
    setCurrentMonth,
    hoveredMonth,
    setHoveredMonth,
    monthPage,
    setMonthPage,
    cartItems,
    setCartItems,
    merchantBalance,
    giftDaysBalance,
    giftDaysUsed,
    setGiftDaysUsed,
    paidAmount,
    isPaymentModalVisible,
    setIsPaymentModalVisible,
    isSuccessModalVisible,
    setIsSuccessModalVisible,
    paying,
    locking,
    currentTime,
    presaleInfo,
    setPresaleInfo,
    searchBrand,
    searchAlgorithm,
    searchStoreName,
    searchBD,
    setSearchBD,
    hasSearched,
    isConflictModalVisible,
    pendingAction,
    mixedPayment,
    switchable,
    mode,
    paymentMode,
    setPaymentMode,
    activeMode,
    algorithmOptions,
    storeOptions,
    storeMap,
    bdOptions,
    inventoryData,
    sellableDays,
    dayTiers,
    currentAlgorithmRefundEnabled,
    storeRegion,
    regionLabel,
    regionNotConfigured,
    regionBlocked,
    hasCartItems,
    months,
    monthPageCount,
    visibleMonths,
    calendarGrid,
    datesByMonth,
    currentDiscount,
    cartSummary,
    pendingPrice,
    maxGiftDaysUsable,
    effectiveGiftDays,
    giftDeduction,
    payableAmount,
    getRealCell,
    isDateSoldOut,
    isDateUnavailable,
    isDateLocked,
    getLockedRemaining,
    getCellStyle,
    // 事件
    handleBrandChange,
    handleAlgorithmChange,
    handleStoreChange,
    handleConfirmSwitch,
    handleCancelSwitch,
    handleSearch,
    handleReset,
    handleDateClick,
    handleAddToCart,
    handleMonthChange,
    handlePayment,
    handleConfirmPayment,
    handleViewOrder,
    handleContinuePurchase,
    handleRemoveCartDate,
  }
}
