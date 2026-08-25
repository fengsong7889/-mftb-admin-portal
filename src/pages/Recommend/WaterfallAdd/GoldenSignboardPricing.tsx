/**
 * 金字招牌 - 定價配置（新增/編輯/詳情）
 *
 * 業務背景：金字招牌按標籤類型分別定價，每種標籤（熱門/人氣/銷量/好評/復購/收藏/顧客數）
 * 可獨立配置售價、梯度折扣。部分標籤若採用按月計算資格，則僅能購買當月；
 * 否則根據預售天數配置限制可購買天數。
 *
 * 基礎信息從算法庫已配置的金字招牌數據獲取（Select 選擇算法 → 自動帶出品牌/頻道）。
 * 標籤定價展示所有標籤類型，算法庫未配置的標籤置灰禁用並提示用戶先去算法庫配置。
 */
import { useMemo, useState, useEffect } from 'react'
import { Button, Form, InputNumber, Select, Space, Switch, Table, Tag, Upload, message } from 'antd'
import type { UploadFile } from 'antd'
import {
  ArrowLeftOutlined,
  SaveOutlined,
  PlusOutlined,
  DeleteOutlined,
  ShopOutlined,
  TrophyOutlined,
  PercentageOutlined,
  SettingOutlined,
  CheckCircleOutlined,
  CalendarOutlined,
} from '@ant-design/icons'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  AlgorithmType,
  AppType,
  RecommendChannel,
  ServiceStatus,
  APP_OPTIONS,
} from '../constants'
import {
  fetchAdAlgorithms,
  appTypeToBrand,
  brandToAppType,
  fetchAdSignboardPricingDetail,
  createAdSignboardPricing,
  updateAdSignboardPricing,
  fetchAdSignboardPricingList,
} from '../../../api/adPromotion'

/* ──────────────── 常量 ──────────────── */

/** 招牌標籤類型（與 AlgorithmAdd.tsx 保持一致） */
const SIGNBOARD_LABELS = [
  { value: 'hot', label: '熱門', icon: '🔥', color: '#FF4D4F', bg: '#FFF1F0', border: '#FFCCC7' },
  { value: 'popular', label: '人氣', icon: '👑', color: '#FAAD14', bg: '#FFFBE6', border: '#FFE58F' },
  { value: 'sales', label: '銷量', icon: '📈', color: '#1890FF', bg: '#E6F7FF', border: '#91D5FF' },
  { value: 'rating', label: '好評', icon: '⭐', color: '#52C41A', bg: '#F6FFED', border: '#B7EB8F' },
  { value: 'repurchase', label: '復購', icon: '🔄', color: '#722ED1', bg: '#F9F0FF', border: '#D3ADF7' },
  { value: 'favorites', label: '收藏', icon: '❤️', color: '#EB2F96', bg: '#FFF0F6', border: '#FFADD2' },
  { value: 'customers', label: '顧客數', icon: '👥', color: '#13C2C2', bg: '#E6FFFB', border: '#87E8DE' },
] as const

type LabelValue = typeof SIGNBOARD_LABELS[number]['value']

/** 對比類標籤：按全澳/商圈兩個場景定價 */
const COMPARISON_LABELS = ['hot', 'popular', 'sales', 'rating', 'repurchase']
/** 統計類標籤：全量數據門檻，無場景 */
const AGGREGATE_LABELS = ['favorites', 'customers']
/** 場景定義（與 AlgorithmAdd.tsx 保持一致） */
const SCENARIO_DEFS = [
  { key: 'allMacau', apiValue: 'all_macau', label: '全澳對比', icon: '🌏', color: '#E8720C', bg: '#FFF7E6', border: '#FFD591' },
  { key: 'district', apiValue: 'district', label: '商圈對比', icon: '🏙️', color: '#1890FF', bg: '#E6F7FF', border: '#91D5FF' },
] as const

const isComparisonLabel = (v: string) => COMPARISON_LABELS.includes(v)

/** 折扣模式：全局（所有標籤共用）/ 局部（每個標籤獨立） */
type DiscountMode = 'global' | 'local'

/** 按天梯度折扣 */
interface LabelDiscountTier {
  days: number | undefined
  discount: number | undefined
}

/** 退費比例規則 */
interface CancelFeeRule {
  id: number
  maxDays: number
  feePercent: number
}

/* ──────────────── 工具函數 ──────────────── */

const svgDataUrl = (svg: string) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
const MOCK_DETAIL_IMAGE = svgDataUrl(
  `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300" viewBox="0 0 400 300">`
  + `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#E8720C"/><stop offset="1" stop-color="#FFB347"/></linearGradient></defs>`
  + `<rect width="400" height="300" fill="url(#g)"/>`
  + `<text x="200" y="145" font-size="52" text-anchor="middle" font-family="PingFang SC, sans-serif">\u{1F3C5}</text>`
  + `<text x="200" y="200" font-size="24" font-weight="700" fill="#fff" text-anchor="middle" font-family="PingFang SC, sans-serif">金字招牌詳情圖</text>`
  + `</svg>`,
)

const getLabelConfig = (v: string) => SIGNBOARD_LABELS.find(l => l.value === v) ?? SIGNBOARD_LABELS[0]

/* ──────────────── 組件 ──────────────── */

export default function GoldenSignboardPricing() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const urlModule = searchParams.get('module') || 'delivery'
  const urlId = searchParams.get('id') || ''
  const isDetailMode = searchParams.get('mode') === 'detail'
  const isEditMode = !!urlId && !isDetailMode
  const [form] = Form.useForm()
  const [loading, setLoading] = useState(false)

  /* ── 狀態 ── */
  const [status, setStatus] = useState<ServiceStatus>(ServiceStatus.ENABLED)
  const [detailFileList, setDetailFileList] = useState<UploadFile[]>([])
  const [activeTab, setActiveTab] = useState<LabelValue>('hot')

  // 算法庫下拉（金字招牌 algoType=13）
  const [algorithmSelectOptions, setAlgorithmSelectOptions] = useState<{ id: number; name: string; app: AppType; signboardLabels: string[]; labelScenarios: Record<string, string[]> }[]>([])
  const [selectedAlgorithmInfo, setSelectedAlgorithmInfo] = useState<{ id: number; name: string } | null>(null)

  // 算法配置的標籤列表（從 params.signboardItems 解析）
  const [configuredLabels, setConfiguredLabels] = useState<LabelValue[]>([])
  // 每個標籤啟用的場景列表（從算法配置解析）
  const [labelScenarios, setLabelScenarios] = useState<Record<string, string[]>>({})

  // 各標籤售價（MOP/天）。key 為複合鍵：對比類 'labelType:scenario'，統計類 'labelType'
  const [labelPrices, setLabelPrices] = useState<Record<string, number | undefined>>({})
  // 各標籤梯度折扣開關
  const [labelGradientEnabled, setLabelGradientEnabled] = useState<Record<string, boolean>>({})
  // 各標籤梯度折扣
  const [labelDiscounts, setLabelDiscounts] = useState<Record<string, LabelDiscountTier[]>>({})

  // 折扣模式：全局（所有標籤共用同一梯度）/ 局部（每個標籤獨立配置）
  const [discountMode, setDiscountMode] = useState<DiscountMode>('local')
  const [globalDiscountTiers, setGlobalDiscountTiers] = useState<LabelDiscountTier[]>([])
  const [globalDiscountEnabled, setGlobalDiscountEnabled] = useState(false)

  // 銷售策略
  const [presaleDays, setPresaleDays] = useState(7)
  // 退款配置
  const [refundEnabled, setRefundEnabled] = useState(false)
  const [cancelFeeRules, setCancelFeeRules] = useState<CancelFeeRule[]>([
    { id: 1, maxDays: 3, feePercent: 50 },
  ])

  /* ── 多語言選項 ── */
  const tAppOptions = useMemo(() => APP_OPTIONS.map(o => ({ label: t(o.labelKey), value: o.value })), [t])
  const channelOptions = urlModule === 'groupBuy'
    ? [{ label: t('recommend.channelGroupBuyName'), value: RecommendChannel.GROUP_BUY }]
    : [
        { label: t('recommend.channelDeliveryName'), value: RecommendChannel.DELIVERY },
        { label: t('recommend.channelSupermarketName'), value: RecommendChannel.SUPERMARKET },
      ]

  /* ── 加載算法庫（金字招牌類型） ── */
  useEffect(() => {
    fetchAdAlgorithms({ page: 1, size: 200, status: ServiceStatus.ENABLED, algoType: AlgorithmType.GOLDEN_SIGNBOARD } as Parameters<typeof fetchAdAlgorithms>[0])
      .then(res => {
        const opts = (res.records ?? []).filter(a => a.updatedBy !== '系統').map(a => {
          // 解析 params 獲取配置的標籤列表及場景信息
          let signboardLabels: string[] = []
          const labelScenariosMap: Record<string, string[]> = {}
          try {
            const params = a.params ? JSON.parse(a.params) : {}
            if (Array.isArray(params.signboardItems)) {
              signboardLabels = params.signboardItems
                .filter((item: { labelType?: string; enabled?: boolean }) =>
                  item.labelType && item.enabled === true)
                .map((item: { labelType: string }) => item.labelType)
              // 解析每個對比類標籤啟用的場景
              params.signboardItems
                .filter((item: { labelType?: string; enabled?: boolean }) =>
                  item.labelType && item.enabled === true)
                .forEach((item: { labelType: string; scenarios?: Record<string, { enabled?: boolean }> }) => {
                  if (COMPARISON_LABELS.includes(item.labelType)) {
                    if (item.scenarios && typeof item.scenarios === 'object') {
                      labelScenariosMap[item.labelType] = SCENARIO_DEFS
                        .filter(d => item.scenarios?.[d.key]?.enabled)
                        .map(d => d.apiValue)
                    } else {
                      // 舊算法配置無 scenarios 字段，視為全部場景啟用
                      labelScenariosMap[item.labelType] = SCENARIO_DEFS.map(d => d.apiValue)
                    }
                  }
                })
            }
          } catch { /* ignore */ }
          return {
            id: a.id ?? 0,
            name: a.algoName,
            app: (brandToAppType(a.brand) ?? AppType.SHANFENG) as AppType,
            signboardLabels,
            labelScenarios: labelScenariosMap,
          }
        })
        if (opts.length > 0) setAlgorithmSelectOptions(opts)
      })
      .catch(() => { /* 靜默請求：錯誤不阻斷頁面 */ })
  }, [])

  /* ── 編輯/詳情回填 ── */
  useEffect(() => {
    if (!urlId) return
    setLoading(true)
    fetchAdSignboardPricingDetail(Number(urlId))
      .then(data => {
        if (!data) return
        // 回填算法信息
        if (data.algoId) {
          setSelectedAlgorithmInfo({ id: data.algoId, name: data.algoName || '' })
          form.setFieldsValue({ algorithmId: data.algoId, app: brandToAppType(data.brand), channel: data.channel })
        }
        if (data.presaleDays) setPresaleDays(data.presaleDays)
        if (data.refundEnabled === 1) setRefundEnabled(true)
        if (data.cancelFeeTiers) {
          try {
            const tiers = JSON.parse(data.cancelFeeTiers as string)
            if (Array.isArray(tiers) && tiers.length > 0) {
              setCancelFeeRules(tiers.map((t: { remainDays?: number; ratio?: number }, i: number) => ({
                id: i + 1, maxDays: t.remainDays ?? 0, feePercent: t.ratio ?? 0,
              })))
            }
          } catch { /* ignore */ }
        }
        if (data.status) setStatus(data.status as ServiceStatus)
        // 回填折扣模式
        if (data.discountMode) setDiscountMode(data.discountMode as DiscountMode)
        if (data.globalDiscountTiers) {
          try {
            const gt = JSON.parse(data.globalDiscountTiers as string)
            if (Array.isArray(gt) && gt.length > 0) {
              setGlobalDiscountEnabled(true)
              setGlobalDiscountTiers(gt.map((g: { minDays?: number; discount?: number }) => ({
                days: g.minDays, discount: g.discount,
              })))
            }
          } catch { /* ignore */ }
        }
        // 回填標籤定價
        if (data.signboardItems?.length) {
          const enabledLabels: string[] = []
          const prices: Record<string, number | undefined> = {}
          const gradientOn: Record<string, boolean> = {}
          const discounts: Record<string, LabelDiscountTier[]> = {}
          const scenariosMap: Record<string, string[]> = {}
          for (const item of data.signboardItems) {
            enabledLabels.push(item.labelType)
            // 計算複合鍵：對比類舊數據（scenario=NULL）歸入 all_macau
            let stateKey: string
            if (COMPARISON_LABELS.includes(item.labelType)) {
              stateKey = `${item.labelType}:${item.scenario || 'all_macau'}`
              // 回填場景：對比類標籤需要記錄場景列表
              if (item.scenario) {
                if (!scenariosMap[item.labelType]) {
                  scenariosMap[item.labelType] = []
                }
                if (!scenariosMap[item.labelType].includes(item.scenario)) {
                  scenariosMap[item.labelType].push(item.scenario)
                }
              }
            } else {
              stateKey = item.labelType
            }
            prices[stateKey] = item.price
            // 折扣梯度按標籤維度存儲（非場景維度），同一標籤各場景共用
            if (item.discountTiers && !gradientOn[item.labelType]) {
              try {
                const tiers = JSON.parse(item.discountTiers as string)
                if (Array.isArray(tiers) && tiers.length > 0) {
                  gradientOn[item.labelType] = true
                  discounts[item.labelType] = tiers.map((g: { minDays?: number; discount?: number }) => ({
                    days: g.minDays, discount: g.discount,
                  }))
                }
              } catch { /* ignore */ }
            }
          }
          setConfiguredLabels([...new Set(enabledLabels)] as LabelValue[])
          setLabelPrices(prices)
          setLabelGradientEnabled(gradientOn)
          setLabelDiscounts(discounts)
          // 回填場景狀態
          if (Object.keys(scenariosMap).length > 0) {
            setLabelScenarios(scenariosMap)
          }
          const uniqueLabels = [...new Set(enabledLabels)]
          if (uniqueLabels.length > 0) setActiveTab(uniqueLabels[0] as LabelValue)
        }
      })
      .catch(() => { /* 請求失敗保持空表單 */ })
      .finally(() => setLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlId, form])

  /* ── 操作函數 ── */

  const handleBack = () => {
    navigate(`/promotion-waterfall?type=${AlgorithmType.GOLDEN_SIGNBOARD}`)
  }

  /** 選擇算法後：自動帶出品牌 + 解析配置的標籤 */
  const handleAlgorithmChange = (algoId: number) => {
    const alg = algorithmSelectOptions.find(a => a.id === algoId)
    if (!alg) return
    setSelectedAlgorithmInfo({ id: alg.id, name: alg.name })
    // 自動帶出品牌
    form.setFieldsValue({ app: alg.app })
    // 設置配置的標籤列表
    const labels = (alg.signboardLabels.length > 0 ? alg.signboardLabels : SIGNBOARD_LABELS.map(l => l.value)) as LabelValue[]
    setConfiguredLabels(labels)
    // 解析每個標籤啟用的場景
    const scenarios: Record<string, string[]> = {}
    labels.forEach(l => {
      if (COMPARISON_LABELS.includes(l)) {
        scenarios[l] = alg.labelScenarios[l] ?? SCENARIO_DEFS.map(d => d.apiValue)
      }
    })
    setLabelScenarios(scenarios)
    // 設置 activeTab 為第一個配置的標籤
    if (labels.length > 0 && !labels.includes(activeTab)) {
      setActiveTab(labels[0])
    }
    // 切換算法時重置折扣模式
    setDiscountMode('local')
    setGlobalDiscountTiers([])
    setGlobalDiscountEnabled(false)
  }

  const updateLabelPrice = (label: string, price: number | undefined) => {
    setLabelPrices(prev => ({ ...prev, [label]: price }))
  }

  const toggleGradientEnabled = (label: string, checked: boolean) => {
    setLabelGradientEnabled(prev => ({ ...prev, [label]: checked }))
    if (checked && (!labelDiscounts[label] || labelDiscounts[label].length === 0)) {
      setLabelDiscounts(prev => ({ ...prev, [label]: [{ days: undefined, discount: undefined }] }))
    }
  }

  const addDiscountTier = (label: string) => {
    setLabelDiscounts(prev => ({
      ...prev,
      [label]: [...(prev[label] || []), { days: undefined, discount: undefined }],
    }))
  }

  const removeDiscountTier = (label: string, index: number) => {
    setLabelDiscounts(prev => ({
      ...prev,
      [label]: (prev[label] || []).filter((_, i) => i !== index),
    }))
  }

  const updateDiscountTier = (label: string, index: number, field: keyof LabelDiscountTier, value: number | null) => {
    setLabelDiscounts(prev => ({
      ...prev,
      [label]: (prev[label] || []).map((g, i) => (i === index ? { ...g, [field]: value ?? 0 } : g)),
    }))
  }

  const handleDiscountModeChange = (mode: DiscountMode) => {
    setDiscountMode(mode)
    if (mode === 'global') {
      // 從當前已啟用的第一個標籤複製梯度數據作為全局初始值
      const firstEnabled = configuredLabels.find(l => labelGradientEnabled[l])
      if (firstEnabled && labelDiscounts[firstEnabled]?.length) {
        setGlobalDiscountTiers([...labelDiscounts[firstEnabled]])
        setGlobalDiscountEnabled(true)
      }
    }
  }

  const handleToggleGlobalGradient = (checked: boolean) => {
    setGlobalDiscountEnabled(checked)
    if (checked && globalDiscountTiers.length === 0) {
      setGlobalDiscountTiers([{ days: undefined, discount: undefined }])
    }
  }

  const handleAddGlobalDiscountTier = () => {
    setGlobalDiscountTiers(prev => [...prev, { days: undefined, discount: undefined }])
  }

  const handleRemoveGlobalDiscountTier = (index: number) => {
    setGlobalDiscountTiers(prev => prev.filter((_, i) => i !== index))
  }

  const handleUpdateGlobalDiscountTier = (index: number, field: keyof LabelDiscountTier, value: number | null) => {
    setGlobalDiscountTiers(prev => prev.map((g, i) => (i === index ? { ...g, [field]: value ?? 0 } : g)))
  }

  /* ── 保存 ── */
  const handleSubmit = async () => {
    try {
      await form.validateFields()

      if (!selectedAlgorithmInfo) {
        message.error('請選擇算法名稱')
        return
      }

      // 校驗：一個算法只能配置一個定價（新增時檢查）
      if (!isEditMode) {
        const existing = await fetchAdSignboardPricingList({ algoId: selectedAlgorithmInfo.id, page: 1, size: 1 })
        if (existing.total > 0) {
          message.error('該算法已配置定價，一個算法只能配置一個定價')
          return
        }
      }

      // 校驗：至少一個標籤設置了價格
      const allKeys = configuredLabels.flatMap(l =>
        isComparisonLabel(l) ? (labelScenarios[l] ?? []).map(s => `${l}:${s}`) : [l]
      )
      const pricedKeys = allKeys.filter(k => labelPrices[k] != null && labelPrices[k]! > 0)
      if (pricedKeys.length === 0) {
        message.error('請至少為一個標籤設置售價')
        return
      }

      // 校驗：梯度折扣必須填寫完整
      if (discountMode === 'global') {
        if (globalDiscountEnabled) {
          for (let i = 0; i < globalDiscountTiers.length; i++) {
            if (!globalDiscountTiers[i].days || !globalDiscountTiers[i].discount) {
              message.error(`全局折扣梯度第 ${i + 1} 行請填寫完整`)
              return
            }
          }
        }
      } else {
        for (const lbl of configuredLabels) {
          const hasPrice = isComparisonLabel(lbl)
            ? (labelScenarios[lbl] ?? []).some(s => { const k = `${lbl}:${s}`; return labelPrices[k] != null && labelPrices[k]! > 0 })
            : (labelPrices[lbl] != null && labelPrices[lbl]! > 0)
          if (!hasPrice) continue
          if (labelGradientEnabled[lbl]) {
            const tiers = labelDiscounts[lbl] || []
            for (let i = 0; i < tiers.length; i++) {
              if (!tiers[i].days || !tiers[i].discount) {
                const cfg = getLabelConfig(lbl)
                message.error(`${cfg.label} 的梯度折扣第 ${i + 1} 行請填寫完整`)
                return
              }
            }
          }
        }
      }

      setLoading(true)

      // 構建 signboardItems
      const globalDiscountPayload = discountMode === 'global' && globalDiscountEnabled
        ? globalDiscountTiers.filter(g => g.days && g.discount).map(g => ({ minDays: g.days!, discount: g.discount! }))
        : undefined
      const signboardItems = configuredLabels.flatMap(l => {
        const discountPayload = discountMode === 'global'
          ? globalDiscountPayload
          : (labelGradientEnabled[l]
            ? (labelDiscounts[l] || []).filter(g => g.days && g.discount).map(g => ({ minDays: g.days!, discount: g.discount! }))
            : undefined)
        if (isComparisonLabel(l)) {
          const scenarios = labelScenarios[l] ?? []
          return scenarios.map(s => ({
            labelType: l,
            scenario: s,
            enabled: true,
            price: labelPrices[`${l}:${s}`],
            discountTiers: discountPayload,
          }))
        }
        return [{
          labelType: l,
          scenario: undefined as string | undefined,
          enabled: true,
          price: labelPrices[l],
          discountTiers: discountPayload,
        }]
      })

      const payload = {
        algoId: selectedAlgorithmInfo.id,
        algoName: selectedAlgorithmInfo.name,
        brand: appTypeToBrand(form.getFieldValue('app') as AppType),
        channel: form.getFieldValue('channel'),
        presaleDays,
        refundEnabled: refundEnabled ? 1 : 2,
        cancelFeeTiers: refundEnabled && cancelFeeRules.length
          ? cancelFeeRules.map(r => ({ remainDays: r.maxDays, ratio: r.feePercent }))
          : undefined,
        discountMode,
        globalDiscountTiers: discountMode === 'global' && globalDiscountEnabled ? globalDiscountPayload : undefined,
        status,
        signboardItems,
      }

      if (isEditMode) {
        await updateAdSignboardPricing(Number(urlId), payload)
      } else {
        await createAdSignboardPricing(payload)
      }
      message.success(isEditMode ? '編輯成功' : '新增成功')
      navigate(`/promotion-waterfall?type=${AlgorithmType.GOLDEN_SIGNBOARD}`)
    } catch (err: unknown) {
      // 表單校驗失敗（antd 自動提示）不處理，API 錯誤需提示用戶
      if (err && typeof err === 'object' && 'errorFields' in err) return
      const msg = err instanceof Error ? err.message : '保存失敗，請稍後重試'
      message.error(msg)
    } finally {
      setLoading(false)
    }
  }

  /* ── 樣式 ── */
  const cardShellStyle: React.CSSProperties = {
    border: '1px solid #e8eaed', borderRadius: 8, background: '#fff',
    padding: '20px 24px', marginBottom: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
  }
  const fieldLabelStyle: React.CSSProperties = { fontSize: 13, color: '#595959', marginBottom: 4 }
  const requiredMark = <span style={{ color: '#ff4d4f', marginRight: 4 }}>*</span>

  const cardTitle = (icon: React.ReactNode, iconBg: string, title: string, extra?: React.ReactNode, action?: React.ReactNode) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
      <div style={{ width: 28, height: 28, borderRadius: 6, background: iconBg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {icon}
      </div>
      <span style={{ fontSize: 15, fontWeight: 600, color: '#262626' }}>{title}</span>
      {extra}
      <div style={{ flex: 1, height: 1, background: '#f0f0f0', marginLeft: 8 }} />
      {action}
    </div>
  )

  /* ── 渲染：梯度折扣行 ── */
  const renderDiscountTiers = (
    labelValue: string,
    tiers: LabelDiscountTier[],
    gradientOn: boolean,
    onAdd: () => void,
    onRemove: (idx: number) => void,
    onUpdate: (idx: number, field: keyof LabelDiscountTier, val: number | null) => void,
  ) => {
    if (!gradientOn) {
      return (
        <div style={{ fontSize: 13, color: '#8C8C8C' }}>
          未啟用多天折扣梯度，商家購買多天無折扣優惠
        </div>
      )
    }

    return (
      <div>
        {tiers.length === 0 ? (
          <div style={{
            padding: '20px 24px', textAlign: 'center', background: '#FAFAFA',
            borderRadius: 8, border: '1px dashed #d9d9d9',
          }}>
            <span style={{ fontSize: 13, color: '#8C8C8C' }}>暫無折扣梯度，點擊右上角「添加梯度」添加</span>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {tiers.map((tier, idx) => (
              <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: 12, background: '#FAFAFA', borderRadius: 6 }}>
                <Tag color="blue">梯度 {idx + 1}</Tag>
                <span style={{ fontSize: 13, color: '#595959' }}>購買 ≥</span>
                <InputNumber
                  min={1} max={9999} precision={0}
                  placeholder="天數"
                  style={{ width: 110 }}
                  value={tier.days || undefined}
                  disabled={isDetailMode}
                  onChange={v => onUpdate(idx, 'days', v)}
                />
                <span style={{ fontSize: 13, color: '#595959' }}>天，享折扣</span>
                <InputNumber
                  min={0.01} max={10} precision={2}
                  placeholder="折扣"
                  style={{ width: 120 }}
                  addonAfter="折"
                  value={tier.discount || undefined}
                  disabled={isDetailMode}
                  onChange={v => onUpdate(idx, 'discount', v)}
                />
                {tier.days && tier.discount && (
                  <span style={{ fontSize: 12, color: '#8C8C8C' }}>
                    即買 {tier.days} 天享 {tier.discount} 折
                  </span>
                )}
                {!isDetailMode && (
                  <Button
                    type="link" danger size="small"
                    icon={<DeleteOutlined />}
                    style={{ marginLeft: 'auto' }}
                    onClick={() => onRemove(idx)}
                  >刪除</Button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    )
  }

  /* ── 渲染：標籤定價 Tab 面板 ── */
  const renderLabelPanel = (labelValue: string) => {
    const isComparison = isComparisonLabel(labelValue)
    const scenarios = isComparison ? (labelScenarios[labelValue] ?? []) : []

    if (isComparison && scenarios.length === 0) {
      return (
        <div style={{ padding: '24px', textAlign: 'center', background: '#FAFAFA', borderRadius: 8 }}>
          <span style={{ fontSize: 13, color: '#8C8C8C' }}>該標籤未啟用任何場景，請先到算法庫配置</span>
        </div>
      )
    }

    return (
      <div>
        {/* 售價區域 */}
        {isComparison ? (
          <div style={{
            display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '12px 24px',
            padding: '12px 16px', background: '#FAFAFA', borderRadius: 8, marginBottom: 16,
          }}>
            {scenarios.map(sc => {
              const scDef = SCENARIO_DEFS.find(d => d.apiValue === sc)
              if (!scDef) return null
              const key = `${labelValue}:${sc}`
              return (
                <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 14, flexShrink: 0 }}>{scDef.icon}</span>
                  <span style={{ fontSize: 13, color: scDef.color, fontWeight: 500, whiteSpace: 'nowrap' }}>{scDef.label}</span>
                  <InputNumber
                    style={{ flex: 1, minWidth: 0 }}
                    min={1} max={99999} precision={0}
                    placeholder="售價"
                    value={labelPrices[key]}
                    disabled={isDetailMode}
                    onChange={v => updateLabelPrice(key, v ?? undefined)}
                    addonAfter="MOP/天"
                  />
                </div>
              )
            })}
          </div>
        ) : (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '12px 16px', background: '#FAFAFA', borderRadius: 8, marginBottom: 16,
            maxWidth: '50%',
          }}>
            <span style={{ fontSize: 14, flexShrink: 0 }}>{getLabelConfig(labelValue).icon}</span>
            <span style={{ fontSize: 13, color: getLabelConfig(labelValue).color, fontWeight: 500, whiteSpace: 'nowrap' }}>{getLabelConfig(labelValue).label}</span>
            <InputNumber
              style={{ flex: 1, minWidth: 0 }}
              min={1} max={99999} precision={0}
              placeholder="售價"
              value={labelPrices[labelValue]}
              disabled={isDetailMode}
              onChange={v => updateLabelPrice(labelValue, v ?? undefined)}
              addonAfter="MOP/天"
            />
          </div>
        )}
      </div>
    )
  }

  /* ── 實際展示的標籤列表（展示全部標籤，未配置的置灰禁用） ── */
  const allLabels = SIGNBOARD_LABELS.map(l => l.value as LabelValue)

  return (
    <div className="content-area">
      <style>{`@keyframes signboardTabFadeIn{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}`}</style>
      {/* ── 頂部標題欄（與無敵星星/盤活復蘇/人氣商家保持一致） ── */}
      <div style={{
        position: 'relative', background: '#fff', marginBottom: 16,
        borderRadius: 12, boxShadow: '0 2px 12px rgba(0,0,0,0.06)',
        overflow: 'hidden',
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
                backgroundColor: '#E8720C', borderColor: '#E8720C',
                borderRadius: 8, height: 36, padding: '0 16px',
                display: 'flex', alignItems: 'center', gap: 6,
                boxShadow: '0 2px 6px rgba(232,114,12,0.25)',
                transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
              }}
            >{t('common:back')}</Button>
            <div style={{ width: 1, height: 20, background: '#E8E8E8' }} />
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#1890ff' }}>
                {isDetailMode ? t('recommend.pricingDetailTitle') : isEditMode ? t('recommend.editPricingTitle') : t('recommend.addPricingTitle')}
              </h2>
              <span style={{ fontSize: 14, color: '#595959' }}>
                🏅 {t('algorithm.typeGoldenSignboard')}
              </span>
            </div>
          </div>
        </div>
      </div>

      <Form form={form} layout="vertical" disabled={isDetailMode}>
        {/* ── 1. 基礎信息（從算法庫獲取金字招牌數據） ── */}
        <div style={cardShellStyle}>
          {cardTitle(<ShopOutlined style={{ fontSize: 14, color: '#1890ff' }} />, '#E6F7FF', t('recommend.basicInfo'))}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
            <Form.Item
              label={t('recommend.algoName')}
              name="algorithmId"
              rules={[{ required: true, message: t('recommend.selectAlgo') }]}
            >
              <Select
                disabled={isEditMode || isDetailMode}
                placeholder={t('recommend.selectAlgo')}
                showSearch
                optionFilterProp="label"
                options={algorithmSelectOptions.map(alg => ({
                  label: alg.name,
                  value: alg.id,
                }))}
                onChange={handleAlgorithmChange}
              />
            </Form.Item>
            <Form.Item label={t('common:brand')} name="app" rules={[{ required: true, message: t('common:selectBrand') }]}>
              <Select
                disabled
                placeholder={t('common:selectBrand')}
                options={tAppOptions}
              />
            </Form.Item>
            <Form.Item label={t('recommend.popularSkin.channelLabel')} name="channel" rules={[{ required: true, message: t('recommend.popularSkin.selectChannel') }]}>
              <Select placeholder={t('recommend.popularSkin.pleaseSelect')} options={channelOptions} disabled={isEditMode || isDetailMode} />
            </Form.Item>
          </div>
          <Form.Item label={t('recommend.popularSkin.detailImageLabel')} style={{ marginBottom: 0, marginTop: 16 }}>
            <Upload
              disabled={isDetailMode}
              listType="picture-card"
              fileList={detailFileList}
              onChange={({ fileList }) => setDetailFileList(fileList)}
              beforeUpload={() => false}
            >
              {detailFileList.length < 1 && (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
                  <PlusOutlined style={{ fontSize: 20 }} />
                  <span style={{ fontSize: 12, color: '#8c8c8c' }}>{t('recommend.popularSkin.uploadDetailImage')}</span>
                </div>
              )}
            </Upload>
          </Form.Item>
        </div>

        {/* ── 2. 銷售策略（預售天數） ── */}
        <div style={cardShellStyle}>
          {cardTitle(
            <CalendarOutlined style={{ fontSize: 14, color: '#fa8c16' }} />, '#FFF7E6', t('recommend.popularSkin.salesStrategyCard'),
          )}
          <div style={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <span style={{ fontSize: 13, color: '#595959', minWidth: 80 }}>{t('recommend.popularSkin.presaleDaysLabel')}</span>
            <InputNumber
              min={1} max={90} precision={0}
              value={presaleDays}
              disabled={isDetailMode}
              onChange={v => setPresaleDays(v || 7)}
              addonAfter={t('recommend.popularSkin.dayAddon')}
              style={{ width: 160 }}
            />
            <span style={{ fontSize: 12, color: '#8C8C8C', marginLeft: 8 }}>
              系統持續銷售 {presaleDays} 天內的廣告，每過一天自動補充一天，循環銷售；
              <span style={{
                background: '#FFF7E6', border: '1px solid #FFD591', borderRadius: 4,
                padding: '1px 6px', color: '#D46B08', fontWeight: 500, fontSize: 11, marginLeft: 4,
              }}>條件規則含按月計算的標籤不受此限制</span>
            </span>
          </div>
        </div>

        {/* ── 3. 標籤定價配置（全部標籤，未配置的置灰禁用） ── */}
        <div style={cardShellStyle}>
          {cardTitle(
            <TrophyOutlined style={{ fontSize: 14, color: '#2F54EB' }} />, '#F0F5FF', '標籤定價配置',
            <span style={{ fontSize: 12, color: '#8C8C8C', marginLeft: 4 }}>
              為每種標籤分別設置售價
            </span>,
          )}

          {!selectedAlgorithmInfo && algorithmSelectOptions.length > 0 && (
            <div style={{
              padding: '24px', textAlign: 'center', background: '#FAFAFA',
              borderRadius: 8, border: '1px dashed #d9d9d9', marginBottom: 16,
            }}>
              <span style={{ fontSize: 13, color: '#8C8C8C' }}>{t('recommend.selectAlgorithmNameFirst')}</span>
            </div>
          )}

          {selectedAlgorithmInfo && allLabels.length > 0 && (
            <>
              {/* 標籤導航按鈕 */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 16 }}>
                {SIGNBOARD_LABELS.map(l => {
                  const lv = l.value as LabelValue
                  const isActive = activeTab === lv
                  const isConfigured = configuredLabels.includes(lv)
                  const hasPrice = isComparisonLabel(lv)
                    ? (labelScenarios[lv] ?? []).length > 0 && (labelScenarios[lv] ?? []).every(s => { const k = `${lv}:${s}`; return labelPrices[k] != null && labelPrices[k]! > 0 })
                    : (labelPrices[lv] != null && labelPrices[lv]! > 0)
                  return (
                    <div key={lv}
                      onClick={() => isConfigured && setActiveTab(lv)}
                      style={{
                        padding: '6px 14px', borderRadius: 6, cursor: isConfigured ? 'pointer' : 'not-allowed',
                        border: '1px solid', borderColor: isActive ? '#E8720C' : '#f0f0f0',
                        background: isActive ? '#FFF7E6' : '#fff',
                        boxShadow: isActive ? '0 0 0 1px #E8720C' : 'none',
                        transition: 'all 0.2s', display: 'flex', alignItems: 'center', gap: 5,
                        opacity: isConfigured ? 1 : 0.45,
                      }}>
                      <span style={{ fontSize: 14 }}>{l.icon}</span>
                      <span style={{ fontSize: 12, fontWeight: isActive ? 600 : 400, color: isActive ? '#E8720C' : '#595959' }}>{l.label}</span>
                      {hasPrice && isConfigured && (
                        <span style={{ fontSize: 10, color: '#fff', background: '#52C41A', borderRadius: 3, padding: '0 4px', lineHeight: '16px', fontWeight: 600 }}>已配置</span>
                      )}
                    </div>
                  )
                })}
              </div>
              {/* 標籤內容 */}
              <div>
                {(() => {
                  const l = getLabelConfig(activeTab)
                  const isConfigured = configuredLabels.includes(activeTab)
                  return isConfigured
                    ? renderLabelPanel(activeTab)
                    : (
                      <div style={{ padding: '32px 0', textAlign: 'center', background: '#FAFAFA', borderRadius: 8 }}>
                        <div style={{ fontSize: 28, marginBottom: 8, opacity: 0.4 }}>{l.icon}</div>
                        <div style={{ fontSize: 14, color: '#8C8C8C', marginBottom: 4 }}>
                          算法庫未配置「{l.label}」標籤規則
                        </div>
                        <div style={{ fontSize: 12, color: '#BFBFBF' }}>
                          請先到算法庫中配置該標籤的資格條件，返回後即可配置定價
                        </div>
                      </div>
                    )
                })()}
              </div>
              {/* ── 多天折扣梯度（獨立模塊） ── */}
              <div style={{ marginTop: 20 }}>
                <div style={{
                  border: `1px solid ${discountMode === 'global' ? '#E8720C33' : '#f0f0f0'}`, borderRadius: 8,
                  background: discountMode === 'global' ? '#FFF7E6' : '#FAFAFA', overflow: 'hidden',
                }}>
                  {/* 模式切換 + 說明 */}
                  <div style={{
                    padding: '14px 20px',
                    borderBottom: '1px solid',
                    borderColor: discountMode === 'global' ? '#E8720C22' : '#f0f0f0',
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <PercentageOutlined style={{ fontSize: 15, color: '#722ED1' }} />
                      <span style={{ fontSize: 14, fontWeight: 600, color: '#262626' }}>多天折扣梯度</span>
                      <div style={{
                        display: 'inline-flex', borderRadius: 6, overflow: 'hidden',
                        border: '1px solid #d9d9d9',
                      }}>
                        {(['global', 'local'] as DiscountMode[]).map(mode => (
                          <div key={mode} onClick={() => !isDetailMode && handleDiscountModeChange(mode)} style={{
                            padding: '3px 12px', fontSize: 12,
                            cursor: isDetailMode ? 'default' : 'pointer',
                            background: discountMode === mode ? '#E8720C' : '#fff',
                            color: discountMode === mode ? '#fff' : '#595959',
                            transition: 'all 0.2s', whiteSpace: 'nowrap',
                          }}>
                            {mode === 'global' ? '全局折扣' : '局部折扣'}
                          </div>
                        ))}
                      </div>
                    </div>
                    {(discountMode === 'global' ? globalDiscountEnabled : (labelGradientEnabled[activeTab] ?? false)) && !isDetailMode && (
                      <Button type="primary" size="small" icon={<PlusOutlined />}
                        onClick={discountMode === 'global' ? handleAddGlobalDiscountTier : () => addDiscountTier(activeTab)}
                        style={{ borderRadius: 6 }}
                      >添加梯度</Button>
                    )}
                  </div>
                  {/* 模式說明 + 梯度開關 */}
                  <div style={{ padding: '10px 20px 0', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 12, color: '#8C8C8C', flex: 1 }}>
                      {discountMode === 'global'
                        ? '所有標籤的折扣都按當前配置打折優惠'
                        : '每個標籤的折扣是獨立配置的'}
                    </span>
                    {discountMode === 'global' ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <Switch size="small" checked={globalDiscountEnabled} disabled={isDetailMode}
                          onChange={handleToggleGlobalGradient} />
                        <span style={{ fontSize: 12, color: '#8C8C8C' }}>
                          {globalDiscountEnabled ? `已配置 ${globalDiscountTiers.length} 個梯度` : '未啟用'}
                        </span>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <Switch size="small"
                          checked={labelGradientEnabled[activeTab] ?? false}
                          disabled={isDetailMode}
                          onChange={checked => toggleGradientEnabled(activeTab, checked)} />
                        <span style={{ fontSize: 12, color: '#8C8C8C' }}>
                          {(labelGradientEnabled[activeTab] ?? false) ? `已配置 ${(labelDiscounts[activeTab] || []).length} 個梯度` : '未啟用'}
                        </span>
                      </div>
                    )}
                  </div>
                  {/* 梯度行列表 */}
                  <div style={{ padding: '10px 20px 16px' }}>
                    {discountMode === 'global'
                      ? renderDiscountTiers('__global__', globalDiscountTiers, globalDiscountEnabled,
                          handleAddGlobalDiscountTier, handleRemoveGlobalDiscountTier, handleUpdateGlobalDiscountTier)
                      : renderDiscountTiers(activeTab, labelDiscounts[activeTab] || [], labelGradientEnabled[activeTab] ?? false,
                          () => addDiscountTier(activeTab), (idx: number) => removeDiscountTier(activeTab, idx),
                          (idx: number, f: keyof LabelDiscountTier, v: number | null) => updateDiscountTier(activeTab, idx, f, v))
                    }
                  </div>
                </div>
              </div>
            </>
          )}
        </div>

        {/* ── 4. 訂單退款退費比例配置 ── */}
        <div style={cardShellStyle}>
          {cardTitle(
            <SettingOutlined style={{ fontSize: 14, color: '#f5222d' }} />, '#FFF1F0', t('recommend.popularSkin.refundConfigTitle'),
            <span style={{ fontSize: 12, color: '#8C8C8C', marginLeft: 4 }}>{t('recommend.popularSkin.refundConfigHint')}</span>,
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 13, color: refundEnabled ? '#52C41A' : '#8C8C8C' }}>
                {refundEnabled ? t('recommend.popularSkin.allowRefund') : t('recommend.popularSkin.notAllowRefund')}
              </span>
              <Switch
                size="small"
                checked={refundEnabled}
                disabled={isDetailMode}
                onChange={checked => setRefundEnabled(checked)}
                style={{ background: refundEnabled ? '#52C41A' : '#D9D9D9' }}
              />
            </div>,
          )}
          {refundEnabled ? (
            <Table
              rowKey="id"
              dataSource={cancelFeeRules}
              pagination={false}
              bordered
              size="small"
              columns={[
                {
                  title: t('recommend.popularSkin.adPromotionCol'),
                  dataIndex: 'maxDays',
                  width: 220,
                  render: (_, record: CancelFeeRule) => (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ fontSize: 13, color: '#595959', whiteSpace: 'nowrap' }}>{t('recommend.popularSkin.remainingDaysLe')}</span>
                      <InputNumber
                        disabled={isDetailMode}
                        min={0} max={999}
                        value={record.maxDays === 999 ? undefined : record.maxDays}
                        onChange={val => {
                          setCancelFeeRules(prev => prev.map(r => r.id === record.id ? { ...r, maxDays: val ?? 0 } : r))
                        }}
                        addonAfter={record.maxDays === 999 ? '' : t('recommend.popularSkin.dayAddon')}
                        placeholder={record.maxDays === 999 ? t('recommend.popularSkin.unlimitedPh') : ''}
                        style={{ flex: 1 }}
                      />
                    </div>
                  ),
                },
                {
                  title: t('recommend.popularSkin.ratioConfigCol'),
                  dataIndex: 'feePercent',
                  width: 160,
                  render: (_, record: CancelFeeRule) => (
                    <InputNumber
                      disabled={isDetailMode}
                      min={0} max={100}
                      value={record.feePercent}
                      onChange={val => {
                        setCancelFeeRules(prev => prev.map(r => r.id === record.id ? { ...r, feePercent: val ?? 0 } : r))
                      }}
                      addonAfter="%"
                      style={{ width: '100%' }}
                    />
                  ),
                },
                {
                  title: t('recommend.popularSkin.opCol'),
                  width: 120,
                  align: 'center',
                  render: (_: unknown, record: CancelFeeRule) => {
                    if (isDetailMode) return <span style={{ color: '#BFBFBF' }}>—</span>
                    const isLastRow = cancelFeeRules[cancelFeeRules.length - 1]?.id === record.id
                    return (
                      <Space size={4}>
                        {isLastRow && (
                          <Button
                            type="link" size="small"
                            onClick={() => {
                              const nextId = cancelFeeRules.length > 0 ? Math.max(...cancelFeeRules.map(r => r.id)) + 1 : 1
                              setCancelFeeRules(prev => [...prev, { id: nextId, maxDays: 0, feePercent: 50 }])
                            }}
                          >{t('recommend.popularSkin.addTier')}</Button>
                        )}
                        <Button
                          type="link" size="small" danger
                          onClick={() => {
                            if (cancelFeeRules.length <= 1) {
                              message.warning(t('recommend.atLeastOneRule'))
                              return
                            }
                            setCancelFeeRules(prev => prev.filter(r => r.id !== record.id))
                          }}
                        >{t('recommend.popularSkin.skinDelete')}</Button>
                      </Space>
                    )
                  },
                },
              ]}
            />
          ) : (
            <div style={{
              padding: '24px', textAlign: 'center',
              background: '#FAFAFA', borderRadius: 8,
              border: '1px dashed #D9D9D9',
            }}>
              <span style={{ fontSize: 13, color: '#8C8C8C' }}>{t('recommend.popularSkin.notAllowRefundHint')}</span>
            </div>
          )}
        </div>

        {/* ── 5. 狀態設置 ── */}
        <div style={cardShellStyle}>
          {cardTitle(<CheckCircleOutlined style={{ fontSize: 14, color: '#52C41A' }} />, '#F6FFED', t('recommend.popularSkin.statusSettingCard'))}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 13, color: '#595959' }}>{t('recommend.popularSkin.statusLabelColon')}</span>
            <Switch
              checked={status === ServiceStatus.ENABLED}
              disabled={isDetailMode}
              onChange={checked => setStatus(checked ? ServiceStatus.ENABLED : ServiceStatus.DISABLED)}
              checkedChildren={t('recommend.popularSkin.statusEnabledText')}
              unCheckedChildren={t('recommend.popularSkin.statusDisabledText')}
            />
            <span style={{ fontSize: 12, color: '#8C8C8C' }}>{t('recommend.popularSkin.disableSkinHint')}</span>
          </div>
        </div>
      </Form>

      {/* ── 底部操作欄 ── */}
      {!isDetailMode && (
        <div className="form-footer">
          <Button onClick={handleBack}>{t('common:cancel')}</Button>
          <Button type="primary" icon={<SaveOutlined />} loading={loading} onClick={handleSubmit}>
            {t('common:save')}
          </Button>
        </div>
      )}
    </div>
  )
}
