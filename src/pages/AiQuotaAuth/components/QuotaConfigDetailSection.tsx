/**
 * QuotaConfigDetailSection — 額度配置詳情分區（Detail 頁共享）
 *
 * 展示：限額周期 / 限額類型 / 限額值 / 軟提醒閾值 / 超額動作 / 降級模型
 * 可選展示：分配方式（僅部門額度有）
 * 用於 DeptQuotaDetail、EmpQuotaDetail。
 */
import type { ReactNode } from 'react'
import { Tag, Tooltip } from 'antd'
import { FundOutlined, QuestionCircleOutlined } from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
import SectionCard from './SectionCard'

interface QuotaConfigDetailSectionProps {
  /** 分配方式 Tag（僅部門額度有，不傳則不展示） */
  allocateModeTag?: ReactNode
  /** 限額周期文案 */
  periodLabel: string
  /** 限額類型文案 */
  quotaTypeLabel: string
  /** 限額值文案 */
  quotaValueText: string
  /** 軟提醒閾值 */
  softThreshold: number
  /** 超額動作 Tag */
  overLimitTag: ReactNode
  /** 降級目標模型文案（僅超額動作=降級時展示） */
  downgradeModelText?: ReactNode
}

export default function QuotaConfigDetailSection(props: QuotaConfigDetailSectionProps) {
  const { t } = useTranslation()
  const {
    allocateModeTag, periodLabel, quotaTypeLabel, quotaValueText,
    softThreshold, overLimitTag, downgradeModelText,
  } = props

  return (
    <SectionCard
      header={{
        icon: <FundOutlined style={{ fontSize: 14, color: '#E8720C' }} />,
        iconBg: '#fff7e6',
        title: t('aiQuotaAuth.quotaConfigTitle'),
      }}
    >
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '20px 16px' }}>
        {allocateModeTag && (
          <div>
            <div style={{ fontSize: 12, color: '#8C8C8C', marginBottom: 6 }}>{t('aiQuotaAuth.allocateMethod')}</div>
            {allocateModeTag}
          </div>
        )}
        <div>
          <div style={{ fontSize: 12, color: '#8C8C8C', marginBottom: 6 }}>{t('aiQuotaAuth.quotaCycle')}</div>
          <div style={{ fontSize: 14, color: '#262626', fontWeight: 500 }}>{periodLabel}</div>
        </div>
        <div>
          <div style={{ fontSize: 12, color: '#8C8C8C', marginBottom: 6 }}>{t('aiQuotaAuth.quotaTypeValue')}</div>
          <div style={{ fontSize: 14, color: '#262626', fontWeight: 500 }}>{quotaTypeLabel}</div>
        </div>
        <div>
          <div style={{ fontSize: 12, color: '#8C8C8C', marginBottom: 6 }}>{t('aiQuotaAuth.quotaLimitValue')}</div>
          <div style={{ fontSize: 14, color: '#E8720C', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{quotaValueText}</div>
        </div>
        <div>
          <div style={{ fontSize: 12, color: '#8C8C8C', marginBottom: 6 }}>{t('aiQuotaAuth.softThresholdTip')}</div>
          <div style={{ fontSize: 14, color: '#FAAD14', fontWeight: 600 }}>{softThreshold}%</div>
        </div>
        <div>
          <div style={{ fontSize: 12, color: '#8C8C8C', marginBottom: 6 }}>{t('aiQuotaAuth.overLimitActionTip')} <Tooltip title={t('aiQuotaAuth.gatewayTooltip')}><QuestionCircleOutlined style={{ fontSize: 12, color: '#BFBFBF', cursor: 'help' }} /></Tooltip></div>
          {overLimitTag}
          <div style={{ fontSize: 11, color: '#BFBFBF', marginTop: 4 }}>{t('aiQuotaAuth.gatewayNote')}</div>
        </div>
        {downgradeModelText && (
          <div>
            <div style={{ fontSize: 12, color: '#8C8C8C', marginBottom: 6 }}>{t('aiQuotaAuth.downgradeTargetModelLabel')}</div>
            <div style={{ fontSize: 14, color: '#262626', fontWeight: 500 }}>{downgradeModelText}</div>
          </div>
        )}
      </div>
    </SectionCard>
  )
}
