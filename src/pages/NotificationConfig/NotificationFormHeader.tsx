/**
 * 通知配置模块的表单页头与卡片基础样式。
 * notificationCardStyle 导出给本模块的新增/编辑/详情页共用，保证分节卡片外观一致。
 * ⚠️ 页头渐变样式与 AccountBalance/FormPageHeader 等处重复，参见那边文件头的合并提醒。
 */
import { Button } from 'antd'
import { ArrowLeftOutlined } from '@ant-design/icons'
import { useTranslation } from 'react-i18next'

/** 本模块分节卡片的统一容器样式（白底 + 8px 圆角 + 浅边框） */
export const notificationCardStyle = {
  borderRadius: 8, background: '#fff', padding: '20px 24px', marginBottom: 16,
  border: '1px solid #e8eaed', boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
}

export default function NotificationFormHeader({ title, onBack }: { title: string; onBack: () => void }) {
  const { t } = useTranslation()
  return <div style={{ position: 'relative', background: '#fff', marginBottom: 16, borderRadius: 12,
    boxShadow: '0 2px 12px rgba(0,0,0,0.06)', overflow: 'hidden' }}>
    <div style={{ height: 3, background: 'linear-gradient(90deg, #E8720C, #F59432, #FFB347, #F59432, #E8720C)',
      backgroundSize: '200% 100%', animation: 'headerGradientShift 4s ease infinite' }} />
    <div style={{ padding: '16px 24px', display: 'flex', alignItems: 'center', gap: 16 }}>
      <Button type="primary" icon={<ArrowLeftOutlined />} onClick={onBack}
        style={{ borderRadius: 8, height: 36 }}>{t('notificationApp.back')}</Button>
      <div style={{ width: 1, height: 20, background: '#f0f0f0' }} />
      <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#1890FF' }}>{title}</h2>
    </div>
  </div>
}
