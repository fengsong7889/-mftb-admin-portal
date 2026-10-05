import { useEffect, useState } from 'react'
import { Button } from 'antd'
import { useTranslation } from 'react-i18next'
import { isDirectExec } from '../../../utils/workflowEnabled'

interface SuccessModalProps {
  visible: boolean
  flowNo: string
  onBack: () => void
  /** 直接执行时的特殊描述文案 */
  directExecDesc?: string
}

export default function SuccessModal({ visible, flowNo, onBack, directExecDesc }: SuccessModalProps) {
  const { t } = useTranslation()
  const [countdown, setCountdown] = useState(5)

  useEffect(() => {
    if (!visible) return
    setCountdown(5)
    const timer = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) {
          clearInterval(timer)
          onBack()
          return 0
        }
        return prev - 1
      })
    }, 1000)
    return () => clearInterval(timer)
  }, [visible, onBack])

  if (!visible) return null

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      background: 'rgba(0,0,0,0.45)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 1000,
    }}>
      <div style={{
        background: '#fff', borderRadius: 12, padding: '32px 28px',
        width: 400, textAlign: 'center',
        boxShadow: '0 8px 32px rgba(0,0,0,0.15)',
      }}>
        <div style={{
          width: 64, height: 64, margin: '0 auto 20px',
          borderRadius: '50%',
          background: 'linear-gradient(135deg, #52C41A, #73D13D)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 4px 12px rgba(82,196,26,0.3)',
        }}>
          <span style={{ fontSize: 32, color: '#fff' }}>✓</span>
        </div>
        <h3 style={{ fontSize: 18, fontWeight: 600, color: '#262626', marginBottom: 12 }}>
          {t('accountBalance.submitSuccessTitle')}
        </h3>
        <p style={{ fontSize: 14, color: '#595959', lineHeight: 1.8, marginBottom: 24 }}>
          {flowNo && !isDirectExec(flowNo) && (
            <>{t('accountBalance.flowNoLabel')}<span style={{ color: '#E8720C', fontWeight: 500 }}>{flowNo}</span><br /></>
          )}
          {isDirectExec(flowNo)
            ? (directExecDesc || '✅ 已直接執行（未經審批）')
            : t('accountBalance.submitSuccessDesc')
          }
        </p>
        <Button
          type="primary"
          size="large"
          onClick={onBack}
          style={{ minWidth: 120, height: 40, borderRadius: 8 }}
        >
          {t('accountBalance.backToList')}{countdown > 0 && ` (${countdown}s)`}
        </Button>
      </div>
    </div>
  )
}
