/**
 * Copyright (c) 2026 fengsong7889. All Rights Reserved.
 *
 * 本文件为「MFTB 企业一体化管理平台软件」的组成部分。
 * 未经著作权人书面许可，不得使用、复制、修改、再分发或用于任何商业目的。
 * 完整许可条款见仓库根目录 LICENSE 文件。
 */

/**
 * MFOOD APP · 特惠團購页（按设计稿图1-3还原，纯前端静态原型）
 *
 * 入口：MFOOD 首页分类宫格「特價團購」（MfoodApp 根屏切换，底部 Tab「團購」同达）。
 * 结构（图1 上半）：
 *   品红渐变头部(标题+定位 / 搜索行+打卡+訂單 / 热词胶囊) → 促销 hero Banner →
 *   白色圆角区(横滑图标宫格) → 勁爆秒殺页签行(红梯lead+倒计时 / 四个带副标题页签) →
 *   横滑秒杀卡(折扣pill+标题+品牌行+秒殺價价格条) → 更多優惠 →
 * （图2 下半）双列活动 Banner → 圆形图标页签行 → 筛选胶囊 →
 * （图3 吸顶）滚动后白色吸顶搜索行 + 文字下划线页签行 → 瀑布流(共享 GroupBuyFeedCard MFOOD 变体) → 到底。
 *
 * 说明：占位数据与占位文案口径同 MfoodHome（不进语言包，二期统一接 i18n）；
 * 品红头部等设计稿色以全局令牌渐变近似，不新增裸色值（主题棘轮门禁）。
 */
import { useRef, useState } from 'react'
import burgerImg from '@/assets/consumer-home/burger.jpg'
import friedChickenImg from '@/assets/consumer-home/friedchicken.jpg'
import fishPotImg from '@/assets/consumer-home/fishpot.jpg'
import lemonTeaImg from '@/assets/consumer-home/lemontea.jpg'
import GroupBuyFeedCard from './GroupBuyFeedCard'
import { FEED } from './MfoodGroupFeed'

/** 定位（占位数据） */
const LOCATION = '財富世家半山町'
/** 搜索框占位关键词（占位数据） */
const KEYWORD = '搜尋店名或菜品'

/** 热词胶囊（图1：红/绿两色；占位数据） */
const HOT_WORDS = [
  { text: '凱旋門咖啡廳自助餐', tone: 'red' },
  { text: '🔥遊泰號招牌船麵', tone: 'green' },
]

/** 白色圆角区横滑图标宫格（图1；tile 底色 a/b/c/d 循环软色令牌；占位数据） */
const GRID_ICONS = [
  { zh: '每日簽到', emoji: '🗓️', badge: '領積分', tile: 'a' },
  { zh: '會員中心', emoji: '👑', badge: '', tile: 'b' },
  { zh: '附近商家', emoji: '📍', badge: '', tile: 'c' },
  { zh: '打卡榜', emoji: '📌', badge: '', tile: 'd' },
  { zh: '生活所需', emoji: '🛍️', badge: '', tile: 'a' },
  { zh: '自助餐', emoji: '🍽️', badge: '', tile: 'b' },
  { zh: '玩轉', emoji: '🎡', badge: '', tile: 'c' },
]

/** 勁爆秒殺页签行右侧四页签（主标题+红色副标题；占位数据） */
const FLASH_TABS = [
  { zh: '發現好券', sub: '低至3折' },
  { zh: '勁爆必買', sub: '人氣熱賣' },
  { zh: '現金券', sub: '埋單即用' },
  { zh: '自助餐', sub: '放題優惠' },
]
/** 勁爆秒殺倒计时（占位静态值） */
const FLASH_COUNTDOWN = '01:41:32'

/** 横滑秒杀卡（图1；占位数据） */
const FLASH_CARDS = [
  { key: 'fc1', title: '$10代金券', disc: '8.4折 | 即慳1.6', price: '8.35', img: fishPotImg },
  { key: 'fc2', title: '麥樂雞(9件)', disc: '4.8折 | 即慳15.5', price: '14', img: friedChickenImg },
  { key: 'fc3', title: '厚椰拿鐵（凍）', disc: '4.7折 | 即慳19.3', price: '16.7', img: lemonTeaImg },
  { key: 'fc4', title: '炒雙蛋火腿飽超值早晨套餐', disc: '8.2折 | 即慳7', price: '31', img: burgerImg },
]
/** 横滑卡品牌行（占位） */
const FLASH_BRAND = "McDonald's (…"

/** 双列活动 Banner（图2；占位文案，CSS 渐变占位待切图） */
const DUO_BANNERS = [
  { key: 'buffet', tone: 'dark', title: '「全澳」自助餐', sub: '精選推薦', cta: '6折起!' },
  { key: 'last', tone: 'red', title: '最後1日搶', sub: '本週秒殺 不可錯過', cta: '立即搶購' },
]

/** 圆形图标页签行（图2 未吸顶态；图3 吸顶后同数据切文字下划线态；占位数据） */
const ROUND_TABS = [
  { key: 'pick', label: '優選', emoji: '👍' },
  { key: 'flash', label: '⚡秒殺⏰', emoji: '⏰' },
  { key: 'chain', label: '連環賞推薦', emoji: '🎫' },
  { key: 'area', label: '片區優惠', emoji: '🗺️' },
  { key: 'vip', label: '專屬優惠', emoji: '🏆' },
  { key: 'near', label: '附近好店', emoji: '🏪' },
]

/** 筛选胶囊（图2；占位，原型不做真实过滤） */
const FILTER_CHIPS = ['附近', '全部分類', '默認排序', '篩選']

/** 瀑布流团购券：数据与首页「特價團購」瀑布流完全一致（复用 MfoodHome.FEED 唯一真源，紫色搶購态同首页） */

export default function MfoodGroupBuy({
  onBack,
  onSearch,
  onOpenStore,
}: {
  onBack: () => void
  onSearch?: () => void
  onOpenStore?: (merchantId: string) => void
}) {
  const bodyRef = useRef<HTMLDivElement>(null)
  /** 滚动过阈值：白色吸顶搜索行出现（图2/图3） */
  const [scrolled, setScrolled] = useState(false)
  /** 再过阈值：页签行吸顶切文字下划线态（图3） */
  const [tabsStuck, setTabsStuck] = useState(false)
  /** 当前激活页签（仅视觉态） */
  const [activeTab, setActiveTab] = useState(0)

  const handleScroll = () => {
    const el = bodyRef.current
    if (!el) return
    const next = el.scrollTop > 36
    setScrolled((prev) => (prev === next ? prev : next))
    const stuck = el.scrollTop > 300
    setTabsStuck((prev) => (prev === stuck ? prev : stuck))
  }

  return (
    <>
      {/* 吸顶搜索行 + 吸顶页签行（图2/图3；未滚动时隐藏） */}
      <div className={`mpg-sticky-header${scrolled ? ' is-visible' : ''}`}>
        <div className="mpg-sticky-row">
          <button type="button" className="mpg-sticky-search" onClick={onSearch}>
            <span aria-hidden="true">🔍</span>
            <span>{KEYWORD}</span>
            <span className="mpg-sticky-search-btn">搜索</span>
          </button>
          <span className="mpg-sticky-loc">📍 {LOCATION} ▼</span>
        </div>
        {tabsStuck && (
          <div className="mpg-sticky-tabs">
            {ROUND_TABS.map((tb, i) => (
              <button key={tb.key} type="button" className={`mpg-sticky-tab${activeTab === i ? ' is-on' : ''}`} onClick={() => setActiveTab(i)}>
                {tb.label}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="ap-body mpg-body mpg-root" ref={bodyRef} onScroll={handleScroll}>
        {/* ═══ 品红渐变头部（图1） ═══ */}
        <div className="mpg-head">
          <div className="mpg-head-top">
            <button type="button" className="mpg-title" onClick={onBack}>
              特<i aria-hidden="true">🐝</i>惠<i aria-hidden="true">🐝</i>團<i aria-hidden="true">🐝</i>購
            </button>
            <span className="mpg-loc">📍 {LOCATION} ▼</span>
          </div>
          <div className="mpg-head-search">
            <button type="button" className="mpg-searchbox" onClick={onSearch}>
              <span aria-hidden="true">🔍</span>
              <span>{KEYWORD}</span>
              <span className="mpg-searchbox-btn">搜索</span>
            </button>
            <div className="mpg-head-entries">
              <button type="button" className="mpg-head-entry">
                <i aria-hidden="true">✅</i>打卡
              </button>
              <button type="button" className="mpg-head-entry">
                <i aria-hidden="true">📋</i>訂單
              </button>
            </div>
          </div>
          <div className="mpg-hotwords">
            {HOT_WORDS.map((w) => (
              <button key={w.text} type="button" className={`mpg-hotword mpg-hotword--${w.tone}`}>
                {w.text}
              </button>
            ))}
          </div>
        </div>

        {/* ═══ 促销 hero Banner（占位渐变待切图） ═══ */}
        <div className="mpg-hero">
          <span className="mpg-hero-tag">mFood·團購</span>
          <div className="mpg-hero-title">週五0點 限時開搶</div>
          <div className="mpg-hero-sub">團購秒殺 助力社區消費</div>
          <span className="mpg-hero-pill">買團購券 領獎賞 消費賞專屬補貼</span>
        </div>

        {/* ═══ 白色圆角区：横滑图标宫格 ═══ */}
        <div className="mpg-sheet">
          <div className="mpg-icons">
            {GRID_ICONS.map((c) => (
              <button key={c.zh} type="button" className="mpg-icon">
                {c.badge && <span className="mpg-icon-badge">{c.badge}</span>}
                <span className={`mpg-icon-tile mpg-icon-tile--${c.tile}`} aria-hidden="true">{c.emoji}</span>
                <span className="mpg-icon-label">{c.zh}</span>
              </button>
            ))}
          </div>

          {/* 勁爆秒殺页签行：红梯 lead + 倒计时 / 四页签 */}
          <div className="mpg-flashtabs">
            <button type="button" className="mpg-flashtab-lead">
              勁爆秒殺
              <span className="mpg-flashtab-cd">{FLASH_COUNTDOWN}</span>
            </button>
            <div className="mpg-flashtabs-scroll">
              {FLASH_TABS.map((tb) => (
                <button key={tb.zh} type="button" className="mpg-flashtab">
                  <b>{tb.zh}</b>
                  <i>{tb.sub}</i>
                </button>
              ))}
            </div>
          </div>

          {/* 横滑秒杀卡 */}
          <div className="mpg-fcards">
            {FLASH_CARDS.map((c) => (
              <button key={c.key} type="button" className="mpg-fcard" onClick={() => onOpenStore?.(c.key)}>
                <span className="mpg-fcard-media">
                  <img className="mpg-fcard-img" src={c.img} alt={c.title} />
                  <span className="mpg-fcard-disc">{c.disc}</span>
                </span>
                <span className="mpg-fcard-title">{c.title}</span>
                <span className="mpg-fcard-brand"><i aria-hidden="true">M</i>{FLASH_BRAND}</span>
                <span className="mpg-fcard-price">
                  <b>秒殺價</b>
                  <strong>${c.price}</strong>
                </span>
              </button>
            ))}
          </div>
          <div className="mpg-more">
            <button type="button">更多優惠 ›</button>
          </div>
        </div>

        {/* ═══ 双列活动 Banner（图2） ═══ */}
        <div className="mpg-duo">
          {DUO_BANNERS.map((b) => (
            <button key={b.key} type="button" className={`mpg-duo-card mpg-duo-card--${b.tone}`}>
              <span className="mpg-duo-title">{b.title}</span>
              <span className="mpg-duo-sub">{b.sub}</span>
              <span className="mpg-duo-cta">{b.cta}</span>
            </button>
          ))}
        </div>

        {/* ═══ 圆形图标页签行（未吸顶态；吸顶后由吸顶文字行接管，图3） ═══ */}
        <div className="mpg-roundtabs">
          {ROUND_TABS.map((tb, i) => (
            <button key={tb.key} type="button" className={`mpg-roundtab${activeTab === i ? ' is-on' : ''}`} onClick={() => setActiveTab(i)}>
              <span className="mpg-roundtab-ico" aria-hidden="true">{tb.emoji}</span>
              <span className="mpg-roundtab-label">{tb.label}</span>
            </button>
          ))}
        </div>

        {/* 筛选胶囊（图2） */}
        <div className="mpg-chips">
          {FILTER_CHIPS.map((c) => (
            <button key={c} type="button" className="mpg-chip">
              {c} <i aria-hidden="true">▼</i>
            </button>
          ))}
        </div>

        {/* ═══ 瀑布流（共享 GroupBuyFeedCard；数据与主题同首页「特價團購」） ═══ */}
        <div className="apf-feed-list">
          {FEED.map((it) => (
            <GroupBuyFeedCard key={it.key} item={it} theme="purple" onOpenStore={onOpenStore} />
          ))}
        </div>

        {/* 到底：仅文字提示 */}
        <div className="mpg-end">已經到底了</div>
      </div>
    </>
  )
}
