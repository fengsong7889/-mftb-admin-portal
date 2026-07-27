import { useCallback, useMemo, useRef, useState } from 'react'
import type { DragEvent } from 'react'

/** 卡片拖拽時附加到卡片容器上的屬性 */
export interface CardDragProps {
  draggable: boolean
  onDragStart: (e: DragEvent<HTMLDivElement>) => void
  onDragOver: (e: DragEvent<HTMLDivElement>) => void
  onDrop: (e: DragEvent<HTMLDivElement>) => void
  onDragEnd: () => void
}

/** 讀取本地保存的卡片順序 */
const readSavedOrder = (storageKey: string): number[] => {
  try {
    const raw = localStorage.getItem(storageKey)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed)) {
        return parsed.filter((v): v is number => typeof v === 'number')
      }
    }
  } catch {
    // 解析失敗時忽略，使用默認順序
  }
  return []
}

/**
 * 卡片拖拽排序 Hook
 *
 * 支持用戶拖動卡片交換位置，交換後順序自動保存到 localStorage，
 * 下次打開頁面時按保存的順序展示。
 *
 * @param storageKey  localStorage 存儲鍵（每個頁面/Tab 使用獨立的 key）
 * @param defaultTypes 該卡片組默認的類型順序（新增類型會自動追加到末尾）
 */
export function useCardOrder(storageKey: string, defaultTypes: number[]) {
  const [savedOrder, setSavedOrder] = useState<number[]>(() => readSavedOrder(storageKey))
  const dragTypeRef = useRef<number | null>(null)

  /** 合併後的實際順序：已保存順序（過濾失效類型）+ 未保存過的新類型 */
  const cardOrder = useMemo(() => {
    const valid = savedOrder.filter(t => defaultTypes.includes(t))
    const rest = defaultTypes.filter(t => !valid.includes(t))
    return [...valid, ...rest]
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [savedOrder, defaultTypes.join(',')])

  /** 按保存的順序對卡片數組排序 */
  const sortCards = useCallback(<T,>(items: T[], getType: (item: T) => number): T[] => {
    return [...items].sort((a, b) => cardOrder.indexOf(getType(a)) - cardOrder.indexOf(getType(b)))
  }, [cardOrder])

  /** 交換兩張卡片位置並持久化到 localStorage */
  const swapCards = useCallback((fromType: number, toType: number) => {
    const next = [...cardOrder]
    const fromIdx = next.indexOf(fromType)
    const toIdx = next.indexOf(toType)
    if (fromIdx === -1 || toIdx === -1 || fromIdx === toIdx) return
    ;[next[fromIdx], next[toIdx]] = [next[toIdx], next[fromIdx]]
    setSavedOrder(next)
    try {
      localStorage.setItem(storageKey, JSON.stringify(next))
    } catch {
      // 存儲失敗（如隱私模式）時僅保留本次會話內的順序
    }
  }, [cardOrder, storageKey])

  /** 生成卡片的拖拽屬性，直接展開到卡片容器 div 上 */
  const getDragProps = useCallback((type: number): CardDragProps => ({
    draggable: true,
    onDragStart: (e: DragEvent<HTMLDivElement>) => {
      dragTypeRef.current = type
      e.dataTransfer.effectAllowed = 'move'
    },
    onDragOver: (e: DragEvent<HTMLDivElement>) => {
      e.preventDefault()
      e.dataTransfer.dropEffect = 'move'
    },
    onDrop: (e: DragEvent<HTMLDivElement>) => {
      e.preventDefault()
      if (dragTypeRef.current !== null && dragTypeRef.current !== type) {
        swapCards(dragTypeRef.current, type)
      }
      dragTypeRef.current = null
    },
    onDragEnd: () => {
      dragTypeRef.current = null
    },
  }), [swapCards])

  return { sortCards, getDragProps }
}
