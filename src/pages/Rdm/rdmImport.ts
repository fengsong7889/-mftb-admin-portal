import ExcelJS from 'exceljs'
import i18n from '@/i18n'
import { RDM_STATUS, RDM_STATUS_LABEL, RDM_STATUS_LABEL_SIMPLIFIED, type RdmStatus } from '@/constants/rdm'
import {
  RDM_IMPORT_COLUMNS,
  RDM_IMPORT_CREATOR,
  RDM_IMPORT_DATA_SHEET,
  RDM_IMPORT_DICT_SHEET,
  RDM_IMPORT_EXAMPLE_PREFIXES,
  RDM_IMPORT_SAMPLE_ROW,
  RDM_IMPORT_STATUS_CODES,
  RDM_IMPORT_STATUS_DICT,
  RDM_IMPORT_STATUS_VALIDATION,
  type RdmImportColumn,
} from '@/constants/rdmImport'

/**
 * 产研交付（RDM）需求存量导入工具。
 *
 * 只负责「模板生成」与「文件解析 + 行级校验」，不发起任何网络请求：
 * 落库校验必须由后端重做一遍，前端的结论只用于让用户在确认前看清问题。
 *
 * 模板状态列以 RDM 状态中文名为准（业务口径：以产研交付系统的状态为准），
 * 同时接受状态码；繁体/简体/空格差异在 resolveStatus 内归一。
 * 模板表头/页签/示例行等 Excel 产物格式统一放在 constants/rdmImport，与解析共用一份。
 */

/** 解析后的单条导入行 */
export interface ParsedRdmImportRow {
  /** Excel 行号（从 2 开始，用于错误定位） */
  rowNo: number
  title: string
  externalNo: string
  status: RdmStatus
  /** 用户原样填写的状态文案，确认前回显用 */
  statusText: string
  projectManager?: string
  productManager?: string
  /** 提出人（業務歸屬人）；留空由後端按導入操作人落庫 */
  submitter?: string
  projectName?: string
  iterationName?: string
  description?: string
}

/** 行级错误 */
export interface RdmImportRowError {
  rowNo: number
  message: string
}

/** 解析结果：可导入行 + 阻断性错误 */
export interface ParsedRdmImportExcel {
  rows: ParsedRdmImportRow[]
  errors: RdmImportRowError[]
}

/** 列定义按字段名索引（模板与解析共用同一份，避免改表头时错列） */
const COLUMN_BY_KEY = new Map<string, RdmImportColumn>(RDM_IMPORT_COLUMNS.map(col => [col.key, col]))

/** 取某列的可识别表头别名 */
function aliasesOf(key: RdmImportColumn['key']): string[] {
  return COLUMN_BY_KEY.get(key)?.aliases ?? []
}

/** 归一化：去空白、统一分隔符、转小写，避免「已受理 · 待排期」这类空格差异被误判 */
function normalize(text: string): string {
  return text
    .replace(/[\s\u3000]/g, '')
    .replace(/[·・/、,，]/g, '')
    .toLowerCase()
}

/**
 * 把用户填写的状态文案解析成状态码。
 *
 * 匹配顺序：状态码 → 繁中名 → 简中名。全部失败返回 null，由调用方报错。
 */
export function resolveStatus(text: string): RdmStatus | null {
  const raw = String(text ?? '').trim()
  if (!raw) return null
  const target = normalize(raw)
  if (RDM_IMPORT_STATUS_CODES.includes(raw as RdmStatus)) return raw as RdmStatus
  for (const code of RDM_IMPORT_STATUS_CODES) {
    if (normalize(RDM_STATUS_LABEL[code]) === target) return code
    if (normalize(RDM_STATUS_LABEL_SIMPLIFIED[code]) === target) return code
    if (normalize(code) === target) return code
  }
  return null
}

/** 读取单元格文本：兼容富文本、超链接、公式结果、数字与日期 */
function cellText(value: ExcelJS.CellValue): string {
  if (value == null) return ''
  if (typeof value === 'string') return value.trim()
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (value instanceof Date) return value.toISOString().slice(0, 10)
  if (typeof value === 'object') {
    const cell = value as unknown as Record<string, unknown>
    if (Array.isArray(cell.richText)) {
      return (cell.richText as Array<{ text?: string }>).map(part => part.text ?? '').join('').trim()
    }
    if (typeof cell.text === 'string') return cell.text.trim()
    if (cell.result != null) return cellText(cell.result as ExcelJS.CellValue)
  }
  return String(value).trim()
}

/**
 * 解析需求导入 Excel。
 *
 * 只有「必填缺失 / 状态非法 / 文件内云效编号重复」会阻断该行；
 * 云效编号非必填（存量需求不全是云效来源），项目经理、产品经理、项目、迭代的匹配
 * 交给后端（前端没有权威人员与项目数据）。
 */
export async function parseRequirementImportExcel(file: File): Promise<ParsedRdmImportExcel> {
  const buffer = await file.arrayBuffer()
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(buffer)
  if (wb.worksheets.length === 0) {
    return {
      rows: [],
      errors: [{ rowNo: 0, message: i18n.t('rdm.import.errNoSheet', { defaultValue: '檔案無有效工作表' }) }],
    }
  }

  /*
   * 数据页签虽然排在模板首位，但用户可能删过、改过页签名或调整顺序，
   * 所以不能假设 worksheets[0] 就是数据页：先按页签名定位，找不到再逐个页签扫描表头兜底。
   */
  const candidates = [
    ...wb.worksheets.filter(sheet => sheet.name === RDM_IMPORT_DATA_SHEET),
    ...wb.worksheets.filter(sheet => sheet.name !== RDM_IMPORT_DATA_SHEET),
  ]
  const titleAliases = aliasesOf('title').map(normalize)
  let matrix: string[][] = []
  let headerRowIndex = -1
  for (const sheet of candidates) {
    // 先转二维数组再定位表头行：用户可能在表头上方保留说明行
    const rows: string[][] = []
    sheet.eachRow({ includeEmpty: true }, (row, rowNumber) => {
      const cells: string[] = []
      row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
        cells[colNumber - 1] = cellText(cell.value)
      })
      rows[rowNumber - 1] = cells
    })
    const index = rows.findIndex(row => (row ?? []).some(cell => {
      const text = normalize(cell)
      return titleAliases.some(alias => text === alias || text.includes(alias))
    }))
    if (index >= 0) {
      matrix = rows
      headerRowIndex = index
      break
    }
  }
  if (headerRowIndex < 0) {
    return {
      rows: [],
      errors: [{
        rowNo: 0,
        message: i18n.t('rdm.import.errNoHeader', {
          defaultValue: '未找到表頭：請使用「批量導入」彈窗下載的模板',
        }),
      }],
    }
  }

  const header = (matrix[headerRowIndex] ?? []).map(normalize)
  const findCol = (...aliases: string[]) => {
    const normalized = aliases.map(normalize)
    return header.findIndex(h => normalized.includes(h))
  }
  const colIndex: Record<RdmImportColumn['key'], number> = {
    title: findCol(...aliasesOf('title')),
    externalNo: findCol(...aliasesOf('externalNo')),
    status: findCol(...aliasesOf('status')),
    projectManager: findCol(...aliasesOf('projectManager')),
    productManager: findCol(...aliasesOf('productManager')),
    submitter: findCol(...aliasesOf('submitter')),
    projectName: findCol(...aliasesOf('projectName')),
    iterationName: findCol(...aliasesOf('iterationName')),
    description: findCol(...aliasesOf('description')),
  }

  const missing = RDM_IMPORT_COLUMNS
    .filter(col => col.required && colIndex[col.key] < 0)
    .map(col => col.header)
  if (missing.length > 0) {
    return {
      rows: [],
      errors: [{
        rowNo: 0,
        message: i18n.t('rdm.import.errMissingColumns', {
          columns: missing.join(i18n.t('rdm.import.listSeparator', { defaultValue: '、' })),
          defaultValue: '表頭缺少必要列：{{columns}}',
        }),
      }],
    }
  }

  const result: ParsedRdmImportExcel = { rows: [], errors: [] }
  const seenExternalNo = new Map<string, number>()

  for (let i = headerRowIndex + 1; i < matrix.length; i++) {
    const row = matrix[i]
    const rowNo = i + 1
    if (!row || row.every(cell => !cell)) continue

    const pick = (index: number) => (index >= 0 ? (row[index] ?? '') : '')
    const title = pick(colIndex.title)
    const externalNo = pick(colIndex.externalNo)
    const statusText = pick(colIndex.status)
    if (!title && !externalNo && !statusText) continue
    // 模板自带一行灰色示例，用户没删时跳过，不当作真实数据
    if (RDM_IMPORT_EXAMPLE_PREFIXES.some(prefix => title.startsWith(prefix))) continue

    const rowErrors: string[] = []
    if (!title) {
      rowErrors.push(i18n.t('rdm.import.errTitleEmpty', { defaultValue: '需求名稱不能為空' }))
    }
    if (title.length > 200) {
      rowErrors.push(i18n.t('rdm.import.errTitleTooLong', { max: 200, defaultValue: '需求名稱超過 {{max}} 字' }))
    }
    // 云效编号非必填：留空表示非云效来源，只有填了才做长度与批内查重
    if (externalNo.length > 64) {
      rowErrors.push(i18n.t('rdm.import.errExternalNoTooLong', { max: 64, defaultValue: '雲效編號超過 {{max}} 字' }))
    }
    const status = statusText ? resolveStatus(statusText) : null
    if (!statusText) {
      rowErrors.push(i18n.t('rdm.import.errStatusEmpty', { defaultValue: '需求狀態不能為空' }))
    } else if (!status) {
      rowErrors.push(i18n.t('rdm.import.errStatusInvalid', {
        status: statusText,
        defaultValue: '需求狀態「{{status}}」不在產研交付系統狀態字典內',
      }))
    }

    if (externalNo) {
      const duplicatedAt = seenExternalNo.get(externalNo)
      if (duplicatedAt != null) {
        rowErrors.push(i18n.t('rdm.import.errExternalNoDuplicate', {
          rowNo: duplicatedAt,
          defaultValue: '雲效編號與第 {{rowNo}} 行重複',
        }))
      } else {
        seenExternalNo.set(externalNo, rowNo)
      }
    }

    if (rowErrors.length > 0 || !status) {
      result.errors.push({
        rowNo,
        message: i18n.t('rdm.import.errRowLine', {
          rowNo,
          label: externalNo || title || '',
          reasons: rowErrors.join(i18n.t('rdm.import.reasonSeparator', { defaultValue: '；' })),
          defaultValue: '第 {{rowNo}} 行 {{label}}：{{reasons}}',
        }),
      })
      continue
    }

    result.rows.push({
      rowNo,
      title,
      externalNo,
      status,
      statusText,
      projectManager: pick(colIndex.projectManager) || undefined,
      productManager: pick(colIndex.productManager) || undefined,
      submitter: pick(colIndex.submitter) || undefined,
      projectName: pick(colIndex.projectName) || undefined,
      iterationName: pick(colIndex.iterationName) || undefined,
      description: pick(colIndex.description) || undefined,
    })
  }

  if (result.rows.length === 0 && result.errors.length === 0) {
    result.errors.push({
      rowNo: 0,
      message: i18n.t('rdm.import.errNoDataRows', { defaultValue: '檔案無有效資料行' }),
    })
  }
  return result
}

/**
 * 生成需求导入模板（返回 object URL，调用方使用后需 revokeObjectURL）。
 *
 * 页签顺序：数据页在前、状态字典在后。
 * 为什么数据页在前：操作人打开模板的第一动作是录需求，默认落在字典页会多一次切换，
 * 也容易把数据误填进字典页；状态列本身已有下拉，字典仅供查不到时参考。
 * 状态列下拉按页签名引用字典页，因此字典页排在后面不影响校验。
 */
export async function generateRequirementImportTemplate(): Promise<string> {
  const wb = new ExcelJS.Workbook()
  wb.creator = RDM_IMPORT_CREATOR

  const ws = wb.addWorksheet(RDM_IMPORT_DATA_SHEET)
  ws.columns = RDM_IMPORT_COLUMNS.map(col => ({ header: col.header, key: col.key, width: col.width }))
  ws.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } }
  ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8720C' } }
  ws.getRow(1).alignment = { vertical: 'middle' }
  ws.views = [{ state: 'frozen', ySplit: 1 }]

  // 云效编号按文本处理，避免纯数字被 Excel 转成科学计数法
  const externalNoCol = RDM_IMPORT_COLUMNS.findIndex(col => col.key === 'externalNo') + 1
  ws.getColumn(externalNoCol).numFmt = '@'

  // 示例行：灰色斜体，导入时按「示例」前缀跳过
  ws.addRow({
    ...RDM_IMPORT_SAMPLE_ROW,
    status: RDM_STATUS_LABEL[RDM_STATUS.DEVELOPING],
  })
  ws.getRow(2).font = { italic: true, color: { argb: 'FF8C8C8C' } }

  // 状态列下拉：引用状态字典页签，最多预置 500 行
  const statusColLetter = String.fromCharCode(65 + RDM_IMPORT_COLUMNS.findIndex(col => col.key === 'status'))
  for (let row = 2; row <= 501; row++) {
    ws.getCell(`${statusColLetter}${row}`).dataValidation = {
      type: 'list',
      allowBlank: false,
      formulae: [`'${RDM_IMPORT_DICT_SHEET.name}'!$A$2:$A$${RDM_IMPORT_STATUS_CODES.length + 1}`],
      showErrorMessage: true,
      errorTitle: RDM_IMPORT_STATUS_VALIDATION.errorTitle,
      error: RDM_IMPORT_STATUS_VALIDATION.error,
    }
  }

  // 字典页放在最后：仅供状态拿不准时查，不打断录需求动线
  const dict = wb.addWorksheet(RDM_IMPORT_DICT_SHEET.name)
  dict.columns = [
    { header: RDM_IMPORT_DICT_SHEET.labelHeader, key: 'label', width: 20 },
    { header: RDM_IMPORT_DICT_SHEET.codeHeader, key: 'code', width: 18 },
    { header: RDM_IMPORT_DICT_SHEET.hintHeader, key: 'hint', width: 36 },
  ]
  for (const item of RDM_IMPORT_STATUS_DICT) {
    dict.addRow({ label: item.label, code: item.code, hint: item.hint })
  }
  dict.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } }
  dict.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8720C' } }
  dict.views = [{ state: 'frozen', ySplit: 1 }]

  const buf = await wb.xlsx.writeBuffer()
  const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  return URL.createObjectURL(blob)
}
