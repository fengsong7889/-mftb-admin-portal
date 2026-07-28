import { useState, useMemo, useEffect } from 'react'
import type { ReactNode, CSSProperties } from 'react'
import { Button, Card, DatePicker, Empty, Form, Modal, Select, Space, Tag, message } from 'antd'
import {
  SearchOutlined,
  ReloadOutlined,
  CheckCircleFilled,
  SkinOutlined,
  CalendarOutlined,
  ShoppingCartOutlined,
} from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import GradientDiscountBanner from './GradientDiscountBanner'
import dayjs from 'dayjs'
import type { Dayjs } from 'dayjs'

const { RangePicker } = DatePicker

/**
 * 人氣商家 - 購買廣告（皮膚售賣）
 * 對應銷售定價「人氣商家」皮膚定價配置：業務配置多套皮膚（邊框 + 大圖 + 菜品展示佈局）並按天定價，
 * 商家在此選擇皮膚套件 + 購買時長完成下單，購買後 APP 瀑布流店鋪卡片按所選皮膚展示。
 */

/** 菜品展示佈局（同銷售定價配置）：大圖拼列 / 階梯輪播 */
type DishLayout = 'grid' | 'carousel'
const DISH_LAYOUT_LABEL: Record<DishLayout, string> = { grid: '大圖拼列', carousel: '階梯輪播' }

/** 預覽用 Mock 餐品（與銷售定價預覽一致，bg 為餐品底圖漸變） */
const PREVIEW_DISHES = [
  { emoji: '🍔', name: '招牌雙層牛堡·特惠一人餐', price: '$43.3', original: '$65', discount: '6.6折', bg: 'linear-gradient(135deg, #FFE2B8, #FFAE5E)' },
  { emoji: '🍟', name: '黃金薯條（大）', price: '$12.9', original: '$19', discount: '6.8折', bg: 'linear-gradient(135deg, #FFF3C4, #FFD662)' },
  { emoji: '🥤', name: '冰爽可樂（中）', price: '$5.9', original: '$9', discount: '6.5折', bg: 'linear-gradient(135deg, #C9E7FF, #7FB8F0)' },
  { emoji: '🍦', name: '新地雪糕', price: '$8.9', original: '$12', discount: '7.4折', bg: 'linear-gradient(135deg, #FFE9F0, #FFC1D4)' },
]

/** 預覽標籤樣式（同定價預覽，縮小字號適配右側窄栏） */
const tagStyle = (color: string, bg: string): CSSProperties => ({
  fontSize: 9, color, background: bg, borderRadius: 3, padding: '1px 4px', whiteSpace: 'nowrap', flexShrink: 0,
})

/** 商家 LOGO：根據門店名稱生成（首字招牌 + 名稱哈希取色，同店同色），同 APP 店鋪卡 LOGO 位 */
const LOGO_PALETTES: [string, string][] = [
  ['#DA291C', '#FFC72C'], // 紅底金字
  ['#0F4C81', '#BFE3FF'], // 深藍底淺藍字
  ['#00754A', '#C9F2DE'], // 墨綠底淺綠字
  ['#5C2D91', '#E5D4FF'], // 紫底淡紫字
  ['#B45309', '#FDE68A'], // 棕底金字
  ['#C2185B', '#FAD1E0'], // 红色底粉字
]
/** 品牌門店專屬 LOGO（門店名命中即用品牌標誌） */
const BRAND_LOGOS: { match: string; bg: string; fg: string; mark: string }[] = [
  { match: '麥當勞', bg: '#DA291C', fg: '#FFC72C', mark: 'M' },   // 金拱門
  { match: '肯德基', bg: '#E4002B', fg: '#FFFFFF', mark: 'KFC' }, // KFC
]

const renderStoreLogo = (storeName: string, size: number) => {
  const name = storeName || '示例店鋪'
  const brand = BRAND_LOGOS.find(b => name.includes(b.match))
  if (brand) {
    return (
      <div style={{
        width: size, height: size, borderRadius: 8, flexShrink: 0,
        background: brand.bg, overflow: 'hidden',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2,
      }}>
        <span style={{
          fontSize: Math.round(size * (brand.mark.length > 1 ? 0.28 : 0.5)), fontWeight: 900, color: brand.fg,
          fontFamily: '"Arial Black", "Arial Rounded MT Bold", sans-serif',
          lineHeight: 1, letterSpacing: brand.mark.length > 1 ? 0 : -1, textShadow: '0 1px 1px rgba(0,0,0,0.18)',
        }}>{brand.mark}</span>
        <span style={{ fontSize: Math.max(7, Math.round(size * 0.16)), color: '#fff', fontWeight: 600, lineHeight: 1, whiteSpace: 'nowrap' }}>{brand.match}</span>
      </div>
    )
  }
  const hash = [...name].reduce((acc, ch) => acc + ch.charCodeAt(0), 0)
  const [bg, fg] = LOGO_PALETTES[hash % LOGO_PALETTES.length]
  return (
    <div style={{
      width: size, height: size, borderRadius: 8, flexShrink: 0,
      background: bg, overflow: 'hidden',
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2,
    }}>
      <span style={{ fontSize: Math.round(size * 0.42), fontWeight: 800, color: fg, lineHeight: 1 }}>{name.charAt(0)}</span>
      <span style={{
        fontSize: Math.max(7, Math.round(size * 0.16)), color: '#fff', fontWeight: 600, lineHeight: 1,
        maxWidth: size - 6, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      }}>{name.slice(0, 4)}</span>
    </div>
  )
}

/** 銷售中的皮膚套件（來自銷售定價-人氣商家配置） */
interface SaleSkin {
  id: number
  /** 皮膚名稱 */
  name: string
  /** 售價（MOP/天），來自定價配置 */
  pricePerDay: number
  /** 邊框類型（同定價配置：無邊框/選擇配色/上傳邊框，Mock 統一以配色呈現） */
  borderType: 'none' | 'color'
  /** 邊框配色 */
  borderColor?: string
  /** 皮膚主色漸變（大圖模式左側主圖示意） */
  tagBg: string
  /** 菜品展示佈局（同定價配置，商家選擇） */
  dishLayout: DishLayout
  /** 賣點描述 */
  desc: string
  /** 已售套數（氛圍數據） */
  sold: number
}

/** 海報標語：按皮膚 id 輪換，各皮膚標語不盡相同 */
const POSTER_SLOGANS = ['人氣商家', '人氣爆棚', '人氣之選', '人氣王牌', '人氣好店', '人氣首選']
const posterSlogan = (skinId: number) => POSTER_SLOGANS[skinId % POSTER_SLOGANS.length]

/** Mock：銷售定價已上架的皮膚套件 */
const SALE_SKINS: SaleSkin[] = [
  {
    id: 1, name: '紅運當頭', pricePerDay: 28, borderType: 'color', borderColor: '#FF4D4F',
    tagBg: 'linear-gradient(135deg, #FF4D4F, #FF7A45)', desc: '喜慶紅框，節慶檔期首選', sold: 386, dishLayout: 'grid',
  },
  {
    id: 2, name: '橙意滿滿', pricePerDay: 18, borderType: 'color', borderColor: '#E8720C',
    tagBg: 'linear-gradient(135deg, #E8720C, #F59432)', desc: '品牌橙框，醒目聚焦高轉化', sold: 512, dishLayout: 'carousel',
  },
  {
    id: 3, name: '紫氣東來', pricePerDay: 22, borderType: 'color', borderColor: '#722ED1',
    tagBg: 'linear-gradient(135deg, #722ED1, #9254DE)', desc: '高級紫框，品質商家氛圍感', sold: 208, dishLayout: 'grid',
  },
  {
    id: 4, name: '簡約無框', pricePerDay: 8, borderType: 'none',
    tagBg: 'linear-gradient(135deg, #8C8C8C, #BFBFBF)', desc: '無邊框輕量款，入門首選', sold: 655, dishLayout: 'grid',
  },
  {
    id: 5, name: '金碧輝煌', pricePerDay: 32, borderType: 'color', borderColor: '#FAAD14',
    tagBg: 'linear-gradient(135deg, #FAAD14, #FFC53D)', desc: '土豪金框，旺鋪氣場拉滿', sold: 173, dishLayout: 'carousel',
  },
  {
    id: 6, name: '碧海藍天', pricePerDay: 20, borderType: 'color', borderColor: '#1890FF',
    tagBg: 'linear-gradient(135deg, #1890FF, #40A9FF)', desc: '清爽藍框，飲品甜品百搭', sold: 294, dishLayout: 'grid',
  },
  {
    id: 7, name: '翠綠生機', pricePerDay: 20, borderType: 'color', borderColor: '#52C41A',
    tagBg: 'linear-gradient(135deg, #52C41A, #73D13D)', desc: '健康綠框，輕食沙拉首選', sold: 231, dishLayout: 'grid',
  },
  {
    id: 8, name: '青峰翡翠', pricePerDay: 24, borderType: 'color', borderColor: '#13C2C2',
    tagBg: 'linear-gradient(135deg, #13C2C2, #36CFC9)', desc: '青碧色框，清新耳目一新', sold: 156, dishLayout: 'grid',
  },
  {
    id: 9, name: '粉黛甜心', pricePerDay: 26, borderType: 'color', borderColor: '#EB2F96',
    tagBg: 'linear-gradient(135deg, #EB2F96, #F759AB)', desc: '少女粉框，甜品烘焙拉滿好感', sold: 342, dishLayout: 'carousel',
  },
  {
    id: 10, name: '暗夜黑金', pricePerDay: 30, borderType: 'color', borderColor: '#434343',
    tagBg: 'linear-gradient(135deg, #434343, #8C8C8C)', desc: '高冷黑框，西餐日料質感拉滿', sold: 128, dishLayout: 'grid',
  },
  {
    id: 11, name: '橘光暮色', pricePerDay: 25, borderType: 'color', borderColor: '#FA541C',
    tagBg: 'linear-gradient(135deg, #FA541C, #FF7A45)', desc: '暮色橘框，宵夜燒烤氛圍感', sold: 267, dishLayout: 'carousel',
  },
  {
    id: 12, name: '極光幻彩', pricePerDay: 36, borderType: 'color', borderColor: '#2F54EB',
    tagBg: 'linear-gradient(135deg, #2F54EB, #722ED1)', desc: '幻彩漸變框，旗艦頂級曝光款', sold: 95, dishLayout: 'carousel',
  },
]

/** 梯度折扣（同銷售定價配置） */
const DISCOUNT_TIERS = [
  { minDays: 7, discount: 95 },
  { minDays: 15, discount: 90 },
  { minDays: 30, discount: 85 },
]

/** 最長可購買天數（滾動窗口，超出即為待開售日期） */
const MAX_BUY_DAYS = 180
/** 人氣商家皮膚售賣不允許退款（對應銷售定價中的退款開關） */
const REFUND_ENABLED = false
/** 待開售日期每日放票時間（同盤活復蘇，火車票式滾動開售） */
const PRESALE_OPEN_HOUR = 10
/** 待開售日期的開售時間（提前 MAX_BUY_DAYS 天、於 PRESALE_OPEN_HOUR 點開售） */
function getPresaleOpenTime(date: Dayjs): Dayjs {
  return date.startOf('day').subtract(MAX_BUY_DAYS, 'day').hour(PRESALE_OPEN_HOUR).minute(0).second(0)
}

/** 中文星期映射（週日開頭，與日曆列對齊） */
const WEEKDAY_LABELS = ['日', '一', '二', '三', '四', '五', '六']

/** 月份選擇器每頁展示數（超出用上下頁按鈕切換） */
const MONTHS_PER_PAGE = 6

/** Mock數據 - 店鋪列表（含BD信息，與其它購買界面一致） */
const MOCK_STORES = [
  { id: '10001', name: '威尼斯人酒店', bd: 'bd-001', bdName: '張偉' },
  { id: '10002', name: '皇朝廣場店', bd: 'bd-002', bdName: '李娜' },
  { id: '10003', name: '黑馬仕美食街', bd: 'bd-003', bdName: '王強' },
  { id: '10004', name: '新葡京旗艦店', bd: 'bd-001', bdName: '張偉' },
  { id: '10005', name: '官也街老店', bd: 'bd-004', bdName: '劉敏' },
  { id: '10006', name: '麥當勞', bd: 'bd-002', bdName: '李娜' },
  { id: '10007', name: '肯德基', bd: 'bd-003', bdName: '王強' },
]
const STORE_OPTIONS = MOCK_STORES.map(s => ({ label: `${s.name}（ID：${s.id}）`, value: s.id }))
const BD_OPTIONS = [
  { label: '張偉', value: 'bd-001' },
  { label: '李娜', value: 'bd-002' },
  { label: '王強', value: 'bd-003' },
  { label: '劉敏', value: 'bd-004' },
]
/** 人氣商家算法選項（選擇後自動帶出品牌） */
const ALGORITHM_OPTIONS = [
  { label: '人氣商家-首頁版', value: 'popular_merchant_ka', brand: 'shanfeng' },
  { label: '人氣商家-外賣版', value: 'popular_merchant_delivery', brand: 'mfood' },
]

export default function PopularSkinPicker() {
  const navigate = useNavigate()

  // 查詢條件（算法名稱 / 所屬品牌 / 門店名稱 / 歸屬BD，與其它購買界面保持一致）
  const [searchAlgorithm, setSearchAlgorithm] = useState<string | null>(null)
  const [searchBrand, setSearchBrand] = useState<string | null>(null)
  const [searchStoreName, setSearchStoreName] = useState<string | null>(null)
  const [searchBD, setSearchBD] = useState<string | null>(null)
  const [hasSearched, setHasSearched] = useState(false)

  // 選購狀態
  const [selectedSkinId, setSelectedSkinId] = useState<number | null>(null)
  // 自選日期狀態：已選日期 / 日曆當前月 / 批量添加範圍 / 每週休息日
  const [customDates, setCustomDates] = useState<string[]>([])
  const [calMonth, setCalMonth] = useState<Dayjs>(dayjs().add(1, 'day').startOf('month'))
  const [hoveredCalMonth, setHoveredCalMonth] = useState<string | null>(null)
  const [monthPage, setMonthPage] = useState(0)
  const [batchRange, setBatchRange] = useState<[Dayjs | null, Dayjs | null] | null>(null)
  const [excludedWeekdays, setExcludedWeekdays] = useState<number[]>([])
  // 待開售提醒彈窗（同盤活復蘇規範）
  const [presaleInfo, setPresaleInfo] = useState<{ date: string; weekday: string; openTime: string } | null>(null)
  const [merchantBalance, setMerchantBalance] = useState(15800)
  const [isPaymentModalVisible, setIsPaymentModalVisible] = useState(false)
  const [isSuccessModalVisible, setIsSuccessModalVisible] = useState(false)
  // 階梯輪播餐品指針（同定價預覽）：current 為當前張，prev 為正在向左滑出的上一張
  const [dishState, setDishState] = useState<{ current: number; prev: number | null }>({ current: 0, prev: null })

  const selectedSkin = SALE_SKINS.find(s => s.id === selectedSkinId) || null
  const selectedStore = MOCK_STORES.find(s => s.id === searchStoreName) || null

  // 自選日期可選範圍：最早次日生效，最晚 MAX_BUY_DAYS 天內
  const customMinDate = dayjs().add(1, 'day').startOf('day')
  const customMaxDate = dayjs().add(MAX_BUY_DAYS, 'day').startOf('day')
  // 自選日期：可切換的月份列表（覆蓋整個可選範圍，補齊至整頁，補出的月份整月待開售）
  const calMonths: Dayjs[] = []
  for (let m = customMinDate.startOf('month'); !m.isAfter(customMaxDate, 'month'); m = m.add(1, 'month')) calMonths.push(m)
  while (calMonths.length % MONTHS_PER_PAGE !== 0) calMonths.push(calMonths[calMonths.length - 1].add(1, 'month'))
  // 月份分頁：每頁 6 個，超出用上下頁按鈕切換
  const monthPageCount = Math.ceil(calMonths.length / MONTHS_PER_PAGE)
  const visibleMonths = calMonths.slice(monthPage * MONTHS_PER_PAGE, (monthPage + 1) * MONTHS_PER_PAGE)
  // 生效購買天數：取已選日期數
  const effectiveDays = customDates.length
  // 投放時段文案（結算欄 / 支付彈窗）：首末日期區間
  const periodText = customDates.length > 0
    ? `${dayjs(customDates[0]).format('MM-DD')} ~ ${dayjs(customDates[customDates.length - 1]).format('MM-DD')}（自選${customDates.length}天）`
    : '未選擇'
  const periodTextFull = customDates.length > 0
    ? `${customDates[0]} ~ ${customDates[customDates.length - 1]}（自選${customDates.length}天）`
    : '未選擇'

  // 階梯輪播預覽：所選皮膚為階梯輪播佈局時逐張輪播，切換皮膚時重置
  useEffect(() => {
    if (!selectedSkin || selectedSkin.dishLayout !== 'carousel') return
    setDishState({ current: 0, prev: null })
    const timer = setInterval(() => {
      setDishState(s => ({ current: (s.current + 1) % PREVIEW_DISHES.length, prev: s.current }))
    }, 2200)
    return () => clearInterval(timer)
  }, [selectedSkin])

  // 命中折扣檔位（按生效購買天數計算，兩種模式通用）
  const currentTier = useMemo(() => {
    for (let i = DISCOUNT_TIERS.length - 1; i >= 0; i--) {
      if (effectiveDays >= DISCOUNT_TIERS[i].minDays) return DISCOUNT_TIERS[i]
    }
    return null
  }, [effectiveDays])

  // 費用計算
  const priceSummary = useMemo(() => {
    if (!selectedSkin) return { original: 0, sale: 0, saved: 0 }
    const original = selectedSkin.pricePerDay * effectiveDays
    const sale = currentTier ? Math.round(original * currentTier.discount / 100) : original
    return { original, sale, saved: original - sale }
  }, [selectedSkin, effectiveDays, currentTier])

  // 自選日期：當前月日曆網格（週日開頭，含首尾空位）
  const customCalendarGrid = useMemo(() => {
    const firstDay = calMonth.startOf('month')
    const daysInMonth = calMonth.daysInMonth()
    const weeks: (Dayjs | null)[][] = []
    let week: (Dayjs | null)[] = []
    for (let i = 0; i < firstDay.day(); i++) week.push(null)
    for (let d = 1; d <= daysInMonth; d++) {
      week.push(firstDay.date(d))
      if (week.length === 7) { weeks.push(week); week = [] }
    }
    if (week.length > 0) { while (week.length < 7) week.push(null); weeks.push(week) }
    return weeks
  }, [calMonth])

  // 自選日期：按月分組摘要（customDates 有序，分組後天然按時間排列）
  const customDatesByMonth = useMemo(() => {
    const grouped: Record<string, number[]> = {}
    customDates.forEach(ds => {
      const d = dayjs(ds)
      const key = d.format('YYYY年M月')
      ;(grouped[key] = grouped[key] || []).push(d.date())
    })
    return Object.entries(grouped).map(([month, days]) => ({ month, days }))
  }, [customDates])

  // 算法變更：自動帶出品牌
  const handleAlgorithmChange = (value: string | null) => {
    setSearchAlgorithm(value)
    setSearchBrand(ALGORITHM_OPTIONS.find(o => o.value === value)?.brand ?? null)
  }
  // 門店變更：自動帶出BD
  const handleStoreChange = (value: string | null) => {
    setSearchStoreName(value)
    setSearchBD(MOCK_STORES.find(s => s.id === value)?.bd ?? null)
  }

  const handleSearch = () => {
    if (!searchAlgorithm) { message.warning('請選擇算法名稱'); return }
    if (!searchBrand) { message.warning('請選擇所屬品牌'); return }
    if (!searchStoreName) { message.warning('請選擇門店名稱'); return }
    setHasSearched(true)
  }
  const handleReset = () => {
    setSearchAlgorithm(null); setSearchBrand(null)
    setSearchStoreName(null); setSearchBD(null)
    setHasSearched(false); setSelectedSkinId(null)
  }

  // 自選日期：點擊日曆單日選中/取消
  const handleCustomDateClick = (date: Dayjs | null) => {
    if (!date) return
    if (date.isBefore(customMinDate, 'day')) { message.warning('最早可選次日（購買後於開始日期 00:00 生效）'); return }
    if (date.isAfter(customMaxDate, 'day')) {
      // 待開售日期：彈窗提示開售時間（同盤活復蘇規範）
      setPresaleInfo({
        date: date.format('YYYY-MM-DD'),
        weekday: WEEKDAY_LABELS[date.day()],
        openTime: getPresaleOpenTime(date).format('M月D日 HH:mm'),
      })
      return
    }
    const key = date.format('YYYY-MM-DD')
    setCustomDates(prev => prev.includes(key) ? prev.filter(d => d !== key) : [...prev, key].sort())
  }
  // 自選日期：切換每週休息日（批量添加時自動跳過）
  const handleToggleWeekday = (day: number) => {
    setExcludedWeekdays(prev => prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day])
  }
  // 自選日期：按範圍批量添加（自動跳過休息日與不可選日期）
  const handleBatchAdd = () => {
    if (!batchRange || !batchRange[0] || !batchRange[1]) { message.warning('請先選擇日期範圍'); return }
    const merged = new Set(customDates)
    let added = 0
    for (let d = batchRange[0].startOf('day'); !d.isAfter(batchRange[1], 'day'); d = d.add(1, 'day')) {
      if (d.isBefore(customMinDate, 'day') || d.isAfter(customMaxDate, 'day')) continue
      if (excludedWeekdays.includes(d.day())) continue
      const key = d.format('YYYY-MM-DD')
      if (!merged.has(key)) { merged.add(key); added++ }
    }
    if (added === 0) { message.info('該範圍內沒有可添加的日期'); return }
    setCustomDates([...merged].sort())
    message.success(`已添加 ${added} 天${excludedWeekdays.length > 0 ? '（已自動跳過休息日）' : ''}`)
  }
  const handleClearCustomDates = () => setCustomDates([])

  // 訂單支付
  const handlePayment = () => {
    if (!selectedSkin) { message.warning('請先選擇皮膚套件'); return }
    if (customDates.length === 0) { message.warning('請先在日曆中選擇投放日期'); return }
    if (priceSummary.sale > merchantBalance) { message.error('推廣金餘額不足，請先充值'); return }
    setIsPaymentModalVisible(true)
  }
  const handleConfirmPayment = () => {
    setMerchantBalance(prev => prev - priceSummary.sale)
    setIsPaymentModalVisible(false)
    setIsSuccessModalVisible(true)
  }
  const handleViewOrder = () => {
    setIsSuccessModalVisible(false)
    navigate(`/promotion-order-manage?type=${encodeURIComponent('人氣商家')}&from=ad-sales`)
  }
  const handleContinuePurchase = () => {
    setIsSuccessModalVisible(false)
    setSelectedSkinId(null)
    message.success('可繼續為門店選購其它皮膚')
  }

  /** 店鋪信息行（與銷售定價預覽字段保持一致：店名 + 評分/月售/起送信息） */
  const previewInfoRows = (nameSize: number) => (
    <>
      <div style={{
        fontSize: nameSize, fontWeight: 600, color: '#262626',
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      }}>{selectedStore?.name || '示例店鋪'}</div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 3, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: '#FA8C16' }}>⭐ 4.6</span>
        <span style={{ fontSize: 10, color: '#8C8C8C' }}>月售 1196</span>
        <span style={{ fontSize: 10, color: '#8C8C8C' }}>起送$40・減配$0~3・32分鐘・1.9km</span>
      </div>
    </>
  )

  /** 標籤行：銷量/店鋪/評價標籤合併一排不換行（同定價預覽） */
  const previewTagsRow = () => (
    <div style={{ display: 'flex', gap: 3, marginTop: 6, flexWrap: 'nowrap', overflow: 'hidden' }}>
      <span style={tagStyle('#1565C0', '#E3F2FD')}>全澳銷量第1名</span>
      <span style={tagStyle('#722ED1', '#F9F0FF')}>熱門店鋪</span>
      <span style={tagStyle('#D46B08', '#FFF3E8')}>金黃酥脆，澳門人氣漢堡首選！</span>
      <span style={tagStyle('#8C8C8C', '#F5F5F5')}>千人收藏好店</span>
    </div>
  )

  /** 小圖模式預覽（同定價預覽：LOGO + 信息 + 標籤一排，皮膚體現為卡片邊框） */
  const renderSkinPreview = (skin: SaleSkin, large?: boolean) => (
    <div style={{
      position: 'relative', background: '#fff', borderRadius: 10,
      padding: large ? '12px 14px' : '10px 12px',
      border: skin.borderType === 'color' ? `2px solid ${skin.borderColor}` : '1px solid #f0f0f0',
      boxShadow: skin.borderType === 'color' ? `0 2px 8px ${skin.borderColor}33` : '0 1px 4px rgba(0,0,0,0.04)',
    }}>
      <div style={{ display: 'flex', gap: large ? 10 : 8 }}>
        {renderStoreLogo(selectedStore?.name || '示例店鋪', large ? 56 : 44)}
        <div style={{ flex: 1, minWidth: 0 }}>
          {previewInfoRows(large ? 13 : 12)}
        </div>
      </div>
      {previewTagsRow()}
    </div>
  )

  /** 菜品佈局① 大圖拼列（縮小版，同定價預覽：左 1 張大圖疊價格 + 右 2 張小圖） */
  const renderDishGridMini = () => (
    <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 6, marginTop: 8 }}>
      <div style={{ position: 'relative', borderRadius: 8, overflow: 'hidden', background: PREVIEW_DISHES[0].bg, height: 92 }}>
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 54, lineHeight: 1 }}>
          {PREVIEW_DISHES[0].emoji}
        </div>
        <div style={{
          position: 'absolute', left: 0, right: 0, bottom: 0, padding: '12px 6px 4px',
          background: 'linear-gradient(180deg, transparent, rgba(0,0,0,0.55))',
        }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: '#fff' }}>{PREVIEW_DISHES[0].price}</span>
          <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.75)', textDecoration: 'line-through', marginLeft: 4 }}>{PREVIEW_DISHES[0].original}</span>
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {PREVIEW_DISHES.slice(1, 3).map(dish => (
          <div key={dish.name} style={{
            borderRadius: 8, background: dish.bg, height: 43,
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28, lineHeight: 1,
          }}>{dish.emoji}</div>
        ))}
      </div>
    </div>
  )

  /** 菜品佈局② 階梯輪播（縮小版，同定價預覽）：頂層向左滑出的同時，後方卡片沿階梯位彈性頂上來 */
  const renderDishCarouselMini = () => {
    const n = PREVIEW_DISHES.length
    // 堆疊深度位：0=前方主卡，1/2=後方階梯卡
    const depthStyles: CSSProperties[] = [
      { top: 0, bottom: 0, left: 0, right: '28%', zIndex: 3, opacity: 1, transform: 'translateX(0) rotate(0deg)', boxShadow: '3px 0 10px rgba(0,0,0,0.12)' },
      { top: 6, bottom: 6, left: 22, right: 0, zIndex: 2, opacity: 0.75, transform: 'translateX(0) rotate(0deg)', boxShadow: 'none' },
      { top: 12, bottom: 12, left: 44, right: -4, zIndex: 1, opacity: 0.5, transform: 'translateX(0) rotate(0deg)', boxShadow: 'none' },
    ]
    // 離場位：沿主卡位置向左滑出淡出（容器 overflow hidden 裁剪）
    const exitStyle: CSSProperties = { top: 0, bottom: 0, left: 0, right: '28%', zIndex: 4, opacity: 0, transform: 'translateX(-118%) rotate(-5deg)' }
    return (
      <div style={{ position: 'relative', height: 104, marginTop: 8, overflow: 'hidden' }}>
        {PREVIEW_DISHES.map((dish, i) => {
          const depth = (i - dishState.current + n) % n
          const prevDepth = dishState.prev !== null ? (i - dishState.prev + n) % n : depth
          // 剛離場：帶過渡向左滑出；歸隊：直接停到隊尾階梯位淡入，不做跨屏橫穿
          const isExiting = depth > 2 && prevDepth === 0
          const reJoining = depth <= 2 && prevDepth > 2
          const style = depth <= 2 ? depthStyles[depth] : isExiting ? exitStyle : { ...depthStyles[2], opacity: 0, zIndex: 0 }
          const isFront = depth === 0 || isExiting
          return (
            <div key={dish.name} style={{
              position: 'absolute', borderRadius: 8, overflow: 'hidden', background: dish.bg, pointerEvents: 'none',
              transition: reJoining ? 'none' : 'all 0.65s cubic-bezier(0.34, 1.25, 0.5, 1)',
              animation: reJoining ? 'dishBackIn 0.5s ease' : undefined,
              ...style,
            }}>
              {/* 餐品铺滿整卡，後方卡同步縮小，頂上來時平滑放大 */}
              <div style={{
                position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 72, lineHeight: 1,
                transform: isFront ? 'scale(1)' : 'scale(0.6)',
                filter: isFront ? 'none' : 'saturate(0.85)',
                transition: reJoining ? 'none' : 'transform 0.65s cubic-bezier(0.34, 1.25, 0.5, 1), filter 0.4s ease',
              }}>{dish.emoji}</div>
              {/* 折扣膠囊 + 名稱條：僅前方主卡展示，頂上來後延遲淡入 */}
              <div style={{ opacity: isFront ? 1 : 0, transition: 'opacity 0.3s ease 0.25s' }}>
                <div style={{ position: 'absolute', left: 5, bottom: 22, display: 'flex', alignItems: 'stretch', borderRadius: 10, overflow: 'hidden' }}>
                  <span style={{ fontSize: 9, fontWeight: 700, color: '#E8302D', background: '#fff', padding: '2px 5px' }}>🏷️ {dish.discount}</span>
                  <span style={{ fontSize: 10, fontWeight: 700, color: '#fff', background: '#E8302D', padding: '2px 5px', display: 'flex', alignItems: 'baseline', gap: 2 }}>
                    {dish.price}
                    <span style={{ fontSize: 8, fontWeight: 400, color: 'rgba(255,255,255,0.8)', textDecoration: 'line-through' }}>{dish.original}</span>
                  </span>
                </div>
                <div style={{
                  position: 'absolute', left: 0, right: 0, bottom: 0, padding: '2px 6px',
                  background: 'rgba(255,255,255,0.92)', fontSize: 10, fontWeight: 600, color: '#262626',
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>{dish.name}</div>
              </div>
            </div>
          )
        })}
        {/* 輪播指示點 */}
        <div style={{ position: 'absolute', right: 3, bottom: 3, zIndex: 5, display: 'flex', gap: 3 }}>
          {PREVIEW_DISHES.map((_, i) => (
            <span key={i} style={{
              width: i === dishState.current ? 10 : 4, height: 4, borderRadius: 2,
              background: i === dishState.current ? '#E8302D' : '#D9D9D9', transition: 'all 0.3s',
            }} />
          ))}
        </div>
      </div>
    )
  }

  /** 大圖模式預覽（同定價預覽：左側豎版主圖 + 右側信息/標籤 + 按皮膚配置的菜品佈局） */
  const renderSkinBigPreview = (skin: SaleSkin) => (
    <div style={{
      position: 'relative', background: '#fff', borderRadius: 10, padding: '12px 14px',
      border: skin.borderType === 'color' ? `2px solid ${skin.borderColor}` : '1px solid #f0f0f0',
      boxShadow: skin.borderType === 'color' ? `0 2px 8px ${skin.borderColor}33` : '0 1px 4px rgba(0,0,0,0.04)',
    }}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'stretch' }}>
        {/* 左側豎版主圖（3:4）：人氣商家宣傳海報，標語與皮膚漸變底融為一體 */}
        <div style={{
          position: 'relative', width: 84, flexShrink: 0, alignSelf: 'stretch', borderRadius: 8,
          background: skin.tagBg, overflow: 'hidden',
          display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '10px 6px 8px',
        }}>
          {/* 光影縱深：頂部提亮、底部壓暗，讓文字自然沉入背景 */}
          <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(255,255,255,0.22) 0%, rgba(255,255,255,0) 38%, rgba(0,0,0,0) 62%, rgba(0,0,0,0.28) 100%)' }} />
          {/* 巨型水印「人」字：半透明嚆空效果，作為背景紋理 */}
          <span style={{
            position: 'absolute', bottom: -14, right: -10, fontSize: 88, fontWeight: 900, lineHeight: 1,
            color: 'rgba(255,255,255,0.12)', userSelect: 'none', pointerEvents: 'none',
          }}>人</span>
          {renderStoreLogo(selectedStore?.name || '示例店鋪', 40)}
          {/* 豎排標語：白→半透漸變字溶入底色，不加任何牌面/邊框 */}
          <div style={{ position: 'relative', flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{
              writingMode: 'vertical-rl', fontSize: 19, fontWeight: 900, letterSpacing: 7, lineHeight: 1,
              background: 'linear-gradient(180deg, #FFFFFF 0%, rgba(255,255,255,0.55) 100%)',
              WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent',
            }}>{posterSlogan(skin.id)}</span>
          </div>
          {/* 底部淡化英文副標，融於壓暗區 */}
          <span style={{ position: 'relative', fontSize: 8, fontWeight: 700, color: 'rgba(255,255,255,0.65)', letterSpacing: 3, whiteSpace: 'nowrap' }}>POPULAR</span>
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          {previewInfoRows(13)}
          {previewTagsRow()}
          {/* 菜品展示區：按皮膚配置的佈局展示（大圖拼列 / 階梯輪播） */}
          {skin.dishLayout === 'grid' ? renderDishGridMini() : renderDishCarouselMini()}
        </div>
      </div>
    </div>
  )

  /** 默認樣式店鋪卡（無皮膚，用作瀑布流上下列對比） */
  const renderNormalCard = (storeName: string, emoji: string, rating: string) => (
    <div style={{
      background: '#fff', borderRadius: 10, padding: '10px 12px', border: '1px solid #f0f0f0',
    }}>
      <div style={{ display: 'flex', gap: 8 }}>
        <div style={{
          width: 44, height: 44, borderRadius: 8, background: '#f0f0f0', flexShrink: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18,
        }}>{emoji}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontSize: 12, fontWeight: 600, color: '#262626',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>{storeName}</div>
          <div style={{ fontSize: 10, color: '#8C8C8C', marginTop: 3 }}>{rating}</div>
        </div>
      </div>
    </div>
  )

  /** 瀑布流對比包裝：上下為模糊的普通店鋪，中間突出當前所選皮膚效果 */
  const renderWaterfallCompare = (skinCard: ReactNode) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ filter: 'blur(0.5px)', opacity: 0.8, transform: 'scale(0.97)', pointerEvents: 'none' }}>
        {renderNormalCard('老友記茶餐廳', '🍜', '★4.2 月售 866')}
      </div>
      <div style={{ position: 'relative' }}>
        <span style={{
          position: 'absolute', top: -9, right: 10, zIndex: 1,
          fontSize: 10, color: '#fff', fontWeight: 600,
          background: 'linear-gradient(135deg, #E8720C, #F59432)',
          borderRadius: 8, padding: '1px 8px', lineHeight: '16px',
          boxShadow: '0 2px 6px rgba(232,114,12,0.35)',
        }}>您的門店</span>
        {skinCard}
      </div>
      <div style={{ filter: 'blur(0.5px)', opacity: 0.8, transform: 'scale(0.97)', pointerEvents: 'none' }}>
        {renderNormalCard('街角咖啡', '☕', '★4.6 月售 1024')}
      </div>
    </div>
  )

  return (
    <div>
      {/* 查詢區域 - 與其它購買界面保持一致 */}
      <div className="search-section" style={{ marginBottom: 16 }}>
        <Form layout="inline" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px 12px' }}>
          <Form.Item label="算法名稱">
            <Select placeholder="請輸入搜索" value={searchAlgorithm} onChange={handleAlgorithmChange} allowClear showSearch optionFilterProp="label"
              options={ALGORITHM_OPTIONS.map(o => ({ label: o.label, value: o.value }))} />
          </Form.Item>
          <Form.Item label="所屬品牌">
            <Select placeholder="選擇算法後自動帶出" value={searchBrand} onChange={v => setSearchBrand(v)} allowClear
              options={[{ label: '閃蜂', value: 'shanfeng' }, { label: 'mFood', value: 'mfood' }]} />
          </Form.Item>
          <Form.Item label="門店名稱">
            <Select placeholder="支持ID和名稱搜索" value={searchStoreName} onChange={handleStoreChange} allowClear showSearch optionFilterProp="label" options={STORE_OPTIONS} />
          </Form.Item>
          <Form.Item label="歸屬BD">
            <Select placeholder="選擇門店後自動帶出" value={searchBD} onChange={v => setSearchBD(v)} allowClear showSearch optionFilterProp="label" options={BD_OPTIONS} />
          </Form.Item>
          <Form.Item>
            <div className="search-actions">
              <Button type="primary" icon={<SearchOutlined />} onClick={handleSearch}>查詢</Button>
              <Button icon={<ReloadOutlined />} onClick={handleReset}>重置</Button>
            </div>
          </Form.Item>
        </Form>
      </div>

      {!hasSearched ? (
        <Card bodyStyle={{ padding: '48px 24px' }}>
          <Empty description="請先選擇算法名稱、所屬品牌、門店名稱，點擊查詢後展示可購買的皮膚套件" image={Empty.PRESENTED_IMAGE_SIMPLE} />
        </Card>
      ) : (
        <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
          {/* 左側：選皮膚 + 選時長 */}
          <div style={{ flex: 1, minWidth: 0 }}>
            {/* ① 選擇皮膚套件（簡化卡片：色块示意 + 名稱 + 價格，每行 4 個） */}
            <Card
              title={
                <div>
                  <Space><SkinOutlined style={{ color: '#E8720C' }} /><span>選擇皮膚套件</span><span style={{ fontSize: 12, color: '#8C8C8C', fontWeight: 400 }}>點擊選中，右側可預覽實際展示效果</span></Space>
                  {/* 購買規則說明：生效時間 / 唯一生效 / 到期恢復 */}
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
                    marginTop: 8, padding: '6px 12px', borderRadius: 6,
                    background: '#FFF9F0', border: '1px solid #FFE0B2',
                  }}>
                    <span style={{ fontSize: 12, fontWeight: 400, color: '#8C6E00', whiteSpace: 'nowrap' }}>⏰ 購買後於開始日期 00:00 自動生效</span>
                    <span style={{ color: '#FFD591' }}>|</span>
                    <span style={{ fontSize: 12, fontWeight: 400, color: '#8C6E00', whiteSpace: 'nowrap' }}>☁️ 同一門店同一時段僅可生效一套皮膚</span>
                    <span style={{ color: '#FFD591' }}>|</span>
                    <span style={{ fontSize: 12, fontWeight: 400, color: '#8C6E00', whiteSpace: 'nowrap' }}>🔄 到期後自動恢復默認樣式，可隨時續購</span>
                  </div>
                </div>
              }
              style={{ marginBottom: 16 }} bodyStyle={{ padding: '16px 20px' }}
            >
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
                {SALE_SKINS.map(skin => {
                  const isSelected = selectedSkinId === skin.id
                  return (
                    <div
                      key={skin.id}
                      title={skin.desc}
                      onClick={() => setSelectedSkinId(skin.id)}
                      style={{
                        position: 'relative', borderRadius: 10, padding: 12, cursor: 'pointer',
                        border: isSelected ? '2px solid #E8720C' : '1px solid #f0f0f0',
                        background: isSelected ? '#FFF7E6' : '#FAFAFA',
                        boxShadow: isSelected ? '0 4px 12px rgba(232,114,12,0.18)' : 'none',
                        transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
                      }}
                      onMouseEnter={e => { if (!isSelected) e.currentTarget.style.transform = 'translateY(-2px)' }}
                      onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)' }}
                    >
                      {isSelected && (
                        <CheckCircleFilled style={{ position: 'absolute', top: 8, right: 8, fontSize: 16, color: '#E8720C', zIndex: 1 }} />
                      )}
                      {/* 皮膚色块示意：邊框色 + 套件名稱（定價已取消標籤配置，不再展示人氣標籤） */}
                      <div style={{
                        height: 56, borderRadius: 8, background: '#fff',
                        border: skin.borderType === 'color' ? `2px solid ${skin.borderColor}` : '1px dashed #d9d9d9',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '0 8px',
                      }}>
                        <span style={{
                          fontSize: 13, fontWeight: 600, color: '#262626',
                          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        }}>{skin.name}</span>
                      </div>
                      {/* 菜品展示佈局（同定價配置）+ 已售 + 價格 */}
                      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 8 }}>
                        <span style={{
                          fontSize: 9, color: '#595959', background: '#F0F0F0', borderRadius: 3,
                          padding: '1px 5px', flexShrink: 0,
                        }}>{DISH_LAYOUT_LABEL[skin.dishLayout]}</span>
                        <span style={{ fontSize: 10, color: '#E8720C', whiteSpace: 'nowrap' }}>🔥已售{skin.sold}套</span>
                        <div style={{ flex: 1 }} />
                        <span style={{ fontSize: 16, fontWeight: 700, color: '#FF4D4F' }}>${skin.pricePerDay}</span>
                        <span style={{ fontSize: 10, color: '#8C8C8C', marginLeft: 1 }}>/天</span>
                      </div>
                    </div>
                  )
                })}
              </div>
            </Card>

            {/* ② 選擇購買時長：自選日期（日曆跳選），滿足打烊、休息日等靈活投放需求 */}
            <Card
              title={<Space><CalendarOutlined style={{ color: '#1890FF' }} /><span>選擇購買時長</span><span style={{ fontSize: 12, color: '#8C8C8C', fontWeight: 400 }}>按天計價，購買越多折扣越大</span></Space>}
              bodyStyle={{ padding: '16px 20px' }}
            >
              {/* 梯度折扣橫幅：常駐展示折扣規則與不可退款標識（同盤活復蘇） */}
              <GradientDiscountBanner
                tiers={DISCOUNT_TIERS.map(t => ({ threshold: t.minDays, discount: t.discount }))}
                unitLabel="天"
                currentCount={customDates.length}
                refundDisabled={!REFUND_ENABLED}
              />

              <div>
                  {/* 月份橫向選擇器（樣式同盤活復蘇購買界面）：一排 6 個月，超出用上下頁按鈕切換（同無敵星星風格） */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                    <Button
                      size="small"
                      disabled={monthPage === 0}
                      onClick={() => setMonthPage(p => Math.max(0, p - 1))}
                    >
                      ◀
                    </Button>
                    <div style={{ flex: 1, display: 'flex', gap: 4 }}>
                    {visibleMonths.map(m => {
                      const monthStr = m.format('YYYY-MM')
                      const isSelected = m.isSame(calMonth, 'month')
                      const isHovered = hoveredCalMonth === monthStr
                      const hasSelectedDates = customDates.some(d => dayjs(d).isSame(m, 'month'))
                      // 整月待開售：月初首日即超出可購範圍，直接標記待開售（同盤活復蘇）
                      const monthPresale = m.startOf('month').isAfter(customMaxDate, 'day')
                      return (
                        <div
                          key={monthStr}
                          onClick={() => {
                            if (monthPresale) {
                              // 整月待開售：彈窗提示首日開售時間（同盤活復蘇規範）
                              const firstDay = m.startOf('month')
                              setPresaleInfo({
                                date: firstDay.format('YYYY-MM-DD'),
                                weekday: WEEKDAY_LABELS[firstDay.day()],
                                openTime: getPresaleOpenTime(firstDay).format('M月D日 HH:mm'),
                              })
                              return
                            }
                            setCalMonth(m)
                          }}
                          onMouseEnter={() => setHoveredCalMonth(monthStr)}
                          onMouseLeave={() => setHoveredCalMonth(null)}
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
                            {m.year() === dayjs().year() ? m.format('M月') : m.format('YY年M月')}
                          </span>
                          {monthPresale && (
                            <span style={{ fontSize: 11, color: '#8c8c8c', marginLeft: 4, border: '1px solid #d9d9d9', borderRadius: 3, padding: '0 3px', background: '#f5f5f5' }}>🔒待開售</span>
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
                      onClick={() => setMonthPage(p => Math.min(monthPageCount - 1, p + 1))}
                    >
                      ▶
                    </Button>
                  </div>

                  {/* 批量添加工具欄：日期範圍 + 每週休息日排除 */}
                  <div style={{ background: '#FAFAFA', borderRadius: 8, padding: '10px 12px', marginBottom: 12 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 13, color: '#595959' }}>批量添加：</span>
                      <RangePicker
                        size="small"
                        value={batchRange}
                        onChange={v => setBatchRange(v)}
                        disabledDate={d => d.isBefore(customMinDate, 'day') || d.isAfter(customMaxDate, 'day')}
                      />
                      <Button size="small" type="primary" onClick={handleBatchAdd}>添加至日曆</Button>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
                      <span style={{ fontSize: 12, color: '#8C8C8C' }}>每週休息日（批量添加時自動跳過）：</span>
                      {WEEKDAY_LABELS.map((label, i) => {
                        const isExcluded = excludedWeekdays.includes(i)
                        return (
                          <div
                            key={label}
                            onClick={() => handleToggleWeekday(i)}
                            style={{
                              padding: '2px 10px', borderRadius: 4, cursor: 'pointer', fontSize: 12,
                              border: isExcluded ? '1px solid #FF4D4F' : '1px solid #d9d9d9',
                              background: isExcluded ? '#FFF1F0' : '#fff',
                              color: isExcluded ? '#FF4D4F' : '#595959',
                              textDecoration: isExcluded ? 'line-through' : 'none',
                              transition: 'all 0.2s',
                            }}
                          >週{label}</div>
                        )
                      })}
                    </div>
                  </div>

                  {/* 日曆網格：週日開頭，綠色選中樣式與逐日購買日曆保持一致 */}
                  <div style={{ border: '1px solid #f0f0f0', borderRadius: 8, overflow: 'hidden' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', background: '#FAFAFA', borderBottom: '1px solid #f0f0f0' }}>
                      {WEEKDAY_LABELS.map((w, i) => (
                        <div key={w} style={{ padding: '8px 0', textAlign: 'center', fontSize: 12, fontWeight: 600, color: i === 0 || i === 6 ? '#FA8C16' : '#595959' }}>週{w}</div>
                      ))}
                    </div>
                    {customCalendarGrid.map((week, wi) => (
                      <div key={wi} style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)' }}>
                        {week.map((date, di) => {
                          if (!date) return <div key={di} style={{ height: 48 }} />
                          const dateKey = date.format('YYYY-MM-DD')
                          const isPast = date.isBefore(customMinDate, 'day')
                          // 待開售：超出可購窗口的日期，標記待開售（同盤活復蘇）
                          const isPresale = date.isAfter(customMaxDate, 'day')
                          const isSelected = customDates.includes(dateKey)
                          return (
                            <div
                              key={di}
                              onClick={() => handleCustomDateClick(date)}
                              style={{
                                height: 48, margin: 2, borderRadius: 6,
                                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 1,
                                cursor: isPast ? 'not-allowed' : 'pointer',
                                border: isSelected ? '2px solid #52C41A' : isPresale ? '1px dashed #d9d9d9' : '1px solid transparent',
                                background: isSelected ? '#F6FFED' : isPast || isPresale ? '#FAFAFA' : '#fff',
                                color: isPast ? '#D9D9D9' : isPresale ? '#bfbfbf' : isSelected ? '#389E0D' : '#262626',
                                fontSize: 13, fontWeight: isSelected ? 600 : 400,
                                transition: 'all 0.2s',
                              }}
                            >
                              <span>{date.date()}</span>
                              {isSelected && <span style={{ fontSize: 9, lineHeight: 1, color: '#52C41A' }}>已選</span>}
                              {isPresale && (
                                <span style={{ fontSize: 9, lineHeight: '12px', color: '#8c8c8c', border: '1px solid #d9d9d9', borderRadius: 3, padding: '0 3px', background: '#f5f5f5' }}>🔒待開售</span>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    ))}
                  </div>

                  {/* 已選日期摘要：按月分組展示 + 折扣進度提示 */}
                  {customDates.length > 0 ? (
                    <div style={{ marginTop: 12, background: '#F6FFED', border: '1px solid #B7EB8F', borderRadius: 8, padding: '10px 12px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
                        <span style={{ fontSize: 13, fontWeight: 600, color: '#389E0D' }}>
                          已選 {customDates.length} 天{currentTier ? `，享 ${currentTier.discount / 10} 折` : ''}
                        </span>
                        {(() => {
                          const nextTier = DISCOUNT_TIERS.find(t => effectiveDays < t.minDays)
                          return nextTier ? (
                            <span style={{ fontSize: 12, color: '#FA8C16' }}>再選 {nextTier.minDays - effectiveDays} 天可享 {nextTier.discount / 10} 折</span>
                          ) : null
                        })()}
                        <div style={{ flex: 1 }} />
                        <Button size="small" type="link" danger onClick={handleClearCustomDates} style={{ padding: 0 }}>清空</Button>
                      </div>
                      {customDatesByMonth.map(g => (
                        <div key={g.month} style={{ fontSize: 12, color: '#595959', lineHeight: '20px' }}>
                          <span style={{ fontWeight: 600 }}>{g.month}：</span>{g.days.map(d => `${d}日`).join('、')}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div style={{ marginTop: 12, fontSize: 12, color: '#8C8C8C' }}>尚未選擇日期，點擊日曆中的日期即可選中/取消，也可使用上方批量添加</div>
                  )}
                </div>
            </Card>
          </div>

          {/* 右側：效果預覽 + 訂單結算 */}
          <div style={{ width: 380, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* 效果預覽：瀑布流對比視角，上下模糊普通店鋪卡，突出當前所選皮膚 */}
            <Card size="small" title={<Space><span>📱</span><span>購買後效果預覽</span></Space>} bodyStyle={{ padding: '12px 16px', background: '#F5F5F5' }}>
              {selectedSkin ? (
                <div>
                  <div style={{ fontSize: 12, color: '#8C8C8C', marginBottom: 6 }}>小圖模式</div>
                  {renderWaterfallCompare(renderSkinPreview(selectedSkin, true))}
                  <div style={{ fontSize: 12, color: '#8C8C8C', margin: '12px 0 6px' }}>大圖模式</div>
                  {renderWaterfallCompare(renderSkinBigPreview(selectedSkin))}
                </div>
              ) : (
                <Empty description="請先選擇皮膚套件" image={Empty.PRESENTED_IMAGE_SIMPLE} />
              )}
            </Card>

            {/* 訂單結算 */}
            <Card size="small" title="費用結算">
              <div style={{ padding: '12px 16px', marginBottom: 12, background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', borderRadius: 6, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 13, color: '#fff', opacity: 0.9 }}>推廣金餘額</span>
                <span style={{ fontSize: 22, fontWeight: 700, color: '#fff' }}>${merchantBalance.toLocaleString()}</span>
              </div>
              <div style={{ fontSize: 13, color: '#595959', display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>購買門店</span>
                  <span style={{ color: '#262626', fontWeight: 500 }}>{selectedStore?.name || '-'}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>皮膚套件</span>
                  <span style={{ color: '#262626', fontWeight: 500 }}>{selectedSkin ? `${selectedSkin.name}（$${selectedSkin.pricePerDay}/天）` : '未選擇'}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>投放時段</span>
                  <span style={{ color: '#262626', fontWeight: 500 }}>{periodText}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>梯度折扣</span>
                  {currentTier ? <Tag color="green" style={{ marginRight: 0 }}>{currentTier.discount / 10}折</Tag> : <Tag style={{ marginRight: 0 }}>無折扣</Tag>}
                </div>
              </div>
              <div style={{ background: '#FAFAFA', borderRadius: 6, padding: '12px 16px', marginBottom: 12, fontSize: 13 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                  <span style={{ color: '#8C8C8C' }}>訂單金額（原價）</span>
                  <span style={{ fontWeight: 600, color: '#595959' }}>${priceSummary.original}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                  <span style={{ color: '#8C8C8C' }}>訂單優惠</span>
                  <span style={{ fontWeight: 600, color: '#FA8C16' }}>-${priceSummary.saved}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px dashed #E8E8E8', paddingTop: 8, marginTop: 8 }}>
                  <span style={{ color: '#262626', fontWeight: 600 }}>實付總額</span>
                  <span style={{ fontSize: 22, fontWeight: 700, color: '#FF4D4F' }}>${priceSummary.sale}</span>
                </div>
              </div>
              <Button
                type="primary" block size="large" icon={<ShoppingCartOutlined />}
                disabled={!selectedSkin}
                onClick={handlePayment}
                style={{
                  background: selectedSkin ? '#ff4d4f' : '#d9d9d9', borderColor: selectedSkin ? '#ff4d4f' : '#d9d9d9',
                  height: 44, fontSize: 16, fontWeight: 600,
                }}
              >
                訂單支付
              </Button>
            </Card>
          </div>
        </div>
      )}

      {/* 支付確認彈窗 */}
      <Modal
        title="確認訂單" open={isPaymentModalVisible}
        onOk={handleConfirmPayment} onCancel={() => setIsPaymentModalVisible(false)}
        okText="確定支付" cancelText="取消"
        okButtonProps={{ style: { background: '#ff4d4f', borderColor: '#ff4d4f' } }}
        width={480}
      >
        {selectedSkin && (
          <div>
            <div style={{ background: '#F5F5F5', borderRadius: 8, padding: 12, marginBottom: 16 }}>
              {renderSkinPreview(selectedSkin, true)}
            </div>
            <div style={{ background: '#fafafa', padding: 16, borderRadius: 6, fontSize: 13 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                <span style={{ color: '#595959' }}>皮膚套件：</span>
                <span style={{ fontWeight: 600 }}>{selectedSkin.name}（${selectedSkin.pricePerDay}/天）</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                <span style={{ color: '#595959' }}>投放時段：</span>
                <span style={{ fontWeight: 600 }}>{periodTextFull}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, color: '#fa8c16' }}>
                <span>訂單優惠：</span>
                <span style={{ fontWeight: 600 }}>-${priceSummary.saved}{currentTier ? `（${currentTier.discount / 10}折）` : ''}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 16, color: '#ff4d4f', borderTop: '1px solid #d9d9d9', paddingTop: 8, marginTop: 8 }}>
                <span style={{ fontWeight: 600 }}>實付金額：</span>
                <span style={{ fontWeight: 700 }}>${priceSummary.sale}</span>
              </div>
            </div>
          </div>
        )}
      </Modal>

      {/* 支付成功彈窗 */}
      <Modal
        title="購買成功" open={isSuccessModalVisible} onCancel={() => setIsSuccessModalVisible(false)}
        footer={[
          <Button key="view" type="primary" onClick={handleViewOrder}>查看訂單</Button>,
          <Button key="continue" onClick={handleContinuePurchase} style={{ background: '#fa8c16', borderColor: '#fa8c16', color: '#fff' }}>繼續購買</Button>,
        ]}
        width={400}
      >
        <div style={{ textAlign: 'center', padding: '20px 0' }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>✅</div>
          <p style={{ fontSize: 16, color: '#595959', marginBottom: 24 }}>恭喜！皮膚購買成功</p>
          <div style={{ background: 'linear-gradient(135deg, #fff7e6 0%, #ffe58f 100%)', padding: '20px 16px', borderRadius: 8 }}>
            <p style={{ fontSize: 14, color: '#8c8c8c', marginBottom: 8 }}>已扣除推廣金</p>
            <p style={{ fontSize: 36, fontWeight: 700, color: '#fa541c', margin: 0, lineHeight: 1.2 }}>${priceSummary.sale}</p>
          </div>
        </div>
      </Modal>

      {/* 待開售日期提醒彈窗（同盤活復蘇規範） */}
      <Modal
        title={
          <Space>
            <span style={{ fontSize: 18 }}>⏳</span>
            <span style={{ color: '#1890ff', fontWeight: 600 }}>該日期尚未開售</span>
          </Space>
        }
        open={!!presaleInfo}
        onCancel={() => setPresaleInfo(null)}
        footer={[
          <Button key="ok" type="primary" onClick={() => setPresaleInfo(null)} style={{ minWidth: 100 }}>
            我知道了
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
              <span style={{ fontSize: 13, color: '#595959' }}>⏰ 開售時間：</span>
              <span style={{ fontSize: 16, fontWeight: 700, color: '#1890ff' }}>{presaleInfo.openTime}</span>
            </div>
            <p style={{ fontSize: 12, color: '#8c8c8c', marginTop: 12, marginBottom: 0 }}>
              每日 {PRESALE_OPEN_HOUR}:00 會放出新一天的可購買日期，請屆時再來搶購。
            </p>
          </div>
        )}
      </Modal>
    </div>
  )
}
