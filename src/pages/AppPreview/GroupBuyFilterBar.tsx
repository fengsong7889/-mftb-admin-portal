/**
 * Copyright (c) 2026 fengsong7889. All Rights Reserved.
 *
 * 本文件为「MFTB 企业一体化管理平台软件」的组成部分。
 * 未经著作权人书面许可，不得使用、复制、修改、再分发或用于任何商业目的。
 * 完整许可条款见仓库根目录 LICENSE 文件。
 */

/**
 * 特惠團購筛选区 · 共享 hook（閃蜂 ConsumerGroupBuy 与 MFOOD MfoodGroupBuy 单一真源）
 *
 * 四个筛选项（附近/全部分類/排序/更多篩選）的 state、选项常量与 JSX 全部内聚于此，
 * 两页各取两个出口按原 DOM 位置渲染：
 *   - sortbar：筛选胶囊行 + 三个下拉面板（页签行之后）
 *   - moreSheet：更多篩選底部 sheet（滚动容器末尾——.apg-more 是 sticky bottom:0，DOM 位置不可提前）
 *
 * 原型仅视觉态，不做真实过滤；商圈树引用全系统唯一 REGION_TREE_DATA（不得另造地名清单）。
 * 两页差异全部走参数：
 *   - nearbyChipLabel：未选时文案（閃蜂「附近商家」/ MFOOD「附近」）
 *   - showHighlightChips：营销高亮胶囊（神會員/津貼神券/全澳格價/好評高分）仅閃蜂展示
 *   - showLayoutToggle：「列表大小圖切換」模块由父级按页签传入（閃蜂=優選商家、MFOOD=附近好店）
 *   - preferredLayout / onPreferredLayoutChange：大小图状态经说明面板闭环双机同步
 */
/* eslint-disable react-refresh/only-export-components -- 本文件是筛选状态 hook 与非组件导出的单一真源，不导出组件 */
import { useEffect, useState, type Dispatch, type ReactElement, type SetStateAction } from 'react'
import { useTranslation } from 'react-i18next'
import { REGION_LABEL_KEY as REGION_TITLE_KEY, REGION_TREE_DATA } from '@mftb/contracts/recommendConstants'
import { SpecField } from './SpecHighlight'

/* ─── 选项常量（原 ConsumerGroupBuy 私有，现两页共享单一真源） ─── */

/** 「附近」页签（左列第一个）与其距离档（单选）；距离单位全球通用，不进语言包 */
const NEARBY_TAB = 'nearby'
const NEARBY_DISTANCES = ['500m', '1km', '2km', '3km']
/** 「全部」占位文案（一期 UI 先行暂不进语言包，与更多篩選占位同口径） */
const ALL_LABEL = '全部'

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

/**
 * 「更多篩選」底部面板占位文案（照抄设计稿图2-5；与热词/秒杀卡同口径：
 * 占位数据暂不进语言包，二期统一接 i18n，避免一期 UI 先行时新增未收录 key 触发门禁）。
 * 营业时间/使用人数为单选胶囊；偏好优惠/店铺服务为多选胶囊。
 */
const MORE_HOURS = ['0-5 時', '5-10 時', '10-14 時', '14-17 時', '17-21 時', '21-24 時', '24 小時營業']
const MORE_PEOPLE = ['單人', '雙人', '3-4 人', '5-10 人', '10 人以上']
/** 偏好优惠：圆形渐变图标 + 文案；icon 为占位 emoji/字样，待切图后替换 */
const MORE_PREFS = [
  { key: 'vip', label: '神會員', icon: '👑', tone: 'crown' },
  { key: 'coupon', label: '津貼神券', icon: '🎫', tone: 'coupon' },
  { key: 'vs', label: '全澳格價', icon: 'VS', tone: 'vs' },
  { key: 'hot', label: '人氣推薦', icon: '🔥', tone: 'fire' },
  { key: 'chain', label: '連鎖店鋪', icon: '🏪', tone: 'chain' },
  { key: 'praise', label: '好評高分', icon: '👍', tone: 'thumb' },
  { key: 'service', label: '服務優先', icon: '🛎️', tone: 'service' },
  { key: 'taste', label: '口味優先', icon: '🌶️', tone: 'taste' },
  { key: 'newstore', label: '新店入駐', icon: 'New', tone: 'new' },
  { key: 'env', label: '環境優先', icon: '🌴', tone: 'env' },
  { key: 'healthy', label: '食得健康', icon: '🥗', tone: 'healthy' },
]
/** 店铺服务（多选；设计稿含重名条目，渲染 key 需带下标） */
const MORE_SERVICES = [
  '有 WIFI', '免費停車', '付費停車', '可包場',
  '可預點餐', '可電話預定', '等位區', '宴會廳',
  '有包廂', '寶寶椅', '寵物禁入', '無煙餐廳',
  '吸煙區', '有露臺', '室內衛生間', '有充電寶',
  '無隱形消費', '不主動推銷', '不滿意重做', '保證正品',
  '有演出', '流行音樂主體', '有卡座', '工業風裝修',
  '有舞台', '有骰子', '可容納 400 人', '可存酒',
  '啤酒', '敘利亞風格', '復古裝修', '中國風裝修',
  '歐式裝修', '有調酒師', '團隊包場', '頂級音響',
  '更衣室', '寄存櫃', '有沐浴房', '充電寶',
  '不滿意重拍', '可開發票', '專業化妝', '有公主',
  '自助購買酒水', '超大舞池', '隱藏式酒吧', '觀影享受',
  '電競主體', '有沙發位', '爵士樂', '景觀位',
  '威士忌', '雪茄吧', '自助點餐', '空調開放',
  '可手機充電', '可電話預定', 'VIP 包廂', '可刷卡',
  '一對一專屬服務', '保證正品', '沙發座', '電影房',
  '汗蒸房', '大型溫泉游泳池',
]
/** 人均筛选器价格档（$1-$200+，到顶显示 +） */
const PRICE_MIN = 1
const PRICE_MAX = 200

export interface UseGroupBuyFiltersOptions {
  /** 附近胶囊未选时的文案（閃蜂「附近商家」/ MFOOD「附近」） */
  nearbyChipLabel: string
  /** 营销高亮胶囊（神會員/津貼神券/全澳格價/好評高分）仅閃蜂 true */
  showHighlightChips?: boolean
  /** 「列表大小圖切換」模块显隐：父级按页签传入（優選商家/附近好店才 true） */
  showLayoutToggle: boolean
  /** 大小圖模式（说明面板切换器下发；缺省大圖） */
  preferredLayout?: 'small' | 'large'
  /** 篩選面板内切换上报（说明面板闭环后下发另一台手机） */
  onPreferredLayoutChange?: (mode: 'small' | 'large') => void
}

export interface GroupBuyFilters {
  /** 筛选胶囊行 + 三个下拉面板（渲染于页签行之后） */
  sortbar: ReactElement
  /** 更多篩選底部 sheet（渲染于滚动容器末尾） */
  moreSheet: ReactElement
  /** 当前大小圖模式（商家瀑布流渲染卡片时取用；含篩選面板内切换的本地即时值） */
  layout: 'small' | 'large'
}

export function useGroupBuyFilters({
  nearbyChipLabel,
  showHighlightChips = false,
  showLayoutToggle,
  preferredLayout,
  onPreferredLayoutChange,
}: UseGroupBuyFiltersOptions): GroupBuyFilters {
  const { t } = useTranslation()
  /** 当前展开的筛选面板：附近 / 分類 / 排序 / 更多篩選，同一时刻只开一个（null=收起） */
  const [openPanel, setOpenPanel] = useState<'nearby' | 'category' | 'sort' | 'more' | null>(null)
  /** 附近-距离档（单选），null 表示未选距离 */
  const [distance, setDistance] = useState<string | null>(null)
  /** 左侧当前浏览的页签（附近 或 区域 value），僅控制右列展示哪组选项，不是选中态 */
  const [activeAreaTab, setActiveAreaTab] = useState<string>(NEARBY_TAB)
  /** 已选地点（单选）：area=区域 value；district='all' 表示整个区域、否则为商圈编号；与距离档互斥 */
  const [areaPick, setAreaPick] = useState<{ area: string; district: number | 'all' } | null>(null)
  /** 已选分类（单选，存 i18n key；null=全部） */
  const [category, setCategory] = useState<string | null>(null)
  /** 排序方式（单选，存 i18n key） */
  const [sort, setSort] = useState<string>(SORT_OPTIONS[0].key)
  /** 更多篩選·人均价格区间（双滑杆；原型仅视觉态，不做真实过滤） */
  const [priceRange, setPriceRange] = useState<[number, number]>([PRICE_MIN, PRICE_MAX])
  /** 更多篩選·营业时间（单选胶囊，再点取消） */
  const [moreHour, setMoreHour] = useState<string | null>(null)
  /** 更多篩選·使用人数（单选胶囊，再点取消） */
  const [morePeople, setMorePeople] = useState<string | null>(null)
  /** 更多篩選·偏好优惠（多选） */
  const [morePrefs, setMorePrefs] = useState<string[]>([])
  /** 更多篩選·店铺服务（多选） */
  const [moreServices, setMoreServices] = useState<string[]>([])
  /** 列表大小圖模式：本地镜像（篩選面板内点击即时生效）+ 外部下发同步（说明面板切换器，双机同步） */
  const [localLayout, setLocalLayout] = useState<'small' | 'large'>(preferredLayout ?? 'large')
  useEffect(() => {
    if (preferredLayout) setLocalLayout(preferredLayout)
  }, [preferredLayout])
  const changeLayout = (mode: 'small' | 'large') => {
    setLocalLayout(mode)
    onPreferredLayoutChange?.(mode)
  }

  /** 点筛选按钮：展开对应面板，再点同一个收起 */
  const togglePanel = (panel: 'nearby' | 'category' | 'sort' | 'more') => () =>
    setOpenPanel((prev) => (prev === panel ? null : panel))

  /** 距离档单选：与商圈集合互斥（同一个胶囊只能表达一种地点口径），选中即收起面板 */
  const pickDistance = (value: string) => () => {
    setDistance(value)
    setAreaPick(null)
    setOpenPanel(null)
  }

  /** 商圈/区域「全部」单选：点击即执行筛选并收起面板；与距离档互斥 */
  const pickDistrict = (area: string, district: number | 'all') => () => {
    setAreaPick({ area, district })
    setDistance(null)
    setOpenPanel(null)
  }

  /** 分类单选：点击即生效并收起面板；null=全部 */
  const pickCategory = (key: string | null) => () => {
    setCategory(key)
    setOpenPanel(null)
  }

  /** 排序单选：选中即生效并收起面板 */
  const pickSort = (key: string) => () => {
    setSort(key)
    setOpenPanel(null)
  }

  /** 人均双滑杆：低端不得越过高端（反之亦然），越界就夹到对方位置 */
  const pickPriceMin = (value: number) =>
    setPriceRange(([, hi]) => [Math.min(value, hi), hi])
  const pickPriceMax = (value: number) =>
    setPriceRange(([lo]) => [lo, Math.max(value, lo)])
  /** 单选胶囊：再点同一个取消 */
  const pickOne = (setter: Dispatch<SetStateAction<string | null>>) => (value: string) => () =>
    setter((prev) => (prev === value ? null : value))
  /** 多选胶囊：可勾可消 */
  const pickMany = (setter: Dispatch<SetStateAction<string[]>>) => (key: string) => () =>
    setter((prev) => (prev.includes(key) ? prev.filter((x) => x !== key) : [...prev, key]))
  /** 重置：五个模块全部回到默认（价格满档、其余清空），面板保持展开 */
  const resetMore = () => {
    setPriceRange([PRICE_MIN, PRICE_MAX])
    setMoreHour(null)
    setMorePeople(null)
    setMorePrefs([])
    setMoreServices([])
  }

  /** 当前浏览页签对应的区域节点（附近页签无区域节点，右列展示距离档） */
  const activeArea = AREA_TREE.find((a) => a.value === activeAreaTab)
  /** 区域右列选项：顶部「全部」+ 该区域商圈（单选） */
  const districtOptions = activeArea
    ? [{ value: 'all' as const, label: ALL_LABEL }, ...activeArea.children.map((c) => ({ value: c.value as number | 'all', label: t(c.titleKey) }))]
    : null
  const pickedArea = areaPick ? AREA_TREE.find((a) => a.value === areaPick.area) : undefined
  const nearbyBase = t('appConsumer.groupBuy.filter.nearby', { defaultValue: '附近' })
  const nearbyLabel = areaPick
    ? (areaPick.district === 'all'
        ? (pickedArea ? t(pickedArea.titleKey) : nearbyChipLabel)
        : t(REGION_TITLE_KEY[areaPick.district]))
    : (distance ?? nearbyChipLabel)
  const categoryLabel = category
    ? t(category)
    : t('appConsumer.groupBuy.filter.allCategories', { defaultValue: '全部分類' })
  const sortLabel = t(sort)
  /** 箭头方向跟随面板开合（▲=展开中） */
  const caret = (panel: 'nearby' | 'category' | 'sort') => (openPanel === panel ? '▲' : '▼')
  /** 人均双滑杆轨道渐变分段点（满档百分比） */
  const pctLo = ((priceRange[0] - PRICE_MIN) / (PRICE_MAX - PRICE_MIN)) * 100
  const pctHi = ((priceRange[1] - PRICE_MIN) / (PRICE_MAX - PRICE_MIN)) * 100

  const sortbar = (
    <>
      {/* 筛选胶囊：左段横滑（附近/全部分類/排序可展开面板 + 高亮胶囊），右段筛选图标固定 */}
      <div className="apg-sortbar">
        <div className="apg-sortbar-scroll">
          <SpecField panel="filter" id={1}>
            <button
              type="button"
              className={`apg-chip${openPanel === 'nearby' ? ' is-open' : ''}`}
              aria-expanded={openPanel === 'nearby'}
              onClick={togglePanel('nearby')}
            >
              {nearbyLabel === nearbyBase ? nearbyChipLabel : nearbyLabel}
              {' '}
              <i className="apg-chip-caret" aria-hidden="true">{caret('nearby')}</i>
            </button>
          </SpecField>
          <SpecField panel="filter" id={2}>
            <button
              type="button"
              className={`apg-chip${openPanel === 'category' ? ' is-open' : ''}`}
              aria-expanded={openPanel === 'category'}
              onClick={togglePanel('category')}
            >
              {categoryLabel} <i className="apg-chip-caret" aria-hidden="true">{caret('category')}</i>
            </button>
          </SpecField>
          <SpecField panel="filter" id={3}>
            <button
              type="button"
              className={`apg-chip${openPanel === 'sort' ? ' is-open' : ''}`}
              aria-expanded={openPanel === 'sort'}
              onClick={togglePanel('sort')}
            >
              {sortLabel} <i className="apg-chip-caret" aria-hidden="true">{caret('sort')}</i>
            </button>
          </SpecField>
          {showHighlightChips && (
            <>
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
            </>
          )}
        </div>
        <SpecField panel="filter" id={4}>
          <button
            type="button"
            className={`apg-chip is-slider${openPanel === 'more' ? ' is-open' : ''}`}
            aria-label={t('appConsumer.groupBuy.filter.sliders', { defaultValue: '篩選條件' })}
            aria-expanded={openPanel === 'more'}
            onClick={togglePanel('more')}
          >
            <svg className="apg-slider-ico" viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" focusable="false">
              <path d="M2 4.5h12M2 8h12M2 11.5h12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              <circle cx="6" cy="4.5" r="1.9" fill="currentColor" />
              <circle cx="10.5" cy="8" r="1.9" fill="currentColor" />
              <circle cx="5" cy="11.5" r="1.9" fill="currentColor" />
            </svg>
            {t('appConsumer.common.filter', { defaultValue: '篩選' })}
          </button>
        </SpecField>
      </div>

      {/* 筛选下拉面板：同一时刻只展开一个，底部 × 收起（更多篩選走独立底部 sheet，不经此处） */}
      {(openPanel === 'nearby' || openPanel === 'category' || openPanel === 'sort') && (
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
                    {nearbyBase}
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
                  {activeArea && districtOptions
                    ? districtOptions.map((opt) => {
                      const on = areaPick?.area === activeArea.value && areaPick.district === opt.value
                      return (
                        <button key={String(opt.value)} type="button" className="apg-optrow" aria-label={opt.value === 'all' ? '選擇全部' : t('appConsumer.groupBuy.filter.pickDistrict', { value: opt.label, defaultValue: '選擇商圈 {{value}}' })} onClick={pickDistrict(activeArea.value, opt.value)}>
                          <span className={on ? 'is-text-on' : ''}>{opt.label}</span>
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
                <button
                  type="button"
                  className={`apg-catchip${category === null ? ' is-on' : ''}`}
                  aria-pressed={category === null}
                  onClick={pickCategory(null)}
                >
                  {ALL_LABEL}
                </button>
                {CATEGORY_OPTIONS.map((c) => {
                  const on = category === c.key
                  return (
                    <button
                      key={c.key}
                      type="button"
                      className={`apg-catchip${on ? ' is-on' : ''}`}
                      aria-pressed={on}
                      onClick={pickCategory(c.key)}
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
    </>
  )

  const moreSheet = openPanel === 'more' ? (
    /* 更多篩選底部面板（设计稿图2-5）：sticky 满屏罩 + 白底_sheet（五模块可滚）+ 重置/完成 + sheet 下圆形 × */
    <div className="apg-more">
      <div className="apg-more-sheet" role="group" aria-label="更多篩選面板">
        <div className="apg-more-scroll">
          {/* 列表大小圖切換仅商家瀑布流适用：閃蜂=優選商家、MFOOD=附近好店（showLayoutToggle 由父级按页签传入） */}
          {showLayoutToggle && (
            <SpecField panel="filter" id={5}>
              <section className="apg-more-sec">
              <h4 className="apg-more-title">列表大小圖切換</h4>
              <div className="apg-more-layout">
                <button type="button" className={`apg-layout-card${localLayout === 'large' ? ' is-on' : ''}`} aria-pressed={localLayout === 'large'} onClick={() => changeLayout('large')}>
                  <i className="apg-layout-ico apg-layout-ico--large" aria-hidden="true" />
                  大圖模式
                </button>
                <button type="button" className={`apg-layout-card${localLayout === 'small' ? ' is-on' : ''}`} aria-pressed={localLayout === 'small'} onClick={() => changeLayout('small')}>
                  <i className="apg-layout-ico apg-layout-ico--small" aria-hidden="true" />
                  小圖模式
                </button>
              </div>
              </section>
            </SpecField>
          )}
          <section className="apg-more-sec">
            <h4 className="apg-more-title">人均篩選器</h4>
            <div className="apg-range-card">
              <div className="apg-range-labels">
                <span>${priceRange[0]}</span>
                <span>{priceRange[1] >= PRICE_MAX ? `$${PRICE_MAX}+` : `$${priceRange[1]}`}</span>
              </div>
              <div
                className="apg-range-track"
                style={{ background: `linear-gradient(to right, var(--border-3) 0 ${pctLo}%, var(--apg-head-from, var(--brand)) ${pctLo}% ${pctHi}%, var(--border-3) ${pctHi}% 100%)` }}
              >
                <input
                  className="apg-range-input"
                  type="range"
                  min={PRICE_MIN}
                  max={PRICE_MAX}
                  value={priceRange[0]}
                  onChange={(e) => pickPriceMin(Number(e.target.value))}
                  aria-label="最低人均價格"
                />
                <input
                  className="apg-range-input"
                  type="range"
                  min={PRICE_MIN}
                  max={PRICE_MAX}
                  value={priceRange[1]}
                  onChange={(e) => pickPriceMax(Number(e.target.value))}
                  aria-label="最高人均價格"
                />
              </div>
            </div>
          </section>
          <section className="apg-more-sec">
            <h4 className="apg-more-title">營業時間</h4>
            <div className="apg-more-grid">
              {MORE_HOURS.map((h) => (
                <button key={h} type="button" className={`apg-more-chip${moreHour === h ? ' is-on' : ''}`} aria-pressed={moreHour === h} onClick={pickOne(setMoreHour)(h)}>
                  {h}
                </button>
              ))}
            </div>
          </section>
          <section className="apg-more-sec">
            <h4 className="apg-more-title">使用人數</h4>
            <div className="apg-more-grid">
              {MORE_PEOPLE.map((p) => (
                <button key={p} type="button" className={`apg-more-chip${morePeople === p ? ' is-on' : ''}`} aria-pressed={morePeople === p} onClick={pickOne(setMorePeople)(p)}>
                  {p}
                </button>
              ))}
            </div>
          </section>
          <section className="apg-more-sec">
            <h4 className="apg-more-title">偏好优惠 <i>(可多選)</i></h4>
            <div className="apg-more-grid apg-more-grid--pref">
              {MORE_PREFS.map((p) => (
                <button key={p.key} type="button" className={`apg-more-pref${morePrefs.includes(p.key) ? ' is-on' : ''}`} aria-pressed={morePrefs.includes(p.key)} onClick={pickMany(setMorePrefs)(p.key)}>
                  <i className={`apg-pref-ico apg-pref-ico--${p.tone}`} aria-hidden="true">{p.icon}</i>
                  {p.label}
                </button>
              ))}
            </div>
          </section>
          <section className="apg-more-sec">
            <h4 className="apg-more-title">店鋪服務 <i>(可多選)</i></h4>
            <div className="apg-more-grid apg-more-grid--svc">
              {MORE_SERVICES.map((s, i) => (
                <button key={`${s}-${i}`} type="button" className={`apg-more-chip${moreServices.includes(s) ? ' is-on' : ''}`} aria-pressed={moreServices.includes(s)} onClick={pickMany(setMoreServices)(s)}>
                  {s}
                </button>
              ))}
            </div>
          </section>
        </div>
        <div className="apg-more-footer">
          <button type="button" className="apg-more-reset" onClick={resetMore}>重置</button>
          <button type="button" className="apg-more-done" onClick={() => setOpenPanel(null)}>完成 (可多選)</button>
        </div>
      </div>
      <div className="apg-more-closebar">
        <i className="apg-more-stem" aria-hidden="true" />
        <button type="button" className="apg-panel-close" aria-label={t('appConsumer.groupBuy.filter.closePanel', { defaultValue: '收起篩選面板' })} onClick={() => setOpenPanel(null)}>✕</button>
      </div>
    </div>
  ) : null

  return { sortbar, moreSheet: moreSheet as ReactElement, layout: localLayout }
}
