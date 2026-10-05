/**
 * 账户余额模块的内容分节卡片：左侧图标 + 标题 + 可选标签，横线铺满后右侧可插 extraEnd。
 * 与 AssetClaim/ClaimSection、TransferSection 功能够重复但样式细节不同，目前尚未合并。
 */
import { ReactNode } from 'react'

interface SectionCardProps {
  /** 图标位：传字符串按文本渲染（上色靠 iconColor），传 ReactNode 直接用节点 */
  icon: ReactNode
  iconBg?: string
  iconColor?: string
  title: ReactNode
  /** 紧跟标题的标签（如状态/必录提示） */
  tag?: ReactNode
  /** 标题行最右侧插槽（常见为按钮或开关） */
  extraEnd?: ReactNode
  children: ReactNode
  /** 透传外层样式，用于调用页微调边距 */
  style?: React.CSSProperties
}

export default function SectionCard({ icon, iconBg = '#e6f7ff', iconColor = '#1890ff', title, tag, extraEnd, children, style }: SectionCardProps) {
  return (
    <div style={{ border: '1px solid #e8eaed', borderRadius: 8, background: '#fff', padding: '20px 24px', marginBottom: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.04)', ...style }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
        <div style={{ width: 28, height: 28, borderRadius: 6, background: iconBg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {typeof icon === 'string' ? <span style={{ fontSize: 14, color: iconColor }}>{icon}</span> : icon}
        </div>
        <span style={{ fontSize: 15, fontWeight: 600, color: '#262626' }}>{title}</span>
        {tag}
        <div style={{ flex: 1, height: 1, background: '#f0f0f0', marginLeft: 8 }} />
        {extraEnd}
      </div>
      {children}
    </div>
  )
}
