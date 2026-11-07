/**
 * SpecField 联动高亮系统
 *
 * 用法：
 * - 卡片内：<SpecField id={6}>半年售标签</SpecField> → 自动注册 data-spec-id
 * - 表格 hover 某行 → setHighlight(id) → 对应 SpecField 加蓝色描边
 * - 增删字段：config 加/删一条 + JSX 加/去 <SpecField> 即可，无需手动同步
 */
import { createContext, useContext, useState, type ReactNode } from 'react'

/** 当前高亮的字段 ID（null = 无高亮） */
const HighlightContext = createContext<{
  highlightId: number | null
  setHighlight: (id: number | null) => void
}>({ highlightId: null, setHighlight: () => {} })

export function useHighlightProvider() {
  const [highlightId, setHighlight] = useState<number | null>(null)
  return { highlightId, setHighlight }
}

export function HighlightProvider({ value, children }: { value: { highlightId: number | null; setHighlight: (id: number | null) => void }; children: ReactNode }) {
  return <HighlightContext.Provider value={value}>{children}</HighlightContext.Provider>
}

export { HighlightContext }

/** 包裹卡片字段，hover 表格时自动高亮（用 display:contents 不影响布局） */
export function SpecField({ id, children }: { id: number; children: ReactNode }) {
  const { highlightId } = useContext(HighlightContext)
  const isHighlighted = highlightId === id
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
