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
import friedChickenImg from '@/assets/consumer-home/friedchicken.jpg'
import fishPotImg from '@/assets/consumer-home/fishpot.jpg'
import lemonTeaImg from '@/assets/consumer-home/lemontea.jpg'
import GroupBuyFeedCard from './GroupBuyFeedCard'
import { FEED } from './MfoodGroupFeed'
import MfoodDeliveryStoreCard, { type MfoodStore } from './MfoodDeliveryStoreCard'
import DeliveryGridCard from './DeliveryGridCard'
import hotPosterOrangeImg from '@/assets/consumer-home/posters/poster_orange.png'

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

/* ─── 美食外賣門店瀑布流（MFOOD 专属组件 MfoodDeliveryStoreCard；勁爆券皮；与閃蜂数据互不共用）
   门店顺序与閃蜂 DELIVERY_STORES 逐位形态对齐（新店/品质标签/打烊三态/预定/免配送費/自取/準時寶/
   会员展开/人气商家大小图逐位同位，便于双机并排逐行对比）；门店信息为 MFOOD 独立内容，不复制閃蜂 ─── */
const MFOOD_STORES: MfoodStore[] = [
  /* 1. 对齐閃蜂 s1：新店 + 品牌 + 自取折扣 + 正常营业 */
  { key: 'ms1', name: '恆友魚蛋王（三盞燈總店）', isNew: true, brandTag: '品牌', rating: '4.9', monthlySales: '500+', minOrder: '$40', deliveryFee: '$5~10', deliveryTime: '30分鐘', distance: '1.3km', pickupDiscount: '8.8折', tags: ['全澳热门店铺', '近期千人下单'], memberTags: [{ kind: 'shen', text: '最高膨脹至30' }, { kind: 'green', text: '新客券 $5' }], image: fishPotImg, deliveryType: 'pickup', merchantId: 'mf-hangyau' },
  /* 2. 对齐閃蜂 s2：独家 + 已打烊·休息一会 */
  { key: 'ms2', name: '大堂街炸雞（總店）', brandTag: '独家', rating: '4.8', monthlySales: '4000+', minOrder: '$40', deliveryDiscount: '$0~6', deliveryTime: '29分鐘', distance: '1.4km', tags: ['全澳销量第1名', '万人收藏好店'], memberTags: [{ kind: 'shen', text: '最高膨脹至30' }, { kind: 'red', text: '满50減4' }, { kind: 'coupon', text: '領券 $10' }], image: friedChickenImg, deliveryType: 'platform', merchantId: 'mf-taihong', businessState: 'closed', closedReason: '休息一会，马上回来' },
  /* 3. 对齐閃蜂 s3：连锁 + 準時寶 + 会員可展開 */
  { key: 'ms3', name: '龍卷堂（賈伯樂總店）', brandTag: '连锁', rating: '4.8', monthlySales: '2000+', minOrder: '$40', deliveryDiscount: '$0~3', deliveryTime: '29分鐘', distance: '1.9km', punctual: true, tags: ['高士德飯糰包類人氣第1名', '全澳飯糰包類銷量第1名'], memberTags: [{ kind: 'point', text: '双倍抵$10元' }, { kind: 'shen', text: '最高膨脹至30' }, { kind: 'green', text: '新客券 $5' }], memberSections: [ { label: '券包', tags: [{ kind: 'shen', text: '最高膨脹至30' }, { kind: 'green', text: '新客券 $5' }, { kind: 'red', text: '領券 $10 | 5 | 4' }] }, { label: '活动', tags: [{ kind: 'red', text: '6.5折起' }, { kind: 'red', text: '180减9' }, { kind: 'red', text: '110减6' }, { kind: 'red', text: '80减4' }, { kind: 'red', text: '到店自取9.5折' }, { kind: 'red', text: '收藏有禮' }] }, { label: '其它', tags: [{ kind: 'point', text: '双倍抵$10元' }, { kind: 'green', text: '食得健康' }, { kind: 'gray', text: '支持自取' }] } ], image: riceballImg, deliveryType: 'platform', merchantId: 'mf-long' },
  /* 4. 对齐閃蜂 s4：无标签 + 自取折扣 + 已打烊·休息打烊 */
  { key: 'ms4', name: '世記咖啡（皇朝店）', rating: '4.4', monthlySales: '200+', minOrder: '$40', deliveryDiscount: '$0~3', deliveryTime: '28分鐘', distance: '2.6km', pickupDiscount: '9.8折', tags: [], memberTags: [{ kind: 'shen', text: '最高膨脹至30' }, { kind: 'green', text: '新客券 $4' }], image: burgerImg, deliveryType: 'pickup', merchantId: 'mf-saigai', businessState: 'closed', closedReason: '休息打烊' },
  /* 5. 对齐閃蜂 s5：金牌 + 免配送費 + 準時寶 + 会員可展開 */
  { key: 'ms5', name: '六記粥麵（新馬路總店-🏆冠軍店）', brandTag: '金牌', rating: '4.8', monthlySales: '3000+', minOrder: '$40', freeDelivery: true, deliveryTime: '32分鐘', distance: '2.1km', punctual: true, tags: ['全澳米粉面馆销量第1名', '全澳好评店铺'], memberTags: [{ kind: 'point', text: '积分抵$10元' }, { kind: 'shen', text: '最高膨脹至30' }, { kind: 'green', text: '新客券 $8' }], memberSections: [ { label: '券包', tags: [{ kind: 'shen', text: '最高膨脹至30' }, { kind: 'green', text: '新客券 $8' }, { kind: 'red', text: '領券 $10 | 5 | 4' }] }, { label: '活动', tags: [{ kind: 'red', text: '7折起' }, { kind: 'red', text: '150减8' }, { kind: 'red', text: '100减5' }, { kind: 'red', text: '到店自取9折' }, { kind: 'red', text: '收藏有禮' }] }, { label: '其它', tags: [{ kind: 'point', text: '积分抵$10元' }, { kind: 'green', text: '食得健康' }, { kind: 'gray', text: '支持自取' }] } ], image: lemonTeaImg, deliveryType: 'platform', merchantId: 'mf-luk' },
  /* 6. 对齐閃蜂 s6：新店 + 无标签 + 免配送費 + 近距離 */
  { key: 'ms6', name: '晨光早點（北區新店）', isNew: true, rating: '4.9', monthlySales: '800+', minOrder: '$30', freeDelivery: true, deliveryTime: '25分鐘', distance: '900m', tags: [], memberTags: [{ kind: 'shen', text: '最高膨脹至30' }, { kind: 'red', text: '满30減3' }], image: burgerImg, deliveryType: 'self', merchantId: 'mf-morning' },
  /* 7. 对齐閃蜂 s7：新店 + 独家 + 起送$35·減配 */
  { key: 'ms7', name: '杏香園餅店（氹仔舊城區店）', isNew: true, brandTag: '独家', rating: '4.7', monthlySales: '700+', minOrder: '$35', deliveryDiscount: '$0~4', deliveryTime: '27分鐘', distance: '3.2km', tags: ['高仕德热门店铺', '近期99人下单'], memberTags: [{ kind: 'shen', text: '最高膨脹至30' }, { kind: 'coupon', text: '領券 $5' }], image: riceballImg, deliveryType: 'platform', merchantId: 'mf-hang' },
  /* 8. 对齐閃蜂 s8：新店 + 连锁 + 免配送費 */
  { key: 'ms8', name: '泉記美食廣場（連鎖·亞利鴉架街店）', isNew: true, brandTag: '连锁', rating: '4.6', monthlySales: '2000+', minOrder: '$35', freeDelivery: true, deliveryTime: '26分鐘', distance: '1.1km', tags: ['全澳人气店铺', '十万人收藏好店'], memberTags: [{ kind: 'shen', text: '最高膨脹至30' }, { kind: 'green', text: '新客券 $6' }], image: friedChickenImg, deliveryType: 'self', merchantId: 'mf-quan' },
  /* 9. 对齐閃蜂 s9：金牌 + 已打烊·爆单 */
  { key: 'ms9', name: '鳳城珠記酒家（新口岸店）', brandTag: '金牌', rating: '4.7', monthlySales: '1500+', minOrder: '$40', deliveryDiscount: '$0~5', deliveryTime: '35分鐘', distance: '4.6km', tags: ['高仕德回头率超高店铺', '89人收藏好店'], memberTags: [{ kind: 'shen', text: '最高膨脹至30' }, { kind: 'red', text: '满80減10' }], image: fishPotImg, deliveryType: 'platform', merchantId: 'mf-fcsz', businessState: 'closed', closedReason: '爆单啦，暂停接单一会' },
  /* 10. 对齐閃蜂 s10：新店 + 无标签 + 免配送費 + 接受预定 */
  { key: 'ms10', name: '佛笑樓三明治專門店（筷子基新店）', isNew: true, rating: '4.5', monthlySales: '90+', minOrder: '$20', freeDelivery: true, deliveryTime: '20分鐘', distance: '600m', tags: [], memberTags: [{ kind: 'shen', text: '最高膨脹至30' }], image: lemonTeaImg, deliveryType: 'platform', merchantId: 'mf-fsl', businessState: 'preorder', preorderTime: '07:30' },
  /* 11. 对齐閃蜂 s11：人气商家小图（MFOOD 用魅紫配色） */
  { key: 'ms11', name: '洪馨椰子雪糕（果欄街店）', rating: '4.7', monthlySales: '900+', minOrder: '$40', deliveryDiscount: '$0~5', deliveryTime: '31分鐘', distance: '2.7km', tags: ['高仕德好评店铺', '近期万人下单'], memberTags: [{ kind: 'shen', text: '最高膨脹至30' }, { kind: 'red', text: '满50減4' }], image: riceballImg, deliveryType: 'platform', merchantId: 'mf-hunghing', hotSkin: { mode: 'small', templateKey: 'small_purple' } },
  /* 12. 对齐閃蜂 s12：人气商家小图 + 免配送費（MFOOD 用湖青配色） */
  { key: 'ms12', name: '盛香亭滷味（關閘店）', rating: '4.6', monthlySales: '2600+', minOrder: '$40', freeDelivery: true, deliveryTime: '28分鐘', distance: '1.2km', tags: ['全澳销量前10%', '近期十万人下单'], memberTags: [{ kind: 'shen', text: '最高膨脹至30' }, { kind: 'green', text: '新客券 $5' }], image: friedChickenImg, deliveryType: 'platform', merchantId: 'mf-sheng', hotSkin: { mode: 'small', templateKey: 'small_teal' } },
  /* 13. 对齐閃蜂 s13：人气商家大圖拼列（MFOOD 用暖橙海報） */
  { key: 'ms13', name: '海灣咖啡美食 ☕ 限時$26雙拼下午茶', rating: '4.6', monthlySales: '1200+', minOrder: '$40', deliveryDiscount: '$0~3', deliveryTime: '30分鐘', distance: '1.6km', tags: ['全澳人气店铺', '近期千万人下单'], memberTags: [{ kind: 'shen', text: '最高膨脹至30' }, { kind: 'green', text: '新客券 $5' }], image: fishPotImg, deliveryType: 'platform', merchantId: 'mf-bay', hotSkin: { mode: 'large', posterKey: 'poster_orange', posterImage: hotPosterOrangeImg, posterBrand: '海灣咖啡美食\n雙拼下午茶', posterMascot: '☕', dishes: [ { name: '1.招牌豬扒包+絲襪奶茶', image: burgerImg, discount: '8.2折', price: '26', origin: '38' }, { name: '2.蛋撻（2只）', image: riceballImg, price: '18' }, { name: '3.公司三文治', image: friedChickenImg, price: '22' } ] } },
]

export default function MfoodHome({
  onSearch,
  onOpenStore,
  onOpenGroupBuy,
  onCategoryChange,
  syncCategory,
  syncSeq,
  deliveryMode,
}: {
  onSearch?: () => void
  onOpenStore?: (merchantId: string) => void
  /** 分类宫格「特價團購」入口 → 特惠團購页（MfoodApp 根屏切换） */
  onOpenGroupBuy?: () => void
  /** 分类切换回调（双机视图联动右侧说明面板：美食外賣 → 外卖说明，其余 → 团购说明） */
  onCategoryChange?: (tab: string) => void
  /** 右侧说明面板 Tab 下发的分类同步命令（syncSeq 自增时执行，壳内自身切换不回流） */
  syncCategory?: string
  syncSeq?: number
  /** 外卖瀑布流展示模式（说明面板切换器下发；两台手机同步） */
  deliveryMode?: 'list' | 'card'
}) {
  const bodyRef = useRef<HTMLDivElement>(null)
  const [tab, setTab] = useState<string>(TABS[0].key)
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
              <button key={c.key} type="button" className="apm-cat-item" onClick={c.key === 'group' ? onOpenGroupBuy : undefined}>
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

        {/* 分類對應瀑布流：特價團購/超市百貨 → 團購券卡；美食外賣 → 門店卡（MFOOD 专属组件） */}
        <div className="apf-feed-list">
          {tab === 'delivery'
            ? deliveryMode === 'card'
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
