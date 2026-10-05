import { useEffect, useMemo, useState } from 'react'
import { Button, Form, Input, Radio, Select, Tag, message } from 'antd'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  IdcardOutlined,
} from '@ant-design/icons'
import { fetchModels, type AiModel } from '../../../api'
import { POSITION_SEQUENCE_OPTIONS, POSITION_RANK_OPTIONS, POSITION_SEQUENCE, POSITION_SEQUENCE_TAG_COLOR } from '../../../api/position'
import { fetchEmployees, type EmployeeItem } from '../../../api/employee'
import {
  QUOTA_PERIOD_LABEL,
  type QuotaPeriod,
  type QuotaType,
  type OverLimitAction,
  type Currency,
} from './empQuotaStore'
import { fetchPosQuotaDetail, savePosQuota, type PosQuotaRequest } from '../../../api/empQuota'
import { EditPageHeader, SectionCard, StatusConfigSection, FormFooter, LoadingSpinner, BasicInfoFormSection, QuotaConfigSection, nowText, fmtQuota } from '../components'
import { useTranslation } from 'react-i18next'

/**
 * 員工額度 — 新增 / 編輯獨立頁（全局統一：取消彈窗，參考部門額度）
 * 分區：基础信息 → 適用職位（職級序列 + 職級） → 額度配置 → 狀態配置
 * 路由：/ai-emp-quota-edit（新增）、/ai-emp-quota-edit?id=xxx（編輯）
 */
export default function EmpQuotaEdit() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const quotaId = searchParams.get('id')
  const isEdit = !!quotaId

  const [form] = Form.useForm()
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)

  /* ── 基礎數據 ── */
  const [models, setModels] = useState<AiModel[]>([])
  const [employees, setEmployees] = useState<EmployeeItem[]>([])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    Promise.all([
      fetchModels({ status: 1 }).catch(() => [] as AiModel[]),
      fetchEmployees({ page: 1, size: 200 }).catch(() => ({ records: [] as EmployeeItem[] } as any)),
    ])
      .then(([modelList, empResult]) => {
        if (cancelled) return
        setModels(modelList)
        setEmployees(empResult.records || [])

        if (quotaId) {
          fetchPosQuotaDetail(Number(quotaId)).then((policy) => {
            if (!policy) {
              message.error(t('aiQuotaAuth.strategyNotFound'))
              navigate('/ai-emp-quota')
              return
            }
            form.setFieldsValue({
              name: policy.name,
              description: policy.description ?? '',
              sequences: policy.sequences,
              jobLevels: policy.jobLevels,
              period: policy.period,
              quotaType: policy.quotaType,
              quotaValue: policy.quotaValue,
              currency: policy.currency,
              softThreshold: policy.softThreshold,
              overLimitAction: policy.overLimitAction,
              downgradeModelId: policy.downgradeModelId ?? undefined,
              status: policy.status,
            })
          }).catch(() => { message.error(t('aiQuotaAuth.loadDetailFailed')); navigate('/ai-emp-quota') })
        }
      })
      .catch(() => { if (!cancelled) message.error(t('aiQuotaAuth.loadDataFailed')) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [quotaId, form, navigate])

  /* ── 表單聯動 ── */
  const period = Form.useWatch('period', form) as QuotaPeriod | undefined
  const quotaType = Form.useWatch('quotaType', form) as QuotaType | undefined
  const quotaValue = Form.useWatch('quotaValue', form) as number | undefined
  const currency = Form.useWatch('currency', form) as Currency | undefined
  const softThreshold = Form.useWatch('softThreshold', form) as number | undefined
  const overLimitAction = Form.useWatch('overLimitAction', form) as OverLimitAction | undefined
  const sequences = Form.useWatch('sequences', form) as string[] | undefined
  const jobLevels = Form.useWatch('jobLevels', form) as string[] | undefined

  /** 匹配員工數（按序列 + 職級） */
  const matchedEmployeeCount = useMemo(() => {
    if (!sequences?.length || !jobLevels?.length) return 0
    return employees.filter(
      (e) => e.sequence && sequences.includes(e.sequence) && e.jobLevel && jobLevels.includes(e.jobLevel),
    ).length
  }, [employees, sequences, jobLevels])

  /* ── 保存 ── */
  const handleSave = async () => {
    const values = await form.validateFields()

    if (!values.sequences?.length || !values.jobLevels?.length) {
      message.warning(t('aiQuotaAuth.selectSeqLevelWarning'))
      return
    }
    if (values.overLimitAction === 'downgrade' && !values.downgradeModelId) {
      message.warning(t('aiQuotaAuth.downgradeWarning'))
      return
    }

    const now = nowText()
    const base = {
      name: String(values.name).trim(),
      description: (values.description ?? '') as string,
      sequences: values.sequences as string[],
      jobLevels: values.jobLevels as string[],
      totalEmployeeCount: matchedEmployeeCount,
      period: values.period as QuotaPeriod,
      quotaType: values.quotaType as QuotaType,
      quotaValue: Number(values.quotaValue),
      currency: (values.currency ?? 'CNY') as Currency,
      softThreshold: (values.softThreshold ?? 80) as number,
      overLimitAction: values.overLimitAction as OverLimitAction,
      downgradeModelId: values.overLimitAction === 'downgrade' ? (values.downgradeModelId ?? null) : null,
      status: (values.status ?? 1) as number,
      updatedBy: 'admin',
      updatedAt: now,
    }

    setSaving(true)
    try {
      const payload: PosQuotaRequest = {
        ...(isEdit && quotaId ? { id: Number(quotaId) } : {}),
        name: String(values.name).trim(),
        description: (values.description ?? '') as string,
        sequences: values.sequences as string[],
        jobLevels: values.jobLevels as string[],
        totalEmployeeCount: matchedEmployeeCount,
        period: values.period as string,
        quotaType: values.quotaType as string,
        quotaValue: Number(values.quotaValue),
        currency: (values.currency ?? 'CNY') as string,
        softThreshold: (values.softThreshold ?? 80) as number,
        overLimitAction: values.overLimitAction as string,
        downgradeModelId: values.overLimitAction === 'downgrade' ? (values.downgradeModelId ?? null) : null,
        status: (values.status ?? 1) as number,
      }
      await savePosQuota(payload)
      message.success(isEdit ? t('aiQuotaAuth.quotaUpdated') : t('aiQuotaAuth.quotaCreated'))
      navigate('/ai-emp-quota')
    } finally {
      setSaving(false)
    }
  }

  const handleBack = () => navigate('/ai-emp-quota')

  if (loading && !models.length && !isEdit) {
    return <LoadingSpinner />
  }

  /* ── 實時額度解讀 ── */
  const seqLabel = (sequences ?? []).map((s) => POSITION_SEQUENCE[s] ?? s).join('、') || t('aiQuotaAuth.noSeqSelected')
  const lvlLabel = (jobLevels ?? []).join('、') || t('aiQuotaAuth.noLevelSelected')
  const quotaReadable = quotaValue && quotaType && period
    ? t('aiQuotaAuth.quotaPerCapita', { quota: fmtQuota(quotaValue, quotaType, currency ?? 'CNY'), period: QUOTA_PERIOD_LABEL[period], count: matchedEmployeeCount, total: fmtQuota(quotaValue * matchedEmployeeCount, quotaType, currency ?? 'CNY') })
    : t('aiQuotaAuth.quotaIncomplete')

  return (
    <div className="content-area">
      {/* 頁面頭部 */}
      <EditPageHeader
        title={t(isEdit ? 'aiQuotaAuth.editModelQuotaPos' : 'aiQuotaAuth.addModelQuotaPos')}
        onBack={handleBack}
      />

      <Form
        form={form}
        layout="vertical"
        initialValues={{
          period: 'monthly', quotaType: 'token',
          currency: 'CNY', softThreshold: 80, overLimitAction: 'reject', status: 1,
          sequences: [], jobLevels: [],
        }}
      >
        {/* ═══ 分区 1：基础信息 ═══ */}
        <BasicInfoFormSection namePlaceholder={t('aiQuotaAuth.strategyNamePh4')} descPlaceholder={t('aiQuotaAuth.descPhEdit')} />

        {/* ═══ 分区 2：适用职位 ═══ */}
        <SectionCard
          header={{
            icon: <IdcardOutlined style={{ fontSize: 14, color: '#1890ff' }} />,
            iconBg: '#e6f7ff',
            title: t('aiQuotaAuth.applicablePositionSection'),
            tag: t('aiQuotaAuth.posSeqLevelTag'),
            tagColor: 'blue',
            note: t('aiQuotaAuth.matchEmpNote'),
          }}
        >
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
            <Form.Item name="sequences" label={t('aiQuotaAuth.posSeqLabel')} rules={[{ required: true, message: t('aiQuotaAuth.posSeqRequired'), type: 'array', min: 1 }]}>
              <Select placeholder={t('aiQuotaAuth.posSeqPh')} options={POSITION_SEQUENCE_OPTIONS} mode="multiple" allowClear maxTagCount="responsive" />
            </Form.Item>
            <Form.Item name="jobLevels" label={t('aiQuotaAuth.posLevelLabel')} rules={[{ required: true, message: t('aiQuotaAuth.posLevelRequired'), type: 'array', min: 1 }]}>
              <Select placeholder={t('aiQuotaAuth.posLevelPh')} options={POSITION_RANK_OPTIONS} mode="multiple" allowClear maxTagCount="responsive" />
            </Form.Item>
          </div>

          {/* 匹配員工預覽 */}
          <div style={{
            marginTop: 4, padding: '12px 16px', borderRadius: 8,
            background: '#F6FFED', border: '1px solid #D9F7BE',
            display: 'flex', alignItems: 'center', gap: 12,
          }}>
            <span style={{ fontSize: 13, color: '#595959' }}>
              {t('aiQuotaAuth.matchCondition')}
              {(sequences ?? []).map((s) => (
                <Tag key={s} color={POSITION_SEQUENCE_TAG_COLOR[s]} style={{ marginRight: 4 }}>{POSITION_SEQUENCE[s] ?? s}</Tag>
              ))}
              {(jobLevels ?? []).map((l) => (
                <Tag key={l} style={{ marginRight: 4 }}>{l}</Tag>
              ))}
            </span>
            <span style={{ fontSize: 13, fontWeight: 600, color: matchedEmployeeCount > 0 ? '#52C41A' : '#8C8C8C' }}>
              {t('aiQuotaAuth.matchEmpCount', { count: matchedEmployeeCount })}
            </span>
          </div>
        </SectionCard>

        {/* ═══ 分区 3：额度配置 ═══ */}
        <QuotaConfigSection
          interpretPrefix={
            <>
              <div>· {t('aiQuotaAuth.applySeqLabel')}：<strong style={{ color: '#262626' }}>{seqLabel}</strong></div>
              <div>· {t('aiQuotaAuth.applyLevelLabel')}：<strong style={{ color: '#262626' }}>{lvlLabel}</strong>（{matchedEmployeeCount} 人）</div>
              <div>· {t('aiQuotaAuth.quotaLimitLabel')}：{quotaReadable}</div>
            </>
          }
          models={models}
          periodExtraKey="aiQuotaAuth.periodExtra2"
          downgradeModelExtraKey="aiQuotaAuth.downgradeModelExtra2"
          quotaType={quotaType}
          currency={currency}
          overLimitAction={overLimitAction}
          softThreshold={softThreshold}
        />

        {/* ═══ 分区 4：状态配置 ═══ */}
        <StatusConfigSection extra={t('aiQuotaAuth.statusExtraPos')} />
      </Form>

      {/* 底部操作按鈕 */}
      <FormFooter onCancel={handleBack} onSave={handleSave} saving={saving} />
    </div>
  )
}
