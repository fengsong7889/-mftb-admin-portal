import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button, Tag, message } from 'antd'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { IdcardOutlined } from '@ant-design/icons'
import DetailPageHeader from '../../../components/DetailPageHeader'
import { fetchModels, type AiModel } from '../../../api'
import { POSITION_SEQUENCE, POSITION_SEQUENCE_TAG_COLOR } from '../../../api/position'
import {
  usagePercent,
  usageColor,
  quotaText,
  usedText,
  QUOTA_PERIOD_LABEL,
  OVER_LIMIT_TAG,
  CURRENCY_SYMBOL,
  QUOTA_TYPE_UNIT,
} from './empQuotaStore'
import { LoadingSpinner, SectionCard, UsageOverviewSection, BasicInfoDetailSection, QuotaConfigDetailSection } from '../components'

const PERIOD_KEYS: Record<string, string> = { daily: 'periodDaily', monthly: 'periodMonthly' }
const TYPE_KEYS: Record<string, string> = { token: 'typeToken', cost: 'typeCost', request: 'typeRequest' }
const OVER_LIMIT_KEYS: Record<string, string> = { reject: 'overLimitRejectAct', approve: 'overLimitApproveAct', downgrade: 'overLimitDowngradeAct' }
import { fetchPosQuotaDetail, type PosQuotaVO } from '../../../api/empQuota'

/**
 * 員工額度 — 詳情獨立頁（參考部門額度詳情頁佈局）
 * 分區：用量概览 → 適用職位 → 額度配置 → 基础信息
 * 路由：/ai-emp-quota-detail?id=xxx
 */
export default function EmpQuotaDetail() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const quotaId = searchParams.get('id')

  const [loading, setLoading] = useState(true)
  const [policy, setPolicy] = useState<PosQuotaVO | null>(null)
  const [models, setModels] = useState<AiModel[]>([])

  useEffect(() => {
    if (!quotaId) {
      message.error(t('aiQuotaAuth.missingStrategyId'))
      navigate('/ai-emp-quota')
      return
    }
    let cancelled = false
    setLoading(true)
    fetchModels({ status: 1 })
      .then((modelList) => {
        if (cancelled) return
        setModels(modelList)
        return fetchPosQuotaDetail(Number(quotaId))
      })
      .then((found) => {
        if (cancelled) return
        setPolicy(found ?? null)
        if (!found) message.error(t('aiQuotaAuth.strategyNotFound'))
      })
      .catch(() => { if (!cancelled) message.error(t('aiQuotaAuth.loadDetailFailed')) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [quotaId, navigate])

  const handleBack = () => navigate('/ai-emp-quota')

  if (loading) {
    return <LoadingSpinner />
  }

  if (!policy) {
    return (
      <div className="content-area" style={{ textAlign: 'center', padding: 80 }}>
        <div style={{ fontSize: 16, color: '#8C8C8C' }}>{t('aiQuotaAuth.quotaPolicyLoadFailed')}</div>
        <Button style={{ marginTop: 16 }} onClick={handleBack}>{t('aiQuotaAuth.backToList')}</Button>
      </div>
    )
  }

  const pct = usagePercent(policy)
  const pctColor = usageColor(policy)
  const pctBg = pct >= 100 ? '#FFF1F0' : pct >= policy.softThreshold ? '#FFFBE6' : '#F6FFED'
  const statusText = pct >= 100 ? t('aiQuotaAuth.overQuota') : pct >= policy.softThreshold ? t('aiQuotaAuth.nearLimit') : t('aiQuotaAuth.usageNormal')
  const statusTagColor = pct >= 100 ? 'error' : pct >= policy.softThreshold ? 'warning' : 'success'
  const remaining = Math.max(0, policy.quotaValue - policy.usedValue)
  const valuePrefix = policy.quotaType === 'cost' ? CURRENCY_SYMBOL[policy.currency] : ''
  const unitLabel = policy.quotaType === 'cost' ? '' : QUOTA_TYPE_UNIT[policy.quotaType]
  const downgradeModelName = policy.downgradeModelId
    ? models.find((m) => m.id === policy.downgradeModelId)?.name
    : null

  return (
    <div className="content-area">
      {/* 頭部概覽卡 */}
      <DetailPageHeader
        title={t('aiQuotaAuth.empQuotaDetailTitle')}
        tags={
          <>
            <Tag color={policy.status === 1 ? 'success' : 'default'} style={{ margin: 0 }}>
              {policy.status === 1 ? t('aiQuotaAuth.enableText') : t('aiQuotaAuth.disableText')}
            </Tag>
            <Tag color={statusTagColor} style={{ margin: 0 }}>{statusText}</Tag>
          </>
        }
        meta={<>{policy.name} · {t('aiQuotaAuth.lastUpdateLabel')}：{policy.updatedBy ?? '-'} · {policy.updatedAt ?? '-'}</>}
        onBack={handleBack}
        onEdit={() => navigate(`/ai-emp-quota-edit?id=${policy.id}`)}
        menuKey="ai-emp-quota"
      />

      {/* ═══ 分区 1：用量概览 ═══ */}
      <UsageOverviewSection
        usedValue={policy.usedValue}
        quotaValue={policy.quotaValue}
        percent={pct}
        percentColor={pctColor}
        percentBg={pctBg}
        totalEmployeeCount={policy.totalEmployeeCount}
        valuePrefix={valuePrefix}
        unitLabel={unitLabel}
        softThreshold={policy.softThreshold}
        quotaText={quotaText(policy)}
        usedText={usedText(policy)}
        remaining={remaining}
        periodTag={t('aiQuotaAuth.quotaPeriodReset', { period: t('aiQuotaAuth.' + (PERIOD_KEYS[policy.period] || '')) })}
      />

      {/* ═══ 分区 2：适用职位 ═══ */}
      <SectionCard
        header={{
          icon: <IdcardOutlined style={{ fontSize: 14, color: '#1890ff' }} />,
          iconBg: '#e6f7ff',
          title: t('aiQuotaAuth.applicablePosTitle'),
          tag: t('aiQuotaAuth.seqLevelCount', { seqCount: policy.sequences.length, levelCount: policy.jobLevels.length }),
          tagColor: 'blue',
        }}
      >
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <div>
            <div style={{ fontSize: 12, color: '#8C8C8C', marginBottom: 8 }}>{t('aiQuotaAuth.seqLabel')}</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {policy.sequences.map((s) => (
                <Tag key={s} color={POSITION_SEQUENCE_TAG_COLOR[s]} style={{ fontSize: 13, padding: '4px 12px', lineHeight: '24px' }}>
                  {POSITION_SEQUENCE[s] ?? s}
                </Tag>
              ))}
              {policy.sequences.length === 0 && <span style={{ color: '#BFBFBF' }}>{t('aiQuotaAuth.notSetLabel')}</span>}
            </div>
          </div>
          <div>
            <div style={{ fontSize: 12, color: '#8C8C8C', marginBottom: 8 }}>{t('aiQuotaAuth.jobLevelLabel')}</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {policy.jobLevels.map((l) => (
                <Tag key={l} style={{ fontSize: 13, padding: '4px 12px', lineHeight: '24px' }}>{l}</Tag>
              ))}
              {policy.jobLevels.length === 0 && <span style={{ color: '#BFBFBF' }}>{t('aiQuotaAuth.notSetLabel')}</span>}
            </div>
          </div>
        </div>
        <div style={{ marginTop: 16, fontSize: 13, color: '#595959' }}>
          {t('aiQuotaAuth.totalCoverCount', { count: policy.totalEmployeeCount })}
          <span style={{ marginLeft: 8, color: '#8C8C8C' }}>{t('aiQuotaAuth.perCapitaQuotaNote', { quota: quotaText(policy) })}</span>
        </div>
      </SectionCard>

      {/* ═══ 分区 3：额度配置 ═══ */}
      <QuotaConfigDetailSection
        periodLabel={t('aiQuotaAuth.' + (PERIOD_KEYS[policy.period] || ''))}
        quotaTypeLabel={t('aiQuotaAuth.' + (TYPE_KEYS[policy.quotaType] || ''))}
        quotaValueText={quotaText(policy)}
        softThreshold={policy.softThreshold}
        overLimitTag={<Tag color={OVER_LIMIT_TAG[policy.overLimitAction]}>{t('aiQuotaAuth.' + (OVER_LIMIT_KEYS[policy.overLimitAction] || ''))}</Tag>}
        downgradeModelText={policy.overLimitAction === 'downgrade' ? (downgradeModelName ?? (policy.downgradeModelId ? t('aiQuotaAuth.modelIdRef', { id: policy.downgradeModelId }) : '-')) : undefined}
      />

      {/* ═══ 分区 4：基础信息 ═══ */}
      <BasicInfoDetailSection
        name={policy.name}
        description={policy.description}
        status={policy.status}
        updatedBy={policy.updatedBy}
        createdAt={policy.createdAt}
        updatedAt={policy.updatedAt}
      />
    </div>
  )
}
