/**
 * Copyright (c) 2026 fengsong7889. All Rights Reserved.
 *
 * 本文件为「MFTB 企业一体化管理平台软件」的组成部分。
 * 未经著作权人书面许可，不得使用、复制、修改、再分发或用于任何商业目的。
 * 完整许可条款见仓库根目录 LICENSE 文件。
 */

/**
 * 時段推薦廣告 - 定價配置（新增 / 詳情 / 編輯）
 *
 * 業務背景：外賣到家新增廣告類型「時段推薦廣告」。商家按時段（早餐 / 午餐 / 下午茶 /
 * 晚餐 / 宵夜，以及運營自定義時段）分別購買推薦位；每個時段可獨立配置售卖時間段、
 * 售卖價格與折扣，另支持「按購買天數」的全天折扣（每天都有買、不限時段）。
 *
 * ⚠️ 第一階段（高效開發模式）：僅前端靜態界面 + 本地 state，文案暫時硬編碼繁中，
 *    submit 不落庫；第二階段確認 UI 後再接 i18n、後端 CRUD 與數據庫。
 */
import { useEffect, useMemo, useState } from 'react'
import {
  Button, DatePicker, Form, Input, InputNumber, Select, Space, Switch, Table, Tag,
  TimePicker, Upload, Radio, Modal, message, Dropdown,
} from 'antd'
import type { UploadFile } from 'antd'
import type { Dayjs } from 'dayjs'
import dayjs from 'dayjs'
import {
  ArrowLeftOutlined, SaveOutlined, PlusOutlined, DeleteOutlined, ShopOutlined,
  ClockCircleOutlined, PercentageOutlined, SettingOutlined, CheckCircleOutlined,
  CalendarOutlined, TeamOutlined, DownOutlined,
} from '@ant-design/icons'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  AlgorithmType, RecommendChannel, ServiceStatus, APP_OPTIONS,
} from '@mftb/contracts/recommendConstants'
import { storeCategoryLabel } from '@/constants/storeCategory'
import HelpPopover from '@/components/HelpPopover'
import { fetchStores } from '@/api/store'
import {
  appTypeToBrand, brandToAppType,
  fetchAdTimeSlotPricingDetail, createAdTimeSlotPricing, updateAdTimeSlotPricing,
  type AdPricingTimeSlotRequest,
} from '@/api/adPromotion'
import { cardShellStyle, cardTitle, type CancelFeeRule } from './components/shared'

/* ──────────────── 類型 ──────────────── */

/** 商家可購範圍模式 */
type MerchantScope = 'all' | 'whitelist' | 'blacklist' | 'category'

/** 商家（門店）精簡信息 */
interface Merchant {
  id: string
  groupId: string
  groupName: string
  storeId: string
  storeName: string
  category?: string | null
}

/** 單個時段配置 */
interface SlotConfig {
  key: string
  preset: boolean          // 是否預設時段（預設名稱不可改，自定義可改）
  name: string             // 時段名稱
  timeRange?: [Dayjs, Dayjs]
  price?: number           // 售卖價格（MOP）
  discountEnabled: boolean // 是否配置該時段折扣
  discount?: number        // 折扣（折，如 9.5）
  // 限时折扣：字段名与 _shared/ad-promotion 契约保持一致，第二阶段可直接透传后端
  discountTimeMode?: 'limited' | 'unlimited'  // 限定时间（限时折扣）/ 不限时间（长期打折）
  discountStartDate?: string                  // 折扣周期开始日期（YYYY-MM-DD）
  discountEndDate?: string                    // 折扣周期结束日期（YYYY-MM-DD）
}

/** 按購買天數折扣梯度 */
interface DaysDiscountTier {
  id: number
  days?: number
  discount?: number
}

/* ──────────────── 常量 ──────────────── */

const HM = 'HH:mm'
const DATE_FMT = 'YYYY-MM-DD'

/** 限时折扣的折扣周期（日期区间）与 dayjs 双向转换：state 存契约要的字符串 */
const toPeriodValue = (start?: string, end?: string) =>
  (start && end ? [dayjs(start, DATE_FMT), dayjs(end, DATE_FMT)] : null) as [Dayjs, Dayjs] | null

/** 預設時段（名稱 + 默認售卖時間段） */
const PRESET_SLOTS: { key: string; name: string; range: [string, string] }[] = [
  { key: 'breakfast', name: '早餐', range: ['06:30', '10:30'] },
  { key: 'lunch', name: '午餐', range: ['10:30', '14:00'] },
  { key: 'afternoon', name: '下午茶', range: ['14:00', '17:00'] },
  { key: 'dinner', name: '晚餐', range: ['17:00', '21:00'] },
  { key: 'night', name: '宵夜', range: ['21:00', '02:00'] },
]

/** 商家範圍模式選項 */
const SCOPE_OPTIONS: { label: string; value: MerchantScope }[] = [
  { label: '全部商家', value: 'all' },
  { label: '指定商家可購', value: 'whitelist' },
  { label: '指定商家不可購', value: 'blacklist' },
  { label: '指定分類商家可購', value: 'category' },
]

/** 可購分類枚舉（廣告投放商家分組；第二階段入數據字典並賦予穩定編碼，值暫用繁中名稱） */
const AD_MERCHANT_CATEGORIES = [
  '燒烤海鮮', '全球美食', '香鍋冒菜', '養生輕食', '美味小食', '醒神早餐', '飲品糖水',
  '米粉麵館', '漢堡炸雞', '披薩意粉', '蛋糕甜點', '地方菜系', '火鍋煲類', '精選正餐', '日用百貨',
  '母嬰寵物', '保健護理', '凍肉水產', '美妝護膚', '浪漫鮮花', '酒水手信', '超市便利', '蛋糕烘焙',
].map(c => ({ label: c, value: c }))

/** 限时折扣是否生效：周期列的必填星号/禁用态/占位文案都取这个口径 */
const isSlotLimited = (slot: SlotConfig) => slot.discountEnabled && slot.discountTimeMode === 'limited'

/** 解析 JSON 數組字符串（後端 VO 的商家/分類/梯度字段），失敗返回空數組 */
function parseJsonList<T = Record<string, unknown>>(json?: string | null): T[] {
  if (!json) return []
  try {
    const parsed = JSON.parse(json)
    return Array.isArray(parsed) ? (parsed as T[]) : []
  } catch {
    return []
  }
}

/** 後端商家 JSON 項 → 前端 Merchant（兼容 storeCode/storeId、groupCode/groupId） */
function mapMerchant(raw: Record<string, unknown>): Merchant {
  const storeId = String(raw.storeCode ?? raw.storeId ?? '')
  return {
    id: storeId,
    groupId: String(raw.groupCode ?? raw.groupId ?? ''),
    groupName: String(raw.groupName ?? ''),
    storeId,
    storeName: String(raw.storeName ?? ''),
    category: raw.category == null ? null : String(raw.category),
  }
}

/** 前端 Merchant → 後端存儲項（storeCode/groupCode 口徑） */
function toMerchantPayload(m: Merchant): Record<string, unknown> {
  return { storeCode: m.storeId, groupCode: m.groupId, groupName: m.groupName, storeName: m.storeName, category: m.category ?? null }
}

/* ──────────────── 組件 ──────────────── */

export default function TimeSlotAdPricing() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const urlModule = searchParams.get('module') || 'delivery'
  const urlId = searchParams.get('id') || ''
  const isDetailMode = searchParams.get('mode') === 'detail'
  const isEditMode = !!urlId && !isDetailMode
  const [form] = Form.useForm()
  const [loading, setLoading] = useState(false)

  /* ── 基礎信息 ── */
  const [detailFileList, setDetailFileList] = useState<UploadFile[]>([])
  const [status, setStatus] = useState<ServiceStatus>(ServiceStatus.ENABLED)

  const tAppOptions = useMemo(() => APP_OPTIONS.map(o => ({ label: o.labelKey, value: o.value })), [])
  const channelOptions = urlModule === 'groupBuy'
    ? [{ label: '團購到店', value: RecommendChannel.GROUP_BUY }]
    : [
        { label: '美食外賣', value: RecommendChannel.DELIVERY },
        { label: '超市百貨', value: RecommendChannel.SUPERMARKET },
      ]

  /* ── 銷售策略：預售天數 + 商家範圍 ── */
  const [presaleDays, setPresaleDays] = useState(7)
  const [merchantScope, setMerchantScope] = useState<MerchantScope>('all')
  const [selectedCategories, setSelectedCategories] = useState<string[]>([])
  const [whitelistMerchants, setWhitelistMerchants] = useState<Merchant[]>([])
  const [blacklistMerchants, setBlacklistMerchants] = useState<Merchant[]>([])
  const [categoryExcludeMerchants, setCategoryExcludeMerchants] = useState<Merchant[]>([])

  /* ── 時段價格配置（默認為空，需手動添加） ── */
  const [slots, setSlots] = useState<SlotConfig[]>([])
  const [customSeq, setCustomSeq] = useState(0)

  /* ── 按購買天數折扣 ── */
  const [daysDiscountEnabled, setDaysDiscountEnabled] = useState(false)
  const [daysDiscountTiers, setDaysDiscountTiers] = useState<DaysDiscountTier[]>([])

  /* ── 訂單退款 ── */
  const [refundEnabled, setRefundEnabled] = useState(false)
  const [cancelFeeRules, setCancelFeeRules] = useState<CancelFeeRule[]>([
    { id: 1, maxDays: 3, feePercent: 50 },
  ])

  /* ── 商家選擇彈窗 ── */
  const [dbMerchants, setDbMerchants] = useState<Merchant[]>([])
  const [merchantModalVisible, setMerchantModalVisible] = useState(false)
  const [merchantModalTarget, setMerchantModalTarget] = useState<MerchantScope | 'categoryExclude'>('whitelist')
  const [tempSelectedMerchants, setTempSelectedMerchants] = useState<Merchant[]>([])
  const [merchantSearchForm] = Form.useForm()
  const [merchantSearchValues, setMerchantSearchValues] = useState<{ groupKeyword?: string; storeKeyword?: string }>({})

  /* ── 加載門店（商家選擇用，含品類） ── */
  useEffect(() => {
    fetchStores({ page: 1, size: 500 })
      .then(res => setDbMerchants((res.records ?? []).map(s => ({
        id: s.storeCode,
        groupId: s.groupCode,
        groupName: s.groupName,
        storeId: s.storeCode,
        storeName: s.storeName,
        category: s.category ?? null,
      }))))
      .catch(() => { /* 靜默請求：錯誤不阻斷頁面 */ })
  }, [])

  /* ── 編輯/詳情模式：加載後端計價配置並回填 ── */
  useEffect(() => {
    if (!urlId) return
    setLoading(true)
    fetchAdTimeSlotPricingDetail(Number(urlId))
      .then(vo => {
        if (!vo) return
        const app = brandToAppType(vo.brand) ?? undefined
        form.setFieldsValue({ app, pricingName: vo.algoName || '', channel: vo.channel })
        setPresaleDays(vo.presaleDays ?? 7)
        setMerchantScope((vo.merchantScope as MerchantScope) || 'all')
        setSelectedCategories(parseJsonList<string>(vo.allowCategories))
        setWhitelistMerchants(parseJsonList(vo.whitelistMerchants).map(mapMerchant))
        setBlacklistMerchants(parseJsonList(vo.blacklistMerchants).map(mapMerchant))
        setCategoryExcludeMerchants(parseJsonList(vo.categoryExcludeMerchants).map(mapMerchant))
        setDaysDiscountEnabled(vo.daysDiscountEnabled === 1)
        setDaysDiscountTiers(parseJsonList<{ minDays?: number; discount?: number }>(vo.daysDiscountTiers)
          .map((t, i) => ({ id: i + 1, days: t.minDays, discount: t.discount })))
        setRefundEnabled(vo.refundEnabled === 1)
        setCancelFeeRules(parseJsonList<{ remainDays?: number; ratio?: number }>(vo.cancelFeeTiers)
          .map((f, i) => ({ id: i + 1, maxDays: f.remainDays ?? 0, feePercent: f.ratio ?? 0 })))
        setStatus((vo.status ?? ServiceStatus.ENABLED) as ServiceStatus)
        const loadedSlots: SlotConfig[] = (vo.slots ?? []).map(s => ({
          key: s.slotKey,
          preset: !s.slotKey.startsWith('custom'),
          name: s.slotName,
          timeRange: s.startTime && s.endTime ? [dayjs(s.startTime, HM), dayjs(s.endTime, HM)] as [Dayjs, Dayjs] : undefined,
          price: s.price,
          discountEnabled: !!s.discountEnabled,
          discount: s.discount ?? undefined,
          discountTimeMode: s.discountTimeMode ?? 'unlimited',
          discountStartDate: s.discountStartDate ?? undefined,
          discountEndDate: s.discountEndDate ?? undefined,
        }))
        setSlots(loadedSlots)
        // 自定義時段序號續到已載入最大值，避免新增自定義時 key 撞車
        const maxCustom = loadedSlots.reduce((mx, s) => {
          const m = /^custom-(\d+)$/.exec(s.key)
          return m ? Math.max(mx, Number(m[1])) : mx
        }, 0)
        setCustomSeq(maxCustom)
      })
      .catch(() => { /* 請求失敗保持空表單 */ })
      .finally(() => setLoading(false))
  }, [urlId, form])

  /* ── 集團 / 門店下拉選項（去重） ── */
  const groupOptions = useMemo(() => {
    const map = new Map<string, { label: string; value: string }>()
    dbMerchants.forEach(m => { if (!map.has(m.groupId)) map.set(m.groupId, { label: `${m.groupId} - ${m.groupName}`, value: m.groupId }) })
    return Array.from(map.values())
  }, [dbMerchants])
  const storeOptions = useMemo(() => {
    const map = new Map<string, { label: string; value: string }>()
    dbMerchants.forEach(m => { if (!map.has(m.storeId)) map.set(m.storeId, { label: `${m.storeId} - ${m.storeName}`, value: m.storeId }) })
    return Array.from(map.values())
  }, [dbMerchants])

  /* ── 商家列表（按搜索條件過濾；分類↔門店映射為第二階段數據模型，暫不過濾） ── */
  const filteredMerchants = useMemo(() => {
    return dbMerchants.filter(m => {
      if (merchantSearchValues.groupKeyword) {
        const kw = merchantSearchValues.groupKeyword.toLowerCase()
        if (!m.groupId.toLowerCase().includes(kw) && !m.groupName.toLowerCase().includes(kw)) return false
      }
      if (merchantSearchValues.storeKeyword) {
        const kw = merchantSearchValues.storeKeyword.toLowerCase()
        if (!m.storeId.toLowerCase().includes(kw) && !m.storeName.toLowerCase().includes(kw)) return false
      }
      return true
    })
  }, [dbMerchants, merchantSearchValues])

  /* ── 操作：基礎信息 ── */
  const handleBack = () => navigate(`/promotion-waterfall?type=${AlgorithmType.TIME_SLOT_AD}`)

  /* ── 操作：商家範圍 ── */
  const openMerchantModal = (target: MerchantScope | 'categoryExclude') => {
    if (target === 'categoryExclude' && selectedCategories.length === 0) {
      message.warning('請先選擇可購分類')
      return
    }
    setMerchantModalTarget(target)
    const current = target === 'whitelist' ? whitelistMerchants
      : target === 'blacklist' ? blacklistMerchants
      : categoryExcludeMerchants
    setTempSelectedMerchants([...current])
    merchantSearchForm.resetFields()
    setMerchantSearchValues({})
    setMerchantModalVisible(true)
  }

  const confirmMerchantModal = () => {
    if (merchantModalTarget === 'whitelist') setWhitelistMerchants(tempSelectedMerchants)
    else if (merchantModalTarget === 'blacklist') setBlacklistMerchants(tempSelectedMerchants)
    else setCategoryExcludeMerchants(tempSelectedMerchants)
    setMerchantModalVisible(false)
    message.success(`已選擇 ${tempSelectedMerchants.length} 個商家`)
  }

  const removeMerchant = (target: MerchantScope | 'categoryExclude', id: string) => {
    if (target === 'whitelist') setWhitelistMerchants(prev => prev.filter(m => m.id !== id))
    else if (target === 'blacklist') setBlacklistMerchants(prev => prev.filter(m => m.id !== id))
    else setCategoryExcludeMerchants(prev => prev.filter(m => m.id !== id))
  }

  /* ── 操作：時段配置 ── */
  const updateSlot = (key: string, patch: Partial<SlotConfig>) => {
    setSlots(prev => prev.map(s => (s.key === key ? { ...s, ...patch } : s)))
  }
  const addSlot = (typeKey: string) => {
    if (typeKey === 'custom') {
      const seq = customSeq + 1
      setCustomSeq(seq)
      setSlots(prev => [...prev, {
        key: `custom-${seq}`,
        preset: false,
        name: `自定義時段 ${seq}`,
        timeRange: undefined,
        price: undefined,
        discountEnabled: false,
        discount: undefined,
        discountTimeMode: 'unlimited',
      }])
      return
    }
    const preset = PRESET_SLOTS.find(s => s.key === typeKey)
    if (!preset) return
    if (slots.some(s => s.key === typeKey)) {
      message.warning(`「${preset.name}」時段已存在`)
      return
    }
    setSlots(prev => [...prev, {
      key: preset.key,
      preset: true,
      name: preset.name,
      timeRange: [dayjs(preset.range[0], HM), dayjs(preset.range[1], HM)] as [Dayjs, Dayjs],
      price: undefined,
      discountEnabled: false,
      discount: undefined,
      discountTimeMode: 'unlimited',
    }])
  }
  const removeSlot = (key: string) => setSlots(prev => prev.filter(s => s.key !== key))

  /* 折扣开关：关闭时一并清掉折扣值与限时周期，避免隐藏的残值被误当成已配置提交 */
  const toggleSlotDiscount = (key: string, checked: boolean) => updateSlot(key, checked
    ? { discountEnabled: true }
    : { discountEnabled: false, discount: undefined, discountTimeMode: 'unlimited', discountStartDate: undefined, discountEndDate: undefined })

  /* 限时开关：关掉限时即回到长期打折，周期同时清空不保留 */
  const toggleSlotDiscountLimited = (key: string, checked: boolean) => updateSlot(key, checked
    ? { discountTimeMode: 'limited' }
    : { discountTimeMode: 'unlimited', discountStartDate: undefined, discountEndDate: undefined })

  /* ── 操作：按天數折扣 ── */
  const toggleDaysDiscount = (checked: boolean) => {
    setDaysDiscountEnabled(checked)
    if (checked && daysDiscountTiers.length === 0) setDaysDiscountTiers([{ id: 1, days: undefined, discount: undefined }])
  }
  const addDaysTier = () => setDaysDiscountTiers(prev => [...prev, { id: prev.length ? Math.max(...prev.map(t => t.id)) + 1 : 1 }])
  const removeDaysTier = (id: number) => setDaysDiscountTiers(prev => prev.filter(t => t.id !== id))
  const updateDaysTier = (id: number, patch: Partial<DaysDiscountTier>) => setDaysDiscountTiers(prev => prev.map(t => (t.id === id ? { ...t, ...patch } : t)))

  /* ── 保存：校驗 → 構造 payload → 調用後端 create/update ── */
  const handleSubmit = async () => {
    try {
      const values = await form.validateFields()
      if (slots.length === 0) { message.error('請至少添加一個售卖時段'); return }
      for (const s of slots) {
        if (!s.timeRange) { message.error(`「${s.name}」請配置售卖時間段`); return }
        if (s.price == null || s.price <= 0) { message.error(`「${s.name}」請配置售卖價格`); return }
        if (s.discountEnabled && (s.discount == null || s.discount <= 0)) { message.error(`「${s.name}」請配置折扣`); return }
        if (isSlotLimited(s) && (!s.discountStartDate || !s.discountEndDate)) { message.error(`「${s.name}」已開啟限時折扣，請選擇折扣周期`); return }
      }
      if (daysDiscountEnabled) {
        for (let i = 0; i < daysDiscountTiers.length; i++) {
          if (!daysDiscountTiers[i].days || !daysDiscountTiers[i].discount) { message.error(`按天數折扣第 ${i + 1} 行請填寫完整`); return }
        }
      }

      const payload: AdPricingTimeSlotRequest = {
        algoName: values.pricingName,
        brand: appTypeToBrand(values.app),
        channel: values.channel,
        presaleDays,
        merchantScope,
        allowCategories: merchantScope === 'category' ? selectedCategories : [],
        whitelistMerchants: merchantScope === 'whitelist' ? whitelistMerchants.map(toMerchantPayload) : [],
        blacklistMerchants: merchantScope === 'blacklist' ? blacklistMerchants.map(toMerchantPayload) : [],
        categoryExcludeMerchants: merchantScope === 'category' ? categoryExcludeMerchants.map(toMerchantPayload) : [],
        daysDiscountEnabled,
        daysDiscountTiers: daysDiscountEnabled
          ? daysDiscountTiers.filter(t => t.days && t.discount).map(t => ({ minDays: t.days!, discount: t.discount! }))
          : [],
        refundEnabled: refundEnabled ? 1 : 2,
        cancelFeeTiers: refundEnabled ? cancelFeeRules.map(r => ({ remainDays: r.maxDays, ratio: r.feePercent })) : [],
        status,
        slots: slots.map(s => ({
          slotKey: s.key,
          slotName: s.name,
          startTime: s.timeRange?.[0]?.format(HM),
          endTime: s.timeRange?.[1]?.format(HM),
          price: s.price!,
          discountEnabled: s.discountEnabled,
          discount: s.discountEnabled ? s.discount : undefined,
          discountTimeMode: s.discountEnabled ? (s.discountTimeMode ?? 'unlimited') : 'unlimited',
          discountStartDate: isSlotLimited(s) ? s.discountStartDate : undefined,
          discountEndDate: isSlotLimited(s) ? s.discountEndDate : undefined,
        })),
      }

      setLoading(true)
      if (isEditMode) {
        await updateAdTimeSlotPricing(Number(urlId), payload)
      } else {
        await createAdTimeSlotPricing(payload)
      }
      message.success(isEditMode ? '編輯成功' : '新增成功')
      navigate(`/promotion-waterfall?type=${AlgorithmType.TIME_SLOT_AD}`)
    } catch (err) {
      if (err && typeof err === 'object' && 'errorFields' in err) return
      message.error(err instanceof Error ? err.message : '保存失敗，請稍後重試')
    } finally {
      setLoading(false)
    }
  }

  /* ── 渲染：已選商家標籤 ── */
  const renderMerchantTags = (target: MerchantScope | 'categoryExclude', list: Merchant[]) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
      <Button icon={<PlusOutlined />} onClick={() => openMerchantModal(target)} disabled={isDetailMode}>
        {list.length > 0 ? '管理商家' : '選擇商家'}
      </Button>
      {list.slice(0, 4).map(m => (
        <Tag key={m.id} color="blue" closable={!isDetailMode}
          onClose={(e) => { e.preventDefault(); removeMerchant(target, m.id) }} style={{ margin: 0 }}>
          {m.storeName}
        </Tag>
      ))}
      {list.length > 4 && (
        <Tag color="blue" style={{ margin: 0, cursor: isDetailMode ? 'default' : 'pointer' }}
          onClick={() => !isDetailMode && openMerchantModal(target)}>
          +{list.length - 4}
        </Tag>
      )}
      {list.length === 0 && <span style={{ fontSize: 12, color: 'var(--text-4)' }}>尚未選擇商家</span>}
    </div>
  )

  /* ── 渲染：單個時段行 ── */
  const renderSlotRow = (slot: SlotConfig) => (
    <div key={slot.key} style={{
      padding: 16, background: 'var(--surface-3)', borderRadius: 8, marginBottom: 12,
      border: '1px solid #ffe7ba',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
        {slot.preset ? (
          <Tag color="orange" style={{ fontSize: 13, padding: '2px 10px', margin: 0 }}>{slot.name}</Tag>
        ) : (
          <Input
            value={slot.name}
            disabled={isDetailMode}
            onChange={e => updateSlot(slot.key, { name: e.target.value })}
            style={{ width: 160 }}
            placeholder="時段名稱"
          />
        )}
        {!isDetailMode && (
          <Button type="text" danger size="small" icon={<DeleteOutlined />}
            style={{ marginLeft: 'auto' }} onClick={() => removeSlot(slot.key)}>刪除</Button>
        )}
      </div>
      {/* 四列并排：折扣周期与售卖时间段/价格/折扣同级，避免单独掉到第二排留大片空白；
          列宽不等分，日期区间最宽、折扣列次之（标签行带两个开关），未开限时时置灰而不隐藏以保证开关时布局不跳动 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr) minmax(0, 1.15fr) minmax(0, 1.45fr)', gap: 16 }}>
        <div>
          <div style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 4 }}>售卖時間段</div>
          <TimePicker.RangePicker
            format={HM}
            disabled={isDetailMode}
            value={slot.timeRange}
            onChange={(v) => updateSlot(slot.key, { timeRange: (v && v[0] && v[1]) ? [v[0], v[1]] : undefined })}
            style={{ width: '100%' }}
            placeholder={['開始時間', '結束時間']}
          />
        </div>
        <div>
          <div style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 4 }}>售卖價格</div>
          <InputNumber
            min={0} precision={2}
            disabled={isDetailMode}
            value={slot.price}
            onChange={v => updateSlot(slot.key, { price: v ?? undefined })}
            addonAfter="MOP"
            style={{ width: '100%' }}
            placeholder="請輸入價格"
          />
        </div>
        <div>
          <div style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 4 }}>
            <Space size={6}>
              <span>時段折扣</span>
              <Switch size="small" checked={slot.discountEnabled} disabled={isDetailMode}
                onChange={checked => toggleSlotDiscount(slot.key, checked)} />
              {/* 限时开关常驻（折扣未开时置灰）：不因为开启折扣才多出一个控件，避免标签行高度错位 */}
              <span style={{ color: slot.discountEnabled ? 'var(--text-2)' : 'var(--text-4)' }}>限時</span>
              <Switch size="small" checked={slot.discountTimeMode === 'limited'} disabled={isDetailMode || !slot.discountEnabled}
                onChange={checked => toggleSlotDiscountLimited(slot.key, checked)} />
            </Space>
          </div>
          <InputNumber
            min={0.1} max={10} precision={1}
            disabled={isDetailMode || !slot.discountEnabled}
            value={slot.discount}
            onChange={v => updateSlot(slot.key, { discount: v ?? undefined })}
            addonAfter="折"
            style={{ width: '100%' }}
            placeholder={slot.discountEnabled ? '如 9.5' : '未啟用'}
          />
        </div>
        <div>
          <div style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 4 }}>
            <Space size={4}>
              {isSlotLimited(slot) && <span style={{ color: 'var(--danger)' }}>*</span>}
              <span>折扣周期</span>
              <HelpPopover title="限時折扣周期口徑" ariaLabel="限時折扣周期口徑說明" placement="bottomRight" width={340}
                content={[
                  { tone: 'info', label: '開啟限時', body: '折扣僅在所選日期區間内的訂單生效，區間外按原價售賣。' },
                  { tone: 'neutral', label: '關閉限時', body: '折扣長期有效，售賣期内全程按折後價計算。' },
                ]} />
            </Space>
          </div>
          <DatePicker.RangePicker
            style={{ width: '100%' }}
            format={DATE_FMT}
            disabled={isDetailMode || !isSlotLimited(slot)}
            value={toPeriodValue(slot.discountStartDate, slot.discountEndDate)}
            onChange={(_, dateStrings) => updateSlot(slot.key, {
              discountStartDate: dateStrings[0] || undefined,
              discountEndDate: dateStrings[1] || undefined,
            })}
            placeholder={isSlotLimited(slot) ? ['開始日期', '結束日期'] : ['未啟用', '未啟用']} />
        </div>
      </div>
    </div>
  )

  const slotCount = slots.length

  return (
    <div className="content-area">
      {/* ── 頂部標題欄（與其它廣告類型定價頁一致） ── */}
      <div style={{
        position: 'relative', background: 'var(--surface-2)', marginBottom: 16,
        borderRadius: 12, boxShadow: '0 2px 12px rgba(0,0,0,0.06)', overflow: 'hidden',
      }}>
        <div style={{
          height: 3, background: 'linear-gradient(90deg, #E8720C, #F59432, #FFB347, #F59432, #E8720C)',
          backgroundSize: '200% 100%', animation: 'headerGradientShift 4s ease infinite',
        }} />
        <div style={{
          padding: '16px 24px', display: 'flex', alignItems: 'center',
          justifyContent: 'space-between', animation: 'headerFadeSlideIn 0.5s ease',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <Button type="primary" icon={<ArrowLeftOutlined />} onClick={handleBack}
              style={{
                backgroundColor: 'var(--brand)', borderColor: 'var(--brand)',
                borderRadius: 8, height: 36, padding: '0 16px',
                display: 'flex', alignItems: 'center', gap: 6,
                boxShadow: '0 2px 6px rgba(232,114,12,0.25)',
                transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
              }}>{'返回'}</Button>
            <div style={{ width: 1, height: 20, background: '#E8E8E8' }} />
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: 'var(--info)' }}>
                {isDetailMode ? '定價詳情' : isEditMode ? '編輯定價' : '新增定價'}
              </h2>
              <span style={{ fontSize: 14, color: 'var(--text-2)' }}>⏰ 時段推薦廣告</span>
            </div>
          </div>
        </div>
      </div>

      <Form form={form} layout="vertical" disabled={isDetailMode}>
        {/* ── 1. 基礎信息 ── */}
        <div style={cardShellStyle}>
          {cardTitle(<ShopOutlined style={{ fontSize: 14, color: 'var(--info)' }} />, '#E6F7FF', '基礎信息')}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
            <Form.Item label="所屬品牌" name="app" rules={[{ required: true, message: '請選擇品牌' }]}>
              <Select disabled={isEditMode || isDetailMode} placeholder="請選擇" options={tAppOptions} />
            </Form.Item>
            <Form.Item label="時段推薦名稱" name="pricingName" rules={[{ required: true, message: '請輸入時段推薦名稱' }]}>
              <Input placeholder="請輸入時段推薦名稱" maxLength={30} showCount disabled={isEditMode || isDetailMode} />
            </Form.Item>
            <Form.Item label="業務頻道" name="channel" rules={[{ required: true, message: '請選擇業務頻道' }]}>
              <Select placeholder="請選擇" options={channelOptions} disabled={isEditMode || isDetailMode} />
            </Form.Item>
          </div>
          <Form.Item label="詳情圖" style={{ marginBottom: 0, marginTop: 8 }}>
            <Upload disabled={isDetailMode} listType="picture-card" fileList={detailFileList}
              onChange={({ fileList }) => setDetailFileList(fileList)} beforeUpload={() => false}>
              {detailFileList.length < 1 && (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
                  <PlusOutlined style={{ fontSize: 20 }} />
                  <span style={{ fontSize: 12, color: 'var(--text-3)' }}>上傳詳情圖</span>
                </div>
              )}
            </Upload>
          </Form.Item>
        </div>

        {/* ── 2. 銷售策略（預售天數 + 商家範圍） ── */}
        <div style={cardShellStyle}>
          {cardTitle(<CalendarOutlined style={{ fontSize: 14, color: 'var(--warning)' }} />, '#FFF7E6', '銷售策略',
            <Tag color="orange" style={{ marginLeft: 4, fontSize: 11 }}>策略配置</Tag>)}

          {/* 預售天數 */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
            <span style={{ fontSize: 13, color: 'var(--text-2)', minWidth: 72 }}>預售天數:</span>
            <InputNumber min={1} max={90} precision={0} value={presaleDays} disabled={isDetailMode}
              onChange={v => setPresaleDays(v || 7)} addonAfter="天" style={{ width: 160 }} />
            <span style={{ fontSize: 12, color: 'var(--text-3)' }}>
              系統持續銷售 {presaleDays} 天內的時段廣告，每過一天自動補充一天，循環銷售
            </span>
          </div>

          {/* 商家可購範圍 */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
            <span style={{ fontSize: 13, color: 'var(--text-2)', flexShrink: 0 }}>商家可購範圍:</span>
            <Radio.Group
              optionType="button" buttonStyle="solid"
              value={merchantScope} disabled={isDetailMode}
              onChange={e => setMerchantScope(e.target.value as MerchantScope)}
              options={SCOPE_OPTIONS}
            />
          </div>

          {/* 指定商家可購 */}
          {merchantScope === 'whitelist' && (
            <div style={{ padding: 16, background: 'var(--surface-3)', borderRadius: 8 }}>
              <div style={{ fontSize: 13, color: 'var(--text-2)', marginBottom: 10 }}>
                <TeamOutlined style={{ marginRight: 6, color: 'var(--success)' }} />
                僅以下商家可購買此時段廣告：
              </div>
              {renderMerchantTags('whitelist', whitelistMerchants)}
            </div>
          )}

          {/* 指定商家不可購 */}
          {merchantScope === 'blacklist' && (
            <div style={{ padding: 16, background: 'var(--surface-3)', borderRadius: 8 }}>
              <div style={{ fontSize: 13, color: 'var(--text-2)', marginBottom: 10 }}>
                <TeamOutlined style={{ marginRight: 6, color: 'var(--danger)' }} />
                除以下商家外，其餘商家均可購買：
              </div>
              {renderMerchantTags('blacklist', blacklistMerchants)}
            </div>
          )}

          {/* 指定分類商家可購（+ 分類下再排除指定商家） */}
          {merchantScope === 'category' && (
            <div style={{ padding: 16, background: 'var(--surface-3)', borderRadius: 8 }}>
              <div style={{ fontSize: 13, color: 'var(--text-2)', marginBottom: 8 }}>
                <TeamOutlined style={{ marginRight: 6, color: 'var(--success)' }} />可購分類（該分類下商家均可購買）:
              </div>
              <Select
                mode="multiple" allowClear style={{ width: '100%', marginBottom: 16 }}
                placeholder="請選擇可購分類"
                disabled={isDetailMode}
                value={selectedCategories}
                onChange={(v) => setSelectedCategories(v)}
                options={AD_MERCHANT_CATEGORIES}
              />
              {selectedCategories.length > 0 && (
                <>
                  <div style={{ fontSize: 13, color: 'var(--text-2)', marginBottom: 8 }}>
                    <span style={{ color: 'var(--danger)' }}>分類內排除商家（可選，選中的商家即使在可購分類下也不可購買）:</span>
                  </div>
                  {renderMerchantTags('categoryExclude', categoryExcludeMerchants)}
                </>
              )}
            </div>
          )}
        </div>

        {/* ── 3. 時段價格配置 ── */}
        <div style={cardShellStyle}>
          {cardTitle(<ClockCircleOutlined style={{ fontSize: 14, color: 'var(--info)' }} />, '#E6F7FF', '時段價格配置',
            <Tag color="blue" style={{ marginLeft: 4, fontSize: 11 }}>共 {slotCount} 個時段</Tag>,
            !isDetailMode && (
              <Dropdown
                menu={{
                  items: [
                    ...PRESET_SLOTS.map(s => ({ key: s.key, label: s.name })),
                    { key: 'custom', label: '自定義' },
                  ],
                  onClick: ({ key }) => addSlot(key),
                }}
                trigger={['click']}
              >
                <Button type="primary" size="small" icon={<PlusOutlined />} style={{ borderRadius: 6 }}>
                  添加時段 <DownOutlined />
                </Button>
              </Dropdown>
            ))}
          <div style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 12 }}>
            時段默認為空，需手動添加；可選 早餐/午餐/下午茶/晚餐/宵夜/自定義，自定義可自由命名；每個時段配置售卖時間段（如 06:30-10:30）、售卖價格與時段折扣，均支持刪除。時段折扣可選限時：開啟限時後需選折扣周期（日期區間），區間外按原價售賣；不開限時則折扣長期有效。
          </div>
          {slots.length === 0 ? (
            <div style={{ padding: 24, textAlign: 'center', background: 'var(--surface-3)', borderRadius: 8, border: '1px dashed #d9d9d9' }}>
              <span style={{ fontSize: 13, color: 'var(--text-3)' }}>暫無時段，請點擊右上角「添加時段」新增</span>
            </div>
          ) : slots.map(renderSlotRow)}
        </div>

        {/* ── 4. 按購買天數折扣（每天都有買，不限任何時段） ── */}
        <div style={cardShellStyle}>
          {cardTitle(<PercentageOutlined style={{ fontSize: 14, color: 'var(--purple)' }} />, '#F9F0FF', '按購買天數折扣',
            <span style={{ fontSize: 12, color: 'var(--text-3)', marginLeft: 4 }}>連續購買多天（不限時段）享折扣</span>,
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Switch size="small" checked={daysDiscountEnabled} disabled={isDetailMode} onChange={toggleDaysDiscount} />
              {daysDiscountEnabled && !isDetailMode && (
                <Button type="primary" size="small" icon={<PlusOutlined />} onClick={addDaysTier} style={{ borderRadius: 6 }}>添加梯度</Button>
              )}
            </div>)}
          {!daysDiscountEnabled ? (
            <div style={{ padding: 24, textAlign: 'center', background: 'var(--surface-3)', borderRadius: 8, border: '1px dashed #d9d9d9' }}>
              <span style={{ fontSize: 13, color: 'var(--text-3)' }}>未啟用按天數折扣，商家購買多天無折扣優惠</span>
            </div>
          ) : daysDiscountTiers.length === 0 ? (
            <div style={{ padding: 24, textAlign: 'center', background: 'var(--surface-3)', borderRadius: 8, border: '1px dashed #d9d9d9' }}>
              <span style={{ fontSize: 13, color: 'var(--text-3)' }}>暫無折扣梯度，點擊右上角「添加梯度」</span>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {daysDiscountTiers.map((tier, idx) => (
                <div key={tier.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: 12, background: 'var(--surface-3)', borderRadius: 6 }}>
                  <Tag color="purple">梯度 {idx + 1}</Tag>
                  <span style={{ fontSize: 13, color: 'var(--text-2)' }}>購買 ≥</span>
                  <InputNumber min={1} max={9999} precision={0} placeholder="天數" style={{ width: 110 }}
                    value={tier.days} disabled={isDetailMode} onChange={v => updateDaysTier(tier.id, { days: v ?? undefined })} />
                  <span style={{ fontSize: 13, color: 'var(--text-2)' }}>天，享</span>
                  <InputNumber min={0.1} max={10} precision={1} placeholder="折扣" style={{ width: 120 }} addonAfter="折"
                    value={tier.discount} disabled={isDetailMode} onChange={v => updateDaysTier(tier.id, { discount: v ?? undefined })} />
                  {tier.days && tier.discount && (
                    <span style={{ fontSize: 12, color: 'var(--text-3)' }}>即買 {tier.days} 天享 {tier.discount} 折</span>
                  )}
                  {!isDetailMode && (
                    <Button type="link" danger size="small" icon={<DeleteOutlined />} style={{ marginLeft: 'auto' }}
                      onClick={() => removeDaysTier(tier.id)}>刪除</Button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── 5. 訂單退款配置 ── */}
        <div style={cardShellStyle}>
          {cardTitle(<SettingOutlined style={{ fontSize: 14, color: '#f5222d' }} />, '#FFF1F0', '訂單退款配置',
            <span style={{ fontSize: 12, color: 'var(--text-3)', marginLeft: 4 }}>配置未使用天數的退費比例</span>,
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 13, color: refundEnabled ? 'var(--success)' : 'var(--text-3)' }}>
                {refundEnabled ? '允許退款' : '不允許退款'}
              </span>
              <Switch size="small" checked={refundEnabled} disabled={isDetailMode} onChange={setRefundEnabled}
                style={{ background: refundEnabled ? '#52C41A' : '#D9D9D9' }} />
            </div>)}
          {refundEnabled ? (
            <Table
              rowKey="id" dataSource={cancelFeeRules} pagination={false} bordered size="small"
              columns={[
                {
                  title: '廣告推広', dataIndex: 'maxDays', width: 240,
                  render: (_, record: CancelFeeRule) => (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ fontSize: 13, color: 'var(--text-2)', whiteSpace: 'nowrap' }}>剩餘天數 ≤</span>
                      <InputNumber disabled={isDetailMode} min={0} max={999}
                        value={record.maxDays === 999 ? undefined : record.maxDays}
                        onChange={val => setCancelFeeRules(prev => prev.map(r => r.id === record.id ? { ...r, maxDays: val ?? 0 } : r))}
                        addonAfter={record.maxDays === 999 ? '' : '天'}
                        placeholder={record.maxDays === 999 ? '不限' : ''} style={{ flex: 1 }} />
                    </div>
                  ),
                },
                {
                  title: '退費比例', dataIndex: 'feePercent', width: 160,
                  render: (_, record: CancelFeeRule) => (
                    <InputNumber disabled={isDetailMode} min={0} max={100} value={record.feePercent}
                      onChange={val => setCancelFeeRules(prev => prev.map(r => r.id === record.id ? { ...r, feePercent: val ?? 0 } : r))}
                      addonAfter="%" style={{ width: '100%' }} />
                  ),
                },
                {
                  title: '操作', width: 120, align: 'center',
                  render: (_: unknown, record: CancelFeeRule) => {
                    if (isDetailMode) return <span style={{ color: 'var(--text-4)' }}>—</span>
                    const isLastRow = cancelFeeRules[cancelFeeRules.length - 1]?.id === record.id
                    return (
                      <Space size={4}>
                        {isLastRow && (
                          <Button type="link" size="small" onClick={() => {
                            const nextId = cancelFeeRules.length ? Math.max(...cancelFeeRules.map(r => r.id)) + 1 : 1
                            setCancelFeeRules(prev => [...prev, { id: nextId, maxDays: 0, feePercent: 50 }])
                          }}>添加檔位</Button>
                        )}
                        <Button type="link" size="small" danger onClick={() => {
                          if (cancelFeeRules.length <= 1) { message.warning('至少保留一條退款規則'); return }
                          setCancelFeeRules(prev => prev.filter(r => r.id !== record.id))
                        }}>刪除</Button>
                      </Space>
                    )
                  },
                },
              ]}
            />
          ) : (
            <div style={{ padding: 24, textAlign: 'center', background: 'var(--surface-3)', borderRadius: 8, border: '1px dashed #d9d9d9' }}>
              <span style={{ fontSize: 13, color: 'var(--text-3)' }}>不允許退款：訂單一旦支付成功不支持退費</span>
            </div>
          )}
        </div>

        {/* ── 6. 狀態設置 ── */}
        <div style={cardShellStyle}>
          {cardTitle(<CheckCircleOutlined style={{ fontSize: 14, color: 'var(--success)' }} />, '#F6FFED', '狀態設置')}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 13, color: 'var(--text-2)' }}>上架狀態:</span>
            <Switch checked={status === ServiceStatus.ENABLED} disabled={isDetailMode}
              onChange={checked => setStatus(checked ? ServiceStatus.ENABLED : ServiceStatus.DISABLED)}
              checkedChildren="啟用" unCheckedChildren="停用" />
            <span style={{ fontSize: 12, color: 'var(--text-3)' }}>停用後該定價不再對商家展示與售卖</span>
          </div>
        </div>
      </Form>

      {/* ── 底部操作欄 ── */}
      {!isDetailMode && (
        <div className="form-footer">
          <Button onClick={handleBack}>取消</Button>
          <Button type="primary" icon={<SaveOutlined />} loading={loading} onClick={handleSubmit}>保存</Button>
        </div>
      )}

      {/* ── 商家選擇彈窗 ── */}
      <Modal
        title={
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 24, height: 24, borderRadius: 6, background: 'var(--info-soft)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <ShopOutlined style={{ fontSize: 12, color: 'var(--info)' }} />
            </div>
            <span style={{ fontSize: 16, fontWeight: 600, color: 'var(--info)' }}>
              {merchantModalTarget === 'whitelist' ? '選擇可購商家'
                : merchantModalTarget === 'blacklist' ? '選擇不可購商家' : '選擇分類下不可購商家'}
            </span>
          </div>
        }
        open={merchantModalVisible}
        onCancel={() => setMerchantModalVisible(false)}
        onOk={confirmMerchantModal}
        okText="確認選擇" cancelText="取消" width={820} destroyOnClose
      >
        <div className="search-section">
          <Form form={merchantSearchForm} layout="inline" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
            <Form.Item label="集團" name="groupKeyword">
              <Select showSearch allowClear placeholder="搜索集團ID/名稱" options={groupOptions}
                filterOption={(input, option) => (option?.label ?? '').toLowerCase().includes(input.toLowerCase())} />
            </Form.Item>
            <Form.Item label="門店" name="storeKeyword">
              <Select showSearch allowClear placeholder="搜索門店ID/名稱" options={storeOptions}
                filterOption={(input, option) => (option?.label ?? '').toLowerCase().includes(input.toLowerCase())} />
            </Form.Item>
            <Form.Item>
              <div className="search-actions">
                <Button type="primary" onClick={() => setMerchantSearchValues(merchantSearchForm.getFieldsValue() || {})}>搜索</Button>
                <Button onClick={() => { merchantSearchForm.resetFields(); setMerchantSearchValues({}) }}>重置</Button>
              </div>
            </Form.Item>
          </Form>
        </div>

        {tempSelectedMerchants.length > 0 && (
          <div style={{ marginBottom: 12, padding: '6px 12px', background: 'var(--success-soft)', borderRadius: 6, border: '1px solid #b7eb8f', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 12, color: 'var(--success)', fontWeight: 500 }}>已選 {tempSelectedMerchants.length} 個商家</span>
            <Space size={4} wrap>
              {tempSelectedMerchants.slice(0, 5).map(m => (
                <Tag key={m.id} color="blue" closable style={{ margin: 0 }}
                  onClose={(e) => { e.preventDefault(); setTempSelectedMerchants(tempSelectedMerchants.filter(s => s.id !== m.id)) }}>
                  {m.storeName}
                </Tag>
              ))}
              {tempSelectedMerchants.length > 5 && <Tag color="blue" style={{ margin: 0 }}>+{tempSelectedMerchants.length - 5}</Tag>}
            </Space>
          </div>
        )}

        <Table
          rowKey="id" dataSource={filteredMerchants} size="small" scroll={{ y: 360 }}
          pagination={{ pageSize: 10, showSizeChanger: true, pageSizeOptions: ['10', '20', '50'], size: 'small', showTotal: (total) => `共 ${total} 條` }}
          rowSelection={{
            type: 'checkbox', preserveSelectedRowKeys: true,
            selectedRowKeys: tempSelectedMerchants.map(m => m.id),
            onChange: (_keys, rows) => setTempSelectedMerchants(rows.filter(Boolean)),
          }}
          columns={[
            { title: '集團ID', dataIndex: 'groupId', width: 100 },
            { title: '集團名稱', dataIndex: 'groupName', width: 140 },
            { title: '門店ID', dataIndex: 'storeId', width: 100 },
            { title: '門店名稱', dataIndex: 'storeName' },
            { title: '品類', dataIndex: 'category', width: 100, render: (v: string) => storeCategoryLabel(v) ?? '-' },
          ]}
        />
      </Modal>
    </div>
  )
}
