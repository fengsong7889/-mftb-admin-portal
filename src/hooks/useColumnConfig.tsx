import { useState, useCallback, useMemo } from 'react'
import TableColumnConfig, { type ColumnConfig, applyColumnConfig } from '../components/TableColumnConfig'

/**
 * 表格列配置 hook - 简化 TableColumnConfig 集成
 * 
 * @param pageKey - 页面唯一标识
 * @param allColumns - 原始 columns 定义 (含 key + title)
 * @param defaultConfig - 默认配置（可选）
 * @returns { configuredColumns, configComponent }
 */
export function useColumnConfig(
  pageKey: string,
  allColumns: { key: string; title: string }[],
  defaultConfig?: Partial<ColumnConfig>[]
) {
  // 初始配置
  const initialConfig = useMemo<ColumnConfig[]>(() => {
    return allColumns.map((col, idx) => {
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

  return { config, configComponent, applyConfig: (tableColumns: any[]) => applyColumnConfig(tableColumns, config) }
}

export type { ColumnConfig }
