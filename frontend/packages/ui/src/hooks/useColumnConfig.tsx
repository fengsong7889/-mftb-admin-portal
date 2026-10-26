import { useState, useCallback, useMemo, useEffect } from 'react'
import TableColumnConfig, {
  type ColumnConfig,
  applyColumnConfig,
  isSameColumnConfig,
  mergeColumnConfigs,
} from '@/components/TableColumnConfig'

/**
 * 从 localStorage 读取已保存的列配置，并与最新列定义合并。
 * <p>合并口径统一由 mergeColumnConfigs 负责：补齐页面新增列（如「所屬迭代」）、
 * 剔除已下线列、保留用户显隐与顺序，避免新列在存量用户的列表/列配置里永久缺失。
 */
function loadSavedConfig(storageKey: string | undefined, defaults: ColumnConfig[]): ColumnConfig[] {
  if (!storageKey) return defaults
  try {
    const saved = localStorage.getItem(`table-config-${storageKey}`)
    if (!saved) return defaults
    const parsed = JSON.parse(saved) as ColumnConfig[]
    if (!Array.isArray(parsed) || parsed.length === 0) return defaults
    const merged = mergeColumnConfigs(parsed, defaults)
    // 合并结果与本地存量不一致（补了新列 / 删了旧列）就写回：
    // 否则列配置抽屉会反复读到缺列的旧配置，用户操作一次就把新列抹回表格
    if (!isSameColumnConfig(parsed, merged)) {
      localStorage.setItem(`table-config-${storageKey}`, JSON.stringify(merged))
    }
    // 安全检查：如果可见列过少（少于 2 列），说明配置异常，回退到默认配置
    if (merged.filter(c => c.visible).length < 2) {
      localStorage.removeItem(`table-config-${storageKey}`)
      return defaults
    }
    return merged
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

  // 当可用列发生变化时（如新增/删除列、语言切换改标题），同步更新 config 状态：
  // 合并口径统一走 mergeColumnConfigs，保留用户已保存的顺序与显隐
  useEffect(() => {
    setConfig(prev => {
      const next = mergeColumnConfigs(prev, initialConfig)
      return isSameColumnConfig(prev, next) ? prev : next
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

  // applyConfig 严格依赖 config 状态，确保保存后立即生效
  const applyConfig = useMemo(
    () => (tableColumns: unknown[]) => applyColumnConfig(tableColumns, config),
    [config]
  )

  return { 
    config, 
    configComponent, 
    columns: configuredColumns,
    applyConfig,
  }
}

export type { ColumnConfig }
