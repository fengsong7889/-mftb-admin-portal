/**
 * Copyright (c) 2026 fengsong7889. All Rights Reserved.
 *
 * 本文件为「MFTB 企业一体化管理平台软件」的组成部分。
 * 未经著作权人书面许可，不得使用、复制、修改、再分发或用于任何商业目的。
 * 完整许可条款见仓库根目录 LICENSE 文件。
 */

/**
 * MFOOD 外賣 · 人氣商家大圖卡（4 版式；閃蜂 DeliveryHotCard 的 MFOOD 同构独立版）
 *
 * ⚠️ 与閃蜂的同名能力刻意各自独立（同 MfoodDeliveryStoreCard / DeliveryStoreCard 约定）：
 *   接口与实现不共用（门店信息、红包语境 MFOOD 自有：勁爆券胶囊内建 MfoodMemberBlock）；
 *   仅复用 apw-hot / apw-hotg-* 基础样式类（两边视觉要求一致的既有惯例），MFOOD 侧分叉时
 *   在本组件作用域内加覆盖类，不回改基础类。
 *
 * 版式（hotSkin.layout，缺省 grid；与「销售定价 → 新增定价」大图模式同源）：
 *   grid     大图拼列   —— 左海报 + 右信息 + 1大2小商品拼列
 *   carousel 阶梯轮播   —— 左海报 + 右信息 + 发牌式阶梯堆叠（折扣角标跨出图底 + 底部名称行）
 *   triple   爆款商品横滑 —— 门店LOGO + 信息，全宽橙色渐变带内横滑爆款商品卡（不使用海报）
 *   hero     主推商品横滑 —— 左海报 + 右信息 + 右侧主推商品横滑（2张完整+第3张露一半）
 *
 * 消费方：列表模式（MfoodDeliveryStoreCard 的 hotSkin large 分支）与大图模式
 * （MfoodDeliveryLargeCard 分派）同构渲染，大图模式下不被同化成普通大图卡。
 */
import { getFallbackPoster } from '@/constants/popularSkinTemplates'
import { SpecField } from './SpecHighlight'
import BrandCover from './BrandCover'
import { deliveryFromText } from './deliveryFee'
import { useClosingCountdown } from './useClosingCountdown'
import { BRAND_TAG_STYLE, MfoodMemberBlock, type MfoodStore, type MfoodHotDish } from './MfoodDeliveryStoreCard'

type MfoodHotLayout = NonNullable<MfoodStore['hotSkin']>['layout']

/** 横滑商品卡（triple/hero）：上图 + 名 + 红色现价 + 灰色划线原价 */
function MfoodHotDishCell({ dish }: { dish: MfoodHotDish }) {
  return (
    <div className="apw-hotg-cell">
      <div className="apw-hotg-cell-img">
        <img src={dish.image} alt={dish.name} />
        {dish.discount && <span className="apw-hotg-cell-discount">{dish.discount}</span>}
      </div>
      <span className="apw-hotg-cell-name">{dish.name}</span>
      <span className="apw-hotg-cell-price"><em>${dish.price}</em>{dish.origin && <s>${dish.origin}</s>}</span>
    </div>
  )
}

/** 商品区（按版式分发；缺 dishes 不渲染） */
function MfoodHotDishes({ layout, dishes }: { layout: MfoodHotLayout; dishes: MfoodHotDish[] }) {
  if (!dishes || dishes.length === 0) return null

  if (layout === 'carousel') {
    const lead = dishes[0]
    return (
      <div className="apw-hotg-carousel">
        <div className="apw-hotg-stack">
          {dishes.slice(0, 3).map((d, i) => (
            <div key={d.name} className={`apw-hotg-slide is-${i}`}>
              <img src={d.image} alt={d.name} />
              {i === 0 && (
                <span className="apw-hotg-deal">
                  <span className="apw-hotg-deal-off">🏷 {lead.discount ?? '限時特惠'}</span>
                  <span className="apw-hotg-deal-price"><em>${lead.price}</em>{lead.origin && <s>${lead.origin}</s>}</span>
                </span>
              )}
            </div>
          ))}
        </div>
        <span className="apw-hotg-below">{lead.name}</span>
      </div>
    )
  }

  if (layout === 'triple' || layout === 'hero') {
    return (
      <div className={`apw-hotg-row is-${layout}`}>
        {dishes.slice(0, 5).map((d) => <MfoodHotDishCell key={d.name} dish={d} />)}
      </div>
    )
  }

  /* grid：1大2小（首项主推：折扣角标+价格叠层+名在图下；小图名称叠加白字） */
  const lead = dishes[0]
  return (
    <div className="apw-hotg-grid">
      <div className="apw-hotg-lead">
        <div className="apw-hotg-lead-img">
          <img src={lead.image} alt={lead.name} />
          {lead.discount && <span className="apw-hotg-cell-discount">{lead.discount}</span>}
          <span className="apw-hotg-lead-price"><em>${lead.price}</em>{lead.origin && <s>${lead.origin}</s>}</span>
        </div>
        <span className="apw-hotg-below">{lead.name}</span>
      </div>
      {dishes.slice(1, 3).map((d) => (
        <div key={d.name} className="apw-hotg-mini">
          <img src={d.image} alt={d.name} />
          <span className="apw-hotg-mini-name">{d.name}</span>
        </div>
      ))}
    </div>
  )
}

export default function MfoodDeliveryHotCard({ store, onOpenStore }: {
  store: MfoodStore
  onOpenStore?: (id: string) => void
}) {
  const hot = store.hotSkin
  const layout: MfoodHotLayout = hot?.layout ?? 'grid'
  const poster = hot?.mode === 'large' && hot.posterKey ? getFallbackPoster(hot.posterKey) : undefined
  const isTriple = layout === 'triple'

  /* 打烊倒计时（id19）：与普通卡同款 */
  const closing = useClosingCountdown(store.closingCountdown ?? '')

  /* 右侧/顶部信息区（人氣商家大圖不展示月售；名行固定帶紅色「熱門」角标） */
  const infoArea = (
    <>
      <div className="apw-row-name">
        <span className="apw-hot-flag">熱門</span>
        {store.brandTag && (
          <SpecField panel="delivery" id={3}>
            <span className={`apw-brand-tag ${BRAND_TAG_STYLE[store.brandTag]}`}>{store.brandTag}</span>
          </SpecField>
        )}
        <SpecField panel="delivery" id={1}>
          <span className="apw-name">{store.name}</span>
        </SpecField>
      </div>

      {store.closingCountdown && !closing.expired && (
        <SpecField panel="delivery" id={19}>
          <div className="apw-closing-row">
            <span className="apw-closing"><i aria-hidden="true">⏰</i>距離打烊還剩 {closing.display}</span>
          </div>
        </SpecField>
      )}

      {store.businessState === 'preorder' && store.preorderTime && (
        <SpecField panel="delivery" id={10}>
          <div className="apw-status-banner apw-status-preorder">
            <span className="apw-status-badge">接受预定</span>
            <span className="apw-status-text">明天 {store.preorderTime} 后配送</span>
          </div>
        </SpecField>
      )}
      {store.businessState === 'closed' && (
        <SpecField panel="delivery" id={10}>
          <div className="apw-status-banner apw-status-closed">
            <span className="apw-status-badge">已打烊</span>
            {store.closedReason && <span className="apw-status-text">{store.closedReason}</span>}
          </div>
        </SpecField>
      )}

      <div className="apw-row-rating">
        <SpecField panel="delivery" id={4}>
          <b className="apw-rating"><span className="apw-star" aria-hidden="true">★</span>{store.rating}</b>
        </SpecField>
        <span className="apw-rating-side">
          {store.punctual && <SpecField panel="delivery" id={6}><span className="apw-punctual">準時寶</span></SpecField>}
          <SpecField panel="delivery" id={14}>
            <span className="apw-delivery-type">配送类型</span>
          </SpecField>
        </span>
      </div>

      <div className="apw-info-grid">
        <SpecField panel="delivery" id={7}>
          <div className="apw-info-cell">
            <span className="apw-info-label">起送</span>
            <span className="apw-info-value">{store.minOrder}</span>
          </div>
        </SpecField>
        <SpecField panel="delivery" id={7}>
          <div className="apw-info-cell">
            <span className="apw-info-label">配送</span>
            <span className={`apw-info-value${store.freeDelivery ? ' apw-info-value--free' : ''}`}>
              {store.freeDelivery ? '免配送費' : deliveryFromText(store.key)}
            </span>
          </div>
        </SpecField>
        <div className="apw-info-cell">
          <span className="apw-info-label">时间·距离</span>
          <span className="apw-info-value apw-info-value--row">
            <SpecField panel="delivery" id={8}>
              <span className="apw-info-td">
                {store.deliveryTime}
                {store.distance ? <> · {store.distance}</> : null}
              </span>
            </SpecField>
            {store.deliveryType === 'pickup' && store.pickupDiscount && (
              <SpecField panel="delivery" id={25}>
                <span className="apw-pickup-text">自取{store.pickupDiscount}</span>
              </SpecField>
            )}
          </span>
        </div>
      </div>
    </>
  )

  return (
    <div className={`apw-hot apw-hot--${layout}`} onClick={() => onOpenStore?.(store.merchantId)}>
      {isTriple ? (
        <>
          {/* 爆款商品横滑：门店LOGO + 信息在上排，橙色渐变带横滑商品卡全宽在下；本版式不使用海报 */}
          <div className="apw-hot-top">
            <SpecField panel="delivery" id={15}>
              <span className="apw-hot-logo">
                <BrandCover seed={store.key} name={store.name} />
                {store.isNew && <SpecField panel="delivery" id={2}><span className="apw-new-tag">新店</span></SpecField>}
              </span>
            </SpecField>
            <div className="apw-hot-body">
              {infoArea}
              {store.tags.length > 0 && (
                <SpecField panel="delivery" id={11}>
                  <div className="apw-row-tags">
                    {store.tags.map((t) => <span key={t} className="apw-tag">{t}</span>)}
                  </div>
                </SpecField>
              )}
              <MfoodMemberBlock store={store} />
            </div>
          </div>
          <div className="apw-hot-band">
            <MfoodHotDishes layout="triple" dishes={hot?.dishes ?? []} />
          </div>
        </>
      ) : (
        <>
          {/* 竖版海报（id13 锚海报）：posterImage 真实切图优先，否则兜底配色+合成文字 */}
          <SpecField panel="delivery" id={13}>
            <div className="apw-hot-poster" style={poster ? { background: poster.gradientCss } : undefined}>
              {hot?.posterImage ? (
                <img className="apw-hot-poster-img" src={hot.posterImage} alt="人氣商家" />
              ) : (
                <>
                  <span className="apw-hot-poster-brand">{hot?.posterBrand}</span>
                  <span className="apw-hot-poster-mascot" aria-hidden="true">{hot?.posterMascot}</span>
                  <span className="apw-hot-poster-title">人氣商家</span>
                  <span className="apw-hot-poster-btn">立即進入 ▶</span>
                </>
              )}
            </div>
          </SpecField>
          <div className="apw-hot-body">
            {infoArea}
            {store.tags.length > 0 && (
              <SpecField panel="delivery" id={11}>
                <div className="apw-row-tags">
                  {store.tags.map((t) => <span key={t} className="apw-tag">{t}</span>)}
                </div>
              </SpecField>
            )}
            <MfoodMemberBlock store={store} />
            <MfoodHotDishes layout={layout} dishes={hot?.dishes ?? []} />
          </div>
        </>
      )}
    </div>
  )
}
