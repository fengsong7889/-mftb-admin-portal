import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Button, Empty, Result, Table, TreeSelect } from 'antd'
import type { TableColumnsType } from 'antd'
import { ReloadOutlined, SearchOutlined } from '@ant-design/icons'
import { RECOMMEND_CHANNEL_OPTIONS, REGION_TREE_DATA, type Region } from '@mftb/contracts/recommendConstants'
import { useAuth } from '@/contexts/AuthContext'
import HelpPopover from '@/components/HelpPopover'
import { getSampleSnapshot } from './organic/fixtures'
import { expandRegions, scoreText } from './organic/display'
import { DemoNotice, ScoreHeader } from './organic/ScoreParts'
import StoreScoreDetail from './organic/StoreScoreDetail'
import type { Dimension, StoreResult } from './organic/types'
import './organic/organic.css'

interface RankedRow { store: StoreResult; rank: number }
const PAGE_SIZES = [10, 20, 50, 100]
const dimensionScore = (store: StoreResult, dimension: Dimension) => store.dimensions.find(d => d.dimension === dimension)?.rawScore

/**
 * 商家權重分排名：只保留區域搜索與排名列表。
 * 占比（權重）配置模塊已停用並將刪除，頁面不再計算占比、歸一或加權貢獻，
 * 綜合得分＝商業＋店鋪＋平台三個維度得分直接相加。
 */
export default function MerchantScoreInsight() {
  const { t } = useTranslation()
  const { hasMenuPermission } = useAuth()
  const [params, setParams] = useSearchParams()
  const snapshot = useMemo(() => getSampleSnapshot(), [])
  const regions = useMemo(() => expandRegions((params.get('regions') ?? '').split(',').filter(Boolean)), [params])
  const sizeParam = Number(params.get('size'))
  const size = PAGE_SIZES.includes(sizeParam) ? sizeParam : 20
  const [draftRegions, setDraftRegions] = useState<Region[]>(regions)
  useEffect(() => { setDraftRegions(regions) }, [regions])
  const view = params.get('view') === 'detail' ? 'detail' : 'overview'
  const rows = useMemo(() => snapshot.stores
    .filter(s => s.totalScore != null && (!regions.length || regions.includes(s.regionId)))
    .map((store, index) => ({ store, rank: index + 1 })), [snapshot, regions])
  // 筛选后页码可能超出范围（手改 URL 或缩小区域），限制在最后一页，避免空白列表。
  const page = Math.min(Math.max(1, Number(params.get('page') || 1)), Math.max(1, Math.ceil(rows.length / size)))
  const pageRows = rows.slice((page - 1) * size, page * size)
  const channelLabel = t(RECOMMEND_CHANNEL_OPTIONS.find(o => o.value === snapshot.channel)?.labelKey ?? 'recommend.channelDelivery')
  const apply = (next: { regions?: Region[]; page?: number; size?: number; view?: string; storeId?: string }) => {
    const scoped = next.regions ?? regions
    const query = new URLSearchParams()
    if (scoped.length) query.set('regions', scoped.join(','))
    query.set('page', String(next.page ?? 1))
    query.set('size', String(next.size ?? size))
    if (next.view) query.set('view', next.view)
    if (next.storeId) query.set('storeId', next.storeId)
    setParams(query)
  }
  const openDetail = (store: StoreResult) => apply({ page, view: 'detail', storeId: store.storeId })
  const handleBack = () => apply({ page })
  const columns: TableColumnsType<RankedRow> = [
    { key: 'rank', title: <span className="organic__th">排名<HelpPopover title="排名口徑" ariaLabel="排名口徑說明" placement="bottomLeft" content={[
      { tone: 'info', label: '綜合得分', body: '綜合得分＝商業維度分＋店鋪維度分＋平台維度分。占比（權重）配置模塊已停用，不參與計算。' },
      { tone: 'neutral', label: '排名範圍', body: '不選區域時為全澳門 11 個運營商圈的排名；選中區域後為所選區域內的名次。' },
      { tone: 'warn', label: '同分處理', body: '同分依次按店鋪綜合分、近30天訂單量、距離、門店ID穩定排序，不使用並列名次。' },
    ]} /></span>, width: 92, render: (_, r) => <b className="organic__rank-number">{r.rank}</b> },
    { key: 'storeId', title: '門店ID', width: 140, render: (_, r) => r.store.storeId },
    { key: 'storeName', title: '門店名稱', width: 240, render: (_, r) => r.store.storeName },
    { key: 'channel', title: '業務頻道', width: 130, render: () => channelLabel },
    { key: 'commercial', title: '商業維度分', width: 130, align: 'right', render: (_, r) => scoreText(dimensionScore(r.store, 'commercial')) },
    { key: 'store', title: '店鋪維度分', width: 130, align: 'right', render: (_, r) => scoreText(dimensionScore(r.store, 'store')) },
    { key: 'platform', title: '平台維度分', width: 130, align: 'right', render: (_, r) => scoreText(dimensionScore(r.store, 'platform')) },
    { key: 'action', title: '操作', width: 96, fixed: 'right', render: (_, r) => <Button type="link" size="small" onClick={() => openDetail(r.store)}>詳情</Button> },
  ]
  if (!hasMenuPermission('merchant-score-insight')) return <Result status="403" title="沒有查看權限" subTitle="請聯絡管理員授予商家權重分排名查看權限。" />
  if (view === 'detail') {
    const store = snapshot.stores.find(s => s.storeId === params.get('storeId'))
    return store ? <StoreScoreDetail key={store.storeId} store={store} snapshot={snapshot} onBack={handleBack} />
      : <Result status="404" title="找不到演示門店" extra={<Button onClick={handleBack}>返回排名</Button>} />
  }
  return <div className="content-area organic">
    <ScoreHeader title="商家權重分排名" subtitle="按商業、店鋪、平台三個維度的得分合計排序。" />
    <DemoNotice />
    <div className="search-section organic__search">
      <div className="organic__filter-grid organic__filter-grid--simple">
        <label>運營區域<TreeSelect aria-label="運營區域" treeCheckable showSearch treeNodeFilterProp="title" maxTagCount={2} placeholder="全澳門（不含珠海）" value={draftRegions} onChange={(value: (string | number)[]) => setDraftRegions(expandRegions(value))} treeData={REGION_TREE_DATA.slice(0, 2).map(node => ({ value: node.value, title: t(node.titleKey), children: node.children.map(child => ({ value: child.value, title: t(child.titleKey) })) }))} allowClear /></label>
      </div>
      <div className="organic__filter-bottom">
        <span className="organic__muted">不選區域＝全澳門 11 個運營商圈（不含珠海）</span>
        <div className="search-actions"><Button type="primary" icon={<SearchOutlined />} onClick={() => apply({ regions: draftRegions, page: 1 })}>查詢</Button><Button icon={<ReloadOutlined />} onClick={() => { setDraftRegions([]); apply({ regions: [], page: 1 }) }}>重置</Button></div>
      </div>
    </div>
    <Table<RankedRow> rowKey={r => r.store.storeId} columns={columns} dataSource={pageRows} size="small" scroll={{ x: 1090 }} pagination={{ current: page, pageSize: size, total: rows.length, showSizeChanger: true, showQuickJumper: true, pageSizeOptions: PAGE_SIZES, showTotal: count => `共 ${count} 家參排名門店`, onChange: (next, nextSize) => apply({ page: nextSize !== size ? 1 : next, size: nextSize }) }} locale={{ emptyText: <Empty description="沒有符合條件的門店" /> }} />
  </div>
}
