/** 定价画廊、实时预览和放大预览共用同一画布，整体等比缩放，不挤压内部版式。 */
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Button } from 'antd'
import {
  buildPosterSvgDataUrl, getFallbackPoster, getSmallTemplate,
  type LargeLayout, type SkinSaleConfig,
} from '../../../constants/popularSkinTemplates'
import './SkinTemplateSection.css'

// 阶段一视觉确认文案，第二阶段统一接入 i18n；店铺与商品均为效果示意。
const DISHES = [
  { emoji: '🍔', name: '招牌雙層牛堡 · 特惠一人餐', price: '$43.3', original: '$65', bg: 'linear-gradient(135deg, #FFE2B8, #FFAE5E)' },
  { emoji: '🍟', name: '黃金薯條（大）', price: '$12.9', original: '$19', bg: 'linear-gradient(135deg, #FFF3C4, #FFD662)' },
  { emoji: '🥤', name: '冰爽可樂（中）', price: '$5.9', original: '$9', bg: 'linear-gradient(135deg, #C9E7FF, #7FB8F0)' },
  { emoji: '🍦', name: '新地雪糕', price: '$8.9', original: '$12', bg: 'linear-gradient(135deg, #FFE9F0, #FFC1D4)' },
]

/** 自定义图失败后使用所选兜底图；两个来源都失败则显示中性占位。 */
export function SkinPoster({ skin }: { skin: SkinSaleConfig }) {
  const poster = getFallbackPoster(skin.fallbackPosterKey ?? '')
  const fallback = poster ? buildPosterSvgDataUrl(poster) : undefined
  const [failedSources, setFailedSources] = useState<string[]>([])
  const src = [skin.customImage, fallback].find(source => source && !failedSources.includes(source))
  return (
    <div className="skin-studio__poster">
      {src ? (
        <img src={src} alt="人气商家海报" draggable={false}
          onError={() => setFailedSources(previous => [...previous, src])} />
      ) : <span className="skin-studio__muted">暫無圖片</span>}
    </div>
  )
}

function DishCard({ dish }: { dish: typeof DISHES[number] }) {
  return (
    <div className="skin-stage__dish" style={{ background: dish.bg }}>
      <span className="skin-stage__food" aria-hidden="true">{dish.emoji}</span>
      <div className="skin-stage__dish-caption">
        <strong>{dish.price}</strong><del>{dish.original}</del>
        <span>{dish.name}</span>
      </div>
    </div>
  )
}

function Dishes({ layout, animate }: { layout: LargeLayout; animate: boolean }) {
  const [current, setCurrent] = useState(0)
  useEffect(() => {
    if (layout !== 'carousel' || !animate) return
    const timer = window.setInterval(() => setCurrent(value => (value + 1) % DISHES.length), 3000)
    return () => window.clearInterval(timer)
  }, [layout, animate])

  if (layout === 'carousel') {
    return (
      <div className="skin-stage__dishes skin-stage__dishes--carousel">
        {[2, 1, 0].map(depth => (
          <div className={`skin-stage__slide skin-stage__slide--${depth}`} key={depth}>
            <DishCard dish={DISHES[(current + depth) % DISHES.length]} />
          </div>
        ))}
      </div>
    )
  }
  return (
    <div className={`skin-stage__dishes skin-stage__dishes--${layout}`}>
      {(layout === 'hero' ? DISHES.slice(0, 1) : DISHES.slice(0, 3)).map(dish => (
        <DishCard key={dish.name} dish={dish} />
      ))}
    </div>
  )
}

function MerchantInfo() {
  return (
    <>
      <div className="skin-stage__title-row">
        <span className="skin-stage__gold-badge">金牌</span>
        <span className="skin-stage__name">示例门店名称</span>
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

export default function SkinTemplatePreview({ skin, interactive = false }: {
  skin: SkinSaleConfig
  interactive?: boolean
}) {
  const viewportRef = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(0)
  const [paused, setPaused] = useState(false)
  const small = skin.displayMode === 'small'
  const canvasWidth = small ? 560 : 760
  const canvasHeight = small ? 140 : 300
  const palette = small ? getSmallTemplate(skin.templateKey) : getFallbackPoster(skin.fallbackPosterKey ?? '')
  const color = palette && 'borderColor' in palette ? palette.borderColor : palette && 'color' in palette ? palette.color : '#E8720C'

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
        <div className={`skin-stage skin-stage--${skin.displayMode}`}
          style={{ width: canvasWidth, height: canvasHeight, transform: `scale(${width / canvasWidth})`,
            borderColor: color, backgroundImage: `linear-gradient(180deg, ${color}18, #fff 80%)` }}>
          {small ? (
            <div className="skin-stage__logo" aria-hidden="true">
              🍣
              <span className="skin-stage__logo-tag">广告</span>
              <span className="skin-stage__logo-overlay">爆單暫停接單</span>
            </div>
          ) : <SkinPoster key={`${skin.templateKey}:${skin.customImage}:${skin.fallbackPosterKey}`} skin={skin} />}
          <div className="skin-stage__body">
            <MerchantInfo />
            {!small && <Dishes key={skin.templateKey} layout={skin.layout ?? 'grid'} animate={interactive && !paused} />}
          </div>
        </div>
      </div>
      {interactive && !small && skin.layout === 'carousel' && (
        <div className="skin-preview__controls">
          <Button size="small" disabled={false} onClick={() => setPaused(value => !value)}>
            {paused ? '播放輪播' : '暫停輪播'}
          </Button>
        </div>
      )}
    </div>
  )
}
