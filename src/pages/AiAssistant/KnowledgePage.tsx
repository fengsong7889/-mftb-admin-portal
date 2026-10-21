import { useTranslation } from 'react-i18next'
import { KnowledgeTab } from '../AiAssistantConfig'
import AiAssistantPageShell from './PageShell'

export default function KnowledgePage() {
  const { t } = useTranslation()
  return (
    <AiAssistantPageShell
      title={t('aiAssistantConfig.pageKnowledge', { defaultValue: '知識庫' })}
      intro={t('aiAssistantConfig.introKnowledge', {
        defaultValue: '知識庫用於收錄操作說明、流程規範與欄位口徑；儲存後自動切分，助手透過 search_knowledge 檢索並標註來源。',
      })}
    >
      <KnowledgeTab />
    </AiAssistantPageShell>
  )
}
