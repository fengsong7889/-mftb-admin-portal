/**
 * DateTimeGrid 共享状态与逻辑 Hook
 * 管理日期选择、购物车、分页、弹窗、搜索条件、倒计时等共享状态
 */
import { useState, useMemo, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { message } from 'antd'
import dayjs from 'dayjs'
import type { Dayjs } from 'dayjs'
import { Region } from '../../Recommend/constants'
import {
  isPresaleDate,
  getPresaleOpenTime,
  type DiscountTierDef,
} from './gridConstants'
import type { PresaleInfo } from './DateStrip'

/** 共享购物车项接口（AdSales 额外有 mealSlotKey 字段） */
export interface GridCartItem {
  key: string
  date: string
  region: Region
  regionName: string
  mealSlot: string
  mealSlotKey?: string
  timeSlots: number[]
  originalPrice: number
  salePrice: number
  storeId: string
  storeName: string
  lockTime: number
}

/** 时段定义 */
export interface MealSlotDef {
  key: string
  label: string
  timeRange: string
  slots: number[]
  startHour?: number
}

/** Hook 配置参数 */
export interface GridCommonConfig {
  lockDurationSeconds: number
  sellableDays: number
  mealTimeSlots: MealSlotDef[]
  translatedRegionList: Array<{ key: Region | string | number; name: string }>
  multiSlotTiers: DiscountTierDef[]
  /** 日期范围：从 inventoryItem 计算 */
  allDates: Dayjs[]
  /** 可选：购物车过期时的回调（AdSales 需要刷新库存） */
  onLockExpired?: () => void
}

export function useDateTimeGridCommon(config: GridCommonConfig) {
  const { t } = useTranslation('adSales')
  const {
    lockDurationSeconds,
    LOCK_DURATION_MS,
    sellableDays,
    mealTimeSlots,
    translatedRegionList,
    multiSlotTiers,
    allDates,
    onLockExpired,
  } = (() => {
    const ms = config.lockDurationSeconds * 1000
    return {
      lockDurationSeconds: config.lockDurationSeconds,
      LOCK_DURATION_MS: ms,
      sellableDays: config.sellableDays,
      mealTimeSlots: config.mealTimeSlots,
      translatedRegionList: config.translatedRegionList,
      multiSlotTiers: config.multiSlotTiers,
      allDates: config.allDates,
      onLockExpired: config.onLockExpired,
    }
  })()

  // ─── 日期选择 ──────────────────────────────────────────────────────────────
  const [selectedDates, setSelectedDates] = useState<Dayjs[]>([])
  const [activeDate, setActiveDate] = useState<Dayjs | null>(null)
  const [hoveredDate, setHoveredDate] = useState<string | null>(null)
  const [selectedCells, setSelectedCells] = useState<Array<{ date: string; regionKey: Region | string; mealSlotKey: string }>>([])

  // ─── 购物车 ────────────────────────────────────────────────────────────────
  const [cartItems, setCartItems] = useState<GridCartItem[]>([])

  // ─── 分页 ──────────────────────────────────────────────────────────────────
  const [currentPage, setCurrentPage] = useState(1)
  const pageSize = 7

  const dateList = useMemo(() => {
    const startIndex = (currentPage - 1) * pageSize
    return allDates.slice(startIndex, startIndex + pageSize)
  }, [allDates, currentPage])

  const totalPages = Math.ceil(allDates.length / pageSize)

  // ─── 弹窗状态 ──────────────────────────────────────────────────────────────
  const [isPaymentModalVisible, setIsPaymentModalVisible] = useState(false)
  const [isSuccessModalVisible, setIsSuccessModalVisible] = useState(false)
  const [isSoldOutModalVisible, setIsSoldOutModalVisible] = useState(false)
  const [soldOutDetails, setSoldOutDetails] = useState<Array<{ date: string; regionName: string; mealSlot: string }>>([])
  const [isConflictModalVisible, setIsConflictModalVisible] = useState(false)
  const [pendingAction, setPendingAction] = useState<(() => void) | null>(null)
  const [presaleInfo, setPresaleInfo] = useState<PresaleInfo | null>(null)

  // ─── 搜索条件 ──────────────────────────────────────────────────────────────
  const [searchBrand, setSearchBrand] = useState<string | null>(null)
  const [searchAlgorithm, setSearchAlgorithm] = useState<string | null>(null)
  const [searchStoreName, setSearchStoreName] = useState<string | null>(null)
  const [searchBD, setSearchBD] = useState<string | null>(null)
  const [hasSearched, setHasSearched] = useState(false)

  // ─── 倒计时 ────────────────────────────────────────────────────────────────
  const [currentTime, setCurrentTime] = useState(Date.now())

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(Date.now())
    }, 1000)
    return () => clearInterval(timer)
  }, [])

  // ─── 自动释放过期锁定 ──────────────────────────────────────────────────────
  useEffect(() => {
    const expiredItems = cartItems.filter(item => currentTime - item.lockTime >= LOCK_DURATION_MS)
    if (expiredItems.length > 0) {
      setCartItems(prev => prev.filter(item => currentTime - item.lockTime < LOCK_DURATION_MS))
      expiredItems.forEach(item => {
        message.info(`${item.date} ${item.regionName} ${item.mealSlot} ${t('lockExpired')}`)
      })
      onLockExpired?.()
    }
  }, [currentTime, cartItems, LOCK_DURATION_MS, t, onLockExpired])

  // ─── 计算属性 ──────────────────────────────────────────────────────────────
  const activeDateStr = activeDate?.format('YYYY-MM-DD') || ''
  const hasCartItems = cartItems.length > 0

  // ─── 日期点击 ──────────────────────────────────────────────────────────────
  const handleDateClick = useCallback((date: Dayjs) => {
    if (isPresaleDate(date, sellableDays)) {
      const WEEKDAY_LABELS = t('weekdayFull', { returnObjects: true }) as string[]
      setPresaleInfo({
        date: date.format('YYYY-MM-DD'),
        weekday: WEEKDAY_LABELS[date.day()],
        openTime: getPresaleOpenTime(date, sellableDays).format(t('presaleDateFormat')),
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
  }, [sellableDays, t])

  // ─── 时段格子点击 ──────────────────────────────────────────────────────────
  const handleMealSlotClick = useCallback((date: Dayjs, mealSlot: MealSlotDef, regionKey: Region | string, isAvailable: boolean) => {
    if (!isAvailable) {
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
  }, [t])

  // ─── 冲突弹窗 ──────────────────────────────────────────────────────────────
  const handleConfirmSwitch = useCallback(() => {
    setIsConflictModalVisible(false)
    if (pendingAction) {
      pendingAction()
      setPendingAction(null)
    }
    setCartItems([])
    setHasSearched(false)
    message.success(t('clearedRegionSlot'))
  }, [pendingAction, t])

  const handleCancelSwitch = useCallback(() => {
    setIsConflictModalVisible(false)
    setPendingAction(null)
  }, [])

  // ─── 查询重置 ──────────────────────────────────────────────────────────────
  const resetSearchState = useCallback(() => {
    setSearchBrand(null)
    setSearchAlgorithm(null)
    setSearchStoreName(null)
    setSearchBD(null)
    setHasSearched(false)
    setSelectedCells([])
    setSelectedDates([])
    setActiveDate(null)
    setCurrentPage(1)
  }, [])

  // ─── 计算日期折扣 ──────────────────────────────────────────────────────────
  const getDateDiscount = useCallback((dateStr: string) => {
    const dateItems = cartItems.filter(item => item.date === dateStr)
    const totalSlots = dateItems.length
    for (const tier of multiSlotTiers) {
      if (totalSlots >= tier.minSlots) return tier
    }
    return null
  }, [cartItems, multiSlotTiers])

  // ─── 查询自动选中第一个日期 ──────────────────────────────────────────────────
  const autoSelectFirstDate = useCallback(() => {
    if (allDates.length > 0) {
      setSelectedDates([allDates[0]])
      setActiveDate(allDates[0])
      setSelectedCells([])
    }
  }, [allDates])

  return {
    // 日期
    selectedDates, setSelectedDates,
    activeDate, setActiveDate,
    hoveredDate, setHoveredDate,
    selectedCells, setSelectedCells,
    activeDateStr,

    // 购物车
    cartItems, setCartItems,
    hasCartItems,

    // 分页
    currentPage, setCurrentPage,
    pageSize, totalPages, dateList,

    // 弹窗
    isPaymentModalVisible, setIsPaymentModalVisible,
    isSuccessModalVisible, setIsSuccessModalVisible,
    isSoldOutModalVisible, setIsSoldOutModalVisible,
    soldOutDetails, setSoldOutDetails,
    isConflictModalVisible, setIsConflictModalVisible,
    pendingAction, setPendingAction,
    presaleInfo, setPresaleInfo,

    // 搜索
    searchBrand, setSearchBrand,
    searchAlgorithm, setSearchAlgorithm,
    searchStoreName, setSearchStoreName,
    searchBD, setSearchBD,
    hasSearched, setHasSearched,

    // 倒计时
    currentTime,

    // 处理函数
    handleDateClick,
    handleMealSlotClick,
    handleConfirmSwitch,
    handleCancelSwitch,
    resetSearchState,
    getDateDiscount,
    autoSelectFirstDate,
  }
}
