/**
 * 用户端 APP · 首页（按设计稿还原，纯前端静态原型）
 *
 * 布局自上而下：搜索+定位 → 主 Banner → 三宫格分类 → 快捷入口 → 促销位 →
 * 进行中订单 → 超神一口价(横滑) → 精选宫格 → 红包券 → 分类切换 → 瀑布流商品 → 进入外賣頻道。
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

/** 搜索底纹词：轮播全站热搜前 5 个（美团式引导，需求 1.1），点搜索框后进激活页仍可换词 */
const SHADE_WORDS = hotWordsFor('global').slice(0, 5)
const SHADE_INTERVAL_MS = 3000

interface Tile {
  key: string
  titleKey: string
  titleZh: string
  subKey: string
  subZh: string
  badge: string
  badgeKey?: string
  emoji: string
  bg: string
}

const TILES: Tile[] = [
  { key: 'food', titleKey: 'appConsumer.channel.delivery', titleZh: '美食外賣', subKey: 'appConsumer.home.tileDeliverySub', subZh: '優惠領不停 美味一鍵達', badge: '去逛逛 ›', badgeKey: 'appConsumer.home.tileGoBrowse', emoji: '🍔', bg: 'linear-gradient(135deg,#FFB347,#FF7A45)' },
  { key: 'group', titleKey: 'appConsumer.channel.groupBuy', titleZh: '特價團購', subKey: 'appConsumer.home.tileGroupSub', subZh: '火鍋低至3折起', badge: '3折', emoji: '🍲', bg: 'linear-gradient(135deg,#FF9AC1,#F759AB)' },
  { key: 'market', titleKey: 'appConsumer.channel.market', titleZh: '超市百貨', subKey: 'appConsumer.home.tileMarketSub', subZh: '天天1秒殺！', badge: '1秒殺', emoji: '🛒', bg: 'linear-gradient(135deg,#7FE3D8,#36CFC9)' },
]

const QUICK_ENTRIES = [
  { emoji: '🍯', key: 'appConsumer.home.quick.honey', zh: '蜂蜜兑換' },
  { emoji: '⏰', key: 'appConsumer.home.quick.flashDeal', zh: '超值秒殺' },
  { emoji: '👥', key: 'appConsumer.home.quick.groupBuy', zh: '團購' },
  { emoji: '🍱', key: 'appConsumer.home.quick.buffet', zh: '自助餐' },
  { emoji: '🎁', key: 'appConsumer.home.quick.checkIn', zh: '簽到領券' },
  { emoji: '⋯', key: 'appConsumer.home.quick.more', zh: '更多' },
]

/** 首页分类切换（与三宮格同一套频道口径） */
const HOME_CHANNELS = [
  { key: 'appConsumer.channel.delivery', zh: '美食外賣' },
  { key: 'appConsumer.channel.groupBuy', zh: '特價團購' },
  { key: 'appConsumer.channel.market', zh: '超市百貨' },
]

/** 超神一口價：横滑商品 */
const ONE_PRICE = [
  { key: 'a', title: '米飯糰 招牌滷肉', price: '100.3', img: riceballImg },
  { key: 'b', title: '米飯糰 鰻魚玉子', price: '100.3', img: riceballImg },
  { key: 'c', title: '米飯糰 照燒雞', price: '100.3', img: riceballImg },
  { key: 'd', title: '米飯糰 蒲燒三文', price: '100.3', img: riceballImg },
  { key: 'e', title: '米飯糰 芝士牛', price: '100.3', img: riceballImg },
]

/** 精選宮格：肯德基類商品 */
const GRID_ITEMS = [
  { key: 'g1', title: '肯德基KFC 香辣雞腿堡套餐', price: '9.9', img: friedChickenImg, badge: '8.8折' },
  { key: 'g2', title: '肯德基KFC 全家桶', price: '9.9', img: friedChickenImg, badge: '8.8折' },
  { key: 'g3', title: '肯德基KFC 吮指原味雞', price: '9.9', img: friedChickenImg, badge: '8.8折' },
  { key: 'g4', title: '肯德基KFC 蛋撻兩件', price: '9.9', img: friedChickenImg, badge: '8.8折' },
]

const COUPONS = [
  { key: 'c1', amount: '25', cond: '滿$60可用', exp: '1月10日到期' },
  { key: 'c2', amount: '50', cond: '滿$120可用', exp: '1月10日到期' },
]

/** 瀑布流商品卡 */
interface FeedItem {
  key: string
  merchantId: string
  channel: string
  dist: string
  time: string
  title: string
  rating: string
  tags: string[]
  promo: string[]
  price: string
  origin: string
  off: string
  img: string
  hot?: boolean
  fresh?: boolean
}
const FEED: FeedItem[] = [
  { key: 'f1', merchantId: 'd-tai2', channel: '外賣', dist: '1.2km', time: '20分鐘', title: '門店名太二酸菜魚（澳門店）', rating: '4.5', tags: ['等送', '可自取'], promo: ['特價券', '88折'], price: '198', origin: '125', off: '50', img: lemonTeaImg },
  { key: 'f2', merchantId: 'd-hotpot', channel: '外賣', dist: '1.2km', time: '20分鐘', title: '門店名太二酸菜魚（葡京店）', rating: '4.5', tags: ['等送', '可自取'], promo: ['特價券', '88折'], price: '198', origin: '125', off: '50', img: burgerImg, hot: true },
  { key: 'f3', merchantId: 'd-sushi', channel: '外賣', dist: '1.2km', time: '20分鐘', title: '門店名太二酸菜魚（氹仔店）', rating: '4.5', tags: ['等送', '可自取'], promo: ['特價券', '88折'], price: '198', origin: '125', off: '50', img: fishPotImg },
  { key: 'f4', merchantId: 'd-mcd', channel: '外賣', dist: '1.2km', time: '20分鐘', title: '門店名太二酸菜魚（黑沙環店）', rating: '4.5', tags: ['等送', '可自取'], promo: ['特價券', '88折'], price: '198', origin: '125', off: '50', img: friedChickenImg, fresh: true },
]

export default function ConsumerHome({
  onOpenGroupBuy,
  onOpenDelivery,
  onOpenMarket,
  onSearch,
  onOpenStore,
}: {
  onOpenGroupBuy?: () => void
  onOpenDelivery?: () => void
  onOpenMarket?: () => void
  onSearch?: () => void
  onOpenStore?: (merchantId: string) => void
}) {
  const { t } = useTranslation()
  const bodyRef = useRef<HTMLDivElement>(null)
  const [cat, setCat] = useState<string>(HOME_CHANNELS[0].key)
  const [scrolled, setScrolled] = useState(false)
  const [shadeIndex, setShadeIndex] = useState(0)

  /** 底纹词每 3 秒轮换；key 变化重触发淡入动画 */
  useEffect(() => {
    const timer = window.setInterval(
      () => setShadeIndex((index) => (index + 1) % SHADE_WORDS.length),
      SHADE_INTERVAL_MS,
    )
    return () => window.clearInterval(timer)
  }, [])

  /** 内容区上滑过阈值后折叠定位行，搜索行吸顶固定（与美食外賣页一致） */
  const handleScroll = () => {
    const el = bodyRef.current
    if (!el) return
    const next = el.scrollTop > 36
    setScrolled((prev) => (prev === next ? prev : next))
  }

  return (
    <>
      {/* 吸顶搜索（滚动后仅保留搜索行，定位并入其右侧） */}
      <div className={`apc-header${scrolled ? ' is-scrolled' : ''}`}>
        <div className="apc-header-search">
          <button type="button" className="apc-search" onClick={onSearch}>
            <span className="apc-search-ico" aria-hidden="true">🔍</span>
            <span className="apc-search-ph" key={shadeIndex}>{SHADE_WORDS[shadeIndex]}</span>
            <span className="apc-search-btn">{t('appConsumer.common.search', { defaultValue: '搜索' })}</span>
          </button>
          {scrolled && (
            <span className="apc-header-loc"><span aria-hidden="true">📍</span><i>{t('appConsumer.home.location', { defaultValue: '澳門新八佰伴' })}</i></span>
          )}
        </div>
        <div className="apc-header-locrow">
          <span aria-hidden="true">📍</span>
          <span>{t('appConsumer.home.location', { defaultValue: '澳門新八佰伴' })}</span>
        </div>
      </div>

      <div className="ap-body apc-home" ref={bodyRef} onScroll={handleScroll}>

      {/* 主 Banner（图片 + 左侧压暗遮罩保证文字可读） */}
      <div
        className="apc-banner"
        style={{ background: `linear-gradient(90deg, rgba(0,0,0,0.46) 0%, rgba(0,0,0,0.06) 64%, rgba(0,0,0,0) 100%), url(${bannerImg}) center/cover no-repeat` }}
      >
        <div className="apc-banner-copy">
          <b>menu</b>
          <em>REMIX</em>
          <i>{t('appConsumer.home.bannerNote', { defaultValue: '限時新品 · 第二份半價' })}</i>
        </div>
        <div className="apc-dots" aria-hidden="true"><i className="is-on" /><i /><i /></div>
      </div>

      {/* 三宮格分類 */}
      <div className="apc-tiles">
        <button type="button" className="apc-tile apc-tile-lg" style={{ background: TILES[0].bg }} onClick={onOpenDelivery}>
          <span className="apc-tile-badge">{t(TILES[0].badgeKey!, { defaultValue: TILES[0].badge })}</span>
          <span className="apc-tile-title">{t(TILES[0].titleKey, { defaultValue: TILES[0].titleZh })}</span>
          <span className="apc-tile-sub">{t(TILES[0].subKey, { defaultValue: TILES[0].subZh })}</span>
          <span className="apc-tile-emoji" aria-hidden="true">{TILES[0].emoji}</span>
        </button>
        <div className="apc-tile-col">
          {TILES.slice(1).map((tl) => (
            <button
              key={tl.key}
              type="button"
              className="apc-tile apc-tile-sm"
              style={{ background: tl.bg }}
              onClick={tl.key === 'group' ? onOpenGroupBuy : tl.key === 'market' ? onOpenMarket : undefined}
            >
              <span className="apc-tile-badge">{tl.badgeKey ? t(tl.badgeKey, { defaultValue: tl.badge }) : tl.badge}</span>
              <span className="apc-tile-title">{t(tl.titleKey, { defaultValue: tl.titleZh })}</span>
              <span className="apc-tile-sub">{t(tl.subKey, { defaultValue: tl.subZh })}</span>
              <span className="apc-tile-emoji" aria-hidden="true">{tl.emoji}</span>
            </button>
          ))}
        </div>
      </div>

      {/* 快捷入口 */}
      <div className="apc-quick">
        {QUICK_ENTRIES.map((q) => (
          <button key={q.key} type="button" className="apc-quick-item">
            <span className="apc-quick-ico" aria-hidden="true">{q.emoji}</span>
            <span className="apc-quick-label">{t(q.key, { defaultValue: q.zh })}</span>
          </button>
        ))}
      </div>

      {/* 促銷位 */}
      <div className="apc-promo" style={{ background: 'linear-gradient(120deg,#5B8DEF,#7B4DFF)' }}>
        <span className="apc-promo-title">{t('appConsumer.common.promoLead', { defaultValue: '盒你一起' })}<b>{t('appConsumer.common.promoHighlight', { defaultValue: '大發現' })}</b></span>
        <span className="apc-promo-emoji" aria-hidden="true">🧧</span>
      </div>

      {/* 進行中訂單 */}
      <button type="button" className="apc-tracking">
        <span className="apc-tracking-ico" aria-hidden="true">🛵</span>
        <span className="apc-tracking-main">
          <b>{t('appConsumer.home.orderAccepted', { defaultValue: '商家已接單' })}</b>
          <i>{t('appConsumer.home.orderEta', { time: '12:46', defaultValue: '預計 {{time}} 送達' })}</i>
        </span>
        <span className="apc-tracking-btn">{t('appConsumer.home.viewOrder', { defaultValue: '查看訂單' })}</span>
      </button>

      {/* 超神一口價 */}
      <section className="apc-sec">
        <header className="apc-sec-head">
          <span className="apc-sec-title">{t('appConsumer.home.onePriceTitle', { defaultValue: '超神一口價' })}</span>
          <span className="apc-tag">{t('appConsumer.home.tagFreeDelivery', { defaultValue: '免運費' })}</span>
          <span className="apc-tag apc-tag-red">{t('appConsumer.home.tagFreeShipping', { defaultValue: '免配送' })}</span>
          <button type="button" className="apc-more">{t('appConsumer.common.more', { defaultValue: '更多' })} ›</button>
        </header>
        <div className="apc-hscroll">
          {ONE_PRICE.map((it) => (
            <button key={it.key} type="button" className="apc-hcard" onClick={() => onOpenStore?.('d-rice')}>
              <img className="apc-thumb" src={it.img} alt={it.title} />
              <span className="apc-hcard-title">{it.title}</span>
              <span className="apc-price"><i>¥</i>{it.price}<em>{t('appConsumer.common.priceFrom', { defaultValue: '起' })}</em></span>
            </button>
          ))}
        </div>
      </section>

      {/* 精選宮格 */}
      <section className="apc-sec">
        <header className="apc-sec-head">
          <span className="apc-sec-title">{t('appConsumer.common.sectionPlaceholder', { defaultValue: '標題欄' })}<span className="apc-sec-sub">{t('appConsumer.common.sectionSubLow30', { defaultValue: '低至3折' })}</span></span>
          <button type="button" className="apc-more">{t('appConsumer.common.viewMore', { defaultValue: '查看更多' })} ›</button>
        </header>
        <div className="apc-grid2">
          {GRID_ITEMS.map((it) => (
            <button key={it.key} type="button" className="apc-gcard" onClick={() => onOpenStore?.('d-kfc')}>
              <span className="apc-gcard-badge">{it.badge}</span>
              <img className="apc-thumb apc-thumb-lg" src={it.img} alt={it.title} />
              <span className="apc-gcard-title">{it.title}</span>
              <span className="apc-price"><i>¥</i>{it.price}<em>{t('appConsumer.common.priceFrom', { defaultValue: '起' })}</em></span>
            </button>
          ))}
        </div>
        <button type="button" className="apc-more-center">{t('appConsumer.common.viewMore', { defaultValue: '查看更多' })}</button>
      </section>

      {/* 紅包券 */}
      <div className="apc-coupons">
        {COUPONS.map((c) => (
          <button key={c.key} type="button" className="apc-coupon">
            <span className="apc-coupon-amt"><i>$</i>{c.amount}</span>
            <span className="apc-coupon-meta">
              <b>{c.cond}</b>
              <i>{c.exp}</i>
            </span>
            <span className="apc-coupon-use">{t('appConsumer.common.useNow', { defaultValue: '去使用' })}</span>
          </button>
        ))}
      </div>

      {/* 分類切換 */}
      <div className="apc-cats">
        {HOME_CHANNELS.map((c) => (
          <button key={c.key} type="button" className={cat === c.key ? 'is-on' : ''} onClick={() => setCat(c.key)}>{t(c.key, { defaultValue: c.zh })}</button>
        ))}
      </div>

      {/* 瀑布流商品 */}
      <div className="apc-feed">
        {FEED.map((it) => (
          <button key={it.key} type="button" className="apc-fcard" onClick={() => onOpenStore?.(it.merchantId)}>
            <span className="apc-fcard-img">
              <img className="apc-fcard-photo" src={it.img} alt={it.title} />
              {it.hot && <span className="apc-rim apc-rim-hot">🔥HOT</span>}
              {it.fresh && <span className="apc-rim apc-rim-new">{t('appConsumer.common.newStoreTag', { defaultValue: '新店' })}</span>}
            </span>
            <span className="apc-fcard-body">
              <span className="apc-fcard-meta">
                <em className="apc-chip-dark">{t('appConsumer.channel.deliveryShort', { defaultValue: it.channel })}</em>
                <i>{it.dist}</i><i>{it.time}</i>
              </span>
              <span className="apc-fcard-title">{it.title}</span>
              <span className="apc-fcard-rate"><b>{it.rating}</b> {t('appConsumer.home.feedTagWaiting', { defaultValue: '等送 · 可自取' })}</span>
              <span className="apc-fcard-tags">
                {it.promo.map((p) => <em key={p} className="apc-promo-tag">{p}</em>)}
              </span>
              <span className="apc-fcard-foot">
                <span className="apc-price apc-price-lg"><i>¥</i>{it.price}<em>{t('appConsumer.common.priceFrom', { defaultValue: '起' })}</em></span>
                <span className="apc-fcard-strike">¥{it.origin}</span>
                <span className="apc-fcard-off">{it.off}</span>
              </span>
            </span>
          </button>
        ))}
      </div>

      {/* 進入外賣頻道 */}
      <button type="button" className="apc-channel-btn" onClick={onOpenDelivery}>{t('appConsumer.home.enterDeliveryChannel', { defaultValue: '進入外賣頻道' })}</button>
      </div>
    </>
  )
}
