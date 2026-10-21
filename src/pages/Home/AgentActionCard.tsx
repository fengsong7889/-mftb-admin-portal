import { useState } from 'react'
import { Alert, Button, Tag } from 'antd'
import { CheckCircleOutlined, CloseCircleOutlined, SendOutlined } from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
import {
  cancelAgentAction,
  confirmAgentAction,
  type AgentPendingAction,
} from '../../api/agent'

/**
 * 待确认动作卡（当前仅推送项目进度）。
 *
 * <p>模型只生成预览；真正发送必须由用户点「確認發送」，服务端会再次校验
 * owner / 过期 / 推送权 / 项目可见性。取消与确认都不走模型，避免提示注入
 * 或模型误判导致“没点也发了”。
 */
export default function AgentActionCard({
  action,
  onUpdated,
}: {
  action: AgentPendingAction
  onUpdated?: (next: AgentPendingAction) => void
}) {
  const { t } = useTranslation()
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState<AgentPendingAction['status']>(action.status ?? 'pending')
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const expired = (() => {
    if (!action.expiresAt) return false
    const ts = new Date(action.expiresAt.replace(' ', 'T')).getTime()
    return Number.isFinite(ts) && ts < Date.now()
  })()
  const effectiveStatus = status === 'pending' && expired ? 'expired' : status
  const actionable = effectiveStatus === 'pending'

  const handleConfirm = async () => {
    setBusy(true)
    setError(null)
    try {
      const result = await confirmAgentAction(action.id)
      const next: AgentPendingAction = {
        ...action,
        status: result.status === 'sent' ? 'sent' : 'failed',
      }
      setStatus(next.status)
      setMessage(result.text)
      if (result.status !== 'sent') setError(result.text)
      onUpdated?.(next)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      setError(msg)
      setStatus('failed')
    } finally {
      setBusy(false)
    }
  }

  const handleCancel = async () => {
    setBusy(true)
    setError(null)
    try {
      const next = await cancelAgentAction(action.id)
      setStatus(next.status ?? 'cancelled')
      setMessage(t('home.agentAction.cancelled'))
      onUpdated?.({ ...action, status: next.status ?? 'cancelled' })
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      setError(msg)
    } finally {
      setBusy(false)
    }
  }

  const statusTag = () => {
    switch (effectiveStatus) {
      case 'sent':
        return <Tag icon={<CheckCircleOutlined />} color="success">{t('home.agentAction.sent')}</Tag>
      case 'failed':
        return <Tag icon={<CloseCircleOutlined />} color="error">{t('home.agentAction.failed')}</Tag>
      case 'cancelled':
        return <Tag color="default">{t('home.agentAction.cancelled')}</Tag>
      case 'expired':
        return <Tag color="warning">{t('home.agentAction.expired')}</Tag>
      case 'processing':
        return <Tag color="processing">{t('home.agentAction.processing')}</Tag>
      default:
        return <Tag color="warning">{t('home.agentAction.pending')}</Tag>
    }
  }

  return (
    <section className="agent-action-card" aria-label={action.title}>
      <header className="agent-action-card__head">
        <div>
          <div className="agent-action-card__title">
            <SendOutlined />
            {action.title}
          </div>
          <div className="agent-action-card__summary">{action.summary}</div>
        </div>
        {statusTag()}
      </header>

      <div className="agent-action-card__preview" role="region" aria-label={t('home.agentAction.preview')}>
        <pre>{action.preview}</pre>
      </div>

      <div className="agent-action-card__meta">
        {t('home.agentAction.expiresAt', { time: action.expiresAt ?? '--' })}
      </div>

      {error && <Alert type="error" showIcon message={error} />}
      {!error && message && <Alert type="success" showIcon message={message} />}

      {actionable && (
        <div className="agent-action-card__footer">
          <Button type="primary" loading={busy} onClick={handleConfirm}>
            {t('home.agentAction.confirm')}
          </Button>
          <Button disabled={busy} onClick={handleCancel}>
            {t('home.agentAction.cancel')}
          </Button>
        </div>
      )}
    </section>
  )
}
