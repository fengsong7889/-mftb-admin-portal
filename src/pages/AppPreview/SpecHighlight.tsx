/**
 * SpecField 联动高亮系统
 *
 * 用法：
 * - 卡片内：<SpecField panel="groupBuy" id={6}>半年售标签</SpecField> → 自动注册 data-spec-id
 * - 表格 hover 某行 → setHighlight(id) → 对应 SpecField 加流光描边
 * - 作用域：panel 只在说明面板切到对应瀑布流时才响应高亮（右侧看团购说明时，外卖卡不亮）
 * - 增删字段：config 加/删一条 + JSX 加/去 <SpecField> 即可，无需手动同步
 */
import { createContext, useContext, useState, type ReactNode } from 'react'
import type { SpecPanelKey } from './groupBuySpec'

/** Context：当前高亮字段 ID + 高亮作用面板（null/未匹配面板 = 无高亮） */
const HighlightContext = createContext<{
  highlightId: number | null
  scope: SpecPanelKey | null
  setHighlight: (id: number | null) => void
}>({ highlightId: null, scope: null, setHighlight: () => {} })

export function useHighlightProvider(scope: SpecPanelKey) {
  const [highlightId, setHighlight] = useState<number | null>(null)
  return { highlightId, scope, setHighlight }
}

export function HighlightProvider({ value, children }: {
  value: { highlightId: number | null; scope: SpecPanelKey | null; setHighlight: (id: number | null) => void }
  children: ReactNode
}) {
  return <HighlightContext.Provider value={value}>{children}</HighlightContext.Provider>
}

export { HighlightContext }

/**
 * 包裹卡片字段，hover 表格时自动高亮（用 display:contents 不影响布局）。
 * panel 标记字段所属瀑布流：仅当说明面板切到同一瀑布流时才响应高亮。
 */
export function SpecField({ panel, id, children }: { panel: SpecPanelKey; id: number; children: ReactNode }) {
  const { highlightId, scope } = useContext(HighlightContext)
  const isHighlighted = highlightId === id && scope === panel
  return (
    <span
      className={`apf-spec-field${isHighlighted ? ' is-highlighted' : ''}`}
      data-spec-id={id}
      style={{ display: 'contents' }}
    >
      {children}
    </span>
  )
}
