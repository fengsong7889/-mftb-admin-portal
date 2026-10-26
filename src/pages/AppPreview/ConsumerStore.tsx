/**
 * 用户端 APP · 店铺详情页（新增，纯前端原型）
 *
 * 入口：搜索结果中的商家/商品、外卖页商家卡、超市页商家卡、首页瀑布流商品卡。
 * 关键能力：顶部「搜尋店內商品」进入 scope=store 的搜索，只搜本店，不跨店。
 */
import { useState } from 'react'
import {
  CHANNEL_LABEL,
  formatMoney,
  getMerchant,
  getStoreCategories,
  getStoreOffers,
  type SearchOffer,
} from './consumerSearchData'

function StoreThumb({ offer }: { offer: SearchOffer }) {
  return (
    <span className="apst-thumb" aria-hidden="true">
      {offer.image ? <img src={offer.image} alt="" /> : <span>{offer.emoji}</span>}
    </span>
  )
}

export default function ConsumerStore({
  merchantId,
  onBack,
  onSearch,
  cartCount,
  onAddToCart,
}: {
  merchantId: string
  onBack: () => void
  onSearch: () => void
  cartCount: number
  onAddToCart: (offer: SearchOffer) => void
}) {
  const merchant = getMerchant(merchantId)
  const offers = getStoreOffers(merchantId)
  const categories = getStoreCategories(merchantId)
  const [category, setCategory] = useState('all')

  if (!merchant) {
    return (
      <>
        <div className="ap-navbar">
          <button type="button" className="ap-navbar-back" onClick={onBack}>‹ 返回</button>
          <span className="ap-navbar-title">店鋪</span>
        </div>
        <div className="ap-body">
          <div className="ap-empty-tip">店鋪不存在或已下線</div>
        </div>
      </>
    )
  }

  const visibleOffers = category === 'all'
    ? offers
    : offers.filter((offer) => offer.category === category)

  const fulfillment = merchant.channel === 'groupbuy'
    ? `${merchant.distanceKm}km · ${merchant.groupbuyCount ?? 0} 個團購 · 人均 $${formatMoney(merchant.avgPrice ?? 0)}`
    : `${merchant.deliveryMinutes ?? 0}分鐘 · ${merchant.distanceKm}km · ${merchant.deliveryFee === 0 ? '免配送費' : `配送費 $${formatMoney(merchant.deliveryFee ?? 0)}`} · 起送 $${formatMoney(merchant.minOrder ?? 0)}`

  return (
    <>
      <div className="apst-header">
        <button type="button" className="apg-back" onClick={onBack} aria-label="返回">‹</button>
        <span className="apst-title">{merchant.name}</span>
        <button type="button" className="apst-more" aria-label="更多">⋯</button>
      </div>

      <div className="apst-searchrow">
        <button type="button" className="apst-search" onClick={onSearch}>
          <span aria-hidden="true">🔍</span>
          <span>搜尋店內商品</span>
          <em>店內</em>
        </button>
      </div>

      <div className="ap-body apst-body">
        <div className={`apst-hero${merchant.image ? '' : ' apst-hero--emoji'}`}>
          {merchant.image
            ? <img className="apst-hero-img" src={merchant.image} alt="" />
            : <span className="apst-hero-emoji" aria-hidden="true">{merchant.emoji}</span>}
          <span className={`apcs-channel apcs-channel--${merchant.channel}`}>{CHANNEL_LABEL[merchant.channel]}</span>
          {merchant.status === 'rest' && <span className="apst-rest">休息中</span>}
          {merchant.status === 'new' && <span className="apst-new">新店</span>}
        </div>

        <div className="apst-info">
          <div className="apst-info-head">
            <b>{merchant.name}</b>
            <span className="apst-rating"><i>{merchant.rating}</i>分</span>
          </div>
          <div className="apst-info-meta">月售 {merchant.monthlySales} · {fulfillment}</div>
          <div className="apst-info-tags">
            {merchant.tags.map((tag) => <em key={tag} className="apcs-tag">{tag}</em>)}
          </div>
          {merchant.coupons.length > 0 && (
            <div className="apcs-card-coupons">
              {merchant.coupons.map((coupon) => <em key={coupon} className="apcs-coupon">{coupon}</em>)}
            </div>
          )}
        </div>

        <div className="apst-cats">
          <button
            type="button"
            className={`apcs-filterchip${category === 'all' ? ' is-on' : ''}`}
            onClick={() => setCategory('all')}
          >
            全部
          </button>
          {categories.map((item) => (
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

        <div className="apst-list">
          {visibleOffers.map((offer) => {
            const isProduct = offer.kind === 'product'
            const name = isProduct ? offer.name : offer.title
            return (
              <div key={offer.id} className="apst-item">
                <StoreThumb offer={offer} />
                <div className="apst-item-main">
                  <div className="apst-item-name">{name}</div>
                  <div className="apst-item-meta">
                    {isProduct ? offer.spec : `${offer.distanceKm}km · ${offer.rating}分`}
                    <i>{isProduct ? `月售 ${offer.monthlySales}` : `半年售 ${offer.sold}`}</i>
                  </div>
                  <div className="apst-item-price">
                    <b><i>$</i>{formatMoney(offer.price)}</b>
                    {offer.originPrice !== undefined && offer.originPrice > offer.price && (
                      <s>${formatMoney(offer.originPrice)}</s>
                    )}
                    {offer.tags.length > 0 && <em>{offer.tags[0]}</em>}
                  </div>
                </div>
                <button
                  type="button"
                  className="apst-add"
                  aria-label={`加入：${name}`}
                  onClick={() => onAddToCart(offer)}
                >
                  {isProduct ? '+' : '搶'}
                </button>
              </div>
            )
          })}
          {visibleOffers.length === 0 && (
            <div className="apst-empty">
              <span aria-hidden="true">🍽️</span>
              <p>該分類下暫無商品</p>
            </div>
          )}
        </div>

        <div className="apg-end">
          <span className="apg-end-emoji" aria-hidden="true">🐝</span>
          <span className="apg-end-text">已經到我底線了</span>
        </div>
      </div>

      {cartCount > 0 && (
        <div className="apst-cartbar">
          <span className="apst-cart-ico" aria-hidden="true">🛒<em>{cartCount}</em></span>
          <span className="apst-cart-text">已選 {cartCount} 件</span>
          <button type="button" className="apst-cart-btn">去結算</button>
        </div>
      )}
    </>
  )
}
