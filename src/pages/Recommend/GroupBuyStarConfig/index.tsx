/**
 * Copyright (c) 2026 fengsong7889. All Rights Reserved.
 *
 * 本文件为「MFTB 企业一体化管理平台软件」的组成部分。
 * 未经著作权人书面许可，不得使用、复制、修改、再分发或用于任何商业目的。
 * 完整许可条款见仓库根目录 LICENSE 文件。
 */
import { useMemo, useState } from 'react'
import { Alert, Button, Form, Input, Select, Spin } from 'antd'
import { ArrowLeftOutlined, AppstoreOutlined, EyeOutlined, SaveOutlined } from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
import dayjs from 'dayjs'
import { APP_OPTIONS } from '@mftb/contracts/recommendConstants'
import DetailPageHeader from '@/components/DetailPageHeader'
import AlgorithmSection from '../AlgorithmForm/AlgorithmSection'
import ProductStarSections from './sections'
import useStarProductForm from './useStarProductForm'
import { PRODUCT_STAR_PREVIEW_DEFAULTS, type ProductStarPreviewValues } from './preview'
import './index.css'

interface Props {
  algorithmId?: string
  initialReadOnly?: boolean
  onBack: () => void
  onSaved: () => void
  /** 既有记录详情转编辑：由路由去掉 mode 参数，而非仅本地切换。 */
  onEdit?: () => void
}

/** 团购商品无敌星星配置：真实读写版本化参数，与门店旧协议隔离；投放执行仍待接入。 */
export default function GroupBuyStarConfig({ algorithmId = '', initialReadOnly = false, onBack, onSaved, onEdit }: Props) {
  const { t } = useTranslation()
  const [form] = Form.useForm<ProductStarPreviewValues>()
  const [readOnly, setReadOnly] = useState(initialReadOnly)
  const [meta, setMeta] = useState<{ updatedBy?: string; updatedAt?: string } | null>(null)
  const [values, setValues] = useState<ProductStarPreviewValues>(PRODUCT_STAR_PREVIEW_DEFAULTS)
  const starForm = useStarProductForm({ algorithmId, readOnly, form, onLoaded: setMeta, onSaved })
  const brandOptions = useMemo(() => APP_OPTIONS.map(option => ({ value: option.value, label: t(option.labelKey) })), [t])
  const scope = <span className="group-buy-star-config__scope">⭐ {t('recommend.algoInvincibleStar')} · {t('recommend.starProduct.targetProduct')}</span>
  const isEdit = !!algorithmId
  const formDisabled = readOnly || starForm.loadState !== 'ready' || starForm.saving

  return <div className={`content-area algorithm-form-page group-buy-star-config${readOnly ? ' algorithm-form-page--detail' : ''}`}>
    {readOnly ? (
      <DetailPageHeader title={t('recommend.algoDetail')} tags={scope} onBack={onBack}
        onEdit={onEdit ?? (() => setReadOnly(false))} menuKey="promotion-algorithm" />
    ) : (
      <div className="group-buy-star-config__header">
        <div className="group-buy-star-config__header-accent" />
        <div className="group-buy-star-config__header-body">
          <Button type="primary" icon={<ArrowLeftOutlined />} onClick={onBack}>{t('common:back')}</Button>
          <div className="group-buy-star-config__title-row">
            <h2>{isEdit ? t('recommend.editAlgo') : t('recommend.addAlgo')}</h2>{scope}
          </div>
          {!isEdit && <Button className="group-buy-star-config__preview" icon={<EyeOutlined />} onClick={() => setReadOnly(true)}>{t('recommend.starProduct.preview')}</Button>}
        </div>
      </div>
    )}

    {starForm.loadState === 'error' && (
      <Alert className="group-buy-star-config__notice" type="error" showIcon
        message={t('recommend.starProduct.loadFailed')} description={starForm.loadError}
        action={<Button onClick={starForm.retry}>{t('recommend.starProduct.retry')}</Button>} />
    )}
    {starForm.loadState === 'loading' && (
      <div role="status" className="group-buy-star-config__loading"><Spin size="small" /> {t('recommend.starProduct.loading')}</div>
    )}

    <Form<ProductStarPreviewValues> form={form} layout="vertical" disabled={formDisabled}
      initialValues={PRODUCT_STAR_PREVIEW_DEFAULTS} onValuesChange={(_, next: ProductStarPreviewValues) => setValues(next)}>
      {/* 与 AlgorithmAdd 各广告类型统一的基础定义模块名；键 recommend.starProduct.basicInfoTitle（繁中真源）。 */}
      <AlgorithmSection title={t('recommend.starProduct.basicInfoTitle')} icon={<AppstoreOutlined />} tone="info" readOnly={readOnly}>
        <div className="group-buy-star-config__base-fields">
          <Form.Item name="name" label={t('recommend.algoName')} rules={[{ required: true, whitespace: true, message: t('recommend.algoNamePh') }, { max: 100, message: t('recommend.starProduct.nameMax') }]}>
            <Input placeholder={t('recommend.algoNamePh')} maxLength={100} />
          </Form.Item>
          <Form.Item name="brand" label={t('common:brand')} rules={[{ required: true, message: t('common:selectBrand') }]}>
            <Select placeholder={t('common:selectBrand')} options={brandOptions} disabled={isEdit || undefined} />
          </Form.Item>
        </div>
      </AlgorithmSection>
      <ProductStarSections readOnly={readOnly} values={values} />
    </Form>

    {readOnly ? <div className="algorithm-form__footer">
      <span>{t('recommend.starProduct.lastUpdater')}：<b>{meta?.updatedBy || '—'}</b></span>
      <span>{t('recommend.starProduct.lastUpdateTime')}：<b>{meta?.updatedAt ? dayjs(meta.updatedAt).format('YYYY-MM-DD HH:mm:ss') : '—'}</b></span>
    </div> : (
      <div className="form-footer">
        <Button onClick={onBack}>{t('common:cancel')}</Button>
        <Button type="primary" icon={<SaveOutlined />} loading={starForm.saving}
          disabled={starForm.loadState !== 'ready'} onClick={starForm.handleSave}>{t('common:save')}</Button>
      </div>
    )}
  </div>
}
