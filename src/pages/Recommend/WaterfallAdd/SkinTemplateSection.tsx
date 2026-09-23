/**
 * 人气商家 - 皮肤模板配置区（定价页专用）
 *
 * 布局：
 * - 全宽模板画廊：每个模板卡片包含等比缩放的实时预览（SkinTemplatePreview）
 * - 下方配置面板：选中模板后在画廊下方编辑名称、售价、等级、兜底图等
 * - 放大预览弹窗：使用 SkinTemplatePreview 渲染全尺寸效果
 *
 * 数据以受控方式由父组件持有，本组件负责渲染与交互。
 */
import { useRef, useState, type Dispatch, type SetStateAction } from 'react'
import { useTranslation } from 'react-i18next'
import { Button, Input, InputNumber, Modal, Switch, Tag, Upload, message } from 'antd'
import { CheckCircleFilled, EyeOutlined, PlusOutlined } from '@ant-design/icons'
import {
  SMALL_SKIN_TEMPLATES,
  LARGE_SKIN_TEMPLATES,
  FALLBACK_POSTERS,
  SKIN_TIER_CONFIG,
  SKIN_TIER_ORDER,
  type DisplayMode,
  type SkinTier,
  type SkinSaleConfig,
  getTierConfig,
  getCustomPosterImages,
  getPosterSource,
  getMissingPosterLanguages,
  POSTER_LANGUAGES,
  type PosterLocale,
} from '../../../constants/popularSkinTemplates'
import SkinTemplatePreview from './SkinTemplatePreview'
import './SkinTemplateSection.css'

interface SkinTemplateSectionProps {
  /** 小图 11 套配置 */
  smallSkins: SkinSaleConfig[]
  /** 大图 4 套配置 */
  largeSkins: SkinSaleConfig[]
  onSmallChange: Dispatch<SetStateAction<SkinSaleConfig[]>>
  onLargeChange: Dispatch<SetStateAction<SkinSaleConfig[]>>
  /** 详情只读模式 */
  disabled?: boolean
}

/** 已开启售卖皮肤的信息完整度：missing=待完善 / ok=可售卖 */
type SkinCompleteness = 'off' | 'missing' | 'ok'

/** 校验单套已开启皮肤的必填信息 */
const checkCompleteness = (skin: SkinSaleConfig): SkinCompleteness => {
  if (!skin.saleEnabled) return 'off'
  if (!skin.name.trim() || skin.price === undefined || skin.price <= 0 || getMissingPosterLanguages(skin).length > 0) return 'missing'
  return 'ok'
}

/** 售卖状态标签配置（§A.1 登记语义色） */
const STATUS_META: Record<SkinCompleteness, { labelKey: string; color: string }> = {
  off: { labelKey: 'recommend.popularSkin.gallerySaleOff', color: '#8C8C8C' },
  missing: { labelKey: 'recommend.popularSkin.gallerySaleMissing', color: '#FA8C16' },
  ok: { labelKey: 'recommend.popularSkin.gallerySaleReady', color: '#52C41A' },
}

function TierBadge({ tier }: { tier: SkinTier }) {
  const { t } = useTranslation()
  const config = getTierConfig(tier)
  return <Tag className="skin-tier-badge" style={config.badge}>{config.icon}{t(config.labelKey)}</Tag>
}

/** 皮肤等级分段选择器（沿用定价页会员等级样式） */
function TierSelector({ value, onChange, disabled }: {
  value: SkinTier
  onChange: (tier: SkinTier) => void
  disabled?: boolean
}) {
  const idx = Math.max(0, SKIN_TIER_ORDER.indexOf(value))
  const selectedColor = SKIN_TIER_CONFIG[SKIN_TIER_ORDER[idx]].color
  return (
    <div style={{
      position: 'relative', display: 'flex', padding: 3, borderRadius: 8,
      background: '#f2f3f5', opacity: disabled ? 0.6 : 1, transition: 'opacity 0.3s',
    }}>
      <div style={{
        position: 'absolute', top: 3, bottom: 3, left: 3,
        width: `calc((100% - 6px) / ${SKIN_TIER_ORDER.length})`,
        transform: `translateX(${idx * 100}%)`, borderRadius: 6, background: selectedColor,
        boxShadow: `0 2px 6px ${selectedColor}45`,
        transition: 'transform 0.3s cubic-bezier(0.4,0,0.2,1), background-color 0.3s, box-shadow 0.3s',
        pointerEvents: 'none',
      }} />
      {SKIN_TIER_ORDER.map((tier, i) => {
        const selected = i === idx
        const cfg = SKIN_TIER_CONFIG[tier]
        return (
          <div
            key={tier}
            onClick={() => !disabled && onChange(tier)}
            style={{
              position: 'relative', flex: 1, textAlign: 'center', padding: '5px 0',
              fontSize: 12, lineHeight: '18px', fontWeight: selected ? 600 : 400,
              color: selected ? '#fff' : '#8c8c8c',
              cursor: disabled ? 'not-allowed' : 'pointer', transition: 'color 0.25s',
              userSelect: 'none', zIndex: 1,
            }}
          >
            {cfg.labelKey.split('.').pop() === 'skinTierClassic' ? '經典'
              : cfg.labelKey.split('.').pop() === 'skinTierPremium' ? '精選'
              : cfg.labelKey.split('.').pop() === 'skinTierFlagship' ? '旗艦' : '至尊'}
          </div>
        )
      })}
    </div>
  )
}

export default function SkinTemplateSection({
  smallSkins, largeSkins, onSmallChange, onLargeChange, disabled,
}: SkinTemplateSectionProps) {
  const { t } = useTranslation()
  const [activeMode, setActiveMode] = useState<DisplayMode>('small')
  const [selectedKey, setSelectedKey] = useState<string>(SMALL_SKIN_TEMPLATES[0].key)
  const [previewKey, setPreviewKey] = useState<string | null>(null)
  const [uploading, setUploading] = useState<Record<string, boolean>>({})
  const uploadVersions = useRef<Record<string, number>>({})
  const galleryRef = useRef<HTMLDivElement>(null)
  const previewSkin = [...smallSkins, ...largeSkins].find(skin => skin.templateKey === previewKey) ?? null

  const skins = activeMode === 'small' ? smallSkins : largeSkins
  const setSkins = activeMode === 'small' ? onSmallChange : onLargeChange
  const templates = activeMode === 'small' ? SMALL_SKIN_TEMPLATES : LARGE_SKIN_TEMPLATES

  const selectedSkin = skins.find(s => s.templateKey === selectedKey) ?? null
  const posterSource = selectedSkin ? getPosterSource(selectedSkin) : 'fallback'
  const customImages = selectedSkin ? getCustomPosterImages(selectedSkin) : {}

  const smallOk = smallSkins.filter(s => checkCompleteness(s) === 'ok').length
  const largeOk = largeSkins.filter(s => checkCompleteness(s) === 'ok').length

  /** 更新当前选中皮肤的字段 */
  const patchSelected = (patch: Partial<SkinSaleConfig>) => {
    if (!selectedSkin) return
    if (disabled) return
    setSkins(previous => previous.map(s => (s.templateKey === selectedSkin.templateKey ? { ...s, ...patch } : s)))
  }

  /** 切换模式时同步选中该模式的第一个模板 */
  const handleModeChange = (mode: DisplayMode) => {
    setActiveMode(mode)
    const first = (mode === 'small' ? SMALL_SKIN_TEMPLATES : LARGE_SKIN_TEMPLATES)[0]
    setSelectedKey(first.key)
    if (galleryRef.current) galleryRef.current.scrollTop = 0
  }

  /** 配置区始终紧邻限高列表，选中时保留当前浏览位置。 */
  const handleSelectSkin = (key: string) => {
    setSelectedKey(key)
  }

  const handlePreviewSkin = (skin: SkinSaleConfig) => {
    setPreviewKey(skin.templateKey)
  }

  const patchCustomImage = (templateKey: string, locale: PosterLocale, image?: string) => {
    onLargeChange(previous => previous.map(skin => skin.templateKey === templateKey ? {
      ...skin, customImage: null, customImages: { ...getCustomPosterImages(skin), [locale]: image },
    } : skin))
  }

  /** 本地预览校验；未来接上传接口时后端必须重新校验文件。 */
  const handleUploadCustom = async (file: File, locale: PosterLocale) => {
    if (!selectedSkin || disabled) return
    const formats: Record<string, string[]> = { 'image/png': ['png'], 'image/jpeg': ['jpg', 'jpeg'], 'image/webp': ['webp'] }
    const extension = file.name.split('.').pop()?.toLowerCase() ?? ''
    if (!formats[file.type]?.includes(extension)) {
      message.error(t('recommend.popularSkin.posterInvalidFormat'))
      return
    }
    if (file.size > 5 * 1024 * 1024) {
      message.error(t('recommend.popularSkin.posterTooLarge'))
      return
    }
    const templateKey = selectedSkin.templateKey
    const jobKey = `${templateKey}:${locale}`
    const version = (uploadVersions.current[jobKey] ?? 0) + 1
    uploadVersions.current[jobKey] = version
    setUploading(previous => ({ ...previous, [jobKey]: true }))
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('图片读取失败'))
        reader.onerror = () => reject(new Error('图片读取失败'))
        reader.onabort = () => reject(new Error('图片读取已取消'))
        reader.readAsDataURL(file)
      })
      await new Promise<void>((resolve, reject) => {
        const image = new window.Image()
        image.onload = () => image.naturalWidth > 0 && image.naturalHeight > 0
          ? resolve() : reject(new Error('图片尺寸无效'))
        image.onerror = () => reject(new Error('图片格式无效'))
        image.src = dataUrl
      })
      // 使用模板键和函数式更新，三种语言同时上传、切换皮肤时不会相互覆盖。
      if (uploadVersions.current[jobKey] === version) patchCustomImage(templateKey, locale, dataUrl)
    } catch {
      if (uploadVersions.current[jobKey] === version) message.error(t('recommend.popularSkin.posterReadFailed'))
    } finally {
      if (uploadVersions.current[jobKey] === version) setUploading(previous => ({ ...previous, [jobKey]: false }))
    }
  }

  const fieldLabel = (text: string, required?: boolean) => (
    <div style={{ fontSize: 13, color: '#595959', marginBottom: 4 }}>
      {required && <span style={{ color: '#ff4d4f', marginRight: 4 }}>*</span>}
      {text}
    </div>
  )

  return (
    <div className="skin-template-section">
      {/* 汇总说明 */}
      <div className="skin-gallery-summary">
        {t('recommend.popularSkin.gallerySummary', {
          small: smallOk, smallTotal: SMALL_SKIN_TEMPLATES.length,
          large: largeOk, largeTotal: LARGE_SKIN_TEMPLATES.length,
        })}
      </div>

      {/* 模式切换 Tab */}
      <div className="skin-gallery-toolbar">
        <div className="skin-gallery-modes" role="group" aria-label={t('recommend.popularSkin.galleryModeLabel')}>
          {([
            { mode: 'small' as const, label: t('recommend.popularSkin.gallerySmallMode', { count: SMALL_SKIN_TEMPLATES.length }) },
            { mode: 'large' as const, label: t('recommend.popularSkin.galleryLargeMode', { count: LARGE_SKIN_TEMPLATES.length }) },
          ]).map(({ mode, label }) => (
            <Button key={mode} disabled={false} type={activeMode === mode ? 'primary' : 'default'}
              aria-pressed={activeMode === mode} onClick={() => handleModeChange(mode)}>
              {label}
            </Button>
          ))}
        </div>
        <span className="skin-gallery-toolbar__hint">{t('recommend.popularSkin.galleryHint')}</span>
      </div>

      {/* ===== 模板画廊 ===== */}
      <div ref={galleryRef} className="skin-gallery-scroll" role="region"
        aria-label={t('recommend.popularSkin.skinListCard')} tabIndex={0}>
        <div className={`skin-gallery skin-gallery--${activeMode}`}>
          {templates.map((tpl, i) => {
            const skin = skins.find(s => s.templateKey === tpl.key)
            if (!skin) return null
            const status = STATUS_META[checkCompleteness(skin)]
            const isSelected = selectedKey === tpl.key
            const name = skin.name || tpl.defaultName
            return (
              <div key={tpl.key} className={`skin-gallery-card${isSelected ? ' skin-gallery-card--selected' : ''}`}>
                <button type="button" className="skin-gallery-card__select"
                  aria-pressed={isSelected} aria-label={t('recommend.popularSkin.gallerySelect', { name })}
                  onClick={() => handleSelectSkin(tpl.key)}>
                  <span className="skin-gallery-card__header">
                    <span className="skin-gallery-card__index">{i + 1}</span>
                    <span className="skin-gallery-card__heading">
                      <span className="skin-gallery-card__name" title={name}>{name}</span>
                      {skin.saleEnabled && <TierBadge tier={skin.tier} />}
                    </span>
                    {isSelected && <CheckCircleFilled className="skin-gallery-card__check" />}
                  </span>
                  <div className="skin-gallery-card__preview" aria-hidden="true">
                    <SkinTemplatePreview skin={skin} />
                  </div>
                </button>
                <div className="skin-gallery-card__footer">
                  <span className="skin-gallery-card__status" style={{ color: status.color }}>{t(status.labelKey)}</span>
                  <div className="skin-gallery-card__spacer" />
                  {skin.price ? (
                    <span className="skin-gallery-card__price">
                      ${skin.price}<span className="skin-gallery-card__price-unit">/{t('recommend.popularSkin.dayAddon')}</span>
                    </span>
                  ) : <span className="skin-gallery-card__unpriced">{t('recommend.popularSkin.galleryUnpriced')}</span>}
                  <Button type="link" size="small" disabled={false} icon={<EyeOutlined />}
                    aria-label={t('recommend.popularSkin.galleryPreview', { name })}
                    onClick={() => handlePreviewSkin(skin)}>
                    {t('recommend.popularSkin.skinPreview')}
                  </Button>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* ===== 下方配置面板 ===== */}
      <div className="skin-config">
        {!selectedSkin ? (
          <div style={{ textAlign: 'center', color: '#BFBFBF', padding: 40 }}>請選擇一套皮膚進行配置</div>
        ) : (
          <>
            {/* 面板头 */}
            <div className="skin-config__header">
              <span className="skin-config__title">
                {t(activeMode === 'small' ? 'recommend.popularSkin.gallerySmallConfig' : 'recommend.popularSkin.galleryLargeConfig')}
                <span className="skin-config__selected-name">{selectedSkin.name}</span>
              </span>
              {selectedSkin.saleEnabled && <TierBadge tier={selectedSkin.tier} />}
            </div>

            {/* 售卖开关 */}
            <div className="skin-config__switch-row">
              <Switch
                checked={selectedSkin.saleEnabled}
                disabled={disabled}
                checkedChildren="售賣中"
                unCheckedChildren="未售賣"
                onChange={checked => patchSelected({ saleEnabled: checked })}
                style={{ background: selectedSkin.saleEnabled ? '#52C41A' : undefined }}
              />
              <span className="skin-config__switch-hint">
                {selectedSkin.saleEnabled
                  ? '該皮膚將出現在購買界面，需完成下方配置'
                  : '開啟後方可配置售價並上架售賣'}
              </span>
            </div>

            {/* 名称 / 售价 / 等级 */}
            <div className="skin-config__fields">
              <div>
                {fieldLabel('皮膚名稱', true)}
                <Input
                  placeholder="請輸入皮膚名稱"
                  aria-label={t('recommend.popularSkin.skinNameLabel')}
                  value={selectedSkin.name}
                  maxLength={20}
                  allowClear
                  disabled={disabled || !selectedSkin.saleEnabled}
                  onChange={e => patchSelected({ name: e.target.value })}
                />
              </div>
              <div>
                {fieldLabel('售價', true)}
                <InputNumber
                  style={{ width: '100%' }}
                  min={1}
                  precision={0}
                  placeholder="請輸入每日售價"
                  aria-label={t('recommend.popularSkin.skinPriceLabel')}
                  value={selectedSkin.price}
                  disabled={disabled || !selectedSkin.saleEnabled}
                  onChange={v => patchSelected({ price: v ?? undefined })}
                  addonAfter="MOP/天"
                />
              </div>
              <div>
                {fieldLabel('皮膚等級')}
                <TierSelector
                  value={selectedSkin.tier}
                  onChange={v => patchSelected({ tier: v })}
                  disabled={disabled || !selectedSkin.saleEnabled}
                />
              </div>
            </div>

            {/* 大图模式专属：版式说明 + 兜底图选择 + 自定义上传 */}
            {activeMode === 'large' && (
              <>
                <div className="skin-config__layout-info">
                  版式：<b>{LARGE_SKIN_TEMPLATES.find(t => t.key === selectedSkin.templateKey)?.defaultName}</b>
                  {' — '}
                  {LARGE_SKIN_TEMPLATES.find(t => t.key === selectedSkin.templateKey)?.description}
                </div>

                {fieldLabel(t('recommend.popularSkin.posterLabel'), true)}
                <div className="skin-config__poster-modes" role="group" aria-label={t('recommend.popularSkin.posterSource')}>
                  {(['fallback', 'custom'] as const).map(source => (
                    <Button key={source} disabled={disabled} type={posterSource === source ? 'primary' : 'default'}
                      aria-pressed={posterSource === source} onClick={() => patchSelected({ posterSource: source })}>
                      {t(source === 'custom' ? 'recommend.popularSkin.posterCustom' : 'recommend.popularSkin.posterFallback')}
                    </Button>
                  ))}
                </div>
                <div className="skin-config__poster-local-hint">{t('recommend.popularSkin.posterLocalOnly')}</div>
                {posterSource === 'custom' ? (
                  <>
                    <div className="skin-config__poster-upload-grid">
                      {POSTER_LANGUAGES.map(({ locale, labelKey }) => {
                        const src = customImages[locale]
                        const busy = uploading[`${selectedSkin.templateKey}:${locale}`]
                        return (
                          <div key={locale} className="skin-config__poster-upload-item">
                            {fieldLabel(t(labelKey), true)}
                            <Upload accept="image/png,image/jpeg,image/webp" showUploadList={false} disabled={disabled || busy}
                              beforeUpload={file => { void handleUploadCustom(file, locale); return false }}>
                              <button type="button" className="skin-config__poster-upload" disabled={disabled || busy}
                                aria-label={t('recommend.popularSkin.posterUploadLanguage', { language: t(labelKey) })} aria-busy={busy || false}>
                                {src ? <img src={src} alt={t(labelKey)} /> : <PlusOutlined />}
                                <span>{t(busy ? 'recommend.popularSkin.posterUploading' : src ? 'recommend.popularSkin.posterReplace' : 'recommend.popularSkin.posterUpload')}</span>
                              </button>
                            </Upload>
                            {src && <Button type="link" size="small" danger disabled={disabled || busy}
                              onClick={() => patchCustomImage(selectedSkin.templateKey, locale)}>
                              {t('recommend.popularSkin.posterRemove')}
                            </Button>}
                          </div>
                        )
                      })}
                    </div>
                    <div className="skin-config__poster-help">{t('recommend.popularSkin.posterUploadHint')}</div>
                  </>
                ) : (
                  <div className="skin-config__poster-grid">
                    <div className="skin-config__poster-grid-label">
                      {t('recommend.popularSkin.posterFallbackCount', { count: FALLBACK_POSTERS.length })}
                    </div>
                    <div className="skin-config__poster-options">
                      {FALLBACK_POSTERS.map(p => {
                        const active = selectedSkin.fallbackPosterKey === p.key
                        return (
                          <button type="button" key={p.key} title={p.name} aria-label={p.name} aria-pressed={active} disabled={disabled}
                            className={`skin-config__poster-option${active ? ' skin-config__poster-option--active' : ''}`}
                            style={{ background: p.gradientCss }}
                            onClick={() => patchSelected({ fallbackPosterKey: p.key })}>
                            <span className="skin-config__poster-option-name">{p.name}</span>
                            {active && <span className="skin-config__poster-option-check">✓</span>}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )}
              </>
            )}

            {/* 未开启提示 */}
            {!selectedSkin.saleEnabled && (
              <div className="skin-config__warning">
                該皮膚當前未售賣，開啟售賣開關後填寫的名稱、售價、等級將同步至購買界面。
              </div>
            )}
          </>
        )}
      </div>

      {/* ===== 放大预览弹窗 ===== */}
      <Modal
        open={!!previewSkin}
        title={previewSkin ? `皮膚預覽 · ${previewSkin.name || '未命名'}` : '皮膚預覽'}
        footer={null}
        width={previewSkin?.displayMode === 'small' ? 680 : 880}
        centered
        destroyOnClose
        className="skin-preview-modal"
        onCancel={() => setPreviewKey(null)}
      >
        {previewSkin && (
          <div className="skin-preview-modal__content">
            <SkinTemplatePreview key={previewSkin.templateKey} skin={previewSkin} autoPlay />
            <div className="skin-preview-modal__hint">
              店鋪名稱、評分、商品圖與優惠信息為示意數據，實際以商家數據自動生成為準。
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
