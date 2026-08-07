import { Tabs } from 'antd'
import { useTranslation } from 'react-i18next'
import { APP_OPTIONS, AppType } from '../constants'

interface AppTabsProps {
  value?: AppType
  onChange?: (app: AppType) => void
}

export default function AppTabs({ value = AppType.SHANFENG, onChange }: AppTabsProps) {
  const { t } = useTranslation()
  return (
    <Tabs
      activeKey={String(value)}
      onChange={(key) => onChange?.(Number(key) as AppType)}
      items={APP_OPTIONS.map(opt => ({
        key: String(opt.value),
        label: t(opt.labelKey),
      }))}
      style={{ marginBottom: 16 }}
    />
  )
}
