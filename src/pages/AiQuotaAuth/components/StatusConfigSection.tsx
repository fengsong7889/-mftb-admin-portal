/**
 * StatusConfigSection — 狀態配置分區（全局統一）
 *
 * 包含：開關卡片 + Form.Item（status 字段）
 * 用於所有 Edit 頁（DeptQuotaEdit、EmpQuotaEdit、DeptAuthGroupEdit）。
 */
import { Form, Switch, Tag } from 'antd'
import { PoweroffOutlined } from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
import SectionCard from './SectionCard'

interface StatusConfigSectionProps {
  /** status 字段名（默認 'status'） */
  name?: string
  /** 額外提示文案 */
  extra?: string
  /** 初始值（0 或 1，默認 1） */
  initialValue?: number
}

export default function StatusConfigSection({ name = 'status', extra, initialValue = 1 }: StatusConfigSectionProps) {
  const { t } = useTranslation()
  return (
    <SectionCard
      header={{
        icon: <PoweroffOutlined style={{ fontSize: 14, color: '#E8720C' }} />,
        iconBg: '#fff7e6',
        title: t('aiQuotaAuth.statusSection'),
        tag: t('aiQuotaAuth.editableTag'),
        tagColor: 'orange',
      }}
    >
      <div style={{ background: '#FFF7E6', padding: 16, borderRadius: 8, border: '1px solid #FFE7BA' }}>
        <Form.Item
          name={name}
          label={t('aiQuotaAuth.statusLabel2')}
          valuePropName="checked"
          getValueFromEvent={(checked) => checked ? 1 : 0}
          getValueProps={(value) => ({ checked: value === 1 })}
          style={{ marginBottom: 0 }}
          initialValue={initialValue}
          extra={extra}
        >
          <Switch checkedChildren={t('aiQuotaAuth.enableText')} unCheckedChildren={t('aiQuotaAuth.disableText')} />
        </Form.Item>
      </div>
    </SectionCard>
  )
}
