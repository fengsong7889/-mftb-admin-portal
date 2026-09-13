import { Popover } from 'antd'
import { CompressOutlined, PlusOutlined } from '@ant-design/icons'

/** 上下文窗口使用率：醒目的胶囊按钮 + Popover 面板 */
const ContextUsageIndicator = ({
  usedTokens,
  contextWindow,
  onCompress,
  onNewChat,
  t,
}: {
  usedTokens: number
  contextWindow: number | undefined
  onCompress: () => void
  onNewChat: () => void
  t: (key: string) => string
}) => {
  if (!contextWindow || contextWindow <= 0) return null
  const ratio = Math.min(1, usedTokens / contextWindow)
  const percent = Math.round(ratio * 100)
  const usedLabel = usedTokens >= 1_000_000
    ? `${(usedTokens / 1_000_000).toFixed(1)}M`
    : `${Math.round(usedTokens / 1_000)}k`
  const limitLabel = contextWindow >= 1_000_000
    ? `${Math.round(contextWindow / 1_000_000)}M`
    : `${Math.round(contextWindow / 1_000)}k`
  const color = ratio < 0.5 ? '#52C41A' : ratio < 0.8 ? '#FAAD14' : '#FF4D4F'
  const bg = ratio < 0.5 ? '#F6FFED' : ratio < 0.8 ? '#FFFBE6' : '#FFF1F0'
  const border = ratio < 0.5 ? '#B7EB8F' : ratio < 0.8 ? '#FFE58F' : '#FFA39E'

  return (
    <Popover
      trigger="click"
      placement="topRight"
      arrow={false}
      overlayInnerStyle={{ padding: 0 }}
      content={
        <div className="home-ctx-popover">
          <div className="home-ctx-popover-header">
            <CompressOutlined className="home-ctx-popover-icon" />
            <span>{t('home.ctxPopoverTitle')}</span>
          </div>
          <div className="home-ctx-popover-stats">
            <span className="home-ctx-popover-pct" style={{ color }}>{percent}%</span>
            <span className="home-ctx-popover-tokens">{usedLabel} / {limitLabel}</span>
            <span className="home-ctx-popover-label">{t('home.ctxUsageLabel')}</span>
          </div>
          <div className="home-ctx-popover-bar-track">
            <div className="home-ctx-popover-bar-fill" style={{ width: `${percent}%`, background: color }} />
          </div>
          <div className="home-ctx-popover-actions">
            <button type="button" className="home-ctx-popover-btn home-ctx-popover-btn--compress" onClick={() => { onCompress() }}>
              <CompressOutlined /> {t('home.convCompress')}
            </button>
            <button type="button" className="home-ctx-popover-btn home-ctx-popover-btn--new" onClick={() => { onNewChat() }}>
              <PlusOutlined /> {t('home.convNew')}
            </button>
          </div>
        </div>
      }
    >
      <button type="button" className="home-ctx-capsule" style={{ background: bg, borderColor: border }} title={`${percent}% ${t('home.ctxUsageLabel')}`}>
        <span className="home-ctx-capsule-dot" style={{ background: color }} />
        <span className="home-ctx-capsule-pct" style={{ color }}>{percent}%</span>
        <span className="home-ctx-capsule-tokens">{usedLabel}/{limitLabel}</span>
      </button>
    </Popover>
  )
}

export default ContextUsageIndicator
