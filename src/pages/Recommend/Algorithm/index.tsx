import { useState, useMemo, useEffect, useRef } from 'react'
import { Button, Space, Table, Tag, Card, Tabs, Modal, message } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { PlusOutlined, ArrowLeftOutlined, AppstoreOutlined, ApartmentOutlined } from '@ant-design/icons'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import dayjs from 'dayjs'
import { AlgorithmType, RecommendChannel, PlacementInterface, ServiceStatus, AppType, ALGO_CARD_COLOR_MAP } from '../constants'
import { fetchAdAlgorithms, updateAdAlgorithmStatus, deleteAdAlgorithm, brandToAppType, type AdAlgorithm } from '../../../api/adPromotion'
import { useColumnConfig } from '../../../hooks/useColumnConfig'
import { useCardOrder, type CardDragProps } from '../../../hooks/useCardOrder'
import BrandTag from '../../../components/BrandTag'

/** 各业务类型对应的算法类型列表 */
const TAB_ALGORITHM_MAP: Record<string, AlgorithmType[]> = {
  delivery: [
    AlgorithmType.INVINCIBLE_STAR,
    AlgorithmType.HOT_REVIVE_AD,
    AlgorithmType.NEW_STORE_AD,
    AlgorithmType.BRAND_MERCHANT,
    AlgorithmType.GOLD_AD,
    AlgorithmType.EXCLUSIVE_MERCHANT,
    AlgorithmType.TRAFFIC_AD,
    AlgorithmType.GUESS_YOU_LIKE,
    AlgorithmType.ORGANIC_TRAFFIC,
    AlgorithmType.GOLDEN_SIGNBOARD,
    AlgorithmType.PRODUCT_PROMO,
  ],
  groupBuy: [
    AlgorithmType.INVINCIBLE_STAR,
    AlgorithmType.HOT_REVIVE_AD,
  ],
}

export interface AlgorithmRecord {
  id: number
  name: string
  code: string
  type: AlgorithmType
  channel: RecommendChannel
  placementInterface?: PlacementInterface  // 投放界面
  brand?: AppType  // 所属品牌
  status: ServiceStatus
  slotCount: number
  updatedBy?: string
  updatedAt?: string
}

/** 後端算法 VO → 前端列表記錄 */
const toAlgorithmRecord = (vo: AdAlgorithm): AlgorithmRecord => ({
  id: vo.id ?? 0,
  name: vo.algoName,
  code: vo.algoCode,
  type: vo.algoType as AlgorithmType,
  channel: (vo.channel ?? RecommendChannel.DELIVERY) as RecommendChannel,
  placementInterface: vo.placementInterface as PlacementInterface | undefined,
  brand: brandToAppType(vo.brand),
  status: (vo.status ?? ServiceStatus.ENABLED) as ServiceStatus,
  slotCount: vo.slotCount ?? 0,
  updatedBy: vo.updatedBy,
  updatedAt: vo.updatedAt ? dayjs(vo.updatedAt).format('YYYY-MM-DD HH:mm:ss') : undefined,
})

export default function Algorithm() {
  const navigate = useNavigate()
  const { t } = useTranslation()
  const [searchParams, setSearchParams] = useSearchParams()

  // 从 URL 参数恢复列表状态（从新增页返回时）
  const typeParam = searchParams.get('type')
  const tabParam = searchParams.get('tab') as 'delivery' | 'groupBuy' | null
  const initialType = typeParam ? Number(typeParam) as AlgorithmType : null
  const [selectedType, setSelectedType] = useState<AlgorithmType | null>(initialType)
  const [businessType, setBusinessType] = useState<'delivery' | 'groupBuy'>(tabParam || 'delivery')
  const [dataList, setDataList] = useState<AlgorithmRecord[]>([])
  // 用 ref 追蹤當前選中類型，避免 async 回調中的閉包過期問題
  const selectedTypeRef = useRef<AlgorithmType | null>(initialType)
  const businessTypeRef = useRef<'delivery' | 'groupBuy'>(tabParam || 'delivery')

  // 卡片拖拽排序（順序持久化到 localStorage，每個 Tab 獨立保存）
  const deliveryCardOrder = useCardOrder('algorithm-card-order-delivery', TAB_ALGORITHM_MAP.delivery)
  const groupBuyCardOrder = useCardOrder('algorithm-card-order-groupBuy', TAB_ALGORITHM_MAP.groupBuy)

  /** 算法类型标签映射（依赖 t，定义在组件内以便响应语言切换） */
  const TYPE_LABEL: Record<AlgorithmType, string> = {
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
  /** 广告类型卡片配置（依赖 t，定义在组件内以便响应语言切换） */
  const ALGORITHM_TYPE_CARDS: { type: AlgorithmType; icon: string; description: string }[] = [
    { type: AlgorithmType.INVINCIBLE_STAR, icon: '⭐', description: t('algorithm.descInvincibleStar') },
    { type: AlgorithmType.HOT_REVIVE_AD, icon: '🔥', description: t('algorithm.descHotRevive') },
    { type: AlgorithmType.NEW_STORE_AD, icon: '🏪', description: t('algorithm.descNewStore') },
    { type: AlgorithmType.BRAND_MERCHANT, icon: '💎', description: t('algorithm.descBrandMerchant') },
    { type: AlgorithmType.GOLD_AD, icon: '💰', description: t('algorithm.descGoldAd') },
    { type: AlgorithmType.EXCLUSIVE_MERCHANT, icon: '👑', description: t('algorithm.descExclusiveMerchant') },
    { type: AlgorithmType.TRAFFIC_AD, icon: '📊', description: t('algorithm.descTraffic') },
    { type: AlgorithmType.GUESS_YOU_LIKE, icon: '💡', description: t('algorithm.descGuessYouLike') },
    { type: AlgorithmType.ORGANIC_TRAFFIC, icon: '🌿', description: t('algorithm.descOrganicTraffic') },
    { type: AlgorithmType.GOLDEN_SIGNBOARD, icon: '🏅', description: t('algorithm.descGoldenSignboard') },
    { type: AlgorithmType.PRODUCT_PROMO, icon: '🎯', description: t('algorithm.descProductPromo') },
  ]

  /** 根据业务类型过滤数据 */
  const filterByBusinessType = (data: AlgorithmRecord[]) => {
    if (businessType === 'groupBuy') {
      return data.filter(item => item.channel === RecommendChannel.GROUP_BUY)
    }
    return data.filter(item => item.channel !== RecommendChannel.GROUP_BUY)
  }

  const [filteredData, setFilteredData] = useState<AlgorithmRecord[]>(
    initialType ? filterByBusinessType(dataList.filter(item => item.type === initialType)) : dataList
  )

  /** 加載算法列表 */
  useEffect(() => {
    let mounted = true
    fetchAdAlgorithms({ page: 1, size: 500 })
      .then(res => {
        if (!mounted) return
        const list = (res.records ?? []).map(toAlgorithmRecord)
        setDataList(list)
        // 按當前選中的類型過濾（用 ref 獲取最新值，避免閉包過期）
        const curType = selectedTypeRef.current
        const curBiz = businessTypeRef.current
        let filtered = list
        if (curType) {
          filtered = filtered.filter(item => item.type === curType)
        }
        if (curBiz === 'groupBuy') {
          filtered = filtered.filter(item => item.channel === RecommendChannel.GROUP_BUY)
        } else {
          filtered = filtered.filter(item => item.channel !== RecommendChannel.GROUP_BUY)
        }
        setFilteredData(filtered)
      })
      .catch(() => {})
    return () => { mounted = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 点击卡片 → 进入列表（同步 type/tab 到 URL，使小蜜蜂 PRD 切换到列表界面）
  const handleSelectType = (type: AlgorithmType, tab: 'delivery' | 'groupBuy') => {
    setSelectedType(type)
    setBusinessType(tab)
    // 同步更新 ref，確保 API 回調不會覆蓋當前選擇
    selectedTypeRef.current = type
    businessTypeRef.current = tab
    const data = filterByBusinessType(dataList.filter(item => item.type === type))
    setFilteredData(data)
    setSearchParams({ type: String(type), tab }, { replace: true })
  }

  // 返回卡片选择页（清空 URL 参数，使小蜜蜂 PRD 切回卡片展示界面）
  const handleBackToCards = () => {
    setSelectedType(null)
    setFilteredData(dataList)
    setBusinessType('delivery')
    selectedTypeRef.current = null
    businessTypeRef.current = 'delivery'
    setSearchParams({}, { replace: true })
  }

  // 启用/停用算法
  const handleToggleStatus = (record: AlgorithmRecord) => {
    const newStatus = record.status === ServiceStatus.ENABLED ? ServiceStatus.DISABLED : ServiceStatus.ENABLED
    const actionText = newStatus === ServiceStatus.ENABLED ? t('common.enable') : t('common.disable')
    Modal.confirm({
      title: t('algorithm.confirmToggleTitle', { action: actionText }),
      content: t('algorithm.confirmToggleContent', { action: actionText, name: record.name }),
      okText: t('common.confirm'),
      cancelText: t('common.cancel'),
      onOk: async () => {
        try {
          await updateAdAlgorithmStatus(record.id, newStatus)
        } catch (err) {
          message.error((err as Error).message || t('algorithm.toggleFailed', { action: actionText }))
          return
        }
        setDataList(prev => prev.map(item => item.id === record.id ? { ...item, status: newStatus } : item))
        setFilteredData(prev => prev.map(item => item.id === record.id ? { ...item, status: newStatus } : item))
        message.success(t('algorithm.toggleSuccess', { action: actionText, name: record.name }))
      },
    })
  }

  // 删除算法
  const handleDelete = (record: AlgorithmRecord) => {
    Modal.confirm({
      title: t('common.confirmDelete'),
      content: t('algorithm.confirmDeleteContent', { name: record.name }),
      okText: t('common.confirm'),
      cancelText: t('common.cancel'),
      okButtonProps: { danger: true },
      onOk: async () => {
        try {
          await deleteAdAlgorithm(record.id)
        } catch (err) {
          message.error((err as Error).message || t('algorithm.deleteFailed'))
          return
        }
        setDataList(prev => prev.filter(item => item.id !== record.id))
        setFilteredData(prev => prev.filter(item => item.id !== record.id))
        message.success(t('common.deleteSuccess'))
      },
    })
  }

  // 查看详情（跳转只读详情页）
  const handleViewDetail = (record: AlgorithmRecord) => {
    navigate(`/promotion-algorithm-add?type=${record.type}&id=${record.id}&tab=${businessType}&mode=detail`)
  }

  // 跳转到新增页面（携带当前算法类型和业务类型）
  const handleGoToAdd = () => {
    navigate(`/promotion-algorithm-add?type=${selectedType}&tab=${businessType}`)
  }

  // 当前选中的类型信息
  const selectedTypeCard = ALGORITHM_TYPE_CARDS.find(c => c.type === selectedType)

  /** 列配置元数据 */
  const columnMeta = useMemo(() => [
    { key: 'code', title: t('algorithm.colAlgorithmId') },
    { key: 'name', title: t('algorithm.colAlgorithmName') },
    { key: 'brand', title: t('common.colBrand') },
    { key: 'status', title: t('common.colStatus') },
    { key: 'updatedBy', title: t('algorithm.colLastUpdater') },
    { key: 'updatedAt', title: t('algorithm.colLastUpdateTime') },
    { key: 'action', title: t('common.colAction') },
  ], [t])

  const { configComponent, applyConfig } = useColumnConfig('algorithm', columnMeta, [
    { key: 'action', visible: true, locked: 'tail' as const },
  ])

  const columns: ColumnsType<AlgorithmRecord> = [
    { title: t('algorithm.colAlgorithmId'), dataIndex: 'code', key: 'code', width: 120, render: (v) => <Tag color="blue">{v}</Tag> },
    { title: t('algorithm.colAlgorithmName'), dataIndex: 'name', key: 'name', width: 200 },
    {
      title: t('common.colBrand'), dataIndex: 'brand', key: 'brand', width: 100,
      render: (v: AppType) => v ? <BrandTag value={v} /> : '-',
    },
    {
      title: t('common.colStatus'), dataIndex: 'status', key: 'status', width: 100,
      render: (v: ServiceStatus) => (
        <Tag color={v === ServiceStatus.ENABLED ? 'success' : 'default'}>
          {v === ServiceStatus.ENABLED ? t('common.enable') : t('common.disable')}
        </Tag>
      ),
    },
    {
      title: t('algorithm.colLastUpdater'), dataIndex: 'updatedBy', key: 'updatedBy', width: 120,
      render: (v: string) => <span style={{ whiteSpace: 'nowrap' }}>{v || '-'}</span>,
    },
    {
      title: t('algorithm.colLastUpdateTime'), dataIndex: 'updatedAt', key: 'updatedAt', width: 170,
      render: (v: string) => <span style={{ whiteSpace: 'nowrap' }}>{v || '-'}</span>,
    },
    {
      title: t('common.colAction'), key: 'action', width: 280,
      render: (_, record) => (
        <Space size={0} split={<span style={{ color: '#d9d9d9' }}>|</span>}>
          <Button type="link" size="small" onClick={() => handleViewDetail(record)}>{t('common.detail')}</Button>
          <Button type="link" size="small" onClick={() => navigate(`/promotion-algorithm-add?type=${record.type}&id=${record.id}&tab=${businessType}`)}>{t('common.edit')}</Button>
          <Button type="link" size="small" danger={record.status === ServiceStatus.ENABLED} style={record.status !== ServiceStatus.ENABLED ? { color: '#52c41a' } : undefined} onClick={() => handleToggleStatus(record)}>
            {record.status === ServiceStatus.ENABLED ? t('common.disable') : t('common.enable')}
          </Button>
          <Button type="link" size="small" danger onClick={() => handleDelete(record)}>
            {t('common.delete')}
          </Button>
        </Space>
      ),
    },
  ]

  /** 渲染算法类型卡片（带高级 hover 动效，支持拖拽交换位置） */
  const renderAlgoCard = (card: { type: AlgorithmType; icon: string; description: string }, enabled: boolean, tab: 'delivery' | 'groupBuy', dragProps: CardDragProps) => (
    <div
      key={card.type}
      className={`algo-card-wrapper algo-card-wrapper--${ALGO_CARD_COLOR_MAP[card.type]}${!enabled ? ' disabled' : ''}`}
      onClick={() => enabled && handleSelectType(card.type, tab)}
      {...dragProps}
    >
      <div className="algo-card-inner">
        <div className="algo-card-icon">
          {card.icon}
          {card.type === AlgorithmType.NEW_STORE_AD && <span style={{ fontSize: 24, verticalAlign: 'top', marginLeft: 2 }}>✨</span>}
        </div>
        <h3 className="algo-card-title">{TYPE_LABEL[card.type]}</h3>
        <p className="algo-card-desc">{card.description}</p>
        <div className="algo-card-tag">
          {enabled ? (
            <Tag color="blue">{t('algorithm.viewAdjustAlgorithm')}</Tag>
          ) : (
            <Tag color="default">{t('algorithm.comingSoon')}</Tag>
          )}
        </div>
      </div>
    </div>
  )

  // ===== Step 1: 卡片选择页 =====
  if (selectedType === null) {
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
              <AppstoreOutlined style={{ marginRight: 8 }} />
              {t('algorithm.algorithmLibrary')}
            </h2>
            <p style={{ margin: '6px 0 0', color: '#8c8c8c', fontSize: 12 }}>
              {t('algorithm.algorithmLibraryDesc')}
            </p>
          </div>
          <Button type="primary" icon={<ApartmentOutlined />}
            onClick={() => navigate('/promotion-algorithm-flow')}
            style={{
              backgroundColor: '#E8720C', borderColor: '#E8720C',
              borderRadius: 8, height: 36, padding: '0 18px',
              boxShadow: '0 2px 6px rgba(232,114,12,0.25)',
            }}
          >{t('algorithm.businessFlow')}</Button>
        </div>
      </div>

        <Card style={{ marginBottom: 16 }} bodyStyle={{ padding: '5px 24px' }}>
          <Tabs
            defaultActiveKey="delivery"
            items={[
              {
                key: 'delivery',
                label: t('algorithm.bizDelivery'),
                children: (
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
                    gap: 16,
                  }}>
                    {deliveryCardOrder.sortCards(
                      ALGORITHM_TYPE_CARDS.filter(card => TAB_ALGORITHM_MAP.delivery.includes(card.type)),
                      card => card.type,
                    ).map(card => {
                        const enabled = card.type === AlgorithmType.INVINCIBLE_STAR || card.type === AlgorithmType.HOT_REVIVE_AD || card.type === AlgorithmType.NEW_STORE_AD || card.type === AlgorithmType.EXCLUSIVE_MERCHANT || card.type === AlgorithmType.BRAND_MERCHANT || card.type === AlgorithmType.ORGANIC_TRAFFIC || card.type === AlgorithmType.GUESS_YOU_LIKE
                        return renderAlgoCard(card, enabled, 'delivery', deliveryCardOrder.getDragProps(card.type))
                      })}
                  </div>
                ),
              },
              {
                key: 'groupBuy',
                label: t('algorithm.bizGroupBuy'),
                children: (
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
                    gap: 16,
                  }}>
                    {groupBuyCardOrder.sortCards(
                      ALGORITHM_TYPE_CARDS.filter(card => TAB_ALGORITHM_MAP.groupBuy.includes(card.type)),
                      card => card.type,
                    ).map(card => renderAlgoCard(card, true, 'groupBuy', groupBuyCardOrder.getDragProps(card.type)))}
                  </div>
                ),
              },
            ]}
          />
        </Card>
      </div>
    )
  }

  // ===== Step 2: 列表页 =====
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
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#1890ff' }}>{t('algorithm.algorithmList')}</h2>
              {selectedType != null && (
                <span style={{ fontSize: 14, color: '#595959' }}>
                  {selectedTypeCard?.icon} {TYPE_LABEL[selectedType]}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* 功能区域 */}
      <div className="action-section">
        <Space>
          <Button type="primary" icon={<PlusOutlined />} onClick={handleGoToAdd}>{t('algorithm.addAlgorithm')}</Button>
        </Space>
        {configComponent}
      </div>

      {/* 列表区域 */}
      <div className="table-section">
        <Table<AlgorithmRecord>
          rowKey="id"
          columns={applyConfig(columns)}
          dataSource={filteredData}
          pagination={{
            pageSize: 10,
            showTotal: (total) => t('common.total', { count: total }),
            showSizeChanger: true,
            pageSizeOptions: ['10', '20', '50'],
            showQuickJumper: true,
          }}
        />
      </div>
    </div>
  )
}
