/**
 * 用户端 APP · 店铺详情页（新增，纯前端原型）
 *
 * 入口：搜索结果中的商家/商品、外卖页商家卡、超市页商家卡、首页瀑布流商品卡。
 * 关键能力：顶部「搜尋店內商品」进入 scope=store 的搜索，只搜本店，不跨店。
 * 界面文案走 appConsumer 命名空间；店名/商品名/分类名/价格仍为 consumerSearchData 的占位数据。
 */
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
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
  const { t } = useTranslation()
  const merchant = getMerchant(merchantId)
  const offers = getStoreOffers(merchantId)
  const categories = getStoreCategories(merchantId)
  const [category, setCategory] = useState('all')

  if (!merchant) {
    return (
      <>
        <div className="ap-navbar">
          <button type="button" className="ap-navbar-back" onClick={onBack}>‹ {t('appConsumer.common.back', { defaultValue: '返回' })}</button>
          <span className="ap-navbar-title">{t('appConsumer.store.title', { defaultValue: '店鋪' })}</span>
        </div>
        <div className="ap-body">
          <div className="ap-empty-tip">{t('appConsumer.store.notFound', { defaultValue: '店鋪不存在或已下線' })}</div>
        </div>
      </>
    )
  }

  const visibleOffers = category === 'all'
    ? offers
    : offers.filter((offer) => offer.category === category)

  const fulfillment = merchant.channel === 'groupbuy'
    ? [
      t('appConsumer.common.kilometers', { value: merchant.distanceKm ?? '', defaultValue: '{{value}}km' }),
      t('appConsumer.store.groupbuyCount', { count: merchant.groupbuyCount ?? 0, defaultValue: '{{count}} 個團購' }),
      t('appConsumer.store.avgPerPerson', { price: formatMoney(merchant.avgPrice ?? 0), defaultValue: '人均 ${{price}}' }),
    ].join(' · ')
    : [
      t('appConsumer.delivery.minutes', { value: merchant.deliveryMinutes ?? 0, defaultValue: '{{value}}分鐘' }),
      t('appConsumer.common.kilometers', { value: merchant.distanceKm ?? '', defaultValue: '{{value}}km' }),
      merchant.deliveryFee === 0
        ? t('appConsumer.delivery.freeDelivery', { defaultValue: '免配送費' })
        : t('appConsumer.delivery.fee', { value: formatMoney(merchant.deliveryFee ?? 0), defaultValue: '配送費 ${{value}}' }),
      t('appConsumer.delivery.minOrder', { value: formatMoney(merchant.minOrder ?? 0), defaultValue: '起送 ${{value}}' }),
    ].join(' · ')

  return (
    <>
      <div className="apst-header">
        <button type="button" className="apg-back" onClick={onBack} aria-label={t('appConsumer.common.back', { defaultValue: '返回' })}>‹</button>
        <span className="apst-title">{merchant.name}</span>
        <button type="button" className="apst-more" aria-label={t('appConsumer.common.more', { defaultValue: '更多' })}>⋯</button>
      </div>

      <div className="apst-searchrow">
        <button type="button" className="apst-search" onClick={onSearch}>
          <span aria-hidden="true">🔍</span>
          <span>{t('appConsumer.store.searchPlaceholder', { defaultValue: '搜尋店內商品' })}</span>
          <em>{t('appConsumer.store.tabInStore', { defaultValue: '店內' })}</em>
        </button>
      </div>

      <div className="ap-body apst-body">
        <div className={`apst-hero${merchant.image ? '' : ' apst-hero--emoji'}`}>
          {merchant.image
            ? <img className="apst-hero-img" src={merchant.image} alt="" />
            : <span className="apst-hero-emoji" aria-hidden="true">{merchant.emoji}</span>}
          <span className={`apcs-channel apcs-channel--${merchant.channel}`}>{CHANNEL_LABEL[merchant.channel]}</span>
          {merchant.status === 'rest' && <span className="apst-rest">{t('appConsumer.store.resting', { defaultValue: '休息中' })}</span>}
          {merchant.status === 'new' && <span className="apst-new">{t('appConsumer.common.newStoreTag', { defaultValue: '新店' })}</span>}
        </div>

        <div className="apst-info">
          <div className="apst-info-head">
            <b>{merchant.name}</b>
            <span className="apst-rating"><i>{merchant.rating}</i>{t('appConsumer.common.ratingSuffix', { defaultValue: '分' })}</span>
          </div>
          <div className="apst-info-meta">{t('appConsumer.common.monthlySales', { value: merchant.monthlySales ?? '', defaultValue: '月售 {{value}}' })} · {fulfillment}</div>
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
            {t('appConsumer.store.filterAll', { defaultValue: '全部' })}
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
                    {isProduct
                      ? offer.spec
                      : `${t('appConsumer.common.kilometers', { value: offer.distanceKm ?? '', defaultValue: '{{value}}km' })} · ${offer.rating}${t('appConsumer.common.ratingSuffix', { defaultValue: '分' })}`}
                    <i>{isProduct
                      ? t('appConsumer.common.monthlySales', { value: offer.monthlySales ?? '', defaultValue: '月售 {{value}}' })
                      : t('appConsumer.common.halfYearSales', { value: offer.sold ?? '', defaultValue: '半年售 {{value}}' })}</i>
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
                  aria-label={t('appConsumer.store.addToCart', { name, defaultValue: '加入：{{name}}' })}
                  onClick={() => onAddToCart(offer)}
                >
                  {isProduct ? '+' : t('appConsumer.common.grab', { defaultValue: '搶' })}
                </button>
              </div>
            )
          })}
          {visibleOffers.length === 0 && (
            <div className="apst-empty">
              <span aria-hidden="true">🍽️</span>
              <p>{t('appConsumer.store.emptyCategory', { defaultValue: '該分類下暫無商品' })}</p>
            </div>
          )}
        </div>

        <div className="apg-end">
          <span className="apg-end-emoji" aria-hidden="true">🐝</span>
          <span className="apg-end-text">{t('appConsumer.common.reachedBottom', { defaultValue: '已經到我底線了' })}</span>
        </div>
      </div>

      {cartCount > 0 && (
        <div className="apst-cartbar">
          <span className="apst-cart-ico" aria-hidden="true">🛒<em>{cartCount}</em></span>
          <span className="apst-cart-text">{t('appConsumer.store.selectedCount', { count: cartCount, defaultValue: '已選 {{count}} 件' })}</span>
          <button type="button" className="apst-cart-btn">{t('appConsumer.store.checkout', { defaultValue: '去結算' })}</button>
        </div>
      )}
    </>
  )
}
