/**
 * AI 通道賬號白名單面板
 *
 * 權威源：後端 sys_config（`ai_model_qw_accounts` / `ai_model_ds_accounts`），
 * 跨賬號、跨設備生效；後端不可用時回退 localStorage 僅為不丟失草稿。
 *
 * 歸屬菜單：AI 操作授權（決策記憶：白名單歸 ai-operation-auth）。
 * 歷史上它只出現在沒有菜單入口的 /ai-quota-auth 頁面裡，等於管理員無處可改，故抽成共享面板。
 */
import { useEffect, useState } from 'react'
import { Alert, Button, Select, Tag, message } from 'antd'
import { UserOutlined } from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
import HelpPopover from '@/components/HelpPopover'
import {
  AI_MODEL_ACCOUNT_RULE_KEYS,
  fetchAiModelAccounts,
  saveAiModelAccounts,
  type AiModelKey,
} from '@/hooks/useSystemRules'

export default function AccountWhitelistPanel() {
  const { t } = useTranslation()
  /** 後端当前值（已生效）与各通道的编辑草稿 */
  const [accounts, setAccounts] = useState<Record<AiModelKey, string[]>>({ QW: [], DS: [] })
  const [draft, setDraft] = useState<Record<AiModelKey, string[]>>({ QW: [], DS: [] })
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let cancelled = false
    fetchAiModelAccounts()
      .then((value) => {
        if (cancelled) return
        setAccounts(value)
        setDraft(value)
      })
      .catch(() => { if (!cancelled) message.warning(t('aiQuotaAuth.whitelistLoadFailed')) })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleSave = async (channel: AiModelKey) => {
    setSaving(true)
    try {
      await saveAiModelAccounts(channel, draft[channel])
      const saved = draft[channel].map((a) => a.trim()).filter(Boolean)
      setAccounts((prev) => ({ ...prev, [channel]: saved }))
      message.success(t('aiQuotaAuth.whitelistSaved'))
    } catch (error) {
      message.error(error instanceof Error ? error.message : t('aiQuotaAuth.whitelistSaveFailed'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <Alert
        type="warning"
        showIcon
        style={{ marginBottom: 16 }}
        message={t('aiQuotaAuth.whitelistAlertTitle')}
        description={t('aiQuotaAuth.whitelistAlertDesc')}
      />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 16 }}>
        {(Object.keys(AI_MODEL_ACCOUNT_RULE_KEYS) as AiModelKey[]).map((channel) => {
          const saved = accounts[channel]
          const current = draft[channel]
          const dirty = JSON.stringify(saved) !== JSON.stringify(current)
          return (
            <div key={channel} style={{ border: '1px solid #F0F0F0', borderRadius: 8, padding: 20, background: '#fff' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 15, fontWeight: 600 }}>
                  {t(`aiQuotaAuth.whitelistChannel_${channel}`)}
                  {/* 口径说明超过一句，按规范走 HelpPopover 而不是 Tooltip 长文 */}
                  <HelpPopover
                    placement="right"
                    width={360}
                    ariaLabel={t('aiQuotaAuth.whitelistAccountHintAria')}
                    title={t('aiQuotaAuth.whitelistAccountHintTitle')}
                    content={[
                      { tone: 'info', label: t('aiQuotaAuth.whitelistHintLabelScope'), body: t('aiQuotaAuth.whitelistHintScopeBody') },
                      { tone: 'warn', label: t('aiQuotaAuth.whitelistHintLabelEmpty'), body: t('aiQuotaAuth.whitelistHintEmptyBody') },
                    ]}
                  />
                </div>
                <Tag color={saved.length ? 'warning' : 'success'}>
                  {saved.length ? t('aiQuotaAuth.limitedAccounts', { count: saved.length }) : t('aiQuotaAuth.allAccountsAvailable')}
                </Tag>
              </div>
              <Select
                mode="tags"
                style={{ width: '100%' }}
                placeholder={t('aiQuotaAuth.whitelistPlaceholder')}
                value={current}
                onChange={(values) => setDraft((prev) => ({ ...prev, [channel]: values }))}
                open={false}
                suffixIcon={<UserOutlined />}
              />
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
                <Button
                  type="primary"
                  size="small"
                  disabled={!dirty}
                  loading={saving}
                  onClick={() => void handleSave(channel)}
                >
                  {t('common.save')}
                </Button>
              </div>
            </div>
          )
        })}
      </div>
    </>
  )
}
