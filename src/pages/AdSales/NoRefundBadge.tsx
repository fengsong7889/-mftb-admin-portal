/**
 * 不允許退款警示徽章：統一放置在購買廣告界面標題欄最右側（Card extra 槽位）
 * 紅色漸變底 + 感嘆號圖標 + 脈衝動效引起注意，懸停查看完整說明
 */
import { Tooltip } from 'antd'
import { WarningOutlined } from '@ant-design/icons'
import { useTranslation } from 'react-i18next'

export default function NoRefundBadge() {
  const { t } = useTranslation('adSales')
  return (
    <Tooltip title={t('noRefundTooltip')}>
      <span style={{
        display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'help',
        fontSize: 13, fontWeight: 700, color: '#fff', whiteSpace: 'nowrap',
        padding: '4px 14px', borderRadius: 16,
        background: 'linear-gradient(135deg, #FF4D4F, #FF7875)',
        border: '1px solid #ff4d4f',
        animation: 'refundWarnPulse 1.8s ease-in-out infinite',
      }}>
        <WarningOutlined style={{ color: '#FFEB3B', fontSize: 15 }} />
        {t('noRefundTag')}
      </span>
    </Tooltip>
  )
}
