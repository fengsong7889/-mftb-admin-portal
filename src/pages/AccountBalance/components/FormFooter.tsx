import { Button } from 'antd'
import { SendOutlined } from '@ant-design/icons'
import { useTranslation } from 'react-i18next'

/**
 * 表單底部操作欄（取消 + 提交申請）
 *
 * 提取自 DeductAdd / TransferAdd / RechargeAdd / MergeAdd 中重複的 footer 模式。
 */
export interface FormFooterProps {
  onCancel: () => void
  onSubmit: () => void
  submitting?: boolean
  submitLabel?: string
}

export default function FormFooter({
  onCancel,
  onSubmit,
  submitting = false,
  submitLabel,
}: FormFooterProps) {
  const { t } = useTranslation()
  return (
    <div className="form-footer">
      <Button onClick={onCancel}>{t('common:cancel')}</Button>
      <Button type="primary" icon={<SendOutlined />} loading={submitting} onClick={onSubmit}>
        {submitLabel || t('accountBalance.submitApply')}
      </Button>
    </div>
  )
}
