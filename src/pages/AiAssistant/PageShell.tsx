import type { ReactNode } from 'react'
import { Alert } from 'antd'
import { useNavigate } from 'react-router-dom'
import DetailPageHeader from '@/components/DetailPageHeader'

/**
 * AI 助手各配置页的统一外壳：详情页头部 + 可选页面说明。
 *
 * <p>返回按钮固定回分组首页，不再用 history.back()：从侧栏直接进入时，
 * 浏览器历史里可能是别的模块，返回会跳到毫无关系的位置。
 */
export default function AiAssistantPageShell({
  title,
  intro,
  backTo = '/ai-assistant',
  children,
}: {
  title: ReactNode
  intro?: ReactNode
  backTo?: string
  children: ReactNode
}) {
  const navigate = useNavigate()
  return (
    <div className="content-area ai-assistant-page">
      <DetailPageHeader title={title} onBack={() => navigate(backTo)} />
      {intro && (
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 12 }}
          message={intro}
        />
      )}
      {children}
    </div>
  )
}
