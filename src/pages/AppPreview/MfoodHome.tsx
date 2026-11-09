/**
 * MFOOD APP · 首页（按设计稿还原，纯前端静态原型）
 *
 * 布局自上而下：
 *  深色顶区 — 定位 → 搜索栏 → 推广标签 → 会员红包 Banner
 *  分类宫格 — 4 大分类 + 6 快捷入口
 *  促销横幅 — 團購秒殺助力社區消費
 *  劲爆秒殺 — 横滑商品（紫色背景 + 倒计时）
 *  分类切换(sticky) — 特價團購 / 美食外賣 / 超市百貨
 *  瀑布流商品卡
 *
 * 说明：MFOOD 为独立 APP 原型，通过 ?app=mfood 进入。
 */
import { useEffect, useRef, useState } from 'react'
import burgerImg from '@/assets/consumer-home/burger.jpg'
import riceballImg from '@/assets/consumer-home/riceball.jpg'
import fishPotImg from '@/assets/consumer-home/fishpot.jpg'
import lemonTeaImg from '@/assets/consumer-home/lemontea.jpg'
import GroupBuyFeedCard from './GroupBuyFeedCard'
import { FEED } from './MfoodGroupFeed'
import MfoodDeliveryStoreCard from './MfoodDeliveryStoreCard'
import MfoodDeliveryLargeCard from './MfoodDeliveryLargeCard'
import DeliveryGridCard from './DeliveryGridCard'
import { MFOOD_STORES } from './consumerMfoodFeed'

/* ─── 分类切换（特價團購 / 美食外賣 / 超市百貨）─── */
const TABS = [
  { key: 'group', zh: '特價團購', sub: '限時1折起', emoji: '🔥' },
  { key: 'delivery', zh: '美食外賣', sub: '你嘅為食神探', emoji: '🍜' },
  { key: 'market', zh: '超市百貨', sub: '超市筍價1折起', emoji: '🛒' },
]

/* ─── 4 大分类 ─── */
const CATEGORIES = [
  { key: 'delivery', zh: '美食外賣', emoji: '🛵', badge: '24h配送', badgeColor: '#FF6B35' },
  { key: 'market', zh: '超市百貨', emoji: '🛒', badge: '', badgeColor: '' },
  { key: 'group', zh: '特價團購', emoji: '🏷️', badge: '', badgeColor: '' },
  { key: 'hktvmall', zh: 'HKTVMall', emoji: '🛍️', badge: '', badgeColor: '' },
]

/* ─── 6 快捷入口 ─── */
const QUICK_ENTRIES = [
  { key: 'signin', zh: '每日簽到', emoji: '✅', badge: '領積分', badgeColor: '#FF6B35' },
  { key: 'member', zh: '會員中心', emoji: '👑', badge: '', badgeColor: '' },
  { key: 'buffet', zh: '自助餐', emoji: '🍽️', badge: '', badgeColor: '' },
  { key: 'hotpot', zh: '火鍋節', emoji: '♨️', badge: '減$20', badgeColor: '#E53935' },
  { key: 'premium', zh: '大牌臻享', emoji: '🏆', badge: '', badgeColor: '' },
  { key: 'travel', zh: '旅遊', emoji: '✈️', badge: '', badgeColor: '' },
]

/* ─── 劲爆秒殺商品 ─── */
const FLASH_ITEMS = [
  { key: 'f1', brand: '悅之茶', title: '冰爽續命🧊夏日飲...', discount: '3.8折', save: '即慳24.2', price: '14.8', img: lemonTeaImg },
  { key: 'f2', brand: 'Shell油站', title: '【Shell GO+...', discount: '7.5折', save: '即慳25', price: '75', img: fishPotImg },
  { key: 'f3', brand: '來來超級市場', title: '【連環賞推...', discount: '9.70折', save: '即慳2', price: '53', img: riceballImg },
  { key: 'f4', brand: '翡翠茶餐廳', title: '【9店通用】40...', discount: '8.5折', save: '即慳6', price: '34', img: burgerImg },
]

/* ─── 瀑布流团购券：数据唯一真源在 ./MfoodGroupFeed（首页与特惠團購页共用） ─── */

/* ─── 瀑布流数据：外賣門店（MFOOD_STORES）抽至 consumerMfoodFeed.ts（首页/频道页/搜索结果页共用）；
   团购券 FEED 唯一真源在 ./MfoodGroupFeed ─── */

export default function MfoodHome({
  onSearch,
  onOpenStore,
  onOpenGroupBuy,
  onOpenDelivery,
  onCategoryChange,
  syncCategory,
  syncSeq,
  deliveryMode,
  initialTab,
}: {
  onSearch?: () => void
  onOpenStore?: (merchantId: string) => void
  /** 分类宫格「特價團購」入口 → 特惠團購页（MfoodApp 根屏切换） */
  onOpenGroupBuy?: () => void
  /** 分类宫格「美食外賣」入口 → 美食外賣频道页（MfoodApp 根屏切换，图1 入口①） */
  onOpenDelivery?: () => void
  /** 分类切换回调（双机视图联动右侧说明面板：美食外賣 → 外卖说明，其余 → 团购说明） */
  onCategoryChange?: (tab: string) => void
  /** 右侧说明面板 Tab 下发的分类同步命令（syncSeq 自增时执行，壳内自身切换不回流） */
  syncCategory?: string
  syncSeq?: number
  /** 外卖瀑布流展示模式（说明面板切换器下发；两台手机同步；large=大图模式 MFOOD 亦实现，样式与閃蜂一致） */
  deliveryMode?: 'list' | 'card' | 'large'
  /** 初始分类（底部 Tab「外卖」进入时定位到美食外賣） */
  initialTab?: string
}) {
  const bodyRef = useRef<HTMLDivElement>(null)
  /* 分类初值优先级：面板同步命令 > 底部 Tab 入口 > 默认特價團購；
     壳为条件挂载（从团购页/频道页被面板命令拉回首页时会重新挂载），错过 syncSeq 变化时靠初值补上（同 ConsumerGroupBuy 初值口径） */
  const [tab, setTab] = useState<string>(() => (
    syncCategory && TABS.some((tb) => tb.key === syncCategory)
      ? syncCategory
      : (initialTab ?? TABS[0].key)
  ))
  const [scrolled, setScrolled] = useState(false)

  /* 右侧说明面板 Tab 下发的同步命令：只在 syncSeq 变化时执行，避免壳内自身切换被面板回流覆盖；
     優選商家等 MFOOD 不存在的面板命令忽略，保持当前分类 */
  const syncSeqRef = useRef(syncSeq ?? 0)
  useEffect(() => {
    if ((syncSeq ?? 0) !== syncSeqRef.current && syncCategory) {
      syncSeqRef.current = syncSeq ?? 0
      if (TABS.some((tb) => tb.key === syncCategory)) setTab(syncCategory)
    }
  }, [syncSeq, syncCategory])

  const handleScroll = () => {
    const el = bodyRef.current
    if (!el) return
    const next = el.scrollTop > 36
    setScrolled((prev) => (prev === next ? prev : next))
  }

  return (
    <>
      {/* 吸顶搜索栏（滚动后显示） */}
      <div className={`apm-sticky-header${scrolled ? ' is-visible' : ''}`}>
        <div className="apm-sticky-row">
          <span className="apm-sticky-loc">📍 暨南大學(... ▼</span>
          <button type="button" className="apm-sticky-search" onClick={onSearch}>
            <span className="apm-sticky-search-ico">🔍</span>
            <span className="apm-sticky-search-ph">{'搜尋店名或菜品'}</span>
            <span className="apm-sticky-search-btn">搜索</span>
          </button>
        </div>
      </div>

      {/* 滚动容器 */}
      <div className="ap-body apm-home-body" ref={bodyRef} onScroll={handleScroll}>

        {/* ═══ 橙色顶区 ═══ */}
        <div className="apm-dark-top">
          {/* 定位（图2：图钉图标 + 白色粗体 + 下拉箭头） */}
          <div className="apm-loc-row">
            <button type="button" className="apm-loc-btn">
              <svg className="apm-loc-pin" width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z" fill="#fff" />
                <circle cx="12" cy="9" r="2.6" fill="#FF6B35" />
              </svg>
              <span className="apm-loc-text">暨南大學(珠海校區)</span>
              <span className="apm-loc-arrow">▼</span>
            </button>
          </div>

          {/* 搜索栏 */}
          <button type="button" className="apm-search-bar" onClick={onSearch}>
            <span className="apm-search-ico">🔍</span>
            <span className="apm-search-ph">{'搜尋店名或菜品'}</span>
            <span className="apm-search-btn">搜索</span>
          </button>

          {/* 推广标签 */}
          <div className="apm-tags-row">
            <span className="apm-tag apm-tag-dark">遊泰號|招牌船麵</span>
            <span className="apm-tag apm-tag-green">食得健康餐廳</span>
          </div>

          {/* Banner（图2：WOW 气泡置顶 + 车手左 + 加入按钮中 + 踏板车右） */}
          <div className="apm-banner">
            <div className="apm-banner-wow">WOW</div>
            <div className="apm-banner-header">
              <span className="apm-banner-title">mFood招車手啦!</span>
              <span className="apm-banner-sub">JOIN US</span>
            </div>
            <div className="apm-banner-body">
              <span className="apm-banner-rider" aria-hidden="true">👷</span>
              <button type="button" className="apm-banner-join">點擊加入我們</button>
              <span className="apm-banner-scooter" aria-hidden="true">🛵</span>
            </div>
            <div className="apm-banner-dots">
              <i className="is-on" /><i /><i /><i />
            </div>
          </div>
        </div>

        {/* ═══ 分类宫格 ═══ */}
        <div className="apm-cat-section">
          <div className="apm-cat-grid">
            {CATEGORIES.map((c) => (
              <button key={c.key} type="button" className="apm-cat-item" onClick={c.key === 'group' ? onOpenGroupBuy : c.key === 'delivery' ? onOpenDelivery : undefined}>
                {c.badge && <span className="apm-cat-badge" style={{ background: c.badgeColor }}>{c.badge}</span>}
                <span className="apm-cat-emoji">{c.emoji}</span>
                <span className="apm-cat-label">{c.zh}</span>
              </button>
            ))}
          </div>
          <div className="apm-quick-grid">
            {QUICK_ENTRIES.map((q) => (
              <button key={q.key} type="button" className="apm-quick-item">
                {q.badge && <span className="apm-quick-badge" style={{ background: q.badgeColor }}>{q.badge}</span>}
                <span className="apm-quick-emoji">{q.emoji}</span>
                <span className="apm-quick-label">{q.zh}</span>
              </button>
            ))}
          </div>
        </div>

        {/* ═══ 促销横幅 ═══ */}
        <div className="apm-promo-banner">
          <div className="apm-promo-text">
            <span className="apm-promo-title">團購秒殺 助力社區消費</span>
            <span className="apm-promo-sub">週五0點 限時開搶</span>
          </div>
          <button type="button" className="apm-promo-btn">搶購</button>
        </div>

        {/* ═══ 劲爆秒殺 ═══ */}
        <section className="apm-flash-section">
          <header className="apm-flash-header">
            <span className="apm-flash-title">勁爆秒殺</span>
            <span className="apm-flash-countdown">
              <b>1</b>天 <b>13</b>:<b>06</b>:<b>09</b> 後結束
            </span>
            <button type="button" className="apm-flash-more">立即搶購 ›</button>
          </header>
          <div className="apm-flash-scroll">
            {FLASH_ITEMS.map((it) => (
              <button key={it.key} type="button" className="apm-flash-card" onClick={() => onOpenStore?.(it.key)}>
                <img className="apm-flash-img" src={it.img} alt={it.title} />
                <span className="apm-flash-brand">{it.brand}</span>
                <span className="apm-flash-name">{it.title}</span>
                <span className="apm-flash-meta">{it.discount} | {it.save}</span>
                <div className="apm-flash-price-row">
                  <span className="apm-flash-label">秒殺價</span>
                  <span className="apm-flash-price">${it.price}</span>
                </div>
              </button>
            ))}
          </div>
        </section>

        {/* ═══ 分类切换（sticky） ═══ */}
        <div className="apm-sticky-tabs">
          {TABS.map((tb) => (
            <button
              key={tb.key}
              type="button"
              className={`apm-tab${tab === tb.key ? ' is-on' : ''}`}
              onClick={() => { setTab(tb.key); onCategoryChange?.(tb.key) }}
            >
              <span className="apm-tab-title">{tb.zh}</span>
              <span className="apm-tab-sub">{tb.emoji} {tb.sub}</span>
            </button>
          ))}
        </div>

        {/* 分類對應瀑布流：特價團購/超市百貨 → 團購券卡；美食外賣 → 門店卡（小圖/卡片/大圖三模式，MFOOD 专属组件） */}
        <div className="apf-feed-list">
          {tab === 'delivery'
            ? deliveryMode === 'large'
              ? MFOOD_STORES.map((store) => (
                  <MfoodDeliveryLargeCard key={store.key} store={store} onOpenStore={onOpenStore} />
                ))
              : deliveryMode === 'card'
              ? (
                  <div className="apw-grid">
                    {MFOOD_STORES.map((store) => (
                      <DeliveryGridCard key={store.key} brand="mfood" store={store} onOpenStore={onOpenStore} />
                    ))}
                  </div>
                )
              : MFOOD_STORES.map((store) => (
              <MfoodDeliveryStoreCard key={store.key} store={store} onOpenStore={onOpenStore} />
            ))
            : FEED.map((it) => (
              <GroupBuyFeedCard key={it.key} item={it} theme="purple" onOpenStore={onOpenStore} />
            ))}
        </div>

      </div>
    </>
  )
}
