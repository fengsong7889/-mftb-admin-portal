import { useState, useCallback, useMemo, useEffect } from 'react'
import TableColumnConfig, { type ColumnConfig, applyColumnConfig } from '../components/TableColumnConfig'

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
  // 初始配置
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

  const [config, setConfig] = useState<ColumnConfig[]>(initialConfig)

  // 当可用列发生变化时（如删除语言列），同步更新 config 状态：
  // 移除已不存在的列配置，保留已有列的可见性/锁定设置，新增列默认可见
  useEffect(() => {
    setConfig(prev => {
      const synced = initialConfig.map(col => {
        const existing = prev.find(c => c.key === col.key)
        if (existing) return { ...existing, title: col.title }
        return { key: col.key, title: col.title, visible: true, locked: null }
      })
      // 仅当配置实际发生变化时才更新，避免不必要的重渲染
      if (synced.length !== prev.length || synced.some((c, i) => c.key !== prev[i]?.key)) {
        return synced
      }
      return prev
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
