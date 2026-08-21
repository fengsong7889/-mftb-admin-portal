/**
 * 金字招牌 - 定價配置（新增/編輯/詳情）
 *
 * 業務背景：金字招牌與人氣商家同屬皮膚售賣模式，基礎信息結構一致。
 * 基礎信息字段：名稱、所屬品牌、業務頻道、詳情圖。
 */
import { useMemo, useState, useEffect } from 'react'
import { Button, Form, Input, Select, Upload, message } from 'antd'
import type { UploadFile } from 'antd'
import {
  ArrowLeftOutlined,
  SaveOutlined,
  PlusOutlined,
  ShopOutlined,
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
  appTypeToBrand,
  brandToAppType,
} from '../../../api/adPromotion'

/** Mock 詳情圖（編輯/詳情模式回顯用） */
const svgDataUrl = (svg: string) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
const MOCK_DETAIL_IMAGE = svgDataUrl(
  `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300" viewBox="0 0 400 300">`
  + `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#E8720C"/><stop offset="1" stop-color="#FFB347"/></linearGradient></defs>`
  + `<rect width="400" height="300" fill="url(#g)"/>`
  + `<text x="200" y="145" font-size="52" text-anchor="middle" font-family="PingFang SC, sans-serif">\u{1F3C5}</text>`
  + `<text x="200" y="200" font-size="24" font-weight="700" fill="#fff" text-anchor="middle" font-family="PingFang SC, sans-serif">金字招牌詳情圖</text>`
  + `</svg>`,
)

export default function GoldenSignboardPricing() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const urlModule = searchParams.get('module') || 'delivery'
  const urlId = searchParams.get('id') || ''
  const isDetailMode = searchParams.get('mode') === 'detail'
  const isEditMode = !!urlId && !isDetailMode
  const [form] = Form.useForm()
  const [loading, setLoading] = useState(false)

  // 狀態（底部 Switch：啟用/停用）
  const [status, setStatus] = useState<ServiceStatus>(ServiceStatus.ENABLED)
  // 詳情圖
  const [detailFileList, setDetailFileList] = useState<UploadFile[]>([])

  // APP/頻道選項
  const tAppOptions = useMemo(() => APP_OPTIONS.map(o => ({ label: t(o.labelKey), value: o.value })), [t])

  // 業務頻道選項（按模塊過濾，與人氣商家保持一致）
  const channelOptions = urlModule === 'groupBuy'
    ? [{ label: t('recommend.channelGroupBuyName'), value: RecommendChannel.GROUP_BUY }]
    : [
        { label: t('recommend.channelDeliveryName'), value: RecommendChannel.DELIVERY },
        { label: t('recommend.channelSupermarketName'), value: RecommendChannel.SUPERMARKET },
      ]

  // 編輯/詳情模式：從後端加載計價配置並回填（暫复用人氣商家接口，後續可按需拆分）
  useEffect(() => {
    if (!urlId) return
    setLoading(true)
    // TODO: 接入金字招牌專屬接口後替換
    Promise.reject(new Error('not implemented'))
      .catch(() => {
        // 後端不可用，表單留空不降級 Mock
      })
      .finally(() => setLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlId, form])

  const handleBack = () => {
    navigate(`/promotion-waterfall?type=${AlgorithmType.GOLDEN_SIGNBOARD}`)
  }

  // 保存
  const handleSubmit = async () => {
    try {
      const values = await form.validateFields()
      setLoading(true)
      // TODO: 接入金字招牌專屬接口
      const _payload = {
        algoName: values.signboardName,
        brand: appTypeToBrand(values.app),
        channel: values.channel,
        status,
      }
      // 模擬保存成功
      message.success(isEditMode ? t('recommend.popularSkin.editSuccess') : t('recommend.popularSkin.addSuccess'))
      navigate(`/promotion-waterfall?type=${AlgorithmType.GOLDEN_SIGNBOARD}`)
    } catch {
      /* 表單校驗失敗，antd 自動提示 */
    } finally {
      setLoading(false)
    }
  }

  const cardShellStyle: React.CSSProperties = {
    border: '1px solid #e8eaed', borderRadius: 8, background: '#fff',
    padding: '20px 24px', marginBottom: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
  }

  /** 卡片標題 */
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
            >{t('common:back')}</Button>
            <div style={{ width: 1, height: 20, background: '#E8E8E8' }} />
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#1890ff' }}>
                {isDetailMode ? t('recommend.popularSkin.skinPricingDetail') : isEditMode ? t('recommend.popularSkin.skinPricingEdit') : t('recommend.popularSkin.skinPricingAdd')}
              </h2>
              <span style={{ fontSize: 14, color: '#595959' }}>🏅 {t('algorithm.typeGoldenSignboard')}</span>
            </div>
          </div>
        </div>
      </div>

      <Form form={form} layout="vertical" disabled={isDetailMode}>
        {/* 基礎信息（與人氣商家保持一致） */}
        <div style={cardShellStyle}>
          {cardTitle(<ShopOutlined style={{ fontSize: 14, color: '#1890ff' }} />, '#e6f7ff', t('recommend.popularSkin.basicInfoTitle'))}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
            <Form.Item label="招牌名稱" name="signboardName" rules={[{ required: true, message: '請輸入招牌名稱' }]}>
              <Input
                placeholder="請輸入招牌名稱"
                maxLength={30}
                showCount
                disabled={isEditMode || isDetailMode}
              />
            </Form.Item>
            <Form.Item label={t('recommend.popularSkin.appLabel')} name="app" rules={[{ required: true, message: t('recommend.popularSkin.selectApp') }]}>
              <Select placeholder={t('recommend.popularSkin.pleaseSelect')} options={tAppOptions} disabled={isEditMode || isDetailMode} />
            </Form.Item>
            <Form.Item label={t('recommend.popularSkin.channelLabel')} name="channel" rules={[{ required: true, message: t('recommend.popularSkin.selectChannel') }]}>
              <Select placeholder={t('recommend.popularSkin.pleaseSelect')} options={channelOptions} disabled={isEditMode || isDetailMode} />
            </Form.Item>
          </div>
          {/* 詳情圖 */}
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
      </Form>

      {/* 底部操作欄：統一為「取消 + 保存」，詳情模式隱藏 */}
      {!isDetailMode && (
        <div className="form-footer">
          <Button onClick={handleBack}>{t('common:cancel')}</Button>
          <Button type="primary" icon={<SaveOutlined />} loading={loading} onClick={handleSubmit}>
            {t('common:save')}
          </Button>
        </div>
      )}
    </div>
  )
}
