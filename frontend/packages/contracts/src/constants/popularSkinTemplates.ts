/**
 * 人气商家 - 皮肤模板常量定义（定价页 + 购买页共享）
 *
 * 设计说明：
 * - 小图模式：固定11套「边框+渐变」配色方案，每套独立售卖
 * - 大图模式：固定4套版式（大图拼列/阶梯轮播/三图并列/单品大图），每套独立售卖
 * - 大图模式左侧竖版海报：11张兜底图可选 + 自定义上传（非必填）
 * - 皮肤等级沿用经典/精选/旗舰/至尊四级
 *
 * 本文件是模板的唯一数据源，定价和购买页均从此导入，保证一致性。
 */

/* ==================== 类型定义 ==================== */

/** 展示模式 */
export type DisplayMode = 'small' | 'large'

/** 大图版式（4套） */
export type LargeLayout = 'grid' | 'carousel' | 'triple' | 'hero'

/** 皮肤等级 */
export type SkinTier = 'classic' | 'premium' | 'flagship' | 'ultimate'

/** 海报来源互斥，未选择自定义时只使用兜底图。 */
export type PosterSource = 'fallback' | 'custom'

export const POSTER_LANGUAGES = [
  { locale: 'zh-CN', labelKey: 'recommend.popularSkin.posterSimplified' },
  { locale: 'zh-TW', labelKey: 'recommend.popularSkin.posterTraditional' },
  { locale: 'en', labelKey: 'recommend.popularSkin.posterEnglish' },
] as const

export type PosterLocale = typeof POSTER_LANGUAGES[number]['locale']
export type CustomPosterImages = Partial<Record<PosterLocale, string>>

/** 小图模板定义 */
export interface SmallSkinTemplate {
  key: string
  /** 默认名称（可修改） */
  defaultName: string
  /** 边框颜色 HEX */
  borderColor: string
  /** 渐变主色 HEX */
  gradientColor: string
  /** 渐变 CSS（用于预览） */
  gradientCss: string
}

/** 大图模板定义 */
export interface LargeSkinTemplate {
  key: string
  /** 默认名称 */
  defaultName: string
  /** 版式类型 */
  layout: LargeLayout
  /** 版式说明 */
  description: string
}

/** 兜底海报图定义 */
export interface FallbackPoster {
  key: string
  /** 颜色名称 */
  name: string
  /** 主色 HEX */
  color: string
  /** 渐变 CSS */
  gradientCss: string
}

/** 皮肤售卖配置条目（定价保存的数据结构） */
export interface SkinSaleConfig {
  /** 模板唯一 key（不可变） */
  templateKey: string
  /** 展示模式 */
  displayMode: DisplayMode
  /** 是否开启售卖 */
  saleEnabled: boolean
  /** 皮肤名称（可编辑） */
  name: string
  /** 售价 MOP/天 */
  price?: number
  /** 等级 */
  tier: SkinTier
  /** 大图版式（仅 large 模式） */
  layout?: LargeLayout
  /** 兜底海报 key（仅 large 模式） */
  fallbackPosterKey?: string
  /** 自定义上传图 dataURL（仅 large 模式，非必填） */
  customImage?: string | null
  /** 仅用于本地预览，尚未接入后端保存。 */
  posterSource?: PosterSource
  customImages?: CustomPosterImages
}

/* ==================== 小图模式：11套固定配色模板 ==================== */

// 保留模板键与名称，利用色相、明度和饱和度区分近色，避免影响已有定价匹配。
export const SMALL_SKIN_TEMPLATES: SmallSkinTemplate[] = [
  { key: 'small_red', defaultName: '活力红', borderColor: '#D92D3A', gradientColor: '#F15B64', gradientCss: 'linear-gradient(180deg, #F15B6466, #F15B6418 55%, #fff)' },
  { key: 'small_orange', defaultName: '暖橙', borderColor: '#E86A00', gradientColor: '#FF9B36', gradientCss: 'linear-gradient(180deg, #FF9B3666, #FF9B3618 55%, #fff)' },
  { key: 'small_amber', defaultName: '明黄', borderColor: '#C9A900', gradientColor: '#F7DA46', gradientCss: 'linear-gradient(180deg, #F7DA4680, #F7DA4618 55%, #fff)' },
  { key: 'small_purple', defaultName: '魅紫', borderColor: '#6036C8', gradientColor: '#956EE8', gradientCss: 'linear-gradient(180deg, #956EE866, #956EE818 55%, #fff)' },
  { key: 'small_magenta', defaultName: '洋红', borderColor: '#A81498', gradientColor: '#C850B9', gradientCss: 'linear-gradient(180deg, #C850B966, #C850B918 55%, #fff)' },
  { key: 'small_pink', defaultName: '桃粉', borderColor: '#D56B96', gradientColor: '#F6BDCF', gradientCss: 'linear-gradient(180deg, #F6BDCF80, #F6BDCF18 55%, #fff)' },
  { key: 'small_blue', defaultName: '天蓝', borderColor: '#2370D8', gradientColor: '#77B3F4', gradientCss: 'linear-gradient(180deg, #77B3F466, #77B3F418 55%, #fff)' },
  { key: 'small_green', defaultName: '鲜绿', borderColor: '#43951A', gradientColor: '#A3D15B', gradientCss: 'linear-gradient(180deg, #A3D15B66, #A3D15B18 55%, #fff)' },
  { key: 'small_teal', defaultName: '湖青', borderColor: '#008D8F', gradientColor: '#55C7BF', gradientCss: 'linear-gradient(180deg, #55C7BF66, #55C7BF18 55%, #fff)' },
  { key: 'small_brown', defaultName: '深棕', borderColor: '#704638', gradientColor: '#9D7765', gradientCss: 'linear-gradient(180deg, #9D776580, #9D776518 55%, #fff)' },
  { key: 'small_gold', defaultName: '鎏金', borderColor: '#8F7B39', gradientColor: '#CCB978', gradientCss: 'linear-gradient(180deg, #CCB97880, #CCB97818 55%, #fff)' },
]

/* ==================== 大图模式：4套版式模板 ==================== */

export const LARGE_SKIN_TEMPLATES: LargeSkinTemplate[] = [
  { key: 'large_grid', defaultName: '大图拼列', layout: 'grid', description: '左侧竖版海报 + 右侧店铺信息，下方1大2小商品图' },
  { key: 'large_carousel', defaultName: '阶梯轮播', layout: 'carousel', description: '左侧竖版海报 + 右侧商品卡阶梯堆叠轮播' },
  { key: 'large_triple', defaultName: '三图并列', layout: 'triple', description: '左侧竖版海报 + 右侧3张等宽商品卡并列' },
  { key: 'large_hero', defaultName: '单品大图', layout: 'hero', description: '左侧竖版海报 + 右侧1张横向主推商品大图' },
]

/* ==================== 兜底海报图：11张（与大图模式左侧竖版海报对应） ==================== */

export const FALLBACK_POSTERS: FallbackPoster[] = [
  { key: 'poster_red', name: '活力红', color: '#FF1806', gradientCss: 'linear-gradient(180deg, #FF1806 0%, #FF6347 100%)' },
  { key: 'poster_orange', name: '暖橙', color: '#FF5400', gradientCss: 'linear-gradient(180deg, #FF5400 0%, #FF8C42 100%)' },
  { key: 'poster_amber', name: '明黄', color: '#FF9E00', gradientCss: 'linear-gradient(180deg, #FF9E00 0%, #FFD54F 100%)' },
  { key: 'poster_purple', name: '魅紫', color: '#7C4DFF', gradientCss: 'linear-gradient(180deg, #7C4DFF 0%, #B388FF 100%)' },
  { key: 'poster_magenta', name: '洋红', color: '#E20BFE', gradientCss: 'linear-gradient(180deg, #E20BFE 0%, #F48FB1 100%)' },
  { key: 'poster_pink', name: '桃粉', color: '#FF4081', gradientCss: 'linear-gradient(180deg, #FF4081 0%, #FF80AB 100%)' },
  { key: 'poster_blue', name: '天蓝', color: '#00B5FD', gradientCss: 'linear-gradient(180deg, #00B5FD 0%, #4FC3F7 100%)' },
  { key: 'poster_green', name: '鲜绿', color: '#00C100', gradientCss: 'linear-gradient(180deg, #00C100 0%, #69F0AE 100%)' },
  { key: 'poster_teal', name: '湖青', color: '#00BCD4', gradientCss: 'linear-gradient(180deg, #00BCD4 0%, #4DD0E1 100%)' },
  { key: 'poster_brown', name: '深棕', color: '#5D4037', gradientCss: 'linear-gradient(180deg, #5D4037 0%, #8D6E63 100%)' },
  { key: 'poster_gold', name: '鎏金', color: '#A16E1B', gradientCss: 'linear-gradient(180deg, #A16E1B 0%, #FFD54F 100%)' },
]

/* ==================== 皮肤等级配置 ==================== */

export const SKIN_TIER_CONFIG: Record<SkinTier, {
  labelKey: string
  color: string
  bg: string
  badge: React.CSSProperties
  icon?: string
}> = {
  classic: {
    labelKey: 'recommend.popularSkin.skinTierClassic',
    color: '#08979C', bg: '#E6FFFB',
    badge: {
      fontSize: 12, fontWeight: 600, color: '#08979C',
      background: 'linear-gradient(135deg, #E6FFFB, #B5F5EC)',
      borderRadius: 4, padding: '1px 10px',
      border: '1px solid #87E8DE',
      boxShadow: '0 1px 3px rgba(8,151,156,0.15)',
    },
  },
  premium: {
    labelKey: 'recommend.popularSkin.skinTierPremium',
    color: '#2F54EB', bg: '#F0F5FF',
    badge: {
      fontSize: 12, fontWeight: 600, color: '#2F54EB',
      background: 'linear-gradient(135deg, #F0F5FF, #D6E4FF)',
      borderRadius: 4, padding: '1px 10px',
      border: '1px solid #ADC6FF',
      boxShadow: '0 1px 3px rgba(47,84,235,0.15)',
    },
  },
  flagship: {
    labelKey: 'recommend.popularSkin.skinTierFlagship',
    color: '#722ED1', bg: '#F9F0FF',
    badge: {
      fontSize: 12, fontWeight: 700, color: '#fff',
      background: 'linear-gradient(135deg, #722ED1, #9254DE)',
      borderRadius: 4, padding: '1px 10px',
      border: '1px solid rgba(255,255,255,0.3)',
      boxShadow: '0 2px 6px rgba(114,46,209,0.35)',
      textShadow: '0 1px 2px rgba(0,0,0,0.15)',
    },
  },
  ultimate: {
    labelKey: 'recommend.popularSkin.skinTierUltimate',
    color: '#D48806', bg: '#FFFBE6', icon: '✦',
    badge: {
      fontSize: 12, fontWeight: 700, color: '#fff',
      background: 'linear-gradient(135deg, #D48806, #FFC53D, #D48806)',
      backgroundSize: '200% 200%',
      borderRadius: 4, padding: '1px 10px',
      border: '1px solid rgba(255,255,255,0.35)',
      boxShadow: '0 2px 8px rgba(212,136,6,0.4), inset 0 1px 0 rgba(255,255,255,0.2)',
      textShadow: '0 1px 3px rgba(0,0,0,0.2)',
      animation: 'tierShimmer 2.5s ease-in-out infinite',
    },
  },
}

export const SKIN_TIER_ORDER: SkinTier[] = ['classic', 'premium', 'flagship', 'ultimate']

/* ==================== 工具函数 ==================== */

/** 兼容旧单图预览；旧图只算繁体图，不能代替另外两种语言。 */
export function getCustomPosterImages(skin: SkinSaleConfig): CustomPosterImages {
  return { ...(skin.customImage ? { 'zh-TW': skin.customImage } : {}), ...skin.customImages }
}

export function getPosterSource(skin: SkinSaleConfig): PosterSource {
  return skin.posterSource ?? (Object.values(getCustomPosterImages(skin)).some(Boolean) ? 'custom' : 'fallback')
}

export function getMissingPosterLanguages(skin: SkinSaleConfig) {
  if (skin.displayMode !== 'large' || getPosterSource(skin) !== 'custom') return []
  const images = getCustomPosterImages(skin)
  return POSTER_LANGUAGES.filter(({ locale }) => !images[locale])
}

export function getPosterLocale(language: string): PosterLocale {
  if (language.toLowerCase().startsWith('en')) return 'en'
  if (language === 'zh-CN' || language.toLowerCase().startsWith('zh-hans')) return 'zh-CN'
  return 'zh-TW'
}

/** 根据模板 key 获取小图模板 */
export function getSmallTemplate(key: string): SmallSkinTemplate | undefined {
  return SMALL_SKIN_TEMPLATES.find(t => t.key === key)
}

/** 根据模板 key 获取大图模板 */
export function getLargeTemplate(key: string): LargeSkinTemplate | undefined {
  return LARGE_SKIN_TEMPLATES.find(t => t.key === key)
}

/** 根据 key 获取兜底海报 */
export function getFallbackPoster(key: string): FallbackPoster | undefined {
  return FALLBACK_POSTERS.find(p => p.key === key)
}

/** 获取等级配置 */
export function getTierConfig(tier: SkinTier) {
  return SKIN_TIER_CONFIG[tier] ?? SKIN_TIER_CONFIG.classic
}

/** 创建默认的小图皮肤配置（全部未开启售卖） */
export function createDefaultSmallSkins(): SkinSaleConfig[] {
  return SMALL_SKIN_TEMPLATES.map(t => ({
    templateKey: t.key,
    displayMode: 'small' as DisplayMode,
    saleEnabled: false,
    name: t.defaultName,
    price: undefined,
    tier: 'classic' as SkinTier,
  }))
}

/** 创建默认的大图皮肤配置（全部未开启售卖） */
export function createDefaultLargeSkins(): SkinSaleConfig[] {
  return LARGE_SKIN_TEMPLATES.map(t => ({
    templateKey: t.key,
    displayMode: 'large' as DisplayMode,
    saleEnabled: false,
    name: t.defaultName,
    price: undefined,
    tier: 'classic' as SkinTier,
    layout: t.layout,
    fallbackPosterKey: 'poster_red',
    posterSource: 'fallback',
    customImages: {},
    customImage: null,
  }))
}

/** 生成兜底海报 SVG dataURL（用于预览展示） */
export function buildPosterSvgDataUrl(poster: FallbackPoster): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="160" height="400" viewBox="0 0 160 400">`
    + `<defs><linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">`
    + `<stop offset="0%" stop-color="${poster.color}"/>`
    + `<stop offset="100%" stop-color="${poster.color}88"/>`
    + `</linearGradient></defs>`
    + `<rect width="160" height="400" rx="12" fill="url(#bg)"/>`
    + `<text x="80" y="180" font-size="48" text-anchor="middle" fill="rgba(255,255,255,0.15)" font-weight="900">人</text>`
    + `<text x="80" y="280" font-size="18" text-anchor="middle" fill="#fff" font-weight="700" font-family="PingFang SC, sans-serif">人氣商家</text>`
    + `<rect x="40" y="300" width="80" height="28" rx="14" fill="rgba(255,255,255,0.2)"/>`
    + `<text x="80" y="319" font-size="12" text-anchor="middle" fill="#fff" font-family="PingFang SC, sans-serif">立即進入 ▶</text>`
    + `</svg>`
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}
