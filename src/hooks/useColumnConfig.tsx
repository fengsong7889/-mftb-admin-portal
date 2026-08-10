import { useState, useCallback, useMemo, useEffect } from 'react'
import TableColumnConfig, { type ColumnConfig, applyColumnConfig } from '../components/TableColumnConfig'

/** 从 localStorage 读取已保存的列配置（按保存顺序） */
function loadSavedConfig(storageKey: string | undefined, defaults: ColumnConfig[]): ColumnConfig[] {
  if (!storageKey) return defaults
  try {
    const saved = localStorage.getItem(`table-config-${storageKey}`)
    if (saved) {
      const parsed = JSON.parse(saved) as ColumnConfig[]
      if (Array.isArray(parsed) && parsed.length > 0) {
        // 以保存的顺序为基准，补齐新增列、移除已删除列
        const defaultKeys = new Set(defaults.map(c => c.key))
        const result: ColumnConfig[] = []
        // 先按保存顺序排列
        for (const savedItem of parsed) {
          const def = defaults.find(d => d.key === savedItem.key)
          if (def) {
            result.push({
              ...savedItem,
              title: def.title, // 标题跟随最新（可能因语言切换而变化）
              locked: savedItem.locked ?? def.locked ?? null,
            })
          }
        }
        // 新增列追加到末尾（非锁定区域末端）
        for (const def of defaults) {
          if (!result.some(r => r.key === def.key)) {
            result.push({ key: def.key, title: def.title, visible: true, locked: def.locked ?? null })
          }
        }
        return result
      }
    }
  } catch { /* ignore */ }
  return defaults
}

/**
 * 表格列配置 hook - 简化 TableColumnConfig 集成
 * 
 * @param pageKey - 页面唯一标识（用于localStorage存储）
 * @param allColumns - 原始 columns 定义 (含 key + title)
 * @param defaultConfig - 默认配置（可选）
 * @returns { config, configComponent, applyConfig, columns }
 * 
 * @example
 * // 最简用法
 * const { columns, configComponent } = useColumnConfig('page-key', [
 *   { key: 'id', title: 'ID' },
 *   { key: 'name', title: '名称' },
 *   { key: 'action', title: '操作' },
 * ])
 * 
 * // 带锁定字段
 * const { columns, configComponent } = useColumnConfig('page-key', columns, [
 *   { key: 'action', visible: true, locked: 'tail' },
 * ])
 * 
 * // 在 JSX 中使用
 * <div>
 *   <Button>新增</Button>
 *   {configComponent}
 *   <Table columns={columns} ... />
 * </div>
 */
export function useColumnConfig(
  pageKey: string,
  allColumns: { key: string; title: string }[],
  defaultConfig?: Partial<ColumnConfig>[]
) {
  // 初始配置（默认值）
  const initialConfig = useMemo<ColumnConfig[]>(() => {
    return allColumns.map((col) => {
      const override = defaultConfig?.find(d => d.key === col.key)
      return {
        key: col.key,
        title: col.title,
        visible: override?.visible ?? true,
        locked: override?.locked ?? null,
      }
    })
  }, [allColumns, defaultConfig])

  // 从 localStorage 读取已保存的列顺序作为初始值，保证刷新后顺序不丢失
  const [config, setConfig] = useState<ColumnConfig[]>(() =>
    loadSavedConfig(pageKey, initialConfig)
  )

  // 当可用列发生变化时（如新增/删除语言列），同步更新 config 状态：
  // 移除已不存在的列配置，保留已有列的可见性/锁定/顺序设置，新增列默认可见
  useEffect(() => {
    setConfig(prev => {
      const prevKeys = new Set(prev.map(c => c.key))
      const initialKeys = new Set(initialConfig.map(c => c.key))

      // 检查是否需要更新（列集合有变化）
      const needsUpdate =
        prevKeys.size !== initialKeys.size ||
        [...initialKeys].some(k => !prevKeys.has(k))

      if (!needsUpdate) {
        // 仅更新标题（可能因语言切换而变化），保持顺序不变
        const titleChanged = prev.some(p => {
          const ic = initialConfig.find(c => c.key === p.key)
          return ic && ic.title !== p.title
        })
        if (!titleChanged) return prev
        return prev.map(p => {
          const ic = initialConfig.find(c => c.key === p.key)
          return ic ? { ...p, title: ic.title } : p
        })
      }

      // 列集合有变化：按 prev 顺序保留已有列，新增列追加到末尾
      const synced: ColumnConfig[] = []
      for (const p of prev) {
        if (initialKeys.has(p.key)) {
          const ic = initialConfig.find(c => c.key === p.key)
          synced.push({ ...p, title: ic?.title ?? p.title })
        }
      }
      for (const ic of initialConfig) {
        if (!prevKeys.has(ic.key)) {
          synced.push({ key: ic.key, title: ic.title, visible: true, locked: ic.locked ?? null })
        }
      }
      return synced
    })
  }, [initialConfig])

  const handleChange = useCallback((newConfig: ColumnConfig[]) => {
    setConfig(newConfig)
  }, [])

  // 配置组件
  const configComponent = (
    <TableColumnConfig
      columns={initialConfig}
      onChange={handleChange}
      storageKey={pageKey}
    />
  )

  // 应用配置到表格列
  const columns = useMemo(() => {
    return allColumns.map(col => ({ 
      key: col.key,
      title: col.title,
      dataIndex: col.key 
    }))
  }, [allColumns])

  const configuredColumns = useMemo(() => {
    return applyColumnConfig(columns, config)
  }, [columns, config])

  return { 
    config, 
    configComponent, 
    columns: configuredColumns,
    applyConfig: (tableColumns: unknown[]) => applyColumnConfig(tableColumns, config) 
  }
}

export type { ColumnConfig }
