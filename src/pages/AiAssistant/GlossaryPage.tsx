import { useTranslation } from 'react-i18next'
import { GlossaryTab } from '../AiAssistantConfig'
import AiAssistantPageShell from './PageShell'

export default function GlossaryPage() {
  const { t } = useTranslation()
  return (
    <AiAssistantPageShell
      title={t('aiAssistantConfig.pageGlossary', { defaultValue: '術語與口徑' })}
      intro={t('aiAssistantConfig.introGlossary', {
        defaultValue: '術語用於統一助手與業務的口徑；只有「注入 Prompt」開啟的術語會進入回答上下文。',
      })}
    >
      <GlossaryTab />
    </AiAssistantPageShell>
  )
}
