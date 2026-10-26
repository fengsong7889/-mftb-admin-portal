/**
 * 用户端 APP · 美食外賣页（按设计稿还原，纯前端静态原型）
 *
 * 入口：首页「美食外賣」大模块点击进入（见 ConsumerHome 的 onOpenDelivery）。
 * 结构：头部(返回+定位) → 搜索 → 日料 Hero → 十宫格分类 → 促销位 → 红包券 →
 *       权益胶囊 → 服务标签 → 商家/商品瀑布流（多种卡片形态）→ 到底提示 → 本页自带的 5 Tab 底栏。
 *
 * 说明：图片为 AI 占位图（src/assets/consumer-home/），文案暂硬编码繁中，待切图与 i18n 接入后替换。
 */
import { useRef, useState, type KeyboardEvent } from 'react'
import groupbuyHeroImg from '../../assets/consumer-home/groupbuy-hero.jpg'
import bbqImg from '../../assets/consumer-home/bbq.jpg'
import riceballImg from '../../assets/consumer-home/riceball.jpg'
import friedChickenImg from '../../assets/consumer-home/friedchicken.jpg'
import fishPotImg from '../../assets/consumer-home/fishpot.jpg'
import burgerImg from '../../assets/consumer-home/burger.jpg'
import lemonTeaImg from '../../assets/consumer-home/lemontea.jpg'

const CATS = [
  { key: 'burger', label: '漢堡炸雞', img: burgerImg },
  { key: 'breakfast', label: '醒神早餐', img: riceballImg },
  { key: 'global', label: '全球美食', img: fishPotImg },
  { key: 'drink', label: '飲品糖水', img: lemonTeaImg },
  { key: 'snack', label: '美味小食', img: friedChickenImg },
  { key: 'mcd', label: '麥當勞', emoji: '🍟', bg: '#FFE9E9' },
  { key: 'lion', label: '獅會中心', emoji: '🦁', bg: '#FFF4E0' },
  { key: 'flash', label: '外賣快閃', emoji: '⚡', bg: '#E6F7FF' },
  { key: 'must', label: '必食好店', emoji: '⭐', bg: '#FFF7E6' },
  { key: 'more', label: '更多分類', emoji: '⋯', bg: '#F5F5F5' },
]

const BENEFITS = ['神會員', '蜂蜜提現', '口碑好', '商家助力', '新品']
const SERVICES = ['領券', '免配送', '免运費', '30分鐘', '可自取']

/** 商家/商品卡：rail=左侧人气商家侧栏；products=商品缩略图；status=状态角标 */
interface FeedCard {
  key: string
  /** 对应搜索目录里的商家 id，整卡点击进店（店内提供店內搜尋） */
  merchantId: string
  rail?: boolean
  name: string
  rating: string
  sold: string
  speed?: string
  meta: string
  rank?: string
  coupons: string[]
  products: { key: string; img: string; price: string; origin: string; grab?: boolean }[]
  status?: { text: string; tone: 'new' | 'busy' | 'closed' | 'book' }
  note?: string
}
const FEED: FeedCard[] = [
  {
    key: 'd1', merchantId: 'd-lemon', rail: true, name: '招牌暴打檸檬茶', rating: '4.5', sold: '月售 1196', speed: '速送',
    meta: '0配送費 · 30分鐘 · 2.5km', rank: '全澳西餐銷量第1名 · 私享好店',
    coupons: ['神會員 最高膨至$50', '125減50', '80減20'],
    products: [
      { key: 'p1', img: friedChickenImg, price: '$9.9起', origin: '$29.9' },
      { key: 'p2', img: burgerImg, price: '$9.9起', origin: '$29.9' },
      { key: 'p3', img: riceballImg, price: '$9.9起', origin: '$29.9' },
    ],
  },
  {
    key: 'd2', merchantId: 'd-lemon', name: '招牌暴打檸檬茶', rating: '4.5', sold: '月售 1196', speed: '速送',
    meta: '0配送費 · 30分鐘 · 2.5km',
    coupons: ['神會員 最高膨至$50', '80減20'],
    products: [{ key: 'p1', img: bbqImg, price: '$7.05起', origin: '$9.9', grab: true }],
  },
  {
    key: 'd3', merchantId: 'd-mcd', name: '麥當勞（威尼斯人店）', rating: '4.5', sold: '月售 1196', speed: '速送',
    meta: '0配送費 · 30分鐘 · 2.5km',
    coupons: ['神會員 最高膨至$50', '125減50', '80減20'],
    products: [
      { key: 'p1', img: burgerImg, price: '$9.9起', origin: '$29.9' },
      { key: 'p2', img: friedChickenImg, price: '$9.9起', origin: '$29.9' },
      { key: 'p3', img: lemonTeaImg, price: '$9.9起', origin: '$29.9' },
    ],
    status: { text: '新店', tone: 'new' },
  },
  {
    key: 'd4', merchantId: 'd-lemon', rail: true, name: '招牌暴打檸檬茶', rating: '4.5', sold: '月售 1196', speed: '速送',
    meta: '0配送費 · 30分鐘 · 2.5km', rank: '全澳西餐銷量第1名 · 私享好店',
    coupons: ['神會員 最高膨至$50', '125減50', '80減20'],
    products: [
      { key: 'p1', img: fishPotImg, price: '$9.9起', origin: '$29.9' },
      { key: 'p2', img: riceballImg, price: '$9.9起', origin: '$29.9' },
      { key: 'p3', img: bbqImg, price: '$9.9起', origin: '$29.9' },
    ],
  },
  {
    key: 'd5', merchantId: 'd-lemon', name: '招牌暴打檸檬茶', rating: '4.5', sold: '月售 1196', speed: '速送',
    meta: '配沒$12 · 30分鐘 · 2.5km', rank: '爆單暫停接單',
    coupons: ['神會員 最高膨至$50', '125減50', '80減20'],
    products: [{ key: 'p1', img: lemonTeaImg, price: '$9.9起', origin: '$29.9', grab: true }],
    status: { text: '爆單暫停接單', tone: 'busy' },
  },
  {
    key: 'd6', merchantId: 'd-organic', name: 'Organic Garden', rating: '4.5', sold: '月售 1196', speed: '速送',
    meta: '0配送費 · 30分鐘 · 2.5km',
    coupons: ['神會員 最高膨至$50', '125減50', '80減20'],
    products: [
      { key: 'p1', img: riceballImg, price: '$9.9起', origin: '$29.9' },
      { key: 'p2', img: lemonTeaImg, price: '$9.9起', origin: '$29.9' },
    ],
    status: { text: '休息中', tone: 'closed' },
    note: '「親愛的用戶，商家目前已休息，可預約明日配送」',
  },
  {
    key: 'd7', merchantId: 'd-lemon', name: '招牌暴打檸檬茶', rating: '4.5', sold: '月售 1196', speed: '速送',
    meta: '0配送費 · 30分鐘 · 2.5km', rank: '威記斯新門口店',
    coupons: ['神會員 最高膨至$50', '125減50', '80減20'],
    products: [],
    status: { text: '搶購明日限定', tone: 'book' },
    note: '餘量僅剩 3 件，先到先得',
  },
]

const BOTTOM_TABS = [
  { key: 'food', icon: '🍜', label: '外賣' },
  { key: 'cart', icon: '🛒', label: '購物車', badge: 1 },
  { key: 'review', icon: '👍', label: '好評' },
  { key: 'order', icon: '📋', label: '訂單' },
  { key: 'more', icon: '⋯', label: '更多' },
]

const HOT_WORDS = ['小龍蝦', '珍珠奶茶', '叉燒', '海南雞飯', '螺螄粉', '漢堡', '甜點', '火鍋']

export default function ConsumerDelivery({
  onBack,
  onSearch,
  onOpenStore,
}: {
  onBack: () => void
  onSearch: (keyword?: string) => void
  onOpenStore?: (merchantId: string) => void
}) {
  const bodyRef = useRef<HTMLDivElement>(null)
  const [scrolled, setScrolled] = useState(false)

  /** 内容区上滑过阈值后折叠标题行与热搜词行，仅保留搜索行吸顶（对齐参考图） */
  const handleScroll = () => {
    const el = bodyRef.current
    if (!el) return
    const next = el.scrollTop > 36
    setScrolled((prev) => (prev === next ? prev : next))
  }

  /** 键盘可达：原型里整卡是进店入口，Enter/Space 与点击等价 */
  const handleCardKey = (event: KeyboardEvent<HTMLDivElement>, merchantId: string) => {
    if (!onOpenStore) return
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      onOpenStore(merchantId)
    }
  }

  return (
    <>
      {/* 顶部：可折叠吸顶头（滚动后仅保留搜索行，标题与热搜词行收起） */}
      <div className={`apd-header${scrolled ? ' is-scrolled' : ''}`}>
        <div className="apd-header-top">
          <button type="button" className="apg-back" onClick={onBack} aria-label="返回">‹</button>
          <span className="apg-title">美食外賣</span>
          <span className="apg-loc"><span aria-hidden="true">📍</span>威尼斯人A座 <i aria-hidden="true">›</i></span>
        </div>

        <div className="apd-header-search">
          {scrolled && (
            <button type="button" className="apg-back apd-back-inline" onClick={onBack} aria-label="返回">‹</button>
          )}
          <button type="button" className="apd-searchrow" onClick={() => onSearch()}>
            <span className="apc-search-ico" aria-hidden="true">🔍</span>
            <span className="apg-hot">太二酸菜鱼</span>
            <span className="apd-search-btn">搜索</span>
          </button>
          {scrolled && (
            <span className="apd-header-loc"><span aria-hidden="true">📍</span><i>威尼斯人A座</i></span>
          )}
        </div>

        <div className="apd-header-chips">
          {HOT_WORDS.map((w) => (
            <button key={w} type="button" className="apd-hot-chip" onClick={() => onSearch(w)}>{w}</button>
          ))}
        </div>
      </div>

      <div className="ap-body apg-body" ref={bodyRef} onScroll={handleScroll}>

        {/* Hero */}
        <div
          className="apg-hero"
          style={{ background: `linear-gradient(90deg, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0.1) 60%, rgba(0,0,0,0) 100%), url(${groupbuyHeroImg}) center/cover no-repeat` }}
        >
          <span className="apg-hero-badge">最強澳門日料Top.1</span>
          <span className="apg-hero-title"><i>$</i>90<em>代</em><i>$</i>100</span>
          <span className="apg-hero-sub">單次可用5張</span>
        </div>

        {/* 十宮格分類 */}
        <div className="apg-cats">
          {CATS.map((c) => (
            <button key={c.key} type="button" className="apg-cat">
              {c.img
                ? <img className="apg-cat-img" src={c.img} alt="" />
                : <span className="apg-cat-emoji" style={{ background: c.bg }} aria-hidden="true">{c.emoji}</span>}
              <span className="apg-cat-label">{c.label}</span>
            </button>
          ))}
        </div>

        {/* 促銷位 */}
        <div className="apc-promo" style={{ background: 'linear-gradient(120deg,#5B8DEF,#7B4DFF)' }}>
          <span className="apc-promo-title">盒你一起<b>大發現</b></span>
          <span className="apc-promo-emoji" aria-hidden="true">🧧</span>
        </div>

        {/* 紅包券（宽卡） */}
        <div className="apd-coupons">
          {[{ a: '25', c: '滿$60可用' }, { a: '50', c: '滿$120可用' }].map((c) => (
            <button key={c.a} type="button" className="apd-coupon">
              <span className="apc-coupon-amt"><i>$</i>{c.a}</span>
              <span className="apc-coupon-meta">
                <b>{c.c}</b>
                <i>激賞圍購神券 · 1月10日到期</i>
              </span>
              <span className="apc-coupon-use">去使用</span>
            </button>
          ))}
        </div>

        {/* 權益胶囊 */}
        <div className="apd-benefits">
          {BENEFITS.map((b, i) => (
            <button key={b} type="button" className={`apd-benefit${i === 0 ? ' is-on' : ''}`}>
              <span aria-hidden="true">🎁</span>{b}
            </button>
          ))}
        </div>

        {/* 服務標籤 */}
        <div className="apd-services">
          {SERVICES.map((s) => (
            <span key={s} className="apd-service">{s}</span>
          ))}
          <span className="apd-service apd-service--filter">篩選 ▾</span>
        </div>

        {/* 商家/商品瀑布流 */}
        <div className="apd-list">
          {FEED.map((m) => (
            <div
              key={m.key}
              className={`apd-card${onOpenStore ? ' is-clickable' : ''}`}
              role={onOpenStore ? 'button' : undefined}
              tabIndex={onOpenStore ? 0 : undefined}
              aria-label={onOpenStore ? `進入店鋪：${m.name}` : undefined}
              onClick={onOpenStore ? () => onOpenStore(m.merchantId) : undefined}
              onKeyDown={onOpenStore ? (event) => handleCardKey(event, m.merchantId) : undefined}
            >
              {m.rail && (
                <div className="apd-rail">
                  <span className="apd-rail-emoji" aria-hidden="true">🐝</span>
                  <span className="apd-rail-text">人氣商家<br />立即進入</span>
                </div>
              )}
              <div className="apd-card-main">
                <div className="apd-card-head">
                  <span className="apd-card-name">{m.name}</span>
                  {m.speed && <span className="apd-speed">{m.speed}</span>}
                </div>
                <div className="apd-card-rating">
                  <b>{m.rating}</b>分<i>{m.sold}</i>
                </div>
                <div className="apd-card-meta">{m.meta}</div>
                {m.rank && <div className="apd-rank">{m.rank}</div>}
                <div className="apd-card-coupons">
                  {m.coupons.map((c, i) => (
                    <span key={c} className={`apd-coupon-chip${i === 0 ? ' is-member' : ''}`}>{c}</span>
                  ))}
                </div>
                {m.products.length > 0 && (
                  <div className="apd-products">
                    {m.products.map((p) => (
                      <div key={p.key} className="apd-product">
                        <img className="apd-product-img" src={p.img} alt="" />
                        {p.grab && <span className="apd-grab">搶</span>}
                        <span className="apd-product-price">{p.price}</span>
                        <span className="apd-product-origin">{p.origin}</span>
                      </div>
                    ))}
                  </div>
                )}
                {m.note && <div className="apd-note">{m.note}</div>}
                {m.status && (
                  <span className={`apd-status apd-status--${m.status.tone}`}>{m.status.text}</span>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* 到底 */}
        <div className="apg-end">
          <span className="apg-end-emoji" aria-hidden="true">🐝</span>
          <span className="apg-end-text">已經到我底線了</span>
        </div>
      </div>

      {/* 本頁自帶的 5 Tab 底欄 */}
      <div className="ap-tabbar apd-tabbar">
        {BOTTOM_TABS.map((t, i) => (
          <button key={t.key} type="button" className={`ap-tab${i === 0 ? ' is-active' : ''}`}>
            <span className="ap-tab-icon apd-tab-icon" aria-hidden="true">
              {t.icon}
              {t.badge ? <em className="apd-badge">{t.badge}</em> : null}
            </span>
            <span>{t.label}</span>
          </button>
        ))}
      </div>
    </>
  )
}
