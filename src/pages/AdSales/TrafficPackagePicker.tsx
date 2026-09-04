import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { Button, Card, Empty, Form, InputNumber, Modal, Radio, Select, Space, Tag, message } from 'antd'
import { ReloadOutlined, SearchOutlined, ShoppingCartOutlined, WalletOutlined } from '@ant-design/icons'
import { BIZ_CHANNEL } from '../../constants/bizChannel'
import { AlgorithmType } from '../Recommend/constants'
import { fetchAdAlgorithms, type AdAlgorithm } from '../../api/adPromotion'
import { usePaymentRule } from '../../hooks/usePaymentRule'
import { getSystemRuleValue } from '../../hooks/useSystemRules'
import {
  type TrafficPackageTier,
  type TrafficPackageOrder,
  loadTrafficPricing,
  findLadderUnitPrice,
  calcCustomAmount,
  saveTrafficOrder,
  MOCK_TRAFFIC_MERCHANTS,
} from './types'

/** 投流廣告廣告類型標識（規則配置/贈送管理一致） */
const GIFT_AD_TYPE_TRAFFIC = 'traffic_ad'

/** BD 選項（與其它購買頁面保持一致） */
const BD_OPTIONS = [
  { label: '張偉', value: 'bd-001' },
  { label: '李娜', value: 'bd-002' },
  { label: '王強', value: 'bd-003' },
  { label: '劉敏', value: 'bd-004' },
]

/**
 * 投流廣告購買頁（廣告銷售）
 * 佈局與金字招牌/人氣商家購買頁保持一致：
 * 查詢區（品牌/算法/門店/歸屬BD）→ 空狀態 → 左側選擇流量包 + 右側當前所選與訂單結算 → 確認訂單彈窗
 */
export default function TrafficPackagePicker({ storeMode }: { storeMode?: boolean }) {
  const { t } = useTranslation('adSales')
  const navigate = useNavigate()
  // 僅展示啟用中的頻道定價（停用頻道停止售賣）
  const pricing = useMemo(() => loadTrafficPricing().filter(p => p.status !== 'disabled'), [])
  /** 業務頻道 i18n 標籤映射 */
  const BIZ_CHANNEL_I18N_MAP: Record<string, string> = {
    [BIZ_CHANNEL.FOOD_DELIVERY]: t('bizChannelFoodDelivery'),
    [BIZ_CHANNEL.SUPERMARKET]: t('bizChannelSupermarket'),
    [BIZ_CHANNEL.GROUP_BUY]: t('bizChannelGroupBuy'),
  }

  /* ── 查詢區狀態 ── */
  const [searchBrand, setSearchBrand] = useState<string | undefined>('shanfeng')
  const [searchAlgorithm, setSearchAlgorithm] = useState<number | null>(null)
  const [algorithmOptions, setAlgorithmOptions] = useState<AdAlgorithm[]>([])
  const [searchStoreName, setSearchStoreName] = useState<string | null>(null)
  const [searchBD, setSearchBD] = useState<string | null>(null)
  const [bizChannel, setBizChannel] = useState<string>(() => pricing[0]?.bizChannel ?? BIZ_CHANNEL.FOOD_DELIVERY)
  const [hasSearched, setHasSearched] = useState(false)

  /* ── 選購狀態（預設檔位與自定義數量同屏展示，二者互斥選擇） ── */
  const [selectedTierId, setSelectedTierId] = useState<string | null>(null)
  const [customQtyDraft, setCustomQtyDraft] = useState<number | null>(null) // 自定義數量草稿（輸入中，未確認）
  const [customQty, setCustomQty] = useState<number | null>(null)           // 自定義數量已確認值（計入當前所選）
  // 投流時段：主營時段投流 / 全天投流（門店打烊不投流不消耗）
  const [deliverySlot, setDeliverySlot] = useState<'business' | 'allday'>('business')
  const [confirmOpen, setConfirmOpen] = useState(false)
  // Mock數據 - 商家推廣金餘額（同其它購買頁）
  const [merchantBalance, setMerchantBalance] = useState(15800)

  /* ── 支付方式（與金字招牌/人氣商家/盤活復蘇結算區一致） ── */
  // Mock數據 - 贈送天數餘額（門店為 Mock 數據，暫用固定值展示）
  const [giftDaysBalance] = useState(8)
  const [giftDaysUsed, setGiftDaysUsed] = useState(0)
  const { mixedPayment, switchable, mode } = usePaymentRule(GIFT_AD_TYPE_TRAFFIC)
  // 非混合支付時的選擇模式：'promo' = 推廣金支付, 'gift' = 贈送天數抵扣
  const [paymentMode, setPaymentMode] = useState<'promo' | 'gift'>('promo')
  // 強制模式：僅推廣金/僅贈送天數時固定支付方式，否則跟隨用戶切換
  const activeMode: 'promo' | 'gift' = mode === 'promo_only' ? 'promo' : mode === 'gift_only' ? 'gift' : paymentMode

  /* ── 加載投流廣告算法下拉 ── */
  useEffect(() => {
    fetchAdAlgorithms({ page: 1, size: 500 })
      .then(res => setAlgorithmOptions((res.records ?? []).filter(a => a.algoType === AlgorithmType.TRAFFIC_AD)))
      .catch(() => { /* 算法庫不可用時允許跳過 */ })
  }, [])

  /* ── 查詢 / 重置 ── */
  const handleSearch = () => {
    if (!storeMode && !searchStoreName) {
      message.warning(t('trafficSelectStoreFirst'))
      return
    }
    setHasSearched(true)
  }

  const handleReset = () => {
    setSearchAlgorithm(null)
    setSearchStoreName(null)
    setSearchBD(null)
    setSelectedTierId(null)
    setCustomQtyDraft(null)
    setCustomQty(null)
    setDeliverySlot('business')
    setHasSearched(false)
  }

  /** 確認自定義數量：草稿值計入當前所選（與檔位選擇互斥） */
  const handleConfirmCustom = () => {
    if (customQtyDraft == null || draftUnit == null) return
    setCustomQty(customQtyDraft)
    setSelectedTierId(null)
    message.success(t('trafficCustomConfirmedMsg'))
  }

  /* ── 計價 ── */
  const current = pricing.find(p => p.bizChannel === bizChannel)
  const onSaleTiers = (current?.tiers ?? []).filter(tier => tier.onSale).sort((a, b) => a.sort - b.sort)
  const selectedTier: TrafficPackageTier | null = onSaleTiers.find(tier => tier.id === selectedTierId) ?? null

  /** 檔位折後價（折扣開啟時 = 原價 × 折扣 / 10） */
  const tierDiscounted = (tier: TrafficPackageTier): number => {
    if (tier.discountEnabled && tier.discount != null) {
      return Math.round(tier.price * tier.discount / 10 * 100) / 100
    }
    return tier.price
  }
  const tierHasDiscount = (tier: TrafficPackageTier): boolean =>
    !!tier.discountEnabled && tier.discount != null && tier.discount < 10

  /* ── 計價：草稿用於實時預覽，已確認值用於當前所選與結算 ── */
  const draftUnit = current && customQtyDraft != null ? findLadderUnitPrice(current.ladder, customQtyDraft) : null
  const draftAmount = current && customQtyDraft != null ? calcCustomAmount(current.ladder, customQtyDraft) : 0
  const customUnit = current && customQty != null ? findLadderUnitPrice(current.ladder, customQty) : null
  const customAmount = current && customQty != null ? calcCustomAmount(current.ladder, customQty) : 0

  /** 訂單匯總：original=原價，amount=實付（自定義數量優先，其次選中的檔位） */
  const summary = customQty != null && customUnit !== null
    ? { impressions: customQty, original: customAmount, amount: customAmount, tierName: undefined }
    : selectedTier
      ? { impressions: selectedTier.impressions, original: selectedTier.price, amount: tierDiscounted(selectedTier), tierName: selectedTier.name }
      : null

  const discountAmount = summary ? Math.round((summary.original - summary.amount) * 100) / 100 : 0
  const canSubmit = (storeMode || !!searchStoreName) && !!summary

  /* ── 贈送天數抵扣（投流按曝光計價無天數維度，按規則配置的每日折算金額抵扣） ── */
  const giftDayValue = Number(getSystemRuleValue<number>('payment_traffic_gift_day_value')) || 150
  const orderAmount = summary?.amount ?? 0
  // 最多可抵扣天數 = min(贈送餘額, 覆蓋訂單金額所需天數)
  const maxGiftDaysUsable = orderAmount > 0 ? Math.min(giftDaysBalance, Math.ceil(orderAmount / giftDayValue)) : 0
  // 非混合支付選擇贈送天數抵扣時自動全部抵扣；混合支付時才允許用戶手動選擇抵扣天數
  const effectiveGiftDays = useMemo(() => {
    if (!mixedPayment && activeMode === 'promo') return 0
    if (!mixedPayment && activeMode === 'gift') return maxGiftDaysUsable
    return Math.min(giftDaysUsed, maxGiftDaysUsable)
  }, [mixedPayment, activeMode, maxGiftDaysUsable, giftDaysUsed])
  // 贈送天數抵扣金額（不超過訂單金額）
  const giftDeductAmount = Math.min(effectiveGiftDays * giftDayValue, orderAmount)
  // 實付金額（推廣金部分）
  const payableAmount = Math.max(0, Math.round((orderAmount - giftDeductAmount) * 100) / 100)

  /* ── 支付前校驗（與金字招牌/人氣商家一致） ── */
  const handlePayment = () => {
    if (!summary) return
    if (!mixedPayment && activeMode === 'gift') {
      if (giftDaysBalance * giftDayValue < orderAmount) {
        message.error('贈送天數餘額不足，無法全額抵扣')
        return
      }
    } else if (payableAmount > merchantBalance) {
      message.error('推廣金餘額不足，請充值後再試')
      return
    }
    setConfirmOpen(true)
  }

  /* ── 提交訂單（Mock：本地生成訂單並跳轉訂單管理） ── */
  const handleConfirm = () => {
    if (!searchStoreName || !summary || !current) return
    const order: TrafficPackageOrder = {
      orderNo: `TP${Date.now()}`,
      merchantName: MOCK_TRAFFIC_MERCHANTS.find(m => m.value === searchStoreName)?.label ?? searchStoreName,
      bizChannel: current.bizChannel,
      mode: summary.tierName ? 'tier' : 'custom',
      tierName: summary.tierName,
      impressions: summary.impressions,
      amount: payableAmount,
      deliverySlot,
      status: 'paid',
      createTime: new Date().toISOString(),
    }
    saveTrafficOrder(order)
    // Mock：扣減推廣金餘額（贈送天數抵扣部分不扣推廣金）
    if (payableAmount > 0) setMerchantBalance(prev => Math.round((prev - payableAmount) * 100) / 100)
    setConfirmOpen(false)
    message.success(t('trafficOrderSuccess'))
    navigate('/promotion-order-manage?type=投流廣告&from=ad-sales')
  }

  /* ── 檔位卡片 ── */
  const renderTierCard = (tier: TrafficPackageTier) => {
    const selected = selectedTierId === tier.id
    const discounted = tierDiscounted(tier)
    const hasDiscount = tierHasDiscount(tier)
    const unit = discounted / tier.impressions
    return (
      <div
        key={tier.id}
        onClick={() => { setSelectedTierId(tier.id); setCustomQtyDraft(null); setCustomQty(null) }}
        style={{
          padding: '16px', borderRadius: 10, cursor: 'pointer', textAlign: 'center',
          border: selected ? '1.5px solid #E8720C' : '1px solid #E8E8E8',
          background: selected ? '#FFF7E6' : '#fff',
          boxShadow: selected ? '0 2px 6px rgba(232,114,12,0.25)' : '0 2px 8px rgba(0,0,0,0.04)',
          transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
          position: 'relative',
        }}
      >
        {hasDiscount && (
          <Tag color="orange" style={{ position: 'absolute', top: -10, right: 8 }}>
            {tier.discount}{t('trafficDiscountBadge')}
          </Tag>
        )}
        <div style={{ fontSize: 15, fontWeight: 600, color: '#262626', marginBottom: 6 }}>{tier.name}</div>
        <div style={{ fontSize: 22, fontWeight: 700, color: '#E8720C' }}>
          {tier.impressions.toLocaleString()}
          <span style={{ fontSize: 12, fontWeight: 400, color: '#8c8c8c', marginLeft: 4 }}>{t('trafficImpressionsUnit')}</span>
        </div>
        <div style={{ marginTop: 6, display: 'flex', alignItems: 'baseline', justifyContent: 'center', gap: 6 }}>
          <span style={{ fontSize: 14, fontWeight: 600, color: '#262626' }}>
            {discounted.toLocaleString()} {t('trafficMopUnit')}
          </span>
          {hasDiscount && (
            <span style={{ fontSize: 12, color: '#8c8c8c', textDecoration: 'line-through' }}>
              {tier.price.toLocaleString()}
            </span>
          )}
        </div>
        <div style={{ fontSize: 11, color: '#8c8c8c', marginTop: 4 }}>
          {t('trafficUnitPriceConverted')} {unit.toFixed(3)} {t('trafficMopUnit')}/{t('trafficImpressionsUnit')}
        </div>
      </div>
    )
  }

  return (
    <div>
      {/* 查詢區域 - 與其它購買界面保持一致 */}
      <div className="search-section" style={{ marginBottom: 16 }}>
        <Form layout="inline" style={{ display: 'grid', gridTemplateColumns: storeMode ? 'repeat(2, 1fr)' : 'repeat(4, 1fr)', gap: '16px 12px' }}>
          <Form.Item label={t('brandLabel')}>
            <Select
              placeholder={t('brandAutoHint')}
              value={searchBrand}
              onChange={v => { setSearchBrand(v); setSearchAlgorithm(null) }}
              allowClear
              options={[{ label: '閃蜂', value: 'shanfeng' }, { label: 'mFood', value: 'mfood' }]}
            />
          </Form.Item>
          <Form.Item label={t('algoNameLabel')}>
            <Select
              placeholder={searchBrand ? t('trafficAlgoSelectPlaceholder') : t('selectBrandFirst')}
              value={searchAlgorithm}
              onChange={setSearchAlgorithm}
              allowClear
              showSearch
              optionFilterProp="label"
              disabled={!searchBrand}
              options={algorithmOptions.map(a => ({
                label: a.algoCode ? `${a.algoName}(${a.algoCode})` : a.algoName,
                value: a.id,
              }))}
            />
          </Form.Item>
          {!storeMode && (
            <Form.Item label={t('storeNameLabel')}>
              <Select
                placeholder={t('storeSearchHint')}
                value={searchStoreName}
                onChange={setSearchStoreName}
                allowClear
                showSearch
                optionFilterProp="label"
                options={MOCK_TRAFFIC_MERCHANTS}
              />
            </Form.Item>
          )}
          {!storeMode && (
            <Form.Item label={t('bdLabel')}>
              <Select
                placeholder={t('bdAutoHint')}
                value={searchBD}
                onChange={(v) => setSearchBD(v)}
                allowClear
                showSearch
                filterOption={(input, option) => {
                  const keyword = input.toLowerCase()
                  const label = (option?.label ?? '').toString().toLowerCase()
                  return label.includes(keyword)
                }}
                options={BD_OPTIONS}
              />
            </Form.Item>
          )}
          <Form.Item>
            <div className="search-actions">
              <Button type="primary" icon={<SearchOutlined />} onClick={handleSearch}>{t('searchQuery')}</Button>
              <Button icon={<ReloadOutlined />} onClick={handleReset}>{t('reset')}</Button>
            </div>
          </Form.Item>
        </Form>
      </div>

      {/* 未查詢時展示空狀態 */}
      {!hasSearched && (
        <Card bodyStyle={{ padding: '48px 24px' }}>
          <Empty description={t('trafficEmptySearchHint')} image={Empty.PRESENTED_IMAGE_SIMPLE} />
        </Card>
      )}

      {hasSearched && (
        <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
          {/* 左側：選擇流量包（預設檔位 / 自定義數量） */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <Card
              title={
                <Space>
                  <span>📊</span>
                  <span>{t('trafficPackageSelectTitle')}</span>
                  <span style={{ fontSize: 12, color: '#8C8C8C', fontWeight: 400 }}>{t('trafficPackageSelectHint')}</span>
                </Space>
              }
              bodyStyle={{ padding: '16px 20px' }}
            >
              {/* ── ① 預設檔位：卡片網格 ── */}
              <div style={{ fontSize: 12, color: '#8C8C8C', marginBottom: 8, fontWeight: 500 }}>📦 {t('trafficBuyTierMode')}</div>
              {onSaleTiers.length > 0 ? (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 16 }}>
                  {onSaleTiers.map(renderTierCard)}
                </div>
              ) : (
                <Empty description={t('trafficNoPackage')} image={Empty.PRESENTED_IMAGE_SIMPLE} />
              )}

              {/* ── ② 自定義數量：輸入 + 實時預覽 + 確定後計入當前所選 ── */}
              <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px dashed #E8E8E8' }}>
                <div style={{ fontSize: 12, color: '#8C8C8C', marginBottom: 8, fontWeight: 500 }}>✏️ {t('trafficBuyCustomMode')}</div>
                {current && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 24, flexWrap: 'wrap' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 13, color: '#595959' }}>{t('trafficCustomQtyLabel')}</span>
                      <InputNumber
                        min={current.customMinQty}
                        precision={0}
                        value={customQtyDraft}
                        onChange={setCustomQtyDraft}
                        style={{ width: 160 }}
                        addonAfter={t('trafficImpressionsUnit')}
                      />
                      <Button
                        type="primary"
                        disabled={customQtyDraft == null || draftUnit == null}
                        onClick={handleConfirmCustom}
                        style={{
                          background: customQtyDraft != null && draftUnit != null ? '#E8720C' : undefined,
                          borderColor: customQtyDraft != null && draftUnit != null ? '#E8720C' : undefined,
                        }}
                      >
                        {t('trafficConfirmCustom')}
                      </Button>
                      {customQty != null && (
                        <Tag color="success" style={{ marginLeft: 4 }}>
                          {t('trafficCustomConfirmedTag')
                            .replace('{{qty}}', customQty.toLocaleString())
                            .replace('{{amount}}', customAmount.toLocaleString())}
                        </Tag>
                      )}
                    </div>
                    <div style={{ padding: '10px 14px', background: '#fafafa', border: '1px solid #f0f0f0', borderRadius: 8, fontSize: 12, color: '#595959', lineHeight: '20px' }}>
                      {customQtyDraft != null && draftUnit != null ? (
                        <>
                          <div>{t('trafficHitLadder')}：<span style={{ fontWeight: 600, color: '#E8720C' }}>{draftUnit} {t('trafficMopUnit')}/{t('trafficImpressionsUnit')}</span></div>
                          <div>{t('trafficTotalAmount')}：<span style={{ fontWeight: 700, color: '#E8720C', fontSize: 14 }}>{draftAmount.toLocaleString()} {t('trafficMopUnit')}</span></div>
                        </>
                      ) : (
                        <span style={{ color: '#8c8c8c' }}>{t('trafficCustomQtyHint').replace('{{min}}', String(current.customMinQty))}</span>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </Card>
          </div>

          {/* 右側：當前所選 + 訂單結算 */}
          <div style={{ width: 380, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* 當前所選 */}
            <Card size="small" title={<Space><WalletOutlined /><span>{t('currentSelection')}</span></Space>}>
              {summary ? (
                <div style={{ fontSize: 13, color: '#595959', lineHeight: '26px' }}>
                  {!storeMode && searchStoreName && (
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: '#8c8c8c' }}>{t('storeNameLabel')}</span>
                      <span style={{ fontWeight: 600, color: '#262626', maxWidth: 230, textAlign: 'right' }}>
                        {MOCK_TRAFFIC_MERCHANTS.find(m => m.value === searchStoreName)?.label}
                      </span>
                    </div>
                  )}
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: '#8c8c8c' }}>{t('trafficSelectChannel')}</span>
                    <span style={{ fontWeight: 600, color: '#262626' }}>{BIZ_CHANNEL_I18N_MAP[bizChannel]}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: '#8c8c8c' }}>{t('trafficPackageNameLabel')}</span>
                    <span style={{ fontWeight: 600, color: '#262626' }}>
                      {summary.tierName ?? t('trafficCustomPackageName')}
                    </span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: '#8c8c8c' }}>{t('trafficImpressions')}</span>
                    <span style={{ fontWeight: 600, color: '#262626' }}>
                      {summary.impressions.toLocaleString()} {t('trafficImpressionsUnit')}
                    </span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: '#8c8c8c' }}>{t('trafficUnitPriceConverted')}</span>
                    <span style={{ fontWeight: 600, color: '#262626' }}>
                      {(summary.amount / summary.impressions).toFixed(3)} {t('trafficMopUnit')}/{t('trafficImpressionsUnit')}
                    </span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: '#8c8c8c' }}>{t('trafficEnjoyDiscount')}</span>
                    {summary.tierName && selectedTier && tierHasDiscount(selectedTier) ? (
                      <span style={{ fontWeight: 600, color: '#52C41A' }}>{selectedTier.discount}{t('trafficDiscountBadge')}</span>
                    ) : (
                      <span style={{ color: '#BFBFBF' }}>{t('trafficNoDiscount')}</span>
                    )}
                  </div>
                  {/* 投流時段選擇 */}
                  <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px dashed #E8E8E8' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ color: '#8c8c8c' }}>{t('trafficDeliverySlot')}</span>
                      <Radio.Group
                        size="small"
                        value={deliverySlot}
                        onChange={e => setDeliverySlot(e.target.value)}
                        optionType="button"
                        buttonStyle="solid"
                      >
                        <Radio.Button value="business">{t('trafficSlotBusiness')}</Radio.Button>
                        <Radio.Button value="allday">{t('trafficSlotAllDay')}</Radio.Button>
                      </Radio.Group>
                    </div>
                    <div style={{ marginTop: 6, fontSize: 11, color: '#FA8C16', lineHeight: '18px' }}>
                      🕐 {t('trafficClosedHint')}
                    </div>
                  </div>
                </div>
              ) : (
                <div style={{ fontSize: 12, color: '#8c8c8c', padding: '8px 0' }}>{t('trafficSummaryEmpty')}</div>
              )}
            </Card>

            {/* 訂單結算（與無敵星星/金字招牌購買頁保持一致） */}
            <Card size="small" title={t('trafficCheckoutTitle')}>
              {/* 支付方式選擇（可切換模式） */}
              {switchable && (
                <div style={{ marginBottom: 12, padding: '10px 12px', background: '#F6FFED', border: '1px solid #B7EB8F', borderRadius: 6 }}>
                  <div style={{ fontSize: 12, color: '#595959', marginBottom: 8, fontWeight: 500 }}>支付方式選擇</div>
                  <Radio.Group value={paymentMode} onChange={e => setPaymentMode(e.target.value)}>
                    <Radio value="promo">推廣金支付</Radio>
                    <Radio value="gift">贈送天數抵扣</Radio>
                  </Radio.Group>
                </div>
              )}
              {/* 推廣金餘額 */}
              {(mixedPayment || activeMode === 'promo') && (
                <div style={{
                  padding: '12px 16px',
                  marginBottom: 12,
                  background: 'linear-gradient(135deg, #E8720C 0%, #F39C12 100%)',
                  borderRadius: 6,
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}>
                  <span style={{ fontSize: 13, color: '#fff', opacity: 0.9 }}>{t('promoBalance')}</span>
                  <span style={{ fontSize: 22, fontWeight: 700, color: '#fff' }}>${merchantBalance.toLocaleString()}</span>
                </div>
              )}
              {/* 贈送天數餘額 */}
              {(mixedPayment || activeMode === 'gift') && (
                <div style={{
                  padding: '12px 16px',
                  marginBottom: 12,
                  background: 'linear-gradient(135deg, #E8720C 0%, #F39C12 100%)',
                  borderRadius: 6,
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}>
                  <span style={{ fontSize: 13, color: '#fff', opacity: 0.9 }}>剩餘贈送天數</span>
                  <span style={{ fontSize: 22, fontWeight: 700, color: '#fff' }}>{giftDaysBalance} 天</span>
                </div>
              )}
              {/* 價格明細 */}
              <div style={{ background: '#fafafa', padding: 16, borderRadius: 8, marginBottom: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                  <span style={{ color: '#595959' }}>{t('orderOriginal')}：</span>
                  <span style={{ fontWeight: 600 }}>${summary ? summary.original.toLocaleString() : '-'}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                  <span style={{ color: '#595959' }}>{t('trafficEnjoyDiscount')}：</span>
                  {summary?.tierName && selectedTier && tierHasDiscount(selectedTier) ? (
                    <span style={{ fontWeight: 600, color: '#52C41A' }}>{selectedTier.discount}{t('trafficDiscountBadge')}</span>
                  ) : (
                    <span style={{ color: '#BFBFBF' }}>{t('trafficNoDiscount')}</span>
                  )}
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, color: '#fa8c16' }}>
                  <span>{t('orderDiscount')}：</span>
                  <span style={{ fontWeight: 600 }}>-${discountAmount.toLocaleString()}</span>
                </div>
                {/* 贈送天數抵扣金額 */}
                {giftDeductAmount > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, color: '#fa8c16' }}>
                    <span>贈送天數抵扣（${giftDayValue}/天）：</span>
                    <span style={{ fontWeight: 600 }}>-${giftDeductAmount.toLocaleString()}</span>
                  </div>
                )}
                {/* 混合支付：抵扣天數手動輸入 */}
                {mixedPayment && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 16, color: '#ff4d4f', borderTop: '1px solid #d9d9d9', paddingTop: 8, marginTop: 8 }}>
                    <span style={{ fontWeight: 600 }}>抵扣天數：</span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      {giftDaysBalance === 0 || !summary ? (
                        <span style={{ fontWeight: 700 }}>{effectiveGiftDays}天</span>
                      ) : (
                        <>
                          <InputNumber
                            size="small" min={0} max={maxGiftDaysUsable} value={effectiveGiftDays} precision={0}
                            onChange={v => setGiftDaysUsed(typeof v === 'number' ? v : 0)}
                            style={{ width: 64 }}
                          />
                          <span style={{ fontSize: 12, color: '#8c8c8c' }}>天</span>
                          <Button size="small" type="link" style={{ padding: 0, fontSize: 12 }}
                            onClick={() => setGiftDaysUsed(maxGiftDaysUsable)}>全部抵扣</Button>
                        </>
                      )}
                    </span>
                  </div>
                )}
                {/* 非混合支付 + 贈送天數抵扣模式 */}
                {!mixedPayment && activeMode === 'gift' && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 16, color: '#ff4d4f', borderTop: '1px solid #d9d9d9', paddingTop: 8, marginTop: 8 }}>
                    <span style={{ fontWeight: 600 }}>抵扣天數：</span>
                    <span style={{ fontWeight: 700 }}>{effectiveGiftDays}天</span>
                  </div>
                )}
                {/* 實付總額（推廣金 / 混合支付顯示） */}
                {(mixedPayment || activeMode === 'promo') && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 16, color: '#ff4d4f', borderTop: '1px solid #d9d9d9', paddingTop: 8, marginTop: 8 }}>
                    <span style={{ fontWeight: 600 }}>{t('totalPayable')}：</span>
                    <span style={{ fontWeight: 700 }}>${payableAmount.toLocaleString()}</span>
                  </div>
                )}
              </div>
              <div style={{ fontSize: 11, color: '#8c8c8c', lineHeight: '18px', marginBottom: 12 }}>{t('trafficPayHint')}</div>
              <Button
                type="primary" block size="large" icon={<ShoppingCartOutlined />}
                disabled={!canSubmit}
                onClick={handlePayment}
                style={{
                  background: canSubmit ? '#E8720C' : '#d9d9d9',
                  borderColor: canSubmit ? '#E8720C' : '#d9d9d9',
                  height: 44, fontSize: 16, fontWeight: 600,
                }}
              >
                {t('payButton')}
              </Button>
            </Card>
          </div>
        </div>
      )}

      {/* 確認訂單彈窗（同全局規範） */}
      <Modal
        title={t('confirmOrder')}
        open={confirmOpen}
        onOk={handleConfirm}
        onCancel={() => setConfirmOpen(false)}
        okText={t('confirmPay')}
        cancelText={t('common:cancel')}
        okButtonProps={{ style: { background: '#E8720C', borderColor: '#E8720C' } }}
      >
        {summary && (
          <div style={{ fontSize: 13, color: '#595959', lineHeight: '24px' }}>
            <h4 style={{ marginBottom: 8, fontSize: 14, color: '#595959' }}>{t('purchaseDetail')}</h4>
            {!storeMode && <div>{t('storeNameLabel')}：{MOCK_TRAFFIC_MERCHANTS.find(m => m.value === searchStoreName)?.label}</div>}
            <div>{t('trafficSelectChannel')}：{BIZ_CHANNEL_I18N_MAP[bizChannel]}</div>
            <div>{t('trafficPackageNameLabel')}：{summary.tierName ?? t('trafficCustomPackageName')}</div>
            <div>{t('trafficImpressions')}：{summary.impressions.toLocaleString()} {t('trafficImpressionsUnit')}</div>
            <div>{t('trafficDeliverySlot')}：{deliverySlot === 'allday' ? t('trafficSlotAllDay') : t('trafficSlotBusiness')}</div>
            <div style={{ marginTop: 4, fontSize: 11, color: '#FA8C16' }}>🕐 {t('trafficClosedHint')}</div>
            {/* 結算區 */}
            <div style={{ background: '#fafafa', padding: 16, borderRadius: 8, marginTop: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                <span style={{ color: '#595959' }}>{t('orderOriginal')}：</span>
                <span style={{ fontWeight: 600 }}>${summary.original.toLocaleString()}</span>
              </div>
              {discountAmount > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, color: '#fa8c16' }}>
                  <span>{t('orderDiscount')}：</span>
                  <span style={{ fontWeight: 600 }}>-${discountAmount.toLocaleString()}</span>
                </div>
              )}
              {giftDeductAmount > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, color: '#fa8c16' }}>
                  <span>贈送天數抵扣（{effectiveGiftDays}天 × ${giftDayValue}）：</span>
                  <span style={{ fontWeight: 600 }}>-${giftDeductAmount.toLocaleString()}</span>
                </div>
              )}
              {!mixedPayment && activeMode === 'gift' && (
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 16, color: '#ff4d4f', borderTop: '1px solid #d9d9d9', paddingTop: 8, marginTop: 8 }}>
                  <span style={{ fontWeight: 600 }}>抵扣天數：</span>
                  <span style={{ fontWeight: 700 }}>{effectiveGiftDays}天</span>
                </div>
              )}
              {(mixedPayment || activeMode === 'promo') && (
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 16, color: '#ff4d4f', borderTop: '1px solid #d9d9d9', paddingTop: 8, marginTop: 8 }}>
                  <span style={{ fontWeight: 600 }}>{t('totalPayable')}：</span>
                  <span style={{ fontWeight: 700 }}>${payableAmount.toLocaleString()}</span>
                </div>
              )}
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
