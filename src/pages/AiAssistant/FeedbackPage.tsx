import { useTranslation } from 'react-i18next'
import { FeedbackTab } from '../AiAssistantConfig'
import AiAssistantPageShell from './PageShell'

export default function FeedbackPage() {
  const { t } = useTranslation()
  return (
    <AiAssistantPageShell
      title={t('aiAssistantConfig.pageFeedback', { defaultValue: '回答質量' })}
      intro={t('aiAssistantConfig.introFeedback', {
        defaultValue: '這裡只讀展示近 30 天讚/踩、低分工具與原因，用於判斷該調整哪項配置；不提供刪除或修改反饋。',
      })}
    >
      <FeedbackTab />
    </AiAssistantPageShell>
  )
}
