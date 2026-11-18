/**
 * Copyright (c) 2026 fengsong7889. All Rights Reserved.
 *
 * 本文件为「MFTB 企业一体化管理平台软件」的组成部分。
 * 未经著作权人书面许可，不得使用、复制、修改、再分发或用于任何商业目的。
 * 完整许可条款见仓库根目录 LICENSE 文件。
 */

/**
 * 美食外賣频道页 · 瀑布流上方两排筛选栏（閃蜂 ConsumerDelivery / MFOOD MfoodDelivery 单一真源）
 *
 * 第一排：綜合排序（默认选中下划线）+ 距離/配送下拉（单选面板）+ 右缘篩選按钮；
 * 第二排：筛选条件「优惠活动」模块标签横滑胶囊（图3 口径），蜂蜜兌換仅閃蜂展示。
 * 距離下拉=时效/范围两档互斥单选；配送下拉=配送方式/配送保障两档互斥单选（准时宝属配送时效承诺，组名「配送保障」）。
 * 下拉面板复用特惠团购附近面板视觉（apg-panel-near：左分组页签+右 radio 单选行），
 * 持有选中值的分组页签标橙（has-pick），浏览另一组时也能一眼看到生效口径。
 *
 * DELIVERY_PROMO_TAGS 是优惠活动模块标签的唯一真源：第二排胶囊与篩選 sheet「活动优惠」模块共用
 * （2026-11 口径：含超值換購等 20 项，蜂蜜兌換閃蜂专属）。
 * 篩選按钮打开多模块底部 sheet（列表大小圖切換/人均價/時效範圍/配送/商家/品質/活动优惠），
 * 结构与团购「更多篩選」同款（复用 apg-more-* 类），sheet 由页面渲染在滚动容器末尾（sticky bottom:0 不可提前）。
 * 大小图切换即时联动瀑布流（layout/onLayoutChange 经壳层闭环到说明面板 deliveryPageMode，双机同步）；
 * 其余筛选均为本地视觉态，不做真实过滤。
 * 占位文案暂不进语言包（与频道页热词/宫格同口径，二期统一接 i18n）。
 * 类名前缀 apg-dfilter-（壳内拟真命名空间，主题豁免区）；品牌accent由壳根注入 --df-accent。
 */
/* eslint-disable react-refresh/only-export-components -- 本文件是优惠活动标签单一真源与筛选栏组件的内聚点，常量需跨组件共享 */
import { useEffect, useState, type Dispatch, type ReactElement, type SetStateAction } from 'react'
import { SpecField } from './SpecHighlight'

/** 品牌口径：bee=閃蜂 / mfood=MFOOD（蜂蜜兌換等品牌专属标签按此分流） */
export type DeliveryFilterBrand = 'bee' | 'mfood'

/** 第一排排序项（綜合排序默认选中；排序菜单二期接，占位文案不进语言包） */
const SORT_ITEMS = ['綜合排序']

/** 距離下拉·时效档（单选；与范围互斥，同一按钮只承载一种口径） */
const DISTANCE_TIMES = ['30分鐘', '40分鐘', '50分鐘', '60分鐘']
/** 距離下拉·范围档（单选） */
const DISTANCE_RANGES = ['1KM', '2KM', '3KM', '5KM']
/** 配送下拉·配送方式（单选；与配送保障互斥） */
const DELIVERY_METHODS = ['平台送', '商家送', '到店自取']
/** 配送下拉·配送保障（准时宝=配送时效赔付承诺；单选） */
const DELIVERY_GUARANTEES = ['準時寶']

/** 下拉面板无障碍标题 */
const PANEL_TITLE = { distance: '距離篩選面板', delivery: '配送篩選面板' } as const

/** 篩選 sheet·品質模块（可多選；命名在用户口径基础上润色：销量较高/五星好评/4星及以上；icon 为占位 emoji） */
const SHEET_QUALITY = [
  { key: 'sales', label: '銷量較高', icon: '📊', tone: 'blue' },
  { key: 'fiveStar', label: '五星好評', icon: '⭐', tone: 'honey' },
  { key: 'fourStar', label: '4星及以上', icon: '⭐', tone: 'thumb' },
]
/** 篩選 sheet·商家模块（可多選；2026-11 按用户口径回补：必試新店/金牌商家/品牌商家/連鎖商家；icon 为占位 emoji/字样） */
const SHEET_MERCHANTS = [
  { key: 'newStore', label: '必試新店', icon: 'NEW', tone: 'chain' },
  { key: 'gold', label: '金牌商家', icon: '🏅', tone: 'honey' },
  { key: 'brand', label: '品牌商家', icon: '👑', tone: 'crown' },
  { key: 'chain', label: '連鎖商家', icon: '🏪', tone: 'healthy' },
]
/** 篩選 sheet·人均价滑杆区间（图2：$0–$100+，到顶显示 +） */
const PRICE_MIN = 0
const PRICE_MAX = 100

export interface UseDeliveryFiltersOptions {
  /** 品牌口径：bee=閃蜂 / mfood=MFOOD（蜂蜜兌換等品牌专属标签按此分流） */
  brand: DeliveryFilterBrand
  /** 瀑布流大小图模式（说明面板切换器下发；缺省小图） */
  layout?: 'small' | 'large'
  /** 篩選面板内切换上报（父级闭环后下发另一台手机） */
  onLayoutChange?: (mode: 'small' | 'large') => void
}

export interface DeliveryFilters {
  /** 两排筛选栏（渲染于瀑布流上方，閃蜂壳吸顶） */
  bar: ReactElement
  /** 多模块篩選底部 sheet（渲染于滚动容器末尾——.apg-more 是 sticky bottom:0，DOM 位置不可提前） */
  sheet: ReactElement
}

/**
 * 筛选条件·优惠活动模块标签（图3 单一真源；icon 为占位 emoji/字样，待切图后替换）。
 * tone 复用更多篩選·偏好优惠的圆形渐变图标族（apg-pref-ico--*），蜜蜂/蓝/紫/粉四档为本模块新增。
 * beeOnly=true 的标签仅閃蜂壳渲染（蜂蜜兌換为閃蜂品牌权益）。
 * 首项随品牌分流：閃蜂神會員👑 / MFOOD勁爆券🧨（mfoodLabel/mfoodIcon，同门店卡红包胶囊口径）。
 */
export const DELIVERY_PROMO_TAGS: { key: string; label: string; mfoodLabel?: string; icon: string; mfoodIcon?: string; tone: string; beeOnly?: boolean }[] = [
  { key: 'vip', label: '神會員', mfoodLabel: '勁爆券', icon: '👑', mfoodIcon: '🧨', tone: 'crown' },
  { key: 'taste', label: '換口味', icon: '🥗', tone: 'chain' },
  { key: 'boost', label: '商家助力', icon: '🧑‍🍳', tone: 'thumb' },
  { key: 'official', label: '官方神券', icon: '🎫', tone: 'coupon' },
  { key: 'vs', label: '格價至抵', icon: 'VS', tone: 'vs' },
  { key: 'freeShip', label: '減免運費', icon: '🛵', tone: 'service' },
  { key: 'honey', label: '蜂蜜兌換', icon: '🍯', tone: 'honey', beeOnly: true },
  { key: 'fullCut', label: '滿額立減', icon: '減', tone: 'vs' },
  { key: 'newbie', label: '新客優惠券', icon: '👥', tone: 'chain' },
  { key: 'inStore', label: '進店領券', icon: '券', tone: 'pink' },
  { key: 'rebate', label: '滿返贈券', icon: '🎟️', tone: 'service' },
  { key: 'fullGift', label: '買滿贈品', icon: '🎁', tone: 'blue' },
  { key: 'buyGift', label: '買贈活動', icon: '🎁', tone: 'purple' },
  { key: 'discount', label: '商品折扣', icon: '🏷️', tone: 'taste' },
  { key: 'favCoupon', label: '收藏送券', icon: '❤️', tone: 'pink' },
  { key: 'combo', label: '組合優惠', icon: '🍱', tone: 'blue' },
  { key: 'half', label: '半價優惠', icon: '½', tone: 'vs' },
  { key: 'pickup', label: '自取折扣', icon: '🛍️', tone: 'chain' },
  { key: 'points', label: '集點返券', icon: '🎯', tone: 'purple' },
  { key: 'swap', label: '超值換購', icon: '🛒', tone: 'thumb' },
]

export function useDeliveryFilters({ brand, layout, onLayoutChange }: UseDeliveryFiltersOptions): DeliveryFilters {
  /** 排序单选（原型视觉态；默认綜合排序，与旧版口径一致） */
  const [sort, setSort] = useState(SORT_ITEMS[0])
  /** 当前展开的下拉：距離 / 配送 / 篩選 sheet，同一时刻只开一个（null=收起） */
  const [openPanel, setOpenPanel] = useState<'distance' | 'delivery' | 'filter' | null>(null)
  /** 距離单选（时效与范围互斥）；null=未选，按钮回默认文案 */
  const [distancePick, setDistancePick] = useState<string | null>(null)
  /** 配送单选（方式与保障互斥）；null=未选 */
  const [deliveryPick, setDeliveryPick] = useState<string | null>(null)
  /** 下拉当前浏览分组（切换只改浏览，不清选中值） */
  const [distanceTab, setDistanceTab] = useState<'time' | 'range'>('time')
  const [deliveryTab, setDeliveryTab] = useState<'method' | 'guarantee'>('method')
  /** 篩選 sheet·人均价区间（原型视觉态不做真实过滤） */
  const [priceRange, setPriceRange] = useState<[number, number]>([PRICE_MIN, PRICE_MAX])
  /** 篩選 sheet·商家/品質/活动优惠（可多選） */
  const [sheetMerchants, setSheetMerchants] = useState<string[]>([])
  const [sheetQuality, setSheetQuality] = useState<string[]>([])
  const [sheetPrefs, setSheetPrefs] = useState<string[]>([])
  /** 列表大小圖：本地镜像（sheet 内点击即时生效）+ 外部下发同步（说明面板切换器，双机同步） */
  const [localLayout, setLocalLayout] = useState<'small' | 'large'>(layout ?? 'small')
  useEffect(() => {
    if (layout) setLocalLayout(layout)
  }, [layout])
  const changeLayout = (mode: 'small' | 'large') => {
    setLocalLayout(mode)
    onLayoutChange?.(mode)
  }
  /** 优惠活动标签：蜂蜜兌換仅閃蜂；首项文案/图标随品牌分流（閃蜂神會員👑 / MFOOD勁爆券🧨） */
  const promoTags = DELIVERY_PROMO_TAGS
    .filter((p) => !p.beeOnly || brand === 'bee')
    .map((p) => ({
      ...p,
      label: brand === 'mfood' && p.mfoodLabel ? p.mfoodLabel : p.label,
      icon: brand === 'mfood' && p.mfoodIcon ? p.mfoodIcon : p.icon,
    }))

  /** 点下拉按钮：展开对应面板（含篩選 sheet），再点同一个收起 */
  const togglePanel = (panel: 'distance' | 'delivery' | 'filter') => () =>
    setOpenPanel((prev) => (prev === panel ? null : panel))
  /** 单选：再点同一个取消；选中即收起面板（与特惠团购距离档同口径） */
  const pickDistance = (value: string) => () => {
    setDistancePick((prev) => (prev === value ? null : value))
    setOpenPanel(null)
  }
  const pickDelivery = (value: string) => () => {
    setDeliveryPick((prev) => (prev === value ? null : value))
    setOpenPanel(null)
  }
  /** sheet 内单选：再点同一个取消，sheet 保持展开（与列表下拉共享同一状态，两处任一改动即互相同步） */
  const pickSheetDistance = (value: string) => () =>
    setDistancePick((prev) => (prev === value ? null : value))
  const pickSheetDelivery = (value: string) => () =>
    setDeliveryPick((prev) => (prev === value ? null : value))
  /** sheet 内多选（商家/品質/活动优惠）：可勾可消 */
  const pickMany = (setter: Dispatch<SetStateAction<string[]>>) => (key: string) => () =>
    setter((prev) => (prev.includes(key) ? prev.filter((x) => x !== key) : [...prev, key]))
  /** 人均双滑杆：低端不得越过高端（反之亦然），越界就夹到对方位置 */
  const pickPriceMin = (value: number) => setPriceRange(([, hi]) => [Math.min(value, hi), hi])
  const pickPriceMax = (value: number) => setPriceRange(([lo]) => [lo, Math.max(value, lo)])
  /** 綜合排序点击：恢复默认——清空距離/配送两个下拉的选中并收起面板（2026-11 反馈） */
  const resetSort = () => {
    setSort(SORT_ITEMS[0])
    setDistancePick(null)
    setDeliveryPick(null)
    setOpenPanel(null)
  }
  /** sheet 重置：七模块全部回默认（含与列表下拉共享的时效范围/配送），sheet 保持展开 */
  const resetSheet = () => {
    setPriceRange([PRICE_MIN, PRICE_MAX])
    setSheetMerchants([])
    setSheetQuality([])
    setSheetPrefs([])
    setDistancePick(null)
    setDeliveryPick(null)
  }

  /** 人均双滑杆轨道渐变分段点（满档百分比） */
  const pctLo = ((priceRange[0] - PRICE_MIN) / (PRICE_MAX - PRICE_MIN)) * 100
  const pctHi = ((priceRange[1] - PRICE_MIN) / (PRICE_MAX - PRICE_MIN)) * 100

  /** 右列单选行（复用 apg-optrow + apg-radio，与附近面板同款） */
  const renderRows = (values: string[], picked: string | null, pick: (v: string) => () => void) => (
    <div className="apg-panel-options">
      {values.map((v) => {
        const on = picked === v
        return (
          <button key={v} type="button" className="apg-optrow" aria-pressed={on} onClick={pick(v)}>
            <span className={on ? 'is-text-on' : ''}>{v}</span>
            <i className={`apg-radio${on ? ' is-on' : ''}`} aria-hidden="true">{on ? '✓' : ''}</i>
          </button>
        )
      })}
    </div>
  )

  /** 左列分组页签：浏览态 is-on（橙描边暖底）+ 持有选中值 has-pick（橙字） */
  const renderTab = (label: string, on: boolean, hasPick: boolean, onClick: () => void) => (
    <button
      type="button"
      className={`apg-region${on ? ' is-on' : ''}${hasPick ? ' has-pick' : ''}`}
      aria-pressed={on}
      onClick={onClick}
    >
      {label}
    </button>
  )

  /** 綜合排序：点击即恢复默认（清空距離/配送选中，见 resetSort）；SpecField 锚点 id1=整条两排筛选栏，说明行悬停即整栏点亮 */
  const bar = (
    <SpecField panel="deliveryFilter" id={1}>
    <div className="apg-dfilter">
      {/* 第一排：排序单选 + 距離/配送下拉 + 右缘篩選 */}
      <div className="apg-dfilter-sort">
        {SORT_ITEMS.map((s) => (
          <SpecField key={s} panel="deliveryFilter" id={13}>
          <button
            type="button"
            className={`apg-dfilter-sortbtn${sort === s ? ' is-on' : ''}`}
            aria-pressed={sort === s}
            onClick={resetSort}
          >
            {s}
          </button>
          </SpecField>
        ))}
        <SpecField panel="deliveryFilter" id={2}>
        <button
          type="button"
          className={`apg-dfilter-drop${distancePick || openPanel === 'distance' ? ' is-on' : ''}${openPanel === 'distance' ? ' is-open' : ''}`}
          aria-expanded={openPanel === 'distance'}
          onClick={togglePanel('distance')}
        >
          {distancePick ?? '距離'} <i aria-hidden="true">▾</i>
        </button>
        </SpecField>
        <SpecField panel="deliveryFilter" id={3}>
        <button
          type="button"
          className={`apg-dfilter-drop${deliveryPick || openPanel === 'delivery' ? ' is-on' : ''}${openPanel === 'delivery' ? ' is-open' : ''}`}
          aria-expanded={openPanel === 'delivery'}
          onClick={togglePanel('delivery')}
        >
          {deliveryPick ?? '配送'} <i aria-hidden="true">▾</i>
        </button>
        </SpecField>
        <SpecField panel="deliveryFilter" id={5}>
        <button
          type="button"
          className={`apg-dfilter-more${openPanel === 'filter' ? ' is-open' : ''}`}
          aria-expanded={openPanel === 'filter'}
          onClick={togglePanel('filter')}
        >
          篩選 <i aria-hidden="true">▾</i>
        </button>
        </SpecField>
      </div>

      {/* 距離下拉：左时效/范围页签 + 右单选行，两档互斥单选 */}
      {openPanel === 'distance' && (
        <div className="apg-dfilter-panel" role="group" aria-label={PANEL_TITLE.distance}>
          <div className="apg-panel-near">
            <div className="apg-panel-regions">
              {renderTab('時效', distanceTab === 'time', !!distancePick && DISTANCE_TIMES.includes(distancePick), () => setDistanceTab('time'))}
              {renderTab('範圍', distanceTab === 'range', !!distancePick && DISTANCE_RANGES.includes(distancePick), () => setDistanceTab('range'))}
            </div>
            {renderRows(distanceTab === 'time' ? DISTANCE_TIMES : DISTANCE_RANGES, distancePick, pickDistance)}
          </div>
        </div>
      )}
      {/* 配送下拉：左配送/配送保障页签 + 右单选行，两档互斥单选 */}
      {openPanel === 'delivery' && (
        <div className="apg-dfilter-panel" role="group" aria-label={PANEL_TITLE.delivery}>
          <div className="apg-panel-near">
            <div className="apg-panel-regions">
              {renderTab('配送', deliveryTab === 'method', !!deliveryPick && DELIVERY_METHODS.includes(deliveryPick), () => setDeliveryTab('method'))}
              {renderTab('配送保障', deliveryTab === 'guarantee', !!deliveryPick && DELIVERY_GUARANTEES.includes(deliveryPick), () => setDeliveryTab('guarantee'))}
            </div>
            {renderRows(deliveryTab === 'method' ? DELIVERY_METHODS : DELIVERY_GUARANTEES, deliveryPick, pickDelivery)}
          </div>
        </div>
      )}

      {/* 第二排：优惠活动模块标签横滑（左右滑动；隐藏滚动条） */}
      <SpecField panel="deliveryFilter" id={4}>
      <div className="apg-dfilter-promos">
        {promoTags.map((p) => (
          <button key={p.key} type="button" className="apg-dfilter-chip">
            <i className={`apg-pref-ico apg-pref-ico--${p.tone}`} aria-hidden="true">{p.icon}</i>
            {p.label}
          </button>
        ))}
      </div>
      </SpecField>
    </div>
    </SpecField>
  )

  const sheet = openPanel === 'filter' ? (
    /* 多模块篩選底部面板（图2-5）：sticky 满屏罩 + 白底 sheet（七模块可滚）+ 重置/完成 + sheet 下圆形 × */
    <div className="apg-more">
      <div className="apg-more-sheet" role="group" aria-label="美食外賣篩選面板">
        <div className="apg-more-scroll">
          {/* 大小图切换即时生效：本地镜像 + onLayoutChange 上报父级（壳层闭环到说明面板，双机同步） */}
          <SpecField panel="deliveryFilter" id={6}>
          <section className="apg-more-sec">
            <h4 className="apg-more-title">列表大小圖切換</h4>
            <div className="apg-more-layout">
              <button
                type="button"
                className={`apg-layout-card${localLayout === 'large' ? ' is-on' : ''}`}
                aria-pressed={localLayout === 'large'}
                onClick={() => changeLayout('large')}
              >
                <i className="apg-layout-ico apg-layout-ico--large" aria-hidden="true" />
                大圖模式
              </button>
              <button
                type="button"
                className={`apg-layout-card${localLayout === 'small' ? ' is-on' : ''}`}
                aria-pressed={localLayout === 'small'}
                onClick={() => changeLayout('small')}
              >
                <i className="apg-layout-ico apg-layout-ico--small" aria-hidden="true" />
                小圖模式
              </button>
            </div>
          </section>
          </SpecField>
          <SpecField panel="deliveryFilter" id={7}>
          <section className="apg-more-sec">
            <h4 className="apg-more-title">人均價</h4>
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
          </SpecField>
          {/* 時效範圍/配送与列表下拉共享同一单选状态：两处任一改动即互相同步 */}
          <SpecField panel="deliveryFilter" id={8}>
          <section className="apg-more-sec">
            <h4 className="apg-more-title">時效範圍</h4>
            <div className="apg-more-grid">
              {[...DISTANCE_TIMES, ...DISTANCE_RANGES].map((v) => (
                <button key={v} type="button" className={`apg-more-chip${distancePick === v ? ' is-on' : ''}`} aria-pressed={distancePick === v} onClick={pickSheetDistance(v)}>
                  {v}
                </button>
              ))}
            </div>
          </section>
          </SpecField>
          <SpecField panel="deliveryFilter" id={9}>
          <section className="apg-more-sec">
            <h4 className="apg-more-title">配送</h4>
            <div className="apg-more-grid">
              {[...DELIVERY_METHODS, ...DELIVERY_GUARANTEES].map((v) => (
                <button key={v} type="button" className={`apg-more-chip${deliveryPick === v ? ' is-on' : ''}`} aria-pressed={deliveryPick === v} onClick={pickSheetDelivery(v)}>
                  {v}
                </button>
              ))}
            </div>
          </section>
          </SpecField>
          <SpecField panel="deliveryFilter" id={10}>
          <section className="apg-more-sec">
            <h4 className="apg-more-title">商家 <i>(可多選)</i></h4>
            <div className="apg-more-grid apg-more-grid--pref">
              {SHEET_MERCHANTS.map((p) => (
                <button key={p.key} type="button" className={`apg-more-pref${sheetMerchants.includes(p.key) ? ' is-on' : ''}`} aria-pressed={sheetMerchants.includes(p.key)} onClick={pickMany(setSheetMerchants)(p.key)}>
                  <i className={`apg-pref-ico apg-pref-ico--${p.tone}`} aria-hidden="true">{p.icon}</i>
                  {p.label}
                </button>
              ))}
            </div>
          </section>
          </SpecField>
          <SpecField panel="deliveryFilter" id={11}>
          <section className="apg-more-sec">
            <h4 className="apg-more-title">品質 <i>(可多選)</i></h4>
            <div className="apg-more-grid apg-more-grid--pref">
              {SHEET_QUALITY.map((p) => (
                <button key={p.key} type="button" className={`apg-more-pref${sheetQuality.includes(p.key) ? ' is-on' : ''}`} aria-pressed={sheetQuality.includes(p.key)} onClick={pickMany(setSheetQuality)(p.key)}>
                  <i className={`apg-pref-ico apg-pref-ico--${p.tone}`} aria-hidden="true">{p.icon}</i>
                  {p.label}
                </button>
              ))}
            </div>
          </section>
          </SpecField>
          {/* 活动优惠=DELIVERY_PROMO_TAGS 真源（含超值換購，蜂蜜兌換閃蜂专属） */}
          <SpecField panel="deliveryFilter" id={12}>
          <section className="apg-more-sec">
            <h4 className="apg-more-title">活动优惠 <i>(可多選)</i></h4>
            <div className="apg-more-grid apg-more-grid--pref">
              {promoTags.map((p) => (
                <button key={p.key} type="button" className={`apg-more-pref${sheetPrefs.includes(p.key) ? ' is-on' : ''}`} aria-pressed={sheetPrefs.includes(p.key)} onClick={pickMany(setSheetPrefs)(p.key)}>
                  <i className={`apg-pref-ico apg-pref-ico--${p.tone}`} aria-hidden="true">{p.icon}</i>
                  {p.label}
                </button>
              ))}
            </div>
          </section>
          </SpecField>
        </div>
        <div className="apg-more-footer">
          <button type="button" className="apg-more-reset" onClick={resetSheet}>重置</button>
          <button type="button" className="apg-more-done" onClick={() => setOpenPanel(null)}>完成 (可多選)</button>
        </div>
      </div>
      <div className="apg-more-closebar">
        <i className="apg-more-stem" aria-hidden="true" />
        <button type="button" className="apg-panel-close" aria-label="收起篩選面板" onClick={() => setOpenPanel(null)}>✕</button>
      </div>
    </div>
  ) : null

  return { bar, sheet: sheet as ReactElement }
}

/** 仅渲染两排筛选栏的便捷组件（整页接入请用 useDeliveryFilters，以在滚动容器末尾挂 sheet） */
export default function DeliveryFilterBar(props: UseDeliveryFiltersOptions) {
  const { bar } = useDeliveryFilters(props)
  return bar
}