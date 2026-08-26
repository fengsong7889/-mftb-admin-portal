import { useState, useMemo, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Button, Card, DatePicker, Empty, Form, InputNumber, Modal, Select, Space, Switch, message, Radio, Tag } from 'antd'
import {
  SearchOutlined,
  ReloadOutlined,
  CheckCircleFilled,
  CalendarOutlined,
  ShoppingCartOutlined,
  DownOutlined,
  UpOutlined,
  DeleteOutlined,
} from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import NoRefundBadge from './NoRefundBadge'
import dayjs from 'dayjs'
import type { Dayjs } from 'dayjs'
import { fetchGiftAvailableDays } from '../../api/gift'
import { usePaymentRule } from '../../hooks/usePaymentRule'
import { fetchAdAlgorithms, fetchAdSignboardInventory, placeAdSignboardOrder } from '../../api/adPromotion'
import { fetchStores, type StoreItem } from '../../api/store'
import { fetchFinAccounts } from '../../api/finance'
import { AlgorithmType, ServiceStatus, REGION_LABEL_KEY } from '../Recommend/constants'

/** 金字招牌廣告類型標識（與後端一致） */
const GIFT_AD_TYPE_SIGNBOARD = 'golden_signboard'

const { RangePicker } = DatePicker

/**
 * 金字招牌 - 購買廣告（標籤選購）
 * 對應銷售定價「金字招牌」標籤定價配置：業務配置各標籤（熱門/人氣/銷量/好評/復購/收藏/顧客數）
 * 按天定價並設梯度折扣，商家在此選擇標籤 + 購買時長完成下單。
 *
 * 購買流程：選擇招牌名稱 → 選擇門店 → 勾選標籤 → 日曆選日期 → 結算支付
 */

/** 招牌標籤類型（與定價配置一致） */
const SIGNBOARD_LABELS = [
  { value: 'hot', label: '熱門', icon: '🔥', color: '#FF4D4F', bg: '#FFF1F0', border: '#FFCCC7' },
  { value: 'popular', label: '人氣', icon: '👑', color: '#FAAD14', bg: '#FFFBE6', border: '#FFE58F' },
  { value: 'sales', label: '銷量', icon: '📈', color: '#1890FF', bg: '#E6F7FF', border: '#91D5FF' },
  { value: 'rating', label: '好評', icon: '⭐', color: '#52C41A', bg: '#F6FFED', border: '#B7EB8F' },
  { value: 'repurchase', label: '復購', icon: '🔄', color: '#722ED1', bg: '#F9F0FF', border: '#D3ADF7' },
  { value: 'favorites', label: '收藏', icon: '❤️', color: '#EB2F96', bg: '#FFF0F6', border: '#FFADD2' },
  { value: 'customers', label: '顧客數', icon: '👥', color: '#13C2C2', bg: '#E6FFFB', border: '#87E8DE' },
] as const

/** 對比類標籤：按全澳/商圈兩個場景定價 */
const COMPARISON_LABELS = ['hot', 'popular', 'sales', 'rating', 'repurchase']
/** 統計類標籤：全量數據門檻，無場景 */
const AGGREGATE_LABELS = ['favorites', 'customers']
/** 場景定義（與定價頁面保持一致） */
const SCENARIO_DEFS = [
  { apiValue: 'all_macau', label: '全澳對比', icon: '🌏', color: '#E8720C', bg: '#FFF7E6', border: '#FFD591' },
  { apiValue: 'district', label: '商圈對比', icon: '🏙️', color: '#1890FF', bg: '#E6F7FF', border: '#91D5FF' },
] as const

type LabelValue = typeof SIGNBOARD_LABELS[number]['value']

/** 構造選購項 key：對比類 = labelType:scenario，統計類 = labelType */
function itemKey(labelType: string, scenario?: string | null) {
  return scenario ? `${labelType}:${scenario}` : labelType
}
/** 從 key 解析出 labelType */
function keyToLabelType(key: string) { return key.split(':')[0] }
/** 從 key 解析出 scenario */
function keyToScenario(key: string) {
  const parts = key.split(':')
  return parts.length > 1 ? parts[1] : null
}

/**
 * 生成標籤展示文案（與算法庫配置一致）
 * - 對比類標籤：
 *   - 熱門/人氣/好評：「{region}{category}{label}店鋪」
 *   - 銷量：「{region}{category}銷量第{rank}名」
 *   - 復購：「{region}{category}回頭率超高店鋪」
 * - 統計類標籤：
 *   - 收藏：「{count}人收藏好店」
 *   - 顧客數：「近期{count}人下單」
 */
function getTagDisplayText(
  labelType: string,
  scenario: string | null,
  regionName: string,
  t: (key: string) => string
): string {
  const labelCfg = SIGNBOARD_LABELS.find(l => l.value === labelType)
  if (!labelCfg) return labelType

  // 統計類標籤（無場景）
  if (!scenario) {
    if (labelType === 'favorites') return '千人收藏好店'
    if (labelType === 'customers') return '近期999人下單'
    return `${labelCfg.label}店鋪`
  }

  // 對比類標籤：構建區域前綴
  const region = scenario === 'all_macau' ? '全澳' : (regionName || '商圈')
  
  // 品類佔位符（實際應從算法配置獲取，此處用佔位符示意）
  // TODO: 從算法配置中讀取品類名稱
  const category = '' // 暫時不顯示品類，待接入算法配置數據

  // 銷量標籤：特殊文案「銷量第X名」
  if (labelType === 'sales') {
    return `${region}${category}銷量第1名`
  }

  // 復購標籤：特殊文案「回頭率超高店鋪」
  if (labelType === 'repurchase') {
    return `${region}${category}回頭率超高店鋪`
  }

  // 熱門/人氣/好評：「{region}{category}{label}店鋪」
  return `${region}${category}${labelCfg.label}店鋪`
}

/** 最長可購買天數（默認值，查詢後從後端獲取） */
const MAX_BUY_DAYS = 180
/** 待開售日期每日放票時間 */
const PRESALE_OPEN_HOUR = 10
function getPresaleOpenTime(date: Dayjs, sellableDays: number): Dayjs {
  return date.startOf('day').subtract(sellableDays, 'day').hour(PRESALE_OPEN_HOUR).minute(0).second(0)
}

/** 月份選擇器每頁展示數 */
const MONTHS_PER_PAGE = 6

/** 解析梯度折扣 JSON */
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

/** 標籤定價信息（從銷售定價配置加載） */
interface LabelPricingInfo {
  labelType: string
  scenario?: string | null
  pricePerDay: number
  discountTiers: Array<{ minDays: number; discount: number }>
  enabled: boolean | number
  /** 商家是否滿足資格條件 */
  qualified: boolean
  /** 資格條件描述 */
  conditionDesc?: string | null
  /** 本門店實際情況（排名/數值） */
  actualDesc?: string | null
}

export default function GoldenSignboardLabelPicker() {
  const { t } = useTranslation('adSales')
  const { t: tr } = useTranslation()
  const WEEKDAY_LABELS = t('weekdayShort', { returnObjects: true }) as string[]

  const navigate = useNavigate()

  // 查詢條件
  const [searchAlgorithm, setSearchAlgorithm] = useState<string | null>(null)
  const [searchBrand, setSearchBrand] = useState<string | null>(null)
  const [searchStoreName, setSearchStoreName] = useState<string | null>(null)
  const [searchBD, setSearchBD] = useState<string | null>(null)
  const [hasSearched, setHasSearched] = useState(false)

  // 選購狀態（selectedLabels 存儲複合 key：對比類 = labelType:scenario，統計類 = labelType）
  const [selectedLabels, setSelectedLabels] = useState<string[]>([])
  // 每個標籤獨立的日期選擇（key 為複合 key）
  const [labelDates, setLabelDates] = useState<Record<string, string[]>>({})
  // 當前正在編輯日期的標籤（複合 key）
  const [activeDateLabel, setActiveDateLabel] = useState<string | null>(null)
  const [expandedMonths, setExpandedMonths] = useState<Record<string, boolean>>({})
  const [calMonth, setCalMonth] = useState<Dayjs>(dayjs().add(1, 'day').startOf('month'))
  const [hoveredCalMonth, setHoveredCalMonth] = useState<string | null>(null)
  const [monthPage, setMonthPage] = useState(0)
  const [batchRange, setBatchRange] = useState<[Dayjs | null, Dayjs | null] | null>(null)
  const [excludedWeekdays, setExcludedWeekdays] = useState<number[]>([])
  // 待開售提醒彈窗
  const [presaleInfo, setPresaleInfo] = useState<{ date: string; weekday: string; openTime: string } | null>(null)
  const [merchantBalance, setMerchantBalance] = useState<number>(0)
  const [isPaymentModalVisible, setIsPaymentModalVisible] = useState(false)
  const [isSuccessModalVisible, setIsSuccessModalVisible] = useState(false)

  // 贈送天數抵扣
  const [giftDaysBalance, setGiftDaysBalance] = useState(0)
  const [giftDaysUsed, setGiftDaysUsed] = useState(0)
  const [paidGiftDays, setPaidGiftDays] = useState(0)
  const [paidPromoAmount, setPaidPromoAmount] = useState(0)
  const [paidPaymentMode, setPaidPaymentMode] = useState<'promo' | 'gift' | 'mixed'>('promo')
  const { mixedPayment, switchable, mode } = usePaymentRule(GIFT_AD_TYPE_SIGNBOARD)
  const [paymentMode, setPaymentMode] = useState<'promo' | 'gift'>('promo')
  // 強制模式：僅推廣金/僅贈送天數時固定支付方式，否則跟隨用戶切換
  const activeMode: 'promo' | 'gift' = mode === 'promo_only' ? 'promo' : mode === 'gift_only' ? 'gift' : paymentMode

  // 真實接口接線
  const [pricingOptions, setPricingOptions] = useState<Array<{ label: string; value: string }>>([])
  const [storeOptions, setStoreOptions] = useState<Array<{ label: string; value: string }>>([])
  const [storeMap, setStoreMap] = useState<Record<string, StoreItem>>({})
  const [bdOptions, setBdOptions] = useState<Array<{ label: string; value: string }>>([])
  // 標籤定價信息（查詢後加載）
  const [labelPricings, setLabelPricings] = useState<LabelPricingInfo[]>([])
  const [sellableDays, setSellableDays] = useState(MAX_BUY_DAYS)
  const [refundEnabled, setRefundEnabled] = useState(false)
  const [paying, setPaying] = useState(false)
  // 過濾不滿足條件的標籤（開啟後直接隱藏）
  const [hideUnqualified, setHideUnqualified] = useState(false)

  // 開啟過濾後是否仍有可見標籤（用於空態展示）
  const hasVisibleLabels = useMemo(() => {
    if (!hideUnqualified) return true
    return labelPricings.some(lp => (lp.enabled === true || lp.enabled === 1) && lp.pricePerDay > 0 && (lp.qualified ?? true))
  }, [hideUnqualified, labelPricings])

  const selectedStore = searchStoreName ? storeMap[searchStoreName] : undefined

  // 門店所在商圈名稱（用於標籤展示文案）
  const storeRegionName = useMemo(() => {
    if (!selectedStore?.region) return ''
    const regionKey = REGION_LABEL_KEY[selectedStore.region]
    return regionKey ? t(regionKey) : ''
  }, [selectedStore, t])

  // 標籤價格映射（key 為複合 key）
  const labelPriceMap = useMemo(() => {
    const map: Record<string, number> = {}
    labelPricings.forEach(lp => { map[itemKey(lp.labelType, lp.scenario)] = lp.pricePerDay })
    return map
  }, [labelPricings])

  // 各標籤梯度折扣映射（key 為複合 key）
  const labelDiscountMap = useMemo(() => {
    const map: Record<string, Array<{ minDays: number; discount: number }>> = {}
    labelPricings.forEach(lp => { map[itemKey(lp.labelType, lp.scenario)] = lp.discountTiers })
    return map
  }, [labelPricings])

  // 可售天數範圍
  const customMinDate = dayjs().add(1, 'day').startOf('day')
  const customMaxDate = dayjs().add(sellableDays, 'day').startOf('day')
  // 月份列表
  const calMonths: Dayjs[] = []
  for (let m = customMinDate.startOf('month'); !m.isAfter(customMaxDate, 'month'); m = m.add(1, 'month')) calMonths.push(m)
  while (calMonths.length % MONTHS_PER_PAGE !== 0) calMonths.push(calMonths[calMonths.length - 1].add(1, 'month'))
  const monthPageCount = Math.ceil(calMonths.length / MONTHS_PER_PAGE)
  const visibleMonths = calMonths.slice(monthPage * MONTHS_PER_PAGE, (monthPage + 1) * MONTHS_PER_PAGE)

  // 當前編輯標籤的已選日期（activeDateLabel 現在是複合 key）
  const customDates = activeDateLabel ? (labelDates[activeDateLabel] ?? []) : []
  // 所有標籤的總天數（用於贈送天數上限等）
  const totalDaysAll = useMemo(() => Object.values(labelDates).reduce((s, d) => s + d.length, 0), [labelDates])
  // 各標籤天數（key 為複合 key）
  const labelDaysMap = useMemo(() => {
    const r: Record<string, number> = {}
    selectedLabels.forEach(l => { r[l] = (labelDates[l] ?? []).length })
    return r
  }, [selectedLabels, labelDates])

  // 招牌名稱下拉：先選品牌，再按品牌加載算法（金字招牌 algoType=13，僅返回有啟用定價配置的算法）

  // 加載門店下拉
  useEffect(() => {
    fetchStores({ page: 1, size: 500 })
      .then(res => {
        const stores = res.records ?? []
        const opts = stores.map(s => ({ label: `${s.storeName}（${s.storeCode}）`, value: s.storeCode }))
        setStoreOptions(opts)
        const map: Record<string, StoreItem> = {}
        stores.forEach(s => { if (s.storeCode) map[s.storeCode] = s })
        setStoreMap(map)
      })
      .catch(() => { /* 靜默 */ })
  }, [])

  // 品牌變更
  const handleBrandChange = (value: string | null) => {
    setSearchBrand(value)
    setSearchAlgorithm(null)
    // 品牌變更後重新加載算法下拉
    if (value) {
      const backendBrand = value === 'shanfeng' ? 'flashBee' : value === 'mfood' ? 'mFood' : value
      fetchAdAlgorithms({ page: 1, size: 200, status: ServiceStatus.ENABLED, algoType: AlgorithmType.GOLDEN_SIGNBOARD, brand: backendBrand, hasPricing: true } as Parameters<typeof fetchAdAlgorithms>[0])
        .then(res => {
          const opts = (res.records ?? [])
            .filter(a => a.updatedBy !== '系統')
            // 算法名稱後追加算法ID（如 WDxxxxxxxx）
            .map(a => ({ label: a.algoName ? (a.algoCode ? `${a.algoName}(${a.algoCode})` : a.algoName) : `招牌#${a.id}`, value: String(a.id ?? 0) }))
          setPricingOptions(opts)
        })
        .catch(() => setPricingOptions([]))
    } else {
      setPricingOptions([])
    }
  }

  const handleAlgorithmChange = (value: string | null) => {
    setSearchAlgorithm(value)
  }

  // 門店變更：自動帶出BD
  const handleStoreChange = (value: string | null) => {
    setSearchStoreName(value)
    const store = value ? storeMap[value] : undefined
    const bds = (store?.bdList ?? []).map(b => ({ label: b.bdName || b.bdEmpId, value: b.bdEmpId }))
    setBdOptions(bds)
    setSearchBD(bds[0]?.value ?? null)
  }

  // 查詢：加載標籤定價信息
  const handleSearch = async () => {
    if (!searchAlgorithm) { message.warning(t('selectAlgorithm')); return }
    if (!searchBrand) { message.warning(t('selectBrand')); return }
    if (!searchStoreName) { message.warning(t('selectStore')); return }

    const algoId = Number(searchAlgorithm)
    const store = storeMap[searchStoreName]
    const groupCode = store?.groupCode
    const storeCode = store?.storeCode

    try {
      const inventory = await fetchAdSignboardInventory(algoId, storeCode, groupCode)
      // 從後端響應構建標籤定價列表（含場景）
      const pricings: LabelPricingInfo[] = (inventory.labels ?? []).map(lp => ({
        labelType: lp.labelType,
        scenario: lp.scenario ?? null,
        pricePerDay: Number(lp.pricePerDay) || 0,
        discountTiers: parseDayTiers(lp.discountTiers ?? undefined),
        enabled: lp.enabled,
        qualified: lp.qualified ?? true,
        conditionDesc: lp.conditionDesc ?? null,
        actualDesc: lp.actualDesc ?? null,
      }))
      setLabelPricings(pricings)
      setSellableDays(inventory.presaleDays ?? MAX_BUY_DAYS)
      setRefundEnabled(inventory.refundEnabled === 1 || inventory.refundEnabled === true)
    } catch {
      message.error('獲取庫存信息失敗，請稍後重試')
      setLabelPricings([])
      setSellableDays(MAX_BUY_DAYS)
      setRefundEnabled(false)
    }

    setHasSearched(true)
    setSelectedLabels([])
    setLabelDates({})
    setActiveDateLabel(null)

    // 推廣金餘額
    const backendBrand = searchBrand === 'shanfeng' ? 'flashBee' : searchBrand === 'mfood' ? 'mFood' : searchBrand
    fetchFinAccounts({ groupId: groupCode, brand: backendBrand, page: 1, size: 10 })
      .then(res => {
        const acc = (res.records ?? [])[0]
        setMerchantBalance(acc ? Number(acc.virtualBalance) : 0)
      }).catch(() => setMerchantBalance(0))

    // 贈送天數餘額
    const storeIdNum = store?.id ?? 0
    fetchGiftAvailableDays(storeIdNum, GIFT_AD_TYPE_SIGNBOARD)
      .then(days => setGiftDaysBalance(days))
      .catch(() => setGiftDaysBalance(0))
  }

  const handleReset = () => {
    setSearchAlgorithm(null); setSearchBrand(null)
    setSearchStoreName(null); setSearchBD(null)
    setHasSearched(false); setSelectedLabels([])
    setLabelPricings([]); setLabelDates({}); setActiveDateLabel(null)
    setPricingOptions([])
  }

  // 標籤勾選/取消（key 為複合 key；同標籤兩場景可同時選，互斥下沉到日期級校驗）
  const handleToggleLabel = (key: string) => {
    // 新增勾選：自動設為當前編輯標籤
    if (!selectedLabels.includes(key)) {
      setActiveDateLabel(key)
      setSelectedLabels(prev => [...prev, key])
      return
    }
    // 取消勾選：若有已配置日期則彈窗確認
    const dates = labelDates[key] ?? []
    if (dates.length > 0) {
      const lt = keyToLabelType(key)
      const cfg = labelConfig[lt]
      const sc = keyToScenario(key)
      const scDef = sc ? SCENARIO_DEFS.find(d => d.apiValue === sc) : null
      const displayName = scDef ? `${scDef.icon} ${scDef.label}` : cfg?.label ?? lt
      Modal.confirm({
        title: '取消標籤確認',
        content: (
          <div style={{ padding: '8px 0' }}>
            <p style={{ marginBottom: 8 }}>
              <strong>{cfg?.icon} {cfg?.label} - {displayName}</strong> 已配置 <strong style={{ color: '#E8720C' }}>{dates.length} 天</strong> 投放日期。
            </p>
            <p style={{ color: '#FF4D4F', marginBottom: 0 }}>
              取消後將清空所選日期，再次選擇需重新配置。
            </p>
          </div>
        ),
        okText: '確認取消',
        cancelText: '繼續保留',
        okButtonProps: { danger: true, style: { background: '#FF4D4F', borderColor: '#FF4D4F' } },
        onOk: () => {
          setLabelDates(d => { const n = { ...d }; delete n[key]; return n })
          if (activeDateLabel === key) setActiveDateLabel(null)
          setSelectedLabels(prev => prev.filter(l => l !== key))
        },
      })
      return
    }
    // 無日期直接取消
    setLabelDates(d => { const n = { ...d }; delete n[key]; return n })
    if (activeDateLabel === key) setActiveDateLabel(null)
    setSelectedLabels(prev => prev.filter(l => l !== key))
  }

  // 切換編輯標籤（key 為複合 key）
  const handleSwitchActiveLabel = (key: string) => {
    setActiveDateLabel(key)
  }

  // 對比類標籤同標籤另一場景的 key（同一天同一標籤僅能展示一種場景）
  const otherScenarioKeyOf = (key: string): string | null => {
    const lt = keyToLabelType(key)
    const sc = keyToScenario(key)
    if (!sc || !COMPARISON_LABELS.includes(lt)) return null
    const other = SCENARIO_DEFS.find(d => d.apiValue !== sc)
    return other ? itemKey(lt, other.apiValue) : null
  }

  // 自選日期：點擊日曆單日
  const handleCustomDateClick = (date: Dayjs | null) => {
    if (!date) return
    if (date.isBefore(customMinDate, 'day')) { message.warning(t('earliestDateWarning')); return }
    if (date.isAfter(customMaxDate, 'day')) {
      setPresaleInfo({
        date: date.format('YYYY-MM-DD'),
        weekday: WEEKDAY_LABELS[date.day()],
        openTime: getPresaleOpenTime(date, sellableDays).format(t('presaleDateFormat')),
      })
      return
    }
    const key = date.format('YYYY-MM-DD')
    if (!activeDateLabel) { message.warning('請先選擇要編輯的標籤'); return }
    const currentDates = labelDates[activeDateLabel] ?? []
    // 新增時校驗：同標籤另一場景已選該日期 → 拒絕（取消當前選擇不受限）
    if (!currentDates.includes(key)) {
      const otherKey = otherScenarioKeyOf(activeDateLabel)
      if (otherKey && (labelDates[otherKey] ?? []).includes(key)) {
        message.warning('該日期同標籤已選擇另一場景，同一天同一標籤只能展示一種場景')
        return
      }
    }
    setLabelDates(prev => {
      const dates = prev[activeDateLabel] ?? []
      return { ...prev, [activeDateLabel]: dates.includes(key) ? dates.filter(d => d !== key) : [...dates, key].sort() }
    })
  }

  // 每週休息日
  const handleToggleWeekday = (day: number) => {
    setExcludedWeekdays(prev => prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day])
  }

  // 批量添加
  const handleBatchAdd = () => {
    if (!batchRange || !batchRange[0] || !batchRange[1]) { message.warning(t('selectDateRangeFirst')); return }
    const merged = new Set(customDates)
    // 同標籤另一場景已選日期 → 跳過（同一天同一標籤只能展示一種場景）
    const otherKey = activeDateLabel ? otherScenarioKeyOf(activeDateLabel) : null
    const conflictDates = otherKey ? new Set(labelDates[otherKey] ?? []) : new Set<string>()
    let added = 0
    let conflictSkipped = 0
    for (let d = batchRange[0].startOf('day'); !d.isAfter(batchRange[1], 'day'); d = d.add(1, 'day')) {
      if (d.isBefore(customMinDate, 'day') || d.isAfter(customMaxDate, 'day')) continue
      if (excludedWeekdays.includes(d.day())) continue
      const key = d.format('YYYY-MM-DD')
      if (conflictDates.has(key)) { conflictSkipped++; continue }
      if (!merged.has(key)) { merged.add(key); added++ }
    }
    if (conflictSkipped > 0) {
      message.warning(`已跳過 ${conflictSkipped} 天：同標籤另一場景已選，同一天同一標籤只能展示一種場景`)
    }
    if (added === 0) { if (conflictSkipped === 0) message.info(t('noDatesInRange')); return }
    if (!activeDateLabel) return
    setLabelDates(prev => ({ ...prev, [activeDateLabel]: [...merged].sort() }))
    message.success(excludedWeekdays.length > 0 ? t('batchAddSkipRest', { count: added }) : t('batchAddSuccess', { count: added }))
  }

  const handleClearCustomDates = () => {
    if (!activeDateLabel) return
    setLabelDates(prev => ({ ...prev, [activeDateLabel]: [] }))
  }

  // ===== 費用計算 =====
  // 各標籤原始總價（日單價 × 該標籤天數）
  const labelBasePrices = useMemo(() => {
    const result: Record<string, number> = {}
    for (const l of selectedLabels) {
      const price = labelPriceMap[l] ?? 0
      const days = labelDaysMap[l] ?? 0
      result[l] = price * days
    }
    return result
  }, [selectedLabels, labelPriceMap, labelDaysMap])

  // 各標籤折扣後價格（按該標籤天數匹配梯度）
  const labelDiscountedPrices = useMemo(() => {
    const result: Record<string, { original: number; discounted: number; discount: number }> = {}
    for (const l of selectedLabels) {
      const original = labelBasePrices[l] ?? 0
      const days = labelDaysMap[l] ?? 0
      const tiers = labelDiscountMap[l] ?? []
      let discount = 100
      for (const tier of tiers) {
        if (days >= tier.minDays) discount = tier.discount
      }
      // 折扣值格式統一：如果 <= 10，表示 x 折，需轉換為百分比（如 9 折 = 90%）
      const discountPercent = discount <= 10 ? discount * 10 : discount
      const discounted = Math.round(original * discountPercent / 100)
      result[l] = { original, discounted, discount }
    }
    return result
  }, [selectedLabels, labelBasePrices, labelDiscountMap, labelDaysMap])

  // 合計
  const totalOriginal = useMemo(() => Object.values(labelDiscountedPrices).reduce((s, v) => s + v.original, 0), [labelDiscountedPrices])
  const totalDiscounted = useMemo(() => Object.values(labelDiscountedPrices).reduce((s, v) => s + v.discounted, 0), [labelDiscountedPrices])

  // 贈送天數抵扣
  const maxGiftDaysUsable = Math.min(giftDaysBalance, totalDaysAll)
  const effectiveGiftDays = useMemo(() => {
    if (!mixedPayment && activeMode === 'promo') return 0
    if (!mixedPayment && activeMode === 'gift') return maxGiftDaysUsable
    // 混合支付：用戶手動選擇
    return Math.min(giftDaysUsed, maxGiftDaysUsable)
  }, [giftDaysBalance, totalDaysAll, activeMode, mixedPayment, giftDaysUsed, maxGiftDaysUsable])

  // 贈送天數抵扣金額：按折後日均價 × 抵扣天數計算
  const perDayDiscounted = totalDaysAll > 0 ? Math.round(totalDiscounted / totalDaysAll) : 0
  const giftDeductAmount = effectiveGiftDays * perDayDiscounted

  // 應付金額
  const payableAmount = Math.max(0, totalDiscounted - giftDeductAmount)

  // 支付
  const handlePayment = () => {
    if (selectedLabels.length === 0) { message.warning('請至少選擇一個標籤'); return }
    if (totalDaysAll === 0) { message.warning(t('selectDatesInCalendar')); return }
    if (!mixedPayment && activeMode === 'promo') {
      if (payableAmount > merchantBalance) { message.error('推廣金餘額不足，請充值後再試'); return }
    } else if (!mixedPayment && activeMode === 'gift') {
      if (giftDaysBalance < totalDaysAll) { message.error('贈送天數餘額不足，無法抵扣'); return }
    } else if (mixedPayment) {
      if (payableAmount > merchantBalance) { message.error('推廣金餘額不足，請充值後再試'); return }
    }
    setIsPaymentModalVisible(true)
  }

  const handleConfirmPayment = async () => {
    setPaying(true)
    try {
      const store = storeMap[searchStoreName!]
      const cells: Array<{ bizDate: string; labelType: string; scenario?: string | null }> = []
      for (const key of selectedLabels) {
        const dates = labelDates[key] ?? []
        const lt = keyToLabelType(key)
        const sc = keyToScenario(key)
        for (const d of dates) {
          cells.push({ bizDate: d, labelType: lt, scenario: sc })
        }
      }
      await placeAdSignboardOrder({
        algoId: Number(searchAlgorithm),
        groupCode: store?.groupCode ?? '',
        storeCode: store?.storeCode ?? '',
        bdEmpId: searchBD ? Number(searchBD) : null,
        giftDays: effectiveGiftDays,
        cells,
      })
      setIsPaymentModalVisible(false)
      setPaidGiftDays(effectiveGiftDays)
      setPaidPromoAmount(payableAmount)
      setPaidPaymentMode(mixedPayment ? 'mixed' : activeMode)
      setMerchantBalance(prev => prev - payableAmount)
      setIsSuccessModalVisible(true)
    } catch (err) {
      message.error(err instanceof Error ? err.message : '下單失敗，請稍後重試')
    } finally {
      setPaying(false)
    }
  }

  const handleViewOrder = () => {
    setIsSuccessModalVisible(false)
    navigate(`/promotion-order-manage?type=${encodeURIComponent('金字招牌')}&from=ad-sales`)
  }

  const handleContinuePurchase = () => {
    setIsSuccessModalVisible(false)
    setSelectedLabels([])
    setLabelDates({})
    setActiveDateLabel(null)
    message.success('可繼續選購其他標籤')
  }

  // ===== 日曆網格（同人氣商家單月視圖） =====
  const customCalendarGrid: (Dayjs | null)[][] = useMemo(() => {
    const first = calMonth.startOf('month')
    const startDay = first.day()
    const daysInMonth = calMonth.daysInMonth()
    const weeks: (Dayjs | null)[][] = []
    let currentWeek: (Dayjs | null)[] = Array(startDay).fill(null)
    for (let d = 1; d <= daysInMonth; d++) {
      currentWeek.push(calMonth.date(d))
      if (currentWeek.length === 7) { weeks.push(currentWeek); currentWeek = [] }
    }
    if (currentWeek.length > 0) {
      while (currentWeek.length < 7) currentWeek.push(null)
      weeks.push(currentWeek)
    }
    return weeks
  }, [calMonth])

  // 已選日期按月分組（同人氣商家）
  const customDatesByMonth = useMemo(() => {
    const groups: Record<string, string[]> = {}
    customDates.forEach(d => {
      const m = dayjs(d).format('YYYY年M月')
      if (!groups[m]) groups[m] = []
      groups[m].push(dayjs(d).format('D'))
    })
    return Object.entries(groups).map(([month, days]) => ({ month, days }))
  }, [customDates])

  // ===== 渲染 =====
  const labelConfig = useMemo(() => {
    const map: Record<string, typeof SIGNBOARD_LABELS[number]> = {}
    SIGNBOARD_LABELS.forEach(l => { map[l.value] = l })
    return map
  }, [])

  return (
    <div>
      {/* 查詢區域 - 與其它購買界面保持一致 */}
      <div className="search-section" style={{ marginBottom: 16 }}>
        <Form layout="inline" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px 12px' }}>
          <Form.Item label={t('brandLabel')}>
            <Select placeholder={t('brandAutoHint')} value={searchBrand} onChange={handleBrandChange} allowClear
              options={[{ label: '閃蜂', value: 'shanfeng' }, { label: 'mFood', value: 'mfood' }]} />
          </Form.Item>
          <Form.Item label="算法名稱">
            <Select placeholder={searchBrand ? '請選擇算法名稱' : t('selectBrandFirst')} value={searchAlgorithm} onChange={handleAlgorithmChange} allowClear showSearch optionFilterProp="label"
              options={pricingOptions} disabled={!searchBrand} />
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

      {/* 未查詢時展示空狀態 */}
      {!hasSearched && (
        <Card bodyStyle={{ padding: '48px 24px' }}>
          <Empty description="請選擇算法名稱和門店後查詢" image={Empty.PRESENTED_IMAGE_SIMPLE} />
        </Card>
      )}

      {hasSearched && (
        <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
          {/* 左側：選標籤 + 選日期 */}
          <div style={{ flex: 1, minWidth: 0 }}>
            {/* ① 選擇招牌標籤 */}
            <Card
              title={
                <Space><span>🏅</span><span>選擇招牌標籤</span><span style={{ fontSize: 12, color: '#8C8C8C', fontWeight: 400 }}>（可多選・各標籤×場景獨立計價・點擊中間價格按鈕選購）</span></Space>
              }
              style={{ marginBottom: 16 }} bodyStyle={{ padding: '16px 20px' }}
              extra={
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 12, color: '#8C8C8C' }}>隱藏不滿足條件的標籤</span>
                  <Switch
                    size="small"
                    checked={hideUnqualified}
                    onChange={setHideUnqualified}
                    style={{ background: hideUnqualified ? '#E8720C' : '#D9D9D9' }}
                  />
                </div>
              }
            >
              {/* 對比類標籤：卡片結構，每行3列 */}
              {hasVisibleLabels ? (
              <>
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 12, color: '#8C8C8C', marginBottom: 8, fontWeight: 500 }}>📊 對比類標籤（同一天同一標籤僅能展示一種場景）</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {[...SIGNBOARD_LABELS].filter(l => COMPARISON_LABELS.includes(l.value)).sort((a, b) => {
                    const pa = labelPricings.filter(lp => lp.labelType === a.value)
                    const pb = labelPricings.filter(lp => lp.labelType === b.value)
                    const ea = pa.some(p => p.enabled === true || p.enabled === 1)
                    const eb = pb.some(p => p.enabled === true || p.enabled === 1)
                    return ea === eb ? 0 : ea ? -1 : 1
                  }).map(l => {
                    const configuredScenarios = SCENARIO_DEFS.filter(sd => {
                      const pricing = labelPricings.find(lp => lp.labelType === l.value && lp.scenario === sd.apiValue)
                      return (pricing?.enabled === true || pricing?.enabled === 1) && pricing.pricePerDay > 0
                    })
                    if (configuredScenarios.length === 0) return null
                    const scenarios = configuredScenarios.map(sd => {
                      const pricing = labelPricings.find(lp => lp.labelType === l.value && lp.scenario === sd.apiValue)
                      const key = itemKey(l.value, sd.apiValue)
                      const isSelected = selectedLabels.includes(key)
                      const price = labelPriceMap[key] ?? 0
                      const qualified = pricing?.qualified ?? true
                      const conditionDesc = pricing?.conditionDesc ?? null
                      const tiers = labelDiscountMap[key] ?? []
                      return { sd, key, isSelected, price, qualified, conditionDesc, tiers }
                    })
                    // 開啟過濾時隱藏不滿足條件的場景；無可見場景則隱藏整個標籤卡
                    const visibleScenarios = hideUnqualified ? scenarios.filter(s => s.qualified) : scenarios
                    if (visibleScenarios.length === 0) return null
                    const anySelected = scenarios.some(s => s.isSelected)
                    return (
                      <div key={l.value} title="點擊中間價格按鈕選購" style={{
                        width: 'calc(33.33% - 6px)', minWidth: 160,
                        borderRadius: 8,
                        border: anySelected ? '1.5px solid #E8720C' : '1px solid #E8E8E8',
                        background: '#fff',
                        overflow: 'hidden',
                        transition: 'border-color 0.2s',
                      }}>
                        {/* 標籤名標題行 */}
                        <div style={{
                          padding: '4px 10px',
                          background: '#FAFAFA',
                          borderBottom: '1px solid #F0F0F0',
                        }}>
                          <span style={{ fontSize: 11 }}>{l.icon}</span>
                          <span style={{ fontSize: 11, fontWeight: 600, color: '#262626', marginLeft: 4 }}>{l.label}</span>
                        </div>
                        {/* 場景按鈕區 */}
                        <div style={{ display: 'flex', gap: 6, padding: '10px 10px' }}>
                          {visibleScenarios.map(({ sd, key, isSelected, price, qualified, conditionDesc }) => (
                            <div
                              key={key}
                              onClick={() => {
                                if (!qualified) {
                                  Modal.info({
                                    title: `${l.icon} ${l.label} — ${sd.label}`,
                                    content: (
                                      <div style={{ padding: '8px 0' }}>
                                        <p style={{ color: '#FF4D4F', fontWeight: 500, marginBottom: 8 }}>暫不滿足購買條件</p>
                                        {conditionDesc && (
                                          <div style={{ background: '#FFF7E6', borderRadius: 6, padding: '8px 12px', fontSize: 12, color: '#595959', lineHeight: 1.8 }}>
                                            <strong>需滿足：</strong>{conditionDesc}
                                          </div>
                                        )}
                                      </div>
                                    ),
                                    okButtonProps: { style: { background: '#E8720C', borderColor: '#E8720C' } },
                                  })
                                  return
                                }
                                handleToggleLabel(key)
                              }}
                              style={{
                                flex: 1,
                                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
                                height: 40, borderRadius: 6,
                                cursor: qualified ? 'pointer' : 'not-allowed',
                                border: isSelected ? '1.5px solid #E8720C' : qualified ? '1px solid #D9D9D9' : '1px dashed #D9D9D9',
                                background: isSelected ? '#FFF7E6' : qualified ? '#fff' : '#FAFAFA',
                                boxShadow: isSelected ? '0 2px 6px rgba(232,114,12,0.25)' : 'none',
                                opacity: qualified ? 1 : 0.55,
                                transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                              }}
                              onMouseEnter={e => {
                                if (isSelected || !qualified) return
                                e.currentTarget.style.borderColor = '#E8720C'
                                e.currentTarget.style.transform = 'translateY(-1px)'
                                e.currentTarget.style.boxShadow = '0 2px 6px rgba(232,114,12,0.15)'
                              }}
                              onMouseLeave={e => {
                                if (isSelected || !qualified) return
                                e.currentTarget.style.borderColor = '#D9D9D9'
                                e.currentTarget.style.transform = 'translateY(0)'
                                e.currentTarget.style.boxShadow = 'none'
                              }}
                            >
                              {/* 選擇指示圈：未選空心圓 → 選中實心勾 */}
                              {isSelected
                                ? <CheckCircleFilled style={{ fontSize: 12, color: '#E8720C', flexShrink: 0 }} />
                                : <span style={{ width: 12, height: 12, borderRadius: '50%', border: '1.5px solid #BFBFBF', flexShrink: 0 }} />}
                              <span style={{ fontSize: 11, color: isSelected ? '#E8720C' : qualified ? '#595959' : '#BFBFBF', fontWeight: isSelected ? 600 : 400 }}>{sd.icon}{sd.label}</span>
                              <span style={{ fontSize: 12, fontWeight: 600, color: qualified ? '#FF4D4F' : '#BFBFBF' }}>${price}/天</span>
                              {!qualified && <span style={{ fontSize: 9, color: '#FF4D4F' }}>ⓘ</span>}
                            </div>
                          ))}
                        </div>
                        {/* 梯度折扣展示：折扣跟標籤綁定，全澳/商圈共享 */}
                        {(() => {
                          const tiers = labelDiscountMap[itemKey(l.value, scenarios[0].sd.apiValue)] ?? labelDiscountMap[itemKey(l.value, scenarios[scenarios.length - 1].sd.apiValue)] ?? []
                          return tiers.length > 0 ? (
                            <div style={{
                              padding: '4px 10px 6px',
                              borderTop: '1px dashed #F0F0F0',
                              background: '#FAFAFA',
                              fontSize: 10, color: '#8C8C8C', textAlign: 'center',
                            }}>
                              {[...tiers].sort((a, b) => a.minDays - b.minDays).map((t, i) => (
                                <span key={t.minDays}>
                                  {i > 0 && <span style={{ margin: '0 2px', color: '#D9D9D9' }}>|</span>}
                                  <span>{t.minDays}天{t.discount % 10 === 0 ? `${t.discount / 10}折` : `${t.discount}折`}</span>
                                </span>
                              ))}
                            </div>
                          ) : null
                        })()}
                      </div>
                    )
                  })}
                </div>
              </div>
              {/* 統計類標籤：單一定價，無場景 */}
              <div>
                <div style={{ fontSize: 12, color: '#8C8C8C', marginBottom: 8, fontWeight: 500 }}>📈 統計類標籤（全量數據門檻）</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                  {[...SIGNBOARD_LABELS].filter(l => AGGREGATE_LABELS.includes(l.value)).map(l => {
                    const pricing = labelPricings.find(lp => lp.labelType === l.value && !lp.scenario)
                    // 只展示已配置價格的標籤
                    const isEnabled = (pricing?.enabled === true || pricing?.enabled === 1) && (pricing?.pricePerDay ?? 0) > 0
                    const isSelected = selectedLabels.includes(l.value)
                    const price = labelPriceMap[l.value] ?? 0
                    const qualified = pricing?.qualified ?? true
                    const conditionDesc = pricing?.conditionDesc ?? null
                    const tiers = labelDiscountMap[l.value] ?? []
                    if (!isEnabled) return null
                    // 開啟過濾時隱藏不滿足條件的標籤
                    if (hideUnqualified && !qualified) return null
                    return (
                      <div key={l.value} style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'stretch' }}>
                        <div
                          onClick={() => {
                            if (!qualified) {
                              Modal.info({
                                title: `${l.icon} ${l.label} — 購買條件`,
                                content: (
                                  <div style={{ padding: '8px 0' }}>
                                    <p style={{ color: '#FF4D4F', fontWeight: 500, marginBottom: 8 }}>暫不滿足購買條件</p>
                                    {conditionDesc && (
                                      <div style={{ background: '#FFF7E6', borderRadius: 6, padding: '8px 12px', fontSize: 12, color: '#595959', lineHeight: 1.8 }}>
                                        <strong>需滿足：</strong>{conditionDesc}
                                      </div>
                                    )}
                                  </div>
                                ),
                                okButtonProps: { style: { background: '#E8720C', borderColor: '#E8720C' } },
                              })
                              return
                            }
                            handleToggleLabel(l.value)
                          }}
                          style={{
                            display: 'inline-flex', alignItems: 'center', gap: 6,
                            padding: '6px 14px', borderRadius: '6px 6px 0 0',
                            cursor: qualified ? 'pointer' : 'not-allowed',
                            border: isSelected ? '1.5px solid #E8720C' : qualified ? '1px solid #D9D9D9' : '1px dashed #D9D9D9',
                            borderBottom: isSelected ? '1px solid #E8720C' : qualified ? '1px solid #D9D9D9' : '1px dashed #D9D9D9',
                            background: isSelected ? '#FFF7E6' : qualified ? '#fff' : '#FAFAFA',
                            boxShadow: isSelected ? '0 2px 6px rgba(232,114,12,0.25)' : 'none',
                            opacity: qualified ? 1 : 0.55,
                            transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                          }}
                          onMouseEnter={e => {
                            if (isSelected || !qualified) return
                            e.currentTarget.style.borderColor = '#E8720C'
                            e.currentTarget.style.transform = 'translateY(-1px)'
                            e.currentTarget.style.boxShadow = '0 2px 6px rgba(232,114,12,0.15)'
                          }}
                          onMouseLeave={e => {
                            if (isSelected || !qualified) return
                            e.currentTarget.style.borderColor = '#D9D9D9'
                            e.currentTarget.style.transform = 'translateY(0)'
                            e.currentTarget.style.boxShadow = 'none'
                          }}
                        >
                          {/* 選擇指示圈：未選空心圓 → 選中實心勾 */}
                          {isSelected
                            ? <CheckCircleFilled style={{ fontSize: 13, color: '#E8720C' }} />
                            : <span style={{ width: 13, height: 13, borderRadius: '50%', border: '1.5px solid #BFBFBF', flexShrink: 0 }} />}
                          <span style={{ fontSize: 13 }}>{l.icon}</span>
                          <span style={{ fontSize: 13, fontWeight: isSelected ? 600 : 400, color: isSelected ? '#E8720C' : qualified ? '#262626' : '#BFBFBF' }}>{l.label}</span>
                          <span style={{ fontSize: 13, fontWeight: 600, color: qualified ? '#FF4D4F' : '#BFBFBF' }}>${price}</span>
                          <span style={{ fontSize: 10, color: qualified ? '#8C8C8C' : '#BFBFBF' }}>/天</span>
                          {!qualified && <span style={{ fontSize: 10, color: '#FF4D4F', marginLeft: 2 }}>ⓘ</span>}
                        </div>
                        {/* 梯度折扣展示 */}
                        {tiers.length > 0 && (
                          <div style={{
                            padding: '2px 8px 4px', borderRadius: '0 0 6px 6px',
                            border: isSelected ? '1px solid #E8720C' : '1px solid #D9D9D9',
                            borderTop: 'none', background: isSelected ? '#FFF7E6' : '#FAFAFA',
                            fontSize: 10, color: '#8C8C8C', lineHeight: 1.5,
                          }}>
                            {[...tiers].sort((a, b) => a.minDays - b.minDays).map((t, i) => (
                              <span key={t.minDays}>
                                {i > 0 && <span style={{ margin: '0 2px', color: '#D9D9D9' }}>|</span>}
                                <span>{t.minDays}天{t.discount % 10 === 0 ? `${t.discount / 10}折` : `${t.discount}折`}</span>
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
              </>
              ) : (
                <Empty description="當前無滿足條件的標籤，可關閉右上角過濾開關查看全部" image={Empty.PRESENTED_IMAGE_SIMPLE} />
              )}
            </Card>

            {/* ② 選擇購買日期 */}
            <Card
              title={<Space><CalendarOutlined style={{ color: '#1890FF' }} /><span>選擇購買日期</span></Space>}
              extra={!refundEnabled && <NoRefundBadge />}
              bodyStyle={{ padding: '16px 20px' }}
            >
              {/* 月份橫向選擇器 */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                <Button size="small" disabled={monthPage === 0} onClick={() => setMonthPage(p => Math.max(0, p - 1))}>◀</Button>
                <div style={{ flex: 1, display: 'flex', gap: 4 }}>
                  {visibleMonths.map(m => {
                    const monthStr = m.format('YYYY-MM')
                    const isSelected = m.isSame(calMonth, 'month')
                    const isHovered = hoveredCalMonth === monthStr
                    const hasSelectedDates = customDates.some(d => dayjs(d).isSame(m, 'month'))
                    const monthPresale = m.startOf('month').isAfter(customMaxDate, 'day')
                    return (
                      <div
                        key={monthStr}
                        onClick={() => {
                          if (monthPresale) {
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
                          border: monthPresale ? '1px dashed #d9d9d9' : isSelected ? '2px solid #fa8c16' : isHovered ? '2px solid #fa8c16' : '1px solid #e8e8e8',
                          background: monthPresale ? '#fafafa' : isSelected ? '#fff7e6' : isHovered ? '#fff7e6' : '#fff',
                          cursor: 'pointer', textAlign: 'center', transition: 'all 0.2s', whiteSpace: 'nowrap', overflow: 'hidden',
                        }}
                      >
                        <span style={{ fontSize: 15, fontWeight: !monthPresale && (isSelected || isHovered) ? 700 : 500, color: monthPresale ? '#bfbfbf' : isSelected || isHovered ? '#fa8c16' : '#333' }}>
                          {m.year() === dayjs().year() ? m.format('M月') : m.format('YYYY年M月')}
                        </span>
                        {monthPresale && (
                          <span style={{ fontSize: 11, color: '#8c8c8c', marginLeft: 4, border: '1px solid #d9d9d9', borderRadius: 3, padding: '0 3px', background: '#f5f5f5' }}>待開售</span>
                        )}
                        {hasSelectedDates && (
                          <div style={{ position: 'absolute', top: 3, right: 3, width: 8, height: 8, borderRadius: '50%', background: '#ff4d4f', animation: 'dotPulse 1.5s ease-in-out infinite' }} />
                        )}
                      </div>
                    )
                  })}
                </div>
                <Button size="small" disabled={monthPage >= monthPageCount - 1} onClick={() => setMonthPage(p => Math.min(monthPageCount - 1, p + 1))}>▶</Button>
              </div>

              {/* 批量添加工具欄 */}
              <div style={{ background: '#FAFAFA', borderRadius: 8, padding: '10px 12px', marginBottom: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 13, color: '#595959' }}>批量添加</span>
                  <RangePicker size="small" value={batchRange} onChange={v => setBatchRange(v as [Dayjs | null, Dayjs | null] | null)} disabledDate={d => d.isBefore(customMinDate, 'day') || d.isAfter(customMaxDate, 'day')} />
                  <Button size="small" type="primary" onClick={handleBatchAdd}>添加到日曆</Button>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
                  <span style={{ fontSize: 12, color: '#8C8C8C' }}>休息日跳過：</span>
                  {['日', '一', '二', '三', '四', '五', '六'].map((d, i) => {
                    const isExcluded = excludedWeekdays.includes(i)
                    return (
                      <div key={i} onClick={() => handleToggleWeekday(i)} style={{
                        padding: '2px 10px', borderRadius: 4, cursor: 'pointer', fontSize: 12,
                        border: isExcluded ? '1px solid #FF4D4F' : '1px solid #d9d9d9',
                        background: isExcluded ? '#FFF1F0' : '#fff',
                        color: isExcluded ? '#FF4D4F' : '#595959',
                        textDecoration: isExcluded ? 'line-through' : 'none',
                        transition: 'all 0.2s',
                      }}>{d}</div>
                    )
                  })}
                </div>
              </div>

              {/* 日曆網格（單月視圖） */}
              <div style={{ border: '1px solid #f0f0f0', borderRadius: 8, overflow: 'hidden' }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', background: '#FAFAFA', borderBottom: '1px solid #f0f0f0' }}>
                  {['日', '一', '二', '三', '四', '五', '六'].map((w, i) => (
                    <div key={w} style={{ padding: '8px 0', textAlign: 'center', fontSize: 12, fontWeight: 600, color: i === 0 || i === 6 ? '#FA8C16' : '#595959' }}>{w}</div>
                  ))}
                </div>
                {customCalendarGrid.map((week, wi) => (
                  <div key={wi} style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)' }}>
                    {week.map((date, di) => {
                      if (!date) return <div key={di} style={{ minHeight: 56, margin: 2, borderRadius: 6, background: '#fafafa' }} />
                      const dateKey = date.format('YYYY-MM-DD')
                      const isPast = date.isBefore(customMinDate, 'day')
                      const isPresale = date.isAfter(customMaxDate, 'day')
                      const isSelected = customDates.includes(dateKey)
                      const isToday = date.isSame(dayjs(), 'day')
                      const isAvailable = !isPast && !isPresale
                      return (
                        <div
                          key={di}
                          onClick={() => handleCustomDateClick(date)}
                          style={{
                            minHeight: 56, margin: 2, borderRadius: 6, padding: '4px 2px',
                            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 1,
                            cursor: isPast ? 'not-allowed' : 'pointer',
                            border: isSelected ? '2px solid #52c41a' : isPresale ? '1px dashed #d9d9d9' : '1px solid #e8e8e8',
                            background: isSelected ? '#f6ffed' : isPast || isPresale ? '#fafafa' : '#fff',
                            color: isPast ? '#D9D9D9' : isPresale ? '#bfbfbf' : isSelected ? '#52c41a' : '#333',
                            transition: 'all 0.2s',
                          }}
                        >
                          <span style={{ fontSize: 14, fontWeight: isSelected ? 700 : isToday ? 600 : 400, position: 'relative', lineHeight: 1.2 }}>
                            {date.date()}
                            {isToday && !isSelected && <span style={{ position: 'absolute', bottom: -3, left: '50%', transform: 'translateX(-50%)', width: 4, height: 4, borderRadius: '50%', background: '#1890ff' }} />}
                          </span>
                          {isPresale && (
                            <span style={{ fontSize: 9, lineHeight: '12px', color: '#8c8c8c', border: '1px solid #d9d9d9', borderRadius: 3, padding: '0 3px', background: '#f5f5f5' }}>待開售</span>
                          )}
                          {isAvailable && (isSelected
                            ? <span style={{ fontSize: 9, lineHeight: 1, color: '#E8720C', fontWeight: 600 }}>已選擇</span>
                            : <span style={{ fontSize: 9, lineHeight: 1, color: '#52c41a' }}>可購買</span>
                          )}
                        </div>
                      )
                    })}
                  </div>
                ))}
              </div>
            </Card>
          </div>

          {/* 右側：效果預覽 + 已選標籤 + 訂單結算 */}
          <div style={{ width: 380, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* 購買後效果預覽：人氣商家小圖模式 */}
            <Card size="small" title={<Space><span>📱</span><span>{t('previewTitle')}</span></Space>}
              bodyStyle={{ padding: '12px 16px', background: '#F5F5F5' }}>
              {selectedLabels.length > 0 ? (
                <div>
                  {/* 人氣商家小圖模式卡片 */}
                  <div style={{
                    position: 'relative', background: '#fff', borderRadius: 10, padding: '12px 14px',
                    border: '2px solid #E8720C',
                    boxShadow: '0 2px 8px rgba(232,114,12,0.2)',
                  }}>
                    {/* 店鋪 Logo + 信息 */}
                    <div style={{ display: 'flex', gap: 10 }}>
                      {/* 店鋪 Logo */}
                      <div style={{
                        width: 56, height: 56, borderRadius: 8, flexShrink: 0,
                        background: '#DA291C', overflow: 'hidden',
                        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2,
                      }}>
                        <span style={{
                          fontSize: 28, fontWeight: 900, color: '#FFC72C',
                          fontFamily: '"Arial Black", "Arial Rounded MT Bold", sans-serif',
                          lineHeight: 1, letterSpacing: -1, textShadow: '0 1px 1px rgba(0,0,0,0.18)',
                        }}>M</span>
                        <span style={{ fontSize: 9, color: '#fff', fontWeight: 600, lineHeight: 1, whiteSpace: 'nowrap' }}>麥當勞</span>
                      </div>
                      {/* 店鋪信息 */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: '#262626', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          McDonald's（氹仔泉福店）
                        </div>
                        <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 3, flexWrap: 'wrap' }}>
                          <span style={{ fontSize: 12, fontWeight: 700, color: '#FA8C16' }}>⭐ 4.6</span>
                          <span style={{ fontSize: 10, color: '#8C8C8C' }}>月售 1196</span>
                          <span style={{ fontSize: 10, color: '#8C8C8C' }}>起送$40・減配$0~3・32分鐘・1.9km</span>
                        </div>
                      </div>
                    </div>
                    {/* 已選標籤行：展示算法庫配置的標籤文案 */}
                    <div style={{ display: 'flex', gap: 3, marginTop: 6, flexWrap: 'wrap' }}>
                      {selectedLabels.map(l => {
                        const lt = keyToLabelType(l)
                        const sc = keyToScenario(l)
                        const cfg = labelConfig[lt as LabelValue]
                        if (!cfg) return null
                        // 使用算法庫配置的標籤文案規則
                        const displayText = getTagDisplayText(lt, sc, storeRegionName, t)
                        return (
                          <span key={l} style={{
                            fontSize: 9, color: cfg.color, background: cfg.bg,
                            border: `1px solid ${cfg.border}`,
                            borderRadius: 3, padding: '1px 4px', whiteSpace: 'nowrap',
                          }}>
                            {cfg.icon}{displayText}
                          </span>
                        )
                      })}
                    </div>
                  </div>
                  <div style={{ fontSize: 11, color: '#8C8C8C', textAlign: 'center', marginTop: 8, lineHeight: 1.6 }}>
                    💡 以上為效果示意，實際標籤展示以 APP 為準
                  </div>
                </div>
              ) : (
                <Empty description="請先選擇標籤" image={Empty.PRESENTED_IMAGE_SIMPLE} />
              )}
            </Card>

            {/* 當前所選 */}
            <Card size="small" title={<Space><CalendarOutlined /><span>當前所選</span></Space>}
              extra={Object.values(labelDates).some(d => d.length > 0) && (
                <Button type="link" size="small" danger onClick={() => {
                  Modal.confirm({
                    title: '清空所有日期確認',
                    content: '確定清空所有標籤的已選日期？清空後需重新選擇。',
                    okText: '確認清空',
                    cancelText: '取消',
                    okButtonProps: { danger: true, style: { background: '#FF4D4F', borderColor: '#FF4D4F' } },
                    onOk: () => {
                      setLabelDates({})
                      setActiveDateLabel(selectedLabels[0] ?? null)
                    },
                  })
                }} icon={<DeleteOutlined />}>{t('clearAction')}</Button>
              )}
              bodyStyle={{ padding: '12px 16px' }}>
              {selectedLabels.length > 0 ? (
                <div>
                  {selectedLabels.map(l => {
                    const lt = keyToLabelType(l)
                    const sc = keyToScenario(l)
                    const scDef = sc ? SCENARIO_DEFS.find(d => d.apiValue === sc) : null
                    const cfg = labelConfig[lt as LabelValue]
                    const priceInfo = labelDiscountedPrices[l]
                    const dates = labelDates[l] ?? []
                    const isActive = activeDateLabel === l
                    // 該標籤日期按月分組
                    const datesByMonth: Record<string, string[]> = {}
                    dates.forEach(d => {
                      const m = dayjs(d).format('YYYY年M月')
                      if (!datesByMonth[m]) datesByMonth[m] = []
                      datesByMonth[m].push(dayjs(d).format('D'))
                    })
                    const datesByMonthArr = Object.entries(datesByMonth).map(([month, days]) => ({ month, days }))
                    if (!cfg) return null
                    return (
                      <div key={l} style={{
                        padding: isActive ? '10px 16px' : '10px 0',
                        borderBottom: '1px solid #f5f5f5',
                        background: isActive ? '#FFF7E6' : 'transparent',
                        margin: isActive ? '0 -16px' : 0,
                        borderRadius: isActive ? 6 : 0,
                      }}>
                        {/* 標籤名稱 + 切換編輯按鈕 + 清空按鈕 */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                          <span style={{ fontSize: 16 }}>{cfg.icon}</span>
                          <span style={{ fontWeight: 600, flex: 1 }}>
                            {cfg.label}
                            {scDef && <span style={{ fontSize: 11, color: scDef.color, marginLeft: 6, fontWeight: 500 }}>{scDef.icon} {scDef.label}</span>}
                          </span>
                          {dates.length > 0 && (
                            <Button size="small" type="text" danger onClick={() => {
                              setLabelDates(d => { const n = { ...d }; delete n[l]; return n })
                              if (activeDateLabel === l) setActiveDateLabel(null)
                            }} style={{ fontSize: 11, padding: '0 4px', height: 22, color: '#FF4D4F' }}>
                              清空
                            </Button>
                          )}
                          <Button size="small" type={isActive ? 'primary' : 'default'} onClick={() => handleSwitchActiveLabel(l)} style={{ fontSize: 11, padding: '0 8px', height: 22 }}>
                            {isActive ? '編輯中' : '編輯日期'}
                          </Button>
                        </div>
                        {/* 投放日期（按月分組，參考無敵星星樣式） */}
                        {dates.length > 0 && (
                          <div style={{ marginBottom: 8 }}>
                            {datesByMonthArr.map(g => {
                              const expandKey = `${l}-${g.month}`
                              const isExpanded = expandedMonths[expandKey] ?? false
                              const MAX_PREVIEW = 10
                              const hasMore = g.days.length > MAX_PREVIEW
                              const displayDays = isExpanded || !hasMore ? g.days : g.days.slice(0, MAX_PREVIEW)
                              return (
                                <div key={g.month} style={{ marginBottom: 8, border: '1px solid #d9f7be', borderRadius: 6, overflow: 'hidden', background: '#fcfff5' }}>
                                  <div style={{ 
                                    padding: '6px 10px', background: '#f6ffed', borderBottom: '1px solid #d9f7be',
                                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                  }}>
                                    <span style={{ fontSize: 12, fontWeight: 600, color: '#389e0d' }}>📅 {g.month}</span>
                                    {hasMore && (
                                      <span
                                        onClick={() => setExpandedMonths(prev => ({ ...prev, [expandKey]: !isExpanded }))}
                                        style={{ color: '#1890FF', cursor: 'pointer', fontSize: 11 }}
                                      >
                                        {isExpanded ? '收起' : `共${g.days.length}天`}
                                        {isExpanded ? <UpOutlined style={{ fontSize: 9, marginLeft: 2 }} /> : <DownOutlined style={{ fontSize: 9, marginLeft: 2 }} />}
                                      </span>
                                    )}
                                  </div>
                                  <div style={{ padding: '6px 10px' }}>
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
                                      {displayDays.map(d => (
                                        <Tag key={d} color="orange" style={{ fontSize: 10, margin: 0 }}>{d}日</Tag>
                                      ))}
                                      {hasMore && !isExpanded && <span style={{ fontSize: 10, color: '#8C8C8C', lineHeight: '22px' }}>...等{g.days.length}天</span>}
                                    </div>
                                  </div>
                                </div>
                              )
                            })}
                          </div>
                        )}
                        {/* 天數合計和享受折扣橫幅（並排展示） */}
                        {dates.length > 0 && (
                          <div style={{ 
                            padding: '8px 10px', borderRadius: 6, marginBottom: 8,
                            background: 'linear-gradient(135deg, #fff7e6, #fff1cc)',
                            border: '1px solid #ffe58f',
                            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                          }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              <span style={{ fontSize: 12, color: '#595959' }}>{t('totalDaysSelected')}：</span>
                              <span style={{ fontSize: 13, fontWeight: 600, color: '#52c41a' }}>{labelDaysMap[l] ?? 0}天</span>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              <span style={{ fontSize: 12, color: '#595959' }}>{t('discount')}：</span>
                              {priceInfo && priceInfo.discount < 100 ? (
                                <Tag color="orange" style={{ fontSize: 12, fontWeight: 600 }}>{priceInfo.discount > 10 ? priceInfo.discount / 10 : priceInfo.discount}折</Tag>
                              ) : (
                                <span style={{ fontSize: 12, color: '#bfbfbf' }}>{t('noDiscount')}</span>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              ) : (
                <Empty description="請在左側選擇標籤" image={Empty.PRESENTED_IMAGE_SIMPLE} style={{ padding: '12px 0' }} />
              )}
            </Card>

            {/* 訂單結算 */}
            <Card size="small" title="訂單結算">
              {/* 支付方式選擇 */}
              {switchable && (
                <div style={{ marginBottom: 12, padding: '10px 12px', background: '#F6FFED', border: '1px solid #B7EB8F', borderRadius: 6 }}>
                  <div style={{ fontSize: 12, color: '#595959', marginBottom: 8, fontWeight: 500 }}>支付方式選擇</div>
                  <Radio.Group value={paymentMode} onChange={e => setPaymentMode(e.target.value)}>
                    <Radio value="promo">推廣金支付</Radio>
                    <Radio value="gift">贈送天數抵扣</Radio>
                  </Radio.Group>
                </div>
              )}
              {/* 推廣金餘額 */}
              {(mixedPayment || activeMode === 'promo') && (
                <div style={{ padding: '12px 16px', marginBottom: 12, background: 'linear-gradient(135deg, #E8720C 0%, #F39C12 100%)', borderRadius: 6, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 13, color: '#fff', opacity: 0.9 }}>推廣金餘額</span>
                  <span style={{ fontSize: 22, fontWeight: 700, color: '#fff' }}>${merchantBalance.toLocaleString()}</span>
                </div>
              )}
              {/* 贈送天數餘額 */}
              {(mixedPayment || activeMode === 'gift') && (
                <div style={{ padding: '12px 16px', marginBottom: 12, background: 'linear-gradient(135deg, #E8720C 0%, #F39C12 100%)', borderRadius: 6, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 13, color: '#fff', opacity: 0.9 }}>剩餘贈送天數</span>
                  <span style={{ fontSize: 22, fontWeight: 700, color: '#fff' }}>{giftDaysBalance} 天</span>
                </div>
              )}
              {/* 價格明細 */}
              <div style={{ background: '#fafafa', padding: 16, borderRadius: 8, marginBottom: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                  <span style={{ color: '#595959' }}>訂單金額（原價）：</span>
                  <span style={{ fontWeight: 600 }}>${totalOriginal}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, color: '#fa8c16' }}>
                  <span>訂單優惠：</span>
                  <span style={{ fontWeight: 600 }}>-${totalOriginal - totalDiscounted}</span>
                </div>
                {/* 赠送天数抵扣金额 */}
                {giftDeductAmount > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, color: '#fa8c16' }}>
                    <span>赠送天數抵扣：</span>
                    <span style={{ fontWeight: 600 }}>-${giftDeductAmount}</span>
                  </div>
                )}
                {/* 混合支付：抵扣天數 + 手動輸入 */}
                {mixedPayment && effectiveGiftDays >= 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 16, color: '#ff4d4f', borderTop: '1px solid #d9d9d9', paddingTop: 8, marginTop: 8 }}>
                    <span style={{ fontWeight: 600 }}>抵扣天數：</span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      {giftDaysBalance === 0 || totalDaysAll === 0 ? (
                        <span style={{ fontWeight: 700 }}>{effectiveGiftDays}天</span>
                      ) : (
                        <>
                          <InputNumber
                            size="small" min={0} max={maxGiftDaysUsable} value={effectiveGiftDays} precision={0}
                            onChange={v => setGiftDaysUsed(typeof v === 'number' ? v : 0)}
                            style={{ width: 64 }}
                          />
                          <span style={{ fontSize: 12, color: '#8c8c8c' }}>天</span>
                          <Button size="small" type="link" style={{ padding: 0, fontSize: 12 }}
                            onClick={() => setGiftDaysUsed(maxGiftDaysUsable)}>全部抵扣</Button>
                        </>
                      )}
                    </span>
                  </div>
                )}
                {/* 非混合支付 + 贈送天數抵扣模式 */}
                {!mixedPayment && activeMode === 'gift' && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 16, color: '#ff4d4f', borderTop: '1px solid #d9d9d9', paddingTop: 8, marginTop: 8 }}>
                    <span style={{ fontWeight: 600 }}>抵扣天數：</span>
                    <span style={{ fontWeight: 700 }}>{effectiveGiftDays}天</span>
                  </div>
                )}
                {/* 實付總額 */}
                {(mixedPayment || activeMode === 'promo') && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 16, color: '#ff4d4f', borderTop: '1px solid #d9d9d9', paddingTop: 8, marginTop: 8 }}>
                    <span style={{ fontWeight: 600 }}>實付總額：</span>
                    <span style={{ fontWeight: 700 }}>${payableAmount}</span>
                  </div>
                )}
              </div>
              <Button
                type="primary" block size="large" icon={<ShoppingCartOutlined />}
                disabled={selectedLabels.length === 0 || totalDaysAll === 0}
                onClick={handlePayment}
                style={{
                  background: selectedLabels.length > 0 && totalDaysAll > 0 ? '#E8720C' : '#d9d9d9',
                  borderColor: selectedLabels.length > 0 && totalDaysAll > 0 ? '#E8720C' : '#d9d9d9',
                  height: 44, fontSize: 16, fontWeight: 600,
                }}
              >
                支付訂單
              </Button>
            </Card>
          </div>
        </div>
      )}

      {/* 待開售日期提醒彈窗（同人氣商家） */}
      <Modal
        title={<Space><span style={{ fontSize: 18 }}>⏳</span><span style={{ color: '#1890ff', fontWeight: 600 }}>待開售</span></Space>}
        open={!!presaleInfo}
        onCancel={() => setPresaleInfo(null)}
        footer={[<Button key="ok" type="primary" onClick={() => setPresaleInfo(null)} style={{ minWidth: 100 }}>知道了</Button>]}
        width={420}
      >
        {presaleInfo && (
          <div style={{ padding: '8px 0' }}>
            <div style={{
              background: '#e6f4ff', border: '1px solid #91caff', borderRadius: 8,
              padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 8,
            }}>
              <span style={{ fontSize: 13, color: '#595959' }}>開售時間：</span>
              <span style={{ fontSize: 16, fontWeight: 700, color: '#1890ff' }}>{presaleInfo.openTime}</span>
            </div>
            <p style={{ fontSize: 12, color: '#8c8c8c', marginTop: 12, marginBottom: 0 }}>
              每日 {PRESALE_OPEN_HOUR}:00 開放購買後 {sellableDays} 天內的日期
            </p>
          </div>
        )}
      </Modal>

      {/* 支付確認彈窗（按標籤維度展示明細 + 結算區） */}
      <Modal
        title="確認訂單"
        open={isPaymentModalVisible}
        onOk={handleConfirmPayment}
        onCancel={() => !paying && setIsPaymentModalVisible(false)}
        okText={paying ? '支付中...' : '確認支付'}
        cancelText="取消"
        confirmLoading={paying}
        okButtonProps={{ style: { background: '#E8720C', borderColor: '#E8720C' } }}
        width={620}
      >
        <div style={{ maxHeight: '60vh', overflowY: 'auto' }}>
          {/* 按標籤維度展示購買明細（日期表可滾動） */}
          <div style={{ maxHeight: 300, overflowY: 'auto', marginBottom: 16 }}>
          {selectedLabels.map((l, idx) => {
            const lt = keyToLabelType(l)
            const sc = keyToScenario(l)
            const scDef = sc ? SCENARIO_DEFS.find(d => d.apiValue === sc) : null
            const cfg = labelConfig[lt as LabelValue]
            const dates = labelDates[l] ?? []
            const pricePerDay = labelPriceMap[l] ?? 0
            return (
              <div key={l} style={{ marginBottom: idx < selectedLabels.length - 1 ? 16 : 0 }}>
                {/* 標籤名稱 */}
                <h4 style={{ marginBottom: 8, fontSize: 14, color: '#595959', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: 16 }}>{cfg?.icon}</span>
                  <span>{cfg?.label}{scDef ? `（${scDef.label}）` : ''}</span>
                </h4>
                {/* 日期 + 價格明細表（與其他購買頁一致） */}
                <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
                  <thead><tr style={{ background: '#fafafa' }}>
                    <th style={{ padding: '8px', border: '1px solid #e8e8e8', textAlign: 'left' }}>購買日期</th>
                    <th style={{ padding: '8px', border: '1px solid #e8e8e8', textAlign: 'right' }}>售價</th>
                  </tr></thead>
                  <tbody>{dates.map(date => (
                    <tr key={date}>
                      <td style={{ padding: '8px', border: '1px solid #e8e8e8' }}>{date}</td>
                      <td style={{ padding: '8px', border: '1px solid #e8e8e8', textAlign: 'right', color: '#ff4d4f', fontWeight: 600 }}>
                        ${pricePerDay}
                      </td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            )
          })}
          </div>

          {/* 結算區 */}
          <div style={{ background: '#fafafa', padding: 16, borderRadius: 8, marginTop: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
              <span style={{ color: '#595959' }}>訂單金額（原價）：</span>
              <span style={{ fontWeight: 600 }}>${totalOriginal}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, color: '#fa8c16' }}>
              <span>訂單優惠：</span>
              <span style={{ fontWeight: 600 }}>- ${totalOriginal - totalDiscounted}</span>
            </div>
            {/* 贈送天數抵扣金額（在前） */}
            {giftDeductAmount > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, color: '#fa8c16' }}>
                <span>赠送天數抵扣：</span>
                <span style={{ fontWeight: 600 }}>-${giftDeductAmount}</span>
              </div>
            )}
            {effectiveGiftDays > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 16, color: '#ff4d4f', borderTop: '1px solid #d9d9d9', paddingTop: 8, marginTop: 8 }}>
                <span style={{ fontWeight: 600 }}>抵扣天數：</span>
                <span style={{ fontWeight: 700 }}>{effectiveGiftDays} 天</span>
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 16, color: '#ff4d4f', borderTop: '1px solid #d9d9d9', paddingTop: 8, marginTop: 8 }}>
              <span style={{ fontWeight: 600 }}>實付總額：</span>
              <span style={{ fontWeight: 700 }}>${payableAmount}</span>
            </div>
          </div>
          {refundEnabled && (
            <div style={{ fontSize: 12, color: '#52C41A', marginTop: 8 }}>✅ 支持退款</div>
          )}
        </div>
      </Modal>

      {/* 支付成功彈窗 */}
      <Modal
        title="購買成功"
        open={isSuccessModalVisible}
        onCancel={() => setIsSuccessModalVisible(false)}
        footer={[
          <Button key="view" type="primary" onClick={handleViewOrder}>查看訂單</Button>,
          <Button key="continue" onClick={handleContinuePurchase} style={{ background: '#E8720C', borderColor: '#E8720C', color: '#fff' }}>繼續選購</Button>,
        ]}
        width={400}
      >
        <div style={{ textAlign: 'center', padding: '20px 0' }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>✅</div>
          <p style={{ fontSize: 16, color: '#595959', marginBottom: 24 }}>恭喜！購買成功</p>
          <div style={{ background: 'linear-gradient(135deg, #fff7e6 0%, #ffe58f 100%)', padding: '20px 16px', borderRadius: 8 }}>
            {paidPaymentMode === 'mixed' && (
              <div style={{ display: 'flex', justifyContent: 'center', gap: 32 }}>
                <div>
                  <p style={{ fontSize: 14, color: '#8c8c8c', marginBottom: 8 }}>已扣推廣金</p>
                  <p style={{ fontSize: 30, fontWeight: 700, color: '#E8720C', margin: 0, lineHeight: 1.2 }}>${paidPromoAmount}</p>
                </div>
                {paidGiftDays > 0 && (
                  <div>
                    <p style={{ fontSize: 14, color: '#8c8c8c', marginBottom: 8 }}>已用贈送天數</p>
                    <p style={{ fontSize: 30, fontWeight: 700, color: '#fa541c', margin: 0, lineHeight: 1.2 }}>{paidGiftDays} 天</p>
                  </div>
                )}
              </div>
            )}
            {paidPaymentMode === 'promo' && (
              <>
                <p style={{ fontSize: 14, color: '#8c8c8c', marginBottom: 8 }}>已扣推廣金</p>
                <p style={{ fontSize: 36, fontWeight: 700, color: '#fa541c', margin: 0, lineHeight: 1.2 }}>${paidPromoAmount}</p>
              </>
            )}
            {paidPaymentMode === 'gift' && (
              <>
                <p style={{ fontSize: 14, color: '#8c8c8c', marginBottom: 8 }}>已用贈送天數</p>
                <p style={{ fontSize: 36, fontWeight: 700, color: '#fa541c', margin: 0, lineHeight: 1.2 }}>{paidGiftDays} 天</p>
              </>
            )}
          </div>
        </div>
      </Modal>
    </div>
  )
}
