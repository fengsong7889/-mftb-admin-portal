import { useState, useMemo, useEffect } from 'react'
import type { ReactNode, CSSProperties } from 'react'
import { useTranslation } from 'react-i18next'
import { Button, Card, DatePicker, Empty, Form, InputNumber, Modal, Select, Space, Tag, message } from 'antd'
import {
  SearchOutlined,
  ReloadOutlined,
  CheckCircleFilled,
  SkinOutlined,
  CalendarOutlined,
  ShoppingCartOutlined,
} from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import dayjs from 'dayjs'
import type { Dayjs } from 'dayjs'
import { AlgorithmType } from '../Recommend/constants'
import { fetchAdAlgorithms } from '../../api/adPromotion'

/** 後端品牌名 → UI 品牌值 映射 */
const BACKEND_TO_UI_BRAND: Record<string, string> = { flashBee: 'shanfeng', mFood: 'mfood' }

/**
 * 人氣商家 - 購買廣告（皮膚售賣，店鋪推廣版）
 * 對應銷售定價「人氣商家」皮膚定價配置：業務配置多套皮膚（邊框 + 大圖 + 菜品展示佈局）並按天定價，
 * 選擇皮膚套件 + 購買時長完成下單，購買後 APP 瀑布流店鋪卡片按所選皮膚展示。
 * 與廣告銷售購買界面唯一區別：無需選擇門店（只選算法名稱 + 所屬品牌）。
 */

/** 菜品展示佈局（同銷售定價配置）：大圖拼列 / 階梯輪播 */
type DishLayout = 'grid' | 'carousel'
// DISH_LAYOUT_LABEL moved inside component for t() access

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

/** 購買天數快捷檔 */
const QUICK_DAY_OPTIONS = [7, 15, 30, 60, 90]
/** 天數可選範圍 */
const MIN_BUY_DAYS = 1
const MAX_BUY_DAYS = 180

/** 人氣商家算法選項：從算法庫 API 動態加載 */

export default function PopularSkinPicker() {
  const { t } = useTranslation('adSales')
  const navigate = useNavigate()
  const DISH_LAYOUT_LABEL: Record<DishLayout, string> = { grid: t('layoutGrid'), carousel: t('layoutCarousel') }

  // 查詢條件（算法名稱 / 所屬品牌；店鋪推廣入口無需選擇門店）
  const [searchAlgorithm, setSearchAlgorithm] = useState<string | null>(null)
  const [searchBrand, setSearchBrand] = useState<string | null>(null)
  const [hasSearched, setHasSearched] = useState(false)
  // 真实算法下拉（從算法庫 API 動態加載）
  const [algorithmOptions, setAlgorithmOptions] = useState<Array<{ label: string; value: string }>>([])
  const [algorithmBrandOverrides, setAlgorithmBrandOverrides] = useState<Record<string, string>>({})
  const [algorithmNameMap, setAlgorithmNameMap] = useState<Record<string, string>>({})

  // 加载算法库已启用的人气商家算法
  useEffect(() => {
    fetchAdAlgorithms({ page: 1, size: 200, algoType: AlgorithmType.POPULAR_MERCHANT_KA, status: 1, hasPricing: true })
      .then(res => {
        if (!res) return
        const brandOverrides: Record<string, string> = {}
        const nameMap: Record<string, string> = {}
        const options = res.records.map(a => {
          const value = String(a.id)
          const uiBrand = BACKEND_TO_UI_BRAND[a.brand || '']
          if (uiBrand) brandOverrides[value] = uiBrand
          nameMap[value] = a.algoName
          return { label: a.algoName, value }
        })
        setAlgorithmOptions(options)
        setAlgorithmBrandOverrides(brandOverrides)
        setAlgorithmNameMap(nameMap)
      }).catch(() => {})
  }, [])

  // 選購狀態
  const [selectedSkinId, setSelectedSkinId] = useState<number | null>(null)
  const [startDate, setStartDate] = useState<Dayjs>(dayjs().add(1, 'day'))
  const [buyDays, setBuyDays] = useState<number>(QUICK_DAY_OPTIONS[0])
  const [merchantBalance, setMerchantBalance] = useState(15800)
  const [isPaymentModalVisible, setIsPaymentModalVisible] = useState(false)
  const [isSuccessModalVisible, setIsSuccessModalVisible] = useState(false)
  // 階梯輪播餐品指針（同定價預覽）：current 為當前張，prev 為正在向左滑出的上一張
  const [dishState, setDishState] = useState<{ current: number; prev: number | null }>({ current: 0, prev: null })

  const selectedSkin = SALE_SKINS.find(s => s.id === selectedSkinId) || null
  const selectedAlgorithm = searchAlgorithm ? { label: algorithmNameMap[searchAlgorithm] || '-', value: searchAlgorithm } : null
  const endDate = startDate.add(buyDays - 1, 'day')

  // 階梯輪播預覽：所選皮膚為階梯輪播佈局時逐張輪播，切換皮膚時重置
  useEffect(() => {
    if (!selectedSkin || selectedSkin.dishLayout !== 'carousel') return
    setDishState({ current: 0, prev: null })
    const timer = setInterval(() => {
      setDishState(s => ({ current: (s.current + 1) % PREVIEW_DISHES.length, prev: s.current }))
    }, 2200)
    return () => clearInterval(timer)
  }, [selectedSkin])

  // 命中折扣檔位
  const currentTier = useMemo(() => {
    for (let i = DISCOUNT_TIERS.length - 1; i >= 0; i--) {
      if (buyDays >= DISCOUNT_TIERS[i].minDays) return DISCOUNT_TIERS[i]
    }
    return null
  }, [buyDays])

  // 費用計算
  const priceSummary = useMemo(() => {
    if (!selectedSkin) return { original: 0, sale: 0, saved: 0 }
    const original = selectedSkin.pricePerDay * buyDays
    const sale = currentTier ? Math.round(original * currentTier.discount / 100) : original
    return { original, sale, saved: original - sale }
  }, [selectedSkin, buyDays, currentTier])

  // 算法變更：自動帶出品牌
  const handleAlgorithmChange = (value: string | null) => {
    setSearchAlgorithm(value)
    setSearchBrand(value ? (algorithmBrandOverrides[value] ?? null) : null)
  }

  const handleSearch = () => {
    if (!searchAlgorithm) { message.warning(t('selectAlgorithm')); return }
    if (!searchBrand) { message.warning(t('selectBrand')); return }
    setHasSearched(true)
  }
  const handleReset = () => {
    setSearchAlgorithm(null); setSearchBrand(null)
    setHasSearched(false); setSelectedSkinId(null)
  }

  // 訂單支付
  const handlePayment = () => {
    if (!selectedSkin) { message.warning(t('selectSkinFirst')); return }
    if (priceSummary.sale > merchantBalance) { message.error(t('balanceInsufficient')); return }
    setIsPaymentModalVisible(true)
  }
  const handleConfirmPayment = () => {
    setMerchantBalance(prev => prev - priceSummary.sale)
    setIsPaymentModalVisible(false)
    setIsSuccessModalVisible(true)
  }
  const handleViewOrder = () => {
    setIsSuccessModalVisible(false)
    navigate(`/promotion-order-manage?type=${encodeURIComponent('人氣商家')}`)
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
      }}>{'示例店鋪'}</div>
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
        {renderStoreLogo('示例店鋪', large ? 56 : 44)}
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
          {renderStoreLogo('示例店鋪', 40)}
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
      {/* 查詢區域 - 店鋪推廣入口無需選擇門店 */}
      <div className="search-section" style={{ marginBottom: 16 }}>
        <Form layout="inline" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px 12px' }}>
          <Form.Item label={t('algoNameLabel')}>
            <Select placeholder={t('algoSearchPlaceholder')} value={searchAlgorithm} onChange={handleAlgorithmChange} allowClear showSearch optionFilterProp="label"
              options={algorithmOptions} />
          </Form.Item>
          <Form.Item label={t('brandLabel')}>
            <Select placeholder={t('brandAutoHint')} value={searchBrand} onChange={v => setSearchBrand(v)} allowClear
              options={[{ label: t('flashBee'), value: 'shanfeng' }, { label: 'mFood', value: 'mfood' }]} disabled />
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
                        <span style={{ fontSize: 10, color: '#E8720C', whiteSpace: 'nowrap' }}>{t('soldCount', { count: skin.sold })}</span>
                        <div style={{ flex: 1 }} />
                        <span style={{ fontSize: 16, fontWeight: 700, color: '#FF4D4F' }}>${skin.pricePerDay}</span>
                        <span style={{ fontSize: 10, color: '#8C8C8C', marginLeft: 1 }}>{t('perDay')}</span>
                      </div>
                    </div>
                  )
                })}
              </div>
            </Card>

            {/* ② 選擇購買時長 */}
            <Card
              title={<Space><CalendarOutlined style={{ color: '#1890FF' }} /><span>{t('selectDurationTitle')}</span><span style={{ fontSize: 12, color: '#8C8C8C', fontWeight: 400 }}>{t('durationPricingHint')}</span></Space>}
              bodyStyle={{ padding: '16px 20px' }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 24, flexWrap: 'wrap', marginBottom: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 13, color: '#595959' }}>{t('startDateLabel')}</span>
                  <DatePicker
                    value={startDate}
                    allowClear={false}
                    disabledDate={d => d.isBefore(dayjs().add(1, 'day'), 'day')}
                    onChange={d => { if (d) setStartDate(d) }}
                  />
                  <span style={{ fontSize: 11, color: '#8C8C8C' }}>{t('earliestNextDay')}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 13, color: '#595959' }}>{t('endDateLabel')}</span>
                  <span style={{ fontSize: 13, fontWeight: 600, color: '#262626' }}>{endDate.format('YYYY-MM-DD')}</span>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 13, color: '#595959' }}>{t('buyDaysLabel')}</span>
                {QUICK_DAY_OPTIONS.map(d => {
                  const isActive = buyDays === d
                  const tier = [...DISCOUNT_TIERS].reverse().find(tier => d >= tier.minDays)
                  return (
                    <div
                      key={d}
                      onClick={() => setBuyDays(d)}
                      style={{
                        position: 'relative', padding: '6px 18px', borderRadius: 6, cursor: 'pointer',
                        border: isActive ? '2px solid #E8720C' : '1px solid #d9d9d9',
                        background: isActive ? '#FFF7E6' : '#fff',
                        color: isActive ? '#E8720C' : '#595959',
                        fontSize: 13, fontWeight: isActive ? 600 : 400,
                        transition: 'all 0.2s',
                      }}
                    >
                      {d}{t('unitDay')}
                      {tier && (
                        <span style={{
                          position: 'absolute', top: -9, right: -8, fontSize: 10, color: '#fff',
                          background: 'linear-gradient(135deg, #FF4D4F, #FF7A45)', borderRadius: 8,
                          padding: '0 6px', lineHeight: '16px', fontWeight: 600,
                        }}>{tier.discount / 10}{t('discountSuffix')}</span>
                      )}
                    </div>
                  )
                })}
                <span style={{ fontSize: 13, color: '#595959', marginLeft: 8 }}>{t('customLabel')}</span>
                <InputNumber
                  min={MIN_BUY_DAYS}
                  max={MAX_BUY_DAYS}
                  precision={0}
                  value={buyDays}
                  onChange={v => { if (v) setBuyDays(v) }}
                  addonAfter={t('unitDay')}
                  style={{ width: 120 }}
                />
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
                  <div style={{ fontSize: 12, color: '#8C8C8C', margin: '12px 0 6px' }}>{t('bigMode')}</div>
                  {renderWaterfallCompare(renderSkinBigPreview(selectedSkin))}
                </div>
              ) : (
                <Empty description={t('skinEmptyHint')} image={Empty.PRESENTED_IMAGE_SIMPLE} />
              )}
            </Card>

            {/* 訂單結算 */}
            <Card size="small" title={t('settlementTitle')}>
              <div style={{ padding: '12px 16px', marginBottom: 12, background: 'linear-gradient(135deg, #E8720C 0%, #F39C12 100%)', borderRadius: 6, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 13, color: '#fff', opacity: 0.9 }}>{t('promoBalance')}</span>
                <span style={{ fontSize: 22, fontWeight: 700, color: '#fff' }}>${merchantBalance.toLocaleString()}</span>
              </div>
              <div style={{ fontSize: 13, color: '#595959', display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>{t('buyAlgo')}</span>
                  <span style={{ color: '#262626', fontWeight: 500 }}>{selectedAlgorithm?.label || '-'}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>{t('skinKit')}</span>
                  <span style={{ color: '#262626', fontWeight: 500 }}>{selectedSkin ? `${selectedSkin.name}（$${selectedSkin.pricePerDay}/${t('unitDay')}）` : t('notSelected')}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>{t('deliveryPeriod')}</span>
                  <span style={{ color: '#262626', fontWeight: 500 }}>{startDate.format('MM-DD')} ~ {endDate.format('MM-DD')}（{buyDays}{t('unitDay')}）</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>{t('tierDiscountRate')}</span>
                  {currentTier ? <Tag color="green" style={{ marginRight: 0 }}>{currentTier.discount / 10}{t('discountSuffix')}</Tag> : <Tag style={{ marginRight: 0 }}>{t('noDiscount')}</Tag>}
                </div>
              </div>
              <div style={{ background: '#FAFAFA', borderRadius: 6, padding: '12px 16px', marginBottom: 12, fontSize: 13 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                  <span style={{ color: '#8C8C8C' }}>{t('orderOriginalPrice')}</span>
                  <span style={{ fontWeight: 600, color: '#595959' }}>${priceSummary.original}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                  <span style={{ color: '#8C8C8C' }}>{t('orderDiscount')}</span>
                  <span style={{ fontWeight: 600, color: '#FA8C16' }}>-${priceSummary.saved}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px dashed #E8E8E8', paddingTop: 8, marginTop: 8 }}>
                  <span style={{ color: '#262626', fontWeight: 600 }}>{t('totalPayable')}</span>
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
                <span style={{ fontWeight: 600 }}>{selectedSkin.name}（$${selectedSkin.pricePerDay}/{t('unitDay')}）</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                <span style={{ color: '#595959' }}>{t('deliveryPeriodColon')}</span>
                <span style={{ fontWeight: 600 }}>{startDate.format('YYYY-MM-DD')} ~ {endDate.format('YYYY-MM-DD')}（{buyDays}{t('unitDay')}）</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, color: '#fa8c16' }}>
                <span>{t('orderDiscountColon')}</span>
                <span style={{ fontWeight: 600 }}>-${priceSummary.saved}{currentTier ? `（${currentTier.discount / 10}${t('discountSuffix')}）` : ''}</span>
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
    </div>
  )
}
