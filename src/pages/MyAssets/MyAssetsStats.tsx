/**
 * 我的资产 — 个人统计卡片
 *
 * 借用/耗材页签复用领用统计卡（claim-stat）样式，保持三类资产卡片视觉与交互一致。
 * value 为 undefined 表示接口未成功返回，显示 — 而非伪造 0。
 */
import type { ReactNode } from 'react'
import AnimatedNumber from '../../components/AnimatedNumber'

export interface MyAssetsStatItem {
  key: string
  label: string
  value?: number
  icon: ReactNode
  color: string
  background: string
}

interface Props {
  items: MyAssetsStatItem[]
  /** 切换口径时强制重挂载，避免残留上一次的计数动画 */
  scopeKey?: string
  ariaLabel: string
}

export default function MyAssetsStats({ items, scopeKey, ariaLabel }: Props) {
  return (
    <div className="claim-stats" key={scopeKey} aria-label={ariaLabel}>
      {items.map((item) => (
        <div
          key={item.key}
          className="claim-stat"
          style={{ color: item.color, background: item.background, borderColor: `${item.color}22` }}
        >
          <div className="claim-stat-icon">{item.icon}</div>
          <div className="claim-stat-value" aria-label={`${item.label}：${item.value ?? '尚未加載'}`}>
            {item.value === undefined ? '—' : <AnimatedNumber value={item.value} />}
          </div>
          <div className="claim-stat-label">{item.label}</div>
        </div>
      ))}
    </div>
  )
}
