import { useState, useMemo, useEffect, useRef, useCallback } from 'react'
import { Button, Tag, Space, Modal, Form, Input, Select, InputNumber, message, Switch, Tabs, Spin } from 'antd'
import { SettingOutlined, PlusOutlined, SaveOutlined, SearchOutlined, QuestionCircleOutlined, DeleteOutlined, DownOutlined, UpOutlined, EditOutlined, CloseOutlined } from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
import { ServiceStatus } from './constants'
import { getSystemRuleValue } from '@/hooks/useSystemRules'
import {
  ScoreDimension, ScoreMode, TierDirection, CalcCycle,
  SCORE_DIMENSION_ICON, SCORE_DIMENSION_COLOR,
  SCORE_MODE_COLOR,
  DEFAULT_DIMENSION_WEIGHT, DIMENSION_WEIGHT_TOTAL,
  DEFAULT_ORGANIC_SCORE_RULES,
  RANGE_SCORE_KEYS, DEFAULT_RANGE_SCORES,
  TIER_DIRECTION_LABEL, CALC_CYCLE_LABEL,
  type OrganicScoreRule, type RangeScores, type ScoreTier, type ScoreConditionItem,
} from './organicTrafficConfig'
import {
  fetchOrganicScoreConfig, updateDimensionWeights as apiUpdateWeights,
  createOrganicRule, updateOrganicRule, toggleOrganicRuleStatus,
  deleteOrganicRule,
  type OrganicRuleVO,
} from '@/api/organicScore'

/** 數值計數動畫（1200ms，遵循數據指標統計卡標準） */
function useCountUp(target: number, duration = 1200) {
  const [value, setValue] = useState(0)
  const rafRef = useRef<number>()
  useEffect(() => {
    const start = performance.now()
    const tick = (now: number) => {
      const progress = Math.min((now - start) / duration, 1)
      const eased = 1 - Math.pow(2, -10 * progress)
      setValue(Math.round(target * eased))
      if (progress < 1) rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current) }
  }, [target, duration])
  return value
}

function AnimatedNumber({ value, suffix = '' }: { value: number; suffix?: string }) {
  const animated = useCountUp(value)
  return <>{animated.toLocaleString()}{suffix}</>
}

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
  status: ServiceStatus
}

/** 判斷是否為配送範圍規則（需配置短程/中程/遠程/跨橋分數，不需要分值字段） */
const isDeliveryRange = (id?: string) => !!id && id.startsWith('PLT_02')

/** 判斷是否需要統計天數（訂單、好評、差評、梯度計分等時效性指標需要） */
const needsStatDays = (mode?: ScoreMode, id?: string) => {
  if (mode === ScoreMode.TIERED) return true
  if (!id) return false
  return ['STO_02A', 'STO_02B', 'STO_03'].includes(id)
}

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
  try { tiers = vo.tiers ? JSON.parse(vo.tiers) : undefined } catch { tiers = undefined }
  try { rangeScores = vo.rangeScores ? JSON.parse(vo.rangeScores) : undefined } catch { rangeScores = undefined }
  try { conditionItems = vo.conditionItems ? JSON.parse(vo.conditionItems) : undefined } catch { conditionItems = undefined }
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
    status: vo.status as ServiceStatus,
    builtin: vo.builtin === 1,
  }
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
        setRules(config.rules.map(voToRule))
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
  /** 維度說明（依賴 t） */
  const DIM_DESC: Record<ScoreDimension, string> = {
    [ScoreDimension.COMMERCIAL]: t('organicTrafficScore.descCommercial'),
    [ScoreDimension.STORE]: t('organicTrafficScore.descStore'),
    [ScoreDimension.PLATFORM]: t('organicTrafficScore.descPlatform'),
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
  /** 權重配置是否收起 */
  const [weightConfigCollapsed, setWeightConfigCollapsed] = useState(false)
  /** 內聯編輯中的規則 ID 集合 */
  const [inlineEditing, setInlineEditing] = useState<Record<string, boolean>>({})
  /** 內聯編輯臨時表單值 */
  const [inlineForm, setInlineForm] = useState<Record<string, Partial<OrganicScoreRule>>>({})

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
      status: values.status!,
    }
    try {
      const vo = await updateOrganicRule(ruleId as unknown as number, payload)
      setRules(prev => prev.map(r => r.id === ruleId ? voToRule(vo) : r))
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

  /** 各維度啟用項數量（統計卡） */
  const enabledCountMap = useMemo(() => {
    const map = {} as Record<ScoreDimension, number>
    DIMENSION_ORDER.forEach(d => {
      map[d] = rules.filter(r => r.dimension === d && r.status === ServiceStatus.ENABLED).length
    })
    return map
  }, [rules])

  /** 打開新增彈窗 */
  const handleOpenAdd = (dimension: ScoreDimension) => {
    setEditingRule(null)
    setModalDimension(dimension)
    ruleForm.setFieldsValue({
      name: '',
      description: '',
      mode: ScoreMode.RULE_BONUS,
      score: 50,
      prerequisites: undefined,
      statDays: undefined,
      rangeScores: undefined,
      tiers: undefined,
      conditionItems: undefined,
      calcCycle: CalcCycle.NIGHTLY,
      status: ServiceStatus.ENABLED,
    })
    setTierRows([])
    setConditionRows([])
    setModalOpen(true)
  }

  /** 打開編輯彈窗 */
  const handleOpenEdit = (record: OrganicScoreRule) => {
    setEditingRule(record)
    setModalDimension(record.dimension)
    ruleForm.setFieldsValue({
      name: record.name,
      description: record.description,
      mode: record.mode,
      score: record.score,
      prerequisites: record.prerequisites,
      statDays: record.statDays,
      rangeScores: record.rangeScores,
      tiers: record.tiers,
      conditionItems: record.conditionItems,
      calcCycle: record.calcCycle,
      status: record.status,
    })
    setTierRows(record.tiers || [])
    setConditionRows(record.conditionItems || [])
    setModalOpen(true)
  }

  /** 保存評分項（新增或編輯） */
  const handleSaveRule = async () => {
    const values = await ruleForm.validateFields()
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
        const prefix = modalDimension === ScoreDimension.COMMERCIAL ? 'COM'
          : modalDimension === ScoreDimension.PLATFORM ? 'PLT' : 'ST'
        const newRule: OrganicScoreRule = {
          id: `${prefix}_CUSTOM_${Date.now()}`,
          dimension: modalDimension,
          builtin: false,
          ...values,
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
                        {!rule.builtin && (
                          <Button type="link" size="small" danger onClick={e => { e.stopPropagation(); handleDelete(rule) }}>{t('common.delete')}</Button>
                        )}
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
                    {/* ── 元信息行：規則ID + 計分方式 + 分值 + 操作按鈕 ── */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
                      <Tag color="blue" style={{ fontSize: 11, margin: 0 }}>{rule.id}</Tag>
                      <Tag color={SCORE_MODE_COLOR[rule.mode]} style={{ fontSize: 11, margin: 0 }}>{MODE_LABEL[rule.mode]}</Tag>
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
                      {rule.statDays && (
                        <span style={{ fontSize: 12, color: '#8C8C8C' }}>統計 {rule.statDays} 天</span>
                      )}
                      {!readOnly && (
                        <div style={{ marginLeft: 'auto', flexShrink: 0 }}>
                          {!isEditingInline ? (
                            <Button size="small" icon={<EditOutlined />} onClick={() => handleInlineEdit(rule)}
                              style={{ borderRadius: 4, borderColor: '#E8720C', color: '#E8720C', fontSize: 12, height: 28 }}>
                              編輯
                            </Button>
                          ) : (
                            <Space size={6}>
                              <Button size="small" onClick={() => handleInlineCancel(rule.id)}
                                style={{ borderRadius: 4, fontSize: 12, height: 28 }}>取消</Button>
                              <Button size="small" type="primary" icon={<SaveOutlined />} onClick={() => handleInlineSave(rule.id)}
                                style={{ borderRadius: 4, fontSize: 12, height: 28, backgroundColor: '#E8720C', borderColor: '#E8720C' }}>保存</Button>
                            </Space>
                          )}
                        </div>
                      )}
                    </div>

                    {/* ── 內容區：顯示模式 vs 編輯模式 ── */}
                    {!isEditingInline ? (
                      /* 顯示模式 */
                      <>
                        <div style={{ fontSize: 13, color: '#595959', marginBottom: 8, lineHeight: 1.6 }}>
                          {rule.description}
                        </div>
                        {rule.prerequisites && (
                          <div style={{
                            display: 'inline-flex', alignItems: 'center', gap: 6,
                            padding: '6px 12px', background: '#f9f0ff', borderRadius: 6,
                            border: '1px solid #d3adf7', marginBottom: 10,
                          }}>
                            <span style={{ fontSize: 11, fontWeight: 600, color: '#722ED1', whiteSpace: 'nowrap' }}>前提條件</span>
                            <span style={{ fontSize: 13, color: '#595959' }}>{rule.prerequisites}</span>
                          </div>
                        )}
                        {rule.mode === ScoreMode.CONDITIONAL && rule.conditionItems?.length && (
                          <div style={{ marginTop: 8 }}>
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
                        {rule.mode === ScoreMode.TIERED && rule.tiers?.length && (
                          <div style={{ marginTop: 8 }}>
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
                        {rule.rangeScores && (
                          <div style={{ marginTop: 8 }}>
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
                        {!rule.rangeScores && [ScoreMode.RULE_BONUS, ScoreMode.RULE_DEDUCTION, ScoreMode.DECAY].includes(rule.mode) && (
                          <div style={{ marginTop: 8, fontSize: 13 }}>
                            <span style={{ color: '#8C8C8C' }}>分值：</span>
                            <span style={{ fontWeight: 600, fontSize: 16, color: rule.score >= 0 ? '#52C41A' : '#FF4D4F' }}>
                              {rule.score >= 0 ? '+' : ''}{rule.score} 分
                            </span>
                          </div>
                        )}
                      </>
                    ) : (
                      /* 編輯模式 */
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                          <div>
                            <div style={{ fontSize: 12, color: '#595959', marginBottom: 4 }}>規則名稱</div>
                            <Input size="small" value={form.name} maxLength={30} showCount
                              onChange={e => setInlineForm(prev => ({ ...prev, [rule.id]: { ...prev[rule.id], name: e.target.value } }) as any)} />
                          </div>
                          <div>
                            <div style={{ fontSize: 12, color: '#595959', marginBottom: 4 }}>前提條件</div>
                            <Input size="small" value={form.prerequisites || ''} maxLength={60} showCount allowClear
                              placeholder="填寫規則生效的前提條件"
                              onChange={e => setInlineForm(prev => ({ ...prev, [rule.id]: { ...prev[rule.id], prerequisites: e.target.value || undefined } }) as any)} />
                          </div>
                        </div>
                        <div>
                          <div style={{ fontSize: 12, color: '#595959', marginBottom: 4 }}>評分說明</div>
                          <Input.TextArea size="small" value={form.description} rows={2} maxLength={120} showCount
                            onChange={e => setInlineForm(prev => ({ ...prev, [rule.id]: { ...prev[rule.id], description: e.target.value } }) as any)} />
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                          <div>
                            <div style={{ fontSize: 12, color: '#595959', marginBottom: 4 }}>計分方式</div>
                            <Select size="small" value={form.mode} style={{ width: '100%' }}
                              options={MODE_OPTIONS}
                              onChange={val => setInlineForm(prev => ({ ...prev, [rule.id]: { ...prev[rule.id], mode: val } }) as any)} />
                          </div>
                          <div>
                            <div style={{ fontSize: 12, color: '#595959', marginBottom: 4 }}>分值</div>
                            <InputNumber size="small" value={form.score} min={-100} max={100} style={{ width: '100%' }}
                              onChange={val => setInlineForm(prev => ({ ...prev, [rule.id]: { ...prev[rule.id], score: val ?? 0 } }) as any)} />
                          </div>
                        </div>
                        <div>
                          <div style={{ fontSize: 12, color: '#595959', marginBottom: 4 }}>狀態</div>
                          <Switch checked={form.status === ServiceStatus.ENABLED}
                            checkedChildren={t('common.enable')} unCheckedChildren={t('common.disable')}
                            onChange={checked => setInlineForm(prev => ({ ...prev, [rule.id]: { ...prev[rule.id], status: checked ? ServiceStatus.ENABLED : ServiceStatus.DISABLED } }) as any)} />
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
            onClick={() => setWeightConfigCollapsed(!weightConfigCollapsed)}
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
        title={editingRule ? t('organicTrafficScore.editRule') : t('organicTrafficScore.addRule')}
        open={modalOpen}
        onOk={handleSaveRule}
        onCancel={() => setModalOpen(false)}
        okText={t('common.save')}
        cancelText={t('common.cancel')}
        okButtonProps={{ icon: <SaveOutlined /> }}
        width={640}
        destroyOnClose
      >
        <Form form={ruleForm} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item label={t('organicTrafficScore.dimension')}>
            <Input
              disabled
              value={DIM_LABEL[modalDimension]}
            />
          </Form.Item>
          <Form.Item label={t('organicTrafficScore.ruleName')} name="name" rules={[{ required: true, message: t('organicTrafficScore.ruleNameRequired') }]}>
            <Input placeholder={t('organicTrafficScore.namePlaceholder')} maxLength={30} showCount />
          </Form.Item>
          <Form.Item
            label="前提條件"
            name="prerequisites"
            extra="填寫此規則生效的前提條件，如「商家報名免運費活動」「參與滿額立減活動」"
          >
            <Input placeholder="例如：商家報名免運費活動" maxLength={60} showCount allowClear />
          </Form.Item>

          <Form.Item label={t('organicTrafficScore.scoringMode')} name="mode" rules={[{ required: true, message: t('organicTrafficScore.scoringModeRequired') }]}>
            <Select options={MODE_OPTIONS} placeholder={t('organicTrafficScore.selectScoringMode')}
              disabled={editingRule?.mode === ScoreMode.TIERED}
            />
          </Form.Item>
          {!isDeliveryRange(editingRule?.id) && ruleFormMode !== ScoreMode.TIERED && ruleFormMode !== ScoreMode.CONDITIONAL && (
            <Form.Item
              label={t('organicTrafficScore.score')}
              name="score"
              rules={[{ required: !isDeliveryRange(editingRule?.id), message: t('organicTrafficScore.scoreRequired') }]}
              extra={ruleFormMode === ScoreMode.AMOUNT_MULTIPLIER
                ? t('organicTrafficScore.scoreExtraMultiplier')
                : t('organicTrafficScore.scoreExtraNormal')}
            >
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
        </Form>
      </Modal>
    </div>
    </Spin>
  )
}
