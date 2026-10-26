/**
 * 用户端 APP · 特價團購页（按设计稿还原，纯前端静态原型）
 *
 * 入口：首页「特價團購」小模块点击进入（见 ConsumerHome 的 onOpenGroupBuy）。
 * 结构：粉色头部(返回+定位) → 搜索+訂單 → 日料 Hero → 十宫格分类 → 快捷胶囊 →
 *       促销位 → 標題欄(横滑) → 標題欄(双列) → 红包券 → 筛选栏 → 竖向商品列表 → 到底提示。
 *
 * 说明：图片为 AI 占位图（src/assets/consumer-home/），文案暂硬编码繁中，待切图与 i18n 接入后替换。
 */
import { useRef, useState, type KeyboardEvent } from 'react'
import groupbuyHeroImg from '@/assets/consumer-home/groupbuy-hero.jpg'
import bbqImg from '@/assets/consumer-home/bbq.jpg'
import riceballImg from '@/assets/consumer-home/riceball.jpg'
import friedChickenImg from '@/assets/consumer-home/friedchicken.jpg'
import fishPotImg from '@/assets/consumer-home/fishpot.jpg'
import burgerImg from '@/assets/consumer-home/burger.jpg'
import lemonTeaImg from '@/assets/consumer-home/lemontea.jpg'

const CATS = [
  { label: '火鍋', img: fishPotImg },
  { label: '燒烤烤肉', img: bbqImg },
  { label: '甜品飲料', img: lemonTeaImg },
  { label: '西餐扒飯', img: burgerImg },
  { label: '美容美髮', img: '' },
  { label: '自助餐', img: friedChickenImg },
  { label: '茶餐廳', img: riceballImg },
  { label: '漢堡小食', img: burgerImg },
  { label: '異域料理', img: fishPotImg },
  { label: '生活服務', img: '' },
]

const PILLS = ['會員中心', '每日簽到', '打卡熱榜', '附近商家']

/** 標題欄横滑：4 张小卡 */
const SMALL_ROW = [
  { key: 's1', title: '婆當婆當婆...', price: '19.9', origin: '9.9', img: friedChickenImg },
  { key: 's2', title: '婆當婆當婆...', price: '19.9', origin: '9.9', img: friedChickenImg },
  { key: 's3', title: '婆當婆當婆...', price: '19.9', origin: '9.9', img: friedChickenImg },
  { key: 's4', title: '婆當婆當婆...', price: '19.9', origin: '9.9', img: friedChickenImg },
]

/** 標題欄双列：肯德基 */
const KFC_COL = [
  { key: 'k1', title: '肯德基KFC...', price: '9.9', origin: '99.9', img: friedChickenImg },
  { key: 'k2', title: '肯德基KFC...', price: '9.9', origin: '99.9', img: friedChickenImg },
]

const COUPONS = [
  { key: 'c1', amount: '25', cond: '滿$60可用' },
  { key: 'c2', amount: '25', cond: '滿$60可用' },
]

const FILTERS = ['特價', '推薦', '商家', '茶餐廳', '休閒娛樂', '茶餐廳']

/** 竖向商品列表 */
const PRODUCTS = [
  { key: 'p1', title: 'Pizza Lab西塔烤肉 | 甄選2人泥爐烤肉特惠套餐', img: bbqImg, sold: '半年售650', tag: '自定餐自定', price: '18.8', origin: '688.8', save: '帳值超77% 賺$20', dist: '1.5km 黑沙環', shop: 'Pizza Lab西塔烤肉（威尼斯人...）', hot: true },
  { key: 'p2', title: 'Pizza Lab西塔烤肉 | 甄選2人泥爐烤肉特惠套餐', img: bbqImg, sold: '最高至50', tag: '180天前可退', price: '18.8', origin: '688.8', save: '帳值超77% 賺$20', dist: '1.5km 黑沙環', shop: 'Pizza Lab西塔烤肉（威尼斯人...）' },
  { key: 'p3', title: 'Pizza Lab西塔烤肉 | 甄選2人泥爐烤肉特惠套餐', img: bbqImg, sold: '半年售100+', tag: '自定餐自定', price: '18.8', origin: '688.8', save: '帳值超77% 賺$20', dist: '1.5km 黑沙環', shop: 'Pizza Lab西塔烤肉（威尼斯人...）', hot: true },
  { key: 'p4', title: 'Pizza Lab西塔烤肉 | 甄選2人泥爐烤肉特惠套餐', img: bbqImg, sold: '半年售100+', tag: '自定餐自定', price: '18.8', origin: '688.8', save: '帳值超77% 賺$20', dist: '1.5km 黑沙環', shop: 'Pizza Lab西塔烤肉（威尼斯人...）' },
  { key: 'p5', title: 'Pizza Lab西塔烤肉 | 甄選2人泥爐烤肉特惠套餐字太多點點貼...', img: bbqImg, sold: '半年售650', tag: '自定餐自定', price: '18.8', origin: '688.8', save: '帳值超77% 賺$20', dist: '1.5km 黑沙環', shop: 'Pizza Lab西塔烤肉（威尼斯人...）' },
]

export default function ConsumerGroupBuy({
  onBack,
  onSearch,
  onOpenStore,
}: {
  onBack: () => void
  onSearch: () => void
  onOpenStore?: (merchantId: string) => void
}) {
  const bodyRef = useRef<HTMLDivElement>(null)
  const [scrolled, setScrolled] = useState(false)
  const [filter, setFilter] = useState('特價')

  /** 内容区上滑过阈值后折叠标题行，仅保留搜索行吸顶（与美食外賣页一致） */
  const handleScroll = () => {
    const el = bodyRef.current
    if (!el) return
    const next = el.scrollTop > 36
    setScrolled((prev) => (prev === next ? prev : next))
  }

  const openStore = (merchantId: string) => () => onOpenStore?.(merchantId)

  /** 整条团购商品是进店入口，Enter/Space 与点击等价 */
  const handleItemKey = (event: KeyboardEvent<HTMLDivElement>, merchantId: string) => {
    if (!onOpenStore) return
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      onOpenStore(merchantId)
    }
  }

  return (
    <>
      {/* 粉色头部：可折叠吸顶（滚动后仅保留搜索行） */}
      <div className={`apg-header${scrolled ? ' is-scrolled' : ''}`}>
        <div className="apg-header-top">
          <button type="button" className="apg-back" onClick={onBack} aria-label="返回">‹</button>
          <span className="apg-title">特價團購</span>
          <span className="apg-loc">
            <span aria-hidden="true">📍</span>威尼斯人A座 <i aria-hidden="true">›</i>
          </span>
        </div>
        <div className="apg-header-search">
          {scrolled && (
            <button type="button" className="apg-back apg-back-inline" onClick={onBack} aria-label="返回">‹</button>
          )}
          <button type="button" className="apg-searchrow" onClick={onSearch}>
            <span className="apc-search-ico" aria-hidden="true">🔍</span>
            <span className="apg-hot">熱搜：滾動字體後台傳</span>
            <span className="apg-search-btn">搜索</span>
            <span className="apg-order-btn">訂單</span>
          </button>
          {scrolled && (
            <span className="apg-header-loc"><span aria-hidden="true">📍</span><i>威尼斯人A座</i></span>
          )}
        </div>
      </div>

      <div className="ap-body apg-body" ref={bodyRef} onScroll={handleScroll}>

        {/* 日料 Hero */}
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
            <button key={c.label} type="button" className="apg-cat">
              {c.img
                ? <img className="apg-cat-img" src={c.img} alt="" />
                : <span className="apg-cat-emoji" aria-hidden="true">🏷️</span>}
              <span className="apg-cat-label">{c.label}</span>
            </button>
          ))}
        </div>
        <div className="apg-dots" aria-hidden="true"><i className="is-on" /><i /><i /><i /></div>

        {/* 快捷胶囊 */}
        <div className="apg-pills">
          {PILLS.map((p, i) => (
            <button key={p} type="button" className={`apg-pill${i === 0 ? ' is-green' : ''}`}>{p}</button>
          ))}
        </div>

        {/* 促銷位 */}
        <div className="apc-promo" style={{ background: 'linear-gradient(120deg,#5B8DEF,#7B4DFF)' }}>
          <span className="apc-promo-title">盒你一起<b>大發現</b></span>
          <span className="apc-promo-emoji" aria-hidden="true">🧧</span>
        </div>

        {/* 標題欄 · 横滑 */}
        <section className="apc-sec">
          <header className="apc-sec-head">
            <span className="apc-sec-title">標題欄</span>
            <span className="apc-sec-sub">低至3折</span>
          </header>
          <div className="apc-hscroll">
            {SMALL_ROW.map((it) => (
              <button key={it.key} type="button" className="apc-hcard" onClick={openStore('g-pizza')}>
                <img className="apc-thumb" src={it.img} alt={it.title} />
                <span className="apc-hcard-title">{it.title}</span>
                <span className="apg-price-origin">
                  <span className="apc-price"><i>¥</i>{it.price}<em>起</em></span>
                  <i className="apc-fcard-strike">¥{it.origin}</i>
                </span>
              </button>
            ))}
          </div>
        </section>

        {/* 標題欄 · 双列 */}
        <section className="apg-two">
          {['left', 'right'].map((col) => (
            <div key={col} className="apc-sec apg-two-col">
              <header className="apc-sec-head">
                <span className="apc-sec-title">標題欄</span>
                <span className="apc-sec-sub">低至3折</span>
              </header>
              {KFC_COL.map((it) => (
                <button key={`${col}-${it.key}`} type="button" className="apc-gcard" onClick={openStore('g-kfc')}>
                  <span className="apg-gcard-kfc">
                    <img className="apg-gcard-img" src={it.img} alt={it.title} />
                    <span className="apg-gcard-info">
                      <span className="apc-gcard-title">{it.title}</span>
                      <span className="apg-badge">8.8折</span>
                      <span className="apg-price-origin">
                        <span className="apc-price"><i>¥</i>{it.price}<em>起</em></span>
                        <i className="apc-fcard-strike">¥{it.origin}</i>
                      </span>
                    </span>
                  </span>
                </button>
              ))}
              <button type="button" className="apc-more-center" style={{ marginTop: 8 }}>查看更多</button>
            </div>
          ))}
        </section>

        {/* 紅包券 */}
        <div className="apc-coupons">
          {COUPONS.map((c) => (
            <button key={c.key} type="button" className="apc-coupon">
              <span className="apc-coupon-amt"><i>$</i>{c.amount}</span>
              <span className="apc-coupon-meta">
                <b>{c.cond}</b>
                <i>激賞圍購神券 · 1月10日到期</i>
              </span>
              <span className="apc-coupon-use">去使用</span>
            </button>
          ))}
        </div>

        {/* 篩選栏 */}
        <div className="apg-filters">
          {FILTERS.map((f) => (
            <button
              key={f}
              type="button"
              className={filter === f ? 'is-on' : ''}
              onClick={() => setFilter(f)}
            >
              {f}
            </button>
          ))}
        </div>
        <div className="apg-sortbar">
          <button type="button">附近 ▾</button>
          <button type="button">分類 ▾</button>
          <button type="button" className="is-hl">排序 ▾</button>
          <button type="button" className="is-hl">神會員</button>
          <button type="button" className="is-hl">津貼神券</button>
        </div>

        {/* 竖向商品列表 */}
        <div className="apg-list">
          {PRODUCTS.map((p) => (
            <div
              key={p.key}
              className={`apg-item${p.hot ? ' is-hot' : ''}${onOpenStore ? ' is-clickable' : ''}`}
              role={onOpenStore ? 'button' : undefined}
              tabIndex={onOpenStore ? 0 : undefined}
              aria-label={onOpenStore ? `進入店鋪：${p.shop}` : undefined}
              onClick={onOpenStore ? openStore('g-pizza') : undefined}
              onKeyDown={onOpenStore ? (event) => handleItemKey(event, 'g-pizza') : undefined}
            >
              <img className="apg-item-img" src={p.img} alt="" />
              <div className="apg-item-main">
                <div className="apg-item-title">{p.title}</div>
                <div className="apg-item-sold">半年售650 <i>{p.tag}</i></div>
                <div className="apg-item-price">
                  <span className="apc-price apc-price-lg"><i>¥</i>{p.price}<em>起</em></span>
                  <span className="apc-fcard-strike">¥{p.origin}</span>
                </div>
                <div className="apg-item-save">{p.save}</div>
                <div className="apg-item-shop">{p.dist} | {p.shop}</div>
              </div>
              <span className="apg-grab">搶</span>
            </div>
          ))}
        </div>

        {/* 到底 */}
        <div className="apg-end">
          <span className="apg-end-emoji" aria-hidden="true">🐝</span>
          <span className="apg-end-text">已經到我底線了</span>
        </div>
      </div>
    </>
  )
}
