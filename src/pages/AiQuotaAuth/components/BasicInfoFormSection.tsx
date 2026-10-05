/**
 * BasicInfoFormSection — 基礎信息表單分區（全局統一）
 *
 * 包含：策略名稱 + 描述 的 2 列表單佈局
 * 用於所有 Edit 頁（DeptQuotaEdit、EmpQuotaEdit、DeptAuthGroupEdit）。
 */
import { Form, Input, Tag } from 'antd'
import { AppstoreOutlined } from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
import SectionCard from './SectionCard'

interface BasicInfoFormSectionProps {
  /** 策略名稱 placeholder */
  namePlaceholder?: string
  /** 描述 placeholder */
  descPlaceholder?: string
  /** 名稱最大長度（默認 50） */
  nameMaxLength?: number
  /** 描述最大長度（默認 200） */
  descMaxLength?: number
}

export default function BasicInfoFormSection({
  namePlaceholder,
  descPlaceholder,
  nameMaxLength = 50,
  descMaxLength = 200,
}: BasicInfoFormSectionProps) {
  const { t } = useTranslation()
  return (
    <SectionCard
      header={{
        icon: <AppstoreOutlined style={{ fontSize: 14, color: '#1890ff' }} />,
        iconBg: '#e6f7ff',
        title: t('aiQuotaAuth.basicInfoSection'),
        tag: t('aiQuotaAuth.editableTag'),
        tagColor: 'blue',
      }}
    >
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
        <Form.Item name="name" label={t('aiQuotaAuth.strategyNameCol')} rules={[{ required: true, message: t('aiQuotaAuth.strategyNameRequired') }]}>
          <Input placeholder={namePlaceholder} maxLength={nameMaxLength} allowClear />
        </Form.Item>
        <Form.Item name="description" label={t('aiQuotaAuth.descLabel')}>
          <Input placeholder={descPlaceholder} maxLength={descMaxLength} allowClear />
        </Form.Item>
      </div>
    </SectionCard>
  )
}
