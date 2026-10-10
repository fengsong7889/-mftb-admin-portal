/**
 * 投流廣告 - 流量包定價配置（新增/編輯/詳情）
 *
 * 業務背景：投流廣告採用預付流量包模型（買 N 次曝光 = X MOP，對標 DUO+），
 * 按業務頻道（美食外賣/超市百貨/團購到店）分別定價。每個頻道可獨立配置
 * 預設檔位（曝光次數/價格/上架）與自定義階梯單價（買越多單價越低）。
 *
 * 數據真值：後端 biz_ad_pricing_traffic（一個算法 × 一個業務頻道一條配置），
 * 定價編號 DJTL+年月日+3位 由後端「編號生成規則 config_pricing_traffic」生成；
 * 本頁只負責讀寫該條記錄，不再使用 localStorage。
 *
 * 基礎信息（品牌/業務頻道/關聯算法）與其它定價配置頁保持一致的表單風格。
 */
import { useEffect, useMemo, useState } from 'react'
import { Button, DatePicker, Form, Input, InputNumber, Radio, Select, Switch, Tag, Upload, message } from 'antd'
import type { UploadFile } from 'antd'
import { ArrowLeftOutlined, SaveOutlined, PlusOutlined, ShopOutlined, AppstoreOutlined, DeleteOutlined, BarChartOutlined, SettingOutlined, CheckCircleOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { AlgorithmType, AppType, APP_OPTIONS } from '../constants'
import { BIZ_CHANNEL, BIZ_CHANNEL_OPTIONS, type BizChannelValue } from '../../../constants/bizChannel'
import {
  fetchAdAlgorithms,
  fetchAdTrafficPricingDetail,
  createAdTrafficPricing,
  updateAdTrafficPricing,
  appTypeToBrand,
  brandToAppType,
  type AdAlgorithm,
} from '../../../api/adPromotion'
import {
  type TrafficChannelPricing,
  type TrafficPackageTier,
  type TrafficPriceLadderRow,
  generateDefaultTrafficPricing,
  findLadderUnitPrice,
} from '../../PromotionSalesConfig/types'
import { channelPricingToRequest, trafficVoToChannelPricing } from '../../_shared/ad-promotion/trafficPricing'

/** 新增時的默認業務頻道（外賣到家 tab 預設美食外賣，團購到店 tab 預設團購到店） */
const defaultChannelOf = (module: string): BizChannelValue =>
  module === 'groupBuy' ? BIZ_CHANNEL.GROUP_BUY : BIZ_CHANNEL.FOOD_DELIVERY

/** 按當前 tab 限定可選業務頻道（與銷售定價列表的頻道口徑一致） */
const channelOptionsOf = (module: string) =>
  module === 'groupBuy'
    ? BIZ_CHANNEL_OPTIONS.filter(o => o.value === BIZ_CHANNEL.GROUP_BUY)
    : BIZ_CHANNEL_OPTIONS.filter(o => o.value !== BIZ_CHANNEL.GROUP_BUY)

export default function TrafficPackagePricing() {
  const { t } = useTranslation()
  const tAd = useTranslation('adSales').t
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const urlId = searchParams.get('id') || ''
  const urlModule = searchParams.get('module') || 'delivery'
  const isDetailMode = searchParams.get('mode') === 'detail'
  const isEditMode = !!urlId && !isDetailMode
  const [form] = Form.useForm()

  /* ── 狀態 ── */
  const [bizChannel, setBizChannel] = useState<BizChannelValue>(() => defaultChannelOf(urlModule))
  /** 當前編輯的單條定價（算法 × 業務頻道），初值為後端默認檔位模板 */
  const [current, setCurrent] = useState<TrafficChannelPricing>(
    () => generateDefaultTrafficPricing().find(p => p.bizChannel === defaultChannelOf(urlModule)) ?? generateDefaultTrafficPricing()[0],
  )
  const [algorithmOptions, setAlgorithmOptions] = useState<AdAlgorithm[]>([])
  const [detailFileList, setDetailFileList] = useState<UploadFile[]>([])
  const [saving, setSaving] = useState(false)
  const [tAppOptions] = useState(() => APP_OPTIONS.map(o => ({ label: t(o.labelKey), value: o.value })))
  const tChannelOptions = useMemo(() => channelOptionsOf(urlModule), [urlModule])

  /** 更新當前配置（檔位/階梯/退款/狀態全部走這裡） */
  const updateCurrent = (patch: Partial<TrafficChannelPricing>) =>
    setCurrent(prev => ({ ...prev, ...patch }))

  const updateTier = (id: string, patch: Partial<TrafficPackageTier>) =>
    setCurrent(prev => ({ ...prev, tiers: prev.tiers.map(tier => (tier.id === id ? { ...tier, ...patch } : tier)) }))

  /* ── 初始化：關聯算法下拉（僅投流廣告算法） ── */
  useEffect(() => {
    form.setFieldsValue({ brand: AppType.SHANFENG, bizChannel })
    fetchAdAlgorithms({ page: 1, size: 500, algoType: AlgorithmType.TRAFFIC_AD })
      .then(res => {
        const list = res.records ?? []
        setAlgorithmOptions(list)
        if (!urlId && list.length > 0) {
          form.setFieldsValue({ algoId: list[0].id })
        }
      })
      .catch(() => { /* 算法庫不可用時允許跳過關聯，保存前仍會校驗 */ })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /* ── 編輯/詳情：按定價主鍵載入後端記錄回填 ── */
  useEffect(() => {
    if (!urlId) return
    fetchAdTrafficPricingDetail(Number(urlId))
      .then(vo => {
        const cp = trafficVoToChannelPricing(vo)
        setCurrent(cp)
        setBizChannel(cp.bizChannel)
        form.setFieldsValue({
          brand: (brandToAppType(vo.brand) ?? AppType.SHANFENG) as AppType,
          bizChannel: cp.bizChannel,
          algoId: vo.algoId,
        })
      })
      .catch(() => message.error(t('common.loadFailed')))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlId])

  /** 新增模式下切換頻道：換到該頻道的默認檔位（後端按頻道獨立存儲） */
  const handleChannelChange = (val: BizChannelValue) => {
    setBizChannel(val)
    form.setFieldsValue({ bizChannel: val })
    const preset = generateDefaultTrafficPricing().find(p => p.bizChannel === val)
    if (preset) setCurrent({ ...preset, pricingId: undefined, pricingNo: undefined })
  }

  /* ── 套餐包操作（同人氣商家新增皮膚：卡片式內聯編輯） ── */
  const handleAddPackage = () => {
    const newTier: TrafficPackageTier = {
      id: `tier-${Date.now()}`,
      name: '',
      impressions: 1000,
      price: 200,
      onSale: true,
      sort: current.tiers.length + 1,
      discountEnabled: false,
      discountTimeMode: 'unlimited',
    }
    updateCurrent({ tiers: [...current.tiers, newTier] })
  }

  const handleDeleteTier = (id: string) => {
    updateCurrent({ tiers: current.tiers.filter(tier => tier.id !== id) })
  }

  /* ── 階梯單價操作（僅配置下限「曝光量 ≥ xx」，上限自動推導 = 下一梯度下限 − 1） ── */
  const normalizeLadder = (ladder: TrafficPriceLadderRow[]): TrafficPriceLadderRow[] => {
    const sorted = [...ladder].sort((a, b) => a.minQty - b.minQty)
    return sorted.map((row, idx) => ({
      ...row,
      maxQty: idx < sorted.length - 1 ? sorted[idx + 1].minQty - 1 : 0,
    }))
  }

  const updateLadderRow = (id: string, field: keyof TrafficPriceLadderRow, value: number) => {
    updateCurrent({ ladder: normalizeLadder(current.ladder.map(row => (row.id === id ? { ...row, [field]: value } : row))) })
  }

  const addLadderRow = () => {
    const sorted = [...current.ladder].sort((a, b) => a.minQty - b.minQty)
    const last = sorted[sorted.length - 1]
    const newRow: TrafficPriceLadderRow = {
      id: `ladder-${Date.now()}`,
      minQty: last ? last.minQty + 1000 : 100,
      maxQty: 0,
      unitPrice: last ? last.unitPrice : 0.25,
    }
    updateCurrent({ ladder: normalizeLadder([...current.ladder, newRow]) })
  }

  const removeLadderRow = (id: string) => {
    updateCurrent({ ladder: normalizeLadder(current.ladder.filter(row => row.id !== id)) })
  }

  /** 第一梯度起始值（商家最低起購量） */
  const firstLadderMin = current.ladder.length > 0
    ? Math.min(...current.ladder.map(r => r.minQty))
    : null

  /* ── 退款配置（行業慣例：退還剩餘未消耗價值 + 按退款金額扣手續費） ── */
  const allowRefund = current.allowRefund !== false

  /* ── 保存 / 返回 ── */
  const handleSave = async () => {
    let values: { brand?: AppType; algoId?: number; bizChannel?: BizChannelValue }
    try {
      values = await form.validateFields()
    } catch {
      return
    }
    // 套餐包完整性校驗（名稱/曝光次數/價格必填）
    const incomplete = current.tiers.find(tier => !tier.name || !tier.impressions || !tier.price)
    if (incomplete) {
      message.error(tAd('trafficPackageIncomplete'))
      return
    }
    const algo = algorithmOptions.find(a => a.id === values.algoId)
    // 自定義最低購買量 = 第一梯度起始值（起始值之前的曝光量不可購買）
    const payload = channelPricingToRequest(
      { ...current, bizChannel: values.bizChannel ?? bizChannel, customMinQty: firstLadderMin ?? current.customMinQty },
      {
        algoId: values.algoId as number,
        algoName: algo?.algoName,
        brand: appTypeToBrand(values.brand),
      },
    )
    setSaving(true)
    try {
      if (isEditMode && current.pricingId) {
        await updateAdTrafficPricing(current.pricingId, payload)
        message.success(tAd('trafficPricingSaved'))
      } else {
        const created = await createAdTrafficPricing(payload)
        message.success(tAd('trafficPricingSaved'))
        setCurrent(prev => ({ ...prev, pricingId: created?.id, pricingNo: created?.pricingNo }))
      }
      navigate(`/promotion-waterfall?type=${AlgorithmType.TRAFFIC_AD}`)
    } catch (err) {
      message.error((err as Error).message || tAd('trafficPricingSaveFailed'))
    } finally {
      setSaving(false)
    }
  }

  const handleBack = () => {
    navigate(`/promotion-waterfall?type=${AlgorithmType.TRAFFIC_AD}`)
  }

  /* ── 計價示例 ── */
  const exampleQty = 3000
  const exampleUnit = findLadderUnitPrice(current.ladder, exampleQty)

  /* ── 樣式（與金字招牌定價頁保持一致） ── */
  const cardShellStyle: React.CSSProperties = {
    border: '1px solid #e8eaed', borderRadius: 8, background: '#fff',
    padding: '20px 24px', marginBottom: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
  }
  const fieldLabelStyle: React.CSSProperties = { fontSize: 13, color: '#595959', marginBottom: 4 }
  const requiredMark = <span style={{ color: '#ff4d4f', marginRight: 4 }}>*</span>
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
      {/* 標題欄 */}
      <div style={{
        position: 'relative', background: '#fff', marginBottom: 16,
        borderRadius: 12, boxShadow: '0 2px 12px rgba(0,0,0,0.06)',
        overflow: 'hidden',
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
            >{t('common.back')}</Button>
            <div style={{ width: 1, height: 20, background: '#E8E8E8' }} />
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#1890ff' }}>
                {isDetailMode ? tAd('trafficPricingDetailTitle') : isEditMode ? tAd('trafficPricingEditTitle') : tAd('trafficPricingAddTitle')}
              </h2>
              {current.pricingNo && (
                <Tag color="blue" style={{ margin: 0, fontFamily: 'monospace' }}>{current.pricingNo}</Tag>
              )}
            </div>
          </div>
        </div>
      </div>

      <Form form={form} layout="vertical" disabled={isDetailMode}>
        {/* ── 1. 基礎信息（與金字招牌定價一致的卡片結構） ── */}
        <div style={cardShellStyle}>
          {cardTitle(<ShopOutlined style={{ fontSize: 14, color: '#1890ff' }} />, '#E6F7FF', t('recommend.basicInfo'))}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
            <Form.Item label={t('common.brand')} name="brand" rules={[{ required: true, message: t('common.selectBrand') }]}>
              <Select
                disabled={isEditMode || isDetailMode}
                placeholder={t('common.selectBrand')}
                options={tAppOptions}
              />
            </Form.Item>
            <Form.Item label={t('recommend.algoName')} name="algoId" rules={[{ required: true, message: t('recommend.selectAlgo') }]}>
              <Select
                disabled={isEditMode || isDetailMode}
                placeholder={t('recommend.selectAlgo')}
                showSearch
                optionFilterProp="label"
                options={algorithmOptions.map(a => ({
                  label: a.algoCode ? `${a.algoName}(${a.algoCode})` : a.algoName,
                  value: a.id,
                }))}
              />
            </Form.Item>
            <Form.Item label={t('waterfall.colBizChannel')} name="bizChannel" rules={[{ required: true, message: tAd('trafficInputRequired') }]}>
              <Select
                disabled={isEditMode || isDetailMode}
                options={tChannelOptions}
                onChange={handleChannelChange}
              />
            </Form.Item>
          </div>
          <Form.Item label={t('recommend.popularSkin.detailImageLabel')} style={{ marginBottom: 0, marginTop: 16 }}>
            <Upload
              disabled={isDetailMode}
              listType="picture-card"
              fileList={detailFileList}
              onChange={({ fileList }) => setDetailFileList(fileList)}
              beforeUpload={() => false}
            >
              {detailFileList.length < 1 && (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
                  <PlusOutlined style={{ fontSize: 20 }} />
                  <span style={{ fontSize: 12, color: '#8c8c8c' }}>{t('recommend.popularSkin.uploadDetailImage')}</span>
                </div>
              )}
            </Upload>
          </Form.Item>
        </div>

        {/* ── 2. 套餐包配置（運營自行新增套餐包，支持限時折扣） ── */}
        <div style={cardShellStyle}>
          {cardTitle(
            <AppstoreOutlined style={{ fontSize: 14, color: '#E8720C' }} />, '#FFF7E6', tAd('trafficPackageConfig'),
            <span style={{ fontSize: 12, color: '#8C8C8C', marginLeft: 4 }}>{tAd('trafficPackageConfigHint')}</span>,
            !isDetailMode && (
              <Button type="primary" size="small" icon={<PlusOutlined />} onClick={handleAddPackage} style={{ borderRadius: 6 }}>
                {tAd('trafficAddPackage')}
              </Button>
            ),
          )}

          {current.tiers.length === 0 ? (
            <div style={{ padding: '24px', textAlign: 'center', background: '#FAFAFA', borderRadius: 8, border: '1px dashed #D9D9D9' }}>
              <span style={{ fontSize: 13, color: '#8C8C8C' }}>{tAd('trafficNoPackage')}</span>
            </div>
          ) : (
            [...current.tiers].sort((a, b) => a.sort - b.sort).map((tier, index) => (
              <div key={tier.id} style={{ border: '1px solid #f0f0f0', borderRadius: 8, padding: '16px 20px', marginBottom: 12, background: '#FAFAFA' }}>
                {/* 塊頭：序號徽章 + 套餐包 + 刪除（配置即可售，無需上架操作） */}
                <div style={{ display: 'flex', alignItems: 'center', marginBottom: 12 }}>
                  <div style={{
                    width: 24, height: 24, borderRadius: 8, flexShrink: 0,
                    background: 'linear-gradient(135deg, #E8720C, #F59432)',
                    color: '#fff', fontSize: 12, fontWeight: 700,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    boxShadow: '0 2px 4px rgba(232,114,12,0.25)', marginRight: 8,
                  }}>{index + 1}</div>
                  <span style={{ fontSize: 14, fontWeight: 600, color: '#262626' }}>{tAd('trafficPackageKit')}</span>
                  <div style={{ flex: 1 }} />
                  {!isDetailMode && (
                    <Button type="link" danger size="small" icon={<DeleteOutlined />} onClick={() => handleDeleteTier(tier.id)}>
                      {t('common.delete')}
                    </Button>
                  )}
                </div>

                {/* 第一行：套餐名稱 / 曝光次數 / 價格 */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px 16px', marginBottom: 14 }}>
                  <div>
                    <div style={fieldLabelStyle}>{requiredMark}{tAd('trafficPackageName')}</div>
                    <Input
                      placeholder={tAd('trafficPackageNamePh')}
                      value={tier.name}
                      maxLength={20}
                      allowClear
                      disabled={isDetailMode}
                      onChange={e => updateTier(tier.id, { name: e.target.value })}
                    />
                  </div>
                  <div>
                    <div style={fieldLabelStyle}>{requiredMark}{tAd('trafficImpressions')}</div>
                    <InputNumber
                      style={{ width: '100%' }} min={1} max={10000000} precision={0}
                      value={tier.impressions} disabled={isDetailMode}
                      addonAfter={tAd('trafficImpressionsUnit')}
                      onChange={v => updateTier(tier.id, { impressions: v ?? 1 })}
                    />
                  </div>
                  <div>
                    <div style={fieldLabelStyle}>{requiredMark}{tAd('trafficPackagePrice')}</div>
                    <InputNumber
                      style={{ width: '100%' }} min={1} precision={0}
                      value={tier.price} disabled={isDetailMode}
                      addonAfter={tAd('trafficMopUnit')}
                      onChange={v => updateTier(tier.id, { price: v ?? 1 })}
                    />
                  </div>
                </div>

                {/* 第二行：折扣（開關 + 折扣值 + 限定時間/不限時間 + 折後價預覽） */}
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
                  padding: '10px 12px', background: tier.discountEnabled ? '#FFF7E6' : '#FAFAFA',
                  border: `1px solid ${tier.discountEnabled ? '#FFD591' : '#f0f0f0'}`, borderRadius: 6,
                  transition: 'all 0.25s',
                }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: tier.discountEnabled ? '#d46b08' : '#8C8C8C' }}>💰 {tAd('trafficDiscountTitle')}</span>
                  <Switch size="small" checked={!!tier.discountEnabled} disabled={isDetailMode}
                    onChange={checked => updateTier(tier.id, { discountEnabled: checked })} />
                  {tier.discountEnabled && (
                    <>
                      <InputNumber
                        min={0.1} max={9.9} step={0.1} precision={1}
                        value={tier.discount} disabled={isDetailMode}
                        style={{ width: 120 }} addonAfter={tAd('trafficDiscountUnit')}
                        onChange={v => updateTier(tier.id, { discount: v ?? undefined })}
                      />
                      <Radio.Group
                        value={tier.discountTimeMode ?? 'unlimited'}
                        disabled={isDetailMode}
                        onChange={e => updateTier(tier.id, { discountTimeMode: e.target.value })}
                      >
                        <Radio value="unlimited">{tAd('trafficDiscountUnlimited')}</Radio>
                        <Radio value="limited">{tAd('trafficDiscountLimited')}</Radio>
                      </Radio.Group>
                      {tier.discountTimeMode === 'limited' && (
                        <>
                          <span style={{ fontSize: 13, color: '#595959' }}>{tAd('trafficDiscountPeriod')}</span>
                          <DatePicker.RangePicker
                            disabled={isDetailMode}
                            value={tier.discountStartDate && tier.discountEndDate ? [dayjs(tier.discountStartDate), dayjs(tier.discountEndDate)] : null}
                            onChange={(_, dateStrings) => updateTier(tier.id, {
                              discountStartDate: dateStrings[0] || undefined,
                              discountEndDate: dateStrings[1] || undefined,
                            })}
                          />
                        </>
                      )}
                      {tier.discount != null && tier.price > 0 && (
                        <span style={{ fontSize: 12, color: '#E8720C', fontWeight: 600 }}>
                          {tAd('trafficDiscountPreview').replace('{{discounted}}', String(Math.round(tier.price * tier.discount / 10 * 100) / 100))}
                        </span>
                      )}
                    </>
                  )}
                </div>
              </div>
            ))
          )}
        </div>

        {/* ── 3. 自定義階梯單價（曝光量 ≥ xx 命中計價） ── */}
        <div style={cardShellStyle}>
          {cardTitle(
            <BarChartOutlined style={{ fontSize: 14, color: '#722ED1' }} />, '#F9F0FF', tAd('trafficLadderConfig'),
            <span style={{ fontSize: 12, color: '#8C8C8C', marginLeft: 4 }}>{tAd('trafficLadderHint')}</span>,
            !isDetailMode && (
              <Button type="primary" size="small" icon={<PlusOutlined />} onClick={addLadderRow} style={{ borderRadius: 6 }}>
                {tAd('trafficLadderAddRow')}
              </Button>
            ),
          )}

          {current.ladder.length === 0 ? (
            <div style={{ padding: '24px', textAlign: 'center', background: '#FAFAFA', borderRadius: 8, border: '1px dashed #D9D9D9' }}>
              <span style={{ fontSize: 13, color: '#8C8C8C' }}>{tAd('trafficNoLadder')}</span>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {[...current.ladder].sort((a, b) => a.minQty - b.minQty).map((row, idx) => (
                <div key={row.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: 12, background: '#FAFAFA', borderRadius: 6, flexWrap: 'wrap' }}>
                  <Tag color="blue">{tAd('trafficLadderTier')} {idx + 1}</Tag>
                  <span style={{ fontSize: 13, color: '#595959' }}>{tAd('trafficLadderQtyPrefix')} ≥</span>
                  <InputNumber
                    min={1} max={9999999} precision={0}
                    value={row.minQty} disabled={isDetailMode}
                    style={{ width: 120 }}
                    onChange={val => updateLadderRow(row.id, 'minQty', val ?? 1)}
                  />
                  <span style={{ fontSize: 13, color: '#595959' }}>{tAd('trafficLadderRowSuffix')}</span>
                  <InputNumber
                    min={0.01} max={99} step={0.01} precision={2}
                    value={row.unitPrice} disabled={isDetailMode}
                    style={{ width: 140 }}
                    addonAfter={`${tAd('trafficMopUnit')}/${tAd('trafficImpressionsUnit')}`}
                    onChange={val => updateLadderRow(row.id, 'unitPrice', val ?? 0.01)}
                  />
                  {row.maxQty > 0 && (
                    <span style={{ fontSize: 12, color: '#8C8C8C' }}>
                      {tAd('trafficLadderRangeHint').replace('{{range}}', `${row.minQty.toLocaleString()} ~ ${row.maxQty.toLocaleString()}`)}
                    </span>
                  )}
                  {!isDetailMode && (
                    <Button
                      type="link" danger size="small" icon={<DeleteOutlined />}
                      style={{ marginLeft: 'auto' }}
                      onClick={() => removeLadderRow(row.id)}
                    >{t('common.delete')}</Button>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* 規則說明：最低起購 = 第一梯度起始值 */}
          <div style={{ marginTop: 14, padding: '10px 12px', background: '#F9F0FF', border: '1px solid #D3ADF7', borderRadius: 6, fontSize: 12, color: '#595959', lineHeight: '22px' }}>
            <span style={{ fontWeight: 600, color: '#722ED1' }}>📖 {tAd('trafficLadderRuleTitle')}：</span>
            <span style={{ color: '#8C8C8C' }}>
              {tAd('trafficLadderRule').split('{{min}}').join(String(firstLadderMin ?? current.customMinQty ?? 100))}
            </span>
          </div>
        </div>

        {/* 區塊4：計價示例 */}
        <div style={{ marginBottom: 16, padding: '12px 14px', background: '#f6ffed', border: '1px solid #b7eb8f', borderRadius: 8, fontSize: 12, color: '#595959', lineHeight: '22px' }}>
          <div style={{ fontWeight: 600, color: '#389e0d', marginBottom: 4 }}>💡 {tAd('trafficPricingExample')}</div>
          <div>{tAd('trafficPricingExampleDesc')}</div>
          {exampleUnit !== null && (
            <div style={{ fontFamily: 'monospace' }}>
              {tAd('trafficPricingExampleCalc')
                .replace('{{qty}}', exampleQty.toLocaleString())
                .replace('{{unit}}', String(exampleUnit))
                .replace('{{amount}}', String(Math.round(exampleQty * exampleUnit * 100) / 100))}
            </div>
          )}
        </div>

        {/* ── 5. 訂單退款配置（行業慣例：退還剩餘未消耗價值） ── */}
        <div style={cardShellStyle}>
          {cardTitle(
            <SettingOutlined style={{ fontSize: 14, color: '#f5222d' }} />, '#FFF1F0', t('recommend.popularSkin.refundConfigTitle'),
            <span style={{ fontSize: 12, color: '#8C8C8C', marginLeft: 4 }}>{tAd('trafficRefundConfigHint')}</span>,
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 13, color: allowRefund ? '#52C41A' : '#8C8C8C' }}>
                {allowRefund ? t('recommend.popularSkin.allowRefund') : t('recommend.popularSkin.notAllowRefund')}
              </span>
              <Switch
                size="small"
                checked={allowRefund}
                disabled={isDetailMode}
                onChange={checked => updateCurrent({ allowRefund: checked })}
                style={{ background: allowRefund ? '#52C41A' : '#D9D9D9' }}
              />
            </div>,
          )}
          {allowRefund ? (
            <div>
              {/* 退款公式 */}
              <div style={{ padding: '10px 12px', background: '#FFF1F0', border: '1px solid #FFCCC7', borderRadius: 6, fontSize: 12, color: '#595959', lineHeight: '22px', marginBottom: 12 }}>
                <div style={{ fontFamily: 'monospace' }}>{tAd('trafficRefundFormula')}</div>
              </div>
              {/* 退款手續費比例 */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 13, color: '#595959' }}>{tAd('trafficRefundFeeLabel')}</span>
                <InputNumber
                  min={0} max={100} step={1} precision={0}
                  value={current.refundFeePercent ?? 0}
                  disabled={isDetailMode}
                  style={{ width: 120 }} addonAfter="%"
                  onChange={val => updateCurrent({ refundFeePercent: val ?? 0 })}
                />
                <span style={{ fontSize: 12, color: '#8C8C8C' }}>{tAd('trafficRefundFeeHint')}</span>
              </div>
              {/* 退款細則（行業慣例） */}
              <div style={{ marginTop: 10, fontSize: 12, color: '#8C8C8C', lineHeight: '20px' }}>
                <div>· {tAd('trafficRefundRule1')}</div>
                <div>· {tAd('trafficRefundRule2')}</div>
              </div>
            </div>
          ) : (
            <div style={{
              padding: '24px', textAlign: 'center',
              background: '#FAFAFA', borderRadius: 8,
              border: '1px dashed #D9D9D9',
            }}>
              <span style={{ fontSize: 13, color: '#8C8C8C' }}>{tAd('trafficNotAllowRefundHint')}</span>
            </div>
          )}
        </div>

        {/* ── 6. 狀態設置 ── */}
        <div style={cardShellStyle}>
          {cardTitle(<CheckCircleOutlined style={{ fontSize: 14, color: '#52C41A' }} />, '#F6FFED', t('recommend.popularSkin.statusSettingCard'))}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 13, color: '#595959' }}>{t('recommend.popularSkin.statusLabelColon')}</span>
            <Switch
              checked={current.status !== 'disabled'}
              disabled={isDetailMode}
              onChange={checked => updateCurrent({ status: checked ? 'enabled' : 'disabled' })}
              checkedChildren={t('recommend.popularSkin.statusEnabledText')}
              unCheckedChildren={t('recommend.popularSkin.statusDisabledText')}
            />
            <span style={{ fontSize: 12, color: '#8C8C8C' }}>{tAd('trafficStatusHint')}</span>
          </div>
        </div>
      </Form>

      {/* ── 底部操作欄 ── */}
      {!isDetailMode && (
        <div className="form-footer">
          <Button onClick={handleBack}>{t('common.cancel')}</Button>
          <Button type="primary" icon={<SaveOutlined />} loading={saving} onClick={handleSave}>
            {t('common.save')}
          </Button>
        </div>
      )}
    </div>
  )
}
