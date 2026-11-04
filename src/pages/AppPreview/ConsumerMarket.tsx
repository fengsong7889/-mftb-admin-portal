/**
 * 用户端 APP · 超市百貨页（新增，纯前端原型）
 *
 * 入口：首页「超市百貨」卡片（见 ConsumerHome 的 onOpenMarket）。
 * 结构：头部(返回+定位) → 搜索 → 分类宫格 → 促销位 → 附近超市 → 熱賣商品 → 到底提示。
 * 搜索作用域固定为 market：只搜超市商家与商品（见 ConsumerSearch 的 scope）。
 * 界面文案走 appConsumer 命名空间；商家/商品名与价格仍为 consumerSearchData 的占位数据。
 */
import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  CHANNEL_LABEL,
  SEARCH_MERCHANTS,
  SEARCH_PRODUCTS,
  formatMoney,
  type SearchMerchant,
  type SearchProduct,
} from './consumerSearchData'

const CATS = [
  { key: 'fruit', labelKey: 'appConsumer.market.cat.fruit', zh: '生鮮水果', emoji: '🍎', bg: '#FFF1F0' },
  { key: 'dairy', labelKey: 'appConsumer.market.cat.dairy', zh: '乳品烘焙', emoji: '🥛', bg: '#F0F5FF' },
  { key: 'grain', labelKey: 'appConsumer.market.cat.grain', zh: '糧油調味', emoji: '🌾', bg: '#FFFBE6' },
  { key: 'snack', labelKey: 'appConsumer.market.cat.snack', zh: '零食飲料', emoji: '🍫', bg: '#FFF7E6' },
  { key: 'daily', labelKey: 'appConsumer.market.cat.daily', zh: '日用百貨', emoji: '🧻', bg: '#F6FFED' },
  { key: 'frozen', labelKey: 'appConsumer.market.cat.frozen', zh: '冷凍食品', emoji: '🧊', bg: '#E6FFFB' },
  { key: 'drink', labelKey: 'appConsumer.market.cat.drink', zh: '酒水飲品', emoji: '🍺', bg: '#FFF0F6' },
  { key: 'baby', labelKey: 'appConsumer.market.cat.baby', zh: '母嬰用品', emoji: '🍼', bg: '#F9F0FF' },
  { key: 'pet', labelKey: 'appConsumer.market.cat.pet', zh: '寵物生活', emoji: '🐱', bg: '#FFF2E8' },
  { key: 'more', labelKey: 'appConsumer.groupBuy.filter.allCategories', zh: '全部分類', emoji: '⋯', bg: '#F5F5F5' },
]

const TABS = [
  { key: 'home', icon: '🏠', labelKey: 'appConsumer.tab.home', zh: '首頁' },
  { key: 'cat', icon: '🗂️', labelKey: 'appConsumer.tab.category', zh: '分類' },
  { key: 'cart', icon: '🛒', labelKey: 'appConsumer.tab.cart', zh: '購物車', badge: 1 },
  { key: 'order', icon: '📋', labelKey: 'appConsumer.tab.order', zh: '訂單' },
  { key: 'mine', icon: '👤', labelKey: 'appConsumer.tab.mine', zh: '我的' },
]

const MARKET_MERCHANTS = SEARCH_MERCHANTS.filter((merchant) => merchant.channel === 'market')
const MARKET_PRODUCTS = SEARCH_PRODUCTS.filter((product) => product.channel === 'market')

function MerchantRow({ merchant, onOpen }: { merchant: SearchMerchant; onOpen: () => void }) {
  const { t } = useTranslation()
  return (
    <button type="button" className="apmk-shop" onClick={onOpen}>
      <span className="apmk-shop-logo" aria-hidden="true">{merchant.emoji}</span>
      <span className="apmk-shop-main">
        <span className="apmk-shop-head">
          <b>{merchant.name}</b>
          <em className="apcs-channel apcs-channel--market">{CHANNEL_LABEL[merchant.channel]}</em>
        </span>
        <span className="apmk-shop-meta">
          <b>{merchant.rating}</b>{t('appConsumer.common.ratingSuffix', { defaultValue: '分' })} · {t('appConsumer.common.monthlySales', { value: merchant.monthlySales ?? '', defaultValue: '月售 {{value}}' })} · {t('appConsumer.delivery.minutes', { value: merchant.deliveryMinutes ?? '', defaultValue: '{{value}}分鐘' })} · {t('appConsumer.common.kilometers', { value: merchant.distanceKm ?? '', defaultValue: '{{value}}km' })}
        </span>
        <span className="apmk-shop-meta">
          {merchant.deliveryFee === 0
            ? t('appConsumer.delivery.freeDelivery', { defaultValue: '免配送費' })
            : t('appConsumer.delivery.fee', { value: formatMoney(merchant.deliveryFee ?? 0), defaultValue: '配送費 ${{value}}' })} · {t('appConsumer.delivery.minOrder', { value: formatMoney(merchant.minOrder ?? 0), defaultValue: '起送 ${{value}}' })}
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
  const { t } = useTranslation()
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
        <span className="apmk-prod-spec">{product.spec} · {t('appConsumer.common.monthlySales', { value: product.monthlySales ?? '', defaultValue: '月售 {{value}}' })}</span>
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
  const { t } = useTranslation()
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
          <button type="button" className="apg-back" onClick={onBack} aria-label={t('appConsumer.common.back', { defaultValue: '返回' })}>‹</button>
          <span className="apg-title">{t('appConsumer.channel.market', { defaultValue: '超市百貨' })}</span>
          <span className="apg-loc"><span aria-hidden="true">📍</span>{t('appConsumer.common.location', { defaultValue: '威尼斯人A座' })} <i aria-hidden="true">›</i></span>
        </div>
        <div className="apmk-header-search">
          <button type="button" className="apmk-search" onClick={onSearch}>
            <span aria-hidden="true">🔍</span>
            <span className="apmk-search-ph">{t('appConsumer.market.searchPlaceholder', { defaultValue: '搜尋超市商品、商家' })}</span>
            <em>{t('appConsumer.common.search', { defaultValue: '搜索' })}</em>
          </button>
        </div>
      </div>

      <div className="ap-body apmk-body" ref={bodyRef} onScroll={handleScroll}>
        <div className="apmk-hero">
          <span className="apmk-hero-badge">{t('appConsumer.market.heroBadge', { defaultValue: '超市到家 · 最快 20 分鐘' })}</span>
          <b>{t('appConsumer.market.heroTitle', { defaultValue: '天天低價' })}</b>
          <span>{t('appConsumer.market.heroSub', { defaultValue: '滿 $99 免配送費 · 新人立減 $20' })}</span>
          <em aria-hidden="true">🛒</em>
        </div>

        <div className="apg-cats apmk-cats">
          {CATS.map((cat) => (
            <button key={cat.key} type="button" className="apg-cat" onClick={onSearch}>
              <span className="apg-cat-emoji" style={{ background: cat.bg }} aria-hidden="true">{cat.emoji}</span>
              <span className="apg-cat-label">{t(cat.labelKey, { defaultValue: cat.zh })}</span>
            </button>
          ))}
        </div>

        <section className="apcs-section">
          <header className="apcs-section-head">
            <b>{t('appConsumer.market.nearbyTitle', { defaultValue: '附近超市' })}</b>
            <span>{t('appConsumer.market.shopCount', { count: MARKET_MERCHANTS.length, defaultValue: '{{count}} 家' })}</span>
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
            <b>{t('appConsumer.market.hotProducts', { defaultValue: '熱賣商品' })}</b>
            <span>{t('appConsumer.market.restockAnytime', { defaultValue: '隨時補貨' })}</span>
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
          <span className="apg-end-text">{t('appConsumer.common.reachedBottom', { defaultValue: '已經到我底線了' })}</span>
        </div>
      </div>

      <div className="ap-tabbar apd-tabbar">
        {TABS.map((tab, index) => (
          <button key={tab.key} type="button" className={`ap-tab${index === 0 ? ' is-active' : ''}`}>
            <span className="ap-tab-icon apd-tab-icon" aria-hidden="true">
              {tab.icon}
              {tab.badge ? <em className="apd-badge">{tab.badge}</em> : null}
            </span>
            <span>{t(tab.labelKey, { defaultValue: tab.zh })}</span>
          </button>
        ))}
      </div>
    </>
  )
}
