/**
 * 用户端 APP · 统一搜索页
 *
 * 5 个入口共用本组件，通过 scope 隔离搜索范围：
 * global（首页全站）/ delivery / groupbuy / market / store（店内）。
 * 结构：激活页（历史 / 热搜 / 猜你想搜）→ 输入联想 → 结果页。
 * 结果页分两种版式：
 * - 全站（global）：瀑布流版式——4 个分类 Tab（全部/外賣/團購/超市百貨，横滑），
 *   默认展示外賣瀑布流；外賣复用首页同款小图门店卡（含超出范围/未入驻样例），
 *   團購复用特惠團購页「優選商家」小图瀑布流（含超出范围/未入驻/开业时间样例），
 *   其余分类提示「還未實現」；关键词过滤后接搜索接口时再补（原型阶段瀑布流为同款 Mock）。
 * - 频道内（delivery/groupbuy）：瀑布流版式，与首页搜索结果页对应瀑布流同款，且不展示分类切换 Tab；
 * - 超市/店内：列表版式（Tab / 排序 / 筛选 / 空态），行为不变。
 *
 * 说明：Mock 数据与检索逻辑在 consumerSearchData.ts；生产接入时替换为后端搜索接口即可，
 * 交互结构与本组件保持不变。搜索历史按作用域存 localStorage，可一键清空。
 * 界面文案走 appConsumer.search 命名空间；商家/商品名与热搜词条仍为占位数据。
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  CHANNEL_LABEL,
  CHANNEL_LABEL_KEY,
  FILTER_LABEL,
  FILTER_LABEL_KEY,
  SCOPE_CONFIG,
  SEARCH_SORT_LABEL_KEY,
  SEARCH_TAB_LABEL_KEY,
  scopeTextKey,
  clearHistory,
  entryMatchesTab,
  formatMoney,
  getMerchant,
  getStoreCategories,
  getStoreName,
  guessWordsFor,
  hotListFor,
  hotWordsFor,
  isOutOfRange,
  loadHistory,
  pushHistory,
  searchCatalog,
  sortEntries,
  suggestFor,
  type ConsumerChannel,
  type SearchEntry,
  type SearchFilter,
  type SearchMerchant,
  type SearchOffer,
  type SearchScope,
  type SearchSort,
  type SearchSuggestion,
  type SearchTab,
} from './consumerSearchData'
import { HOME_DELIVERY_SEARCH_STORES } from './consumerHomeFeed'
import { PREFERRED_SEARCH_MERCHANTS } from './consumerPreferredFeed'
import { MFOOD_SEARCH_STORES, MFOOD_NEAR_SEARCH_STORES } from './consumerMfoodFeed'
import DeliveryStoreCard from './DeliveryStoreCard'
import MfoodDeliveryStoreCard from './MfoodDeliveryStoreCard'
import PreferredMerchantCard from './PreferredMerchantCard'

/** 频道/对象自绘图标（统一描边风格，currentColor 取色）：
 *  外賣=骑手摩托、超市=購物車、團購/套餐=券票、商家=門店、商品=購物袋、綜合=四宫格、搜尋=放大鏡 */
type GlyphKind = 'all' | ConsumerChannel | 'merchant' | 'product' | 'deal' | 'search'

function ChannelGlyph({ kind }: { kind: GlyphKind }) {
  return (
    <svg
      className="apcs-glyph"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {kind === 'delivery' && (
        <>
          <circle cx="6" cy="17" r="2.4" />
          <circle cx="18" cy="17" r="2.4" />
          <path d="M8.4 17h7.2" />
          <path d="M18 14.6V7.5h-3.2" />
          <path d="M6 14.6V9.5a1.8 1.8 0 0 1 1.8-1.8h3.4l2 9.3" />
        </>
      )}
      {kind === 'market' && (
        <>
          <circle cx="9.5" cy="19" r="1.7" />
          <circle cx="17" cy="19" r="1.7" />
          <path d="M3.5 4.5h2.6l2 10.5h9.6l1.8-7.5H7" />
        </>
      )}
      {(kind === 'groupbuy' || kind === 'deal') && (
        <>
          <path d="M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2Z" />
          <path d="M13 5v2" />
          <path d="M13 11v2" />
          <path d="M13 17v2" />
        </>
      )}
      {kind === 'merchant' && (
        <>
          <path d="M4 10v9h16v-9" />
          <path d="M3 9.5 5 4h14l2 5.5" />
          <path d="M9.5 19v-5h5v5" />
        </>
      )}
      {kind === 'product' && (
        <>
          <path d="M6 7.5h12L19.5 20h-15Z" />
          <path d="M9 7.5a3 3 0 0 1 6 0" />
        </>
      )}
      {kind === 'all' && (
        <>
          <rect x="3.5" y="3.5" width="7" height="7" rx="1.5" />
          <rect x="13.5" y="3.5" width="7" height="7" rx="1.5" />
          <rect x="3.5" y="13.5" width="7" height="7" rx="1.5" />
          <rect x="13.5" y="13.5" width="7" height="7" rx="1.5" />
        </>
      )}
      {kind === 'search' && (
        <>
          <circle cx="11" cy="11" r="6" />
          <path d="m20 20-4.8-4.8" />
        </>
      )}
    </svg>
  )
}

interface SearchSession {
  input: string
  query: string
  tab: SearchTab
  sort: SearchSort
  filters: SearchFilter[]
}

/** 全站结果页瀑布流分类的 emoji 角标：四个频道与首页分类切换同款，全部用搜索镜 */
const RESULT_CAT_EMOJI: Partial<Record<SearchTab, string>> = {
  all: '🔍',
  delivery: '🧋',
  groupbuy: '🍲',
  market: '🛒',
}

/** 页面级记忆：搜索 → 店铺 → 返回搜索时恢复关键词与结果（取消搜索时清空）；按品牌隔离（双机各自会话） */
const sessions = new Map<string, SearchSession>()

function sessionKey(scope: SearchScope, merchantId: string | undefined, brand: 'bee' | 'mfood'): string {
  if (scope === 'store') return `${brand}:store:${merchantId ?? ''}`
  return `${brand}:${scope}`
}

export interface ConsumerSearchProps {
  scope: SearchScope
  merchantId?: string
  /** 品牌：bee=閃蜂（默认）/ mfood=MFOOD；决定瀑布流卡片与数据同源口径（双 APP 刻意分叉） */
  brand?: 'bee' | 'mfood'
  /** 从「在全站搜尋」等跨作用域入口带入的关键词，优先于页面级记忆 */
  initialKeyword?: string
  /** 说明面板三级瀑布流切换下发的分类命令（syncSeq 自增时执行）：delivery=外賣 / groupbuy=團購 */
  syncFeed?: 'delivery' | 'groupbuy'
  syncSeq?: number
  onBack: () => void
  onOpenStore?: (merchantId: string) => void
  onSearchGlobal?: (keyword: string) => void
  onAddToCart?: (offer: SearchOffer) => void
}

function Highlight({ text, keyword }: { text: string; keyword: string }) {
  const query = keyword.trim()
  const index = query ? text.toLowerCase().indexOf(query.toLowerCase()) : -1
  if (!query || index < 0) return <>{text}</>
  return (
    <>
      {text.slice(0, index)}
      <mark className="apcs-mark">{text.slice(index, index + query.length)}</mark>
      {text.slice(index + query.length)}
    </>
  )
}

function discountLabel(price: number, origin?: number): string | null {
  if (!origin || origin <= price) return null
  return `${(price / origin * 10).toFixed(1)}折`
}

function Thumb({ entry }: { entry: SearchEntry }) {
  return (
    <span className="apcs-thumb" aria-hidden="true">
      {entry.image ? <img src={entry.image} alt="" /> : <span>{entry.emoji}</span>}
    </span>
  )
}

function MerchantCard({
  entry,
  query,
  showChannel,
  far,
  onOpen,
}: {
  entry: SearchMerchant
  query: string
  showChannel: boolean
  far?: boolean
  onOpen?: () => void
}) {
  const { t } = useTranslation()
  const cols = entry.channel === 'groupbuy'
    ? [
        { label: t('appConsumer.search.colDistance', { defaultValue: '距離' }), value: t('appConsumer.common.kilometers', { value: entry.distanceKm, defaultValue: '{{value}}km' }) },
        { label: t('appConsumer.search.colGroupbuy', { defaultValue: '團購' }), value: t('appConsumer.search.unitGroupbuy', { count: entry.groupbuyCount ?? 0, defaultValue: '{{count}} 個' }) },
        { label: t('appConsumer.search.colAvg', { defaultValue: '人均' }), value: `$${formatMoney(entry.avgPrice ?? 0)}` },
      ]
    : [
        { label: t('appConsumer.search.colMinOrder', { defaultValue: '起送' }), value: `$${formatMoney(entry.minOrder ?? 0)}` },
        { label: t('appConsumer.search.colDelivery', { defaultValue: '配送' }), value: entry.deliveryFee === 0 ? t('appConsumer.delivery.freeDelivery', { defaultValue: '免配送費' }) : t('appConsumer.search.fromPrice', { price: formatMoney(entry.deliveryFee ?? 0), defaultValue: '${{price}}起' }) },
        { label: t('appConsumer.search.colDistance', { defaultValue: '距離' }), value: t('appConsumer.common.kilometers', { value: entry.distanceKm, defaultValue: '{{value}}km' }) },
      ]

  return (
    <button
      type="button"
      className={`apcs-card apcs-merchant${entry.status === 'rest' ? ' is-rest' : ''}${far ? ' is-far' : ''}`}
      onClick={onOpen}
    >
      <span className="apcs-thumb">
        {entry.image ? <img src={entry.image} alt="" /> : <span>{entry.emoji}</span>}
        {entry.monthlySales >= 1500 && <em className="apcs-thumb-badge">{t('appConsumer.search.badgePopular', { defaultValue: '人氣' })}</em>}
      </span>
      <span className="apcs-card-main">
        <span className="apcs-card-head">
          <span className="apcs-card-name"><Highlight text={entry.name} keyword={query} /></span>
          {showChannel && (
            <em className={`apcs-channel apcs-channel--${entry.channel}`}>{t(CHANNEL_LABEL_KEY[entry.channel], { defaultValue: CHANNEL_LABEL[entry.channel] })}</em>
          )}
          {entry.status === 'rest' && <em className="apcs-status apcs-status--rest">{t('appConsumer.search.statusRest', { defaultValue: '休息中' })}</em>}
          {entry.status === 'new' && <em className="apcs-status apcs-status--new">{t('appConsumer.common.newStoreTag', { defaultValue: '新店' })}</em>}
          {far && <em className="apcs-status apcs-status--far">{t('appConsumer.search.statusFar', { defaultValue: '超出範圍' })}</em>}
        </span>
        <span className="apcs-card-rate">
          <b>★ {entry.rating}</b>
          <i className="apcs-card-sales">{t('appConsumer.common.monthlySales', { value: entry.monthlySales, defaultValue: '月售 {{value}}' })}</i>
        </span>
        <span className="apcs-card-cols">
          {cols.map((col) => (
            <span key={col.label}>
              <em>{col.label}</em>
              <b>{col.value}</b>
            </span>
          ))}
        </span>
        {entry.coupons.length > 0 && (
          <span className="apcs-card-coupons">
            {entry.coupons.slice(0, 3).map((coupon) => (
              <em key={coupon} className="apcs-coupon">{coupon}</em>
            ))}
          </span>
        )}
        {entry.tags.length > 0 && (
          <span className="apcs-card-tags">
            {entry.tags.slice(0, 3).map((tag) => (
              <em key={tag} className="apcs-tag">{tag}</em>
            ))}
          </span>
        )}
      </span>
    </button>
  )
}

function OfferCard({
  entry,
  query,
  showChannel,
  far,
  onOpen,
  onAdd,
}: {
  entry: SearchOffer
  query: string
  showChannel: boolean
  far?: boolean
  onOpen?: () => void
  onAdd?: () => void
}) {
  const { t } = useTranslation()
  const isProduct = entry.kind === 'product'
  const name = isProduct ? entry.name : entry.title
  const sold = isProduct
    ? t('appConsumer.common.monthlySales', { value: entry.monthlySales, defaultValue: '月售 {{value}}' })
    : t('appConsumer.common.halfYearSales', { value: entry.sold, defaultValue: '半年售 {{value}}' })
  const meta = isProduct
    ? `${entry.merchantName} · ${entry.spec}`
    : `${entry.merchantName} · ${t('appConsumer.common.kilometers', { value: entry.distanceKm, defaultValue: '{{value}}km' })} · ${entry.rating}${t('appConsumer.common.ratingSuffix', { defaultValue: '分' })}`
  const off = discountLabel(entry.price, entry.originPrice)

  return (
    <div className={`apcs-card apcs-offer${far ? ' is-far' : ''}`}>
      <button type="button" className="apcs-offer-hit" onClick={onOpen}>
        <Thumb entry={entry} />
        <span className="apcs-card-main">
          <span className="apcs-card-name apcs-card-name--offer"><Highlight text={name} keyword={query} /></span>
          <span className="apcs-card-meta">{meta}</span>
          <span className="apcs-card-rate"><i>{sold}</i>{!isProduct && <i>{entry.rating}{t('appConsumer.common.ratingSuffix', { defaultValue: '分' })}</i>}</span>
          <span className="apcs-price-row">
            <span className="apcs-price"><i>$</i>{formatMoney(entry.price)}</span>
            {entry.originPrice !== undefined && entry.originPrice > entry.price && (
              <span className="apcs-strike">${formatMoney(entry.originPrice)}</span>
            )}
            {off && <span className="apcs-off">{off}</span>}
          </span>
          {(showChannel || entry.tags.length > 0) && (
            <span className="apcs-card-tags">
              {showChannel && (
                <em className={`apcs-channel apcs-channel--${entry.channel}`}>{t(CHANNEL_LABEL_KEY[entry.channel], { defaultValue: CHANNEL_LABEL[entry.channel] })}</em>
              )}
              {entry.tags.slice(0, 3).map((tag) => (
                <em key={tag} className="apcs-tag">{tag}</em>
              ))}
            </span>
          )}
        </span>
      </button>
      {isProduct && onAdd && (
        <button
          type="button"
          className="apcs-add"
          aria-label={t('appConsumer.search.addToCart', { name, defaultValue: '加入購物車：{{name}}' })}
          onClick={onAdd}
        >
          +
        </button>
      )}
    </div>
  )
}

export default function ConsumerSearch({
  scope,
  merchantId,
  brand = 'bee',
  initialKeyword,
  syncFeed,
  syncSeq,
  onBack,
  onOpenStore,
  onSearchGlobal,
  onAddToCart,
}: ConsumerSearchProps) {
  const { t } = useTranslation()
  const key = sessionKey(scope, merchantId, brand)
  const memory = sessions.get(key)
  const config = SCOPE_CONFIG[scope]
  const storeName = getStoreName(merchantId)
  const seed: SearchSession | undefined = initialKeyword
    ? {
        input: initialKeyword,
        query: initialKeyword,
        // 全站结果页默认展示外賣瀑布流（跨作用域入口带入关键词同样落外賣 Tab）
        tab: (scope === 'global' ? 'delivery' : 'all') as SearchTab,
        sort: 'default' as SearchSort,
        filters: [] as SearchFilter[],
      }
    : memory

  const [input, setInput] = useState(seed?.input ?? '')
  const [query, setQuery] = useState(seed?.query ?? '')
  const [tab, setTab] = useState<SearchTab>(seed?.tab ?? 'all')
  const [sort, setSort] = useState<SearchSort>(seed?.sort ?? 'default')
  const [filters, setFilters] = useState<SearchFilter[]>(seed?.filters ?? [])
  const [category, setCategory] = useState('all')
  const [history, setHistory] = useState<string[]>(() => loadHistory(scope, merchantId))

  const inputRef = useRef<HTMLInputElement>(null)
  const bodyRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const timer = window.setTimeout(() => inputRef.current?.focus(), 60)
    return () => window.clearTimeout(timer)
  }, [])

  useEffect(() => {
    const text = initialKeyword?.trim()
    if (text) setHistory(pushHistory(scope, text, merchantId))
  }, [initialKeyword, scope, merchantId])

  useEffect(() => {
    sessions.set(key, { input, query, tab, sort, filters })
  }, [key, input, query, tab, sort, filters])

  /* 壳外说明面板三级瀑布流切换命令：只在 syncSeq 变化时执行，避免壳内自身切 Tab 被面板回流覆盖 */
  const syncSeqRef = useRef(syncSeq ?? 0)
  useEffect(() => {
    if ((syncSeq ?? 0) !== syncSeqRef.current && syncFeed) {
      syncSeqRef.current = syncSeq ?? 0
      setTab(syncFeed)
    }
  }, [syncSeq, syncFeed])

  const baseResults = useMemo(
    () => searchCatalog(scope, query, { merchantId, filters }),
    [scope, query, merchantId, filters],
  )
  const results = useMemo(() => {
    let list = baseResults.filter((entry) => entryMatchesTab(entry, tab))
    if (scope === 'store' && category !== 'all') {
      list = list.filter((entry) => (
        entry.kind === 'merchant' ? entry.categories.includes(category) : entry.category === category
      ))
    }
    return sortEntries(list, sort)
  }, [baseResults, tab, scope, category, sort])

  const suggestions = useMemo(
    () => suggestFor(scope, input, merchantId),
    [scope, input, merchantId],
  )
  const hotWords = useMemo(() => hotWordsFor(scope, merchantId), [scope, merchantId])
  const hotList = useMemo(() => hotListFor(scope, merchantId), [scope, merchantId])
  const guessWords = useMemo(() => guessWordsFor(scope, merchantId), [scope, merchantId])
  const storeCategories = useMemo(
    () => (scope === 'store' && merchantId ? getStoreCategories(merchantId) : []),
    [scope, merchantId],
  )

  const trimmedInput = input.trim()
  const isActivation = trimmedInput === ''
  const showSuggestions = !isActivation && trimmedInput !== query
  const showResults = query !== '' && !showSuggestions

  const runSearch = (keyword: string) => {
    const text = keyword.trim()
    if (!text) {
      setInput('')
      setQuery('')
      inputRef.current?.focus()
      return
    }
    setInput(text)
    setQuery(text)
    // 每次点搜索都回到默认 Tab：全站=外賣瀑布流，其余作用域=综合列表
    setTab(scope === 'global' ? 'delivery' : 'all')
    setCategory('all')
    setHistory(pushHistory(scope, text, merchantId))
    if (bodyRef.current) bodyRef.current.scrollTop = 0
  }

  const handleInputChange = (value: string) => {
    setInput(value)
    if (!value.trim()) setQuery('')
  }

  const handleCancel = () => {
    sessions.delete(key)
    onBack()
  }

  /** 点击联想行：能定位到店铺的直达店铺（需求 1.5），否则退化为按联想词再搜一次 */
  const handleSuggestionPick = (suggestion: SearchSuggestion) => {
    const text = suggestion.text.trim()
    setHistory(pushHistory(scope, text, merchantId))
    if (suggestion.merchantId && onOpenStore) {
      setInput(text)
      setQuery(text)
      onOpenStore(suggestion.merchantId)
      return
    }
    runSearch(text)
  }

  const toggleFilter = (filter: SearchFilter) => {
    setFilters((prev) => (
      prev.includes(filter) ? prev.filter((item) => item !== filter) : [...prev, filter]
    ))
  }

  const handleClearHistory = () => {
    clearHistory(scope, merchantId)
    setHistory([])
  }

  /** 超出配送范围的命中：置灰并归入独立分组（参考美团超范围置灰，不混在可下单列表里） */
  const nearResults = results.filter((entry) => !isOutOfRange(entry))
  const farResults = results.filter(isOutOfRange)
  const nearMerchants = nearResults.filter((entry): entry is SearchMerchant => entry.kind === 'merchant')
  const nearOffers = nearResults.filter((entry): entry is SearchOffer => entry.kind !== 'merchant')
  const offerTitle = scope === 'global'
    ? t('appConsumer.search.offerTitleGlobal', { defaultValue: '商品與團購' })
    : scope === 'groupbuy'
      ? t(SEARCH_TAB_LABEL_KEY.deal, { defaultValue: config.tabs.find((x) => x.key === 'deal')?.label ?? '' })
      : scope === 'store'
        ? ''
        : t(SEARCH_TAB_LABEL_KEY.product, { defaultValue: config.tabs.find((x) => x.key === 'product')?.label ?? '' })

  const renderCards = (list: SearchEntry[], title?: string, far = false) => (
    <section className={`apcs-section${far ? ' apcs-farsec' : ''}`}>
      {title && (
        <header className={far ? 'apcs-far-head' : 'apcs-section-head'}>
          <b>{title}</b>
          {!far && <span>{list.length}</span>}
        </header>
      )}
      <div className="apcs-cards">
        {list.map((entry) => (
          entry.kind === 'merchant' ? (
            <MerchantCard
              key={entry.id}
              entry={entry}
              query={query}
              showChannel={scope === 'global'}
              far={far}
              onOpen={onOpenStore ? () => onOpenStore(entry.id) : undefined}
            />
          ) : (
            <OfferCard
              key={entry.id}
              entry={entry}
              query={query}
              showChannel={scope === 'global'}
              far={far}
              onOpen={onOpenStore ? () => onOpenStore(entry.merchantId) : undefined}
              onAdd={scope === 'store' && onAddToCart ? () => onAddToCart(entry) : undefined}
            />
          )
        ))}
      </div>
    </section>
  )

  const renderEmpty = () => (
    <div className="apcs-empty">
      <span className="apcs-empty-ico" aria-hidden="true">🔍</span>
      <b>{t('appConsumer.search.emptyTitle', { query, defaultValue: '沒有找到與「{{query}}」相關的結果' })}</b>
      <p>{t('appConsumer.search.emptyHint', { defaultValue: '試試更短的關鍵詞，或切換搜尋範圍' })}</p>
      {scope !== 'global' && onSearchGlobal && (
        <button type="button" className="apcs-empty-cta" onClick={() => onSearchGlobal(query)}>
          {t('appConsumer.search.emptySearchGlobal', { query, defaultValue: '在全站搜尋「{{query}}」' })}
        </button>
      )}
      {scope === 'store' && (
        <button type="button" className="apcs-empty-cta apcs-empty-cta--ghost" onClick={onBack}>
          {t('appConsumer.search.emptyViewAll', { defaultValue: '查看全部商品' })}
        </button>
      )}
      <div className="apcs-empty-hot">
        <span>{t('appConsumer.search.emptyHotWords', { defaultValue: '熱門搜尋' })}</span>
        <div>
          {hotWords.slice(0, 4).map((word) => (
            <button key={word} type="button" onClick={() => runSearch(word)}>{word}</button>
          ))}
        </div>
      </div>
    </div>
  )

  /** 瀑布流版式结果页：
   *  withTabs=true（首页全站搜索）：4 分类 Tab（横滑），其余分类提示還未實現；
   *  withTabs=false（频道内搜索：美食外賣/特價團購）：不展示分类切换按钮，直接展示该频道对应瀑布流；
   *  外賣/團購瀑布流与首页搜索结果页完全同款（双 APP 卡片分叉，数据各自同源） */
  const renderWaterfall = (withTabs: boolean) => {
    const feed: SearchTab = withTabs ? tab : scope === 'groupbuy' ? 'groupbuy' : 'delivery'
    return (
      <div className="apcs-results">
        {withTabs && (
          <div className="apcs-pills" role="tablist" aria-label={t('appConsumer.search.tablistLabel', { defaultValue: '結果分類' })}>
            {config.tabs.map((item) => (
              <button
                key={item.key}
                type="button"
                role="tab"
                aria-selected={tab === item.key}
                className={`apcs-pill${tab === item.key ? ' is-on' : ''}`}
                onClick={() => {
                  setTab(item.key)
                  if (bodyRef.current) bodyRef.current.scrollTop = 0
                }}
              >
                {RESULT_CAT_EMOJI[item.key] && <span aria-hidden="true">{RESULT_CAT_EMOJI[item.key]}</span>}
                {/* label 直接取配置真值（全站 Tab 暂未入语言包，第二阶段统一登记 i18n） */}
                {item.label}
              </button>
            ))}
          </div>
        )}

        {feed === 'delivery' && (
          <div className="apf-feed-list">
            {/* 双 APP 瀑布流刻意分叉：閃蜂=DeliveryStoreCard / MFOOD=MfoodDeliveryStoreCard（勁爆券皮），数据各自同源 */}
            {brand === 'mfood'
              ? MFOOD_SEARCH_STORES.map((store) => (
                  <MfoodDeliveryStoreCard key={store.key} store={store} showProducts />
                ))
              : HOME_DELIVERY_SEARCH_STORES.map((store) => (
                  <DeliveryStoreCard key={store.key} store={store} onOpenStore={onOpenStore} showProducts />
                ))}
          </div>
        )}
        {feed === 'groupbuy' && (
          <div className="apq-feed">
            {/* 團購瀑布流=優選商家/附近好店同構卡：閃蜂=優選商家（神會員标）/ MFOOD=附近好店（勐爆券标） */}
            {(brand === 'mfood' ? MFOOD_NEAR_SEARCH_STORES : PREFERRED_SEARCH_MERCHANTS).map((item) => (
              <PreferredMerchantCard key={item.key} item={item} layout="small" brand={brand === 'mfood' ? 'mfood' : 'bee'} showProducts />
            ))}
          </div>
        )}
        {withTabs && feed !== 'delivery' && feed !== 'groupbuy' && (
          <div className="apcs-empty">
            <span className="apcs-empty-ico" aria-hidden="true">🚧</span>
            <b>「{config.tabs.find((item) => item.key === tab)?.label ?? ''}」瀑布流還未實現</b>
            <p>該分類瀑布流規劃中，先切到「外賣」或「團購」看看吧</p>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="apcs" role="dialog" aria-modal="true" aria-label={t('appConsumer.search.dialogLabel', { defaultValue: '搜尋' })}>
      <form
        className="apcs-top"
        onSubmit={(event) => {
          event.preventDefault()
          runSearch(input)
        }}
      >
        <button type="button" className="apcs-back" aria-label={t('appConsumer.common.back', { defaultValue: '返回' })} onClick={handleCancel}>‹</button>
        <div className="apcs-box">
          <span className="apcs-box-ico" aria-hidden="true">🔍</span>
          <input
            ref={inputRef}
            value={input}
            onChange={(event) => handleInputChange(event.target.value)}
            placeholder={t(scopeTextKey(scope, 'placeholder'), { defaultValue: config.placeholder })}
            aria-label={t(scopeTextKey(scope, 'hint'), { defaultValue: config.hint })}
            autoComplete="off"
            enterKeyHint="search"
          />
          {input && (
            <button
              type="button"
              className="apcs-clear"
              aria-label={t('appConsumer.search.clearKeyword', { defaultValue: '清除關鍵詞' })}
              onClick={() => {
                handleInputChange('')
                inputRef.current?.focus()
              }}
            >
              ×
            </button>
          )}
          <button type="submit" className="apcs-submit">{t('appConsumer.common.search', { defaultValue: '搜索' })}</button>
        </div>
      </form>

      <div className="apcs-scope">
        <span className="apcs-scope-tag">{scope === 'store' ? t('appConsumer.search.inStoreScope', { name: storeName, defaultValue: '店內 · {{name}}' }) : t(scopeTextKey(scope, 'label'), { defaultValue: config.label })}</span>
        <span className="apcs-scope-hint">{t(scopeTextKey(scope, 'hint'), { defaultValue: config.hint })}</span>
      </div>

      <div className="apcs-body" ref={bodyRef}>
        {isActivation && (
          <div className="apcs-activation">
            <section className="apcs-section">
              <header className="apcs-section-head"><b>{t('appConsumer.search.sectionGuess', { defaultValue: '熱門搜索' })}</b></header>
              <div className="apcs-chips">
                {guessWords.map((word) => (
                  <button key={word} type="button" className="apcs-chip apcs-chip--guess" onClick={() => runSearch(word)}>
                    {word}
                  </button>
                ))}
              </div>
            </section>

            {scope === 'store' && storeCategories.length > 0 && (
              <section className="apcs-section">
                <header className="apcs-section-head"><b>{t('appConsumer.search.sectionStoreCategories', { defaultValue: '店內分類' })}</b><span>{storeCategories.length}</span></header>
                <div className="apcs-chips">
                  {storeCategories.map((item) => (
                    <button key={item} type="button" className="apcs-chip" onClick={() => runSearch(item)}>
                      {item}
                    </button>
                  ))}
                </div>
              </section>
            )}

            <section className="apcs-section">
              <header className="apcs-section-head">
                <b>{t('appConsumer.search.sectionHistory', { defaultValue: '歷史搜索' })}</b>
                {history.length > 0 && (
                  <button type="button" className="apcs-clear-history" aria-label={t('appConsumer.search.clearHistory', { defaultValue: '清空搜尋歷史' })} onClick={handleClearHistory}>
                    <span aria-hidden="true">🗑</span>
                  </button>
                )}
              </header>
              {history.length > 0 ? (
                <div className="apcs-chips">
                  {history.map((word) => (
                    <button key={word} type="button" className="apcs-chip" onClick={() => runSearch(word)}>
                      {word}
                    </button>
                  ))}
                </div>
              ) : (
                <p className="apcs-muted">{t('appConsumer.search.historyEmpty', { defaultValue: '還沒有搜尋記錄' })}</p>
              )}
            </section>

            <section className="apcs-section">
              <div className="apcs-hotcard">
                <header className="apcs-hotcard-head">
                  <span aria-hidden="true">🔥</span>
                  <b>{t('appConsumer.search.sectionHotRank', { defaultValue: '人氣熱搜' })}</b>
                  <i>{scope === 'store' ? t('appConsumer.search.hotInStore', { defaultValue: '店內熱銷' }) : t('appConsumer.search.hotTodayMacau', { defaultValue: '澳門 · 今日' })}</i>
                </header>
                <div className="apcs-hotlist">
                  {hotList.map((item, index) => (
                    <button key={item.word} type="button" className="apcs-hotrow" onClick={() => runSearch(item.word)}>
                      <em className={`apcs-rank apcs-rank--${index < 3 ? index + 1 : 'n'}`}>{index + 1}</em>
                      <span className="apcs-hot-text">{item.word}</span>
                      {item.hot && <i className="apcs-hot-badge apcs-hot-badge--hot">{t('appConsumer.search.hotBadge', { defaultValue: '熱' })}</i>}
                      <span className={`apcs-heat${item.up ? ' is-up' : ''}`}>
                        {item.up && <b aria-hidden="true">↑</b>}{item.heat}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            </section>
          </div>
        )}

        {showSuggestions && (
          <div className="apcs-sugs">
            {suggestions.map((suggestion) => {
              const merchant = suggestion.merchantId ? getMerchant(suggestion.merchantId) : undefined
              return (
                <button
                  key={suggestion.key}
                  type="button"
                  className="apcs-sug"
                  onClick={() => handleSuggestionPick(suggestion)}
                >
                  <span
                    className={`apcs-sug-ico apcs-sug-ico--${suggestion.channel ?? 'none'}`}
                    aria-label={suggestion.channel ? t(CHANNEL_LABEL_KEY[suggestion.channel], { defaultValue: CHANNEL_LABEL[suggestion.channel] }) : undefined}
                  >
                    <ChannelGlyph kind={suggestion.channel ?? 'search'} />
                  </span>
                  <span className="apcs-sug-main">
                    <span className="apcs-sug-name">
                      <Highlight text={suggestion.text} keyword={trimmedInput} />
                      {suggestion.status === 'rest' && <em className="apcs-status apcs-status--rest">{t('appConsumer.search.statusRest', { defaultValue: '休息中' })}</em>}
                    </span>
                    <span className="apcs-sug-sub">
                      {suggestion.type === 'merchant' && merchant ? (
                        <>
                          <b className="apcs-sug-rate">★ {merchant.rating}</b>
                          <i>{merchant.categories[0]}</i>
                          <em className="apcs-sug-addr">📍 {merchant.address}</em>
                        </>
                      ) : (
                        <>
                          <b className="apcs-sug-rate">${formatMoney(suggestion.price ?? 0)}</b>
                          <em className="apcs-sug-addr">{merchant?.name}</em>
                        </>
                      )}
                    </span>
                  </span>
                  {merchant && <span className="apcs-sug-dist">{t('appConsumer.common.kilometers', { value: merchant.distanceKm, defaultValue: '{{value}}km' })}</span>}
                </button>
              )
            })}
            {suggestions.length === 0 && (
              <button type="button" className="apcs-sug apcs-sug--search" onClick={() => runSearch(input)}>
                <span className="apcs-sug-ico apcs-sug-ico--none" aria-label={t('appConsumer.search.dialogLabel', { defaultValue: '搜尋' })}>
                  <ChannelGlyph kind="search" />
                </span>
                <span className="apcs-sug-main">
                  <span className="apcs-sug-name">{t('appConsumer.search.sugSearch', { keyword: trimmedInput, defaultValue: '搜尋「{{keyword}}」' })}</span>
                  <span className="apcs-sug-sub"><i>{t('appConsumer.search.sugSearchHint', { defaultValue: '沒有匹配的店鋪或商品，點擊直接搜尋' })}</i></span>
                </span>
              </button>
            )}
          </div>
        )}

        {showResults && (scope === 'global' ? renderWaterfall(true) : (scope === 'delivery' || scope === 'groupbuy') ? renderWaterfall(false) : (
          <div className="apcs-results">
            <div className="apcs-summary">
              <span>{t('appConsumer.search.resultSummary', { count: results.length, defaultValue: '為你找到 {{count}} 個結果' })}</span>
              <span className="apcs-summary-kw">「{query}」</span>
            </div>

            {config.tabs.length > 1 && (
              <div className="apcs-pills" role="tablist" aria-label={t('appConsumer.search.tablistLabel', { defaultValue: '結果分類' })}>
                {config.tabs.map((item) => (
                  <button
                    key={item.key}
                    type="button"
                    role="tab"
                    aria-selected={tab === item.key}
                    className={`apcs-pill${tab === item.key ? ' is-on' : ''}`}
                    onClick={() => {
                      setTab(item.key)
                      if (bodyRef.current) bodyRef.current.scrollTop = 0
                    }}
                  >
                    <span aria-hidden="true"><ChannelGlyph kind={(item.key as GlyphKind) ?? 'all'} /></span>
                    {t(SEARCH_TAB_LABEL_KEY[item.key], { defaultValue: item.label })}
                  </button>
                ))}
              </div>
            )}

            <div className="apcs-sortrow">
              {config.sorts.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  className={`apcs-sort${sort === item.key ? ' is-on' : ''}`}
                  onClick={() => setSort(item.key)}
                >
                  {t(SEARCH_SORT_LABEL_KEY[item.key], { defaultValue: item.label })}
                </button>
              ))}
            </div>

            {config.filters.length > 0 && (
              <div className="apcs-filterchips">
                {config.filters.map((filter) => (
                  <button
                    key={filter}
                    type="button"
                    className={`apcs-filterchip${filters.includes(filter) ? ' is-on' : ''}`}
                    aria-pressed={filters.includes(filter)}
                    onClick={() => toggleFilter(filter)}
                  >
                    {t(FILTER_LABEL_KEY[filter], { defaultValue: FILTER_LABEL[filter] })}
                  </button>
                ))}
              </div>
            )}

            {scope === 'store' && storeCategories.length > 0 && (
              <div className="apcs-storecats">
                <button
                  type="button"
                  className={`apcs-filterchip${category === 'all' ? ' is-on' : ''}`}
                  onClick={() => setCategory('all')}
                >
                  {t('appConsumer.store.filterAll', { defaultValue: '全部' })}
                </button>
                {storeCategories.map((item) => (
                  <button
                    key={item}
                    type="button"
                    className={`apcs-filterchip${category === item ? ' is-on' : ''}`}
                    onClick={() => setCategory(item)}
                  >
                    {item}
                  </button>
                ))}
              </div>
            )}

            {results.length === 0 ? renderEmpty() : (
              <>
                {tab === 'all' ? (
                  <>
                    {nearMerchants.length > 0 && renderCards(nearMerchants, t(SEARCH_TAB_LABEL_KEY.merchant, { defaultValue: '商家' }))}
                    {nearOffers.length > 0 && renderCards(nearOffers, offerTitle || undefined)}
                  </>
                ) : renderCards(nearResults)}
                {farResults.length > 0 && renderCards(farResults, t('appConsumer.search.groupFar', { defaultValue: '超出當前配送範圍' }), true)}
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
