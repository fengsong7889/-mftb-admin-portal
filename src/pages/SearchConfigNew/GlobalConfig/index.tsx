import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { Card, Tabs, Form, Switch, InputNumber, Button, Table, Tag, Space, Checkbox, Progress, Alert, message } from 'antd'
import type { TableColumnsType } from 'antd'
import { SaveOutlined, WarningOutlined, EditOutlined } from '@ant-design/icons'

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
  { key: 'relevance', label: '相關性得分佔比' },
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
  { key: 's1', method: '分詞命中', weight: 100, description: '分詞後命中店名' },
  { key: 's2', method: '用戶輸入內容命中', weight: 60, description: '用戶輸入內容，不分詞模糊匹配' },
  { key: 's3', method: '精準匹配', weight: 200, description: '完全匹配店名' },
]

const defaultProductRelevanceWeights: RelevanceWeightRow[] = [
  { key: 'p1', method: '分詞命中', weight: 100, description: '分詞後命中商品名' },
  { key: 'p2', method: '用戶輸入內容命中', weight: 60, description: '用戶輸入內容，不分詞模糊匹配' },
  { key: 'p3', method: '精準匹配', weight: 200, description: '完全匹配商品名' },
]

/** 頻道混排：時段優先配置行 */
interface TimePriorityItem {
  key: string
  timeRange: string
  priorityChannel: string
  weightBonus: number
}

/** 頻道混排優先級配置（僅大首頁生效） */
interface ChannelMixingConfig {
  takeawayWeight: number
  supermarketWeight: number
  groupBuyWeight: number
  takeawayRatio: number
  supermarketRatio: number
  groupBuyRatio: number
  interleaveX: number
  interleaveY: number
  interleaveZ: number
  timePriorityList: TimePriorityItem[]
}

const defaultChannelMixing: ChannelMixingConfig = {
  takeawayWeight: 100, supermarketWeight: 80, groupBuyWeight: 60,
  takeawayRatio: 50, supermarketRatio: 30, groupBuyRatio: 20,
  interleaveX: 3, interleaveY: 2, interleaveZ: 1,
  timePriorityList: [
    { key: 't1', timeRange: '07:00-09:00', priorityChannel: '外賣', weightBonus: 30 },
    { key: 't2', timeRange: '11:00-13:00', priorityChannel: '外賣', weightBonus: 50 },
    { key: 't3', timeRange: '17:00-19:00', priorityChannel: '外賣', weightBonus: 40 },
    { key: 't4', timeRange: '20:00-22:00', priorityChannel: '超市', weightBonus: 25 },
    { key: 't5', timeRange: '22:00-01:00', priorityChannel: '團購', weightBonus: 35 },
  ],
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
  const [bonusSnapshot, setBonusSnapshot] = useState<{ store: RelevanceWeightRow[], product: RelevanceWeightRow[] } | null>(null)

  const handleBonusEdit = () => {
    setBonusSnapshot({ store: storeRelevanceWeights, product: productRelevanceWeights })
    setIsBonusEditing(true)
  }

  const handleBonusCancel = () => {
    if (bonusSnapshot) {
      setStoreRelevanceWeights(bonusSnapshot.store)
      setProductRelevanceWeights(bonusSnapshot.product)
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
  const [mixingSnapshot, setMixingSnapshot] = useState<ChannelMixingConfig | null>(null)

  const handleMixingEdit = () => {
    setMixingSnapshot(channelMixing)
    setIsMixingEditing(true)
  }

  const handleMixingCancel = () => {
    if (mixingSnapshot) setChannelMixing(mixingSnapshot)
    setMixingSnapshot(null)
    setIsMixingEditing(false)
  }

  const handleMixingSave = () => {
    setMixingSnapshot(null)
    setIsMixingEditing(false)
    message.success('頻道混排優先級已保存')
  }

  const updateStoreRelevance = (rowKey: string, value: number | null) => {
    setStoreRelevanceWeights(prev =>
      prev.map(r => r.key === rowKey ? { ...r, weight: value ?? 0 } : r)
    )
  }

  const updateProductRelevance = (rowKey: string, value: number | null) => {
    setProductRelevanceWeights(prev =>
      prev.map(r => r.key === rowKey ? { ...r, weight: value ?? 0 } : r)
    )
  }

  // 頻道混排優先級狀態（僅大首頁生效）
  const [channelMixing, setChannelMixing] = useState<ChannelMixingConfig>(defaultChannelMixing)

  const updateMixing = (field: keyof ChannelMixingConfig, value: any) => {
    setChannelMixing(prev => ({ ...prev, [field]: value }))
  }

  const updateTimePriority = (rowKey: string, field: keyof TimePriorityItem, value: any) => {
    setChannelMixing(prev => ({
      ...prev,
      timePriorityList: prev.timePriorityList.map(r =>
        r.key === rowKey ? { ...r, [field]: value } : r
      ),
    }))
  }

  const totalMixingRatio = useMemo(() => {
    return channelMixing.takeawayRatio + channelMixing.supermarketRatio + channelMixing.groupBuyRatio
  }, [channelMixing.takeawayRatio, channelMixing.supermarketRatio, channelMixing.groupBuyRatio])

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
              { title: '匹配方式', dataIndex: 'method', width: 150 },
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
              { title: '匹配方式', dataIndex: 'method', width: 150 },
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
                    <div style={{ fontWeight: 600, marginBottom: 8, fontSize: 13 }}>命中商家名稱加分</div>
                    <Table<RelevanceWeightRow>
                      columns={bonusCols} dataSource={storeRelevanceWeights}
                      pagination={false} size="small" bordered
                    />
                  </div>
                  <div>
                    <div style={{ fontWeight: 600, marginBottom: 8, fontSize: 13 }}>命中商品名稱加分</div>
                    <Table<RelevanceWeightRow>
                      columns={productBonusCols} dataSource={productRelevanceWeights}
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
                  <Button type="primary" icon={<EditOutlined />} onClick={handleMixingEdit}>編輯權重</Button>
                )
              }
            >
              <div style={{ color: '#8c8c8c', fontSize: 12, marginBottom: 12 }}>
                大首頁聚合多個頻道內容時的排序與展示比例策略
              </div>

              <Card title="頻道基礎權重" size="small" style={{ marginBottom: 12 }}>
                <Form layout="inline" size="small">
                  <Form.Item label="外賣">
                    <InputNumber min={0} max={9999} disabled={!isMixingEditing} value={channelMixing.takeawayWeight} onChange={v => updateMixing('takeawayWeight', v)} />
                  </Form.Item>
                  <Form.Item label="超市">
                    <InputNumber min={0} max={9999} disabled={!isMixingEditing} value={channelMixing.supermarketWeight} onChange={v => updateMixing('supermarketWeight', v)} />
                  </Form.Item>
                  <Form.Item label="團購">
                    <InputNumber min={0} max={9999} disabled={!isMixingEditing} value={channelMixing.groupBuyWeight} onChange={v => updateMixing('groupBuyWeight', v)} />
                  </Form.Item>
                </Form>
              </Card>

              <Card title="頻道展示比例" size="small" style={{ marginBottom: 12 }}>
                <Form layout="inline" size="small">
                  <Form.Item label="外賣">
                    <InputNumber min={0} max={100} disabled={!isMixingEditing} value={channelMixing.takeawayRatio} addonAfter="%" onChange={v => updateMixing('takeawayRatio', v ?? 0)} />
                  </Form.Item>
                  <Form.Item label="超市">
                    <InputNumber min={0} max={100} disabled={!isMixingEditing} value={channelMixing.supermarketRatio} addonAfter="%" onChange={v => updateMixing('supermarketRatio', v ?? 0)} />
                  </Form.Item>
                  <Form.Item label="團購">
                    <InputNumber min={0} max={100} disabled={!isMixingEditing} value={channelMixing.groupBuyRatio} addonAfter="%" onChange={v => updateMixing('groupBuyRatio', v ?? 0)} />
                  </Form.Item>
                </Form>
                <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span>比例總和：</span>
                  <Tag color={totalMixingRatio === 100 ? 'success' : 'error'}>{totalMixingRatio}%</Tag>
                  {totalMixingRatio !== 100 && <Tag color="error" icon={<WarningOutlined />}>總和必須等於100%</Tag>}
                </div>
              </Card>

              <Card title="輪插策略" size="small" style={{ marginBottom: 12 }}>
                <Space>
                  <span>每</span>
                  <InputNumber min={1} max={99} disabled={!isMixingEditing} value={channelMixing.interleaveX} onChange={v => updateMixing('interleaveX', v ?? 1)} />
                  <span>條外賣插入</span>
                  <InputNumber min={0} max={99} disabled={!isMixingEditing} value={channelMixing.interleaveY} onChange={v => updateMixing('interleaveY', v ?? 0)} />
                  <span>條超市/</span>
                  <InputNumber min={0} max={99} disabled={!isMixingEditing} value={channelMixing.interleaveZ} onChange={v => updateMixing('interleaveZ', v ?? 0)} />
                  <span>條團購</span>
                </Space>
              </Card>

              <Card title="時段優先" size="small">
                <Table<TimePriorityItem>
                  columns={[
                    { title: '時段', dataIndex: 'timeRange', width: 160 },
                    {
                      title: '優先頻道', dataIndex: 'priorityChannel', width: 120,
                      render: (v: string) => (
                        <Tag color={v === '外賣' ? 'orange' : v === '超市' ? 'green' : 'purple'}>{v}</Tag>
                      ),
                    },
                    {
                      title: '權重加成', dataIndex: 'weightBonus', width: 140,
                      render: (v: number, r) => (
                        <InputNumber min={0} max={999} disabled={!isMixingEditing} value={v} onChange={val => updateTimePriority(r.key, 'weightBonus', val ?? 0)} />
                      ),
                    },
                  ]}
                  dataSource={channelMixing.timePriorityList}
                  pagination={false} size="small" bordered
                />
              </Card>
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
