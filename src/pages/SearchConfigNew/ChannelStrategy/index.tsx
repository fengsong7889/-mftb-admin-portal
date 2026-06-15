import { useState, useMemo } from 'react'
import {
  Tabs, Collapse, Card, Form, InputNumber, Table, Switch, Button, Space, Tag, Alert, Progress, message,
} from 'antd'
import type { TableColumnsType } from 'antd'
import { SaveOutlined, WarningOutlined } from '@ant-design/icons'

// ============================
// TypeScript 类型定义
// ============================

/** 频道类型 */
type ChannelType = 'home' | 'takeaway' | 'supermarket' | 'groupBuy'

/** 区域A：維度權重佔比 */
interface DimensionWeight {
  relevance: number
  commercial: number
  store: number
  user: number
  other: number
}

/** 区域B：粗排 - 門店/商品相關性權重行 */
interface RelevanceWeightRow {
  key: string
  method: string
  weight: number
  description: string
}

/** 区域B：其它加分項 */
interface OtherBonusItem {
  key: string
  name: string
  value: number
  description: string
}

/** 区域C1：商業維度因子 */
interface CommercialFactor {
  key: string
  factorName: string
  bonusValue: number
  bonusMethod: 'fixed' | 'weight_multiple'
  description: string
  enabled: boolean
}

/** 区域C2：店鋪維度因子 */
interface StoreFactor {
  key: string
  factorName: string
  bonusValue: number
  description: string
  enabled: boolean
}

/** 区域C3：用戶維度配置 */
interface UserDimensionConfig {
  browsedKeywordsCount: number
  browsedKeywordsWeight: number
  recentPurchaseCount: number
  recentPurchaseCoeff: number
  collectedStoreBonus: number
  frequentPurchaseBonus: number
  searchKeywordTimeWindow: number
  searchKeywordCount: number
}

/** 区域C4：其它維度配置 */
interface OtherDimensionConfig {
  distanceDecayInterval: number
  distanceDecayScore: number
  businessOpenBonus: number
  businessClosedAcceptBonus: number
  businessClosedRejectBonus: number
  primeTimeMatchBonus: number
  productAvailableBonus: number
  productUnavailableBonus: number
}

/** 大首頁：時段優先行 */
interface TimePriorityItem {
  key: string
  timeRange: string
  priorityChannel: string
  weightBonus: number
}

/** 大首頁：頻道混排優先級 */
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

/** 单个频道的完整配置 */
interface ChannelConfig {
  dimensionWeight: DimensionWeight
  storeRelevanceWeights: RelevanceWeightRow[]
  productRelevanceWeights: RelevanceWeightRow[]
  otherBonusItems: OtherBonusItem[]
  commercialFactors: CommercialFactor[]
  storeFactors: StoreFactor[]
  userDimension: UserDimensionConfig
  otherDimension: OtherDimensionConfig
  channelMixing?: ChannelMixingConfig
}

// ============================
// 默認配置數據工廠
// ============================

function createDefaultConfig(hasMixing = false): ChannelConfig {
  return {
    dimensionWeight: { relevance: 20, commercial: 30, store: 25, user: 15, other: 10 },
    storeRelevanceWeights: [
      { key: 's1', method: '分詞命中', weight: 100, description: '分詞後命中店名/標籤' },
      { key: 's2', method: '不分詞模糊匹配', weight: 60, description: '原始輸入模糊匹配' },
      { key: 's3', method: '精準匹配', weight: 200, description: '完全匹配店名' },
      { key: 's4', method: '精準匹配門店標籤', weight: 150, description: '完全匹配標籤' },
    ],
    productRelevanceWeights: [
      { key: 'p1', method: '分詞命中', weight: 100, description: '分詞後命中商品名' },
      { key: 'p2', method: '不分詞模糊匹配', weight: 60, description: '原始輸入模糊匹配' },
      { key: 'p3', method: '精準匹配', weight: 200, description: '完全匹配商品名' },
    ],
    otherBonusItems: [
      { key: 'o1', name: '匹配商品所屬類目', value: 0, description: '0為不啟用' },
      { key: 'o2', name: '匹配商品副標題/別名', value: 50, description: '' },
      { key: 'o3', name: '匹配商家別名庫', value: 30, description: '商品搜索時不計算此項' },
    ],
    commercialFactors: [
      { key: 'c1', factorName: '廣告曝光', bonusValue: 1, bonusMethod: 'weight_multiple', description: '廣告曝光權重加成', enabled: true },
      { key: 'c2', factorName: '購買熱搜詞', bonusValue: 200, bonusMethod: 'fixed', description: '購買熱搜詞固定加分', enabled: true },
      { key: 'c3', factorName: '購買關鍵字', bonusValue: 150, bonusMethod: 'fixed', description: '購買關鍵字固定加分', enabled: true },
    ],
    storeFactors: [
      { key: 'st1', factorName: '店鋪等級S', bonusValue: 100, description: 'S級店鋪加分', enabled: true },
      { key: 'st2', factorName: '店鋪等級A', bonusValue: 80, description: 'A級店鋪加分', enabled: true },
      { key: 'st3', factorName: '店鋪等級B', bonusValue: 60, description: 'B級店鋪加分', enabled: true },
      { key: 'st4', factorName: '店鋪等級C', bonusValue: 40, description: 'C級店鋪加分', enabled: true },
      { key: 'st5', factorName: '店鋪等級D', bonusValue: 20, description: 'D級店鋪加分', enabled: true },
      { key: 'st6', factorName: '店鋪口碑', bonusValue: 50, description: '口碑評分加分', enabled: true },
      { key: 'st7', factorName: '月銷量', bonusValue: 40, description: '月銷量排名加分', enabled: true },
      { key: 'st8', factorName: '日銷量', bonusValue: 30, description: '日銷量排名加分', enabled: true },
      { key: 'st9', factorName: '品牌連鎖', bonusValue: 35, description: '品牌連鎖店加分', enabled: true },
      { key: 'st10', factorName: '格價標識', bonusValue: 25, description: '格價標識加分', enabled: true },
      { key: 'st11', factorName: '至低標識', bonusValue: 25, description: '至低標識加分', enabled: true },
      { key: 'st12', factorName: '金牌店標', bonusValue: 50, description: '金牌店標加分', enabled: true },
      { key: 'st13', factorName: '獨家店標', bonusValue: 45, description: '獨家店標加分', enabled: true },
      { key: 'st14', factorName: '暗推動態加分', bonusValue: 30, description: '暗推動態加分', enabled: true },
      { key: 'st15', factorName: '超時未接單', bonusValue: -20, description: '超時未接單扣分', enabled: true },
    ],
    userDimension: {
      browsedKeywordsCount: 10,
      browsedKeywordsWeight: 50,
      recentPurchaseCount: 5,
      recentPurchaseCoeff: 1.5,
      collectedStoreBonus: 30,
      frequentPurchaseBonus: 40,
      searchKeywordTimeWindow: 30,
      searchKeywordCount: 8,
    },
    otherDimension: {
      distanceDecayInterval: 500,
      distanceDecayScore: 5,
      businessOpenBonus: 20,
      businessClosedAcceptBonus: 0,
      businessClosedRejectBonus: -50,
      primeTimeMatchBonus: 15,
      productAvailableBonus: 10,
      productUnavailableBonus: -30,
    },
    channelMixing: hasMixing ? {
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
    } : undefined,
  }
}

// ============================
// 頻道定義
// ============================
const CHANNELS: { key: ChannelType; label: string }[] = [
  { key: 'home', label: '大首頁' },
  { key: 'takeaway', label: '外賣' },
  { key: 'supermarket', label: '超市' },
  { key: 'groupBuy', label: '團購' },
]

const DIMENSION_LABELS: { key: keyof DimensionWeight; label: string }[] = [
  { key: 'relevance', label: '相關性得分佔比' },
  { key: 'commercial', label: '商業得分佔比' },
  { key: 'store', label: '店鋪得分佔比' },
  { key: 'user', label: '用戶得分佔比' },
  { key: 'other', label: '其它得分佔比' },
]

// ============================
// 主組件
// ============================

export default function ChannelStrategy() {
  const [activeChannel, setActiveChannel] = useState<ChannelType>('home')

  // 每個頻道獨立管理配置數據
  const [configs, setConfigs] = useState<Record<ChannelType, ChannelConfig>>({
    home: createDefaultConfig(true),
    takeaway: createDefaultConfig(false),
    supermarket: createDefaultConfig(false),
    groupBuy: createDefaultConfig(false),
  })

  const currentConfig = configs[activeChannel]

  // 計算維度佔比總和
  const totalWeight = useMemo(() => {
    const dw = currentConfig.dimensionWeight
    return dw.relevance + dw.commercial + dw.store + dw.user + dw.other
  }, [currentConfig.dimensionWeight])

  // 混排比例總和
  const totalRatio = useMemo(() => {
    if (!currentConfig.channelMixing) return 100
    const m = currentConfig.channelMixing
    return m.takeawayRatio + m.supermarketRatio + m.groupBuyRatio
  }, [currentConfig.channelMixing])

  // ============================
  // 通用更新輔助函數
  // ============================
  const updateConfig = (updater: (prev: ChannelConfig) => ChannelConfig) => {
    setConfigs(prev => ({
      ...prev,
      [activeChannel]: updater(prev[activeChannel]),
    }))
  }

  const updateDimensionWeight = (key: keyof DimensionWeight, value: number | null) => {
    updateConfig(prev => ({
      ...prev,
      dimensionWeight: { ...prev.dimensionWeight, [key]: value ?? 0 },
    }))
  }

  const updateStoreRelevance = (rowKey: string, value: number | null) => {
    updateConfig(prev => ({
      ...prev,
      storeRelevanceWeights: prev.storeRelevanceWeights.map(r =>
        r.key === rowKey ? { ...r, weight: value ?? 0 } : r
      ),
    }))
  }

  const updateProductRelevance = (rowKey: string, value: number | null) => {
    updateConfig(prev => ({
      ...prev,
      productRelevanceWeights: prev.productRelevanceWeights.map(r =>
        r.key === rowKey ? { ...r, weight: value ?? 0 } : r
      ),
    }))
  }

  const updateOtherBonus = (rowKey: string, value: number | null) => {
    updateConfig(prev => ({
      ...prev,
      otherBonusItems: prev.otherBonusItems.map(r =>
        r.key === rowKey ? { ...r, value: value ?? 0 } : r
      ),
    }))
  }

  const updateCommercialFactor = (rowKey: string, field: keyof CommercialFactor, value: any) => {
    updateConfig(prev => ({
      ...prev,
      commercialFactors: prev.commercialFactors.map(r =>
        r.key === rowKey ? { ...r, [field]: value } : r
      ),
    }))
  }

  const updateStoreFactor = (rowKey: string, field: keyof StoreFactor, value: any) => {
    updateConfig(prev => ({
      ...prev,
      storeFactors: prev.storeFactors.map(r =>
        r.key === rowKey ? { ...r, [field]: value } : r
      ),
    }))
  }

  const updateUserDimension = (field: keyof UserDimensionConfig, value: number | null) => {
    updateConfig(prev => ({
      ...prev,
      userDimension: { ...prev.userDimension, [field]: value ?? 0 },
    }))
  }

  const updateOtherDimension = (field: keyof OtherDimensionConfig, value: number | null) => {
    updateConfig(prev => ({
      ...prev,
      otherDimension: { ...prev.otherDimension, [field]: value ?? 0 },
    }))
  }

  const updateMixing = (field: keyof ChannelMixingConfig, value: any) => {
    updateConfig(prev => ({
      ...prev,
      channelMixing: prev.channelMixing ? { ...prev.channelMixing, [field]: value } : undefined,
    }))
  }

  const updateTimePriority = (rowKey: string, field: keyof TimePriorityItem, value: any) => {
    updateConfig(prev => ({
      ...prev,
      channelMixing: prev.channelMixing ? {
        ...prev.channelMixing,
        timePriorityList: prev.channelMixing.timePriorityList.map(r =>
          r.key === rowKey ? { ...r, [field]: value } : r
        ),
      } : undefined,
    }))
  }

  // ============================
  // 区域A：維度權重佔比
  // ============================
  const renderDimensionWeight = () => {
    const dw = currentConfig.dimensionWeight
    return (
      <div style={{ padding: '8px 0' }}>
        <Form layout="horizontal" size="small">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 16 }}>
            {DIMENSION_LABELS.map(({ key, label }) => (
              <Form.Item key={key} label={label} style={{ marginBottom: 8 }}>
                <InputNumber
                  min={0} max={100} value={dw[key]}
                  onChange={v => updateDimensionWeight(key, v)}
                  addonAfter="%"
                  style={{ width: '100%' }}
                />
              </Form.Item>
            ))}
          </div>
        </Form>

        {/* 佔比總和展示 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginTop: 8 }}>
          <span style={{ fontWeight: 500 }}>佔比總和：</span>
          <Progress
            percent={totalWeight}
            size="small"
            style={{ flex: 1, maxWidth: 300 }}
            status={totalWeight === 100 ? 'success' : 'exception'}
          />
          <span style={{ fontWeight: 600, color: totalWeight === 100 ? '#52c41a' : '#ff4d4f' }}>
            {totalWeight}%
          </span>
          {totalWeight !== 100 && (
            <Tag color="error" icon={<WarningOutlined />}>佔比總和必須等於100%</Tag>
          )}
        </div>

        {/* 評分公式說明 */}
        <Alert
          type="info"
          showIcon
          style={{ marginTop: 12 }}
          message={
            <span style={{ fontSize: 13 }}>
              最終得分 = 相關性得分×{dw.relevance}% + 商業得分×{dw.commercial}% + 店鋪得分×{dw.store}% + 用戶得分×{dw.user}% + 其它得分×{dw.other}%
            </span>
          }
        />

        <div style={{ textAlign: 'right', marginTop: 12 }}>
          <Button type="primary" icon={<SaveOutlined />} onClick={() => message.success('維度權重佔比已保存')}>保存</Button>
        </div>
      </div>
    )
  }

  // ============================
  // 区域B：粗排配置
  // ============================
  const renderCoarseRanking = () => {
    const storeCols: TableColumnsType<RelevanceWeightRow> = [
      { title: '匹配方式', dataIndex: 'method', width: 160 },
      {
        title: '權重值', dataIndex: 'weight', width: 160,
        render: (v: number, r) => (
          <InputNumber min={0} max={9999} value={v} onChange={val => updateStoreRelevance(r.key, val)} />
        ),
      },
      { title: '說明', dataIndex: 'description' },
    ]

    const productCols: TableColumnsType<RelevanceWeightRow> = [
      { title: '匹配方式', dataIndex: 'method', width: 160 },
      {
        title: '權重值', dataIndex: 'weight', width: 160,
        render: (v: number, r) => (
          <InputNumber min={0} max={9999} value={v} onChange={val => updateProductRelevance(r.key, val)} />
        ),
      },
      { title: '說明', dataIndex: 'description' },
    ]

    return (
      <div style={{ padding: '8px 0' }}>
        <Card title="門店相關性權重" size="small" style={{ marginBottom: 16 }}>
          <Table<RelevanceWeightRow>
            columns={storeCols} dataSource={currentConfig.storeRelevanceWeights}
            pagination={false} size="small" bordered
          />
        </Card>

        <Card title="商品相關性權重" size="small" style={{ marginBottom: 16 }}>
          <Table<RelevanceWeightRow>
            columns={productCols} dataSource={currentConfig.productRelevanceWeights}
            pagination={false} size="small" bordered
          />
        </Card>

        <Card title="其它加分項" size="small">
          <Form layout="horizontal" size="small">
            {currentConfig.otherBonusItems.map(item => (
              <Form.Item key={item.key} label={item.name} style={{ marginBottom: 8 }} extra={item.description || undefined}>
                <InputNumber
                  min={0} max={999999} value={item.value}
                  onChange={v => updateOtherBonus(item.key, v)}
                  style={{ width: 200 }}
                />
              </Form.Item>
            ))}
          </Form>
        </Card>

        <div style={{ textAlign: 'right', marginTop: 12 }}>
          <Button type="primary" icon={<SaveOutlined />} onClick={() => message.success('粗排配置已保存')}>保存</Button>
        </div>
      </div>
    )
  }

  // ============================
  // 区域C1：商業維度
  // ============================
  const renderCommercialTab = () => {
    const cols: TableColumnsType<CommercialFactor> = [
      { title: '因子名稱', dataIndex: 'factorName', width: 140 },
      {
        title: '加分值', dataIndex: 'bonusValue', width: 120,
        render: (v: number, r) => (
          <InputNumber min={-9999} max={9999} value={v} onChange={val => updateCommercialFactor(r.key, 'bonusValue', val ?? 0)} />
        ),
      },
      {
        title: '加分方式', dataIndex: 'bonusMethod', width: 160,
        render: (v: string, r) => (
          <Space>
            <Tag color={v === 'fixed' ? 'blue' : 'orange'}>
              {v === 'fixed' ? '固定' : '權重×倍數'}
            </Tag>
          </Space>
        ),
      },
      { title: '說明', dataIndex: 'description' },
      {
        title: '狀態', dataIndex: 'enabled', width: 80,
        render: (v: boolean, r) => (
          <Switch checked={v} size="small" onChange={val => updateCommercialFactor(r.key, 'enabled', val)} />
        ),
      },
    ]
    return (
      <Table<CommercialFactor>
        columns={cols} dataSource={currentConfig.commercialFactors}
        pagination={false} size="small" bordered
      />
    )
  }

  // ============================
  // 区域C2：店鋪維度
  // ============================
  const renderStoreTab = () => {
    const cols: TableColumnsType<StoreFactor> = [
      { title: '因子名稱', dataIndex: 'factorName', width: 160 },
      {
        title: '加分值', dataIndex: 'bonusValue', width: 140,
        render: (v: number, r) => (
          <InputNumber min={-9999} max={9999} value={v} onChange={val => updateStoreFactor(r.key, 'bonusValue', val ?? 0)} />
        ),
      },
      { title: '說明', dataIndex: 'description' },
      {
        title: '狀態', dataIndex: 'enabled', width: 80,
        render: (v: boolean, r) => (
          <Switch checked={v} size="small" onChange={val => updateStoreFactor(r.key, 'enabled', val)} />
        ),
      },
    ]
    return (
      <Table<StoreFactor>
        columns={cols} dataSource={currentConfig.storeFactors}
        pagination={false} size="small" bordered
      />
    )
  }

  // ============================
  // 区域C3：用戶維度
  // ============================
  const renderUserTab = () => {
    const ud = currentConfig.userDimension
    return (
      <Form layout="vertical" size="small" style={{ maxWidth: 600 }}>
        <Form.Item label="瀏覽過的店鋪關鍵字 — 取最新前N個">
          <Space>
            <InputNumber min={1} max={100} value={ud.browsedKeywordsCount} onChange={v => updateUserDimension('browsedKeywordsCount', v)} />
            <span>權重分</span>
            <InputNumber min={0} max={9999} value={ud.browsedKeywordsWeight} onChange={v => updateUserDimension('browsedKeywordsWeight', v)} />
          </Space>
        </Form.Item>
        <Form.Item label="最新購買過的店鋪 — 前N個">
          <Space>
            <InputNumber min={1} max={100} value={ud.recentPurchaseCount} onChange={v => updateUserDimension('recentPurchaseCount', v)} />
            <span>係數</span>
            <InputNumber min={0} max={99} step={0.1} value={ud.recentPurchaseCoeff} onChange={v => updateUserDimension('recentPurchaseCoeff', v)} />
          </Space>
        </Form.Item>
        <Form.Item label="收藏過的店鋪 — 固定加分">
          <InputNumber min={0} max={9999} value={ud.collectedStoreBonus} onChange={v => updateUserDimension('collectedStoreBonus', v)} />
        </Form.Item>
        <Form.Item label="經常購買的店鋪 — 固定加分">
          <InputNumber min={0} max={9999} value={ud.frequentPurchaseBonus} onChange={v => updateUserDimension('frequentPurchaseBonus', v)} />
        </Form.Item>
        <Form.Item label="搜索過的關鍵字">
          <Space>
            <span>時間窗口</span>
            <InputNumber min={1} max={1440} value={ud.searchKeywordTimeWindow} onChange={v => updateUserDimension('searchKeywordTimeWindow', v)} />
            <span>分鐘</span>
            <span style={{ marginLeft: 16 }}>取前</span>
            <InputNumber min={1} max={100} value={ud.searchKeywordCount} onChange={v => updateUserDimension('searchKeywordCount', v)} />
            <span>個</span>
          </Space>
        </Form.Item>
      </Form>
    )
  }

  // ============================
  // 区域C4：其它維度
  // ============================
  const renderOtherTab = () => {
    const od = currentConfig.otherDimension
    return (
      <Form layout="vertical" size="small" style={{ maxWidth: 600 }}>
        <Card title="用戶距離" size="small" style={{ marginBottom: 16 }}>
          <Space>
            <span>衰減間隔</span>
            <InputNumber min={1} max={99999} value={od.distanceDecayInterval} onChange={v => updateOtherDimension('distanceDecayInterval', v)} />
            <span>米</span>
            <span style={{ marginLeft: 16 }}>每間隔扣分</span>
            <InputNumber min={-9999} max={0} value={od.distanceDecayScore} onChange={v => updateOtherDimension('distanceDecayScore', v)} />
          </Space>
        </Card>
        <Card title="營業狀態" size="small" style={{ marginBottom: 16 }}>
          <Space direction="vertical">
            <Space>
              <span>營業中加分</span>
              <InputNumber min={-9999} max={9999} value={od.businessOpenBonus} onChange={v => updateOtherDimension('businessOpenBonus', v)} />
            </Space>
            <Space>
              <span>打烊接單加分</span>
              <InputNumber min={-9999} max={9999} value={od.businessClosedAcceptBonus} onChange={v => updateOtherDimension('businessClosedAcceptBonus', v)} />
            </Space>
            <Space>
              <span>打烊不接單加分</span>
              <InputNumber min={-9999} max={9999} value={od.businessClosedRejectBonus} onChange={v => updateOtherDimension('businessClosedRejectBonus', v)} />
            </Space>
          </Space>
        </Card>
        <Card title="時段與商品" size="small">
          <Space direction="vertical">
            <Space>
              <span>主營時段匹配加分</span>
              <InputNumber min={0} max={9999} value={od.primeTimeMatchBonus} onChange={v => updateOtherDimension('primeTimeMatchBonus', v)} />
            </Space>
            <Space>
              <span>商品可售加分</span>
              <InputNumber min={-9999} max={9999} value={od.productAvailableBonus} onChange={v => updateOtherDimension('productAvailableBonus', v)} />
            </Space>
            <Space>
              <span>商品不可售加分</span>
              <InputNumber min={-9999} max={9999} value={od.productUnavailableBonus} onChange={v => updateOtherDimension('productUnavailableBonus', v)} />
            </Space>
          </Space>
        </Card>
      </Form>
    )
  }

  // ============================
  // 区域C：精排配置
  // ============================
  const renderFineRanking = () => (
    <div style={{ padding: '8px 0' }}>
      <Tabs
        type="card"
        items={[
          { key: 'commercial', label: '商業維度', children: renderCommercialTab() },
          { key: 'store', label: '店鋪維度', children: renderStoreTab() },
          { key: 'user', label: '用戶維度', children: renderUserTab() },
          { key: 'other', label: '其它維度', children: renderOtherTab() },
        ]}
      />
      <div style={{ textAlign: 'right', marginTop: 12 }}>
        <Button type="primary" icon={<SaveOutlined />} onClick={() => message.success('精排配置已保存')}>保存</Button>
      </div>
    </div>
  )

  // ============================
  // 大首頁特殊：頻道混排優先級
  // ============================
  const renderChannelMixing = () => {
    const m = currentConfig.channelMixing
    if (!m) return <></>

    const timeCols: TableColumnsType<TimePriorityItem> = [
      { title: '時段', dataIndex: 'timeRange', width: 160 },
      {
        title: '優先頻道', dataIndex: 'priorityChannel', width: 120,
        render: (v: string, r) => (
          <Tag color={v === '外賣' ? 'orange' : v === '超市' ? 'green' : 'purple'}>{v}</Tag>
        ),
      },
      {
        title: '權重加成', dataIndex: 'weightBonus', width: 140,
        render: (v: number, r) => (
          <InputNumber min={0} max={999} value={v} onChange={val => updateTimePriority(r.key, 'weightBonus', val ?? 0)} />
        ),
      },
    ]

    return (
      <div style={{ padding: '8px 0' }}>
        <Card title="頻道基礎權重" size="small" style={{ marginBottom: 16 }}>
          <Form layout="inline" size="small">
            <Form.Item label="外賣">
              <InputNumber min={0} max={9999} value={m.takeawayWeight} onChange={v => updateMixing('takeawayWeight', v)} />
            </Form.Item>
            <Form.Item label="超市">
              <InputNumber min={0} max={9999} value={m.supermarketWeight} onChange={v => updateMixing('supermarketWeight', v)} />
            </Form.Item>
            <Form.Item label="團購">
              <InputNumber min={0} max={9999} value={m.groupBuyWeight} onChange={v => updateMixing('groupBuyWeight', v)} />
            </Form.Item>
          </Form>
        </Card>

        <Card title="頻道展示比例" size="small" style={{ marginBottom: 16 }}>
          <Form layout="inline" size="small">
            <Form.Item label="外賣">
              <InputNumber min={0} max={100} value={m.takeawayRatio} addonAfter="%" onChange={v => updateMixing('takeawayRatio', v ?? 0)} />
            </Form.Item>
            <Form.Item label="超市">
              <InputNumber min={0} max={100} value={m.supermarketRatio} addonAfter="%" onChange={v => updateMixing('supermarketRatio', v ?? 0)} />
            </Form.Item>
            <Form.Item label="團購">
              <InputNumber min={0} max={100} value={m.groupBuyRatio} addonAfter="%" onChange={v => updateMixing('groupBuyRatio', v ?? 0)} />
            </Form.Item>
          </Form>
          <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
            <span>比例總和：</span>
            <Tag color={totalRatio === 100 ? 'success' : 'error'}>{totalRatio}%</Tag>
            {totalRatio !== 100 && <Tag color="error" icon={<WarningOutlined />}>總和必須等於100%</Tag>}
          </div>
        </Card>

        <Card title="輪插策略" size="small" style={{ marginBottom: 16 }}>
          <Space>
            <span>每</span>
            <InputNumber min={1} max={99} value={m.interleaveX} onChange={v => updateMixing('interleaveX', v ?? 1)} />
            <span>條外賣插入</span>
            <InputNumber min={0} max={99} value={m.interleaveY} onChange={v => updateMixing('interleaveY', v ?? 0)} />
            <span>條超市/</span>
            <InputNumber min={0} max={99} value={m.interleaveZ} onChange={v => updateMixing('interleaveZ', v ?? 0)} />
            <span>條團購</span>
          </Space>
        </Card>

        <Card title="時段優先" size="small">
          <Table<TimePriorityItem>
            columns={timeCols} dataSource={m.timePriorityList}
            pagination={false} size="small" bordered
          />
        </Card>

        <div style={{ textAlign: 'right', marginTop: 12 }}>
          <Button type="primary" icon={<SaveOutlined />} onClick={() => message.success('頻道混排優先級已保存')}>保存</Button>
        </div>
      </div>
    )
  }

  // ============================
  // 每個頻道的Collapse面板
  // ============================
  const renderChannelContent = () => {
    const collapseItems = [
      { key: 'dimension', label: 'A. 維度權重佔比（運營調控層）', children: renderDimensionWeight() },
      { key: 'coarse', label: 'B. 粗排配置（相關性匹配層）', children: renderCoarseRanking() },
      { key: 'fine', label: 'C. 精排配置（業務加分層）', children: renderFineRanking() },
    ]

    // 大首頁額外顯示頻道混排優先級
    if (activeChannel === 'home') {
      collapseItems.push({
        key: 'mixing',
        label: 'D. 頻道混排優先級（僅大首頁）',
        children: renderChannelMixing(),
      })
    }

    return <Collapse defaultActiveKey={['dimension']} items={collapseItems} />
  }

  // ============================
  // 頁面渲染
  // ============================
  return (
    <div style={{ padding: '0 4px' }}>
      {/* 頁面描述 */}
      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
        message="統一配置各頻道的搜索排序策略，一套配置同時控制閃蜂和mFood兩個APP"
      />

      {/* 頻道Tab切換 */}
      <Tabs
        activeKey={activeChannel}
        onChange={key => setActiveChannel(key as ChannelType)}
        type="card"
        items={CHANNELS.map(ch => ({
          key: ch.key,
          label: ch.label,
          children: renderChannelContent(),
        }))}
      />
    </div>
  )
}
