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
import { useRef, useState } from 'react'
import { Button, Input, InputNumber, Modal, Switch, Upload, message } from 'antd'
import { EyeOutlined, PlusOutlined } from '@ant-design/icons'
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
  getSmallTemplate,
  getFallbackPoster,
  buildPosterSvgDataUrl,
} from '../../../constants/popularSkinTemplates'
import SkinTemplatePreview from './SkinTemplatePreview'
import './SkinTemplateSection.css'

interface SkinTemplateSectionProps {
  /** 小图 11 套配置 */
  smallSkins: SkinSaleConfig[]
  /** 大图 4 套配置 */
  largeSkins: SkinSaleConfig[]
  onSmallChange: (skins: SkinSaleConfig[]) => void
  onLargeChange: (skins: SkinSaleConfig[]) => void
  /** 详情只读模式 */
  disabled?: boolean
}

/** 已开启售卖皮肤的信息完整度：missing=待完善 / ok=可售卖 */
type SkinCompleteness = 'off' | 'missing' | 'ok'

/** 校验单套已开启皮肤的必填信息 */
const checkCompleteness = (skin: SkinSaleConfig): SkinCompleteness => {
  if (!skin.saleEnabled) return 'off'
  if (!skin.name.trim() || skin.price === undefined || skin.price <= 0) return 'missing'
  return 'ok'
}

/** 售卖状态标签配置（§A.1 登记语义色） */
const STATUS_META: Record<SkinCompleteness, { text: string; color: string; bg: string; border: string }> = {
  off: { text: '未售賣', color: '#8C8C8C', bg: '#F5F5F5', border: '#D9D9D9' },
  missing: { text: '待完善', color: '#FA8C16', bg: '#FFF7E6', border: '#FFD591' },
  ok: { text: '已開啟售賣', color: '#52C41A', bg: '#F6FFED', border: '#B7EB8F' },
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
  const [activeMode, setActiveMode] = useState<DisplayMode>('small')
  const [selectedKey, setSelectedKey] = useState<string>(SMALL_SKIN_TEMPLATES[0].key)
  const [previewSkin, setPreviewSkin] = useState<SkinSaleConfig | null>(null)
  const configRef = useRef<HTMLDivElement>(null)

  const skins = activeMode === 'small' ? smallSkins : largeSkins
  const setSkins = activeMode === 'small' ? onSmallChange : onLargeChange
  const templates = activeMode === 'small' ? SMALL_SKIN_TEMPLATES : LARGE_SKIN_TEMPLATES

  const selectedSkin = skins.find(s => s.templateKey === selectedKey) ?? null

  const smallOk = smallSkins.filter(s => checkCompleteness(s) === 'ok').length
  const largeOk = largeSkins.filter(s => checkCompleteness(s) === 'ok').length

  /** 更新当前选中皮肤的字段 */
  const patchSelected = (patch: Partial<SkinSaleConfig>) => {
    if (!selectedSkin) return
    setSkins(skins.map(s => (s.templateKey === selectedSkin.templateKey ? { ...s, ...patch } : s)))
  }

  /** 切换模式时同步选中该模式的第一个模板 */
  const handleModeChange = (mode: DisplayMode) => {
    setActiveMode(mode)
    const first = (mode === 'small' ? SMALL_SKIN_TEMPLATES : LARGE_SKIN_TEMPLATES)[0]
    setSelectedKey(first.key)
  }

  /** 选中模板并滚动到配置面板 */
  const selectAndScroll = (key: string) => {
    setSelectedKey(key)
    requestAnimationFrame(() => {
      configRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    })
  }

  /** 上传自定义海报图（本地预览，Phase 2 接后端） */
  const handleUploadCustom = (file: File) => {
    if (!file.type.startsWith('image/')) {
      message.error('僅支持上傳圖片文件')
      return false
    }
    if (file.size > 5 * 1024 * 1024) {
      message.error('文件大小不能超過 5MB')
      return false
    }
    const reader = new FileReader()
    reader.onload = () => {
      patchSelected({ customImage: reader.result as string })
      message.success('自定義圖片已上傳，未上傳前將使用兜底圖')
    }
    reader.readAsDataURL(file)
    return false
  }

  /** 大图模式生效图片：自定义 → 兜底 → 中性占位 */
  const resolveLargeImage = (skin: SkinSaleConfig): { src?: string; posterColor?: string } => {
    if (skin.customImage) return { src: skin.customImage }
    const poster = skin.fallbackPosterKey ? getFallbackPoster(skin.fallbackPosterKey) : undefined
    if (poster) return { src: buildPosterSvgDataUrl(poster), posterColor: poster.color }
    return { posterColor: '#BFBFBF' }
  }

  const fieldLabel = (text: string, required?: boolean) => (
    <div style={{ fontSize: 13, color: '#595959', marginBottom: 4 }}>
      {required && <span style={{ color: '#ff4d4f', marginRight: 4 }}>*</span>}
      {text}
    </div>
  )

  return (
    <div>
      {/* 汇总说明 */}
      <div style={{ fontSize: 12, color: '#8C8C8C', marginBottom: 12 }}>
        小圖已開啟 {smallOk}/{SMALL_SKIN_TEMPLATES.length} 套 · 大圖已開啟 {largeOk}/{LARGE_SKIN_TEMPLATES.length} 套；
        開啟售賣的皮膚須填寫完整名稱、售價與等級，保存後在廣告銷售購買界面同步展示。
      </div>

      {/* 模式切换 Tab */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        {([
          { mode: 'small' as DisplayMode, label: `小圖模式（${SMALL_SKIN_TEMPLATES.length}套）` },
          { mode: 'large' as DisplayMode, label: `大圖模式（${LARGE_SKIN_TEMPLATES.length}套）` },
        ]).map(({ mode, label }) => {
          const active = activeMode === mode
          return (
            <div
              key={mode}
              onClick={() => handleModeChange(mode)}
              style={{
                padding: '6px 20px', borderRadius: 8, cursor: 'pointer', fontSize: 14, fontWeight: 600,
                color: active ? '#fff' : '#595959',
                background: active ? 'linear-gradient(135deg, #E8720C, #F59432)' : '#F5F5F5',
                boxShadow: active ? '0 2px 6px rgba(232,114,12,0.3)' : 'none',
                transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)', userSelect: 'none',
              }}
            >{label}</div>
          )
        })}
      </div>

      {/* ===== 模板画廊 ===== */}
      {activeMode === 'small' ? (
        /* 小图模式：精简色卡 3列布局 */
        <div className="skin-gallery">
          {templates.map((tpl, i) => {
            const skin = skins.find(s => s.templateKey === tpl.key)
            if (!skin) return null
            const completeness = checkCompleteness(skin)
            const status = STATUS_META[completeness]
            const isSelected = selectedKey === tpl.key
            const smallTpl = getSmallTemplate(tpl.key)
            const gradient = smallTpl?.gradientCss ?? '#f0f0f0'
            return (
              <div
                key={tpl.key}
                className={`skin-swatch-card${isSelected ? ' skin-swatch-card--selected' : ''}`}
                onClick={() => selectAndScroll(tpl.key)}
              >
                <div className="skin-swatch-card__body">
                  <div className="skin-swatch-card__gradient" style={{ background: gradient }} />
                  <span className="skin-swatch-card__index">{i + 1}</span>
                  <span className="skin-swatch-card__tier">
                    {skin.tier === 'classic' ? '經典' : skin.tier === 'premium' ? '精選'
                      : skin.tier === 'flagship' ? '旗艦' : '至尊'}
                  </span>
                  <div className="skin-swatch-card__name">{skin.name || tpl.defaultName}</div>
                  <span className={`skin-swatch-card__price${skin.price ? ' skin-swatch-card__price--set' : ''}`}>
                    {skin.saleEnabled && skin.price ? `$${skin.price}/天` : '未定價'}
                  </span>
                </div>
                <div className="skin-swatch-card__footer">
                  <span className="skin-swatch-card__preview-btn" onClick={e => { e.stopPropagation(); setPreviewSkin(skin) }}>
                    預覽
                  </span>
                  <span className="skin-swatch-card__status" style={{ color: status.color }}>
                    {completeness === 'off' ? '未銷售' : completeness === 'missing' ? '待完善' : '已銷售'}
                  </span>
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        /* 大图模式：保留实时预览缩略 */
        <div className="skin-gallery skin-gallery--large">
          {templates.map((tpl, i) => {
            const skin = skins.find(s => s.templateKey === tpl.key)
            if (!skin) return null
            const completeness = checkCompleteness(skin)
            const status = STATUS_META[completeness]
            const isSelected = selectedKey === tpl.key
            return (
              <div
                key={tpl.key}
                className={`skin-gallery-card${isSelected ? ' skin-gallery-card--selected' : ''}`}
                onClick={() => selectAndScroll(tpl.key)}
              >
                <div className="skin-gallery-card__header">
                  <span className="skin-gallery-card__index">{i + 1}</span>
                  <span className="skin-gallery-card__status" style={{
                    color: status.color, background: status.bg, border: `1px solid ${status.border}`,
                  }}>{status.text}</span>
                </div>
                <div className="skin-gallery-card__preview">
                  <SkinTemplatePreview skin={skin} />
                </div>
                <div className="skin-gallery-card__name">
                  {skin.name || tpl.defaultName}
                </div>
                <div className="skin-gallery-card__footer">
                  {(() => {
                    const tc = getTierConfig(skin.tier)
                    return (
                      <span style={{ ...tc.badge, fontSize: 9, padding: '0 6px' }}>
                        {tc.icon ? `${tc.icon} ` : ''}
                        {skin.tier === 'classic' ? '經典' : skin.tier === 'premium' ? '精選'
                          : skin.tier === 'flagship' ? '旗艦' : '至尊'}
                      </span>
                    )
                  })()}
                  <div className="skin-gallery-card__spacer" />
                  {skin.saleEnabled && skin.price ? (
                    <span className="skin-gallery-card__price">
                      ${skin.price}
                      <span className="skin-gallery-card__price-unit">/天</span>
                    </span>
                  ) : (
                    <span className="skin-gallery-card__unpriced">未定價</span>
                  )}
                </div>
                <div className="skin-gallery-card__actions">
                  <Button type="link" size="small" style={{ padding: 0, fontSize: 12 }}
                    onClick={e => { e.stopPropagation(); selectAndScroll(tpl.key) }}>
                    配置
                  </Button>
                  <Button type="link" size="small" icon={<EyeOutlined />}
                    style={{ padding: 0, fontSize: 12 }}
                    onClick={e => { e.stopPropagation(); setPreviewSkin(skin) }}>
                    預覽
                  </Button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* ===== 下方配置面板 ===== */}
      <div className="skin-config" ref={configRef}>
        {!selectedSkin ? (
          <div style={{ textAlign: 'center', color: '#BFBFBF', padding: 40 }}>請選擇一套皮膚進行配置</div>
        ) : (
          <>
            {/* 面板头 */}
            <div className="skin-config__header">
              <span className="skin-config__title">
                {activeMode === 'small' ? '小圖皮膚配置' : '大圖皮膚配置'}
              </span>
              {(() => {
                const tc = getTierConfig(selectedSkin.tier)
                return (
                  <span style={{ marginLeft: 8, ...tc.badge }}>
                    {tc.icon ? `${tc.icon} ` : ''}
                    {selectedSkin.tier === 'classic' ? '經典' : selectedSkin.tier === 'premium' ? '精選'
                      : selectedSkin.tier === 'flagship' ? '旗艦' : '至尊'}
                  </span>
                )
              })()}
              <div style={{ flex: 1 }} />
              <Button type="link" size="small" icon={<EyeOutlined />}
                onClick={() => setPreviewSkin(selectedSkin)}>
                預覽效果
              </Button>
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

                {fieldLabel('左側海報圖（自定義上傳為選填，未上傳使用兜底圖）')}
                <div className="skin-config__poster-section">
                  {/* 当前生效图预览 */}
                  <div className="skin-config__poster-current">
                    {(() => {
                      const img = resolveLargeImage(selectedSkin)
                      return (
                        <div className="skin-config__poster-thumb"
                          style={{ background: img.posterColor ?? '#fafafa' }}>
                          {img.src
                            ? <img src={img.src} alt="海報" />
                            : <span style={{ fontSize: 11, color: '#fff' }}>未選擇</span>}
                        </div>
                      )
                    })()}
                    <Upload accept="image/*" showUploadList={false} disabled={disabled}
                      beforeUpload={file => { handleUploadCustom(file); return false }}>
                      <Button size="small" icon={<PlusOutlined />} disabled={disabled}
                        block style={{ marginTop: 6, fontSize: 11 }}>上傳自定義</Button>
                    </Upload>
                    {selectedSkin.customImage && (
                      <Button size="small" type="link" danger disabled={disabled} block
                        style={{ fontSize: 11 }}
                        onClick={() => patchSelected({ customImage: null })}>
                        移除自定義
                      </Button>
                    )}
                  </div>

                  {/* 11 张兜底图单选 */}
                  <div className="skin-config__poster-grid">
                    <div className="skin-config__poster-grid-label">
                      選擇兜底圖（共 {FALLBACK_POSTERS.length} 套）
                    </div>
                    <div className="skin-config__poster-options">
                      {FALLBACK_POSTERS.map(p => {
                        const active = selectedSkin.fallbackPosterKey === p.key
                        return (
                          <div
                            key={p.key}
                            title={p.name}
                            className={`skin-config__poster-option${active ? ' skin-config__poster-option--active' : ''}`}
                            style={{ background: p.gradientCss }}
                            onClick={() => !disabled && patchSelected({ fallbackPosterKey: p.key })}
                          >
                            <span className="skin-config__poster-option-name">{p.name}</span>
                            {active && (
                              <span className="skin-config__poster-option-check">✓</span>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                </div>
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
        width={previewSkin?.displayMode === 'small' ? 620 : 720}
        className="skin-preview-modal"
        onCancel={() => setPreviewSkin(null)}
      >
        {previewSkin && (
          <div className="skin-preview-modal__content">
            <SkinTemplatePreview skin={previewSkin} interactive />
            <div className="skin-preview-modal__hint">
              店鋪名稱、評分、商品圖與優惠信息為示意數據，實際以商家數據自動生成為準。
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
