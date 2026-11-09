/**
 * Copyright (c) 2026 fengsong7889. All Rights Reserved.
 *
 * 本文件为「MFTB 企业一体化管理平台软件」的组成部分。
 * 未经著作权人书面许可，不得使用、复制、修改、再分发或用于任何商业目的。
 * 完整许可条款见仓库根目录 LICENSE 文件。
 */

/**
 * MFOOD APP · 美食外賣频道页（按设计稿图1-4 还原，纯前端静态原型）
 *
 * 入口（图1 口径，MfoodApp 根屏切换）：
 *   ① 首页分类宫格「美食外賣」按钮（24h配送）；
 *   ② 底部 Tab「外賣」。
 *
 * 结构自上而下（图1→图4）：
 *   橙色头部（定位 + 搜索框；滚动后切白底吸顶，图2）→ 活动胶囊行 →
 *   Banner 轮播（横滑 peek + 指示条）→ mFood·外賣 分类宫格（每页 2 排 × 5 列，横滑 + 页点）→
 *   星選一口價红卡（4 列商品横滑）→ 優選下午茶绿容器（2 列 × 3 行 + 換一換）→
 *   新人紅包横滑卡 → 排序行 + 快捷筛选胶囊 → 商家瀑布流。
 *
 * 瀑布流不另设计：直接复用首页【美食外卖】的 MFOOD_STORES + MfoodDeliveryStoreCard；
 * 展示模式（小图/大图）由说明面板切换器下发（deliveryPageMode → layout），大图复用
 * MfoodDeliveryLargeCard，样式与閃蜂·外卖瀑布流大图模式一致。
 * 取色走语义令牌（apg-root 局部令牌集 + theme.css 全局令牌），零新增裸色值。
 */
import { useEffect, useRef, useState } from 'react'
import burgerImg from '@/assets/consumer-home/burger.jpg'
import riceballImg from '@/assets/consumer-home/riceball.jpg'
import friedChickenImg from '@/assets/consumer-home/friedchicken.jpg'
import fishPotImg from '@/assets/consumer-home/fishpot.jpg'
import lemonTeaImg from '@/assets/consumer-home/lemontea.jpg'
import bbqImg from '@/assets/consumer-home/bbq.jpg'
import { MFOOD_STORES } from './MfoodHome'
import MfoodDeliveryStoreCard from './MfoodDeliveryStoreCard'
import MfoodDeliveryLargeCard from './MfoodDeliveryLargeCard'

/** 定位（图1；占位） */
const LOCATION = '澳門理工大學'
/** 搜索框占位词（图1；不进语言包） */
const KEYWORD = '搜尋店名或菜品'

/** 头部活动胶囊行（图1） */
const PROMO_TAGS = [
  { key: 'p1', text: '🛵配送費低至 0 蚊🛵', tone: 'gold' },
  { key: 'p2', text: '麥當勞', tone: 'red' },
  { key: 'p3', text: '食得健康餐廳', tone: 'green' },
]

/** 分类入口单项：img=美食图片项；round+tone=圆形品牌 logo 项（badge=右上角小角标） */
type CatItem = { label: string; img?: string; round?: string; tone?: 'red' | 'gold' | 'green' | 'dark'; badge?: string }

/** 分类宫格（图1：每页 2 排 × 5 列，横滑 + 页点；第二页为占位分类） */
const CAT_PAGES: CatItem[][] = [
  [
    { label: '米粉麵線', img: riceballImg },
    { label: '飲品糖水', img: lemonTeaImg },
    { label: '全球美食', img: fishPotImg },
    { label: '地方菜系', img: riceballImg },
    { label: '美味小食', img: burgerImg },
    { label: '麥當勞', round: 'M', tone: 'red' },
    { label: 'DONDONKI', round: 'DD', tone: 'gold' },
    { label: 'HKTVmall', round: 'HK', tone: 'green', badge: '免運費' },
    { label: '大賽車-新口岸專區', round: '賽', tone: 'dark', badge: '減$20' },
    { label: '食得健康', round: '健', tone: 'green', badge: '天天減$5' },
  ],
  [
    { label: '燒臘飯麵', img: bbqImg },
    { label: '火鍋雞煲', img: fishPotImg },
    { label: '壽司刺身', img: riceballImg },
    { label: '東南亞菜', img: lemonTeaImg },
    { label: '麵食餃子', img: friedChickenImg },
    { label: '水果鮮果', round: '果', tone: 'green' },
    { label: '零食百貨', round: '零', tone: 'gold' },
    { label: '咖啡奶茶', round: '啡', tone: 'red' },
    { label: '深夜食堂', round: '夜', tone: 'dark' },
    { label: '新店嚐鮮', round: '新', tone: 'green', badge: '新店' },
  ],
]

/** 星選一口價商品（图1/图2：4 列横滑；占位数据） */
const STAR_ITEMS = [
  { key: 'st1', name: '美式咖啡', img: lemonTeaImg, price: '32.9' },
  { key: 'st2', name: '極少冰貓檸', img: lemonTeaImg, price: '43.9' },
  { key: 'st3', name: '招牌餐肉滑蛋', img: burgerImg, price: '32.1' },
  { key: 'st4', name: '星選：撈麵套餐', img: riceballImg, price: '32.1' },
]

/** 優選下午茶门店卡（图2/图3：2 列 × 3 行；占位数据，券标签 tone=green/red 底色胶囊、plain 红字） */
const TEA_ITEMS = [
  { key: 't1', name: '肥珊茶餐廳', img: burgerImg, tags: [{ text: '4.9折起', tone: 'plain' }, { text: '80減2', tone: 'plain' }] },
  { key: 't2', name: '愛靚湯愛湯料 🤩 29.9 特…', img: fishPotImg, tags: [{ text: '新客券 $10', tone: 'green' }, { text: '領券 $10 | 8 | 5', tone: 'red' }] },
  { key: 't3', name: '丼先生 (日式丼飯專門店）', img: riceballImg, tags: [{ text: '新客券 $4', tone: 'green' }, { text: '領券 $8', tone: 'red' }] },
  { key: 't4', name: '新康記咖啡美食 (皇朝店)', img: friedChickenImg, tags: [{ text: '新客券 $6', tone: 'green' }, { text: '領券 $10 | 5 | 4', tone: 'red' }] },
  { key: 't5', name: '向廚', img: lemonTeaImg, tags: [{ text: '4.8折', tone: 'plain' }, { text: '食得健康', tone: 'green' }] },
  { key: 't6', name: '江浙滬菜館（本幫菜 No.1…', img: bbqImg, tags: [{ text: '新客券 $15 | 8 | 1', tone: 'green' }, { text: '5折起', tone: 'plain' }] },
]

/** 新人紅包横滑卡（图3/图4） */
const REDBAGS = [
  { key: 'r1', amount: '40', cond: '滿 488 可用' },
  { key: 'r2', amount: '6', cond: '滿 88 可用' },
  { key: 'r3', amount: '20', cond: '滿 188 可用' },
]

/** 快捷筛选胶囊（图4） */
const QUICK_FILTERS = [
  { key: 'q1', icon: '🎫', text: '满488減40', tone: 'red' },
  { key: 'q2', icon: '🔥', text: '勁爆券', tone: 'orange' },
  { key: 'q3', icon: '', text: '減免運費', tone: '' },
  { key: 'q4', icon: '', text: 'mFood送', tone: '' },
]

export default function MfoodDelivery({ onSearch, onOpenStore, layout }: {
  onSearch?: () => void
  onOpenStore?: (merchantId: string) => void
  /** 瀑布流展示模式（说明面板「展示模式」切换器下发）：small=小图（一行一店）/ large=大图（顶部大图封面，复用 MfoodDeliveryLargeCard） */
  layout?: 'small' | 'large'
}) {
  const bodyRef = useRef<HTMLDivElement>(null)
  const bannerRef = useRef<HTMLDivElement>(null)
  const bannerMainRef = useRef<HTMLDivElement>(null)
  /** 滚动过阈值：橙头部切白底吸顶态（图2 顶部） */
  const [scrolled, setScrolled] = useState(false)

  /* 挂载后把主 Banner 居中：两侧各露出相邻 Banner 的边缘（图1 口径）；不居中会让侧位占位卡占满首屏。
     用 rect 差值而非 offsetLeft：主卡 position:relative 会使 offsetParent 跳过滚动容器，算出偏差 */
  useEffect(() => {
    const wrap = bannerRef.current
    const main = bannerMainRef.current
    if (!wrap || !main) return
    const delta = main.getBoundingClientRect().left - wrap.getBoundingClientRect().left
    wrap.scrollLeft += delta - (wrap.clientWidth - main.getBoundingClientRect().width) / 2
  }, [])

  const handleScroll = () => {
    const el = bodyRef.current
    if (!el) return
    const next = el.scrollTop > 36
    setScrolled((prev) => (prev === next ? prev : next))
  }

  return (
    <div className="apg-root apmf-root">
      {/* 吸顶头部：橙渐变（未滚动）→ 白底（滚动后，图2）；Tab 根屏无返回键 */}
      <div className={`apmf-head${scrolled ? ' is-scrolled' : ''}`}>
        <div className="apmf-head-row">
          <button type="button" className="apmf-loc">
            <svg className="apmf-loc-pin" width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z" fill="currentColor" />
              <circle cx="12" cy="9" r="2.6" fill="var(--apg-head-to, var(--brand))" />
            </svg>
            <span className="apmf-loc-text">{LOCATION}</span>
            <span className="apmf-loc-arrow" aria-hidden="true">›</span>
          </button>
          <button type="button" className="apmf-search" onClick={onSearch}>
            <span className="apmf-search-ph">{KEYWORD}</span>
            <span className="apmf-search-btn" aria-hidden="true">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2.4" />
                <path d="M16.5 16.5 21 21" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
              </svg>
            </span>
          </button>
        </div>
        {/* 活动胶囊行：滚动后隐藏（图2 顶部仅剩定位+搜索） */}
        <div className="apmf-tags-row">
          {PROMO_TAGS.map((t) => (
            <span key={t.key} className={`apmf-tag apmf-tag--${t.tone}`}>{t.text}</span>
          ))}
        </div>
      </div>

      <div className="ap-body apmf-body" ref={bodyRef} onScroll={handleScroll}>
        {/* Banner 轮播：主卡居中、两侧露相邻边缘（图1 口径）；CSS 拼贴占位，待切图 */}
        <div ref={bannerRef} className="apmf-banner-scroll">
          <div className="apmf-banner apmf-banner--side">
            <span className="apmf-banner-side-name">品牌專場</span>
          </div>
          <div ref={bannerMainRef} className="apmf-banner apmf-banner--main">
            <span className="apmf-banner-copy">
              <span className="apmf-banner-brand">SOO'S KITCHEN · 亞蘇廚房</span>
              <span className="apmf-banner-title">亞蘇廚房 勁優惠！</span>
              <span className="apmf-banner-strong">全線門店免配送費!</span>
              <span className="apmf-banner-sub">必食放餸套餐</span>
            </span>
            <span className="apmf-banner-visual" aria-hidden="true">🍜</span>
            <span className="apmf-banner-badge">期間限定</span>
          </div>
          <div className="apmf-banner apmf-banner--side apmf-banner--right">
            <span className="apmf-banner-side-name">茶飲專場</span>
          </div>
        </div>
        <div className="apmf-banner-dots"><i className="is-on" /><i /><i /><i /><i /><i /></div>

        {/* mFood·外賣 分类宫格（每页 2 排 × 5 列，横滑 + 页点） */}
        <div className="apmf-cats-wrap">
          <div className="apmf-cats-head">
            <span className="apmf-cats-brand"><i>mFood</i>·外賣</span>
            <button type="button" className="apmf-cats-all">全部分類 ›</button>
          </div>
          <div className="apmf-cats">
            {CAT_PAGES.map((page, pi) => (
              <div key={pi} className="apmf-cats-page">
                {page.map((c) => (
                  <div key={c.label} className="apmf-cat">
                    <span className="apmf-cat-ico">
                      {c.img
                        ? <img className="apmf-cat-img" src={c.img} alt="" />
                        : (
                            <span className={`apmf-cat-round apmf-cat-round--${c.tone}`}>
                              {c.badge && <span className="apmf-cat-badge">{c.badge}</span>}
                              {c.round}
                            </span>
                          )}
                    </span>
                    <span className="apmf-cat-label">{c.label}</span>
                  </div>
                ))}
              </div>
            ))}
          </div>
          <div className="apmf-dots">{CAT_PAGES.map((_, i) => <i key={i} className={i === 0 ? 'is-on' : undefined} />)}</div>
        </div>

        {/* 星選一口價（红卡 + 4 列商品横滑） */}
        <section className="apmf-star">
          <header className="apmf-star-head">
            <span className="apmf-star-title">星選⭐一口價</span>
            <span className="apmf-star-tag">真0元起送 全免配送費</span>
            <button type="button" className="apmf-star-more">更多 ›</button>
          </header>
          <div className="apmf-star-scroll">
            {STAR_ITEMS.map((it) => (
              <button key={it.key} type="button" className="apmf-star-item" onClick={() => onOpenStore?.(it.key)}>
                <img className="apmf-star-img" src={it.img} alt={it.name} />
                <span className="apmf-star-name">{it.name}</span>
                <span className="apmf-star-price"><i>${it.price}</i><em>一口價</em></span>
              </button>
            ))}
          </div>
        </section>

        {/* 優選下午茶（浅绿容器：2 列 × 3 行 + 換一換） */}
        <section className="apmf-tea">
          <header className="apmf-tea-head">
            <span className="apmf-tea-ico" aria-hidden="true">🥤</span>
            <span className="apmf-tea-title">優選下午茶</span>
            <button type="button" className="apmf-tea-more">更多 ›</button>
          </header>
          <div className="apmf-tea-grid">
            {TEA_ITEMS.map((it) => (
              <button key={it.key} type="button" className="apmf-tea-card" onClick={() => onOpenStore?.(it.key)}>
                <img className="apmf-tea-img" src={it.img} alt={it.name} />
                <span className="apmf-tea-name">{it.name}</span>
                <span className="apmf-tea-tags">
                  {it.tags.map((t, i) => <i key={i} className={`apmf-tea-tag apmf-tea-tag--${t.tone}`}>{t.text}</i>)}
                </span>
              </button>
            ))}
          </div>
          <button type="button" className="apmf-tea-refresh">🔄 換一換</button>
        </section>

        {/* 新人紅包横滑卡 */}
        <div className="apmf-redbag-scroll">
          {REDBAGS.map((r) => (
            <div key={r.key} className="apmf-redbag">
              <span className="apmf-redbag-left">
                <b className="apmf-redbag-amount"><i>$</i>{r.amount}</b>
                <i className="apmf-redbag-cond">{r.cond}</i>
              </span>
              <span className="apmf-redbag-info">
                <b>新人紅包</b>
                <i>今日過期</i>
                <button type="button" className="apmf-redbag-btn">去使用</button>
              </span>
            </div>
          ))}
        </div>

        {/* 排序行 + 快捷筛选胶囊（图4） */}
        <div className="apmf-sort-row">
          <button type="button" className="apmf-sort is-on">綜合排序</button>
          <button type="button" className="apmf-sort">距離</button>
          <button type="button" className="apmf-sort-filter">篩選 ▾</button>
        </div>
        <div className="apmf-quick-chips">
          {QUICK_FILTERS.map((q) => (
            <button key={q.key} type="button" className={`apmf-quick-chip${q.tone ? ` is-${q.tone}` : ''}`}>
              {q.icon && <span aria-hidden="true">{q.icon}</span>}
              {q.text}
            </button>
          ))}
        </div>

        {/* 商家瀑布流：直接复用首页【美食外卖】的 MFOOD_STORES；小图/大图双模式（大图复用 MfoodDeliveryLargeCard） */}
        <div className="apf-feed-list apmf-feed">
          {MFOOD_STORES.map((store) => (
            layout === 'large'
              ? <MfoodDeliveryLargeCard key={store.key} store={store} onOpenStore={onOpenStore} />
              : <MfoodDeliveryStoreCard key={store.key} store={store} onOpenStore={onOpenStore} />
          ))}
        </div>
      </div>
    </div>
  )
}
