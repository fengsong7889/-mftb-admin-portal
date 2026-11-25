/**
 * Copyright (c) 2026 fengsong7889. All Rights Reserved.
 *
 * 本文件为「MFTB 企业一体化管理平台软件」的组成部分。
 * 未经著作权人书面许可，不得使用、复制、修改、再分发或用于任何商业目的。
 * 完整许可条款见仓库根目录 LICENSE 文件。
 */
import { Fragment, useId, useLayoutEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Alert, Button, InputNumber, Radio, Select, Space, Tag } from 'antd'
import { ArrowLeftOutlined, ReloadOutlined, ShopOutlined } from '@ant-design/icons'
import { simulatePreview, sourceLabel, type PreviewBinding, type PreviewResult, type PreviewScenario, type PrototypeValues } from './prototype'

interface Props { values: PrototypeValues; binding: PreviewBinding; columns?: 1 | 2 }
/** 参数变更作废旧演示结果，不展示上一套规则的候选或计费标记。 */
export default function ReturnPreview(props: Props) {
  return <PreviewSession key={JSON.stringify(props)} {...props} />
}
function PreviewSession({ values, binding, columns = 1 }: Props) {
  const id = useId()
  const { t } = useTranslation()
  const [position, setPosition] = useState(50)
  const [source, setSource] = useState('自然商家')
  const [layout, setLayout] = useState<1 | 2>(columns)
  const [scenario, setScenario] = useState<PreviewScenario>('normal')
  const [generation, setGeneration] = useState(1)
  const [visitGeneration, setVisitGeneration] = useState<number | null>(null)
  const [inDetail, setInDetail] = useState(false)
  const [dwell, setDwell] = useState<number | null>(values.dwellSeconds)
  const [result, setResult] = useState<PreviewResult | null>(null)
  const feedRef = useRef<HTMLDivElement>(null)
  const scrollOffset = useRef(0)
  useLayoutEffect(() => {
    if (!inDetail && feedRef.current) feedRef.current.scrollTop = scrollOffset.current
  }, [inDetail, result])
  const handleEnter = () => {
    scrollOffset.current = feedRef.current?.scrollTop ?? 0
    setVisitGeneration(generation)
    setResult(null)
    setInDetail(true)
  }
  const handleReturn = () => {
    if (result) return // 同一次返回事件只消费一次；重播不追加卡片。
    let next: PreviewResult
    if (visitGeneration !== generation) next = { items: [], reasons: [t('recommend.similar.trial.prev.staleGen', { defaultValue: 'Feed 已刷新，舊代次結果已丟棄，不插入也不扣量' })] }
    else if (values.triggerMode === 'dwell' && (dwell === null || !Number.isFinite(dwell) || dwell < values.dwellSeconds)) next = { items: [], reasons: [t('recommend.similar.trial.prev.dwellNotMet', { defaultValue: '示例停留未達門檻，保留原列表' })] }
    else next = simulatePreview(values, binding, scenario)
    setResult(next)
    setInDetail(false)
  }
  const handleReset = () => {
    setGeneration(g => g + 1)
    setResult(null)
    if (!inDetail) setVisitGeneration(null)
  }
  // 基础行先定，再把推荐行附在锚点行之后；不会重排、裁切或改写基础编号。
  const anchorRowStart = layout === 2 ? position - (position - 1) % 2 : position
  const start = Math.max(1, anchorRowStart - layout)
  const base = Array.from({ length: layout * 3 }, (_, i) => start + i)
  const rows = Array.from({ length: 3 }, (_, i) => base.slice(i * layout, (i + 1) * layout))
  const resetContext = () => { setResult(null); setVisitGeneration(null) }

  return <section className="similar-prototype__preview" aria-label={t('recommend.similar.trial.prev.aria', { defaultValue: '匿名返回插卡預覽' })}>
    <div className="similar-prototype__status"><Tag color="blue">{t('recommend.similar.trial.prev.statusTag', { defaultValue: '匿名交互預覽' })}</Tag><span>{t('recommend.similar.trial.prev.statusNote', { defaultValue: '真實扣量：0 · 標籤增量：0' })}</span></div>
    <div className="similar-prototype__preview-layout">
      <div className="similar-prototype__controls">
        <div className="similar-prototype__control"><label htmlFor={`${id}-position`}>{t('recommend.similar.trial.prev.labelPosition', { defaultValue: '被點擊商家位置（示例）' })}</label>
          <Select id={`${id}-position`} value={position} disabled={inDetail} onChange={v => { setPosition(v); resetContext() }}
            options={[1, 20, 50, 500, 1000].map(value => ({ value, label: t('recommend.similar.trial.prev.positionAt', { defaultValue: '第 {{pos}} 位', pos: value }) }))} /></div>
        <div className="similar-prototype__control"><label htmlFor={`${id}-source`}>{t('recommend.similar.trial.prev.labelSource', { defaultValue: '被點擊卡片類型' })}</label>
          <Select id={`${id}-source`} value={source} disabled={inDetail} onChange={v => { setSource(v); resetContext() }}
            options={['自然商家', '投流廣告', '無敵星星', '新店廣告', '已插入的相似商家'].map(value => ({ value, label: t(`recommend.similar.trial.prev.sourceValue.${value}`, { defaultValue: value }) }))} /></div>
        <div className="similar-prototype__control"><label>{t('recommend.similar.trial.prev.labelLayout', { defaultValue: '預覽排版' })}</label>
          <Radio.Group aria-label={t('recommend.similar.trial.prev.labelLayout', { defaultValue: '預覽排版' })} value={layout} disabled={inDetail} onChange={e => { setLayout(e.target.value); resetContext() }}>
            <Radio.Button value={1}>{t('recommend.similar.trial.prev.layoutSingle', { defaultValue: '單列' })}</Radio.Button><Radio.Button value={2}>{t('recommend.similar.trial.prev.layoutDouble', { defaultValue: '雙列' })}</Radio.Button>
          </Radio.Group></div>
        <div className="similar-prototype__control"><label htmlFor={`${id}-scenario`}>{t('recommend.similar.trial.prev.labelScenario', { defaultValue: '候選情境' })}</label>
          <Select<PreviewScenario> id={`${id}-scenario`} value={scenario} disabled={inDetail} onChange={v => { setScenario(v); resetContext() }} options={[
            { value: 'normal', label: t('recommend.similar.trial.prev.scenarioNormal', { defaultValue: '正常標籤匹配' }) }, { value: 'one', label: t('recommend.similar.trial.prev.scenarioOne', { defaultValue: '只有一家合格' }) },
            { value: 'empty', label: t('recommend.similar.trial.prev.scenarioEmpty', { defaultValue: '沒有合格候選' }) }, { value: 'frequency', label: t('recommend.similar.trial.prev.scenarioFrequency', { defaultValue: '同商家頻控已滿' }) },
          ]} /></div>
        <p className="similar-prototype__hint">{t('recommend.similar.trial.prev.slotHint', { defaultValue: '投流坑位數：0（示例）。入口與候選來源分開；更換卡片類型或位置不改變標籤相似度。所有基礎卡片編號和順序保留。' })}</p>
        <Space wrap>
          <Button icon={<ReloadOutlined />} onClick={handleReset}>{inDetail ? t('recommend.similar.trial.prev.simulateRefresh', { defaultValue: '模擬 Feed 已刷新' }) : t('recommend.similar.trial.prev.reset', { defaultValue: '重置演示' })}</Button>
          {result && <Button onClick={handleReturn}>{t('recommend.similar.trial.prev.replay', { defaultValue: '重播同一次返回' })}</Button>}
        </Space>
        <p className="similar-prototype__hint">{t('recommend.similar.trial.prev.calcHint', { defaultValue: '相似度使用示例有效標籤：商家「漢堡 100、炸雞 50」；用戶「漢堡 20、炸雞 10」。衰減參數只展示配置，不對已生效分重複衰減。營業、配送及曝光計數尚未接入。' })}</p>
        {result && <div role="status"><Alert showIcon type={result.items.length ? 'success' : 'info'}
          message={t('recommend.similar.trial.prev.insertedCount', { defaultValue: `本次插入 ${result.items.length} 家 · 未產生真實曝光消耗` })} />
          <ul className="similar-prototype__reasons">{result.reasons.map(reason => <li key={reason}>{reason}</li>)}</ul></div>}
      </div>
      <div className="similar-prototype__phone">
        <div className="similar-prototype__phone-top"><strong>{inDetail ? t('recommend.similar.trial.prev.phoneDetail', { defaultValue: '商家詳情' }) : t('recommend.similar.trial.prev.phoneFeed', { defaultValue: '商家瀑布流' })}</strong><Tag>{t('recommend.similar.trial.prev.generationTag', { defaultValue: '示例 G{{gen}}', gen: generation })}</Tag></div>
        {inDetail ? <div className="similar-prototype__detail">
          <ShopOutlined /><h4>{t('recommend.similar.trial.prev.clickedShop', { defaultValue: '被點擊的漢堡店' })}</h4><Tag color="orange">{t(`recommend.similar.trial.prev.sourceValue.${source}`, { defaultValue: source })} · {t('recommend.similar.trial.prev.positionAt', { defaultValue: '第 {{pos}} 位', pos: position })}</Tag>
          <p>{t('recommend.similar.trial.prev.detailNote', { defaultValue: '進店只選定本次推薦錨點，不給商家或用戶標籤加分。' })}</p>
          {values.triggerMode === 'dwell' && <div className="similar-prototype__control"><label htmlFor={`${id}-dwell`}>{t('recommend.similar.trial.prev.labelDwell', { defaultValue: '模擬停留秒數' })}</label>
            <InputNumber id={`${id}-dwell`} min={0} max={3600} value={dwell} onChange={setDwell} /></div>}
          <p>{t('recommend.similar.trial.prev.returnNote', { defaultValue: '按返回後，使用當前規則插入 0–{{count}} 家。此處不建立真實預占或計量記錄。', count: values.count })}</p>
          <Button type="primary" icon={<ArrowLeftOutlined />} onClick={handleReturn}>{t('recommend.similar.trial.prev.backToFeed', { defaultValue: '返回瀑布流' })}</Button>
        </div> : <div className="similar-prototype__feed" ref={feedRef} data-testid="similar-preview-feed">
          {rows.map(row => <Fragment key={row[0]}>
            <div className={`similar-prototype__feed-row${layout === 2 ? ' similar-prototype__feed-row--double' : ''}`} data-testid="base-row">
              {row.map(pos => <article key={pos} data-base-position={pos} className={`similar-prototype__feed-card${pos === position ? ' similar-prototype__feed-card--anchor' : ''}`}>
                <p>{t('recommend.similar.trial.prev.baseRow', { defaultValue: '基礎 #{{pos}}', pos })}</p><strong>{pos === position ? t('recommend.similar.trial.prev.clickedShop', { defaultValue: '被點擊的漢堡店' }) : t('recommend.similar.trial.prev.originalShop', { defaultValue: '原列表商家' })}</strong>
                <p>{pos === position ? t(`recommend.similar.trial.prev.sourceValue.${source}`, { defaultValue: source }) : t('recommend.similar.trial.prev.keptUnchanged', { defaultValue: '原有內容保持不變' })}</p>
                {pos === position && <Button type="link" size="small" onClick={handleEnter}>{t('recommend.similar.trial.prev.enterDetail', { defaultValue: '進入商家詳情' })}</Button>}
              </article>)}
            </div>
            {row.includes(position) && !!result?.items.length && <div className={`similar-prototype__feed-row${layout === 2 ? ' similar-prototype__feed-row--double' : ''}`} data-testid="recommendation-row">
              {result.items.map((item, i) => <article key={item.id} data-testid="similar-preview-item"
                className={`similar-prototype__feed-card similar-prototype__feed-card--rec similar-insert--${values.insertStyle}`}
                style={{ animationDuration: `${values.insertAnimMs}ms`, animationDelay: `${i * 90}ms` }}>
                <Tag color="blue">{t('recommend.similar.trial.flagRecommended', { defaultValue: '推薦商家' })}</Tag><strong>{item.name}</strong><p>{sourceLabel(item.source)}</p>
                <p>{item.similarity === null ? t('recommend.similar.trial.prev.exactCategory', { defaultValue: '同類目精確匹配' }) : `${item.source === 'userSimilar' ? 'CF' : t('recommend.similar.trial.prev.similarityWord', { defaultValue: '相似度' })} ${(item.similarity * 100).toFixed(1)}%`}</p>
                <p>{item.billing === 'paid' ? t('recommend.similar.trial.prev.billingPaid', { defaultValue: '廣告 · 上線後有效曝光扣量' }) : t('recommend.similar.trial.prev.billingNatural', { defaultValue: '自然推薦 · 不扣廣告額度' })}</p>
              </article>)}
            </div>}
          </Fragment>)}
        </div>}
      </div>
    </div>
  </section>
}
