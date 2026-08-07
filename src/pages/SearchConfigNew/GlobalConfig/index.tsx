import { useState, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { Card, Tabs, Form, Switch, InputNumber, Button, Table, Tag, Space, Alert, message, Select, Modal } from 'antd'
import type { TableColumnsType } from 'antd'
import { SaveOutlined, EditOutlined, DeleteOutlined, PlusOutlined, QuestionCircleOutlined } from '@ant-design/icons'

/** 頻道類型（業務頻道，大首頁作為混排聚合層不在此列） */
type DimensionChannelType = 'takeaway' | 'supermarket' | 'groupBuy'

/** 維度權重佔比 */
interface DimensionWeight {
  relevance: number
  commercial: number
  store: number
  user: number
  other: number
}

/** 頻道標籤 / 維度標籤依賴 t，移入組件內定義 */

function createDefaultDimensionWeight(): DimensionWeight {
  return { relevance: 20, commercial: 30, store: 25, user: 15, other: 10 }
}

/** 粗排：門店/商品相關性加分行 */
interface RelevanceWeightRow {
  key: string
  method: string
  weight: number
  description: string
}

/** 粗排默認權重（依賴 t，移入組件內初始化） */

/** 時段類型枚舉（固定5個，不可重複配置） */
type TimePeriodKey = 'breakfast' | 'lunch' | 'afternoonTea' | 'dinner' | 'supper'

/** 時段時間範圍（數據，不隨語言切換） */
const TIME_PERIOD_RANGES: Record<TimePeriodKey, string> = {
  breakfast: '07:00-09:00',
  lunch: '11:00-13:00',
  afternoonTea: '14:00-17:00',
  dinner: '17:00-19:00',
  supper: '22:00-01:00',
}

/** 時段優先配置行 */
interface TimePeriodItem {
  key: TimePeriodKey | null  // null 表示待選擇狀態
  takeawayRatio: number
  supermarketRatio: number
  groupBuyRatio: number
}

/** 頻道混排優先級配置（僅大首頁生效） */
interface ChannelMixingPriorityConfig {
  // 全時段默認展示比例
  baseTakeawayRatio: number
  baseSupermarketRatio: number
  baseGroupBuyRatio: number
  // 輪插策略
  interleaveX: number
  interleaveY: number
  interleaveZ: number
  // 時段規則列表（不可重複）
  timePeriodList: TimePeriodItem[]
}

const MAX_TIME_PERIODS = 5

const defaultChannelMixingPriority: ChannelMixingPriorityConfig = {
  baseTakeawayRatio: 50,
  baseSupermarketRatio: 30,
  baseGroupBuyRatio: 20,
  interleaveX: 3,
  interleaveY: 2,
  interleaveZ: 1,
  timePeriodList: [],
}


export default function GlobalConfig() {
  const navigate = useNavigate()
  const { t } = useTranslation()

  // 標籤/枚舉依賴 t，需定義在組件內以便響應語言切換
  const DIMENSION_CHANNELS: { key: DimensionChannelType; label: string }[] = [
    { key: 'takeaway', label: t('globalConfig.channelTakeaway') },
    { key: 'groupBuy', label: t('globalConfig.channelGroupBuy') },
    { key: 'supermarket', label: t('globalConfig.channelSupermarket') },
  ]
  const DIMENSION_LABELS: { key: keyof DimensionWeight; label: string }[] = [
    { key: 'relevance', label: t('globalConfig.dimRelevance') },
    { key: 'commercial', label: t('globalConfig.dimCommercial') },
    { key: 'store', label: t('globalConfig.dimStore') },
    { key: 'user', label: t('globalConfig.dimUser') },
    { key: 'other', label: t('globalConfig.dimOther') },
  ]
  const TIME_PERIOD_ENUM: Record<TimePeriodKey, { label: string; timeRange: string }> = {
    breakfast: { label: t('globalConfig.periodBreakfast'), timeRange: TIME_PERIOD_RANGES.breakfast },
    lunch: { label: t('globalConfig.periodLunch'), timeRange: TIME_PERIOD_RANGES.lunch },
    afternoonTea: { label: t('globalConfig.periodTea'), timeRange: TIME_PERIOD_RANGES.afternoonTea },
    dinner: { label: t('globalConfig.periodDinner'), timeRange: TIME_PERIOD_RANGES.dinner },
    supper: { label: t('globalConfig.periodSupper'), timeRange: TIME_PERIOD_RANGES.supper },
  }
  const TIME_PERIOD_KEYS = Object.keys(TIME_PERIOD_ENUM) as TimePeriodKey[]

  // 詞庫管理狀態
  const [synonymEnabled, setSynonymEnabled] = useState(true)
  const [stopWordEnabled, setStopWordEnabled] = useState(false)
  const [merchantKeywordEnabled, setMerchantKeywordEnabled] = useState(true)
  const [productKeywordEnabled, setProductKeywordEnabled] = useState(true)

  // 匹配策略狀態
  const [fuzzyPinyin, setFuzzyPinyin] = useState(true)
  const [fuzzySimplifiedTraditional, setFuzzySimplifiedTraditional] = useState(true)
  const [fuzzyTolerance, setFuzzyTolerance] = useState(true)

  // 維度權重佔比狀態（按業務頻道獨立配置，大首頁通過頻道混排聚合）
  const [dimensionWeights, setDimensionWeights] = useState<Record<DimensionChannelType, DimensionWeight>>({
    takeaway: createDefaultDimensionWeight(),
    supermarket: createDefaultDimensionWeight(),
    groupBuy: createDefaultDimensionWeight(),
  })

  const updateDimensionWeight = (channel: DimensionChannelType, key: keyof DimensionWeight, value: number | null) => {
    setDimensionWeights(prev => ({
      ...prev,
      [channel]: { ...prev[channel], [key]: value ?? 0 },
    }))
  }

  // 粗排配置狀態
  const [storeRelevanceWeights, setStoreRelevanceWeights] = useState<RelevanceWeightRow[]>([
    { key: 's1', method: t('globalConfig.storeSegHit'), weight: 100, description: t('globalConfig.storeSegDesc') },
    { key: 's2', method: t('globalConfig.storeFuzzy'), weight: 60, description: t('globalConfig.storeFuzzyDesc') },
    { key: 's3', method: t('globalConfig.storeExact'), weight: 200, description: t('globalConfig.storeExactDesc') },
  ])
  const [productRelevanceWeights, setProductRelevanceWeights] = useState<RelevanceWeightRow[]>([
    { key: 'p1', method: t('globalConfig.productSegHit'), weight: 100, description: t('globalConfig.productSegDesc') },
    { key: 'p2', method: t('globalConfig.productFuzzy'), weight: 60, description: t('globalConfig.productFuzzyDesc') },
    { key: 'p3', method: t('globalConfig.productExact'), weight: 200, description: t('globalConfig.productExactDesc') },
  ])
  const [isBonusEditing, setIsBonusEditing] = useState(false)
  const [bonusSnapshot, setBonusSnapshot] = useState<{
    store: RelevanceWeightRow[]; product: RelevanceWeightRow[];
    merchantBonus: number; productBonus: number;
  } | null>(null)

  // 命中商家/商品關鍵詞加分配置（內嵌於加分表格中）
  const [merchantKeywordBonus, setMerchantKeywordBonus] = useState(50)
  const [productKeywordBonus, setProductKeywordBonus] = useState(50)

  const handleBonusEdit = () => {
    setBonusSnapshot({
      store: storeRelevanceWeights, product: productRelevanceWeights,
      merchantBonus: merchantKeywordBonus, productBonus: productKeywordBonus,
    })
    setIsBonusEditing(true)
  }

  const handleBonusCancel = () => {
    if (bonusSnapshot) {
      setStoreRelevanceWeights(bonusSnapshot.store)
      setProductRelevanceWeights(bonusSnapshot.product)
      setMerchantKeywordBonus(bonusSnapshot.merchantBonus)
      setProductKeywordBonus(bonusSnapshot.productBonus)
    }
    setBonusSnapshot(null)
    setIsBonusEditing(false)
  }

  // 維度權重佔比編輯態（快照回滾）
  const [isDimEditing, setIsDimEditing] = useState(false)
  const [dimSnapshot, setDimSnapshot] = useState<typeof dimensionWeights | null>(null)

  const handleDimEdit = () => {
    setDimSnapshot(dimensionWeights)
    setIsDimEditing(true)
  }

  const handleDimCancel = () => {
    if (dimSnapshot) setDimensionWeights(dimSnapshot)
    setDimSnapshot(null)
    setIsDimEditing(false)
  }

  const handleDimSave = () => {
    setDimSnapshot(null)
    setIsDimEditing(false)
    message.success(t('globalConfig.dimSaved'))
  }

  // 頻道混排優先級編輯態（快照回滾）
  const [isMixingEditing, setIsMixingEditing] = useState(false)
  const [mixingSnapshot, setMixingSnapshot] = useState<ChannelMixingPriorityConfig | null>(null)
  const [showInterleaveHelp, setShowInterleaveHelp] = useState(false)
  const [showRatioHelp, setShowRatioHelp] = useState(false)
  const [showTimePeriodHelp, setShowTimePeriodHelp] = useState(false)

  const handleMixingEdit = () => {
    setMixingSnapshot(mixingPriority)
    setIsMixingEditing(true)
  }

  const handleMixingCancel = () => {
    if (mixingSnapshot) setMixingPriority(mixingSnapshot)
    setMixingSnapshot(null)
    setIsMixingEditing(false)
  }

  const handleMixingSave = () => {
    setMixingSnapshot(null)
    setIsMixingEditing(false)
    message.success(t('globalConfig.mixingSaved'))
  }

  const updateStoreRelevance = (rowKey: string, value: number | null) => {
    if (rowKey === 'merchant_kw') {
      setMerchantKeywordBonus(value ?? 0)
      return
    }
    setStoreRelevanceWeights(prev =>
      prev.map(r => r.key === rowKey ? { ...r, weight: value ?? 0 } : r)
    )
  }

  const updateProductRelevance = (rowKey: string, value: number | null) => {
    if (rowKey === 'product_kw') {
      setProductKeywordBonus(value ?? 0)
      return
    }
    setProductRelevanceWeights(prev =>
      prev.map(r => r.key === rowKey ? { ...r, weight: value ?? 0 } : r)
    )
  }

  // 頻道混排優先級狀態（僅大首頁生效）
  const [mixingPriority, setMixingPriority] = useState<ChannelMixingPriorityConfig>(defaultChannelMixingPriority)

  const updateMixingPriority = <K extends keyof ChannelMixingPriorityConfig>(
    field: K,
    value: ChannelMixingPriorityConfig[K]
  ) => {
    setMixingPriority(prev => ({ ...prev, [field]: value }))
  }

  const updateTimePeriod = (periodKey: TimePeriodKey, field: keyof TimePeriodItem, value: unknown) => {
    setMixingPriority(prev => ({
      ...prev,
      timePeriodList: prev.timePeriodList.map(item =>
        item.key === periodKey ? { ...item, [field]: value } : item
      ),
    }))
  }

  const addTimePeriod = () => {
    if (mixingPriority.timePeriodList.length >= MAX_TIME_PERIODS) {
      message.warning(t('globalConfig.maxPeriodWarning', { count: MAX_TIME_PERIODS }))
      return
    }
    const newPeriod: TimePeriodItem = {
      key: null,  // 待選擇狀態
      takeawayRatio: 50,
      supermarketRatio: 30,
      groupBuyRatio: 20,
    }
    setMixingPriority(prev => ({
      ...prev,
      timePeriodList: [...prev.timePeriodList, newPeriod],
    }))
  }

  const updateTimePeriodKey = (index: number, newKey: TimePeriodKey | null) => {
    setMixingPriority(prev => {
      const newList = [...prev.timePeriodList]
      // 檢查是否重複（排除當前編輯的行）
      if (newKey !== null && newList.some((p, i) => i !== index && p.key === newKey)) {
        message.warning(t('globalConfig.periodExists', { label: TIME_PERIOD_ENUM[newKey].label }))
        return prev
      }
      newList[index] = { ...newList[index], key: newKey }
      return { ...prev, timePeriodList: newList }
    })
  }

  const removeTimePeriod = (index: number) => {
    setMixingPriority(prev => ({
      ...prev,
      timePeriodList: prev.timePeriodList.filter((_, i) => i !== index),
    }))
  }

  const baseTotalRatio = useMemo(() => {
    return mixingPriority.baseTakeawayRatio + mixingPriority.baseSupermarketRatio + mixingPriority.baseGroupBuyRatio
  }, [mixingPriority.baseTakeawayRatio, mixingPriority.baseSupermarketRatio, mixingPriority.baseGroupBuyRatio])

  // 計算當前生效時段
  const currentActivePeriod = useMemo(() => {
    const now = new Date()
    const currentHour = now.getHours()
    const currentMinute = now.getMinutes()
    const currentTimeValue = currentHour * 60 + currentMinute

    for (const period of mixingPriority.timePeriodList) {
      // 跳過待選擇狀態的時段
      if (period.key === null) continue

      const enumConfig = TIME_PERIOD_ENUM[period.key]
      const [startStr, endStr] = enumConfig.timeRange.split('-')
      const [startHour, startMinute] = startStr.split(':').map(Number)
      const [endHour, endMinute] = endStr.split(':').map(Number)

      const startValue = startHour * 60 + startMinute
      let endValue = endHour * 60 + endMinute

      // 處理跨天時段（如22:00-01:00）
      if (endValue < startValue) {
        endValue += 24 * 60
      }

      if (currentTimeValue >= startValue && currentTimeValue < endValue) {
        return { ...period, label: enumConfig.label, timeRange: enumConfig.timeRange }
      }
      // 處理跨天時段的另一種情況（當前時間在第二天凌晨）
      if (endValue > 24 * 60 && currentTimeValue + 24 * 60 >= startValue && currentTimeValue + 24 * 60 < endValue) {
        return { ...period, label: enumConfig.label, timeRange: enumConfig.timeRange }
      }
    }
    return null
  }, [mixingPriority.timePeriodList])

  const tabItems = [
    {
      key: 'library',
      label: t('globalConfig.tabLibrary'),
      children: (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* 詞庫配置區域 */}
          <Card
            title={<span style={{ color: '#1d39c4', fontWeight: 600 }}>{t('globalConfig.libTitle')}</span>}
            size="small"
            style={{ borderColor: '#d6e4ff' }}
            styles={{ header: { background: '#f0f5ff', borderBottom: '1px solid #d6e4ff' } }}
          >
            {/* 詞庫開關 2x2 网格 */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 }}>
              {/* 同義詞庫 */}
              <Card size="small" styles={{ body: { padding: '12px 16px' } }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Space>
                    <span style={{ fontWeight: 600 }}>{t('globalConfig.libSynonym')}</span>
                    <Switch
                      checked={synonymEnabled}
                      onChange={setSynonymEnabled}
                      checkedChildren={t('globalConfig.on')}
                      unCheckedChildren={t('globalConfig.off')}
                      size="small"
                    />
                  </Space>
                  <Button type="link" size="small" onClick={() => navigate('/synonym-config')}>{t('globalConfig.manage')}</Button>
                </div>
                <div style={{ marginTop: 6, color: '#8c8c8c', fontSize: 12, lineHeight: '18px' }}>
                  {t('globalConfig.libSynonymDesc')}
                </div>
              </Card>

              {/* 停用詞庫 */}
              <Card size="small" styles={{ body: { padding: '12px 16px' } }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Space>
                    <span style={{ fontWeight: 600 }}>{t('globalConfig.libStopWord')}</span>
                    <Switch
                      checked={stopWordEnabled}
                      onChange={setStopWordEnabled}
                      checkedChildren={t('globalConfig.on')}
                      unCheckedChildren={t('globalConfig.off')}
                      size="small"
                    />
                  </Space>
                  <Button type="link" size="small" onClick={() => navigate('/stop-words')}>{t('globalConfig.manage')}</Button>
                </div>
                <div style={{ marginTop: 6, color: '#8c8c8c', fontSize: 12, lineHeight: '18px' }}>
                  {t('globalConfig.libStopWordDesc')}
                </div>
              </Card>

              {/* 商家關鍵詞匹配 */}
              <Card size="small" styles={{ body: { padding: '12px 16px' } }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Space>
                    <span style={{ fontWeight: 600 }}>{t('globalConfig.libMerchantKw')}</span>
                    <Switch
                      checked={merchantKeywordEnabled}
                      onChange={setMerchantKeywordEnabled}
                      checkedChildren={t('globalConfig.on')}
                      unCheckedChildren={t('globalConfig.off')}
                      size="small"
                    />
                  </Space>
                </div>
                <div style={{ marginTop: 6, color: '#8c8c8c', fontSize: 12, lineHeight: '18px' }}>
                  {t('globalConfig.libMerchantKwDesc')}
                </div>
              </Card>

              {/* 商品關鍵詞匹配 */}
              <Card size="small" styles={{ body: { padding: '12px 16px' } }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Space>
                    <span style={{ fontWeight: 600 }}>{t('globalConfig.libProductKw')}</span>
                    <Switch
                      checked={productKeywordEnabled}
                      onChange={setProductKeywordEnabled}
                      checkedChildren={t('globalConfig.on')}
                      unCheckedChildren={t('globalConfig.off')}
                      size="small"
                    />
                  </Space>
                </div>
                <div style={{ marginTop: 6, color: '#8c8c8c', fontSize: 12, lineHeight: '18px' }}>
                  {t('globalConfig.libProductKwDesc')}
                </div>
              </Card>
            </div>
          </Card>

          {/* 用戶輸入模糊糾錯 */}
          <Card
            title={<span style={{ color: '#389e0d', fontWeight: 600 }}>{t('globalConfig.fuzzyTitle')}</span>}
            size="small"
            style={{ borderColor: '#d9f7be' }}
            styles={{ header: { background: '#f6ffed', borderBottom: '1px solid #d9f7be' } }}
          >
            <div style={{ color: '#8c8c8c', fontSize: 12, marginBottom: 10 }}>
              {t('globalConfig.fuzzyDesc')}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
              <div style={{ padding: '10px 14px', border: '1px solid #f0f0f0', borderRadius: 6, background: '#fafafa' }}>
                <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 6 }}>{t('globalConfig.fuzzyPinyin')}</div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Switch
                    checked={fuzzyPinyin}
                    onChange={setFuzzyPinyin}
                    checkedChildren={t('globalConfig.on')}
                    unCheckedChildren={t('globalConfig.off')}
                    size="small"
                  />
                  <span style={{ color: '#8c8c8c', fontSize: 12 }}>{t('globalConfig.fuzzyPinyinTip')}</span>
                </div>
              </div>
              <div style={{ padding: '10px 14px', border: '1px solid #f0f0f0', borderRadius: 6, background: '#fafafa' }}>
                <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 6 }}>{t('globalConfig.fuzzySimp')}</div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Switch
                    checked={fuzzySimplifiedTraditional}
                    onChange={setFuzzySimplifiedTraditional}
                    checkedChildren={t('globalConfig.on')}
                    unCheckedChildren={t('globalConfig.off')}
                    size="small"
                  />
                  <span style={{ color: '#8c8c8c', fontSize: 12 }}>{t('globalConfig.fuzzySimpTip')}</span>
                </div>
              </div>
              <div style={{ padding: '10px 14px', border: '1px solid #f0f0f0', borderRadius: 6, background: '#fafafa' }}>
                <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 6 }}>{t('globalConfig.fuzzyTolerance')}</div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Switch
                    checked={fuzzyTolerance}
                    onChange={setFuzzyTolerance}
                    checkedChildren={t('globalConfig.on')}
                    unCheckedChildren={t('globalConfig.off')}
                    size="small"
                  />
                  <span style={{ color: '#8c8c8c', fontSize: 12 }}>{t('globalConfig.fuzzyToleranceTip')}</span>
                </div>
              </div>
            </div>
          </Card>

          {/* 用戶輸入搜索詞匹配加分：門店與商品左右並排 */}
          {(() => {
            const bonusCols: TableColumnsType<RelevanceWeightRow> = [
              { title: t('globalConfig.colMethod'), dataIndex: 'method', width: 200 },
              {
                title: t('globalConfig.colWeight'), dataIndex: 'weight', width: 130,
                render: (v: number, r) => (
                  <InputNumber
                    min={0} max={9999} value={v} size="small" style={{ width: '100%' }}
                    disabled={!isBonusEditing}
                    onChange={val => updateStoreRelevance(r.key, val)}
                  />
                ),
              },
              { title: t('globalConfig.colDesc'), dataIndex: 'description' },
            ]

            const productBonusCols: TableColumnsType<RelevanceWeightRow> = [
              { title: t('globalConfig.colMethod'), dataIndex: 'method', width: 200 },
              {
                title: t('globalConfig.colWeight'), dataIndex: 'weight', width: 130,
                render: (v: number, r) => (
                  <InputNumber
                    min={0} max={9999} value={v} size="small" style={{ width: '100%' }}
                    disabled={!isBonusEditing}
                    onChange={val => updateProductRelevance(r.key, val)}
                  />
                ),
              },
              { title: t('globalConfig.colDesc'), dataIndex: 'description' },
            ]

            const bonusExtra = isBonusEditing
              ? (
                <Space>
                  <Button size="small" onClick={handleBonusCancel}>{t('common.cancel')}</Button>
                  <Button type="primary" size="small" icon={<SaveOutlined />} onClick={() => {
                    message.success(t('globalConfig.bonusSaved'))
                    setBonusSnapshot(null)
                    setIsBonusEditing(false)
                  }}>{t('common.save')}</Button>
                </Space>
              )
              : (
                <Button type="primary" size="small" icon={<EditOutlined />} onClick={handleBonusEdit}>{t('globalConfig.editBonus')}</Button>
              )

            return (
              <Card
                title={<span style={{ color: '#d46b08', fontWeight: 600 }}>{t('globalConfig.bonusTitle')}</span>}
                size="small"
                extra={bonusExtra}
                style={{ borderColor: '#ffe7ba' }}
                styles={{ header: { background: '#fff7e6', borderBottom: '1px solid #ffe7ba' } }}
              >
                <div style={{ color: '#8c8c8c', fontSize: 12, marginBottom: 10 }}>
                  {t('globalConfig.bonusDesc', { strong: <span style={{ fontWeight: 600 }}>{t('globalConfig.bonusDescStrong')}</span> })}
                  {isBonusEditing && <span style={{ color: '#1677ff', marginLeft: 8 }}>{t('globalConfig.editing')}</span>}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div>
                    <div style={{ fontWeight: 600, marginBottom: 8, fontSize: 13 }}>{t('globalConfig.bonusStore')}</div>
                    <Table<RelevanceWeightRow>
                      columns={bonusCols}
                      dataSource={[
                        ...storeRelevanceWeights,
                        ...(merchantKeywordEnabled ? [{ key: 'merchant_kw', method: t('globalConfig.storeKwMethod'), weight: merchantKeywordBonus, description: t('globalConfig.storeKwDesc') }] : []),
                      ]}
                      pagination={false} size="small" bordered
                    />
                  </div>
                  <div>
                    <div style={{ fontWeight: 600, marginBottom: 8, fontSize: 13 }}>{t('globalConfig.bonusProduct')}</div>
                    <Table<RelevanceWeightRow>
                      columns={productBonusCols}
                      dataSource={[
                        ...productRelevanceWeights,
                        ...(productKeywordEnabled ? [{ key: 'product_kw', method: t('globalConfig.productKwMethod'), weight: productKeywordBonus, description: t('globalConfig.productKwDesc') }] : []),
                      ]}
                      pagination={false} size="small" bordered
                    />
                  </div>
                </div>
              </Card>
            )
          })()}
        </div>
      ),
    },
    {
      key: 'strategy',
      label: t('globalConfig.tabStrategy'),
      children: (() => {
        // 計算每個業務頻道的維度權重總和
        const channelTotals: Record<DimensionChannelType, number> = {
          takeaway: Object.values(dimensionWeights.takeaway).reduce((a, b) => a + b, 0),
          supermarket: Object.values(dimensionWeights.supermarket).reduce((a, b) => a + b, 0),
          groupBuy: Object.values(dimensionWeights.groupBuy).reduce((a, b) => a + b, 0),
        }

        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* 維度權重佔比：3 個業務頻道並排 */}
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                <div style={{ color: '#722ed1', fontWeight: 600, fontSize: 15 }}>{t('globalConfig.dimTitle')}</div>
                {isDimEditing ? (
                  <Space>
                    <Button onClick={handleDimCancel}>{t('common.cancel')}</Button>
                    <Button type="primary" icon={<SaveOutlined />} onClick={handleDimSave}>{t('common.save')}</Button>
                  </Space>
                ) : (
                  <Button type="primary" icon={<EditOutlined />} onClick={handleDimEdit}>{t('globalConfig.editWeight')}</Button>
                )}
              </div>
              <Alert
                type="info"
                showIcon
                style={{ marginBottom: 12 }}
                message={
                  <span style={{ fontSize: 13 }}>
                    {t('globalConfig.dimAlert', { formula: <strong>{t('globalConfig.dimFormula')}</strong> })}
                  </span>
                }
              />
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
                {DIMENSION_CHANNELS.map(ch => {
                  const w = dimensionWeights[ch.key]
                  const total = channelTotals[ch.key]
                  const ok = total === 100
                  return (
                    <div
                      key={ch.key}
                      style={{
                        padding: '14px 16px',
                        borderRadius: 6,
                        border: '1px solid #efdbff',
                        background: '#fff',
                      }}
                    >
                      {/* 頻道標題 */}
                      <div style={{
                        fontWeight: 600, fontSize: 14,
                        color: '#722ed1',
                        paddingBottom: 8, marginBottom: 12,
                        borderBottom: '2px solid #d3adf7',
                        textAlign: 'center',
                      }}>
                        {ch.label}
                      </div>
                      {/* 五個維度權重 */}
                      <Form layout="vertical" size="small">
                        {DIMENSION_LABELS.map(({ key, label }) => (
                          <Form.Item
                            key={key}
                            label={<span style={{ fontSize: 12 }}>{label}</span>}
                            style={{ marginBottom: 8 }}
                          >
                            <InputNumber
                              min={0} max={100} value={w[key]}
                              disabled={!isDimEditing}
                              onChange={v => updateDimensionWeight(ch.key, key, v)}
                              addonAfter="%"
                              style={{ width: '100%' }}
                            />
                          </Form.Item>
                        ))}
                      </Form>
                      {/* 總和提示 */}
                      <div style={{
                        marginTop: 8, padding: '6px 10px',
                        borderRadius: 4,
                        background: ok ? '#f6ffed' : '#fff2f0',
                        border: `1px solid ${ok ? '#b7eb8f' : '#ffccc7'}`,
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        fontSize: 12,
                      }}>
                        <span style={{ color: '#595959' }}>{t('globalConfig.dimTotal')}</span>
                        <span style={{ fontWeight: 600, color: ok ? '#52c41a' : '#ff4d4f' }}>
                          {total}%{ok ? ' ✓' : ' ✗'}
                        </span>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* 頻道混排優先級（僅大首頁生效） */}
            <Card
              title={<span style={{ color: '#08979c', fontWeight: 600 }}>{t('globalConfig.mixingTitle')}</span>}
              size="small"
              style={{ borderColor: '#b5f5ec' }}
              styles={{ header: { background: '#e6fffb', borderBottom: '1px solid #b5f5ec' } }}
              extra={
                isMixingEditing ? (
                  <Space>
                    <Button onClick={handleMixingCancel}>{t('common.cancel')}</Button>
                    <Button type="primary" icon={<SaveOutlined />} onClick={handleMixingSave}>{t('common.save')}</Button>
                  </Space>
                ) : (
                  <Button type="primary" icon={<EditOutlined />} onClick={handleMixingEdit}>{t('globalConfig.editConfig')}</Button>
                )
              }
            >
              <div style={{ color: '#8c8c8c', fontSize: 12, marginBottom: 12 }}>
                {t('globalConfig.mixingDesc')}
              </div>

              {/* 當前生效時段提示 */}
              {currentActivePeriod && (
                <Alert
                  type="info"
                  showIcon
                  style={{ marginBottom: 12 }}
                  message={
                    <span style={{ fontSize: 13 }}>
                      {t('globalConfig.currentPeriod', { label: <strong>{currentActivePeriod.label}</strong>, range: currentActivePeriod.timeRange })}
                      <span style={{ marginLeft: 16 }}>
                        {t('globalConfig.activeConfig', {
                          takeaway: currentActivePeriod.takeawayRatio,
                          supermarket: currentActivePeriod.supermarketRatio,
                          groupBuy: currentActivePeriod.groupBuyRatio,
                        })}
                      </span>
                    </span>
                  }
                />
              )}

              {/* 展示比例規則（基準 + 時段合併展示） */}
              <Card 
                title={
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span>{t('globalConfig.ratioTitle')}</span>
                    <QuestionCircleOutlined 
                      style={{ color: '#1677ff', cursor: 'pointer', fontSize: 14 }} 
                      onClick={() => setShowRatioHelp(true)}
                    />
                  </div>
                }
                size="small" 
                style={{ marginBottom: 12 }}
              >
                {/* 全時段默認展示比例 */}
                <div
                  style={{
                    padding: '12px 16px',
                    borderRadius: 6,
                    border: `1px solid ${!currentActivePeriod ? '#52c41a' : '#e8e8e8'}`,
                    background: !currentActivePeriod ? '#f6ffed' : '#fafafa',
                    marginBottom: 8,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
                    <Tag color="blue" style={{ margin: 0 }}>
                      {t('globalConfig.allDayRatio')}
                      {!currentActivePeriod && <span style={{ marginLeft: 6, color: '#52c41a' }}>{t('globalConfig.activeNow')}</span>}
                    </Tag>
                    <span style={{ color: '#8c8c8c', fontSize: 12 }}>{t('globalConfig.allDayDefault')}</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                    <span>
                      {t('globalConfig.takeaway')}：
                      <InputNumber
                        min={0} max={100} size="small"
                        disabled={!isMixingEditing}
                        value={mixingPriority.baseTakeawayRatio}
                        addonAfter="%"
                        style={{ width: 90 }}
                        onChange={v => updateMixingPriority('baseTakeawayRatio', v ?? 0)}
                      />
                    </span>
                    <span>
                      {t('globalConfig.supermarket')}：
                      <InputNumber
                        min={0} max={100} size="small"
                        disabled={!isMixingEditing}
                        value={mixingPriority.baseSupermarketRatio}
                        addonAfter="%"
                        style={{ width: 90 }}
                        onChange={v => updateMixingPriority('baseSupermarketRatio', v ?? 0)}
                      />
                    </span>
                    <span>
                      {t('globalConfig.groupBuy')}：
                      <InputNumber
                        min={0} max={100} size="small"
                        disabled={!isMixingEditing}
                        value={mixingPriority.baseGroupBuyRatio}
                        addonAfter="%"
                        style={{ width: 90 }}
                        onChange={v => updateMixingPriority('baseGroupBuyRatio', v ?? 0)}
                      />
                    </span>
                    <Tag color={baseTotalRatio === 100 ? 'success' : 'error'}>
                      {baseTotalRatio === 100 ? '✓' : '✗'} {baseTotalRatio}%
                    </Tag>
                  </div>
                </div>

                {/* 時段規則列表 */}
                <div style={{ marginTop: 16 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontWeight: 600, color: '#595959' }}>{t('globalConfig.periodRules')}</span>
                      <QuestionCircleOutlined 
                        style={{ color: '#1677ff', cursor: 'pointer', fontSize: 14 }} 
                        onClick={() => setShowTimePeriodHelp(true)}
                      />
                    </div>
                    {isMixingEditing && (
                      <Button 
                        type="primary" 
                        size="small" 
                        icon={<PlusOutlined />}
                        onClick={addTimePeriod}
                        disabled={mixingPriority.timePeriodList.length >= MAX_TIME_PERIODS}
                      >
                        {t('globalConfig.addPeriod')}
                      </Button>
                    )}
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {mixingPriority.timePeriodList.map((period, index) => {
                      const enumConfig = period.key ? TIME_PERIOD_ENUM[period.key] : null
                      const isActive = period.key !== null && currentActivePeriod?.key === period.key
                      const ratioTotal = period.takeawayRatio + period.supermarketRatio + period.groupBuyRatio
                      const ratioOk = ratioTotal === 100
                      
                      // 計算可選時段（排除已配置的）
                      const availableKeys = TIME_PERIOD_KEYS.filter(key => 
                        !mixingPriority.timePeriodList.some((p, i) => i !== index && p.key === key)
                      )

                      return (
                        <div
                          key={index}
                          style={{
                            padding: '12px 16px',
                            borderRadius: 6,
                            border: `1px solid ${isActive ? '#52c41a' : '#e8e8e8'}`,
                            background: isActive ? '#f6ffed' : '#fafafa',
                            transition: 'all 0.3s',
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
                            {/* 時段選擇下拉框 */}
                            {isMixingEditing ? (
                              <Select
                                size="small"
                                placeholder={t('globalConfig.selectPeriod')}
                                value={period.key}
                                style={{ width: 140 }}
                                onChange={value => updateTimePeriodKey(index, value)}
                                options={[
                                  // 當前已選擇的時段（如果在列表中）
                                  ...(period.key && !availableKeys.includes(period.key)
                                    ? [{ label: TIME_PERIOD_ENUM[period.key].label, value: period.key }]
                                    : []),
                                  // 可選時段
                                  ...availableKeys.map(key => ({
                                    label: TIME_PERIOD_ENUM[key].label,
                                    value: key,
                                  })),
                                ]}
                              />
                            ) : (
                              <Tag color="cyan" style={{ margin: 0 }}>
                                {enumConfig?.label || t('globalConfig.pending')}
                                {isActive && <span style={{ marginLeft: 6, color: '#52c41a' }}>{t('globalConfig.activeNow')}</span>}
                              </Tag>
                            )}
                            {/* 時間範圍 */}
                            {enumConfig && (
                              <span style={{ color: '#595959', fontSize: 13 }}>{enumConfig.timeRange}</span>
                            )}
                            {/* 當前生效標籤（查看模式） */}
                            {!isMixingEditing && isActive && (
                              <Tag color="success" style={{ margin: 0 }}>{t('globalConfig.currentActive')}</Tag>
                            )}
                            {/* 刪除按鈕 */}
                            {isMixingEditing && (
                              <Button 
                                type="text" 
                                danger
                                size="small" 
                                icon={<DeleteOutlined />}
                                style={{ marginLeft: 'auto' }}
                                onClick={() => removeTimePeriod(index)}
                              >
                                {t('common.delete')}
                              </Button>
                            )}
                          </div>
                          
                          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                            <span>
                              {t('globalConfig.takeaway')}：
                              <InputNumber
                                min={0} max={100} size="small"
                                disabled={!isMixingEditing}
                                value={period.takeawayRatio}
                                addonAfter="%"
                                style={{ width: 90 }}
                                onChange={v => updateTimePeriod(period.key!, 'takeawayRatio', v ?? 0)}
                              />
                            </span>
                            <span>
                              {t('globalConfig.supermarket')}：
                              <InputNumber
                                min={0} max={100} size="small"
                                disabled={!isMixingEditing}
                                value={period.supermarketRatio}
                                addonAfter="%"
                                style={{ width: 90 }}
                                onChange={v => updateTimePeriod(period.key!, 'supermarketRatio', v ?? 0)}
                              />
                            </span>
                            <span>
                              {t('globalConfig.groupBuy')}：
                              <InputNumber
                                min={0} max={100} size="small"
                                disabled={!isMixingEditing}
                                value={period.groupBuyRatio}
                                addonAfter="%"
                                style={{ width: 90 }}
                                onChange={v => updateTimePeriod(period.key!, 'groupBuyRatio', v ?? 0)}
                              />
                            </span>
                            <Tag color={ratioOk ? 'success' : 'error'}>
                              {ratioOk ? '✓' : '✗'} {ratioTotal}%
                            </Tag>
                          </div>
                        </div>
                      )
                    })}
                    {mixingPriority.timePeriodList.length === 0 && (
                      <div style={{ textAlign: 'center', padding: '16px', color: '#8c8c8c', border: '1px dashed #d9d9d9', borderRadius: 6 }}>
                        {t('globalConfig.noPeriodRule')}
                      </div>
                    )}
                  </div>
                </div>
              </Card>

              {/* 輪插策略 */}
              <Card 
                title={
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span>{t('globalConfig.interleaveTitle')}</span>
                    <QuestionCircleOutlined 
                      style={{ 
                        color: '#1677ff', 
                        cursor: 'pointer',
                        fontSize: 14,
                      }} 
                      onClick={() => setShowInterleaveHelp(true)}
                    />
                  </div>
                } 
                size="small" 
                style={{ marginBottom: 12 }}
              >
                <Space wrap>
                  <span>{t('globalConfig.interleaveA')}</span>
                  <InputNumber min={1} max={99} disabled={!isMixingEditing} value={mixingPriority.interleaveX} onChange={v => updateMixingPriority('interleaveX', v ?? 1)} />
                  <span>{t('globalConfig.interleaveB')}</span>
                  <InputNumber min={0} max={99} disabled={!isMixingEditing} value={mixingPriority.interleaveZ} onChange={v => updateMixingPriority('interleaveZ', v ?? 0)} />
                  <span>{t('globalConfig.interleaveC')}</span>
                  <InputNumber min={0} max={99} disabled={!isMixingEditing} value={mixingPriority.interleaveY} onChange={v => updateMixingPriority('interleaveY', v ?? 0)} />
                  <span>{t('globalConfig.interleaveD')}</span>
                </Space>
              </Card>

              {/* 輪插策略說明彈窗 */}
              <Modal
                title={t('globalConfig.helpTitle1')}
                open={showInterleaveHelp}
                onCancel={() => setShowInterleaveHelp(false)}
                footer={[
                  <Button key="close" type="primary" onClick={() => setShowInterleaveHelp(false)}>
                    {t('globalConfig.gotIt')}
                  </Button>
                ]}
                width={480}
              >
                <div style={{ lineHeight: 1.8, fontSize: 14 }}>
                  <div style={{ marginBottom: 16, color: '#595959' }}>
                    {t('globalConfig.help1Desc')}
                  </div>

                  <div style={{ fontWeight: 600, marginBottom: 8, color: '#262626' }}>{t('globalConfig.help1How')}</div>
                  <div style={{ marginBottom: 16, paddingLeft: 12, color: '#595959' }}>
                    <div>{t('globalConfig.help1How1')}</div>
                    <div>{t('globalConfig.help1How2')}</div>
                  </div>

                  <div style={{ fontWeight: 600, marginBottom: 8, color: '#262626' }}>{t('globalConfig.help1Special')}</div>
                  <div style={{ marginBottom: 16, paddingLeft: 12, color: '#595959' }}>
                    <div>{t('globalConfig.help1Special1')}</div>
                    <div>{t('globalConfig.help1Special2')}</div>
                    <div>{t('globalConfig.help1Special3')}</div>
                  </div>

                  <div style={{ fontWeight: 600, marginBottom: 8, color: '#262626' }}>{t('globalConfig.help1Order')}</div>
                  <div style={{ paddingLeft: 12, color: '#595959' }}>
                    {t('globalConfig.help1Order1')}
                  </div>
                </div>
              </Modal>

              {/* 展示比例規則說明彈窗 */}
              <Modal
                title={t('globalConfig.helpTitle2')}
                open={showRatioHelp}
                onCancel={() => setShowRatioHelp(false)}
                footer={[
                  <Button key="close" type="primary" onClick={() => setShowRatioHelp(false)}>
                    {t('globalConfig.gotIt')}
                  </Button>
                ]}
                width={480}
              >
                <div style={{ lineHeight: 1.8, fontSize: 14 }}>
                  <div style={{ marginBottom: 16, color: '#595959' }}>
                    {t('globalConfig.help2Desc')}
                  </div>

                  <div style={{ fontWeight: 600, marginBottom: 8, color: '#262626' }}>{t('globalConfig.help2AllDay')}</div>
                  <div style={{ marginBottom: 16, paddingLeft: 12, color: '#595959' }}>
                    <div>{t('globalConfig.help2AllDay1')}</div>
                    <div>{t('globalConfig.help2AllDay2')}</div>
                    <div>{t('globalConfig.help2AllDay3')}</div>
                  </div>

                  <div style={{ fontWeight: 600, marginBottom: 8, color: '#262626' }}>{t('globalConfig.help2Period')}</div>
                  <div style={{ marginBottom: 16, paddingLeft: 12, color: '#595959' }}>
                    <div>{t('globalConfig.help2Period1')}</div>
                    <div>{t('globalConfig.help2Period2')}</div>
                    <div>{t('globalConfig.help2Period3')}</div>
                  </div>

                  <div style={{ fontWeight: 600, marginBottom: 8, color: '#262626' }}>{t('globalConfig.help2Tip')}</div>
                  <div style={{ paddingLeft: 12, color: '#595959' }}>
                    <div>{t('globalConfig.help2Tip1')}</div>
                    <div>{t('globalConfig.help2Tip2')}</div>
                    <div>{t('globalConfig.help2Tip3')}</div>
                  </div>
                </div>
              </Modal>

              {/* 時段優先規則說明彈窗 */}
              <Modal
                title={t('globalConfig.helpTitle3')}
                open={showTimePeriodHelp}
                onCancel={() => setShowTimePeriodHelp(false)}
                footer={[
                  <Button key="close" type="primary" onClick={() => setShowTimePeriodHelp(false)}>
                    {t('globalConfig.gotIt')}
                  </Button>
                ]}
                width={480}
              >
                <div style={{ lineHeight: 1.8, fontSize: 14 }}>
                  <div style={{ marginBottom: 16, color: '#595959' }}>
                    {t('globalConfig.help3Desc')}
                  </div>

                  <div style={{ fontWeight: 600, marginBottom: 8, color: '#262626' }}>{t('globalConfig.help3Avail')}</div>
                  <div style={{ marginBottom: 16, paddingLeft: 12, color: '#595959' }}>
                    <div>• {t('globalConfig.periodBreakfast')}（07:00-09:00）</div>
                    <div>• {t('globalConfig.periodLunch')}（11:00-13:00）</div>
                    <div>• {t('globalConfig.periodTea')}（14:00-17:00）</div>
                    <div>• {t('globalConfig.periodDinner')}（17:00-19:00）</div>
                    <div>• {t('globalConfig.periodSupper')}（22:00-01:00）</div>
                  </div>

                  <div style={{ fontWeight: 600, marginBottom: 8, color: '#262626' }}>{t('globalConfig.help3Rule')}</div>
                  <div style={{ marginBottom: 16, paddingLeft: 12, color: '#595959' }}>
                    <div>{t('globalConfig.help3Rule1')}</div>
                    <div>{t('globalConfig.help3Rule2')}</div>
                    <div>{t('globalConfig.help3Rule3')}</div>
                  </div>

                  <div style={{ fontWeight: 600, marginBottom: 8, color: '#262626' }}>{t('globalConfig.help3Match')}</div>
                  <div style={{ paddingLeft: 12, color: '#595959' }}>
                    <div>{t('globalConfig.help3Match1')}</div>
                    <div>{t('globalConfig.help3Match2')}</div>
                    <div>{t('globalConfig.help3Match3')}</div>
                  </div>
                </div>
              </Modal>
            </Card>
          </div>
        )
      })(),
    },
  ]

  return (
    <div className="content-area">
      {/* 頁面描述 */}
      <Card
        size="small"
        style={{ marginBottom: 16, background: '#f6f8fa', border: '1px solid #e8e8e8' }}
      >
        <span style={{ color: '#595959', fontSize: 13 }}>
          {t('globalConfig.pageDesc')}
        </span>
      </Card>

      <Tabs defaultActiveKey="library" items={tabItems} size="large" />
    </div>
  )
}
