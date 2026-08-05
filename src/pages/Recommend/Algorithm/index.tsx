import { useState, useMemo, useEffect } from 'react'
import { Button, Space, Table, Tag, Card, Tabs, Modal, message } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { PlusOutlined, ArrowLeftOutlined, AppstoreOutlined, ApartmentOutlined } from '@ant-design/icons'
import { useNavigate, useSearchParams } from 'react-router-dom'
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
    AlgorithmType.POPULAR_MERCHANT_KA,
    AlgorithmType.BRAND_MERCHANT,
    AlgorithmType.GOLD_AD,
    AlgorithmType.EXCLUSIVE_MERCHANT,
    AlgorithmType.TRAFFIC_AD,
    AlgorithmType.GUESS_YOU_LIKE,
    AlgorithmType.ORGANIC_TRAFFIC,
    AlgorithmType.SEARCH_ALGORITHM,
    AlgorithmType.GOLDEN_SIGNBOARD,
    AlgorithmType.PRODUCT_PROMO,
  ],
  groupBuy: [
    AlgorithmType.INVINCIBLE_STAR,
    AlgorithmType.HOT_REVIVE_AD,
  ],
}

/** 广告类型卡片配置 */
const ALGORITHM_TYPE_CARDS: { type: AlgorithmType; icon: string; description: string }[] = [
  { type: AlgorithmType.INVINCIBLE_STAR, icon: '⭐', description: '超級曝光位，首頁頂部黃金坑位，強勢引流' },
  { type: AlgorithmType.HOT_REVIVE_AD, icon: '🔥', description: '盤活熱門商家流量，提升店鋪曝光' },
  { type: AlgorithmType.NEW_STORE_AD, icon: '🏪', description: '新店專屬推廣位，快速獲取首批顧客' },
  { type: AlgorithmType.POPULAR_MERCHANT_KA, icon: '🏆', description: '人氣商家專屬推薦位，流量加持' },
  { type: AlgorithmType.BRAND_MERCHANT, icon: '💎', description: '品牌商家專屬展示位，KA商家尊享' },
  { type: AlgorithmType.GOLD_AD, icon: '💰', description: '點金廣告，精準投放高效轉化' },
  { type: AlgorithmType.EXCLUSIVE_MERCHANT, icon: '👑', description: '獨家商家專屬展示位，彰顯品牌實力' },
  { type: AlgorithmType.TRAFFIC_AD, icon: '📊', description: '精準流量投放，覆蓋目標用戶群體' },
  { type: AlgorithmType.GUESS_YOU_LIKE, icon: '💡', description: '智能推薦，個性化匹配用戶偏好' },
  { type: AlgorithmType.ORGANIC_TRAFFIC, icon: '🌿', description: '自然流量曝光，提升店鋪基礎流量' },
  { type: AlgorithmType.SEARCH_ALGORITHM, icon: '🔍', description: '搜索算法優化，提升搜索轉化率' },
  { type: AlgorithmType.GOLDEN_SIGNBOARD, icon: '🏅', description: '金字招牌商家，品質保證優先推薦' },
  { type: AlgorithmType.PRODUCT_PROMO, icon: '🎯', description: '商品折扣秒殺活動，智能促銷匹配' },
]

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
}

const TYPE_LABEL: Record<AlgorithmType, string> = {
  [AlgorithmType.INVINCIBLE_STAR]: '無敵星星',
  [AlgorithmType.NEW_STORE_AD]: '新店廣告',
  [AlgorithmType.HOT_REVIVE_AD]: '盤活復蘇',
  [AlgorithmType.EXCLUSIVE_MERCHANT]: '獨家商家',
  [AlgorithmType.POPULAR_MERCHANT_KA]: '人氣商家',
  [AlgorithmType.TRAFFIC_AD]: '流量廣告',
  [AlgorithmType.GUESS_YOU_LIKE]: '猜你喜歡',
  [AlgorithmType.ORGANIC_TRAFFIC]: '自然流量',
  [AlgorithmType.SEARCH_ALGORITHM]: '搜索算法',
  [AlgorithmType.BRAND_MERCHANT]: '品牌商家(KA)',
  [AlgorithmType.GOLD_AD]: '點金廣告',
  [AlgorithmType.GOLDEN_SIGNBOARD]: '金字招牌',
  [AlgorithmType.PRODUCT_PROMO]: '商品促銷',
} as Record<AlgorithmType, string>

const _TYPE_COLOR: Record<AlgorithmType, string> = {
  [AlgorithmType.INVINCIBLE_STAR]: 'gold',
  [AlgorithmType.NEW_STORE_AD]: 'green',
  [AlgorithmType.HOT_REVIVE_AD]: 'volcano',
  [AlgorithmType.EXCLUSIVE_MERCHANT]: 'purple',
  [AlgorithmType.POPULAR_MERCHANT_KA]: 'geekblue',
  [AlgorithmType.TRAFFIC_AD]: 'cyan',
  [AlgorithmType.GUESS_YOU_LIKE]: 'blue',
  [AlgorithmType.ORGANIC_TRAFFIC]: 'lime',
  [AlgorithmType.SEARCH_ALGORITHM]: 'magenta',
  [AlgorithmType.BRAND_MERCHANT]: 'orange',
  [AlgorithmType.GOLD_AD]: 'gold',
  [AlgorithmType.GOLDEN_SIGNBOARD]: 'gold',
  [AlgorithmType.PRODUCT_PROMO]: 'red',
} as Record<AlgorithmType, string>

const _CHANNEL_LABEL: Record<RecommendChannel, string> = {
  [RecommendChannel.HOME]: '美食外賣',
  [RecommendChannel.DELIVERY]: '美食外賣',
  [RecommendChannel.SUPERMARKET]: '超市百貨',
  [RecommendChannel.GROUP_BUY]: '團購到店',
}

const _PLACEMENT_LABEL: Record<PlacementInterface, string> = {
  [PlacementInterface.HOME]: '大首頁-Feed',
  [PlacementInterface.DELIVERY]: '外賣頻道-Feed',
  [PlacementInterface.SUPERMARKET]: '超市頻道-Feed',
  [PlacementInterface.GROUP_BUY]: '團購頻道-Feed',
}

const _TIME_SLOT_LABEL: Record<string, string> = {
  allDay: '全天',
  breakfast: '早餐(06:00-09:00)',
  lunch: '午餐(11:00-14:00)',
  afternoon: '下午茶(14:00-17:00)',
  dinner: '晚餐(17:00-20:00)',
  nightSnack: '夜宵(20:00-02:00)',
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
})

export default function Algorithm() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()

  // 从 URL 参数恢复列表状态（从新增页返回时）
  const typeParam = searchParams.get('type')
  const tabParam = searchParams.get('tab') as 'delivery' | 'groupBuy' | null
  const initialType = typeParam ? Number(typeParam) as AlgorithmType : null
  const [selectedType, setSelectedType] = useState<AlgorithmType | null>(initialType)
  const [businessType, setBusinessType] = useState<'delivery' | 'groupBuy'>(tabParam || 'delivery')
  const [dataList, setDataList] = useState<AlgorithmRecord[]>([])

  // 卡片拖拽排序（順序持久化到 localStorage，每個 Tab 獨立保存）
  const deliveryCardOrder = useCardOrder('algorithm-card-order-delivery', TAB_ALGORITHM_MAP.delivery)
  const groupBuyCardOrder = useCardOrder('algorithm-card-order-groupBuy', TAB_ALGORITHM_MAP.groupBuy)

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
        setFilteredData(initialType ? filterByBusinessType(list.filter(item => item.type === initialType)) : list)
      })
      .catch(() => {})
    return () => { mounted = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 统计每种广告类型的算法数量
  const _typeCountMap = useMemo(() => {
    const map: Record<number, number> = {}
    dataList.forEach(item => {
      map[item.type] = (map[item.type] || 0) + 1
    })
    return map
  }, [dataList])

  // 点击卡片 → 进入列表（同步 type/tab 到 URL，使小蜜蜂 PRD 切换到列表界面）
  const handleSelectType = (type: AlgorithmType, tab: 'delivery' | 'groupBuy') => {
    setSelectedType(type)
    setBusinessType(tab)
    const data = filterByBusinessType(dataList.filter(item => item.type === type))
    setFilteredData(data)
    setSearchParams({ type: String(type), tab }, { replace: true })
  }

  // 返回卡片选择页（清空 URL 参数，使小蜜蜂 PRD 切回卡片展示界面）
  const handleBackToCards = () => {
    setSelectedType(null)
    setFilteredData(dataList)
    setBusinessType('delivery')
    setSearchParams({}, { replace: true })
  }

  // 启用/停用算法
  const handleToggleStatus = (record: AlgorithmRecord) => {
    const newStatus = record.status === ServiceStatus.ENABLED ? ServiceStatus.DISABLED : ServiceStatus.ENABLED
    const actionText = newStatus === ServiceStatus.ENABLED ? '啟用' : '停用'
    Modal.confirm({
      title: `確認${actionText}`,
      content: `確定要${actionText}算法「${record.name}」嗎？`,
      okText: '確定',
      cancelText: '取消',
      onOk: async () => {
        try {
          await updateAdAlgorithmStatus(record.id, newStatus)
        } catch (err) {
          message.error((err as Error).message || `${actionText}失敗`)
          return
        }
        setDataList(prev => prev.map(item => item.id === record.id ? { ...item, status: newStatus } : item))
        setFilteredData(prev => prev.map(item => item.id === record.id ? { ...item, status: newStatus } : item))
        message.success(`已${actionText}「${record.name}」`)
      },
    })
  }

  // 删除算法
  const handleDelete = (record: AlgorithmRecord) => {
    Modal.confirm({
      title: '確認刪除',
      content: `確定要刪除算法「${record.name}」嗎？`,
      okText: '確定',
      cancelText: '取消',
      okButtonProps: { danger: true },
      onOk: async () => {
        try {
          await deleteAdAlgorithm(record.id)
        } catch (err) {
          message.error((err as Error).message || '刪除失敗')
          return
        }
        setDataList(prev => prev.filter(item => item.id !== record.id))
        setFilteredData(prev => prev.filter(item => item.id !== record.id))
        message.success('刪除成功')
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
    { key: 'code', title: '算法ID' },
    { key: 'name', title: '算法名稱' },
    { key: 'brand', title: '所屬品牌' },
    { key: 'status', title: '狀態' },
    { key: 'action', title: '操作' },
  ], [])

  const { configComponent, applyConfig } = useColumnConfig('algorithm', columnMeta, [
    { key: 'action', visible: true, locked: 'tail' as const },
  ])

  const columns: ColumnsType<AlgorithmRecord> = [
    { title: '算法ID', dataIndex: 'code', key: 'code', width: 120, render: (v) => <Tag color="blue">{v}</Tag> },
    { title: '算法名稱', dataIndex: 'name', key: 'name', width: 200 },
    {
      title: '所屬品牌', dataIndex: 'brand', key: 'brand', width: 100,
      render: (v: AppType) => v ? <BrandTag value={v} /> : '-',
    },
    {
      title: '狀態', dataIndex: 'status', key: 'status', width: 100,
      render: (v: ServiceStatus) => (
        <Tag color={v === ServiceStatus.ENABLED ? 'success' : 'default'}>
          {v === ServiceStatus.ENABLED ? '啟用' : '停用'}
        </Tag>
      ),
    },
    {
      title: '操作', key: 'action', width: 280,
      render: (_, record) => (
        <Space size={0} split={<span style={{ color: '#d9d9d9' }}>|</span>}>
          <Button type="link" size="small" onClick={() => handleViewDetail(record)}>詳情</Button>
          <Button type="link" size="small" onClick={() => navigate(`/promotion-algorithm-add?type=${record.type}&id=${record.id}&tab=${businessType}`)}>編輯</Button>
          <Button type="link" size="small" danger={record.status === ServiceStatus.ENABLED} style={record.status !== ServiceStatus.ENABLED ? { color: '#52c41a' } : undefined} onClick={() => handleToggleStatus(record)}>
            {record.status === ServiceStatus.ENABLED ? '停用' : '啟用'}
          </Button>
          <Button type="link" size="small" danger onClick={() => handleDelete(record)}>
            刪除
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
            <Tag color="blue">查看/調整算法</Tag>
          ) : (
            <Tag color="default">敬請期待</Tag>
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
              算法庫
            </h2>
            <p style={{ margin: '6px 0 0', color: '#8c8c8c', fontSize: 12 }}>
              管理各廣告類型的算法策略配置，選擇類型查看詳情
            </p>
          </div>
          <Button type="primary" icon={<ApartmentOutlined />}
            onClick={() => navigate('/promotion-algorithm-flow')}
            style={{
              backgroundColor: '#E8720C', borderColor: '#E8720C',
              borderRadius: 8, height: 36, padding: '0 18px',
              boxShadow: '0 2px 6px rgba(232,114,12,0.25)',
            }}
          >業務流程</Button>
        </div>
      </div>

        <Card style={{ marginBottom: 16 }} bodyStyle={{ padding: '5px 24px' }}>
          <Tabs
            defaultActiveKey="delivery"
            items={[
              {
                key: 'delivery',
                label: '外賣到家',
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
                        const enabled = card.type === AlgorithmType.INVINCIBLE_STAR || card.type === AlgorithmType.HOT_REVIVE_AD || card.type === AlgorithmType.NEW_STORE_AD || card.type === AlgorithmType.POPULAR_MERCHANT_KA || card.type === AlgorithmType.EXCLUSIVE_MERCHANT || card.type === AlgorithmType.BRAND_MERCHANT || card.type === AlgorithmType.ORGANIC_TRAFFIC || card.type === AlgorithmType.GUESS_YOU_LIKE
                        return renderAlgoCard(card, enabled, 'delivery', deliveryCardOrder.getDragProps(card.type))
                      })}
                  </div>
                ),
              },
              {
                key: 'groupBuy',
                label: '團購到店',
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
            >返回</Button>
            <div style={{ width: 1, height: 20, background: '#E8E8E8' }} />
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#1890ff' }}>算法列表</h2>
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
          <Button type="primary" icon={<PlusOutlined />} onClick={handleGoToAdd}>新增算法</Button>
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
            showTotal: (total) => `共 ${total} 條`,
            showSizeChanger: true,
            pageSizeOptions: ['10', '20', '50'],
            showQuickJumper: true,
          }}
        />
      </div>
    </div>
  )
}
