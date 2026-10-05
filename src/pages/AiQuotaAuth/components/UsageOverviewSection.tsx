/**
 * UsageOverviewSection — 用量概覽分區（Detail 頁共享）
 *
 * 包含：4 張統計卡（已用量 / 限額 / 使用率 / 覆蓋人數）+ 用量進度條
 * 用於 DeptQuotaDetail、EmpQuotaDetail。
 */
import type { ReactNode } from 'react'
import { Tag, Progress } from 'antd'
import { BarChartOutlined } from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
import AnimatedNumber from '../../../components/AnimatedNumber'
import SectionCard from './SectionCard'

interface UsageOverviewSectionProps {
  /** 已用量 */
  usedValue: number
  /** 限額值 */
  quotaValue: number
  /** 使用率百分比 */
  percent: number
  /** 進度條顏色 */
  percentColor: string
  /** 使用率卡片背景色 */
  percentBg: string
  /** 覆蓋人數 */
  totalEmployeeCount: number
  /** 數值前綴（如 ¥ / $） */
  valuePrefix: string
  /** 單位標籤（如 tokens / 次） */
  unitLabel: string
  /** 軟提醒閾值 */
  softThreshold: number
  /** 限額文案 */
  quotaText: string
  /** 已用量文案 */
  usedText: string
  /** 剩餘量 */
  remaining: number
  /** 周期 Tag 文案 */
  periodTag: ReactNode
}

export default function UsageOverviewSection(props: UsageOverviewSectionProps) {
  const { t } = useTranslation()
  const {
    usedValue, quotaValue, percent, percentColor, percentBg,
    totalEmployeeCount, valuePrefix, unitLabel,
    softThreshold, quotaText, usedText, remaining, periodTag,
  } = props

  return (
    <SectionCard
      header={{
        icon: <BarChartOutlined style={{ fontSize: 14, color: '#52C41A' }} />,
        iconBg: '#f6ffed',
        title: t('aiQuotaAuth.usageOverview'),
        tag: periodTag,
        tagColor: 'green',
      }}
    >
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
        <div style={{ padding: 16, borderRadius: 12, textAlign: 'center', background: '#E6F7FF', border: '1px solid #1890FF22', transition: 'all 0.35s cubic-bezier(0.4, 0, 0.2, 1)', cursor: 'default' }}>
          <div style={{ fontSize: 22, fontWeight: 700, color: '#1890FF' }}>
            <AnimatedNumber value={usedValue} prefix={valuePrefix} />
          </div>
          <div style={{ fontSize: 12, color: '#8C8C8C', marginTop: 4 }}>{t('aiQuotaAuth.currentPeriodUsed')}{unitLabel ? t('aiQuotaAuth.quotaLimitUnit', { unit: unitLabel }) : ''}</div>
        </div>
        <div style={{ padding: 16, borderRadius: 12, textAlign: 'center', background: '#F9F0FF', border: '1px solid #722ED122', transition: 'all 0.35s cubic-bezier(0.4, 0, 0.2, 1)', cursor: 'default' }}>
          <div style={{ fontSize: 22, fontWeight: 700, color: '#722ED1' }}>
            <AnimatedNumber value={quotaValue} prefix={valuePrefix} />
          </div>
          <div style={{ fontSize: 12, color: '#8C8C8C', marginTop: 4 }}>{t('aiQuotaAuth.quotaLimitTotal')}{unitLabel ? t('aiQuotaAuth.quotaLimitUnit', { unit: unitLabel }) : ''}</div>
        </div>
        <div style={{ padding: 16, borderRadius: 12, textAlign: 'center', background: percentBg, border: `1px solid ${percentColor}22`, transition: 'all 0.35s cubic-bezier(0.4, 0, 0.2, 1)', cursor: 'default' }}>
          <div style={{ fontSize: 22, fontWeight: 700, color: percentColor }}>
            <AnimatedNumber value={percent} suffix="%" />
          </div>
          <div style={{ fontSize: 12, color: '#8C8C8C', marginTop: 4 }}>{t('aiQuotaAuth.currentUsageRate')}</div>
        </div>
        <div style={{ padding: 16, borderRadius: 12, textAlign: 'center', background: '#F6FFED', border: '1px solid #52C41A22', transition: 'all 0.35s cubic-bezier(0.4, 0, 0.2, 1)', cursor: 'default' }}>
          <div style={{ fontSize: 22, fontWeight: 700, color: '#52C41A' }}>
            <AnimatedNumber value={totalEmployeeCount} suffix={t('aiQuotaAuth.animatedPersonSuffix')} />
          </div>
          <div style={{ fontSize: 12, color: '#8C8C8C', marginTop: 4 }}>{t('aiQuotaAuth.coverEmpCount')}</div>
        </div>
      </div>

      {/* 用量進度條 */}
      <div style={{ marginTop: 20, padding: '18px 20px', borderRadius: 12, background: '#FAFAFA', border: '1px solid #F0F0F0' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <span style={{ fontSize: 14, fontWeight: 600, color: '#262626' }}>{t('aiQuotaAuth.currentUsageProgress')}</span>
          <span style={{ fontSize: 13, fontWeight: 600, color: percentColor }}>{percent}%</span>
        </div>
        <Progress percent={Math.min(percent, 100)} strokeColor={percentColor} showInfo={false} size={['100%', 14]} style={{ marginBottom: 12 }} />
        <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, fontSize: 13 }}>
          <span style={{ color: '#595959' }}>
            {t('aiQuotaAuth.usedLabel')} <strong style={{ color: percentColor }}>{usedText}</strong> · {t('aiQuotaAuth.quotaLimitLabel2')} {quotaText}
          </span>
          <span style={{ color: '#8C8C8C' }}>
            {t('aiQuotaAuth.softAlertLabel')} {softThreshold}% · {t('aiQuotaAuth.remainingLabel')} <strong style={{ color: remaining > 0 ? '#52C41A' : '#FF4D4F' }}>{valuePrefix}{remaining.toLocaleString()}{unitLabel ? ` ${unitLabel}` : ''}</strong>
          </span>
        </div>
      </div>
    </SectionCard>
  )
}
