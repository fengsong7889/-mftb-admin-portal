import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button, Tag, message } from 'antd'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { TeamOutlined } from '@ant-design/icons'
import DetailPageHeader from '../../../components/DetailPageHeader'
import { fetchModels, fetchDeptOptions, type AiModel, type DeptOption } from '../../../api'
import { fetchDeptQuotaDetail, type DeptQuotaVO } from '../../../api/deptQuota'
import {
  usagePercent,
  usageColor,
  quotaText,
  usedText,
  QUOTA_PERIOD_LABEL,
  OVER_LIMIT_TAG,
  CURRENCY_SYMBOL,
  QUOTA_TYPE_UNIT,
} from './deptQuotaStore'
import { LoadingSpinner, SectionCard, UsageOverviewSection, BasicInfoDetailSection, QuotaConfigDetailSection } from '../components'

const PERIOD_KEYS: Record<string, string> = { daily: 'periodDaily', monthly: 'periodMonthly' }
const TYPE_KEYS: Record<string, string> = { token: 'typeToken', cost: 'typeCost', request: 'typeRequest' }
const ALLOC_KEYS: Record<string, string> = { total: 'allocTotal', per_capita: 'allocPerCapita' }
const OVER_LIMIT_KEYS: Record<string, string> = { reject: 'overLimitRejectAct', approve: 'overLimitApproveAct', downgrade: 'overLimitDowngradeAct' }

/**
 * 部門額度 — 詳情獨立頁（參考部門模型權控詳情頁佈局）
 * 分區：用量概览（動畫統計卡 + 用量進度） → 適用部門 → 額度配置 → 基础信息
 * 路由：/ai-dept-quota-detail?id=xxx
 */
export default function DeptQuotaDetail() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const quotaId = searchParams.get('id')

  const [loading, setLoading] = useState(true)
  const [policy, setPolicy] = useState<DeptQuotaVO | null>(null)
  const [models, setModels] = useState<AiModel[]>([])
  const [deptOptions, setDeptOptions] = useState<DeptOption[]>([])

  useEffect(() => {
    if (!quotaId) {
      message.error(t('aiQuotaAuth.missingStrategyId'))
      navigate('/ai-dept-quota')
      return
    }
    let cancelled = false
    setLoading(true)
    Promise.all([
      fetchDeptQuotaDetail(Number(quotaId)).catch(() => null),
      fetchDeptOptions().catch(() => [] as DeptOption[]),
      fetchModels({ status: 1 }).catch(() => [] as AiModel[]),
    ])
      .then(([found, depts, modelList]) => {
        if (cancelled) return
        setDeptOptions(depts)
        setModels(modelList)
        setPolicy(found)
        if (!found) message.error(t('aiQuotaAuth.strategyNotFound'))
      })
      .catch(() => { if (!cancelled) message.error(t('aiQuotaAuth.loadDetailFailed')) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [quotaId, navigate])

  const handleBack = () => navigate('/ai-dept-quota')

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
      {/* 頭部概覽卡（全局統一規範：詳情頁紫色頂條 + 橙色返回 + 權限門控紫色編輯） */}
      <DetailPageHeader
        title={t('aiQuotaAuth.deptQuotaDetailTitle')}
        tags={
          <>
            <Tag color={policy.status === 1 ? 'success' : 'default'} style={{ margin: 0 }}>
              {policy.status === 1 ? t('aiQuotaAuth.enableText') : t('aiQuotaAuth.disableText')}
            </Tag>
            <Tag color={policy.allocateMode === 'per_capita' ? 'blue' : 'default'} style={{ margin: 0 }}>
              {t('aiQuotaAuth.' + (ALLOC_KEYS[policy.allocateMode] || ''))}
            </Tag>
            <Tag color={statusTagColor} style={{ margin: 0 }}>{statusText}</Tag>
          </>
        }
        meta={<>{policy.name} · {t('aiQuotaAuth.lastUpdateLabel')}：{policy.updatedBy ?? '-'} · {policy.updatedAt ?? '-'}</>}
        onBack={handleBack}
        onEdit={() => navigate(`/ai-dept-quota-edit?id=${policy.id}`)}
        menuKey="ai-dept-quota"
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

      {/* ═══ 分区 2：适用部门 ═══ */}
      <SectionCard
        header={{
          icon: <TeamOutlined style={{ fontSize: 14, color: '#1890ff' }} />,
          iconBg: '#e6f7ff',
          title: t('aiQuotaAuth.applicableDeptTitle'),
          tag: t('aiQuotaAuth.deptCountLabel', { count: policy.deptNames.length }),
          tagColor: 'blue',
        }}
      >
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {policy.deptNames.map((name) => {
            const d = deptOptions.find((x) => x.deptName === name)
            return (
              <Tag key={name} style={{ fontSize: 13, padding: '4px 12px', lineHeight: '24px' }}>
                {name}{d ? t('aiQuotaAuth.deptEmpCount', { count: d.employeeCount }) : ''}
              </Tag>
            )
          })}
          {policy.deptNames.length === 0 && <span style={{ color: '#BFBFBF' }}>{t('aiQuotaAuth.noRelatedDept')}</span>}
        </div>
        <div style={{ marginTop: 12, fontSize: 13, color: '#595959' }}>
          {t('aiQuotaAuth.totalCoverCount', { count: policy.totalEmployeeCount })}
          {policy.allocateMode === 'per_capita' && (
            <span style={{ marginLeft: 8, color: '#8C8C8C' }}>{t('aiQuotaAuth.perCapitaQuotaNote', { quota: quotaText(policy) })}</span>
          )}
        </div>
        </SectionCard>

      {/* ═══ 分区 3：额度配置 ═══ */}
      <QuotaConfigDetailSection
        allocateModeTag={<Tag color={policy.allocateMode === 'per_capita' ? 'blue' : 'default'}>{t('aiQuotaAuth.' + (ALLOC_KEYS[policy.allocateMode] || ''))}</Tag>}
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
