import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Button, Empty, InputNumber, message, Result, Select, Table, TreeSelect } from 'antd'
import type { TableColumnsType } from 'antd'
import { ReloadOutlined, SearchOutlined } from '@ant-design/icons'
import { APP_OPTIONS, AlgorithmType, AppType, RECOMMEND_CHANNEL_OPTIONS, RecommendChannel, REGION_LABEL_KEY, REGION_TREE_DATA, ServiceStatus, type Region } from '@mftb/contracts/recommendConstants'
import { useAuth } from '@/contexts/AuthContext'
import BrandTag from '@/components/BrandTag'
import HelpPopover from '@/components/HelpPopover'
import { fetchAdAlgorithms, type AdAlgorithm } from '@/api/adPromotion'
import { getSampleSnapshot } from './organic/fixtures'
import { expandRegions, scoreText } from './organic/display'
import StoreScoreDetail from './organic/StoreScoreDetail'
import type { Dimension, StoreResult } from './organic/types'
import './organic/organic.css'

interface RankedRow { store: StoreResult; brand: AppType; channel: number; algo?: AdAlgorithm; rank: number }
interface Filters { rankMin: number | null; rankMax: number | null; merchant: string; store: string; brand: AppType | null; channel: number | null; algo: string; regions: Region[] }

const PAGE_SIZES = [10, 20, 50, 100]
// 業務頻道口径依系統數據字典（美食外賣／超市百貨／團購到店）：大首頁是跨頻道的混排聚合層，不是一種業務頻道，
// 本頁的篩選與演示歸屬都排除它；以「投放界面」取數的其他沙盘頁（瀑布流推演等）仍可用 HOME。
const SCORE_CHANNEL_OPTIONS = RECOMMEND_CHANNEL_OPTIONS.filter(option => option.value !== RecommendChannel.HOME)
const CHANNEL_CYCLE: number[] = SCORE_CHANNEL_OPTIONS.map(option => option.value)
// 算法是否落在该频道下：存量算法大多未填 channel（新增算法表单此前不收这一项），按「通用」处理，
// 不臆造归属也不让回填前的下拉直接空掉；一旦算法定了频道，就只在对应频道下出现
const algoInChannel = (algo: AdAlgorithm, channel: number | null) => !channel || algo.channel == null || algo.channel === channel
const EMPTY_FILTERS: Filters = { rankMin: null, rankMax: null, merchant: '', store: '', brand: null, channel: null, algo: '', regions: [] }
const dimensionScore = (store: StoreResult, dimension: Dimension) => store.dimensions.find(d => d.dimension === dimension)?.rawScore
// 名次徽章：前 3 名金/银/铜圆形奖牌，4-10 名浅橙胶囊，其余纯数字
const MEDALS = ['gold', 'silver', 'bronze'] as const
const rankBadge = (rank: number) => rank <= 3
  ? <span className={`organic__rank-medal organic__rank-medal--${MEDALS[rank - 1]}`}>{rank}</span>
  : rank <= 10 ? <span className="organic__rank-pill">{rank}</span> : <span className="organic__rank-number">{rank}</span>

// 原型演示专用：固定快照只有单品牌单频道，为使「所属品牌/业务频道」筛选可体验，
// 按集团序号分品牌、门店序号轮转频道做确定性分摊；不是真实业务归属，接入正式计分接口后移除。
const demoBrandOf = (store: StoreResult): AppType => Number(store.merchantId.slice('GROUP-'.length)) % 2 === 0 ? AppType.MFOOD : AppType.SHANFENG
const demoChannelOf = (store: StoreResult): number => CHANNEL_CYCLE[(Number(store.storeId.slice(-3)) - 1) % CHANNEL_CYCLE.length]

const toRankValue = (raw: string | null): number | null => {
  const value = Number(raw)
  return raw && Number.isInteger(value) && value >= 1 ? value : null
}
const readFilters = (params: URLSearchParams): Filters => {
  const brand = Number(params.get('brand'))
  const channel = Number(params.get('channel'))
  return {
    rankMin: toRankValue(params.get('rankMin')), rankMax: toRankValue(params.get('rankMax')),
    merchant: (params.get('merchant') ?? '').slice(0, 60), store: (params.get('store') ?? '').slice(0, 60),
    algo: (params.get('algo') ?? '').slice(0, 40),
    brand: brand === AppType.SHANFENG || brand === AppType.MFOOD ? brand : null,
    channel: CHANNEL_CYCLE.includes(channel) ? channel : null,
    regions: expandRegions((params.get('regions') ?? '').split(',').filter(Boolean)),
  }
}

/**
 * 商家權重分：列表页标准结构（搜索区 → 表格），支持排名/集团/门店/品牌/频道/区域筛选。
 * 占比（權重）配置模塊已停用並將刪除，頁面不再計算占比、歸一或加權貢獻，
 * 綜合得分＝商業＋店鋪＋平台三個維度得分直接相加。
 */
export default function MerchantScoreInsight() {
  const { t } = useTranslation()
  const { hasMenuPermission } = useAuth()
  const [params, setParams] = useSearchParams()
  const snapshot = useMemo(() => getSampleSnapshot(), [])
  const filters = useMemo(() => readFilters(params), [params])
  const sizeParam = Number(params.get('size'))
  const size = PAGE_SIZES.includes(sizeParam) ? sizeParam : 20
  const [draft, setDraft] = useState<Filters>(filters)
  useEffect(() => { setDraft(filters) }, [filters])
  // 算法库（自然流量类型 + 启用状态）：下拉选项与行级算法归属的真实数据源
  const [algorithms, setAlgorithms] = useState<AdAlgorithm[]>([])
  useEffect(() => {
    let active = true
    fetchAdAlgorithms({ page: 1, size: 200, algoType: AlgorithmType.ORGANIC_TRAFFIC, status: ServiceStatus.ENABLED })
      .then(res => { if (active) setAlgorithms((res.records ?? []).filter(a => a.algoCode)) })
      .catch(() => { /* 接口不可用时降级为无算法选项，不阻断榜单 */ })
    return () => { active = false }
  }, [])
  const view = params.get('view') === 'detail' ? 'detail' : 'overview'
  // 算法候选跟随頻道收窄（先定頻道、再選該頻道下的算法）；未選頻道時列全量
  const algoChoices = useMemo(() => algorithms.filter(algo => algoInChannel(algo, draft.channel)), [algorithms, draft.channel])
  const rows = useMemo<RankedRow[]>(() => {
    // 算法必选：不同算法的计分项与分数配置不同，未选算法时不展示全量榜单
    if (!filters.algo) return []
    // 演示口径：算法按门店序号在「该门店频道可用的算法」里轮转归属，接真实计分接口后改读库内归属
    const algoOf = (store: StoreResult) => {
      const pool = algorithms.filter(algo => algoInChannel(algo, demoChannelOf(store)))
      return pool.length ? pool[(Number(store.storeId.slice(-3)) - 1) % pool.length] : undefined
    }
    const list = snapshot.stores
      .filter(s => s.totalScore != null && (!filters.regions.length || filters.regions.includes(s.regionId)))
      .filter(s => !filters.merchant || s.merchantId === filters.merchant)
      .filter(s => !filters.store || s.storeId === filters.store)
      .filter(s => !filters.brand || demoBrandOf(s) === filters.brand)
      .filter(s => !filters.channel || demoChannelOf(s) === filters.channel)
      .filter(s => !filters.algo || algoOf(s)?.algoCode === filters.algo)
      .map((store, index) => ({ store, brand: demoBrandOf(store), channel: demoChannelOf(store), algo: algoOf(store), rank: index + 1 }))
    return list.filter(r => (filters.rankMin == null || r.rank >= filters.rankMin) && (filters.rankMax == null || r.rank <= filters.rankMax))
  }, [snapshot, filters, algorithms])
  // 筛选后页码可能超出范围（手改 URL 或收窄条件），限制在最后一页，避免空白列表。
  const page = Math.min(Math.max(1, Number(params.get('page') || 1)), Math.max(1, Math.ceil(rows.length / size)))
  const pageRows = rows.slice((page - 1) * size, page * size)
  const apply = (next: Partial<Filters> & { page?: number; size?: number; view?: string; storeId?: string }) => {
    const merged = { ...filters, ...next }
    const query = new URLSearchParams()
    if (merged.rankMin != null) query.set('rankMin', String(merged.rankMin))
    if (merged.rankMax != null) query.set('rankMax', String(merged.rankMax))
    if (merged.merchant.trim()) query.set('merchant', merged.merchant.trim())
    if (merged.store.trim()) query.set('store', merged.store.trim())
    if (merged.brand != null) query.set('brand', String(merged.brand))
    if (merged.channel != null) query.set('channel', String(merged.channel))
    if (merged.algo) query.set('algo', merged.algo)
    if (merged.regions.length) query.set('regions', merged.regions.join(','))
    query.set('page', String(next.page ?? 1))
    query.set('size', String(next.size ?? size))
    if (next.view) query.set('view', next.view)
    if (next.storeId) query.set('storeId', next.storeId)
    setParams(query)
  }
  const openDetail = (store: StoreResult) => apply({ page, view: 'detail', storeId: store.storeId })
  const handleBack = () => apply({ page })
  const handleSearch = () => {
    if (!draft.algo) { message.warning('算法名稱為必選條件，請先選擇算法'); return }
    apply({ ...draft, page: 1 })
  }
  const channelText = (channel: number) => t(RECOMMEND_CHANNEL_OPTIONS.find(option => option.value === channel)?.labelKey ?? 'recommend.channelDelivery')
  // 換頻道後原算法可能已不在候選里，直接清空，避免「選了頻道卻查不到榜」的假空结果
  const handleChannelChange = (value: number | null) => setDraft(prev => {
    const channel = value ?? null
    const stillAvailable = !!prev.algo && algorithms.some(algo => algo.algoCode === prev.algo && algoInChannel(algo, channel))
    return { ...prev, channel, algo: stillAvailable ? prev.algo : '' }
  })
  const idNameCell = (id: string, name: string) => <div className="organic__id-name"><b>{id}</b><span>{name}</span></div>
  // 集团/门店下拉选项：选项文案「ID/名稱」，支持按 ID 或名称搜索，选中后按 ID 精确筛选
  const merchantOptions = useMemo(() => { const seen = new Map<string, string>(); snapshot.stores.forEach(s => seen.set(s.merchantId, `${s.merchantId}/${s.merchantName}`)); return [...seen.entries()].map(([value, label]) => ({ value, label })) }, [snapshot])
  const storeOptions = useMemo(() => snapshot.stores.map(s => ({ value: s.storeId, label: `${s.storeId}/${s.storeName}` })), [snapshot])
  const columns: TableColumnsType<RankedRow> = [
    { key: 'rank', title: <span className="organic__th">排名<HelpPopover title="排名口徑" ariaLabel="排名口徑說明" placement="bottomLeft" content={[
      { tone: 'info', label: '綜合得分', body: '綜合得分＝商業維度分＋店鋪維度分＋平台維度分。占比（權重）配置模塊已停用，不參與計算。' },
      { tone: 'neutral', label: '排名範圍', body: '需先選擇算法；名次按所選算法的榜單與當前篩選條件從 1 連續重新編號。' },
      { tone: 'warn', label: '同分處理', body: '同分依次按店鋪綜合分、近30天訂單量、距離、門店ID穩定排序，不使用並列名次。' },
    ]} /></span>, width: 92, render: (_, r) => rankBadge(r.rank) },
    { key: 'algo', title: '算法ID/名稱', width: 190, render: (_, r) => r.algo ? idNameCell(r.algo.algoCode, r.algo.algoName) : '—' },
    { key: 'merchantIdName', title: '集團ID/名稱', width: 180, render: (_, r) => idNameCell(r.store.merchantId, r.store.merchantName) },
    { key: 'storeIdName', title: '門店ID/名稱', width: 210, render: (_, r) => idNameCell(r.store.storeId, r.store.storeName) },
    { key: 'brand', title: '所屬品牌', width: 110, render: (_, r) => <BrandTag value={r.brand} /> },
    { key: 'channel', title: '業務頻道', width: 120, render: (_, r) => channelText(r.channel) },
    { key: 'region', title: '運營商圈', width: 120, render: (_, r) => t(REGION_LABEL_KEY[r.store.regionId] ?? '') },
    { key: 'commercial', title: '商業維度分', width: 130, align: 'right', render: (_, r) => scoreText(dimensionScore(r.store, 'commercial')) },
    { key: 'storeScore', title: '店鋪維度分', width: 130, align: 'right', render: (_, r) => scoreText(dimensionScore(r.store, 'store')) },
    { key: 'platform', title: '平台維度分', width: 130, align: 'right', render: (_, r) => scoreText(dimensionScore(r.store, 'platform')) },
    { key: 'total', title: '綜合得分', width: 130, align: 'right', render: (_, r) => <b className="organic__total-score">{scoreText(r.store.totalScore)}</b> },
    { key: 'action', title: '操作', width: 96, fixed: 'right', render: (_, r) => <Button type="link" size="small" onClick={() => openDetail(r.store)}>詳情</Button> },
  ]
  if (!hasMenuPermission('merchant-score-insight')) return <Result status="403" title="沒有查看權限" subTitle="請聯絡管理員授予商家權重分查看權限。" />
  if (view === 'detail') {
    const store = snapshot.stores.find(s => s.storeId === params.get('storeId'))
    return store ? <StoreScoreDetail key={store.storeId} store={store} snapshot={snapshot} onBack={handleBack} />
      : <Result status="404" title="找不到演示門店" extra={<Button onClick={handleBack}>返回排名</Button>} />
  }
  return <div className="content-area organic">
    <div className="search-section organic__search">
      <div className="organic__filter-grid">
        {/* 自然流量按業務頻道配置，頻道放首位：先定頻道，算法下拉只列该频道下的算法 */}
        <label>業務頻道<Select aria-label="業務頻道" allowClear placeholder="全部" value={draft.channel} onChange={handleChannelChange} options={SCORE_CHANNEL_OPTIONS.map(option => ({ value: option.value, label: t(option.labelKey) }))} /></label>
        <label><span className="organic__label--required">算法名稱</span><Select aria-label="算法名稱" allowClear showSearch optionFilterProp="label" placeholder="必選，請選擇算法" value={draft.algo || undefined} onChange={value => setDraft({ ...draft, algo: value ?? '' })} options={algoChoices.map(algo => ({ value: algo.algoCode, label: `${algo.algoName}(${algo.algoCode})` }))} /></label>
        <label>排名<div className="organic__rank-range"><InputNumber aria-label="排名下限" min={1} precision={0} placeholder="最低名次" value={draft.rankMin} onChange={value => setDraft({ ...draft, rankMin: value })} /><span>–</span><InputNumber aria-label="排名上限" min={1} precision={0} placeholder="最高名次" value={draft.rankMax} onChange={value => setDraft({ ...draft, rankMax: value })} /></div></label>
        <label>集團ID/名稱<Select aria-label="集團ID/名稱" showSearch allowClear optionFilterProp="label" placeholder="全部" value={draft.merchant || undefined} onChange={value => setDraft({ ...draft, merchant: value ?? '' })} options={merchantOptions} /></label>
        <label>門店ID/名稱<Select aria-label="門店ID/名稱" showSearch allowClear optionFilterProp="label" placeholder="全部" value={draft.store || undefined} onChange={value => setDraft({ ...draft, store: value ?? '' })} options={storeOptions} /></label>
        <label>所屬品牌<Select aria-label="所屬品牌" allowClear placeholder="全部" value={draft.brand} onChange={value => setDraft({ ...draft, brand: value ?? null })} options={APP_OPTIONS.map(option => ({ value: option.value, label: t(option.labelKey) }))} /></label>
        <label>運營商圈<TreeSelect aria-label="運營商圈" treeCheckable showSearch treeNodeFilterProp="title" maxTagCount={2} placeholder="全澳門（不含珠海）" value={draft.regions} onChange={(value: (string | number)[]) => setDraft({ ...draft, regions: expandRegions(value) })} treeData={REGION_TREE_DATA.slice(0, 2).map(node => ({ value: node.value, title: t(node.titleKey), children: node.children.map(child => ({ value: child.value, title: t(child.titleKey) })) }))} allowClear /></label>
        {/* 标準列表页：操作按钮紧跟最后一个查询条件（§E.1） */}
        <div className="search-actions"><Button type="primary" icon={<SearchOutlined />} onClick={handleSearch}>查詢</Button><Button icon={<ReloadOutlined />} onClick={() => { setDraft(EMPTY_FILTERS); apply({ ...EMPTY_FILTERS, page: 1 }) }}>重置</Button></div>
      </div>
    </div>
    <Table<RankedRow> rowKey={r => r.store.storeId} columns={columns} dataSource={pageRows} size="small" scroll={{ x: 1770 }} pagination={{ current: page, pageSize: size, total: rows.length, showSizeChanger: true, showQuickJumper: true, pageSizeOptions: PAGE_SIZES, showTotal: count => `共 ${count} 家參排名門店`, onChange: (next, nextSize) => apply({ page: nextSize !== size ? 1 : next, size: nextSize }) }} locale={{ emptyText: <Empty description={filters.algo ? '沒有符合條件的門店' : '請先選擇算法後再查看排名'} /> }} />
  </div>
}
