import { useState, useEffect, useRef, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { Button, Form, Input, Select, message, Tag, Checkbox, InputNumber, Modal, Table, Popover } from 'antd'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { ArrowLeftOutlined, SaveOutlined, SettingOutlined, AppstoreOutlined, PlusOutlined, DeleteOutlined, QuestionCircleOutlined, ShopOutlined } from '@ant-design/icons'
import { AlgorithmType, APP_OPTIONS } from './constants'
import { fetchAdAlgorithmDetail, createAdAlgorithm, updateAdAlgorithm, appTypeToBrand, brandToAppType, type AdAlgorithmRequest } from '../../api/adPromotion'
import OrganicTrafficScoreConfig from './OrganicTrafficScoreConfig'
import PopularLayoutPreviewModal from '../../components/PopularLayoutPreviewModal'
import './WeightSlider.css'

/** 广告类型标签映射 - 使用 i18n key */
const TYPE_LABEL_KEY: Record<number, string> = {
  [AlgorithmType.INVINCIBLE_STAR]: 'recommend.algoInvincibleStar',
  [AlgorithmType.NEW_STORE_AD]: 'recommend.algoNewStoreAd',
  [AlgorithmType.HOT_REVIVE_AD]: 'recommend.algoHotReviveAd',
  [AlgorithmType.EXCLUSIVE_MERCHANT]: 'recommend.algoExclusiveMerchant',
  [AlgorithmType.TRAFFIC_AD]: 'recommend.algoTrafficAd',
  [AlgorithmType.GUESS_YOU_LIKE]: 'recommend.algoGuessYouLike',
  [AlgorithmType.ORGANIC_TRAFFIC]: 'recommend.algoOrganicTraffic',
  [AlgorithmType.POPULAR_MERCHANT_KA]: 'recommend.algoPopularMerchant',
  [AlgorithmType.BRAND_MERCHANT]: 'recommend.algoBrandMerchant',
  [AlgorithmType.GOLD_AD]: 'recommend.algoGoldAd',
  [AlgorithmType.GOLDEN_SIGNBOARD]: 'recommend.algoGoldenSignboard',
  [AlgorithmType.PRODUCT_PROMO]: 'recommend.algoProductPromo',
}

const TYPE_ICON: Record<number, string> = {
  [AlgorithmType.INVINCIBLE_STAR]: '⭐',
  [AlgorithmType.NEW_STORE_AD]: '🏪',
  [AlgorithmType.HOT_REVIVE_AD]: '🔥',
  [AlgorithmType.EXCLUSIVE_MERCHANT]: '👑',
  [AlgorithmType.TRAFFIC_AD]: '📊',
  [AlgorithmType.GUESS_YOU_LIKE]: '💡',
  [AlgorithmType.ORGANIC_TRAFFIC]: '🌿',
  [AlgorithmType.POPULAR_MERCHANT_KA]: '🏆',
  [AlgorithmType.BRAND_MERCHANT]: '💎',
  [AlgorithmType.GOLD_AD]: '💰',
  [AlgorithmType.GOLDEN_SIGNBOARD]: '🏅',
  [AlgorithmType.PRODUCT_PROMO]: '🎯',
}

/** 店鋪等級配置（獨家商家保障單量 / 品牌商家保障流量共用）：等級 / 標籤 / 標籤色 / 默認值 */
const STORE_LEVEL_BLOCK_OPTIONS = [
  { level: 'KA', labelKey: 'recommend.storeLevelKa', color: '#F5222D', defaultOrders: 30 },
  { level: 'RECHARGE', labelKey: 'recommend.storeLevelRecharge', color: '#FAAD14', defaultOrders: 25 },
  { level: 'A', labelKey: 'recommend.storeLevelA', color: '#E8720C', defaultOrders: 20 },
  { level: 'B', labelKey: 'recommend.storeLevelB', color: '#1890FF', defaultOrders: 15 },
  { level: 'C', labelKey: 'recommend.storeLevelC', color: '#52C41A', defaultOrders: 10 },
  { level: 'D', labelKey: 'recommend.storeLevelD', color: '#722ED1', defaultOrders: 8 },
  { level: 'E', labelKey: 'recommend.storeLevelE', color: '#13C2C2', defaultOrders: 5 },
]

export default function AlgorithmAdd() {
  const { t } = useTranslation()
  const tAppOptions = useMemo(() => APP_OPTIONS.map(o => ({ label: t(o.labelKey), value: o.value })), [t])
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const algorithmTypeParam = searchParams.get('type') || ''
  const algorithmIdParam = searchParams.get('id') || ''
  const modeParam = searchParams.get('mode') || ''
  const isDetailMode = modeParam === 'detail' // 只读详情模式
  const initialType = algorithmTypeParam ? Number(algorithmTypeParam) as AlgorithmType : null
  const isEditMode = !!algorithmIdParam && !isDetailMode // 有 id 参数且非详情模式则为编辑模式
  const [form] = Form.useForm()
  const merchantExposureStrategy = Form.useWatch('merchantExposureStrategy', form) // 监听曝光策略选择

  // 商家维度配置（按商家维度曝光策略）
  interface DimensionItem {
    id: string
    type: string
    weight: number | undefined
  }
  const DIMENSION_OPTIONS = [
    { value: 'qualityScore', labelKey: 'recommend.dimQualityScore', descKey: 'recommend.dimQualityScoreDesc' },
    { value: 'orderCompletion', labelKey: 'recommend.dimOrderCompletion', descKey: 'recommend.dimOrderCompletionDesc' },
    { value: 'newMerchant', labelKey: 'recommend.dimNewMerchant', descKey: 'recommend.dimNewMerchantDesc' },
    { value: 'distance', labelKey: 'recommend.dimDistance', descKey: 'recommend.dimDistanceDesc' },
  ]
  const [dimensionItems, setDimensionItems] = useState<DimensionItem[]>([])
  const [selectedDimension, setSelectedDimension] = useState<string | undefined>(undefined)
  const [orderCompletionDays, setOrderCompletionDays] = useState(30) // 订单完成率天数
  const [tooltipVisible, setTooltipVisible] = useState<Record<string, boolean>>({})
  const hideTimerRef = useRef<Record<string, NodeJS.Timeout>>({})
  const [selectedAlgorithmType, _setSelectedAlgorithmType] = useState<AlgorithmType | null>(initialType) // 从 URL 参数初始化
  const [presaleMode, _setPresaleMode] = useState(true) // false: 固定, true: 滚动
  const [continuousPurchase, _setContinuousPurchase] = useState(false) // false: 不支持, true: 支持
  const [merchantLimit, _setMerchantLimit] = useState(false) // false: 不限制, true: 限制
  const [selectedMerchants, setSelectedMerchants] = useState<string[]>([])
  // 盘活复苏 - 配送范围计算（4 个固定参数：短程/中程/远程/跨桥）
  const [reviveDeliveryRange, setReviveDeliveryRange] = useState<string[]>([])
  const [merchantModalVisible, setMerchantModalVisible] = useState(false)
  const [regionLimit, _setRegionLimit] = useState(true) // false: 不限制, true: 限制
  const [selectedRegions, _setSelectedRegions] = useState<string[]>([])
  const [_isEditing, setIsEditing] = useState(isEditMode && !isDetailMode) // 编辑模式（详情模式下不可编辑）

  /** 金字招牌 - 參數配置（支持多條招牌，每條含分類+名稱+滿足條件） */
  interface SignboardItem {
    id: number
    category: 'ranking' | 'featured'
    name: string
    metric: string
    scope: string
    comparison: string
    value: number | undefined
  }
  let signboardIdSeed = Date.now()
  const createSignboardItem = (partial?: Partial<SignboardItem>): SignboardItem => ({
    id: signboardIdSeed++,
    category: 'ranking',
    name: '',
    metric: 'monthlyOrders',
    scope: 'allMerchants',
    comparison: 'percentage',
    value: undefined,
    ...partial,
  })
  const [signboardItems, setSignboardItems] = useState<SignboardItem[]>([createSignboardItem()])

  /** 人氣商家 - 展示佈局類型 */
  type PopularLayoutType = 'small' | 'grid' | 'carousel'
  const POPULAR_LAYOUT_OPTIONS: { value: PopularLayoutType; labelKey: string; icon: string; color: string; descKey: string }[] = [
    { value: 'small', labelKey: 'recommend.layoutSmall', icon: '📱', color: '#1890FF', descKey: 'recommend.layoutSmall' },
    { value: 'grid', labelKey: 'recommend.layoutGrid', icon: '🖼️', color: '#52C41A', descKey: 'recommend.layoutGridDesc' },
    { value: 'carousel', labelKey: 'recommend.layoutCarousel', icon: '🎠', color: '#722ED1', descKey: 'recommend.layoutCarouselDesc' },
  ]
  /** 人氣商家 - 展示樣式配置 */
  type LayoutMode = 'manual' | 'auto'
  interface ManualRule { id: number; position: number; layout: PopularLayoutType }
  let ruleIdSeed = Date.now()
  const [layoutMode, setLayoutMode] = useState<LayoutMode>('manual')
  // 指定模式：指定第幾個商家用什么樣式，未指定的默認小圖
  const [manualRules, setManualRules] = useState<ManualRule[]>([
    { id: ruleIdSeed++, position: 4, layout: 'grid' },
    { id: ruleIdSeed++, position: 7, layout: 'carousel' },
  ])
  // 系統計算模式：有序閉環循環（A→間隔x→B→間隔y→C→間隔z→回到A）
  interface AutoLayoutItem { id: number; type: PopularLayoutType; interval: number }
  const [autoLayouts, setAutoLayouts] = useState<AutoLayoutItem[]>([
    { id: ruleIdSeed++, type: 'grid', interval: 3 },
    { id: ruleIdSeed++, type: 'carousel', interval: 4 },
  ])
  /** 可用的大圖樣式（排除小圖） */
  const bigLayoutOptions = POPULAR_LAYOUT_OPTIONS.filter(o => o.value !== 'small')
  // 新店广告 - 波浪计算配置（周期/间隔为默认值，后续如需调整仅改以下常量）
  /** 新店週期默認天數 */
  const NEW_STORE_CYCLE_DAYS = 60
  /** 波浪間隔（天）：每 N 天切換一次配送範圍 */
  const WAVE_INTERVAL_DAYS = 5
  /** 配送範圍選項 */
  const WAVE_RANGE_OPTIONS = [
    { value: 'short', labelKey: 'recommend.waveShort' },
    { value: 'medium', labelKey: 'recommend.waveMedium' },
    { value: 'long', labelKey: 'recommend.waveLong' },
  ]

  interface WaveNode {
    day: number
    ranges: string[] // ['short','medium','long']
  }

  // 按周期与间隔生成剩余天数节点：60, 55, ..., 5
  const buildWaveNodes = (): WaveNode[] => {
    const nodes: WaveNode[] = []
    for (let d = NEW_STORE_CYCLE_DAYS; d > 0; d -= WAVE_INTERVAL_DAYS) {
      nodes.push({ day: d, ranges: [] })
    }
    return nodes
  }
  const [waveNodes, setWaveNodes] = useState<WaveNode[]>(buildWaveNodes)

  // 单元格勾选：切换某节点的某个配送范围
  const handleToggleWaveCell = (idx: number, range: string, checked: boolean) => {
    setWaveNodes(prev => prev.map((n, i) => {
      if (i !== idx) return n
      return { ...n, ranges: checked ? [...n.ranges, range] : n.ranges.filter(r => r !== range) }
    }))
  }

  // 清空全部勾选
  const handleClearWaveNodes = () => {
    setWaveNodes(prev => prev.map(n => ({ ...n, ranges: [] })))
  }

  // 编辑模式或详情模式下加载默认数据
  useEffect(() => {
    if (!algorithmIdParam) return
    fetchAdAlgorithmDetail(Number(algorithmIdParam))
      .then(detail => {
        form.setFieldsValue({
          name: detail.algoName,
          brand: brandToAppType(detail.brand),
        })
        // 解析 params JSON 字符串，回填算法特有参数
        if (detail.params) {
          try {
            const p = typeof detail.params === 'string' ? JSON.parse(detail.params) : detail.params
            // 人气商家：回填展示布局配置
            if (p.layoutMode) {
              setLayoutMode(p.layoutMode as LayoutMode)
            }
            if (Array.isArray(p.manualRules) && p.manualRules.length > 0) {
              setManualRules(p.manualRules.map((r: ManualRule) => ({ ...r, id: ruleIdSeed++ })))
            }
            if (Array.isArray(p.autoLayouts) && p.autoLayouts.length > 0) {
              setAutoLayouts(p.autoLayouts.map((r: AutoLayoutItem) => ({ ...r, id: ruleIdSeed++ })))
            }
            // 兼容旧格式
            if (!p.layoutMode && Array.isArray(p.layoutSequence) && p.layoutSequence.length > 0) {
              setLayoutMode('manual')
              const rules: ManualRule[] = p.layoutSequence.map((t: PopularLayoutType, i: number) => t !== 'small' ? { id: ruleIdSeed++, position: i + 1, layout: t } : null).filter(Boolean) as ManualRule[]
              setManualRules(rules)
            }
            // 回填数据一致性校验定时器
            if (p.consistencyCheckInterval) {
              form.setFieldsValue({ consistencyCheckInterval: p.consistencyCheckInterval })
            }
            // 回填商家状态计算
            if (p.statusOpen !== undefined) form.setFieldsValue({ statusOpen: p.statusOpen })
            if (p.statusRest !== undefined) form.setFieldsValue({ statusRest: p.statusRest })
            if (p.statusOverwhelmed !== undefined) form.setFieldsValue({ statusOverwhelmed: p.statusOverwhelmed })
            if (p.statusClosed !== undefined) form.setFieldsValue({ statusClosed: p.statusClosed })
          } catch { /* params 解析失敗保持默認值 */ }
        }
      })
      .catch(() => { /* 静默请求：错误不阻断页面 */ })
  }, [algorithmIdParam, form])

  // 返回算法列表页
  const handleBack = () => {
    navigate(`/promotion-algorithm?type=${algorithmTypeParam}`)
  }

  // 进入编辑模式
  const _handleEdit = () => {
    setIsEditing(true)
  }

  // 取消编辑
  const _handleCancelEdit = () => {
    setIsEditing(false)
    form.resetFields()
  }

  // 打开商家选择弹窗
  const _handleOpenMerchantModal = () => {
    setMerchantModalVisible(true)
  }

  // 关闭商家选择弹窗
  const handleCloseMerchantModal = () => {
    setMerchantModalVisible(false)
  }

  // 确认选择商家
  const handleConfirmMerchants = () => {
    form.setFieldsValue({ merchants: selectedMerchants })
    setMerchantModalVisible(false)
    message.success(t('recommend.selectedMerchants', { count: selectedMerchants.length }))
  }

  // 商家选择表格列
  const merchantColumns = [
    { title: t('recommend.merchantIdCol'), dataIndex: 'id', key: 'id', width: 100 },
    { title: t('recommend.merchantNameCol'), dataIndex: 'name', key: 'name', width: 200 },
    { title: t('common:brand'), dataIndex: 'brand', key: 'brand', width: 120 },
    { title: t('common:colTradeType'), dataIndex: 'businessType', key: 'businessType', width: 120 },
  ]

  // Mock商家数据
  const mockMerchants = [
    { id: 'M001', name: '澳門茶餐廳', brand: '閃蜂', businessType: '外賣到家' },
    { id: 'M002', name: '葡撻專門店', brand: '閃蜂', businessType: '團購到店' },
    { id: 'M003', name: '海鲜美食坊', brand: 'mFood', businessType: '外賣到家' },
    { id: 'M004', name: '日式拉面屋', brand: '閃蜂', businessType: '外賣到家' },
    { id: 'M005', name: '泰式料理', brand: 'mFood', businessType: '團購到店' },
    { id: 'M006', name: '美式漢堡', brand: '閃蜂', businessType: '外賣到家' },
    { id: 'M007', name: '意大利麵館', brand: 'mFood', businessType: '外賣到家' },
    { id: 'M008', name: '法式甜品店', brand: '閃蜂', businessType: '團購到店' },
  ]

  // 提交表单（新增/编辑写入后端，后端不可用时降级为本地提示）
  const handleSubmit = async () => {
    try {
      const values = await form.validateFields()
      // 人气商家：校验
      if (Number(algorithmTypeParam) === AlgorithmType.POPULAR_MERCHANT_KA && layoutMode === 'manual' && manualRules.some(r => r.position < 1)) {
        message.error(t('recommend.merchantPosMin'))
        return
      }
      const payload: AdAlgorithmRequest = {
        algoName: values.name,
        algoType: Number(algorithmTypeParam),
        brand: appTypeToBrand(values.brand),
        params: {
          presaleMode,
          continuousPurchase,
          merchantLimit,
          merchants: selectedMerchants,
          regionLimit,
          regions: selectedRegions,
          merchantExposureStrategy: values.merchantExposureStrategy,
          ...(selectedAlgorithmType === AlgorithmType.POPULAR_MERCHANT_KA ? {
            layoutMode,
            manualRules: layoutMode === 'manual' ? manualRules.map(({ position, layout }) => ({ position, layout })) : [],
            autoLayouts: layoutMode === 'auto' ? autoLayouts.map(({ type, interval }) => ({ type, interval })) : [],
          } : selectedAlgorithmType === AlgorithmType.GOLDEN_SIGNBOARD ? {
            signboardItems: signboardItems.map(({ category, name, metric, scope, comparison, value }) => ({
              category,
              signboardName: name,
              qualificationMetric: metric,
              qualificationScope: scope,
              qualificationComparison: comparison,
              qualificationValue: value,
            })),
          } : {
            // 非人氣商家/金字招牌：商家狀態計算 + 數據一致性校驗定時器
            consistencyCheckInterval: values.consistencyCheckInterval,
            statusOpen: values.statusOpen ?? true,
            statusRest: values.statusRest ?? false,
            statusOverwhelmed: values.statusOverwhelmed ?? false,
            statusClosed: values.statusClosed ?? false,
          }),
        },
      }
      if (isEditMode) {
        await updateAdAlgorithm(Number(algorithmIdParam), payload)
      } else {
        await createAdAlgorithm(payload)
      }
      message.success(isEditMode ? t('recommend.algoUpdateSuccess') : t('recommend.algoAddSuccess'))
      setIsEditing(false)
      navigate(`/promotion-algorithm?type=${algorithmTypeParam}`)
    } catch (error) {
      // 表单校验失败不提示（antd 已标红），接口业务错误提示后端返回信息
      if (error instanceof Error) {
        message.error(error.message || t('recommend.saveFailed'))
      }
    }
  }

  return (
    <div className="content-area">
      {/* 页面头部 */}
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
              }}>{t('common:back')}</Button>
            <div style={{ width: 1, height: 20, background: '#E8E8E8' }} />
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#1890ff' }}>
                {isDetailMode ? t('recommend.algoDetail') : isEditMode ? t('recommend.editAlgo') : t('recommend.addAlgo')}
              </h2>
              {selectedAlgorithmType && (
                <span style={{ fontSize: 14, color: '#595959' }}>
                  {TYPE_ICON[selectedAlgorithmType]} {t(TYPE_LABEL_KEY[selectedAlgorithmType])}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      <Form
        form={form}
        layout="vertical"
        disabled={isDetailMode}
        initialValues={{
          presaleMode: 'rolling',
          continuousPurchase: 'notSupport',
          merchantLimit: 'unlimited',
          regionLimit: 'limited',
          merchantExposureStrategy: 'random',
        }}
      >
      {/* 算法选择区域 */}
      <div style={{ border: '1px solid #e8eaed', borderRadius: 8, background: '#fff', padding: '20px 24px', marginBottom: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
          <div style={{ width: 28, height: 28, borderRadius: 6, background: '#e6f7ff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <AppstoreOutlined style={{ fontSize: 14, color: '#1890ff' }} />
          </div>
          <span style={{ fontSize: 15, fontWeight: 600, color: '#262626' }}>{t('recommend.algoSelect')}</span>
          <div style={{ flex: 1, height: 1, background: '#f0f0f0', marginLeft: 8 }} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 16 }}>
          <Form.Item
            label={t('recommend.algoName')}
            name="name"
            rules={[{ required: true, message: t('recommend.algoNamePh') }]}
            style={{ marginBottom: 0 }}
          >
            <Input placeholder={t('recommend.algoNamePh')} />
          </Form.Item>

          <Form.Item
            label={t('common:brand')}
            name="brand"
            rules={[{ required: true, message: t('common:selectBrand') }]}
            style={{ marginBottom: 0 }}
          >
            <Select
              placeholder={t('common:selectBrand')}
              options={tAppOptions}
              disabled={isEditMode || isDetailMode}
            />
          </Form.Item>
        </div>
      </div>

      {/* 算法参数区域 */}
      {selectedAlgorithmType === AlgorithmType.ORGANIC_TRAFFIC ? (
        /* 自然流量：4 個維度的商家評分規則配置 */
        <OrganicTrafficScoreConfig readOnly={isDetailMode} />
      ) : (selectedAlgorithmType === AlgorithmType.INVINCIBLE_STAR || selectedAlgorithmType === AlgorithmType.HOT_REVIVE_AD || selectedAlgorithmType === AlgorithmType.NEW_STORE_AD || selectedAlgorithmType === AlgorithmType.EXCLUSIVE_MERCHANT || selectedAlgorithmType === AlgorithmType.POPULAR_MERCHANT_KA || selectedAlgorithmType === AlgorithmType.BRAND_MERCHANT || selectedAlgorithmType === AlgorithmType.GUESS_YOU_LIKE || selectedAlgorithmType === AlgorithmType.GOLDEN_SIGNBOARD) ? (
        <div style={{ border: '1px solid #e8eaed', borderRadius: 8, background: '#fff', padding: '20px 24px', marginBottom: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
            <div style={{ width: 28, height: 28, borderRadius: 6, background: '#fff7e6', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <SettingOutlined style={{ fontSize: 14, color: '#fa8c16' }} />
            </div>
            <span style={{ fontSize: 15, fontWeight: 600, color: '#262626' }}>{t('recommend.algoParams')}</span>
            <Tag color="orange" style={{ marginLeft: 4, fontSize: 11 }}>{t('recommend.paramConfigTag')}</Tag>
            <div style={{ flex: 1, height: 1, background: '#f0f0f0', marginLeft: 8 }} />
            <span style={{ fontSize: 12, color: '#8c8c8c' }}>{t('recommend.configAlgoParams')}</span>
          </div>


          {/* ===== 人氣商家：商家展示樣式 + 數據一致性校驗 ===== */}
          {selectedAlgorithmType === AlgorithmType.POPULAR_MERCHANT_KA && (
            <>
            {/* 數據一致性校驗定時器 */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
              <span style={{ fontSize: 13, color: '#595959', minWidth: 96, textAlign: 'right', flexShrink: 0 }}>{t('recommend.timerLabel')}</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 13, color: '#595959', whiteSpace: 'nowrap' }}>{t('recommend.everyPrefix')}</span>
                <Form.Item name="consistencyCheckInterval" noStyle initialValue={5} rules={[{ required: true, message: t('common:required') }]}>
                  <InputNumber min={1} max={1440} placeholder={t('recommend.unitMinute')} style={{ width: 70 }} />
                </Form.Item>
                <span style={{ fontSize: 13, color: '#595959', whiteSpace: 'nowrap' }}>{t('recommend.verifyDataConsistency')}</span>
              </div>
            </div>
            {/* 商家展示樣式配置 */}
            <div style={{ marginBottom: 16 }}>
              {/* 標題區 */}
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 14 }}>
                <div style={{ width: 32, height: 32, borderRadius: 8, background: 'linear-gradient(135deg, #f6ffed, #e6f7ff)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, border: '1px solid #b7eb8f' }}>
                  <AppstoreOutlined style={{ fontSize: 15, color: '#52C41A' }} />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
                    <span style={{ fontSize: 14, fontWeight: 600, color: '#262626' }}>{t('recommend.merchantDisplayStyle')}</span>
                    <PopularLayoutPreviewModal />
                  </div>
                  <div style={{ fontSize: 12, color: '#8c8c8c', lineHeight: '18px' }}>
                    {t('recommend:merchantDisplayStyleHint')}
                  </div>
                </div>
              </div>

              {/* 模式切換 */}
              <div style={{ display: 'flex', gap: 0, marginBottom: 14 }}>
                {([
                  { value: 'manual' as LayoutMode, labelKey: 'recommend:manualMode', descKey: 'recommend:manualModeDesc' },
                  { value: 'auto' as LayoutMode, labelKey: 'recommend:autoMode', descKey: 'recommend:autoModeDesc' },
                ]).map(m => (
                  <div key={m.value}
                    onClick={() => !isDetailMode && setLayoutMode(m.value)}
                    style={{
                      flex: 1, padding: '10px 14px', borderRadius: 8, cursor: isDetailMode ? 'default' : 'pointer',
                      border: layoutMode === m.value ? '1px solid #52C41A' : '1px solid #f0f0f0',
                      background: layoutMode === m.value ? '#f6ffed' : '#fafafa',
                      transition: 'all 0.2s',
                    }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: layoutMode === m.value ? '#52C41A' : '#595959' }}>{t(m.labelKey)}</div>
                    <div style={{ fontSize: 11, color: '#8c8c8c', marginTop: 2 }}>{t(m.descKey)}</div>
                  </div>
                ))}
              </div>

              {/* ===== 指定模式 ===== */}
              {layoutMode === 'manual' && (
                <div style={{ background: '#fafafa', borderRadius: 8, border: '1px solid #f0f0f0', padding: '14px 16px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: '#595959' }}>{t('recommend:manualRuleHint')}</span>
                    {!isDetailMode && (
                      <Button type="dashed" size="small" icon={<PlusOutlined style={{ fontSize: 11 }} />}
                        onClick={() => setManualRules(prev => [...prev, { id: ruleIdSeed++, position: 1, layout: 'grid' }])}
                        style={{ fontSize: 12, borderRadius: 4 }}
                      >{t('recommend:addRule')}</Button>
                    )}
                  </div>
                  {manualRules.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '16px 0', color: '#bfbfbf', fontSize: 13 }}>
                      {t('recommend:noRulesSet')}
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {manualRules.map((rule) => (
                        <div key={rule.id} style={{
                          display: 'flex', alignItems: 'center', gap: 8,
                          background: '#fff', borderRadius: 6, padding: '8px 12px', border: '1px solid #f0f0f0',
                        }}>
                          <span style={{ fontSize: 13, color: '#595959' }}>{t('recommend:nthMerchant')}</span>
                          <InputNumber min={1} max={999} value={rule.position} disabled={isDetailMode}
                            onChange={v => v && setManualRules(prev => prev.map(r => r.id === rule.id ? { ...r, position: v } : r))}
                            style={{ width: 60 }} size="small" />
                          <span style={{ fontSize: 13, color: '#595959' }}>{t('recommend:merchantDisplay')}</span>
                          <Select value={rule.layout} disabled={isDetailMode} style={{ width: 170 }} size="small"
                            onChange={v => setManualRules(prev => prev.map(r => r.id === rule.id ? { ...r, layout: v } : r))}
                            options={POPULAR_LAYOUT_OPTIONS.filter(o => o.value !== 'small').map(o => ({ label: `${o.icon} ${t(o.labelKey)}`, value: o.value }))}
                          />
                          {!isDetailMode && (
                            <Button type="text" size="small" danger
                              onClick={() => setManualRules(prev => prev.filter(r => r.id !== rule.id))}
                              style={{ marginLeft: 'auto', width: 26, height: 26, padding: 0, borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12 }}
                            ><DeleteOutlined /></Button>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* ===== 系統計算模式：有序閉環循環 ===== */}
              {layoutMode === 'auto' && (
                <div style={{ background: '#fafafa', borderRadius: 8, border: '1px solid #f0f0f0', padding: '14px 16px' }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: '#595959', marginBottom: 10, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span>{t('recommend:cycleChainHint')}</span>
                    {!isDetailMode && (
                      <Button type="dashed" size="small" icon={<PlusOutlined style={{ fontSize: 11 }} />}
                        onClick={() => {
                          const used = new Set(autoLayouts.map(a => a.type))
                          const next = bigLayoutOptions.find(o => !used.has(o.value))
                          if (next) setAutoLayouts(prev => [...prev, { id: ruleIdSeed++, type: next.value, interval: 3 }])
                        }}
                        disabled={autoLayouts.length >= bigLayoutOptions.length}
                        style={{ fontSize: 12, borderRadius: 4 }}
                      >{t('recommend:addStyle')}</Button>
                    )}
                  </div>

                  {autoLayouts.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '16px 0', color: '#bfbfbf', fontSize: 13 }}>
                      {t('recommend:noStylesAdded')}
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                      {autoLayouts.map((item, idx) => {
                        const opt = POPULAR_LAYOUT_OPTIONS.find(o => o.value === item.type)!
                        return (
                          <div key={item.id}>
                            {/* 連接線 */}
                            {idx > 0 && (
                              <div style={{ display: 'flex', alignItems: 'center', paddingLeft: 20, height: 18 }}>
                                <div style={{ width: 1, height: '100%', background: '#d9d9d9' }} />
                              </div>
                            )}
                            <div style={{
                              display: 'flex', alignItems: 'center', gap: 10,
                              background: '#fff', borderRadius: 8, padding: '10px 14px',
                              border: `1px solid ${opt.color}33`,
                            }}>
                              {/* 序號 */}
                              <div style={{
                                width: 24, height: 24, borderRadius: '50%', flexShrink: 0,
                                background: opt.color, color: '#fff',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                fontSize: 12, fontWeight: 700,
                              }}>{idx + 1}</div>
                              {/* 樣式選擇 */}
                              <Select value={item.type} disabled={isDetailMode} style={{ width: 170 }} size="small"
                                onChange={v => setAutoLayouts(prev => prev.map(a => a.id === item.id ? { ...a, type: v } : a))}
                                options={bigLayoutOptions.map(o => ({ label: `${o.icon} ${t(o.labelKey)}`, value: o.value }))}
                              />
                              <span style={{ fontSize: 13, color: '#595959' }}>{t('recommend:afterAppear')}</span>
                              <InputNumber min={1} max={999} value={item.interval} disabled={isDetailMode}
                                onChange={v => v && setAutoLayouts(prev => prev.map(a => a.id === item.id ? { ...a, interval: v } : a))}
                                style={{ width: 60 }} size="small" />
                              <span style={{ fontSize: 13, color: '#595959' }}>{t('recommend:merchantsBeforeNext')}</span>
                              {!isDetailMode && (
                                <Button type="text" size="small" danger
                                  onClick={() => setAutoLayouts(prev => prev.filter(a => a.id !== item.id))}
                                  style={{ marginLeft: 'auto', width: 26, height: 26, padding: 0, borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12 }}
                                ><DeleteOutlined /></Button>
                              )}
                            </div>
                          </div>
                        )
                      })}
                      {/* 閉環指示 */}
                      {autoLayouts.length > 1 && (
                        <>
                          <div style={{ display: 'flex', alignItems: 'center', paddingLeft: 20, height: 18 }}>
                            <div style={{ width: 1, height: '100%', background: '#d9d9d9' }} />
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, paddingLeft: 4, fontSize: 12, color: '#8c8c8c', fontStyle: 'italic' }}>
                            <span style={{ fontSize: 14 }}>↻</span>
                            {t('recommend:cycleLoopHint', { count: autoLayouts.length + 1, total: autoLayouts.reduce((s, a) => s + a.interval, 0) })}
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
            </>
          )}

          {/* ===== 金字招牌：招牌列表（分類 + 名稱 + 滿足條件為一體，可新增多條） ===== */}
          {selectedAlgorithmType === AlgorithmType.GOLDEN_SIGNBOARD && (
            <>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#E8720C' }} />
                <span style={{ fontSize: 14, fontWeight: 600, color: '#262626' }}>招牌列表</span>
                <span style={{ fontSize: 12, color: '#8c8c8c' }}>可新增多條招牌，每條配置獨立的分類、名稱和滿足條件</span>
              </div>
              {!isDetailMode && (
                <Button type="primary" size="small" icon={<PlusOutlined />} onClick={() => setSignboardItems(prev => [...prev, createSignboardItem()])} style={{ borderRadius: 6 }}>
                  新增招牌
                </Button>
              )}
            </div>

            {signboardItems.map((item, index) => (
              <div key={item.id} style={{
                border: '1px solid #f0f0f0', borderRadius: 8, padding: '16px 20px', marginBottom: 12,
                background: '#FAFAFA', position: 'relative',
              }}>
                {/* 塊頭：序號 + 分類選擇 + 刪除按鈕 */}
                <div style={{ display: 'flex', alignItems: 'center', marginBottom: 14, gap: 12 }}>
                  <div style={{
                    width: 24, height: 24, borderRadius: 8, flexShrink: 0,
                    background: 'linear-gradient(135deg, #E8720C, #F59432)',
                    color: '#fff', fontSize: 12, fontWeight: 700,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    boxShadow: '0 2px 4px rgba(232,114,12,0.25)',
                  }}>{index + 1}</div>

                  {/* 招牌分類 */}
                  <div style={{ display: 'flex', gap: 8 }}>
                    {[
                      { value: 'ranking' as const, label: '排名招牌', icon: '🏆' },
                      { value: 'featured' as const, label: '特色招牌', icon: '⭐' },
                    ].map(opt => (
                      <div key={opt.value}
                        onClick={() => !isDetailMode && setSignboardItems(prev => prev.map(s => s.id === item.id ? { ...s, category: opt.value } : s))}
                        style={{
                          padding: '6px 14px', borderRadius: 6, cursor: isDetailMode ? 'default' : 'pointer',
                          border: item.category === opt.value ? '2px solid #E8720C' : '1px solid #f0f0f0',
                          background: item.category === opt.value ? '#FFF7E6' : '#fff',
                          transition: 'all 0.2s', display: 'flex', alignItems: 'center', gap: 4,
                        }}>
                        <span style={{ fontSize: 14 }}>{opt.icon}</span>
                        <span style={{ fontSize: 13, fontWeight: 600, color: item.category === opt.value ? '#E8720C' : '#595959' }}>{opt.label}</span>
                      </div>
                    ))}
                  </div>

                  <div style={{ flex: 1 }} />
                  {!isDetailMode && signboardItems.length > 1 && (
                    <Button type="link" danger size="small" icon={<DeleteOutlined />}
                      onClick={() => setSignboardItems(prev => prev.filter(s => s.id !== item.id))}>刪除</Button>
                  )}
                </div>

                {/* 招牌名稱 */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
                  <span style={{ fontSize: 13, color: '#595959', minWidth: 72, flexShrink: 0 }}><span style={{ color: '#ff4d4f', marginRight: 4 }}>*</span>招牌名稱</span>
                  <Input
                    placeholder="請輸入招牌名稱"
                    maxLength={30}
                    showCount
                    value={item.name}
                    disabled={isDetailMode}
                    onChange={e => setSignboardItems(prev => prev.map(s => s.id === item.id ? { ...s, name: e.target.value } : s))}
                    style={{ width: 300 }}
                  />
                </div>

                {/* 滿足條件 */}
                <div style={{
                  border: '1px solid #e8eaed', borderRadius: 8, background: '#fff',
                  padding: '14px 16px',
                }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#595959', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: 12 }}>📋</span> 滿足條件
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    {/* 條件一：指標 */}
                    <Select
                      value={item.metric}
                      onChange={v => setSignboardItems(prev => prev.map(s => s.id === item.id ? { ...s, metric: v } : s))}
                      disabled={isDetailMode}
                      style={{ width: 140 }}
                      options={[
                        { label: '月訂單量', value: 'monthlyOrders' },
                        { label: '月復購率', value: 'monthlyRepurchase' },
                        { label: '月好評率', value: 'monthlyRating' },
                        { label: '月訪問量', value: 'monthlyVisits' },
                        { label: '月客單價', value: 'monthlyAvgPrice' },
                        { label: '門店收藏', value: 'storeFavorites' },
                      ]}
                    />
                    <span style={{ fontSize: 13, color: '#595959' }}>超過</span>
                    {/* 條件二：範圍 */}
                    <Select
                      value={item.scope}
                      onChange={v => setSignboardItems(prev => prev.map(s => s.id === item.id ? { ...s, scope: v } : s))}
                      disabled={isDetailMode}
                      style={{ width: 160 }}
                      options={[
                        { label: '全部商家', value: 'allMerchants' },
                        { label: '商圈商家', value: 'districtMerchants' },
                        { label: '全澳品類商家', value: 'macauCategoryMerchants' },
                        { label: '商圈品類商家', value: 'districtCategoryMerchants' },
                      ]}
                    />
                    <span style={{ fontSize: 13, color: '#595959' }}>的</span>
                    {/* 條件三：比較方式 */}
                    <Select
                      value={item.comparison}
                      onChange={v => setSignboardItems(prev => prev.map(s => s.id === item.id ? { ...s, comparison: v } : s))}
                      disabled={isDetailMode}
                      style={{ width: 120 }}
                      options={[
                        { label: '百分比', value: 'percentage' },
                        { label: '排名', value: 'ranking' },
                      ]}
                    />
                    {/* 條件四：數值 */}
                    <InputNumber
                      value={item.value}
                      onChange={v => setSignboardItems(prev => prev.map(s => s.id === item.id ? { ...s, value: v ?? undefined } : s))}
                      disabled={isDetailMode}
                      min={1}
                      max={item.comparison === 'percentage' ? 100 : 9999}
                      placeholder="請輸入數值"
                      addonAfter={item.comparison === 'percentage' ? '%' : '名'}
                      style={{ width: 160 }}
                    />
                  </div>
                </div>
              </div>
            ))}
            </>
          )}

          {/* ===== 其他算法：商家狀態計算 + 數據一致性校驗 ===== */}
          {selectedAlgorithmType !== AlgorithmType.POPULAR_MERCHANT_KA && selectedAlgorithmType !== AlgorithmType.GOLDEN_SIGNBOARD && (
            <>
          {/* 商家状态计算 */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
            <span style={{ fontSize: 13, color: '#595959', minWidth: 96, textAlign: 'right', flexShrink: 0 }}>{t('recommend:merchantStatusCalc')}</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <Form.Item name="statusOpen" noStyle valuePropName="checked" initialValue={true}>
                <Checkbox disabled>{t('recommend:statusOpen')}</Checkbox>
              </Form.Item>
              <Form.Item name="statusRest" noStyle valuePropName="checked">
                <Checkbox>{t('recommend:statusRest')}<span style={{ fontSize: 12, color: '#8c8c8c' }}>{t('recommend:statusRestHint')}</span></Checkbox>
              </Form.Item>
              <Form.Item name="statusOverwhelmed" noStyle valuePropName="checked">
                <Checkbox>{t('recommend:statusOverwhelmed')}<span style={{ fontSize: 12, color: '#8c8c8c' }}>{t('recommend:statusOverwhelmedHint')}</span></Checkbox>
              </Form.Item>
              <Form.Item name="statusClosed" noStyle valuePropName="checked">
                <Checkbox>{t('recommend:statusClosed')}<span style={{ fontSize: 12, color: '#ff4d4f' }}>{t('recommend:statusClosedHint')}</span></Checkbox>
              </Form.Item>
            </div>
          </div>

          {/* 定时器 */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
            <span style={{ fontSize: 13, color: '#595959', minWidth: 96, textAlign: 'right', flexShrink: 0 }}>{t('recommend:timerLabel')}</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 13, color: '#595959', whiteSpace: 'nowrap' }}>{t('recommend:everyPrefix')}</span>
              <Form.Item name="consistencyCheckInterval" noStyle rules={[{ required: true, message: t('recommend:inputRequired') }]}>
                <InputNumber
                  min={1}
                  max={1440}
                  placeholder={t('recommend:minutePlaceholder')}
                  style={{ width: 70 }}
                />
              </Form.Item>
              <span style={{ fontSize: 13, color: '#595959', whiteSpace: 'nowrap' }}>{t('recommend:consistencyCheckSuffix')}</span>
            </div>
          </div>
            </>
          )}

          {/* ===== 猜你喜歡：用戶興趣得分規則 ===== */}
          {selectedAlgorithmType === AlgorithmType.GUESS_YOU_LIKE && (
            <div style={{ marginBottom: 16, padding: '14px 16px', background: '#fafafa', border: '1px solid #f0f0f0', borderRadius: 8 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#262626', marginBottom: 4 }}>{t('recommend:userInterestScoreRules')}</div>
              <div style={{ fontSize: 12, color: '#8c8c8c', marginBottom: 14 }}>
                {t('recommend:userInterestScoreHint')}
              </div>
          
              {/* 收藏店鋪得分 + 下單店鋪得分（並排只讀展示） */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 12, flexWrap: 'wrap' }}>
                <div style={{ display: 'inline-flex', alignItems: 'baseline', gap: 2 }}>
                  <span style={{ fontSize: 13, color: '#595959', minWidth: 96, textAlign: 'right', flexShrink: 0 }}>{t('recommend:favoriteStoreScore')}</span>
                  <span style={{ fontSize: 15, fontWeight: 700, color: '#1890FF' }}>
                    <Form.Item name="favoriteScore" noStyle initialValue={5}>
                      <InputNumber min={1} max={100} precision={0} style={{ width: 40, border: 'none', background: 'transparent', padding: 0, fontWeight: 700, color: '#1890FF', fontSize: 15 }} className="no-spinner-input" disabled />
                    </Form.Item>
                  </span>
                  <span style={{ fontSize: 12, color: '#8c8c8c', marginLeft: 2 }}>{t('recommend:scoreUnit')}</span>
                </div>
                <div style={{ display: 'inline-flex', alignItems: 'baseline', gap: 2 }}>
                  <span style={{ fontSize: 13, color: '#595959', minWidth: 96, textAlign: 'right', flexShrink: 0 }}>{t('recommend:orderStoreScore')}</span>
                  <span style={{ fontSize: 15, fontWeight: 700, color: '#52C41A' }}>
                    <Form.Item name="orderScore" noStyle initialValue={10}>
                      <InputNumber min={1} max={100} precision={0} style={{ width: 40, border: 'none', background: 'transparent', padding: 0, fontWeight: 700, color: '#52C41A', fontSize: 15 }} className="no-spinner-input" disabled />
                    </Form.Item>
                  </span>
                  <span style={{ fontSize: 12, color: '#8c8c8c', marginLeft: 2 }}>{t('recommend:scoreUnit')}</span>
                </div>
                <span style={{ fontSize: 12, color: '#8c8c8c' }}>{t('recommend:dataSourceBizConfig')}</span>
              </div>
          
              {/* 得分有效期 */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 13, color: '#595959', minWidth: 96, textAlign: 'right', flexShrink: 0 }}>{t('recommend:scoreValidDaysLabel')}</span>
                <span style={{ fontSize: 13, color: '#595959', whiteSpace: 'nowrap' }}>{t('recommend:calcRecentPrefix')}</span>
                <Form.Item name="scoreValidDays" noStyle initialValue={30} rules={[{ required: true, message: t('recommend:inputRequired') }]}>
                  <InputNumber min={1} max={365} precision={0} style={{ width: 80 }} addonAfter={t('recommend:dayUnit')} disabled={isDetailMode} />
                </Form.Item>
                <span style={{ fontSize: 13, color: '#595959', whiteSpace: 'nowrap' }}>{t('recommend:scoreValidSuffix')}</span>
                <span style={{ fontSize: 12, color: '#8c8c8c' }}>{t('recommend:scoreValidHint')}</span>
              </div>
            </div>
          )}

          {/* ===== 猜你喜歡：推送規則 ===== */}
          {selectedAlgorithmType === AlgorithmType.GUESS_YOU_LIKE && (
            <div style={{ marginBottom: 16, padding: '14px 16px', background: '#fff7e6', border: '1px solid #ffd591', borderRadius: 8 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#d46b08', marginBottom: 4 }}>{t('recommend:pushRules')}</div>
              <div style={{ fontSize: 12, color: '#8c8c8c', marginBottom: 14 }}>
                {t('recommend:pushRulesHint')}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 13, color: '#595959', minWidth: 96, textAlign: 'right', flexShrink: 0 }}>{t('recommend:pushThresholdLabel')}</span>
                <span style={{ fontSize: 13, color: '#595959', whiteSpace: 'nowrap' }}>{t('recommend:whenScoreGe')}</span>
                <Form.Item name="pushThreshold" noStyle initialValue={5} rules={[{ required: true, message: t('recommend:inputRequired') }]}>
                  <InputNumber min={1} max={9999} precision={0} style={{ width: 100 }} addonAfter={t('recommend:scoreUnit')} disabled={isDetailMode} />
                </Form.Item>
                <span style={{ fontSize: 13, color: '#595959', whiteSpace: 'nowrap' }}>{t('recommend:pushToWaterfall')}</span>
              </div>
              <div style={{ marginTop: 10, fontSize: 12, color: '#8c8c8c', paddingLeft: 108 }}>
                {t('recommend:belowThresholdHint')}
              </div>
            </div>
          )}

          {/* ===== 猜你喜歡：算法策略（三種曝光方案可選） ===== */}
          {selectedAlgorithmType === AlgorithmType.GUESS_YOU_LIKE && (
            <div style={{
              border: '1px solid #d6e4ff',
              borderRadius: 8,
              background: '#f0f5ff',
              overflow: 'hidden',
              marginBottom: 16,
            }}>
              {/* 標題欄 */}
              <div style={{
                fontSize: 14, fontWeight: 600, color: '#1890ff',
                padding: '10px 20px',
                borderBottom: '1px solid #d6e4ff',
                background: '#e6f4ff',
                display: 'flex', alignItems: 'center', gap: 6,
              }}>
                <SettingOutlined />
                {t('recommend:algoStrategy')}
              </div>

              <div style={{ padding: '16px 20px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 13, color: '#595959', whiteSpace: 'nowrap' }}>{t('recommend:merchantExposureLabel')}</span>
                  <Form.Item
                    name="merchantExposureStrategy"
                    style={{ flex: 1, marginBottom: 0 }}
                    wrapperCol={{ span: 24 }}
                  >
                    <Select
                      placeholder={t('recommend:selectPlaceholder')}
                      style={{ width: '25%', height: 36, borderRadius: 6, fontSize: 14 }}
                      options={[
                        { label: t('recommend:roundRobinCalc'), value: 'random' },
                        { label: t('recommend:weightedRandomCalc'), value: 'weightedRandom' },
                      ]}
                      disabled={isDetailMode}
                    />
                  </Form.Item>
                </div>

                {/* 輪詢計算說明 */}
                {merchantExposureStrategy === 'random' && (
                  <div style={{ marginTop: 16, padding: '12px 16px', background: '#f6ffed', border: '1px solid #b7eb8f', borderRadius: 6 }}>
                    <span style={{ fontSize: 13, color: '#595959', lineHeight: '22px' }}>
                      {t('recommend:roundRobinStrategyDesc')}
                    </span>
                  </div>
                )}

                {/* 加權隨機說明 */}
                {merchantExposureStrategy === 'weightedRandom' && (
                  <div style={{ marginTop: 16, padding: '12px 16px', background: '#fff7e6', border: '1px solid #ffd591', borderRadius: 6 }}>
                    <div style={{ fontSize: 13, color: '#595959', lineHeight: '22px', marginBottom: 8 }}>
                      {t('recommend:weightedRandomDesc')}
                    </div>
                    <div style={{ padding: '8px 10px', background: '#ffffff', border: '1px solid #e8e8e8', borderRadius: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ fontWeight: 600, color: '#d46b08', fontSize: 12 }}>{t('recommend:allocationFormula')}</span>
                      <span style={{ fontFamily: 'monospace', fontSize: 12 }}>P(店鋪i) = score_i / Σ(達標店鋪得分)</span>
                      <Popover
                        trigger="click"
                        placement="right"
                        title={<span style={{ fontWeight: 600, color: '#d46b08' }}>{t('recommend:allocationExampleTitle')}</span>}
                        content={
                          <div style={{ maxWidth: 300, fontSize: 12, lineHeight: '20px' }}>
                            <div style={{ color: '#595959', marginBottom: 6 }}>
                              {t('recommend:allocationExampleDesc')}
                            </div>
                            <div style={{ color: '#595959' }}>
                              {t('recommend:allocationExampleResult')}
                            </div>
                            <div style={{ marginTop: 8, padding: '6px 8px', background: '#fff7e6', borderRadius: 4, color: '#8c8c8c', fontSize: 11 }}>
                              {t('recommend:allocationExampleHint')}
                            </div>
                          </div>
                        }
                      >
                        <QuestionCircleOutlined style={{ color: '#d46b08', cursor: 'pointer', fontSize: 13 }} />
                      </Popover>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* 波浪計算（僅新店廣告） */}
          {selectedAlgorithmType === AlgorithmType.NEW_STORE_AD && (
            <div style={{ marginBottom: 16 }}>
              {/* 策略类型模块区域 */}
              <div style={{ border: '1px solid #e8eaed', borderRadius: 8, background: '#fafafa', padding: '16px 20px' }}>
                <div style={{ marginBottom: 14, fontSize: 14, fontWeight: 600, color: '#262626', paddingBottom: 12, borderBottom: '1px solid #f0f0f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
                  <span>{t('recommend:waveStrategyType')}</span>
                  <span style={{ fontSize: 12, fontWeight: 400, color: '#d46b08' }}>{t('recommend:newStoreWaveWarning')}</span>
                </div>

                {/* 默認參數說明 + 清空操作（緊鄰說明文字，便於發現） */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 13, color: '#595959' }}>
                    {t('recommend:newStoreCycleDesc', { days: NEW_STORE_CYCLE_DAYS, interval: WAVE_INTERVAL_DAYS, nodes: waveNodes.length })}
                  </span>
                  <Button size="small" danger disabled={isDetailMode} onClick={handleClearWaveNodes}>{t('recommend:clearAll')}</Button>
                </div>

                {/* 波浪節點勾選矩陣：緊湊固定列寬 */}
                <div style={{ border: '1px solid #e8eaed', borderRadius: 8, overflow: 'hidden', background: '#fff', width: 'fit-content' }}>
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: '90px repeat(3, 96px)',
                    background: '#f0f5ff', borderBottom: '1px solid #d6e4ff',
                    padding: '8px 16px', alignItems: 'center',
                  }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: '#1890ff' }}>{t('recommend:remainingDays')}</span>
                    {WAVE_RANGE_OPTIONS.map(opt => (
                      <span key={opt.value} style={{ fontSize: 13, fontWeight: 600, color: '#1890ff', textAlign: 'center' }}>{t(opt.labelKey)}</span>
                    ))}
                  </div>
                  <div style={{ maxHeight: 360, overflowY: 'auto' }}>
                    {waveNodes.map((node, idx) => (
                      <div key={node.day} style={{
                        display: 'grid',
                        gridTemplateColumns: '90px repeat(3, 96px)',
                        padding: '6px 16px', alignItems: 'center',
                        borderBottom: idx < waveNodes.length - 1 ? '1px solid #f0f0f0' : 'none',
                        background: node.ranges.length > 0 ? '#fffcf5' : (idx % 2 === 0 ? '#ffffff' : '#fafafa'),
                        transition: 'background 0.2s',
                      }}>
                        <span style={{ fontSize: 13, fontWeight: 600, color: '#262626' }}>{node.day} {t('recommend:dayUnit')}</span>
                        {WAVE_RANGE_OPTIONS.map(opt => (
                          <div key={opt.value} style={{ textAlign: 'center' }}>
                            <Checkbox
                              checked={node.ranges.includes(opt.value)}
                              disabled={isDetailMode}
                              onChange={(e) => handleToggleWaveCell(idx, opt.value, e.target.checked)}
                            />
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>
                </div>
                <div style={{ marginTop: 8, fontSize: 12, color: '#8c8c8c' }}>
                  {t('recommend:waveHint')}
                </div>
              </div>
            </div>
          )}

          {/* 配送範圍計算（僅盤活復蘇） - 4 個固定參數 */}
          {selectedAlgorithmType === AlgorithmType.HOT_REVIVE_AD && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
              <span style={{ fontSize: 13, color: '#595959', minWidth: 96, textAlign: 'right', flexShrink: 0 }}>{t('recommend:deliveryRangeCalc')}</span>
              <Checkbox.Group
                options={[
                  { label: t('recommend:rangeShort'), value: 'short' },
                  { label: t('recommend:rangeMedium'), value: 'medium' },
                  { label: t('recommend:rangeLong'), value: 'long' },
                  { label: t('recommend:crossBridge'), value: 'cross_bridge' },
                ]}
                value={reviveDeliveryRange}
                disabled={isDetailMode}
                onChange={(vals) => setReviveDeliveryRange(vals as string[])}
              />
            </div>
          )}

          {/* 區域商家展示限制（盤活復蘇 / 無敵星星） */}
          {(selectedAlgorithmType === AlgorithmType.HOT_REVIVE_AD || selectedAlgorithmType === AlgorithmType.INVINCIBLE_STAR) && (
            /* 盤活復蘇/無敵星星：區域商家展示限制 */
              <div style={{
                border: '1px solid #d6e4ff',
                borderRadius: 8,
                background: '#f0f5ff',
                overflow: 'hidden',
                marginBottom: 16,
              }}>
                    {/* 標題欄 */}
                    <div style={{
                      fontSize: 14, fontWeight: 600, color: '#1890ff',
                      padding: '10px 20px',
                      borderBottom: '1px solid #d6e4ff',
                      background: '#e6f4ff',
                      display: 'flex', alignItems: 'center', gap: 6,
                    }}>
                      <SettingOutlined />
                      {t('recommend:algoStrategy')}
                    </div>

                  <div style={{ padding: '16px 20px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 13, color: '#595959', whiteSpace: 'nowrap' }}>{t('recommend:merchantExposureLabel')}</span>
                      <Form.Item
                        name="merchantExposureStrategy"
                        style={{ flex: 1, marginBottom: 0 }}
                        wrapperCol={{ span: 24 }}
                      >
                        <Select
                          placeholder={t('recommend:selectPlaceholder')}
                          style={{ width: '25%', height: 36, borderRadius: 6, fontSize: 14 }}
                          options={selectedAlgorithmType === AlgorithmType.INVINCIBLE_STAR ? [
                            { label: t('recommend:randomCalc'), value: 'random' },
                          ] : selectedAlgorithmType === AlgorithmType.HOT_REVIVE_AD ? [
                            { label: t('recommend:roundRobinCalc'), value: 'random' },
                          ] : [
                            { label: t('recommend:dimensionCalc'), value: 'merchant' },
                            { label: t('recommend:roundRobinCalc'), value: 'random' },
                          ]}
                          disabled={isDetailMode || selectedAlgorithmType === AlgorithmType.INVINCIBLE_STAR || selectedAlgorithmType === AlgorithmType.HOT_REVIVE_AD}
                        />
                      </Form.Item>
                    </div>

                      {/* 按轮询维度配置 */}
                      {merchantExposureStrategy === 'random' && (
                        <div style={{ marginTop: 16, padding: '12px 16px', background: '#f6ffed', border: '1px solid #b7eb8f', borderRadius: 6 }}>
                          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                            <span style={{ fontSize: 13, color: '#595959', lineHeight: '22px' }}>
                              {selectedAlgorithmType === AlgorithmType.INVINCIBLE_STAR
                                ? t('recommend:randomStrategyDesc')
                                : t('recommend:roundRobinStrategyDesc')}
                            </span>
                          </div>
                        </div>
                      )}

                      {/* 按商家维度配置 */}
                      {merchantExposureStrategy === 'merchant' && (
                        <div style={{ marginTop: 16, padding: '12px 16px', background: '#ffffff', border: '1px solid #e8eaed', borderRadius: 6 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
                            <span style={{ fontSize: 13, color: '#595959', whiteSpace: 'nowrap' }}>
                              <span style={{ color: '#1890ff', fontWeight: 600 }}>*</span> {t('recommend:dimensionLabel')}
                            </span>
                            {dimensionItems.length < DIMENSION_OPTIONS.length && (
                              <>
                                <Select
                                  placeholder={t('recommend:selectDimension')}
                                  style={{ width: 140, height: 28 }}
                                  size="small"
                                  value={selectedDimension}
                                  onChange={(val) => setSelectedDimension(val)}
                                  options={DIMENSION_OPTIONS.filter(o => !dimensionItems.find(d => d.type === o.value))}
                                  disabled={isDetailMode}
                                />
                                <Button
                                  type="dashed"
                                  size="small"
                                  icon={<PlusOutlined />}
                                  disabled={isDetailMode || !selectedDimension}
                                  onClick={() => {
                                    if (selectedDimension) {
                                      setDimensionItems([...dimensionItems, { id: Date.now().toString(), type: selectedDimension, weight: undefined }])
                                      setSelectedDimension(undefined)
                                    }
                                  }}
                                >
                                  {t('recommend:addDimension')}
                                </Button>
                                <span style={{ fontSize: 12, color: '#8c8c8c', whiteSpace: 'nowrap' }}>{t('recommend:dimensionHint')}</span>
                              </>
                            )}
                          </div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                            {dimensionItems.map((item, index) => {
                              const opt = DIMENSION_OPTIONS.find(o => o.value === item.type)
                              return (
                                <div key={item.id} style={{ display: 'flex', flexDirection: 'column', gap: 8, position: 'relative', padding: '10px 12px', background: '#fafafa', border: '1px solid #f0f0f0', borderRadius: 6 }}>
                                  {/* 第一行：参数名 + 描述 + 删除 */}
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                    <span style={{ fontSize: 13, color: '#595959', fontWeight: 500, whiteSpace: 'nowrap' }}>{opt ? t(opt.labelKey) : ''}</span>
                                    {item.type === 'orderCompletion' ? (
                                      <span style={{ fontSize: 13, color: '#8c8c8c', display: 'flex', alignItems: 'center', gap: 4 }}>
                                        {t('recommend:recentPrefix')}
                                        <InputNumber
                                          min={1}
                                          max={365}
                                          value={orderCompletionDays}
                                          onChange={(val) => setOrderCompletionDays(val ?? 30)}
                                          style={{ width: 64 }}
                                          size="small"
                                          disabled={isDetailMode}
                                        />
                                        {t('recommend:orderCompletionRatio')}
                                        <Popover
                                          trigger="click"
                                          placement="right"
                                          title={<span style={{ fontWeight: 600, color: '#52c41a' }}>{t('recommend:bayesianTitle')}</span>}
                                          content={
                                            <div style={{ maxWidth: 280, fontSize: 12, lineHeight: '20px' }}>
                                              <div style={{ marginBottom: 6 }}>
                                                <strong>{t('recommend:bayesianFormula')}</strong> = (完成單數 + α) / (總單數 + β)
                                              </div>
                                              <div style={{ color: '#595959' }}>
                                                {t('recommend:bayesianAlpha')}
                                                <br />
                                                {t('recommend:bayesianBeta')}
                                                <br />
                                                {t('recommend:bayesianEffect')}
                                                <br />
                                                {t('recommend:bayesianLargeVolume')}
                                              </div>
                                              <div style={{ marginTop: 8, padding: '6px 8px', background: '#f6ffed', borderRadius: 4, color: '#8c8c8c', fontSize: 11 }}>
                                                {t('recommend:bayesianExample1')}
                                                <br />
                                                {t('recommend:bayesianExample2')}
                                              </div>
                                            </div>
                                          }
                                        >
                                          <QuestionCircleOutlined style={{ color: '#1890ff', cursor: 'pointer', fontSize: 14 }} />
                                        </Popover>
                                      </span>
                                    ) : item.type === 'distance' ? (
                                      <span style={{ fontSize: 13, color: '#8c8c8c', display: 'flex', alignItems: 'center', gap: 4 }}>
                                        {opt ? t(opt.descKey) : ''}
                                        <Popover
                                          trigger="click"
                                          placement="right"
                                          title={<span style={{ fontWeight: 600, color: '#722ed1' }}>{t('recommend:distanceDecayTitle')}</span>}
                                          content={
                                            <div style={{ maxWidth: 280, fontSize: 12, lineHeight: '20px' }}>
                                              <div style={{ marginBottom: 6 }}>
                                                <strong>{t('recommend:distanceFormula')}</strong> = e<sup>-0.1 × 距離(km)</sup>
                                              </div>
                                              <div style={{ color: '#595959' }}>
                                                {t('recommend:distanceNear')}
                                                <br />
                                                {t('recommend:distanceFar')}
                                                <br />
                                                {t('recommend:distanceCoeff')}
                                              </div>
                                              <div style={{ marginTop: 8, padding: '6px 8px', background: '#f9f0ff', borderRadius: 4, color: '#8c8c8c', fontSize: 11 }}>
                                                1km → 0.90 &nbsp; 3km → 0.74 &nbsp; 5km → 0.61
                                                <br />
                                                8km → 0.45 &nbsp; 15km → 0.22 &nbsp; 30km → 0.05
                                              </div>
                                            </div>
                                          }
                                        >
                                          <QuestionCircleOutlined style={{ color: '#722ed1', cursor: 'pointer', fontSize: 14 }} />
                                        </Popover>
                                      </span>
                                    ) : (
                                      <span style={{ fontSize: 13, color: '#8c8c8c' }}>({opt ? t(opt.descKey) : ''})</span>
                                    )}
                                    {!isDetailMode && (
                                      <DeleteOutlined
                                        style={{ color: '#ff4d4f', fontSize: 16, cursor: 'pointer' }}
                                        onClick={() => setDimensionItems(dimensionItems.filter((_, i) => i !== index))}
                                      />
                                    )}
                                  </div>
                                  {/* 第二行：权重滑块 */}
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingLeft: 0 }}>
                                    <span style={{ fontSize: 13, color: '#595959', whiteSpace: 'nowrap' }}>{t('recommend:weightLabel')}</span>
                                    <div className="ws-wrapper">
                                      {/* 原生滑块 + 气泡 */}
                                      <div className="ws-slider-box">
                                        {/* 气泡 - 绝对定位在滑块上方 */}
                                        <div className="ws-tooltip" style={{ left: `${((item.weight ?? 1) - 1) / 9 * 100}%`, opacity: tooltipVisible[item.id] ? 1 : 0, transition: 'opacity 0.25s ease, left 0.25s ease-out', pointerEvents: 'none' }}>
                                          <div className="ws-tooltip-box">{item.weight ?? 1}</div>
                                          <div className="ws-tooltip-arrow" />
                                        </div>
                                        <div className="ws-rail">
                                          <div className="ws-fill" style={{ width: `${((item.weight ?? 1) - 1) / 9 * 100}%` }} />
                                        </div>
                                        <input
                                          type="range"
                                          className="ws-input"
                                          min={1}
                                          max={10}
                                          value={item.weight ?? 1}
                                          disabled={isDetailMode}
                                          onMouseDown={() => {
                                            if (hideTimerRef.current[item.id]) clearTimeout(hideTimerRef.current[item.id])
                                            setTooltipVisible(prev => ({ ...prev, [item.id]: true }))
                                          }}
                                          onMouseUp={() => {
                                            hideTimerRef.current[item.id] = setTimeout(() => {
                                              setTooltipVisible(prev => ({ ...prev, [item.id]: false }))
                                            }, 2000)
                                          }}
                                          onTouchStart={() => {
                                            if (hideTimerRef.current[item.id]) clearTimeout(hideTimerRef.current[item.id])
                                            setTooltipVisible(prev => ({ ...prev, [item.id]: true }))
                                          }}
                                          onTouchEnd={() => {
                                            hideTimerRef.current[item.id] = setTimeout(() => {
                                              setTooltipVisible(prev => ({ ...prev, [item.id]: false }))
                                            }, 2000)
                                          }}
                                          onChange={(e) => {
                                            const val = Number(e.target.value)
                                            const newItems = [...dimensionItems]
                                            newItems[index].weight = val
                                            setDimensionItems(newItems)
                                          }}
                                        />
                                      </div>
                                      {/* 刻度 */}
                                      <div className="ws-ticks">
                                        {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(n => (
                                          <div key={n} className="ws-tick">
                                            <div className={`ws-tick-bar ${n <= (item.weight ?? 1) ? 'on' : ''}`} />
                                            <span className={`ws-tick-num ${n === (item.weight ?? 1) ? 'on' : ''}`}>{n}</span>
                                          </div>
                                        ))}
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              )
                            })}
                          </div>

                          {/* 计算公式 */}
                          <div style={{ marginTop: 16, padding: '10px 12px', background: '#f9f9f9', border: '1px solid #e8e8e8', borderRadius: 4, fontSize: 12, color: '#595959', lineHeight: '20px' }}>
                            <div style={{ display: 'flex', gap: 24, marginBottom: 12 }}>
                              <div style={{ flex: 1 }}>
                                <div style={{ fontWeight: 600, marginBottom: 4, color: '#1890ff' }}>{t('recommend:calcFormula')}</div>
                                <div>{t('recommend:finalScoreFormula')}</div>
                                <div style={{ marginTop: 4, color: '#8c8c8c' }}>{t('recommend:supportScoreFormula')}</div>
                              </div>
                              <div style={{ flex: 1, borderLeft: '1px solid #e8e8e8', paddingLeft: 16 }}>
                                <div style={{ fontWeight: 600, marginBottom: 4, color: '#52c41a' }}>{t('recommend:exampleTitle')}</div>
                                <div style={{ marginBottom: 8 }}>{t('recommend:exampleWeight')}</div>
                                <div style={{ display: 'flex', gap: 16 }}>
                                  <div style={{ flex: 1 }}>
                                    <div>{t('recommend:merchantA')}</div>
                                    <div style={{ color: '#8c8c8c' }}>{t('recommend:merchantARate')}</div>
                                    <div style={{ color: '#8c8c8c' }}>{t('recommend:merchantAScore')} <span style={{ color: '#1890ff', fontWeight: 600 }}>9.58</span></div>
                                  </div>
                                  <div style={{ flex: 1 }}>
                                    <div>{t('recommend:merchantB')}</div>
                                    <div style={{ color: '#8c8c8c' }}>{t('recommend:merchantBRate')}</div>
                                    <div style={{ color: '#8c8c8c' }}>{t('recommend:merchantBScore')} <span style={{ color: '#1890ff', fontWeight: 600 }}>7.7</span></div>
                                  </div>
                                </div>
                              </div>
                            </div>

                            {/* 曝光分配策略 */}
                            <div style={{ padding: '10px 12px', background: '#fff7e6', border: '1px solid #ffd591', borderRadius: 4 }}>
                              <div style={{ fontWeight: 600, marginBottom: 8, color: '#d46b08', fontSize: 12 }}>
                                {t('recommend:exposureStrategyTitle')}
                              </div>
                              <div style={{ fontSize: 12, color: '#595959', marginBottom: 8 }}>
                                {t('recommend:exposureStrategyDesc')}
                              </div>
                              <div style={{ padding: '8px 10px', background: '#ffffff', border: '1px solid #e8e8e8', borderRadius: 4 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                                  <span style={{ fontWeight: 600, color: '#d46b08', fontSize: 12 }}>{t('recommend:allocationFormula')}</span>
                                  <span style={{ fontFamily: 'monospace', fontSize: 12 }}>P(商家i) = score_i / Σ(所有商家得分)</span>
                                  <Popover
                                    trigger="click"
                                    placement="right"
                                    title={<span style={{ fontWeight: 600, color: '#d46b08' }}>{t('recommend:allocationExampleTitle')}</span>}
                                    content={
                                      <div style={{ maxWidth: 320, fontSize: 12 }}>
                                        <div style={{ color: '#595959', marginBottom: 8 }}>
                                          {t('recommend:allocationExample5')}
                                        </div>
                                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
                                          {[
                                            { name: 'C', score: 10, color: '#1890ff' },
                                            { name: 'E', score: 9.5, color: '#722ed1' },
                                            { name: 'B', score: 7, color: '#52c41a' },
                                            { name: 'A', score: 6, color: '#fa8c16' },
                                            { name: 'D', score: 5, color: '#eb2f96' },
                                          ].map(m => (
                                            <div key={m.name} style={{ flex: '1 1 70px', padding: '4px 6px', background: '#fafafa', borderRadius: 4, border: '1px solid #f0f0f0', textAlign: 'center' }}>
                                              <div style={{ fontWeight: 600, color: m.color, fontSize: 12 }}>{t('recommend:merchantLabel')}{m.name}</div>
                                              <div style={{ fontSize: 10, color: '#8c8c8c' }}>{t('recommend:scoreLabel')} {m.score}</div>
                                              <div style={{ fontSize: 11, fontWeight: 600, color: '#595959' }}>{(m.score / 37.5 * 100).toFixed(1)}%</div>
                                            </div>
                                          ))}
                                        </div>
                                        <div style={{ fontSize: 11, color: '#8c8c8c', lineHeight: '18px', padding: '4px 6px', background: '#f6ffed', borderRadius: 4 }}>
                                          {t('recommend:longTermEffect')}
                                        </div>
                                      </div>
                                    }
                                  >
                                    <QuestionCircleOutlined style={{ color: '#d46b08', cursor: 'pointer', fontSize: 13 }} />
                                  </Popover>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      )}
                  </div>
            </div>


          )}

          {/* ===== 獨家商家：計算訂單類型（獨立模塊） ===== */}
          {selectedAlgorithmType === AlgorithmType.EXCLUSIVE_MERCHANT && (
            <div style={{ marginBottom: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 13, color: '#595959', minWidth: 96, textAlign: 'right', flexShrink: 0 }}>{t('recommend:calcOrderType')}</span>
                <Form.Item name="orderTypeDelivery" noStyle valuePropName="checked">
                  <Checkbox disabled={isDetailMode}>{t('recommend:deliveryOrder')}</Checkbox>
                </Form.Item>
                <Form.Item name="orderTypePickup" noStyle valuePropName="checked">
                  <Checkbox disabled={isDetailMode}>{t('recommend:pickupOrder')}</Checkbox>
                </Form.Item>
                <span style={{ fontSize: 12, color: '#8c8c8c' }}>
                  {t('recommend:orderTypeHint')}
                </span>
              </div>
              {/* 店鋪等級保障單量配置（樣式與品牌商家店鋪等級配置保持一致） */}
              <div style={{ marginTop: 12, padding: '14px 16px', background: '#fafafa', border: '1px solid #f0f0f0', borderRadius: 8 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#262626', marginBottom: 4 }}>{t('recommend:storeLevelBlockOrders')}</div>
                <div style={{ fontSize: 12, color: '#8c8c8c', marginBottom: 12 }}>
                  {t('recommend:storeLevelBlockHint')}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12 }}>
                  {STORE_LEVEL_BLOCK_OPTIONS.map(({ level, labelKey, color, defaultOrders }) => (
                    <div key={level} style={{
                      background: '#fff',
                      border: `1px solid ${color}33`,
                      borderTop: `3px solid ${color}`,
                      borderRadius: 8,
                      padding: '12px 12px 14px',
                      textAlign: 'center',
                      boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 10 }}>
                        <span style={{
                          padding: '0 12px', height: 24, lineHeight: '24px', borderRadius: 12,
                          fontSize: 13, fontWeight: 700, color: '#fff',
                          background: color, display: 'inline-block', whiteSpace: 'nowrap',
                        }}>{t(labelKey)}</span>
                      </div>
                      <Form.Item name={['levelBlockOrders', level]} noStyle initialValue={defaultOrders}>
                        <InputNumber
                          min={1}
                          precision={0}
                          style={{ width: '100%' }}
                          addonAfter={t('recommend:unitOrder')}
                          disabled={isDetailMode}
                        />
                      </Form.Item>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ===== 獨家商家：算法策略（獨立模塊，與盤活復蘇/無敵星星互不影響） ===== */}
          {selectedAlgorithmType === AlgorithmType.EXCLUSIVE_MERCHANT && (
              <div style={{
                border: '1px solid #d6e4ff',
                borderRadius: 8,
                background: '#f0f5ff',
                overflow: 'hidden',
                marginBottom: 16,
              }}>
                    {/* 標題欄 */}
                    <div style={{
                      fontSize: 14, fontWeight: 600, color: '#1890ff',
                      padding: '10px 20px',
                      borderBottom: '1px solid #d6e4ff',
                      background: '#e6f4ff',
                      display: 'flex', alignItems: 'center', gap: 6,
                    }}>
                      <SettingOutlined />
                      {t('recommend:algoStrategy')}
                    </div>

                  <div style={{ padding: '16px 20px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 13, color: '#595959', whiteSpace: 'nowrap' }}>{t('recommend:merchantExposureLabel')}</span>
                      <Form.Item
                        name="merchantExposureStrategy"
                        style={{ flex: 1, marginBottom: 0 }}
                        wrapperCol={{ span: 24 }}
                      >
                        <Select
                          placeholder={t('recommend:selectPlaceholder')}
                          style={{ width: '25%', height: 36, borderRadius: 6, fontSize: 14 }}
                          options={[
                            { label: t('recommend:roundRobinCalc'), value: 'random' },
                          ]}
                          disabled={isDetailMode}
                        />
                      </Form.Item>
                    </div>

                      {/* 按轮询维度配置 */}
                      {merchantExposureStrategy === 'random' && (
                        <div style={{ marginTop: 16, padding: '12px 16px', background: '#f6ffed', border: '1px solid #b7eb8f', borderRadius: 6 }}>
                          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                            <span style={{ fontSize: 13, color: '#595959', lineHeight: '22px' }}>
                              {t('recommend:roundRobinStrategyDesc')}
                            </span>
                          </div>
                        </div>
                      )}
                  </div>
            </div>
          )}

          {/* ===== 品牌商家(KA)：流量曝光保障（獨立模塊，互不影響） ===== */}
          {selectedAlgorithmType === AlgorithmType.BRAND_MERCHANT && (
            <div style={{ marginBottom: 16 }}>
              {/* 店鋪等級保障流量配置 */}
              <div style={{ padding: '14px 16px', background: '#fafafa', border: '1px solid #f0f0f0', borderRadius: 8 }}>
                {/* 標題區：明確提示這是店鋪等級配置 */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  <span style={{
                    width: 28, height: 28, borderRadius: 8,
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    background: 'rgba(232,114,12,0.12)', color: '#E8720C', fontSize: 14,
                  }}>
                    <ShopOutlined />
                  </span>
                  <span style={{ fontSize: 13, fontWeight: 600, color: '#262626' }}>{t('recommend:storeLevelTraffic')}</span>
                  <span style={{
                    padding: '0 8px', height: 20, lineHeight: '20px', borderRadius: 10,
                    fontSize: 11, fontWeight: 500, color: '#E8720C',
                    background: 'rgba(232,114,12,0.08)', border: '1px solid rgba(232,114,12,0.3)',
                  }}>{t('recommend:byStoreLevelConfig')}</span>
                </div>
                <div style={{ fontSize: 12, color: '#8c8c8c', marginBottom: 12, paddingLeft: 36 }}>
                  {t('recommend:storeLevelTrafficHint')}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12 }}>
                  {STORE_LEVEL_BLOCK_OPTIONS.map(({ level, labelKey, color, defaultOrders }) => (
                    <div key={level} style={{
                      background: '#fff',
                      border: `1px solid ${color}33`,
                      borderTop: `3px solid ${color}`,
                      borderRadius: 8,
                      padding: '12px 12px 14px',
                      textAlign: 'center',
                      boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 10 }}>
                        <span style={{
                          padding: '0 12px', height: 24, lineHeight: '24px', borderRadius: 12,
                          fontSize: 13, fontWeight: 700, color: '#fff',
                          background: color, display: 'inline-block', whiteSpace: 'nowrap',
                        }}>{t(labelKey)}</span>
                      </div>
                      <Form.Item name={['brandLevelTraffic', level]} noStyle initialValue={defaultOrders * 100}>
                        <InputNumber
                          min={1}
                          precision={0}
                          style={{ width: '100%' }}
                          addonAfter={t('recommend:unitTimes')}
                          disabled={isDetailMode}
                        />
                      </Form.Item>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ===== 品牌商家(KA)：算法策略（獨立模塊，複製自獨家商家，互不影響） ===== */}
          {selectedAlgorithmType === AlgorithmType.BRAND_MERCHANT && (
              <div style={{
                border: '1px solid #d6e4ff',
                borderRadius: 8,
                background: '#f0f5ff',
                overflow: 'hidden',
                marginBottom: 16,
              }}>
                    {/* 標題欄 */}
                    <div style={{
                      fontSize: 14, fontWeight: 600, color: '#1890ff',
                      padding: '10px 20px',
                      borderBottom: '1px solid #d6e4ff',
                      background: '#e6f4ff',
                      display: 'flex', alignItems: 'center', gap: 6,
                    }}>
                      <SettingOutlined />
                      {t('recommend:algoStrategy')}
                    </div>

                  <div style={{ padding: '16px 20px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 13, color: '#595959', whiteSpace: 'nowrap' }}>{t('recommend:merchantExposureLabel')}</span>
                      <Form.Item
                        name="merchantExposureStrategy"
                        style={{ flex: 1, marginBottom: 0 }}
                        wrapperCol={{ span: 24 }}
                      >
                        <Select
                          placeholder={t('recommend:selectPlaceholder')}
                          style={{ width: '25%', height: 36, borderRadius: 6, fontSize: 14 }}
                          options={[
                            { label: t('recommend:roundRobinCalc'), value: 'random' },
                          ]}
                          disabled={isDetailMode}
                        />
                      </Form.Item>
                    </div>

                      {/* 按轮询维度配置 */}
                      {merchantExposureStrategy === 'random' && (
                        <div style={{ marginTop: 16, padding: '12px 16px', background: '#f6ffed', border: '1px solid #b7eb8f', borderRadius: 6 }}>
                          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                            <span style={{ fontSize: 13, color: '#595959', lineHeight: '22px' }}>
                              {t('recommend:roundRobinStrategyDesc')}
                            </span>
                          </div>
                        </div>
                      )}
                  </div>
            </div>
          )}

          {/* ===== 人氣商家：算法策略（僅輪詢計算） ===== */}
          {selectedAlgorithmType === AlgorithmType.POPULAR_MERCHANT_KA && (
              <div style={{
                border: '1px solid #d6e4ff',
                borderRadius: 8,
                background: '#f0f5ff',
                overflow: 'hidden',
                marginBottom: 16,
              }}>
                    {/* 標題欄 */}
                    <div style={{
                      fontSize: 14, fontWeight: 600, color: '#1890ff',
                      padding: '10px 20px',
                      borderBottom: '1px solid #d6e4ff',
                      background: '#e6f4ff',
                      display: 'flex', alignItems: 'center', gap: 6,
                    }}>
                      <SettingOutlined />
                      {t('recommend:algoStrategy')}
                    </div>

                  <div style={{ padding: '16px 20px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 13, color: '#595959', whiteSpace: 'nowrap' }}>{t('recommend:bigSmallStrategy')}</span>
                      <Form.Item
                        name="merchantExposureStrategy"
                        style={{ flex: 1, marginBottom: 0 }}
                        wrapperCol={{ span: 24 }}
                      >
                        <Select
                          placeholder={t('recommend:selectPlaceholder')}
                          style={{ width: '25%', height: 36, borderRadius: 6, fontSize: 14 }}
                          options={[
                            { label: t('recommend:roundRobinCalc'), value: 'random' },
                          ]}
                          disabled={isDetailMode}
                        />
                      </Form.Item>
                    </div>

                      {/* 按轮询维度配置 */}
                      {merchantExposureStrategy === 'random' && (
                        <div style={{ marginTop: 16, padding: '12px 16px', background: '#f6ffed', border: '1px solid #b7eb8f', borderRadius: 6 }}>
                          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                            <span style={{ fontSize: 13, color: '#595959', lineHeight: '22px' }}>
                              {t('recommend:roundRobinStrategyDesc')}
                            </span>
                          </div>
                        </div>
                      )}
                  </div>
            </div>
          )}

          {/* ===== 金字招牌：算法策略（輪詢計算） ===== */}
          {selectedAlgorithmType === AlgorithmType.GOLDEN_SIGNBOARD && (
              <div style={{
                border: '1px solid #d6e4ff',
                borderRadius: 8,
                background: '#f0f5ff',
                overflow: 'hidden',
                marginBottom: 16,
              }}>
                    {/* 標題欄 */}
                    <div style={{
                      fontSize: 14, fontWeight: 600, color: '#1890ff',
                      padding: '10px 20px',
                      borderBottom: '1px solid #d6e4ff',
                      background: '#e6f4ff',
                      display: 'flex', alignItems: 'center', gap: 6,
                    }}>
                      <SettingOutlined />
                      {t('recommend:algoStrategy')}
                    </div>

                  <div style={{ padding: '16px 20px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 13, color: '#595959', whiteSpace: 'nowrap' }}>{t('recommend:merchantExposureLabel')}</span>
                      <Form.Item
                        name="merchantExposureStrategy"
                        style={{ flex: 1, marginBottom: 0 }}
                        wrapperCol={{ span: 24 }}
                      >
                        <Select
                          placeholder={t('recommend:selectPlaceholder')}
                          style={{ width: '25%', height: 36, borderRadius: 6, fontSize: 14 }}
                          options={[
                            { label: t('recommend:roundRobinCalc'), value: 'random' },
                          ]}
                          disabled={isDetailMode}
                        />
                      </Form.Item>
                    </div>

                      {/* 按轮询维度配置 */}
                      {merchantExposureStrategy === 'random' && (
                        <div style={{ marginTop: 16, padding: '12px 16px', background: '#f6ffed', border: '1px solid #b7eb8f', borderRadius: 6 }}>
                          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                            <span style={{ fontSize: 13, color: '#595959', lineHeight: '22px' }}>
                              {t('recommend:roundRobinStrategyDesc')}
                            </span>
                          </div>
                        </div>
                      )}
                  </div>
            </div>
          )}

          {/* 新店廣告：算法策略（波浪計算 + 輪詢曝光） */}
          {selectedAlgorithmType === AlgorithmType.NEW_STORE_AD && (
            <div style={{
              border: '1px solid #d6e4ff',
              borderRadius: 8,
              background: '#f0f5ff',
              overflow: 'hidden',
              marginBottom: 16,
            }}>
              {/* 標題欄 */}
              <div style={{
                fontSize: 14, fontWeight: 600, color: '#1890ff',
                padding: '10px 20px',
                borderBottom: '1px solid #d6e4ff',
                background: '#e6f4ff',
                display: 'flex', alignItems: 'center', gap: 6,
              }}>
                <SettingOutlined />
                {t('recommend:algoStrategy')}
              </div>

              <div style={{ padding: '16px 20px' }}>
                {/* 商家曝光策略 */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 13, color: '#595959', whiteSpace: 'nowrap' }}>{t('recommend:merchantExposureLabel')}</span>
                  <Select
                    value="roundRobin"
                    style={{ width: '25%', height: 36, borderRadius: 6, fontSize: 14 }}
                    options={[{ label: t('recommend:roundRobinCalc'), value: 'roundRobin' }]}
                    disabled={isDetailMode}
                  />
                </div>

                {/* 輪詢說明 */}
                <div style={{ marginTop: 16, padding: '12px 16px', background: '#f6ffed', border: '1px solid #b7eb8f', borderRadius: 6 }}>
                  <span style={{ fontSize: 13, color: '#595959', lineHeight: '22px' }}>
                    {t('recommend:newStoreRoundRobinDesc')}
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>
      ) : selectedAlgorithmType ? (
        /* 其它算法类型：显示提示 */
        <div style={{ border: '1px solid #ffe58f', borderRadius: 8, background: '#fffbe6', padding: '20px 24px', marginBottom: 16 }}>
          <div style={{ 
            textAlign: 'center', 
            padding: '60px 20px',
            color: '#8c8c8c'
          }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>⚙️</div>
            <div style={{ fontSize: 16, fontWeight: 500, marginBottom: 8 }}>
              {t('recommend:noParamConfig')}
            </div>
            <div style={{ fontSize: 14 }}>
              {t('recommend:noParamConfigHint')}
            </div>
          </div>
        </div>
      ) : (
        /* 未选择算法类型：显示提示 */
        <div style={{ border: '1px solid #d6e4ff', borderRadius: 8, background: '#f0f5ff', padding: '20px 24px', marginBottom: 16 }}>
          <div style={{ 
            textAlign: 'center', 
            padding: '60px 20px',
            color: '#595959'
          }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>👆</div>
            <div style={{ fontSize: 16, fontWeight: 500, marginBottom: 8, color: '#1890ff' }}>
              {t('recommend:selectAdTypeFirst')}
            </div>
            <div style={{ fontSize: 14 }}>
              {t('recommend:selectAdTypeHint')}
            </div>
          </div>
        </div>
      )}

      </Form>

      {/* 底部操作按鈕（取消/保存） */}
      {selectedAlgorithmType && !isDetailMode && (
        <div className="form-footer">
          <Button onClick={handleBack}>{t('common:cancel')}</Button>
          <Button
            type="primary"
            icon={<SaveOutlined />}
            onClick={handleSubmit}
          >
            {t('common:save')}
          </Button>
        </div>
      )}

      {/* 商家选择弹窗 */}
      <Modal
        title={t('recommend:selectMerchant')}
        open={merchantModalVisible}
        onOk={handleConfirmMerchants}
        onCancel={handleCloseMerchantModal}
        width={900}
        okText={t('recommend:confirmSelect')}
        cancelText={t('common:cancel')}
      >
        <Table
          rowKey="id"
          columns={merchantColumns}
          dataSource={mockMerchants}
          rowSelection={{
            selectedRowKeys: selectedMerchants,
            onChange: (selectedRowKeys: React.Key[]) => {
              setSelectedMerchants(selectedRowKeys as string[])
            },
          }}
          pagination={{
            pageSize: 10,
            showTotal: (total) => t('common:total', { count: total }),
          }}
        />
      </Modal>
    </div>
  )
}
