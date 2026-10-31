import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Alert, Button, Empty, Input, Skeleton, Tag } from 'antd'
import { ArrowLeftOutlined, EnvironmentOutlined, GiftOutlined, SearchOutlined, ShopOutlined, ShoppingOutlined, StarFilled } from '@ant-design/icons'
import HelpPopover from '@/components/HelpPopover'
import { SCENE_LABEL_KEY, SCENES } from './prototypeData'
import type { DisplayState, PreviewCard, PreviewContext } from './previewFixtures'

interface Props {
  context: PreviewContext
  cards: PreviewCard[]
  state: DisplayState
  onQuery: (query: string) => void
  onRetry: () => void
  onGlobal: () => void
  readOnly?: boolean
  history: string[]
  onClearHistory: () => void
}
export default function ConsumerPreview({ context, cards, state, onQuery, onRetry, onGlobal, readOnly, history, onClearHistory }: Props) {
  const { t } = useTranslation()
  const [input, setInput] = useState(context.query)
  const [selected, setSelected] = useState<PreviewCard | null>(null)
  const scene = SCENES.find(s => s.value === context.scene)!
  const handleSubmit = () => {
    if (!input.trim() || readOnly) return
    setSelected(null)
    onQuery(input.trim())
  }
  const channelLabel = (channel: PreviewCard['channel']) => t(SCENE_LABEL_KEY(channel))
  const renderCard = (card: PreviewCard) => <article className="sv2-phone__card" key={card.id} data-testid="preview-card" data-ad={Boolean(card.isAd)}>
    <button className={`sv2-phone__art sv2-phone__art--${card.channel}`} aria-label={`${t('searchV2.preview.cardDetailAria')}${card.title}`} onClick={() => setSelected(card)}>
      {card.channel === 'delivery' ? <ShopOutlined /> : card.channel === 'market' ? <ShoppingOutlined /> : <GiftOutlined />}
    </button>
    <div className="sv2-phone__card-body"><button className="sv2-phone__name" onClick={() => setSelected(card)}>{card.title}</button>
      <div className="sv2-phone__rating"><StarFilled /> {card.rating}<span>{t('searchV2.preview.salesPrefix')} {card.sales}</span><span>{card.distance.toFixed(1)} km</span></div>
      <p>{card.detail}</p>{(card.channel !== 'delivery' || context.scene === 'store') && <strong className="sv2-phone__price">MOP {card.price}<small>{t('searchV2.preview.priceFrom')}</small></strong>}
      <div className="sv2-phone__badges">{card.isAd ? <><Tag color="orange">{t('searchV2.preview.adTag')}</Tag><HelpPopover title={t('searchV2.preview.adHelpTitle')} ariaLabel={`${t('searchV2.preview.adHelpAria')}-${card.id}`} content={t('searchV2.preview.adHelpBody')} /></> : <Tag>{t('searchV2.preview.naturalTag')}</Tag>}
        {context.scene === 'home' && <Tag>{channelLabel(card.channel)}</Tag>}</div>
    </div>
  </article>
  const shownState = input.trim() ? state : 'guidance'
  const hasResults = shownState === 'results' || shownState === 'partial'
  const suggesting = !readOnly && input.trim() && input !== context.query
  const suggestions = [scene.query, '星港', ...(context.scene === 'home' ? ['紙巾', '雙人餐'] : [])].filter(word => word.includes(input.trim()))
  return <div className="sv2-phone" aria-label={t('searchV2.preview.phoneAria')}>
    <div className="sv2-phone__status"><b>9:41</b><span>{t('searchV2.preview.statusNote')}</span></div>
    <div className="sv2-phone__location"><EnvironmentOutlined /> {context.region} {t('searchV2.preview.locationSuffix')}</div>
    <div className="sv2-phone__search"><Input disabled={readOnly} aria-label={t('searchV2.preview.searchAria')} prefix={<SearchOutlined />} value={input} onChange={event => setInput(event.target.value)} onPressEnter={handleSubmit} maxLength={60} allowClear />
      <Button type="text" disabled={readOnly} onClick={handleSubmit}>{t('searchV2.preview.btnSearch')}</Button></div>
    <div className="sv2-phone__scope">{t(SCENE_LABEL_KEY(scene.value))}{context.scene === 'store' ? ` ${t('searchV2.preview.storeSuffix')}` : ''}<Tag>{t('searchV2.preview.scopeTag')}</Tag></div>
    <div className="sv2-phone__body">
      {suggesting && <div className="sv2-phone__suggest" aria-label={t('searchV2.preview.suggestAria')}><Button type="text" onClick={handleSubmit}>{t('searchV2.preview.suggestSearch', { query: input })}</Button>
        {suggestions.map(word => <Button type="text" key={word} onClick={() => onQuery(word)}>{word} <Tag>{t('searchV2.preview.suggestWordTag')}</Tag></Button>)}
      </div>}
      {selected ? <div className="sv2-phone__detail"><Button type="link" icon={<ArrowLeftOutlined />} onClick={() => setSelected(null)}>{t('searchV2.preview.backToResults')}</Button>
        <h3>{selected.title}</h3><p>{selected.store}</p><p>{selected.detail}</p><Alert type="info" showIcon message={t('searchV2.preview.detailAlert')} /><Button block disabled>{t('searchV2.preview.btnPurchase')}</Button></div>
        : shownState === 'guidance' ? <div className="sv2-phone__guidance">
          <div className="sv2-phone__section-title"><strong>{t('searchV2.preview.historyTitle')}</strong><Button type="text" size="small" onClick={onClearHistory}>{t('searchV2.preview.btnClear')}</Button></div>
          <div className="sv2-phone__words">{history.length ? history.map(word => <Button key={word} onClick={() => { setInput(word); onQuery(word) }}>{word}</Button>) : <span>{t('searchV2.preview.historyNone')}</span>}</div>
          <div className="sv2-phone__section-title"><strong>{t('searchV2.preview.organicHot')}</strong><Tag>{t('searchV2.preview.demoTag')}</Tag></div>
          <div className="sv2-phone__words">{[scene.query, ...(context.scene === 'home' ? ['紙巾', '雙人餐'] : [])].map((word, i) => <Button key={word} onClick={() => { setInput(word); onQuery(word) }}><b>{i + 1}</b> {word}</Button>)}</div>
          {context.scene !== 'store' && <div className="sv2-phone__promotion"><Tag color="orange">{t('searchV2.preview.adTag')}</Tag><strong>{t('searchV2.preview.promoTitle')}</strong><p>{t('searchV2.preview.promoBody')}</p><Button onClick={() => { setInput(scene.query); onQuery(scene.query) }}>{scene.query} <SearchOutlined /></Button></div>}
        </div> : shownState === 'loading' ? <div aria-label={t('searchV2.preview.loadingAria')}><Skeleton active /><Skeleton active /><p>{t('searchV2.preview.loadingHint')}</p></div>
          : shownState === 'error' ? <><Alert type="error" showIcon message={t('searchV2.preview.errorTitle')} description={t('searchV2.preview.errorDesc')} /><Button block onClick={onRetry}>{t('searchV2.preview.btnRetry')}</Button></>
            : shownState === 'empty' ? <><Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('searchV2.preview.emptyTerm', { query: context.query })} />
              <Button block onClick={context.scene === 'store' ? () => onQuery(scene.query) : onGlobal}>{context.scene === 'store' ? t('searchV2.preview.emptyInstoreBtn') : t('searchV2.preview.emptyGlobalBtn')}</Button></>
              : hasResults && cards.length === 0 ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('searchV2.preview.noSample')} />
                : hasResults && <>
                  {shownState === 'partial' && <Alert type="warning" showIcon message={t('searchV2.preview.partialAlert')} />}
                  <div className="sv2-phone__section-title"><strong>{t('searchV2.preview.resultTitle')}</strong><span>{t('searchV2.preview.resultCount', { total: cards.length })}</span></div>
                  {context.scene === 'home' ? (['delivery', 'market', 'groupbuy'] as const).map(channel => {
                    const group = cards.filter(c => c.channel === channel).slice(0, 4)
                    return group.length > 0 && <section key={channel}><h4>{channelLabel(channel)}</h4>{group.map(renderCard)}</section>
                  }) : cards.map(renderCard)}
                </>}
    </div>
    <div className="sv2-phone__footer">{t('searchV2.preview.footnote')}</div>
  </div>
}
