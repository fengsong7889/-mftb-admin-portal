/**
 * 用户端 APP · 统一搜索页
 *
 * 5 个入口共用本组件，通过 scope 隔离搜索范围：
 * global（首页全站）/ delivery / groupbuy / market / store（店内）。
 * 结构：激活页（历史 / 热搜 / 猜你想搜）→ 输入联想 → 结果页（Tab / 排序 / 筛选 / 空态）。
 *
 * 说明：Mock 数据与检索逻辑在 consumerSearchData.ts；生产接入时替换为后端搜索接口即可，
 * 交互结构与本组件保持不变。搜索历史按作用域存 localStorage，可一键清空。
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import {
  CHANNEL_LABEL,
  FILTER_LABEL,
  SCOPE_CONFIG,
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

/** 页面级记忆：搜索 → 店铺 → 返回搜索时恢复关键词与结果（取消搜索时清空） */
const sessions = new Map<string, SearchSession>()

function sessionKey(scope: SearchScope, merchantId?: string): string {
  return scope === 'store' ? `store:${merchantId ?? ''}` : scope
}

export interface ConsumerSearchProps {
  scope: SearchScope
  merchantId?: string
  /** 从「在全站搜尋」等跨作用域入口带入的关键词，优先于页面级记忆 */
  initialKeyword?: string
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
  const cols = entry.channel === 'groupbuy'
    ? [
        { label: '距離', value: `${entry.distanceKm}km` },
        { label: '團購', value: `${entry.groupbuyCount ?? 0} 個` },
        { label: '人均', value: `$${formatMoney(entry.avgPrice ?? 0)}` },
      ]
    : [
        { label: '起送', value: `$${formatMoney(entry.minOrder ?? 0)}` },
        { label: '配送', value: entry.deliveryFee === 0 ? '免配送費' : `$${formatMoney(entry.deliveryFee ?? 0)}起` },
        { label: '距離', value: `${entry.distanceKm}km` },
      ]

  return (
    <button
      type="button"
      className={`apcs-card apcs-merchant${entry.status === 'rest' ? ' is-rest' : ''}${far ? ' is-far' : ''}`}
      onClick={onOpen}
    >
      <span className="apcs-thumb">
        {entry.image ? <img src={entry.image} alt="" /> : <span>{entry.emoji}</span>}
        {entry.monthlySales >= 1500 && <em className="apcs-thumb-badge">人氣</em>}
      </span>
      <span className="apcs-card-main">
        <span className="apcs-card-head">
          <span className="apcs-card-name"><Highlight text={entry.name} keyword={query} /></span>
          {showChannel && (
            <em className={`apcs-channel apcs-channel--${entry.channel}`}>{CHANNEL_LABEL[entry.channel]}</em>
          )}
          {entry.status === 'rest' && <em className="apcs-status apcs-status--rest">休息中</em>}
          {entry.status === 'new' && <em className="apcs-status apcs-status--new">新店</em>}
          {far && <em className="apcs-status apcs-status--far">超出範圍</em>}
        </span>
        <span className="apcs-card-rate">
          <b>★ {entry.rating}</b>
          <i className="apcs-card-sales">月售 {entry.monthlySales}</i>
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
  const isProduct = entry.kind === 'product'
  const name = isProduct ? entry.name : entry.title
  const sold = isProduct ? `月售 ${entry.monthlySales}` : `半年售 ${entry.sold}`
  const meta = isProduct
    ? `${entry.merchantName} · ${entry.spec}`
    : `${entry.merchantName} · ${entry.distanceKm}km · ${entry.rating}分`
  const off = discountLabel(entry.price, entry.originPrice)

  return (
    <div className={`apcs-card apcs-offer${far ? ' is-far' : ''}`}>
      <button type="button" className="apcs-offer-hit" onClick={onOpen}>
        <Thumb entry={entry} />
        <span className="apcs-card-main">
          <span className="apcs-card-name apcs-card-name--offer"><Highlight text={name} keyword={query} /></span>
          <span className="apcs-card-meta">{meta}</span>
          <span className="apcs-card-rate"><i>{sold}</i>{!isProduct && <i>{entry.rating}分</i>}</span>
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
                <em className={`apcs-channel apcs-channel--${entry.channel}`}>{CHANNEL_LABEL[entry.channel]}</em>
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
          aria-label={`加入購物車：${name}`}
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
  initialKeyword,
  onBack,
  onOpenStore,
  onSearchGlobal,
  onAddToCart,
}: ConsumerSearchProps) {
  const key = sessionKey(scope, merchantId)
  const memory = sessions.get(key)
  const config = SCOPE_CONFIG[scope]
  const storeName = getStoreName(merchantId)
  const seed: SearchSession | undefined = initialKeyword
    ? {
        input: initialKeyword,
        query: initialKeyword,
        tab: 'all' as SearchTab,
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
    setTab('all')
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
    ? '商品與團購'
    : scope === 'groupbuy'
      ? '團購套餐'
      : scope === 'store'
        ? ''
        : '商品'

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
      <b>沒有找到與「{query}」相關的結果</b>
      <p>試試更短的關鍵詞，或切換搜尋範圍</p>
      {scope !== 'global' && onSearchGlobal && (
        <button type="button" className="apcs-empty-cta" onClick={() => onSearchGlobal(query)}>
          在全站搜尋「{query}」
        </button>
      )}
      {scope === 'store' && (
        <button type="button" className="apcs-empty-cta apcs-empty-cta--ghost" onClick={onBack}>
          查看全部商品
        </button>
      )}
      <div className="apcs-empty-hot">
        <span>熱門搜尋</span>
        <div>
          {hotWords.slice(0, 4).map((word) => (
            <button key={word} type="button" onClick={() => runSearch(word)}>{word}</button>
          ))}
        </div>
      </div>
    </div>
  )

  return (
    <div className="apcs" role="dialog" aria-modal="true" aria-label="搜尋">
      <form
        className="apcs-top"
        onSubmit={(event) => {
          event.preventDefault()
          runSearch(input)
        }}
      >
        <button type="button" className="apcs-back" aria-label="返回" onClick={handleCancel}>‹</button>
        <div className="apcs-box">
          <span className="apcs-box-ico" aria-hidden="true">🔍</span>
          <input
            ref={inputRef}
            value={input}
            onChange={(event) => handleInputChange(event.target.value)}
            placeholder={config.placeholder}
            aria-label={config.hint}
            autoComplete="off"
            enterKeyHint="search"
          />
          {input && (
            <button
              type="button"
              className="apcs-clear"
              aria-label="清除關鍵詞"
              onClick={() => {
                handleInputChange('')
                inputRef.current?.focus()
              }}
            >
              ×
            </button>
          )}
          <button type="submit" className="apcs-submit">搜索</button>
        </div>
      </form>

      <div className="apcs-scope">
        <span className="apcs-scope-tag">{scope === 'store' ? `店內 · ${storeName}` : config.label}</span>
        <span className="apcs-scope-hint">{config.hint}</span>
      </div>

      <div className="apcs-body" ref={bodyRef}>
        {isActivation && (
          <div className="apcs-activation">
            <section className="apcs-section">
              <header className="apcs-section-head"><b>熱門搜索</b></header>
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
                <header className="apcs-section-head"><b>店內分類</b><span>{storeCategories.length}</span></header>
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
                <b>歷史搜索</b>
                {history.length > 0 && (
                  <button type="button" className="apcs-clear-history" aria-label="清空搜尋歷史" onClick={handleClearHistory}>
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
                <p className="apcs-muted">還沒有搜尋記錄</p>
              )}
            </section>

            <section className="apcs-section">
              <div className="apcs-hotcard">
                <header className="apcs-hotcard-head">
                  <span aria-hidden="true">🔥</span>
                  <b>人氣熱搜</b>
                  <i>{scope === 'store' ? '店內熱銷' : '澳門 · 今日'}</i>
                </header>
                <div className="apcs-hotlist">
                  {hotList.map((item, index) => (
                    <button key={item.word} type="button" className="apcs-hotrow" onClick={() => runSearch(item.word)}>
                      <em className={`apcs-rank apcs-rank--${index < 3 ? index + 1 : 'n'}`}>{index + 1}</em>
                      <span className="apcs-hot-text">{item.word}</span>
                      {item.hot && <i className="apcs-hot-badge apcs-hot-badge--hot">熱</i>}
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
                    aria-label={suggestion.channel ? CHANNEL_LABEL[suggestion.channel] : undefined}
                  >
                    <ChannelGlyph kind={suggestion.channel ?? 'search'} />
                  </span>
                  <span className="apcs-sug-main">
                    <span className="apcs-sug-name">
                      <Highlight text={suggestion.text} keyword={trimmedInput} />
                      {suggestion.status === 'rest' && <em className="apcs-status apcs-status--rest">休息中</em>}
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
                  {merchant && <span className="apcs-sug-dist">{merchant.distanceKm}km</span>}
                </button>
              )
            })}
            {suggestions.length === 0 && (
              <button type="button" className="apcs-sug apcs-sug--search" onClick={() => runSearch(input)}>
                <span className="apcs-sug-ico apcs-sug-ico--none" aria-label="搜尋">
                  <ChannelGlyph kind="search" />
                </span>
                <span className="apcs-sug-main">
                  <span className="apcs-sug-name">搜尋「{trimmedInput}」</span>
                  <span className="apcs-sug-sub"><i>沒有匹配的店鋪或商品，點擊直接搜尋</i></span>
                </span>
              </button>
            )}
          </div>
        )}

        {showResults && (
          <div className="apcs-results">
            <div className="apcs-summary">
              <span>為你找到 <b>{results.length}</b> 個結果</span>
              <span className="apcs-summary-kw">「{query}」</span>
            </div>

            {config.tabs.length > 1 && (
              <div className="apcs-pills" role="tablist" aria-label="結果分類">
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
                    {item.label}
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
                  {item.label}
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
                    {FILTER_LABEL[filter]}
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
                  全部
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
                    {nearMerchants.length > 0 && renderCards(nearMerchants, scope === 'global' ? '店鋪' : '商家')}
                    {nearOffers.length > 0 && renderCards(nearOffers, offerTitle || undefined)}
                  </>
                ) : renderCards(nearResults)}
                {farResults.length > 0 && renderCards(farResults, '超出當前配送範圍', true)}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
