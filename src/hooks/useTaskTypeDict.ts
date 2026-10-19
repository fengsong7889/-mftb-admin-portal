import { useCallback, useEffect, useMemo, useState } from 'react'
import { fetchTaskTypeOptions, type RdmTaskTypeOption } from '../api/rdmTaskType'
import { RDM_TASK_TYPE_COLOR, RDM_TASK_TYPE_LABEL, type RdmTaskType } from '../constants/rdm'

/**
 * 任务类型字典 Hook（业务可配置）。
 * <p>模块级 Promise 缓存：字典极小且跨页共享，同一会话只拉一次；
 * 管理页保存/启停后调 {@link invalidateTaskTypeDict} 失效，下次挂载重新拉取。
 * <p>接口失败时降级为内置常量兜底（labelOf/colorOf 的 ?? 链），保证离线/后端未升级时界面仍可读。
 */

let cachePromise: Promise<RdmTaskTypeOption[]> | null = null

/** 管理页写操作成功后调用：清空缓存，让下一次 useTaskTypeDict 重新拉取 */
export function invalidateTaskTypeDict() {
  cachePromise = null
}

export function useTaskTypeDict() {
  const [items, setItems] = useState<RdmTaskTypeOption[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let alive = true
    if (!cachePromise) {
      cachePromise = fetchTaskTypeOptions().catch(err => {
        // 失败即释放缓存：下次挂载可以重试，不让一次抖动把整个会话锁死
        cachePromise = null
        throw err
      })
    }
    cachePromise
      .then(list => { if (alive) setItems(list) })
      .catch(() => { if (alive) setItems([]) })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [])

  /** 下拉选项（value=code, label=显示名），按后端 sort_order 返回顺序 */
  const options = useMemo(() => items.map(i => ({ value: i.code, label: i.label })), [items])

  /** 标签：字典 label → 内置常量 → code 原文（未知 code 可读，与后端 taskTypeLabel 口径一致） */
  const labelOf = useCallback((code?: string | null): string => {
    if (!code) return ''
    return items.find(i => i.code === code)?.label
      ?? RDM_TASK_TYPE_LABEL[code as RdmTaskType]
      ?? code
  }, [items])

  /** 颜色：字典 color → 内置常量 → 中性灰（图例用） */
  const colorOf = useCallback((code?: string | null): string => {
    if (!code) return '#8C8C8C'
    return items.find(i => i.code === code)?.color
      ?? RDM_TASK_TYPE_COLOR[code as RdmTaskType]
      ?? '#8C8C8C'
  }, [items])

  return { items, options, labelOf, colorOf, loading }
}
