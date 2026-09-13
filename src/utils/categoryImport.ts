import ExcelJS from 'exceljs'

/**
 * 资产分类批量导入工具
 *
 * 提供 Excel 解析、模板下载能力，供分类导入弹窗使用。
 * 解析兼容简/繁两种表头文案（分类编码/分類編碼、状态/狀態 等），
 * 以适配运营侧从不同来源导出的表格。
 */

/** 解析后的单条分类数据 */
export interface ParsedCategoryRow {
  code: string
  name: string
  parentCode?: string
  status: 'enabled' | 'disabled'
  remark?: string
  /** 行号（从 2 开始，用于错误提示） */
  rowNo: number
}

/** 解析结果 */
export interface ParsedCategoryExcel {
  rows: ParsedCategoryRow[]
  errors: string[]
}

/** 状态文本映射（兼容简体/繁体/英文） */
const STATUS_MAP: Record<string, 'enabled' | 'disabled'> = {
  '启用': 'enabled',
  '啟用': 'enabled',
  'enabled': 'enabled',
  '停用': 'disabled',
  'disabled': 'disabled',
}

/**
 * 解析分类导入 Excel 文件
 *
 * 期望表头：分类编码 | 分类名称 | 上级分类编码 | 状态 | 备注
 * 表头兼容繁体别名（分類編碼 / 分類名稱 / 上級分類編碼 / 狀態 / 備註）。
 *
 * @param file 用户选择的 Excel 文件（.xlsx / .xls）
 * @returns 解析结果：rows 为有效数据，errors 为错误提示集合
 */
export async function parseCategoryExcel(file: File): Promise<ParsedCategoryExcel> {
  const buffer = await file.arrayBuffer()
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(buffer)
  const ws = wb.worksheets[0]
  if (!ws) return { rows: [], errors: ['文件无有效工作表'] }
  // 转为二维数组，保持与原逻辑一致
  const rows: unknown[][] = []
  ws.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    const cells: unknown[] = []
    row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      cells[colNumber - 1] = cell.value
    })
    // 补齐列数
    while (cells.length < (ws.columnCount || 1)) cells.push(null)
    rows[rowNumber - 1] = cells
  })

  const result: ParsedCategoryExcel = { rows: [], errors: [] }

  if (rows.length < 2) {
    result.errors.push('文件无有效数据行')
    return result
  }

  // 解析表头，找到各列索引（同时兼容简/繁两种表头文案）
  const header = rows[0].map(h => String(h ?? '').trim())
  const colIndex = {
    code: header.findIndex(h => h.includes('分类编码') || h.includes('分類編碼') || h === 'code'),
    name: header.findIndex(h => h.includes('分类名称') || h.includes('分類名稱') || h === 'name'),
    parentCode: header.findIndex(h => h.includes('上级分类编码') || h.includes('上級分類編碼') || h.includes('parentCode')),
    status: header.findIndex(h => h.includes('状态') || h.includes('狀態') || h === 'status'),
    remark: header.findIndex(h => h.includes('备注') || h.includes('備註') || h === 'remark'),
  }

  if (colIndex.code === -1 || colIndex.name === -1) {
    result.errors.push('表头缺少必要列：分类编码、分类名称')
    return result
  }

  // 逐行解析数据
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i]
    if (!row || row.every(cell => cell == null || String(cell).trim() === '')) continue

    const code = colIndex.code >= 0 ? String(row[colIndex.code] ?? '').trim() : ''
    const name = colIndex.name >= 0 ? String(row[colIndex.name] ?? '').trim() : ''
    const parentCode = colIndex.parentCode >= 0 ? String(row[colIndex.parentCode] ?? '').trim() : undefined
    const statusText = colIndex.status >= 0 ? String(row[colIndex.status] ?? '').trim() : ''
    const remark = colIndex.remark >= 0 ? String(row[colIndex.remark] ?? '').trim() : undefined

    const rowNo = i + 1
    const errors: string[] = []

    if (!code) errors.push(`第${rowNo}行：分类编码不能为空`)
    if (!name) errors.push(`第${rowNo}行：分类名称不能为空`)

    let status: 'enabled' | 'disabled' = 'enabled'
    if (statusText) {
      const mapped = STATUS_MAP[statusText]
      if (!mapped) {
        errors.push(`第${rowNo}行：状态「${statusText}」无效，应为「启用/停用」`)
      } else {
        status = mapped
      }
    }

    if (errors.length > 0) {
      result.errors.push(...errors)
    } else {
      result.rows.push({ code, name, parentCode: parentCode || undefined, status, remark: remark || undefined, rowNo })
    }
  }

  return result
}

/**
 * 生成分类导入模板（返回 object URL，调用方需在使用后 revokeObjectURL）
 *
 * @returns 模板文件的 blob URL
 */
export async function generateCategoryImportTemplate(): Promise<string> {
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet('分类导入模板')
  ws.columns = [
    { header: '分类编码', key: 'code', width: 14 },
    { header: '分类名称', key: 'name', width: 16 },
    { header: '上级分类编码', key: 'parentCode', width: 16 },
    { header: '状态', key: 'status', width: 10 },
    { header: '备注', key: 'remark', width: 20 },
  ]
  ws.addRow({ code: '10001', name: '电子设备', parentCode: '', status: '启用', remark: '' })
  const buf = await wb.xlsx.writeBuffer()
  const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  return URL.createObjectURL(blob)
}
