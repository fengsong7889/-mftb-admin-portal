/**
 * SectionCard — 分區卡片容器（全局統一樣式）
 *
 * 包含：
 *   - 外層卡片容器（border + borderRadius + boxShadow）
 *   - 分區標題行（圖標 badge + 標題 + Tag + 備註 + 分隔線）
 *   - children 內容區
 *
 * 用於所有 Edit / Detail 頁的分區佈局。
 */
import type { ReactNode } from 'react'
import { Tag, Tooltip } from 'antd'
import type { TagProps } from 'antd'

/* ────────── SectionHeader ────────── */

interface SectionHeaderProps {
  /** 圖標（ReactNode，通常是 <XxxOutlined />） */
  icon: ReactNode
  /** 圖標 badge 背景色 */
  iconBg: string
  /** 標題文案 */
  title: ReactNode
  /** 標題右側 Tag */
  tag?: ReactNode
  /** Tag 顏色 */
  tagColor?: TagProps['color']
  /** 備註文案（灰色小字） */
  note?: ReactNode
  /** 備註 Tooltip（懸浮提示） */
  tooltip?: ReactNode
}

export function SectionHeader({ icon, iconBg, title, tag, tagColor, note, tooltip }: SectionHeaderProps) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
      <div style={{ width: 28, height: 28, borderRadius: 6, background: iconBg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {icon}
      </div>
      <span style={{ fontSize: 15, fontWeight: 600, color: '#262626' }}>{title}</span>
      {tag && <Tag color={tagColor} style={{ marginLeft: 4, fontSize: 11 }}>{tag}</Tag>}
      {note && (
        tooltip ? (
          <Tooltip title={tooltip}>
            <span style={{ fontSize: 12, color: '#8C8C8C', cursor: 'help' }}>{note}</span>
          </Tooltip>
        ) : (
          <span style={{ fontSize: 12, color: '#8C8C8C' }}>{note}</span>
        )
      )}
      <div style={{ flex: 1, height: 1, background: '#f0f0f0', marginLeft: 8 }} />
    </div>
  )
}

/* ────────── SectionCard ────────── */

interface SectionCardProps {
  /** 分區標題配置 */
  header: SectionHeaderProps
  /** 卡片內容 */
  children: ReactNode
  /** 額外樣式 */
  style?: React.CSSProperties
}

export default function SectionCard({ header, children, style }: SectionCardProps) {
  return (
    <div style={{
      border: '1px solid #e8eaed', borderRadius: 8, background: '#fff',
      padding: '20px 24px', marginBottom: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
      ...style,
    }}>
      <SectionHeader {...header} />
      {children}
    </div>
  )
}
