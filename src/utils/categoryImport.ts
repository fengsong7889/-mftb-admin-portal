import * as XLSX from 'xlsx'

/** 解析後的單條分類數據 */
export interface ParsedCategoryRow {
  code: string
  name: string
  parentCode?: string
  status: 'enabled' | 'disabled'
  remark?: string
  /** 行號（從 2 開始，用於錯誤提示） */
  rowNo: number
}

/** 解析結果 */
export interface ParsedCategoryExcel {
  rows: ParsedCategoryRow[]
  errors: string[]
}

/** 狀態文本映射 */
const STATUS_MAP: Record<string, 'enabled' | 'disabled'> = {
  '启用': 'enabled',
  '啟用': 'enabled',
  'enabled': 'enabled',
  '停用': 'disabled',
  'disabled': 'disabled',
}

/**
 * 解析分類導入 Excel 文件
 * 期望表頭：分类编码 | 分类名称 | 上级分类编码 | 状态 | 备注
 */
export async function parseCategoryExcel(file: File): Promise<ParsedCategoryExcel> {
  const buffer = await file.arrayBuffer()
  const wb = XLSX.read(buffer, { cellDates: true })
  const sheet = wb.Sheets[wb.SheetNames[0]]
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: true, defval: null })

  const result: ParsedCategoryExcel = { rows: [], errors: [] }

  if (rows.length < 2) {
    result.errors.push('文件無有效數據行')
    return result
  }

  // 解析表頭，找到各列索引
  const header = rows[0].map(h => String(h ?? '').trim())
  const colIndex = {
    code: header.findIndex(h => h.includes('分类编码') || h.includes('分類編碼') || h === 'code'),
    name: header.findIndex(h => h.includes('分类名称') || h.includes('分類名稱') || h === 'name'),
    parentCode: header.findIndex(h => h.includes('上级分类编码') || h.includes('上級分類編碼') || h.includes('parentCode')),
    status: header.findIndex(h => h.includes('状态') || h.includes('狀態') || h === 'status'),
    remark: header.findIndex(h => h.includes('备注') || h.includes('備註') || h === 'remark'),
  }

  if (colIndex.code === -1 || colIndex.name === -1) {
    result.errors.push('表頭缺少必要列：分类编码、分类名称')
    return result
  }

  // 逐行解析數據
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

    if (!code) errors.push(`第${rowNo}行：分类编码不能為空`)
    if (!name) errors.push(`第${rowNo}行：分类名称不能為空`)

    let status: 'enabled' | 'disabled' = 'enabled'
    if (statusText) {
      const mapped = STATUS_MAP[statusText]
      if (!mapped) {
        errors.push(`第${rowNo}行：狀態「${statusText}」無效，應為「启用/停用」`)
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

/** 生成下載模板（返回 base64 data URL） */
export function generateCategoryImportTemplate(): string {
  const wb = XLSX.utils.book_new()
  const header = ['分类编码', '分类名称', '上级分类编码', '状态', '备注']
  const example = ['10001', '電子設備', '', '启用', '']
  const ws = XLSX.utils.aoa_to_sheet([header, example])

  // 設置列寬
  ws['!cols'] = [
    { wch: 14 },
    { wch: 16 },
    { wch: 16 },
    { wch: 10 },
    { wch: 20 },
  ]

  XLSX.utils.book_append_sheet(wb, ws, '分類導入模板')
  const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' })
  const blob = new Blob([wbout], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  return URL.createObjectURL(blob)
}
