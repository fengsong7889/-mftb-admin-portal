/**
 * 打卡导入解析（前端解析 Excel → 结构化行 → 后端只校验与入库）。
 *
 * 为什么在后端之外解析：后端 `POST /attendance/punches/import` 只认结构化行
 * （{empNo, punchAt, punchType, location}），列顺序与表头别名属界面约定，
 * 放前端才能让「上传 → 校验 → 预览 → 入库」的向导在入库前就把错误行指出来，
 * 而不是等提交后由后端逐行回错。与 categoryImport.ts 同一套 exceljs 用法。
 *
 * 幂等由后端保证：唯一键 (user_id, punch_at, source)，重复导入不会长出重复打卡。
 */
import ExcelJS from 'exceljs'
import i18n from '../../i18n'
import type { PunchImportRow } from '../../api/attendance'

export interface ParsedPunchExcel {
  rows: PunchImportRow[]
  /** 行级错误：带 Excel 行号，用户能直接定位到源文件那一行 */
  errors: string[]
}

/** 表头别名：简繁与英文都要认，否则用户拿旧模板导入会整表报「缺少列」 */
const HEADER_ALIASES = {
  empNo: ['工號', '工号', 'empno', 'emp no', '員工工號'],
  punchAt: ['打卡時間', '打卡时间', 'punchat', 'punch time', '時間'],
  punchType: ['卡別', '卡别', 'punchtype', '類型', '类型'],
  location: ['打卡地點', '打卡地点', 'location', '地點', '地点'],
}

/** 单次导入上限，与后端 MAX_IMPORT_ROWS 一致：超过让前端拆文件，不要一次吃满连接与内存 */
const MAX_ROWS = 5000

/** 卡别文案 → 后端码值（1=上班卡 2=下班卡） */
function parsePunchType(raw: unknown): number | null {
  const text = String(raw ?? '').trim().toLowerCase()
  if (!text) return null
  if (text.includes('上班') || text === 'on' || text === '1' || text.includes('in')) return 1
  if (text.includes('下班') || text === 'off' || text === '2' || text.includes('out')) return 2
  const numeric = Number(text)
  return numeric === 1 || numeric === 2 ? numeric : null
}

/**
 * Excel 的时间单元格可能是 Date、exceljs 的日期对象或字符串。
 * 统一输出后端要的 `yyyy-MM-dd HH:mm:ss`；解析不出来就报错而不是猜。
 */
function formatPunchAt(raw: unknown): string | null {
  if (raw == null || raw === '') return null
  let date: Date | null = null
  if (raw instanceof Date) {
    date = raw
  } else if (typeof raw === 'object' && raw !== null && 'toDate' in raw) {
    // exceljs 的富文本/日期包装对象
    const candidate = (raw as { toDate?: () => Date }).toDate?.()
    if (candidate instanceof Date) date = candidate
  }
  if (date) {
    const pad = (n: number) => String(n).padStart(2, '0')
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} `
      + `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
  }
  const text = String(raw).trim().replace('T', ' ').replace(/\.\d+$/, '')
  // 只补秒：yyyy-MM-dd HH:mm 与 yyyy/MM/dd HH:mm:ss 都接受，其它形态一律拒绝
  const normalized = text.replace(/\//g, '-')
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(normalized)) return normalized
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(normalized)) return `${normalized}:00`
  return null
}

function findColumn(header: string[], aliases: string[]): number {
  return header.findIndex(cell => {
    const value = cell.toLowerCase()
    return aliases.some(alias => value.includes(alias.toLowerCase()))
  })
}

export async function parsePunchExcel(file: File): Promise<ParsedPunchExcel> {
  const buffer = await file.arrayBuffer()
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(buffer)
  const ws = wb.worksheets[0]
  if (!ws) return { rows: [], errors: [i18n.t('attendance.noValidWorksheet', { defaultValue: '文件無有效工作表' })] }

  const matrix: unknown[][] = []
  ws.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    const cells: unknown[] = []
    row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      cells[colNumber - 1] = cell.value
    })
    matrix[rowNumber - 1] = cells
  })
  if (matrix.length < 2) return { rows: [], errors: [i18n.t('attendance.noValidDataRows', { defaultValue: '文件無有效數據行' })] }

  const header = (matrix[0] ?? []).map(h => String(h ?? '').trim())
  const col = {
    empNo: findColumn(header, HEADER_ALIASES.empNo),
    punchAt: findColumn(header, HEADER_ALIASES.punchAt),
    punchType: findColumn(header, HEADER_ALIASES.punchType),
    location: findColumn(header, HEADER_ALIASES.location),
  }
  const missing: string[] = []
  if (col.empNo < 0) missing.push('工號')
  if (col.punchAt < 0) missing.push('打卡時間')
  if (col.punchType < 0) missing.push('卡別')
  if (missing.length > 0) {
    return { rows: [], errors: [`缺少必需列：${missing.join('、')}（表頭需含這些字樣）`] }
  }

  const result: ParsedPunchExcel = { rows: [], errors: [] }
  for (let i = 1; i < matrix.length; i += 1) {
    const line = matrix[i] ?? []
    const excelRowNo = i + 1
    const empNo = String(line[col.empNo] ?? '').trim()
    const punchAt = formatPunchAt(line[col.punchAt])
    const punchType = parsePunchType(line[col.punchType])
    // 整行为空直接跳过：Excel 常有尾部空行，报成错误只会淹没真问题
    if (!empNo && !punchAt && punchType === null) continue
    if (!empNo) {
      result.errors.push(`第 ${excelRowNo} 行：工號為空`)
      continue
    }
    if (!punchAt) {
      result.errors.push(`第 ${excelRowNo} 行：打卡時間格式應為 yyyy-MM-dd HH:mm[:ss]`)
      continue
    }
    if (punchType === null) {
      result.errors.push(`第 ${excelRowNo} 行：卡別只能是上班卡/下班卡`)
      continue
    }
    result.rows.push({
      empNo,
      punchAt,
      punchType,
      location: col.location >= 0 ? String(line[col.location] ?? '').trim() || null : null,
    })
    if (result.rows.length >= MAX_ROWS) {
      result.errors.push(`單次導入上限 ${MAX_ROWS} 行，超出部分請拆文件後再導`)
      break
    }
  }
  return result
}

/** 生成导入模板（表头 + 一行示例），避免用户猜列顺序 */
export async function generatePunchImportTemplate(): Promise<string> {
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet('打卡導入')
  ws.addRow(['工號', '打卡時間', '卡別', '打卡地點'])
  ws.addRow(['MF00123', '2026-10-08 09:00:00', '上班卡', '珠海·本部辦公樓'])
  ws.addRow(['MF00123', '2026-10-08 18:30:00', '下班卡', '珠海·本部辦公樓'])
  ws.columns.forEach(column => { column.width = 24 })
  return wb.xlsx.writeBuffer().then(buffer => {
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = '打卡導入模板.xlsx'
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
    return url
  })
}
