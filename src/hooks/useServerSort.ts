import { useCallback, useState } from 'react'

/** 服务端排序状态：列 key + antd 的方向（ascend/descend）。空对象 = 后端默认排序。 */
export interface SortState {
  field?: string
  order?: string
}

/**
 * antd Table onChange 传回的 sorter 的极小结构视图。
 * <p>不直接标 `SorterResult<T>`：不同页的 Table 泛型不同，`SorterResult<A>` 与
 * `SorterResult<B>` 因 `column?: ColumnType<T>` 不变而互不可赋值；这里只取 order/field/columnKey
 * 三个实际用到的字段，避免无谓的泛型不兼容。
 */
type SorterLike = { order?: string | null; field?: unknown; columnKey?: unknown }

/**
 * 列表页服务端排序的公共状态与 sorter 归一化。
 * <p>列上的 `sorter: true` 只让表头可点，真正的排序交给后端（列表按 page/size 分页，
 * 客户端排只会排当前页、误导用户）；本 hook 负责把 antd 的 sorter 事件归一化成
 * `{ field, order }`，并告诉调用方「本次是否发生排序变化」以便把页码重置回第 1 页。
 */
export function useServerSort() {
  const [sort, setSort] = useState<SortState>({})

  /** @returns 排序是否发生变化（变化时调用方应回到第 1 页） */
  const applySorter = useCallback((
    sorter: SorterLike | SorterLike[],
  ): boolean => {
    const s = Array.isArray(sorter) ? sorter[0] : sorter
    const nextField = s?.order ? String(s.field ?? s.columnKey ?? '') : undefined
    const nextOrder = s?.order ?? undefined
    const changed = nextField !== sort.field || nextOrder !== sort.order
    if (changed) {
      setSort({ field: nextField, order: nextOrder })
    }
    return changed
  }, [sort])

  return { sort, applySorter }
}
