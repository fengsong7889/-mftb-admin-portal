import { useState, type ReactNode } from 'react'
import AnimatedNumber from './AnimatedNumber'
import { STAT_COLORS, type StatColorKey } from '../constants/statCard'

export interface StatCardItem {
  key: string
  icon: ReactNode
  /** 數值；傳 number 時走計數動畫，傳 string（日期/百分比等）時直接展示 */
  value: number | string
  label: string
  color: StatColorKey
  prefix?: string
  suffix?: string
  decimals?: number
  /** 下鑽：傳入則卡片可點擊（按該口徑篩選/跳轉），並獲得 keyboard 可達性 */
  onClick?: () => void
  /** 當前下鑽口徑已選中（用於高亮） */
  active?: boolean
  /** 無障礙標題（可點擊卡片建議傳入，說明點擊後的去向） */
  title?: string
}

function StatCard({ item }: { item: StatCardItem }) {
  const [hover, setHover] = useState(false)
  const { main, bg } = STAT_COLORS[item.color]
  const clickable = typeof item.onClick === 'function'

  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onClick={clickable ? item.onClick : undefined}
      onKeyDown={clickable ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); item.onClick?.() } } : undefined}
      role={clickable ? 'button' : undefined}
      tabIndex={clickable ? 0 : undefined}
      title={item.title}
      aria-pressed={clickable ? !!item.active : undefined}
      style={{
        borderRadius: 12,
        padding: 16,
        background: bg,
        border: `1px solid ${item.active ? main : `${main}22`}`,
        textAlign: 'center',
        position: 'relative',
        overflow: 'hidden',
        cursor: clickable ? 'pointer' : 'default',
        transition: 'all 0.35s cubic-bezier(0.4, 0, 0.2, 1)',
        transform: hover ? 'translateY(-4px)' : 'translateY(0)',
        boxShadow: hover ? '0 8px 24px rgba(0,0,0,0.1)' : (item.active ? `0 0 0 2px ${main}33` : 'none'),
      }}
    >
      <div style={{ fontSize: 20, color: main, lineHeight: 1 }}>{item.icon}</div>
      <div style={{ fontSize: 22, fontWeight: 700, color: main, margin: '8px 0 4px' }}>
        {typeof item.value === 'number'
          ? (
            <AnimatedNumber
              value={item.value}
              prefix={item.prefix}
              suffix={item.suffix}
              decimals={item.decimals}
            />
          )
          : <>{item.prefix}{item.value}{item.suffix}</>}
      </div>
      <div style={{ fontSize: 12, color: '#8C8C8C' }}>{item.label}</div>
    </div>
  )
}

/**
 * 數據指標統計卡片組（設計規範 §B.7 強制標準）
 * - 三段式結構：圖標 20px → 數值 22px/700 → 標籤 12px/#8C8C8C
 * - hover translateY(-4px) + 陰影，過渡 0.35s
 * - 數值走 useCountUp 計數動畫
 *
 * @param animationKey 切換查詢對象時傳入變化的 key，用於重新觸發計數動畫
 * @param columns 網格列數；§B.7 標準為 4 格（`repeat(4, 1fr)`）。
 *                默認沿用歷史行為（按卡片數等分），僅在頁面明確對齊標準時傳 4，
 *                避免改默認值一次性衝擊其餘已上線頁面的卡寬。
 */
export default function StatCards({
  items,
  animationKey,
  columns,
}: {
  items: StatCardItem[]
  animationKey?: string | number
  columns?: number
}) {
  return (
    <div
      key={animationKey}
      style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${columns ?? items.length}, 1fr)`,
        gap: 16,
      }}
    >
      {items.map(item => <StatCard key={item.key} item={item} />)}
    </div>
  )
}
