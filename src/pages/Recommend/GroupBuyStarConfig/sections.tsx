/**
 * Copyright (c) 2026 fengsong7889. All Rights Reserved.
 *
 * 本文件为「MFTB 企业一体化管理平台软件」的组成部分。
 * 未经著作权人书面许可，不得使用、复制、修改、再分发或用于任何商业目的。
 * 完整许可条款见仓库根目录 LICENSE 文件。
 */
import type { ReactNode } from 'react'
import { Form, InputNumber, Select, Tag } from 'antd'
import {
  ThunderboltOutlined, ClockCircleOutlined, FilterOutlined,
  StopOutlined, InboxOutlined, FieldTimeOutlined, BlockOutlined,
} from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
import { ProductExposureStrategy, PRODUCT_STAR_INTERVAL, type ProductStarPreviewValues } from './preview'
import { ELIGIBILITY_FILTER_RULES, type EligibilityFilterRule } from './eligibilityRules'
import HelpPopover from '@/components/HelpPopover'
import AlgorithmSection from '../AlgorithmForm/AlgorithmSection'

/** 过滤条件图标与语义色：下架＝危险红、售罄＝警告橙、销售时间＝信息蓝、瀑布流范围＝高级紫。 */
const RULE_ICON: Record<EligibilityFilterRule['key'], ReactNode> = {
  delisted: <StopOutlined />,
  soldOut: <InboxOutlined />,
  saleWindow: <FieldTimeOutlined />,
  waterfallScope: <BlockOutlined />,
}
const RULE_TONE: Record<EligibilityFilterRule['key'], 'danger' | 'warning' | 'info' | 'purple'> = {
  delisted: 'danger',
  soldOut: 'warning',
  saleWindow: 'info',
  waterfallScope: 'purple',
}

/** 展示资格由团购业务系统裁决；本页只配置检查间隔与有限坑位分配策略。
 * 过滤条件以紧凑清单只读展示；规则下发后按 eligibilityRules 注册表原位对接，不改页面结构。 */
export default function ProductStarSections({ readOnly, values }: { readOnly: boolean; values: ProductStarPreviewValues }) {
  const { t } = useTranslation()
  const roundRobin = values.exposureStrategy === ProductExposureStrategy.ROUND_ROBIN
  return <>
    <AlgorithmSection title={t('recommend.starProduct.filterTitle')} icon={<FilterOutlined />} tone="info" readOnly={readOnly}
      extra={<>
        <Tag color="blue">{t('recommend.starProduct.filterTag')}</Tag>
        <HelpPopover title={t('recommend.starProduct.filterHelpTitle')} ariaLabel={t('recommend.starProduct.filterHelpTitle')} content={[
          { tone: 'info', label: t('recommend.starProduct.filterHelpCurrentLabel'), body: t('recommend.starProduct.filterHelpCurrentBody') },
          { tone: 'neutral', label: t('recommend.starProduct.filterHelpNextLabel'), body: t('recommend.starProduct.filterHelpNextBody') },
        ]} />
      </>}>
      <div className="group-buy-star-config__rule-list">
        {ELIGIBILITY_FILTER_RULES.map(rule => (
          <div key={rule.key} className="group-buy-star-config__rule">
            <span className={`group-buy-star-config__rule-icon group-buy-star-config__rule-icon--${RULE_TONE[rule.key]}`}>{RULE_ICON[rule.key]}</span>
            <span className="group-buy-star-config__rule-name">{t(rule.labelKey)}</span>
            <span className="group-buy-star-config__rule-effect">{t(rule.effectKey)}</span>
          </div>
        ))}
      </div>
      <p className="group-buy-star-config__hint">{t('recommend.starProduct.filterNote')}</p>
    </AlgorithmSection>

    <AlgorithmSection title={t('recommend.starProduct.checkTitle')} icon={<ClockCircleOutlined />} tone="info" readOnly={readOnly}
      extra={<HelpPopover title={t('recommend.starProduct.eligibilityHelpTitle')} ariaLabel={t('recommend.starProduct.eligibilityHelpTitle')}
        content={t('recommend.starProduct.eligibilityHelp')} />}>
      <div className="group-buy-star-config__check-scope">
        <div className="group-buy-star-config__scope-item">
          <span className="group-buy-star-config__scope-label">{t('recommend.starProduct.scopeTarget')}</span>
          <span className="group-buy-star-config__scope-value">{t('recommend.starProduct.scopeTargetValue')}</span>
        </div>
        <div className="group-buy-star-config__scope-item">
          <span className="group-buy-star-config__scope-label">{t('recommend.starProduct.scopeAction')}</span>
          <span className="group-buy-star-config__scope-value">{t('recommend.starProduct.scopeActionValue')}</span>
        </div>
      </div>
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
