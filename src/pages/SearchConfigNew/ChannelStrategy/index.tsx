import { useState } from 'react'
import {
  Tabs, Collapse, Card, Form, InputNumber, Table, Switch, Button, Space, Tag, Alert, message,
} from 'antd'
import type { TableColumnsType } from 'antd'
import { SaveOutlined } from '@ant-design/icons'

// ============================
// TypeScript 类型定义
// ============================

/** 频道类型（業務頻道，大首頁無精排權重配置，故不在此列） */
type ChannelType = 'takeaway' | 'supermarket' | 'groupBuy'

/** 区域B1：商業維度因子 */
interface CommercialFactor {
  key: string
  factorName: string
  bonusValue: number
  bonusMethod: 'fixed' | 'weight_multiple'
  description: string
  enabled: boolean
}

/** 区域B2：店鋪維度因子 */
interface StoreFactor {
  key: string
  factorName: string
  bonusValue: number
  description: string
  enabled: boolean
}

/** 区域B3：用戶維度配置 */
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

/** 区域B4：平台維度配置 */
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

/** 单个频道的完整配置 */
interface ChannelConfig {
  commercialFactors: CommercialFactor[]
  storeFactors: StoreFactor[]
  userDimension: UserDimensionConfig
  otherDimension: OtherDimensionConfig
}

// ============================
// 默認配置數據工廠
// ============================

function createDefaultConfig(): ChannelConfig {
  return {
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
  }
}

// ============================
// 頻道定義
// ============================
const CHANNELS: { key: ChannelType; label: string }[] = [
  { key: 'takeaway', label: '外賣' },
  { key: 'groupBuy', label: '團購' },
  { key: 'supermarket', label: '超市' },
]

// ============================
// 主組件
// ============================

export default function ChannelStrategy() {
  const [activeChannel, setActiveChannel] = useState<ChannelType>('takeaway')

  // 每個頻道獨立管理配置數據
  const [configs, setConfigs] = useState<Record<ChannelType, ChannelConfig>>({
    takeaway: createDefaultConfig(),
    supermarket: createDefaultConfig(),
    groupBuy: createDefaultConfig(),
  })

  const currentConfig = configs[activeChannel]

  // ============================
  // 通用更新輔助函數
  // ============================
  const updateConfig = (updater: (prev: ChannelConfig) => ChannelConfig) => {
    setConfigs(prev => ({
      ...prev,
      [activeChannel]: updater(prev[activeChannel]),
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

  // ============================
  // 区域B1：商業維度
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
  // 区域B2：店鋪維度
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
  // 区域B3：用戶維度
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
  // 区域C4：平台維度
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
  // 区域B：精排配置
  // ============================
  const renderFineRanking = () => (
    <div style={{ padding: '8px 0' }}>
      <Tabs
        type="card"
        items={[
          { key: 'commercial', label: '商業維度', children: renderCommercialTab() },
          { key: 'store', label: '店鋪維度', children: renderStoreTab() },
          { key: 'user', label: '用戶維度', children: renderUserTab() },
          { key: 'other', label: '平台維度', children: renderOtherTab() },
        ]}
      />
      <div style={{ textAlign: 'right', marginTop: 12 }}>
        <Button type="primary" icon={<SaveOutlined />} onClick={() => message.success('精排配置已保存')}>保存</Button>
      </div>
    </div>
  )

  // ============================
  // 每個頻道的Collapse面板
  // ============================
  const renderChannelContent = () => {
    const collapseItems = [
      { key: 'fine', label: 'A. 精排配置（業務加分層）', children: renderFineRanking() },
    ]

    return <Collapse defaultActiveKey={['fine']} items={collapseItems} />
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
