/**
 * BasicInfoDetailSection — 基礎信息詳情分區（Detail 頁共享）
 *
 * 展示：策略名稱 / 描述 / 狀態 / 更新人 / 創建時間 / 更新時間
 * 用於 DeptQuotaDetail、EmpQuotaDetail。
 */
import { Tag } from 'antd'
import { AppstoreOutlined } from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
import SectionCard from './SectionCard'

interface BasicInfoDetailSectionProps {
  name: string
  description: string
  status: number
  updatedBy?: string | null
  createdAt?: string | null
  updatedAt?: string | null
}

export default function BasicInfoDetailSection({
  name, description, status, updatedBy, createdAt, updatedAt,
}: BasicInfoDetailSectionProps) {
  const { t } = useTranslation()

  const items = [
    { label: t('aiQuotaAuth.strategyNameCol'), value: name },
    { label: t('aiQuotaAuth.descLabel'), value: description || '-' },
    { label: t('aiQuotaAuth.statusCol'), value: status === 1 ? t('aiQuotaAuth.enableText') : t('aiQuotaAuth.disableText') },
    { label: t('aiQuotaAuth.lastUpdatedByCol'), value: updatedBy ?? '-' },
    { label: t('aiQuotaAuth.createdAtCol'), value: createdAt ?? '-' },
    { label: t('aiQuotaAuth.updatedAtCol'), value: updatedAt ?? '-' },
  ]

  return (
    <SectionCard
      header={{
        icon: <AppstoreOutlined style={{ fontSize: 14, color: '#1890ff' }} />,
        iconBg: '#e6f7ff',
        title: t('aiQuotaAuth.basicInfoSection'),
      }}
    >
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px' }}>
        {items.map((item) => (
          <div key={item.label}>
            <div style={{ fontSize: 12, color: '#8C8C8C', marginBottom: 4 }}>{item.label}</div>
            <div style={{ fontSize: 14, color: '#262626', fontWeight: 500 }}>{item.value}</div>
          </div>
        ))}
      </div>
    </SectionCard>
  )
}
