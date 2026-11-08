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
import GroupBuyFeedCard, { type GroupBuyItem } from './GroupBuyFeedCard'
import DeliveryStoreCard, { type DeliveryStore } from './DeliveryStoreCard'
import DeliveryGridCard from './DeliveryGridCard'
import hotPosterImg from '@/assets/consumer-home/posters/poster_red.png'

/** 搜索底纹词：轮播全站热搜前 5 个（美团式引导，需求 1.1），点搜索框后进激活页仍可换词 */
const SHADE_WORDS = hotWordsFor('global').slice(0, 5)
const SHADE_INTERVAL_MS = 3000

/* ─── 分类切换（团购 / 外卖 / 超市 / 百货）─── */
const HOME_CHANNELS = [
  { key: 'group', zh: '團購', emoji: '🍲' },
  { key: 'delivery', zh: '外賣', emoji: '🧋' },
  { key: 'market', zh: '超市', emoji: '🛍️' },
  { key: 'department', zh: '百貨', emoji: '🧺' },
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

/* ─── 瀑布流团购券（使用共享 GroupBuyFeedCard） ─── */
const FEED: GroupBuyItem[] = [
  { key: 'f1', brand: '魚🐟日本料理大王大三巴店', title: '200蚊代250蚊券 葉林極上日料放題💕炒...', image: fishPotImg, isNew: true, typeLabel: '酒', halfYearSales: 1000, customTags: ['人氣熱賣', '自定義'], price: '240', origin: '300', dist: '5.8km', area: '筷子基', shop: '澳門新影匯W酒店-津津餐...', merchantId: 'd-jp1' },
  { key: 'f2', brand: '魚🐟日本料理大王大三巴店', title: '200蚊代250蚊券 葉林極上日料放題💕炒...', image: burgerImg, halfYearSales: 1000, customTags: ['人氣熱賣', '自定義'], price: '240', origin: '300', dist: '5.8km', area: '筷子基', shop: '澳門新影匯W酒店-津津餐...', merchantId: 'd-jp2' },
  { key: 'f3', brand: '湘楚人家', brandEmoji: '😋', title: '【份量超大抵食】單人全日套餐', image: riceballImg, isNew: true, halfYearSales: 416, price: '25.9', origin: '80', dist: '5.3km', area: '新口岸', shop: '湘楚人家（蓋飯🍳乾鍋🔥小炒...', merchantId: 'd-hn' },
  { key: 'f4', brand: '聯豐', title: '雞蛋10只（散裝）', image: lemonTeaImg, halfYearSales: 5066, customTags: ['性價比之選'], price: '8.8', origin: '15.9', dist: '7.1km', area: '筷子基', shop: '聯豐宅鮮餸（筷子基店）', merchantId: 'd-egg' },
  { key: 'f5', brand: '湘楚人家', brandEmoji: '😋', title: '【份量超大抵食】單人全日套餐', image: fishPotImg, halfYearSales: 416, customTags: ['1人餐', '蜂蜜抵$2'], price: '25.9', origin: '80', dist: '5.0km', area: '新口岸', shop: '湘楚人家（蓋飯🍳乾鍋🔥小炒...', merchantId: 'd-xc', flashBadge: '秒殺', flashCountdown: '07:36:58', flashBadgePos: 'top', grabbedLabel: '已搶30%', grabbedPct: 30, ctaText: '秒', discountNote: '秒殺價3.2折,降價超68%', ratingNote: '4.5分' },
]

/* ─── 外賣瀑布流門店（點「外賣」分類切換展示，No.1~No.8 見 DeliveryStoreCard） ─── */
const DELIVERY_STORES: DeliveryStore[] = [
  { key: 's1', name: '毛氏海鮮火鍋飯店（湘粵融合菜）', isNew: true, brandTag: '品牌', rating: '5.0', monthlySales: '300+', minOrder: '$40', deliveryFee: '$6~12', deliveryTime: '30分鐘', distance: '1.5km', pickupDiscount: '8.8折', tags: ['全澳人气店铺', '近期百人下单'], memberTags: [{ kind: 'shen', text: '最高膨至$30' }], image: fishPotImg, deliveryType: 'pickup', merchantId: 'dl-mao' },
  { key: 's2', name: '大力·烤肉飯·燒烤·川式快餐', brandTag: '独家', rating: '4.8', monthlySales: '5000+', minOrder: '$40', deliveryDiscount: '$0~6', deliveryTime: '29分鐘', distance: '1.4km', tags: ['全澳销量前10%', '千人收藏好店'], memberTags: [{ kind: 'shen', text: '$10' }, { kind: 'red', text: '300減3' }, { kind: 'coupon', text: '領券 $10' }], image: burgerImg, deliveryType: 'platform', merchantId: 'dl-dali', businessState: 'closed', closedReason: '休息一会，马上回来' },
  { key: 's3', name: '芭提雅·豪華店🇹🇭（正宗泰國廚師）', brandTag: '连锁', rating: '4.8', monthlySales: '1000+', minOrder: '$40', deliveryDiscount: '$0~3', deliveryTime: '29分鐘', distance: '1.9km', punctual: true, tags: ['高仕德热门店铺', '百人收藏好店'], memberTags: [{ kind: 'point', text: '积分抵$10元' }, { kind: 'shen', text: '最高膨至$30' }], memberSections: [ { label: '券包', tags: [{ kind: 'shen', text: '最高膨至$30' }, { kind: 'coupon', text: '新客券 $6' }, { kind: 'red', text: '領券 $10 | 5 | 4' }] }, { label: '活动', tags: [{ kind: 'red', text: '6.5折起' }, { kind: 'red', text: '180减9' }, { kind: 'red', text: '110减6' }, { kind: 'red', text: '80减4' }, { kind: 'red', text: '到店自取9.5折' }, { kind: 'red', text: '收藏有禮' }] }, { label: '其它', tags: [{ kind: 'point', text: '积分抵$10元' }, { kind: 'green', text: '食得健康' }, { kind: 'gray', text: '支持自取' }] } ], image: riceballImg, deliveryType: 'platform', merchantId: 'dl-thai1' },
  { key: 's4', name: '芭提雅·豪華店（MaMa麵）', rating: '4.4', monthlySales: '100+', minOrder: '$40', deliveryDiscount: '$0~3', deliveryTime: '28分鐘', distance: '2.4km', pickupDiscount: '9.8折', tags: [], memberTags: [{ kind: 'shen', text: '最高膨至$30' }], image: friedChickenImg, deliveryType: 'pickup', merchantId: 'dl-thai2', businessState: 'closed', closedReason: '休息打烊' },
  { key: 's5', name: '聚緣過橋米線館-🏆冠軍店', brandTag: '金牌', rating: '4.8', monthlySales: '3000+', minOrder: '$40', freeDelivery: true, deliveryTime: '32分鐘', distance: '2.3km', punctual: true, tags: ['全澳米粉面馆销量第1名', '全澳回头率超高店铺'], memberTags: [{ kind: 'point', text: '积分抵$10元' }, { kind: 'shen', text: '最高膨至$30' }], memberSections: [ { label: '券包', tags: [{ kind: 'shen', text: '最高膨至$30' }, { kind: 'coupon', text: '新客券 $5' }] }, { label: '活动', tags: [{ kind: 'red', text: '7折起' }, { kind: 'red', text: '150减8' }, { kind: 'red', text: '到店自取9折' }, { kind: 'red', text: '收藏有禮' }] }, { label: '其它', tags: [{ kind: 'point', text: '积分抵$10元' }, { kind: 'green', text: '食得健康' }, { kind: 'gray', text: '支持自取' }] } ], image: lemonTeaImg, deliveryType: 'platform', merchantId: 'dl-jy' },
  { key: 's6', name: '悅享家庭廚房（免配送費示範店）', isNew: true, rating: '4.9', monthlySales: '800+', minOrder: '$30', freeDelivery: true, deliveryTime: '25分鐘', distance: '800m', tags: [], memberTags: [{ kind: 'shen', text: '$15' }, { kind: 'red', text: '200減5' }], image: fishPotImg, deliveryType: 'self', merchantId: 'dl-free' },
  { key: 's7', name: '盛記燒味茶餐廳（新埠島店）', isNew: true, brandTag: '独家', rating: '4.7', monthlySales: '600+', minOrder: '$35', deliveryDiscount: '$0~4', deliveryTime: '27分鐘', distance: '3.2km', tags: ['高仕德销量第1名', '近期千人下单'], memberTags: [{ kind: 'shen', text: '最高膨至$30' }, { kind: 'coupon', text: '領券 $5' }], image: burgerImg, deliveryType: 'platform', merchantId: 'dl-sj' },
  { key: 's8', name: '小胖麵館（連鎖·北區店）', isNew: true, brandTag: '连锁', rating: '4.6', monthlySales: '2000+', minOrder: '$35', freeDelivery: true, deliveryTime: '26分鐘', distance: '1.1km', tags: ['全澳米粉面馆人气店铺', '万人收藏好店'], memberTags: [{ kind: 'shen', text: '$20' }], image: riceballImg, deliveryType: 'self', merchantId: 'dl-xp' },
  { key: 's9', name: '川渝人家（澳門店）', brandTag: '金牌', rating: '4.7', monthlySales: '1500+', minOrder: '$40', deliveryDiscount: '$0~5', deliveryTime: '35分鐘', distance: '4.6km', tags: ['全澳热门店铺', '高仕德好评店铺'], memberTags: [{ kind: 'shen', text: '最高膨至$30' }, { kind: 'red', text: '满60減8' }], image: friedChickenImg, deliveryType: 'platform', merchantId: 'dl-cy', businessState: 'closed', closedReason: '爆单啦，暂停接单一会' },
  { key: 's10', name: '早安豆漿舖（筷子基新店）', isNew: true, rating: '4.5', monthlySales: '90+', minOrder: '$20', freeDelivery: true, deliveryTime: '20分鐘', distance: '600m', tags: [], memberTags: [{ kind: 'shen', text: '$8' }], image: lemonTeaImg, deliveryType: 'platform', merchantId: 'dl-za', businessState: 'preorder', preorderTime: '07:30' },
  /* ─── 人氣商家（購買廣告皮膚後點亮；配色取 SMALL_SKIN_TEMPLATES / FALLBACK_POSTERS 真源） ─── */
  { key: 's11', name: '朱記燒臘飯店（氹仔店）', rating: '4.7', monthlySales: '900+', minOrder: '$40', deliveryDiscount: '$0~5', deliveryTime: '31分鐘', distance: '2.7km', tags: ['全澳回头率超高店铺', '近期万人下单'], memberTags: [{ kind: 'shen', text: '$10' }, { kind: 'red', text: '满50減4' }], image: burgerImg, deliveryType: 'platform', merchantId: 'dl-zhu', hotSkin: { mode: 'small', templateKey: 'small_red' } },
  { key: 's12', name: '譚家三哥米線（北區店）', rating: '4.6', monthlySales: '2600+', minOrder: '$40', freeDelivery: true, deliveryTime: '28分鐘', distance: '1.2km', tags: ['全澳米粉面馆热门店铺', '近期十万人下单'], memberTags: [{ kind: 'shen', text: '最高膨至$30' }], image: riceballImg, deliveryType: 'platform', merchantId: 'dl-tan', hotSkin: { mode: 'small', templateKey: 'small_amber' } },
  { key: 's13', name: '上海生煎王 ❤ 限時$30小炒木桶飯', rating: '4.6', monthlySales: '1200+', minOrder: '$40', deliveryDiscount: '$0~3', deliveryTime: '30分鐘', distance: '1.6km', tags: ['全澳人气店铺', '百万人收藏好店'], memberTags: [{ kind: 'shen', text: '最高膨至$30' }], image: burgerImg, deliveryType: 'platform', merchantId: 'dl-shjw', hotSkin: { mode: 'large', posterKey: 'poster_red', posterImage: hotPosterImg, posterBrand: '上海生煎王\n小炒木桶飯', posterMascot: '🐝', dishes: [ { name: '1.農家小炒肉木桶飯', image: fishPotImg, discount: '8.7折', price: '40', origin: '46' }, { name: '2.上海生煎（4只）', image: riceballImg, price: '64' }, { name: '3.麻辣豆腐（套餐）', image: friedChickenImg, price: '28' } ] } },
]

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
  /** 外卖瀑布流展示模式（说明面板切换器下发；两台手机同步） */
  deliveryMode?: 'list' | 'card'
}) {
  const { t } = useTranslation()
  const bodyRef = useRef<HTMLDivElement>(null)
  const [cat, setCat] = useState<string>(HOME_CHANNELS[0].key)
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
          {/* 美食外賣：左侧占满高度 */}
          <div className="apc-cat-tile apc-cat-tile--delivery" style={{ background: 'linear-gradient(180deg,#FFF9C4 0%,#FFE082 100%)' }}>
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

        {/* 分類對應瀑布流：團購 → 團購券卡；外賣 → 門店卡；其他分類暫回退團購券 */}
        <div className="apf-feed-list">
          {cat === 'delivery'
            ? deliveryMode === 'card'
              ? (
                  <div className="apw-grid">
                    {DELIVERY_STORES.map((store) => (
                      <DeliveryGridCard key={store.key} brand="bee" store={store} onOpenStore={onOpenStore} />
                    ))}
                  </div>
                )
              : DELIVERY_STORES.map((store) => (
                <DeliveryStoreCard key={store.key} store={store} onOpenStore={onOpenStore} />
              ))
            : FEED.map((it) => (
                <GroupBuyFeedCard key={it.key} item={it} theme="orange" onOpenStore={onOpenStore} />
              ))}
        </div>

      </div>
      </div>
    </>
  )
}
