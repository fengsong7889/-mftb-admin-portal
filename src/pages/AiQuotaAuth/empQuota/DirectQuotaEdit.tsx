/**
 * 員工專屬額度 — 新增 / 編輯獨立頁
 *
 * 對應後端 `POST /api/ai/quota/employees`（按 quotaType+targetId+modelId upsert）。
 * 與「按職位/角色額度」（ai_emp_quota_policy）不同：這裡是給具體某個人定向配額度，
 * 字段只有日/月 token 上限，模型留空表示該員工所有模型共享這一份額度。
 *
 * 路由：/ai-emp-direct-quota-edit?type=add（新增）、?id=xxx（編輯）
 */
import { useEffect, useState } from 'react'
import { Form, Input, InputNumber, Select, Switch, message } from 'antd'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ThunderboltOutlined, SettingOutlined, UserOutlined } from '@ant-design/icons'
import { fetchModels, type AiModel } from '../../../api'
import EmployeeSelect from '../../MeetingManagement/EmployeeSelect'
import { fetchEmpQuotas, saveEmpQuotas, type QuotaConfigRequest } from '../../../api/quotaConfig'
import { EditPageHeader, SectionCard, FormFooter, LoadingSpinner } from '../components'

export default function DirectQuotaEdit() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const quotaId = searchParams.get('id')
  const isEdit = !!quotaId

  const [form] = Form.useForm()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [models, setModels] = useState<AiModel[]>([])
  /** 编辑态的目标员工（不可改）：后端列表返回「工号 姓名」，直接展示 */
  const [editingEmployeeId, setEditingEmployeeId] = useState<number | null>(null)
  const [editingEmployeeLabel, setEditingEmployeeLabel] = useState('')

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    Promise.all([
      fetchModels({ status: 1 }).catch(() => [] as AiModel[]),
      isEdit ? fetchEmpQuotas().catch(() => []) : Promise.resolve([]),
    ])
      .then(([modelList, quotas]) => {
        if (cancelled) return
        setModels(modelList)
        if (isEdit) {
          const row = quotas.find((q) => q.id === Number(quotaId))
          if (!row) {
            message.error(t('aiQuotaAuth.directQuotaNoRecord'))
            navigate('/ai-emp-quota', { state: { tab: 'direct' } })
            return
          }
          form.setFieldsValue({
            employeeIds: [row.targetId],
            // 后端 QuotaVO 用 getLong(model_id) 读列，NULL 会被序列化成 0；
            // 这里必须把 0 一并视为「全部模型共享」，否则回填出一个不存在的模型 id
            modelIds: row.modelId ? [row.modelId] : [],
            dailyQuota: row.dailyQuota,
            monthlyQuota: row.monthlyQuota,
            autoReset: row.autoReset === 1,
            resetDayOfMonth: row.resetDayOfMonth,
          })
          setEditingEmployeeId(row.targetId)
          setEditingEmployeeLabel(row.targetName ?? `#${row.targetId}`)
        }
      })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [isEdit, quotaId, form, navigate, t])

  const handleSave = async () => {
    // 编辑态的目标员工不在表单里（只读展示），不参与校验
    const values = isEdit
      ? await form.validateFields(['modelIds', 'dailyQuota', 'monthlyQuota', 'autoReset', 'resetDayOfMonth'])
      : await form.validateFields()
    const employeeId = isEdit
      ? editingEmployeeId
      : (values.employeeIds as number[] | undefined)?.[0]
    if (!employeeId) {
      message.warning(t('aiQuotaAuth.selectEmployeeRequired'))
      return
    }
    const dailyQuota = Number(values.dailyQuota ?? 0)
    const monthlyQuota = Number(values.monthlyQuota ?? 0)
    if (dailyQuota <= 0 && monthlyQuota <= 0) {
      // 0/0 会被后端判为「无限制」，与「默认拒绝」闸门冲突（额度已授予但立即用尽）
      message.warning(t('aiQuotaAuth.quotaAtLeastOne'))
      return
    }

    const modelIds = (values.modelIds as number[] | undefined) ?? []
    const base: Omit<QuotaConfigRequest, 'modelId'> = {
      quotaType: 'employee',
      targetId: employeeId,
      dailyQuota,
      monthlyQuota,
      autoReset: values.autoReset ? 1 : 0,
      resetDayOfMonth: Number(values.resetDayOfMonth ?? 1),
    }
    // 勾选了具体模型 → 每个模型一条记录；未勾选 → 一条 modelId=null 的共享额度
    const quotas: QuotaConfigRequest[] = modelIds.length
      ? modelIds.map((modelId) => ({ ...base, modelId }))
      : [{ ...base, modelId: null }]

    setSaving(true)
    try {
      await saveEmpQuotas(quotas)
      message.success(t('aiQuotaAuth.directQuotaSaved'))
      navigate('/ai-emp-quota', { state: { tab: 'direct' } })
    } catch {
      message.error(t('aiQuotaAuth.directQuotaSaveFailed'))
    } finally {
      setSaving(false)
    }
  }

  const handleBack = () => navigate('/ai-emp-quota', { state: { tab: 'direct' } })

  if (loading) return <LoadingSpinner />

  return (
    <div className="content-area">
      <EditPageHeader
        title={t(isEdit ? 'aiQuotaAuth.directQuotaEdit' : 'aiQuotaAuth.directQuotaAdd')}
        onBack={handleBack}
      />

      <Form
        form={form}
        layout="vertical"
        initialValues={{ employeeIds: [], modelIds: [], dailyQuota: 0, monthlyQuota: 0, autoReset: true, resetDayOfMonth: 1 }}
      >
        {/* ═══ 分区 1：適用對象 ═══ */}
        <SectionCard
          header={{
            icon: <UserOutlined style={{ fontSize: 14, color: '#1890ff' }} />,
            iconBg: '#e6f7ff',
            title: t('aiQuotaAuth.directQuotaTargetSection'),
            note: t('aiQuotaAuth.directQuotaTargetNote'),
          }}
        >
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
            {isEdit ? (
              <Form.Item label={t('aiQuotaAuth.employeeCol')} extra={t('aiQuotaAuth.directQuotaTargetLocked')}>
                <Input disabled value={editingEmployeeLabel} />
              </Form.Item>
            ) : (
              <Form.Item
                name="employeeIds"
                label={t('aiQuotaAuth.employeeCol')}
                rules={[{ required: true, type: 'array', min: 1, message: t('aiQuotaAuth.selectEmployeeRequired') }]}
              >
                <EmployeeSelect single placeholder={t('aiQuotaAuth.selectEmployeePh')} />
              </Form.Item>
            )}
            <Form.Item name="modelIds" label={t('aiQuotaAuth.authModelCol')} extra={t('aiQuotaAuth.allModelsSharedHint')}>
              <Select
                mode="multiple"
                allowClear
                disabled={isEdit}
                placeholder={t('aiQuotaAuth.allModelsShared')}
                optionFilterProp="label"
                options={models.map((m) => ({ value: m.id, label: m.name }))}
              />
            </Form.Item>
          </div>
        </SectionCard>

        {/* ═══ 分区 2：額度配置 ═══ */}
        <SectionCard
          header={{
            icon: <ThunderboltOutlined style={{ fontSize: 14, color: '#fa8c16' }} />,
            iconBg: '#fff7e6',
            title: t('aiQuotaAuth.directQuotaLimitSection'),
            note: t('aiQuotaAuth.directQuotaLimitNote'),
          }}
        >
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
            <Form.Item name="dailyQuota" label={t('aiQuotaAuth.dailyQuotaLabel')} extra={t('aiQuotaAuth.zeroMeansUnlimited')}>
              <InputNumber<number>
                min={0}
                precision={0}
                style={{ width: '100%' }}
                formatter={(v) => `${v ?? ''}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
                parser={(v) => Number((v ?? '').replace(/,/g, ''))}
              />
            </Form.Item>
            <Form.Item name="monthlyQuota" label={t('aiQuotaAuth.monthlyQuotaLabel')} extra={t('aiQuotaAuth.zeroMeansUnlimited')}>
              <InputNumber<number>
                min={0}
                precision={0}
                style={{ width: '100%' }}
                formatter={(v) => `${v ?? ''}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
                parser={(v) => Number((v ?? '').replace(/,/g, ''))}
              />
            </Form.Item>
          </div>
        </SectionCard>

        {/* ═══ 分区 3：重置策略 ═══ */}
        <SectionCard
          header={{
            icon: <SettingOutlined style={{ fontSize: 14, color: '#722ed1' }} />,
            iconBg: '#f9f0ff',
            title: t('aiQuotaAuth.directQuotaResetSection'),
            note: t('aiQuotaAuth.directQuotaResetNote'),
          }}
        >
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
            <Form.Item name="autoReset" label={t('aiQuotaAuth.autoResetLabel')} valuePropName="checked">
              <Switch checkedChildren={t('aiQuotaAuth.enabledTag')} unCheckedChildren={t('aiQuotaAuth.disabledTag')} />
            </Form.Item>
            <Form.Item name="resetDayOfMonth" label={t('aiQuotaAuth.resetDayLabel')}>
              <InputNumber<number> min={1} max={28} precision={0} style={{ width: '100%' }} />
            </Form.Item>
          </div>
        </SectionCard>
      </Form>

      <FormFooter onCancel={handleBack} onSave={handleSave} saving={saving} />
    </div>
  )
}
