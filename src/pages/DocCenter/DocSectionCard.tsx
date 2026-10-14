/**
 * 文檔中心模塊卡片（form-page-style：白色 div 卡 + 圖標色塊標題行，禁用 antd Card 彩色標題頭）
 */
import type { ReactNode } from 'react'

interface DocSectionCardProps {
  /** 語義圖標（antd 圖標組件），顏色取 color */
  icon: ReactNode
  /** 圖標主色（配色約定見 form-page-style §3） */
  color: string
  /** 圖標色塊底色 */
  bg: string
  title: string
  /** 標題行右側灰字說明 */
  hint?: ReactNode
  children: ReactNode
}

export default function DocSectionCard({ icon, color, bg, title, hint, children }: DocSectionCardProps) {
  return (
    <div style={{
      border: '1px solid #e8eaed', borderRadius: 8, background: '#fff',
      padding: '20px 24px', marginBottom: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
        <div style={{
          width: 28, height: 28, borderRadius: 6, background: bg,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <span style={{ fontSize: 14, color, display: 'inline-flex' }}>{icon}</span>
        </div>
        <span style={{ fontSize: 15, fontWeight: 600, color: '#262626' }}>{title}</span>
        <div style={{ flex: 1, height: 1, background: '#f0f0f0', marginLeft: 8 }} />
        {hint && <span style={{ fontSize: 12, color: '#8c8c8c' }}>{hint}</span>}
      </div>
      {children}
    </div>
  )
}
