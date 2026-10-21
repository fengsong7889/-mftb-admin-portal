import { useTranslation } from 'react-i18next'
import { CapabilityTab } from '../AiAssistantConfig'
import AiAssistantPageShell from './PageShell'

export default function CapabilityPage() {
  const { t } = useTranslation()
  return (
    <AiAssistantPageShell
      title={t('aiAssistantConfig.pageCapability', { defaultValue: '能力清單' })}
      intro={t('aiAssistantConfig.introCapability', {
        defaultValue: '這裡只調整能力說明、適用場景與範例；工具啟停仍在「AI 操作授權」，資料權限仍由各業務選單控制。',
      })}
    >
      <CapabilityTab />
    </AiAssistantPageShell>
  )
}
