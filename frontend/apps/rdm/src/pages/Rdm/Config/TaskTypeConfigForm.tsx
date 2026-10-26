/**
 * 任務類型字典 —— 新增/編輯獨立頁（AGENTS.md §9.1：新增/編輯不得用 Modal 承載）
 *
 * 任務類型是研發任務的分類真值（APP 可拆 Android/iOS），改代碼會影響歷史任務，
 * 因此編輯時 code 只讀；保存後失效字典緩存，任務表單即刻可見。
 */
import { useCallback, useEffect, useState } from 'react'
import { Alert, Button, Form, Input, InputNumber, Select, Space, Spin, message } from 'antd'
import { SaveOutlined } from '@ant-design/icons'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import RdmFormHeader from '../components/RdmFormHeader'
import HelpPopover from '@/components/HelpPopover'
import { invalidateTaskTypeDict } from '@/hooks/useTaskTypeDict'
import {
  createTaskType,
  fetchTaskTypeAll,
  updateTaskType,
  RDM_TASK_TYPE_CATEGORY,
} from '@/api/rdmTaskType'
import '../index.css'

const CATEGORY_OPTIONS = [
  { value: RDM_TASK_TYPE_CATEGORY.DESIGN, label: 'design' },
  { value: RDM_TASK_TYPE_CATEGORY.QA, label: 'qa' },
  { value: RDM_TASK_TYPE_CATEGORY.DEV, label: 'dev' },
] as const

interface FormValues {
  code: string
  label: string
  color: string
  category: string
  sortOrder: number
  remark?: string
}

export default function TaskTypeConfigForm() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const typeId = searchParams.get('id') ? Number(searchParams.get('id')) : null
  const isEdit = typeId != null

  const [form] = Form.useForm<FormValues>()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    fetchTaskTypeAll()
      .then(list => {
        if (cancelled) return
        if (!isEdit) {
          form.setFieldsValue({
            category: RDM_TASK_TYPE_CATEGORY.DEV,
            sortOrder: (list?.length ? Math.max(...list.map(i => i.sortOrder ?? 0)) : 0) + 1,
            color: '#1890FF',
          })
          return
        }
        const row = (list ?? []).find(i => i.id === typeId)
        if (!row) {
          setError(t('rdm.taskTypeConfig.loadFail'))
          return
        }
        form.setFieldsValue({
          code: row.code,
          label: row.label,
          color: row.color,
          category: row.category,
          sortOrder: row.sortOrder ?? 0,
          remark: row.remark ?? undefined,
        })
      })
      .catch(() => { if (!cancelled) setError(t('rdm.taskTypeConfig.loadFail')) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [form, isEdit, t, typeId])

  const handleSubmit = useCallback(async () => {
    let values: FormValues
    try {
      values = await form.validateFields()
    } catch {
      return
    }
    setSaving(true)
    try {
      if (isEdit && typeId != null) {
        const { code: _code, ...rest } = values
        await updateTaskType(typeId, rest)
        message.success(t('common.updateSuccess'))
      } else {
        await createTaskType(values)
        message.success(t('common.createSuccess'))
      }
      invalidateTaskTypeDict()
      navigate('/rdm-task-type-config')
    } catch {
      // 失败原因由请求层统一提示（如「任務類型編碼已存在」），此处不双弹
    } finally {
      setSaving(false)
    }
  }, [form, isEdit, navigate, t, typeId])

  if (loading) {
    return <div className="content-area" style={{ textAlign: 'center', padding: 80 }}><Spin size="large" /></div>
  }

  if (error) {
    return (
      <div className="content-area">
        <RdmFormHeader title={t('rdm.taskTypeConfig.editTitle')} onBack={() => navigate('/rdm-task-type-config')} backText={t('common.back')} />
        <Alert
          type="error"
          showIcon
          message={error}
          action={<Button size="small" onClick={() => navigate('/rdm-task-type-config')}>{t('common.back')}</Button>}
        />
      </div>
    )
  }

  return (
    <div className="content-area">
      <RdmFormHeader
        title={isEdit ? t('rdm.taskTypeConfig.editTitle') : t('rdm.taskTypeConfig.addTitle')}
        onBack={() => navigate('/rdm-task-type-config')}
        backText={t('common.back')}
      />

      <Form form={form} layout="vertical">
        <div className="rdm-form-section">
          <div className="rdm-form-section-title">{t('rdm.taskTypeConfig.title')}</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
            <Form.Item
              label={t('rdm.taskTypeConfig.formCode')}
              name="code"
              rules={[
                { required: true, message: t('rdm.taskTypeConfig.formCodePlaceholder') },
                { pattern: /^[a-z0-9_]{1,32}$/, message: t('rdm.taskTypeConfig.formCodePlaceholder') },
              ]}
              extra={isEdit ? t('rdm.taskTypeConfig.formCodeHint') : undefined}
            >
              <Input placeholder={t('rdm.taskTypeConfig.formCodePlaceholder')} disabled={isEdit} maxLength={32} />
            </Form.Item>
            <Form.Item
              label={t('rdm.taskTypeConfig.formLabel')}
              name="label"
              rules={[{ required: true, message: t('rdm.taskTypeConfig.formLabel') }]}
            >
              <Input placeholder={t('rdm.taskTypeConfig.formLabelPlaceholder')} maxLength={64} />
            </Form.Item>
            <Form.Item
              label={t('rdm.taskTypeConfig.formColor')}
              name="color"
              rules={[
                { required: true, message: '#RRGGBB' },
                { pattern: /^#[0-9A-Fa-f]{6}$/, message: '#RRGGBB' },
              ]}
            >
              <Input placeholder="#RRGGBB" maxLength={7} />
            </Form.Item>
            <Form.Item
              label={(
                <span>
                  {t('rdm.taskTypeConfig.formCategory')}
                  <HelpPopover
                    title={t('rdm.taskTypeConfig.categoryHelpTitle')}
                    ariaLabel={t('rdm.taskTypeConfig.categoryHelpTitle')}
                    content={[
                      { tone: 'info', body: t('rdm.taskTypeConfig.categoryHelpDesign') },
                      { tone: 'info', body: t('rdm.taskTypeConfig.categoryHelpQa') },
                      { tone: 'success', body: t('rdm.taskTypeConfig.categoryHelpDev') },
                    ]}
                  />
                </span>
              )}
              name="category"
              rules={[{ required: true, message: t('rdm.taskTypeConfig.formCategory') }]}
              extra={t('rdm.taskTypeConfig.formCategoryHint')}
            >
              <Select options={CATEGORY_OPTIONS.map(o => ({ value: o.value, label: o.label }))} />
            </Form.Item>
            <Form.Item
              label={t('rdm.taskTypeConfig.formSort')}
              name="sortOrder"
              extra={t('rdm.taskTypeConfig.formSortHint')}
              rules={[{ required: true, message: t('rdm.taskTypeConfig.formSort') }]}
            >
              <InputNumber min={0} max={9999} style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item label={t('rdm.taskTypeConfig.formRemark')} name="remark">
              <Input maxLength={200} placeholder={t('rdm.taskTypeConfig.formRemarkPlaceholder')} />
            </Form.Item>
          </div>
        </div>
      </Form>

      <div className="form-footer">
        <Space size={12}>
          <Button onClick={() => navigate('/rdm-task-type-config')}>{t('common.cancel')}</Button>
          <Button type="primary" icon={<SaveOutlined />} loading={saving} onClick={() => void handleSubmit()}>
            {t('common.save')}
          </Button>
        </Space>
      </div>
    </div>
  )
}
