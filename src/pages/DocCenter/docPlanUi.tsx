import type { ReactNode } from 'react'
import { Button } from 'antd'
import { ArrowLeftOutlined } from '@ant-design/icons'
import { useTranslation } from 'react-i18next'

/** 新增/编辑页头部：橙色渐变顶条 + 返回按钮 + 标题（form-page-style 规范）。 */
export function DocPlanFormHeader({ title, onBack }: { title: string; onBack: () => void }) {
  const { t } = useTranslation()
  return <div style={{
    position: 'relative', background: '#fff', marginBottom: 16,
    borderRadius: 12, boxShadow: '0 2px 12px rgba(0,0,0,0.06)', overflow: 'hidden',
  }}>
    <div style={{
      height: 3, background: 'linear-gradient(90deg, #E8720C, #F59432, #FFB347, #F59432, #E8720C)',
      backgroundSize: '200% 100%', animation: 'headerGradientShift 4s ease infinite',
    }} />
    <div style={{ padding: '16px 24px', display: 'flex', alignItems: 'center', gap: 16 }}>
      <Button type="primary" icon={<ArrowLeftOutlined />} onClick={onBack}
        style={{
          backgroundColor: '#E8720C', borderColor: '#E8720C', borderRadius: 8, height: 36,
          padding: '0 16px', display: 'flex', alignItems: 'center', gap: 6,
          boxShadow: '0 2px 6px rgba(232,114,12,0.25)',
        }}>{t('common.back')}</Button>
      <div style={{ width: 1, height: 20, background: '#E8E8E8' }} />
      <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#1890ff' }}>{title}</h2>
    </div>
  </div>
}

/** 模块卡片标题行：图标色块 + 标题 + 延伸分隔线。 */
export function DocPlanSectionTitle({ icon, title, extra }: { icon: ReactNode; title: string; extra?: ReactNode }) {
  return <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
    <div style={{ width: 28, height: 28, borderRadius: 6, background: '#e6f7ff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <span style={{ fontSize: 14, color: '#1890ff', display: 'inline-flex' }}>{icon}</span>
    </div>
    <span style={{ fontSize: 15, fontWeight: 600, color: '#262626' }}>{title}</span>
    <div style={{ flex: 1, height: 1, background: '#f0f0f0', marginLeft: 8 }} />
    {extra}
  </div>
}
