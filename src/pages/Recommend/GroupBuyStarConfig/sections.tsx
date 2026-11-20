/**
 * Copyright (c) 2026 fengsong7889. All Rights Reserved.
 *
 * 本文件为「MFTB 企业一体化管理平台软件」的组成部分。
 * 未经著作权人书面许可，不得使用、复制、修改、再分发或用于任何商业目的。
 * 完整许可条款见仓库根目录 LICENSE 文件。
 */
import { Form, InputNumber, Select } from 'antd'
import { ThunderboltOutlined, ClockCircleOutlined } from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
import { ProductExposureStrategy, PRODUCT_STAR_INTERVAL, type ProductStarPreviewValues } from './preview'
import HelpPopover from '@/components/HelpPopover'
import AlgorithmSection from '../AlgorithmForm/AlgorithmSection'

/** 展示资格由团购业务系统裁决；本页只配置检查间隔与有限坑位分配策略。 */
export default function ProductStarSections({ readOnly, values }: { readOnly: boolean; values: ProductStarPreviewValues }) {
  const { t } = useTranslation()
  const roundRobin = values.exposureStrategy === ProductExposureStrategy.ROUND_ROBIN
  return <>
    <AlgorithmSection title={t('recommend.starProduct.checkTitle')} icon={<ClockCircleOutlined />} tone="info" readOnly={readOnly}
      extra={<HelpPopover title={t('recommend.starProduct.eligibilityHelpTitle')} ariaLabel={t('recommend.starProduct.eligibilityHelpTitle')}
        content={t('recommend.starProduct.eligibilityHelp')} />}>
      <div className="group-buy-star-config__fields">
        <Form.Item name="consistencyCheckInterval" label={t('recommend.starProduct.intervalLabel')}
          rules={[{ required: true, type: 'integer', min: PRODUCT_STAR_INTERVAL.min, max: PRODUCT_STAR_INTERVAL.max, message: t('recommend.starProduct.intervalRule') }]}>
          <InputNumber min={PRODUCT_STAR_INTERVAL.min} max={PRODUCT_STAR_INTERVAL.max} precision={0} suffix={t('recommend.starProduct.minuteUnit')} />
        </Form.Item>
      </div>
      <p className="group-buy-star-config__hint">{t('recommend.starProduct.intervalHint')}</p>
    </AlgorithmSection>

    <AlgorithmSection title={t('recommend.starProduct.strategyTitle')} icon={<ThunderboltOutlined />} readOnly={readOnly}
      extra={<HelpPopover title={t('recommend.starProduct.strategyHelpTitle')} ariaLabel={t('recommend.starProduct.strategyHelpTitle')} content={[
        { tone: 'info', label: t('recommend.roundRobinCalc'), body: t('recommend.starProduct.roundRobinBody') },
        { tone: 'neutral', label: t('recommend.randomCalc'), body: t('recommend.starProduct.randomBody') },
        { tone: 'warn', label: t('recommend.starProduct.commonBoundaryLabel'), body: t('recommend.starProduct.commonBoundaryBody') },
      ]} />}>
      <div className="group-buy-star-config__fields">
        <Form.Item name="exposureStrategy" label={t('recommend.starProduct.strategyLabel')} rules={[{ required: true, message: t('recommend.starProduct.strategyRequired') }]}>
          <Select options={[
            { value: ProductExposureStrategy.ROUND_ROBIN, label: t('recommend.roundRobinCalc') },
            { value: ProductExposureStrategy.RANDOM, label: t('recommend.randomCalc') },
          ]} />
        </Form.Item>
      </div>
      <p className="group-buy-star-config__strategy" aria-label={t('recommend.starProduct.strategySummaryAria')}>
        {roundRobin ? t('recommend.starProduct.roundRobinSummary') : t('recommend.starProduct.randomSummary')}
      </p>
    </AlgorithmSection>
  </>
}
