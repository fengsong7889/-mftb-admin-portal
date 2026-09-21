import type { ReactNode } from 'react'
import { ArrowLeftOutlined } from '@ant-design/icons'
import { Alert, Button } from 'antd'
import { useTranslation } from 'react-i18next'

export function ClaimFormHeader({ title, subtitle, onBack }: { title: string; subtitle?: string; onBack: () => void }) {
  const { t } = useTranslation()
  return (
    <div className="claim-form-header">
      <div className="claim-header-stripe" />
      <div className="claim-header-body">
        <Button type="primary" icon={<ArrowLeftOutlined />} onClick={onBack}>{t('common.back')}</Button>
        <div className="claim-header-divider" />
        <div><h2>{title}</h2>{subtitle && <div className="claim-muted">{subtitle}</div>}</div>
      </div>
    </div>
  )
}

export function ClaimSection({ title, icon, children }: { title: string; icon?: ReactNode; children: ReactNode }) {
  return (
    <div style={{ border: '1px solid #e8eaed', borderRadius: 8, background: '#fff', padding: '20px 24px', marginBottom: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
      <div className="claim-section-heading"><span className="claim-section-icon">{icon}</span><h3>{title}</h3><span className="claim-section-line" /></div>
      {children}
    </div>
  )
}

export function ClaimConnectionNotice() {
  return <Alert type="info" showIcon className="claim-notice" message="界面驗收階段 · 真實領用服務待接通" description="當前不讀取模擬領用記錄，也不提交業務數據。統計中的 — 表示尚未加載；界面確認後接通員工簽署、資產預留和正常歸還。" />
}
