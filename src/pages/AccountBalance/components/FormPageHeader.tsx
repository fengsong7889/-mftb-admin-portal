/**
 * 账户余额模块的表单页头：顶部渐变条 + 返回按钮 + 标题（右侧可插一个 Tag）。
 *
 * ⚠️ 重复实现提醒：项目已有 src/components/DetailPageHeader，而本页头以及
 * AssetTransfer/TransferLayout、AssetClaim/ClaimLayout、NotificationFormHeader 等
 * 至少五处各自拷了一份几乎相同的渐变页头（headerGradientShift 动画在 20+ 文件里
 * 重复）。新页头请先确认能否复用已有组件，不要再第六次拷贝。
 */
import { ReactNode } from 'react'
import { Button, Tag } from 'antd'
import { ArrowLeftOutlined } from '@ant-design/icons'
import { useTranslation } from 'react-i18next'

interface FormPageHeaderProps {
  title: string
  /** 标题右侧的附属标签（如账户状态），由调用方自己构好 Tag */
  tag?: ReactNode
  onBack: () => void
}

export default function FormPageHeader({ title, tag, onBack }: FormPageHeaderProps) {
  const { t } = useTranslation()

  return (
    <div style={{
      position: 'relative', background: '#fff', marginBottom: 16,
      borderRadius: 12, boxShadow: '0 2px 12px rgba(0,0,0,0.06)',
      overflow: 'hidden',
    }}>
      <div style={{
        height: 3, background: 'linear-gradient(90deg, #E8720C, #F59432, #FFB347, #F59432, #E8720C)',
        backgroundSize: '200% 100%', animation: 'headerGradientShift 4s ease infinite',
      }} />
      <div style={{
        padding: '16px 24px', display: 'flex', alignItems: 'center',
        justifyContent: 'space-between', animation: 'headerFadeSlideIn 0.5s ease',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <Button type="primary" icon={<ArrowLeftOutlined />}
            onClick={onBack}
            style={{
              backgroundColor: '#E8720C', borderColor: '#E8720C',
              borderRadius: 8, height: 36, padding: '0 16px',
              display: 'flex', alignItems: 'center', gap: 6,
              boxShadow: '0 2px 6px rgba(232,114,12,0.25)',
              transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
            }}>{t('common:back')}</Button>
          <div style={{ width: 1, height: 20, background: '#E8E8E8' }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#1890ff' }}>{title}</h2>
            {tag}
          </div>
        </div>
      </div>
    </div>
  )
}
