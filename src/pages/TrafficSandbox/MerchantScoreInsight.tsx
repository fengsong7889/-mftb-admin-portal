import { useEffect, useMemo, useState, type Key } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Button, Empty, InputNumber, message, Popover, Result, Select, Table, Tag, TreeSelect } from 'antd'
import type { TableColumnsType } from 'antd'
import { ReloadOutlined, ExportOutlined, SearchOutlined } from '@ant-design/icons'
import { AlgorithmType, REGION_LABEL_KEY, REGION_TREE_DATA, ServiceStatus, type Region } from '@mftb/contracts/recommendConstants'
import { useAuth } from '@/contexts/AuthContext'
import BrandTag from '@/components/BrandTag'
import HelpPopover from '@/components/HelpPopover'
import { useColumnConfig } from '@/hooks/useColumnConfig'
import { exportToCSV } from '@/utils/exportCSV'
import { brandToAppType, fetchAdAlgorithms, fetchWaterfallList, type AdAlgorithm, type WaterfallStrategy } from '@/api/adPromotion'
import { mergeServerToStrategies } from '../waterfallConfig/waterfallExtStore'
import { getSampleSnapshot } from './organic/fixtures'
import { brandLabel, expandRegions, scoreText } from './organic/display'
import StoreScoreDetail from './organic/StoreScoreDetail'
import type { Dimension, StoreResult } from './organic/types'
import './organic/organic.css'

interface RankedRow { store: StoreResult; rank: number }
interface Filters { rankMin: number | null; rankMax: number | null; merchant: string; store: string; algo: string; wf: string; regions: Region[] }

const PAGE_SIZES = [10, 20, 50, 100]
// 口径链：计分只依赖算法自身的规则配置与品牌，与是否绑定瀑布流无关——同一条算法被多条频道瀑布流引用时分数相同。
// 因此榜单口径 = 自然流量算法（必选）；瀑布流只是「记得配置不记得算法」时的带出入口，以及绑定关系的展示来源。
// 未绑定任何瀑布流的算法同样可以出榜（业务要先看分再决定上不上频道），此时绑定列与频道列显示「無」。
const EMPTY_FILTERS: Filters = { rankMin: null, rankMax: null, merchant: '', store: '', algo: '', wf: '', regions: [] }
const dimensionScore = (store: StoreResult, dimension: Dimension) => store.dimensions.find(d => d.dimension === dimension)?.rawScore
// 列配置面板用的纯文字列名（表格列标题带 HelpPopover 节点，不能直接给面板用）
const COLUMN_META = [
  { key: 'rank', title: '排名' },
  { key: 'algo', title: '算法ID/名稱' },
  { key: 'merchantIdName', title: '集團ID/名稱' },
  { key: 'storeIdName', title: '門店ID/名稱' },
  { key: 'brand', title: '所屬品牌' },
  { key: 'channel', title: '業務頻道' },
  { key: 'region', title: '運營商圈' },
  { key: 'commercial', title: '商業維度分' },
  { key: 'storeScore', title: '店鋪維度分' },
  { key: 'platform', title: '平台維度分' },
  { key: 'total', title: '綜合得分' },
  { key: 'wfBindings', title: '綁定瀑布流' },
  { key: 'action', title: '操作' },
]
// 导出固定全量字段：导出口径不跟随列显隐配置，否则同一份报表在不同人电脑上列不一样，无法对账
const EXPORT_FIELDS = [
  { dataIndex: 'rank', title: '排名' },
  { dataIndex: 'algoCode', title: '算法ID' },
  { dataIndex: 'algoName', title: '算法名稱' },
  { dataIndex: 'wfBindings', title: '綁定瀑布流' },
  { dataIndex: 'merchantId', title: '集團ID' },
  { dataIndex: 'merchantName', title: '集團名稱' },
  { dataIndex: 'storeId', title: '門店ID' },
  { dataIndex: 'storeName', title: '門店名稱' },
  { dataIndex: 'brand', title: '所屬品牌' },
  { dataIndex: 'channel', title: '業務頻道' },
  { dataIndex: 'region', title: '運營商圈' },
  { dataIndex: 'commercial', title: '商業維度分' },
  { dataIndex: 'storeScore', title: '店鋪維度分' },
  { dataIndex: 'platform', title: '平台維度分' },
  { dataIndex: 'total', title: '綜合得分' },
  { dataIndex: 'scope', title: '榜單口徑' },
  { dataIndex: 'dataNature', title: '資料性質' },
]
// 品牌列展示走 BrandTag，导出需要纯文字：复用同一套品牌常量映射，不另写一套名称
const brandText = (brand?: string | null) => { const app = brandToAppType(brand); return app == null ? '未設定' : brandLabel(app) }
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
  wf: (params.get('wf') ?? '').slice(0, 40),
  regions: expandRegions((params.get('regions') ?? '').split(',').filter(Boolean)),
})
// 瀑布流的業務頻道解析必须与「瀑布流策略」列表页同源：复用同一个合并函数
// （配置记录优先 → 按坑位引用算法频道推断 → 外卖到家默认美食外賣），禁止另写一套规则造成两页口径不一致。
const waterfallChannelText = (strategy: WaterfallStrategy, algoChannelByCode: Record<string, number>): string => {
  const view = mergeServerToStrategies([strategy], algoChannelByCode)[0]
  if (view.businessType === 'groupBuy') return '團購到店'
  return view.bizChannel === 'supermarket' ? '超市百貨' : '美食外賣'
}
const waterfallLabel = (strategy: WaterfallStrategy) => `${strategy.strategyName}(${strategy.strategyCode ?? ''})${strategy.status === ServiceStatus.DISABLED ? '(停用)' : ''}`

/**
 * 商家權重分：列表页标准结构（搜索区 → 操作区 → 表格）。
 * 榜单口径 = 自然流量算法（首位必选）：计分与是否绑定瀑布流无关，未绑定瀑布流的算法同样出榜。
 * 瀑布流为可选助手：记得配置不记得算法时，选瀑布流自动带出它绑定的自然流量算法。
 * 「綁定瀑布流」列展示该算法被哪些瀑布流引用（含停用），未绑定显示「無」；
 * 「業務頻道」列展示这些瀑布流归类到的频道集合，未绑定显示「無」。
 * 占比（權重）配置模塊已停用並將刪除，頁面不再計算占比、歸一或加權貢獻，
 * 綜合得分＝商業＋店鋪＋平台三個維度得分直接相加。
 */
export default function MerchantScoreInsight() {
  const { t } = useTranslation()
  const { hasMenuPermission, hasPermission } = useAuth()
  const [params, setParams] = useSearchParams()
  const snapshot = useMemo(() => getSampleSnapshot(), [])
  const filters = useMemo(() => readFilters(params), [params])
  const sizeParam = Number(params.get('size'))
  const size = PAGE_SIZES.includes(sizeParam) ? sizeParam : 20
  const [draft, setDraft] = useState<Filters>(filters)
  useEffect(() => { setDraft(filters) }, [filters])
  // 勾选导出：空选择 = 导出当前筛选全量；口径（非分页）变化时清空旧勾选，避免把上一个算法的勾选带进新榜单
  const [selectedKeys, setSelectedKeys] = useState<Key[]>([])
  const scopeKey = [filters.algo, filters.wf, filters.merchant, filters.store, filters.rankMin, filters.rankMax, filters.regions.join(',')].join('|')
  useEffect(() => { setSelectedKeys([]) }, [scopeKey])
  // 列显隐/排序配置（列表页标配，存 localStorage）：排名锁头、操作锁尾
  const { configComponent, applyConfig } = useColumnConfig('merchant-score-insight', COLUMN_META, [
    { key: 'rank', visible: true, locked: 'head' as const },
    { key: 'action', visible: true, locked: 'tail' as const },
  ])
  // 瀑布流策略（全量，含停用）：绑定关系展示与「瀑布流 → 算法」带出入口的数据源
  const [strategies, setStrategies] = useState<WaterfallStrategy[]>([])
  useEffect(() => {
    let active = true
    fetchWaterfallList({ page: 1, size: 500 })
      .then(res => { if (active) setStrategies((res.records ?? []).filter(s => s.strategyCode)) })
      .catch(() => { /* 接口不可用时降级为空：绑定列显示「無」，不阻断榜单 */ })
    return () => { active = false }
  }, [])
  const view = params.get('view') === 'detail' ? 'detail' : 'overview'
  // 算法库（全量一次拉取）：启用中的自然流量算法作为榜单口径候选；algoCode→频道映射供瀑布流业务线推断（与列表页同源）
  const [algorithms, setAlgorithms] = useState<AdAlgorithm[]>([])
  const [algoChannelByCode, setAlgoChannelByCode] = useState<Record<string, number>>({})
  useEffect(() => {
    let active = true
    fetchAdAlgorithms({ page: 1, size: 500 })
      .then(res => {
        if (!active) return
        const map: Record<string, number> = {}
        const organic: AdAlgorithm[] = []
        for (const algo of res.records ?? []) {
          if (!algo.algoCode) continue
          map[algo.algoCode] = algo.channel ?? 0
          if (algo.algoType === AlgorithmType.ORGANIC_TRAFFIC && algo.status === ServiceStatus.ENABLED) organic.push(algo)
        }
        setAlgoChannelByCode(map)
        setAlgorithms(organic)
      })
      .catch(() => { /* 接口不可用时降级为空选项，不阻断页面 */ })
    return () => { active = false }
  }, [])
  // 已生效口径：算法必选；算法库未就绪或所选算法不存在/未启用时不出榜（不展示无口径榜单）
  const selectedAlgo = useMemo(() => algorithms.find(algo => algo.algoCode === filters.algo), [algorithms, filters.algo])
  // 该算法被哪些瀑布流引用（含停用）：绑定列与频道集合列的唯一来源
  const boundWaterfalls = useMemo(() => {
    const code = selectedAlgo?.algoCode
    return code ? strategies.filter(strategy => strategy.naturalAlgoId?.trim() === code) : []
  }, [strategies, selectedAlgo])
  const boundChannelTexts = useMemo(() => [...new Set(boundWaterfalls.map(strategy => waterfallChannelText(strategy, algoChannelByCode)))], [boundWaterfalls, algoChannelByCode])
  // 旧链接/瀑布流入口：URL 只有 wf 没有 algo 时，把该瀑布流绑定的算法补进口径（榜单口径始终以算法为准）
  useEffect(() => {
    if (!filters.wf || filters.algo || !strategies.length) return
    const derived = strategies.find(strategy => strategy.strategyCode === filters.wf)?.naturalAlgoId?.trim() ?? ''
    if (derived) apply({ algo: derived })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters.wf, filters.algo, strategies])
  // 所选瀑布流存在但没绑算法：空态要说明是瀑布流的问题，不是算法库的问题
  const wfHasNoAlgo = !!filters.wf && !filters.algo && !!strategies.find(strategy => strategy.strategyCode === filters.wf && !strategy.naturalAlgoId?.trim())
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
    if (merged.wf) query.set('wf', merged.wf)
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
    if (!draft.algo) { message.warning('自然流量算法為必選條件，請先選擇算法'); return }
    apply({ ...draft, page: 1 })
  }
  // 选瀑布流＝带出入口：自动填上它绑定的自然流量算法（用户不必记得算法编号）；该瀑布流没绑算法则算法留空
  const handleWfChange = (value: string | undefined) => setDraft(prev => {
    const wf = value ?? ''
    const strategy = strategies.find(item => item.strategyCode === wf)
    return { ...prev, wf, algo: strategy?.naturalAlgoId?.trim() ?? '' }
  })
  // 选算法＝定口径；已选瀑布流与新算法不匹配时清空瀑布流，避免两个条件各说各话
  const handleAlgoChange = (value: string | undefined) => setDraft(prev => {
    const algo = value ?? ''
    const bound = prev.wf ? strategies.find(strategy => strategy.strategyCode === prev.wf)?.naturalAlgoId?.trim() : ''
    return { ...prev, algo, wf: !algo || bound === algo ? prev.wf : '' }
  })
  // 口径列整榜同值：品牌取算法自身配置；频道取绑定瀑布流的归类集合
  const scopeFallback = <span className="organic__muted">未設定</span>
  const scopeBrandCell = selectedAlgo?.brand ? <BrandTag value={selectedAlgo.brand} /> : scopeFallback
  const scopeWfText = boundWaterfalls.map(waterfallLabel).join('、')
  const scopeChannelText = boundChannelTexts.join('、')
  const scopeChannelCell = scopeChannelText || <span className="organic__muted">無</span>
  const scopeAlgoCell = selectedAlgo ? idNameStatic(selectedAlgo.algoCode, selectedAlgo.algoName) : scopeFallback
  // 綁定瀑布流列只放第一条，超出收进 +N 面板（面板逐条展示名称/编号/频道/状态），避免长串名称撑爆列宽
  const wfPanel = <div className="organic__wf-panel">{boundWaterfalls.map(strategy => <div className="organic__wf-item" key={strategy.strategyCode}>
    <b>{strategy.strategyName}</b>
    <span className="organic__muted">{strategy.strategyCode} · {waterfallChannelText(strategy, algoChannelByCode)}</span>
    {strategy.status === ServiceStatus.DISABLED && <Tag>停用</Tag>}
  </div>)}</div>
  const scopeWfCell = boundWaterfalls.length === 0
    ? <span className="organic__muted">無</span>
    : <div className="organic__wf-cell">
        <span className="organic__wf-name" title={waterfallLabel(boundWaterfalls[0])}>{waterfallLabel(boundWaterfalls[0])}</span>
        {boundWaterfalls.length > 1 && <Popover trigger="click" placement="leftTop" title={`綁定瀑布流 ${boundWaterfalls.length} 條`} content={wfPanel}>
          <Button type="link" size="small" className="organic__wf-more" title="查看全部綁定瀑布流" aria-label={`查看全部 ${boundWaterfalls.length} 條綁定瀑布流`}>+{boundWaterfalls.length - 1} ▾</Button>
        </Popover>}
      </div>
  // 导出当前榜单（未勾选=全量筛选结果，勾选=仅所选，跨页保留），不只当前页：口径列与表内各列同源，不跟随列显隐配置
  const handleExport = () => {
    if (!hasPermission('merchant-score-insight:export') || !selectedAlgo) return
    const picked = selectedKeys.length ? rows.filter(r => selectedKeys.includes(r.store.storeId)) : rows
    if (!picked.length) { message.warning('沒有可導出的資料'); return }
    const scope = `算法 ${selectedAlgo.algoCode} · 綁定瀑布流 ${boundWaterfalls.length} 條 · 業務頻道 ${scopeChannelText || '無'}`
    const data = picked.map(r => ({
      rank: r.rank,
      algoCode: selectedAlgo.algoCode,
      algoName: selectedAlgo.algoName,
      wfBindings: scopeWfText || '無',
      merchantId: r.store.merchantId, merchantName: r.store.merchantName,
      storeId: r.store.storeId, storeName: r.store.storeName,
      brand: brandText(selectedAlgo.brand), channel: scopeChannelText || '無',
      region: t(REGION_LABEL_KEY[r.store.regionId] ?? ''),
      commercial: scoreText(dimensionScore(r.store, 'commercial')),
      storeScore: scoreText(dimensionScore(r.store, 'store')),
      platform: scoreText(dimensionScore(r.store, 'platform')),
      total: scoreText(r.store.totalScore),
      scope,
      // 榜单目前取前端演示快照，导出必须带性质标记，避免被当成真实计分结果流转
      dataNature: '前端演示快照，非真實計分結果',
    }))
    exportToCSV(`商家權重分_${selectedAlgo.algoCode}`, EXPORT_FIELDS, data)
  }
  const idNameCell = (id: string, name: string) => <div className="organic__id-name"><b>{id}</b><span>{name}</span></div>
  // 集团/门店下拉选项：选项文案「ID/名稱」，支持按 ID 或名称搜索，选中后按 ID 精确筛选
  const merchantOptions = useMemo(() => { const seen = new Map<string, string>(); snapshot.stores.forEach(s => seen.set(s.merchantId, `${s.merchantId}/${s.merchantName}`)); return [...seen.entries()].map(([value, label]) => ({ value, label })) }, [snapshot])
  const storeOptions = useMemo(() => snapshot.stores.map(s => ({ value: s.storeId, label: `${s.storeId}/${s.storeName}` })), [snapshot])
  const columns: TableColumnsType<RankedRow> = [
    { key: 'rank', title: <span className="organic__th">排名<HelpPopover title="排名口徑" ariaLabel="排名口徑說明" placement="bottomLeft" content={[
      { tone: 'info', label: '綜合得分', body: '綜合得分＝商業維度分＋店鋪維度分＋平台維度分。占比（權重）配置模塊已停用，不參與計算。' },
      { tone: 'neutral', label: '排名範圍', body: '需先選擇自然流量算法；計分只依賴算法配置與品牌，與是否綁定瀑布流無關，名次按當前篩選條件從 1 連續重新編號。' },
      { tone: 'warn', label: '同分處理', body: '同分依次按店鋪綜合分、近30天訂單量、距離、門店ID穩定排序，不使用並列名次。' },
    ]} /></span>, width: 92, render: (_, r) => rankBadge(r.rank) },
    { key: 'algo', title: <span className="organic__th">算法ID/名稱<HelpPopover title="自然流量算法口徑" ariaLabel="自然流量算法口徑說明" placement="bottomLeft" width={380} content={[
      { tone: 'info', label: '榜單口徑', body: '榜單口徑＝所選自然流量算法。計分規則與品牌都配置在算法上，因此未綁定任何瀑布流的算法同樣可以出榜。' },
      { tone: 'neutral', label: '算法不歸屬頻道', body: '算法本身只定義計分參數；業務頻道是瀑布流對它的投放歸類，見「綁定瀑布流」「業務頻道」兩列。' },
    ]} /></span>, width: 190, render: () => scopeAlgoCell },
    { key: 'merchantIdName', title: '集團ID/名稱', width: 180, render: (_, r) => idNameCell(r.store.merchantId, r.store.merchantName) },
    { key: 'storeIdName', title: '門店ID/名稱', width: 210, render: (_, r) => idNameCell(r.store.storeId, r.store.storeName) },
    { key: 'brand', title: <span className="organic__th">所屬品牌<HelpPopover title="所屬品牌口徑" ariaLabel="所屬品牌口徑說明" placement="bottomLeft" width={380} content={[
      { tone: 'info', label: '取算法自身品牌', body: '取所選自然流量算法在算法庫綁定的「所屬品牌」，一條算法只屬一個品牌，榜內所有門店同一口徑。' },
      { tone: 'neutral', label: '不提供篩選', body: '品牌是單值口徑，因此不提供品牌篩選條件。' },
      { tone: 'warn', label: '未設定', body: '顯示「未設定」時請到「算法庫」補全該算法的品牌。' },
    ]} /></span>, width: 110, render: () => scopeBrandCell },
    { key: 'channel', title: <span className="organic__th">業務頻道<HelpPopover title="業務頻道口徑" ariaLabel="業務頻道口徑說明" placement="bottomLeft" width={420} content={[
      { tone: 'info', label: '頻道是投放歸類', body: '業務頻道由「瀑布流策略」歸類：本列展示綁定該算法的各條瀑布流所屬頻道的集合，跨頻道復用時會並列多個。' },
      { tone: 'neutral', label: '與瀑布流策略同口徑', body: '每條瀑布流的頻道解析直接复用「瀑布流策略」列表页規則：配置記錄優先 → 按坑位引用算法頻道推断 → 外賣到家默认美食外賣。' },
      { tone: 'warn', label: '無＝未綁定', body: '顯示「無」表示該算法尚未綁定任何瀑布流，因此還沒有頻道歸類；不影響算分。' },
    ]} /></span>, width: 140, render: () => scopeChannelCell },
    { key: 'region', title: '運營商圈', width: 120, render: (_, r) => t(REGION_LABEL_KEY[r.store.regionId] ?? '') },
    { key: 'commercial', title: '商業維度分', width: 130, align: 'right', render: (_, r) => scoreText(dimensionScore(r.store, 'commercial')) },
    { key: 'storeScore', title: '店鋪維度分', width: 130, align: 'right', render: (_, r) => scoreText(dimensionScore(r.store, 'store')) },
    { key: 'platform', title: '平台維度分', width: 130, align: 'right', render: (_, r) => scoreText(dimensionScore(r.store, 'platform')) },
    { key: 'total', title: '綜合得分', width: 130, align: 'right', render: (_, r) => <b className="organic__total-score">{scoreText(r.store.totalScore)}</b> },
    // 綁定瀑布流放最后一列（操作列前）：它是投放上下文而非计分要素，不占用前部阅读区
    { key: 'wfBindings', title: <span className="organic__th">綁定瀑布流<HelpPopover title="綁定瀑布流口徑" ariaLabel="綁定瀑布流口徑說明" placement="topLeft" width={400} content={[
      { tone: 'info', label: '只展示第一条', body: '列内只显示首条引用该算法的瀑布流，多条时折叠为 +N，点 +N 展开面板看全部（含编号、频道与停用标记）。' },
      { tone: 'neutral', label: '展示引用關係', body: '列出引用該算法作為「自然流量兜底算法」的全部瀑布流策略（含停用）。' },
      { tone: 'warn', label: '無＝尚未上線', body: '顯示「無」表示該算法還沒有綁定任何瀑布流：不影響算分與出榜，只是尚未歸類到任何業務頻道投放。' },
    ]} /></span>, width: 200, render: () => scopeWfCell },
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
        {/* 算法是榜单唯一必选口径：计分与绑定无关，未绑定瀑布流的算法也在这里出榜 */}
        <label><span className="organic__label--required">自然流量算法</span><Select aria-label="自然流量算法" allowClear showSearch optionFilterProp="label" placeholder="必選，請選擇算法" value={draft.algo || undefined} onChange={handleAlgoChange} options={algorithms.map(algo => ({ value: algo.algoCode, label: `${algo.algoName}(${algo.algoCode})` }))} /></label>
        {/* 瀑布流为可选带出入口：记得配置不记得算法时，选它自动带出绑定的自然流量算法 */}
        <label>瀑布流<Select aria-label="瀑布流" allowClear showSearch optionFilterProp="label" placeholder="可選，選後帶出其算法" value={draft.wf || undefined} onChange={handleWfChange} options={strategies.map(strategy => ({ value: strategy.strategyCode as string, label: waterfallLabel(strategy) }))} /></label>
        <label>排名<div className="organic__rank-range"><InputNumber aria-label="排名下限" min={1} precision={0} placeholder="最低名次" value={draft.rankMin} onChange={value => setDraft({ ...draft, rankMin: value })} /><span>–</span><InputNumber aria-label="排名上限" min={1} precision={0} placeholder="最高名次" value={draft.rankMax} onChange={value => setDraft({ ...draft, rankMax: value })} /></div></label>
        <label>集團ID/名稱<Select aria-label="集團ID/名稱" showSearch allowClear optionFilterProp="label" placeholder="全部" value={draft.merchant || undefined} onChange={value => setDraft({ ...draft, merchant: value ?? '' })} options={merchantOptions} /></label>
        <label>門店ID/名稱<Select aria-label="門店ID/名稱" showSearch allowClear optionFilterProp="label" placeholder="全部" value={draft.store || undefined} onChange={value => setDraft({ ...draft, store: value ?? '' })} options={storeOptions} /></label>
        <label>運營商圈<TreeSelect aria-label="運營商圈" treeCheckable showSearch treeNodeFilterProp="title" maxTagCount={2} placeholder="全澳門（不含珠海）" value={draft.regions} onChange={(value: (string | number)[]) => setDraft({ ...draft, regions: expandRegions(value) })} treeData={REGION_TREE_DATA.slice(0, 2).map(node => ({ value: node.value, title: t(node.titleKey), children: node.children.map(child => ({ value: child.value, title: t(child.titleKey) })) }))} allowClear /></label>
        {/* 标準列表页：操作按钮紧跟最后一个查询条件（§E.1） */}
        <div className="search-actions"><Button type="primary" icon={<SearchOutlined />} onClick={handleSearch}>查詢</Button><Button icon={<ReloadOutlined />} onClick={() => { setDraft(EMPTY_FILTERS); apply({ ...EMPTY_FILTERS, page: 1 }) }}>重置</Button></div>
      </div>
    </div>
    {/* 操作区（§E.2）：左侧导出（含勾选提示），右侧字段設置；本页无新增类动作，不加空按钮 */}
    <div className="action-section">
      <div className="action-section-left">
        {hasPermission('merchant-score-insight:export') && <Button className="btn-export" icon={<ExportOutlined />} disabled={!rows.length} onClick={handleExport}>{selectedKeys.length ? `導出(${selectedKeys.length})` : '導出'}</Button>}
        {selectedKeys.length > 0 && <><span className="organic__muted">已選 {selectedKeys.length} 家，導出僅含所選；不勾選則導出当前筛选全量</span><Button type="link" size="small" onClick={() => setSelectedKeys([])}>清空選擇</Button></>}
      </div>
      <div className="action-section-right">{configComponent}</div>
    </div>
    <Table<RankedRow> rowKey={r => r.store.storeId} columns={applyConfig(columns)} dataSource={pageRows} size="small" rowSelection={{ selectedRowKeys: selectedKeys, onChange: keys => setSelectedKeys(keys), columnWidth: 44 }} scroll={{ x: 2034 }} pagination={{ current: page, pageSize: size, total: rows.length, showSizeChanger: true, showQuickJumper: true, pageSizeOptions: PAGE_SIZES, showTotal: count => `共 ${count} 家參排名門店`, onChange: (next, nextSize) => apply({ page: nextSize !== size ? 1 : next, size: nextSize }) }} locale={{ emptyText: <Empty description={emptyHint(filters, algorithms.length, selectedAlgo, wfHasNoAlgo)} /> }} />
  </div>
}

/** 空態分檔：未選算法（含瀑布流未綁算法的子檔） / 算法庫不可用 / 算法不存在或未啟用 / 條件過窄 */
function emptyHint(filters: Filters, algorithmCount: number, selectedAlgo: AdAlgorithm | undefined, wfHasNoAlgo: boolean): string {
  if (!filters.algo) {
    if (filters.wf && wfHasNoAlgo) return '該瀑布流未綁定自然流量算法，請改選算法，或到「瀑布流策略」為其補綁'
    return '請先選擇自然流量算法後再查看排名'
  }
  if (!algorithmCount) return '算法庫暫不可用，請稍後重試'
  if (!selectedAlgo) return '所選算法不存在或未啟用，請重新選擇算法'
  return '沒有符合條件的門店'
}
// 表格内 ID/名称单元素（口径列整榜同值，按行重复构造没有意义，所以在列定义外算一次）
function idNameStatic(id: string, name: string) {
  return <div className="organic__id-name"><b>{id}</b>{name && <span>{name}</span>}</div>
}
