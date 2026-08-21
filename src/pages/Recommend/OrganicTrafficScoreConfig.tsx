import { useState, useMemo, useEffect, useCallback } from 'react'
import { Button, Tag, Space, Modal, Form, Input, Select, InputNumber, message, Switch, Tabs, Spin, Radio, Checkbox, Table, Alert } from 'antd'
import { SettingOutlined, PlusOutlined, SaveOutlined, SearchOutlined, QuestionCircleOutlined, DeleteOutlined, DownOutlined, UpOutlined, EditOutlined, ShopOutlined } from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
import { ServiceStatus } from './constants'
import { getSystemRuleValue } from '@/hooks/useSystemRules'
import { getSystemConfig, updateSystemConfig } from '@/api/systemConfig'
import {
  ScoreDimension, ScoreMode, TierDirection, CalcCycle,
  SCORE_DIMENSION_ICON, SCORE_DIMENSION_COLOR,
  SCORE_MODE_COLOR,
  DEFAULT_DIMENSION_WEIGHT, DIMENSION_WEIGHT_TOTAL,
  DEFAULT_ORGANIC_SCORE_RULES,
  RANGE_SCORE_KEYS, DEFAULT_RANGE_SCORES,
  TIME_PERIOD_KEYS, TIME_PERIOD_LABELS,
  TIER_DIRECTION_LABEL,
  type OrganicScoreRule, type RangeScores, type TimeRangeScores, type ScoreTier, type ScoreConditionItem, type PeakTimeRange,
} from './organicTrafficConfig'
import {
  fetchOrganicScoreConfig, updateDimensionWeights as apiUpdateWeights,
  createOrganicRule, updateOrganicRule, toggleOrganicRuleStatus,
  deleteOrganicRule,
  type OrganicRuleVO,
} from '@/api/organicScore'
import { fetchStores } from '@/api/store'


/** 維度順序（界面展示順序） */
const DIMENSION_ORDER: ScoreDimension[] = [
  ScoreDimension.COMMERCIAL,
  ScoreDimension.STORE,
  ScoreDimension.PLATFORM,
]


/** 新增/編輯評分項的表單值 */
interface RuleFormValues {
  name: string
  description: string
  mode: ScoreMode
  score: number
  /** 前提條件描述 */
  prerequisites?: string
  /** 統計天數（可選，僅部分規則需要） */
  statDays?: number
  /** 配送範圍分層分數（僅配送範圍規則使用） */
  rangeScores?: RangeScores
  /** 梯度檔位（僅 mode=TIERED 時使用） */
  tiers?: ScoreTier[]
  /** 條件計分子項（僅 mode=CONDITIONAL 時使用） */
  conditionItems?: ScoreConditionItem[]
  /** 計算周期（僅 mode=TIERED 時使用） */
  calcCycle?: CalcCycle
  /** 歷史基線天數 */
  statDaysTotal?: number
  /** 近期對比天數 */
  statDaysRecent?: number
  /** 高峰時段定義 */
  peakTimeRanges?: PeakTimeRange[]
  /** 每單固定扣分 */
  deductionPerOrder?: number
  /** 衰减系数 */
  decayCoefficient?: number
  /** 配送範圍分時段計分 */
  timeRangeScores?: TimeRangeScores
  status: ServiceStatus
}

/** 判斷是否為配送範圍規則（合併後僅 PLT_02A） */
const isDeliveryRange = (id?: string) => id === 'PLT_02A'

/** 判斷是否需要統計天數（訂單、好評、差評、梯度計分等時效性指標需要） */
const needsStatDays = (mode?: ScoreMode, id?: string) => {
  if (mode === ScoreMode.TIERED) return true
  if (!id) return false
  return ['STB_03', 'PLT_03'].includes(id)
}

/** PLT_03 商家扶持 - 前提條件選項（可擴展） */
const PLT_03_PREREQ_OPTIONS = [
  { value: 'FREE_SHIPPING', label: '參與減免運費' },
  { value: 'MEMBER_COUPON', label: '參與會員紅包' },
]

interface Props {
  /** 詳情模式：只讀，隱藏所有編輯入口 */
  readOnly?: boolean
}

/**
 * API VO → 前端內部 OrganicScoreRule 轉換
 */
function voToRule(vo: OrganicRuleVO): OrganicScoreRule {
  let tiers: ScoreTier[] | undefined
  let rangeScores: RangeScores | undefined
  let conditionItems: ScoreConditionItem[] | undefined
  let peakTimeRanges: PeakTimeRange[] | undefined
  try { tiers = vo.tiers ? JSON.parse(vo.tiers) : undefined } catch { tiers = undefined }
  try { rangeScores = vo.rangeScores ? JSON.parse(vo.rangeScores) : undefined } catch { rangeScores = undefined }
  try { conditionItems = vo.conditionItems ? JSON.parse(vo.conditionItems) : undefined } catch { conditionItems = undefined }
  try { peakTimeRanges = vo.peakTimeRanges ? JSON.parse(vo.peakTimeRanges) : undefined } catch { peakTimeRanges = undefined }
  return {
    id: vo.ruleCode,
    dimension: vo.dimension as ScoreDimension,
    name: vo.name,
    description: vo.description,
    mode: vo.mode as ScoreMode,
    score: vo.score,
    prerequisites: vo.prerequisites || undefined,
    statDays: vo.statDays ?? undefined,
    rangeScores,
    tiers,
    conditionItems,
    calcCycle: vo.calcCycle as CalcCycle | undefined,
    calcIntervalHours: vo.calcIntervalHours ?? undefined,
    statDaysTotal: vo.statDaysTotal ?? undefined,
    statDaysRecent: vo.statDaysRecent ?? undefined,
    peakTimeRanges,
    deductionPerOrder: vo.deductionPerOrder ?? undefined,
    decayCoefficient: vo.decayCoefficient ?? undefined,
    timeRangeScores: vo.timeRangeScores ? (() => { try { return JSON.parse(vo.timeRangeScores) as TimeRangeScores } catch { return undefined } })() : undefined,
    blockedMerchants: vo.blockedMerchants ? (() => { try { return JSON.parse(vo.blockedMerchants) as string[] } catch { return undefined } })() : undefined,
    status: vo.status as ServiceStatus,
    builtin: vo.builtin === 1,
  }
}

/**
 * 前端合併 STO_02A/STO_02B → STB_03（評價得分 - 5 星配置）
 * 數據庫尚未遷移時，在加載後自動合併；同時處理舊 2 檔格式升級為 5 星。
 */
function mergeReviewRules(rules: OrganicScoreRule[]): OrganicScoreRule[] {
  const good = rules.find(r => r.id === 'STO_02A')
  const bad = rules.find(r => r.id === 'STO_02B')
  const existing = rules.find(r => r.id === 'STB_03')
  const hasOldAB = !!(good || bad)
  // 判斷現有 STB_03 是否為舊格式（只有 bonus/deduction 兩項）
  const isOldFormat = existing && existing.conditionItems?.length === 2 &&
    existing.conditionItems.every(i => i.condition === 'bonus' || i.condition === 'deduction')
  if (!hasOldAB && !isOldFormat) return rules // 無舊數據且已是新格式
  // 刪除舊的 A/B
  let result = rules.filter(r => r.id !== 'STO_02A' && r.id !== 'STO_02B')
  // 使用默認 5 星配置
  const defaultSTB03 = DEFAULT_ORGANIC_SCORE_RULES.find(r => r.id === 'STB_03')
  const merged: OrganicScoreRule = {
    id: 'STB_03',
    dimension: ScoreDimension.STORE,
    name: '評價得分',
    description: '統計天數內顧客評價星級計分，支持固定加扣分或動態倍率',
    mode: ScoreMode.CONDITIONAL,
    score: 0,
    statDays: existing?.statDays || good?.statDays || bad?.statDays || 30,
    status: existing?.status || good?.status || ServiceStatus.ENABLED,
    builtin: true,
    conditionItems: defaultSTB03?.conditionItems || [
      { condition: 'fixed_bonus', score: 50 },
      { condition: 'fixed_bonus', score: 20 },
      { condition: 'fixed_bonus', score: 0 },
      { condition: 'fixed_deduction', score: 20 },
      { condition: 'fixed_deduction', score: 50 },
    ],
  }
  // 移除舊 STB_03（如果有）
  result = result.filter(r => r.id !== 'STB_03')
  // 在原位置插入新 STB_03
  const insertIdx = rules.findIndex(r => r.id === 'STO_02A' || r.id === 'STB_03')
  result.splice(insertIdx >= 0 ? insertIdx : result.length, 0, merged)
  return result
}

/**
 * 自然流量算法參數配置：3 個維度的商家評分規則。
 * 自然流量不售賣坑位，商家靠綜合得分高低較量排名。
 */
export default function OrganicTrafficScoreConfig({ readOnly = false }: Props) {
  const { t } = useTranslation()
  const [rules, setRules] = useState<OrganicScoreRule[]>(DEFAULT_ORGANIC_SCORE_RULES)
  const [loading, setLoading] = useState(true)

  /** 從後端加載配置 */
  const loadConfig = useCallback(async () => {
    setLoading(true)
    try {
      const config = await fetchOrganicScoreConfig()
      if (config.rules.length > 0) {
        const loaded = config.rules.map(voToRule).filter(r => r.id !== 'COM_08' && r.id !== 'COM_11' && r.id !== 'PLT_02B' && r.id !== 'PLT_02C' && r.id !== 'PLT_02D' && r.id !== 'PLT_02E')
        // 前端保底：確保 PLT_03/PLT_04 名稱與維度正確（SQLPub 複制延遲時生效）
        loaded.forEach(r => {
          if (r.id === 'PLT_03') {
            r.name = '商家扶持'
            r.dimension = ScoreDimension.PLATFORM
          }
          if (r.id === 'PLT_04') {
            r.name = '訂單過熱調控'
            r.dimension = ScoreDimension.PLATFORM
            r.calcCycle = CalcCycle.SCHEDULED
            if (!r.calcIntervalHours) r.calcIntervalHours = 1
          }
          if (r.id === 'STB_05') {
            r.name = '出餐速度'
            r.dimension = ScoreDimension.STORE
            if (!r.statDaysTotal) r.statDaysTotal = 7
            // 清除舊版 statDaysRecent 與主/輔營條件項
            r.statDaysRecent = undefined
            if (r.conditionItems?.some(i => i.condition === 'primary_meet' || i.condition === 'secondary_meet')) {
              r.conditionItems = [{ condition: 'over_avg_deduction', score: 30 }]
            }
            if (!r.conditionItems?.length) {
              r.conditionItems = [{ condition: 'over_avg_deduction', score: 30 }]
            }
          }
          if (r.id === 'STB_06') {
            r.name = '拒絕接單'
            if (!r.statDays) r.statDays = 7
            if (!r.deductionPerOrder) r.deductionPerOrder = 80
          }
          if (r.id === 'STB_07') {
            r.name = '出餐超時'
            if (!r.statDays) r.statDays = 7
            if (!r.deductionPerOrder) r.deductionPerOrder = 70
          }
          if (r.id === 'STB_08') {
            r.name = '取消訂單'
            if (!r.statDays) r.statDays = 7
            if (!r.deductionPerOrder) r.deductionPerOrder = 80
          }
          if (r.id === 'STB_09') {
            r.name = '超時接單'
            if (!r.statDays) r.statDays = 7
            if (!r.deductionPerOrder) r.deductionPerOrder = 60
          }
          if (r.id === 'STB_01') {
            r.name = '主營時段加分'
          }
          if (r.id === 'PLT_01') {
            r.name = '距離衰減'
            if (!r.decayCoefficient) r.decayCoefficient = 5
          }
          if (r.id === 'PLT_02A') {
            r.name = '配送範圍'
            if (!r.timeRangeScores) {
              r.timeRangeScores = {
                breakfast: { ...DEFAULT_RANGE_SCORES },
                lunch: { ...DEFAULT_RANGE_SCORES },
                afternoonTea: { ...DEFAULT_RANGE_SCORES },
                dinner: { ...DEFAULT_RANGE_SCORES },
                lateNight: { ...DEFAULT_RANGE_SCORES },
              }
            }
          }
        })
        setRules(mergeReviewRules(loaded))
      }
      if (config.dimensions.length > 0) {
        const weightMap: Record<number, number> = {}
        config.dimensions.forEach(d => { weightMap[d.dimension] = d.weight })
        setDimensionWeight(prev => ({
          ...prev,
          [ScoreDimension.COMMERCIAL]: weightMap[1] ?? prev[ScoreDimension.COMMERCIAL],
          [ScoreDimension.STORE]: weightMap[2] ?? prev[ScoreDimension.STORE],
          [ScoreDimension.PLATFORM]: weightMap[4] ?? prev[ScoreDimension.PLATFORM],
        }))
      }
    } catch {
      // 後端不可用時保持默認硬編碼數據
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadConfig() }, [loadConfig])

  /** 維度標籤（依賴 t，定義在組件內以便響應語言切換） */
  const DIM_LABEL: Record<ScoreDimension, string> = {
    [ScoreDimension.COMMERCIAL]: t('organicTrafficScore.dimCommercial'),
    [ScoreDimension.STORE]: t('organicTrafficScore.dimStore'),
    [ScoreDimension.PLATFORM]: t('organicTrafficScore.dimPlatform'),
  }
  /** 計分方式標籤（依賴 t） */
  const MODE_LABEL: Record<ScoreMode, string> = {
    [ScoreMode.RULE_BONUS]: t('organicTrafficScore.modeRuleBonus'),
    [ScoreMode.DECAY]: t('organicTrafficScore.modeDecay'),
    [ScoreMode.RULE_DEDUCTION]: t('organicTrafficScore.modeRuleDeduction'),
    [ScoreMode.AMOUNT_MULTIPLIER]: t('organicTrafficScore.modeAmountMultiplier'),
    [ScoreMode.TIERED]: '梯度計分',
    [ScoreMode.CONDITIONAL]: '條件計分',
  }
  /** 配送範圍分層標籤（依賴 t） */
  const RANGE_LABEL: Record<keyof RangeScores, string> = {
    short: t('organicTrafficScore.rangeShort'),
    medium: t('organicTrafficScore.rangeMedium'),
    long: t('organicTrafficScore.rangeLong'),
    crossBridge: t('organicTrafficScore.rangeCrossBridge'),
  }
  /** 計分方式選項（依賴 t） */
  const MODE_OPTIONS = [
    { label: MODE_LABEL[ScoreMode.RULE_BONUS], value: ScoreMode.RULE_BONUS },
    { label: MODE_LABEL[ScoreMode.DECAY], value: ScoreMode.DECAY },
    { label: MODE_LABEL[ScoreMode.RULE_DEDUCTION], value: ScoreMode.RULE_DEDUCTION },
    { label: MODE_LABEL[ScoreMode.AMOUNT_MULTIPLIER], value: ScoreMode.AMOUNT_MULTIPLIER },
    { label: MODE_LABEL[ScoreMode.TIERED], value: ScoreMode.TIERED },
    { label: MODE_LABEL[ScoreMode.CONDITIONAL], value: ScoreMode.CONDITIONAL },
  ]
  const [dimensionWeight, setDimensionWeight] = useState<Record<ScoreDimension, number>>(DEFAULT_DIMENSION_WEIGHT)
  const [savingWeights, setSavingWeights] = useState(false)

  // 維度切換與表格內篩選（避免所有維度平鋪導致頁面過長）
  const [activeDimension, setActiveDimension] = useState<ScoreDimension>(ScoreDimension.COMMERCIAL)
  const [keyword, setKeyword] = useState('')
  const [statusFilter, setStatusFilter] = useState<ServiceStatus | undefined>(undefined)
  /** 展開的規則 ID 集合（可展開列表模式） */
  const [expandedRules, setExpandedRules] = useState<Record<string, boolean>>({})
  /** 權重配置是否收起（持久化到數據庫 sys_config 表，系統級配置） */
  const WEIGHT_COLLAPSED_KEY = 'organic_traffic_weight_collapsed'
  const [weightConfigCollapsed, setWeightConfigCollapsed] = useState(false)

  /** 從數據庫加載折叠狀態 */
  useEffect(() => {
    getSystemConfig(WEIGHT_COLLAPSED_KEY).then(res => {
      if (res?.value === 'true') setWeightConfigCollapsed(true)
    }).catch(() => { /* 靜默：首次無數據時保持默認展開 */ })
  }, [])

  /** 切换折叠狀態時同步到數據庫 */
  const handleToggleWeightCollapsed = () => {
    const next = !weightConfigCollapsed
    setWeightConfigCollapsed(next)
    updateSystemConfig(WEIGHT_COLLAPSED_KEY, String(next)).catch(() => {
      message.warning('配置保存失敗，請重試')
    })
  }
  /** 內聯編輯中的規則 ID 集合 */
  const [inlineEditing, setInlineEditing] = useState<Record<string, boolean>>({})
  /** 內聯編輯臨時表單值 */
  const [inlineForm, setInlineForm] = useState<Record<string, Partial<OrganicScoreRule>>>({})
  /** PLT_03 屏蔽商家輸入框臨時值 */
  const [blockedMerchantInput, setBlockedMerchantInput] = useState('')
  /** PLT_03 門店選擇彈窗狀態 */
  const [storeModalVisible, setStoreModalVisible] = useState(false)
  /** 門店彈窗是否為只讀模式 */
  const [storeModalReadOnly, setStoreModalReadOnly] = useState(false)
  const [storeSearchForm] = Form.useForm()
  const [tempBlockedStores, setTempBlockedStores] = useState<{ storeCode: string; storeName: string; groupCode: string; groupName: string }[]>([])
  const [dbStores, setDbStores] = useState<{ storeCode: string; storeName: string; groupCode: string; groupName: string }[]>([])
  const [storeSearchValues, setStoreSearchValues] = useState<{ groupKeyword?: string; storeKeyword?: string }>({})

  /** 加載門店數據（屏蔽商家選擇用） */
  useEffect(() => {
    fetchStores({ page: 1, size: 500 }).then(res => {
      setDbStores(res.records.map(s => ({
        storeCode: s.storeCode,
        storeName: s.storeName,
        groupCode: s.groupCode,
        groupName: s.groupName,
      })))
    }).catch(() => { /* 靜默請求 */ })
  }, [])

  /** 門店搜索過濾 */
  const filteredStores = useMemo(() => {
    return dbStores.filter(s => {
      if (storeSearchValues.groupKeyword) {
        const kw = storeSearchValues.groupKeyword.toLowerCase()
        if (!s.groupCode.toLowerCase().includes(kw) && !s.groupName.toLowerCase().includes(kw)) return false
      }
      if (storeSearchValues.storeKeyword) {
        const kw = storeSearchValues.storeKeyword.toLowerCase()
        if (!s.storeCode.toLowerCase().includes(kw) && !s.storeName.toLowerCase().includes(kw)) return false
      }
      return true
    })
  }, [storeSearchValues, dbStores])

  /** 門店下拉選項（去重） */
  const storeGroupOptions = useMemo(() => {
    const map = new Map<string, { label: string; value: string }>()
    dbStores.forEach(s => {
      if (!map.has(s.groupCode)) map.set(s.groupCode, { label: `${s.groupCode} - ${s.groupName}`, value: s.groupCode })
    })
    return Array.from(map.values())
  }, [dbStores])
  const storeNameOptions = useMemo(() => {
    const map = new Map<string, { label: string; value: string }>()
    dbStores.forEach(s => {
      if (!map.has(s.storeCode)) map.set(s.storeCode, { label: `${s.storeCode} - ${s.storeName}`, value: s.storeCode })
    })
    return Array.from(map.values())
  }, [dbStores])

  /** 進入內聯編輯模式 */
  const handleInlineEdit = (rule: OrganicScoreRule) => {
    setInlineEditing(prev => ({ ...prev, [rule.id]: true }))
    setInlineForm(prev => ({ ...prev, [rule.id]: { ...rule } }))
    // 自動展開詳情區
    if (!expandedRules[rule.id]) {
      setExpandedRules(prev => ({ ...prev, [rule.id]: true }))
    }
  }
  /** 取消內聯編輯 */
  const handleInlineCancel = (ruleId: string) => {
    setInlineEditing(prev => { const n = { ...prev }; delete n[ruleId]; return n })
    setInlineForm(prev => { const n = { ...prev }; delete n[ruleId]; return n })
  }
  /** 保存內聯編輯 */
  const handleInlineSave = async (ruleId: string) => {
    const values = inlineForm[ruleId]
    if (!values) return
    // PLT_03 梯度配置校驗：不允許空值
    if (ruleId === 'PLT_03') {
      const tiers: ScoreTier[] = values.tiers || []
      if (tiers.length === 0) {
        message.warning('請至少配置一個梯度')
        return
      }
      for (let i = 0; i < tiers.length; i++) {
        if (!tiers[i].threshold || tiers[i].threshold <= 0) {
          message.warning(`第 ${i + 1} 個梯度請輸入訂單量閾值`)
          return
        }
        if (tiers[i].score === undefined || tiers[i].score === null) {
          message.warning(`第 ${i + 1} 個梯度請輸入加分分數`)
          return
        }
      }
    }
    // PLT_04 梯度配置校驗：不允許空值
    if (ruleId === 'PLT_04') {
      const tiers: ScoreTier[] = values.tiers || []
      if (tiers.length === 0) {
        message.warning('請至少配置一個梯度')
        return
      }
      for (let i = 0; i < tiers.length; i++) {
        if (!tiers[i].threshold || tiers[i].threshold <= 0) {
          message.warning(`第 ${i + 1} 個梯度請輸入訂單量閾值`)
          return
        }
        if (tiers[i].score === undefined || tiers[i].score === null) {
          message.warning(`第 ${i + 1} 個梯度請輸入減分分數`)
          return
        }
      }
    }
    // STB_05 出餐速度校驗：統計天數 + 超均值扣分
    if (ruleId === 'STB_05') {
      if (!(values as any).statDaysTotal || (values as any).statDaysTotal <= 0) {
        message.warning('請配置統計天數')
        return
      }
      const items: ScoreConditionItem[] = (values as any).conditionItems || []
      const deductionItem = items.find(i => i.condition === 'over_avg_deduction')
      if (!deductionItem || deductionItem.score === undefined || deductionItem.score === null || deductionItem.score <= 0) {
        message.warning('請配置超均值扣分分值')
        return
      }
    }
    // STB_06 拒絕接單校驗：統計天數 + 每單扣分
    if (ruleId === 'STB_06') {
      if (!values.statDays || values.statDays <= 0) {
        message.warning('請配置統計天數')
        return
      }
      if (!(values as any).deductionPerOrder || (values as any).deductionPerOrder <= 0) {
        message.warning('請配置每單扣分分值')
        return
      }
    }
    // STB_07 出餐超時校驗：統計天數 + 每單扣分
    if (ruleId === 'STB_07') {
      if (!values.statDays || values.statDays <= 0) {
        message.warning('請配置統計天數')
        return
      }
      if (!(values as any).deductionPerOrder || (values as any).deductionPerOrder <= 0) {
        message.warning('請配置每單扣分分值')
        return
      }
    }
    // STB_08 取消訂單校驗：統計天數 + 每單扣分
    if (ruleId === 'STB_08') {
      if (!values.statDays || values.statDays <= 0) {
        message.warning('請配置統計天數')
        return
      }
      if (!(values as any).deductionPerOrder || (values as any).deductionPerOrder <= 0) {
        message.warning('請配置每單扣分分值')
        return
      }
    }
    // STB_09 超時接單校驗：統計天數 + 每單扣分
    if (ruleId === 'STB_09') {
      if (!values.statDays || values.statDays <= 0) {
        message.warning('請配置統計天數')
        return
      }
      if (!(values as any).deductionPerOrder || (values as any).deductionPerOrder <= 0) {
        message.warning('請配置每單扣分分值')
        return
      }
    }
    // PLT_01 距離衰減校驗：滿分 + 衰減係數
    if (ruleId === 'PLT_01') {
      if (values.score === undefined || values.score < 0) {
        message.warning('請配置滿分分值')
        return
      }
      if (!(values as any).decayCoefficient || (values as any).decayCoefficient <= 0) {
        message.warning('請配置衰減係數')
        return
      }
    }
    // PLT_02A 配送範圍校驗：每個時段至少有一個分值配置
    if (ruleId === 'PLT_02A') {
      const trs = (values as any).timeRangeScores as TimeRangeScores | undefined
      if (!trs || !TIME_PERIOD_KEYS.some(k => trs[k])) {
        message.warning('請至少配置一個時段的配送範圍分值')
        return
      }
    }
    const payload = {
      dimension: values.dimension!,
      name: values.name!,
      description: values.description!,
      mode: values.mode!,
      score: values.score,
      prerequisites: values.prerequisites,
      statDays: values.statDays,
      rangeScores: values.rangeScores ? JSON.stringify(values.rangeScores) : undefined,
      tiers: values.tiers ? JSON.stringify(values.tiers) : undefined,
      conditionItems: values.conditionItems ? JSON.stringify(values.conditionItems) : undefined,
      calcCycle: values.calcCycle,
      calcIntervalHours: values.calcIntervalHours,
      statDaysTotal: values.statDaysTotal,
      statDaysRecent: values.statDaysRecent,
      peakTimeRanges: values.peakTimeRanges ? JSON.stringify(values.peakTimeRanges) : undefined,
      deductionPerOrder: (values as any).deductionPerOrder,
      decayCoefficient: (values as any).decayCoefficient,
      timeRangeScores: (values as any).timeRangeScores ? JSON.stringify((values as any).timeRangeScores) : undefined,
      blockedMerchants: (values as any).blockedMerchants ? JSON.stringify((values as any).blockedMerchants) : undefined,
      status: values.status!,
    }
    try {
      const vo = await updateOrganicRule(ruleId as unknown as number, payload)
      // 保留前端編輯過的前提條件（API 可能未返回該字段）
      const savedRule = voToRule(vo)
      if (values.prerequisites !== undefined) {
        savedRule.prerequisites = values.prerequisites
      }
      // 保留前端編輯過的屏蔽商家（API 可能未返回該字段）
      if ((values as any).blockedMerchants !== undefined) {
        savedRule.blockedMerchants = (values as any).blockedMerchants
      }
      setRules(prev => prev.map(r => r.id === ruleId ? savedRule : r))
      message.success(t('organicTrafficScore.updateSuccess', { name: values.name }))
    } catch {
      setRules(prev => prev.map(r => r.id === ruleId ? { ...r, ...values } as OrganicScoreRule : r))
      message.success(t('organicTrafficScore.updateSuccess', { name: values.name }))
    }
    handleInlineCancel(ruleId)
  }

  // 排名規則說明彈窗
  const [ruleModalOpen, setRuleModalOpen] = useState(false)

  // 新增/編輯彈窗
  const [modalOpen, setModalOpen] = useState(false)
  const [editingRule, setEditingRule] = useState<OrganicScoreRule | null>(null)
  const [modalDimension, setModalDimension] = useState<ScoreDimension>(ScoreDimension.COMMERCIAL)
  const [ruleForm] = Form.useForm<RuleFormValues>()
  /** 監聽彈窗內計分方式，金額倍率時分值字段填倍率 */
  const ruleFormMode = Form.useWatch('mode', ruleForm)
  /** 梯度檔位本地狀態（彈窗內編輯） */
  const [tierRows, setTierRows] = useState<ScoreTier[]>([])
  /** 條件計分子項本地狀態（彈窗內編輯） */
  const [conditionRows, setConditionRows] = useState<ScoreConditionItem[]>([])
  /** 新增彈窗中選中的模板 ID */
  const [addTemplateId, setAddTemplateId] = useState<string | undefined>(undefined)

  /** 權重總和（用於校驗提示） */
  const weightTotal = useMemo(
    () => DIMENSION_ORDER.reduce((sum, d) => sum + (dimensionWeight[d] || 0), 0),
    [dimensionWeight],
  )

  /** 保存維度權重 */
  const handleSaveWeights = async () => {
    if (weightTotal !== DIMENSION_WEIGHT_TOTAL) {
      message.warning(t('organicTrafficScore.needEqual', { total: DIMENSION_WEIGHT_TOTAL }))
      return
    }
    setSavingWeights(true)
    try {
      const payload = DIMENSION_ORDER.map(d => ({ dimension: d, weight: dimensionWeight[d] }))
      await apiUpdateWeights(payload)
      message.success(t('organicTrafficScore.weightSaveSuccess'))
    } catch {
      // 後端不可用時僅提示
      message.info(t('organicTrafficScore.weightSaveLocalOnly'))
    } finally {
      setSavingWeights(false)
    }
  }

  /** 按維度取規則 */
  const getRules = (dimension: ScoreDimension) =>
    rules.filter(r => r.dimension === dimension)

  /** 按維度取規則並疊加關鍵字 / 狀態篩選 */
  const getFilteredRules = (dimension: ScoreDimension) => {
    const kw = keyword.trim().toLowerCase()
    return getRules(dimension).filter(r => {
      const matchStatus = statusFilter === undefined || r.status === statusFilter
      const matchKeyword = kw === ''
        || r.name.toLowerCase().includes(kw)
        || r.id.toLowerCase().includes(kw)
        || r.description.toLowerCase().includes(kw)
      return matchStatus && matchKeyword
    })
  }

  /** 切換維度時重置篩選條件 */
  const handleDimensionChange = (key: string) => {
    setActiveDimension(Number(key) as ScoreDimension)
    setKeyword('')
    setStatusFilter(undefined)
  }


  /** 打開新增彈窗 */
  const handleOpenAdd = (dimension: ScoreDimension) => {
    setEditingRule(null)
    setModalDimension(dimension)
    setAddTemplateId(undefined)
    ruleForm.resetFields()
    setTierRows([])
    setConditionRows([])
    setModalOpen(true)
  }

  /** 選擇模板後預填表單 */
  const handleSelectTemplate = (templateId: string) => {
    setAddTemplateId(templateId)
    const tpl = DEFAULT_ORGANIC_SCORE_RULES.find(r => r.id === templateId)
    if (!tpl) return
    ruleForm.setFieldsValue({
      name: tpl.name,
      description: tpl.description,
      mode: tpl.mode,
      score: tpl.score ?? 0,
      statDays: tpl.statDays,
      rangeScores: tpl.rangeScores ? { ...tpl.rangeScores } : undefined,
      status: tpl.status ?? ServiceStatus.ENABLED,
    } as any)
    // 重置梯度/條件行
    setTierRows(tpl.tiers ? [...tpl.tiers] : [])
    setConditionRows(tpl.conditionItems ? [...tpl.conditionItems] : [])
  }

  /** 當前選中的模板 */
  const selectedTemplate = addTemplateId ? DEFAULT_ORGANIC_SCORE_RULES.find(r => r.id === addTemplateId) : undefined
  /** 模板是否已被添加到列表 */
  const isTemplateDuplicate = addTemplateId ? rules.some(r => r.id === addTemplateId) : false
  /** 當前維度可用的模板選項 */
  const availableTemplates = DEFAULT_ORGANIC_SCORE_RULES.filter(r => r.dimension === modalDimension)


  /** 保存評分項（新增或編輯） */
  const handleSaveRule = async () => {
    const values = await ruleForm.validateFields()

    // ===== 新增模式：模板校驗 =====
    if (!editingRule) {
      if (!addTemplateId) {
        message.warning('請選擇一個評分項模板')
        return
      }
      if (rules.some(r => r.id === addTemplateId)) {
        message.error('該評分項已配置，不可重複添加')
        return
      }
      const tpl = DEFAULT_ORGANIC_SCORE_RULES.find(r => r.id === addTemplateId)
      if (!tpl) {
        message.error('模板不存在，請重新選擇')
        return
      }
      // 模板特有參數校驗
      if (tpl.mode === ScoreMode.RULE_DEDUCTION) {
        if (!values.statDays || values.statDays <= 0) {
          message.warning('請配置統計天數')
          return
        }
        if (!(values as any).deductionPerOrder || (values as any).deductionPerOrder <= 0) {
          message.warning('請配置每單扣分分值')
          return
        }
      }
      if (tpl.id === 'PLT_01') {
        if (values.score === undefined || values.score < 0) {
          message.warning('請配置滿分分值')
          return
        }
        if (!(values as any).decayCoefficient || (values as any).decayCoefficient <= 0) {
          message.warning('請配置衰減係數')
          return
        }
      }
      if (tpl.id === 'PLT_02A') {
        const trs = (values as any).timeRangeScores
        if (!trs || !TIME_PERIOD_KEYS.some(k => trs[k])) {
          message.warning('請至少配置一個時段的配送範圍分值')
          return
        }
      }
    }

    // 梯度計分模式時，將 tierRows 寫入 tiers
    if (values.mode === ScoreMode.TIERED) {
      if (tierRows.length === 0) {
        message.warning('請至少配置一個梯度檔位')
        return
      }
      values.tiers = [...tierRows]
    }
    // 條件計分模式時，將 conditionRows 寫入 conditionItems
    if (values.mode === ScoreMode.CONDITIONAL) {
      if (conditionRows.length === 0) {
        message.warning('請至少配置一組條件分值')
        return
      }
      values.conditionItems = [...conditionRows]
    }
    const payload = {
      dimension: editingRule ? editingRule.dimension : modalDimension,
      name: values.name,
      description: values.description,
      mode: values.mode,
      score: values.score,
      prerequisites: values.prerequisites,
      statDays: values.statDays,
      rangeScores: values.rangeScores ? JSON.stringify(values.rangeScores) : undefined,
      tiers: values.tiers ? JSON.stringify(values.tiers) : undefined,
      conditionItems: values.conditionItems ? JSON.stringify(values.conditionItems) : undefined,
      calcCycle: values.calcCycle,
      statDaysTotal: values.statDaysTotal,
      statDaysRecent: values.statDaysRecent,
      peakTimeRanges: values.peakTimeRanges ? JSON.stringify(values.peakTimeRanges) : undefined,
      deductionPerOrder: (values as any).deductionPerOrder,
      decayCoefficient: (values as any).decayCoefficient,
      timeRangeScores: (values as any).timeRangeScores ? JSON.stringify((values as any).timeRangeScores) : undefined,
      status: values.status,
    }
    try {
      if (editingRule) {
        const vo = await updateOrganicRule(editingRule.id as unknown as number, payload)
        setRules(prev => prev.map(r => r.id === editingRule.id ? voToRule(vo) : r))
        message.success(t('organicTrafficScore.updateSuccess', { name: values.name }))
      } else {
        const vo = await createOrganicRule(payload)
        const newRule = voToRule(vo)
        setRules(prev => [...prev, newRule])
        message.success(t('organicTrafficScore.addSuccess', { name: values.name }))
      }
      setModalOpen(false)
    } catch {
      // API 失敗時回退本地更新
      if (editingRule) {
        setRules(prev => prev.map(r => r.id === editingRule.id ? { ...r, ...values } : r))
      } else {
        // API 失敗時使用模板 ID 作為回退
        const tpl = DEFAULT_ORGANIC_SCORE_RULES.find(r => r.id === addTemplateId)
        const fallbackId = addTemplateId || `${modalDimension === ScoreDimension.COMMERCIAL ? 'COM' : modalDimension === ScoreDimension.PLATFORM ? 'PLT' : 'ST'}_CUSTOM_${Date.now()}`
        const newRule: OrganicScoreRule = {
          ...values,
          id: fallbackId,
          dimension: modalDimension,
          builtin: tpl?.builtin ?? false,
        }
        if (tpl) {
          newRule.name = tpl.name
          newRule.description = tpl.description
          newRule.mode = tpl.mode
        }
        setRules(prev => [...prev, newRule])
      }
      setModalOpen(false)
    }
  }

  /** 啟用/停用評分項 */
  const handleToggleStatus = (record: OrganicScoreRule) => {
    const newStatus = record.status === ServiceStatus.ENABLED ? ServiceStatus.DISABLED : ServiceStatus.ENABLED
    const actionText = newStatus === ServiceStatus.ENABLED ? t('common.enable') : t('common.disable')
    Modal.confirm({
      title: t('organicTrafficScore.confirmToggle', { action: actionText }),
      content: t('organicTrafficScore.confirmToggleContent', { action: actionText, name: record.name }),
      okText: t('common.confirm'),
      cancelText: t('common.cancel'),
      onOk: async () => {
        try {
          await toggleOrganicRuleStatus(record.id as unknown as number)
        } catch { /* 後端不可用時靜默回退 */ }
        setRules(prev => prev.map(r => r.id === record.id ? { ...r, status: newStatus } : r))
        message.success(t('organicTrafficScore.toggleSuccess', { action: actionText, name: record.name }))
      },
    })
  }

  /** 刪除自定義評分項 */
  const handleDelete = (record: OrganicScoreRule) => {
    Modal.confirm({
      title: t('common.confirmDelete'),
      content: t('organicTrafficScore.confirmDeleteContent', { name: record.name }),
      okText: t('common.confirm'),
      cancelText: t('common.cancel'),
      okButtonProps: { danger: true },
      onOk: async () => {
        try {
          await deleteOrganicRule(record.id as unknown as number)
        } catch { /* 後端不可用時靜默回退 */ }
        setRules(prev => prev.filter(r => r.id !== record.id))
        message.success(t('common.deleteSuccess'))
      },
    })
  }


  /** 渲染一組評分項：븩選工具條 + 可展開列表（參考規則配置菜單佈局） */
  const renderRulePanel = (dimension: ScoreDimension) => {
    const total = getRules(dimension)
    const data = getFilteredRules(dimension)
    const enabledCount = total.filter(r => r.status === ServiceStatus.ENABLED).length
    return (
      <>
        {/* 篩選工具條 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
          <Input
            allowClear
            value={keyword}
            prefix={<SearchOutlined style={{ color: '#BFBFBF' }} />}
            placeholder={t('organicTrafficScore.searchPlaceholder')}
            style={{ width: 260 }}
            onChange={e => setKeyword(e.target.value)}
          />
          <Select
            allowClear
            value={statusFilter}
            placeholder={t('organicTrafficScore.allStatus')}
            style={{ width: 130 }}
            options={[
              { label: t('common.enable'), value: ServiceStatus.ENABLED },
              { label: t('common.disable'), value: ServiceStatus.DISABLED },
            ]}
            onChange={val => setStatusFilter(val)}
          />
          <span style={{ fontSize: 12, color: '#8C8C8C' }}>
            {t('organicTrafficScore.statsTotal', { total: total.length, enabled: enabledCount })}{data.length !== total.length ? t('organicTrafficScore.statsFiltered', { count: data.length }) : ''}
          </span>
          {!readOnly && (
            <Button
              type="primary"
              icon={<PlusOutlined />}
              style={{ marginLeft: 'auto' }}
              onClick={() => handleOpenAdd(dimension)}
            >
              {t('organicTrafficScore.addConfig')}
            </Button>
          )}
        </div>

        {/* 可展開規則列表（參考規則配置菜單風格） */}
        <div style={{ border: '1px solid #f0f0f0', borderRadius: 8, overflow: 'hidden' }}>
          {data.length === 0 && (
            <div style={{ padding: 40, textAlign: 'center', color: '#bfbfbf', fontSize: 13 }}>暫無評分項配置</div>
          )}
          {data.map((rule, idx) => {
            const isExpanded = !!expandedRules[rule.id]
            const { color: dimColor } = SCORE_DIMENSION_COLOR[dimension]
            return (
              <div key={rule.id} style={{
                borderTop: idx > 0 ? '1px solid #f5f5f5' : 'none',
                transition: 'background 0.2s',
              }}>
                {/* ── 主行（點擊展開/折疀） ── */}
                <div
                  onClick={() => setExpandedRules(prev => ({ ...prev, [rule.id]: !prev[rule.id] }))}
                  style={{
                    display: 'flex', alignItems: 'center',
                    padding: '14px 20px', cursor: 'pointer', userSelect: 'none',
                    background: isExpanded ? '#FAFAFA' : '#fff',
                  }}
                  onMouseEnter={e => { if (!isExpanded) e.currentTarget.style.background = '#FAFAFA' }}
                  onMouseLeave={e => { if (!isExpanded) e.currentTarget.style.background = '#fff' }}
                >
                  {/* 展開/折疀箭頭 */}
                  <span style={{
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    width: 20, height: 20, borderRadius: 4, marginRight: 10, flexShrink: 0,
                    background: isExpanded ? dimColor : '#E8E8E8',
                    transition: 'all 0.2s',
                  }}>
                    {isExpanded
                      ? <UpOutlined style={{ fontSize: 10, color: '#fff' }} />
                      : <DownOutlined style={{ fontSize: 10, color: '#8C8C8C' }} />
                    }
                  </span>
                  {/* 規則ID */}
                  <Tag color="blue" style={{ fontSize: 11, margin: 0 }}>{rule.id}</Tag>
                  <span style={{ width: 14, flexShrink: 0 }} />
                  {/* 規則名稱 */}
                  <span style={{ fontWeight: 500, color: '#262626', fontSize: 14 }}>{rule.name}</span>
                  {/* 右側：狀態 + 操作 */}
                  <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
                    <Tag color={rule.status === ServiceStatus.ENABLED ? 'success' : 'default'} style={{ margin: 0 }}>
                      {rule.status === ServiceStatus.ENABLED ? t('common.enable') : t('common.disable')}
                    </Tag>
                    {!readOnly && (
                      <Space size={0} split={<span style={{ color: '#d9d9d9' }}>|</span>}>
                        <Button
                          type="link" size="small"
                          danger={rule.status === ServiceStatus.ENABLED}
                          style={rule.status !== ServiceStatus.ENABLED ? { color: '#52c41a' } : undefined}
                          onClick={e => { e.stopPropagation(); handleToggleStatus(rule) }}
                        >
                          {rule.status === ServiceStatus.ENABLED ? t('common.disable') : t('common.enable')}
                        </Button>
                        <Button type="link" size="small" danger onClick={e => { e.stopPropagation(); handleDelete(rule) }}>{t('common.delete')}</Button>
                      </Space>
                    )}
                  </div>
                </div>

                {/* ── 展開詳情區 ── */}
                {isExpanded && (() => {
                  const isEditingInline = !!inlineEditing[rule.id]
                  const form = inlineForm[rule.id] || rule
                  return (
                  <div style={{
                    padding: '16px 20px 16px 50px',
                    background: isEditingInline ? '#FFFBE6' : '#FAFAFA',
                    borderTop: '1px solid ' + (isEditingInline ? '#FFE58F' : '#f0f0f0'),
                  }}>
                    {/* ── 元信息行：顯示模式展示信息 + 編輯按鈕 ── */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
                      {!isEditingInline && (
                        <>
                          {rule.id !== 'STB_02' && rule.id !== 'STB_03' && rule.id !== 'PLT_03' && rule.id !== 'PLT_04' && rule.id !== 'STB_05' && rule.id !== 'STB_06' && rule.id !== 'STB_07' && rule.id !== 'STB_08' && rule.id !== 'STB_09' && rule.id !== 'PLT_01' && (
                            <Tag color={SCORE_MODE_COLOR[rule.mode]} style={{ fontSize: 11, margin: 0 }}>
                              {(rule.id === 'COM_01' || rule.id === 'COM_02' || rule.id === 'COM_03' || rule.id === 'COM_04' || rule.id === 'COM_05' || rule.id === 'COM_06' || rule.id === 'COM_07' || rule.id === 'COM_09' || rule.id === 'COM_10' || rule.id === 'STB_01' || rule.id === 'STB_04' || rule.id === 'PLT_02A')
                                ? (rule.mode === ScoreMode.AMOUNT_MULTIPLIER ? '動態加分' : '固定加分')
                                : MODE_LABEL[rule.mode]}
                            </Tag>
                          )}
                          {rule.id === 'STB_02' && (
                            <Tag color="#722ED1" style={{ fontSize: 11, margin: 0 }}>四檔狀態計分</Tag>
                          )}
                          {rule.id === 'STB_03' && (
                            <Tag color="#722ED1" style={{ fontSize: 11, margin: 0 }}>雙檔評價計分</Tag>
                          )}
                          {rule.id === 'PLT_03' && (
                            <Tag color="#722ED1" style={{ fontSize: 11, margin: 0 }}>梯度扶持計分</Tag>
                          )}
                          {rule.id === 'PLT_04' && (
                            <Tag color="#722ED1" style={{ fontSize: 11, margin: 0 }}>梯度降權計分</Tag>
                          )}
                          {rule.id === 'STB_05' && (
                            <Tag color="#722ED1" style={{ fontSize: 11, margin: 0 }}>時間窗口對比</Tag>
                          )}
                          {rule.id === 'STB_06' && (
                            <Tag color="#722ED1" style={{ fontSize: 11, margin: 0 }}>按次計罰</Tag>
                          )}
                          {rule.id === 'STB_07' && (
                            <Tag color="#722ED1" style={{ fontSize: 11, margin: 0 }}>按次計罰</Tag>
                          )}
                          {rule.id === 'STB_08' && (
                            <Tag color="#722ED1" style={{ fontSize: 11, margin: 0 }}>按次計罰</Tag>
                          )}
                          {rule.id === 'STB_09' && (
                            <Tag color="#722ED1" style={{ fontSize: 11, margin: 0 }}>按次計罰</Tag>
                          )}
                          {rule.id === 'PLT_01' && (
                            <Tag color="#1890FF" style={{ fontSize: 11, margin: 0 }}>距離衰減</Tag>
                          )}
                          {rule.id !== 'STB_02' && rule.id !== 'STB_03' && rule.id !== 'PLT_03' && rule.id !== 'PLT_04' && rule.id !== 'STB_05' && rule.id !== 'STB_06' && rule.id !== 'STB_07' && rule.id !== 'STB_08' && rule.id !== 'STB_09' && rule.id !== 'PLT_01' && rule.id !== 'PLT_02A' && ((rule.id === 'COM_01' || rule.id === 'COM_02' || rule.id === 'COM_03' || rule.id === 'COM_04' || rule.id === 'COM_05' || rule.id === 'COM_06' || rule.id === 'COM_07' || rule.id === 'COM_09' || rule.id === 'COM_10' || rule.id === 'STB_01' || rule.id === 'STB_04') ? (
                            rule.mode === ScoreMode.AMOUNT_MULTIPLIER
                              ? <span style={{ fontSize: 13, fontWeight: 600, color: '#E8720C' }}>倍率 ×{rule.score} <span style={{ fontSize: 11, fontWeight: 400, color: '#8C8C8C' }}>({rule.id === 'COM_01' ? '立減金額' : rule.id === 'COM_02' ? '運費金額' : rule.id === 'COM_03' ? '領券金額' : rule.id === 'COM_04' ? '新客立減金額' : rule.id === 'COM_05' ? '贈券金額' : rule.id === 'COM_06' ? '紅包金額' : rule.id === 'COM_07' ? '神券金額' : '廣告金額'} × 倍率 = 得分)</span></span>
                              : <span style={{ fontSize: 13, fontWeight: 600, color: '#52C41A' }}>分值 +{rule.score} 分 <span style={{ fontSize: 11, fontWeight: 400, color: '#8C8C8C' }}>（直接加固定分）</span></span>
                          ) : (
                            <>
                              {rule.mode === ScoreMode.RULE_BONUS && (
                                <span style={{ fontSize: 13, fontWeight: 600, color: '#52C41A' }}>+{rule.score} 分</span>
                              )}
                              {rule.mode === ScoreMode.RULE_DEDUCTION && (
                                <span style={{ fontSize: 13, fontWeight: 600, color: '#FF4D4F' }}>{rule.score} 分</span>
                              )}
                              {rule.mode === ScoreMode.DECAY && (
                                <span style={{ fontSize: 13, fontWeight: 600, color: '#722ED1' }}>{rule.score} 分</span>
                              )}
                              {rule.mode === ScoreMode.AMOUNT_MULTIPLIER && (
                                <span style={{ fontSize: 13, fontWeight: 600, color: '#E8720C' }}>×{rule.score}</span>
                              )}
                            </>
                          ))}

                          {!readOnly && (
                            <div style={{ flexShrink: 0 }}>
                              <Button size="small" icon={<EditOutlined />} onClick={() => handleInlineEdit(rule)}
                                style={{ borderRadius: 4, borderColor: '#E8720C', color: '#E8720C', fontSize: 12, height: 28 }}>
                                編輯
                              </Button>
                            </div>
                          )}
                        </>
                      )}
                    </div>

                    {/* ── 內容區：顯示模式 vs 編輯模式 ── */}
                    {!isEditingInline ? (
                      /* 顯示模式 */
                      <>
                        {rule.mode === ScoreMode.CONDITIONAL && rule.conditionItems?.length && rule.id !== 'STB_02' && rule.id !== 'STB_03' && rule.id !== 'STB_05' && (
                          <div>
                            <div style={{ fontSize: 12, fontWeight: 600, color: '#262626', marginBottom: 8 }}>條件分值明細（{rule.conditionItems.length} 組）</div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                              {rule.conditionItems.map((item: ScoreConditionItem, i: number) => (
                                <div key={i} style={{
                                  display: 'flex', alignItems: 'center', gap: 8,
                                  padding: '8px 12px', borderRadius: 6,
                                  background: item.score >= 0 ? '#f6ffed' : '#fff2f0',
                                  border: `1px solid ${item.score >= 0 ? '#b7eb8f' : '#ffccc7'}`,
                                }}>
                                  <span style={{ fontSize: 12, color: '#8C8C8C', minWidth: 24 }}>#{i + 1}</span>
                                  <span style={{ fontSize: 13, color: '#595959', flex: 1 }}>{item.condition}</span>
                                  <span style={{ fontWeight: 600, fontSize: 14, color: item.score >= 0 ? '#52C41A' : '#FF4D4F' }}>
                                    {item.score >= 0 ? '+' : ''}{item.score} 分
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                        {/* STB_02 營業狀態配置只讀顯示 */}
                        {rule.id === 'STB_02' && (() => {
                          const defaultSTB02 = DEFAULT_ORGANIC_SCORE_RULES.find(r => r.id === 'STB_02')
                          const items = rule.conditionItems?.length ? rule.conditionItems : (defaultSTB02?.conditionItems || [])
                          return (
                          <div style={{ padding: '14px 16px', background: '#FAFAFA', borderRadius: 8, border: '1px solid #F0F0F0' }}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                              {[
                                { key: 'operating', label: '營業額中狀態', desc: '正常營業中' },
                                { key: 'shortBreak', label: '休息一會，馬上回來', desc: '短暫休息後恢復營業' },
                                { key: 'overload', label: '爆單了，暫停接單一會', desc: '訂單量超過承載能力' },
                                { key: 'closed', label: '休息打烊', desc: '當日不再營業' },
                              ].map((item, idx) => {
                                const condItem = items[idx] || { condition: 'bonus', score: 0 }
                                const isBonus = condItem.condition !== 'deduction'
                                const isLast = idx === 3
                                return (
                                  <div key={item.key} style={{
                                    display: 'grid', gridTemplateColumns: '140px 80px 1fr', gap: 12, alignItems: 'center',
                                    padding: '10px 0',
                                    borderBottom: isLast ? 'none' : '1px dashed #E8E8E8',
                                  }}>
                                    <div>
                                      <div style={{ fontSize: 13, color: '#262626', fontWeight: 500, lineHeight: '20px' }}>{item.label}</div>
                                      <div style={{ fontSize: 11, color: '#8C8C8C', lineHeight: '16px' }}>{item.desc}</div>
                                    </div>
                                    <span style={{
                                      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                                      height: 24, minWidth: 72, borderRadius: 4, fontSize: 12, fontWeight: 600,
                                      color: isBonus ? '#52C41A' : '#FF4D4F',
                                      background: isBonus ? '#f6ffed' : '#fff2f0',
                                      border: `1px solid ${isBonus ? '#b7eb8f' : '#ffccc7'}`,
                                    }}>
                                      {isBonus ? '固定加分' : '固定減分'}
                                    </span>
                                    <span style={{
                                      fontSize: 15, fontWeight: 600,
                                      color: isBonus ? '#52C41A' : '#FF4D4F',
                                    }}>
                                      {isBonus ? '+' : '-'}{condItem.score} 分
                                    </span>
                                  </div>
                                )
                              })}
                            </div>
                          </div>
                          )
                        })()}
                        {/* STB_03 評價得分配置只讀顯示（5 星） */}
                        {rule.id === 'STB_03' && (() => {
                          const defaultSTB03 = DEFAULT_ORGANIC_SCORE_RULES.find(r => r.id === 'STB_03')
                          const items = rule.conditionItems?.length === 5 ? rule.conditionItems : (defaultSTB03?.conditionItems || [])
                          const parseMode = (cond: string) => {
                            if (cond === 'fixed_bonus') return { badge: '固定加分', color: '#52C41A', bg: '#f6ffed', border: '#b7eb8f' }
                            if (cond === 'fixed_deduction') return { badge: '固定減分', color: '#FF4D4F', bg: '#fff2f0', border: '#ffccc7' }
                            if (cond === 'dynamic_bonus') return { badge: '動態加分', color: '#52C41A', bg: '#f6ffed', border: '#b7eb8f' }
                            if (cond === 'dynamic_deduction') return { badge: '動態減分', color: '#FF4D4F', bg: '#fff2f0', border: '#ffccc7' }
                            return { badge: '固定加分', color: '#52C41A', bg: '#f6ffed', border: '#b7eb8f' }
                          }
                          return (
                          <div style={{ padding: '14px 16px', background: '#FAFAFA', borderRadius: 8, border: '1px solid #F0F0F0' }}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                              {[5, 4, 3, 2, 1].map((star, idx) => {
                                const condItem = items[idx] || { condition: 'fixed_bonus', score: 0 }
                                const m = parseMode(condItem.condition)
                                const isDynamic = condItem.condition.startsWith('dynamic')
                                const isLast = idx === 4
                                return (
                                  <div key={star} style={{
                                    display: 'grid', gridTemplateColumns: '120px 100px 1fr', gap: 12, alignItems: 'center',
                                    padding: '10px 0',
                                    borderBottom: isLast ? 'none' : '1px dashed #E8E8E8',
                                  }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap' }}>
                                      <span style={{ fontSize: 12, color: '#595959', fontWeight: 500 }}>{star}星</span>
                                      <span style={{ fontSize: 18, letterSpacing: 2, lineHeight: 1 }}>
                                        {Array.from({ length: 5 }, (_, i) => (
                                          <span key={i} style={{
                                            color: i < star ? '#FAAD14' : '#E8E8E8',
                                            textShadow: i < star ? '0 1px 3px rgba(250,173,20,0.4)' : 'none',
                                          }}>{i < star ? '★' : '☆'}</span>
                                        ))}
                                      </span>
                                    </div>
                                    <span style={{
                                      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                                      height: 24, minWidth: 72, borderRadius: 4, fontSize: 12, fontWeight: 600,
                                      color: m.color, background: m.bg, border: `1px solid ${m.border}`,
                                    }}>
                                      {m.badge}
                                    </span>
                                    <span style={{ fontSize: 15, fontWeight: 600, color: m.color }}>
                                      {isDynamic ? `${star} × ${condItem.score} = ${star * condItem.score} 分` : `${condItem.score} 分`}
                                    </span>
                                  </div>
                                )
                              })}
                            </div>
                            <div style={{ marginTop: 10, padding: '8px 12px', background: '#FFFBE6', borderRadius: 6, border: '1px solid #FFE58F', fontSize: 11, color: '#8C6D1F', lineHeight: 1.6 }}>
                              <span style={{ fontWeight: 600 }}>計分規則：</span>固定加分/減分 = 用戶評價訂單，所選的星級匹配對應配置分數，直接加/減分；動態加分/減分 = 用戶評價訂單，所選星級 × 配置倍數 = 最終分數，再根據規則加/減分。
                            </div>
                          </div>
                          )
                        })()}
                        {/* PLT_03 商家扶持自定義只讀顯示 */}
                        {rule.id === 'PLT_03' && (() => {
                          const tiers = rule.tiers || []
                          const days = rule.statDays || 30
                          const prereq = rule.prerequisites || 'UNCONDITIONAL'
                          const isUnconditional = prereq === 'UNCONDITIONAL'
                          const selectedConditions: string[] = isUnconditional ? [] : (() => { try { return JSON.parse(prereq) } catch { return [] } })()
                          const blocked = rule.blockedMerchants || []
                          return (
                            <div style={{ padding: '14px 16px', background: '#FAFAFA', borderRadius: 8, border: '1px solid #F0F0F0' }}>
                              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, flexWrap: 'wrap', gap: 8 }}>
                                <div style={{ fontSize: 13, color: '#595959' }}>
                                  <span style={{ fontWeight: 600, color: '#262626' }}>統計週期：</span>過去 <span style={{ fontWeight: 600, color: '#E8720C' }}>{days}</span> 天
                                </div>
                                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                                  <span style={{ fontSize: 11, fontWeight: 600, color: '#722ED1' }}>前提條件：</span>
                                  {isUnconditional ? (
                                    <Tag color="green" style={{ fontSize: 12, margin: 0 }}>無條件</Tag>
                                  ) : (
                                    <span style={{ display: 'inline-flex', gap: 6 }}>
                                      {PLT_03_PREREQ_OPTIONS.filter(o => selectedConditions.includes(o.value)).map(o => (
                                        <Tag key={o.value} color="blue" style={{ fontSize: 12, margin: 0 }}>{o.label}</Tag>
                                      ))}
                                    </span>
                                  )}
                                </div>
                              </div>
                              {blocked.length > 0 && (
                                <div style={{ marginBottom: 10, padding: '6px 12px', background: '#FFF2F0', borderRadius: 6, border: '1px solid #FFCCC7', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                                  <span style={{ fontSize: 11, fontWeight: 600, color: '#FF4D4F', whiteSpace: 'nowrap' }}>🚫 屏蔽商家（{blocked.length} 家）</span>
                                  <span style={{ display: 'inline-flex', gap: 4, flexWrap: 'wrap', alignItems: 'center' }}>
                                    {blocked.slice(0, 5).map(code => (
                                      <Tag key={code} color="error" style={{ fontSize: 11, margin: 0 }}>{code}</Tag>
                                    ))}
                                    {blocked.length > 5 && (
                                      <Tag
                                        color="error"
                                        style={{ fontSize: 11, margin: 0, cursor: 'pointer' }}
                                        onClick={() => {
                                          setStoreModalReadOnly(true)
                                          setTempBlockedStores(dbStores.filter(s => blocked.includes(s.storeCode)))
                                          storeSearchForm.resetFields()
                                          setStoreSearchValues({})
                                          setStoreModalVisible(true)
                                        }}
                                      >+{blocked.length - 5} 家</Tag>
                                    )}
                                  </span>
                                </div>
                              )}
                              <div style={{ fontSize: 12, fontWeight: 600, color: '#262626', marginBottom: 8 }}>梯度配置</div>
                              <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                                {tiers.map((tier, idx) => {
                                  const isLast = idx === tiers.length - 1
                                  return (
                                    <div key={idx} style={{
                                      display: 'flex', alignItems: 'center', gap: 8,
                                      padding: '10px 0',
                                      borderBottom: isLast ? 'none' : '1px dashed #E8E8E8',
                                    }}>
                                      <span style={{ fontSize: 12, color: '#8C8C8C', minWidth: 20 }}>#{idx + 1}</span>
                                      <span style={{ fontSize: 13, color: '#595959' }}>
                                        訂單量 ≤ <span style={{ fontWeight: 600, color: '#262626' }}>{tier.threshold}</span> 單
                                      </span>
                                      <span style={{
                                        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                                        height: 24, minWidth: 72, borderRadius: 4, fontSize: 12, fontWeight: 600,
                                        color: '#52C41A',
                                        background: '#f6ffed',
                                        border: '1px solid #b7eb8f',
                                      }}>
                                        固定加分
                                      </span>
                                      <span style={{ fontSize: 15, fontWeight: 600, color: '#52C41A' }}>
                                        {tier.score} 分
                                      </span>
                                    </div>
                                  )
                                })}
                              </div>
                            </div>
                          )
                        })()}
                        {/* PLT_04 訂單過熱調控自定義只讀顯示 */}
                        {rule.id === 'PLT_04' && (() => {
                          const tiers = rule.tiers || []
                          const hours = rule.calcIntervalHours ?? 1
                          return (
                            <div style={{ padding: '14px 16px', background: '#FAFAFA', borderRadius: 8, border: '1px solid #F0F0F0' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                                <div style={{ fontSize: 13, color: '#595959' }}>
                                  <span style={{ fontWeight: 600, color: '#262626' }}>監控方式：</span>
                                  <span style={{ fontWeight: 600, color: '#722ED1' }}>定時監控</span>
                                  <span style={{ margin: '0 4px', color: '#8C8C8C' }}>·</span>
                                  <span>每 <span style={{ fontWeight: 600, color: '#E8720C' }}>{hours}</span> 小時校驗一次</span>
                                </div>
                              </div>
                              <div style={{ fontSize: 12, fontWeight: 600, color: '#262626', marginBottom: 8 }}>梯度配置</div>
                              <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                                {tiers.map((tier, idx) => {
                                  const isLast = idx === tiers.length - 1
                                  return (
                                    <div key={idx} style={{
                                      display: 'flex', alignItems: 'center', gap: 8,
                                      padding: '10px 0',
                                      borderBottom: isLast ? 'none' : '1px dashed #E8E8E8',
                                    }}>
                                      <span style={{ fontSize: 12, color: '#8C8C8C', minWidth: 20 }}>#{idx + 1}</span>
                                      <span style={{ fontSize: 13, color: '#595959' }}>
                                        訂單量 ≥ <span style={{ fontWeight: 600, color: '#262626' }}>{tier.threshold}</span> 單
                                      </span>
                                      <span style={{
                                        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                                        height: 24, minWidth: 72, borderRadius: 4, fontSize: 12, fontWeight: 600,
                                        color: '#FF4D4F',
                                        background: '#fff2f0',
                                        border: '1px solid #ffccc7',
                                      }}>
                                        固定減分
                                      </span>
                                      <span style={{ fontSize: 15, fontWeight: 600, color: '#FF4D4F' }}>
                                        {Math.abs(tier.score)} 分
                                      </span>
                                    </div>
                                  )
                                })}
                              </div>
                            </div>
                          )
                        })()}
                        {/* STB_05 出餐速度自定義只讀顯示 */}
                        {rule.id === 'STB_05' && (() => {
                          const totalDays = rule.statDaysTotal || 7
                          const items = rule.conditionItems || []
                          const deductionScore = items.find(i => i.condition === 'over_avg_deduction')?.score ?? 0
                          return (
                            <div style={{ padding: '14px 16px', background: '#FAFAFA', borderRadius: 8, border: '1px solid #F0F0F0' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 10, flexWrap: 'wrap' }}>
                                <div style={{ fontSize: 13, color: '#595959' }}>
                                  <span style={{ fontWeight: 600, color: '#262626' }}>統計天數：</span>
                                  過去 <span style={{ fontWeight: 600, color: '#E8720C' }}>{totalDays}</span> 天（不含當天）
                                </div>
                              </div>
                              <div style={{ fontSize: 12, fontWeight: 600, color: '#262626', marginBottom: 8 }}>計分規則</div>
                              <div style={{
                                display: 'flex', alignItems: 'center', gap: 12,
                                padding: '10px 0',
                              }}>
                                <div style={{ fontSize: 13, color: '#595959' }}>
                                  當日出餐時間 &gt; 過去 {totalDays} 天均值
                                </div>
                                <span style={{
                                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                                  height: 24, minWidth: 72, borderRadius: 4, fontSize: 12, fontWeight: 600,
                                  color: '#FF4D4F',
                                  background: '#fff2f0',
                                  border: '1px solid #ffccc7',
                                }}>
                                  固定扣分
                                </span>
                                <span style={{ fontWeight: 600, fontSize: 15, color: '#FF4D4F' }}>-{deductionScore} 分</span>
                              </div>
                              <div style={{ fontSize: 11, color: '#8C8C8C', marginTop: 8 }}>
                                備注：統計天數不含當天，統計期間內平均出餐時間作為基線，當天成餐時間超過基線即扣分
                              </div>
                            </div>
                          )
                        })()}
                        {/* STB_06 拒絕接單自定義只讀顯示 */}
                        {rule.id === 'STB_06' && (() => {
                          const days = rule.statDays || 7
                          const perOrder = rule.deductionPerOrder || 80
                          return (
                            <div style={{ padding: '14px 16px', background: '#FAFAFA', borderRadius: 8, border: '1px solid #F0F0F0' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 10, flexWrap: 'wrap' }}>
                                <div style={{ fontSize: 13, color: '#595959' }}>
                                  <span style={{ fontWeight: 600, color: '#262626' }}>統計天數：</span>
                                  <span style={{ fontWeight: 600, color: '#E8720C' }}>{days}</span> 天（含當天）
                                </div>
                              </div>
                              <div style={{
                                display: 'flex', alignItems: 'center', gap: 12,
                                padding: '10px 12px', background: '#fff2f0', borderRadius: 6,
                              }}>
                                <span style={{ fontSize: 13, color: '#595959' }}>統計天數內每拒絕一單</span>
                                <span style={{
                                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                                  height: 24, minWidth: 72, borderRadius: 4, fontSize: 12, fontWeight: 600,
                                  color: '#FF4D4F',
                                  background: '#fff2f0',
                                  border: '1px solid #ffccc7',
                                }}>
                                  固定減分
                                </span>
                                <span style={{ fontWeight: 600, fontSize: 15, color: '#FF4D4F' }}>{perOrder} 分</span>
                              </div>
                              <div style={{ fontSize: 11, color: '#8C8C8C', marginTop: 8 }}>
                                備注：統計天數含當天，商家當天拒絕接單即即時扣分
                              </div>
                            </div>
                          )
                        })()}
                        {/* STB_07 出餐超時自定義只讀顯示 */}
                        {rule.id === 'STB_07' && (() => {
                          const days = rule.statDays || 7
                          const perOrder = rule.deductionPerOrder || 70
                          return (
                            <div style={{ padding: '14px 16px', background: '#FAFAFA', borderRadius: 8, border: '1px solid #F0F0F0' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 10, flexWrap: 'wrap' }}>
                                <div style={{ fontSize: 13, color: '#595959' }}>
                                  <span style={{ fontWeight: 600, color: '#262626' }}>統計天數：</span>
                                  <span style={{ fontWeight: 600, color: '#E8720C' }}>{days}</span> 天（不含當天）
                                </div>
                              </div>
                              <div style={{
                                display: 'flex', alignItems: 'center', gap: 12,
                                padding: '10px 12px', background: '#fff2f0', borderRadius: 6,
                              }}>
                                <span style={{ fontSize: 13, color: '#595959' }}>統計天數內每超時一單</span>
                                <span style={{
                                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                                  height: 24, minWidth: 72, borderRadius: 4, fontSize: 12, fontWeight: 600,
                                  color: '#FF4D4F',
                                  background: '#fff2f0',
                                  border: '1px solid #ffccc7',
                                }}>
                                  固定減分
                                </span>
                                <span style={{ fontWeight: 600, fontSize: 15, color: '#FF4D4F' }}>{perOrder} 分</span>
                              </div>
                              <div style={{ fontSize: 11, color: '#8C8C8C', marginTop: 8 }}>
                                備注：統計天數不含當天，統計期間內平均出餐時間作為基線（已固定），商家當天超時即即時扣分
                              </div>
                            </div>
                          )
                        })()}
                        {/* STB_08 取消訂單自定義只讀顯示 */}
                        {rule.id === 'STB_08' && (() => {
                          const days = rule.statDays || 7
                          const perOrder = rule.deductionPerOrder || 80
                          return (
                            <div style={{ padding: '14px 16px', background: '#FAFAFA', borderRadius: 8, border: '1px solid #F0F0F0' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 10, flexWrap: 'wrap' }}>
                                <div style={{ fontSize: 13, color: '#595959' }}>
                                  <span style={{ fontWeight: 600, color: '#262626' }}>統計天數：</span>
                                  <span style={{ fontWeight: 600, color: '#E8720C' }}>{days}</span> 天（含當天）
                                </div>
                              </div>
                              <div style={{
                                display: 'flex', alignItems: 'center', gap: 12,
                                padding: '10px 12px', background: '#fff2f0', borderRadius: 6,
                              }}>
                                <span style={{ fontSize: 13, color: '#595959' }}>統計天數內每取消一單</span>
                                <span style={{
                                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                                  height: 24, minWidth: 72, borderRadius: 4, fontSize: 12, fontWeight: 600,
                                  color: '#FF4D4F',
                                  background: '#fff2f0',
                                  border: '1px solid #ffccc7',
                                }}>
                                  固定減分
                                </span>
                                <span style={{ fontWeight: 600, fontSize: 15, color: '#FF4D4F' }}>{perOrder} 分</span>
                              </div>
                              <div style={{ fontSize: 11, color: '#8C8C8C', marginTop: 8 }}>
                                備注：統計天數含當天，商家當天取消訂單即即時扣分
                              </div>
                            </div>
                          )
                        })()}
                        {/* STB_09 超時接單自定義只讀顯示 */}
                        {rule.id === 'STB_09' && (() => {
                          const days = rule.statDays || 7
                          const perOrder = rule.deductionPerOrder || 60
                          return (
                            <div style={{ padding: '14px 16px', background: '#FAFAFA', borderRadius: 8, border: '1px solid #F0F0F0' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 10, flexWrap: 'wrap' }}>
                                <div style={{ fontSize: 13, color: '#595959' }}>
                                  <span style={{ fontWeight: 600, color: '#262626' }}>統計天數：</span>
                                  <span style={{ fontWeight: 600, color: '#E8720C' }}>{days}</span> 天（含當天）
                                </div>
                              </div>
                              <div style={{
                                display: 'flex', alignItems: 'center', gap: 12,
                                padding: '10px 12px', background: '#fff2f0', borderRadius: 6,
                              }}>
                                <span style={{ fontSize: 13, color: '#595959' }}>統計天數內每超時一單</span>
                                <span style={{
                                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                                  height: 24, minWidth: 72, borderRadius: 4, fontSize: 12, fontWeight: 600,
                                  color: '#FF4D4F',
                                  background: '#fff2f0',
                                  border: '1px solid #ffccc7',
                                }}>
                                  固定減分
                                </span>
                                <span style={{ fontWeight: 600, fontSize: 15, color: '#FF4D4F' }}>{perOrder} 分</span>
                              </div>
                              <div style={{ fontSize: 11, color: '#8C8C8C', marginTop: 8 }}>
                                備注：統計天數含當天，商家當天超時接單即即時扣分
                              </div>
                            </div>
                          )
                        })()}
                        {/* PLT_01 距離衰減自定義只讀顯示 */}
                        {rule.id === 'PLT_01' && (() => {
                          const fullScore = rule.score ?? 100
                          const coeff = rule.decayCoefficient ?? 5
                          return (
                            <div style={{ padding: '14px 16px', background: '#FAFAFA', borderRadius: 8, border: '1px solid #F0F0F0' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 10, flexWrap: 'wrap' }}>
                                <div style={{ fontSize: 13, color: '#595959' }}>
                                  <span style={{ fontWeight: 600, color: '#262626' }}>滿分：</span>
                                  <span style={{ fontWeight: 600, color: '#52C41A' }}>{fullScore}</span> 分
                                </div>
                                <div style={{ fontSize: 13, color: '#595959' }}>
                                  <span style={{ fontWeight: 600, color: '#262626' }}>衰減係數：</span>
                                  <span style={{ fontWeight: 600, color: '#E8720C' }}>{coeff}</span>
                                </div>
                              </div>
                              <div style={{
                                display: 'flex', alignItems: 'center', gap: 12,
                                padding: '10px 12px', background: '#e6f7ff', borderRadius: 6,
                              }}>
                                <span style={{ fontSize: 13, color: '#595959' }}>計算公式：得分 = 滿分 - 衰減係數 × 距離</span>
                              </div>
                              <div style={{ fontSize: 11, color: '#8C8C8C', marginTop: 8 }}>
                                備注：距離越遠得分越低，最低為 0 分
                              </div>
                            </div>
                          )
                        })()}
                        {/* PLT_02A 配送範圍自定義只讀顯示 */}
                        {rule.id === 'PLT_02A' && (() => {
                          const trs = rule.timeRangeScores ?? {}
                          return (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                              {TIME_PERIOD_KEYS.map(periodKey => {
                                const scores = trs[periodKey] ?? DEFAULT_RANGE_SCORES
                                return (
                                  <div key={periodKey} style={{
                                    padding: '10px 14px', background: '#FAFAFA', borderRadius: 6,
                                    border: '1px solid #F0F0F0',
                                  }}>
                                    <div style={{ fontSize: 13, fontWeight: 600, color: '#262626', marginBottom: 8 }}>
                                      {TIME_PERIOD_LABELS[periodKey]}
                                    </div>
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
                                      {RANGE_SCORE_KEYS.map(key => (
                                        <div key={key} style={{
                                          padding: '6px 10px', borderRadius: 4, background: '#fff',
                                          border: '1px solid #f0f0f0', textAlign: 'center',
                                        }}>
                                          <div style={{ fontSize: 11, color: '#8C8C8C', marginBottom: 2 }}>{RANGE_LABEL[key]}</div>
                                          <div style={{ fontSize: 14, fontWeight: 600, color: '#262626' }}>{scores[key]} 分</div>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                )
                              })}
                              <div style={{ fontSize: 11, color: '#8C8C8C' }}>
                                備注：後端根據當前時間自動匹配對應時段的分值，未配置的時段不計分
                              </div>
                            </div>
                          )
                        })()}
                        {rule.mode === ScoreMode.TIERED && rule.tiers?.length && rule.id !== 'PLT_03' && rule.id !== 'PLT_04' && (
                          <div>
                            <div style={{ fontSize: 12, fontWeight: 600, color: '#262626', marginBottom: 8 }}>梯度檔位明細（{rule.tiers.length} 檔）</div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                              {rule.tiers.map((tier: ScoreTier, i: number) => (
                                <div key={i} style={{
                                  display: 'flex', alignItems: 'center', gap: 8,
                                  padding: '8px 12px', borderRadius: 6,
                                  background: tier.score >= 0 ? '#f6ffed' : '#fff2f0',
                                }}>
                                  <span style={{ fontSize: 12, color: '#8C8C8C', minWidth: 24 }}>#{i + 1}</span>
                                  {tier.statDays && <span style={{ fontSize: 12, color: '#8C8C8C' }}>統計 {tier.statDays} 天</span>}
                                  <span style={{ fontSize: 13, color: '#595959' }}>訂單 {TIER_DIRECTION_LABEL[tier.direction]} {tier.threshold} 單</span>
                                  <span style={{ marginLeft: 'auto', fontWeight: 600, fontSize: 14, color: tier.score >= 0 ? '#52C41A' : '#FF4D4F' }}>
                                    {tier.score >= 0 ? '+' : ''}{tier.score} 分
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                        {rule.rangeScores && rule.id !== 'PLT_02A' && (
                          <div>
                            <div style={{ fontSize: 12, fontWeight: 600, color: '#262626', marginBottom: 8 }}>配送範圍分值</div>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
                              {RANGE_SCORE_KEYS.map(key => (
                                <div key={key} style={{
                                  padding: '8px 12px', borderRadius: 6, background: '#fff',
                                  border: '1px solid #f0f0f0', textAlign: 'center',
                                }}>
                                  <div style={{ fontSize: 12, color: '#8C8C8C', marginBottom: 4 }}>{RANGE_LABEL[key]}</div>
                                  <div style={{ fontSize: 16, fontWeight: 600, color: '#262626' }}>{rule.rangeScores![key]} 分</div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                        {/* 備註（描述 + 前提條件）放最下面 */}
                        <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px dashed #e8e8e8' }}>
                          <div style={{ fontSize: 13, color: '#595959', lineHeight: 1.6 }}>
                            {rule.description}
                          </div>
                          {rule.prerequisites && rule.id !== 'COM_01' && rule.id !== 'COM_02' && rule.id !== 'COM_03' && rule.id !== 'COM_04' && rule.id !== 'COM_05' && rule.id !== 'COM_06' && rule.id !== 'COM_07' && rule.id !== 'COM_09' && rule.id !== 'COM_10' && rule.id !== 'STB_01' && rule.id !== 'STB_04' && rule.id !== 'STB_02' && rule.id !== 'STB_03' && rule.id !== 'PLT_03' && rule.id !== 'PLT_04' && rule.id !== 'STB_05' && rule.id !== 'STB_06' && rule.id !== 'STB_07' && rule.id !== 'STB_08' && rule.id !== 'STB_09' && rule.id !== 'PLT_01' && rule.id !== 'PLT_02A' && (
                            <div style={{
                              display: 'inline-flex', alignItems: 'center', gap: 6,
                              padding: '6px 12px', background: '#f9f0ff', borderRadius: 6,
                              border: '1px solid #d3adf7', marginTop: 8,
                            }}>
                              <span style={{ fontSize: 11, fontWeight: 600, color: '#722ED1', whiteSpace: 'nowrap' }}>前提條件</span>
                              <span style={{ fontSize: 13, color: '#595959' }}>{rule.prerequisites}</span>
                            </div>
                          )}
                        </div>
                      </>
                    ) : (
                      /* 編輯模式 */
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                        <div style={{ display: 'grid', gridTemplateColumns: (rule.id === 'COM_01' || rule.id === 'COM_02' || rule.id === 'COM_03' || rule.id === 'COM_04' || rule.id === 'COM_05' || rule.id === 'COM_06' || rule.id === 'COM_07' || rule.id === 'COM_09' || rule.id === 'COM_10' || rule.id === 'STB_01' || rule.id === 'STB_04' || rule.id === 'STB_02' || rule.id === 'STB_03' || rule.id === 'PLT_03' || rule.id === 'PLT_04' || rule.id === 'STB_05' || rule.id === 'STB_06' || rule.id === 'STB_07' || rule.id === 'STB_08' || rule.id === 'STB_09' || rule.id === 'PLT_01' || rule.id === 'PLT_02A') ? '1fr' : '1fr 1fr', gap: 12 }}>
                          <div>
                            <div style={{ fontSize: 12, color: '#595959', marginBottom: 4 }}>規則名稱</div>
                            <Input value={form.name} maxLength={30} showCount
                              onChange={e => setInlineForm(prev => ({ ...prev, [rule.id]: { ...prev[rule.id], name: e.target.value } }) as any)} />
                          </div>
                          {(rule.id !== 'COM_01' && rule.id !== 'COM_02' && rule.id !== 'COM_03' && rule.id !== 'COM_04' && rule.id !== 'COM_05' && rule.id !== 'COM_06' && rule.id !== 'COM_07' && rule.id !== 'COM_09' && rule.id !== 'COM_10' && rule.id !== 'STB_01' && rule.id !== 'STB_04' && rule.id !== 'STB_02' && rule.id !== 'STB_03' && rule.id !== 'PLT_03' && rule.id !== 'PLT_04' && rule.id !== 'STB_05' && rule.id !== 'STB_06' && rule.id !== 'STB_07' && rule.id !== 'STB_08' && rule.id !== 'STB_09' && rule.id !== 'PLT_01' && rule.id !== 'PLT_02A') && (
                            <div>
                              <div style={{ fontSize: 12, color: '#595959', marginBottom: 4 }}>前提條件</div>
                              <Input value={form.prerequisites || ''} maxLength={60} showCount allowClear
                                placeholder="填寫規則生效的前提條件"
                                onChange={e => setInlineForm(prev => ({ ...prev, [rule.id]: { ...prev[rule.id], prerequisites: e.target.value || undefined } }) as any)} />
                            </div>
                          )}
                          {/* PLT_03 自定義前提條件 */}
                          {rule.id === 'PLT_03' && (() => {
                            const prereqVal = (form as any).prerequisites || 'UNCONDITIONAL'
                            const isUnconditional = prereqVal === 'UNCONDITIONAL'
                            const selectedConds: string[] = isUnconditional ? [] : (() => { try { return JSON.parse(prereqVal) } catch { return [] } })()
                            return (
                              <div style={{ padding: 12, background: '#FAFAFA', borderRadius: 8, border: '1px solid #F0F0F0' }}>
                                <div style={{ fontSize: 12, color: '#595959', marginBottom: 8 }}>前提條件</div>
                                <Radio.Group
                                  value={isUnconditional ? 'UNCONDITIONAL' : 'CONDITIONAL'}
                                  onChange={e => {
                                    const val = e.target.value
                                    setInlineForm(prev => ({ ...prev, [rule.id!]: { ...prev[rule.id!], prerequisites: val === 'UNCONDITIONAL' ? 'UNCONDITIONAL' : '[]' } }) as any)
                                  }}
                                  style={{ marginBottom: 10 }}
                                >
                                  <Radio.Button value="UNCONDITIONAL">無條件</Radio.Button>
                                  <Radio.Button value="CONDITIONAL">指定條件</Radio.Button>
                                </Radio.Group>
                                {!isUnconditional && (
                                  <Checkbox.Group
                                    value={selectedConds}
                                    onChange={vals => {
                                      setInlineForm(prev => ({ ...prev, [rule.id!]: { ...prev[rule.id!], prerequisites: JSON.stringify(vals) } }) as any)
                                    }}
                                    style={{ display: 'flex', flexDirection: 'column', gap: 8 }}
                                  >
                                    {PLT_03_PREREQ_OPTIONS.map(o => (
                                      <Checkbox key={o.value} value={o.value}>{o.label}</Checkbox>
                                    ))}
                                  </Checkbox.Group>
                                )}
                              </div>
                            )
                          })()}
                          {/* PLT_03 屏蔽商家（獨立區域） */}
                          {rule.id === 'PLT_03' && (() => {
                            const blocked: string[] = (form as any).blockedMerchants || []
                            return (
                              <div style={{ padding: 12, background: '#FFF2F0', borderRadius: 8, border: '1px solid #FFCCC7' }}>
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: blocked.length > 0 ? 8 : 0 }}>
                                  <div style={{ fontSize: 12, fontWeight: 600, color: '#FF4D4F', whiteSpace: 'nowrap' }}>🚫 屏蔽商家</div>
                                  <Button
                                    size="small"
                                    icon={<ShopOutlined />}
                                    onClick={() => {
                                      setStoreModalReadOnly(false)
                                      const currentBlocked = (form as any).blockedMerchants || []
                                      setTempBlockedStores(
                                        dbStores.filter(s => currentBlocked.includes(s.storeCode))
                                      )
                                      storeSearchForm.resetFields()
                                      setStoreSearchValues({})
                                      setStoreModalVisible(true)
                                    }}
                                  >選擇門店</Button>
                                </div>
                                {blocked.length > 0 && (
                                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
                                    {blocked.slice(0, 3).map(code => (
                                      <Tag
                                        key={code}
                                        color="error"
                                        closable
                                        onClose={() => {
                                          setInlineForm(prev => ({ ...prev, [rule.id!]: { ...prev[rule.id!], blockedMerchants: blocked.filter(c => c !== code) } }) as any)
                                        }}
                                        style={{ fontSize: 11, margin: 0 }}
                                      >{code}</Tag>
                                    ))}
                                    {blocked.length > 3 && (
                                      <Tag
                                        color="error"
                                        style={{ fontSize: 11, margin: 0, cursor: 'pointer' }}
                                        onClick={() => {
                                          setStoreModalReadOnly(false)
                                          setTempBlockedStores(dbStores.filter(s => blocked.includes(s.storeCode)))
                                          storeSearchForm.resetFields()
                                          setStoreSearchValues({})
                                          setStoreModalVisible(true)
                                        }}
                                      >+{blocked.length - 3} 家</Tag>
                                    )}
                                  </div>
                                )}
                              </div>
                            )
                          })()}
                          {/* PLT_03 統計天數 + 梯度配置 */}
                          {rule.id === 'PLT_03' && (
                            <div style={{ padding: 12, background: '#FAFAFA', borderRadius: 8, border: '1px solid #F0F0F0' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                                <span style={{ fontSize: 12, color: '#595959', whiteSpace: 'nowrap' }}>統計天數</span>
                                <InputNumber
                                  value={(form as any).statDays ?? 30}
                                  min={1}
                                  max={365}
                                  style={{ width: 100 }}
                                  addonAfter="天"
                                  onChange={val => setInlineForm(prev => ({ ...prev, [rule.id!]: { ...prev[rule.id!], statDays: val ?? 30 } }) as any)}
                                />
                                <span style={{ fontSize: 11, color: '#8C8C8C' }}>過去 N 天內的訂單數據</span>
                              </div>
                              <div style={{ fontSize: 12, fontWeight: 600, color: '#262626', marginBottom: 8 }}>梯度配置</div>
                              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                {((form as any).tiers || []).map((tier: ScoreTier, idx: number) => (
                                  <div key={idx} style={{
                                    display: 'flex', alignItems: 'center', gap: 8,
                                    padding: '8px 12px', background: '#fff', borderRadius: 6, border: '1px solid #f0f0f0',
                                  }}>
                                    <span style={{ fontSize: 12, color: '#8C8C8C', minWidth: 20 }}>#{idx + 1}</span>
                                    <span style={{ fontSize: 12, color: '#595959', whiteSpace: 'nowrap' }}>訂單量</span>
                                    <span style={{ fontSize: 13, color: '#262626', fontWeight: 500 }}>≤</span>
                                    <InputNumber
                                      value={tier.threshold || undefined}
                                      min={0}
                                      style={{ width: 100 }}
                                      placeholder="輸入閾值"
                                      onChange={val => {
                                        const newTiers = [...(form as any).tiers]
                                        newTiers[idx] = { ...newTiers[idx], threshold: val ?? 0 }
                                        setInlineForm(prev => ({ ...prev, [rule.id!]: { ...prev[rule.id!], tiers: newTiers } }) as any)
                                      }}
                                    />
                                    <span style={{ fontSize: 12, color: '#595959', whiteSpace: 'nowrap' }}>單</span>
                                    <span style={{ fontSize: 12, color: '#595959', whiteSpace: 'nowrap' }}>固定加分</span>
                                    <InputNumber
                                      value={tier.score || undefined}
                                      min={0}
                                      max={200}
                                      style={{ width: 110 }}
                                      addonAfter="分"
                                      placeholder="輸入分數"
                                      onChange={val => {
                                        const newTiers = [...(form as any).tiers]
                                        newTiers[idx] = { ...newTiers[idx], score: val ?? 0 }
                                        setInlineForm(prev => ({ ...prev, [rule.id!]: { ...prev[rule.id!], tiers: newTiers } }) as any)
                                      }}
                                    />
                                    <Button
                                      type="text"
                                      danger
                                      size="small"
                                      icon={<DeleteOutlined />}
                                      onClick={() => {
                                        const newTiers = ((form as any).tiers || []).filter((_: ScoreTier, i: number) => i !== idx)
                                        setInlineForm(prev => ({ ...prev, [rule.id!]: { ...prev[rule.id!], tiers: newTiers } }) as any)
                                      }}
                                      style={{ padding: '0 4px', marginLeft: 'auto' }}
                                    />
                                  </div>
                                ))}
                                <Button
                                  type="dashed"
                                  icon={<PlusOutlined />}
                                  onClick={() => {
                                    const currentTiers = (form as any).tiers || []
                                    const newTiers = [...currentTiers, { threshold: undefined, direction: TierDirection.LESS_THAN, score: undefined }]
                                    setInlineForm(prev => ({ ...prev, [rule.id!]: { ...prev[rule.id!], tiers: newTiers } }) as any)
                                  }}
                                  style={{ width: '100%' }}
                                >
                                  新增梯度
                                </Button>
                              </div>
                            </div>
                          )}

                        </div>
                        {/* STB_02 營業狀態專屬配置 */}
                        {rule.id === 'STB_02' && (
                          <div style={{ padding: 12, background: '#FAFAFA', borderRadius: 8, border: '1px solid #F0F0F0' }}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                              {[
                                { key: 'operating', label: '營業額中狀態', desc: '正常營業中' },
                                { key: 'shortBreak', label: '休息一會，馬上回來', desc: '短暫休息後恢復營業' },
                                { key: 'overload', label: '爆單了，暫停接單一會', desc: '訂單量超過承載能力' },
                                { key: 'closed', label: '休息打烊', desc: '當日不再營業' },
                              ].map((item, idx) => {
                                const items = (form as any).conditionItems || []
                                const currentItem = items[idx] || { condition: '', score: 0 }
                                return (
                                  <div key={item.key} style={{ display: 'grid', gridTemplateColumns: '140px 100px 1fr', gap: 8, alignItems: 'center' }}>
                                    <div>
                                      <div style={{ fontSize: 12, color: '#262626', fontWeight: 500 }}>{item.label}</div>
                                      <div style={{ fontSize: 11, color: '#8C8C8C' }}>{item.desc}</div>
                                    </div>
                                    <Select
                                      value={currentItem.condition === 'deduction' ? 'deduction' : 'bonus'}
                                      style={{ width: 110 }}
                                      options={[
                                        { label: <span style={{ color: '#52C41A', fontWeight: 500 }}>固定加分</span>, value: 'bonus' },
                                        { label: <span style={{ color: '#FF4D4F', fontWeight: 500 }}>固定減分</span>, value: 'deduction' },
                                      ]}
                                      labelRender={(props) => {
                                        const isBonus = props.value === 'bonus'
                                        return <span style={{ color: isBonus ? '#52C41A' : '#FF4D4F', fontWeight: 500 }}>{isBonus ? '固定加分' : '固定減分'}</span>
                                      }}
                                      onChange={val => {
                                        const newItems = [...(form as any).conditionItems || []]
                                        newItems[idx] = { ...currentItem, condition: val }
                                        setInlineForm(prev => ({ ...prev, [rule.id]: { ...prev[rule.id], conditionItems: newItems } }) as any)
                                      }}
                                    />
                                    <InputNumber
                                      value={currentItem.score}
                                      min={0}
                                      max={100}
                                      style={{ width: '100%' }}
                                      placeholder="輸入分數"
                                      onChange={val => {
                                        const newItems = [...(form as any).conditionItems || []]
                                        newItems[idx] = { ...currentItem, score: val ?? 0 }
                                        setInlineForm(prev => ({ ...prev, [rule.id]: { ...prev[rule.id], conditionItems: newItems } }) as any)
                                      }}
                                    />
                                  </div>
                                )
                              })}
                            </div>
                          </div>
                        )}
                        {/* STB_03 評價得分專屬配置（5 星） */}
                        {rule.id === 'STB_03' && (
                          <div style={{ padding: 12, background: '#FAFAFA', borderRadius: 8, border: '1px solid #F0F0F0' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                              <span style={{ fontSize: 12, color: '#595959', whiteSpace: 'nowrap' }}>統計天數</span>
                              <InputNumber
                                value={(form as any).statDays ?? 30}
                                min={1}
                                max={365}
                                style={{ width: 100 }}
                                addonAfter="天"
                                onChange={val => setInlineForm(prev => ({ ...prev, [rule.id]: { ...prev[rule.id], statDays: val ?? 30 } }) as any)}
                              />
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                              {[5, 4, 3, 2, 1].map((star, idx) => {
                                const items = (form as any).conditionItems || []
                                const currentItem = items[idx] || { condition: 'fixed_bonus', score: 0 }
                                const isDynamic = currentItem.condition?.startsWith('dynamic')
                                return (
                                  <div key={star} style={{ display: 'grid', gridTemplateColumns: '120px 120px 1fr', gap: 8, alignItems: 'center' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap' }}>
                                      <span style={{ fontSize: 12, color: '#595959', fontWeight: 500 }}>{star}星</span>
                                      <span style={{ fontSize: 18, letterSpacing: 2, lineHeight: 1 }}>
                                        {Array.from({ length: 5 }, (_, i) => (
                                          <span key={i} style={{
                                            color: i < star ? '#FAAD14' : '#E8E8E8',
                                            textShadow: i < star ? '0 1px 3px rgba(250,173,20,0.4)' : 'none',
                                          }}>{i < star ? '★' : '☆'}</span>
                                        ))}
                                      </span>
                                    </div>
                                    <Select
                                      value={currentItem.condition || 'fixed_bonus'}
                                      style={{ width: 120 }}
                                      options={[
                                        { label: <span style={{ color: '#52C41A', fontWeight: 500 }}>固定加分</span>, value: 'fixed_bonus' },
                                        { label: <span style={{ color: '#FF4D4F', fontWeight: 500 }}>固定減分</span>, value: 'fixed_deduction' },
                                        { label: <span style={{ color: '#52C41A', fontWeight: 500 }}>動態加分</span>, value: 'dynamic_bonus' },
                                        { label: <span style={{ color: '#FF4D4F', fontWeight: 500 }}>動態減分</span>, value: 'dynamic_deduction' },
                                      ]}
                                      labelRender={(props) => {
                                        const v = props.value as string
                                        const isBonus = v.includes('bonus')
                                        const isDyn = v.startsWith('dynamic')
                                        return <span style={{ color: isBonus ? '#52C41A' : '#FF4D4F', fontWeight: 500 }}>{isDyn ? (isBonus ? '動態加分' : '動態減分') : (isBonus ? '固定加分' : '固定減分')}</span>
                                      }}
                                      onChange={val => {
                                        const newItems = [...(form as any).conditionItems || []]
                                        newItems[idx] = { ...currentItem, condition: val }
                                        setInlineForm(prev => ({ ...prev, [rule.id]: { ...prev[rule.id], conditionItems: newItems } }) as any)
                                      }}
                                    />
                                    <InputNumber
                                      value={currentItem.score}
                                      min={0}
                                      max={isDynamic ? 10 : 100}
                                      style={{ width: '100%' }}
                                      placeholder={isDynamic ? '輸入倍數' : '輸入分數'}
                                      addonAfter={isDynamic ? undefined : '分'}
                                      onChange={val => {
                                        const newItems = [...(form as any).conditionItems || []]
                                        newItems[idx] = { ...currentItem, score: val ?? 0 }
                                        setInlineForm(prev => ({ ...prev, [rule.id]: { ...prev[rule.id], conditionItems: newItems } }) as any)
                                      }}
                                    />
                                  </div>
                                )
                              })}
                            </div>
                            <div style={{ marginTop: 10, padding: '8px 12px', background: '#FFFBE6', borderRadius: 6, border: '1px solid #FFE58F', fontSize: 11, color: '#8C6D1F', lineHeight: 1.6 }}>
                              <span style={{ fontWeight: 600 }}>計分規則：</span>固定加分/減分 = 用戶評價訂單，所選的星級匹配對應配置分數，直接加/減分；動態加分/減分 = 用戶評價訂單，所選星級 × 配置倍數 = 最終分數，再根據規則加/減分。
                            </div>
                          </div>
                        )}
                        {/* PLT_04 訂單過熱調控自定義編輯 */}
                        {rule.id === 'PLT_04' && (
                          <div style={{ padding: 12, background: '#FAFAFA', borderRadius: 8, border: '1px solid #F0F0F0' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                              <span style={{ fontSize: 12, color: '#595959', whiteSpace: 'nowrap' }}>監控方式</span>
                              <Tag color="purple" style={{ fontSize: 12, margin: 0 }}>定時監控</Tag>
                              <span style={{ fontSize: 12, color: '#595959', whiteSpace: 'nowrap' }}>校驗間隔</span>
                              <InputNumber
                                value={(form as any).calcIntervalHours ?? 1}
                                min={0.1}
                                max={24}
                                step={0.5}
                                style={{ width: 120 }}
                                addonAfter="小時"
                                placeholder="輸入小時數"
                                onChange={val => setInlineForm(prev => ({ ...prev, [rule.id!]: { ...prev[rule.id!], calcIntervalHours: val ?? 1, calcCycle: CalcCycle.SCHEDULED } }) as any)}
                              />
                              <span style={{ fontSize: 11, color: '#8C8C8C' }}>（如 0.5 = 30 分鐘）</span>
                            </div>
                            <div style={{ fontSize: 12, fontWeight: 600, color: '#262626', marginBottom: 8 }}>梯度配置</div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                              {((form as any).tiers || []).map((tier: ScoreTier, idx: number) => (
                                <div key={idx} style={{
                                  display: 'flex', alignItems: 'center', gap: 8,
                                  padding: '8px 12px', background: '#fff', borderRadius: 6, border: '1px solid #f0f0f0',
                                }}>
                                  <span style={{ fontSize: 12, color: '#8C8C8C', minWidth: 20 }}>#{idx + 1}</span>
                                  <span style={{ fontSize: 12, color: '#595959', whiteSpace: 'nowrap' }}>訂單量</span>
                                  <span style={{ fontSize: 13, color: '#262626', fontWeight: 500 }}>≥</span>
                                  <InputNumber
                                    value={tier.threshold || undefined}
                                    min={0}
                                    style={{ width: 100 }}
                                    placeholder="輸入閾值"
                                    onChange={val => {
                                      const newTiers = [...(form as any).tiers]
                                      newTiers[idx] = { ...newTiers[idx], threshold: val ?? 0 }
                                      setInlineForm(prev => ({ ...prev, [rule.id!]: { ...prev[rule.id!], tiers: newTiers } }) as any)
                                    }}
                                  />
                                  <span style={{ fontSize: 12, color: '#595959', whiteSpace: 'nowrap' }}>單</span>
                                  <span style={{ fontSize: 12, color: '#FF4D4F', whiteSpace: 'nowrap' }}>固定減分</span>
                                  <InputNumber
                                    value={Math.abs(tier.score) || undefined}
                                    min={0}
                                    max={200}
                                    style={{ width: 110 }}
                                    addonAfter="分"
                                    placeholder="輸入分數"
                                    onChange={val => {
                                      const newTiers = [...(form as any).tiers]
                                      newTiers[idx] = { ...newTiers[idx], score: -(val ?? 0) }
                                      setInlineForm(prev => ({ ...prev, [rule.id!]: { ...prev[rule.id!], tiers: newTiers } }) as any)
                                    }}
                                  />
                                  <Button
                                    type="text"
                                    danger
                                    size="small"
                                    icon={<DeleteOutlined />}
                                    onClick={() => {
                                      const newTiers = ((form as any).tiers || []).filter((_: ScoreTier, i: number) => i !== idx)
                                      setInlineForm(prev => ({ ...prev, [rule.id!]: { ...prev[rule.id!], tiers: newTiers } }) as any)
                                    }}
                                    style={{ padding: '0 4px', marginLeft: 'auto' }}
                                  />
                                </div>
                              ))}
                              <Button
                                type="dashed"
                                icon={<PlusOutlined />}
                                onClick={() => {
                                  const currentTiers = (form as any).tiers || []
                                  const newTiers = [...currentTiers, { threshold: undefined, direction: TierDirection.MORE_THAN, score: undefined }]
                                  setInlineForm(prev => ({ ...prev, [rule.id!]: { ...prev[rule.id!], tiers: newTiers } }) as any)
                                }}
                                style={{ width: '100%' }}
                              >
                                新增梯度
                              </Button>
                            </div>
                          </div>
                        )}
                        {/* STB_05 出餐速度自定義編輯 */}
                        {rule.id === 'STB_05' && (() => {
                          const items: ScoreConditionItem[] = (form as any).conditionItems || []
                          const deductionScore = items.find(i => i.condition === 'over_avg_deduction')?.score ?? 0
                          const updateCond = (cond: string, score: number) => {
                            const newItems = items.filter(i => i.condition !== cond)
                            newItems.push({ condition: cond, score })
                            setInlineForm(prev => ({ ...prev, [rule.id!]: { ...prev[rule.id!], conditionItems: newItems } }) as any)
                          }
                          return (
                            <div style={{ padding: 12, background: '#FAFAFA', borderRadius: 8, border: '1px solid #F0F0F0' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                  <span style={{ fontSize: 12, color: '#595959', whiteSpace: 'nowrap' }}>統計天數</span>
                                  <InputNumber
                                    value={(form as any).statDaysTotal ?? 7}
                                    min={1} max={365} style={{ width: 110 }}
                                    addonAfter="天"
                                    onChange={val => setInlineForm(prev => ({ ...prev, [rule.id!]: { ...prev[rule.id!], statDaysTotal: val ?? 7 } }) as any)}
                                  />
                                  <span style={{ fontSize: 11, color: '#8C8C8C' }}>（不含當天）</span>
                                </div>
                              </div>
                              <div style={{ fontSize: 12, fontWeight: 600, color: '#262626', marginBottom: 8 }}>計分規則</div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', background: '#fff', borderRadius: 6, border: '1px solid #f0f0f0' }}>
                                <span style={{ fontSize: 13, color: '#595959', flex: 1 }}>當日出餐 &gt; 統計均值扣分</span>
                                <span style={{ fontSize: 12, color: '#FF4D4F', fontWeight: 500 }}>固定扣分</span>
                                <InputNumber value={deductionScore} min={1} max={500} style={{ width: 130 }}
                                  addonAfter="分" placeholder="輸入分數"
                                  onChange={val => updateCond('over_avg_deduction', val ?? 0)} />
                              </div>
                              <div style={{ fontSize: 11, color: '#8C8C8C', marginTop: 8 }}>
                                備注：統計天數不含當天，統計期間內平均出餐時間作為基線，當天成餐時間超過基線即扣分
                              </div>
                            </div>
                          )
                        })()}
                        {/* STB_06 拒絕接單自定義編輯 */}
                        {rule.id === 'STB_06' && (() => {
                          const days = (form as any).statDays ?? 7
                          const perOrder = (form as any).deductionPerOrder ?? 80
                          return (
                            <div style={{ padding: 12, background: '#FAFAFA', borderRadius: 8, border: '1px solid #F0F0F0' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                  <span style={{ fontSize: 12, color: '#595959', whiteSpace: 'nowrap' }}>統計天數</span>
                                  <InputNumber
                                    value={days}
                                    min={1} max={365} style={{ width: 110 }}
                                    addonAfter="天"
                                    onChange={val => setInlineForm(prev => ({ ...prev, [rule.id!]: { ...prev[rule.id!], statDays: val ?? 7 } }) as any)}
                                  />
                                  <span style={{ fontSize: 11, color: '#8C8C8C' }}>（含當天）</span>
                                </div>
                              </div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', background: '#fff', borderRadius: 6, border: '1px solid #f0f0f0' }}>
                                <span style={{ fontSize: 13, color: '#595959', flex: 1 }}>每拒絕一單扣分</span>
                                <span style={{ fontSize: 12, color: '#FF4D4F', fontWeight: 500 }}>固定扣分</span>
                                <InputNumber value={perOrder} min={1} max={500} style={{ width: 130 }}
                                  addonAfter="分/單" placeholder="輸入分數"
                                  onChange={val => setInlineForm(prev => ({ ...prev, [rule.id!]: { ...prev[rule.id!], deductionPerOrder: val ?? 80 } }) as any)} />
                              </div>
                              <div style={{ fontSize: 11, color: '#8C8C8C', marginTop: 8 }}>
                                備注：統計天數含當天，商家當天拒絕接單即即時扣分
                              </div>
                            </div>
                          )
                        })()}
                        {/* STB_07 出餐超時自定義編輯 */}
                        {rule.id === 'STB_07' && (() => {
                          const days = (form as any).statDays ?? 7
                          const perOrder = (form as any).deductionPerOrder ?? 70
                          return (
                            <div style={{ padding: 12, background: '#FAFAFA', borderRadius: 8, border: '1px solid #F0F0F0' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                  <span style={{ fontSize: 12, color: '#595959', whiteSpace: 'nowrap' }}>統計天數</span>
                                  <InputNumber
                                    value={days}
                                    min={1} max={365} style={{ width: 110 }}
                                    addonAfter="天"
                                    onChange={val => setInlineForm(prev => ({ ...prev, [rule.id!]: { ...prev[rule.id!], statDays: val ?? 7 } }) as any)}
                                  />
                                  <span style={{ fontSize: 11, color: '#8C8C8C' }}>（不含當天）</span>
                                </div>
                              </div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', background: '#fff', borderRadius: 6, border: '1px solid #f0f0f0' }}>
                                <span style={{ fontSize: 13, color: '#595959', flex: 1 }}>每超時一單扣分</span>
                                <span style={{ fontSize: 12, color: '#FF4D4F', fontWeight: 500 }}>固定扣分</span>
                                <InputNumber value={perOrder} min={1} max={500} style={{ width: 130 }}
                                  addonAfter="分/單" placeholder="輸入分數"
                                  onChange={val => setInlineForm(prev => ({ ...prev, [rule.id!]: { ...prev[rule.id!], deductionPerOrder: val ?? 70 } }) as any)} />
                              </div>
                              <div style={{ fontSize: 11, color: '#8C8C8C', marginTop: 8 }}>
                                備注：統計天數不含當天，統計期間內平均出餐時間作為基線（已固定），商家當天超時即即時扣分
                              </div>
                            </div>
                          )
                        })()}
                        {/* STB_08 取消訂單自定義編輯 */}
                        {rule.id === 'STB_08' && (() => {
                          const days = (form as any).statDays ?? 7
                          const perOrder = (form as any).deductionPerOrder ?? 80
                          return (
                            <div style={{ padding: 12, background: '#FAFAFA', borderRadius: 8, border: '1px solid #F0F0F0' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                  <span style={{ fontSize: 12, color: '#595959', whiteSpace: 'nowrap' }}>統計天數</span>
                                  <InputNumber
                                    value={days}
                                    min={1} max={365} style={{ width: 110 }}
                                    addonAfter="天"
                                    onChange={val => setInlineForm(prev => ({ ...prev, [rule.id!]: { ...prev[rule.id!], statDays: val ?? 7 } }) as any)}
                                  />
                                  <span style={{ fontSize: 11, color: '#8C8C8C' }}>（含當天）</span>
                                </div>
                              </div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', background: '#fff', borderRadius: 6, border: '1px solid #f0f0f0' }}>
                                <span style={{ fontSize: 13, color: '#595959', flex: 1 }}>每取消一單扣分</span>
                                <span style={{ fontSize: 12, color: '#FF4D4F', fontWeight: 500 }}>固定扣分</span>
                                <InputNumber value={perOrder} min={1} max={500} style={{ width: 130 }}
                                  addonAfter="分/單" placeholder="輸入分數"
                                  onChange={val => setInlineForm(prev => ({ ...prev, [rule.id!]: { ...prev[rule.id!], deductionPerOrder: val ?? 80 } }) as any)} />
                              </div>
                              <div style={{ fontSize: 11, color: '#8C8C8C', marginTop: 8 }}>
                                備注：統計天數含當天，商家當天取消訂單即即時扣分
                              </div>
                            </div>
                          )
                        })()}
                        {/* STB_09 超時接單自定義編輯 */}
                        {rule.id === 'STB_09' && (() => {
                          const days = (form as any).statDays ?? 7
                          const perOrder = (form as any).deductionPerOrder ?? 60
                          return (
                            <div style={{ padding: 12, background: '#FAFAFA', borderRadius: 8, border: '1px solid #F0F0F0' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                  <span style={{ fontSize: 12, color: '#595959', whiteSpace: 'nowrap' }}>統計天數</span>
                                  <InputNumber
                                    value={days}
                                    min={1} max={365} style={{ width: 110 }}
                                    addonAfter="天"
                                    onChange={val => setInlineForm(prev => ({ ...prev, [rule.id!]: { ...prev[rule.id!], statDays: val ?? 7 } }) as any)}
                                  />
                                  <span style={{ fontSize: 11, color: '#8C8C8C' }}>（含當天）</span>
                                </div>
                              </div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', background: '#fff', borderRadius: 6, border: '1px solid #f0f0f0' }}>
                                <span style={{ fontSize: 13, color: '#595959', flex: 1 }}>每超時一單扣分</span>
                                <span style={{ fontSize: 12, color: '#FF4D4F', fontWeight: 500 }}>固定扣分</span>
                                <InputNumber value={perOrder} min={1} max={500} style={{ width: 130 }}
                                  addonAfter="分/單" placeholder="輸入分數"
                                  onChange={val => setInlineForm(prev => ({ ...prev, [rule.id!]: { ...prev[rule.id!], deductionPerOrder: val ?? 60 } }) as any)} />
                              </div>
                              <div style={{ fontSize: 11, color: '#8C8C8C', marginTop: 8 }}>
                                備注：統計天數含當天，商家當天超時接單即即時扣分
                              </div>
                            </div>
                          )
                        })()}
                        {/* PLT_01 距離衰減自定義編輯 */}
                        {rule.id === 'PLT_01' && (() => {
                          const fullScore = form.score ?? 100
                          const coeff = (form as any).decayCoefficient ?? 5
                          return (
                            <div style={{ padding: 12, background: '#FAFAFA', borderRadius: 8, border: '1px solid #F0F0F0' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                  <span style={{ fontSize: 12, color: '#595959', whiteSpace: 'nowrap' }}>滿分</span>
                                  <InputNumber
                                    value={fullScore}
                                    min={0} max={500} style={{ width: 110 }}
                                    addonAfter="分"
                                    onChange={val => setInlineForm(prev => ({ ...prev, [rule.id!]: { ...prev[rule.id!], score: val ?? 100 } }) as any)}
                                  />
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                  <span style={{ fontSize: 12, color: '#595959', whiteSpace: 'nowrap' }}>衰減係數</span>
                                  <InputNumber
                                    value={coeff}
                                    min={0.1} max={100} step={0.1} style={{ width: 130 }}
                                    addonAfter=""
                                    onChange={val => setInlineForm(prev => ({ ...prev, [rule.id!]: { ...prev[rule.id!], decayCoefficient: val ?? 5 } }) as any)}
                                  />
                                </div>
                              </div>
                              <div style={{
                                padding: '8px 12px', background: '#e6f7ff', borderRadius: 6, marginBottom: 8,
                              }}>
                                <span style={{ fontSize: 12, color: '#595959' }}>計算公式：得分 = 滿分 - 衰減係數 × 距離</span>
                              </div>
                              <div style={{ fontSize: 11, color: '#8C8C8C' }}>
                                備注：距離越遠得分越低，最低為 0 分
                              </div>
                            </div>
                          )
                        })()}
                        {/* PLT_02A 配送範圍自定義編輯 */}
                        {rule.id === 'PLT_02A' && (() => {
                          const trs = (form as any).timeRangeScores ?? {}
                          return (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                              {TIME_PERIOD_KEYS.map(periodKey => {
                                const scores = trs[periodKey] ?? DEFAULT_RANGE_SCORES
                                return (
                                  <div key={periodKey} style={{
                                    padding: '12px 14px', background: '#FAFAFA', borderRadius: 6,
                                    border: '1px solid #F0F0F0',
                                  }}>
                                    <div style={{ fontSize: 13, fontWeight: 600, color: '#262626', marginBottom: 10 }}>
                                      {TIME_PERIOD_LABELS[periodKey]}
                                    </div>
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
                                      {RANGE_SCORE_KEYS.map(key => (
                                        <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                          <span style={{ fontSize: 12, color: '#595959', whiteSpace: 'nowrap' }}>{RANGE_LABEL[key]}</span>
                                          <InputNumber
                                            value={scores[key] ?? 0}
                                            min={0} max={500} style={{ width: '100%' }}
                                            addonAfter="分"
                                            onChange={val => {
                                              const newTrs = { ...trs, [periodKey]: { ...scores, [key]: val ?? 0 } }
                                              setInlineForm(prev => ({ ...prev, [rule.id!]: { ...prev[rule.id!], timeRangeScores: newTrs } }) as any)
                                            }}
                                          />
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                )
                              })}
                              <div style={{ fontSize: 11, color: '#8C8C8C' }}>
                                備注：後端根據當前時間自動匹配對應時段的分值，未配置的時段不計分
                              </div>
                            </div>
                          )
                        })()}
                        {/* STB_01/STB_04 主營時段/店鋪標籤自定義編輯（固定加分，無下拉框） */}
                        {(rule.id === 'STB_01' || rule.id === 'STB_04') && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', background: '#fff', borderRadius: 6, border: '1px solid #f0f0f0' }}>
                            <span style={{ fontSize: 13, color: '#595959', flex: 1 }}>{rule.id === 'STB_01' ? '主營時段加分' : '金牌店鋪身份標籤'}</span>
                            <span style={{ fontSize: 12, color: '#52C41A', fontWeight: 500 }}>固定加分</span>
                            <InputNumber value={form.score} min={0} max={200} style={{ width: 130 }}
                              addonAfter="分" placeholder="輸入分數"
                              onChange={val => setInlineForm(prev => ({ ...prev, [rule.id]: { ...prev[rule.id], score: val ?? 0 } }) as any)} />
                          </div>
                        )}
                        {/* 非 STB_02/STB_03/PLT_03/PLT_04/STB_05/STB_06/STB_07/STB_08/STB_09/PLT_01/PLT_02A/STB_01/STB_04 顯示標準計分方式 */}
                        {rule.id !== 'STB_02' && rule.id !== 'STB_03' && rule.id !== 'PLT_03' && rule.id !== 'PLT_04' && rule.id !== 'STB_05' && rule.id !== 'STB_06' && rule.id !== 'STB_07' && rule.id !== 'STB_08' && rule.id !== 'STB_09' && rule.id !== 'PLT_01' && rule.id !== 'PLT_02A' && rule.id !== 'STB_01' && rule.id !== 'STB_04' && (
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                            <div>
                              <div style={{ fontSize: 12, color: '#595959', marginBottom: 4 }}>計分方式</div>
                              <Select value={form.mode} style={{ width: '100%' }}
                                options={rule.id === 'STB_01' || rule.id === 'STB_04' ? [
                                  { label: '固定加分', value: ScoreMode.RULE_BONUS },
                                ] : (rule.id === 'COM_01' || rule.id === 'COM_02' || rule.id === 'COM_03' || rule.id === 'COM_04' || rule.id === 'COM_05' || rule.id === 'COM_06' || rule.id === 'COM_07' || rule.id === 'COM_09' || rule.id === 'COM_10') ? [
                                  { label: '固定加分', value: ScoreMode.RULE_BONUS },
                                  { label: '動態加分', value: ScoreMode.AMOUNT_MULTIPLIER },
                                ] : MODE_OPTIONS}
                                onChange={val => setInlineForm(prev => ({ ...prev, [rule.id]: { ...prev[rule.id], mode: val } }) as any)} />
                            </div>
                            <div>
                              <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 4 }}>
                                <span style={{ fontSize: 12, color: '#595959' }}>
                                  {(rule.id === 'COM_01' || rule.id === 'COM_02' || rule.id === 'COM_03' || rule.id === 'COM_04' || rule.id === 'COM_05' || rule.id === 'COM_06' || rule.id === 'COM_07' || rule.id === 'COM_09' || rule.id === 'COM_10') && form.mode === ScoreMode.AMOUNT_MULTIPLIER ? '倍率' : '分值'}
                                </span>
                                {(rule.id === 'COM_01' || rule.id === 'COM_02' || rule.id === 'COM_03' || rule.id === 'COM_04' || rule.id === 'COM_05' || rule.id === 'COM_06' || rule.id === 'COM_07' || rule.id === 'COM_09' || rule.id === 'COM_10') && (
                                  <span style={{ fontSize: 11, color: '#8C8C8C' }}>
                                    {form.mode === ScoreMode.AMOUNT_MULTIPLIER
                                      ? rule.id === 'COM_01' ? '（立減金額 × 倍率 = 得分）' : rule.id === 'COM_02' ? '（運費金額 × 倍率 = 得分）' : rule.id === 'COM_03' ? '（領券金額 × 倍率 = 得分）' : rule.id === 'COM_04' ? '（新客立減金額 × 倍率 = 得分）' : rule.id === 'COM_05' ? '（贈券金額 × 倍率 = 得分）' : rule.id === 'COM_06' ? '（紅包金額 × 倍率 = 得分）' : rule.id === 'COM_07' ? '（神券金額 × 倍率 = 得分）' : '（廣告金額 × 倍率 = 得分）'
                                      : '（直接加固定分）'}
                                  </span>
                                )}
                              </div>
                              <InputNumber value={form.score} min={(rule.id === 'COM_01' || rule.id === 'COM_02' || rule.id === 'COM_03' || rule.id === 'COM_04' || rule.id === 'COM_05' || rule.id === 'COM_06' || rule.id === 'COM_07' || rule.id === 'COM_09' || rule.id === 'COM_10') && form.mode === ScoreMode.AMOUNT_MULTIPLIER ? 0.1 : -100} max={100} style={{ width: '100%' }}
                                onChange={val => setInlineForm(prev => ({ ...prev, [rule.id]: { ...prev[rule.id], score: val ?? 0 } }) as any)} />
                            </div>
                          </div>
                        )}
                        <div>
                          <div style={{ fontSize: 12, color: '#595959', marginBottom: 4 }}>評分說明</div>
                          <Input.TextArea size="small" value={form.description} rows={2} maxLength={120} showCount
                            onChange={e => setInlineForm(prev => ({ ...prev, [rule.id]: { ...prev[rule.id], description: e.target.value } }) as any)} />
                        </div>
                        {/* 最後一排：狀態 + 取消/保存 */}
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: 8, borderTop: '1px dashed #e8e8e8' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{ fontSize: 12, color: '#595959' }}>狀態</span>
                            <Switch checked={form.status === ServiceStatus.ENABLED}
                              checkedChildren={t('common.enable')} unCheckedChildren={t('common.disable')}
                              onChange={checked => setInlineForm(prev => ({ ...prev, [rule.id]: { ...prev[rule.id], status: checked ? ServiceStatus.ENABLED : ServiceStatus.DISABLED } }) as any)} />
                          </div>
                          <Space size={6}>
                            <Button size="small" onClick={() => handleInlineCancel(rule.id)}
                              style={{ borderRadius: 4, fontSize: 12, height: 28 }}>取消</Button>
                            <Button size="small" type="primary" icon={<SaveOutlined />} onClick={() => handleInlineSave(rule.id)}
                              style={{ borderRadius: 4, fontSize: 12, height: 28, backgroundColor: '#E8720C', borderColor: '#E8720C' }}>保存</Button>
                          </Space>
                        </div>
                      </div>
                    )}
                  </div>
                  )
                })()}
              </div>
            )
          })}
        </div>
      </>
    )
  }


  /** 是否顯示維度權重與計算配置區（由規則配置菜單控制） */
  const showDimensionWeight = useMemo(
    () => getSystemRuleValue<boolean>('organic_traffic_show_dimension_weight') !== false,
    [],
  )

  return (
    <Spin spinning={loading}>
    <div style={{ border: '1px solid #e8eaed', borderRadius: 8, background: '#fff', padding: '16px 20px', marginBottom: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <SettingOutlined style={{ fontSize: 16, color: '#fa8c16' }} />
        <span style={{ fontSize: 15, fontWeight: 600, color: '#262626' }}>{t('organicTrafficScore.pageTitle')}</span>
        <Button size="small" icon={<QuestionCircleOutlined />} onClick={() => setRuleModalOpen(true)}>
          {t('organicTrafficScore.rankingRuleDesc')}
        </Button>
      </div>
      {/* 維度權重配置（可收起） */}
      {showDimensionWeight && (
        <div style={{ border: '1px solid #f0f0f0', borderRadius: 8, marginBottom: 12 }}>
          <div
            onClick={handleToggleWeightCollapsed}
            style={{
              display: 'flex', alignItems: 'center', gap: 8, padding: '10px 16px',
              cursor: 'pointer', userSelect: 'none', background: '#FAFAFA', borderRadius: weightConfigCollapsed ? 8 : '8px 8px 0 0',
            }}
          >
            {weightConfigCollapsed
              ? <DownOutlined style={{ fontSize: 10, color: '#8C8C8C' }} />
              : <UpOutlined style={{ fontSize: 10, color: '#8C8C8C' }} />}
            <span style={{ fontSize: 13, fontWeight: 600, color: '#262626' }}>{t('organicTrafficScore.dimensionWeightConfig')}</span>
            <span style={{ fontSize: 12, color: weightTotal === DIMENSION_WEIGHT_TOTAL ? '#52C41A' : '#FF4D4F' }}>
              {t('organicTrafficScore.currentTotal', { total: weightTotal })}{weightTotal === DIMENSION_WEIGHT_TOTAL ? '' : `（${t('organicTrafficScore.needEqual', { total: DIMENSION_WEIGHT_TOTAL })}）`}
            </span>
            {DIMENSION_ORDER.map(d => (
              <Tag key={d} color={SCORE_DIMENSION_COLOR[d].color} style={{ margin: 0, fontSize: 11 }}>
                {DIM_LABEL[d]} {dimensionWeight[d]}%
              </Tag>
            ))}
          </div>
          {!weightConfigCollapsed && (
            <div style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
              {DIMENSION_ORDER.map(dimension => (
                <div key={dimension} style={{ flex: 1 }}>
                  <div style={{ fontSize: 12, color: '#595959', marginBottom: 4 }}>{DIM_LABEL[dimension]}</div>
                  <InputNumber value={dimensionWeight[dimension]} min={0} max={DIMENSION_WEIGHT_TOTAL}
                    addonAfter="%" style={{ width: '100%' }} disabled={readOnly}
                    onChange={val => setDimensionWeight(prev => ({ ...prev, [dimension]: val ?? 0 }))} />
                </div>
              ))}
              {!readOnly && (
                <Button type="primary" size="small" icon={<SaveOutlined />}
                  disabled={weightTotal !== DIMENSION_WEIGHT_TOTAL} loading={savingWeights}
                  onClick={handleSaveWeights} style={{ marginTop: 18 }}>
                  {t('organicTrafficScore.saveWeight')}
                </Button>
              )}
            </div>
          )}
        </div>
      )}

      {/* 各維度評分項配置：Tabs 切換，頁面高度固定不隨評分項增多而拉長 */}
      <div style={{
        padding: '4px 20px 16px', background: '#fff',
        border: '1px solid #f0f0f0', borderRadius: 8,
      }}>
        <Tabs
          activeKey={String(activeDimension)}
          onChange={handleDimensionChange}
          items={DIMENSION_ORDER.map(dimension => ({
            key: String(dimension),
            label: (
              <span style={{ fontSize: 13 }}>
                {SCORE_DIMENSION_ICON[dimension]} {DIM_LABEL[dimension]}
                <span style={{ color: '#8C8C8C', marginLeft: 4 }}>
                  ({getRules(dimension).length})
                </span>
              </span>
            ),
            children: renderRulePanel(dimension),
          }))}
        />
      </div>

      {/* 自然流量排名規則說明彈窗 */}
      <Modal
        title={t('organicTrafficScore.rankingRuleTitle')}
        open={ruleModalOpen}
        width={680}
        onCancel={() => setRuleModalOpen(false)}
        footer={<Button onClick={() => setRuleModalOpen(false)}>{t('organicTrafficScore.close')}</Button>}
      >
        <div style={{ fontSize: 13, lineHeight: 2, color: '#595959', marginTop: 12 }}>
          <div dangerouslySetInnerHTML={{ __html: t('organicTrafficScore.rule1') }} />
          <div>{t('organicTrafficScore.rule2')}</div>
          <div>{t('organicTrafficScore.rule3')}</div>
          <div>{t('organicTrafficScore.rule4', { total: DIMENSION_WEIGHT_TOTAL })}</div>
          <div>{t('organicTrafficScore.rule5')}</div>
          <div>{t('organicTrafficScore.rule6')}</div>
        </div>
      </Modal>

      {/* 新增/編輯評分項彈窗 */}
      <Modal
        title={editingRule ? t('organicTrafficScore.editRule') : (selectedTemplate ? `${selectedTemplate.name}（${selectedTemplate.id}）` : t('organicTrafficScore.addRule'))}
        open={modalOpen}
        onOk={handleSaveRule}
        onCancel={() => setModalOpen(false)}
        okText={t('common.save')}
        cancelText={t('common.cancel')}
        okButtonProps={{ icon: <SaveOutlined />, disabled: !editingRule && isTemplateDuplicate }}
        width={640}
        destroyOnClose
      >
        <Form form={ruleForm} layout="vertical" style={{ marginTop: 16 }}>
          {/* ===== 新增模式：模板選擇 + 動態配置 ===== */}
          {!editingRule && (
            <>
              <Form.Item label="評分項模板" required>
                <Select
                  showSearch
                  placeholder="請搜索或選擇評分項（支持名稱 / ID 搜索）"
                  optionFilterProp="label"
                  value={addTemplateId}
                  onChange={handleSelectTemplate}
                  options={availableTemplates.map(tpl => ({
                    value: tpl.id,
                    label: `${tpl.name}（${tpl.id}）`,
                  }))}
                  style={{ width: '100%' }}
                  allowClear
                  onClear={() => { setAddTemplateId(undefined); ruleForm.resetFields() }}
                />
              </Form.Item>
              {isTemplateDuplicate && (
                <Alert type="error" showIcon message="該評分項已在列表中配置，不可重複添加" style={{ marginBottom: 16 }} />
              )}
              {!selectedTemplate && (
                <div style={{ textAlign: 'center', padding: '32px 0', color: '#bfbfbf', fontSize: 13 }}>
                  請從上方選擇一個評分項模板
                </div>
              )}
              {selectedTemplate && !isTemplateDuplicate && (() => {
                const tpl = selectedTemplate
                return (
                  <>
                    {/* 描述（只讀） */}
                    <div style={{ padding: '10px 14px', background: '#FAFAFA', borderRadius: 6, marginBottom: 16, fontSize: 13, color: '#595959', lineHeight: 1.6 }}>
                      {tpl.description}
                    </div>

                    {/* RULE_DEDUCTION：統計天數 + 每單扣分 */}
                    {tpl.mode === ScoreMode.RULE_DEDUCTION && (
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
                        <div>
                          <div style={{ fontSize: 12, color: '#595959', marginBottom: 4 }}>統計天數</div>
                          <Form.Item name="statDays" noStyle>
                            <InputNumber min={1} max={365} style={{ width: '100%' }} addonAfter="天" placeholder="統計天數" />
                          </Form.Item>
                        </div>
                        <div>
                          <div style={{ fontSize: 12, color: '#595959', marginBottom: 4 }}>每單扣分</div>
                          <Form.Item name="deductionPerOrder" noStyle>
                            <InputNumber min={1} max={500} style={{ width: '100%' }} addonAfter="分" placeholder="每單扣分" />
                          </Form.Item>
                        </div>
                      </div>
                    )}

                    {/* DECAY（PLT_01）：滿分 + 衰減係數 */}
                    {tpl.id === 'PLT_01' && (
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
                        <div>
                          <div style={{ fontSize: 12, color: '#595959', marginBottom: 4 }}>滿分</div>
                          <Form.Item name="score" noStyle>
                            <InputNumber min={0} max={500} style={{ width: '100%' }} addonAfter="分" placeholder="滿分分值" />
                          </Form.Item>
                        </div>
                        <div>
                          <div style={{ fontSize: 12, color: '#595959', marginBottom: 4 }}>衰減係數</div>
                          <Form.Item name="decayCoefficient" noStyle>
                            <InputNumber min={0.1} max={100} step={0.1} style={{ width: '100%' }} placeholder="衰減係數" />
                          </Form.Item>
                        </div>
                      </div>
                    )}

                    {/* PLT_02A 配送範圍：5 個時段 × 4 個距離分值 */}
                    {tpl.id === 'PLT_02A' && (
                      <div style={{ marginBottom: 16 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: '#262626', marginBottom: 10 }}>配送範圍分時段配置</div>
                        {TIME_PERIOD_KEYS.map(periodKey => (
                          <div key={periodKey} style={{ padding: '10px 12px', background: '#FAFAFA', borderRadius: 6, border: '1px solid #F0F0F0', marginBottom: 8 }}>
                            <div style={{ fontSize: 12, fontWeight: 600, color: '#262626', marginBottom: 8 }}>{TIME_PERIOD_LABELS[periodKey]}</div>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
                              {RANGE_SCORE_KEYS.map(key => (
                                <div key={key}>
                                  <div style={{ fontSize: 11, color: '#8C8C8C', marginBottom: 2 }}>{RANGE_LABEL[key]}</div>
                                  <Form.Item name={['timeRangeScores', periodKey, key]} noStyle>
                                    <InputNumber min={0} max={500} style={{ width: '100%' }} addonAfter="分" size="small" />
                                  </Form.Item>
                                </div>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* 通用 RULE_BONUS / AMOUNT_MULTIPLIER：分值 */}
                    {tpl.mode === ScoreMode.RULE_BONUS && tpl.id !== 'PLT_02A' && (
                      <div style={{ marginBottom: 16 }}>
                        <div style={{ fontSize: 12, color: '#595959', marginBottom: 4 }}>分值</div>
                        <Form.Item name="score" noStyle>
                          <InputNumber min={0} max={500} style={{ width: '100%' }} addonAfter="分" placeholder="固定加分分值" />
                        </Form.Item>
                      </div>
                    )}
                    {tpl.mode === ScoreMode.AMOUNT_MULTIPLIER && (
                      <div style={{ marginBottom: 16 }}>
                        <div style={{ fontSize: 12, color: '#595959', marginBottom: 4 }}>倍率</div>
                        <Form.Item name="score" noStyle>
                          <InputNumber min={0} max={100} step={0.1} style={{ width: '100%' }} addonAfter="倍" placeholder="金額倍率" />
                        </Form.Item>
                      </div>
                    )}

                    {/* TIERED：梯度檔位配置 */}
                    {tpl.mode === ScoreMode.TIERED && (
                      <div style={{ marginBottom: 16, padding: '14px 16px', background: '#f6ffed', border: '1px solid #b7eb8f', borderRadius: 8 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: '#262626', marginBottom: 12 }}>梯度計分配置</div>
                        {tierRows.length === 0 && (
                          <div style={{ fontSize: 12, color: '#8C8C8C', marginBottom: 8 }}>尚未配置檔位，請點擊下方「新增檔位」</div>
                        )}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
                          {tierRows.map((tier, idx) => (
                            <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', padding: '8px 12px', background: '#fff', borderRadius: 6, border: '1px solid #f0f0f0' }}>
                              <span style={{ fontSize: 12, color: '#8C8C8C', minWidth: 20 }}>#{idx + 1}</span>
                              <span style={{ fontSize: 12, color: '#595959' }}>統計</span>
                              <InputNumber value={tier.statDays} min={1} max={365} size="small" style={{ width: 64 }} placeholder="天數"
                                onChange={val => { const n = [...tierRows]; n[idx] = { ...n[idx], statDays: val ?? undefined }; setTierRows(n) }} />
                              <span style={{ fontSize: 12, color: '#595959' }}>天，訂單</span>
                              <Select value={tier.direction} style={{ width: 72 }} size="small"
                                onChange={val => { const n = [...tierRows]; n[idx] = { ...n[idx], direction: val }; setTierRows(n) }}
                                options={[{ label: '≤', value: TierDirection.LESS_THAN }, { label: '≥', value: TierDirection.MORE_THAN }]} />
                              <InputNumber value={tier.threshold} min={0} size="small" style={{ width: 72 }} placeholder="閾值"
                                onChange={val => { const n = [...tierRows]; n[idx] = { ...n[idx], threshold: val ?? 0 }; setTierRows(n) }} />
                              <span style={{ fontSize: 12, color: '#595959' }}>單，</span>
                              <span style={{ fontSize: 12, color: tier.score >= 0 ? '#52C41A' : '#FF4D4F' }}>加</span>
                              <InputNumber value={tier.score} size="small" style={{ width: 72 }} placeholder="分值"
                                onChange={val => { const n = [...tierRows]; n[idx] = { ...n[idx], score: val ?? 0 }; setTierRows(n) }} />
                              <span style={{ fontSize: 12, color: '#595959' }}>分</span>
                              <Button type="text" size="small" danger icon={<DeleteOutlined />} style={{ marginLeft: 'auto' }}
                                onClick={() => setTierRows(prev => prev.filter((_, i) => i !== idx))} />
                            </div>
                          ))}
                        </div>
                        <Button type="dashed" size="small" icon={<PlusOutlined />} block
                          onClick={() => setTierRows(prev => [...prev, { threshold: 0, direction: TierDirection.LESS_THAN, score: 0, statDays: 30 }])}>
                          新增檔位
                        </Button>
                      </div>
                    )}

                    {/* CONDITIONAL：條件計分配置 */}
                    {tpl.mode === ScoreMode.CONDITIONAL && (
                      <div style={{ marginBottom: 16, padding: '14px 16px', background: '#f0f5ff', border: '1px solid #adc6ff', borderRadius: 8 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: '#262626', marginBottom: 4 }}>條件計分配置</div>
                        <div style={{ fontSize: 12, color: '#8C8C8C', marginBottom: 12 }}>每組定義一個條件描述及對應分值</div>
                        {conditionRows.length === 0 && (
                          <div style={{ fontSize: 12, color: '#8C8C8C', marginBottom: 8 }}>尚未配置條件，請點擊下方「新增條件」</div>
                        )}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
                          {conditionRows.map((item, idx) => (
                            <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', background: '#fff', borderRadius: 6, border: '1px solid #f0f0f0' }}>
                              <span style={{ fontSize: 12, color: '#8C8C8C', minWidth: 20 }}>#{idx + 1}</span>
                              <Input value={item.condition} placeholder="條件描述" style={{ flex: 1 }} size="small"
                                onChange={e => { const n = [...conditionRows]; n[idx] = { ...n[idx], condition: e.target.value }; setConditionRows(n) }} />
                              <InputNumber value={item.score} min={-100} max={100} size="small" style={{ width: 80 }} placeholder="分值"
                                onChange={val => { const n = [...conditionRows]; n[idx] = { ...n[idx], score: val ?? 0 }; setConditionRows(n) }} />
                              <span style={{ fontSize: 12, color: '#595959' }}>分</span>
                              <Button type="text" size="small" danger icon={<DeleteOutlined />} style={{ marginLeft: 'auto' }}
                                onClick={() => setConditionRows(prev => prev.filter((_, i) => i !== idx))} />
                            </div>
                          ))}
                        </div>
                        <Button type="dashed" size="small" icon={<PlusOutlined />} block
                          onClick={() => setConditionRows(prev => [...prev, { condition: '', score: 10 }])}>
                          新增條件
                        </Button>
                      </div>
                    )}

                    {/* 狀態開關 */}
                    <Form.Item
                      label={t('organicTrafficScore.status')}
                      name="status"
                      valuePropName="checked"
                      getValueProps={v => ({ checked: v === ServiceStatus.ENABLED })}
                      normalize={(checked: boolean) => checked ? ServiceStatus.ENABLED : ServiceStatus.DISABLED}
                      initialValue={ServiceStatus.ENABLED}
                      rules={[{ required: true, message: t('organicTrafficScore.statusRequired') }]}
                    >
                      <Switch checkedChildren={t('common.enable')} unCheckedChildren={t('common.disable')} />
                    </Form.Item>
                  </>
                )
              })()}
            </>
          )}

          {/* ===== 編輯模式：原有表單（保持不變） ===== */}
          {editingRule && (
            <>
              <Form.Item label={t('organicTrafficScore.dimension')}>
                <Input disabled value={DIM_LABEL[modalDimension]} />
              </Form.Item>
              <Form.Item label={t('organicTrafficScore.ruleName')} name="name" rules={[{ required: true, message: t('organicTrafficScore.ruleNameRequired') }]}>
                <Input placeholder={t('organicTrafficScore.namePlaceholder')} maxLength={30} showCount />
              </Form.Item>
              <Form.Item label="前提條件" name="prerequisites" extra="填寫此規則生效的前提條件">
                <Input placeholder="例如：商家報名免運費活動" maxLength={60} showCount allowClear />
              </Form.Item>
              <Form.Item label={t('organicTrafficScore.scoringMode')} name="mode" rules={[{ required: true, message: t('organicTrafficScore.scoringModeRequired') }]}>
                <Select options={MODE_OPTIONS} placeholder={t('organicTrafficScore.selectScoringMode')} disabled={editingRule?.mode === ScoreMode.TIERED} />
              </Form.Item>
              {!isDeliveryRange(editingRule?.id) && ruleFormMode !== ScoreMode.TIERED && ruleFormMode !== ScoreMode.CONDITIONAL && (
                <Form.Item label={t('organicTrafficScore.score')} name="score"
                  rules={[{ required: !isDeliveryRange(editingRule?.id), message: t('organicTrafficScore.scoreRequired') }]}
                  extra={ruleFormMode === ScoreMode.AMOUNT_MULTIPLIER ? t('organicTrafficScore.scoreExtraMultiplier') : t('organicTrafficScore.scoreExtraNormal')}>
                  <InputNumber min={-100} max={100} style={{ width: '100%' }} placeholder={t('organicTrafficScore.scorePlaceholder')} />
                </Form.Item>
              )}
          {/* 梯度計分配置：檔位編輯器（統計天數合併到每檔） */}
          {ruleFormMode === ScoreMode.TIERED && (
            <div style={{ marginBottom: 16, padding: '14px 16px', background: '#f6ffed', border: '1px solid #b7eb8f', borderRadius: 8 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#262626', marginBottom: 12 }}>梯度計分配置</div>
              {tierRows.length === 0 && (
                <div style={{ fontSize: 12, color: '#8C8C8C', marginBottom: 8 }}>尚未配置檔位，請點擊下方「新增檔位」</div>
              )}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
                {tierRows.map((tier, idx) => (
                  <div key={idx} style={{
                    display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap',
                    padding: '8px 12px', background: '#fff', borderRadius: 6,
                    border: '1px solid #f0f0f0',
                  }}>
                    <span style={{ fontSize: 12, color: '#8C8C8C', minWidth: 20 }}>#{idx + 1}</span>
                    <span style={{ fontSize: 12, color: '#595959' }}>統計</span>
                    <InputNumber
                      value={tier.statDays}
                      min={1}
                      max={365}
                      size="small"
                      style={{ width: 64 }}
                      placeholder="天數"
                      onChange={val => {
                        const next = [...tierRows]
                        next[idx] = { ...next[idx], statDays: val ?? undefined }
                        setTierRows(next)
                      }}
                    />
                    <span style={{ fontSize: 12, color: '#595959' }}>天，訂單</span>
                    <Select
                      value={tier.direction}
                      style={{ width: 72 }}
                      size="small"
                      onChange={val => {
                        const next = [...tierRows]
                        next[idx] = { ...next[idx], direction: val }
                        setTierRows(next)
                      }}
                      options={[
                        { label: '≤', value: TierDirection.LESS_THAN },
                        { label: '≥', value: TierDirection.MORE_THAN },
                      ]}
                    />
                    <InputNumber
                      value={tier.threshold}
                      min={0}
                      size="small"
                      style={{ width: 72 }}
                      placeholder="閾值"
                      onChange={val => {
                        const next = [...tierRows]
                        next[idx] = { ...next[idx], threshold: val ?? 0 }
                        setTierRows(next)
                      }}
                    />
                    <span style={{ fontSize: 12, color: '#595959' }}>單，</span>
                    <span style={{ fontSize: 12, color: tier.score >= 0 ? '#52C41A' : '#FF4D4F' }}>加</span>
                    <InputNumber
                      value={tier.score}
                      size="small"
                      style={{ width: 72 }}
                      placeholder="分值"
                      onChange={val => {
                        const next = [...tierRows]
                        next[idx] = { ...next[idx], score: val ?? 0 }
                        setTierRows(next)
                      }}
                    />
                    <span style={{ fontSize: 12, color: '#595959' }}>分</span>
                    <Button
                      type="text"
                      size="small"
                      danger
                      icon={<DeleteOutlined />}
                      style={{ marginLeft: 'auto' }}
                      onClick={() => setTierRows(prev => prev.filter((_, i) => i !== idx))}
                    />
                  </div>
                ))}
              </div>
              <Button
                type="dashed"
                size="small"
                icon={<PlusOutlined />}
                block
                onClick={() => setTierRows(prev => [...prev, { threshold: 0, direction: TierDirection.LESS_THAN, score: 0, statDays: 30 }])}
              >
              新增檔位
              </Button>
            </div>
          )}
          {/* 條件計分配置：多組「條件描述 → 分值」 */}
          {ruleFormMode === ScoreMode.CONDITIONAL && (
            <div style={{ marginBottom: 16, padding: '14px 16px', background: '#f0f5ff', border: '1px solid #adc6ff', borderRadius: 8 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#262626', marginBottom: 4 }}>條件計分配置</div>
              <div style={{ fontSize: 12, color: '#8C8C8C', marginBottom: 12 }}>每組定義一個條件描述及對應分值，可新增多組以覆蓋不同場景</div>
              {conditionRows.length === 0 && (
                <div style={{ fontSize: 12, color: '#8C8C8C', marginBottom: 8 }}>尚未配置條件，請點擊下方「新增條件」</div>
              )}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
                {conditionRows.map((item, idx) => (
                  <div key={idx} style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    padding: '10px 12px', background: '#fff', borderRadius: 6,
                    border: '1px solid #f0f0f0',
                  }}>
                    <span style={{ fontSize: 12, color: '#8C8C8C', minWidth: 20 }}>#{idx + 1}</span>
                    <Input
                      value={item.condition}
                      placeholder="條件描述，如：報名免運費活動"
                      style={{ flex: 1 }}
                      size="small"
                      onChange={e => {
                        const next = [...conditionRows]
                        next[idx] = { ...next[idx], condition: e.target.value }
                        setConditionRows(next)
                      }}
                    />
                    <InputNumber
                      value={item.score}
                      min={-100}
                      max={100}
                      size="small"
                      style={{ width: 80 }}
                      placeholder="分值"
                      onChange={val => {
                        const next = [...conditionRows]
                        next[idx] = { ...next[idx], score: val ?? 0 }
                        setConditionRows(next)
                      }}
                    />
                    <span style={{ fontSize: 12, color: '#595959' }}>分</span>
                    <Button
                      type="text"
                      size="small"
                      danger
                      icon={<DeleteOutlined />}
                      style={{ marginLeft: 'auto' }}
                      onClick={() => setConditionRows(prev => prev.filter((_, i) => i !== idx))}
                    />
                  </div>
                ))}
              </div>
              <Button
                type="dashed"
                size="small"
                icon={<PlusOutlined />}
                block
                onClick={() => setConditionRows(prev => [...prev, { condition: '', score: 10 }])}
              >
                新增條件
              </Button>
            </div>
          )}
          {isDeliveryRange(editingRule?.id) && (
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 13, fontWeight: 500, color: '#262626', marginBottom: 8 }}>{t('organicTrafficScore.deliveryRangeTiered')}</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 }}>
                {RANGE_SCORE_KEYS.map(key => (
                  <Form.Item
                    key={key}
                    label={RANGE_LABEL[key]}
                    name={['rangeScores', key]}
                    rules={[{ required: true, message: t('organicTrafficScore.rangeScoreRequired', { label: RANGE_LABEL[key] }) }]}
                    style={{ marginBottom: 0 }}
                    initialValue={DEFAULT_RANGE_SCORES[key]}
                  >
                    <InputNumber min={0} max={100} style={{ width: '100%' }} placeholder={t('organicTrafficScore.scoreInputPlaceholder')} addonAfter={t('organicTrafficScore.scoreUnit')} />
                  </Form.Item>
                ))}
              </div>
            </div>
          )}
          <Form.Item label={t('organicTrafficScore.scoringDesc')} name="description" rules={[{ required: true, message: t('organicTrafficScore.scoringDescRequired') }]}>
            <Input.TextArea placeholder={t('organicTrafficScore.descPlaceholder')} rows={3} maxLength={120} showCount />
          </Form.Item>
          {editingRule && needsStatDays(editingRule.mode, editingRule.id) && editingRule.mode !== ScoreMode.TIERED && (
            <Form.Item
              label={t('organicTrafficScore.statDays')}
              name="statDays"
              extra={t('organicTrafficScore.statDaysExtra')}
            >
              <InputNumber min={1} max={365} style={{ width: '100%' }} placeholder={t('organicTrafficScore.statDaysPlaceholder')} addonAfter={t('organicTrafficScore.daysUnit')} />
            </Form.Item>
          )}
          <Form.Item
            label={t('organicTrafficScore.status')}
            name="status"
            valuePropName="checked"
            getValueProps={v => ({ checked: v === ServiceStatus.ENABLED })}
            normalize={(checked: boolean) => checked ? ServiceStatus.ENABLED : ServiceStatus.DISABLED}
            rules={[{ required: true, message: t('organicTrafficScore.statusRequired') }]}
          >
            <Switch checkedChildren={t('common.enable')} unCheckedChildren={t('common.disable')} />
          </Form.Item>
            </>
          )}
        </Form>
      </Modal>
    </div>

    {/* PLT_03 門店選擇彈窗（屏蔽商家） */}
    <Modal
      title={
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ width: 24, height: 24, borderRadius: 6, background: '#fff2f0', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <ShopOutlined style={{ fontSize: 12, color: '#FF4D4F' }} />
          </div>
          <span style={{ fontSize: 16, fontWeight: 600, color: '#FF4D4F' }}>{storeModalReadOnly ? '屏蔽商家列表' : '選擇屏蔽商家'}</span>
        </div>
      }
      open={storeModalVisible}
      onCancel={() => setStoreModalVisible(false)}
      width={800}
      {...(storeModalReadOnly ? {
        footer: <Button onClick={() => setStoreModalVisible(false)}>關閉</Button>,
      } : {
        onOk: () => {
          const codes = tempBlockedStores.map(s => s.storeCode)
          setInlineForm(prev => ({ ...prev, PLT_03: { ...prev.PLT_03, blockedMerchants: codes } }) as any)
          setStoreModalVisible(false)
          message.success(`已選擇 ${codes.length} 家屏蔽商家`)
        },
        okText: '確認選擇',
        cancelText: '取消',
      })}
      destroyOnClose
    >
      {/* 搜索條件 */}
      <div className="search-section" style={{ marginBottom: 12 }}>
        <Form form={storeSearchForm} layout="inline" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
          <Form.Item label="集團" name="groupKeyword">
            <Select
              showSearch
              allowClear
              placeholder="搜索集團ID/名稱"
              options={storeGroupOptions}
              filterOption={(input, option) =>
                (option?.label ?? '').toLowerCase().includes(input.toLowerCase())
              }
            />
          </Form.Item>
          <Form.Item label="門店" name="storeKeyword">
            <Select
              showSearch
              allowClear
              placeholder="搜索門店ID/名稱"
              options={storeNameOptions}
              filterOption={(input, option) =>
                (option?.label ?? '').toLowerCase().includes(input.toLowerCase())
              }
            />
          </Form.Item>
          <Form.Item>
            <Space>
              <Button type="primary" icon={<SearchOutlined />} onClick={() => {
                const vals = storeSearchForm.getFieldsValue()
                setStoreSearchValues(vals)
              }}>搜索</Button>
              <Button onClick={() => {
                storeSearchForm.resetFields()
                setStoreSearchValues({})
              }}>重置</Button>
            </Space>
          </Form.Item>
        </Form>
      </div>

      {/* 已選提示（編輯模式可關閉，只讀模式純展示） */}
      {tempBlockedStores.length > 0 && (
        <div style={{ marginBottom: 12, padding: '6px 12px', background: '#fff2f0', borderRadius: 6, border: '1px solid #ffccc7', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 6 }}>
          <span style={{ fontSize: 12, color: '#FF4D4F', fontWeight: 500 }}>共 {tempBlockedStores.length} 家商家</span>
          <Space size={4} wrap>
            {tempBlockedStores.slice(0, 8).map(s => (
              <Tag
                key={s.storeCode}
                color="error"
                closable={!storeModalReadOnly}
                onClose={(e) => { e.preventDefault(); setTempBlockedStores(tempBlockedStores.filter(m => m.storeCode !== s.storeCode)) }}
                style={{ fontSize: 11, margin: 0 }}
              >
                {s.storeName}
              </Tag>
            ))}
            {tempBlockedStores.length > 8 && (
              <Tag color="error" style={{ fontSize: 11, margin: 0 }}>+{tempBlockedStores.length - 8} 家</Tag>
            )}
          </Space>
        </div>
      )}

      {/* 門店列表 */}
      <Table
        rowKey="storeCode"
        dataSource={filteredStores}
        pagination={{ pageSize: 10, showSizeChanger: true, pageSizeOptions: ['10', '20', '50'], showTotal: (total) => `共 ${total} 家`, size: 'small' }}
        size="small"
        scroll={{ y: 360 }}
        rowSelection={storeModalReadOnly ? undefined : {
          type: 'checkbox',
          selectedRowKeys: tempBlockedStores.map(s => s.storeCode),
          preserveSelectedRowKeys: true,
          onChange: (_keys, rows) => {
            setTempBlockedStores(rows.filter(Boolean))
          },
        }}
        columns={[
          { title: '集團編碼', dataIndex: 'groupCode', key: 'groupCode', width: 100 },
          { title: '集團名稱', dataIndex: 'groupName', key: 'groupName', width: 140 },
          { title: '門店編碼', dataIndex: 'storeCode', key: 'storeCode', width: 100 },
          { title: '門店名稱', dataIndex: 'storeName', key: 'storeName' },
        ]}
      />
    </Modal>
    </Spin>
  )
}
