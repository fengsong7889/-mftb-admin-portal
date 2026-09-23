/**
 * 人氣商家 - 皮膚定價（新增/編輯/詳情）— V2 重構版
 *
 * 皮膚模式（重構後）：
 *  - 小圖模式：固定11套「邊框+漸變」配色方案，逐套開啟售賣
 *  - 大圖模式：固定4套版式（大圖拼列/階梯輪播/三圖並列/單品大圖），逐套開啟售賣
 *  - 大圖模式左側豎版海報：11張兜底圖可選 + 自定義上傳（非必填）
 *  - 售價按天計算（MOP/天），等級沿用經典/精選/旗艦/至尊
 */
import { useState, useEffect } from 'react'
import { Button, Form, Input, InputNumber, Radio, Select, Space, Switch, Table, Upload, message } from 'antd'
import type { UploadFile } from 'antd'
import {
  ArrowLeftOutlined,
  SaveOutlined,
  PlusOutlined,
  SkinOutlined,
  ShopOutlined,
  CheckCircleOutlined,
  PercentageOutlined,
  SettingOutlined,
  BarChartOutlined,
} from '@ant-design/icons'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  AlgorithmType,
  RecommendChannel,
  ServiceStatus,
  APP_OPTIONS,
} from '../constants'
import {
  fetchAdHotPricingDetail,
  createAdHotPricing,
  updateAdHotPricing,
  appTypeToBrand,
  brandToAppType,
  type AdHotSkinPrice,
  type HotDiscountMode,
  type AdPricingHotRequest,
} from '../../../api/adPromotion'
import SkinTemplateSection from './SkinTemplateSection'
import DiscountTierEditor, {
  type DiscountTierRow,
  validateTiers,
  tiersToBackend,
  tiersFromBackend,
} from './DiscountTierEditor'
import {
  SMALL_SKIN_TEMPLATES,
  LARGE_SKIN_TEMPLATES,
  type SkinSaleConfig,
  type SkinTier,
  createDefaultSmallSkins,
  createDefaultLargeSkins,
  getMissingPosterLanguages,
} from '../../../constants/popularSkinTemplates'

/* ==================== 类型定义 ==================== */

/** 退費比例規則 */
interface CancelFeeRule {
  id: number
  maxDays: number
  feePercent: number
}

/* ==================== 常量 ==================== */

/** 生成 SVG dataURL */
const svgDataUrl = (svg: string) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`

/** Mock 詳情圖 */
const MOCK_DETAIL_IMAGE = svgDataUrl(
  `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300" viewBox="0 0 400 300">`
  + `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#E8720C"/><stop offset="1" stop-color="#FFB347"/></linearGradient></defs>`
  + `<rect width="400" height="300" fill="url(#g)"/>`
  + `<text x="200" y="145" font-size="52" text-anchor="middle" font-family="PingFang SC, sans-serif">🏆</text>`
  + `<text x="200" y="200" font-size="24" font-weight="700" fill="#fff" text-anchor="middle" font-family="PingFang SC, sans-serif">人氣商家詳情圖</text>`
  + `</svg>`,
)

/* ==================== 组件 ==================== */

export default function PopularSkinPricing() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const urlModule = searchParams.get('module') || 'delivery'
  const urlId = searchParams.get('id') || ''
  const isDetailMode = searchParams.get('mode') === 'detail'
  const isEditMode = !!urlId && !isDetailMode
  const [form] = Form.useForm()
  const [loading, setLoading] = useState(false)

  // 皮膚列表（新版：固定模板 + 售卖开关）
  const [smallSkins, setSmallSkins] = useState<SkinSaleConfig[]>(createDefaultSmallSkins)
  const [largeSkins, setLargeSkins] = useState<SkinSaleConfig[]>(createDefaultLargeSkins)
  // 狀態
  const [status, setStatus] = useState<ServiceStatus>(ServiceStatus.ENABLED)
  // 購買多天折扣配置
  const [gradientEnabled, setGradientEnabled] = useState(false)
  const [discountMode, setDiscountMode] = useState<HotDiscountMode>('shared')
  const [sharedGradients, setSharedGradients] = useState<DiscountTierRow[]>([])
  const [smallGradients, setSmallGradients] = useState<DiscountTierRow[]>([])
  const [largeGradients, setLargeGradients] = useState<DiscountTierRow[]>([])
  const [independentTab, setIndependentTab] = useState<'small' | 'large'>('small')
  // 上線天數
  const [presaleDays, setPresaleDays] = useState<number>(7)
  // 贈送天數每日現金價值
  const [giftCashValue, setGiftCashValue] = useState<number>(10)
  // 退費比例配置
  const [refundEnabled, setRefundEnabled] = useState(false)
  const [cancelFeeRules, setCancelFeeRules] = useState<CancelFeeRule[]>([{ id: 1, maxDays: 3, feePercent: 50 }])
  // 詳情圖
  const [detailFileList, setDetailFileList] = useState<UploadFile[]>([])

  // APP/頻道選項
  const tAppOptions = APP_OPTIONS.map(o => ({ label: t(o.labelKey), value: o.value }))
  const channelOptions = urlModule === 'groupBuy'
    ? [{ label: t('recommend.channelGroupBuyName'), value: RecommendChannel.GROUP_BUY }]
    : [
        { label: t('recommend.channelDeliveryName'), value: RecommendChannel.DELIVERY },
        { label: t('recommend.channelSupermarketName'), value: RecommendChannel.SUPERMARKET },
      ]

  // 編輯/詳情模式：從後端加載計價配置並回填
  useEffect(() => {
    if (!urlId) return
    setLoading(true)
    fetchAdHotPricingDetail(Number(urlId))
      .then(data => {
        const appValue = brandToAppType(data.brand)
        form.setFieldsValue({
          popularName: data.algoName || '',
          app: appValue ?? APP_OPTIONS[0]?.value,
          channel: data.channel ?? channelOptions[0]?.value,
        })
        if (data.presaleDays) setPresaleDays(data.presaleDays)
        if (data.giftCashValue != null) setGiftCashValue(data.giftCashValue)
        setRefundEnabled(data.refundEnabled === 1)
        if (data.status) setStatus(data.status as ServiceStatus)
        if (data.discountTiers) {
          try {
            const tiers = JSON.parse(data.discountTiers)
            if (Array.isArray(tiers) && tiers.length) {
              setGradientEnabled(true)
              setSharedGradients(tiersFromBackend(tiers))
            }
          } catch { /* ignore */ }
        }
        // 回填折扣模式與獨立梯度
        if (data.discountMode === 'independent') {
          setDiscountMode('independent')
          if (data.smallDiscountTiers) {
            try {
              const t = JSON.parse(data.smallDiscountTiers)
              if (Array.isArray(t)) setSmallGradients(tiersFromBackend(t))
            } catch { /* ignore */ }
          }
          if (data.largeDiscountTiers) {
            try {
              const t = JSON.parse(data.largeDiscountTiers)
              if (Array.isArray(t)) setLargeGradients(tiersFromBackend(t))
            } catch { /* ignore */ }
          }
        } else {
          setDiscountMode('shared')
        }
        if (data.discountEnabled === false) setGradientEnabled(false)
        if (data.cancelFeeTiers) {
          try {
            const tiers = JSON.parse(data.cancelFeeTiers)
            if (Array.isArray(tiers) && tiers.length) {
              setCancelFeeRules(tiers.map((t: { remainDays?: number; ratio?: number }, i: number) => ({
                id: i + 1, maxDays: t.remainDays ?? 0, feePercent: t.ratio ?? 0,
              })))
            }
          } catch { /* ignore */ }
        }
        // 回填皮膚列表（新版：按名称匹配到固定模板）
        if (data.skins?.length) {
          const skinMap = new Map<string, AdHotSkinPrice>()
          data.skins.forEach((s: AdHotSkinPrice) => skinMap.set(s.skinName, s))
          setSmallSkins(prev => prev.map(tpl => {
            const match = skinMap.get(tpl.name)
            return match
              ? { ...tpl, saleEnabled: true, name: match.skinName, price: match.price, tier: (match.tier as SkinTier) || 'classic' }
              : tpl
          }))
          setLargeSkins(prev => prev.map(tpl => {
            const match = skinMap.get(tpl.name)
            return match
              ? { ...tpl, saleEnabled: true, name: match.skinName, price: match.price, tier: (match.tier as SkinTier) || 'classic' }
              : tpl
          }))
        }
      })
      .catch(() => {
        setGradientEnabled(true)
        setSharedGradients([{ days: 7, discount: 95 }, { days: 15, discount: 90 }, { days: 30, discount: 85 }])
        setDetailFileList([{ uid: '-1', name: 'detail.svg', status: 'done', url: MOCK_DETAIL_IMAGE }])
        setPresaleDays(30)
        setCancelFeeRules([{ id: 1, maxDays: 1, feePercent: 80 }, { id: 2, maxDays: 3, feePercent: 50 }, { id: 3, maxDays: 7, feePercent: 20 }])
      })
      .finally(() => setLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlId, form])



  const handleBack = () => navigate(`/promotion-waterfall?type=${AlgorithmType.POPULAR_MERCHANT_KA}`)

  // 保存：校驗基礎信息 + 已開啟售賣皮膚的完整性
  const handleSubmit = async () => {
    try {
      const values = await form.validateFields()
      // 校验已开启售卖的皮肤
      const allSkins = [...smallSkins, ...largeSkins]
      const enabledSkins = allSkins.filter(s => s.saleEnabled)
      if (status === ServiceStatus.ENABLED && enabledSkins.length === 0) {
        message.error('請至少開啟一套皮膚售賣，或將配置設為停用狀態')
        return
      }
      for (const skin of enabledSkins) {
        if (!skin.name.trim()) { message.error(`皮膚「${skin.templateKey}」名稱不能為空`); return }
        if (skin.price === undefined || skin.price <= 0) { message.error(`皮膚「${skin.name}」請設置售價`); return }
        const missingLanguages = getMissingPosterLanguages(skin)
        if (missingLanguages.length > 0) {
          message.error(t('recommend.popularSkin.posterSkinIncomplete', {
            name: skin.name, languages: missingLanguages.map(item => t(item.labelKey)).join('、'),
          }))
          return
        }
      }
      if (gradientEnabled) {
        if (discountMode === 'shared') {
          const bad = validateTiers(sharedGradients)
          if (sharedGradients.length > 0 && bad >= 0) {
            message.error(t('recommend.popularSkin.completeDaysDiscount', { index: bad + 1 })); return
          }
          if (sharedGradients.length === 0) {
            message.error(t('recommend.popularSkin.noDiscountOriginalPrice')); return
          }
        } else {
          const smallBad = validateTiers(smallGradients)
          const largeBad = validateTiers(largeGradients)
          if (smallGradients.length > 0 && smallBad >= 0) {
            message.error(`${t('recommend.popularSkin.smallImageTab')}: ${t('recommend.popularSkin.completeDaysDiscount', { index: smallBad + 1 })}`); return
          }
          if (largeGradients.length > 0 && largeBad >= 0) {
            message.error(`${t('recommend.popularSkin.largeImageTab')}: ${t('recommend.popularSkin.completeDaysDiscount', { index: largeBad + 1 })}`); return
          }
          if (smallGradients.length === 0 && largeGradients.length === 0) {
            message.error(t('recommend.popularSkin.independentNeedAtLeastOne')); return
          }
        }
      }
      setLoading(true)
      // 构建 payload
      const payload: AdPricingHotRequest = {
        algoName: values.popularName,
        brand: appTypeToBrand(values.app),
        channel: values.channel,
        presaleDays,
        giftCashValue,
        refundEnabled: refundEnabled ? 1 : 2,
        discountEnabled: gradientEnabled,
        discountMode,
        cancelFeeTiers: refundEnabled && cancelFeeRules.length
          ? cancelFeeRules.map(r => ({ remainDays: r.maxDays, ratio: r.feePercent }))
          : undefined,
        blockMerchant: 2,
        status,
        skins: enabledSkins.map(s => ({
          skinName: s.name,
          templateKey: s.templateKey,
          displayMode: s.displayMode,
          tier: s.tier,
          price: s.price!,
          borderType: 'color' as const,
          borderColor: SMALL_SKIN_TEMPLATES.find(t => t.key === s.templateKey)?.borderColor,
          gradientType: 'color' as const,
          gradientColor: SMALL_SKIN_TEMPLATES.find(t => t.key === s.templateKey)?.gradientColor,
          dishLayout: s.layout || 'grid',
        })),
      }
      if (gradientEnabled) {
        if (discountMode === 'shared') {
          payload.discountTiers = tiersToBackend(sharedGradients)
          payload.smallDiscountTiers = undefined
          payload.largeDiscountTiers = undefined
        } else {
          payload.discountTiers = []
          payload.smallDiscountTiers = smallGradients.length ? tiersToBackend(smallGradients) : []
          payload.largeDiscountTiers = largeGradients.length ? tiersToBackend(largeGradients) : []
        }
      } else {
        payload.discountTiers = []
        payload.smallDiscountTiers = undefined
        payload.largeDiscountTiers = undefined
      }
      try {
        if (isEditMode) {
          await updateAdHotPricing(Number(urlId), payload)
          message.success(t('recommend.popularSkin.editSuccess'))
        } else {
          await createAdHotPricing(payload)
          message.success(t('recommend.popularSkin.addSuccess'))
        }
        navigate(`/promotion-waterfall?type=${AlgorithmType.POPULAR_MERCHANT_KA}`)
      } catch (err) {
        const fallback = isEditMode ? t('recommend.popularSkin.editFail') : t('recommend.popularSkin.addFail')
        message.error(err instanceof Error ? err.message || fallback : fallback)
      }
    } catch {
      /* 表單校驗失敗 */
    } finally {
      setLoading(false)
    }
  }

  const cardShellStyle: React.CSSProperties = {
    border: '1px solid #e8eaed', borderRadius: 8, background: '#fff',
    padding: '20px 24px', marginBottom: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
  }

  const cardTitle = (icon: React.ReactNode, iconBg: string, title: string, extra?: React.ReactNode, action?: React.ReactNode) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
      <div style={{ width: 28, height: 28, borderRadius: 6, background: iconBg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {icon}
      </div>
      <span style={{ fontSize: 15, fontWeight: 600, color: '#262626' }}>{title}</span>
      {extra}
      <div style={{ flex: 1, height: 1, background: '#f0f0f0', marginLeft: 8 }} />
      {action}
    </div>
  )

  return (
    <div className="content-area">
      {/* 顶部标题栏 */}
      <div style={{
        position: 'relative', background: '#fff', marginBottom: 16,
        borderRadius: 12, boxShadow: '0 2px 12px rgba(0,0,0,0.06)', overflow: 'hidden',
      }}>
        <div style={{
          height: 3, background: 'linear-gradient(90deg, #E8720C, #F59432, #FFB347, #F59432, #E8720C)',
          backgroundSize: '200% 100%', animation: 'headerGradientShift 4s ease infinite',
        }} />
        <div style={{
          padding: '16px 24px', display: 'flex', alignItems: 'center',
          justifyContent: 'space-between', animation: 'headerFadeSlideIn 0.5s ease',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <Button type="primary" icon={<ArrowLeftOutlined />} onClick={handleBack}
              style={{
                backgroundColor: '#E8720C', borderColor: '#E8720C',
                borderRadius: 8, height: 36, padding: '0 16px',
                display: 'flex', alignItems: 'center', gap: 6,
                boxShadow: '0 2px 6px rgba(232,114,12,0.25)',
                transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
              }}
            >{t('common:back')}</Button>
            <div style={{ width: 1, height: 20, background: '#E8E8E8' }} />
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#1890ff' }}>
                {isDetailMode ? t('recommend.popularSkin.skinPricingDetail') : isEditMode ? t('recommend.popularSkin.skinPricingEdit') : t('recommend.popularSkin.skinPricingAdd')}
              </h2>
              <span style={{ fontSize: 14, color: '#595959' }}>🏆 {t('recommend.popularSkin.skinPopularMerchant')}</span>
            </div>
          </div>
        </div>
      </div>

      <Form form={form} layout="vertical" disabled={isDetailMode}>
        {/* 基礎信息 */}
        <div style={cardShellStyle}>
          {cardTitle(<ShopOutlined style={{ fontSize: 14, color: '#1890ff' }} />, '#e6f7ff', t('recommend.popularSkin.basicInfoTitle'))}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
            <Form.Item label={t('recommend.popularSkin.appLabel')} name="app" rules={[{ required: true, message: t('recommend.popularSkin.selectApp') }]}>
              <Select placeholder={t('recommend.popularSkin.pleaseSelect')} options={tAppOptions} disabled={isEditMode || isDetailMode} />
            </Form.Item>
            <Form.Item label={t('recommend.popularSkin.popularNameLabel')} name="popularName" rules={[{ required: true, message: t('recommend.popularSkin.popularNamePlaceholder') }]}>
              <Input placeholder={t('recommend.popularSkin.popularNamePlaceholder')} maxLength={30} showCount disabled={isEditMode || isDetailMode} />
            </Form.Item>
            <Form.Item label={t('recommend.popularSkin.channelLabel')} name="channel" rules={[{ required: true, message: t('recommend.popularSkin.selectChannel') }]}>
              <Select placeholder={t('recommend.popularSkin.pleaseSelect')} options={channelOptions} disabled={isEditMode || isDetailMode} />
            </Form.Item>
          </div>
          <Form.Item label={t('recommend.popularSkin.detailImageLabel')} style={{ marginBottom: 0, marginTop: 16 }}>
            <Upload disabled={isDetailMode} listType="picture-card" fileList={detailFileList}
              onChange={({ fileList }) => setDetailFileList(fileList)} beforeUpload={() => false}>
              {detailFileList.length < 1 && (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
                  <PlusOutlined style={{ fontSize: 20 }} />
                  <span style={{ fontSize: 12, color: '#8c8c8c' }}>{t('recommend.popularSkin.uploadDetailImage')}</span>
                </div>
              )}
            </Upload>
          </Form.Item>
        </div>

        {/* 銷售策略 */}
        <div style={cardShellStyle}>
          {cardTitle(<BarChartOutlined style={{ fontSize: 14, color: '#fa8c16' }} />, '#fff7e6', t('recommend.popularSkin.salesStrategyCard'))}
          <div style={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <span style={{ fontSize: 13, color: '#595959', minWidth: 80 }}>{t('recommend.popularSkin.presaleDaysLabel')}</span>
            <InputNumber min={1} max={90} precision={0} value={presaleDays} disabled={isDetailMode}
              onChange={(value) => setPresaleDays(value || 7)} addonAfter={t('recommend.popularSkin.dayAddon')} style={{ width: 160 }} />
            <span style={{ fontSize: 12, color: '#8c8c8c', marginLeft: 8 }}>{t('recommend.popularSkin.presaleDaysHint', { days: presaleDays })}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 1, marginTop: 16 }}>
            <span style={{ fontSize: 13, color: '#595959', minWidth: 80 }}>{t('recommend.popularSkin.giftCashValueLabel')}</span>
            <InputNumber min={0} max={9999} precision={0} value={giftCashValue} disabled={isDetailMode}
              onChange={(value) => setGiftCashValue(value || 0)}
              addonAfter={`${t('recommend.popularSkin.mopUnit')}/${t('recommend.popularSkin.dayUnit')}`} style={{ width: 160 }} />
            <span style={{ fontSize: 12, color: '#8c8c8c', marginLeft: 8 }}>{t('recommend.popularSkin.giftCashValueHint', { value: giftCashValue })}</span>
          </div>
        </div>

        {/* 皮膚列表（新版组件） */}
        <div style={cardShellStyle}>
          {cardTitle(
            <SkinOutlined style={{ fontSize: 14, color: '#E8720C' }} />, '#FFF7E6', t('recommend.popularSkin.skinListCard'),
            <span style={{ fontSize: 12, color: '#8C8C8C', marginLeft: 4 }}>
              小圖 {SMALL_SKIN_TEMPLATES.length} 套 · 大圖 {LARGE_SKIN_TEMPLATES.length} 套，逐套開啟售賣
            </span>,
          )}
          <SkinTemplateSection
            smallSkins={smallSkins}
            largeSkins={largeSkins}
            onSmallChange={setSmallSkins}
            onLargeChange={setLargeSkins}
            disabled={isDetailMode}
          />
        </div>

        {/* 購買多天折扣配置 */}
        <div style={cardShellStyle}>
          {cardTitle(
            <PercentageOutlined style={{ fontSize: 14, color: '#722ED1' }} />, '#F9F0FF', t('recommend.popularSkin.gradientDiscountTitle'),
            <Switch size="small" checked={gradientEnabled} disabled={isDetailMode}
              onChange={checked => {
                setGradientEnabled(checked)
                if (checked && discountMode === 'shared' && sharedGradients.length === 0) {
                  setSharedGradients([{ days: undefined, discount: undefined }])
                }
              }} />,
          )}
          {gradientEnabled ? (
            <>
              {/* 折扣模式切换 */}
              <div style={{ marginBottom: 16 }}>
                <span style={{ fontSize: 13, color: '#595959', marginRight: 12 }}>{t('recommend.popularSkin.discountModeLabel')}：</span>
                <Radio.Group
                  value={discountMode} disabled={isDetailMode}
                  onChange={e => {
                    const next = e.target.value as HotDiscountMode
                    setDiscountMode(next)
                    // 首次切换到独立模式时，将共享规则复制到未初始化的分组
                    if (next === 'independent') {
                      if (smallGradients.length === 0 && sharedGradients.length > 0) setSmallGradients([...sharedGradients])
                      if (largeGradients.length === 0 && sharedGradients.length > 0) setLargeGradients([...sharedGradients])
                    }
                    // 切换到共享模式时，如果共享为空且独立有数据，取第一组
                    if (next === 'shared' && sharedGradients.length === 0) {
                      const source = smallGradients.length > 0 ? smallGradients : largeGradients
                      if (source.length > 0) setSharedGradients([...source])
                    }
                  }}
                  optionType="button" buttonStyle="solid" size="small"
                >
                  <Radio.Button value="shared">{t('recommend.popularSkin.discountModeShared')}</Radio.Button>
                  <Radio.Button value="independent">{t('recommend.popularSkin.discountModeIndependent')}</Radio.Button>
                </Radio.Group>
                <span style={{ fontSize: 12, color: '#8c8c8c', marginLeft: 12 }}>
                  {discountMode === 'shared'
                    ? t('recommend.popularSkin.discountModeSharedHint')
                    : t('recommend.popularSkin.discountModeIndependentHint')}
                </span>
              </div>
              {/* 共享模式：单组编辑器 */}
              {discountMode === 'shared' && (
                <DiscountTierEditor
                  value={sharedGradients} onChange={setSharedGradients} disabled={isDetailMode}
                />
              )}
              {/* 独立模式：Tab 切换 + 分组编辑器 */}
              {discountMode === 'independent' && (
                <>
                  <div style={{ marginBottom: 12, display: 'flex', alignItems: 'center', gap: 12 }}>
                    <span style={{ fontSize: 13, color: '#595959', fontWeight: 500 }}>{t('recommend.popularSkin.discountConfigTitle', { defaultValue: '折扣配置' })}：</span>
                    <Radio.Group
                      value={independentTab} disabled={isDetailMode}
                      onChange={e => setIndependentTab(e.target.value)}
                      optionType="button" buttonStyle="solid" size="small"
                    >
                      <Radio.Button value="small">{t('recommend.popularSkin.smallImageTab')}</Radio.Button>
                      <Radio.Button value="large">{t('recommend.popularSkin.largeImageTab')}</Radio.Button>
                    </Radio.Group>
                  </div>
                  {independentTab === 'small' ? (
                    <DiscountTierEditor
                      value={smallGradients} onChange={setSmallGradients} disabled={isDetailMode}
                      groupLabel={t('recommend.popularSkin.smallImageTab')}
                      color="#1890FF" bgColor="#E6F7FF" borderColor="#91D5FF"
                    />
                  ) : (
                    <DiscountTierEditor
                      value={largeGradients} onChange={setLargeGradients} disabled={isDetailMode}
                      groupLabel={t('recommend.popularSkin.largeImageTab')}
                      color="#FA8C16" bgColor="#FFF7E6" borderColor="#FFD591"
                    />
                  )}
                </>
              )}
            </>
          ) : (
            <div style={{ fontSize: 13, color: '#8c8c8c' }}>{t('recommend.popularSkin.gradientDisabledHint')}</div>
          )}
        </div>

        {/* 訂單退款配置 */}
        <div style={cardShellStyle}>
          {cardTitle(
            <SettingOutlined style={{ fontSize: 14, color: '#f5222d' }} />, '#fff1f0', t('recommend.popularSkin.refundConfigTitle'),
            <span style={{ fontSize: 12, color: '#8c8c8c', marginLeft: 4 }}>{t('recommend.popularSkin.refundConfigHint')}</span>,
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 13, color: refundEnabled ? '#52c41a' : '#8c8c8c' }}>{refundEnabled ? t('recommend.popularSkin.allowRefund') : t('recommend.popularSkin.notAllowRefund')}</span>
              <Switch size="small" checked={refundEnabled} disabled={isDetailMode}
                onChange={checked => setRefundEnabled(checked)} style={{ background: refundEnabled ? '#52c41a' : '#d9d9d9' }} />
            </div>,
          )}
          {refundEnabled ? (
            <Table rowKey="id" dataSource={cancelFeeRules} pagination={false} bordered size="small"
              columns={[
                { title: t('recommend.popularSkin.adPromotionCol'), dataIndex: 'maxDays', width: 220,
                  render: (_, record: CancelFeeRule) => (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ fontSize: 13, color: '#595959', whiteSpace: 'nowrap' }}>{t('recommend.popularSkin.remainingDaysLe')}</span>
                      <InputNumber disabled={isDetailMode} min={0} max={999} value={record.maxDays === 999 ? undefined : record.maxDays}
                        onChange={(val) => setCancelFeeRules(prev => prev.map(r => r.id === record.id ? { ...r, maxDays: val ?? 0 } : r))}
                        addonAfter={record.maxDays === 999 ? '' : t('recommend.popularSkin.dayAddon')} style={{ flex: 1 }} />
                    </div>
                  ),
                },
                { title: t('recommend.popularSkin.ratioConfigCol'), dataIndex: 'feePercent', width: 160,
                  render: (_, record: CancelFeeRule) => (
                    <InputNumber disabled={isDetailMode} min={0} max={100} value={record.feePercent}
                      onChange={(val) => setCancelFeeRules(prev => prev.map(r => r.id === record.id ? { ...r, feePercent: val ?? 0 } : r))}
                      addonAfter="%" style={{ width: '100%' }} />
                  ),
                },
                { title: t('recommend.popularSkin.opCol'), width: 120, align: 'center' as const,
                  render: (_: unknown, record: CancelFeeRule) => {
                    if (isDetailMode) return <span style={{ color: '#bfbfbf' }}>—</span>
                    const isLastRow = cancelFeeRules[cancelFeeRules.length - 1]?.id === record.id
                    return (
                      <Space size={4}>
                        {isLastRow && <Button type="link" size="small" onClick={() => { const nextId = Math.max(...cancelFeeRules.map(r => r.id)) + 1; setCancelFeeRules(prev => [...prev, { id: nextId, maxDays: 0, feePercent: 50 }]) }}>{t('recommend.popularSkin.addTier')}</Button>}
                        <Button type="link" size="small" danger onClick={() => { if (cancelFeeRules.length <= 1) { message.warning(t('recommend.atLeastOneRule')); return } setCancelFeeRules(prev => prev.filter(r => r.id !== record.id)) }}>{t('recommend.popularSkin.skinDelete')}</Button>
                      </Space>
                    )
                  },
                },
              ]}
            />
          ) : (
            <div style={{ padding: '24px', textAlign: 'center', background: '#fafafa', borderRadius: 8, border: '1px dashed #d9d9d9' }}>
              <span style={{ fontSize: 13, color: '#8c8c8c' }}>{t('recommend.popularSkin.notAllowRefundHint')}</span>
            </div>
          )}
        </div>

        {/* 狀態設置 */}
        <div style={cardShellStyle}>
          {cardTitle(<CheckCircleOutlined style={{ fontSize: 14, color: '#52c41a' }} />, '#f6ffed', t('recommend.popularSkin.statusSettingCard'))}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 13, color: '#595959' }}>{t('recommend.popularSkin.statusLabelColon')}</span>
            <Switch checked={status === ServiceStatus.ENABLED} disabled={isDetailMode}
              onChange={checked => setStatus(checked ? ServiceStatus.ENABLED : ServiceStatus.DISABLED)}
              checkedChildren={t('recommend.popularSkin.statusEnabledText')} unCheckedChildren={t('recommend.popularSkin.statusDisabledText')} />
            <span style={{ fontSize: 12, color: '#8c8c8c' }}>{t('recommend.popularSkin.disableSkinHint')}</span>
          </div>
        </div>
      </Form>

      {/* 底部操作欄 */}
      {!isDetailMode && (
        <div className="form-footer">
          <Button onClick={handleBack}>{t('common:cancel')}</Button>
          <Button type="primary" icon={<SaveOutlined />} loading={loading} onClick={handleSubmit}>{t('common:save')}</Button>
        </div>
      )}
    </div>
  )
}
