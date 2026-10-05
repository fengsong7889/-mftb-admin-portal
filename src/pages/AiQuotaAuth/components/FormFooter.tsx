/**
 * FormFooter — 表單底部操作按鈕（全局統一：取消 + 保存）
 * 用於所有 Edit 頁。
 */
import type { ReactNode } from 'react'
import { Button } from 'antd'
import { SaveOutlined } from '@ant-design/icons'
import { useTranslation } from 'react-i18next'

interface FormFooterProps {
  /** 取消按鈕回調 */
  onCancel: () => void
  /** 保存按鈕回調 */
  onSave: () => void
  /** 保存按鈕 loading 狀態 */
  saving?: boolean
  /** 自定義保存按鈕文案（默認「保存」） */
  saveText?: ReactNode
}

export default function FormFooter({ onCancel, onSave, saving, saveText }: FormFooterProps) {
  const { t } = useTranslation()
  return (
    <div className="form-footer">
      <Button onClick={onCancel}>{t('common.cancel')}</Button>
      <Button type="primary" icon={<SaveOutlined />} loading={saving} onClick={onSave}>
        {saveText ?? t('common.save')}
      </Button>
    </div>
  )
}
