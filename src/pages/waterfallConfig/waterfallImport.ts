import type { WaterfallCatalogItem } from '../../api/waterfallCatalog'
import { MAX_SLOT_POSITION, type FixedContentSlot, type WaterfallContentType } from './types'

export interface WaterfallImportRow {
  row: number
  itemId: string
  position: number
}

export type ImportIssueCode = 'header' | 'empty' | 'limit' | 'id' | 'position' | 'duplicateId' | 'duplicatePosition' | 'missing' | 'brand' | 'disabled' | 'occupied' | 'existingId'

export interface WaterfallImportIssue {
  row: number
  itemId?: string
  code: ImportIssueCode
}

export interface WaterfallImportResult {
  rows: WaterfallImportRow[]
  issues: WaterfallImportIssue[]
}

const cellText = (value: unknown): string => typeof value === 'string' || typeof value === 'number' ? String(value).trim() : ''

/** 严格限定两列，拒绝公式和非正整数排序，保留原始 Excel 行号供用户定位。 */
export function parseWaterfallRows(table: unknown[][]): WaterfallImportResult {
  const result: WaterfallImportResult = { rows: [], issues: [] }
  const header = (table[0] ?? []).map(cellText)
  const idIndex = header.findIndex(cell => cell.toLowerCase() === 'id')
  const positionIndex = header.findIndex(cell => cell === '排序' || cell.toLowerCase() === 'sort')
  if (header.length !== 2 || idIndex < 0 || positionIndex < 0) {
    return { rows: [], issues: [{ row: 1, code: 'header' }] }
  }
  if (table.length > MAX_SLOT_POSITION + 1) return { rows: [], issues: [{ row: 0, code: 'limit' }] }
  const ids = new Set<string>()
  const positions = new Set<number>()
  table.slice(1).forEach((cells, index) => {
    if (!cells || cells.every(cell => cell == null || cell === '')) return
    const row = index + 2
    const itemId = cellText(cells[idIndex])
    const positionText = cellText(cells[positionIndex])
    const position = Number(positionText)
    if (cells.slice(2).some(cell => cell != null && cell !== '')) result.issues.push({ row, itemId, code: 'header' })
    if (!itemId) result.issues.push({ row, code: 'id' })
    if (!/^[1-9]\d*$/.test(positionText) || !Number.isSafeInteger(position) || position > MAX_SLOT_POSITION) result.issues.push({ row, itemId, code: 'position' })
    if (ids.has(itemId)) result.issues.push({ row, itemId, code: 'duplicateId' })
    if (positions.has(position)) result.issues.push({ row, itemId, code: 'duplicatePosition' })
    ids.add(itemId)
    positions.add(position)
    result.rows.push({ row, itemId, position })
  })
  if (result.rows.length === 0) result.issues.push({ row: 0, code: 'empty' })
  return result
}

export async function parseWaterfallExcel(buffer: ArrayBuffer): Promise<WaterfallImportResult> {
  const { default: ExcelJS } = await import('exceljs')
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(buffer)
  const sheet = workbook.worksheets[0]
  if (!sheet) return { rows: [], issues: [{ row: 0, code: 'empty' }] }
  if (sheet.rowCount > MAX_SLOT_POSITION + 1) return { rows: [], issues: [{ row: 0, code: 'limit' }] }
  const table: unknown[][] = []
  sheet.eachRow({ includeEmpty: true }, (row, number) => {
    const cells: unknown[] = []
    row.eachCell({ includeEmpty: true }, (cell, column) => { cells[column - 1] = cell.value })
    table[number - 1] = cells
  })
  return parseWaterfallRows(table)
}

/** 所有行通过后才生成合并结果，禁止跨品牌、失效资源、重复资源或静默覆盖已占坑位。 */
export function resolveWaterfallImport(
  rows: WaterfallImportRow[],
  items: WaterfallCatalogItem[],
  existing: FixedContentSlot[],
  contentType: WaterfallContentType,
  brand: string,
): { slots: FixedContentSlot[]; issues: WaterfallImportIssue[] } {
  const issues: WaterfallImportIssue[] = []
  const byId = new Map(items.map(item => [item.id, item]))
  const slots: FixedContentSlot[] = []
  const usedPositions = new Set(existing.map(slot => slot.position))
  const usedIds = new Set(existing.map(slot => slot.itemId))
  for (const row of rows) {
    const item = byId.get(row.itemId)
    if (!item || item.contentType !== contentType) { issues.push({ ...row, code: 'missing' }); continue }
    if (!brand || item.brand !== brand) issues.push({ ...row, code: 'brand' })
    if (!item.enabled) issues.push({ ...row, code: 'disabled' })
    if (usedPositions.has(row.position)) issues.push({ ...row, code: 'occupied' })
    if (usedIds.has(row.itemId)) issues.push({ ...row, code: 'existingId' })
    usedPositions.add(row.position)
    usedIds.add(row.itemId)
    slots.push({ position: row.position, contentType, itemId: item.id, itemName: item.name, brand: item.brand, categoryId: item.categoryId, status: 1 })
  }
  return { slots: issues.length ? [] : [...existing, ...slots].sort((a, b) => a.position - b.position), issues }
}

export async function createWaterfallImportTemplate(): Promise<Blob> {
  const { default: ExcelJS } = await import('exceljs')
  const workbook = new ExcelJS.Workbook()
  const sheet = workbook.addWorksheet('Import')
  sheet.addRow(['ID', '排序'])
  sheet.getColumn(1).width = 30
  sheet.getColumn(1).numFmt = '@'
  sheet.getColumn(2).width = 16
  const buffer = await workbook.xlsx.writeBuffer()
  return new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
}
