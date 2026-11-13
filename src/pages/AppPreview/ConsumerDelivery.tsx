/**
 * Copyright (c) 2026 fengsong7889. All Rights Reserved.
 *
 * 本文件为「MFTB 企业一体化管理平台软件」的组成部分。
 * 未经著作权人书面许可，不得使用、复制、修改、再分发或用于任何商业目的。
 * 完整许可条款见仓库根目录 LICENSE 文件。
 */

/**
 * 用户端 APP · 美食外賣页（2026-11 新设计稿图2-4 重构：黄色频道页）
 *
 * 入口：首页「美食外卖」大模块点击进入（ConsumerHome 的 onOpenDelivery → ConsumerApp case 'delivery'）。
 * 结构（图2 上半）：黄色头部(返回+标题+定位 / 搜索行[吸顶] / 热词行) → 食得健康 Banner →
 *   两页宫格(横滑+页点) → 超神一口價/優選下午茶 双列卡 →
 * （图3 下半）人氣商家红横幅+3卡横滑 → 筛选胶囊行(吸顶) → 商家瀑布流 → 到底 → 本页 5 Tab 底栏。
 * （图4）滚动后搜索行+筛选胶囊行双层吸顶。
 *
 * 瀑布流为首页【外卖】瀑布流的**数据副本**（复制而非同源，后期可单独修改）；
 * 卡片组件复用 DeliveryStoreCard（含人氣商家大小图皮肤）；展示模式（小图/大图）由说明面板
 * 切换器下发（deliveryPageMode → layout），大图模式复用 DeliveryLargeCard，样式与首页·
 * 外卖瀑布流大图模式一致。取色全走令牌，黄色主题复用閃蜂页根令牌集（apg-root）。
 */
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import DeliveryStoreCard, { type DeliveryStore } from './DeliveryStoreCard'
import DeliveryLargeCard from './DeliveryLargeCard'
import bbqImg from '@/assets/consumer-home/bbq.jpg'
import riceballImg from '@/assets/consumer-home/riceball.jpg'
import friedChickenImg from '@/assets/consumer-home/friedchicken.jpg'
import fishPotImg from '@/assets/consumer-home/fishpot.jpg'
import burgerImg from '@/assets/consumer-home/burger.jpg'
import lemonTeaImg from '@/assets/consumer-home/lemontea.jpg'

/** 搜索框占位关键词（图2；不进语言包） */
const KEYWORD = '奶茶'
/** 定位（图2 右上；占位） */
const LOCATION = '回力'

/** 热词行：红/绿活动胶囊 + 白底快捷词 */
const HOTWORD_RED = '🔥 新老爺咖啡 x 品牌蜂賞日'
const HOTWORD_GREEN = '🔥 食得健康餐廳'
const HOTWORDS_PLAIN = ['拉麵', '炒飯']

/** 分类入口单项：img=美食图片项；emoji+tone=品牌/权益项（logo 位占位，底色走语义令牌类） */
type CatItem = { label: string; img?: string; emoji?: string; tone?: 'red' | 'orange' | 'gold' | 'green' }

/** 分类宫格（图1：每页 2 排 × 5 列，横滑 + 页点；第二页为占位分类） */
const CAT_PAGES: CatItem[][] = [
  [
    { label: '養生輕食', img: riceballImg },
    { label: '漢堡炸雞', img: burgerImg },
    { label: '蛋糕甜點', img: lemonTeaImg },
    { label: '飲品糖水', img: fishPotImg },
    { label: '披薩意粉', img: friedChickenImg },
    { label: '麥當勞', emoji: '🍟', tone: 'red' },
    { label: '領券中心', emoji: '🎟️', tone: 'orange' },
    { label: '熱門商家', emoji: '🏆', tone: 'gold' },
    { label: '食得健康', emoji: '🥗', tone: 'green' },
    { label: '醒神早餐', emoji: '🥟', tone: 'orange' },
  ],
  [
    { label: '燒臘飯麵', img: bbqImg },
    { label: '火鍋雞煲', img: fishPotImg },
    { label: '壽司刺身', img: riceballImg },
    { label: '東南亞菜', img: lemonTeaImg },
    { label: '麵食餃子', img: friedChickenImg },
    { label: '水果鮮果', emoji: '🍉', tone: 'green' },
    { label: '零食百貨', emoji: '🍿', tone: 'gold' },
    { label: '咖啡奶茶', emoji: '🧋', tone: 'red' },
    { label: '深夜食堂', emoji: '🌙', tone: 'orange' },
    { label: '新店嚐鮮', emoji: '✨', tone: 'gold' },
  ],
]

/** 双列活动卡（图2 下半） */
const ONE_PRICE_ITEMS = [
  { name: '京都冰椰抹茶…', sub: '長崎咖啡｜全日…', price: '$29.8', origin: '$38', img: lemonTeaImg },
  { name: '氣泡冷萃咖啡…', sub: '長崎咖啡｜全日…', price: '$32', origin: '$42', img: burgerImg },
]
const TEA_ITEMS = [
  { name: '花纹花店 /鲜花/花束 /鲜花 Fl…', tag: '補貼神券最高膨脹至$3', img: lemonTeaImg },
  { name: 'CAKE EX 蛋糕速遞〔生日蛋…', tag: '補貼神券最高膨脹至$3', img: riceballImg },
]

/** 人氣商家横幅 3 卡（图3 上半） */
const HOT_MERCHANTS = [
  { name: '麥田｜川湘菜🔥酸菜魚🐟新式…', rating: '4.7', sales: '月銷 3000+', img: bbqImg },
  { name: '江浙滬菜館（本幫菜 NO.1🏆 2…', rating: '4.9', sales: '月銷 3000+', img: riceballImg },
  { name: '上海人人菜館（砂鍋海鮮撈飯…', rating: '4.8', sales: '月銷 400+', img: fishPotImg },
]

/**
 * 瀑布流：首页【外卖】瀑布流的**数据副本**（复制而非同源，后期可单独修改）；
 * 卡片复用 DeliveryStoreCard（含人氣商家大小图皮肤）。
 */
const DELIVERY_FEED: DeliveryStore[] = [
  { key: 's1', name: '毛氏海鮮火鍋飯店（湘粵融合菜）', isNew: true, brandTag: '品牌', rating: '5.0', monthlySales: '300+', minOrder: '$40', deliveryFee: '$6~12', deliveryTime: '30分鐘', distance: '1.5km', pickupDiscount: '8.8折', tags: ['全澳人气店铺', '近期百人下单'], memberTags: [{ kind: 'shen', text: '最高膨至$30' }], image: fishPotImg, deliveryType: 'pickup', merchantId: 'dl-mao', coverVideo: true },
  { key: 's2', name: '大力·烤肉飯·燒烤·川式快餐', brandTag: '独家', rating: '4.8', monthlySales: '5000+', minOrder: '$40', deliveryDiscount: '$0~6', deliveryTime: '29分鐘', distance: '1.4km', tags: ['全澳销量前10%', '千人收藏好店'], memberTags: [{ kind: 'shen', text: '$10' }, { kind: 'red', text: '300減3' }, { kind: 'coupon', text: '領券 $10' }], image: burgerImg, deliveryType: 'platform', merchantId: 'dl-dali', businessState: 'closed', closedReason: '休息一会，马上回来' },
  { key: 's3', noRating: true, name: '芭提雅·豪華店🇹🇭（正宗泰國廚師）', brandTag: '连锁', rating: '4.8', monthlySales: '1000+', minOrder: '$40', deliveryDiscount: '$0~3', deliveryTime: '29分鐘', distance: '1.9km', punctual: true, tags: ['高仕德热门店铺', '百人收藏好店'], memberTags: [{ kind: 'point', text: '积分抵$10元' }, { kind: 'shen', text: '最高膨至$30' }], memberSections: [ { label: '券包', tags: [{ kind: 'shen', text: '最高膨至$30' }, { kind: 'coupon', text: '新客券 $6' }, { kind: 'red', text: '領券 $10 | 5 | 4' }] }, { label: '活动', tags: [{ kind: 'red', text: '6.5折起' }, { kind: 'red', text: '180减9' }, { kind: 'red', text: '110减6' }, { kind: 'red', text: '80减4' }, { kind: 'red', text: '到店自取9.5折' }, { kind: 'red', text: '收藏有禮' }] }, { label: '其它', tags: [{ kind: 'point', text: '积分抵$10元' }, { kind: 'green', text: '食得健康' }, { kind: 'gray', text: '支持自取' }] } ], image: riceballImg, pickupDiscount: '9.5折', deliveryType: 'pickup', merchantId: 'dl-thai1' },
  { key: 's4', name: '芭提雅·豪華店（MaMa麵）', rating: '4.4', monthlySales: '100+', minOrder: '$40', deliveryDiscount: '$0~3', deliveryTime: '28分鐘', distance: '2.4km', pickupDiscount: '9.8折', tags: [], memberTags: [{ kind: 'shen', text: '最高膨至$30' }], image: friedChickenImg, deliveryType: 'pickup', merchantId: 'dl-thai2', businessState: 'closed', closedReason: '休息打烊' },
  { key: 's5', name: '聚緣過橋米線館-🏆冠軍店', brandTag: '金牌', rating: '4.8', monthlySales: '3000+', minOrder: '$40', freeDelivery: true, deliveryTime: '32分鐘', distance: '2.3km', punctual: true, tags: ['全澳米粉面馆销量第1名', '全澳回头率超高店铺'], memberTags: [{ kind: 'point', text: '积分抵$10元' }, { kind: 'shen', text: '最高膨至$30' }], memberSections: [ { label: '券包', tags: [{ kind: 'shen', text: '最高膨至$30' }, { kind: 'coupon', text: '新客券 $5' }] }, { label: '活动', tags: [{ kind: 'red', text: '7折起' }, { kind: 'red', text: '150减8' }, { kind: 'red', text: '到店自取9折' }, { kind: 'red', text: '收藏有禮' }] }, { label: '其它', tags: [{ kind: 'point', text: '积分抵$10元' }, { kind: 'green', text: '食得健康' }, { kind: 'gray', text: '支持自取' }] } ], image: lemonTeaImg, deliveryType: 'platform', merchantId: 'dl-jy' },
  { key: 's6', name: '悅享家庭廚房（免配送費示範店）', isNew: true, rating: '4.9', monthlySales: '800+', minOrder: '$30', freeDelivery: true, deliveryTime: '25分鐘', distance: '800m', tags: [], memberTags: [{ kind: 'shen', text: '$15' }, { kind: 'red', text: '200減5' }], image: fishPotImg, pickupDiscount: '9.2折', deliveryType: 'pickup', merchantId: 'dl-free', coverVideo: true },
  { key: 's7', noRating: true, name: '盛記燒味茶餐廳（新埠島店）', isNew: true, brandTag: '独家', rating: '4.7', monthlySales: '600+', minOrder: '$35', deliveryDiscount: '$0~4', deliveryTime: '27分鐘', distance: '3.2km', tags: ['高仕德销量第1名', '近期千人下单'], memberTags: [{ kind: 'shen', text: '最高膨至$30' }, { kind: 'coupon', text: '領券 $5' }], image: burgerImg, deliveryType: 'platform', merchantId: 'dl-sj' },
  { key: 's8', name: '小胖麵館（連鎖·北區店）', isNew: true, brandTag: '连锁', rating: '4.6', monthlySales: '2000+', minOrder: '$35', freeDelivery: true, deliveryTime: '26分鐘', distance: '1.1km', tags: ['全澳米粉面馆人气店铺', '万人收藏好店'], memberTags: [{ kind: 'shen', text: '$20' }], image: riceballImg, pickupDiscount: '8.5折', deliveryType: 'pickup', merchantId: 'dl-xp' },
  { key: 's9', name: '川渝人家（澳門店）', brandTag: '金牌', rating: '4.7', monthlySales: '1500+', minOrder: '$40', deliveryDiscount: '$0~5', deliveryTime: '35分鐘', distance: '4.6km', tags: ['全澳热门店铺', '高仕德好评店铺'], memberTags: [{ kind: 'shen', text: '最高膨至$30' }, { kind: 'red', text: '满60減8' }], image: friedChickenImg, deliveryType: 'platform', merchantId: 'dl-cy', businessState: 'closed', closedReason: '爆单啦，暂停接单一会' },
  { key: 's10', name: '早安豆漿舖（筷子基新店）', isNew: true, rating: '4.5', monthlySales: '90+', minOrder: '$20', freeDelivery: true, deliveryTime: '20分鐘', distance: '600m', tags: [], memberTags: [{ kind: 'shen', text: '$8' }], image: lemonTeaImg, pickupDiscount: '9折', deliveryType: 'pickup', merchantId: 'dl-za', businessState: 'preorder', preorderTime: '07:30' },
  { key: 's11', name: '朱記燒臘飯店（氹仔店）', rating: '4.7', monthlySales: '900+', minOrder: '$40', deliveryDiscount: '$0~5', deliveryTime: '31分鐘', distance: '2.7km', tags: ['全澳回头率超高店铺', '近期万人下单'], memberTags: [{ kind: 'shen', text: '$10' }, { kind: 'red', text: '满50減4' }], image: burgerImg, deliveryType: 'platform', merchantId: 'dl-zhu', hotSkin: { mode: 'small', templateKey: 'small_red' } },
  { key: 's12', name: '譚家三哥米線（北區店）', rating: '4.6', monthlySales: '2600+', minOrder: '$40', freeDelivery: true, deliveryTime: '28分鐘', distance: '1.2km', tags: ['全澳米粉面馆热门店铺', '近期十万人下单'], memberTags: [{ kind: 'shen', text: '最高膨至$30' }], image: riceballImg, deliveryType: 'platform', merchantId: 'dl-tan', hotSkin: { mode: 'small', templateKey: 'small_amber' } },
  { key: 's13', name: '上海生煎王 ❤ 限時$30小炒木桶飯', rating: '4.6', monthlySales: '1200+', minOrder: '$40', deliveryDiscount: '$0~3', deliveryTime: '30分鐘', distance: '1.6km', tags: ['全澳人气店铺', '百万人收藏好店'], memberTags: [{ kind: 'shen', text: '最高膨至$30' }], image: burgerImg, deliveryType: 'platform', merchantId: 'dl-shjw', hotSkin: { mode: 'large', posterKey: 'poster_red', posterImage: bbqImg, posterBrand: '上海生煎王\n小炒木桶飯', posterMascot: '🐝', dishes: [ { name: '1.農家小炒肉木桶飯', image: fishPotImg, discount: '8.7折', price: '40', origin: '46' }, { name: '2.上海生煎（4只）', image: riceballImg, price: '64' }, { name: '3.麻辣豆腐（套餐）', image: friedChickenImg, price: '28' } ] } },
]

/** 本页自带 5 Tab 底栏（图3/4：外卖/购物车/免運費悬浮/订单/更多；占位文案不进语言包） */
const BOTTOM_TABS = [
  { key: 'delivery', icon: '🛵', zh: '外卖', active: true },
  { key: 'cart', icon: '🛒', zh: '购物车' },
  { key: 'free', icon: '🎟️', zh: '免運費' },
  { key: 'order', icon: '📋', zh: '订单' },
  { key: 'more', icon: '➕', zh: '更多' },
]

export default function ConsumerDelivery({
  onBack,
  onSearch,
  onOpenStore,
  layout,
}: {
  onBack: () => void
  /** 搜索行点击：携带占位关键词跳搜索屏（与旧版签名一致，壳层 openSearch('delivery', …, keyword)） */
  onSearch?: (keyword: string) => void
  onOpenStore?: (merchantId: string) => void
  /** 瀑布流展示模式（说明面板「展示模式」切换器下发）：small=小图（一行一店）/ large=大图（顶部大图封面，复用首页 DeliveryLargeCard） */
  layout?: 'small' | 'large'
}) {
  const { t } = useTranslation()
  const bodyRef = useRef<HTMLDivElement>(null)
  const bannerRef = useRef<HTMLDivElement>(null)
  const bannerMainRef = useRef<HTMLDivElement>(null)
  /** 滚动过阈值：搜索行切白底吸顶态（图4） */
  const [scrolled, setScrolled] = useState(false)

  /* 挂载后把主 Banner 居中：两侧各露出相邻 Banner 的边缘（与 MFOOD 同口径）。
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
    const next = el.scrollTop > 40
    setScrolled((prev) => (prev === next ? prev : next))
  }

  return (
    <>
      <div className="apg-root apdl-root">
        <div className="ap-body apdl-body" ref={bodyRef} onScroll={handleScroll}>
          {/* 黄色头部：标题行（随滚动离场） */}
          <div className="apdl-head-top">
            <button type="button" className="apdl-back" onClick={onBack} aria-label={t('appConsumer.common.back', { defaultValue: '返回' })}>←</button>
            <span className="apdl-title">美食外賣</span>
            <span className="apdl-loc">📍 {LOCATION} <i aria-hidden="true">›</i></span>
          </div>

          {/* 搜索行：sticky 吸顶（滚动后白底+返回/定位入场，图4） */}
          <div className={`apdl-sticky-search${scrolled ? ' is-scrolled' : ''}`}>
            <button type="button" className={`apdl-back-inline${scrolled ? ' is-visible' : ''}`} onClick={onBack} aria-label={t('appConsumer.common.back', { defaultValue: '返回' })}>←</button>
            <button type="button" className="apdl-searchrow" onClick={() => onSearch?.(KEYWORD)}>
              <span className="apdl-search-ico" aria-hidden="true">🔍</span>
              <span className="apdl-search-word">{KEYWORD}</span>
              <span className="apdl-search-btn">搜索</span>
            </button>
            <span className={`apdl-loc-inline${scrolled ? ' is-visible' : ''}`}>📍 {LOCATION}</span>
          </div>

          {/* 热词行：红/绿活动胶囊 + 白底快捷词 */}
          <div className="apdl-hotwords">
            <span className="apdl-hotword apdl-hotword--red">{HOTWORD_RED}</span>
            <span className="apdl-hotword apdl-hotword--green">{HOTWORD_GREEN}</span>
            {HOTWORDS_PLAIN.map((w) => (
              <span key={w} className="apg-chip">{w}</span>
            ))}
          </div>

          {/* Banner 轮播（与 MFOOD 同口径）：主卡居中、两侧露相邻边缘、scroll-snap、可见页点；CSS 拼贴占位，待切图 */}
          <div ref={bannerRef} className="apdl-banner-scroll">
            <div className="apdl-banner apdl-banner--side">
              <span className="apdl-banner-side-name">超市專場</span>
            </div>
            <div ref={bannerMainRef} className="apdl-banner apdl-banner--main">
              <span className="apdl-banner-copy">
                <span className="apdl-banner-brand">MFTB · 食得健康計劃</span>
                <span className="apdl-banner-title">食得健康餐廳</span>
                <span className="apdl-banner-sub">下單健康菜式 優惠天天搶</span>
                <span className="apdl-banner-note">活動期由即日起至11月29日</span>
              </span>
              <span className="apdl-banner-visual" aria-hidden="true">🥗</span>
              <span className="apdl-banner-badge">週一、四 助力再加碼</span>
            </div>
            <div className="apdl-banner apdl-banner--side apdl-banner--right">
              <span className="apdl-banner-side-name">甜品專場</span>
            </div>
          </div>
          <div className="apdl-banner-dots"><i className="is-on" /><i /><i /></div>

          {/* 分类宫格（图1：每页 2 排 × 5 列，横滑 + 页点） */}
          <div className="apdl-cats-wrap">
            <div className="apdl-cats">
              {CAT_PAGES.map((page, pi) => (
                <div key={pi} className="apdl-cats-page">
                  {page.map((c) => (
                    <div key={c.label} className="apdl-cat">
                      {c.img
                        ? <img className="apdl-cat-img" src={c.img} alt="" />
                        : <span className={`apdl-cat-emoji apdl-cat-emoji--${c.tone}`} aria-hidden="true">{c.emoji}</span>}
                      <span className="apdl-cat-label">{c.label}</span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
            <div className="apdl-dots">{CAT_PAGES.map((_, i) => <i key={i} className={i === 0 ? 'is-on' : undefined} />)}</div>
          </div>

          {/* 双列活动卡：超神一口價 / 優選下午茶 */}
          <div className="apdl-duo">
            <div className="apdl-duo-card apdl-duo-card--one">
              <div className="apdl-duo-head apdl-duo-head--one">
                <span className="apdl-duo-title">超神一口價</span>
                <i className="apdl-duo-tag">免湊單</i>
                <i className="apdl-duo-tag">免運費</i>
                <b className="apdl-duo-arrow" aria-hidden="true">›</b>
              </div>
              {ONE_PRICE_ITEMS.map((it) => (
                <div key={it.name} className="apdl-duo-item">
                  <img className="apdl-duo-img" src={it.img} alt="" />
                  <div className="apdl-duo-info">
                    <span className="apdl-duo-name">{it.name}</span>
                    <span className="apdl-duo-sub">{it.sub}</span>
                    <span className="apdl-duo-price">{it.price} <i>{it.origin}</i></span>
                  </div>
                </div>
              ))}
            </div>
            <div className="apdl-duo-card apdl-duo-card--tea">
              <div className="apdl-duo-head">
                <span className="apdl-duo-title">優選下午茶</span>
                <b className="apdl-duo-arrow apdl-duo-arrow--dot" aria-hidden="true">›</b>
              </div>
              {TEA_ITEMS.map((it) => (
                <div key={it.name} className="apdl-duo-item">
                  <img className="apdl-duo-img" src={it.img} alt="" />
                  <div className="apdl-duo-info">
                    <span className="apdl-duo-name">{it.name}</span>
                    <span className="apdl-duo-tagline">{it.tag}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* 人氣商家红横幅 + 3 卡横滑 */}
          <div className="apdl-hot-strip">
            <div className="apdl-hot-head">
              <span className="apdl-hot-flame" aria-hidden="true">🔥</span>
              <b>人氣商家</b>
              <i>熱賣好評推薦</i>
              <button type="button" className="apdl-hot-all">全部門店 ›</button>
            </div>
            <div className="apdl-hot-cards">
              {HOT_MERCHANTS.map((m) => (
                <div key={m.name} className="apdl-hot-card">
                  <img className="apdl-hot-img" src={m.img} alt="" />
                  <span className="apdl-hot-name">{m.name}</span>
                  <span className="apdl-hot-meta">⭐ {m.rating} {m.sales}</span>
                </div>
              ))}
            </div>
          </div>

          {/* 筛选胶囊行（吸顶，图3/4） */}
          <div className="apdl-chips">
            <span className="apg-chip"><b className="apdl-chip-amount">$30</b> 神會員</span>
            <span className="apg-chip"><i className="apdl-chip-emoji apdl-chip-emoji--green" aria-hidden="true">🥗</i> 換口味</span>
            <span className="apg-chip"><i className="apdl-chip-emoji apdl-chip-emoji--amber" aria-hidden="true">🧑‍🍳</i> 商家助力</span>
            <button type="button" className="apg-chip is-slider" aria-label={t('appConsumer.groupBuy.filter.sliders', { defaultValue: '篩選條件' })}>
              <svg className="apdl-slider-ico" viewBox="0 0 16 16" width="12" height="12" aria-hidden="true" focusable="false">
                <path d="M2 4.5h12M2 8h12M2 11.5h12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                <circle cx="6" cy="4.5" r="2.1" fill="currentColor" />
                <circle cx="10.5" cy="8" r="2.1" fill="currentColor" />
                <circle cx="5" cy="11.5" r="2.1" fill="currentColor" />
              </svg>
              篩選
            </button>
          </div>

          {/* 商家瀑布流：首页【外卖】瀑布流的数据副本（复制而非同源，后期可单独修改）；小图/大图双模式（大图复用首页 DeliveryLargeCard） */}
          <div className="apw-feed apdl-feed">
            {DELIVERY_FEED.map((s) => (
              layout === 'large'
                ? <DeliveryLargeCard key={s.key} store={s} onOpenStore={onOpenStore} />
                : <DeliveryStoreCard key={s.key} store={s} onOpenStore={onOpenStore} />
            ))}
          </div>

          {/* 到底 */}
          <div className="apg-end">
            <span className="apg-end-text">{t('appConsumer.common.reachedBottom', { defaultValue: '已經到我底線了' })}</span>
          </div>
        </div>
      </div>

      {/* 本页自带 5 Tab 底栏（图3/4） */}
      <div className="ap-tabbar apd-tabbar">
        {BOTTOM_TABS.map((tab) => (
          <button key={tab.key} type="button" className={`ap-tab${tab.active ? ' is-active' : ''}`}>
            <span className="ap-tab-icon apd-tab-icon" aria-hidden="true">{tab.icon}</span>
            <span>{tab.zh}</span>
          </button>
        ))}
      </div>
    </>
  )
}
