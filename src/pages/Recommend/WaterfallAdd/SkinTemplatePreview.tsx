/** 定价画廊、实时预览和放大预览共用同一画布，整体等比缩放，不挤压内部版式。 */
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react'
import { useTranslation } from 'react-i18next'
import {
  buildPosterSvgDataUrl, getFallbackPoster, getSmallTemplate,
  getCustomPosterImages, getPosterSource, getPosterLocale, POSTER_LANGUAGES,
  type LargeLayout, type SkinSaleConfig, type PosterLocale,
} from '@/constants/popularSkinTemplates'
import { FALLBACK_POSTER_IMAGES } from './posterImages'
import { DISH_IMAGES } from './dishImages'
import './SkinTemplateSection.css'

// 阶段一视觉确认文案，第二阶段统一接入 i18n；店铺与商品均为效果示意（商品图为示意素材，价格照参考图口径）。
const DISHES = [
  { emoji: '🍔', name: '招牌雙層牛堡', price: '$9.9', original: '$280', img: DISH_IMAGES.dish_burger, bg: 'linear-gradient(135deg, #FFE2B8, #FFAE5E)' },
  { emoji: '🍋', name: '招牌暴打檸檬茶', price: '$29.9', original: '$280', img: DISH_IMAGES.dish_lemon_tea, bg: 'linear-gradient(135deg, #FFF3C4, #FFD662)' },
  { emoji: '🍟', name: '黃金薯條（大）', price: '$12.9', original: '$19', img: DISH_IMAGES.dish_fries, bg: 'linear-gradient(135deg, #C9E7FF, #7FB8F0)' },
  { emoji: '🥤', name: '冰爽可樂（中）', price: '$5.9', original: '$9', img: DISH_IMAGES.dish_coke, bg: 'linear-gradient(135deg, #FFE9F0, #FFC1D4)' },
  { emoji: '🍦', name: '新地雪糕', price: '$8.9', original: '$12', img: DISH_IMAGES.dish_icecream, bg: 'linear-gradient(135deg, #FFF3C4, #FFD662)' },
]

/** 严格按来源和语言展示，缺失的自定义图不静默替换成兑底图。兑底图已换真实海报切图，SVG 仅作缺图兑底。 */
export function SkinPoster({ skin, locale }: { skin: SkinSaleConfig; locale: PosterLocale }) {
  const { t } = useTranslation()
  const custom = getPosterSource(skin) === 'custom'
  const poster = getFallbackPoster(skin.fallbackPosterKey ?? '')
  const fallbackSource = poster
    ? (FALLBACK_POSTER_IMAGES[poster.key] ?? buildPosterSvgDataUrl(poster))
    : undefined
  const source = custom ? getCustomPosterImages(skin)[locale] : fallbackSource
  const [failedSource, setFailedSource] = useState<string>()
  const src = source !== failedSource ? source : undefined
  const language = POSTER_LANGUAGES.find(item => item.locale === locale)!
  return (
    <div className="skin-studio__poster">
      {src ? (
        <img src={src} alt={t('recommend.popularSkin.posterLabel')} draggable={false}
          onError={() => setFailedSource(src)} />
      ) : <span className="skin-studio__muted">{t(custom ? 'recommend.popularSkin.posterMissingImage' : 'recommend.popularSkin.posterNoImage', { language: t(language.labelKey) })}</span>}
    </div>
  )
}

/** 商品示意圖（高保真素材，加載失敗回退 emoji 漸變塊） */
function DishPhoto({ dish }: { dish: typeof DISHES[number] }) {
  const [failed, setFailed] = useState(false)
  if (failed) return <span className="skin-stage__food" aria-hidden="true">{dish.emoji}</span>
  return <img className="skin-stage__dish-photo" src={dish.img} alt="" draggable={false} onError={() => setFailed(true)} />
}

/** 横滑商品卡：上图下名价（triple/hero 横滑版式，4~5 张溢出裁切表示可滑） */
function RowDishCard({ dish }: { dish: typeof DISHES[number] }) {
  return (
    <div className="skin-stage__row-dish">
      <div className="skin-stage__row-dish-img" style={{ background: dish.bg }}>
        <DishPhoto dish={dish} />
      </div>
      <div className="skin-stage__row-dish-name" title={dish.name}>{dish.name}</div>
      <div className="skin-stage__row-dish-price"><strong>{dish.price}</strong><del>{dish.original}</del></div>
    </div>
  )
}

function Dishes({ layout, animate }: { layout: LargeLayout; animate: boolean }) {
  const [current, setCurrent] = useState(0)
  const rowRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (layout !== 'carousel' || !animate) return
    const timer = window.setInterval(() => setCurrent(value => (value + 1) % DISHES.length), 3000)
    return () => window.clearInterval(timer)
  }, [layout, animate])
  // 横滑版式在放大预览（autoPlay）中自动滑动，画廊缩略图保持静态裁切
  useEffect(() => {
    if (!animate || (layout !== 'triple' && layout !== 'hero')) return
    const timer = window.setInterval(() => {
      const el = rowRef.current
      if (!el) return
      const max = el.scrollWidth - el.clientWidth
      if (max <= 4) return
      el.scrollLeft = el.scrollLeft + 2 >= max ? 0 : el.scrollLeft + 2
    }, 60)
    return () => window.clearInterval(timer)
  }, [layout, animate])

  if (layout === 'carousel') {
    const lead = DISHES[current]
    return (
      <div className="skin-stage__dishes skin-stage__dishes--carousel">
        <div className="skin-stage__stack">
          {[2, 1, 0].map(depth => {
            const dish = DISHES[(current + depth) % DISHES.length]
            return (
              <div className={`skin-stage__slide skin-stage__slide--${depth}`} key={depth}>
                <div className="skin-stage__dish" style={{ background: dish.bg }}>
                  <DishPhoto dish={dish} />
                  {depth === 0 && (
                    <span className="skin-stage__deal-badge">
                      <span className="skin-stage__deal-off">🏷️ 7.05折</span>
                      <span className="skin-stage__deal-price"><strong>{lead.price}</strong><del>{lead.original}</del></span>
                    </span>
                  )}
                </div>
              </div>
            )
          })}
        </div>
        <div className="skin-stage__below-name" title={lead.name}>{lead.name}</div>
      </div>
    )
  }
  if (layout === 'triple' || layout === 'hero') {
    return (
      <div ref={rowRef} className={`skin-stage__dishes skin-stage__dishes--row skin-stage__dishes--${layout}`}>
        {DISHES.map(dish => <RowDishCard key={dish.name} dish={dish} />)}
      </div>
    )
  }
  return (
    <div className="skin-stage__dishes skin-stage__dishes--grid">
      <div className="skin-stage__lead">
        <div className="skin-stage__dish" style={{ background: DISHES[0].bg }}>
          <DishPhoto dish={DISHES[0]} />
          <div className="skin-stage__dish-caption skin-stage__dish-caption--price">
            <strong>{DISHES[0].price}</strong><del>{DISHES[0].original}</del>
          </div>
        </div>
        <div className="skin-stage__below-name" title={DISHES[0].name}>{DISHES[0].name}</div>
      </div>
      {DISHES.slice(1, 3).map(dish => (
        <div className="skin-stage__dish" style={{ background: dish.bg }} key={dish.name}>
          <DishPhoto dish={dish} />
          <div className="skin-stage__dish-caption"><span>{dish.name}</span></div>
        </div>
      ))}
    </div>
  )
}

function MerchantInfo({ merchantName = '示例门店名称' }: { merchantName?: string }) {
  return (
    <>
      <div className="skin-stage__title-row">
        <span className="skin-stage__gold-badge">金牌</span>
        <span className="skin-stage__name" title={merchantName}>{merchantName}</span>
      </div>
      <div className="skin-stage__rating"><strong>★4.5</strong><span>月售 1196</span></div>
      <div className="skin-stage__delivery">
        <span className="skin-stage__delivery-icon">🛵</span>
        起送$80 · 配送$12 · 30分鐘 · 2.5km
      </div>
      <div className="skin-stage__rank-tags">
        <span className="skin-stage__rank-tag skin-stage__rank-tag--gold">🏆 全澳西餐銷量第1名 &gt;</span>
        <span className="skin-stage__rank-tag skin-stage__rank-tag--purple">⭐ 威尼斯熱門店鋪</span>
      </div>
      <div className="skin-stage__coupons">
        <span className="skin-stage__coupon skin-stage__coupon--member">神會員 最高膨至$50</span>
        <span className="skin-stage__coupon skin-stage__coupon--reduce">125減50</span>
        <span className="skin-stage__coupon skin-stage__coupon--reduce">80減20</span>
        <span className="skin-stage__coupon skin-stage__coupon--reduce">50減10</span>
      </div>
    </>
  )
}

export default function SkinTemplatePreview({ skin, autoPlay = false, posterLocale, merchantName, appearance }: {
  skin: SkinSaleConfig
  autoPlay?: boolean
  posterLocale?: PosterLocale
  merchantName?: string
  /** 旧版非模板皮肤保留原配色；标准模板仍由共享常量决定。 */
  appearance?: Pick<CSSProperties, 'borderColor' | 'backgroundImage'>
}) {
  const { i18n } = useTranslation()
  const locale = posterLocale ?? getPosterLocale(i18n.resolvedLanguage ?? i18n.language)
  const viewportRef = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(0)
  const small = skin.displayMode === 'small'
  // triple 版式不使用海报：仅门店LOGO+店铺信息，下方全宽横滑商品卡
  const logoOnly = !small && skin.layout === 'triple'
  const canvasWidth = small ? 560 : 760
  const canvasHeight = small ? 140 : 470
  const palette = small ? getSmallTemplate(skin.templateKey)
    : getPosterSource(skin) === 'fallback' ? getFallbackPoster(skin.fallbackPosterKey ?? '') : undefined
  const color = palette && 'borderColor' in palette ? palette.borderColor : palette && 'color' in palette ? palette.color : '#E8720C'
  const backgroundImage = small && palette ? palette.gradientCss : `linear-gradient(180deg, ${color}18 0%, #fff 85%)`

  useLayoutEffect(() => {
    const element = viewportRef.current
    if (!element) return
    const measure = () => setWidth(element.getBoundingClientRect().width)
    measure()
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', measure)
      return () => window.removeEventListener('resize', measure)
    }
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  return (
    <div className="skin-preview">
      <div ref={viewportRef} className="skin-preview__viewport"
        style={{ maxWidth: canvasWidth, aspectRatio: `${canvasWidth} / ${canvasHeight}` }}>
        <div className={`skin-stage skin-stage--${skin.displayMode}${logoOnly ? ' skin-stage--logo-only' : ''}`}
          style={{ width: canvasWidth, height: canvasHeight, transform: `scale(${width / canvasWidth})`,
            borderColor: color, backgroundImage, ...appearance }}>
          {small ? (
            <>
              <div className="skin-stage__logo" aria-hidden="true">
                🍣
              </div>
              <div className="skin-stage__body">
                <MerchantInfo merchantName={merchantName} />
              </div>
            </>
          ) : logoOnly ? (
            <>
              <div className="skin-stage__top">
                <div className="skin-stage__logo skin-stage__logo-block" aria-hidden="true">🍣</div>
                <div className="skin-stage__body">
                  <MerchantInfo merchantName={merchantName} />
                </div>
              </div>
              <Dishes key={skin.templateKey} layout="triple" animate={autoPlay} />
            </>
          ) : (
            <>
              {/* 海报来源规则不变（兜底/自定义），门店LOGO 为店铺数据叠在海报顶部 */}
              <div className="skin-stage__poster-wrap">
                <SkinPoster skin={skin} locale={locale} />
                <div className="skin-stage__logo skin-stage__poster-logo" aria-hidden="true">🍣</div>
              </div>
              <div className="skin-stage__body">
                <MerchantInfo merchantName={merchantName} />
                <Dishes key={skin.templateKey} layout={skin.layout ?? 'grid'} animate={autoPlay} />
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
