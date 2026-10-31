/**
 * Copyright (c) 2026 fengsong7889. All Rights Reserved.
 *
 * 本文件为「MFTB 企业一体化管理平台软件」的组成部分。
 * 未经著作权人书面许可，不得使用、复制、修改、再分发或用于任何商业目的。
 * 完整许可条款见仓库根目录 LICENSE 文件。
 */
import { lazy, Suspense, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Alert, Button, Empty, Input, InputNumber, Result, Segmented, Select, Spin, Table, Tag } from 'antd'
import type { TableColumnsType } from 'antd'
import { Line } from '@ant-design/charts'
import { AimOutlined, ExportOutlined } from '@ant-design/icons'
import { AppType } from '@mftb/contracts/recommendConstants'
import { useAuth } from '@/contexts/AuthContext'
import { useColumnConfig } from '@/hooks/useColumnConfig'
import HelpPopover from '@/components/HelpPopover'
import { exportToCSV } from '@/utils/exportCSV'
import { DISTANCE_CURVE, getSampleSnapshot, POINTS, SCENES, TARGET_STORE } from './fixtures'
import { coordinateError, matchSamplePoint, rankChange, rankText, readBoardQuery, scoreText } from './display'
import { ContextStrip, DemoNotice, EligibilityTag, ScoreHeader, Section, VisualBoundary } from './ScoreParts'
import type { Coordinate, PointId, SimulationComparison, SimulationMode, StoreResult } from './types'
import './organic.css'

const LocationMap = lazy(() => import('./LocationMap'))
interface Comparison { store: StoreResult; after: StoreResult | null; changes: string[]; comparison: SimulationComparison }
const COLUMN_META = [{ key: 'store', title: '門店' }, { key: 'a', title: 'A點得分 / 全澳名次' }, { key: 'b', title: 'B點得分 / 全澳名次' }, { key: 'delta', title: '分差 / 名次變化' }, { key: 'reason', title: '變化原因' }, { key: 'action', title: '操作' }]

export default function LocationSimulation() {
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const { hasMenuPermission, hasPermission } = useAuth()
  const query = useMemo(() => readBoardQuery(params), [params])
  const [mode, setMode] = useState<SimulationMode>('distance')
  const [basePoint, setBasePoint] = useState<PointId>(query.point)
  const initialB = query.point === 'A' ? POINTS.B : POINTS.A
  const [lat, setLat] = useState<number | null>(initialB.lat)
  const [lng, setLng] = useState<number | null>(initialB.lng)
  const [appliedPoint, setAppliedPoint] = useState<PointId | null>(initialB.id)
  const [attempted, setAttempted] = useState(false)
  const [keyword, setKeyword] = useState('')
  const [page, setPage] = useState(1)
  const [size, setSize] = useState(20)
  const { applyConfig, configComponent } = useColumnConfig('organic-location-comparison', COLUMN_META, [{ key: 'store', locked: 'head' }, { key: 'action', locked: 'tail' }])
  const error = coordinateError(lat, lng)
  const draftPoint = error ? null : { lat: lat!, lng: lng! }
  const matchedPoint = draftPoint ? matchSamplePoint(draftPoint) : null
  const currentPoint = matchedPoint && matchedPoint === appliedPoint ? matchedPoint : null
  const baseline = useMemo(() => getSampleSnapshot(query.brand, basePoint, query.scene, mode), [query.brand, query.scene, basePoint, mode])
  const comparison = useMemo(() => currentPoint ? getSampleSnapshot(query.brand, currentPoint, query.scene, mode) : null, [query.brand, query.scene, currentPoint, mode])
  const selectedId = params.get('storeId') || TARGET_STORE
  const selected = baseline.stores.find(s => s.storeId === selectedId) ?? baseline.stores.find(s => s.storeId === TARGET_STORE)!
  const selectedB = comparison?.stores.find(s => s.storeId === selected.storeId) ?? null
  const rows = useMemo(() => {
    const afterById = new Map(comparison?.stores.map(s => [s.storeId, s]) ?? [])
    return baseline.stores.map((store): Comparison => {
      const after = afterById.get(store.storeId) ?? null
      const changedRules = after ? store.rules.filter(r => {
        const b = after.rules.find(next => next.ruleCode === r.ruleCode)
        return b?.rawScore !== r.rawScore || b?.matchStatus !== r.matchStatus
      }) : []
      const eligibilityTransition = after && store.eligibility !== after.eligibility ? `${store.eligibility} → ${after.eligibility}` : null
      return { store, after, changes: [...changedRules.map(r => `${r.name}（${r.ruleCode}）`), ...(eligibilityTransition ? ['排序資格'] : [])],
        comparison: { contextId: baseline.scenarioId, pointA: baseline.location, pointB: comparison?.location ?? null,
          scoreA: store.totalScore, scoreB: after?.totalScore ?? null, rankA: store.globalRank, rankB: after?.globalRank ?? null,
          scoreDelta: store.totalScore != null && after?.totalScore != null ? after.totalScore - store.totalScore : null,
          rankDeltaText: after ? rankChange(store.globalRank, after.globalRank) : '不可比較',
          eligibilityTransition, changedRuleCodes: changedRules.map(r => r.ruleCode) } }
    }).filter(r => `${r.store.storeName} ${r.store.storeCode}`.toLowerCase().includes(keyword.toLowerCase()))
  }, [baseline, comparison, keyword])
  const pickPoint = (p: Coordinate) => { setLat(p.lat); setLng(p.lng); setAttempted(false) }
  const choosePreset = (id: PointId) => { pickPoint(POINTS[id]); setAppliedPoint(id); setPage(1) }
  const chooseStore = (id: string) => { const next = new URLSearchParams(params); next.set('storeId', id); setParams(next, { replace: true }) }
  const applyPoint = () => { setAttempted(true); if (error) return; setAppliedPoint(matchedPoint); setPage(1) }
  const updateContext = (key: string, value: string) => { const next = new URLSearchParams(params); next.set(key, value); setParams(next, { replace: true }); setPage(1) }
  const selectedComparison = rows.find(r => r.store.storeId === selected.storeId)?.comparison ?? null
  const columns: TableColumnsType<Comparison> = [
    { key: 'store', title: '門店', width: 220, render: (_, r) => <><b>{r.store.storeName}</b><div className="organic__muted">{r.store.storeCode}</div></> },
    { key: 'a', title: 'A點得分 / 全澳名次', width: 180, render: (_, r) => <><strong>{scoreText(r.store.totalScore)} 分</strong><div>{rankText(r.store.globalRank, r.store.rankPopulation)}</div><EligibilityTag value={r.store.eligibility} /></> },
    { key: 'b', title: 'B點得分 / 全澳名次', width: 180, render: (_, r) => r.after ? <><strong>{scoreText(r.after.totalScore)} 分</strong><div>{rankText(r.after.globalRank, r.after.rankPopulation)}</div><EligibilityTag value={r.after.eligibility} /></> : '待接入試算' },
    { key: 'delta', title: '分差 / 名次變化', width: 150, render: (_, r) => <><b className={r.comparison.scoreDelta != null && r.comparison.scoreDelta < 0 ? 'organic__negative' : undefined}>{r.comparison.scoreDelta != null && r.comparison.scoreDelta > 0 ? '+' : ''}{scoreText(r.comparison.scoreDelta)}</b><div>{r.comparison.rankDeltaText}</div></> },
    { key: 'reason', title: '變化原因', width: 240, render: (_, r) => !r.after ? '定位已更改，沒有此位置的樣例結果' : <>{r.changes.length ? r.changes.join('、') : '分項不變；名次仍受其他門店變化影響'}{r.comparison.eligibilityTransition && <div className="organic__muted">資格變化：{r.comparison.eligibilityTransition}</div>}</> },
    { key: 'action', title: '操作', width: 90, render: (_, r) => <Button type="link" onClick={() => chooseStore(r.store.storeId)}>選中門店</Button> },
  ]
  const handleExport = () => {
    if (!comparison || !hasPermission('algorithm-simulation:export')) return
    const data = rows.map(r => ({ mode: '演示資料', store: r.store.storeCode, scoreA: scoreText(r.comparison.scoreA), scoreB: scoreText(r.comparison.scoreB), rankA: rankText(r.comparison.rankA, r.store.rankPopulation), rankB: rankText(r.comparison.rankB, r.after?.rankPopulation), change: r.comparison.rankDeltaText, reason: r.changes.join('、'), changedRules: r.comparison.changedRuleCodes.join('、'), eligibility: r.comparison.eligibilityTransition ?? '未變化', snapshot: baseline.snapshotId, config: baseline.configVersion, pointA: `${baseline.location.lat}/${baseline.location.lng}`, pointB: `${comparison.location.lat}/${comparison.location.lng}`, evaluated: baseline.evaluationTime, candidateSet: baseline.candidateSetId, simulationMode: mode }))
    const fields = { mode: '資料性質', store: '門店', scoreA: 'A得分', scoreB: 'B得分', rankA: 'A全澳排名/分母', rankB: 'B全澳排名/分母', change: '名次變化', reason: '變化分項', changedRules: '變化規則編碼', eligibility: '資格變化', snapshot: '快照', config: '配置版本', pointA: 'A座標WGS84', pointB: 'B座標WGS84', evaluated: '評估時間(澳門)', candidateSet: '候選集合', simulationMode: '模擬方式' }
    exportToCSV('定位對比_演示資料', Object.entries(fields).map(([dataIndex, title]) => ({ dataIndex, title })), data)
  }
  if (!hasMenuPermission('algorithm-simulation')) return <Result status="403" title="沒有算法推演查看權限" />
  return <div className="content-area organic">
    <ScoreHeader title="定位排名模擬" subtitle="固定同一份資料，觀察位置改變帶來的分數與名次差異。">{hasMenuPermission('merchant-score-insight') && <Button onClick={() => navigate(`/merchant-score-insight?brand=${query.brand}&point=${basePoint}&scene=${query.scene}`)}>返回計分看板</Button>}</ScoreHeader>
    <DemoNotice />
    <div className="search-section organic__search">
      <div className="organic__filter-bottom"><Segmented value={mode} onChange={value => { setMode(value as SimulationMode); setPage(1) }} options={[{ value: 'distance', label: '僅距離變化' }, { value: 'full', label: '完整場景' }]} /><Select aria-label="模擬品牌" value={query.brand} onChange={brand => updateContext('brand', String(brand))} options={[{ value: AppType.SHANFENG, label: '閃蜂' }, { value: AppType.MFOOD, label: 'mFood' }]} /><Select aria-label="模擬樣例" value={query.scene} onChange={scene => updateContext('scene', scene)} options={SCENES} /><HelpPopover title="兩種比較方式" ariaLabel="模擬方式說明" content={[{ tone: 'info', label: '僅距離變化', body: '固定候選集合與其他分項，只改變PLT_01距離原始分。同一門店距離分不增，不代表名次一定下降。' }, { tone: 'warn', label: '完整場景', body: '固定輸入資料快照，同時展示配送分層與資格變化的預製樣例，不是實時配送判定。未接入任意定位試算。' }]} /></div>
      <div className="organic__coordinate-fields"><label>B點預設位置<Select aria-label="B點預設位置" placeholder="自訂座標（待接入）" value={matchedPoint ?? undefined} options={Object.values(POINTS).map(p => ({ value: p.id, label: p.label }))} onChange={choosePreset} /></label><label>經度 lng<InputNumber aria-label="經度 lng" value={lng} onChange={value => { setLng(value); setAttempted(false) }} step={0.0001} /></label><label>緯度 lat<InputNumber aria-label="緯度 lat" value={lat} onChange={value => { setLat(value); setAttempted(false) }} step={0.0001} /></label></div>
      <div className="organic__coordinate-actions"><Button type="primary" icon={<AimOutlined />} onClick={applyPoint}>應用位置</Button><Button disabled={!currentPoint} onClick={() => { if (currentPoint) setBasePoint(currentPoint) }}>將此位置設為A點</Button><Button onClick={() => { setBasePoint('A'); choosePreset('B') }}>重置A/B點</Button><span className="organic__muted">A點：{POINTS[basePoint].label} · {POINTS[basePoint].lat}, {POINTS[basePoint].lng}</span></div>
      {error && <Alert type={attempted ? 'error' : 'warning'} message={error} />}
    </div>
    <ContextStrip snapshot={baseline} />
    {!currentPoint && <Alert className="organic__notice" type="warning" showIcon message={attempted && !error ? '該位置待接入真實試算' : 'B點已更改，結果尚未更新'} description="僅預設點A/B有固定樣例。下方B點得分與名次已隱藏，不使用舊結果冒充新位置。" />}
    <div className="organic__map-grid"><VisualBoundary label="定位地圖"><Suspense fallback={<div className="organic__loading"><Spin /></div>}><LocationMap pointA={POINTS[basePoint]} pointB={draftPoint ?? POINTS[appliedPoint ?? 'B']} stores={baseline.stores} selected={selected.storeId} onPick={pickPoint} onStore={chooseStore} /></Suspense></VisualBoundary>
      <Section title="選中門店 · A/B對照" description="分數差與位次差分開查看">
        <div className="organic__simulation-summary"><Select aria-label="選中門店" showSearch optionFilterProp="label" value={selected.storeId} onChange={chooseStore} options={baseline.stores.map(s => ({ value: s.storeId, label: `${s.storeName} ${s.storeCode}` }))} />
          <div className="organic__point-pair">{[{ key: 'A', store: selected }, { key: 'B', store: selectedB }].map(item => <div className="organic__point-card" key={item.key}><span>{item.key}點 · 綜合得分</span><b>{scoreText(item.store?.totalScore)}</b><p>全澳 {rankText(item.store?.globalRank, item.store?.rankPopulation)}</p><p>本商圈 {rankText(item.store?.regionRank, item.store?.regionPopulation)}</p><p>距離 {item.store?.distanceKm == null ? '—' : `${item.store.distanceKm.toFixed(4)} km`}</p></div>)}</div>
          <p><Tag color="purple">{selectedComparison?.rankDeltaText ?? '不可比較'}</Tag><span className="organic__muted">總分不等於距離分；置後／過濾不按低分處理。</span></p>
          {selectedComparison?.eligibilityTransition && <div className="organic__deduction-note">資格變化：{selectedComparison.eligibilityTransition}（完整場景演示，不是實時配送判定）</div>}
          {selectedComparison && selectedComparison.changedRuleCodes.length > 0 && <p className="organic__muted">變化規則：{selectedComparison.changedRuleCodes.join('、')}</p>}
          <div className="organic__formula">距離原始分＝max(0, 100 − 5 × 距離km)</div>
        </div>
      </Section>
    </div>
    <Section title="距離衰減曲線" description="固定示例：滿分100、每公里扣5分，20公里歸零。曲線僅代表PLT_01原始分。">
      <VisualBoundary label="距離曲線"><Line height={170} data={DISTANCE_CURVE} xField="distance" yField="score" scale={{ x: { type: 'linear' }, y: { domain: [0, 100] } }} style={{ stroke: '#722ED1', lineWidth: 2 }} point={{ size: 3 }} axis={{ x: { title: '距離（km）' }, y: { title: '原始分' } }} animate={false} /></VisualBoundary>
      <div className="organic__legend">{DISTANCE_CURVE.filter(p => [0, 1, 5, 20].includes(p.distance)).map(p => <span key={p.distance}>{p.distance} km → <b>{p.score} 分</b></span>)}</div>
    </Section>
    <div className="action-section"><div className="action-section-left"><Input aria-label="對比門店搜尋" placeholder="搜尋對比門店" value={keyword} maxLength={100} allowClear onChange={e => { setKeyword(e.target.value); setPage(1) }} />{hasPermission('algorithm-simulation:export') && <Button className="btn-export" icon={<ExportOutlined />} disabled={!comparison || !rows.length} onClick={handleExport}>導出演示對比</Button>}</div><div className="action-section-right">{configComponent}</div></div>
    <Table<Comparison> rowKey={row => row.store.storeId} columns={applyConfig(columns)} dataSource={rows} size="small" scroll={{ x: 1150 }} pagination={{ current: page, pageSize: size, total: rows.length, showQuickJumper: true, showSizeChanger: true, pageSizeOptions: [10, 20, 50, 100], showTotal: count => `共 ${count} 家門店`, onChange: (next, nextSize) => { setPage(nextSize !== size ? 1 : next); setSize(nextSize) } }} locale={{ emptyText: <Empty description="沒有符合條件的對比門店" /> }} />
  </div>
}
