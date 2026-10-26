/**
 * 会议域统计卡片（遵循 §B.7 数据指标统计卡标准）。
 *
 * <p>口径约束（AGENTS.md §E.8）：卡片必须渲染在 `.search-section` 之后、`.action-section` 之前，
 * 且数字必须由服务端按**当前筛选条件**算出。放搜索区上方等于让用户先读一屏未过滤的全量数字。
 *
 * <p>容器 key 由筛选条件快照拼出，条件一变整组卡片重挂载、重新触发计数动画——
 * 否则改了条件数字却静止不动，用户无法判断"这个数是新的还是上一次留下的"。
 *
 * <p>为什么强制三段式 + antd 图标 + AnimatedNumber：早期版本用 emoji 当图标、横向排布、
 * 数字直接渲染，与全站「数据指标卡」的视觉语言不一致（emoji 在不同操作系统上字形不同，
 * 且颜色无法跟随卡片主色）。现在图标 20px 取卡片主色，数值走 useCountUp 计数动画。
 */
import type { ReactNode } from 'react'
import AnimatedNumber from '@/components/AnimatedNumber'

export interface StatItem {
  /** 语义图标（antd 图标组件），颜色自动取卡片主色 */
  icon: ReactNode
  color: string
  bg: string
  /** 计数字段传 number（自动走计数动画）；日期/比例等非计数字段可传 ReactNode 直接展示 */
  value: number | ReactNode
  label: string
  /** 口径说明：悬浮时解释这个数字怎么算的，避免"看起来不对"的反复答疑 */
  hint?: string
}

function StatCard({ icon, color, bg, value, label, hint, loading }: StatItem & { loading?: boolean }) {
  return (
    <div
      title={hint}
      style={{
        borderRadius: 12,
        padding: 16,
        background: bg,
        border: `1px solid ${color}22`,
        textAlign: 'center',
        position: 'relative',
        overflow: 'hidden',
        cursor: 'default',
        transition: 'all 0.35s cubic-bezier(0.4, 0, 0.2, 1)',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = 'translateY(-4px)'
        e.currentTarget.style.boxShadow = '0 8px 24px rgba(0, 0, 0, 0.1)'
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = 'translateY(0)'
        e.currentTarget.style.boxShadow = 'none'
      }}
    >
      <div style={{ fontSize: 20, color, lineHeight: 1 }}>{icon}</div>
      <div style={{ fontSize: 22, fontWeight: 700, color, marginTop: 6, lineHeight: 1.2 }}>
        {/* 取数中显示占位符而不是 0：首屏报一个「0 间会议室」而下方矩阵己经列出 4 间，
            用户会当成筛选坏了；没数据与还在加载必须是两种长相。 */}
        {loading ? '—' : (typeof value === 'number' ? <AnimatedNumber value={value} /> : value)}
      </div>
      <div style={{ fontSize: 12, color: '#8C8C8C', marginTop: 2 }}>{label}</div>
    </div>
  )
}

export default function MeetingStatCards({ items, loading }: { items: StatItem[]; loading?: boolean }) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${Math.max(items.length, 1)}, 1fr)`,
        gap: 16,
        marginBottom: 16,
      }}
    >
      {items.map(item => (
        <StatCard key={item.label} loading={loading} {...item} />
      ))}
    </div>
  )
}
