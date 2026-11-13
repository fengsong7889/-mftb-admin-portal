/**
 * Copyright (c) 2026 fengsong7889. All Rights Reserved.
 *
 * 本文件为「MFTB 企业一体化管理平台软件」的组成部分。
 * 未经著作权人书面许可，不得使用、复制、修改、再分发或用于任何商业目的。
 * 完整许可条款见仓库根目录 LICENSE 文件。
 */
import { useState, type Key } from 'react'
import { Descriptions, Empty, InputNumber, Segmented, Select, Table, Tag } from 'antd'
import type { TableColumnsType } from 'antd'
import DetailPageHeader from '@/components/DetailPageHeader'
import { DEFAULT_ORGANIC_SCORE_RULES, DEFAULT_TRAFFIC_BALANCE_CONFIG, DEFAULT_DECAY_PERIOD_CONFIG, TIME_PERIOD_KEYS, TIME_PERIOD_LABELS, decayMaxScoreOf } from '../../Recommend/organicTrafficConfig'
import { DIMENSIONS } from './fixtures'
import { scoreText } from './display'
import { MatchTag, Section } from './ScoreParts'
import DimensionGauge from './DimensionGauge'
import type { RuleResult, ScoreSnapshot, StoreResult } from './types'

/** 距离衰减算法库真值（分时段满分/衰减系数），不在前端另写一套数 */
const DECAY_RULE = DEFAULT_ORGANIC_SCORE_RULES.find(item => item.id === 'PLT_01')
const DECAY_CFG = DECAY_RULE?.decayPeriodConfig ?? DEFAULT_DECAY_PERIOD_CONFIG
const DECAY_PER_KM = DECAY_RULE?.decayCoefficient ?? 5
/** 默认试算距离 3km：外卖行业公开调研综合取值（美团研究院 2022：约 75% 订单在 3 公里内、单均约 2.9km，3km 为主流配送核心半径）；实际以用户与门店距离为准 */
const SIM_DEFAULT_DISTANCE = 3
/** 流量均衡统计口径真值（算法库 PLT_03.trafficBalanceConfig），展示不另写一套 */
const BALANCE_RULE = DEFAULT_ORGANIC_SCORE_RULES.find(item => item.id === 'PLT_03')
const BALANCE_CFG = BALANCE_RULE?.trafficBalanceConfig ?? structuredClone(DEFAULT_TRAFFIC_BALANCE_CONFIG)
const BALANCE_ORDER_TYPE_LABELS: Record<string, string> = { DELIVERY: '外賣訂單', PICKUP: '自取訂單' }

/**
 * 單店計分明細。占比（權重）配置已停用，這裡只展示三個維度的原始分合計，
 * 不計算權重、不展示占比與加權貢獻，避免把已下線的配置口徑帶回頁面。
 */
export default function StoreScoreDetail({ store, snapshot, onBack }: {
  store: StoreResult; snapshot: ScoreSnapshot; onBack: () => void
}) {
  const [expanded, setExpanded] = useState<readonly Key[]>([])
  const [dimension, setDimension] = useState('commercial')
  /** 距离衰减计算器：默认 3km（行业调研综合取值），用户可调；顶部「距離衰減得分」卡实时跟随 */
  const [simDistance, setSimDistance] = useState<number>(SIM_DEFAULT_DISTANCE)
  /** 满分已改分时段配置：计算器可选当前时段，满分取该时段配置值（默认午餐） */
  const [simPeriod, setSimPeriod] = useState<string>('lunch')
  const simPeriodLabel = TIME_PERIOD_LABELS[simPeriod as keyof typeof TIME_PERIOD_LABELS] ?? simPeriod
  const decayMax = decayMaxScoreOf(DECAY_CFG, simPeriod)
  const simScore = Math.max(0, decayMax - DECAY_PER_KM * simDistance)
  const dimensionScore = (key: string) => store.dimensions.find(d => d.dimension === key)?.rawScore
  const columns: TableColumnsType<RuleResult> = [
    { key: 'code', title: '計分ID', width: 120, render: (_, r) => <span className="organic__muted">{r.ruleCode}</span> },
    { key: 'name', title: '計分名稱', width: 220, render: (_, r) => <b>{r.name}</b> },
    { key: 'status', title: '匹配狀態', width: 110, render: (_, r) => <MatchTag status={r.matchStatus} /> },
    { key: 'raw', title: '得分', width: 100, align: 'right', render: (_, r) => <b className={r.rawScore != null && r.rawScore < 0 ? 'organic__negative' : undefined}>{scoreText(r.rawScore)}</b> },
  ]
  const renderRuleTable = (list: RuleResult[]) => <Table<RuleResult> columns={columns} dataSource={list} rowKey="ruleCode" size="small" pagination={false} scroll={{ x: 640 }} locale={{ emptyText: <Empty description="沒有符合條件的計分項" /> }} expandable={{ expandedRowKeys: expanded, onExpandedRowsChange: setExpanded, expandedRowRender: r => {
    const activity = r.activity
    const guard = r.guard
    return <div className="organic__rule-evidence">
    {activity && <div className="organic__ev-block">
      <h5>活動匹配（來自活動平台）</h5>
      <Descriptions column={2} size="small"><Descriptions.Item label="活動ID">{activity.activityId}</Descriptions.Item><Descriptions.Item label="活動名稱">{activity.activityName}</Descriptions.Item><Descriptions.Item label="匹配梯度" span={2}><Tag color="orange">{activity.matchedText ?? `滿${activity.matchedTier.threshold}減${activity.matchedTier.discount}`}</Tag><span className="organic__muted">活動回傳多個生效梯度，計分只取優惠最高的一檔匹配自然流量配置條件</span></Descriptions.Item></Descriptions>
    </div>}
    <div className="organic__ev-block">
      <h5>得分構成（命中算法庫自然流量梯度）</h5>
      <div className="organic__score-cards">{(r.parts?.length ? r.parts : [{ label: r.ruleCode === 'PLT_01' ? '距離衰減得分' : r.name, score: r.ruleCode === 'PLT_01' ? simScore : r.rawScore ?? 0 }]).map(p => <div className="organic__score-card" key={p.label}><span>{p.label}</span>{p.status && <Tag color={p.status === '已停發' ? 'red' : 'default'}>{p.status}</Tag>}<b className={p.score < 0 ? 'organic__negative' : undefined}>{p.score > 0 ? '+' : ''}{scoreText(p.score)}</b>{(p.reference || p.validFrom) && <small>{[p.reference, p.validFrom && `生效 ${p.validFrom} → ${p.validTo ?? '—'}`].filter(Boolean).join(' · ')}</small>}</div>)}</div>
      {r.parts?.length ? <div className="organic__formula">本項合計 {scoreText(r.rawScore)} 分</div> : r.ruleCode === 'PLT_01' ? <div className="organic__muted">得分 = max(0, {decayMax}〔{simPeriodLabel}〕 − {DECAY_PER_KM} × {simDistance.toFixed(2)} km) = {scoreText(simScore)}（默認 {SIM_DEFAULT_DISTANCE} km，可用下方計算器調整）</div> : <div className="organic__muted">本項無子分構成，直接取原始分 {scoreText(r.rawScore)}</div>}
    </div>
    {r.ruleCode === 'PLT_01' && <div className="organic__ev-block">
      <h5>距離衰減計算器</h5>
      <div className="organic__score-cards">
        <div className="organic__score-card"><span>配置滿分（{simPeriodLabel}）</span><b>{scoreText(decayMax)}</b></div>
        <div className="organic__score-card"><span>衰減係數（每公里扣分）</span><b>−{DECAY_PER_KM.toFixed(2)}</b></div>
      </div>
      <div className="organic__formula">公式：得分 = max(0, 滿分（當前時段） − 衰減係數 × 用戶與門店直線距離km)</div>
      <p className="organic__muted">提示：本項實際得分需按用戶定位與門店位置的具體距離即時計算，同一門店對不同用戶得分不同，系統無法預聚合直接納入總分。默認距離 {SIM_DEFAULT_DISTANCE} km 係外賣行業公開調研數據綜合取值（約 75% 外賣訂單配送距離在 3 公里內、單均約 2.9km，3km 為主流配送核心半徑），實際以用戶與門店的實際距離為準。</p>
      <div className="organic__distance-sim"><span>當前時段</span><Select aria-label="當前時段" value={simPeriod} onChange={setSimPeriod} style={{ width: 150 }} options={TIME_PERIOD_KEYS.map(key => ({ value: key, label: TIME_PERIOD_LABELS[key] }))} /><b>滿分取該時段配置值，衰減係數全局單一</b></div>
      <div className="organic__distance-sim"><span>用戶與門店距離（km）</span><InputNumber aria-label="用戶與門店距離" min={0} max={999} step={0.1} precision={2} value={simDistance} onChange={value => setSimDistance(value ?? SIM_DEFAULT_DISTANCE)} style={{ width: 150 }} /><b>得分即時同步至上方「距離衰減得分」卡</b></div>
    </div>}
    {r.ruleCode === 'PLT_03' && <div className="organic__ev-block">
      <h5>統計口徑（來自算法庫配置）</h5>
      <Descriptions column={2} size="small"><Descriptions.Item label="統計週期">滾動過去 {BALANCE_CFG.statDays} 天</Descriptions.Item><Descriptions.Item label="統計刷新">每 {BALANCE_CFG.refreshMinutes} 分鐘重新統計</Descriptions.Item><Descriptions.Item label="訂單類型">{BALANCE_CFG.orderTypes.map(type => BALANCE_ORDER_TYPE_LABELS[type] ?? type).join('＋')}（已取消不納入）</Descriptions.Item><Descriptions.Item label="退款訂單計入">{BALANCE_CFG.includeRefunded ? '計入統計' : '不計入統計'}</Descriptions.Item></Descriptions>
    </div>}
    {guard && <div className={`organic__ev-block organic__guard${guard.triggered ? ' organic__guard--triggered' : ''}`}>
      <b>{guard.triggered ? '已觸發圍欄' : '圍欄未觸發'}</b>：{guard.rule}<Tag className="organic__guard-tag" color={guard.enrollScoreSuspended ? 'red' : 'green'}>{guard.enrollScoreSuspended ? '報名分已停發' : '報名分正常'}</Tag>
    </div>}
    {r.matchStatus !== 'scored' && r.matchStatus !== 'deducted' && <p className="organic__muted">未得分原因：<span>{r.reason}</span>；處理建議：核對{r.ruleStatus === 'inapplicable' ? '品牌適用範圍，無需補報名' : r.matchStatus === 'insufficient' ? '統計窗口與有效訂單樣本，不用0替代未知取消率' : r.matchStatus === 'stale' ? '指標任務與更新時間' : r.matchStatus === 'error' ? '指標任務執行日誌與重跑結果' : activity ? '活動平台回傳的生效活動與梯度配置' : '活動報名、有效期、配置及資料來源'}。本頁不執行業務修改。</p>}
  </div>
} }} />
  return <div className="content-area organic">
    <DetailPageHeader title="門店計分詳情" meta={`${store.storeId} · ${store.storeName}`} onBack={onBack} />
    {/* 仪表盘上方的门店信息已删除（页头 meta 已展示门店ID/名称），此处只保留得分卡片 */}
    <section className="organic__section">
      {store.eligibility !== 'ranked' && <p className="organic__muted">{store.eligibilityReason}；未參與本次排名，已知分項僅作查看。</p>}
      <div className="organic__dimension-grid">
        {DIMENSIONS.map(meta => {
          const enabled = store.rules.filter(r => r.dimension === meta.key && r.ruleStatus === 'enabled')
          // 表盘满分取启用分项的配置满分合计，仅作演示刻度参照，不是正式归一口径。
          const max = enabled.reduce((sum, r) => sum + (r.effectiveMax ?? 0), 0)
          return <div key={meta.key}>
            <DimensionGauge label={meta.label} color={meta.color} score={dimensionScore(meta.key)} max={max} />
            <p className="organic__gauge-note">{enabled.length} 個啟用計分項的得分合計</p>
          </div>
        })}
      </div>
      <div className="organic__total-box"><span>綜合得分＝商業維度＋店鋪維度＋平台維度</span><b>{scoreText(store.totalScore)}</b></div>
    </section>
    <Section title="逐項得分與原因" description={`本品牌適用 ${store.rules.filter(r => r.ruleStatus !== 'inapplicable').length} 項；展開行可查看指標、檔位與來源。`}>
      {/* 只保留三個維度按鈕，無「全部維度」選項，默認商業維度 */}
      <div className="organic__rule-filters"><Segmented value={dimension} onChange={setDimension} options={DIMENSIONS.map(d => ({ value: d.key, label: d.label }))} /></div>
      {DIMENSIONS.filter(meta => meta.key === dimension).map(meta => {
        const list = store.rules.filter(r => r.dimension === meta.key)
        // 维度名称与得分摘要不在分组内重复展示（页签、仪表盘已覆盖）
        return <div className="organic__rule-group" key={meta.key}>
          {renderRuleTable(list)}
        </div>
      })}
    </Section>
    <footer className="organic__footer"><span>資料時間：{snapshot.observedAt}（澳門）</span><span>資料性質：前端演示快照，非真實計分結果</span></footer>
  </div>
}
