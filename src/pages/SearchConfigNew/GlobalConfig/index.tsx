import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { Card, Tabs, Form, Switch, InputNumber, Button, Table, Tag, Space, Checkbox, Progress, Alert, message, Input, Select, Modal } from 'antd'
import type { TableColumnsType } from 'antd'
import { SaveOutlined, WarningOutlined, EditOutlined, DeleteOutlined, PlusOutlined, QuestionCircleOutlined } from '@ant-design/icons'

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

const DIMENSION_CHANNELS: { key: DimensionChannelType; label: string }[] = [
  { key: 'takeaway', label: '外賣頻道搜索' },
  { key: 'groupBuy', label: '團購頻道搜索' },
  { key: 'supermarket', label: '超市頻道搜索' },
]

const DIMENSION_LABELS: { key: keyof DimensionWeight; label: string }[] = [
  { key: 'relevance', label: '搜索詞匹配得分佔比' },
  { key: 'commercial', label: '商業得分佔比' },
  { key: 'store', label: '店鋪得分佔比' },
  { key: 'user', label: '用戶得分佔比' },
  { key: 'other', label: '平台得分佔比' },
]

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

const defaultStoreRelevanceWeights: RelevanceWeightRow[] = [
  { key: 's1', method: '分詞命中', weight: 100, description: '分詞後，分詞命中店鋪名稱加分' },
  { key: 's2', method: '用戶輸入內容（模糊匹配）', weight: 60, description: '用戶輸入的內容，模糊匹配店鋪名稱加分' },
  { key: 's3', method: '用戶輸入內容（精準匹配）', weight: 200, description: '用戶輸入的內容，精準匹配店鋪名稱加分' },
]

const defaultProductRelevanceWeights: RelevanceWeightRow[] = [
  { key: 'p1', method: '分詞命中', weight: 100, description: '分詞後，分詞命中商品名稱加分' },
  { key: 'p2', method: '用戶輸入內容（模糊匹配）', weight: 60, description: '用戶輸入的內容，模糊匹配商品名稱加分' },
  { key: 'p3', method: '用戶輸入內容（精準匹配）', weight: 200, description: '用戶輸入的內容，精準匹配商品名稱加分' },
]

/** 時段類型枚舉（固定5個，不可重複配置） */
type TimePeriodKey = 'breakfast' | 'lunch' | 'afternoonTea' | 'dinner' | 'supper'

/** 時段枚舉配置 */
const TIME_PERIOD_ENUM: Record<TimePeriodKey, { label: string; timeRange: string }> = {
  breakfast: { label: '早餐時段', timeRange: '07:00-09:00' },
  lunch: { label: '午餐時段', timeRange: '11:00-13:00' },
  afternoonTea: { label: '下午茶時段', timeRange: '14:00-17:00' },
  dinner: { label: '晚餐時段', timeRange: '17:00-19:00' },
  supper: { label: '宵夜時段', timeRange: '22:00-01:00' },
}

const TIME_PERIOD_KEYS = Object.keys(TIME_PERIOD_ENUM) as TimePeriodKey[]

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
  const [storeRelevanceWeights, setStoreRelevanceWeights] = useState<RelevanceWeightRow[]>(defaultStoreRelevanceWeights)
  const [productRelevanceWeights, setProductRelevanceWeights] = useState<RelevanceWeightRow[]>(defaultProductRelevanceWeights)
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
    message.success('維度權重佔比已保存')
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
    message.success('頻道混排優先級已保存')
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

  const updateTimePeriod = (periodKey: TimePeriodKey, field: keyof TimePeriodItem, value: any) => {
    setMixingPriority(prev => ({
      ...prev,
      timePeriodList: prev.timePeriodList.map(item =>
        item.key === periodKey ? { ...item, [field]: value } : item
      ),
    }))
  }

  const addTimePeriod = () => {
    if (mixingPriority.timePeriodList.length >= MAX_TIME_PERIODS) {
      message.warning(`最多只能新增 ${MAX_TIME_PERIODS} 個時段`)
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
        message.warning(`${TIME_PERIOD_ENUM[newKey].label} 已存在，請選擇其他時段`)
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
      label: '詞庫與搜索',
      children: (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* 詞庫配置區域 */}
          <Card
            title={<span style={{ color: '#1d39c4', fontWeight: 600 }}>詞庫配置</span>}
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
                    <span style={{ fontWeight: 600 }}>同義詞庫</span>
                    <Switch
                      checked={synonymEnabled}
                      onChange={setSynonymEnabled}
                      checkedChildren="開"
                      unCheckedChildren="關"
                      size="small"
                    />
                  </Space>
                  <Button type="link" size="small" onClick={() => navigate('/synonym-config')}>管理詞庫</Button>
                </div>
                <div style={{ marginTop: 6, color: '#8c8c8c', fontSize: 12, lineHeight: '18px' }}>
                  搜「漢堡」可召回「burger」等同義詞
                </div>
              </Card>

              {/* 停用詞庫 */}
              <Card size="small" styles={{ body: { padding: '12px 16px' } }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Space>
                    <span style={{ fontWeight: 600 }}>停用詞庫</span>
                    <Switch
                      checked={stopWordEnabled}
                      onChange={setStopWordEnabled}
                      checkedChildren="開"
                      unCheckedChildren="關"
                      size="small"
                    />
                  </Space>
                  <Button type="link" size="small" onClick={() => navigate('/stop-words')}>管理詞庫</Button>
                </div>
                <div style={{ marginTop: 6, color: '#8c8c8c', fontSize: 12, lineHeight: '18px' }}>
                  過濾無意義詞，避免干擾搜索結果
                </div>
              </Card>

              {/* 商家關鍵詞匹配 */}
              <Card size="small" styles={{ body: { padding: '12px 16px' } }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Space>
                    <span style={{ fontWeight: 600 }}>商家關鍵詞匹配</span>
                    <Switch
                      checked={merchantKeywordEnabled}
                      onChange={setMerchantKeywordEnabled}
                      checkedChildren="開"
                      unCheckedChildren="關"
                      size="small"
                    />
                  </Space>
                </div>
                <div style={{ marginTop: 6, color: '#8c8c8c', fontSize: 12, lineHeight: '18px' }}>
                  搜「快餐」可召回漢堡店、肯德基等商家
                </div>
              </Card>

              {/* 商品關鍵詞匹配 */}
              <Card size="small" styles={{ body: { padding: '12px 16px' } }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Space>
                    <span style={{ fontWeight: 600 }}>商品關鍵詞匹配</span>
                    <Switch
                      checked={productKeywordEnabled}
                      onChange={setProductKeywordEnabled}
                      checkedChildren="開"
                      unCheckedChildren="關"
                      size="small"
                    />
                  </Space>
                </div>
                <div style={{ marginTop: 6, color: '#8c8c8c', fontSize: 12, lineHeight: '18px' }}>
                  搜「飲品」可召回奶茶、可樂等商品
                </div>
              </Card>
            </div>
          </Card>

          {/* 用戶輸入模糊糾錯 */}
          <Card
            title={<span style={{ color: '#389e0d', fontWeight: 600 }}>用戶輸入模糊糾錯</span>}
            size="small"
            style={{ borderColor: '#d9f7be' }}
            styles={{ header: { background: '#f6ffed', borderBottom: '1px solid #d9f7be' } }}
          >
            <div style={{ color: '#8c8c8c', fontSize: 12, marginBottom: 10 }}>
              用戶輸入搜索詞時的自動糾錯與模糊匹配能力，提升召回率
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
              <div style={{ padding: '10px 14px', border: '1px solid #f0f0f0', borderRadius: 6, background: '#fafafa' }}>
                <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 6 }}>拼音匹配</div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Switch
                    checked={fuzzyPinyin}
                    onChange={setFuzzyPinyin}
                    checkedChildren="開"
                    unCheckedChildren="關"
                    size="small"
                  />
                  <span style={{ color: '#8c8c8c', fontSize: 12 }}>如搜「汉bao」召回「漢堡」</span>
                </div>
              </div>
              <div style={{ padding: '10px 14px', border: '1px solid #f0f0f0', borderRadius: 6, background: '#fafafa' }}>
                <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 6 }}>簡繁體匹配</div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Switch
                    checked={fuzzySimplifiedTraditional}
                    onChange={setFuzzySimplifiedTraditional}
                    checkedChildren="開"
                    unCheckedChildren="關"
                    size="small"
                  />
                  <span style={{ color: '#8c8c8c', fontSize: 12 }}>如搜「汉堡」召回「漢堡」</span>
                </div>
              </div>
              <div style={{ padding: '10px 14px', border: '1px solid #f0f0f0', borderRadius: 6, background: '#fafafa' }}>
                <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 6 }}>容錯匹配</div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Switch
                    checked={fuzzyTolerance}
                    onChange={setFuzzyTolerance}
                    checkedChildren="開"
                    unCheckedChildren="關"
                    size="small"
                  />
                  <span style={{ color: '#8c8c8c', fontSize: 12 }}>如搜「肯德鷄」召回「肯德基」</span>
                </div>
              </div>
            </div>
          </Card>

          {/* 用戶輸入搜索詞匹配加分：門店與商品左右並排 */}
          {(() => {
            const bonusCols: TableColumnsType<RelevanceWeightRow> = [
              { title: '匹配方式', dataIndex: 'method', width: 200 },
              {
                title: '加分值', dataIndex: 'weight', width: 130,
                render: (v: number, r) => (
                  <InputNumber
                    min={0} max={9999} value={v} size="small" style={{ width: '100%' }}
                    disabled={!isBonusEditing}
                    onChange={val => updateStoreRelevance(r.key, val)}
                  />
                ),
              },
              { title: '說明', dataIndex: 'description' },
            ]

            const productBonusCols: TableColumnsType<RelevanceWeightRow> = [
              { title: '匹配方式', dataIndex: 'method', width: 200 },
              {
                title: '加分值', dataIndex: 'weight', width: 130,
                render: (v: number, r) => (
                  <InputNumber
                    min={0} max={9999} value={v} size="small" style={{ width: '100%' }}
                    disabled={!isBonusEditing}
                    onChange={val => updateProductRelevance(r.key, val)}
                  />
                ),
              },
              { title: '說明', dataIndex: 'description' },
            ]

            const bonusExtra = isBonusEditing
              ? (
                <Space>
                  <Button size="small" onClick={handleBonusCancel}>取消</Button>
                  <Button type="primary" size="small" icon={<SaveOutlined />} onClick={() => {
                    message.success('搜索詞匹配加分已保存')
                    setBonusSnapshot(null)
                    setIsBonusEditing(false)
                  }}>保存</Button>
                </Space>
              )
              : (
                <Button type="primary" size="small" icon={<EditOutlined />} onClick={handleBonusEdit}>編輯加分</Button>
              )

            return (
              <Card
                title={<span style={{ color: '#d46b08', fontWeight: 600 }}>用戶輸入搜索詞匹配加分</span>}
                size="small"
                extra={bonusExtra}
                style={{ borderColor: '#ffe7ba' }}
                styles={{ header: { background: '#fff7e6', borderBottom: '1px solid #ffe7ba' } }}
              >
                <div style={{ color: '#8c8c8c', fontSize: 12, marginBottom: 10 }}>
                  基於<span style={{ fontWeight: 600 }}>用戶實際輸入內容</span>命中商家名稱或商品名稱時的加分值（與上方詞庫配置無關）
                  {isBonusEditing && <span style={{ color: '#1677ff', marginLeft: 8 }}>（編輯中）</span>}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div>
                    <div style={{ fontWeight: 600, marginBottom: 8, fontSize: 13 }}>命中商家相關信息加分</div>
                    <Table<RelevanceWeightRow>
                      columns={bonusCols}
                      dataSource={[
                        ...storeRelevanceWeights,
                        ...(merchantKeywordEnabled ? [{ key: 'merchant_kw', method: '商家關鍵詞命中', weight: merchantKeywordBonus, description: '用戶輸入內容，匹配商家關鍵詞加分' }] : []),
                      ]}
                      pagination={false} size="small" bordered
                    />
                  </div>
                  <div>
                    <div style={{ fontWeight: 600, marginBottom: 8, fontSize: 13 }}>命中商品相關信息加分</div>
                    <Table<RelevanceWeightRow>
                      columns={productBonusCols}
                      dataSource={[
                        ...productRelevanceWeights,
                        ...(productKeywordEnabled ? [{ key: 'product_kw', method: '商品關鍵詞命中', weight: productKeywordBonus, description: '用戶輸入內容，匹配商品關鍵詞加分' }] : []),
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
      label: '策略權重',
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
                <div style={{ color: '#722ed1', fontWeight: 600, fontSize: 15 }}>維度權重佔比（按業務頻道獨立配置）</div>
                {isDimEditing ? (
                  <Space>
                    <Button onClick={handleDimCancel}>取消</Button>
                    <Button type="primary" icon={<SaveOutlined />} onClick={handleDimSave}>保存</Button>
                  </Space>
                ) : (
                  <Button type="primary" icon={<EditOutlined />} onClick={handleDimEdit}>編輯權重</Button>
                )}
              </div>
              <Alert
                type="info"
                showIcon
                style={{ marginBottom: 12 }}
                message={
                  <span style={{ fontSize: 13 }}>
                    各業務頻道獨立配置權重：<strong>最終得分 = 相關性×% + 商業×% + 店鋪×% + 用戶×% + 平台×%</strong>；大首頁無獨立權重，透過下方「頻道混排優先級」聚合三個頻道的搜索結果
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
                        <span style={{ color: '#595959' }}>佔比總和</span>
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
              title={<span style={{ color: '#08979c', fontWeight: 600 }}>頻道混排優先級（僅大首頁生效）</span>}
              size="small"
              style={{ borderColor: '#b5f5ec' }}
              styles={{ header: { background: '#e6fffb', borderBottom: '1px solid #b5f5ec' } }}
              extra={
                isMixingEditing ? (
                  <Space>
                    <Button onClick={handleMixingCancel}>取消</Button>
                    <Button type="primary" icon={<SaveOutlined />} onClick={handleMixingSave}>保存</Button>
                  </Space>
                ) : (
                  <Button type="primary" icon={<EditOutlined />} onClick={handleMixingEdit}>編輯配置</Button>
                )
              }
            >
              <div style={{ color: '#8c8c8c', fontSize: 12, marginBottom: 12 }}>
                大首頁聚合多個頻道內容時的排序與展示比例策略
              </div>

              {/* 當前生效時段提示 */}
              {currentActivePeriod && (
                <Alert
                  type="info"
                  showIcon
                  style={{ marginBottom: 12 }}
                  message={
                    <span style={{ fontSize: 13 }}>
                      🕐 當前時段：<strong>{currentActivePeriod.label}</strong>（{currentActivePeriod.timeRange}）
                      <span style={{ marginLeft: 16 }}>
                        生效配置：外賣 {currentActivePeriod.takeawayRatio}%
                        {' '}超市 {currentActivePeriod.supermarketRatio}%
                        {' '}團購 {currentActivePeriod.groupBuyRatio}%
                      </span>
                    </span>
                  }
                />
              )}

              {/* 展示比例規則（基準 + 時段合併展示） */}
              <Card 
                title={
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span>📋 展示比例規則</span>
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
                      全時段展示比例
                      {!currentActivePeriod && <span style={{ marginLeft: 6, color: '#52c41a' }}>（當前生效）</span>}
                    </Tag>
                    <span style={{ color: '#8c8c8c', fontSize: 12 }}>默認配置，無時段規則時生效</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                    <span>
                      外賣：
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
                      超市：
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
                      團購：
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
                      <span style={{ fontWeight: 600, color: '#595959' }}>時段優先規則</span>
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
                        新增時段
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
                                placeholder="請選擇時段"
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
                                {enumConfig?.label || '待選擇'}
                                {isActive && <span style={{ marginLeft: 6, color: '#52c41a' }}>（當前生效）</span>}
                              </Tag>
                            )}
                            {/* 時間範圍 */}
                            {enumConfig && (
                              <span style={{ color: '#595959', fontSize: 13 }}>{enumConfig.timeRange}</span>
                            )}
                            {/* 當前生效標籤（查看模式） */}
                            {!isMixingEditing && isActive && (
                              <Tag color="success" style={{ margin: 0 }}>當前生效</Tag>
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
                                刪除
                              </Button>
                            )}
                          </div>
                          
                          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                            <span>
                              外賣：
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
                              超市：
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
                              團購：
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
                        暫無時段規則，使用「全時段展示比例」作為默認配置
                      </div>
                    )}
                  </div>
                </div>
              </Card>

              {/* 輪插策略 */}
              <Card 
                title={
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span>輪插策略</span>
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
                  <span>每</span>
                  <InputNumber min={1} max={99} disabled={!isMixingEditing} value={mixingPriority.interleaveX} onChange={v => updateMixingPriority('interleaveX', v ?? 1)} />
                  <span>條外賣，插入</span>
                  <InputNumber min={0} max={99} disabled={!isMixingEditing} value={mixingPriority.interleaveZ} onChange={v => updateMixingPriority('interleaveZ', v ?? 0)} />
                  <span>條團購 /</span>
                  <InputNumber min={0} max={99} disabled={!isMixingEditing} value={mixingPriority.interleaveY} onChange={v => updateMixingPriority('interleaveY', v ?? 0)} />
                  <span>條超市</span>
                </Space>
              </Card>

              {/* 輪插策略說明彈窗 */}
              <Modal
                title="輪插策略說明"
                open={showInterleaveHelp}
                onCancel={() => setShowInterleaveHelp(false)}
                footer={[
                  <Button key="close" type="primary" onClick={() => setShowInterleaveHelp(false)}>
                    知道了
                  </Button>
                ]}
                width={480}
              >
                <div style={{ lineHeight: 1.8, fontSize: 14 }}>
                  <div style={{ marginBottom: 16, color: '#595959' }}>
                    控制各頻道內容的穿插順序，避免單一頻道壟斷前排位置
                  </div>

                  <div style={{ fontWeight: 600, marginBottom: 8, color: '#262626' }}>🔄 運作方式</div>
                  <div style={{ marginBottom: 16, paddingLeft: 12, color: '#595959' }}>
                    <div>• 按照配置的比例循環插入各頻道結果</div>
                    <div>• 例如「3條外賣 + 1條團購 + 2條超市」循環展示</div>
                  </div>

                  <div style={{ fontWeight: 600, marginBottom: 8, color: '#262626' }}>⚠️ 特殊場景處理</div>
                  <div style={{ marginBottom: 16, paddingLeft: 12, color: '#595959' }}>
                    <div>• 若某頻道無結果 → 自動跳過該頻道</div>
                    <div>• 若某頻道結果不足 → 展示該頻道全部結果後繼續</div>
                    <div>• 若僅有一個頻道有結果 → 直接展示該頻道全部結果</div>
                  </div>

                  <div style={{ fontWeight: 600, marginBottom: 8, color: '#262626' }}>📊 順序說明</div>
                  <div style={{ paddingLeft: 12, color: '#595959' }}>
                    按照「外賣 → 團購 → 超市」順序循環插入
                  </div>
                </div>
              </Modal>

              {/* 展示比例規則說明彈窗 */}
              <Modal
                title="展示比例規則說明"
                open={showRatioHelp}
                onCancel={() => setShowRatioHelp(false)}
                footer={[
                  <Button key="close" type="primary" onClick={() => setShowRatioHelp(false)}>
                    知道了
                  </Button>
                ]}
                width={480}
              >
                <div style={{ lineHeight: 1.8, fontSize: 14 }}>
                  <div style={{ marginBottom: 16, color: '#595959' }}>
                    配置大首頁搜索結果中各頻道的展示比例，包括默認比例和時段優先比例
                  </div>

                  <div style={{ fontWeight: 600, marginBottom: 8, color: '#262626' }}>📋 全時段展示比例</div>
                  <div style={{ marginBottom: 16, paddingLeft: 12, color: '#595959' }}>
                    <div>• 默認配置，無時段規則時生效</div>
                    <div>• 配置外賣、超市、團購三個頻道的展示比例</div>
                    <div>• 比例總和必須等於 100%</div>
                  </div>

                  <div style={{ fontWeight: 600, marginBottom: 8, color: '#262626' }}>⏰ 時段優先規則</div>
                  <div style={{ marginBottom: 16, paddingLeft: 12, color: '#595959' }}>
                    <div>• 可配置不同時段的專屬展示比例</div>
                    <div>• 系統會根據當前時間自動匹配對應時段</div>
                    <div>• 命中時段時使用該時段配置，否則使用全時段比例</div>
                  </div>

                  <div style={{ fontWeight: 600, marginBottom: 8, color: '#262626' }}>💡 使用建議</div>
                  <div style={{ paddingLeft: 12, color: '#595959' }}>
                    <div>• 午晚餐時間可提高外賣比例</div>
                    <div>• 下午茶時間可提高超市比例</div>
                    <div>• 宵夜時間可提高團購比例</div>
                  </div>
                </div>
              </Modal>

              {/* 時段優先規則說明彈窗 */}
              <Modal
                title="時段優先規則說明"
                open={showTimePeriodHelp}
                onCancel={() => setShowTimePeriodHelp(false)}
                footer={[
                  <Button key="close" type="primary" onClick={() => setShowTimePeriodHelp(false)}>
                    知道了
                  </Button>
                ]}
                width={480}
              >
                <div style={{ lineHeight: 1.8, fontSize: 14 }}>
                  <div style={{ marginBottom: 16, color: '#595959' }}>
                    配置不同時段的專屬展示比例，系統會根據當前時間自動匹配
                  </div>

                  <div style={{ fontWeight: 600, marginBottom: 8, color: '#262626' }}>📅 可用時段</div>
                  <div style={{ marginBottom: 16, paddingLeft: 12, color: '#595959' }}>
                    <div>• 早餐時段（07:00-09:00）</div>
                    <div>• 午餐時段（11:00-13:00）</div>
                    <div>• 下午茶時段（14:00-17:00）</div>
                    <div>• 晚餐時段（17:00-19:00）</div>
                    <div>• 宵夜時段（22:00-01:00）</div>
                  </div>

                  <div style={{ fontWeight: 600, marginBottom: 8, color: '#262626' }}>⚙️ 配置規則</div>
                  <div style={{ marginBottom: 16, paddingLeft: 12, color: '#595959' }}>
                    <div>• 每個時段最多配置一次，不可重複</div>
                    <div>• 每個時段的展示比例總和必須等於 100%</div>
                    <div>• 最多可配置 5 個時段</div>
                  </div>

                  <div style={{ fontWeight: 600, marginBottom: 8, color: '#262626' }}>🔄 匹配邏輯</div>
                  <div style={{ paddingLeft: 12, color: '#595959' }}>
                    <div>• 系統根據當前時間匹配對應時段</div>
                    <div>• 命中時段 → 使用該時段配置</div>
                    <div>• 未命中 → 使用「全時段展示比例」</div>
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
          全局通用配置對閃蜂和mFood兩個APP共同生效，所有頻道共享此配置
        </span>
      </Card>

      <Tabs defaultActiveKey="library" items={tabItems} size="large" />
    </div>
  )
}
