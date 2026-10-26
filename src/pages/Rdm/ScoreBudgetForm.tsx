/**
 * 貢獻分預算 —— 新增/調整獨立頁（AGENTS.md §9.1：新增/編輯不得用行內面板承載）
 *
 * 預算只是「超限預警」的口徑，不會自動折算個人分數；保存後回到產出積分頁。
 * 部門選擇用 TreeSelect（部門字段統一規範），不允許手填部門名。
 */
import { useCallback, useEffect, useState } from 'react'
import { Alert, Button, Form, Input, InputNumber, Space, Spin, TreeSelect, message } from 'antd'
import { SaveOutlined } from '@ant-design/icons'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import RdmFormHeader from './components/RdmFormHeader'
import { fetchDepartments } from '@/api/department'
import { buildDeptTree, type DeptNode } from '../Attendance/deptTree'
import { fetchScoreBudgets, saveScoreBudget, type RdmScoreBudgetItem } from '@/api/rdm'
import './index.css'

interface FormValues {
  deptId?: number
  scoreBudget: number
  warningRatio?: number
  remark: string
}

export default function ScoreBudgetForm() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const periodCode = searchParams.get('periodCode') ?? ''
  const budgetId = searchParams.get('id') ? Number(searchParams.get('id')) : null
  const copyId = searchParams.get('copyId') ? Number(searchParams.get('copyId')) : null
  const isEdit = budgetId != null

  const [form] = Form.useForm<FormValues>()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [deptTree, setDeptTree] = useState<DeptNode[]>([])
  const [current, setCurrent] = useState<RdmScoreBudgetItem | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    Promise.all([
      fetchScoreBudgets(periodCode).catch(() => [] as RdmScoreBudgetItem[]),
      fetchDepartments().then(list => buildDeptTree(list ?? [])).catch(() => [] as DeptNode[]),
    ])
      .then(([budgets, tree]) => {
        if (cancelled) return
        setDeptTree(tree ?? [])
        const source = (budgets ?? []).find(b => b.id === (isEdit ? budgetId : copyId))
        if (!isEdit && !copyId) {
          form.setFieldsValue({ scoreBudget: 0, warningRatio: 80 })
          return
        }
        if (!source) {
          setError(t('rdm.scoreBudgetForm.notFound'))
          return
        }
        setCurrent(source)
        form.setFieldsValue({
          deptId: source.deptId ?? undefined,
          scoreBudget: source.scoreBudget,
          warningRatio: source.warningRatio ?? 80,
          remark: source.remark ?? '',
        })
      })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [budgetId, copyId, form, isEdit, periodCode, t])

  const handleSubmit = useCallback(async () => {
    if (!periodCode) {
      message.error(t('rdm.scoreBudgetForm.missingPeriod'))
      return
    }
    let values: FormValues
    try {
      values = await form.validateFields()
    } catch {
      return
    }
    setSaving(true)
    try {
      await saveScoreBudget({
        id: isEdit ? budgetId : undefined,
        periodCode,
        deptId: values.deptId ?? null,
        scoreBudget: values.scoreBudget,
        warningRatio: values.warningRatio ?? 80,
        remark: values.remark.trim(),
      })
      message.success(t('rdm.scoreBudgetForm.saved'))
      navigate('/rdm-score')
    } catch (err) {
      message.error(err instanceof Error && err.message ? err.message : t('rdm.scoreBudgetForm.saveFail'))
    } finally {
      setSaving(false)
    }
  }, [budgetId, form, isEdit, navigate, periodCode, t])

  if (loading) {
    return <div className="content-area" style={{ textAlign: 'center', padding: 80 }}><Spin size="large" /></div>
  }

  if (error) {
    return (
      <div className="content-area">
        <RdmFormHeader
          title={isEdit ? t('rdm.scoreBudgetForm.editTitle') : t('rdm.scoreBudgetForm.addTitle')}
          onBack={() => navigate('/rdm-score')}
          backText={t('common.back')}
        />
        <Alert
          type="error"
          showIcon
          message={error}
          action={<Button size="small" onClick={() => navigate('/rdm-score')}>{t('rdm.scoreBudgetForm.backToScore')}</Button>}
        />
      </div>
    )
  }

  return (
    <div className="content-area">
      <RdmFormHeader
        title={isEdit ? t('rdm.scoreBudgetForm.editTitle') : t('rdm.scoreBudgetForm.addTitle')}
        onBack={() => navigate('/rdm-score')}
        backText={t('common.back')}
        meta={t('rdm.scoreBudgetForm.meta', { period: periodCode || '-' })}
      />

      <Form form={form} layout="vertical">
        <div className="rdm-form-section">
          <div className="rdm-form-section-title">{t('rdm.scoreBudgetForm.section')}</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0 16px' }}>
            <Form.Item name="deptId" label={t('rdm.scoreBudgetForm.dept')} extra={t('rdm.scoreBudgetForm.deptExtra')}>
              <TreeSelect
                treeData={deptTree}
                allowClear
                showSearch
                treeNodeFilterProp="title"
                placeholder={t('rdm.scoreBudgetForm.deptPlaceholder')}
                style={{ width: '100%' }}
              />
            </Form.Item>
            <Form.Item
              name="scoreBudget"
              label={t('rdm.scoreBudgetForm.amount')}
              rules={[{ required: true, message: t('rdm.scoreBudgetForm.amountRequired') }]}
            >
              <InputNumber min={1} max={999999} style={{ width: '100%' }} placeholder={t('rdm.scoreBudgetForm.amountPlaceholder')} />
            </Form.Item>
            <Form.Item name="warningRatio" label={t('rdm.scoreBudgetForm.warning')} extra={t('rdm.scoreBudgetForm.warningExtra')}>
              <InputNumber min={1} max={500} style={{ width: '100%' }} placeholder={t('rdm.scoreBudgetForm.warningPlaceholder')} />
            </Form.Item>
          </div>
          <Form.Item
            name="remark"
            label={t('rdm.scoreBudgetForm.remark')}
            rules={[{ required: true, message: t('rdm.scoreBudgetForm.remarkRequired') }]}
          >
            <Input.TextArea rows={3} maxLength={500} showCount placeholder={t('rdm.scoreBudgetForm.remarkPlaceholder')} />
          </Form.Item>
          {current && (
            <Alert
              type="info"
              showIcon
              message={t('rdm.scoreBudgetForm.used', { used: current.used ?? 0, ratio: current.usedRatio ?? 0 })}
            />
          )}
        </div>
      </Form>

      <div className="form-footer">
        <Space size={12}>
          <Button onClick={() => navigate('/rdm-score')}>{t('common.cancel')}</Button>
          <Button type="primary" icon={<SaveOutlined />} loading={saving} onClick={() => void handleSubmit()}>
            {t('common.save')}
          </Button>
        </Space>
      </div>
    </div>
  )
}
