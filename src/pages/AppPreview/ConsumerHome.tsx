/**
 * 用户端 APP · 首页（按设计稿还原，纯前端静态原型）
 *
 * 布局自上而下：
 *  黄色顶区 — 搜索+定位 → 推广标签 → 主 Banner → 三栏分类 → 快捷入口 → 底部横幅
 *  白色内容区 — 超神一口价(横滑) → 团购/超市秒杀 → 分类切换(吸顶) → 瀑布流商品卡
 *
 * 说明：消费者侧暂无对应后端只读接口（见 ConsumerApp 文件头），本页先用占位数据渲染版式。
 * 商品/门店图当前为 AI 生成的统一风格占位图（src/assets/consumer-home/），待设计切图接入后按同名文件替换即可。
 * 界面文案走 appConsumer 命名空间；商品名/门店名/价格/销量仍为占位数据，不进入语言包。
 */
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import bannerImg from '@/assets/consumer-home/banner.jpg'
import riceballImg from '@/assets/consumer-home/riceball.jpg'
import friedChickenImg from '@/assets/consumer-home/friedchicken.jpg'
import fishPotImg from '@/assets/consumer-home/fishpot.jpg'
import burgerImg from '@/assets/consumer-home/burger.jpg'
import lemonTeaImg from '@/assets/consumer-home/lemontea.jpg'
import { hotWordsFor } from './consumerSearchData'
import { HOME_DELIVERY_STORES, HOME_DELIVERY_AD_STORES, HOME_GROUPBUY_FEED } from './consumerHomeFeed'
import GroupBuyFeedCard from './GroupBuyFeedCard'
import DeliveryStoreCard from './DeliveryStoreCard'
import DeliveryGridCard from './DeliveryGridCard'
import DeliveryLargeCard from './DeliveryLargeCard'

/** 搜索底纹词：轮播全站热搜前 5 个（美团式引导，需求 1.1），点搜索框后进激活页仍可换词 */
const SHADE_WORDS = hotWordsFor('global').slice(0, 5)
const SHADE_INTERVAL_MS = 3000

/* ─── 分类切换（团购 / 外卖 / 超市百貨），与 MFOOD 首页三段式对齐 ─── */
const HOME_CHANNELS = [
  { key: 'group', zh: '團購', emoji: '🍲' },
  { key: 'delivery', zh: '外賣', emoji: '🧋' },
  { key: 'market', zh: '超市百貨', emoji: '🛒' },
]

/* ─── 超神一口價 横滑商品 ─── */
const ONE_PRICE = [
  { key: 'a', title: '午餐肉炸蛋...', shop: '齒留鱻（鎮店...', price: '27.8', img: riceballImg },
  { key: 'b', title: '三養火雞面...', shop: '葛記雲餃（火雞...', price: '29.8', img: friedChickenImg },
  { key: 'c', title: '泰式鹹法酪...', shop: '盈茶（現萃鹹法...', price: '23', img: fishPotImg },
  { key: 'd', title: '普洱鹹法酪...', shop: '盈茶（現萃鹹法...', price: '23', img: burgerImg },
]

/* ─── 團購秒殺 ─── */
const GROUP_FLASH = [
  { key: 'gf1', discount: '8.4折', title: '10元代金券\n(McDonald\'s)', price: '8.4', origin: '10', img: friedChickenImg },
  { key: 'gf2', discount: '3.1折', title: '海鮮點心套餐\n(午)2人用', price: '88', origin: '288.2', img: fishPotImg },
]

/* ─── 超市秒殺 ─── */
const MARKET_FLASH = [
  { key: 'mf1', title: 'SOJA 豆奶', price: '13', img: lemonTeaImg },
  { key: 'mf2', title: 'SOJA 豆奶 買2支', price: '39.8', img: lemonTeaImg },
  { key: 'mf3', title: 'AVENA 燕麥奶', price: '39.8', img: lemonTeaImg },
  { key: 'mf4', title: 'ALMENDRAS 杏仁奶 買2支', price: '39.8', img: lemonTeaImg },
]

/* ─── 瀑布流数据（團購券 / 外賣門店）抽至 consumerHomeFeed.ts：搜索结果页「外賣/團購」分类复用首页同款瀑布流 ─── */
/* 首页外賣瀑布流 = 基礎門店 + 人氣商家廣告門店（广告仅首页展示；搜索结果页用不含广告的 HOME_DELIVERY_SEARCH_STORES） */
const ALL_DELIVERY_STORES = [...HOME_DELIVERY_STORES, ...HOME_DELIVERY_AD_STORES]

export default function ConsumerHome({
  onOpenGroupBuy,
  onOpenDelivery,
  onOpenMarket,
  onSearch,
  onOpenStore,
  onCategoryChange,
  syncCategory,
  syncSeq,
  deliveryMode,
}: {
  onOpenGroupBuy?: () => void
  onOpenDelivery?: () => void
  onOpenMarket?: () => void
  onSearch?: () => void
  onOpenStore?: (merchantId: string) => void
  /** 分类切换回调（双机视图联动右侧说明面板：外卖 → 外卖说明，其余 → 团购说明） */
  onCategoryChange?: (cat: string) => void
  /** 右侧说明面板 Tab 下发的分类同步命令（syncSeq 自增时执行，壳内自身切换不回流） */
  syncCategory?: string
  syncSeq?: number
  /** 外卖瀑布流展示模式（说明面板切换器下发；两台手机同步；large=大图模式閃蜂/MFOOD 均实现） */
  deliveryMode?: 'list' | 'card' | 'large'
}) {
  const { t } = useTranslation()
  const bodyRef = useRef<HTMLDivElement>(null)
  /* 分类初值直接应用 syncCategory：壳为条件挂载（从团购页/频道页被面板命令拉回首页时会重新挂载），
     错过 syncSeq 变化时靠初值补上（同 ConsumerGroupBuy 初值口径）；非法命令回落默认团购 */
  const [cat, setCat] = useState<string>(() => (
    syncCategory && HOME_CHANNELS.some((c) => c.key === syncCategory) ? syncCategory : HOME_CHANNELS[0].key
  ))
  const [scrolled, setScrolled] = useState(false)
  const [shadeIndex, setShadeIndex] = useState(0)

  /* 右侧说明面板 Tab 下发的同步命令：只在 syncSeq 变化时执行，避免壳内自身切换被面板回流覆盖 */
  const syncSeqRef = useRef(syncSeq ?? 0)
  useEffect(() => {
    if ((syncSeq ?? 0) !== syncSeqRef.current && syncCategory) {
      syncSeqRef.current = syncSeq ?? 0
      setCat(syncCategory)
    }
  }, [syncSeq, syncCategory])

  /** 底纹词每 3 秒轮换；key 变化重触发淡入动画 */
  useEffect(() => {
    const timer = window.setInterval(
      () => setShadeIndex((index) => (index + 1) % SHADE_WORDS.length),
      SHADE_INTERVAL_MS,
    )
    return () => window.clearInterval(timer)
  }, [])

  /** 内容区上滑过阈值后显示吸顶搜索栏 */
  const handleScroll = () => {
    const el = bodyRef.current
    if (!el) return
    const next = el.scrollTop > 36
    setScrolled((prev) => (prev === next ? prev : next))
  }

  return (
    <>
      {/* 吸顶搜索栏（滚动后显示） */}
      <div className={`apc-sticky-header${scrolled ? ' is-visible' : ''}`}>
        <div className="apc-sticky-search">
          <button type="button" className="apc-top-search" onClick={onSearch}>
            <span className="apc-top-search-ph" key={shadeIndex}>{SHADE_WORDS[shadeIndex]}</span>
            <span className="apc-top-search-btn">{t('appConsumer.common.search', { defaultValue: '搜索' })}</span>
          </button>
          <div className="apc-top-loc">
            <span aria-hidden="true">📍</span>
            <span>{t('appConsumer.home.location', { defaultValue: '威尼斯人' })}</span>
          </div>
        </div>
      </div>

      {/* 整页滚动容器 */}
      <div className="ap-body apc-home-body" ref={bodyRef} onScroll={handleScroll}>
      {/* ═══ 黄色顶区（随内容滚动） ═══ */}
      <div className="apc-home-top">
        {/* 搜索行 */}
        <div className="apc-top-row">
          <div className="apc-mascot">
            <span className="apc-mascot-ico" aria-hidden="true">🐝</span>
            <span className="apc-mascot-badge">{'領紅包'}</span>
          </div>
          <button type="button" className="apc-top-search" onClick={onSearch}>
            <span className="apc-top-search-ph" key={shadeIndex}>{SHADE_WORDS[shadeIndex]}</span>
            <span className="apc-top-search-btn">{t('appConsumer.common.search', { defaultValue: '搜索' })}</span>
          </button>
          <div className="apc-top-loc">
            <span aria-hidden="true">📍</span>
            <span>{t('appConsumer.home.location', { defaultValue: '威尼斯人' })}</span>
          </div>
        </div>

        {/* 推广标签 */}
        <div className="apc-promo-tags">
          <span className="apc-promo-tag apc-promo-tag-green">
            <span aria-hidden="true">🔥</span>
            {'食得健康餐廳'}
          </span>
          <span className="apc-promo-tag apc-promo-tag-red">
            <span aria-hidden="true">🔥</span>
            {'澳資德馨口腔'}
          </span>
        </div>

        {/* 主 Banner */}
        <div
          className="apc-main-banner"
          style={{ backgroundImage: `url(${bannerImg})` }}
        >
          <div className="apc-banner-overlay" />
          <div className="apc-banner-brand">
            <span className="apc-brand-logo" aria-hidden="true">🏪</span>
            <span className="apc-brand-shop">{'新大家發美食'}</span>
            <span className="apc-brand-x">✕</span>
            <span className="apc-brand-logo" aria-hidden="true">🐝</span>
            <span className="apc-brand-app">{'閃蜂APP'}</span>
          </div>
          <div className="apc-banner-content">
            <span className="apc-banner-shop-name">{'新大家發美食'}</span>
            <span className="apc-banner-title">{'二十年老字號'}</span>
            <span className="apc-banner-subtitle">{'暑期人氣上新'}</span>
            <span className="apc-banner-series">{'午晚市通用系列'}</span>
            <div className="apc-banner-price-row">
              <span className="apc-banner-price-label">{'秒殺價MOP'}</span>
              <span className="apc-banner-price-value">32.8</span>
            </div>
          </div>
        </div>

        {/* 分类卡片网格 */}
        <div className="apc-cat-tiles">
          {/* 美食外賣：左侧占满高度（点击進入美食外賣频道页） */}
          <div className="apc-cat-tile apc-cat-tile--delivery" style={{ background: 'linear-gradient(180deg,#FFF9C4 0%,#FFE082 100%)' }} onClick={onOpenDelivery}>
            <div className="apc-cat-tile-head">
              <span className="apc-cat-tile-title">{t('appConsumer.channel.delivery', { defaultValue: '美食外賣' })}</span>
              <button type="button" className="apc-cat-tile-btn">
                {'去領券'} ›
              </button>
            </div>
            <span className="apc-cat-tile-sub">{t('appConsumer.home.tileDeliverySub', { defaultValue: '優惠領不停，美味一鍵達' })}</span>
            <img className="apc-cat-tile-photo" src={burgerImg} alt="美食外賣" />
          </div>
          {/* 鮮花蛋糕：右上第一列 */}
          <div className="apc-cat-tile apc-cat-tile--flower" style={{ background: 'linear-gradient(135deg,#E0F7FA,#B2EBF2)' }}>
            <span className="apc-cat-tile-title">{'鮮花蛋糕'}</span>
            <span className="apc-cat-tile-sub">{'同城百貨大集合'}</span>
            <img className="apc-cat-tile-photo-sm" src={riceballImg} alt="鮮花蛋糕" />
          </div>
          {/* 超市：右上第二列 */}
          <div className="apc-cat-tile apc-cat-tile--market" style={{ background: 'linear-gradient(135deg,#F1F8E9,#C5E1A5)' }}>
            <span className="apc-cat-tile-title">{t('appConsumer.channel.market', { defaultValue: '超市' })}</span>
            <span className="apc-cat-tile-sub">{t('appConsumer.home.tileMarketSub', { defaultValue: '天天$1秒殺！' })}</span>
            <span className="apc-cat-tile-corner">{'限時$1'}</span>
            <img className="apc-cat-tile-photo-sm" src={lemonTeaImg} alt="超市" />
          </div>
          {/* 特價團購：右下跨两列 */}
          <div className="apc-cat-tile apc-cat-tile--group" style={{ background: 'linear-gradient(135deg,#FCE4EC,#F8BBD0)' }} onClick={onOpenGroupBuy}>
            <div className="apc-cat-tile-group-text">
              <span className="apc-cat-tile-title">{t('appConsumer.channel.groupBuy', { defaultValue: '特價團購' })}</span>
              <span className="apc-cat-tile-sub">{t('appConsumer.home.tileGroupSub', { defaultValue: '網紅餐廳特惠，低至3折天天享' })}</span>
              <button type="button" className="apc-cat-tile-flash-btn">{'秒殺進行中'} ›</button>
            </div>
            <img className="apc-cat-tile-photo-group" src={friedChickenImg} alt="團購" />
          </div>
        </div>

        {/* 快捷入口 */}
        <div className="apc-quick-actions">
          {[
            { emoji: '🧧', title: '蜂蜜兌換', sub: '兌紅包' },
            { emoji: '🍾', title: '閃電送酒', sub: '酒品速達' },
            { emoji: '🦞', title: '自助餐', sub: '團購自助' },
            { emoji: '🛍️', title: '零售拼團', sub: '更省錢' },
          ].map((q) => (
            <button key={q.title} type="button" className="apc-quick-action">
              <div className="apc-quick-action-text">
                <span className="apc-quick-action-title">{q.title}</span>
                <span className="apc-quick-action-sub">{q.sub}</span>
              </div>
              <span className="apc-quick-action-emoji" aria-hidden="true">{q.emoji}</span>
            </button>
          ))}
        </div>

        {/* 底部横幅 */}
        <div className="apc-bottom-banner">
          <span className="apc-bottom-banner-title">{'落單抽iPhone Duo'}</span>
          <span className="apc-bottom-banner-main">{'消費大抽獎'}</span>
          <button type="button" className="apc-bottom-banner-btn">
            {'點擊抽獎'}
          </button>
        </div>
      </div>

      {/* ═══ 白色内容区（随内容滚动） ═══ */}
      <div className="apc-home-content">

        {/* 超神一口價 */}
        <section className="apc-section apc-one-price">
          <header className="apc-section-header">
            <span className="apc-section-title">{t('appConsumer.home.onePriceTitle', { defaultValue: '超神一口價' })}</span>
            <span className="apc-one-price-tags">
              <span className="apc-one-price-tag">{'免湊單'}</span>
              <span className="apc-one-price-tag">{t('appConsumer.home.tagFreeDelivery', { defaultValue: '免運費' })}</span>
            </span>
            <button type="button" className="apc-section-more">
              {t('appConsumer.common.more', { defaultValue: '更多' })} ›
            </button>
          </header>
          <div className="apc-hscroll-row">
            {ONE_PRICE.map((it) => (
              <button key={it.key} type="button" className="apc-op-card" onClick={() => onOpenStore?.('d-rice')}>
                <img className="apc-op-img" src={it.img} alt={it.title} />
                <span className="apc-op-title">{it.title}</span>
                <span className="apc-op-shop">{it.shop}</span>
                <div className="apc-op-foot">
                  <span className="apc-op-price"><i>$</i>{it.price}</span>
                  <span className="apc-op-grab">{t('appConsumer.common.grab', { defaultValue: '搶' })}</span>
                </div>
              </button>
            ))}
          </div>
        </section>

        {/* 團購秒殺 + 超市秒殺 */}
        <div className="apc-flash-row">
          {/* 團購秒殺 */}
          <section className="apc-section apc-flash-section apc-flash-group">
            <header className="apc-flash-header">
              <span className="apc-flash-title">{'團購秒殺'}</span>
              <span className="apc-flash-countdown">
                {'13:54:26'} 後結束
              </span>
            </header>
            {GROUP_FLASH.map((it) => (
              <div key={it.key} className="apc-flash-item">
                <div className="apc-flash-img-wrap">
                  <img className="apc-flash-img" src={it.img} alt={it.title} />
                  <span className="apc-flash-discount">{it.discount}</span>
                </div>
                <div className="apc-flash-info">
                  <span className="apc-flash-item-title">{it.title}</span>
                  <div className="apc-flash-price-row">
                    <span className="apc-flash-price"><i>$</i>{it.price}</span>
                    <span className="apc-flash-origin">${it.origin}</span>
                  </div>
                </div>
              </div>
            ))}
            <button type="button" className="apc-flash-more">
              {t('appConsumer.common.viewMore', { defaultValue: '查看更多' })} ›
            </button>
          </section>

          {/* 超市秒殺 */}
          <section className="apc-section apc-flash-section apc-flash-market">
            <header className="apc-flash-header">
              <span className="apc-flash-title">{'超市秒殺'}</span>
              <span className="apc-flash-countdown apc-flash-countdown-green">
                {'23:23:26'} 進行中
              </span>
            </header>
            <div className="apc-market-grid">
              {MARKET_FLASH.map((it) => (
                <div key={it.key} className="apc-market-item">
                  <img className="apc-market-img" src={it.img} alt={it.title} />
                  <span className="apc-market-price"><i>$</i>{it.price}</span>
                </div>
              ))}
            </div>
          </section>
        </div>

        {/* 分類切換（sticky 吸顶） */}
        <div className="apc-sticky-cats">
          {HOME_CHANNELS.map((c) => (
            <button
              key={c.key}
              type="button"
              className={`apc-sticky-cat${cat === c.key ? ' is-on' : ''}`}
              onClick={() => { setCat(c.key); onCategoryChange?.(c.key) }}
            >
              <span className="apc-sticky-cat-text">{c.zh}</span>
              <span className="apc-sticky-cat-emoji" aria-hidden="true">{c.emoji}</span>
            </button>
          ))}
        </div>

        {/* 分類對應瀑布流：團購 → 團購券卡；外賣 → 門店卡（大圖/卡片/列表三模式）；其他分類暫回退團購券 */}
        <div className="apf-feed-list">
          {cat === 'delivery'
            ? deliveryMode === 'large'
              ? ALL_DELIVERY_STORES.map((store) => (
                  <DeliveryLargeCard key={store.key} store={store} onOpenStore={onOpenStore} />
                ))
              : deliveryMode === 'card'
              ? (
                  <div className="apw-grid">
                    {ALL_DELIVERY_STORES.map((store) => (
                      <DeliveryGridCard key={store.key} brand="bee" store={store} onOpenStore={onOpenStore} />
                    ))}
                  </div>
                )
              : ALL_DELIVERY_STORES.map((store) => (
                <DeliveryStoreCard key={store.key} store={store} onOpenStore={onOpenStore} />
              ))
            : HOME_GROUPBUY_FEED.map((it) => (
                <GroupBuyFeedCard key={it.key} item={it} theme="orange" onOpenStore={onOpenStore} />
              ))}
        </div>

      </div>
      </div>
    </>
  )
}
