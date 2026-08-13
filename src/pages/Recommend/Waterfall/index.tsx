import { useState, useMemo, useEffect } from 'react'
import { Button, Space, Table, Tag, Badge, Input, Select, Form, Modal, message, InputNumber, Switch, Descriptions, Divider, Card, Checkbox, Alert, Tabs } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import dayjs from 'dayjs'
import BrandTag from '../../../components/BrandTag'
import { PlusOutlined, SearchOutlined, ReloadOutlined, ArrowLeftOutlined, WalletOutlined } from '@ant-design/icons'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { 
  AppType, 
  RecommendChannel, 
  AlgorithmType,
  ServiceStatus,
  Region,
  APP_OPTIONS,
  SERVICE_STATUS_OPTIONS,
  ALGORITHM_TYPE_OPTIONS,
  REGION_OPTIONS,
  REGION_LABEL_KEY,
  ALGO_CARD_COLOR_MAP,
} from '../constants'
import type { WaterfallSlotConfig } from '../types'
import { fetchAdPricingList, updateAdPricingStatus, deleteAdPricing, fetchAdRevivePricingList, updateAdRevivePricingStatus, deleteAdRevivePricing, fetchAdHotPricingList, updateAdHotPricingStatus, deleteAdHotPricing, fetchAdAlgorithms, brandToAppType, type AdPricingStar, type AdPricingHot, type AdAlgorithm } from '../../../api/adPromotion'
import { useColumnConfig } from '../../../hooks/useColumnConfig'
import { useCardOrder } from '../../../hooks/useCardOrder'

/** 各業務類型（tab）對應的廣告類型列表 */
const TAB_ALGORITHM_MAP: Record<string, AlgorithmType[]> = {
  delivery: [
    AlgorithmType.INVINCIBLE_STAR,
    AlgorithmType.HOT_REVIVE_AD,
    AlgorithmType.POPULAR_MERCHANT_KA,
    AlgorithmType.TRAFFIC_AD,
    AlgorithmType.GOLDEN_SIGNBOARD,
  ],
  groupBuy: [
    AlgorithmType.INVINCIBLE_STAR,
    AlgorithmType.HOT_REVIVE_AD,
  ],
}

/** 各業務類型（tab）對應的業務频道：外賣到家=美食外賣+超市百貨，團購到店=團購到店 */
const TAB_BIZ_CHANNELS: Record<string, string[]> = {
  delivery: ['food', 'supermarket'],
  groupBuy: ['groupBuy'],
}

const CHANNEL_TO_BIZ: Record<number, string> = {
  [RecommendChannel.DELIVERY]: 'food',
  [RecommendChannel.SUPERMARKET]: 'supermarket',
  [RecommendChannel.GROUP_BUY]: 'groupBuy',
}
const BIZ_CHANNEL_POOL = ['food', 'supermarket', 'groupBuy']

const ALGORITHM_TYPE_COLOR: Record<AlgorithmType, string> = {
  [AlgorithmType.INVINCIBLE_STAR]: 'gold',
  [AlgorithmType.NEW_STORE_AD]: 'green',
  [AlgorithmType.HOT_REVIVE_AD]: 'volcano',
  [AlgorithmType.EXCLUSIVE_MERCHANT]: 'purple',
  [AlgorithmType.POPULAR_MERCHANT_KA]: 'geekblue',
  [AlgorithmType.TRAFFIC_AD]: 'cyan',
  [AlgorithmType.GUESS_YOU_LIKE]: 'blue',
  [AlgorithmType.ORGANIC_TRAFFIC]: 'lime',
  [AlgorithmType.BRAND_MERCHANT]: 'orange',
  [AlgorithmType.GOLD_AD]: 'gold',
  [AlgorithmType.GOLDEN_SIGNBOARD]: 'gold',
  [AlgorithmType.PRODUCT_PROMO]: 'red',
}

/** 後端計價配置 → 定價列表行（按來源設置算法類型） */
const toPricingRow = (vo: AdPricingStar, algoType: AlgorithmType): WaterfallSlotConfig => ({
  id: -(vo.id ?? 0),
  adId: `${algoType === AlgorithmType.HOT_REVIVE_AD ? 'RV' : algoType === AlgorithmType.POPULAR_MERCHANT_KA ? 'HT' : 'PR'}${String(vo.id ?? 0).padStart(6, '0')}`,
  pricingNo: vo.pricingNo,
  promotionName: vo.algoName || '-',
  app: (brandToAppType(vo.brand) ?? AppType.SHANFENG) as AppType,
  channel: (vo.channel ?? RecommendChannel.DELIVERY) as RecommendChannel,
  bizChannel: vo.channel === RecommendChannel.GROUP_BUY ? 'groupBuy' : vo.channel === RecommendChannel.SUPERMARKET ? 'supermarket' : 'food',
  slotPosition: 0,
  algorithmId: vo.algoId,
  algorithmName: vo.algoName || '-',
  algorithmType: algoType,
  merchantLimit: 'unlimited',
  regionLimit: 'unlimited',
  status: (vo.status ?? ServiceStatus.ENABLED) as ServiceStatus,
  updatedBy: vo.updatedBy || '-',
  updatedAt: vo.updatedAt ? dayjs(vo.updatedAt).format('YYYY-MM-DD HH:mm:ss') : '-',
  createdAt: vo.createdAt ? dayjs(vo.createdAt).format('YYYY-MM-DD HH:mm:ss') : '-',
  source: 'api',
})

export default function Waterfall() {
  const navigate = useNavigate()
  const { t } = useTranslation()
  const [searchParams] = useSearchParams()
  const urlType = searchParams.get('type') ? Number(searchParams.get('type')) as AlgorithmType : null
  const [searchForm] = Form.useForm()
  const [selectedAlgorithmType, setSelectedAlgorithmType] = useState<AlgorithmType | null>(urlType) // null = 卡片选择页
  const [bizTypeTab, setBizTypeTab] = useState<string>('delivery') // 外賣到家 / 團購到店
  const [dataList, setDataList] = useState<WaterfallSlotConfig[]>([])
  const [filteredData, setFilteredData] = useState<WaterfallSlotConfig[]>([])
  const [modalVisible, setModalVisible] = useState(false)
  const [detailVisible, setDetailVisible] = useState(false)
  const [editingRecord, setEditingRecord] = useState<WaterfallSlotConfig | null>(null)
  const [viewingRecord, setViewingRecord] = useState<WaterfallSlotConfig | null>(null)
  const [form] = Form.useForm()

  // 卡片拖拽排序（順序持久化到 localStorage，每個 Tab 獨立保存）
  const deliveryCardOrder = useCardOrder('waterfall-card-order-delivery', TAB_ALGORITHM_MAP.delivery)
  const groupBuyCardOrder = useCardOrder('waterfall-card-order-groupBuy', TAB_ALGORITHM_MAP.groupBuy)

  /** 广告类型卡片配置（依赖 t，定义在组件内以便响应语言切换） */
  const ALGORITHM_TYPE_CARDS: { type: AlgorithmType; icon: string; description: string }[] = [
    { type: AlgorithmType.INVINCIBLE_STAR, icon: '⭐', description: t('algorithm.descInvincibleStar') },
    { type: AlgorithmType.HOT_REVIVE_AD, icon: '🔥', description: t('algorithm.descHotRevive') },
    { type: AlgorithmType.POPULAR_MERCHANT_KA, icon: '🏆', description: t('waterfall.descPopularMerchant') },
    { type: AlgorithmType.TRAFFIC_AD, icon: '📊', description: t('algorithm.descTraffic') },
    { type: AlgorithmType.GOLDEN_SIGNBOARD, icon: '🏅', description: t('algorithm.descGoldenSignboard') },
  ]

  /** 算法类型标签映射（复用 algorithm 命名空间，依赖 t，定义在组件内以便响应语言切换） */
  const ALGORITHM_TYPE_LABEL: Record<AlgorithmType, string> = {
    [AlgorithmType.INVINCIBLE_STAR]: t('algorithm.typeInvincibleStar'),
    [AlgorithmType.NEW_STORE_AD]: t('algorithm.typeNewStore'),
    [AlgorithmType.HOT_REVIVE_AD]: t('algorithm.typeHotRevive'),
    [AlgorithmType.EXCLUSIVE_MERCHANT]: t('algorithm.typeExclusiveMerchant'),
    [AlgorithmType.POPULAR_MERCHANT_KA]: t('algorithm.typePopularMerchant'),
    [AlgorithmType.TRAFFIC_AD]: t('algorithm.typeTraffic'),
    [AlgorithmType.GUESS_YOU_LIKE]: t('algorithm.typeGuessYouLike'),
    [AlgorithmType.ORGANIC_TRAFFIC]: t('algorithm.typeOrganicTraffic'),
    [AlgorithmType.BRAND_MERCHANT]: t('algorithm.typeBrandMerchant'),
    [AlgorithmType.GOLD_AD]: t('algorithm.typeGoldAd'),
    [AlgorithmType.GOLDEN_SIGNBOARD]: t('algorithm.typeGoldenSignboard'),
    [AlgorithmType.PRODUCT_PROMO]: t('algorithm.typeProductPromo'),
  }

  /** 展示頁面映射（依赖 t，定义在组件内以便响应语言切换） */
  const CHANNEL_LABEL: Record<RecommendChannel, string> = {
    [RecommendChannel.HOME]: t('waterfall.chHome'),
    [RecommendChannel.DELIVERY]: t('waterfall.chDelivery'),
    [RecommendChannel.SUPERMARKET]: t('waterfall.chSupermarket'),
    [RecommendChannel.GROUP_BUY]: t('waterfall.chGroupBuy'),
  }
  /** 展示頁面選項（與廣告銷售一致） */
  const CHANNEL_OPTIONS = [
    { label: t('waterfall.chHome'), value: RecommendChannel.HOME },
    { label: t('waterfall.chDelivery'), value: RecommendChannel.DELIVERY },
    { label: t('waterfall.chSupermarket'), value: RecommendChannel.SUPERMARKET },
    { label: t('waterfall.chGroupBuy'), value: RecommendChannel.GROUP_BUY },
  ]
  /** 業務頻道映射（依赖 t，定义在组件内以便响应语言切换） */
  const BIZ_CHANNEL_LABEL: Record<string, string> = {
    food: t('waterfall.bizFood'),
    supermarket: t('waterfall.bizSupermarket'),
    groupBuy: t('waterfall.bizGroupBuy'),
  }
  const BIZ_CHANNEL_OPTIONS = [
    { label: t('waterfall.bizFood'), value: 'food' },
    { label: t('waterfall.bizSupermarket'), value: 'supermarket' },
    { label: t('waterfall.bizGroupBuy'), value: 'groupBuy' },
  ]

  /** 翻譯後的常量選項（constants.ts 使用 labelKey） */
  const tAppOptions = useMemo(() => APP_OPTIONS.map(o => ({ label: t(o.labelKey), value: o.value })), [t])
  const tServiceStatusOptions = useMemo(() => SERVICE_STATUS_OPTIONS.map(o => ({ label: t(o.labelKey), value: o.value })), [t])
  const tAlgorithmTypeOptions = useMemo(() => ALGORITHM_TYPE_OPTIONS.map(o => ({ label: t(o.labelKey), value: o.value })), [t])
  const tRegionOptions = useMemo(() => REGION_OPTIONS.map(o => ({ label: t(o.labelKey), value: o.value })), [t])

  /** 加載定價列表（無敵星星 + 盤活復蘇 + 人氣商家並行拉取後合併）+ 算法列表 */
  useEffect(() => {
    let mounted = true
    Promise.all([
      fetchAdPricingList({ page: 1, size: 200 }).catch(() => ({ records: [] as AdPricingStar[], total: 0 })),
      fetchAdRevivePricingList({ page: 1, size: 200 }).catch(() => ({ records: [] as AdPricingStar[], total: 0 })),
      fetchAdHotPricingList({ page: 1, size: 200 }).catch(() => ({ records: [] as AdPricingHot[], total: 0 })),
      fetchAdAlgorithms({ page: 1, size: 500 }).catch(() => ({ records: [] as AdAlgorithm[], total: 0 })),
    ])
      .then(([starRes, reviveRes, hotRes, algoRes]) => {
        if (!mounted) return
        const list = [
          ...(starRes.records ?? []).map(vo => toPricingRow(vo, AlgorithmType.INVINCIBLE_STAR)),
          ...(reviveRes.records ?? []).map(vo => toPricingRow(vo, AlgorithmType.HOT_REVIVE_AD)),
          ...(hotRes.records ?? []).map(vo => toPricingRow(vo as unknown as AdPricingStar, AlgorithmType.POPULAR_MERCHANT_KA)),
        ]
        setDataList(list)
        // 缓存全量算法列表供新增/编辑弹窗筛选
        setAllAlgorithms(algoRes.records ?? [])
        if (urlType != null) {
          const allowed = TAB_BIZ_CHANNELS[bizTypeTab] || BIZ_CHANNEL_POOL
          setFilteredData(list.filter(item => item.algorithmType === urlType && allowed.includes(item.bizChannel ?? '')))
        } else {
          setFilteredData(list)
        }
      })
    return () => { mounted = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 业务频道选项（根据业务类型过滤）
  const bizChannelOptions = useMemo(() => {
    if (bizTypeTab === 'groupBuy') {
      return BIZ_CHANNEL_OPTIONS.filter(opt => opt.value === 'groupBuy')
    }
    return BIZ_CHANNEL_OPTIONS.filter(opt => opt.value !== 'groupBuy')
  }, [bizTypeTab])

  // 点击卡片进入列表
  const handleSelectType = (type: AlgorithmType) => {
    setSelectedAlgorithmType(type)
    const allowed = TAB_BIZ_CHANNELS[bizTypeTab] || BIZ_CHANNEL_POOL
    setFilteredData(dataList.filter(item => item.algorithmType === type && allowed.includes(item.bizChannel ?? '')))
    searchForm.resetFields()
  }

  // 返回卡片选择页
  const handleBackToCards = () => {
    setSelectedAlgorithmType(null)
    setFilteredData(dataList)
    searchForm.resetFields()
  }
  
  // 算法选择相关状态
  const [algorithmType, setAlgorithmType] = useState<AlgorithmType | undefined>(undefined)
  const [allAlgorithms, setAllAlgorithms] = useState<AdAlgorithm[]>([])
  const [algorithmOptions, setAlgorithmOptions] = useState<AdAlgorithm[]>([])
  const [continuousPurchase, setContinuousPurchase] = useState<string>('notSupport')
  const [merchantLimit, _setMerchantLimit] = useState<'limited' | 'unlimited'>('unlimited')
  const [selectedMerchants, setSelectedMerchants] = useState<number[]>([])
  const [merchantModalVisible, setMerchantModalVisible] = useState(false)
  const [regionLimit, _setRegionLimit] = useState<'limited' | 'unlimited'>('unlimited')
  
  // 搜索处理
  const handleSearch = (values: Record<string, unknown>) => {
    // 基礎範圏：當前選中的廣告類型 + 當前業務類型（tab）允許的業務頻道
    const allowed = TAB_BIZ_CHANNELS[bizTypeTab] || BIZ_CHANNEL_POOL
    let result = dataList.filter(item =>
      (selectedAlgorithmType == null || item.algorithmType === selectedAlgorithmType) &&
      allowed.includes(item.bizChannel ?? '')
    )
    
    // 配置ID搜索（按定價編號 pricingNo 模糊匹配）
    if (values.adId) {
      result = result.filter(item => item.pricingNo?.includes(String(values.adId)))
    }
    
    // 瀑布流名称搜索
    if (values.promotionName) {
      result = result.filter(item => item.promotionName?.includes(String(values.promotionName)))
    }
    
    // 業務频道搜索
    if (values.bizChannel !== undefined && values.bizChannel !== null) {
      result = result.filter(item => item.bizChannel === values.bizChannel)
    }
    
    // 所属品牌搜索
    if (values.app !== undefined && values.app !== null) {
      result = result.filter(item => item.app === values.app)
    }
    
    // 状态搜索
    if (values.status !== undefined && values.status !== null) {
      result = result.filter(item => item.status === values.status)
    }
    
    setFilteredData(result)
  }

  // 弹窗中选算法后自动带出品牌
  const [modalAlgoBrand, setModalAlgoBrand] = useState<string | undefined>(undefined)

  // 重置搜索
  const handleReset = () => {
    searchForm.resetFields()
    const allowed = TAB_BIZ_CHANNELS[bizTypeTab] || BIZ_CHANNEL_POOL
    setFilteredData(dataList.filter(item =>
      (selectedAlgorithmType == null || item.algorithmType === selectedAlgorithmType) &&
      allowed.includes(item.bizChannel ?? '')
    ))
  }

  // 算法类型变化
  const handleAlgorithmTypeChange = (type: AlgorithmType) => {
    setAlgorithmType(type)
    const availableAlgorithms = allAlgorithms.filter(
      alg => alg.algoType === type && alg.status === ServiceStatus.ENABLED
    )
    setAlgorithmOptions(availableAlgorithms)
    form.setFieldsValue({ algorithmId: undefined })
  }

  // 算法选择变化
  const handleAlgorithmChange = (algorithmId: number) => {
    const selectedAlgorithm = allAlgorithms.find(alg => alg.id === algorithmId)
    if (selectedAlgorithm) {
      form.setFieldsValue({
        algorithmName: selectedAlgorithm.algoName,
        algorithmType: selectedAlgorithm.algoType,
      })
      setModalAlgoBrand(selectedAlgorithm.brand as string | undefined)
      // TODO: 从算法配置中加载continuousPurchase等参数默认值
      setContinuousPurchase('notSupport')
    }
  }

  // 新增/编辑
  const handleSubmit = async () => {
    try {
      const values = await form.validateFields()
      message.success(editingRecord ? t('waterfall.editSuccess') : t('waterfall.addSuccess'))
      setModalVisible(false)
      form.resetFields()
      setEditingRecord(null)
      setAlgorithmType(undefined)
      setAlgorithmOptions([])
      setModalAlgoBrand(undefined)
    } catch (error) {
      console.error('表单验证失败:', error)
    }
  }

  // 删除
  const handleDelete = (record: WaterfallSlotConfig) => {
    Modal.confirm({
      title: t('common.confirmDelete'),
      content: t('waterfall.confirmDeleteContent', { name: record.promotionName || `${t('waterfall.slotPositionPrefix')}${record.slotPosition}` }),
      okText: t('common.confirm'),
      cancelText: t('common.cancel'),
      okButtonProps: { danger: true },
      onOk: async () => {
        if (record.source === 'api') {
          try {
            if (record.algorithmType === AlgorithmType.HOT_REVIVE_AD) {
              await deleteAdRevivePricing(-record.id)
            } else if (record.algorithmType === AlgorithmType.POPULAR_MERCHANT_KA) {
              await deleteAdHotPricing(-record.id)
            } else {
              await deleteAdPricing(-record.id)
            }
          } catch (err) {
            message.error((err as Error).message || t('waterfall.deleteFailed'))
            return
          }
          setDataList(prev => prev.filter(item => item.id !== record.id))
          setFilteredData(prev => prev.filter(item => item.id !== record.id))
        }
        message.success(t('common.deleteSuccess'))
      },
    })
  }

  // 切换状态（启用/停用）
  const handleToggleStatus = (record: WaterfallSlotConfig) => {
    const newStatus = record.status === ServiceStatus.ENABLED ? ServiceStatus.DISABLED : ServiceStatus.ENABLED
    const actionText = newStatus === ServiceStatus.ENABLED ? t('common.enable') : t('common.disable')

    Modal.confirm({
      title: t('waterfall.confirmToggleTitle', { action: actionText }),
      content: t('waterfall.confirmToggleContent', { action: actionText, name: record.promotionName || `${t('waterfall.slotPositionPrefix')}${record.slotPosition}` }),
      okText: t('common.confirm'),
      cancelText: t('common.cancel'),
      onOk: async () => {
        if (record.source === 'api') {
          try {
            if (record.algorithmType === AlgorithmType.HOT_REVIVE_AD) {
              await updateAdRevivePricingStatus(-record.id, newStatus)
            } else if (record.algorithmType === AlgorithmType.POPULAR_MERCHANT_KA) {
              await updateAdHotPricingStatus(-record.id, newStatus)
            } else {
              await updateAdPricingStatus(-record.id, newStatus)
            }
          } catch (err) {
            message.error((err as Error).message || t('waterfall.toggleFailed', { action: actionText }))
            return
          }
          setDataList(prev => prev.map(item => item.id === record.id ? { ...item, status: newStatus } : item))
          setFilteredData(prev => prev.map(item => item.id === record.id ? { ...item, status: newStatus } : item))
        }
        message.success(t('waterfall.toggleSuccess', { action: actionText }))
      },
    })
  }

  /** 列配置元数据 */
  const columnMeta = useMemo(() => [
    { key: 'pricingNo', title: t('waterfall.colConfigId') },
    { key: 'promotionName', title: t('waterfall.colAlgorithmName') },
    { key: 'app', title: t('common.colBrand') },
    { key: 'bizChannel', title: t('waterfall.colBizChannel') },
    { key: 'status', title: t('common.colStatus') },
    { key: 'updatedBy', title: t('waterfall.colLastUpdater') },
    { key: 'updatedAt', title: t('waterfall.colLastUpdateTime') },
    { key: 'action', title: t('common.colAction') },
  ], [t])

  const { configComponent, applyConfig } = useColumnConfig('waterfall', columnMeta, [
    { key: 'action', visible: true, locked: 'tail' as const },
  ])

  // 完整列定义（带自定义渲染）
  const columns: ColumnsType<WaterfallSlotConfig> = [
    { 
      title: t('waterfall.colConfigId'),
      dataIndex: 'pricingNo',
      key: 'pricingNo',
      width: 180,
      render: (text: string) => <Tag color="blue">{text || '-'}</Tag>,
    },
    { 
      title: t('waterfall.colAlgorithmName'),
      dataIndex: 'promotionName',
      key: 'promotionName',
      width: 200,
      render: (text: string) => <strong>{text}</strong>,
    },
    { 
      title: t('common.colBrand'), 
      dataIndex: 'app', 
      key: 'app', 
      width: 100,
      render: (v: AppType) => (
        <BrandTag value={v} />
      ),
    },
    {
      title: t('waterfall.colBizChannel'),
      dataIndex: 'bizChannel',
      key: 'bizChannel',
      width: 120,
      render: (v: string) => (
        <Tag color={v === 'food' ? 'orange' : v === 'supermarket' ? 'cyan' : 'purple'}>
          {BIZ_CHANNEL_LABEL[v] || v}
        </Tag>
      ),
    },
    {
      title: t('common.colStatus'),
      dataIndex: 'status',
      key: 'status',
      width: 100,
      render: (v: ServiceStatus) => (
        <Tag color={v === ServiceStatus.ENABLED ? 'success' : 'default'}>
          {v === ServiceStatus.ENABLED ? t('common.enable') : t('common.disable')}
        </Tag>
      ),
    },
    {
      title: t('waterfall.colLastUpdater'),
      dataIndex: 'updatedBy',
      key: 'updatedBy',
      width: 120,
      render: (v: string) => (
        <span style={{ whiteSpace: 'nowrap' }}>{v}</span>
      ),
    },
    {
      title: t('waterfall.colLastUpdateTime'),
      dataIndex: 'updatedAt',
      key: 'updatedAt',
      width: 180,
      render: (v: string) => (
        <span style={{ whiteSpace: 'nowrap' }}>{v}</span>
      ),
    },
    {
      title: t('common.colAction'),
      key: 'action',
      width: 200,
      fixed: 'right' as const,
      render: (_, record) => (
        <Space size={0} split={<span style={{ color: '#d9d9d9' }}>|</span>}>
          <Button 
            type="link" 
            size="small" 
            onClick={() => navigate(`/promotion-waterfall-add?id=${record.source === 'api' ? -record.id : record.id}&mode=detail&type=${selectedAlgorithmType}&module=${bizTypeTab}`)}
          >
            {t('common.detail')}
          </Button>
          <Button 
            type="link" 
            size="small" 
            onClick={() => navigate(`/promotion-waterfall-add?id=${record.source === 'api' ? -record.id : record.id}&type=${selectedAlgorithmType}&module=${bizTypeTab}`)}
          >
            {t('common.edit')}
          </Button>
          <Button 
            type="link" 
            size="small" 
            danger={record.status === ServiceStatus.ENABLED}
            style={record.status !== ServiceStatus.ENABLED ? { color: '#52c41a' } : undefined}
            onClick={() => handleToggleStatus(record)}
          >
            {record.status === ServiceStatus.ENABLED ? t('common.disable') : t('common.enable')}
          </Button>
          <Button 
            type="link" 
            size="small" 
            danger
            onClick={() => handleDelete(record)}
          >
            {t('common.delete')}
          </Button>
        </Space>
      ),
    },
  ]

  // ===== 卡片选择主界面 =====
  if (selectedAlgorithmType === null) {
    return (
      <div className="content-area">
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
            <div>
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#1890ff' }}>
                <WalletOutlined style={{ marginRight: 8 }} />
                {t('waterfall.salesPricing')}
              </h2>
              <p style={{ margin: '6px 0 0', color: '#8c8c8c', fontSize: 12 }}>
                {t('waterfall.salesPricingDesc')}
              </p>
            </div>
          </div>
        </div>

        <Card style={{ marginBottom: 16 }} bodyStyle={{ padding: '5px 24px' }}>
          <Tabs
            activeKey={bizTypeTab}
            onChange={(key) => setBizTypeTab(key)}
            items={['delivery', 'groupBuy'].map(tabKey => ({
              key: tabKey,
              label: tabKey === 'delivery' ? t('waterfall.bizDelivery') : t('waterfall.bizGroupBuy'),
              children: (
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
                  gap: 16,
                }}>
                  {(tabKey === 'delivery' ? deliveryCardOrder : groupBuyCardOrder).sortCards(
                    ALGORITHM_TYPE_CARDS.filter(card => TAB_ALGORITHM_MAP[tabKey].includes(card.type)),
                    card => card.type,
                  ).map(card => {
                      const cardOrder = tabKey === 'delivery' ? deliveryCardOrder : groupBuyCardOrder
                      const enabled = card.type === AlgorithmType.INVINCIBLE_STAR || card.type === AlgorithmType.HOT_REVIVE_AD || card.type === AlgorithmType.POPULAR_MERCHANT_KA
                      return (
                        <div
                          key={card.type}
                          className={`algo-card-wrapper algo-card-wrapper--${ALGO_CARD_COLOR_MAP[card.type]}${!enabled ? ' disabled' : ''}`}
                          onClick={() => enabled && handleSelectType(card.type)}
                          {...cardOrder.getDragProps(card.type)}
                        >
                          <div className="algo-card-inner">
                            <div className="algo-card-icon">{card.icon}</div>
                            <h3 className="algo-card-title">{ALGORITHM_TYPE_LABEL[card.type]}</h3>
                            <p className="algo-card-desc">{card.description}</p>
                            <div className="algo-card-tag">
                              {enabled ? (
                                <Tag color="blue">{t('waterfall.viewAdjustPricing')}</Tag>
                              ) : (
                                <Tag color="default">{t('waterfall.comingSoon')}</Tag>
                              )}
                            </div>
                          </div>
                        </div>
                      )
                    })}
                </div>
              ),
            }))}
          />
        </Card>
      </div>
    )
  }

  // ===== 列表视图 =====
  return (
    <div className="content-area">
      {/* 标题区域 */}
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
              onClick={handleBackToCards}
              style={{
                backgroundColor: '#E8720C', borderColor: '#E8720C',
                borderRadius: 8, height: 36, padding: '0 16px',
                display: 'flex', alignItems: 'center', gap: 6,
                boxShadow: '0 2px 6px rgba(232,114,12,0.25)',
                transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
              }}
            >{t('common.back')}</Button>
            <div style={{ width: 1, height: 20, background: '#E8E8E8' }} />
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#1890ff' }}>{t('waterfall.pricingList')}</h2>
              {selectedAlgorithmType != null && (
                <span style={{ fontSize: 14, color: '#595959' }}>
                  {ALGORITHM_TYPE_CARDS.find(c => c.type === selectedAlgorithmType)?.icon} {ALGORITHM_TYPE_LABEL[selectedAlgorithmType]}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* 查询区域 */}
      <div className="search-section">
        <Form layout="inline" form={searchForm} onFinish={handleSearch}>
          <Form.Item label={t('waterfall.colConfigId')} name="adId">
            <Input placeholder={t('waterfall.placeholderConfigId')} allowClear />
          </Form.Item>
          <Form.Item label={t('waterfall.colAlgorithmName')} name="promotionName">
            <Select 
              placeholder={t('waterfall.placeholderSearch')} 
              allowClear
              showSearch
              optionFilterProp="label"
              options={allAlgorithms.map(a => ({ label: a.algoName, value: a.algoName }))}
            />
          </Form.Item>
          <Form.Item label={t('waterfall.colBizChannel')} name="bizChannel">
            <Select placeholder={t('common.all')} options={bizChannelOptions} allowClear />
          </Form.Item>
          <Form.Item label={t('common.colBrand')} name="app">
            <Select placeholder={t('common.all')} options={tAppOptions} allowClear />
          </Form.Item>
          <Form.Item label={t('common.colStatus')} name="status">
            <Select placeholder={t('common.all')} options={tServiceStatusOptions} allowClear />
          </Form.Item>
          <Form.Item>
            <div className="search-actions">
              <Button type="primary" htmlType="submit" icon={<SearchOutlined />}>{t('common.search')}</Button>
              <Button onClick={handleReset} icon={<ReloadOutlined />}>{t('common.reset')}</Button>
            </div>
          </Form.Item>
        </Form>
      </div>

      {/* 功能区域 */}
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'flex-end', alignItems: 'center' }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <Button 
            type="primary" 
            icon={<PlusOutlined />}
            onClick={() => navigate(`/promotion-waterfall-add?type=${selectedAlgorithmType}&module=${bizTypeTab}`)}
          >
            {t('common.add')}
          </Button>
          {configComponent}
        </div>
      </div>

      {/* 列表区域 */}
      <div className="table-section">
        <Table<WaterfallSlotConfig>
          rowKey="id"
          columns={applyConfig(columns)}
          dataSource={filteredData}
          scroll={{ x: 1300 }}
          pagination={{
            pageSize: 10,
            showTotal: (total) => t('common.total', { count: total }),
            showSizeChanger: true,
            pageSizeOptions: ['10', '20', '50'],
            showQuickJumper: true,
          }}
        />
      </div>

      {/* 新增/编辑弹窗 */}
      <Modal
        title={editingRecord ? t('waterfall.editSlotConfig') : t('waterfall.addSlotConfig')}
        open={modalVisible}
        onOk={handleSubmit}
        onCancel={() => {
          setModalVisible(false)
          form.resetFields()
          setEditingRecord(null)
          setAlgorithmType(undefined)
          setAlgorithmOptions([])
          setModalAlgoBrand(undefined)
        }}
        width={1100}
        okText={t('common.confirm')}
        cancelText={t('common.cancel')}
      >
        <Form form={form} layout="vertical" style={{ marginTop: 24 }}>
          {/* 基础信息区 */}
          <Card title={t('waterfall.basicInfo')} size="small" style={{ marginBottom: 16 }}>
            <Form.Item 
              label={t('common.colBrand')} 
              name="app" 
              rules={[{ required: true, message: t('waterfall.brandRequired') }]}
            >
              <Select placeholder={t('waterfall.selectPlaceholder')} options={APP_OPTIONS} />
            </Form.Item>

            <Form.Item 
              label={t('waterfall.placementPage')} 
              name="channel" 
              rules={[{ required: true, message: t('waterfall.placementRequired') }]}
            >
              <Select placeholder={t('waterfall.selectPlaceholder')} options={CHANNEL_OPTIONS} />
            </Form.Item>

            <Form.Item 
              label={t('waterfall.adType')} 
              rules={[{ required: true, message: t('waterfall.adTypeRequired') }]}
            >
              <Select 
                placeholder={t('waterfall.selectAdTypePlaceholder')} 
                options={tAlgorithmTypeOptions}
                onChange={handleAlgorithmTypeChange}
                value={algorithmType}
              />
            </Form.Item>

            <Form.Item 
              label={t('waterfall.colAlgorithmName')} 
              name="algorithmId"
              rules={[{ required: true, message: t('waterfall.algorithmRequired') }]}
            >
              <Select 
                placeholder={t('waterfall.selectAlgorithmFirst')} 
                options={algorithmOptions.map(alg => ({ label: alg.algoName, value: alg.id }))}
                onChange={handleAlgorithmChange}
                disabled={!algorithmType}
              />
            </Form.Item>

            <Form.Item 
              label={t('waterfall.adType')}
              name="algorithmType"
            >
              <Input 
                placeholder={t('waterfall.autoShowAfterSelect')} 
                disabled 
                suffix={
                  (() => {
                    const algorithmType = form.getFieldValue('algorithmType') as AlgorithmType | undefined
                    return algorithmType ? (
                      <Tag color={ALGORITHM_TYPE_COLOR[algorithmType]}>
                        {ALGORITHM_TYPE_LABEL[algorithmType]}
                      </Tag>
                    ) : null
                  })()
                }
              />
            </Form.Item>

            <Form.Item label={t('common.colBrand')}>
              {modalAlgoBrand ? (
                <BrandTag value={modalAlgoBrand} />
              ) : (
                <span style={{ color: '#bfbfbf' }}>{t('waterfall.selectAlgorithmNameFirst')}</span>
              )}
            </Form.Item>
          </Card>

          {/* 关键参数调整区 */}
          <Card title={t('waterfall.slotParamsConfig')} size="small" style={{ marginBottom: 16 }}>
            <Alert
              message={t('waterfall.tipTitle')}
              description={t('waterfall.slotParamsTip')}
              type="warning"
              showIcon
              style={{ marginBottom: 16 }}
            />

            {/* 购买上限/间隔天数 */}
            {continuousPurchase === 'support' && (
              <Form.Item 
                label={t('waterfall.purchaseLimit')} 
                name="purchaseLimit"
                rules={[{ required: true, message: t('waterfall.purchaseLimitRule') }]}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ color: '#595959', fontWeight: 500 }}>{t('waterfall.within')}</span>
                  <InputNumber min={1} max={365} placeholder={t('waterfall.daysPlaceholder')} style={{ width: 100 }} />
                  <span style={{ color: '#595959', fontWeight: 500 }}>{t('waterfall.daysInMaxBuy')}</span>
                  <InputNumber min={1} max={100} placeholder={t('waterfall.quantity')} style={{ width: 100 }} />
                  <span style={{ color: '#595959', fontWeight: 500 }}>{t('waterfall.slotsUnit')}</span>
                </div>
              </Form.Item>
            )}

            {continuousPurchase === 'notSupport' && (
              <Form.Item 
                label={t('waterfall.intervalDays')} 
                name="purchaseInterval"
                rules={[{ required: true, message: t('waterfall.intervalDaysRule') }]}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ color: '#595959', fontWeight: 500 }}>{t('waterfall.interval')}</span>
                  <InputNumber min={1} max={365} placeholder={t('waterfall.daysPlaceholder')} style={{ width: 100 }} />
                  <span style={{ color: '#595959', fontWeight: 500 }}>{t('waterfall.daysCanBuy')}</span>
                </div>
              </Form.Item>
            )}

            {/* 商家限制 */}
            <Form.Item 
              label={t('waterfall.merchantLimit')} 
              name="merchantLimit"
              valuePropName="checked"
              getValueFromEvent={(checked) => checked ? 'unlimited' : 'limited'}
              getValueProps={(value) => ({ checked: value === 'unlimited' })}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                <Switch 
                  checkedChildren={t('waterfall.unlimited')} 
                  unCheckedChildren={t('waterfall.limited')}
                  defaultChecked
                />
                {merchantLimit === 'limited' && (
                  <Button 
                    size="small"
                    onClick={() => setMerchantModalVisible(true)}
                  >
                    {t('waterfall.selectMerchants')}
                  </Button>
                )}
              </div>
            </Form.Item>

            {/* 销售区域 */}
            <Form.Item 
              label={t('waterfall.salesRegion')} 
              name="regionLimit"
              valuePropName="checked"
              getValueFromEvent={(checked) => checked ? 'unlimited' : 'limited'}
              getValueProps={(value) => ({ checked: value === 'unlimited' })}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                <Switch 
                  checkedChildren={t('waterfall.unlimited')} 
                  unCheckedChildren={t('waterfall.limited')}
                  defaultChecked
                />
                {regionLimit === 'limited' && (
                  <Checkbox.Group options={tRegionOptions} />
                )}
              </div>
            </Form.Item>
          </Card>

          {/* 状态区 */}
          <Form.Item 
            label={t('common.colStatus')} 
            name="status" 
            valuePropName="checked"
            getValueFromEvent={(checked) => checked ? ServiceStatus.ENABLED : ServiceStatus.DISABLED}
            getValueProps={(value) => ({ checked: value === ServiceStatus.ENABLED })}
          >
            <Switch checkedChildren={t('common.enable')} unCheckedChildren={t('common.disable')} defaultChecked />
          </Form.Item>
        </Form>
      </Modal>

      {/* 商家选择弹窗 */}
      <Modal
        title={t('waterfall.selectMerchants')}
        open={merchantModalVisible}
        onOk={() => {
          setMerchantModalVisible(false)
          form.setFieldsValue({ merchantIds: selectedMerchants })
        }}
        onCancel={() => setMerchantModalVisible(false)}
        width={800}
      >
        <div style={{ padding: '16px 0' }}>
          <Alert
            message={t('waterfall.selectMerchantTip')}
            type="info"
            showIcon
            style={{ marginBottom: 16 }}
          />
          <Table
            rowKey="id"
            columns={[
              { title: t('waterfall.colMerchantId'), dataIndex: 'id', width: 100 },
              { title: t('waterfall.colMerchantName'), dataIndex: 'name' },
              { title: t('waterfall.colRegion'), dataIndex: 'region' },
            ]}
            dataSource={[
              { id: 101, name: '商家A', region: '澳門' },
              { id: 102, name: '商家B', region: '氹仔' },
              { id: 103, name: '商家C', region: '珠海' },
            ]}
            rowSelection={{
              type: 'checkbox',
              selectedRowKeys: selectedMerchants,
              onChange: (selectedRowKeys) => setSelectedMerchants(selectedRowKeys as number[]),
            }}
            pagination={{ pageSize: 10 }}
          />
        </div>
      </Modal>

      {/* 查看详情弹窗 */}
      <Modal
        title={t('waterfall.configDetail')}
        open={detailVisible}
        onCancel={() => {
          setDetailVisible(false)
          setViewingRecord(null)
        }}
        footer={[
          <Button key="close" onClick={() => {
            setDetailVisible(false)
            setViewingRecord(null)
          }}>
            {t('common.close')}
          </Button>,
        ]}
        width={800}
      >
        {viewingRecord && (
          <>
            <Descriptions bordered column={2} size="small">
              <Descriptions.Item label={t('common.colBrand')} span={2}>
                <BrandTag value={viewingRecord.app} />
              </Descriptions.Item>
              <Descriptions.Item label={t('waterfall.placementPage')}>
                {CHANNEL_LABEL[viewingRecord.channel]}
              </Descriptions.Item>
              <Descriptions.Item label={t('waterfall.colAlgorithmName')} span={2}>
                <strong>{viewingRecord.algorithmName}</strong>
              </Descriptions.Item>
              <Descriptions.Item label={t('waterfall.adType')}>
                <Tag color={ALGORITHM_TYPE_COLOR[viewingRecord.algorithmType]}>
                  {ALGORITHM_TYPE_LABEL[viewingRecord.algorithmType]}
                </Tag>
              </Descriptions.Item>
              <Descriptions.Item label={t('algorithm.colAlgorithmId')}>
                <code style={{ background: '#f5f5f5', padding: '2px 6px', borderRadius: 4 }}>
                  {String(viewingRecord.algorithmId).padStart(6, '0')}
                </code>
              </Descriptions.Item>
              <Descriptions.Item label={t('common.colStatus')} span={2}>
                <Badge
                  status={viewingRecord.status === ServiceStatus.ENABLED ? 'success' : 'default'}
                  text={viewingRecord.status === ServiceStatus.ENABLED ? t('common.enable') : t('common.disable')}
                />
              </Descriptions.Item>
            </Descriptions>

            <Divider orientation="left">{t('waterfall.keyParamsConfig')}</Divider>
            <Card size="small">
              <Descriptions column={1} size="small">
                {viewingRecord.purchaseLimit && (
                  <Descriptions.Item label={t('waterfall.purchaseLimit')}>
                    {t('waterfall.purchaseLimitDesc', { days: viewingRecord.purchaseLimit.days, quantity: viewingRecord.purchaseLimit.quantity })}
                  </Descriptions.Item>
                )}
                {viewingRecord.purchaseInterval && (
                  <Descriptions.Item label={t('waterfall.intervalDays')}>
                    {t('waterfall.intervalDaysDesc', { days: viewingRecord.purchaseInterval })}
                  </Descriptions.Item>
                )}
                <Descriptions.Item label={t('waterfall.merchantLimit')}>
                  <Tag color={viewingRecord.merchantLimit === 'limited' ? 'red' : 'green'}>
                    {viewingRecord.merchantLimit === 'limited' ? t('waterfall.limitedMerchants', { count: viewingRecord.merchantIds?.length || 0 }) : t('waterfall.unlimited')}
                  </Tag>
                  {viewingRecord.merchantLimit === 'limited' && viewingRecord.merchantIds && viewingRecord.merchantIds.length > 0 && (
                    <div style={{ marginTop: 8 }}>
                      {t('waterfall.selectedMerchantIds')}{viewingRecord.merchantIds.join(', ')}
                    </div>
                  )}
                </Descriptions.Item>
                <Descriptions.Item label={t('waterfall.salesRegion')}>
                  <Tag color={viewingRecord.regionLimit === 'limited' ? 'red' : 'green'}>
                    {viewingRecord.regionLimit === 'limited' ? t('waterfall.limitedRegions', { count: viewingRecord.regionIds?.length || 0 }) : t('waterfall.unlimited')}
                  </Tag>
                  {viewingRecord.regionLimit === 'limited' && viewingRecord.regionIds && viewingRecord.regionIds.length > 0 && (
                    <div style={{ marginTop: 8 }}>
                      {t('waterfall.selectedRegions')}{viewingRecord.regionIds.map(id => REGION_LABEL_KEY[id] ? t(REGION_LABEL_KEY[id]) : String(id)).join(', ')}
                    </div>
                  )}
                </Descriptions.Item>
              </Descriptions>
            </Card>

            <Divider orientation="left">{t('waterfall.updateInfo')}</Divider>
            <Descriptions bordered column={2} size="small">
              <Descriptions.Item label={t('waterfall.colLastUpdater')}>
                {viewingRecord.updatedBy}
              </Descriptions.Item>
              <Descriptions.Item label={t('waterfall.colLastUpdateTime')}>
                {viewingRecord.updatedAt}
              </Descriptions.Item>
              <Descriptions.Item label={t('waterfall.createdAt')} span={2}>
                {viewingRecord.createdAt}
              </Descriptions.Item>
            </Descriptions>
          </>
        )}
      </Modal>

    </div>
  )
}
