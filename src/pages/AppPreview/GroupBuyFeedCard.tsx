/**
 * 团购券瀑布流卡片 · 共享组件（閃蜂「团购」/ MFOOD「特惠团购」）
 *
 * 标准字段规范（No.1~No.12）见 ./groupBuySpec.ts（壳外说明表唯一真源）。
 *
 * 秒殺变体（可选字段，缺省不渲染）：
 *   flashBadge      — 图片角落「秒殺」红标
 *   flashCountdown  — 倒计时文字（閃蜂放图片左上 / MFOOD 放图片底部横条，由 flashBadgePos 决定）
 *   locationOverlay — 图片底部定位浮层（閃蜂：新口岸 5.0km）
 *   remainingLabel  — 图片下方库存进度条（MFOOD：剩餘50份）
 *   grabbedLabel/ grabbedPct — 卡片下方已搶进度条（閃蜂：已搶19%）
 *   ctaText         — CTA 文案覆盖（秒殺 / 秒），默认「搶購」
 *   discountNote    — 降价行文案覆盖（秒殺補貼，享4.5折），默认按价格自动计算
 *   ratingNote      — 底部评分（橙心+分数，与優選商家卡同款；两壳均展示），出现时底部为 评分→距离→行政区→门店
 */
import { SpecField } from './SpecHighlight'
import BrandCover from './BrandCover'
/* 字段规范唯一真源在 ./groupBuySpec.ts（壳外说明表消费），此处不再维护副本 */

/* ─── 卡片数据接口（方案D：JSDoc 即文档，IDE hover 可见） ─── */
export interface GroupBuyItem {
  key: string
  /** No.1 品牌名称 — 含品牌图标加粗字体，数据源：商家后台 → 门店配置 → 品牌名称 */
  brand: string
  /** 品牌 Emoji（拼接在 brand 前） */
  brandEmoji?: string
  /** No.5 商品名称 — 单行截断，支持 Emoji，点击跳转详情页 */
  title: string
  /** No.2 商品封面图 — 商家配置主图，约130×130px */
  image: string
  /** No.3 新品角标 — 有效开售≤30天自动显示，下架/售罄/库存0则隐藏 */
  isNew?: boolean
  /** No.4 类型标签 — 右下角半透明标签，商家配置 */
  typeLabel?: string
  /** No.6 半年售 — 阶梯取整：<100精确/100~200取百/200~1000取千/≥1万显示"1万+" */
  halfYearSales: number
  /** No.6 自定义标签 — 管理后台配置，如「人氣熱賣」「性價比之選」 */
  customTags?: string[]
  /** No.7 销售价 — 红色加粗现价，默认MOP/HKD/CNY */
  price: string
  /** No.7 原价 — 灰色删除线，前端自动计算 No.8 降价提示 */
  origin: string
  /** No.7 积分价标签 — 纯积分商品：现价以数字展示（无货币单位）+「⚡積分價」红标 + 灰色划线原价，缺省不渲染 */
  pointPrice?: boolean
  /** No.9 定位距离 — GPS计算，小于1公里显示米，否则显示 km */
  dist: string
  /** No.10 行政区 — 门店所属区域，如"筷子基" */
  area: string
  /** No.11 门店名称 — 截断显示，超出宽度显示省略号 + 箭头 */
  shop: string
  /** 商家 ID，用于跳转详情页 */
  merchantId: string
  /** No.12 搶購 CTA — 已下架/售罄/不在销售时间/未配置时设为 false 隐藏 */
  showCta?: boolean
  /* ── 秒殺变体（可选） ── */
  /** 秒殺红标文字，出现即启用秒殺卡形态 */
  flashBadge?: string
  /** 倒计时文字，如 "07:36:58" / "1天 07:38:18" */
  flashCountdown?: string
  /** 倒计时位置：top=图片左上（閃蜂），缺省 bottom=图片底部横条（MFOOD） */
  flashBadgePos?: 'top' | 'bottom'
  /** 图片底部定位浮层（閃蜂：如"新口岸 5.0km"），出现时底部不重复展示距离 */
  locationOverlay?: string
  /** 图片下方库存进度条文字（MFOOD：如"剩餘50份"） */
  remainingLabel?: string
  /** 库存进度条填充百分比（如50 = 总量100制余50），缺省50% */
  remainingPct?: number
  /** 卡片下方已搶进度百分比（閃蜂：19 = 已搶19%） */
  grabbedPct?: number
  /** 卡片下方已搶进度条文字（閃蜂：如"已搶19%"） */
  grabbedLabel?: string
  /** CTA 文案覆盖（"秒殺"/"秒"），默认「搶購」 */
  ctaText?: string
  /** 降价行文案覆盖（如"秒殺補貼，享4.5折"），默认按价格自动计算 */
  discountNote?: string
  /** No.14 评分 — 橙心+加粗分数（与優選商家卡同款形态），展示在距离/行政区之前；閃蜂/MFOOD 均展示 */
  ratingNote?: string
}

/* ─── 半年售阶梯取整 ─── */
function formatSales(n: number): string {
  if (n < 100) return `${n}`
  if (n < 200) return `${Math.floor(n / 100) * 100}`
  if (n < 1000) return `${Math.floor(n / 200) * 200}`
  if (n < 2000) return `${Math.floor(n / 1000) * 1000}`
  if (n < 3000) return `${Math.floor(n / 2000) * 2000}`
  if (n < 10000) return `${Math.floor(n / 3000) * 3000}`
  return '1万+'
}

/* ─── 降价计算 ─── */
function calcDiscount(price: string, origin: string) {
  const p = parseFloat(price)
  const o = parseFloat(origin)
  if (isNaN(p) || isNaN(o) || o <= p) return null
  const pct = Math.floor(((o - p) / o) * 100)
  const save = Math.round((o - p) * 10) / 10
  return { pct, save }
}

/* ─── 主组件 ─── */
export default function GroupBuyFeedCard({
  item,
  theme = 'orange',
  onOpenStore,
}: {
  item: GroupBuyItem
  theme?: 'orange' | 'purple'
  onOpenStore?: (id: string) => void
}) {
  const disc = calcDiscount(item.price, item.origin)
  const ctaClass = theme === 'purple' ? 'is-purple' : ''
  const flashClass = item.flashBadge ? ' is-flash-sale' : ''
  const ctaText = item.ctaText ?? '搶購'

  return (
    <div className={`apf-card ${ctaClass}${flashClass}`}>
      {/* 左列：图片 + 库存条 */}
      <div className="apf-card-left">
        <SpecField panel="groupBuy" id={2}>
          <div className="apf-card-img">
            <BrandCover seed={item.key} name={item.brand} />
            {item.isNew && <SpecField panel="groupBuy" id={3}><span className="apf-ribbon">新品</span></SpecField>}
            {item.typeLabel && <SpecField panel="groupBuy" id={4}><span className="apf-badge-type">{item.typeLabel}</span></SpecField>}
            {/* 閃蜂：左上秒殺倒计时 */}
            {item.flashBadge && item.flashBadgePos === 'top' && (
              <SpecField panel="groupBuy" id={13}>
                <span className="apf-flash-tag-top">{item.flashBadge} {item.flashCountdown}</span>
              </SpecField>
            )}
            {/* MFOOD：底部秒殺倒计时横条 */}
            {item.flashBadge && item.flashBadgePos !== 'top' && item.flashCountdown && (
              <SpecField panel="groupBuy" id={13}>
                <div className="apf-flash-bar-bottom">
                  <span className="apf-flash-tag">{item.flashBadge}</span>
                  <span className="apf-flash-time">{item.flashCountdown}</span>
                </div>
              </SpecField>
            )}
            {/* 閃蜂：底部定位浮层 */}
            {item.locationOverlay && <span className="apf-loc-overlay">{item.locationOverlay}</span>}
          </div>
        </SpecField>
        {item.remainingLabel && (
          <SpecField panel="groupBuy" id={13}>
            <div className="apf-remaining-bar">
              <span className="apf-remaining-fill" style={{ width: `${item.remainingPct ?? 50}%` }}>{item.remainingLabel}</span>
            </div>
          </SpecField>
        )}
        {/* 閃蜂：图片下方已搶进度条（与 MFOOD 库存条同位置） */}
        {item.grabbedLabel && (
          <SpecField panel="groupBuy" id={13}>
            <div className="apf-grabbed-bar">
              <span className="apf-grabbed-fill" style={{ width: `${item.grabbedPct ?? 20}%` }}>
                🔥 {item.grabbedLabel}
              </span>
            </div>
          </SpecField>
        )}
      </div>

      {/* 右侧内容 */}
      <div className="apf-card-body">
        {/* No.1 品牌名 + No.5 商品名同排，竖线分隔；品牌名靠数据精简不截断，商品名超宽省略号截断 */}
        <div className="apf-card-title-row">
          <SpecField panel="groupBuy" id={1}>
            <span className="apf-brand">
              {item.brandEmoji && <span className="apf-brand-emoji">{item.brandEmoji}</span>}
              {item.brand}
            </span>
          </SpecField>
          {/* 分隔符不挂锚点：No.1/No.5 高亮各只圈自己的文字，不圈分隔符 */}
          <span className="apf-title-sep">|</span>
          <SpecField panel="groupBuy" id={5}>
            <span className="apf-title">{item.title}</span>
          </SpecField>
        </div>
        <SpecField panel="groupBuy" id={6}>
          <div className="apf-card-meta">
            <span className="apf-meta-tag">半年售{formatSales(item.halfYearSales)}</span>
            {item.customTags?.map((tag) => (
              <span key={tag} className="apf-meta-tag apf-meta-hot">{tag}</span>
            ))}
          </div>
        </SpecField>
        <div className="apf-card-price-row">
          <SpecField panel="groupBuy" id={7}>
            <span className="apf-price">{!item.pointPrice && <i>$</i>}{item.price}</span>
            {item.pointPrice && <span className="apf-point-tag">⚡積分價</span>}
            <span className="apf-origin">${item.origin}</span>
          </SpecField>
          {item.showCta !== false && (
            <SpecField panel="groupBuy" id={12}>
              <button type="button" className="apf-cta" onClick={() => onOpenStore?.(item.merchantId)}>
                {item.flashBadge && <span className="apf-cta-bolt" aria-hidden="true">⚡</span>}
                {ctaText} ▸
              </button>
            </SpecField>
          )}
        </div>
        {item.discountNote ? (
          <SpecField panel="groupBuy" id={8}>
            <div className="apf-card-discount">
              <span className="apf-discount-icon">↘</span>
              {item.discountNote}
            </div>
          </SpecField>
        ) : disc && (
          <SpecField panel="groupBuy" id={8}>
            <div className="apf-card-discount">
              <span className="apf-discount-icon">↘</span>
              降價超{disc.pct}%，勁慳${disc.save}
            </div>
          </SpecField>
        )}
        {/* 底部信息行整行可点：进入门店主页（评分+距离+行政区+门店名称）；无评分门店显示灰色「♥暂无」；门店名截断后「›」箭头独立不缩，始终可见 */}
        <div className="apf-card-foot" onClick={() => onOpenStore?.(item.merchantId)}>
          <SpecField panel="groupBuy" id={14}>
            {item.ratingNote
              ? <span className="apf-dist apf-rating"><i aria-hidden="true">♥</i>{item.ratingNote}</span>
              : <span className="apf-dist apf-rating apf-rating--none"><i aria-hidden="true">♥</i>暂无</span>}
          </SpecField>
          <SpecField panel="groupBuy" id={9}><span className="apf-dist">{item.dist}</span></SpecField>
          <SpecField panel="groupBuy" id={10}><span className="apf-area">{item.area}</span></SpecField>
          <SpecField panel="groupBuy" id={11}><span className="apf-shop">{item.shop}</span><i className="apf-shop-arrow" aria-hidden="true">›</i></SpecField>
        </div>
      </div>
    </div>
  )
}
