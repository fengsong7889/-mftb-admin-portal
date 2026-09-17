import type { ReactNode } from 'react'
import { Alert, Button } from 'antd'
import { ArrowLeftOutlined } from '@ant-design/icons'
import { useTranslation } from 'react-i18next'

export function TransferPageHeader({ title, onBack, disabled }: { title: string; onBack: () => void; disabled?: boolean }) {
  const { t } = useTranslation()
  return <div style={{ position: 'relative', background: '#fff', marginBottom: 16, borderRadius: 12, boxShadow: '0 2px 12px rgba(0,0,0,0.06)', overflow: 'hidden' }}>
    <div style={{ height: 3, background: 'linear-gradient(90deg, #E8720C, #F59432, #FFB347, #F59432, #E8720C)', backgroundSize: '200% 100%', animation: 'headerGradientShift 4s ease infinite' }} />
    <div style={{ padding: '16px 24px', display: 'flex', alignItems: 'center', gap: 16 }}>
      <Button type="primary" icon={<ArrowLeftOutlined />} onClick={onBack} disabled={disabled}
        style={{ backgroundColor: '#E8720C', borderColor: '#E8720C', borderRadius: 8, height: 36, padding: '0 16px', boxShadow: '0 2px 6px rgba(232,114,12,0.25)' }}>{t('common.back')}</Button>
      <div style={{ width: 1, height: 20, background: '#E8E8E8' }} />
      <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#1890ff' }}>{title}</h2>
    </div>
  </div>
}

export function TransferSection({ title, icon, tone = 'blue', children }: {
  title: string; icon: ReactNode; tone?: 'blue' | 'orange' | 'purple'; children: ReactNode
}) {
  const colors = { blue: ['#e6f7ff', '#1890ff'], orange: ['#fff7e6', '#fa8c16'], purple: ['#f9f0ff', '#722ed1'] }
  return <div style={{ border: '1px solid #e8eaed', borderRadius: 8, background: '#fff', padding: '20px 24px', marginBottom: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
      <div style={{ width: 28, height: 28, borderRadius: 6, background: colors[tone][0], color: colors[tone][1], display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14 }}>{icon}</div>
      <span style={{ fontSize: 15, fontWeight: 600, color: '#262626' }}>{title}</span>
      <div style={{ flex: 1, height: 1, background: '#f0f0f0', marginLeft: 8 }} />
    </div>
    {children}
  </div>
}

export function TransferError({ error, retry }: { error?: string; retry?: () => void }) {
  const { t } = useTranslation()
  return error ? <Alert type="error" showIcon message={error} style={{ marginBottom: 16 }}
    action={retry && <Button size="small" onClick={retry}>{t('transfer.retry')}</Button>} /> : null
}
