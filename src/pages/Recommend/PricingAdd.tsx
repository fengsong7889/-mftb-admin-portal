import { useState } from 'react'
import { useEffect } from 'react'
import { Form, Input, InputNumber, Select, Button, Space, message, Tag, Modal, Tree, Switch, Table } from 'antd'
import { ArrowLeftOutlined, SaveOutlined, PlusOutlined, DeleteFilled, EditOutlined, UploadOutlined } from '@ant-design/icons'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  AppType, AlgorithmType, RecommendChannel, ServiceStatus,
  APP_OPTIONS, SERVICE_STATUS_OPTIONS,
} from './constants'

const CHANNEL_OPTIONS = [
  { label: '大首頁瀑布流', value: RecommendChannel.HOME },
  { label: '外賣頻道瀑布流', value: RecommendChannel.DELIVERY },
  { label: '團購頻道瀑布流', value: RecommendChannel.GROUP_BUY },
  { label: '超市頻道瀑布流', value: RecommendChannel.SUPERMARKET },
]

const ALGORITHM_OPTIONS = [
  { label: '無敵星星', value: AlgorithmType.INVINCIBLE_STAR },
  { label: '新店廣告', value: AlgorithmType.NEW_STORE_AD },
  { label: '盤活復蘇', value: AlgorithmType.HOT_REVIVE_AD },
  { label: '獨家商家', value: AlgorithmType.EXCLUSIVE_MERCHANT },
  { label: '流量廣告', value: AlgorithmType.TRAFFIC_AD },
  { label: '猜你喜歡', value: AlgorithmType.GUESS_YOU_LIKE },
  { label: '自然流量', value: AlgorithmType.ORGANIC_TRAFFIC },
  { label: '搜索算法', value: AlgorithmType.SEARCH_ALGORITHM },
]

// 商圈枚举
enum Region {
  KOKSAA = 1,
  KOLANE = 2,
  TCMACAU = 3,
  HENGQIN = 4,
}

// 商圈树形数据
const REGION_TREE = [
  {
    key: '1', title: '澳門區域', level: 1, children: [
      { key: '1-1', title: '黑沙環區', level: 2 },
      { key: '1-2', title: '氹仔區', level: 2 },
      { key: '1-3', title: '路環區', level: 2 },
    ],
  },
  {
    key: '2', title: '珠海區域', level: 1, children: [
      { key: '2-1', title: '橫琴區域', level: 2 },
    ],
  },
]

// 商圈配置接口
interface DistrictPricing {
  region: Region
  regionLabel: string
  dailyPrice: number
}

// 取消扣费梯度接口
interface CancelFeeTier {
  key: string
  remainDays: number
  ratio: number
}

// Mock 数据
interface PricingRecord {
  id: number
  app: AppType
  channel: RecommendChannel
  slotIndex: number
  algorithmType: AlgorithmType
  region: string
  dailyPrice: number
  minDays: number
  discountTiers: string
  status: ServiceStatus
  districtPricings?: DistrictPricing[]
}

const mockData: PricingRecord[] = [
  { id: 1, app: AppType.SHANFENG, channel: RecommendChannel.HOME, slotIndex: 1, algorithmType: AlgorithmType.INVINCIBLE_STAR, region: '澳門', dailyPrice: 2800, minDays: 7, discountTiers: '7天9折 / 30天8折', status: ServiceStatus.ENABLED },
  { id: 2, app: AppType.SHANFENG, channel: RecommendChannel.DELIVERY, slotIndex: 1, algorithmType: AlgorithmType.GUESS_YOU_LIKE, region: '氹仔', dailyPrice: 1800, minDays: 3, discountTiers: '7天9折', status: ServiceStatus.ENABLED },
  { id: 3, app: AppType.MFOOD, channel: RecommendChannel.SUPERMARKET, slotIndex: 2, algorithmType: AlgorithmType.TRAFFIC_AD, region: '珠海', dailyPrice: 1200, minDays: 1, discountTiers: '30天75折', status: ServiceStatus.ENABLED },
  { id: 4, app: AppType.SHANFENG, channel: RecommendChannel.HOME, slotIndex: 2, algorithmType: AlgorithmType.NEW_STORE_AD, region: '澳門', dailyPrice: 2500, minDays: 7, discountTiers: '7天9折 / 30天85折', status: ServiceStatus.ENABLED },
  {
    id: 5, app: AppType.MFOOD, channel: RecommendChannel.GROUP_BUY, slotIndex: 1, algorithmType: AlgorithmType.HOT_REVIVE_AD, region: '仔', dailyPrice: 1500, minDays: 5, discountTiers: '15天8折', status: ServiceStatus.ENABLED,
    districtPricings: [
      { region: Region.KOKSAA, regionLabel: '黑沙環區', dailyPrice: 100 },
      { region: Region.KOLANE, regionLabel: '氹仔區', dailyPrice: 120 },
    ]
  },
  { id: 6, app: AppType.SHANFENG, channel: RecommendChannel.DELIVERY, slotIndex: 3, algorithmType: AlgorithmType.EXCLUSIVE_MERCHANT, region: '澳門', dailyPrice: 2200, minDays: 7, discountTiers: '30天8折', status: ServiceStatus.DISABLED },
  { id: 7, app: AppType.MFOOD, channel: RecommendChannel.HOME, slotIndex: 3, algorithmType: AlgorithmType.ORGANIC_TRAFFIC, region: '珠海', dailyPrice: 800, minDays: 1, discountTiers: '无折扣', status: ServiceStatus.ENABLED },
  { id: 8, app: AppType.SHANFENG, channel: RecommendChannel.SUPERMARKET, slotIndex: 1, algorithmType: AlgorithmType.SEARCH_ALGORITHM, region: '澳門', dailyPrice: 1600, minDays: 3, discountTiers: '7天9折', status: ServiceStatus.ENABLED },
  { id: 9, app: AppType.MFOOD, channel: RecommendChannel.DELIVERY, slotIndex: 2, algorithmType: AlgorithmType.INVINCIBLE_STAR, region: '氹仔', dailyPrice: 2000, minDays: 7, discountTiers: '15天85折 / 30天75折', status: ServiceStatus.ENABLED },
  { id: 10, app: AppType.SHANFENG, channel: RecommendChannel.GROUP_BUY, slotIndex: 2, algorithmType: AlgorithmType.TRAFFIC_AD, region: '澳門', dailyPrice: 1400, minDays: 5, discountTiers: '30天8折', status: ServiceStatus.ENABLED },
  { id: 11, app: AppType.MFOOD, channel: RecommendChannel.HOME, slotIndex: 4, algorithmType: AlgorithmType.GUESS_YOU_LIKE, region: '珠海', dailyPrice: 2600, minDays: 7, discountTiers: '7天9折 / 30天8折', status: ServiceStatus.ENABLED },
  { id: 12, app: AppType.SHANFENG, channel: RecommendChannel.SUPERMARKET, slotIndex: 3, algorithmType: AlgorithmType.NEW_STORE_AD, region: '澳門', dailyPrice: 1100, minDays: 3, discountTiers: '15天85折', status: ServiceStatus.DISABLED },
  {
    id: 13, app: AppType.MFOOD, channel: RecommendChannel.GROUP_BUY, slotIndex: 3, algorithmType: AlgorithmType.HOT_REVIVE_AD, region: '氹仔', dailyPrice: 1300, minDays: 5, discountTiers: '30天75折', status: ServiceStatus.ENABLED,
    districtPricings: [
      { region: Region.TCMACAU, regionLabel: '路環區', dailyPrice: 80 },
    ]
  },
  { id: 14, app: AppType.SHANFENG, channel: RecommendChannel.HOME, slotIndex: 5, algorithmType: AlgorithmType.EXCLUSIVE_MERCHANT, region: '澳門', dailyPrice: 3000, minDays: 7, discountTiers: '15天8折 / 30天7折', status: ServiceStatus.ENABLED },
  { id: 15, app: AppType.MFOOD, channel: RecommendChannel.DELIVERY, slotIndex: 4, algorithmType: AlgorithmType.SEARCH_ALGORITHM, region: '珠海', dailyPrice: 1700, minDays: 3, discountTiers: '7天9折', status: ServiceStatus.ENABLED },
]

export default function PricingAdd() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const editId = searchParams.get('id') || ''
  const modeParam = searchParams.get('mode') || ''
  const isDetailMode = modeParam === 'detail'
  const isEditMode = !!editId && !isDetailMode

  const [form] = Form.useForm()
  const [algorithmType, setAlgorithmType] = useState<AlgorithmType | undefined>(undefined)

  // 商圈配置（盘活复苏专用）
  const [districtPricings, setDistrictPricings] = useState<DistrictPricing[]>([])
  const [regionSelectModalVisible, setRegionSelectModalVisible] = useState(false)
  const [selectedRegionNode, setSelectedRegionNode] = useState<{ key: string; title: string; level: number } | null>(null)
  const [replacingRegion, setReplacingRegion] = useState<Region | null>(null)

  // 购买多天折扣开关
  const [discountEnabled, setDiscountEnabled] = useState(false)

  // 取消订单扣费梯度
  const [cancelFeeTiers, setCancelFeeTiers] = useState<CancelFeeTier[]>([
    { key: '1', remainDays: 0, ratio: 100 },
    { key: '2', remainDays: 3, ratio: 80 },
  ])

  // 是否为盘活复苏
  const isReviveAlgorithm = algorithmType === AlgorithmType.HOT_REVIVE_AD

  // 加载数据
  useEffect(() => {
    if (editId) {
      const record = mockData.find(item => item.id === Number(editId))
      if (record) {
        form.setFieldsValue({
          app: record.app,
          channel: record.channel,
          slotIndex: record.slotIndex,
          algorithmType: record.algorithmType,
          region: record.region,
          dailyPrice: record.dailyPrice,
          minDays: record.minDays,
          discountTiers: record.discountTiers,
          status: record.status,
        })
        setAlgorithmType(record.algorithmType)
        if (record.districtPricings) {
          setDistrictPricings(record.districtPricings)
        }
      }
    }
  }, [editId, form])

  const pageTitle = isDetailMode
    ? '價格詳情'
    : isEditMode
      ? '編輯價格'
      : '新增定價'

  const handleSave = () => {
    form.validateFields().then(() => {
      if (isReviveAlgorithm && districtPricings.length === 0) {
        message.warning('請至少添加一個商圈計價配置')
        return
      }
      message.success('保存成功')
      navigate('/recommend-pricing')
    })
  }

  // 商圈配置操作
  const handleAddDistrict = () => {
    if (!selectedRegionNode || selectedRegionNode.level !== 2) {
      message.warning('請選擇一個商圈')
      return
    }
    const regionKey = selectedRegionNode.key
    const regionLabel = selectedRegionNode.title
    const regionMap: Record<string, Region> = {
      '1-1': Region.KOKSAA,
      '1-2': Region.KOLANE,
      '1-3': Region.TCMACAU,
      '2-1': Region.HENGQIN,
    }
    const region = regionMap[regionKey]

    if (replacingRegion) {
      setDistrictPricings(prev => prev.map(d =>
        d.region === replacingRegion ? { ...d, region, regionLabel } : d
      ))
      setReplacingRegion(null)
    } else {
      if (districtPricings.some(d => d.region === region)) {
        message.warning('該商圈已添加計價配置')
        return
      }
      setDistrictPricings(prev => [...prev, { region, regionLabel, dailyPrice: 0 }])
    }
    setRegionSelectModalVisible(false)
    setSelectedRegionNode(null)
  }

  const handleRemoveDistrict = (region: Region) => {
    if (districtPricings.length === 1) {
      Modal.confirm({
        title: '確認刪除',
        content: '這是最後一個商圈配置，刪除後需要重新添加商圈。是否繼續？',
        onOk: () => setDistrictPricings([]),
      })
      return
    }
    setDistrictPricings(prev => prev.filter(d => d.region !== region))
  }

  const handleReplaceDistrict = (region: Region) => {
    setReplacingRegion(region)
    setSelectedRegionNode(null)
    setRegionSelectModalVisible(true)
  }

  const handleUpdateDistrictPrice = (region: Region, price: number) => {
    setDistrictPricings(prev => prev.map(d =>
      d.region === region ? { ...d, dailyPrice: price } : d
    ))
  }

  // 取消扣费操作
  const handleAddCancelTier = () => {
    setCancelFeeTiers(prev => [...prev, { key: String(Date.now()), remainDays: 0, ratio: 100 }])
  }

  const handleRemoveCancelTier = (key: string) => {
    setCancelFeeTiers(prev => prev.filter(t => t.key !== key))
  }

  const handleUpdateCancelTier = (key: string, field: 'remainDays' | 'ratio', value: number) => {
    setCancelFeeTiers(prev => prev.map(t =>
      t.key === key ? { ...t, [field]: value } : t
    ))
  }

  // 取消扣费表格列
  const cancelFeeColumns = [
    {
      title: '廣告推廣',
      dataIndex: 'remainDays',
      render: (_: any, record: CancelFeeTier) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span>剩餘天數 ≤</span>
          <InputNumber
            size="small"
            min={0}
            value={record.remainDays}
            onChange={(v) => handleUpdateCancelTier(record.key, 'remainDays', v || 0)}
            style={{ width: 80 }}
            disabled={isDetailMode}
          />
          <span>天</span>
        </div>
      ),
    },
    {
      title: '比例配置',
      dataIndex: 'ratio',
      render: (_: any, record: CancelFeeTier) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <InputNumber
            size="small"
            min={0}
            max={100}
            value={record.ratio}
            onChange={(v) => handleUpdateCancelTier(record.key, 'ratio', v || 0)}
            style={{ width: 120 }}
            disabled={isDetailMode}
          />
          <span>%</span>
        </div>
      ),
    },
    {
      title: '操作',
      key: 'action',
      width: 160,
      render: (_: any, record: CancelFeeTier) => (
        <Space>
          <Button
            type="link"
            size="small"
            icon={<PlusOutlined />}
            onClick={handleAddCancelTier}
            disabled={isDetailMode}
            style={{ color: '#E8720C' }}
          >
            新增梯度
          </Button>
          <Button
            type="link"
            size="small"
            danger
            onClick={() => handleRemoveCancelTier(record.key)}
            disabled={isDetailMode}
          >
            刪除
          </Button>
        </Space>
      ),
    },
  ]

  return (
    <div className="content-area">
      {/* 页面标题 */}
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
          justifyContent: 'space-between',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <Button type="primary" icon={<ArrowLeftOutlined />}
              onClick={() => navigate('/recommend-pricing')}
              style={{
                backgroundColor: '#E8720C', borderColor: '#E8720C',
                borderRadius: 8, height: 36, padding: '0 16px',
                display: 'flex', alignItems: 'center', gap: 6,
              }}>返回</Button>
            <div style={{ width: 1, height: 20, background: '#E8E8E8' }} />
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#1890ff' }}>{pageTitle}</h2>
              {isReviveAlgorithm && <span style={{ fontSize: 14 }}>🔥 盤活復蘇</span>}
            </div>
          </div>
          {!isDetailMode && (
            <Button type="primary" icon={<SaveOutlined />} onClick={handleSave}
              style={{
                backgroundColor: '#E8720C', borderColor: '#E8720C',
                borderRadius: 8, height: 36, padding: '0 18px',
              }}>保存</Button>
          )}
        </div>
      </div>

      <Form
        form={form}
        layout="vertical"
        disabled={isDetailMode}
      >
        {/* 基础信息 */}
        <div style={{
          borderLeft: '4px solid #1890FF', borderRadius: 10,
          background: '#fff', padding: '20px 24px', marginBottom: 16,
          boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
            <div style={{ width: 28, height: 28, borderRadius: 6, background: '#E6F7FF', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span style={{ fontSize: 14 }}>📋</span>
            </div>
            <span style={{ fontSize: 15, fontWeight: 600, color: '#262626' }}>基礎信息</span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0 24px' }}>
            <Form.Item
              label={<span><span style={{ color: 'red' }}>* </span>算法名稱</span>}
              name="algorithmType"
              rules={[{ required: true, message: '請選擇算法' }]}
            >
              <Select
                placeholder="請選擇算法"
                options={ALGORITHM_OPTIONS}
                onChange={(value) => {
                  setAlgorithmType(value)
                  if (value !== AlgorithmType.HOT_REVIVE_AD) {
                    setDistrictPricings([])
                  }
                }}
              />
            </Form.Item>

            <Form.Item
              label={<span><span style={{ color: 'red' }}>* </span>所屬品牌</span>}
              name="app"
              rules={[{ required: true, message: '請選擇所屬品牌' }]}
            >
              <Select placeholder="請選擇所屬品牌" options={APP_OPTIONS} />
            </Form.Item>

            <Form.Item
              label={<span><span style={{ color: 'red' }}>* </span>業務頻道</span>}
              name="channel"
              rules={[{ required: true, message: '請選擇業務頻道' }]}
            >
              <Select placeholder="請選擇業務頻道" options={CHANNEL_OPTIONS} />
            </Form.Item>
          </div>

          <Form.Item label="詳情圖" style={{ marginBottom: 0 }}>
            <div style={{
              width: 120, height: 120, border: '1px dashed #d9d9d9', borderRadius: 8,
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', color: '#999', fontSize: 12,
            }}>
              <PlusOutlined style={{ fontSize: 20, marginBottom: 4 }} />
              <span>上傳詳情圖</span>
            </div>
          </Form.Item>
        </div>

        {/* 销售策略 */}
        <div style={{
          borderLeft: '4px solid #E8720C', borderRadius: 10,
          background: '#fff', padding: '20px 24px', marginBottom: 16,
          boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
            <div style={{ width: 28, height: 28, borderRadius: 6, background: '#FFF7E6', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span style={{ fontSize: 14 }}>📊</span>
            </div>
            <span style={{ fontSize: 15, fontWeight: 600, color: '#262626' }}>銷售策略</span>
            <Tag color="orange" style={{ marginLeft: 4, fontSize: 11 }}>策略配置</Tag>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ fontSize: 14, color: '#595959', minWidth: 80 }}>預售天數:</span>
              <Form.Item name="minDays" style={{ marginBottom: 0 }}>
                <InputNumber min={1} max={30} style={{ width: 100 }} addonAfter="天" />
              </Form.Item>
              <span style={{ fontSize: 12, color: '#8c8c8c' }}>系統持續銷售 7 天內的廣告，每過一天自動補充一天，循環銷售</span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ fontSize: 14, color: '#595959', minWidth: 80 }}>屏蔽商家:</span>
              <Form.Item name="status" style={{ marginBottom: 0 }}>
                <Switch
                  checkedChildren="屏蔽"
                  unCheckedChildren="不屏蔽"
                  defaultChecked={false}
                />
              </Form.Item>
              <span style={{ fontSize: 12, color: '#8c8c8c' }}>被屏蔽的商家，無法購買該算法廣告，並且商家在購買界面無法查詢到該算法，對商家不可見。</span>
            </div>
          </div>
        </div>

        {/* 盘活复苏：購買多天折扣配置（梯度） */}
        {isReviveAlgorithm && (
          <div style={{
            borderLeft: '4px solid #722ED1', borderRadius: 10,
            background: '#fff', padding: '20px 24px', marginBottom: 16,
            boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
              <div style={{ width: 28, height: 28, borderRadius: 6, background: '#F9F0FF', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <span style={{ fontSize: 14 }}>🎯</span>
              </div>
              <span style={{ fontSize: 15, fontWeight: 600, color: '#262626' }}>購買多天折扣配置（梯度）</span>
              <Switch
                checked={discountEnabled}
                onChange={setDiscountEnabled}
                style={{ marginLeft: 8 }}
              />
              <span style={{ fontSize: 12, color: '#8c8c8c' }}>購買多天時匹配以下折扣</span>
            </div>
            {discountEnabled && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 24px' }}>
                <Form.Item
                  label="最低購買天數"
                  name="minDays"
                  rules={[{ required: true, message: '請輸入最低購買天數' }]}
                >
                  <InputNumber placeholder="請輸入" min={1} style={{ width: '100%' }} addonAfter="天" />
                </Form.Item>
                <Form.Item
                  label="折扣階梯"
                  name="discountTiers"
                >
                  <Input placeholder="如：7天9折 / 15天8折 / 30天75折" />
                </Form.Item>
              </div>
            )}
          </div>
        )}
        
        {/* 盘活复苏：商圈计价配置 */}
        {isReviveAlgorithm && (
          <div style={{
            borderLeft: '4px solid #722ED1', borderRadius: 10,
            background: '#fff', padding: '20px 24px', marginBottom: 16,
            boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
              <div style={{ width: 28, height: 28, borderRadius: 6, background: '#F9F0FF', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <span style={{ fontSize: 14 }}>🏪</span>
              </div>
              <span style={{ fontSize: 15, fontWeight: 600, color: '#262626' }}>商圈計價配置</span>
              <Tag color="purple" style={{ marginLeft: 4, fontSize: 11 }}>分區定價</Tag>
              <div style={{ flex: 1, height: 1, background: '#f0f0f0', marginLeft: 8 }} />
              <Button
                type="primary"
                size="small"
                icon={<PlusOutlined />}
                onClick={() => {
                  setSelectedRegionNode(null)
                  setReplacingRegion(null)
                  setRegionSelectModalVisible(true)
                }}
                style={{ borderRadius: 6, backgroundColor: '#722ED1', borderColor: '#722ED1' }}
              >
                選擇商圈
              </Button>
            </div>
            {districtPricings.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 40, color: '#8c8c8c', fontSize: 13 }}>
                請選擇商圈並點擊“新增”按鈕添加計價配置
              </div>
            ) : (
              districtPricings.map((config) => (
                <div key={config.region} style={{ marginBottom: 16, padding: 16, background: '#fafafa', borderRadius: 6 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                    <Tag color="cyan" style={{ fontSize: 14, padding: '4px 12px' }}>
                      {config.regionLabel}
                    </Tag>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <Button
                        type="text"
                        icon={<EditOutlined style={{ fontSize: 14, color: '#1890FF' }} />}
                        onClick={() => handleReplaceDistrict(config.region)}
                        style={{ fontSize: 12, color: '#1890FF', padding: '2px 6px' }}
                      >
                        更換
                      </Button>
                      <Button
                        type="text"
                        danger
                        icon={<DeleteFilled style={{ fontSize: 14 }} />}
                        onClick={() => handleRemoveDistrict(config.region)}
                        style={{ fontSize: 12, padding: '2px 6px' }}
                      >
                        刪除
                      </Button>
                    </div>
                  </div>
                  <Form.Item
                    label="每天售價"
                    style={{ marginBottom: 0, maxWidth: 500 }}
                  >
                    <InputNumber
                      min={0}
                      precision={2}
                      placeholder="請輸入每天售價"
                      style={{ width: '100%' }}
                      addonAfter="MOP/天"
                      value={config.dailyPrice}
                      onChange={(value) => handleUpdateDistrictPrice(config.region, value || 0)}
                    />
                  </Form.Item>
                </div>
              ))
            )}
          </div>
        )}

        {/* 非盘活复苏：区域和单日单价 */}
        {!isReviveAlgorithm && (
          <div style={{
            borderLeft: '4px solid #722ED1', borderRadius: 10,
            background: '#fff', padding: '20px 24px', marginBottom: 16,
            boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
              <div style={{ width: 28, height: 28, borderRadius: 6, background: '#F9F0FF', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <span style={{ fontSize: 14 }}>💰</span>
              </div>
              <span style={{ fontSize: 15, fontWeight: 600, color: '#262626' }}>價格配置</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 24px' }}>
              <Form.Item
                label="區域"
                name="region"
                rules={[{ required: true, message: '請輸入區域' }]}
              >
                <Input placeholder="請輸入區域" />
              </Form.Item>
              <Form.Item
                label="單日單價 (MOP)"
                name="dailyPrice"
                rules={[{ required: true, message: '請輸入單日單價' }]}
              >
                <InputNumber placeholder="請輸入" min={0} style={{ width: '100%' }} addonAfter="MOP" />
              </Form.Item>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 24px' }}>
              <Form.Item
                label="最低購買天數"
                name="minDays"
                rules={[{ required: true, message: '請輸入最低購買天數' }]}
              >
                <InputNumber placeholder="請輸入" min={1} style={{ width: '100%' }} addonAfter="天" />
              </Form.Item>
              <Form.Item
                label="折扣階梯"
                name="discountTiers"
              >
                <Input placeholder="如：7天9折 / 30天8折" />
              </Form.Item>
            </div>
          </div>
        )}

        {/* 取消订单，扣费配置 */}
        <div style={{
          borderLeft: '4px solid #F5222D', borderRadius: 10,
          background: '#fff', padding: '20px 24px', marginBottom: 16,
          boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
            <div style={{ width: 28, height: 28, borderRadius: 6, background: '#FFF1F0', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span style={{ fontSize: 14 }}>⚙️</span>
            </div>
            <span style={{ fontSize: 15, fontWeight: 600, color: '#262626' }}>取消訂單，扣費配置</span>
            <span style={{ fontSize: 12, color: '#8c8c8c', marginLeft: 8 }}>當剩餘天數沒有匹配到規則，取消則不扣費</span>
          </div>

          <Table
            dataSource={cancelFeeTiers}
            columns={cancelFeeColumns}
            pagination={false}
            size="middle"
            rowKey="key"
            style={{ marginBottom: 12 }}
          />
        </div>
      </Form>

      {/* 商圈选择弹窗 */}
      <Modal
        title={replacingRegion ? '更換商圈' : '選擇商圈'}
        open={regionSelectModalVisible}
        onCancel={() => {
          setRegionSelectModalVisible(false)
          setSelectedRegionNode(null)
          setReplacingRegion(null)
        }}
        onOk={handleAddDistrict}
        okText={replacingRegion ? '確認更換' : '確認添加'}
        cancelText="取消"
      >
        <Tree
          treeData={REGION_TREE}
          selectedKeys={selectedRegionNode ? [selectedRegionNode.key] : []}
          onSelect={(keys, info) => {
            const node = info.node as unknown as { key: string; title: string; level: number }
            if (node.level === 2) {
              setSelectedRegionNode(node)
            } else {
              message.warning('請選擇具體的商圈，而非區域')
            }
          }}
          style={{ marginTop: 16 }}
        />
        {selectedRegionNode && (
          <div style={{ marginTop: 12, padding: '8px 12px', background: '#f6ffed', borderRadius: 6, border: '1px solid #b7eb8f' }}>
            <span style={{ color: '#52c41a', fontSize: 13 }}>已選擇：</span>
            <span style={{ fontWeight: 600, color: '#262626' }}>{selectedRegionNode.title}</span>
          </div>
        )}
      </Modal>
    </div>
  )
}
