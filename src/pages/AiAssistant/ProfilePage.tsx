import { useTranslation } from 'react-i18next'
import { ProfileTab } from '../AiAssistantConfig'
import AiAssistantPageShell from './PageShell'

export default function ProfilePage() {
  const { t } = useTranslation()
  return (
    <AiAssistantPageShell
      title={t('aiAssistantConfig.pageProfile', { defaultValue: '回答骨架' })}
      intro={t('aiAssistantConfig.introProfile', {
        defaultValue: '回答骨架必須發布後生效；可先儲存草稿並試跑，確認效果後再發布或回滾。',
      })}
    >
      <ProfileTab />
    </AiAssistantPageShell>
  )
}
