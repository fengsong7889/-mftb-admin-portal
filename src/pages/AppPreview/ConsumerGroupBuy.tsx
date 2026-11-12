/**
 * Copyright (c) 2026 fengsong7889. All Rights Reserved.
 *
 * 本文件为「MFTB 企业一体化管理平台软件」的组成部分。
 * 未经著作权人书面许可，不得使用、复制、修改、再分发或用于任何商业目的。
 * 完整许可条款见仓库根目录 LICENSE 文件。
 */

/**
 * 用户端 APP · 特惠團購页（按设计稿还原，纯前端静态原型；2026-11 按新稿整页改版）
 *
 * 入口：首页「特惠團購」粉色卡片点击进入（见 ConsumerHome 的 onOpenGroupBuy）。
 * 结构（对应设计稿图2/图3/图4）：
 *   橙色头部(返回+标题+定位 / 搜索行+訂單图标 / 热词胶囊，滚动后折叠为 搜索行+訂單) →
 *   新店 Banner 轮播(圆角+指示点) → 十宫格分类 → 地图卡（附近 2133 家店）→
 *   團購超級秒殺(倒计时+更多 / 横滑秒杀卡) → 页签行(未吸顶=圆形图标，吸顶=文字下划线) →
 *   筛选胶囊(附近商家/全部分類/智能排序/神/篩選) → 筛选下拉面板 / 更多篩選底部 sheet(五模块) →
 *   瀑布流团购券(共享 GroupBuyFeedCard + apf-feed-list，与首页「团购」瀑布流同规格) → 到底提示。
 *
 * 说明：图片为 AI 占位图（src/assets/consumer-home/）；品牌/商品/门店名/热词为占位数据，
 * 按口径不进入语言包；界面骨架文案已接 i18n（appConsumer 命名空间，复用既有 key）。
 */
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import GroupBuyFeedCard, { type GroupBuyItem } from './GroupBuyFeedCard'
import PreferredMerchantCard from './PreferredMerchantCard'
import { PREFERRED_MERCHANTS } from './consumerPreferredFeed'
import { useGroupBuyFilters } from './GroupBuyFilterBar'
import groupbuyHeroImg from '@/assets/consumer-home/groupbuy-hero.jpg'
import groupbuyMapImg from '@/assets/consumer-home/groupbuy-map.png'
import bbqImg from '@/assets/consumer-home/bbq.jpg'
import riceballImg from '@/assets/consumer-home/riceball.jpg'
import friedChickenImg from '@/assets/consumer-home/friedchicken.jpg'
import fishPotImg from '@/assets/consumer-home/fishpot.jpg'
import burgerImg from '@/assets/consumer-home/burger.jpg'
import lemonTeaImg from '@/assets/consumer-home/lemontea.jpg'
import serviceImg from '@/assets/consumer-home/service.png'
import leisureImg from '@/assets/consumer-home/leisure.png'

/** 定位（占位数据，不进语言包） */
const LOCATION = 'Science Park(香洲區)'
/** 搜索框占位关键词（占位数据） */
const KEYWORD = '烤魚'

/** 热词胶囊（图2：首个为激活态；占位数据） */
const HOT_WORDS = ['新大家發美食', '雲吞', '火鍋', '烤魚', '下午茶', '炸雞']

/** 十宫格分类（图2，两行五列；沿用既有 category.* key，麥當勞/火鍋烤肉为占位文案） */
const GRID_CATS = [
  { key: '', zh: '麥當勞', img: burgerImg },
  { key: 'appConsumer.groupBuy.category.dessert', zh: '甜品飲品', img: lemonTeaImg },
  { key: 'appConsumer.groupBuy.category.exotic', zh: '異國料理', img: fishPotImg },
  { key: 'appConsumer.groupBuy.category.congeeNoodle', zh: '粥粉麵飯', img: riceballImg },
  { key: 'appConsumer.groupBuy.category.service', zh: '生活服務', img: serviceImg },
  { key: 'appConsumer.groupBuy.category.hotpot', zh: '火鍋烤肉', img: bbqImg, plain: true },
  { key: 'appConsumer.groupBuy.category.localCuisine', zh: '地方菜系', img: riceballImg },
  { key: 'appConsumer.groupBuy.category.fastFood', zh: '快餐小食', img: burgerImg },
  { key: 'appConsumer.groupBuy.category.buffet', zh: '自助餐', img: friedChickenImg },
  { key: 'appConsumer.groupBuy.category.leisure', zh: '休閒娛樂', img: leisureImg },
]

/** 页签行（图3：圆形图标态；吸顶后保留图标、仅加白底与投影表达“吸附”；占位数据 + 既有 key） */
const STICKY_TABS = [
  { key: 'appConsumer.groupBuy.chip.recommend', zh: '推薦', emoji: '👍' },
  { key: '', zh: '優選商家', emoji: '🏪' },
  { key: '', zh: '消費賞', emoji: '🎁' },
  { key: 'appConsumer.groupBuy.category.congeeNoodle', zh: '粥粉麵飯', emoji: '🍜' },
  { key: 'appConsumer.groupBuy.category.dessert', zh: '甜品飲品', emoji: '🧋' },
  { key: 'appConsumer.groupBuy.category.buffet', zh: '自助餐', emoji: '🦞' },
  { key: '', zh: '代金券', emoji: '🎟️' },
  { key: 'appConsumer.groupBuy.category.fastFood', zh: '快餐小食', emoji: '🍔' },
  { key: '', zh: '火鍋烤肉', emoji: '🍲' },
  { key: 'appConsumer.groupBuy.category.localCuisine', zh: '地方菜系', emoji: '🍛' },
  { key: 'appConsumer.groupBuy.category.exotic', zh: '異國料理', emoji: '🍣' },
]

/** 團購超級秒殺 · 横滑秒杀卡（图3；占位数据） */
const SECKILL_CARDS = [
  { key: 'sk1', discount: '6折', title: '100 元代金券【…', price: '60', origin: '100', img: fishPotImg },
  { key: 'sk2', discount: '4.5折', title: '（👍👍超值）…', price: '95', origin: '211', img: lemonTeaImg },
  { key: 'sk3', discount: '5.1折', title: '【3店通用】哆…', price: '26.8', origin: '53', img: friedChickenImg },
]

/** 團購超級秒殺 · 倒计时（占位静态值） */
const SECKILL_COUNTDOWN = ['05', '38', '52']

/** 瀑布流团购券：与首页「团购」瀑布流同一口径（共享 GroupBuyFeedCard + apf-feed-list 容器），数据同首页 FEED */
const FEED: GroupBuyItem[] = [
  { key: 'f1', brand: '魚🐟日本料理', title: '200蚊代250蚊券 葉林極 上日料放題💕炒', image: fishPotImg, isNew: true, typeLabel: '酒', halfYearSales: 1000, customTags: ['人氣熱賣', '自定義'], price: '240', origin: '30', discountNote: '降價超20%，勁慳$60', ratingNote: '4.7', dist: '5.8km', area: '筷子基', shop: '澳門新影匯W酒店-津津餐...', merchantId: 'd-jp1', pointPrice: true },
  { key: 'f2', brand: '魚🐟日本料理', title: '200蚊代250蚊券 葉林極 上日料放題💕炒', image: burgerImg, halfYearSales: 1000, customTags: ['人氣熱賣', '自定義'], price: '240', origin: '300', ratingNote: '4.7', dist: '5.8km', area: '筷子基', shop: '澳門新影匯W酒店-津津餐...', merchantId: 'd-jp2' },
  { key: 'f3', brand: '湘楚人家', brandEmoji: '😋', title: '【份量超大抵食】單人全日套餐', image: riceballImg, isNew: true, halfYearSales: 416, price: '25.9', origin: '80', ratingNote: '4.5', dist: '5.3km', area: '新口岸', shop: '湘楚人家（蓋飯🍳乾鍋小炒...', merchantId: 'd-hn' },
  { key: 'f4', brand: '聯豐', title: '雞蛋10只（散裝）', image: lemonTeaImg, halfYearSales: 5066, customTags: ['性價比之選'], price: '8.8', origin: '15.9', pointPrice: true, dist: '7.1km', area: '筷子基', shop: '聯豐宅鮮餸（筷子基店）', merchantId: 'd-egg' },
  { key: 'f5', brand: '湘楚人家', brandEmoji: '😋', title: '【份量超大抵食】單人全日套餐', image: fishPotImg, halfYearSales: 416, customTags: ['1人餐', '蜂蜜抵$2'], price: '25.9', origin: '80', dist: '5.0km', area: '新口岸', shop: '湘楚人家（蓋飯🍳乾鍋小炒...', merchantId: 'd-xc', flashBadge: '秒殺', flashCountdown: '07:36:58', flashBadgePos: 'top', grabbedLabel: '已搶30%', grabbedPct: 30, ctaText: '秒', discountNote: '秒殺價3.2折,降價超68%', ratingNote: '4.5' },
]

/** 頁签行下标：「優選商家」点击后瀑布流切换为商家卡（设计稿图2） */
const TAB_PREFERRED = 1

/* 優選商家瀑布流数据抽至 consumerPreferredFeed.ts：搜索结果页「團購」分类复用同款小图瀑布流 */

export default function ConsumerGroupBuy({
  onBack,
  onSearch,
  onOpenStore,
  onOpenOrder,
  onTabChange,
  syncTab,
  syncSeq,
  preferredLayout,
  onPreferredLayoutChange,
}: {
  onBack: () => void
  onSearch: () => void
  onOpenStore?: (merchantId: string) => void
  onOpenOrder?: () => void
  /** 页签切换回流（壳外说明面板联动：優選商家 ↔ preferred 面板） */
  onTabChange?: (tab: string) => void
  /** 壳外说明面板下发的页签同步命令（syncSeq 自增时执行） */
  syncTab?: string
  syncSeq?: number
  /** 優選商家列表大小圖模式（说明面板切换器下发，与篩選面板内切换双通道同步；缺省大圖） */
  preferredLayout?: 'small' | 'large'
  /** 篩選面板内切换上报（说明面板闭环后下发另一台手机） */
  onPreferredLayoutChange?: (mode: 'small' | 'large') => void
}) {
  const { t } = useTranslation()
  const bodyRef = useRef<HTMLDivElement>(null)
  const [scrolled, setScrolled] = useState(false)
  /** 页签行是否已吸顶（图4：吸顶后由圆形图标态切换为文字下划线态） */
  const [tabsStuck, setTabsStuck] = useState(false)
  /** 当前激活页签（仅视觉态，原型不做真实过滤）；初值直接应用 syncTab：壳为条件挂载，错过 syncSeq 变化时靠初值补上 */
  const [activeTab, setActiveTab] = useState<number>(syncTab === 'preferred' ? TAB_PREFERRED : 0)
  /* 筛选区（附近/全部分類/智能排序/更多篩選 + 大小图切换）单一真源见 GroupBuyFilterBar；
     大小图切换模块仅優選商家页签的篩選面板展示，切换上报经说明面板闭环双机同步 */
  const filters = useGroupBuyFilters({
    nearbyChipLabel: '附近商家',
    showHighlightChips: true,
    showLayoutToggle: activeTab === TAB_PREFERRED,
    preferredLayout,
    onPreferredLayoutChange,
  })

  /* 壳外说明面板同步命令：只在 syncSeq 变化时执行；preferred → 優選商家页签，page-group → 推薦页签 */
  const syncSeqRef = useRef(syncSeq ?? 0)
  useEffect(() => {
    if ((syncSeq ?? 0) !== syncSeqRef.current) {
      syncSeqRef.current = syncSeq ?? 0
      if (syncTab === 'preferred') setActiveTab(TAB_PREFERRED)
      else if (syncTab === 'page-group') setActiveTab(0)
    }
  }, [syncSeq, syncTab])

  /** 内容区上滑：过阈值折叠头部标题行；再过阈值页签行吸顶变文字态（图4） */
  const handleScroll = () => {
    const el = bodyRef.current
    if (!el) return
    const next = el.scrollTop > 36
    setScrolled((prev) => (prev === next ? prev : next))
    const stuck = el.scrollTop > 430
    setTabsStuck((prev) => (prev === stuck ? prev : stuck))
  }

  const openStore = (merchantId: string) => () => onOpenStore?.(merchantId)

  return (
    <div className="apg-root">
      {/* 橙色头部：可折叠吸顶（滚动后仅保留 搜索行+訂單，图4） */}
      <div className={`apg-header${scrolled ? ' is-scrolled' : ''}`}>
        <div className="apg-header-top">
          <button type="button" className="apg-back" onClick={onBack} aria-label={t('appConsumer.common.back', { defaultValue: '返回' })}>←</button>
          <span className="apg-title">{t('appConsumer.groupBuy.title', { defaultValue: '特惠團購' })}</span>
          <span className="apg-loc">
            <span aria-hidden="true">📍</span>{LOCATION} <i aria-hidden="true">›</i>
          </span>
        </div>
        <div className="apg-header-search">
          {scrolled && (
            <button type="button" className="apg-back apg-back-inline" onClick={onBack} aria-label={t('appConsumer.common.back', { defaultValue: '返回' })}>←</button>
          )}
          <button type="button" className="apg-searchrow" onClick={onSearch}>
            <span className="apc-search-ico" aria-hidden="true">🔍</span>
            <span className="apg-hot">{KEYWORD}</span>
            <span className="apg-search-btn">{t('appConsumer.common.search', { defaultValue: '搜索' })}</span>
          </button>
          {/* 訂單是独立入口（跳底部訂單 Tab），不能嵌在搜索框按钮内 */}
          {onOpenOrder && (
            <button type="button" className="apg-order-btn" onClick={onOpenOrder}>
              <span className="apg-order-ico" aria-hidden="true">📋</span>
              <span className="apg-order-txt">{t('appConsumer.common.order', { defaultValue: '訂單' })}</span>
            </button>
          )}
        </div>
        {!scrolled && (
          <div className="apg-hotwords">
            {HOT_WORDS.map((w, i) => (
              <button key={w} type="button" className={`apg-hotword${i === 0 ? ' is-on' : ''}`}>
                {i === 0 && <span className="apg-hotword-fire" aria-hidden="true">🔥</span>}
                {w}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="ap-body apg-body" ref={bodyRef} onScroll={handleScroll}>

        {/* 新店 Banner 轮播（圆角大图 + 指示点） */}
        <div
          className="apg-hero"
          style={{ background: `url(${groupbuyHeroImg}) center/cover no-repeat` }}
          role="img"
          aria-label={t('appConsumer.common.heroBadge', { defaultValue: '新店嚟喇 超抵價嘆盡招牌美食' })}
        >
          <div className="apg-dots apg-dots-in"><i className="is-on" /><i /><i /><i /></div>
        </div>

        {/* 十宫格分类（两行五列） */}
        <div className="apg-cats">
          {GRID_CATS.map((c, i) => (
            <button key={`${c.zh}-${i}`} type="button" className="apg-cat">
              {c.img
                ? <img className="apg-cat-img" src={c.img} alt="" />
                : <span className="apg-cat-emoji" aria-hidden="true">🏷️</span>}
              <span className="apg-cat-label">{c.key ? t(c.key, { defaultValue: c.zh }) : c.zh}</span>
            </button>
          ))}
        </div>

        {/* 地图卡：附近门店入口（占位示意，接地图 SDK 后替换） */}
        <button type="button" className="apg-map" onClick={onSearch}>
          <img className="apg-map-img" src={groupbuyMapImg} alt="" />
          <span className="apg-map-pill">
            <span className="apg-map-pill-ico" aria-hidden="true">🐝</span>
            附近 2133 家店 <i aria-hidden="true">›</i>
          </span>
          <span className="apg-map-brand" aria-hidden="true">Bai度地圖</span>
        </button>

        {/* 團購超級秒殺：橙色带 + 倒计时 + 更多；横滑秒杀卡 */}
        <section className="apg-seckill">
          <header className="apg-seckill-head">
            <span className="apg-seckill-title">團購超級秒殺</span>
            <span className="apg-seckill-cd" aria-label="秒殺倒計時">
              {SECKILL_COUNTDOWN.map((n, i) => (
                <span key={n + i} className="apg-seckill-cd-item">{n}</span>
              ))}
              <span className="apg-seckill-cd-suffix">後結束</span>
            </span>
            <button type="button" className="apg-seckill-more">更多 <i aria-hidden="true">→</i></button>
          </header>
          <div className="apg-flash-hscroll">
            {SECKILL_CARDS.map((c) => (
              <button key={c.key} type="button" className="apg-shcard" onClick={openStore('g-seckill')}>
                <span className="apg-shcard-badge">{c.discount}</span>
                <img className="apg-shcard-img" src={c.img} alt="" />
                <span className="apg-shcard-title">{c.title}</span>
                <span className="apg-shcard-price">
                  <span className="apg-shcard-now"><i>$</i>{c.price}</span>
                  <s>${c.origin}</s>
                  <span className="apg-shcard-grab">{t('appConsumer.common.grab', { defaultValue: '搶' })}</span>
                </span>
              </button>
            ))}
          </div>
        </section>

        {/* 页签行：未吸顶=圆形图标（图3）；吸顶=文字下划线（图4）；sticky 随滚动吸附在头部之下 */}
        <div className={`apg-tabs${tabsStuck ? ' is-stuck' : ''}`}>
          {STICKY_TABS.map((tab, i) => (
            <button
              key={`${tab.zh}-${i}`}
              type="button"
              className={`apg-tab${activeTab === i ? ' is-on' : ''}`}
              onClick={() => {
                setActiveTab(i)
                onTabChange?.(i === TAB_PREFERRED ? 'preferred' : 'page-group')
              }}
            >
              <i className="apg-tab-ico" aria-hidden="true">{tab.emoji}</i>
              <span className="apg-tab-label">{tab.key ? t(tab.key, { defaultValue: tab.zh }) : tab.zh}</span>
            </button>
          ))}
        </div>

        {filters.sortbar}

        {/* 瀑布流：優選商家页签 → 商家卡瀑布流（图2）；其余页签 → 与首页「团购」同规格瀑布流 */}
        {activeTab === TAB_PREFERRED ? (
          <div className="apq-feed">
            {PREFERRED_MERCHANTS.map((m) => (
              <PreferredMerchantCard key={m.key} item={m} layout={filters.layout} brand="bee" />
            ))}
          </div>
        ) : (
          <div className="apf-feed-list">
            {FEED.map((it) => (
              <GroupBuyFeedCard key={it.key} item={it} theme="orange" onOpenStore={onOpenStore} />
            ))}
          </div>
        )}

        {/* 到底：仅文字提示 */}
        <div className="apg-end">
          <span className="apg-end-text">{t('appConsumer.common.reachedBottom', { defaultValue: '已經到我底線了' })}</span>
        </div>

        {filters.moreSheet}
      </div>
    </div>
  )
}
