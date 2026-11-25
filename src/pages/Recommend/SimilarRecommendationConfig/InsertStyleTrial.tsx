/**
 * Copyright (c) 2026 fengsong7889. All Rights Reserved.
 *
 * 本文件为「MFTB 企业一体化管理平台软件」的组成部分。
 * 未经著作权人书面许可，不得使用、复制、修改、再分发或用于任何商业目的。
 * 完整许可条款见仓库根目录 LICENSE 文件。
 */
import { Fragment, useEffect, useId, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Button, ConfigProvider, InputNumber, Modal, Select, Tag } from 'antd'
import { ArrowLeftOutlined, CalculatorOutlined, ReloadOutlined } from '@ant-design/icons'
import { PhoneShell } from '../../waterfallConfig/WaterfallPreview'
import DeliveryStoreCard, { type DeliveryStore } from '../../AppPreview/DeliveryStoreCard'
import { HOME_DELIVERY_STORES, HOME_DELIVERY_AD_STORES } from '../../AppPreview/consumerHomeFeed'
import '../../AppPreview/appPreview.css'
import { INSERT_STYLE_OPTIONS, type InsertStyle, type PrototypeValues } from './prototype'

type Scenario = 'normal' | 'partial' | 'empty'
interface Plan { above: number; below: number }

/** 插入樣式专用试算：只保留动效／时长／匹配情境等呈现层操作，不携带召回/排序/计费内容。
 *  交互复刻真实链路：点击殼內任一商家 → 商家详情 → 返回 → 系统校验该商家在列表中的位置自动落位：
 *  最上（其上无空间）→ 插于其下；最下（其下无空间）→ 插于其上；中间 → 插于其上（2 家则一上一下）。
 *  位置由系统从点击行为推导，不提供人工配置——核心是让用户对「刚插入」有感知；插入数量跟随配置的推薦數量。
 *  手机壳复用瀑布流策略新增界面 PhoneShell（400×760），卡片复用人气商家小图同款 DeliveryStoreCard＋真实门店数据；
 *  优惠券行在本弹层作用域内隐藏以节省空间。弹层内调整仅供预览、不回写表单，持久化走表单「④ 插入樣式」。 */
export default function InsertStyleTrial({ values }: { values: PrototypeValues }) {
  const [open, setOpen] = useState(false)
  const { t } = useTranslation()
  return <>
    <Button type="link" size="small" aria-label={t('recommend.similar.trial.insertAria', { defaultValue: '插入樣式試算' })} icon={<CalculatorOutlined aria-hidden />} onClick={() => setOpen(true)}>{t('recommend.similar.trial.button', { defaultValue: '試算' })}</Button>
    <Modal open={open} title={t('recommend.similar.trial.insertAria', { defaultValue: '插入樣式試算' })} onCancel={() => setOpen(false)} footer={null} width={1000} centered destroyOnClose
      styles={{ body: { maxHeight: 'calc(100vh - 120px)', overflow: 'auto', padding: '20px 28px 24px' } }}>
      <ConfigProvider componentDisabled={false}>
        {open && <TrialSession values={values} />}
      </ConfigProvider>
    </Modal>
  </>
}

const pick = (list: DeliveryStore[], key: string): DeliveryStore => list.find(s => s.key === key) ?? list[0]
/** 真实门店列表（消费端 feed 真源）：任意一家都可被点击作锚点；插入卡取已点亮人氣小圖皮膚的廣告门店。 */
const FEED_KEYS = ['s2', 's3', 's5', 's6', 's7', 's8', 's9', 's10']
const FEED_STORES = FEED_KEYS.map(k => pick(HOME_DELIVERY_STORES, k))
const REC_STORES = [pick(HOME_DELIVERY_AD_STORES, 's11'), pick(HOME_DELIVERY_AD_STORES, 's12')]

/** 可感知空间阈值：插入侧至少保有该数量的卡片作为滚动/视觉余量，用户才可能感知到新增卡；
 *  不足则该侧为「盲区」，禁止向盲区插入。取 2 而非 1：顶部/底部仅剩 1 张余量时
 *  新插卡仍落在视口边缘外（用户实测口径），故 1 张余量仍计为盲区。 */
const PERCEIVABLE_MIN_CARDS = 2

/** 两侧可感知空间判定：锚点下标 → 其上/其下剩余卡数与阈值比对。 */
function perception(index: number, total: number) {
  return { aboveOk: index >= PERCEIVABLE_MIN_CARDS, belowOk: total - 1 - index >= PERCEIVABLE_MIN_CARDS }
}

/** 核心原则：推荐商家必须插入在用户能够感知到的方向。
 *  空间不足阈值的侧为盲区不分配：顶部（上方盲区）→ 无论 1/2 家全插其下；底部（下方盲区）→ 全插其上；
 *  两侧均可感知时：1 家优先上方（更靠近注意力焦点），2 家上下一家对称分布。 */
function allocateInsertion(index: number, total: number, count: number): Plan {
  if (count <= 0) return { above: 0, below: 0 }
  const { aboveOk, belowOk } = perception(index, total)
  if (aboveOk && belowOk) return count === 1 ? { above: 1, below: 0 } : { above: 1, below: count - 1 }
  if (aboveOk) return { above: count, below: 0 }
  if (belowOk) return { above: 0, below: count }
  // 两侧皆盲区（极短列表）：兜底插下方，保证插入动作仍可见。
  return { above: 0, below: count }
}

function TrialSession({ values }: { values: PrototypeValues }) {
  const id = useId()
  const { t } = useTranslation()
  const [style, setStyle] = useState<InsertStyle>(values.insertStyle)
  const [ms, setMs] = useState(values.insertAnimMs)
  const [scenario, setScenario] = useState<Scenario>('normal')
  const [clickedKey, setClickedKey] = useState<string | null>(null)
  const [view, setView] = useState<'feed' | 'detail'>('feed')
  const [plan, setPlan] = useState<Plan | null>(null)
  const [playKey, setPlayKey] = useState(1)
  const count = values.count
  const inserted = scenario === 'empty' ? 0 : scenario === 'partial' ? Math.min(count, 1) : count

  // 切换动效／时长时若已插入，立即重播动画；改情境则回到未触发态（旧计划作废，需重新点击返回）。
  useEffect(() => { if (plan) setPlayKey(k => k + 1) }, [style, ms]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { setPlan(null); setClickedKey(null); setView('feed') }, [scenario, count])

  const clickedIndex = clickedKey === null ? -1 : FEED_KEYS.indexOf(clickedKey)
  const perc = clickedIndex < 0 ? null : perception(clickedIndex, FEED_KEYS.length)
  // 位置/盲区标签与分配算法同源（同一阈值），避免展示与落位口径漂移。
  const positionLabel = !perc ? '' : !perc.aboveOk ? t('recommend.similar.trial.posTop', { defaultValue: '列表頂部' }) : !perc.belowOk ? t('recommend.similar.trial.posBottom', { defaultValue: '列表底部' }) : t('recommend.similar.trial.posMiddle', { defaultValue: '列表中間' })
  const blindLabel = !perc ? '' : !perc.aboveOk && !perc.belowOk ? t('recommend.similar.trial.blindBoth', { defaultValue: '雙側盲區' }) : !perc.aboveOk ? t('recommend.similar.trial.blindAbove', { defaultValue: '上方盲區' }) : !perc.belowOk ? t('recommend.similar.trial.blindBelow', { defaultValue: '下方盲區' }) : t('recommend.similar.trial.blindNone', { defaultValue: '雙側可感知' })

  /** 返回事件：系统校验被点商家上下两侧的可感知空间后分配插入位置（盲区不插入）。 */
  const handleReturn = () => {
    if (clickedIndex < 0) { setView('feed'); return }
    setPlan(allocateInsertion(clickedIndex, FEED_KEYS.length, inserted))
    setPlayKey(k => k + 1)
    setView('feed')
  }

  const card = (store: DeliveryStore, flag?: { text: string; color: string }) => (
    <div className="insert-trial-card-wrap insert-trial-anchor">
      {flag && <Tag className="insert-trial-card-flag" color={flag.color}>{flag.text}</Tag>}
      <DeliveryStoreCard store={store} onOpenStore={() => { setClickedKey(store.key); setPlan(null); setView('detail') }} />
    </div>
  )
  const recCard = (store: DeliveryStore, i: number) => (
    <div key={`${playKey}-${store.key}`} className={`insert-trial__rec-wrap similar-insert--${style}`}
      style={{ animationDuration: `${ms}ms`, animationDelay: `${i * 90}ms` }}>
      <div className="insert-trial-card-wrap">
        <Tag className="insert-trial-card-flag" color="blue">{t('recommend.similar.trial.flagRecommended', { defaultValue: '推薦商家' })}</Tag>
        <DeliveryStoreCard store={store} />
      </div>
    </div>
  )

  const scenarioHint = scenario === 'empty'
    ? t('recommend.similar.trial.noteEmpty', { defaultValue: '本輪沒有匹配到相似商家：返回後保留原列表，不產生插入動畫，也不放寬門檻湊數。' })
    : scenario === 'partial'
      ? (count === 2 ? t('recommend.similar.trial.notePartial2', { defaultValue: '配置 2 家但只有 1 家合格：返回後插入 1 家，剩餘名額交回原瀑布流，不湊數。' }) : t('recommend.similar.trial.notePartial1', { defaultValue: '推薦數量為 1 時，「只有一家合格」與正常匹配等價（插 1 家）。' }))
      : t('recommend.similar.trial.noteNormal', { defaultValue: `返回後按配置推薦數量插入 ${count} 家相似商家。` })

  const detail = FEED_STORES.find(s => s.key === clickedKey) ?? FEED_STORES[0]
  const statusText = plan
    ? t('recommend.similar.trial.statusPlan', { defaultValue: `本次插入 ${inserted} 家 · ${positionLabel} · 上 ${plan.above} · 下 ${plan.below} · ${blindLabel}` })
    : clickedKey ? t('recommend.similar.trial.anchorWaiting', { defaultValue: '已選「{{name}}」· 待返回觸發', name: detail.name }) : t('recommend.similar.trial.anchNotClicked', { defaultValue: '尚未觸發' })

  const feed: ReactNode[] = FEED_STORES.map(store => {
    const isClicked = store.key === clickedKey
    return <Fragment key={store.key}>
      {isClicked && plan && REC_STORES.slice(0, plan.above).map((r, j) => recCard(r, j))}
      {card(store, isClicked ? { text: t('recommend.similar.trial.flagClicked', { defaultValue: '被點擊商家' }), color: 'orange' } : undefined)}
      {isClicked && plan && REC_STORES.slice(plan.above, inserted).map((r, j) => recCard(r, j))}
      {isClicked && plan && inserted === 0 && <div className="insert-trial-empty-flag">{t('recommend.similar.trial.emptyFlag', { defaultValue: '沒有匹配到相似商家 · 保留原列表' })}</div>}
      {isClicked && plan && inserted < count && <div className="insert-trial-empty-flag">{t('recommend.similar.trial.partialFlag', { defaultValue: '只有 {{n}} 家合格 · 剩餘名額交回原瀑布流', n: inserted })}</div>}
    </Fragment>
  })

  return <div className="insert-trial">
    <div className="insert-trial__controls">
      <div className="insert-trial__grid">
        <div className="insert-trial__field">
          <label htmlFor={`${id}-style`}>{t('recommend.similar.trial.labelStyle', { defaultValue: '插入效果' })}</label>
          <Select<InsertStyle> id={`${id}-style`} value={style} onChange={setStyle} options={INSERT_STYLE_OPTIONS.map(option => ({ ...option, label: t(`recommend.similar.form.insertStyle.${option.value}`, { defaultValue: option.label }) }))} />
        </div>
        <div className="insert-trial__field">
          <label htmlFor={`${id}-ms`}>{t('recommend.similar.trial.labelMs', { defaultValue: '動效時長' })}</label>
          <InputNumber id={`${id}-ms`} min={120} max={1200} step={60} precision={0} value={ms}
            onChange={v => { if (v != null) setMs(v) }} suffix={<span className="traffic-config__unit">ms</span>} />
        </div>
        <div className="insert-trial__field insert-trial__field--wide">
          <label htmlFor={`${id}-scenario`}>{t('recommend.similar.trial.labelScenario', { defaultValue: '匹配情境' })}</label>
          <Select<Scenario> id={`${id}-scenario`} value={scenario} onChange={setScenario} options={[
            { value: 'normal', label: t('recommend.similar.trial.scenarioNormal', { defaultValue: '正常匹配' }) }, { value: 'partial', label: t('recommend.similar.trial.scenarioPartial', { defaultValue: '只有一家合格' }) }, { value: 'empty', label: t('recommend.similar.trial.scenarioEmpty', { defaultValue: '沒有匹配商家' }) },
          ]} />
        </div>
      </div>
      <div className="insert-trial__status" role="status">
        <Tag color={plan ? 'blue' : 'default'}>{statusText}</Tag>
        <span>{t('recommend.similar.trial.configCountNote', { defaultValue: '配置推薦數量 {{count}} · 匿名示例，不產生真實曝光或扣量', count })}</span>
      </div>
      <p className="insert-trial__hint">{t('recommend.similar.trial.flowHint', { defaultValue: '操作流程：點擊殼內任一商家 → 進入商家詳情 → 點「返回瀑布流」→ 系統校驗該商家上下兩側的可感知空間（≥2 張餘量）後落位：頂部（上方盲區）→ 無論 1/2 家全插其下；底部（下方盲區）→ 全插其上；中間（雙側可感知）→ 1 家插其上、2 家上下一家對稱。核心原則：推薦商家只插入用戶能感知到的方向，盲區不插入。' })}</p>
      <p className="insert-trial__hint">{scenarioHint}</p>
      <div className="insert-trial__actions">
        {plan && <Button icon={<ReloadOutlined />} onClick={() => setPlayKey(k => k + 1)}>{t('recommend.similar.trial.replay', { defaultValue: '重播插入動畫' })}</Button>}
        {plan && <Button onClick={() => { setPlan(null); setPlayKey(k => k + 1) }}>{t('recommend.similar.trial.reset', { defaultValue: '重置演示' })}</Button>}
      </div>
      <p className="insert-trial__hint">{t('recommend.similar.trial.persistHint', { defaultValue: '此處調整僅影響預覽、不回寫表單；如需持久化請使用表單「④ 插入樣式」配置項。動效不改變召回、準入、排序、頻控與計費。' })}</p>
    </div>
    <PhoneShell title={view === 'detail' ? t('recommend.similar.trial.phoneDetail', { defaultValue: '商家詳情' }) : t('recommend.similar.trial.phoneFeed', { defaultValue: '商家瀑布流' })} hint={t('recommend.similar.trial.phoneHint', { defaultValue: '匿名示例 · 僅預覽插入動效，不產生真實曝光' })} width={400} height={760} contentClassName="insert-trial-feed">
      {view === 'detail' ? <div className="insert-trial-detail">
        <img className="insert-trial-detail__cover" src={detail.image} alt={detail.name} />
        <strong>{detail.name}</strong>
        <span>{t('recommend.similar.trial.detailMeta', { defaultValue: '★ {{rating}} · 月售 {{sales}} · {{time}} · {{distance}}', rating: detail.rating, sales: detail.monthlySales, time: detail.deliveryTime, distance: detail.distance ?? '—' })}</span>
        <div className="insert-trial-detail__tags">{detail.tags.map(tag => <span key={tag}>{tag}</span>)}</div>
        <p>{t('recommend.similar.trial.detailNote', { defaultValue: '進店只選定本次推薦錨點，不給商家或用戶標籤加分；返回後系統按該商家在列表中的位置插入相似商家。' })}</p>
        <Button type="primary" block icon={<ArrowLeftOutlined />} onClick={handleReturn}>{t('recommend.similar.trial.backToFeed', { defaultValue: '返回瀑布流' })}</Button>
      </div> : feed}
    </PhoneShell>
  </div>
}
