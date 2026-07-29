/**
 * 前端導出 CSV 工具函數
 * 導出的 CSV 可直接用 Excel 打開
 */

/** 列定義 */
export interface ExportColumn {
  /** 表頭顯示文字 */
  title: string
  /** 對應 dataSource 中的 key */
  dataIndex: string | string[]
  /** 自定義渲染函數（可選） */
  render?: (value: any, record: any) => string
}

/**
 * 將表格數據導出為 CSV 文件
 */
export function exportToCSV(
  filename: string,
  columns: ExportColumn[],
  dataSource: any[],
) {
  // 構建表頭
  const headers = columns.map(col => col.title)

  // 構建行數據
  const rows = dataSource.map(record =>
    columns.map(col => {
      // 支持嵌套路徑如 ['a', 'b']
      const value = Array.isArray(col.dataIndex)
        ? col.dataIndex.reduce((obj, key) => obj?.[key], record)
        : record[col.dataIndex]

      // 自定義渲染
      if (col.render) {
        return col.render(value, record)
      }

      // 空值處理
      if (value === null || value === undefined) return ''
      return String(value)
    }),
  )

  // 組合 CSV 內容（加 BOM 以支持 Excel 打開中文）
  const csvContent = [
    headers.join(','),
    ...rows.map(row =>
      row.map(cell => {
        // 如果內容包含逗號、雙引號或換行，需用雙引號包裹
        const escaped = String(cell).replace(/"/g, '""')
        return `"${escaped}"`
      }).join(','),
    ),
  ].join('\n')

  const BOM = '\uFEFF'
  const blob = new Blob([BOM + csvContent], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)

  const link = document.createElement('a')
  link.href = url
  link.download = `${filename}.csv`
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}
