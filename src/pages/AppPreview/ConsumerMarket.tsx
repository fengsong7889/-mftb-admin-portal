/**
 * 用户端 APP · 超市百貨页（新增，纯前端原型）
 *
 * 入口：首页「超市百貨」卡片（见 ConsumerHome 的 onOpenMarket）。
 * 结构：头部(返回+定位) → 搜索 → 分类宫格 → 促销位 → 附近超市 → 熱賣商品 → 到底提示。
 * 搜索作用域固定为 market：只搜超市商家与商品（见 ConsumerSearch 的 scope）。
 */
import { useRef, useState } from 'react'
import {
  CHANNEL_LABEL,
  SEARCH_MERCHANTS,
  SEARCH_PRODUCTS,
  formatMoney,
  type SearchMerchant,
  type SearchProduct,
} from './consumerSearchData'

const CATS = [
  { key: 'fruit', label: '生鮮水果', emoji: '🍎', bg: '#FFF1F0' },
  { key: 'dairy', label: '乳品烘焙', emoji: '🥛', bg: '#F0F5FF' },
  { key: 'grain', label: '糧油調味', emoji: '🌾', bg: '#FFFBE6' },
  { key: 'snack', label: '零食飲料', emoji: '🍫', bg: '#FFF7E6' },
  { key: 'daily', label: '日用百貨', emoji: '🧻', bg: '#F6FFED' },
  { key: 'frozen', label: '冷凍食品', emoji: '🧊', bg: '#E6FFFB' },
  { key: 'drink', label: '酒水飲品', emoji: '🍺', bg: '#FFF0F6' },
  { key: 'baby', label: '母嬰用品', emoji: '🍼', bg: '#F9F0FF' },
  { key: 'pet', label: '寵物生活', emoji: '🐱', bg: '#FFF2E8' },
  { key: 'more', label: '全部分類', emoji: '⋯', bg: '#F5F5F5' },
]

const TABS = [
  { key: 'home', icon: '🏠', label: '首頁' },
  { key: 'cat', icon: '🗂️', label: '分類' },
  { key: 'cart', icon: '🛒', label: '購物車', badge: 1 },
  { key: 'order', icon: '📋', label: '訂單' },
  { key: 'mine', icon: '👤', label: '我的' },
]

const MARKET_MERCHANTS = SEARCH_MERCHANTS.filter((merchant) => merchant.channel === 'market')
const MARKET_PRODUCTS = SEARCH_PRODUCTS.filter((product) => product.channel === 'market')

function MerchantRow({ merchant, onOpen }: { merchant: SearchMerchant; onOpen: () => void }) {
  return (
    <button type="button" className="apmk-shop" onClick={onOpen}>
      <span className="apmk-shop-logo" aria-hidden="true">{merchant.emoji}</span>
      <span className="apmk-shop-main">
        <span className="apmk-shop-head">
          <b>{merchant.name}</b>
          <em className="apcs-channel apcs-channel--market">{CHANNEL_LABEL[merchant.channel]}</em>
        </span>
        <span className="apmk-shop-meta">
          <b>{merchant.rating}</b>分 · 月售 {merchant.monthlySales} · {merchant.deliveryMinutes}分鐘 · {merchant.distanceKm}km
        </span>
        <span className="apmk-shop-meta">
          {merchant.deliveryFee === 0 ? '免配送費' : `配送費 $${formatMoney(merchant.deliveryFee ?? 0)}`} · 起送 ${formatMoney(merchant.minOrder ?? 0)}
        </span>
        {merchant.coupons.length > 0 && (
          <span className="apcs-card-coupons">
            {merchant.coupons.map((coupon) => <em key={coupon} className="apcs-coupon">{coupon}</em>)}
          </span>
        )}
      </span>
      <span className="apcs-chevron" aria-hidden="true">›</span>
    </button>
  )
}

function ProductTile({ product, onOpen }: { product: SearchProduct; onOpen: () => void }) {
  return (
    <button type="button" className="apmk-prod" onClick={onOpen}>
      <span className="apmk-thumb" aria-hidden="true">
        {product.image ? <img src={product.image} alt="" /> : <span>{product.emoji}</span>}
        {product.originPrice !== undefined && product.originPrice > product.price && (
          <em className="apmk-off">{discount(product.price, product.originPrice)}</em>
        )}
      </span>
      <span className="apmk-prod-body">
        <span className="apmk-prod-name">{product.name}</span>
        <span className="apmk-prod-spec">{product.spec} · 月售 {product.monthlySales}</span>
        <span className="apmk-prod-price">
          <b><i>$</i>{formatMoney(product.price)}</b>
          {product.originPrice !== undefined && product.originPrice > product.price && (
            <s>${formatMoney(product.originPrice)}</s>
          )}
        </span>
        <span className="apmk-prod-shop">{product.merchantName}</span>
      </span>
    </button>
  )
}

function discount(price: number, origin: number): string {
  return `${(price / origin * 10).toFixed(1)}折`
}

export default function ConsumerMarket({
  onBack,
  onSearch,
  onOpenStore,
}: {
  onBack: () => void
  onSearch: () => void
  onOpenStore: (merchantId: string) => void
}) {
  const bodyRef = useRef<HTMLDivElement>(null)
  const [scrolled, setScrolled] = useState(false)

  const handleScroll = () => {
    const el = bodyRef.current
    if (!el) return
    const next = el.scrollTop > 36
    setScrolled((prev) => (prev === next ? prev : next))
  }

  return (
    <>
      <div className={`apmk-header${scrolled ? ' is-scrolled' : ''}`}>
        <div className="apmk-header-top">
          <button type="button" className="apg-back" onClick={onBack} aria-label="返回">‹</button>
          <span className="apg-title">超市百貨</span>
          <span className="apg-loc"><span aria-hidden="true">📍</span>威尼斯人A座 <i aria-hidden="true">›</i></span>
        </div>
        <div className="apmk-header-search">
          <button type="button" className="apmk-search" onClick={onSearch}>
            <span aria-hidden="true">🔍</span>
            <span className="apmk-search-ph">搜尋超市商品、商家</span>
            <em>搜索</em>
          </button>
        </div>
      </div>

      <div className="ap-body apmk-body" ref={bodyRef} onScroll={handleScroll}>
        <div className="apmk-hero">
          <span className="apmk-hero-badge">超市到家 · 最快 20 分鐘</span>
          <b>天天低價</b>
          <span>滿 $99 免配送費 · 新人立減 $20</span>
          <em aria-hidden="true">🛒</em>
        </div>

        <div className="apg-cats apmk-cats">
          {CATS.map((cat) => (
            <button key={cat.key} type="button" className="apg-cat" onClick={onSearch}>
              <span className="apg-cat-emoji" style={{ background: cat.bg }} aria-hidden="true">{cat.emoji}</span>
              <span className="apg-cat-label">{cat.label}</span>
            </button>
          ))}
        </div>

        <section className="apcs-section">
          <header className="apcs-section-head">
            <b>附近超市</b>
            <span>{MARKET_MERCHANTS.length} 家</span>
          </header>
          <div className="apmk-shops">
            {MARKET_MERCHANTS.map((merchant) => (
              <MerchantRow
                key={merchant.id}
                merchant={merchant}
                onOpen={() => onOpenStore(merchant.id)}
              />
            ))}
          </div>
        </section>

        <section className="apcs-section">
          <header className="apcs-section-head">
            <b>熱賣商品</b>
            <span>隨時補貨</span>
          </header>
          <div className="apmk-grid">
            {MARKET_PRODUCTS.map((product) => (
              <ProductTile
                key={product.id}
                product={product}
                onOpen={() => onOpenStore(product.merchantId)}
              />
            ))}
          </div>
        </section>

        <div className="apg-end">
          <span className="apg-end-emoji" aria-hidden="true">🛒</span>
          <span className="apg-end-text">已經到我底線了</span>
        </div>
      </div>

      <div className="ap-tabbar apd-tabbar">
        {TABS.map((tab, index) => (
          <button key={tab.key} type="button" className={`ap-tab${index === 0 ? ' is-active' : ''}`}>
            <span className="ap-tab-icon apd-tab-icon" aria-hidden="true">
              {tab.icon}
              {tab.badge ? <em className="apd-badge">{tab.badge}</em> : null}
            </span>
            <span>{tab.label}</span>
          </button>
        ))}
      </div>
    </>
  )
}
