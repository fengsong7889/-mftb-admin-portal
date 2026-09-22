import { Form, InputNumber, Switch } from 'antd'
import type { Rule } from 'antd/es/form'
import { useTranslation } from 'react-i18next'
import './index.css'

const STATUS_FIELDS = [
  { name: 'statusOpen', label: 'recommend.statusOpen', hint: undefined },
  { name: 'statusRest', label: 'recommend.statusRest', hint: 'recommend.statusRestHint' },
  { name: 'statusOverwhelmed', label: 'recommend.statusOverwhelmed', hint: 'recommend.statusOverwhelmedHint' },
  { name: 'statusClosed', label: 'recommend.statusClosed', hint: 'recommend.statusClosedHint' },
] as const
export type MerchantStatusField = typeof STATUS_FIELDS[number]['name']

/** 统一技术周期的标签与尺寸，默认值仍由各算法决定。 */
export function ConsistencyCheckField({ readOnly = false, initialValue }: { readOnly?: boolean; initialValue?: number }) {
  const { t } = useTranslation()
  return <div className="algorithm-fields algorithm-fields--compact">
    <Form.Item name="consistencyCheckInterval" label={t('recommend.verifyDataConsistency')}
      initialValue={initialValue} rules={[{ required: true, message: t('recommend.inputRequired') }]}>
      <InputNumber min={1} max={1440} placeholder={t('recommend.minutePlaceholder')}
        suffix={t('recommend.unitMinute')} disabled={readOnly || undefined} />
    </Form.Item>
  </div>
}

interface Props {
  readOnly?: boolean
  initializeOpen?: boolean
  rulesForField?: (name: MerchantStatusField) => Rule[]
}

/** 仅统一布局和控件，沿用原字段名、营业中锁定与调用方校验规则。 */
export default function MerchantStatusFields({ readOnly = false, initializeOpen = false, rulesForField }: Props) {
  const { t } = useTranslation()
  return (
    <div className="algorithm-fields algorithm-fields--statuses" data-testid="algorithm-merchant-status">
      {STATUS_FIELDS.map(field => (
        <Form.Item key={field.name} name={field.name} label={t(field.label)} valuePropName="checked"
          initialValue={initializeOpen && field.name === 'statusOpen' ? true : undefined}
          rules={rulesForField?.(field.name)}
          extra={field.hint ? <span className={field.name === 'statusClosed' ? 'algorithm-fields__danger' : undefined}>{t(field.hint)}</span> : undefined}>
          <Switch checkedChildren={t('common.enable')} unCheckedChildren={t('common.disable')}
            disabled={readOnly || field.name === 'statusOpen' || undefined} />
        </Form.Item>
      ))}
    </div>
  )
}
