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
 *   筛选胶囊(附近商家/全部分類/智能排序/神/筛选) → 筛选下拉面板 →
 *   秒杀竖列表(秒殺倒计时飘带+商圈距离 pill+已搶进度条 / 品牌|商品名+半年售+价格块+秒CTA+门店行) → 到底提示。
 *
 * 说明：图片为 AI 占位图（src/assets/consumer-home/）；品牌/商品/门店名/热词为占位数据，
 * 按口径不进入语言包；界面骨架文案已接 i18n（appConsumer 命名空间，复用既有 key）。
 */
import { useRef, useState, type KeyboardEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { REGION_LABEL_KEY as REGION_TITLE_KEY, REGION_TREE_DATA } from '@mftb/contracts/recommendConstants'
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

/** 秒杀竖列表（图3/图4；占位数据；theme: red=红底实拍 gold=黄底放射） */
const FLASH_LIST = [
  { key: 'f1', brand: '麥當勞', title: "10 元代金券（McDonald's）", sold: '半年售1884', tags: [], price: '8.4', origin: '10', discount: '秒殺價8.4折,降價超16%', grabPct: 46, theme: 'red', img: burgerImg },
  { key: 'f2', brand: '麥當勞', title: '麥樂雞 (9件)', sold: '半年售787', tags: ['1人餐'], price: '14', origin: '29.5', discount: '秒殺價4.7折,降價超53%', grabPct: 23, theme: 'gold', img: friedChickenImg },
  { key: 'f3', brand: '麥當勞', title: '厚椰拿鐵', sold: '半年售103', tags: ['1人餐'], price: '16.7', origin: '36', discount: '秒殺價4.6折,降價超54%', grabPct: 31, theme: 'gold', img: lemonTeaImg },
  { key: 'f4', brand: '麥當勞', title: '炒雙蛋火腿飽超值早晨套餐', sold: '半年售227', tags: ['1人餐'], price: '31', origin: '38', discount: '秒殺價8.2折,降價超18%', grabPct: 34, theme: 'gold', img: burgerImg },
]
/** 秒杀卡公共占位（商圈/距离/评分/门店/倒计时） */
const FLASH_COMMON = { area: '新口岸', dist: '6.9km', rating: '4.8分', shop: "McDonald's (利新店 Lei San)", countdown: '05:37:44' }

/** 「附近」页签（左列第一个）与其距离档（单选）；距离单位全球通用，不进语言包 */
const NEARBY_TAB = 'nearby'
const NEARBY_DISTANCES = ['500m', '1km', '2km', '3km']

/**
 * 「附近」面板的区域→商圈直接引用全系统唯一商圈树（recommendConstants.REGION_TREE_DATA），
 * 与定价/门店/订单同一口径，labelKey 已在 recommend 域的 area 与 region 两组 key 登记双语。
 * 不得在前端另造一份地名清单——历史教训：另造后与后端数据对不上，筛选必然空转。
 */
const AREA_TREE = REGION_TREE_DATA

/** 「分類」面板（多选）；emoji 为占位插画，待切图后替换 */
const CATEGORY_OPTIONS = [
  { key: 'appConsumer.groupBuy.category.hotpot', zh: '火鍋燒肉', emoji: '🍲' },
  { key: 'appConsumer.groupBuy.category.dessert', zh: '甜品飲品', emoji: '🧋' },
  { key: 'appConsumer.groupBuy.category.localCuisine', zh: '地方菜系', emoji: '🍛' },
  { key: 'appConsumer.groupBuy.category.exotic', zh: '異國料理', emoji: '🍣' },
  { key: 'appConsumer.groupBuy.category.fastFood', zh: '快餐小食', emoji: '🍔' },
  { key: 'appConsumer.groupBuy.category.congeeNoodle', zh: '粥粉麵飯', emoji: '🥟' },
  { key: 'appConsumer.groupBuy.category.buffet', zh: '自助餐', emoji: '🦞' },
  { key: 'appConsumer.groupBuy.category.service', zh: '生活服務', emoji: '🧰' },
  { key: 'appConsumer.groupBuy.category.leisure', zh: '休閒娛樂', emoji: '🏋️' },
  { key: 'appConsumer.groupBuy.category.beauty', zh: '美容美髮', emoji: '💇' },
]

/** 「排序」面板枚举（单选） */
const SORT_OPTIONS = [
  { key: 'appConsumer.groupBuy.sort.smart', zh: '智能排序' },
  { key: 'appConsumer.groupBuy.sort.distance', zh: '距離優先' },
  { key: 'appConsumer.groupBuy.sort.sales', zh: '銷量優先' },
  { key: 'appConsumer.groupBuy.sort.priceAsc', zh: '低價優先' },
  { key: 'appConsumer.groupBuy.sort.priceDesc', zh: '高價優先' },
]

/** 面板容器的无障碍标题（静态 key + 繁中兜底，供 i18n 引用门禁与语言包收割） */
const PANEL_TITLE = {
  nearby: { key: 'appConsumer.groupBuy.panel.nearby', zh: '附近篩選面板' },
  category: { key: 'appConsumer.groupBuy.panel.category', zh: '分類篩選面板' },
  sort: { key: 'appConsumer.groupBuy.panel.sort', zh: '排序篩選面板' },
} as const

export default function ConsumerGroupBuy({
  onBack,
  onSearch,
  onOpenStore,
  onOpenOrder,
}: {
  onBack: () => void
  onSearch: () => void
  onOpenStore?: (merchantId: string) => void
  onOpenOrder?: () => void
}) {
  const { t } = useTranslation()
  const bodyRef = useRef<HTMLDivElement>(null)
  const [scrolled, setScrolled] = useState(false)
  /** 页签行是否已吸顶（图4：吸顶后由圆形图标态切换为文字下划线态） */
  const [tabsStuck, setTabsStuck] = useState(false)
  /** 当前激活页签（仅视觉态，原型不做真实过滤） */
  const [activeTab, setActiveTab] = useState<number>(0)
  /** 当前展开的筛选面板：附近 / 分類 / 排序，同一时刻只开一个（null=收起） */
  const [openPanel, setOpenPanel] = useState<'nearby' | 'category' | 'sort' | null>(null)
  /** 附近-距离档（单选），null 表示未选距离 */
  const [distance, setDistance] = useState<string | null>(null)
  /** 左侧当前浏览的页签（附近 或 区域 value），僅控制右列展示哪组选项，不是选中态 */
  const [activeAreaTab, setActiveAreaTab] = useState<string>(NEARBY_TAB)
  /** 已选商圈（Region 编号）：各区域均多选，跨区域可同时保留 */
  const [selectedRegions, setSelectedRegions] = useState<number[]>([])
  /** 已选分类（多选，存 i18n key） */
  const [categories, setCategories] = useState<string[]>([])
  /** 排序方式（单选，存 i18n key） */
  const [sort, setSort] = useState<string>(SORT_OPTIONS[0].key)

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

  /** 整条团购商品是进店入口，Enter/Space 与点击等价 */
  const handleItemKey = (event: KeyboardEvent<HTMLDivElement>, merchantId: string) => {
    if (!onOpenStore) return
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      onOpenStore(merchantId)
    }
  }

  /** 点筛选按钮：展开对应面板，再点同一个收起 */
  const togglePanel = (panel: 'nearby' | 'category' | 'sort') => () =>
    setOpenPanel((prev) => (prev === panel ? null : panel))

  /** 距离档单选：与商圈集合互斥（同一个胶囊只能表达一种地点口径），选中即收起面板 */
  const pickDistance = (value: string) => () => {
    setDistance(value)
    setSelectedRegions([])
    setOpenPanel(null)
  }

  /** 商圈多选：可勾可消（跨区域可同时保留）；一勾商圈就清掉距离档 */
  const toggleRegion = (value: number) => () => {
    const next = selectedRegions.includes(value)
      ? selectedRegions.filter((v) => v !== value)
      : [...selectedRegions, value]
    if (next.length > selectedRegions.length) setDistance(null)
    setSelectedRegions(next)
  }

  /** 分类多选：面板保持展开，由 × 收起 */
  const toggleCategory = (key: string) => () =>
    setCategories((prev) => (prev.includes(key) ? prev.filter((x) => x !== key) : [...prev, key]))

  /** 排序单选：选中即生效并收起面板 */
  const pickSort = (key: string) => () => {
    setSort(key)
    setOpenPanel(null)
  }

  /** 当前浏览页签对应的区域节点（附近页签无区域节点，右列展示距离档） */
  const activeArea = AREA_TREE.find((a) => a.value === activeAreaTab)
  /** 多选回写：首个选中项 + 剩余数量（量词走模板，避免英文下语序错乱） */
  const summarize = (first: string, total: number) =>
    (total === 1 ? first : t('appConsumer.groupBuy.filter.multiSuffix', { first, rest: total - 1, defaultValue: '{{first}}+{{rest}}' }))
  const selectedRegionLabels = selectedRegions.map((v) => t(REGION_TITLE_KEY[v]))
  const nearbyLabel = selectedRegionLabels.length > 0
    ? summarize(selectedRegionLabels[0], selectedRegionLabels.length)
    : (distance ?? t('appConsumer.groupBuy.filter.nearby', { defaultValue: '附近' }))
  const selectedCategoryLabels = categories.map((k) => t(k))
  const categoryLabel = categories.length === 0
    ? t('appConsumer.groupBuy.filter.allCategories', { defaultValue: '全部分類' })
    : summarize(selectedCategoryLabels[0], categories.length)
  const sortLabel = t(sort)
  /** 箭头方向跟随面板开合（▲=展开中） */
  const caret = (panel: 'nearby' | 'category' | 'sort') => (openPanel === panel ? '▲' : '▼')

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
              onClick={() => setActiveTab(i)}
            >
              <i className="apg-tab-ico" aria-hidden="true">{tab.emoji}</i>
              <span className="apg-tab-label">{tab.key ? t(tab.key, { defaultValue: tab.zh }) : tab.zh}</span>
            </button>
          ))}
        </div>

        {/* 筛选胶囊：左段横滑（附近商家/全部分類/智能排序可展开面板 + 高亮胶囊），右段筛选图标固定 */}
        <div className="apg-sortbar">
          <div className="apg-sortbar-scroll">
            <button
              type="button"
              className={`apg-chip${openPanel === 'nearby' ? ' is-open' : ''}`}
              aria-expanded={openPanel === 'nearby'}
              onClick={togglePanel('nearby')}
            >
              {nearbyLabel === t('appConsumer.groupBuy.filter.nearby', { defaultValue: '附近' }) ? '附近商家' : nearbyLabel}
              {' '}
              <i className="apg-chip-caret" aria-hidden="true">{caret('nearby')}</i>
            </button>
            <button
              type="button"
              className={`apg-chip${openPanel === 'category' ? ' is-open' : ''}`}
              aria-expanded={openPanel === 'category'}
              onClick={togglePanel('category')}
            >
              {categoryLabel} <i className="apg-chip-caret" aria-hidden="true">{caret('category')}</i>
            </button>
            <button
              type="button"
              className={`apg-chip${openPanel === 'sort' ? ' is-open' : ''}`}
              aria-expanded={openPanel === 'sort'}
              onClick={togglePanel('sort')}
            >
              {sortLabel} <i className="apg-chip-caret" aria-hidden="true">{caret('sort')}</i>
            </button>
            <button type="button" className="apg-chip">
              <b className="apg-chip-shen-logo" aria-hidden="true">神</b>會員
            </button>
            <button type="button" className="apg-chip">
              <i className="apg-chip-ico apg-chip-ico--red" aria-hidden="true">¥</i>津貼神券
            </button>
            <button type="button" className="apg-chip">
              <i className="apg-chip-ico apg-chip-ico--vs" aria-hidden="true">VS</i>全澳格價
            </button>
            <button type="button" className="apg-chip">
              <i className="apg-chip-ico apg-chip-ico--thumb" aria-hidden="true">👍</i>好評高分
            </button>
          </div>
          <button type="button" className="apg-chip is-slider" aria-label={t('appConsumer.groupBuy.filter.sliders', { defaultValue: '篩選條件' })}>🎚</button>
        </div>

        {/* 筛选下拉面板：同一时刻只展开一个，底部 × 收起 */}
        {openPanel && (
          <div className="apg-panel-wrap">
            <div className="apg-panel" role="group" aria-label={t(PANEL_TITLE[openPanel].key, { defaultValue: PANEL_TITLE[openPanel].zh })}>
              {openPanel === 'nearby' && (
                <div className="apg-panel-near">
                  <div className="apg-panel-regions">
                    <button
                      type="button"
                      className={`apg-region${activeAreaTab === NEARBY_TAB ? ' is-on' : ''}`}
                      onClick={() => setActiveAreaTab(NEARBY_TAB)}
                    >
                      {t('appConsumer.groupBuy.filter.nearby', { defaultValue: '附近' })}
                    </button>
                    {AREA_TREE.map((area) => (
                      <button
                        key={area.value}
                        type="button"
                        className={`apg-region${activeAreaTab === area.value ? ' is-on' : ''}`}
                        onClick={() => setActiveAreaTab(String(area.value))}
                      >
                        {t(area.titleKey)}
                      </button>
                    ))}
                  </div>
                  <div className="apg-panel-options">
                    {activeArea
                      ? activeArea.children.map((child) => {
                        const label = t(child.titleKey)
                        const on = selectedRegions.includes(child.value)
                        return (
                          <button key={child.value} type="button" className="apg-optrow" aria-label={t('appConsumer.groupBuy.filter.pickDistrict', { value: label, defaultValue: '選擇商圈 {{value}}' })} onClick={toggleRegion(child.value)}>
                            <span className={on ? 'is-text-on' : ''}>{label}</span>
                            <i className={`apg-radio${on ? ' is-on' : ''}`} aria-hidden="true">{on ? '✓' : ''}</i>
                          </button>
                        )
                      })
                      : NEARBY_DISTANCES.map((d) => (
                        <button key={d} type="button" className="apg-optrow" aria-label={t('appConsumer.groupBuy.filter.pickDistance', { value: d, defaultValue: '選擇距離 {{value}}' })} onClick={pickDistance(d)}>
                          <span className={distance === d ? 'is-text-on' : ''}>{d}</span>
                          <i className={`apg-radio${distance === d ? ' is-on' : ''}`} aria-hidden="true">{distance === d ? '✓' : ''}</i>
                        </button>
                      ))}
                  </div>
                </div>
              )}

              {openPanel === 'category' && (
                <div className="apg-panel-cats">
                  {CATEGORY_OPTIONS.map((c) => {
                    const on = categories.includes(c.key)
                    return (
                      <button
                        key={c.key}
                        type="button"
                        className={`apg-catchip${on ? ' is-on' : ''}`}
                        aria-pressed={on}
                        onClick={toggleCategory(c.key)}
                      >
                        <span className="apg-catchip-emoji" aria-hidden="true">{c.emoji}</span>{t(c.key, { defaultValue: c.zh })}
                      </button>
                    )
                  })}
                </div>
              )}

              {openPanel === 'sort' && (
                <div className="apg-panel-sorts">
                  {SORT_OPTIONS.map((s) => (
                    <button key={s.key} type="button" className="apg-optrow" aria-label={t('appConsumer.groupBuy.filter.pickSort', { value: t(s.key, { defaultValue: s.zh }), defaultValue: '排序方式 {{value}}' })} onClick={pickSort(s.key)}>
                      <span className={sort === s.key ? 'is-text-on' : ''}>{t(s.key, { defaultValue: s.zh })}</span>
                      <i className={`apg-radio${sort === s.key ? ' is-on' : ''}`} aria-hidden="true">{sort === s.key ? '✓' : ''}</i>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <button type="button" className="apg-panel-close" aria-label={t('appConsumer.groupBuy.filter.closePanel', { defaultValue: '收起篩選面板' })} onClick={() => setOpenPanel(null)}>✕</button>
          </div>
        )}

        {/* 秒杀竖列表：左=秒殺飘带+图+商圈距离 pill+已搶进度条；右=品牌|商品+半年售+价格块+秒CTA+门店行 */}
        <div className="apg-flash-list">
          {FLASH_LIST.map((p) => (
            <div
              key={p.key}
              className={`apg-flash${onOpenStore ? ' is-clickable' : ''}`}
              role={onOpenStore ? 'button' : undefined}
              tabIndex={onOpenStore ? 0 : undefined}
              aria-label={onOpenStore ? t('appConsumer.common.enterStore', { shop: FLASH_COMMON.shop, defaultValue: '進入店鋪：{{shop}}' }) : undefined}
              onClick={onOpenStore ? openStore('g-seckill') : undefined}
              onKeyDown={onOpenStore ? (event) => handleItemKey(event, 'g-seckill') : undefined}
            >
              <div className="apg-flash-left">
                <div className="apg-flash-media">
                  <span className="apg-flash-ribbon">秒殺 {FLASH_COMMON.countdown}</span>
                  <img className={`apg-flash-img is-${p.theme}`} src={p.img} alt="" />
                  <span className="apg-flash-loc">{FLASH_COMMON.area} | {FLASH_COMMON.dist}</span>
                </div>
                <div className="apg-flash-progress">
                  <i className="apg-flash-progress-fill" style={{ width: `${p.grabPct}%` }} />
                  <span className="apg-flash-progress-txt">🔥 已搶{p.grabPct}%</span>
                </div>
              </div>
              <div className="apg-flash-main">
                <div className="apg-flash-title"><b>{p.brand}</b><i>|</i>{p.title}</div>
                <div className="apg-flash-tags">
                  <span className="apg-flash-sold">{p.sold}</span>
                  {p.tags.map((tag) => (
                    <span key={tag} className="apg-flash-tag">{tag}</span>
                  ))}
                </div>
                <div className="apg-flash-pricebox">
                  <span className="apg-flash-price"><i>$</i>{p.price} <s>${p.origin}</s></span>
                  <span className="apg-flash-discount">📉 {p.discount}</span>
                  <button type="button" className="apg-flash-cta" onClick={(e) => e.stopPropagation()}>
                    <span aria-hidden="true">⚡</span>秒 <i aria-hidden="true">›</i>
                  </button>
                </div>
                <div className="apg-flash-shop">{FLASH_COMMON.rating} | {FLASH_COMMON.shop} ›</div>
              </div>
            </div>
          ))}
        </div>

        {/* 到底 */}
        <div className="apg-end">
          <span className="apg-end-emoji" aria-hidden="true">🐝</span>
          <span className="apg-end-text">{t('appConsumer.common.reachedBottom', { defaultValue: '已經到我底線了' })}</span>
        </div>
      </div>
    </div>
  )
}
