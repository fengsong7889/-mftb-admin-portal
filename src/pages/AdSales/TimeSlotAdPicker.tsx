/**
 * Copyright (c) 2026 fengsong7889. All Rights Reserved.
 *
 * 本文件为「MFTB 企业一体化管理平台软件」的组成部分。
 * 未经著作权人书面许可，不得使用、复制、修改、再分发或用于任何商业目的。
 * 完整许可条款见仓库根目录 LICENSE 文件。
 */
/**
 * 時段推薦廣告 - 選購界面（廣告銷售 → 外賣到家 → 時段推薦廣告）
 *
 * 交互（頂部搜索仿人氣商家；日曆選天復用 dayPickerConstants 共享件，樣式與人氣商家/盤活復蘇一致）：
 *  1. 頂部搜索區：所屬品牌 / 業務頻道 / 時段推薦名稱 / 門店名稱 / 歸屬BD + 查詢/重置；
 *  2. 左側：選時段（支持多選）→ 日曆選購買天數（月分頁 + 批量添加 + 每週休息日 + 待開售灰顯）；
 *  3. 右側：當前已選 → 添加到購物車（多時段各自日期，可多次加購）→ 購物車 → 訂單結算 → 支付二次確認。
 *
 * ⚠️ 第一階段（高效開發模式）：僅前端界面 + 本地購物車 state，支付為 mock（不落庫）；
 *    第二階段後端下單入參改為「多條目 {slotKey, dates[]}」並接 placeAdTimeSlotOrder。
 */
import { useEffect, useMemo, useState } from 'react'
import {
  Button, Card, DatePicker, Empty, Modal, Select, Space, Table, Tag, message,
} from 'antd'
import {
  CalendarOutlined, ShoppingCartOutlined, SearchOutlined, ReloadOutlined,
  DeleteOutlined, ClockCircleOutlined, GiftOutlined,
} from '@ant-design/icons'
import type { Dayjs } from 'dayjs'
import dayjs from 'dayjs'
import { useNavigate } from 'react-router-dom'
import {
  fetchAdTimeSlotPricingList, placeAdTimeSlotOrder, fetchAdTimeSlotPurchasedCells,
  type AdPricingTimeSlot, type AdTimeSlotItem,
} from '@/api/adPromotion'
import { fetchStores } from '@/api/store'
import { fetchFinAccountBalance } from '@/api/finance'
import {
  buildMonthList, buildCalendarGrid, isPresaleDate, MONTHS_PER_PAGE,
} from '../_shared/ad-promotion/dayPickerConstants'
import { MonthTabBar } from './components/pickerShared'

const DATE_FMT = 'YYYY-MM-DD'
const WEEKDAY_LABELS = ['週日', '週一', '週二', '週三', '週四', '週五', '週六']

/** 解析 JSON 數組字符串，失敗返回空數組 */
function parseJsonList<T = Record<string, unknown>>(json?: string | null): T[] {
  if (!json) return []
  try {
    const parsed = JSON.parse(json)
    return Array.isArray(parsed) ? (parsed as T[]) : []
  } catch {
    return []
  }
}

/** 單個時段折後日價（MOP/天） */
const slotDailyPrice = (s: AdTimeSlotItem) => {
  const base = s.price ?? 0
  return s.discountEnabled && s.discount ? base * (s.discount / 10) : base
}

/** 購物車條目：一個時段 + 其選定日期集合（金額按「天數折扣檔位」在渲染時派生，不快照） */
interface CartEntry {
  key: string
  slotKey: string
  slotName: string
  dates: string[]
  /** 時段折後日價（已含時段自身折扣） */
  unitPrice: number
  /** 時段原價（MOP/天） */
  originalUnitPrice: number
  /** 時段自身折扣（折，如 9.5；無折扣為 null） */
  discount: number | null
}

export default function TimeSlotAdPicker() {
  const navigate = useNavigate()

  /* ── 頂部搜索 ── */
  const [pricingList, setPricingList] = useState<AdPricingTimeSlot[]>([])
  const [searchBrand, setSearchBrand] = useState<string | undefined>(undefined)
  const [searchChannel, setSearchChannel] = useState<number | undefined>(undefined)
  const [searchName, setSearchName] = useState<number | undefined>(undefined)
  const [searchStore, setSearchStore] = useState<string | undefined>(undefined)
  const [searchBD, setSearchBD] = useState<string | undefined>(undefined)
  const [bdOptions, setBdOptions] = useState<{ label: string; value: string }[]>([])
  const [hasSearched, setHasSearched] = useState(false)

  const [stores, setStores] = useState<{ value: string; label: string; groupCode: string; bdList: { label: string; value: string }[] }[]>([])

  /* ── 左側：時段（多選）+ 日曆 ── */
  const [selectedSlotKeys, setSelectedSlotKeys] = useState<string[]>([])
  const [selectedDates, setSelectedDates] = useState<string[]>([])
  const [restWeekdays, setRestWeekdays] = useState<number[]>([])
  const [batchRange, setBatchRange] = useState<[Dayjs, Dayjs] | null>(null)
  const [currentMonth, setCurrentMonth] = useState<Dayjs>(dayjs().startOf('month'))
  const [monthPage, setMonthPage] = useState(0)

  /* ── 右側：購物車 + 結算 ── */
  const [cart, setCart] = useState<CartEntry[]>([])
  /** 已購買格子集（「YYYY-MM-DD|slotKey」）：加購物車前置攔截 + 日曆標註，避免走到最終支付才報重複 */
  const [purchasedCells, setPurchasedCells] = useState<Set<string>>(new Set())
  /** 推廣金餘額：null = 未取到（無權限/後端不可用），展示 '--' 且跳過前端預校驗，不得降為 0 誤擋下單 */
  const [merchantBalance, setMerchantBalance] = useState<number | null>(null)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [successOpen, setSuccessOpen] = useState(false)
  const [paying, setPaying] = useState(false)

  /* ── 數據加載 ── */
  useEffect(() => {
    fetchAdTimeSlotPricingList({ page: 1, size: 200, status: 1 })
      .then(res => setPricingList(res.records ?? []))
      .catch(() => message.error('加載時段推薦定價失敗，請稍後重試'))
  }, [])
  useEffect(() => {
    fetchStores({ page: 1, size: 500 })
      .then(res => setStores((res.records ?? []).map(s => ({
        value: s.storeCode, label: `${s.storeName}（${s.storeCode}）`, groupCode: s.groupCode,
        bdList: (s.bdList ?? []).map(b => ({ label: b.bdName || b.bdEmpId, value: b.bdEmpId })),
      }))))
      .catch(() => { /* 靜默 */ })
  }, [])

  /** 選門店：自動帶出該門店綁定的 BD（取 bdList，非集團編碼） */
  const handleStoreChange = (v: string | undefined) => {
    setSearchStore(v)
    const st = stores.find(s => s.value === v)
    const bds = st?.bdList ?? []
    setBdOptions(bds)
    setSearchBD(bds[0]?.value)
  }

  /* ── 品牌 → 頻道 → 名稱 級聯選項 ── */
  const channelOptions = useMemo(() => {
    const set = new Set<number>()
    pricingList.forEach(p => {
      if ((!searchBrand || p.brand === searchBrand) && p.channel != null) set.add(p.channel)
    })
    const labelMap: Record<number, string> = { 2: '美食外賣', 3: '超市百貨', 4: '團購到店' }
    return Array.from(set).sort((a, b) => a - b).map(c => ({ label: labelMap[c] ?? String(c), value: c }))
  }, [pricingList, searchBrand])

  const nameOptions = useMemo(() => (
    pricingList
      .filter(p => (!searchBrand || p.brand === searchBrand) && (searchChannel == null || p.channel === searchChannel))
      .map(p => ({ label: p.algoName || '未命名', value: p.id as number }))
  ), [pricingList, searchBrand, searchChannel])

  const config = useMemo(() => pricingList.find(p => p.id === searchName) ?? null, [pricingList, searchName])
  const configSlots = config?.slots ?? []

  /* ── 可售窗口（预售天数）+ 月份分頁 + 日曆網格（復用共享件，與人氣商家一致） ── */
  const sellableDays = config?.presaleDays ?? 7
  const months = useMemo(() => buildMonthList(sellableDays), [sellableDays])
  const monthPageCount = Math.ceil(months.length / MONTHS_PER_PAGE)
  const visibleMonths = months.slice(monthPage * MONTHS_PER_PAGE, (monthPage + 1) * MONTHS_PER_PAGE)
  const calendarGrid = useMemo(() => buildCalendarGrid(currentMonth), [currentMonth])
  const lastSellableDay = dayjs().add(sellableDays - 1, 'day')

  const isRestDay = (d: Dayjs) => restWeekdays.includes(d.day())
  const isPresale = (d: Dayjs) => isPresaleDate(d, sellableDays)
  const isSellable = (d: Dayjs) => !d.isBefore(dayjs(), 'day') && !isPresale(d) && !isRestDay(d)

  /** 单元格样式（对齐 dayPickerCommon：待开售灰虚线 / 已选绿 / 可选白） */
  const getCellStyle = (d: Dayjs | null): React.CSSProperties => {
    if (!d) return { background: '#fafafa', border: '1px solid #f0f0f0' }
    if (isPresale(d)) return { background: '#fafafa', border: '1px dashed #d9d9d9', color: '#bfbfbf', cursor: 'default' }
    if (isRestDay(d)) return { background: '#f5f5f5', border: '1px solid #e8e8e8', color: '#bfbfbf', cursor: 'not-allowed' }
    const dateStr = d.format(DATE_FMT)
    if (selectedDates.includes(dateStr)) return { background: '#f6ffed', border: '2px solid #52c41a', color: '#52c41a', cursor: 'pointer', fontWeight: 600 }
    if (d.isBefore(dayjs(), 'day')) return { background: '#f5f5f5', border: '1px solid #e8e8e8', color: '#bfbfbf', cursor: 'not-allowed' }
    return { background: '#fff', border: '1px solid #e8e8e8', color: '#333', cursor: 'pointer' }
  }

  const toggleDate = (d: Dayjs | null) => {
    if (!d || !isSellable(d)) return
    const key = d.format(DATE_FMT)
    setSelectedDates(prev => prev.includes(key) ? prev.filter(x => x !== key) : [...prev, key].sort())
  }

  const handleMonthChange = (m: Dayjs) => { setCurrentMonth(m) }

  /* ── 批量添加（範圍內可售且非休息日全部選中） ── */
  const handleBatchAdd = () => {
    if (!batchRange || !batchRange[0] || !batchRange[1]) { message.warning('請先選擇批量添加的日期範圍'); return }
    const added: string[] = []
    let cur = batchRange[0].startOf('day')
    const end = batchRange[1].startOf('day')
    while (!cur.isAfter(end)) {
      if (isSellable(cur)) {
        const k = cur.format(DATE_FMT)
        if (!selectedDates.includes(k)) added.push(k)
      }
      cur = cur.add(1, 'day')
    }
    if (added.length === 0) { message.info('該範圍內沒有可添加的日期'); return }
    setSelectedDates(prev => [...prev, ...added].sort())
    message.success(`已添加 ${added.length} 天`)
  }

  /* ── 按購買天數折扣檔位（匹配最大 minDays ≤ days；天數口徑 = 日曆去重天數） ── */
  const daysTierDiscount = (days: number): number | null => {
    if (!config || config.daysDiscountEnabled !== 1 || days <= 0) return null
    const tiers = parseJsonList<{ minDays?: number; discount?: number }>(config.daysDiscountTiers)
    const matched = tiers.filter(t => (t.minDays ?? 0) <= days)
      .sort((a, b) => (b.minDays ?? 0) - (a.minDays ?? 0))[0]
    return matched?.discount ? matched.discount : null
  }
  const daysFactor = (days: number) => {
    const zhe = daysTierDiscount(days)
    return zhe ? zhe / 10 : 1
  }

  const toggleSlot = (slotKey: string) => {
    setSelectedSlotKeys(prev => prev.includes(slotKey) ? prev.filter(k => k !== slotKey) : [...prev, slotKey])
  }

  /* ── 添加到購物車（多時段，各自生成一條購物車條目；先前置校驗已購買/購物車內重複格子） ── */
  const handleAddToCart = () => {
    if (selectedSlotKeys.length === 0) { message.warning('請先選擇要購買的時段'); return }
    if (selectedDates.length === 0) { message.warning('請先在日曆選擇購買天數'); return }
    const conflicts: string[] = []
    for (const k of selectedSlotKeys) {
      const name = configSlots.find(s => s.slotKey === k)?.slotName ?? k
      for (const d of selectedDates) {
        if (purchasedCells.has(`${d}|${k}`)) conflicts.push(`時段 ${name} 在 ${d} 已購買`)
        else if (cart.some(e => e.slotKey === k && e.dates.includes(d))) conflicts.push(`時段 ${name} 在 ${d} 已在購物車中`)
      }
    }
    if (conflicts.length > 0) {
      message.error(`${conflicts.slice(0, 3).join('；')}${conflicts.length > 3 ? `；等共 ${conflicts.length} 項` : ''}，請調整日期或時段`)
      return
    }
    const entries: CartEntry[] = selectedSlotKeys
      .map(k => configSlots.find(s => s.slotKey === k))
      .filter((s): s is AdTimeSlotItem => !!s)
      .map((s, i) => ({
        key: `${s.slotKey}-${Date.now()}-${i}`,
        slotKey: s.slotKey!,
        slotName: s.slotName,
        dates: [...selectedDates],
        unitPrice: slotDailyPrice(s),
        originalUnitPrice: s.price ?? 0,
        discount: s.discountEnabled && s.discount ? s.discount : null,
      }))
    setCart(prev => [...prev, ...entries])
    setSelectedDates([])
    setSelectedSlotKeys([])
    message.success(`已將 ${entries.length} 個時段加入購物車`)
  }

  const removeCartEntry = (key: string) => setCart(prev => prev.filter(e => e.key !== key))

  /* ── 結算派生：購買天數合計 = 日曆去重天數（非各時段天數相加）；天數折扣按合計檔位全局重算 ── */
  const cartDays = useMemo(() => new Set(cart.flatMap(e => e.dates)).size, [cart])
  const daysZhe = daysTierDiscount(cartDays)
  const daysFactorValue = daysZhe ? daysZhe / 10 : 1
  const entrySlotAmount = (e: CartEntry) => Math.round(e.unitPrice * e.dates.length * 100) / 100
  const entryPayAmount = (e: CartEntry) => Math.round(entrySlotAmount(e) * daysFactorValue * 100) / 100
  const entryOriginalAmount = (e: CartEntry) => Math.round(e.originalUnitPrice * e.dates.length * 100) / 100
  const cartOriginal = Math.round(cart.reduce((s, e) => s + entryOriginalAmount(e), 0) * 100) / 100
  /** 時段自身優惠合計（原價 → 時段折後價差額） */
  const cartSlotDiscount = Math.round(cart.reduce((s, e) => s + (entryOriginalAmount(e) - entrySlotAmount(e)), 0) * 100) / 100
  /** 購買天數優惠合計（時段折後價 → 天數檔位折後差額） */
  const cartDaysDiscount = Math.round(cart.reduce((s, e) => s + (entrySlotAmount(e) - entryPayAmount(e)), 0) * 100) / 100
  const cartDiscount = Math.max(0, Math.round((cartSlotDiscount + cartDaysDiscount) * 100) / 100)
  const cartTotal = Math.max(0, Math.round((cartOriginal - cartDiscount) * 100) / 100)
  const slotZheText = [...new Set(cart.filter(e => e.discount).map(e => `${e.discount}折`))].join('/')
  /** 預覽天數（購物車去重日期 ∪ 當前日曆勾選），用於橫幅與待加購折扣提示 */
  const previewDays = useMemo(() => new Set([...cart.flatMap(e => e.dates), ...selectedDates]).size, [cart, selectedDates])
  const pendingFactor = daysFactor(previewDays)
  /** 餘額不足或購物車為空時禁用支付（餘額未取到不做阻擋） */
  const payDisabled = cart.length === 0 || (merchantBalance != null && cartTotal > merchantBalance)

  /* ── 支付 ── */
  const handlePay = () => {
    if (cart.length === 0) { message.warning('購物車為空，請先添加時段'); return }
    if (!searchStore) { message.warning('請選擇購買門店'); return }
    if (merchantBalance != null && cartTotal > merchantBalance) { message.error('推廣金餘額不足，請充值後再試'); return }
    setConfirmOpen(true)
  }
  const handleConfirmPay = async () => {
    const st = stores.find(s => s.value === searchStore)
    if (!config?.id || !st) { message.error('定價配置或門店缺失，請重新查詢'); return }
    setPaying(true)
    try {
      // 真實下單：後端按 {時段, 日期集合} 展開逐格重算金額並從推廣金扣款
      await placeAdTimeSlotOrder({
        pricingId: config.id,
        groupCode: st.groupCode,
        storeCode: st.value,
        bdEmpId: searchBD,
        channel: config.channel ?? undefined,
        items: cart.map(e => ({ slotKey: e.slotKey, dates: e.dates })),
      })
      setConfirmOpen(false)
      setCart([])
      setSelectedDates([])
      setSelectedSlotKeys([])
      // 支付成功後刷新已購買格子，後續加購立即感知新占用
      loadPurchasedCells(config.id, st.groupCode)
      setSuccessOpen(true)
    } catch (err) {
      message.error(err instanceof Error && err.message ? err.message : '下單失敗，請稍後重試')
    } finally {
      setPaying(false)
    }
  }

  /** 加載已購買格子（失敗時清空，不阻斷選購；最終重複仍由後端下單裁決） */
  const loadPurchasedCells = (pricingId: number, groupCode: string) => {
    fetchAdTimeSlotPurchasedCells(pricingId, groupCode)
      .then(list => setPurchasedCells(new Set(list ?? [])))
      .catch(() => setPurchasedCells(new Set()))
  }

  const handleSearch = () => {
    if (!searchName) { message.warning('請選擇時段推薦名稱'); return }
    if (!searchStore) { message.warning('請選擇購買門店'); return }
    setHasSearched(true)
    setSelectedSlotKeys([])
    setSelectedDates([])
    setCart([])
    setMonthPage(0)
    setCurrentMonth(dayjs().startOf('month'))
    // 推廣金餘額（集團+品牌）：取不到保持 null 顯示 '--'
    const st = stores.find(s => s.value === searchStore)
    fetchFinAccountBalance(st?.groupCode, searchBrand)
      .then(bal => setMerchantBalance(bal ? Number(bal.virtualBalance) : null))
      .catch(() => setMerchantBalance(null))
    // 已購買格子：加購物車前置攔截與日曆標註
    if (st) loadPurchasedCells(searchName, st.groupCode)
    else setPurchasedCells(new Set())
  }
  const handleReset = () => {
    setSearchBrand(undefined); setSearchChannel(undefined); setSearchName(undefined)
    setSearchStore(undefined); setSearchBD(undefined); setBdOptions([])
    setHasSearched(false); setSelectedSlotKeys([]); setSelectedDates([]); setCart([])
    setRestWeekdays([]); setMonthPage(0); setMerchantBalance(null); setPurchasedCells(new Set())
  }

  return (
    <div>
      {/* ── 頂部搜索區（仿人氣商家） ── */}
      <div className="search-section" style={{ marginBottom: 16 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px 12px' }}>
          <div>
            <div style={{ fontSize: 13, color: 'var(--text-2)', marginBottom: 6 }}>所屬品牌:</div>
            <Select allowClear placeholder="請先選擇所屬品牌" value={searchBrand} style={{ width: '100%' }}
              onChange={v => { setSearchBrand(v); setSearchChannel(undefined); setSearchName(undefined) }}
              options={[{ label: '閃蜂', value: 'flashBee' }, { label: 'mFood', value: 'mFood' }]} />
          </div>
          <div>
            <div style={{ fontSize: 13, color: 'var(--text-2)', marginBottom: 6 }}>業務頻道:</div>
            <Select allowClear placeholder={searchBrand ? '請選擇業務頻道' : '請先選擇所屬品牌'} value={searchChannel} style={{ width: '100%' }}
              disabled={!searchBrand} onChange={v => { setSearchChannel(v); setSearchName(undefined) }} options={channelOptions} />
          </div>
          <div>
            <div style={{ fontSize: 13, color: 'var(--text-2)', marginBottom: 6 }}>時段推薦名稱:</div>
            <Select allowClear showSearch optionFilterProp="label" placeholder={searchBrand ? '請選擇時段推薦名稱' : '請先選擇所屬品牌'}
              value={searchName} style={{ width: '100%' }} disabled={!searchBrand} onChange={setSearchName} options={nameOptions} />
          </div>
          <div>
            <div style={{ fontSize: 13, color: 'var(--text-2)', marginBottom: 6 }}>門店名稱:</div>
            <Select allowClear showSearch optionFilterProp="label" placeholder="支持ID和名稱搜索" value={searchStore} style={{ width: '100%' }}
              onChange={handleStoreChange} options={stores.map(s => ({ label: s.label, value: s.value }))} />
          </div>
          <div>
            <div style={{ fontSize: 13, color: 'var(--text-2)', marginBottom: 6 }}>歸屬BD:</div>
            <Select allowClear placeholder="選擇門店後自動帶出" value={searchBD} style={{ width: '100%' }} disabled options={bdOptions} />
          </div>
          <div style={{ gridColumn: 'span 3', display: 'flex', alignItems: 'flex-end' }}>
            <div className="search-actions">
              <Button type="primary" icon={<SearchOutlined />} onClick={handleSearch}>查詢</Button>
              <Button icon={<ReloadOutlined />} onClick={handleReset}>重置</Button>
            </div>
          </div>
        </div>
      </div>

      {!hasSearched || !config ? (
        <Card bodyStyle={{ padding: '48px 24px' }}>
          <Empty description="請先選擇時段推薦名稱與門店後點擊查詢" image={Empty.PRESENTED_IMAGE_SIMPLE} />
        </Card>
      ) : (
        <>
          {/* ── 多買多折橫幅 ── */}
          {config.daysDiscountEnabled === 1 && (
            <div style={{
              background: 'linear-gradient(90deg, #fff7e6, #fffdf5)', border: '1px solid #ffe7ba',
              borderRadius: 8, padding: '10px 16px', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 12,
            }}>
              <Tag color="orange" icon={<GiftOutlined />} style={{ fontSize: 13 }}>多買多折</Tag>
              {parseJsonList<{ minDays?: number; discount?: number }>(config.daysDiscountTiers)
                .sort((a, b) => (a.minDays ?? 0) - (b.minDays ?? 0))
                .map((t, i) => <Tag key={i} color="volcano">滿{t.minDays}天 {t.discount}折</Tag>)}
              <span style={{ marginLeft: 'auto', fontSize: 13, color: 'var(--text-3)' }}>
                選購越多，優惠越大 ｜ 已選 <b style={{ color: 'var(--brand)' }}>{previewDays}</b> 天
              </span>
            </div>
          )}

          <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
            {/* ── 左側：時段 + 日曆 ── */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <Card size="small" title={<Space><ClockCircleOutlined />選擇時段（可多選）</Space>} style={{ marginBottom: 16 }}>
                {configSlots.length === 0 ? (
                  <Empty description="該定價未配置售卖時段" image={Empty.PRESENTED_IMAGE_SIMPLE} />
                ) : (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    {configSlots.map(s => {
                      const active = selectedSlotKeys.includes(s.slotKey!)
                      return (
                        <div key={s.slotKey} onClick={() => toggleSlot(s.slotKey!)}
                          style={{
                            padding: '6px 14px', borderRadius: 6, cursor: 'pointer', border: '1px solid',
                            borderColor: active ? 'var(--brand)' : 'var(--border-2)',
                            background: active ? 'var(--warning-soft)' : 'var(--surface-2)',
                            transition: 'all 0.2s',
                          }}>
                          <span style={{ fontSize: 13, fontWeight: active ? 600 : 400, color: active ? 'var(--brand)' : 'var(--text-2)' }}>{s.slotName}</span>
                          {s.discountEnabled && s.discount ? (
                            <span style={{ fontSize: 12, marginLeft: 6, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                              <span style={{ color: 'var(--text-4)', textDecoration: 'line-through' }}>MOP {(s.price ?? 0).toFixed(2)}</span>
                              <Tag color="red" style={{ margin: 0 }}>{s.discount}折</Tag>
                              <span style={{ color: 'var(--brand)', fontWeight: 600 }}>MOP {slotDailyPrice(s).toFixed(2)}/天</span>
                            </span>
                          ) : (
                            <span style={{ fontSize: 12, color: 'var(--text-3)', marginLeft: 6 }}>MOP {slotDailyPrice(s).toFixed(2)}/天</span>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}
              </Card>

              <Card size="small" title={<Space><CalendarOutlined />選擇購買天數</Space>}
                extra={config.refundEnabled === 2 && <Tag color="red">不允許退款</Tag>}>
                {/* 月分頁（復用共享件：補齊整頁 + 上下頁切換，待開售月灰顯） */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                  <Button size="small" disabled={monthPage === 0} onClick={() => setMonthPage(p => Math.max(0, p - 1))}>◀</Button>
                  <MonthTabBar
                    months={visibleMonths}
                    current={currentMonth}
                    isPresaleMonth={m => m.startOf('month').isAfter(lastSellableDay)}
                    hasSelectedDates={m => selectedDates.some(d => dayjs(d).isSame(m, 'month'))}
                    onChange={handleMonthChange}
                    presaleTag="🔒待開售"
                  />
                  <Button size="small" disabled={monthPage >= monthPageCount - 1} onClick={() => setMonthPage(p => Math.min(monthPageCount - 1, p + 1))}>▶</Button>
                </div>

                {/* 批量添加 + 每週休息日（樣式對齊人氣商家/盤活復蘇：#FAFAFA 容器 + div 標籤，休息日紅邊紅字刪除線） */}
                <div style={{ background: '#FAFAFA', borderRadius: 8, padding: '10px 12px', marginBottom: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 13, color: '#595959' }}>批量添加:</span>
                    <DatePicker.RangePicker size="small" value={batchRange} onChange={v => setBatchRange(v && v[0] && v[1] ? [v[0], v[1]] : null)} />
                    <Button size="small" type="primary" onClick={handleBatchAdd}>添加至日曆</Button>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
                    <span style={{ fontSize: 12, color: '#8C8C8C' }}>每週休息日（批量添加時自動跳過）:</span>
                    {WEEKDAY_LABELS.map((label, idx) => {
                      const isExcluded = restWeekdays.includes(idx)
                      return (
                        <div key={idx} onClick={() => setRestWeekdays(prev => isExcluded ? prev.filter(x => x !== idx) : [...prev, idx])}
                          style={{
                            padding: '2px 10px', borderRadius: 4, cursor: 'pointer', fontSize: 12,
                            border: isExcluded ? '1px solid #FF4D4F' : '1px solid #d9d9d9',
                            background: isExcluded ? '#FFF1F0' : '#fff',
                            color: isExcluded ? '#FF4D4F' : '#595959',
                            textDecoration: isExcluded ? 'line-through' : 'none',
                            transition: 'all 0.2s',
                          }}>
                          {label}
                        </div>
                      )
                    })}
                  </div>
                </div>

                {/* 日曆網格 */}
                <div style={{ border: '1px solid #f0f0f0', borderRadius: 8, overflow: 'hidden' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', background: '#FAFAFA', borderBottom: '1px solid #f0f0f0' }}>
                    {WEEKDAY_LABELS.map((label, i) => (
                      <div key={label} style={{ padding: '8px 0', textAlign: 'center', fontWeight: 600, fontSize: 12, color: i === 0 || i === 6 ? '#FA8C16' : '#595959' }}>{label}</div>
                    ))}
                  </div>
                  {calendarGrid.map((week, wi) => (
                    <div key={wi} style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)' }}>
                      {week.map((d, di) => {
                        const key = d?.format(DATE_FMT)
                        const selected = d ? selectedDates.includes(key!) : false
                        const sellable = d ? isSellable(d) : false
                        return (
                          <div key={di} onClick={() => toggleDate(d)}
                            style={{ minHeight: 56, margin: 2, borderRadius: 6, padding: '4px 2px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 1, ...getCellStyle(d), transition: 'all 0.2s' }}>
                            {d && (
                              <>
                                <span style={{ fontSize: 14, fontWeight: selected ? 700 : 500 }}>{d.date()}</span>
                                {selected && <span style={{ fontSize: 9 }}>已選擇</span>}
                                {!selected && sellable && (
                                  selectedSlotKeys.some(k => purchasedCells.has(`${key}|${k}`))
                                    ? <span style={{ fontSize: 9, color: '#ff4d4f' }}>已購買</span>
                                    : <span style={{ fontSize: 9, color: '#52c41a' }}>可購買</span>
                                )}
                                {!selected && d && isPresale(d) && <span style={{ fontSize: 9, color: '#8c8c8c', marginTop: 2, border: '1px solid #d9d9d9', borderRadius: 3, padding: '0 3px', background: '#f5f5f5' }}>🔒待開售</span>}
                              </>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  ))}
                </div>
              </Card>
            </div>

            {/* ── 右側：當前已選 + 購物車 + 結算 ── */}
            <div style={{ width: 400, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 16 }}>
              <Card size="small" title={<Space><ClockCircleOutlined />當前選擇</Space>}
                extra={selectedDates.length > 0 && <Button type="link" size="small" danger icon={<DeleteOutlined />} onClick={() => setSelectedDates([])}>清空</Button>}>
                <div style={{ fontSize: 13, marginBottom: 8 }}>
                  已選時段：{selectedSlotKeys.length > 0
                    ? selectedSlotKeys.map(k => <Tag key={k} color="orange">{configSlots.find(s => s.slotKey === k)?.slotName}</Tag>)
                    : <span style={{ color: 'var(--text-4)' }}>未選擇</span>}
                </div>
                <div style={{ fontSize: 13, marginBottom: 8 }}>
                  天數：<b style={{ color: '#52c41a' }}>{selectedDates.length}</b> 天
                  {selectedSlotKeys.length > 0 && selectedDates.length > 0 && (
                    <span style={{ marginLeft: 8, color: 'var(--text-3)' }}>
                      × {selectedSlotKeys.length} 個時段
                      {pendingFactor !== 1 && <Tag color="volcano" style={{ marginLeft: 6 }}>{pendingFactor * 10}折</Tag>}
                    </span>
                  )}
                </div>
                <Button type="primary" block icon={<ShoppingCartOutlined />} onClick={handleAddToCart}
                  disabled={selectedSlotKeys.length === 0 || selectedDates.length === 0}
                  style={{ background: 'var(--brand)', borderColor: 'var(--brand)', height: 40 }}>
                  添加到購物車
                </Button>
              </Card>

              <Card size="small" title={<Space><ShoppingCartOutlined />已選時段（購物車）</Space>}>
                {cart.length > 0 ? (
                  <Table<CartEntry>
                    rowKey="key" dataSource={cart} pagination={false} size="small"
                    columns={[
                      { title: '時段', dataIndex: 'slotName', width: 70 },
                      { title: '天數', key: 'days', width: 60, render: (_, e) => `${e.dates.length}天` },
                      { title: '日期', key: 'dates', ellipsis: true, render: (_, e) => <span style={{ fontSize: 11, color: 'var(--text-3)' }}>{e.dates.join('、')}</span> },
                      { title: '金額', key: 'amount', width: 80, align: 'right' as const, render: (_, e) => <span style={{ color: '#ff4d4f', fontWeight: 600 }}>MOP {entryPayAmount(e).toFixed(2)}</span> },
                      { title: '操作', key: 'op', width: 72, align: 'center' as const, render: (_, e) => <Button type="link" size="small" danger icon={<DeleteOutlined />} style={{ padding: 0 }} onClick={() => removeCartEntry(e.key)}>移除</Button> },
                    ]}
                  />
                ) : (
                  <Empty description="購物車為空" image={Empty.PRESENTED_IMAGE_SIMPLE} />
                )}
              </Card>

              <Card size="small" title="訂單結算">
                {/* 推廣金餘額橙色漸變塊（樣式對齊盤活復蘇/人氣商家結算模組） */}
                <div style={{ padding: '12px 16px', marginBottom: 12, background: 'linear-gradient(135deg, #E8720C 0%, #F39C12 100%)', borderRadius: 6, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 13, color: '#fff', opacity: 0.9 }}>推廣金餘額：</span>
                  <span style={{ fontSize: 22, fontWeight: 700, color: '#fff' }}>{merchantBalance == null ? '--' : `MOP ${merchantBalance.toLocaleString()}`}</span>
                </div>
                <div style={{ background: '#fafafa', padding: 16, borderRadius: 8 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                    <span style={{ color: '#595959' }}>購買天數合計：</span>
                    <span style={{ fontWeight: 600 }}>{cartDays} 天</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                    <span style={{ color: '#595959' }}>訂單金額（原價）：</span>
                    <span style={{ fontWeight: 600 }}>MOP {cartOriginal.toFixed(2)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                    <span style={{ color: '#595959' }}>享受折扣（時段）：</span>
                    {slotZheText
                      ? <span style={{ fontWeight: 600, color: '#52C41A' }}>{slotZheText}</span>
                      : <span style={{ color: '#BFBFBF' }}>無</span>}
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                    <span style={{ color: '#595959' }}>享受折扣（購買天數）：</span>
                    {daysZhe
                      ? <span style={{ fontWeight: 600, color: '#52C41A' }}>{daysZhe}折</span>
                      : <span style={{ color: '#BFBFBF' }}>無</span>}
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, color: '#fa8c16' }}>
                    <span>訂單優惠：</span>
                    <span style={{ fontWeight: 600 }}>-MOP {cartDiscount.toFixed(2)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 16, color: '#ff4d4f', borderTop: '1px solid #d9d9d9', paddingTop: 8, marginTop: 8 }}>
                    <span style={{ fontWeight: 600 }}>實付總額：</span>
                    <span style={{ fontWeight: 700 }}>MOP {cartTotal.toFixed(2)}</span>
                  </div>
                </div>
                <Button type="primary" block size="large" icon={<ShoppingCartOutlined />} onClick={handlePay} disabled={payDisabled}
                  style={{ marginTop: 12, background: payDisabled ? '#d9d9d9' : 'linear-gradient(135deg, #ff4d4f, #ff7875)', borderColor: payDisabled ? '#d9d9d9' : '#ff4d4f', height: 44, fontSize: 16, fontWeight: 600 }}>
                  支付訂單
                </Button>
                {merchantBalance != null && cart.length > 0 && cartTotal > merchantBalance && (
                  <div style={{ marginTop: 8, fontSize: 12, color: '#ff4d4f' }}>推廣金餘額不足，請充值後再試</div>
                )}
              </Card>
            </div>
          </div>
        </>
      )}

      {/* ── 支付二次確認（樣式對齊人氣商家/盤活復蘇「確認訂單」彈窗：明細表格 + 摘要區塊，居中彈出） ── */}
      <Modal
        title="確認訂單" open={confirmOpen} onOk={handleConfirmPay} onCancel={() => setConfirmOpen(false)}
        okText="確認支付" cancelText="取消" confirmLoading={paying}
        okButtonProps={{ style: { background: 'var(--brand)', borderColor: 'var(--brand)' } }}
        width={600} centered
      >
        <div style={{ marginBottom: 12, fontSize: 14, color: '#262626', fontWeight: 500 }}>⏰ {config?.algoName || '時段推薦廣告'}</div>
        <div style={{ maxHeight: 300, overflowY: 'auto', marginBottom: 16 }}>
          <h4 style={{ marginBottom: 12, fontSize: 14, color: '#595959' }}>購買明細</h4>
          <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
            <thead><tr style={{ background: '#fafafa' }}>
              <th style={{ padding: '8px', border: '1px solid #e8e8e8', textAlign: 'left' }}>購買日期</th>
              <th style={{ padding: '8px', border: '1px solid #e8e8e8', textAlign: 'left' }}>時段</th>
              <th style={{ padding: '8px', border: '1px solid #e8e8e8', textAlign: 'right' }}>售價</th>
            </tr></thead>
            <tbody>
              {cart.flatMap(e => e.dates.map(date => ({ date, e })))
                .sort((a, b) => a.date.localeCompare(b.date) || a.e.slotName.localeCompare(b.e.slotName))
                .map(({ date, e }) => (
                  <tr key={`${e.key}-${date}`}>
                    <td style={{ padding: '8px', border: '1px solid #e8e8e8' }}>{date}</td>
                    <td style={{ padding: '8px', border: '1px solid #e8e8e8' }}>{e.slotName}</td>
                    <td style={{ padding: '8px', border: '1px solid #e8e8e8', textAlign: 'right', color: '#ff4d4f', fontWeight: 600 }}>
                      MOP {Math.round(e.unitPrice * daysFactorValue * 100) / 100}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
        <div style={{ background: '#fafafa', padding: 16, borderRadius: 8 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
            <span style={{ color: '#595959' }}>訂單金額（原價）：</span>
            <span style={{ fontWeight: 600 }}>MOP {cartOriginal.toFixed(2)}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, color: '#fa8c16' }}>
            <span>訂單優惠：</span>
            <span style={{ fontWeight: 600 }}>- MOP {cartDiscount.toFixed(2)}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 16, color: '#ff4d4f', borderTop: '1px solid #d9d9d9', paddingTop: 8, marginTop: 8 }}>
            <span style={{ fontWeight: 600 }}>實付總額：</span>
            <span style={{ fontWeight: 700 }}>MOP {cartTotal.toFixed(2)}</span>
          </div>
        </div>
      </Modal>

      {/* ── 支付成功 ── */}
      <Modal
        title="購買成功" open={successOpen} onCancel={() => setSuccessOpen(false)}
        footer={[
          <Button key="view" type="primary" onClick={() => { setSuccessOpen(false); navigate(`/promotion-order-manage?type=${encodeURIComponent('時段推薦廣告')}&from=ad-sales`) }}>查看訂單</Button>,
          <Button key="close" onClick={() => setSuccessOpen(false)}>關閉</Button>,
        ]}
      >
        <p>時段推薦廣告訂單已生成，可前往「查看訂單」查看訂單信息與推廣數據。</p>
      </Modal>
    </div>
  )
}
