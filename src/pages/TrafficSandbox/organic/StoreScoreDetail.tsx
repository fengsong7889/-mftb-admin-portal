/**
 * Copyright (c) 2026 fengsong7889. All Rights Reserved.
 *
 * 本文件为「MFTB 企业一体化管理平台软件」的组成部分。
 * 未经著作权人书面许可，不得使用、复制、修改、再分发或用于任何商业目的。
 * 完整许可条款见仓库根目录 LICENSE 文件。
 */
import { useState, type Key } from 'react'
import { Descriptions, Empty, Segmented, Select, Table, Tag } from 'antd'
import type { TableColumnsType } from 'antd'
import { useTranslation } from 'react-i18next'
import { REGION_LABEL_KEY } from '@mftb/contracts/recommendConstants'
import DetailPageHeader from '@/components/DetailPageHeader'
import { DIMENSIONS, STATUS_META } from './fixtures'
import { ruleStatusLabel } from './evidence'
import { scoreText } from './display'
import { DemoNotice, MatchTag, Section } from './ScoreParts'
import type { RuleResult, ScoreSnapshot, StoreResult } from './types'

/**
 * 單店計分明細。占比（權重）配置已停用，這裡只展示三個維度的原始分合計，
 * 不計算權重、不展示占比與加權貢獻，避免把已下線的配置口徑帶回頁面。
 */
export default function StoreScoreDetail({ store, snapshot, onBack }: {
  store: StoreResult; snapshot: ScoreSnapshot; onBack: () => void
}) {
  const { t } = useTranslation()
  const [dimension, setDimension] = useState('all')
  const [status, setStatus] = useState('all')
  const [expanded, setExpanded] = useState<readonly Key[]>([])
  const rules = store.rules.filter(r => (dimension === 'all' || r.dimension === dimension) && (status === 'all'
    || status === 'pending' && ['missing', 'insufficient', 'stale', 'error'].includes(r.matchStatus)
    || status === 'inactive' && ['disabled', 'inapplicable'].includes(r.matchStatus) || r.matchStatus === status))
  const dimensionScore = (key: string) => store.dimensions.find(d => d.dimension === key)?.rawScore
  const columns: TableColumnsType<RuleResult> = [
    { key: 'name', title: '計分項', width: 190, render: (_, r) => <div><b>{r.name}</b><div className="organic__muted">{r.ruleCode} · {ruleStatusLabel(r.ruleStatus)}</div></div> },
    { key: 'status', title: '匹配狀態', width: 108, render: (_, r) => <MatchTag status={r.matchStatus} /> },
    { key: 'metric', title: '原始指標', width: 280, render: (_, r) => <><span>{r.metric}</span>{r.matchedTier && <div className="organic__muted">命中檔位：{r.matchedTier}</div>}</> },
    { key: 'raw', title: '得分', width: 100, render: (_, r) => <b className={r.rawScore != null && r.rawScore < 0 ? 'organic__negative' : undefined}>{scoreText(r.rawScore)}</b> },
    { key: 'reason', title: '原因', width: 280, render: (_, r) => r.reason },
  ]
  const renderRuleTable = (list: RuleResult[]) => <Table<RuleResult> columns={columns} dataSource={list} rowKey="ruleCode" size="small" pagination={false} scroll={{ x: 960 }} locale={{ emptyText: <Empty description="沒有符合條件的計分項" /> }} expandable={{ expandedRowKeys: expanded, onExpandedRowsChange: setExpanded, expandedRowRender: r => <div className="organic__rule-evidence">
    <Descriptions column={2} size="small"><Descriptions.Item label="原因碼">{r.reasonCode}</Descriptions.Item><Descriptions.Item label="匹配結論">{STATUS_META[r.matchStatus].label}</Descriptions.Item><Descriptions.Item label="原始指標">{r.metricValue == null ? '—' : `${r.metricValue}${r.unit ? ` ${r.unit}` : ''}`}</Descriptions.Item><Descriptions.Item label="統計窗口">{r.windowStart ? `${r.windowStart} → ${r.windowEnd}` : r.window}</Descriptions.Item><Descriptions.Item label="命中檔位" span={2}>{r.matchedTier ?? '未命中任何檔位'}</Descriptions.Item><Descriptions.Item label="資料來源" span={2}>{r.sourceRefs.join('；')}</Descriptions.Item><Descriptions.Item label="計算說明" span={2}>{r.expression}</Descriptions.Item></Descriptions>
    <div className="organic__inputs">{r.inputs.map(i => <div key={i.label}><span>{i.label}</span><b>{i.value == null ? '—' : typeof i.value === 'boolean' ? (i.value ? '是' : '否') : `${i.value}${i.unit ? ` ${i.unit}` : ''}`}</b></div>)}</div>
    {r.parts && <div className="organic__parts">{r.parts.map(p => <div key={p.label}><span>{p.label}</span>{p.status && <Tag>{p.status}</Tag>}<b className={p.score < 0 ? 'organic__negative' : undefined}>{p.score > 0 ? '+' : ''}{scoreText(p.score)}</b>{(p.reference || p.validFrom) && <small>{[p.reference, p.validFrom && `生效 ${p.validFrom} → ${p.validTo ?? '—'}`].filter(Boolean).join(' · ')}</small>}</div>)}<div className="organic__formula">本項合計 {scoreText(r.rawScore)} 分</div></div>}
    <p className="organic__muted">資料性質：演示快照 / {snapshot.configVersion}。真實報名、指標與活動引用待商戶運營系統接入。</p>
    {r.matchStatus !== 'scored' && r.matchStatus !== 'deducted' && <p>處理建議：核對{r.ruleStatus === 'inapplicable' ? '品牌適用範圍，無需補報名' : r.matchStatus === 'insufficient' ? '統計窗口與有效訂單樣本，不用0替代未知取消率' : r.matchStatus === 'stale' ? '指標任務與更新時間' : r.matchStatus === 'error' ? '指標任務執行日誌與重跑結果' : '活動報名、有效期、配置及資料來源'}。本頁不執行業務修改。</p>}
  </div> }} />
  return <div className="content-area organic">
    <DetailPageHeader title="門店計分詳情" meta={`${store.storeId} · ${store.storeName}`} onBack={onBack} />
    <DemoNotice />
    <Section title={store.storeName} description={`${store.category} · ${t(REGION_LABEL_KEY[store.regionId])} · ${store.storeId}`}>
      {store.eligibility !== 'ranked' && <p className="organic__muted">{store.eligibilityReason}；未參與本次排名，已知分項僅作查看。</p>}
      <div className="organic__dimension-grid">
        {DIMENSIONS.map(meta => <div key={meta.key}>
          <h4 style={{ color: meta.color }}>{meta.label}</h4>
          <b>{scoreText(dimensionScore(meta.key))}</b>
          <p>{store.rules.filter(r => r.dimension === meta.key && r.ruleStatus === 'enabled').length} 個啟用計分項的得分合計</p>
        </div>)}
      </div>
      <div className="organic__total-box"><span>綜合得分＝商業維度＋店鋪維度＋平台維度</span><b>{scoreText(store.totalScore)}</b></div>
    </Section>
    <Section title="逐項得分與原因" description={`本品牌適用 ${store.rules.filter(r => r.ruleStatus !== 'inapplicable').length} 項；展開行可查看指標、檔位與來源。`}>
      <div className="organic__rule-filters"><Segmented value={dimension} onChange={setDimension} options={[{ value: 'all', label: '全部維度' }, ...DIMENSIONS.map(d => ({ value: d.key, label: d.label }))]} /><Select aria-label="計分狀態" value={status} onChange={setStatus} options={[{ value: 'all', label: '全部狀態' }, { value: 'scored', label: '已得分' }, { value: 'deducted', label: '已扣分' }, { value: 'missed', label: '未得分' }, { value: 'pending', label: '待資料／樣本不足／異常' }, { value: 'inactive', label: '停用／不適用' }]} /></div>
      {(dimension === 'all' ? DIMENSIONS : DIMENSIONS.filter(d => d.key === dimension)).map(meta => {
        const list = rules.filter(r => r.dimension === meta.key)
        return <div className="organic__rule-group" key={meta.key}>
          <h4 style={{ color: meta.color }}>{meta.label}<span>得分 {scoreText(dimensionScore(meta.key))} · {list.length} 項</span></h4>
          {renderRuleTable(list)}
        </div>
      })}
    </Section>
    <footer className="organic__footer"><span>資料時間：{snapshot.observedAt}（澳門）</span><span>資料性質：前端演示快照，非真實計分結果</span></footer>
  </div>
}
