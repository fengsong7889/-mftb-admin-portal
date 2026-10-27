/**
 * 薪酬規則新增 / 編輯（/hcm-payroll-rule-form）
 *
 * 規則集本體 + 個稅級距在同一頁：级距脱离规则集没有意义，分两页维护必然出现"规则已启用但级距还是空的"。
 * 级距按整体保存：必须从 0 起、首尾相接、最高档无上限——服务端会再校验一次，这里只提前提示。
 */
import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Alert, Button, DatePicker, Form, Input, InputNumber, Select, Space, Switch, Table, message } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { CalculatorOutlined, DeleteOutlined, PlusOutlined, SaveOutlined } from '@ant-design/icons'
import dayjs, { type Dayjs } from 'dayjs'
import { useTranslation } from 'react-i18next'
import {
  JURISDICTION_OPTIONS,
  PAYROLL_CURRENCIES,
  createRuleSet,
  getRuleSet,
  listBrackets,
  saveBrackets,
  updateRuleSet,
  type PayrollTaxBracket,
} from '@/api/payroll'
import { CardTitle, FormHeader, cardStyle, grid3 } from '../Organization/shared'

interface RuleSetFormValues {
  code: string
  name: string
  jurisdiction: string
  cityCode: string
  cityName?: string
  currency: string
  basicDeduction: number
  effectiveFrom: Dayjs
  effectiveTo?: Dayjs | null
  status: number
  versionLabel?: string
  remark?: string
}

interface BracketRow {
  key: string
  lowerBound: number | null
  upperBound: number | null
  rate: number | null
  quickDeduction: number | null
}

function toDayjs(value: unknown): Dayjs | undefined {
  if (!value) return undefined
  if (Array.isArray(value)) return dayjs(new Date(value[0], value[1] - 1, value[2]))
  if (typeof value === 'number') return dayjs(value)
  if (typeof value === 'string') return dayjs(value)
  return undefined
}

let bracketSeq = 0
const nextKey = () => `b${++bracketSeq}`

export default function HcmPayrollRuleSetForm() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const id = params.get('id') ? Number(params.get('id')) : null
  const isEdit = !!id

  const [form] = Form.useForm<RuleSetFormValues>()
  const [brackets, setBrackets] = useState<BracketRow[]>([])
  const [saving, setSaving] = useState(false)
  const [loaded, setLoaded] = useState(false)

  const loadDetail = useCallback(async () => {
    if (!id) {
      setBrackets([{ key: nextKey(), lowerBound: 0, upperBound: null, rate: null, quickDeduction: 0 }])
      setLoaded(true)
      return
    }
    const [detail, levels] = await Promise.all([getRuleSet(id), listBrackets(id)])
    form.setFieldsValue({
      code: detail.code,
      name: detail.name,
      jurisdiction: detail.jurisdiction,
      cityCode: detail.cityCode,
      cityName: detail.cityName ?? undefined,
      currency: detail.currency,
      basicDeduction: Number(detail.basicDeduction),
      effectiveFrom: toDayjs(detail.effectiveFrom) as Dayjs,
      effectiveTo: toDayjs(detail.effectiveTo),
      status: detail.status ?? 1,
      versionLabel: detail.versionLabel ?? undefined,
      remark: detail.remark ?? undefined,
    })
    setBrackets(levels.map((level) => ({
      key: nextKey(),
      lowerBound: Number(level.lowerBound),
      upperBound: level.upperBound != null ? Number(level.upperBound) : null,
      rate: Number(level.rate),
      quickDeduction: level.quickDeduction != null ? Number(level.quickDeduction) : 0,
    })))
    setLoaded(true)
  }, [id, form])

  useEffect(() => {
    void loadDetail()
  }, [loadDetail])

  const updateBracket = (key: string, patch: Partial<BracketRow>) => {
    setBrackets((prev) => prev.map((row) => (row.key === key ? { ...row, ...patch } : row)))
  }

  /** 级距提示：只做"是否连续"的提前反馈，真正的拒绝仍由服务端给出 */
  const bracketWarning = (): string | null => {
    if (brackets.length === 0) return t('payroll.rule.bracketEmpty')
    let expected = 0
    for (let i = 0; i < brackets.length; i += 1) {
      const row = brackets[i]
      if (row.lowerBound == null || row.rate == null) return t('payroll.rule.bracketIncomplete', { level: i + 1 })
      if (Number(row.lowerBound) !== expected) {
        return t('payroll.rule.bracketGap', { level: i + 1, expected })
      }
      const last = i === brackets.length - 1
      if (last) {
        if (row.upperBound != null) return t('payroll.rule.bracketTopBounded')
      } else {
        if (row.upperBound == null || Number(row.upperBound) <= Number(row.lowerBound)) {
          return t('payroll.rule.bracketUpperInvalid', { level: i + 1 })
        }
        expected = Number(row.upperBound)
      }
    }
    return null
  }

  const handleSubmit = async () => {
    if (bracketWarning()) {
      message.warning(bracketWarning() as string)
      return
    }
    const values = await form.validateFields()
    const payload = {
      code: values.code,
      name: values.name,
      jurisdiction: values.jurisdiction,
      cityCode: values.cityCode,
      cityName: values.cityName,
      currency: values.currency,
      basicDeduction: Number(values.basicDeduction).toFixed(4),
      effectiveFrom: values.effectiveFrom.format('YYYY-MM-DD'),
      effectiveTo: values.effectiveTo ? values.effectiveTo.format('YYYY-MM-DD') : null,
      status: values.status,
      versionLabel: values.versionLabel,
      remark: values.remark,
    }
    setSaving(true)
    try {
      const saved = isEdit && id ? await updateRuleSet(id, payload) : await createRuleSet(payload)
      const ruleSetId = (saved?.id ?? id) as number
      await saveBrackets(ruleSetId, brackets.map((row) => ({
        lowerBound: Number(row.lowerBound).toFixed(4),
        upperBound: row.upperBound != null ? Number(row.upperBound).toFixed(4) : null,
        rate: Number(row.rate).toFixed(4),
        quickDeduction: row.quickDeduction != null ? Number(row.quickDeduction).toFixed(4) : '0.0000',
      })) as PayrollTaxBracket[])
      message.success(t('hcmOrg.saveSuccess'))
      navigate('/hcm-payroll-rule')
    } finally {
      setSaving(false)
    }
  }

  const columns: ColumnsType<BracketRow> = [
    {
      key: 'level', title: t('payroll.rule.level'), width: 60,
      render: (_, __, index) => index + 1,
    },
    {
      key: 'lowerBound', title: t('payroll.rule.lowerBound'), width: 160,
      render: (_, row, index) => (
        <InputNumber
          style={{ width: '100%' }} min={0} precision={4}
          value={row.lowerBound ?? undefined}
          // 第一档固定从 0 起；其余档下限跟随上一档上限，避免手工填出断档
          disabled={index === 0}
          onChange={(value) => updateBracket(row.key, { lowerBound: value ?? null })}
        />
      ),
    },
    {
      key: 'upperBound', title: t('payroll.rule.upperBound'), width: 160,
      render: (_, row, index) => (
        <InputNumber
          style={{ width: '100%' }} min={0} precision={4}
          value={row.upperBound ?? undefined}
          disabled={index === brackets.length - 1}
          placeholder={index === brackets.length - 1 ? t('payroll.rule.noLimit') : undefined}
          onChange={(value) => updateBracket(row.key, { upperBound: value ?? null })}
        />
      ),
    },
    {
      key: 'rate', title: t('payroll.rule.rate'), width: 140,
      render: (_, row) => (
        <InputNumber
          style={{ width: '100%' }} min={0} max={1} step={0.01} precision={4}
          value={row.rate ?? undefined}
          placeholder="0.03"
          onChange={(value) => updateBracket(row.key, { rate: value ?? null })}
        />
      ),
    },
    {
      key: 'quickDeduction', title: t('payroll.rule.quickDeduction'), width: 160,
      render: (_, row) => (
        <InputNumber
          style={{ width: '100%' }} min={0} precision={4}
          value={row.quickDeduction ?? undefined}
          onChange={(value) => updateBracket(row.key, { quickDeduction: value ?? null })}
        />
      ),
    },
    {
      key: 'action', title: t('common.action'), width: 80,
      render: (_, row) => (
        <Button
          type="link" size="small" danger icon={<DeleteOutlined />}
          disabled={brackets.length <= 1}
          onClick={() => setBrackets((prev) => prev.filter((item) => item.key !== row.key))}
        />
      ),
    },
  ]

  const warning = loaded ? bracketWarning() : null

  return (
    <div className="content-area">
      <FormHeader
        title={isEdit ? t('payroll.rule.editTitle') : t('payroll.rule.addTitle')}
        onBack={() => navigate('/hcm-payroll-rule')}
      />

      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
        message={t('payroll.rule.zeroDefaultHint')}
      />

      <Form
        form={form}
        layout="vertical"
        initialValues={{ jurisdiction: 'CN', currency: 'CNY', status: 1, basicDeduction: 0, effectiveFrom: dayjs() }}
      >
        <div style={cardStyle}>
          <CardTitle icon={<CalculatorOutlined />} title={t('payroll.rule.section')} />
          <div style={grid3}>
            <Form.Item name="code" label={t('payroll.rule.code')} rules={[{ required: true, message: t('payroll.rule.codeRequired') }]}>
              <Input maxLength={64} placeholder="CN-SZ-2026" />
            </Form.Item>
            <Form.Item name="name" label={t('payroll.rule.name')} rules={[{ required: true, message: t('payroll.rule.nameRequired') }]}>
              <Input maxLength={128} />
            </Form.Item>
            <Form.Item name="jurisdiction" label={t('payroll.benefit.jurisdiction')} rules={[{ required: true }]}>
              <Select options={[...JURISDICTION_OPTIONS]} />
            </Form.Item>
            <Form.Item name="cityCode" label={t('payroll.rule.cityCode')} rules={[{ required: true, message: t('payroll.rule.cityRequired') }]} extra={t('payroll.rule.cityHint')}>
              <Input maxLength={16} placeholder="4403" />
            </Form.Item>
            <Form.Item name="cityName" label={t('payroll.rule.cityName')}>
              <Input maxLength={64} placeholder="深圳" />
            </Form.Item>
            <Form.Item name="currency" label={t('payroll.component.currency')} rules={[{ required: true, message: t('payroll.standard.currencyRequired') }]}>
              <Select options={[...PAYROLL_CURRENCIES]} />
            </Form.Item>
            <Form.Item name="basicDeduction" label={t('payroll.rule.basicDeduction')} rules={[{ required: true, message: t('payroll.rule.basicDeductionRequired') }]} extra={t('payroll.rule.basicDeductionHint')}>
              <InputNumber min={0} precision={4} style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item name="effectiveFrom" label={t('payroll.standard.effectiveFrom')} rules={[{ required: true, message: t('payroll.standard.effectiveFromRequired') }]}>
              <DatePicker style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item name="effectiveTo" label={t('payroll.standard.effectiveTo')}>
              <DatePicker style={{ width: '100%' }} placeholder={t('payroll.standard.effectiveToHint')} />
            </Form.Item>
            <Form.Item name="versionLabel" label={t('payroll.rule.versionLabel')}>
              <Input maxLength={64} placeholder="2026 年社保年度" />
            </Form.Item>
            <Form.Item name="status" label={t('hcmOrg.status')} valuePropName="checked"
              getValueFromEvent={(checked: boolean) => (checked ? 1 : 0)}
              getValueProps={(value: number) => ({ checked: value === 1 })}>
              <Switch checkedChildren={t('hcmOrg.enabled')} unCheckedChildren={t('hcmOrg.disabled')} />
            </Form.Item>
            <Form.Item name="remark" label={t('hcmOrg.remark')}>
              <Input maxLength={200} />
            </Form.Item>
          </div>
        </div>

        <div style={{ ...cardStyle, marginTop: 16 }}>
          <CardTitle icon={<CalculatorOutlined />} title={t('payroll.rule.bracketSection')} />
          <div style={{ marginBottom: 12 }}>
            <Space>
              <Button
                icon={<PlusOutlined />}
                onClick={() => setBrackets((prev) => {
                  const last = prev[prev.length - 1]
                  return [...prev, {
                    key: nextKey(),
                    lowerBound: last?.upperBound ?? 0,
                    upperBound: null,
                    rate: null,
                    quickDeduction: 0,
                  }]
                })}
              >
                {t('payroll.rule.addBracket')}
              </Button>
            </Space>
          </div>
          {warning ? (
            <Alert type="warning" showIcon style={{ marginBottom: 12 }} message={warning} />
          ) : (
            <Alert type="success" showIcon style={{ marginBottom: 12 }} message={t('payroll.rule.bracketOk')} />
          )}
          <Table<BracketRow>
            rowKey="key"
            size="small"
            columns={columns}
            dataSource={brackets}
            pagination={false}
            scroll={{ x: 'max-content' }}
          />
          <div style={{ fontSize: 12, color: '#8c8c8c', marginTop: 8 }}>
            {t('payroll.rule.bracketHint')}
          </div>
        </div>
      </Form>

      <div className="form-footer">
        <Button onClick={() => navigate('/hcm-payroll-rule')}>{t('common.cancel')}</Button>
        <Button type="primary" icon={<SaveOutlined />} loading={saving} onClick={handleSubmit}>
          {t('common.save')}
        </Button>
      </div>
    </div>
  )
}
