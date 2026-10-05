/**
 * 推荐管理的应用（端）切换 Tab：闪蜂 / MFood。
 *
 * 无内部状态的受控组件，选项与枚举值均取自 ../constants 的 APP_OPTIONS，
 * 新增应用只改常量，不需要动本文件。当前仅 Recommend/Dashboard 使用。
 *
 * antd Tabs 的 key 只能是字符串，而 AppType 是数字枚举，因此读写两侧都要做一次
 * Number / String 转换，这一层转换是必要代价而非疏忽。
 */
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
