import { useState, useMemo } from 'react'
import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Form, Input, InputNumber, Select, Button, Space, message, Tag, Modal, Tree, Switch, Table, Card } from 'antd'
import {
  ArrowLeftOutlined,
  SaveOutlined,
  PlusOutlined,
  DeleteFilled,
  EditOutlined,
  AppstoreOutlined,
  SettingOutlined,
} from '@ant-design/icons'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  AppType, AlgorithmType, RecommendChannel, ServiceStatus,
  APP_OPTIONS,
  REGION_TREE_DATA,
} from './constants'

const CHANNEL_OPTIONS = [
  { labelKey: 'recommend.channelHomeWaterfall', value: RecommendChannel.HOME },
  { labelKey: 'recommend.channelDeliveryWaterfall', value: RecommendChannel.DELIVERY },
  { labelKey: 'recommend.channelGroupBuyWaterfall', value: RecommendChannel.GROUP_BUY },
  { labelKey: 'recommend.channelSupermarketWaterfall', value: RecommendChannel.SUPERMARKET },
]

const ALGORITHM_OPTIONS = [
  { labelKey: 'recommend.algoInvincibleStar', value: AlgorithmType.INVINCIBLE_STAR },
  { labelKey: 'recommend.algoNewStoreAd', value: AlgorithmType.NEW_STORE_AD },
  { labelKey: 'recommend.algoHotReviveAd', value: AlgorithmType.HOT_REVIVE_AD },
  { labelKey: 'recommend.algoExclusiveMerchant', value: AlgorithmType.EXCLUSIVE_MERCHANT },
  { labelKey: 'recommend.algoTrafficAd', value: AlgorithmType.TRAFFIC_AD },
  { labelKey: 'recommend.algoGuessYouLike', value: AlgorithmType.GUESS_YOU_LIKE },
  { labelKey: 'recommend.algoOrganicTraffic', value: AlgorithmType.ORGANIC_TRAFFIC },
]

// 商圈枚举
enum Region {
  KOKSAA = 1,
  KOLANE = 2,
  TCMACAU = 3,
  HENGQIN = 4,
}

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
  { id: 8, app: AppType.SHANFENG, channel: RecommendChannel.SUPERMARKET, slotIndex: 1, algorithmType: AlgorithmType.GUESS_YOU_LIKE, region: '澳門', dailyPrice: 1600, minDays: 3, discountTiers: '7天9折', status: ServiceStatus.ENABLED },
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
  { id: 15, app: AppType.MFOOD, channel: RecommendChannel.DELIVERY, slotIndex: 4, algorithmType: AlgorithmType.GUESS_YOU_LIKE, region: '珠海', dailyPrice: 1700, minDays: 3, discountTiers: '7天9折', status: ServiceStatus.ENABLED },
]

export default function PricingAdd() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const editId = searchParams.get('id') || ''
  const modeParam = searchParams.get('mode') || ''
  const isDetailMode = modeParam === 'detail'
  const isEditMode = !!editId && !isDetailMode

  /** 翻譯後的商圈樹形數據 */
  const regionTreeData = useMemo(() => REGION_TREE_DATA.map(area => ({
    key: String(area.value), title: t(area.titleKey), level: 1,
    children: (area.children ?? []).map(c => ({ key: `${area.value}-${c.value}`, title: t(c.titleKey), level: 2 })),
  })), [t])

  const tAlgoOptions = useMemo(() => ALGORITHM_OPTIONS.map(o => ({ label: t(o.labelKey), value: o.value })), [t])
  const tChannelOptions = useMemo(() => CHANNEL_OPTIONS.map(o => ({ label: t(o.labelKey), value: o.value })), [t])
  const tAppOptions = useMemo(() => APP_OPTIONS.map(o => ({ label: t(o.labelKey), value: o.value })), [t])

  const [form] = Form.useForm()
  const [algorithmType, setAlgorithmType] = useState<AlgorithmType | undefined>(undefined)

  // 商圈配置（盘活复苏专用）
  const [districtPricings, setDistrictPricings] = useState<DistrictPricing[]>([])
  const [regionSelectModalVisible, setRegionSelectModalVisible] = useState(false)
  const [selectedRegionNode, setSelectedRegionNode] = useState<{ key: string; title: string; level: number } | null>(null)
  const [replacingRegion, setReplacingRegion] = useState<Region | null>(null)

  // 购买多天折扣开关
  const [discountEnabled, setDiscountEnabled] = useState(false)

  // 退款开关
  const [refundEnabled, setRefundEnabled] = useState(false)

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
    ? t('recommend.pricingDetail')
    : isEditMode
      ? t('recommend.editPrice')
      : t('recommend.addPricing')

  const handleSave = () => {
    form.validateFields().then(() => {
      if (isReviveAlgorithm && districtPricings.length === 0) {
        message.warning(t('recommend.pleaseAddDistrictConfig'))
        return
      }
      message.success(t('common:saveSuccess'))
      navigate('/recommend-pricing')
    })
  }

  // 商圈配置操作
  const handleAddDistrict = () => {
    if (!selectedRegionNode || selectedRegionNode.level !== 2) {
      message.warning(t('recommend.selectADistrict'))
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
        message.warning(t('recommend.districtAlreadyAdded'))
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
        title: t('common:confirmDelete'),
        content: t('recommend.confirmDeleteLastDistrict'),
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
      title: t('recommend.adPromotionCol'),
      dataIndex: 'remainDays',
      render: (_: unknown, record: CancelFeeTier) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span>{t('recommend.remainingDaysLE')}</span>
          <InputNumber
            size="small"
            min={0}
            value={record.remainDays}
            onChange={(v) => handleUpdateCancelTier(record.key, 'remainDays', v || 0)}
            style={{ width: 80 }}
            disabled={isDetailMode}
          />
          <span>{t('recommend:dayUnit')}</span>
        </div>
      ),
    },
    {
      title: t('recommend.ratioConfigCol'),
      dataIndex: 'ratio',
      render: (_: unknown, record: CancelFeeTier) => (
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
      title: t('common:action'),
      key: 'action',
      width: 160,
      render: (_: unknown, record: CancelFeeTier) => (
        <Space>
          <Button
            type="link"
            size="small"
            
            onClick={handleAddCancelTier}
            disabled={isDetailMode}
            style={{ color: '#E8720C' }}
          >
            {t('common:add')}
          </Button>
          <Button
            type="link"
            size="small"
            danger
            onClick={() => handleRemoveCancelTier(record.key)}
            disabled={isDetailMode}
          >
            {t('common:delete')}
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
          justifyContent: 'space-between', animation: 'headerFadeSlideIn 0.5s ease',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <Button type="primary" icon={<ArrowLeftOutlined />}
              onClick={() => navigate('/recommend-pricing')}
              style={{
                backgroundColor: '#E8720C', borderColor: '#E8720C',
                borderRadius: 8, height: 36, padding: '0 16px',
                display: 'flex', alignItems: 'center', gap: 6,
                boxShadow: '0 2px 6px rgba(232,114,12,0.25)',
                transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
              }}>{t('common:back')}</Button>
            <div style={{ width: 1, height: 20, background: '#E8E8E8' }} />
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#1890ff' }}>{pageTitle}</h2>
              {isReviveAlgorithm && (
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  padding: '3px 12px', background: '#FFF7E6',
                  border: '1px solid #FFD591', borderRadius: 4,
                  fontSize: 13, color: '#E8720C', fontWeight: 500,
                }}>
                  <span style={{ fontSize: 14 }}>🔥</span>
                  {t('recommend.algoHotReviveAd')}
                </div>
              )}
            </div>
          </div>
          {!isDetailMode && (
            <Button type="primary" icon={<SaveOutlined />} onClick={handleSave}
              style={{
                backgroundColor: '#E8720C', borderColor: '#E8720C',
                borderRadius: 8, height: 36, padding: '0 18px',
                boxShadow: '0 2px 6px rgba(232,114,12,0.25)',
                transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
              }}>{t('common:save')}</Button>
          )}
        </div>
      </div>

      <Form
        form={form}
        layout="vertical"
        disabled={isDetailMode}
      >
        {/* 基础信息 */}
        <Card
          title={
            <Space>
              <AppstoreOutlined style={{ fontSize: 16, color: '#1890ff' }} />
              <span style={{ fontSize: 15, fontWeight: 500 }}>{t('recommend.basicInfo')}</span>
            </Space>
          }
          style={{
            marginTop: 16,
            backgroundColor: '#fafbfc',
            border: '1px solid #e8eaed',
            borderRadius: 8,
            boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
          }}
          headStyle={{
            backgroundColor: '#f0f5ff',
            borderBottom: '1px solid #d6e4ff',
            borderRadius: '8px 8px 0 0',
          }}
        >

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0 24px' }}>
            <Form.Item label={t('common:brand')} name="app" rules={[{ required: true, message: t('common:selectBrand') }]}>
              <Select placeholder={t('common:selectBrand')} options={tAppOptions} />
            </Form.Item>

            <Form.Item label={t('recommend.algoName')} name="algorithmType" rules={[{ required: true, message: t('recommend.selectAlgo') }]}>
              <Select
                placeholder={t('recommend.selectAlgo')}
                options={tAlgoOptions}
                onChange={(value) => {
                  setAlgorithmType(value)
                  if (value !== AlgorithmType.HOT_REVIVE_AD) {
                    setDistrictPricings([])
                  }
                }}
              />
            </Form.Item>

            <Form.Item label={t('common:channel')} name="channel" rules={[{ required: true, message: t('common:selectChannel') }]}>
              <Select placeholder={t('common:selectChannel')} options={tChannelOptions} />
            </Form.Item>
          </div>

          <Form.Item label={t('recommend.detailImage')} style={{ marginBottom: 0 }}>
            <div style={{
              width: 120, height: 120, border: '1px dashed #d9d9d9', borderRadius: 8,
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', color: '#999', fontSize: 12,
            }}>
              <PlusOutlined style={{ fontSize: 20, marginBottom: 4 }} />
              <span>{t('recommend.uploadDetailImage')}</span>
            </div>
          </Form.Item>
        </Card>

        {/* 销售策略 */}
        <Card
          title={
            <Space>
              <SettingOutlined style={{ fontSize: 16, color: '#E8720C' }} />
              <span style={{ fontSize: 15, fontWeight: 500 }}>{t('recommend.salesStrategy')}</span>
            </Space>
          }
          extra={<Tag color="orange" style={{ fontSize: 11 }}>{t('recommend.strategyConfigTag')}</Tag>}
          style={{
            marginTop: 16,
            backgroundColor: '#ffffff',
            border: '1px solid #e8eaed',
            borderRadius: 12,
            boxShadow: '0 4px 12px rgba(0,0,0,0.06)',
          }}
          headStyle={{
            borderBottom: '1px solid #ffe7ba',
            borderRadius: '12px 12px 0 0',
            padding: '16px 24px',
          }}
        >

          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ fontSize: 14, color: '#595959', minWidth: 80 }}>{t('recommend.preSaleDaysLabel')}</span>
              <Form.Item name="minDays" style={{ marginBottom: 0 }}>
                <InputNumber min={1} max={30} style={{ width: 100 }} addonAfter={t('recommend:dayUnit')} />
              </Form.Item>
              <span style={{ fontSize: 12, color: '#8c8c8c' }}>{t('recommend.preSaleDaysTip')}</span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ fontSize: 14, color: '#595959', minWidth: 80 }}>{t('recommend.blockMerchantsLabel')}</span>
              <Form.Item name="status" style={{ marginBottom: 0 }}>
                <Switch
                  checkedChildren={t('recommend.blockOn')}
                  unCheckedChildren={t('recommend.blockOff')}
                  defaultChecked={false}
                />
              </Form.Item>
              <span style={{ fontSize: 12, color: '#8c8c8c' }}>{t('recommend.blockMerchantTip')}</span>
            </div>
          </div>
        </Card>
        {/* 盘活复苏：商圈计价配置 */}
        {isReviveAlgorithm && (
          <Card
            title={
              <Space>
                <span style={{ fontSize: 16 }}>🏪</span>
                <span style={{ fontSize: 15, fontWeight: 500 }}>{t('recommend.districtPricingConfig')}</span>
                <Tag color="purple" style={{ fontSize: 11 }}>{t('recommend.zonePricingTag')}</Tag>
              </Space>
            }
            extra={
              <Button
                type="primary"
                size="small"
                icon={<PlusOutlined />}
                onClick={() => {
                  setSelectedRegionNode(null)
                  setReplacingRegion(null)
                  setRegionSelectModalVisible(true)
                }}
                style={{ borderRadius: 6 }}
              >
                {t('recommend.selectDistrictBtn')}
              </Button>
            }
            style={{
              marginTop: 16,
              backgroundColor: '#fafbfc',
              border: '1px solid #e8eaed',
              borderRadius: 8,
              boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
            }}
            headStyle={{
              backgroundColor: '#f9f0ff',
              borderBottom: '1px solid #d3adf7',
              borderRadius: '8px 8px 0 0',
            }}
          >
            {districtPricings.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 40, color: '#8c8c8c', fontSize: 13 }}>
                {t('recommend.districtEmptyHint')}
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
                        {t('common:edit')}
                      </Button>
                      <Button
                        type="text"
                        danger
                        icon={<DeleteFilled style={{ fontSize: 14 }} />}
                        onClick={() => handleRemoveDistrict(config.region)}
                        style={{ fontSize: 12, padding: '2px 6px' }}
                      >
                        {t('common:delete')}
                      </Button>
                    </div>
                  </div>
                  <Form.Item
                    label={t('recommend.dailyPriceLabel')}
                    style={{ marginBottom: 0, maxWidth: 500 }}
                  >
                    <InputNumber
                      min={0}
                      precision={2}
                      placeholder={t('recommend.dailyPricePh')}
                      style={{ width: '100%' }}
                      addonAfter={t('recommend.mopPerDay')}
                      value={config.dailyPrice}
                      onChange={(value) => handleUpdateDistrictPrice(config.region, value || 0)}
                    />
                  </Form.Item>
                </div>
              ))
            )}
          </Card>
        )}

        {/* 盘活复苏：購買多天折扣配置（梯度）- 選擇商圈後才展示 */}
        {isReviveAlgorithm && districtPricings.length > 0 && (
          <Card
            title={
              <Space>
                <span style={{ fontSize: 16 }}>🎯</span>
                <span style={{ fontSize: 15, fontWeight: 500 }}>{t('recommend.multiDayDiscount')}</span>
              </Space>
            }
            extra={
              <Space>
                <span style={{ fontSize: 12, color: '#8c8c8c' }}>{t('recommend.matchDiscountTip')}</span>
                <Switch checked={discountEnabled} onChange={setDiscountEnabled} />
              </Space>
            }
            style={{
              marginTop: 16,
              backgroundColor: '#ffffff',
              border: '1px solid #e8eaed',
              borderRadius: 12,
              boxShadow: '0 4px 12px rgba(0,0,0,0.06)',
            }}
            headStyle={{
              borderBottom: '1px solid #b5f5ec',
              borderRadius: '12px 12px 0 0',
              padding: '16px 24px',
            }}
          >
            {discountEnabled && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 24px' }}>
                <Form.Item
                  label={t('recommend.minPurchaseDays')}
                  name="minDays"
                  rules={[{ required: true, message: t('recommend.minPurchaseDaysReq') }]}
                >
                  <InputNumber placeholder={t('recommend:inputRequired')} min={1} style={{ width: '100%' }} addonAfter={t('recommend:dayUnit')} />
                </Form.Item>
                <Form.Item
                  label={t('recommend.discountTierLabel')}
                  name="discountTiers"
                >
                  <Input placeholder={t('recommend.discountTierPh')} />
                </Form.Item>
              </div>
            )}
          </Card>
        )}

        {/* 非盘活复苏：区域和单日单价 */}
        {!isReviveAlgorithm && (
          <Card
            title={
              <Space>
                <span style={{ fontSize: 16 }}>💰</span>
                <span style={{ fontSize: 15, fontWeight: 500 }}>{t('recommend.priceConfig')}</span>
              </Space>
            }
            style={{
              marginTop: 16,
              backgroundColor: '#fafbfc',
              border: '1px solid #e8eaed',
              borderRadius: 8,
              boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
            }}
            headStyle={{
              backgroundColor: '#f9f0ff',
              borderBottom: '1px solid #d3adf7',
              borderRadius: '8px 8px 0 0',
            }}
          >
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 24px' }}>
              <Form.Item
                label={t('recommend.regionLabelCol')}
                name="region"
                rules={[{ required: true, message: t('recommend.regionPh') }]}
              >
                <Input placeholder={t('recommend.regionPh')} />
              </Form.Item>
              <Form.Item
                label={t('recommend.dailyUnitPrice')}
                name="dailyPrice"
                rules={[{ required: true, message: t('recommend.dailyUnitPriceReq') }]}
              >
                <InputNumber placeholder={t('recommend:inputRequired')} min={0} style={{ width: '100%' }} addonAfter="MOP" />
              </Form.Item>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 24px' }}>
              <Form.Item
                label={t('recommend.minPurchaseDays')}
                name="minDays"
                rules={[{ required: true, message: t('recommend.minPurchaseDaysReq') }]}
              >
                <InputNumber placeholder={t('common:placeholderSelect')} min={1} style={{ width: '100%' }} addonAfter={t('recommend:dayUnit')} />
              </Form.Item>
              <Form.Item
                label={t('recommend.discountTierLabel')}
                name="discountTiers"
              >
                <Input placeholder={t('recommend.discountTierPh2')} />
              </Form.Item>
            </div>
          </Card>
        )}

        {/* 订单退款，退费比例配置 */}
        <Card
          title={
            <Space>
              <SettingOutlined style={{ fontSize: 16, color: '#F5222D' }} />
              <span style={{ fontSize: 15, fontWeight: 500 }}>{t('recommend.refundConfig')}</span>
              <span style={{ fontSize: 12, color: '#8c8c8c' }}>{t('recommend.refundConfigDesc')}</span>
            </Space>
          }
          extra={
            <Space>
              <span style={{ fontSize: 13, color: refundEnabled ? '#52c41a' : '#8c8c8c' }}>{refundEnabled ? t('recommend.allowRefund') : t('recommend.denyRefund')}</span>
              <Switch
                size="small"
                checked={refundEnabled}
                onChange={(checked) => setRefundEnabled(checked)}
                style={{ background: refundEnabled ? '#52c41a' : '#d9d9d9' }}
              />
            </Space>
          }
          style={{
            marginTop: 16,
            backgroundColor: '#ffffff',
            border: '1px solid #e8eaed',
            borderRadius: 12,
            boxShadow: '0 4px 12px rgba(0,0,0,0.06)',
          }}
          headStyle={{
            borderBottom: '1px solid #ffa39e',
            borderRadius: '12px 12px 0 0',
            padding: '16px 24px',
          }}
        >

          {refundEnabled ? (
            <Table
              dataSource={cancelFeeTiers}
              columns={cancelFeeColumns}
              pagination={false}
              size="middle"
              rowKey="key"
              style={{ marginBottom: 12 }}
            />
          ) : (
            <div style={{
              padding: '24px', textAlign: 'center',
              background: '#fafafa', borderRadius: 8,
              border: '1px dashed #d9d9d9',
            }}>
              <span style={{ fontSize: 13, color: '#8c8c8c' }}>{t('recommend.denyRefundTip')}</span>
            </div>
          )}
        </Card>
      </Form>

      {/* 商圈选择弹窗 */}
      <Modal
        title={replacingRegion ? t('recommend.replaceDistrict') : t('recommend.selectDistrictTitle')}
        open={regionSelectModalVisible}
        onCancel={() => {
          setRegionSelectModalVisible(false)
          setSelectedRegionNode(null)
          setReplacingRegion(null)
        }}
        onOk={handleAddDistrict}
        okText={replacingRegion ? t('recommend.confirmReplace') : t('recommend.confirmAdd')}
        cancelText={t('common:cancel')}
      >
        <Tree
          treeData={regionTreeData}
          selectedKeys={selectedRegionNode ? [selectedRegionNode.key] : []}
          onSelect={(keys, info) => {
            const node = info.node as unknown as { key: string; title: string; level: number }
            if (node.level === 2) {
              setSelectedRegionNode(node)
            } else {
              message.warning(t('recommend.selectSpecificDistrict'))
            }
          }}
          style={{ marginTop: 16 }}
        />
        {selectedRegionNode && (
          <div style={{ marginTop: 12, padding: '8px 12px', background: '#f6ffed', borderRadius: 6, border: '1px solid #b7eb8f' }}>
            <span style={{ color: '#52c41a', fontSize: 13 }}>{t('recommend.selectedLabel')}</span>
            <span style={{ fontWeight: 600, color: '#262626' }}>{selectedRegionNode.title}</span>
          </div>
        )}
      </Modal>
    </div>
  )
}
