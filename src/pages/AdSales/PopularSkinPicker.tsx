import { useState, useMemo, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import type { ReactNode, CSSProperties } from 'react'
import { Button, Card, DatePicker, Empty, Form, Modal, Select, Space, Tag, message, InputNumber, Radio } from 'antd'
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
import { fetchGiftAvailableDays } from '../../api/gift'
import { usePaymentRule } from '../../hooks/usePaymentRule'
import {
  fetchAdAlgorithms,
  fetchAdHotInventory,
  placeAdHotOrder,
  type AdHotInventoryVO,
  type AdHotInventoryCell,
} from '../../api/adPromotion'
import { fetchStores, type StoreItem } from '../../api/store'
import { fetchFinAccounts } from '../../api/finance'
import { AlgorithmType } from '../Recommend/constants'

/** 人氣商家廣告類型標識（與後端一致） */
const GIFT_AD_TYPE_POPULAR = 'popular_merchant'

const { RangePicker } = DatePicker

/**
 * 人氣商家 - 購買廣告（皮膚售賣）
 * 對應銷售定價「人氣商家」皮膚定價配置：業務配置多套皮膚（邊框 + 大圖 + 菜品展示佈局）並按天定價，
 * 商家在此選擇皮膚套件 + 購買時長完成下單，購買後 APP 瀑布流店鋪卡片按所選皮膚展示。
 *
 * 風格不售賣給商家：一套皮膚可支持多種菜品展示佈局（大圖拼列 / 階梯輪播），
 * 商家僅選擇大圖模式圖片與邊框風格，具體展示哪種佈局、在瀑布流第幾個位置展示，
 * 由系統配置瀑布流策略時決定，商家不可選擇。
 */

/** 菜品展示佈局（同銷售定價配置）：大圖拼列 / 階梯輪播 — 移入組件內使用 t() */
type DishLayout = 'grid' | 'carousel'

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
  /** 該皮膚支持的菜品展示佈局（平台配置，由系統瀑布流策略自動分配，商家不可選擇） */
  dishLayouts: DishLayout[]
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
    tagBg: 'linear-gradient(135deg, #FF4D4F, #FF7A45)', desc: '喜慶紅框，節慶檔期首選', sold: 386, dishLayouts: ['grid'],
  },
  {
    id: 2, name: '橙意滿滿', pricePerDay: 18, borderType: 'color', borderColor: '#E8720C',
    tagBg: 'linear-gradient(135deg, #E8720C, #F59432)', desc: '品牌橙框，醒目聚焦高轉化', sold: 512, dishLayouts: ['grid', 'carousel'],
  },
  {
    id: 3, name: '紫氣東來', pricePerDay: 22, borderType: 'color', borderColor: '#722ED1',
    tagBg: 'linear-gradient(135deg, #722ED1, #9254DE)', desc: '高級紫框，品質商家氛圍感', sold: 208, dishLayouts: ['grid'],
  },
  {
    id: 4, name: '簡約無框', pricePerDay: 8, borderType: 'none',
    tagBg: 'linear-gradient(135deg, #8C8C8C, #BFBFBF)', desc: '無邊框輕量款，入門首選', sold: 655, dishLayouts: ['grid'],
  },
  {
    id: 5, name: '金碧輝煌', pricePerDay: 32, borderType: 'color', borderColor: '#FAAD14',
    tagBg: 'linear-gradient(135deg, #FAAD14, #FFC53D)', desc: '土豪金框，旺鋪氣場拉滿', sold: 173, dishLayouts: ['grid', 'carousel'],
  },
  {
    id: 6, name: '碧海藍天', pricePerDay: 20, borderType: 'color', borderColor: '#1890FF',
    tagBg: 'linear-gradient(135deg, #1890FF, #40A9FF)', desc: '清爽藍框，飲品甜品百搭', sold: 294, dishLayouts: ['grid'],
  },
  {
    id: 7, name: '翠綠生機', pricePerDay: 20, borderType: 'color', borderColor: '#52C41A',
    tagBg: 'linear-gradient(135deg, #52C41A, #73D13D)', desc: '健康綠框，輕食沙拉首選', sold: 231, dishLayouts: ['grid'],
  },
  {
    id: 8, name: '青峰翡翠', pricePerDay: 24, borderType: 'color', borderColor: '#13C2C2',
    tagBg: 'linear-gradient(135deg, #13C2C2, #36CFC9)', desc: '青碧色框，清新耳目一新', sold: 156, dishLayouts: ['grid'],
  },
  {
    id: 9, name: '粉黛甜心', pricePerDay: 26, borderType: 'color', borderColor: '#EB2F96',
    tagBg: 'linear-gradient(135deg, #EB2F96, #F759AB)', desc: '少女粉框，甜品烘焙拉滿好感', sold: 342, dishLayouts: ['carousel'],
  },
  {
    id: 10, name: '暗夜黑金', pricePerDay: 30, borderType: 'color', borderColor: '#8B6D3B',
    tagBg: 'linear-gradient(135deg, #1A1A2E, #3D2E1A, #8B6D3B)', desc: '暗夜黑底+暗金邊框，西餐日料高級質感', sold: 128, dishLayouts: ['grid'],
  },
  {
    id: 11, name: '橘光暮色', pricePerDay: 25, borderType: 'color', borderColor: '#FA541C',
    tagBg: 'linear-gradient(135deg, #FA541C, #FF7A45)', desc: '暮色橘框，宵夜燒烤氛圍感', sold: 267, dishLayouts: ['carousel'],
  },
  {
    id: 12, name: '極光幻彩', pricePerDay: 36, borderType: 'color', borderColor: '#2F54EB',
    tagBg: 'linear-gradient(135deg, #2F54EB, #722ED1)', desc: '幻彩漸變框，旗艦頂級曝光款', sold: 95, dishLayouts: ['grid', 'carousel'],
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
/** 待開售日期每日放票時間（同盤活復蘇，火車票式滾動開售） */
const PRESALE_OPEN_HOUR = 10
/** 待開售日期的開售時間（提前 sellableDays 天、於 PRESALE_OPEN_HOUR 點開售） */
function getPresaleOpenTime(date: Dayjs, sellableDays: number): Dayjs {
  return date.startOf('day').subtract(sellableDays, 'day').hour(PRESALE_OPEN_HOUR).minute(0).second(0)
}

/** 月份選擇器每頁展示數（超出用上下頁按鈕切換） */
const MONTHS_PER_PAGE = 6

/** 人氣商家算法選項（Mock 兜底，後端不可用時使用） */
const FALLBACK_ALGORITHM_OPTIONS = [
  { label: '人氣商家-首頁版', value: '1', brand: 'shanfeng' },
  { label: '人氣商家-外賣版', value: '2', brand: 'mfood' },
]
/** 算法退款配置兜底（對應銷售定價中的退款開關） */
const FALLBACK_REFUND_CONFIG: Record<string, boolean> = {
  '1': false,
  '2': true,
}
/** 皮膚配色兜底（後端庫存僅含名稱+價格，視覺配色以此兜底） */
const SKIN_COLOR_PALETTE = [
  { borderColor: '#FF4D4F', tagBg: 'linear-gradient(135deg, #FF4D4F, #FF7A45)' },
  { borderColor: '#E8720C', tagBg: 'linear-gradient(135deg, #E8720C, #F59432)' },
  { borderColor: '#722ED1', tagBg: 'linear-gradient(135deg, #722ED1, #9254DE)' },
  { borderColor: '#1890FF', tagBg: 'linear-gradient(135deg, #1890FF, #40A9FF)' },
  { borderColor: '#52C41A', tagBg: 'linear-gradient(135deg, #52C41A, #73D13D)' },
  { borderColor: '#13C2C2', tagBg: 'linear-gradient(135deg, #13C2C2, #36CFC9)' },
  { borderColor: '#EB2F96', tagBg: 'linear-gradient(135deg, #EB2F96, #F759AB)' },
  { borderColor: '#FAAD14', tagBg: 'linear-gradient(135deg, #FAAD14, #FFC53D)' },
]

export default function PopularSkinPicker() {
  const { t } = useTranslation('adSales')
  const WEEKDAY_LABELS = t('weekdayShort', { returnObjects: true }) as string[]
  const DISH_LAYOUT_LABEL: Record<DishLayout, string> = { grid: t('layoutGrid'), carousel: t('layoutCarousel') }
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
  const [merchantBalance, setMerchantBalance] = useState<number>(0)
  const [isPaymentModalVisible, setIsPaymentModalVisible] = useState(false)
  const [isSuccessModalVisible, setIsSuccessModalVisible] = useState(false)

  // 贈送天數抵扣：人氣商家支持贈送天數抵扣
  const [giftDaysBalance, setGiftDaysBalance] = useState(0)
  const [giftDaysUsed, setGiftDaysUsed] = useState(0)
  // 支付規則：根據規則配置決定推廣金與贈送天數是否可混合使用
  const { mixedPayment } = usePaymentRule(GIFT_AD_TYPE_POPULAR)
  // 非混合支付時的選擇模式：'promo' = 推廣金支付, 'gift' = 贈送天數抵扣
  const [paymentMode, setPaymentMode] = useState<'promo' | 'gift'>('promo')
  // 階梯輪播餐品指針（同定價預覽）：current 為當前張，prev 為正在向左滑出的上一張
  const [dishState, setDishState] = useState<{ current: number; prev: number | null }>({ current: 0, prev: null })
  // 大圖模式預覽風格指針：皮膚支持多種佈局時每 3 秒自動輪換，模擬系統隨機分配效果
  const [previewLayoutIndex, setPreviewLayoutIndex] = useState(0)

  // ===== 真實接口接線 =====
  // 算法下拉（人氣商家加載真實算法庫數據，value=算法ID）
  const [algorithmOptions, setAlgorithmOptions] = useState<Array<{ label: string; value: string }>>([])
  const [algorithmBrandOverrides, setAlgorithmBrandOverrides] = useState<Record<string, string>>({})
  const [algorithmRefundConfig, setAlgorithmRefundConfig] = useState<Record<string, boolean>>(FALLBACK_REFUND_CONFIG)
  // 門店下拉（真實門店，value=storeCode）
  const [storeOptions, setStoreOptions] = useState<Array<{ label: string; value: string }>>([])
  const [storeMap, setStoreMap] = useState<Record<string, StoreItem>>({})
  const [bdOptions, setBdOptions] = useState<Array<{ label: string; value: string }>>([])
  // 真實庫存（查詢後加載：皮膚 x 日期格子 + 預售窗口 + 折扣梯度 + 退款開關）
  const [inventoryData, setInventoryData] = useState<AdHotInventoryVO | null>(null)
  const [paying, setPaying] = useState(false)

  const selectedSkin = SALE_SKINS.find(s => s.id === selectedSkinId) || null
  const selectedStore = searchStoreName ? storeMap[searchStoreName] : undefined

  // 可售天數：真實庫存以預售天數為準，否則兜底 MAX_BUY_DAYS 天
  const sellableDays = inventoryData ? inventoryData.presaleDays : MAX_BUY_DAYS
  // 梯度折扣（來自定價配置）
  const discountTiers = useMemo(() => {
    if (!inventoryData?.discountTiers) return DISCOUNT_TIERS
    try {
      const arr = JSON.parse(inventoryData.discountTiers)
      if (Array.isArray(arr) && arr.length > 0) return arr
    } catch { /* 降級 Mock */ }
    return DISCOUNT_TIERS
  }, [inventoryData])
  // 退款開關（來自定價配置）
  const currentAlgorithmRefundEnabled = inventoryData ? inventoryData.refundEnabled === 1 : null

  // 皮膚真實價格映射（來自庫存 API）
  const skinPriceMap = useMemo(() => {
    if (!inventoryData?.cells) return {} as Record<string, number>
    const map: Record<string, number> = {}
    inventoryData.cells.forEach(c => { if (!map[c.skinName]) map[c.skinName] = c.price })
    return map
  }, [inventoryData])
  // 所選皮膚的真實日單價（庫存有則用真實價，否則用 Mock 價）
  const effectiveSkinPricePerDay = selectedSkin
    ? (skinPriceMap[selectedSkin.name] ?? selectedSkin.pricePerDay)
    : 0

  // 自選日期可選範圍：最早次日生效，最晚 sellableDays 天內
  const customMinDate = dayjs().add(1, 'day').startOf('day')
  const customMaxDate = dayjs().add(sellableDays, 'day').startOf('day')
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
    ? `${dayjs(customDates[0]).format('MM-DD')} ~ ${dayjs(customDates[customDates.length - 1]).format('MM-DD')}（${t('selfSelectDays', { count: customDates.length })}）`
    : t('notSelected')
  const periodTextFull = customDates.length > 0
    ? `${customDates[0]} ~ ${customDates[customDates.length - 1]}（${t('selfSelectDays', { count: customDates.length })}）`
    : t('notSelected')

  // 階梯輪播預覽：所選皮膚支持階梯輪播佈局時逐張輪播，切換皮膚時重置
  useEffect(() => {
    if (!selectedSkin || !selectedSkin.dishLayouts.includes('carousel')) return
    setDishState({ current: 0, prev: null })
    const timer = setInterval(() => {
      setDishState(s => ({ current: (s.current + 1) % PREVIEW_DISHES.length, prev: s.current }))
    }, 2200)
    return () => clearInterval(timer)
  }, [selectedSkin])

  // 大圖模式風格自動輪換預覽：支持多種佈局時每 3 秒切換一種，點擊風格標籤可手動定位
  useEffect(() => {
    setPreviewLayoutIndex(0)
    if (!selectedSkin || selectedSkin.dishLayouts.length <= 1) return
    const timer = setInterval(() => {
      setPreviewLayoutIndex(i => (i + 1) % selectedSkin.dishLayouts.length)
    }, 3000)
    return () => clearInterval(timer)
  }, [selectedSkin])

  // 命中折扣檔位（按生效購買天數計算，使用真實梯度折扣）
  const currentTier = useMemo(() => {
    for (let i = discountTiers.length - 1; i >= 0; i--) {
      if (effectiveDays >= discountTiers[i].minDays) return discountTiers[i]
    }
    return null
  }, [effectiveDays, discountTiers])

  // 初始化：加載門店下拉（真實門店，含集團編碼與BD）
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

  // 真實算法下拉：人氣商家加載真實算法庫數據
  useEffect(() => {
    fetchAdAlgorithms({ page: 1, size: 200, algoType: AlgorithmType.POPULAR_MERCHANT_KA, status: 1 })
      .then(res => {
        if (!res) return
        const brandOverrides: Record<string, string> = {}
        const refundConfig: Record<string, boolean> = {}
        const BACKEND_TO_UI_BRAND: Record<string, string> = { flashBee: 'shanfeng', mFood: 'mfood' }
        const options = res.records.map(a => {
          const value = String(a.id)
          const uiBrand = BACKEND_TO_UI_BRAND[a.brand || '']
          if (uiBrand) brandOverrides[value] = uiBrand
          return { label: a.algoName, value }
        })
        if (options.length > 0) {
          setAlgorithmOptions(options)
          setAlgorithmBrandOverrides(brandOverrides)
          setAlgorithmRefundConfig(refundConfig)
        }
      }).catch(() => {})
  }, [])

  // 贈送天數餘額：選擇門店後加載
  useEffect(() => {
    if (!searchStoreName || !storeMap[searchStoreName]) {
      setGiftDaysBalance(0)
      setGiftDaysUsed(0)
      return
    }
    const store = storeMap[searchStoreName]
    fetchGiftAvailableDays(store.id, GIFT_AD_TYPE_POPULAR).then(setGiftDaysBalance).catch(() => setGiftDaysBalance(0))
    setGiftDaysUsed(0)
  }, [searchStoreName, storeMap])

  // 基礎費用計算（使用真實皮膚日單價）
  const basePriceSummary = useMemo(() => {
    if (!selectedSkin) return { original: 0, sale: 0, saved: 0 }
    const original = effectiveSkinPricePerDay * effectiveDays
    const sale = currentTier ? Math.round(original * currentTier.discount / 100) : original
    return { original, sale, saved: original - sale }
  }, [selectedSkin, effectiveSkinPricePerDay, effectiveDays, currentTier])

  // 贈送天數抵扣計算
  const maxGiftDaysUsable = Math.min(giftDaysBalance, effectiveDays)
  const effectiveGiftDays = Math.min(giftDaysUsed, maxGiftDaysUsable)
  const giftDeduction = useMemo(() => {
    // 非混合支付且選擇推廣金模式時，不使用贈送天數抵扣
    if (!mixedPayment && paymentMode === 'promo') return 0
    if (effectiveGiftDays <= 0 || effectiveDays === 0) return 0
    return Math.min(basePriceSummary.sale, Math.round(basePriceSummary.sale / effectiveDays * effectiveGiftDays))
  }, [effectiveGiftDays, effectiveDays, basePriceSummary.sale, mixedPayment, paymentMode])

  // 最終費用計算（含贈送天數抵扣）
  const priceSummary = useMemo(() => {
    return {
      ...basePriceSummary,
      giftDeduction,
      payable: basePriceSummary.sale - giftDeduction,
    }
  }, [basePriceSummary, giftDeduction])

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
    setSearchBrand(value && algorithmBrandOverrides[value] ? algorithmBrandOverrides[value] : null)
  }
  // 門店變更：自動帶出BD
  const handleStoreChange = (value: string | null) => {
    setSearchStoreName(value)
    const store = value ? storeMap[value] : undefined
    const bds = (store?.bdList ?? []).map(b => ({ label: b.bdName || b.bdEmpId, value: b.bdEmpId }))
    setBdOptions(bds)
    setSearchBD(bds[0]?.value ?? null)
  }

  const handleSearch = () => {
    if (!searchAlgorithm) { message.warning(t('selectAlgorithm')); return }
    if (!searchBrand) { message.warning(t('selectBrand')); return }
    if (!searchStoreName) { message.warning(t('selectStore')); return }
    const store = storeMap[searchStoreName]
    const algoId = Number(searchAlgorithm)
    // 加載人氣商家庫存（皮膚 x 日期）
    fetchAdHotInventory(algoId, store?.storeCode, store?.groupCode)
      .then(inv => {
        setInventoryData(inv)
        setHasSearched(true)
        setSelectedSkinId(null)
        setCustomDates([])
        // 推廣金餘額（集團+品牌）
        const backendBrand = searchBrand === 'shanfeng' ? 'flashBee' : searchBrand === 'mfood' ? 'mFood' : searchBrand
        fetchFinAccounts({ groupId: store?.groupCode, brand: backendBrand, page: 1, size: 10 })
          .then(res => {
            const acc = (res.records ?? [])[0]
            setMerchantBalance(acc ? Number(acc.virtualBalance) : 0)
          }).catch(() => setMerchantBalance(0))
      })
      .catch(err => message.error(err instanceof Error ? err.message : t('inventoryQueryFailed')))
  }
  const handleReset = () => {
    setSearchAlgorithm(null); setSearchBrand(null)
    setSearchStoreName(null); setSearchBD(null)
    setHasSearched(false); setSelectedSkinId(null)
    setInventoryData(null); setCustomDates([])
  }

  // 自選日期：點擊日曆單日選中/取消
  const handleCustomDateClick = (date: Dayjs | null) => {
    if (!date) return
    if (date.isBefore(customMinDate, 'day')) { message.warning(t('earliestDateWarning')); return }
    if (date.isAfter(customMaxDate, 'day')) {
      // 待開售日期：彈窗提示開售時間（同盤活復蘇規範）
      setPresaleInfo({
        date: date.format('YYYY-MM-DD'),
        weekday: WEEKDAY_LABELS[date.day()],
        openTime: getPresaleOpenTime(date, sellableDays).format(t('presaleDateFormat')),
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
    if (!batchRange || !batchRange[0] || !batchRange[1]) { message.warning(t('selectDateRangeFirst')); return }
    const merged = new Set(customDates)
    let added = 0
    for (let d = batchRange[0].startOf('day'); !d.isAfter(batchRange[1], 'day'); d = d.add(1, 'day')) {
      if (d.isBefore(customMinDate, 'day') || d.isAfter(customMaxDate, 'day')) continue
      if (excludedWeekdays.includes(d.day())) continue
      const key = d.format('YYYY-MM-DD')
      if (!merged.has(key)) { merged.add(key); added++ }
    }
    if (added === 0) { message.info(t('noDatesInRange')); return }
    setCustomDates([...merged].sort())
    message.success(excludedWeekdays.length > 0 ? t('batchAddSkipRest', { count: added }) : t('batchAddSuccess', { count: added }))
  }
  const handleClearCustomDates = () => setCustomDates([])

  // 訂單支付
  const handlePayment = () => {
    if (!selectedSkin) { message.warning(t('selectSkinFirst')); return }
    if (customDates.length === 0) { message.warning(t('selectDatesInCalendar')); return }
    // 校驗餘額是否充足
    if (!mixedPayment && paymentMode === 'promo') {
      // 單獨使用推廣金：全額需推廣金覆蓋
      if (basePriceSummary.sale > merchantBalance) {
        message.error('推廣金餘額不足，請充值後再試')
        return
      }
    } else if (!mixedPayment && paymentMode === 'gift') {
      // 單獨使用贈送天數：天數需覆蓋購買天數
      if (giftDaysBalance < effectiveDays) {
        message.error('贈送天數餘額不足，無法抵扣')
        return
      }
    } else if (mixedPayment) {
      // 混合支付：抵扣後應付金額不得超過推廣金餘額
      if (priceSummary.payable > merchantBalance) {
        message.error('推廣金餘額不足，請充值後再試')
        return
      }
    }
    setIsPaymentModalVisible(true)
  }
  const handleConfirmPayment = async () => {
    if (!selectedSkin || !searchAlgorithm || !searchStoreName) return
    const store = storeMap[searchStoreName]
    const algoId = Number(searchAlgorithm)
    const skinName = selectedSkin.name
    setPaying(true)
    try {
      await placeAdHotOrder({
        algoId,
        groupCode: store?.groupCode || '',
        storeCode: store?.storeCode,
        bdEmpId: searchBD || undefined,
        cells: customDates.map(d => ({ bizDate: d, skinName })),
      })
      setIsPaymentModalVisible(false)
      setMerchantBalance(prev => prev - priceSummary.payable)
      setIsSuccessModalVisible(true)
    } catch (err) {
      message.error(err instanceof Error ? err.message : t('orderFailed'))
    } finally {
      setPaying(false)
    }
  }
  const handleViewOrder = () => {
    setIsSuccessModalVisible(false)
    navigate(`/promotion-order-manage?type=${encodeURIComponent('人氣商家')}&from=ad-sales`)
  }
  const handleContinuePurchase = () => {
    setIsSuccessModalVisible(false)
    setSelectedSkinId(null)
    message.success(t('continuePurchaseHint'))
  }

  /** 店鋪信息行（與銷售定價預覽字段保持一致：店名 + 評分/月售/起送信息） */
  const previewInfoRows = (nameSize: number) => (
    <>
      <div style={{
        fontSize: nameSize, fontWeight: 600, color: '#262626',
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      }}>{selectedStore?.storeName || '示例店鋪'}</div>
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
        {renderStoreLogo(selectedStore?.storeName || '示例店鋪', large ? 56 : 44)}
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
          {renderStoreLogo(selectedStore?.storeName || '示例店鋪', 40)}
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
          {/* 菜品展示區：僅渲染當前輪換到的風格（實際展示哪種由系統隨機分配，不同風格間自動切換） */}
          {(() => {
            const layout = skin.dishLayouts[Math.min(previewLayoutIndex, skin.dishLayouts.length - 1)]
            if (!layout) return null
            return layout === 'grid' ? renderDishGridMini() : renderDishCarouselMini()
          })()}
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
        }}>{t('adSales.yourStore')}</span>
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
          <Form.Item label={t('algoNameLabel')}>
            <Select placeholder={t('algoSearchPlaceholder')} value={searchAlgorithm} onChange={handleAlgorithmChange} allowClear showSearch optionFilterProp="label"
              options={algorithmOptions} />
          </Form.Item>
          <Form.Item label={t('brandLabel')}>
            <Select placeholder={t('brandAutoHint')} value={searchBrand} onChange={v => setSearchBrand(v)} allowClear
              options={[{ label: '閃蜂', value: 'shanfeng' }, { label: 'mFood', value: 'mfood' }]} disabled />
          </Form.Item>
          <Form.Item label={t('storeNameLabel')}>
            <Select placeholder={t('storeSearchHint')} value={searchStoreName} onChange={handleStoreChange} allowClear showSearch optionFilterProp="label" options={storeOptions} />
          </Form.Item>
          <Form.Item label={t('bdLabel')}>
            <Select placeholder={t('bdAutoHint')} value={searchBD} onChange={v => setSearchBD(v)} allowClear showSearch optionFilterProp="label" options={bdOptions} />
          </Form.Item>
          <Form.Item>
            <div className="search-actions">
              <Button type="primary" icon={<SearchOutlined />} onClick={handleSearch}>{t('searchQuery')}</Button>
              <Button icon={<ReloadOutlined />} onClick={handleReset}>{t('reset')}</Button>
            </div>
          </Form.Item>
        </Form>
      </div>

      {!hasSearched ? (
        <Card bodyStyle={{ padding: '48px 24px' }}>
          <Empty description={t('pspEmptyHint')} image={Empty.PRESENTED_IMAGE_SIMPLE} />
        </Card>
      ) : (
        <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
          {/* 左側：選皮膚 + 選時長 */}
          <div style={{ flex: 1, minWidth: 0 }}>
            {/* ① 選擇皮膚套件（簡化卡片：色块示意 + 名稱 + 價格，每行 4 個） */}
            <Card
              title={
                <div>
                  <Space><SkinOutlined style={{ color: '#E8720C' }} /><span>{t('selectSkinKit')}</span><span style={{ fontSize: 12, color: '#8C8C8C', fontWeight: 400 }}>{t('skinSelectHint')}</span></Space>
                  {/* 購買規則說明：生效時間 / 唯一生效 / 到期恢復 */}
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
                    marginTop: 8, padding: '6px 12px', borderRadius: 6,
                    background: '#FFF9F0', border: '1px solid #FFE0B2',
                  }}>
                    <span style={{ fontSize: 12, fontWeight: 400, color: '#8C6E00', whiteSpace: 'nowrap' }}>{t('ruleAutoEffective')}</span>
                    <span style={{ color: '#FFD591' }}>|</span>
                    <span style={{ fontSize: 12, fontWeight: 400, color: '#8C6E00', whiteSpace: 'nowrap' }}>{t('ruleUniqueSkin')}</span>
                    <span style={{ color: '#FFD591' }}>|</span>
                    <span style={{ fontSize: 12, fontWeight: 400, color: '#8C6E00', whiteSpace: 'nowrap' }}>{t('ruleAutoRevert')}</span>
                    <span style={{ color: '#FFD591' }}>|</span>
                    <span style={{ fontSize: 12, fontWeight: 400, color: '#8C6E00', whiteSpace: 'nowrap' }}>{t('ruleAutoLayout')}</span>
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
                      {/* 支持的菜品展示佈局（系統自動分配，商家不可選擇）+ 已售 + 價格 */}
                      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 8 }}>
                        {skin.dishLayouts.map(l => (
                          <span key={l} style={{
                            fontSize: 9, color: '#595959', background: '#F0F0F0', borderRadius: 3,
                            padding: '1px 5px', flexShrink: 0,
                          }}>{DISH_LAYOUT_LABEL[l]}</span>
                        ))}
                        <span style={{ fontSize: 10, color: '#E8720C', whiteSpace: 'nowrap' }}>{t('soldCount', { count: skin.sold })}</span>
                        <div style={{ flex: 1 }} />
                        <span style={{ fontSize: 16, fontWeight: 700, color: '#FF4D4F' }}>${skinPriceMap[skin.name] ?? skin.pricePerDay}</span>
                        <span style={{ fontSize: 10, color: '#8C8C8C', marginLeft: 1 }}>{t('perDay')}</span>
                      </div>
                    </div>
                  )
                })}
              </div>
            </Card>

            {/* ② 選擇購買時長：自選日期（日曆跳選），滿足打烊、休息日等靈活投放需求 */}
            <Card
              title={<Space><CalendarOutlined style={{ color: '#1890FF' }} /><span>{t('selectDurationTitle')}</span><span style={{ fontSize: 12, color: '#8C8C8C', fontWeight: 400 }}>{t('durationPricingHint')}</span></Space>}
              bodyStyle={{ padding: '16px 20px' }}
            >
              {/* 梯度折扣橫幅：常駐展示折扣規則與不可退款標識（同盤活復蘇） */}
              <GradientDiscountBanner
                tiers={discountTiers.map((tier: { minDays: number; discount: number }) => ({ threshold: tier.minDays, discount: tier.discount }))}
                unitLabel={t('unitDay')}
                currentCount={customDates.length}
                refundDisabled={currentAlgorithmRefundEnabled === false}
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
                                openTime: getPresaleOpenTime(firstDay, sellableDays).format(t('presaleDateFormat')),
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
                            {m.year() === dayjs().year() ? m.format(t('monthFormat')) : m.format(t('yearMonthFormat'))}
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
                      onClick={() => setMonthPage(p => Math.min(monthPageCount - 1, p + 1))}
                    >
                      ▶
                    </Button>
                  </div>

                  {/* 批量添加工具欄：日期範圍 + 每週休息日排除 */}
                  <div style={{ background: '#FAFAFA', borderRadius: 8, padding: '10px 12px', marginBottom: 12 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 13, color: '#595959' }}>{t('batchAddLabel')}</span>
                      <RangePicker
                        size="small"
                        value={batchRange}
                        onChange={v => setBatchRange(v)}
                        disabledDate={d => d.isBefore(customMinDate, 'day') || d.isAfter(customMaxDate, 'day')}
                      />
                      <Button size="small" type="primary" onClick={handleBatchAdd}>{t('addToCalendar')}</Button>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
                      <span style={{ fontSize: 12, color: '#8C8C8C' }}>{t('weeklyRestDays')}</span>
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
                          >{t('weekdayPrefix')}{label}</div>
                        )
                      })}
                    </div>
                  </div>

                  {/* 日曆網格：週日開頭，綠色選中樣式與逐日購買日曆保持一致 */}
                  <div style={{ border: '1px solid #f0f0f0', borderRadius: 8, overflow: 'hidden' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', background: '#FAFAFA', borderBottom: '1px solid #f0f0f0' }}>
                      {WEEKDAY_LABELS.map((w, i) => (
                        <div key={w} style={{ padding: '8px 0', textAlign: 'center', fontSize: 12, fontWeight: 600, color: i === 0 || i === 6 ? '#FA8C16' : '#595959' }}>{t('weekdayPrefix')}{w}</div>
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
                              {isSelected && <span style={{ fontSize: 9, lineHeight: 1, color: '#52C41A' }}>{t('selectedTag')}</span>}
                              {isPresale && (
                                <span style={{ fontSize: 9, lineHeight: '12px', color: '#8c8c8c', border: '1px solid #d9d9d9', borderRadius: 3, padding: '0 3px', background: '#f5f5f5' }}>{t('presaleTag')}</span>
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
                          已選 {customDates.length} 天{currentTier ? t('enjoyingDiscount', { discount: currentTier.discount / 10 }) : ''}
                        </span>
                        {(() => {
                          const nextTier = discountTiers.find((tier: { minDays: number; discount: number }) => effectiveDays < tier.minDays)
                          return nextTier ? (
                            <span style={{ fontSize: 12, color: '#FA8C16' }}>{t('moreForNextTier', { days: nextTier.minDays - effectiveDays, discount: nextTier.discount / 10 })}</span>
                          ) : null
                        })()}
                        <div style={{ flex: 1 }} />
                        <Button size="small" type="link" danger onClick={handleClearCustomDates} style={{ padding: 0 }}>{t('clearAction')}</Button>
                      </div>
                      {customDatesByMonth.map(g => (
                        <div key={g.month} style={{ fontSize: 12, color: '#595959', lineHeight: '20px' }}>
                          <span style={{ fontWeight: 600 }}>{g.month}：</span>{g.days.map(d => `${d}日`).join('、')}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div style={{ marginTop: 12, fontSize: 12, color: '#8C8C8C' }}>{t('noDatesSelectedHint')}</div>
                  )}
                </div>
            </Card>
          </div>

          {/* 右側：效果預覽 + 訂單結算 */}
          <div style={{ width: 380, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* 效果預覽：瀑布流對比視角，上下模糊普通店鋪卡，突出當前所選皮膚 */}
            <Card size="small" title={<Space><span>📱</span><span>{t('previewTitle')}</span></Space>} bodyStyle={{ padding: '12px 16px', background: '#F5F5F5' }}>
              {selectedSkin ? (
                <div>
                  <div style={{ fontSize: 12, color: '#8C8C8C', marginBottom: 6 }}>{t('smallMode')}</div>
                  {renderWaterfallCompare(renderSkinPreview(selectedSkin, true))}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', margin: '12px 0 6px' }}>
                    <span style={{ fontSize: 12, color: '#8C8C8C' }}>{t('bigMode')}</span>
                    {/* 支持的風格列表：高亮當前預覽中的風格，每 3 秒自動輪換，點擊可手動定位 */}
                    {selectedSkin.dishLayouts.length > 1 && selectedSkin.dishLayouts.map((l, idx) => {
                      const isActive = idx === Math.min(previewLayoutIndex, selectedSkin.dishLayouts.length - 1)
                      return (
                        <span
                          key={l}
                          onClick={() => setPreviewLayoutIndex(idx)}
                          style={{
                            fontSize: 10, cursor: 'pointer', borderRadius: 3, padding: '1px 6px', lineHeight: '16px',
                            color: isActive ? '#E8720C' : '#8C8C8C',
                            background: isActive ? '#FFF7E6' : '#F0F0F0',
                            border: `1px solid ${isActive ? '#E8720C' : 'transparent'}`,
                            transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
                          }}
                        >{DISH_LAYOUT_LABEL[l]}</span>
                      )
                    })}
                  </div>
                  {renderWaterfallCompare(renderSkinBigPreview(selectedSkin))}
                  {/* 風格分配說明：消除商家對固定展示風格的誤解 */}
                  <div style={{ fontSize: 11, color: '#8C8C8C', marginTop: 8, lineHeight: 1.7 }}>
                    💡 {t('styleAutoHint')}
                  </div>
                </div>
              ) : (
                <Empty description={t('skinEmptyHint')} image={Empty.PRESENTED_IMAGE_SIMPLE} />
              )}
            </Card>

            {/* 訂單結算 */}
            <Card size="small" title={t('settlementTitle')}>
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
                  <span style={{ fontSize: 22, fontWeight: 700, color: '#fff' }}>${merchantBalance.toLocaleString()}</span>
                </div>
              )}
              {/* 贈送天數抵扣（混合支付時或非混合支付選擇贈送天數時顯示） */}
              {(mixedPayment || paymentMode === 'gift') && (
                <div style={{ border: '1px solid #FFD591', background: '#FFF7E6', borderRadius: 6, padding: '10px 12px', marginBottom: 12 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: '#E8720C' }}>贈送天數抵扣</span>
                    <span style={{ fontSize: 11, color: '#8c8c8c' }}>可用 <span style={{ fontWeight: 700, color: '#E8720C' }}>{giftDaysBalance}</span> 天</span>
                  </div>
                  {giftDaysBalance === 0 ? (
                    <div style={{ fontSize: 11, color: '#bfbfbf' }}>暫無可用贈送天數</div>
                  ) : effectiveDays === 0 ? (
                    <div style={{ fontSize: 11, color: '#bfbfbf' }}>請先選擇購買日期</div>
                  ) : (
                    <>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: 12, color: '#595959', whiteSpace: 'nowrap' }}>抵扣</span>
                        <InputNumber
                          size="small" min={0} max={maxGiftDaysUsable} value={effectiveGiftDays} precision={0}
                          onChange={(v) => setGiftDaysUsed(typeof v === 'number' ? v : 0)}
                          style={{ width: 72 }}
                        />
                        <span style={{ fontSize: 12, color: '#595959', whiteSpace: 'nowrap' }}>天</span>
                        <Button size="small" type="link" style={{ padding: 0, fontSize: 12, marginLeft: 'auto' }}
                          onClick={() => setGiftDaysUsed(maxGiftDaysUsable)}>全部抵扣</Button>
                      </div>
                      <div style={{ fontSize: 11, color: '#8c8c8c', marginTop: 6 }}>
                        最多可抵扣 {maxGiftDaysUsable} 天 <span style={{ fontWeight: 700, color: '#E8720C' }}>-${giftDeduction}</span>
                      </div>
                    </>
                  )}
                </div>
              )}
              <div style={{ fontSize: 13, color: '#595959', display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>{t('purchaseStore')}</span>
                  <span style={{ color: '#262626', fontWeight: 500 }}>{selectedStore?.storeName || '-'}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>{t('skinKit')}</span>
                  <span style={{ color: '#262626', fontWeight: 500 }}>{selectedSkin ? `${selectedSkin.name}（$${effectiveSkinPricePerDay}${t('perDay')}）` : t('notSelected')}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>{t('deliveryPeriod')}</span>
                  <span style={{ color: '#262626', fontWeight: 500 }}>{periodText}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>{t('tierDiscountRate')}</span>
                  {currentTier ? <Tag color="green" style={{ marginRight: 0 }}>{currentTier.discount / 10}{t('discount')}</Tag> : <Tag style={{ marginRight: 0 }}>{t('noDiscount')}</Tag>}
                </div>
              </div>
              <div style={{ background: '#FAFAFA', borderRadius: 6, padding: '12px 16px', marginBottom: 12, fontSize: 13 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                  <span style={{ color: '#8C8C8C' }}>{t('orderOriginal')}</span>
                  <span style={{ fontWeight: 600, color: '#595959' }}>${priceSummary.original}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                  <span style={{ color: '#8C8C8C' }}>{t('orderDiscount')}</span>
                  <span style={{ fontWeight: 600, color: '#FA8C16' }}>-${priceSummary.saved}</span>
                </div>
                {giftDeduction > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                    <span style={{ color: '#8C8C8C' }}>贈送天數抵扣</span>
                    <span style={{ fontWeight: 600, color: '#E8720C' }}>-${giftDeduction}</span>
                  </div>
                )}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px dashed #E8E8E8', paddingTop: 8, marginTop: 8 }}>
                  <span style={{ color: '#262626', fontWeight: 600 }}>{t('totalPayable')}</span>
                  <span style={{ fontSize: 22, fontWeight: 700, color: '#FF4D4F' }}>${priceSummary.payable}</span>
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
                {t('payButton')}
              </Button>
            </Card>
          </div>
        </div>
      )}

      {/* 支付確認彈窗 */}
      <Modal
        title={t('confirmOrder')} open={isPaymentModalVisible}
        onOk={handleConfirmPayment} onCancel={() => setIsPaymentModalVisible(false)}
        okText={t('confirmPay')} cancelText={t('cancel')}
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
                <span style={{ color: '#595959' }}>{t('skinKitColon')}</span>
                <span style={{ fontWeight: 600 }}>{selectedSkin.name}（${effectiveSkinPricePerDay}{t('perDay')}）</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                <span style={{ color: '#595959' }}>{t('deliveryPeriodColon')}</span>
                <span style={{ fontWeight: 600 }}>{periodTextFull}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, color: '#fa8c16' }}>
                <span>{t('orderDiscountColon')}</span>
                <span style={{ fontWeight: 600 }}>-${priceSummary.saved}{currentTier ? `（${currentTier.discount / 10}${t('discount')}）` : ''}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 16, color: '#ff4d4f', borderTop: '1px solid #d9d9d9', paddingTop: 8, marginTop: 8 }}>
                <span style={{ fontWeight: 600 }}>{t('actualAmountColon')}</span>
                <span style={{ fontWeight: 700 }}>${priceSummary.sale}</span>
              </div>
            </div>
          </div>
        )}
      </Modal>

      {/* 支付成功彈窗 */}
      <Modal
        title={t('purchaseSuccess')} open={isSuccessModalVisible} onCancel={() => setIsSuccessModalVisible(false)}
        footer={[
          <Button key="view" type="primary" onClick={handleViewOrder}>{t('viewOrder')}</Button>,
          <Button key="continue" onClick={handleContinuePurchase} style={{ background: '#fa8c16', borderColor: '#fa8c16', color: '#fff' }}>{t('continueBuy')}</Button>,
        ]}
        width={400}
      >
        <div style={{ textAlign: 'center', padding: '20px 0' }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>✅</div>
          <p style={{ fontSize: 16, color: '#595959', marginBottom: 24 }}>{t('skinPurchaseSuccess')}</p>
          <div style={{ background: 'linear-gradient(135deg, #fff7e6 0%, #ffe58f 100%)', padding: '20px 16px', borderRadius: 8 }}>
            <p style={{ fontSize: 14, color: '#8c8c8c', marginBottom: 8 }}>{t('deductedPromo')}</p>
            <p style={{ fontSize: 36, fontWeight: 700, color: '#fa541c', margin: 0, lineHeight: 1.2 }}>${priceSummary.sale}</p>
          </div>
        </div>
      </Modal>

      {/* 待開售日期提醒彈窗（同盤活復蘇規範） */}
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
