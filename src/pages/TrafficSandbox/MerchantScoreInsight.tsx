import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Button, Empty, InputNumber, message, Result, Select, Table, TreeSelect } from 'antd'
import type { TableColumnsType } from 'antd'
import { ReloadOutlined, SearchOutlined } from '@ant-design/icons'
import { AlgorithmType, REGION_LABEL_KEY, REGION_TREE_DATA, RECOMMEND_CHANNEL_OPTIONS, ServiceStatus, type Region } from '@mftb/contracts/recommendConstants'
import { useAuth } from '@/contexts/AuthContext'
import BrandTag from '@/components/BrandTag'
import HelpPopover from '@/components/HelpPopover'
import { fetchAdAlgorithms, type AdAlgorithm } from '@/api/adPromotion'
import { getSampleSnapshot } from './organic/fixtures'
import { expandRegions, scoreText } from './organic/display'
import StoreScoreDetail from './organic/StoreScoreDetail'
import type { Dimension, StoreResult } from './organic/types'
import './organic/organic.css'

interface RankedRow { store: StoreResult; rank: number }
interface Filters { rankMin: number | null; rankMax: number | null; merchant: string; store: string; algo: string; regions: Region[] }

const PAGE_SIZES = [10, 20, 50, 100]
// 算法在算法庫就已綁定「所屬品牌 + 業務頻道」，兩個都是單值字段：選了算法等於定了口徑。
// 把它們再做獨立篩選條件毫無區分能力（舊實現還按門店序號假分攤品牌/頻道，會與算法口徑互相矛盾），
// 因此搜索區只留算法名稱，品牌/頻道在口徑條與榜內列如實回顯所选算法的配置值。
const EMPTY_FILTERS: Filters = { rankMin: null, rankMax: null, merchant: '', store: '', algo: '', regions: [] }
const dimensionScore = (store: StoreResult, dimension: Dimension) => store.dimensions.find(d => d.dimension === dimension)?.rawScore
// 名次徽章：前 3 名金/银/铜圆形奖牌，4-10 名浅橙胶囊，其余纯数字
const MEDALS = ['gold', 'silver', 'bronze'] as const
const rankBadge = (rank: number) => rank <= 3
  ? <span className={`organic__rank-medal organic__rank-medal--${MEDALS[rank - 1]}`}>{rank}</span>
  : rank <= 10 ? <span className="organic__rank-pill">{rank}</span> : <span className="organic__rank-number">{rank}</span>

const toRankValue = (raw: string | null): number | null => {
  const value = Number(raw)
  return raw && Number.isInteger(value) && value >= 1 ? value : null
}
const readFilters = (params: URLSearchParams): Filters => ({
  rankMin: toRankValue(params.get('rankMin')), rankMax: toRankValue(params.get('rankMax')),
  merchant: (params.get('merchant') ?? '').slice(0, 60), store: (params.get('store') ?? '').slice(0, 60),
  algo: (params.get('algo') ?? '').slice(0, 40),
  regions: expandRegions((params.get('regions') ?? '').split(',').filter(Boolean)),
})

/**
 * 商家權重分：列表页标准结构（搜索区 → 表格），支持排名/集团/门店/区域筛选；
 * 所屬品牌與業務頻道跟隨所選算法（算法庫單值配置）回顯，不作為獨立篩選條件。
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
  // 榜單口徑 = 所選算法：算法必選；算法庫尚未就緒或所選算法已停用時不出榜（不展示無口徑的榜單）
  const selectedAlgo = useMemo(() => algorithms.find(algo => algo.algoCode === filters.algo), [algorithms, filters.algo])
  // 口徑條跟隨草稿，選完算法即刻回顯其品牌與頻道，不必先點查詢
  const draftAlgo = useMemo(() => algorithms.find(algo => algo.algoCode === draft.algo), [algorithms, draft.algo])
  const rows = useMemo<RankedRow[]>(() => {
    if (!selectedAlgo) return []
    const list = snapshot.stores
      .filter(s => s.totalScore != null && (!filters.regions.length || filters.regions.includes(s.regionId)))
      .filter(s => !filters.merchant || s.merchantId === filters.merchant)
      .filter(s => !filters.store || s.storeId === filters.store)
      .map((store, index) => ({ store, rank: index + 1 }))
    return list.filter(r => (filters.rankMin == null || r.rank >= filters.rankMin) && (filters.rankMax == null || r.rank <= filters.rankMax))
  }, [snapshot, filters, selectedAlgo])
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
  const channelText = (channel: number) => {
    const labelKey = RECOMMEND_CHANNEL_OPTIONS.find(option => option.value === channel)?.labelKey
    // 未知頻道值不得預設成「美食外賣」，如實顯示原值
    return labelKey ? t(labelKey) : `頻道 ${channel}`
  }
  // 品牌/頻道取所選算法的配置值（單值字段，整榜同值）；存量算法可能未填，如實顯示「算法未設定」，不臆造歸屬
  const scopeFallback = <span className="organic__muted">算法未設定</span>
  const scopeBrandCell = selectedAlgo?.brand ? <BrandTag value={selectedAlgo.brand} /> : scopeFallback
  const scopeChannelCell = selectedAlgo?.channel != null ? channelText(selectedAlgo.channel) : scopeFallback
  const idNameCell = (id: string, name: string) => <div className="organic__id-name"><b>{id}</b><span>{name}</span></div>
  // 集团/门店下拉选项：选项文案「ID/名稱」，支持按 ID 或名称搜索，选中后按 ID 精确筛选
  const merchantOptions = useMemo(() => { const seen = new Map<string, string>(); snapshot.stores.forEach(s => seen.set(s.merchantId, `${s.merchantId}/${s.merchantName}`)); return [...seen.entries()].map(([value, label]) => ({ value, label })) }, [snapshot])
  const storeOptions = useMemo(() => snapshot.stores.map(s => ({ value: s.storeId, label: `${s.storeId}/${s.storeName}` })), [snapshot])
  const columns: TableColumnsType<RankedRow> = [
    { key: 'rank', title: <span className="organic__th">排名<HelpPopover title="排名口徑" ariaLabel="排名口徑說明" placement="bottomLeft" content={[
      { tone: 'info', label: '綜合得分', body: '綜合得分＝商業維度分＋店鋪維度分＋平台維度分。占比（權重）配置模塊已停用，不參與計算。' },
      { tone: 'neutral', label: '排名範圍', body: '需先選擇算法；榜單的品牌與業務頻道口徑即該算法在算法庫的綁定值，名次按當前篩選條件從 1 連續重新編號。' },
      { tone: 'warn', label: '同分處理', body: '同分依次按店鋪綜合分、近30天訂單量、距離、門店ID穩定排序，不使用並列名次。' },
    ]} /></span>, width: 92, render: (_, r) => rankBadge(r.rank) },
    { key: 'algo', title: '算法ID/名稱', width: 190, render: () => selectedAlgo ? idNameCell(selectedAlgo.algoCode, selectedAlgo.algoName) : '—' },
    { key: 'merchantIdName', title: '集團ID/名稱', width: 180, render: (_, r) => idNameCell(r.store.merchantId, r.store.merchantName) },
    { key: 'storeIdName', title: '門店ID/名稱', width: 210, render: (_, r) => idNameCell(r.store.storeId, r.store.storeName) },
    { key: 'brand', title: <span className="organic__th">所屬品牌<HelpPopover title="所屬品牌口徑" ariaLabel="所屬品牌口徑說明" placement="bottomLeft" width={380} content={'取所選算法在算法庫綁定的「所屬品牌」。\n一條算法只綁定一個品牌，榜內所有門店同一口徑，因此不再提供品牌篩選條件。\n顯示「算法未設定」時請到「算法庫」編輯該算法補全品牌。'} /></span>, width: 110, render: () => scopeBrandCell },
    { key: 'channel', title: <span className="organic__th">業務頻道<HelpPopover title="業務頻道口徑" ariaLabel="業務頻道口徑說明" placement="bottomLeft" width={380} content={'取所選算法在算法庫綁定的「業務頻道」。\n一條算法只歸屬一個頻道，榜內所有門店同一口徑，因此不再提供頻道篩選條件。\n存量算法未填頻道時顯示「算法未設定」，請到「算法庫」補全後自動生效。'} /></span>, width: 120, render: () => scopeChannelCell },
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
        {/* 算法在算法庫已綁定所屬品牌與業務頻道（均為單值），選了算法就定了口徑，故算法放首位且不再給出頻道/品牌下拉 */}
        <label><span className="organic__label--required">算法名稱</span><Select aria-label="算法名稱" allowClear showSearch optionFilterProp="label" placeholder="必選，請選擇算法" value={draft.algo || undefined} onChange={value => setDraft({ ...draft, algo: value ?? '' })} options={algorithms.map(algo => ({ value: algo.algoCode, label: `${algo.algoName}(${algo.algoCode})` }))} /></label>
        <label>排名<div className="organic__rank-range"><InputNumber aria-label="排名下限" min={1} precision={0} placeholder="最低名次" value={draft.rankMin} onChange={value => setDraft({ ...draft, rankMin: value })} /><span>–</span><InputNumber aria-label="排名上限" min={1} precision={0} placeholder="最高名次" value={draft.rankMax} onChange={value => setDraft({ ...draft, rankMax: value })} /></div></label>
        <label>集團ID/名稱<Select aria-label="集團ID/名稱" showSearch allowClear optionFilterProp="label" placeholder="全部" value={draft.merchant || undefined} onChange={value => setDraft({ ...draft, merchant: value ?? '' })} options={merchantOptions} /></label>
        <label>門店ID/名稱<Select aria-label="門店ID/名稱" showSearch allowClear optionFilterProp="label" placeholder="全部" value={draft.store || undefined} onChange={value => setDraft({ ...draft, store: value ?? '' })} options={storeOptions} /></label>
        <label>運營商圈<TreeSelect aria-label="運營商圈" treeCheckable showSearch treeNodeFilterProp="title" maxTagCount={2} placeholder="全澳門（不含珠海）" value={draft.regions} onChange={(value: (string | number)[]) => setDraft({ ...draft, regions: expandRegions(value) })} treeData={REGION_TREE_DATA.slice(0, 2).map(node => ({ value: node.value, title: t(node.titleKey), children: node.children.map(child => ({ value: child.value, title: t(child.titleKey) })) }))} allowClear /></label>
        {/* 标準列表页：操作按钮紧跟最后一个查询条件（§E.1） */}
        <div className="search-actions"><Button type="primary" icon={<SearchOutlined />} onClick={handleSearch}>查詢</Button><Button icon={<ReloadOutlined />} onClick={() => { setDraft(EMPTY_FILTERS); apply({ ...EMPTY_FILTERS, page: 1 }) }}>重置</Button></div>
      </div>
      {/* 算法口徑回顯：取代原先無區分能力的品牌/頻道篩選控件 */}
      {draftAlgo && <div className="organic__algo-scope">
        <span>當前算法口徑</span>
        <span>所屬品牌：{draftAlgo.brand ? <BrandTag value={draftAlgo.brand} /> : <b>算法未設定</b>}</span>
        <span>業務頻道：<b>{draftAlgo.channel != null ? channelText(draftAlgo.channel) : '算法未設定'}</b></span>
        <span className="organic__muted">品牌與頻道由算法庫綁定，一條算法只有一個值，榜單內所有門店同一口徑，故不作為篩選條件</span>
      </div>}
    </div>
    <Table<RankedRow> rowKey={r => r.store.storeId} columns={columns} dataSource={pageRows} size="small" scroll={{ x: 1770 }} pagination={{ current: page, pageSize: size, total: rows.length, showSizeChanger: true, showQuickJumper: true, pageSizeOptions: PAGE_SIZES, showTotal: count => `共 ${count} 家參排名門店`, onChange: (next, nextSize) => apply({ page: nextSize !== size ? 1 : next, size: nextSize }) }} locale={{ emptyText: <Empty description={!filters.algo ? '請先選擇算法後再查看排名' : !algorithms.length ? '算法庫暫不可用，請稍後重試' : !selectedAlgo ? '所選算法不存在或已停用，請重新選擇算法' : '沒有符合條件的門店'} /> }} />
  </div>
}
