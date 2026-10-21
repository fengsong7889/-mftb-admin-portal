import { useTranslation } from 'react-i18next'
import { GuardrailTab } from '../AiAssistantConfig'
import AiAssistantPageShell from './PageShell'

export default function GuardrailPage() {
  const { t } = useTranslation()
  return (
    <AiAssistantPageShell
      title={t('aiAssistantConfig.pageGuardrail', { defaultValue: '合規護欄' })}
      intro={t('aiAssistantConfig.introGuardrail', {
        defaultValue: '護欄在模型調用前後統一檢查輸入與回答；攔截不會把原文寫入日誌或回覆。',
      })}
    >
      <GuardrailTab />
    </AiAssistantPageShell>
  )
}
