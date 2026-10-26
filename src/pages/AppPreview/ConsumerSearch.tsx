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
  countByTab,
  entryMatchesTab,
  formatMoney,
  getStoreCategories,
  getStoreName,
  guessWordsFor,
  hotWordsFor,
  loadHistory,
  pushHistory,
  searchCatalog,
  sortEntries,
  suggestFor,
  type SearchEntry,
  type SearchFilter,
  type SearchMerchant,
  type SearchOffer,
  type SearchScope,
  type SearchSort,
  type SearchTab,
} from './consumerSearchData'

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
  onOpen,
}: {
  entry: SearchMerchant
  query: string
  showChannel: boolean
  onOpen?: () => void
}) {
  const fulfillment = entry.channel === 'groupbuy'
    ? `${entry.distanceKm}km · ${entry.groupbuyCount ?? 0} 個團購 · 人均 $${formatMoney(entry.avgPrice ?? 0)}`
    : `${entry.deliveryMinutes ?? 0}分鐘 · ${entry.distanceKm}km · ${entry.deliveryFee === 0 ? '免配送費' : `配送費 $${formatMoney(entry.deliveryFee ?? 0)}`} · 起送 $${formatMoney(entry.minOrder ?? 0)}`

  return (
    <button
      type="button"
      className={`apcs-card apcs-merchant${entry.status === 'rest' ? ' is-rest' : ''}`}
      onClick={onOpen}
    >
      <Thumb entry={entry} />
      <span className="apcs-card-main">
        <span className="apcs-card-head">
          <span className="apcs-card-name"><Highlight text={entry.name} keyword={query} /></span>
          {showChannel && (
            <em className={`apcs-channel apcs-channel--${entry.channel}`}>{CHANNEL_LABEL[entry.channel]}</em>
          )}
          {entry.status === 'rest' && <em className="apcs-status apcs-status--rest">休息中</em>}
          {entry.status === 'new' && <em className="apcs-status apcs-status--new">新店</em>}
        </span>
        <span className="apcs-card-rate">
          <b>{entry.rating}</b>分<i>月售 {entry.monthlySales}</i>
          {entry.channel === 'groupbuy' && <i>{entry.groupbuyCount ?? 0} 個團購</i>}
        </span>
        <span className="apcs-card-meta">{fulfillment}</span>
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
      <span className="apcs-chevron" aria-hidden="true">›</span>
    </button>
  )
}

function OfferCard({
  entry,
  query,
  showChannel,
  onOpen,
  onAdd,
}: {
  entry: SearchOffer
  query: string
  showChannel: boolean
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
    <div className="apcs-card apcs-offer">
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
  const [showFilters, setShowFilters] = useState(false)
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
  const counts = useMemo(
    () => countByTab(scope, query, filters, merchantId),
    [scope, query, filters, merchantId],
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

  const toggleFilter = (filter: SearchFilter) => {
    setFilters((prev) => (
      prev.includes(filter) ? prev.filter((item) => item !== filter) : [...prev, filter]
    ))
  }

  const handleClearHistory = () => {
    clearHistory(scope, merchantId)
    setHistory([])
  }

  const merchantResults = results.filter((entry): entry is SearchMerchant => entry.kind === 'merchant')
  const offerResults = results.filter((entry): entry is SearchOffer => entry.kind !== 'merchant')
  const offerTitle = scope === 'global'
    ? '商品與團購'
    : scope === 'groupbuy'
      ? '團購套餐'
      : scope === 'store'
        ? ''
        : '商品'

  const renderCards = (list: SearchEntry[], title?: string) => (
    <section className="apcs-section">
      {title && (
        <header className="apcs-section-head">
          <b>{title}</b>
          <span>{list.length}</span>
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
              onOpen={onOpenStore ? () => onOpenStore(entry.id) : undefined}
            />
          ) : (
            <OfferCard
              key={entry.id}
              entry={entry}
              query={query}
              showChannel={scope === 'global'}
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
        </div>
        <button type="button" className="apcs-cancel" onClick={handleCancel}>取消</button>
      </form>

      <div className="apcs-scope">
        <span className="apcs-scope-tag">{scope === 'store' ? `店內 · ${storeName}` : config.label}</span>
        <span className="apcs-scope-hint">{config.hint}</span>
      </div>

      <div className="apcs-body" ref={bodyRef}>
        {isActivation && (
          <div className="apcs-activation">
            <section className="apcs-section">
              <header className="apcs-section-head">
                <b>搜尋歷史</b>
                {history.length > 0 && (
                  <button type="button" className="apcs-clear-history" onClick={handleClearHistory}>
                    <span aria-hidden="true">🗑</span> 清空
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
                <b>熱搜榜</b>
                <span>{scope === 'store' ? '店內熱銷' : '澳門 · 今日'}</span>
              </header>
              <div className="apcs-hot">
                {hotWords.map((word, index) => (
                  <button key={word} type="button" className="apcs-hot-item" onClick={() => runSearch(word)}>
                    <em className={`apcs-hot-rank${index < 3 ? ' is-top' : ''}`}>{index + 1}</em>
                    <span className="apcs-hot-text">{word}</span>
                    {index === 0 && <i className="apcs-hot-badge apcs-hot-badge--hot">熱</i>}
                    {index === 1 && <i className="apcs-hot-badge apcs-hot-badge--new">新</i>}
                    {index === 2 && <i className="apcs-hot-badge apcs-hot-badge--up">升</i>}
                  </button>
                ))}
              </div>
            </section>

            <section className="apcs-section">
              <header className="apcs-section-head"><b>{scope === 'store' ? '店內推薦' : '猜你想搜'}</b></header>
              <div className="apcs-chips">
                {guessWords.map((word) => (
                  <button key={word} type="button" className="apcs-chip apcs-chip--guess" onClick={() => runSearch(word)}>
                    {word}
                  </button>
                ))}
              </div>
            </section>
          </div>
        )}

        {showSuggestions && (
          <div className="apcs-sugs">
            <button type="button" className="apcs-sug apcs-sug--all" onClick={() => runSearch(input)}>
              <span className="apcs-sug-ico" aria-hidden="true">🔍</span>
              <span className="apcs-sug-text">搜尋「<b>{trimmedInput}</b>」</span>
            </button>
            {suggestions.map((suggestion) => (
              <button key={suggestion.key} type="button" className="apcs-sug" onClick={() => runSearch(suggestion.text)}>
                <span className={`apcs-sug-type apcs-sug-type--${suggestion.type}`}>{suggestion.typeLabel}</span>
                <span className="apcs-sug-text">
                  <Highlight text={suggestion.text} keyword={trimmedInput} />
                </span>
                <span className="apcs-sug-meta">{suggestion.meta}</span>
              </button>
            ))}
            {suggestions.length === 0 && (
              <p className="apcs-muted apcs-sug-empty">
                按下「搜尋」在{config.label}內查找「{trimmedInput}」
              </p>
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
              <div className="apcs-tabs" role="tablist" aria-label="結果分類">
                {config.tabs.map((item) => {
                  const count = counts[item.key] ?? 0
                  return (
                    <button
                      key={item.key}
                      type="button"
                      role="tab"
                      aria-selected={tab === item.key}
                      className={`apcs-tab${tab === item.key ? ' is-on' : ''}${count === 0 ? ' is-empty' : ''}`}
                      onClick={() => {
                        setTab(item.key)
                        if (bodyRef.current) bodyRef.current.scrollTop = 0
                      }}
                    >
                      {item.label}<em>{count}</em>
                    </button>
                  )
                })}
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
              {config.filters.length > 0 && (
                <button
                  type="button"
                  className={`apcs-filter-toggle${showFilters ? ' is-on' : ''}`}
                  aria-expanded={showFilters}
                  onClick={() => setShowFilters((prev) => !prev)}
                >
                  篩選 ▾
                </button>
              )}
            </div>

            {showFilters && config.filters.length > 0 && (
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

            {results.length === 0 ? renderEmpty() : tab === 'all' ? (
              <>
                {merchantResults.length > 0 && renderCards(merchantResults, scope === 'global' ? '店鋪' : '商家')}
                {offerResults.length > 0 && renderCards(offerResults, offerTitle || undefined)}
              </>
            ) : renderCards(results)}
          </div>
        )}
      </div>
    </div>
  )
}
