/**
 * 余额展示卡片（单张数字卡）。
 * 默认前缀 MOP（澳门元）—— 本模块金额均以此币种口径展示。
 * 数字走 AnimatedNumber 做计数动画，不要换成直接渲染，否则与其他统计卡观感不一致。
 */
import { ReactNode } from 'react'
import { WalletOutlined } from '@ant-design/icons'
import { AnimatedNumber } from './shared'

interface BalanceCardProps {
  /** 余额数值。仅为展示层，不参与任何计算，精度以后端返回为准 */
  value: number
  label?: string
  /** 币种前缀，默认 MOP；传空字符串可去掉 */
  prefix?: string
  color?: string
  bgColor?: string
  borderColor?: string
  icon?: ReactNode
}

export default function BalanceCard({
  value,
  label,
  prefix = 'MOP ',
  color = '#1890ff',
  bgColor = '#E6F7FF',
  borderColor = '#1890ff22',
  icon,
}: BalanceCardProps) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 16, marginBottom: 20 }}>
      <div
        style={{
          padding: '12px', borderRadius: 10, background: bgColor,
          border: `1px solid ${borderColor}`, textAlign: 'center',
          transition: 'all 0.35s cubic-bezier(0.4, 0, 0.2, 1)', cursor: 'default',
          position: 'relative', overflow: 'hidden',
        }}
        onMouseEnter={e => {
          e.currentTarget.style.transform = 'translateY(-4px)'
          e.currentTarget.style.boxShadow = '0 8px 24px rgba(0, 0, 0, 0.1)'
        }}
        onMouseLeave={e => {
          e.currentTarget.style.transform = 'translateY(0)'
          e.currentTarget.style.boxShadow = 'none'
        }}
      >
        <div style={{ fontSize: 16, color, marginBottom: 4 }}>{icon || <WalletOutlined />}</div>
        <div style={{ fontSize: 18, fontWeight: 700, color }}>
          <AnimatedNumber value={value} prefix={prefix} />
        </div>
        <div style={{ fontSize: 11, color: '#8C8C8C', marginTop: 2 }}>{label}</div>
      </div>
    </div>
  )
}
