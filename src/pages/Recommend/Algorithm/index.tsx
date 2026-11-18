import { useState, useMemo, useEffect, useRef } from 'react'
import { Button, Space, Table, Tag, Card, Tabs, Modal, message, Switch, Form, Input, Select, DatePicker } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { PlusOutlined, ArrowLeftOutlined, AppstoreOutlined, ApartmentOutlined, SearchOutlined, ReloadOutlined } from '@ant-design/icons'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import dayjs from 'dayjs'
import { AlgorithmType, RecommendChannel, PlacementInterface, ServiceStatus, AppType, ALGO_CARD_COLOR_MAP, APP_OPTIONS, SERVICE_STATUS_OPTIONS } from '@mftb/contracts/recommendConstants'
import { fetchAdAlgorithms, updateAdAlgorithmStatus, deleteAdAlgorithm, fetchAlgorithmWaterfallReferences, brandToAppType, type AdAlgorithm, type WaterfallReference } from '@/api/adPromotion'
import { useColumnConfig } from '@/hooks/useColumnConfig'
import { useCardOrder, type CardDragProps } from '@/hooks/useCardOrder'
import { useAuth } from '@/contexts/AuthContext'
import BrandTag from '@/components/BrandTag'
import { HERO_CARD_STYLES, renderHeroMark } from '../../_shared/ad-promotion/heroCardStyles'

/** 各业务类型对应的算法类型列表 */
const TAB_ALGORITHM_MAP: Record<string, AlgorithmType[]> = {
  delivery: [
    AlgorithmType.INVINCIBLE_STAR,
    AlgorithmType.HOT_REVIVE_AD,
    AlgorithmType.NEW_STORE_AD,
    AlgorithmType.BRAND_MERCHANT,
    AlgorithmType.EXCLUSIVE_MERCHANT,
    AlgorithmType.GOLDEN_SIGNBOARD,
    AlgorithmType.TRAFFIC_AD,
    AlgorithmType.GUESS_YOU_LIKE,
    AlgorithmType.ORGANIC_TRAFFIC,
  ],
  /** 团购到店已下线盘活复苏入口（勿加回 HOT_REVIVE_AD）；投流/自然流量按 2026-11-18 用户要求加入团购 tab */
  groupBuy: [
    AlgorithmType.INVINCIBLE_STAR,
    AlgorithmType.TRAFFIC_AD,
    AlgorithmType.ORGANIC_TRAFFIC,
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

const { RangePicker } = DatePicker

/** 查询条件：字段与列表列一一对应，空值一律不参与过滤 */
interface AlgorithmSearchValues {
  code?: string
  name?: string
  brand?: AppType
  status?: ServiceStatus
  updatedBy?: string
  updatedAt?: [dayjs.Dayjs, dayjs.Dayjs]
}

/**
 * 按「选中类型 + 业务 Tab + 查询条件」过滤全量记录。
 * <p>抽成组件外纯函数：列表接口已一次性取回（size=500），查询只做前端过滤，
 * 过滤口径必须与挂载回调、切类型、重置三处完全一致，散落三份必然漂移。
 */
const filterRecords = (
  list: AlgorithmRecord[],
  type: AlgorithmType | null,
  businessType: 'delivery' | 'groupBuy',
  filters: AlgorithmSearchValues,
): AlgorithmRecord[] => {
  const keyword = (value?: string) => value?.trim().toLowerCase() ?? ''
  const code = keyword(filters.code)
  const name = keyword(filters.name)
  const updater = keyword(filters.updatedBy)
  const [updatedFrom, updatedTo] = filters.updatedAt ?? []
  return list.filter(item => {
    if (businessType === 'groupBuy' ? item.channel !== RecommendChannel.GROUP_BUY : item.channel === RecommendChannel.GROUP_BUY) return false
    if (type != null && item.type !== type) return false
    if (code && !item.code.toLowerCase().includes(code)) return false
    if (name && !item.name.toLowerCase().includes(name)) return false
    if (filters.brand != null && item.brand !== filters.brand) return false
    if (filters.status != null && item.status !== filters.status) return false
    if (updater && !keyword(item.updatedBy).includes(updater)) return false
    if (updatedFrom && updatedTo) {
      if (!item.updatedAt) return false
      const updated = dayjs(item.updatedAt)
      if (updated.isBefore(updatedFrom, 'day') || updated.isAfter(updatedTo, 'day')) return false
    }
    return true
  })
}

export default function Algorithm() {
  const navigate = useNavigate()
  const { t } = useTranslation()
  const { hasMenuPermission } = useAuth()
  // 自然流量算法可直达商家权重分榜单；无榜单查看权限时不渲染该入口，避免点进去吃 403
  const canViewScoreBoard = hasMenuPermission('merchant-score-insight')
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

  const [searchForm] = Form.useForm()
  // 查询条件用 ref 保存：挂载回调与切类型都要带着它重算列表，放进 state 只会多一次无意义渲染
  const searchFiltersRef = useRef<AlgorithmSearchValues>({})
  /** 品牌 / 状态查询选项（复用列表列的枚举口径，不另造一份常量） */
  const tAppOptions = useMemo(() => APP_OPTIONS.map(o => ({ label: t(o.labelKey), value: o.value })), [t])
  const tServiceStatusOptions = useMemo(() => SERVICE_STATUS_OPTIONS.map(o => ({ label: t(o.labelKey), value: o.value })), [t])

  // 卡片拖拽排序（順序持久化到數據庫 + localStorage，每個 Tab 獨立保存）
  const deliveryCardOrder = useCardOrder('algorithm-card-order-delivery', TAB_ALGORITHM_MAP.delivery, 'algorithm')
  const groupBuyCardOrder = useCardOrder('algorithm-card-order-groupBuy', TAB_ALGORITHM_MAP.groupBuy, 'algorithm')

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
    [AlgorithmType.TIME_SLOT_AD]: t('algorithm.typeTimeSlotAd'),
  }
  /** 广告类型卡片配置（依赖 t，定义在组件内以便响应语言切换） */
  const ALGORITHM_TYPE_CARDS: { type: AlgorithmType; icon: string; description: string }[] = [
    { type: AlgorithmType.INVINCIBLE_STAR, icon: '⭐', description: t('algorithm.descInvincibleStar') },
    { type: AlgorithmType.HOT_REVIVE_AD, icon: '🔥', description: t('algorithm.descHotRevive') },
    { type: AlgorithmType.NEW_STORE_AD, icon: '🏪', description: t('algorithm.descNewStore') },
    { type: AlgorithmType.BRAND_MERCHANT, icon: '💎', description: t('algorithm.descBrandMerchant') },
    { type: AlgorithmType.EXCLUSIVE_MERCHANT, icon: '👑', description: t('algorithm.descExclusiveMerchant') },
    { type: AlgorithmType.GOLDEN_SIGNBOARD, icon: '🏅', description: t('algorithm.descGoldenSignboard') },
    { type: AlgorithmType.TRAFFIC_AD, icon: '📊', description: t('algorithm.descTraffic') },
    { type: AlgorithmType.GUESS_YOU_LIKE, icon: '💡', description: t('algorithm.descGuessYouLike') },
    { type: AlgorithmType.ORGANIC_TRAFFIC, icon: '🌿', description: t('algorithm.descOrganicTraffic') },
  ]

  const [filteredData, setFilteredData] = useState<AlgorithmRecord[]>(
    initialType ? filterRecords(dataList, initialType, tabParam || 'delivery', {}) : dataList
  )

  /** 加載算法列表 */
  useEffect(() => {
    let mounted = true
    fetchAdAlgorithms({ page: 1, size: 500 })
      .then(res => {
        if (!mounted) return
        const list = (res.records ?? []).map(toAlgorithmRecord)
        setDataList(list)
        // 按当前选中的类型、业务 Tab 与查询条件重算列表（均用 ref 取最新值，避免闭包过期）
        setFilteredData(filterRecords(list, selectedTypeRef.current, businessTypeRef.current, searchFiltersRef.current))
      })
      .catch(() => {})
    return () => { mounted = false }
     
  }, [])

  // 点击卡片 → 进入列表（同步 type/tab 到 URL，使小蜜蜂 PRD 切换到列表界面）
  const handleSelectType = (type: AlgorithmType, tab: 'delivery' | 'groupBuy') => {
    setSelectedType(type)
    setBusinessType(tab)
    // 同步更新 ref，確保 API 回調不會覆蓋當前選擇
    selectedTypeRef.current = type
    businessTypeRef.current = tab
    // 切换类型即换了一批数据口径，上一次的查询条件必须清空，否则会带着旧条件过滤新列表
    searchForm.resetFields()
    searchFiltersRef.current = {}
    setFilteredData(filterRecords(dataList, type, tab, {}))
    setSearchParams({ type: String(type), tab }, { replace: true })
  }

  /** 查询：只过滤已加载的记录，不重新发请求（列表口径与卡片入口由 type/tab 决定） */
  const handleSearch = (values: AlgorithmSearchValues) => {
    searchFiltersRef.current = values
    setFilteredData(filterRecords(dataList, selectedTypeRef.current, businessTypeRef.current, values))
  }

  /** 重置：清空条件并回到当前类型 + 业务 Tab 的完整列表 */
  const handleReset = () => {
    searchForm.resetFields()
    searchFiltersRef.current = {}
    setFilteredData(filterRecords(dataList, selectedTypeRef.current, businessTypeRef.current, {}))
  }

  // 返回卡片选择页（清空 URL 参数，使小蜜蜂 PRD 切回卡片展示界面）
  const handleBackToCards = () => {
    setSelectedType(null)
    searchForm.resetFields()
    searchFiltersRef.current = {}
    setFilteredData(dataList)
    setBusinessType('delivery')
    selectedTypeRef.current = null
    businessTypeRef.current = 'delivery'
    setSearchParams({}, { replace: true })
  }

  // 启用/停用算法
  const handleToggleStatus = async (record: AlgorithmRecord) => {
    const newStatus = record.status === ServiceStatus.ENABLED ? ServiceStatus.DISABLED : ServiceStatus.ENABLED
    const actionText = newStatus === ServiceStatus.ENABLED ? t('common.enable') : t('common.disable')

    // 停用时先检查瀑布流引用
    let references: WaterfallReference[] = []
    if (newStatus === ServiceStatus.DISABLED) {
      try {
        references = await fetchAlgorithmWaterfallReferences(record.id)
      } catch {
        // 查询失败继续执行，不阻止操作
      }
    }

    const showConfirm = (refs: WaterfallReference[]) => {
      const hasRefs = refs.length > 0
      // 按策略分组显示
      const groupedRefs = refs.reduce((acc, ref) => {
        const key = `${ref.strategyCode}|${ref.strategyName}`
        if (!acc[key]) acc[key] = { strategyCode: ref.strategyCode, strategyName: ref.strategyName, positions: [] }
        acc[key].positions.push(ref.slotPosition)
        return acc
      }, {} as Record<string, { strategyCode: string; strategyName: string; positions: number[] }>)
      const groupedList = Object.values(groupedRefs)

      Modal.confirm({
        className: 'custom-confirm-modal',
        icon: <div className="confirm-icon-wrapper"><span className="confirm-icon-text">!</span></div>,
        title: t('algorithm.confirmToggleTitle', { action: actionText }),
        content: (
          <div>
            <p>{t('algorithm.confirmToggleContent', { action: actionText, name: record.name })}</p>
            {hasRefs && (
              <>
                <p style={{ color: 'var(--warning)', fontWeight: 500, marginTop: 12 }}>
                  {t('algorithm.waterfallRefWarning')}
                </p>
                <div style={{ maxHeight: 200, overflowY: 'auto', background: 'var(--warning-soft)', borderRadius: 6, padding: '8px 12px', marginTop: 8 }}>
                  {groupedList.map((g, i) => (
                    <div key={i} style={{ fontSize: 12, color: 'var(--text-2)', marginBottom: 4 }}>
                      <code style={{ background: 'var(--surface-1)', padding: '1px 4px', borderRadius: 3 }}>{g.strategyCode}</code>
                      {' '}{g.strategyName}（{t('algorithm.affectedSlots', { positions: g.positions.join(', ') })}）
                    </div>
                  ))}
                </div>
                <p style={{ color: 'var(--danger)', fontSize: 12, marginTop: 8 }}>
                  {t('algorithm.waterfallRefImpact')}
                </p>
              </>
            )}
          </div>
        ),
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

    showConfirm(references)
  }

  // 删除算法
  const handleDelete = async (record: AlgorithmRecord) => {
    // 先检查瀑布流引用
    let references: WaterfallReference[] = []
    try {
      references = await fetchAlgorithmWaterfallReferences(record.id)
    } catch {
      // 查询失败继续执行，不阻止操作
    }

    // 按策略分组显示
    const groupedRefs = references.reduce((acc, ref) => {
      const key = `${ref.strategyCode}|${ref.strategyName}`
      if (!acc[key]) acc[key] = { strategyCode: ref.strategyCode, strategyName: ref.strategyName, positions: [] }
      acc[key].positions.push(ref.slotPosition)
      return acc
    }, {} as Record<string, { strategyCode: string; strategyName: string; positions: number[] }>)
    const groupedList = Object.values(groupedRefs)
    const hasRefs = references.length > 0

    Modal.confirm({
      className: 'custom-confirm-modal',
      icon: <div className="confirm-icon-wrapper"><span className="confirm-icon-text">!</span></div>,
      title: t('common.confirmDelete'),
      content: (
        <div>
          <p>{t('algorithm.confirmDeleteContent', { name: record.name })}</p>
          {hasRefs && (
            <>
              <p style={{ color: 'var(--warning)', fontWeight: 500, marginTop: 12 }}>
                {t('algorithm.waterfallRefWarning')}
              </p>
              <div style={{ maxHeight: 200, overflowY: 'auto', background: 'var(--warning-soft)', borderRadius: 6, padding: '8px 12px', marginTop: 8 }}>
                {groupedList.map((g, i) => (
                  <div key={i} style={{ fontSize: 12, color: 'var(--text-2)', marginBottom: 4 }}>
                    <code style={{ background: 'var(--surface-1)', padding: '1px 4px', borderRadius: 3 }}>{g.strategyCode}</code>
                    {' '}{g.strategyName}（{t('algorithm.affectedSlots', { positions: g.positions.join(', ') })}）
                  </div>
                ))}
              </div>
              <p style={{ color: 'var(--danger)', fontSize: 12, marginTop: 8 }}>
                {t('algorithm.waterfallRefImpact')}
              </p>
            </>
          )}
        </div>
      ),
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
      render: (_: unknown, record: AlgorithmRecord) => (
        <Switch
          checked={record.status === ServiceStatus.ENABLED}
          checkedChildren={t('common.enable')}
          unCheckedChildren={t('common.disable')}
          onChange={() => handleToggleStatus(record)}
        />
      ),
    },
    {
      title: t('algorithm.colLastUpdater'), dataIndex: 'updatedBy', key: 'updatedBy', width: 120,
      render: (v: string) => <span style={{ whiteSpace: 'nowrap' }}>{v || '-'}</span>,
    },
    {
      title: t('algorithm.colLastUpdateTime'), dataIndex: 'updatedAt', key: 'updatedAt', width: 180,
      render: (v: string) => <span style={{ whiteSpace: 'nowrap' }}>{v || '-'}</span>,
    },
    {
      title: t('common.colAction'), key: 'action', width: 260,
      render: (_, record) => (
        <Space size={0} split={<span className="action-split">|</span>}>
          {/* 自然流量算法的计分结果在商家权重分查看：无论是否已绑定瀑布流都可出榜 */}
          {record.type === AlgorithmType.ORGANIC_TRAFFIC && canViewScoreBoard && (
            <Button type="link" size="small" onClick={() => navigate(`/merchant-score-insight?algo=${encodeURIComponent(record.code)}`)}>{t('algorithm.btnScoreResult')}</Button>
          )}
          <Button type="link" size="small" onClick={() => handleViewDetail(record)}>{t('common.detail')}</Button>
          <Button type="link" size="small" onClick={() => navigate(`/promotion-algorithm-add?type=${record.type}&id=${record.id}&tab=${businessType}`)}>{t('common.edit')}</Button>
          <Button type="link" size="small" danger onClick={() => handleDelete(record)}>
            {t('common.delete')}
          </Button>
        </Space>
      ),
    },
  ]

  /** 渲染算法类型卡片（带高级 hover 动效，支持拖拽交换位置） */
  const renderAlgoCard = (card: { type: AlgorithmType; icon: string; description: string }, enabled: boolean, tab: 'delivery' | 'groupBuy', dragProps: CardDragProps) => {
    /** 设计师款 hero 卡（美食外卖 tab 全类型）：查 HERO_CARD_STYLES 命中即走新样式。
     *  约束：底部动作沿用算法库自身的 Tag（不得换成广告销售的 查看訂單/購買廣告 按钮）；
     *  渐变底色是品牌装饰面（不随主题翻面），色值按既有先例写在渐变串内联
     *  （同文件页面头部渐变同模式；渐变串内色值不进 cssHex/inlineHex 棘轮口径）。 */
    const hero = HERO_CARD_STYLES[card.type]
    return (
    <div
      key={card.type}
      className={`algo-card-wrapper${hero ? ` algo-card-hero algo-card-hero--${hero.variant}` : ` algo-card-wrapper--${ALGO_CARD_COLOR_MAP[card.type]}`}${!enabled ? ' disabled' : ''}`}
      onClick={() => enabled && handleSelectType(card.type, tab)}
      {...dragProps}
    >
      <div
        className="algo-card-inner"
        style={hero ? { background: hero.gradient } : undefined}
      >
        <div className="algo-card-icon">
          {hero ? (
            renderHeroMark(card.type)
          ) : (
            <>
              {card.icon}
              {card.type === AlgorithmType.NEW_STORE_AD && <span style={{ fontSize: 24, verticalAlign: 'top', marginLeft: 2 }}>✨</span>}
            </>
          )}
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
  }

  // ===== Step 1: 卡片选择页 =====
  if (selectedType === null) {
    return (
      <div className="content-area">
      <div style={{
        position: 'relative', background: 'var(--surface-2)', marginBottom: 16,
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
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: 'var(--info)' }}>
              <AppstoreOutlined style={{ marginRight: 8 }} />
              {t('algorithm.algorithmLibrary')}
            </h2>
            <p style={{ margin: '6px 0 0', color: 'var(--text-3)', fontSize: 12 }}>
              {t('algorithm.algorithmLibraryDesc')}
            </p>
          </div>
          <Button type="primary" icon={<ApartmentOutlined />}
            onClick={() => navigate('/promotion-algorithm-flow')}
            style={{
              backgroundColor: 'var(--brand)', borderColor: 'var(--brand)',
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
                  <div className="algo-card-stage" style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
                    gap: 16,
                  }}>
                    {deliveryCardOrder.sortCards(
                      ALGORITHM_TYPE_CARDS.filter(card => TAB_ALGORITHM_MAP.delivery.includes(card.type)),
                      card => card.type,
                    ).map(card => {
                        const enabled = card.type === AlgorithmType.INVINCIBLE_STAR || card.type === AlgorithmType.HOT_REVIVE_AD || card.type === AlgorithmType.NEW_STORE_AD || card.type === AlgorithmType.EXCLUSIVE_MERCHANT || card.type === AlgorithmType.BRAND_MERCHANT || card.type === AlgorithmType.ORGANIC_TRAFFIC || card.type === AlgorithmType.GUESS_YOU_LIKE || card.type === AlgorithmType.GOLDEN_SIGNBOARD || card.type === AlgorithmType.TRAFFIC_AD || card.type === AlgorithmType.POPULAR_MERCHANT_KA
                        return renderAlgoCard(card, enabled, 'delivery', deliveryCardOrder.getDragProps(card.type))
                      })}
                  </div>
                ),
              },
              {
                key: 'groupBuy',
                label: t('algorithm.bizGroupBuy'),
                children: (
                  <div className="algo-card-stage" style={{
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
        position: 'relative', background: 'var(--surface-2)', marginBottom: 16,
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
                backgroundColor: 'var(--brand)', borderColor: 'var(--brand)',
                borderRadius: 8, height: 36, padding: '0 16px',
                display: 'flex', alignItems: 'center', gap: 6,
                boxShadow: '0 2px 6px rgba(232,114,12,0.25)',
                transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
              }}
            >{t('common.back')}</Button>
            <div style={{ width: 1, height: 20, background: '#E8E8E8' }} />
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: 'var(--info)' }}>{t('algorithm.algorithmList')}</h2>
              {selectedType != null && (
                <span style={{ fontSize: 14, color: 'var(--text-2)' }}>
                  {selectedTypeCard?.icon} {TYPE_LABEL[selectedType]}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* 查询区域 */}
      <div className="search-section">
        <Form layout="inline" form={searchForm} onFinish={handleSearch}>
          <Form.Item label={t('algorithm.colAlgorithmId')} name="code">
            <Input placeholder={t('waterfall.placeholderSearch')} allowClear />
          </Form.Item>
          <Form.Item label={t('algorithm.colAlgorithmName')} name="name">
            <Input placeholder={t('waterfall.placeholderSearch')} allowClear />
          </Form.Item>
          <Form.Item label={t('common.colBrand')} name="brand">
            <Select placeholder={t('common.all')} options={tAppOptions} allowClear />
          </Form.Item>
          <Form.Item label={t('common.colStatus')} name="status">
            <Select placeholder={t('common.all')} options={tServiceStatusOptions} allowClear />
          </Form.Item>
          <Form.Item label={t('algorithm.colLastUpdater')} name="updatedBy">
            <Input placeholder={t('waterfall.placeholderSearch')} allowClear />
          </Form.Item>
          <Form.Item label={t('algorithm.colLastUpdateTime')} name="updatedAt">
            <RangePicker placeholder={[t('common.startDate'), t('common.endDate')]} allowClear />
          </Form.Item>
          <Form.Item>
            <div className="search-actions">
              <Button type="primary" htmlType="submit" icon={<SearchOutlined />}>{t('common.search')}</Button>
              <Button icon={<ReloadOutlined />} onClick={handleReset}>{t('common.reset')}</Button>
            </div>
          </Form.Item>
        </Form>
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
