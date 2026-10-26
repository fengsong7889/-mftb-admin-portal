/**
 * 薪酬項目新增 / 編輯（/hcm-payroll-component-form）
 *
 * 类型决定这项钱怎么汇：應發进实发、扣除减实发、雇主成本只进人力成本。
 * 界面上把这条规则写在类型下方，避免维护人选错类型后工资单与成本报表对不上。
 */
import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Button, Form, Input, InputNumber, Select, Switch, message } from 'antd'
import { SaveOutlined, MoneyCollectOutlined } from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
import {
  COMPONENT_TYPE_OPTIONS,
  PAYROLL_CURRENCIES,
  createComponent,
  getComponent,
  updateComponent,
  type PayrollComponent,
} from '@/api/payroll'
import { CardTitle, FormHeader, cardStyle, grid3 } from '../Organization/shared'

export default function HcmPayrollComponentForm() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const id = params.get('id') ? Number(params.get('id')) : null
  const isEdit = !!id

  const [form] = Form.useForm<PayrollComponent>()
  const [saving, setSaving] = useState(false)

  const loadDetail = useCallback(async () => {
    if (!id) return
    const detail = await getComponent(id)
    form.setFieldsValue({
      ...detail,
      taxable: detail.taxable ?? 0,
      status: detail.status ?? 1,
    })
  }, [id, form])

  useEffect(() => {
    void loadDetail()
  }, [loadDetail])

  const handleSubmit = async () => {
    const values = await form.validateFields()
    setSaving(true)
    try {
      if (isEdit && id) {
        await updateComponent(id, values)
      } else {
        await createComponent(values)
      }
      message.success(t('hcmOrg.saveSuccess'))
      navigate('/hcm-payroll-component')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="content-area">
      <FormHeader
        title={isEdit ? t('payroll.component.editTitle') : t('payroll.component.addTitle')}
        onBack={() => navigate('/hcm-payroll-component')}
      />

      <Form form={form} layout="vertical" initialValues={{ componentType: 'EARNING', taxable: 0, status: 1, sortOrder: 0 }}>
        <div style={cardStyle}>
          <CardTitle icon={<MoneyCollectOutlined />} title={t('payroll.component.basicInfo')} />
          <div style={grid3}>
            <Form.Item name="code" label={t('payroll.component.code')} rules={[{ required: true, message: t('payroll.component.codeRequired') }]}>
              <Input maxLength={32} placeholder={t('payroll.component.codePlaceholder')} />
            </Form.Item>
            <Form.Item name="name" label={t('payroll.component.name')} rules={[{ required: true, message: t('payroll.component.nameRequired') }]}>
              <Input maxLength={128} />
            </Form.Item>
            <Form.Item name="nameEn" label={t('payroll.component.nameEn')}>
              <Input maxLength={128} />
            </Form.Item>
            <Form.Item name="componentType" label={t('payroll.component.type')} rules={[{ required: true, message: t('payroll.component.typeRequired') }]}>
              <Select options={[...COMPONENT_TYPE_OPTIONS]} />
            </Form.Item>
            <Form.Item name="currency" label={t('payroll.component.currency')}>
              <Select allowClear placeholder={t('payroll.component.currencyHint')} options={[...PAYROLL_CURRENCIES]} />
            </Form.Item>
            <Form.Item name="sortOrder" label={t('hcmOrg.sortOrder')}>
              <InputNumber style={{ width: '100%' }} min={0} max={999} />
            </Form.Item>
            <Form.Item
              name="taxable"
              label={t('payroll.component.taxable')}
              valuePropName="checked"
              getValueFromEvent={(checked: boolean) => (checked ? 1 : 0)}
              getValueProps={(value: number) => ({ checked: value === 1 })}
            >
              <Switch checkedChildren={t('payroll.component.taxableYes')} unCheckedChildren={t('payroll.component.taxableNo')} />
            </Form.Item>
            <Form.Item
              name="status"
              label={t('hcmOrg.status')}
              valuePropName="checked"
              getValueFromEvent={(checked: boolean) => (checked ? 1 : 0)}
              getValueProps={(value: number) => ({ checked: value === 1 })}
            >
              <Switch checkedChildren={t('hcmOrg.enabled')} unCheckedChildren={t('hcmOrg.disabled')} />
            </Form.Item>
            <Form.Item name="remark" label={t('hcmOrg.remark')} style={{ gridColumn: '1 / -1' }}>
              <Input.TextArea rows={3} maxLength={200} showCount style={{ resize: 'none' }} />
            </Form.Item>
          </div>
          <div style={{ fontSize: 12, color: '#8C8C8C', lineHeight: 1.9 }}>
            {t('payroll.component.typeHint')}
          </div>
        </div>
      </Form>

      <div className="form-footer">
        <Button onClick={() => navigate('/hcm-payroll-component')}>{t('common.cancel')}</Button>
        <Button type="primary" icon={<SaveOutlined />} loading={saving} onClick={handleSubmit}>
          {t('common.save')}
        </Button>
      </div>
    </div>
  )
}
