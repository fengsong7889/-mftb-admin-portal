/**
 * 用户端 APP · 特價團購页（按设计稿还原，纯前端静态原型）
 *
 * 入口：首页「特價團購」小模块点击进入（见 ConsumerHome 的 onOpenGroupBuy）。
 * 结构：粉色头部(返回+定位) → 搜索行 + 独立訂單入口 → 日料 Hero → 十宫格分类 → 快捷胶囊 →
 *       促销位 → 標題欄(横滑) → 標題欄(双列) → 红包券 → 筛选栏 → 附近/分類/排序下拉面板 →
 *       竖向商品列表 → 到底提示。
 *
 * 说明：图片为 AI 占位图（src/assets/consumer-home/）；界面文案已接 i18n（appConsumer 命名空间）。
 * 商品/券/门店名仍为占位数据（待后端只读接口接入），按口径不进入语言包。
 */
import { useRef, useState, type KeyboardEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { REGION_LABEL_KEY as REGION_TITLE_KEY, REGION_TREE_DATA } from '@mftb/contracts/recommendConstants'
import groupbuyHeroImg from '@/assets/consumer-home/groupbuy-hero.jpg'
import bbqImg from '@/assets/consumer-home/bbq.jpg'
import riceballImg from '@/assets/consumer-home/riceball.jpg'
import friedChickenImg from '@/assets/consumer-home/friedchicken.jpg'
import fishPotImg from '@/assets/consumer-home/fishpot.jpg'
import burgerImg from '@/assets/consumer-home/burger.jpg'
import lemonTeaImg from '@/assets/consumer-home/lemontea.jpg'

/** 十宮格分类：key 为 i18n 路径，zh 为繁中兼底值 */
const CATS = [
  { key: 'appConsumer.groupBuy.cat.hotpot', zh: '火鍋', img: fishPotImg },
  { key: 'appConsumer.groupBuy.cat.bbq', zh: '燒烤烤肉', img: bbqImg },
  { key: 'appConsumer.groupBuy.cat.drink', zh: '甜品飲料', img: lemonTeaImg },
  { key: 'appConsumer.groupBuy.cat.western', zh: '西餐扒飯', img: burgerImg },
  { key: 'appConsumer.groupBuy.cat.beauty', zh: '美容美髮', img: '' },
  { key: 'appConsumer.groupBuy.cat.buffet', zh: '自助餐', img: friedChickenImg },
  { key: 'appConsumer.groupBuy.cat.chaChaCanTeng', zh: '茶餐廳', img: riceballImg },
  { key: 'appConsumer.groupBuy.cat.burger', zh: '漢堡小食', img: burgerImg },
  { key: 'appConsumer.groupBuy.cat.exotic', zh: '異域料理', img: fishPotImg },
  { key: 'appConsumer.groupBuy.cat.service', zh: '生活服務', img: '' },
]

const PILLS = [
  { key: 'appConsumer.groupBuy.pill.member', zh: '會員中心' },
  { key: 'appConsumer.groupBuy.pill.checkIn', zh: '每日簽到' },
  { key: 'appConsumer.groupBuy.pill.hotRank', zh: '打卡熱榜' },
  { key: 'appConsumer.groupBuy.pill.nearbyMerchant', zh: '附近商家' },
]

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

const FILTERS = [
  { key: 'appConsumer.groupBuy.chip.deal', zh: '特價' },
  { key: 'appConsumer.groupBuy.chip.recommend', zh: '推薦' },
  { key: 'appConsumer.groupBuy.chip.merchant', zh: '商家' },
  { key: 'appConsumer.groupBuy.chip.chaChaCanTeng', zh: '茶餐廳' },
  { key: 'appConsumer.groupBuy.chip.leisure', zh: '休閒娛樂' },
]

/** 「附近」页签（左列第一个）与其距离档（单选）；距离单位全球通用，不进语言包 */
const NEARBY_TAB = 'nearby'
const NEARBY_DISTANCES = ['500m', '1km', '2km', '3km']

/**
 * 「附近」面板的区域→商圈直接引用全系统唯一商圈树（recommendConstants.REGION_TREE_DATA），
 * 与定价/门店/订单同一口径，labelKey 已在 recommend 域的 area 与 region 两组 key 登记双语。
 * 不得在前端另造一份地名清单——历史教训：另造后与后端数据对不上，筛选必然空转。
 */
const AREA_TREE = REGION_TREE_DATA

/** 「分類」面板（图2 十类，多选）；emoji 为占位插画，待切图后替换 */
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

/** 「排序」面板枚举（图3，单选） */
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
  const [filter, setFilter] = useState<string>(FILTERS[0].key)
  /** 当前展开的筛选面板：附近 / 分類 / 排序，同一时刻只开一个（null=收起） */
  const [openPanel, setOpenPanel] = useState<'nearby' | 'category' | 'sort' | null>(null)
  /** 附近-距离档（单选），null 表示未选距离 */
  const [distance, setDistance] = useState<string | null>(null)
  /** 左侧当前浏览的页签（附近 或 区域 value），僅控制右列展示哪组选项，不是选中态 */
  const [activeTab, setActiveTab] = useState<string>(NEARBY_TAB)
  /** 已选商圈（Region 编号）：各区域均多选，跨区域可同时保留 */
  const [selectedRegions, setSelectedRegions] = useState<number[]>([])
  /** 已选分类（多选，存 i18n key） */
  const [categories, setCategories] = useState<string[]>([])
  /** 排序方式（单选，存 i18n key） */
  const [sort, setSort] = useState<string>(SORT_OPTIONS[0].key)

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
  const activeArea = AREA_TREE.find((a) => a.value === activeTab)
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
    <>
      {/* 粉色头部：可折叠吸顶（滚动后仅保留搜索行） */}
      <div className={`apg-header${scrolled ? ' is-scrolled' : ''}`}>
        <div className="apg-header-top">
          <button type="button" className="apg-back" onClick={onBack} aria-label={t('appConsumer.common.back', { defaultValue: '返回' })}>‹</button>
          <span className="apg-title">{t('appConsumer.groupBuy.title', { defaultValue: '特價團購' })}</span>
          <span className="apg-loc">
            <span aria-hidden="true">📍</span>{t('appConsumer.common.location', { defaultValue: '威尼斯人A座' })} <i aria-hidden="true">›</i>
          </span>
        </div>
        <div className="apg-header-search">
          {scrolled && (
            <button type="button" className="apg-back apg-back-inline" onClick={onBack} aria-label={t('appConsumer.common.back', { defaultValue: '返回' })}>‹</button>
          )}
          <button type="button" className="apg-searchrow" onClick={onSearch}>
            <span className="apc-search-ico" aria-hidden="true">🔍</span>
            <span className="apg-hot">{t('appConsumer.groupBuy.hotSearchHint', { defaultValue: '熱搜：滾動字體後台傳' })}</span>
            <span className="apg-search-btn">{t('appConsumer.common.search', { defaultValue: '搜索' })}</span>
          </button>
          {/* 訂單是独立入口（跳底部訂單 Tab），不能嵌在搜索框按钮内 */}
          {onOpenOrder && (
            <button type="button" className="apg-order-btn" onClick={onOpenOrder}>
              {t('appConsumer.common.order', { defaultValue: '訂單' })}
            </button>
          )}
          {scrolled && (
            <span className="apg-header-loc"><span aria-hidden="true">📍</span><i>{t('appConsumer.common.location', { defaultValue: '威尼斯人A座' })}</i></span>
          )}
        </div>
      </div>

      <div className="ap-body apg-body" ref={bodyRef} onScroll={handleScroll}>

        {/* 日料 Hero */}
        <div
          className="apg-hero"
          style={{ background: `linear-gradient(90deg, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0.1) 60%, rgba(0,0,0,0) 100%), url(${groupbuyHeroImg}) center/cover no-repeat` }}
        >
          <span className="apg-hero-badge">{t('appConsumer.common.heroBadge', { defaultValue: '最強澳門日料Top.1' })}</span>
          <span className="apg-hero-title"><i>$</i>90<em>{t('appConsumer.common.heroVoucherWord', { defaultValue: '代' })}</em><i>$</i>100</span>
          <span className="apg-hero-sub">{t('appConsumer.common.heroSub', { defaultValue: '單次可用5張' })}</span>
        </div>

        {/* 十宮格分類 */}
        <div className="apg-cats">
          {CATS.map((c) => (
            <button key={c.key} type="button" className="apg-cat">
              {c.img
                ? <img className="apg-cat-img" src={c.img} alt="" />
                : <span className="apg-cat-emoji" aria-hidden="true">🏷️</span>}
              <span className="apg-cat-label">{t(c.key, { defaultValue: c.zh })}</span>
            </button>
          ))}
        </div>
        <div className="apg-dots" aria-hidden="true"><i className="is-on" /><i /><i /><i /></div>

        {/* 快捷胶囊 */}
        <div className="apg-pills">
          {PILLS.map((p, i) => (
            <button key={p.key} type="button" className={`apg-pill${i === 0 ? ' is-green' : ''}`}>{t(p.key, { defaultValue: p.zh })}</button>
          ))}
        </div>

        {/* 促銷位 */}
        <div className="apc-promo" style={{ background: 'linear-gradient(120deg,#5B8DEF,#7B4DFF)' }}>
          <span className="apc-promo-title">{t('appConsumer.common.promoLead', { defaultValue: '盒你一起' })}<b>{t('appConsumer.common.promoHighlight', { defaultValue: '大發現' })}</b></span>
          <span className="apc-promo-emoji" aria-hidden="true">🧧</span>
        </div>

        {/* 標題欄 · 横滑 */}
        <section className="apc-sec">
          <header className="apc-sec-head">
            <span className="apc-sec-title">{t('appConsumer.common.sectionPlaceholder', { defaultValue: '標題欄' })}</span>
            <span className="apc-sec-sub">{t('appConsumer.common.sectionSubLow30', { defaultValue: '低至3折' })}</span>
          </header>
          <div className="apc-hscroll">
            {SMALL_ROW.map((it) => (
              <button key={it.key} type="button" className="apc-hcard" onClick={openStore('g-pizza')}>
                <img className="apc-thumb" src={it.img} alt={it.title} />
                <span className="apc-hcard-title">{it.title}</span>
                <span className="apg-price-origin">
                  <span className="apc-price"><i>¥</i>{it.price}<em>{t('appConsumer.common.priceFrom', { defaultValue: '起' })}</em></span>
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
                <span className="apc-sec-title">{t('appConsumer.common.sectionPlaceholder', { defaultValue: '標題欄' })}</span>
                <span className="apc-sec-sub">{t('appConsumer.common.sectionSubLow30', { defaultValue: '低至3折' })}</span>
              </header>
              {KFC_COL.map((it) => (
                <button key={`${col}-${it.key}`} type="button" className="apc-gcard" onClick={openStore('g-kfc')}>
                  <span className="apg-gcard-kfc">
                    <img className="apg-gcard-img" src={it.img} alt={it.title} />
                    <span className="apg-gcard-info">
                      <span className="apc-gcard-title">{it.title}</span>
                      <span className="apg-badge">8.8折</span>
                      <span className="apg-price-origin">
                        <span className="apc-price"><i>¥</i>{it.price}<em>{t('appConsumer.common.priceFrom', { defaultValue: '起' })}</em></span>
                        <i className="apc-fcard-strike">¥{it.origin}</i>
                      </span>
                    </span>
                  </span>
                </button>
              ))}
              <button type="button" className="apc-more-center" style={{ marginTop: 8 }}>{t('appConsumer.common.viewMore', { defaultValue: '查看更多' })}</button>
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
                <i>{t('appConsumer.common.couponNote', { defaultValue: '激賞圍購神券 · 1月10日到期' })}</i>
              </span>
              <span className="apc-coupon-use">{t('appConsumer.common.useNow', { defaultValue: '去使用' })}</span>
            </button>
          ))}
        </div>

        {/* 篩選栏 */}
        <div className="apg-filters">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              className={filter === f.key ? 'is-on' : ''}
              onClick={() => setFilter(f.key)}
            >
              {t(f.key, { defaultValue: f.zh })}
            </button>
          ))}
        </div>
        {/* 筛选胶囊：黄底为常态（对齐设计稿），选中靠文案本身表达；展开中加深一档并翻箭头 */}
        <div className="apg-sortbar">
          <button
            type="button"
            className={`apg-chip${openPanel === 'nearby' ? ' is-open' : ''}`}
            aria-expanded={openPanel === 'nearby'}
            onClick={togglePanel('nearby')}
          >
            {nearbyLabel} <i className="apg-chip-caret" aria-hidden="true">{caret('nearby')}</i>
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
          <button type="button" className="is-hl">{t('appConsumer.groupBuy.filter.vipCard', { defaultValue: '神會員' })}</button>
          <button type="button" className="is-hl">{t('appConsumer.groupBuy.filter.subsidyCoupon', { defaultValue: '津貼神券' })}</button>
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
                      className={`apg-region${activeTab === NEARBY_TAB ? ' is-on' : ''}`}
                      onClick={() => setActiveTab(NEARBY_TAB)}
                    >
                      {t('appConsumer.groupBuy.filter.nearby', { defaultValue: '附近' })}
                    </button>
                    {AREA_TREE.map((area) => (
                      <button
                        key={area.value}
                        type="button"
                        className={`apg-region${activeTab === area.value ? ' is-on' : ''}`}
                        onClick={() => setActiveTab(String(area.value))}
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

        {/* 竖向商品列表 */}
        <div className="apg-list">
          {PRODUCTS.map((p) => (
            <div
              key={p.key}
              className={`apg-item${p.hot ? ' is-hot' : ''}${onOpenStore ? ' is-clickable' : ''}`}
              role={onOpenStore ? 'button' : undefined}
              tabIndex={onOpenStore ? 0 : undefined}
              aria-label={onOpenStore ? t('appConsumer.common.enterStore', { shop: p.shop, defaultValue: '進入店鋪：{{shop}}' }) : undefined}
              onClick={onOpenStore ? openStore('g-pizza') : undefined}
              onKeyDown={onOpenStore ? (event) => handleItemKey(event, 'g-pizza') : undefined}
            >
              <img className="apg-item-img" src={p.img} alt="" />
              <div className="apg-item-main">
                <div className="apg-item-title">{p.title}</div>
                <div className="apg-item-sold">半年售650 <i>{p.tag}</i></div>
                <div className="apg-item-price">
                  <span className="apc-price apc-price-lg"><i>¥</i>{p.price}<em>{t('appConsumer.common.priceFrom', { defaultValue: '起' })}</em></span>
                  <span className="apc-fcard-strike">¥{p.origin}</span>
                </div>
                <div className="apg-item-save">{p.save}</div>
                <div className="apg-item-shop">{p.dist} | {p.shop}</div>
              </div>
              <span className="apg-grab">{t('appConsumer.common.grab', { defaultValue: '搶' })}</span>
            </div>
          ))}
        </div>

        {/* 到底 */}
        <div className="apg-end">
          <span className="apg-end-emoji" aria-hidden="true">🐝</span>
          <span className="apg-end-text">{t('appConsumer.common.reachedBottom', { defaultValue: '已經到我底線了' })}</span>
        </div>
      </div>
    </>
  )
}
