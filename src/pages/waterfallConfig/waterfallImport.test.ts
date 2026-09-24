import { beforeEach, describe, expect, it, vi } from 'vitest'
import { parseWaterfallRows, parseWaterfallExcel, resolveWaterfallImport, createWaterfallImportTemplate } from './waterfallImport'
import { mockGetItemsByIds } from '../../api/mock/waterfallCatalogMock'
import { emptyDraft, getLocalStrategy, upsertLocalStrategy, buildDraftFromServer, setExtension, mergeServerToStrategies, type WaterfallExtension } from './waterfallExtStore'
import { consumeDraft, readDraft, writeDraft } from './waterfallDraft'
import { getDisplayCategoryMode, type FixedContentSlot } from './types'

const header = ['ID', '排序']

describe('团购导入文件校验', () => {
  it('两列表头可交换，保留文本 ID 和原始行号', () => {
    expect(parseWaterfallRows([['排序', 'ID'], [5, '00123'], [], [1, 'MD1001']])).toEqual({
      rows: [{ row: 2, itemId: '00123', position: 5 }, { row: 4, itemId: 'MD1001', position: 1 }], issues: [],
    })
  })

  it.each([[], [['ID']], [['ID', '名称', '排序']], [header, ['MD1001', 1, '多余数据']]].map(table => ({ table })))('拒绝不符合两列契约的文件 $table', ({ table }) => {
    expect(parseWaterfallRows(table).issues.some(issue => issue.code === 'header')).toBe(true)
  })

  it.each([0, -1, 1.5, 501, '1e2', '', null, { formula: '1+1', result: 2 }])('拒绝非法排序 %j', position => {
    expect(parseWaterfallRows([header, ['MD1001', position]]).issues).toContainEqual({ row: 2, itemId: 'MD1001', code: 'position' })
  })

  it('重复 ID、重复排序、空 ID 和公式均标记具体行', () => {
    const result = parseWaterfallRows([header, ['MD1001', 1], ['MD1001', 1], ['', 3], [{ formula: 'A2' }, 4]])
    expect(result.issues).toEqual(expect.arrayContaining([
      { row: 3, itemId: 'MD1001', code: 'duplicateId' },
      { row: 3, itemId: 'MD1001', code: 'duplicatePosition' },
      { row: 4, code: 'id' }, { row: 5, code: 'id' },
    ]))
  })

  it('空文件和超过500行不会产生有效导入', () => {
    expect(parseWaterfallRows([header]).issues[0].code).toBe('empty')
    expect(parseWaterfallRows([header, ...Array.from({ length: 501 }, (_, i) => [`ID${i}`, i + 1])]).issues[0].code).toBe('limit')
  })

  it('生成的实际 Excel 模板恰好两列，填写后可再次解析', async () => {
    const blob = await createWaterfallImportTemplate()
    const buffer = await new Promise<ArrayBuffer>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result as ArrayBuffer)
      reader.onerror = reject
      reader.readAsArrayBuffer(blob)
    })
    const { default: ExcelJS } = await import('exceljs')
    const workbook = new ExcelJS.Workbook()
    await workbook.xlsx.load(buffer)
    expect(workbook.worksheets[0].getRow(1).getCell(1).value).toBe('ID')
    expect(workbook.worksheets[0].getRow(1).getCell(2).value).toBe('排序')
    expect(workbook.worksheets[0].columnCount).toBe(2)
    workbook.worksheets[0].addRow(['MD1001', 1])
    const filled = await workbook.xlsx.writeBuffer()
    const parsed = await parseWaterfallExcel(filled as unknown as ArrayBuffer)
    expect(parsed.issues).toEqual([])
    expect(parsed.rows[0].itemId).toBe('MD1001')
  })
})

describe('团购导入品牌与坑位约束', () => {
  it('同品牌跨分类门店可导入，按具体坑位排序', () => {
    const rows = parseWaterfallRows([header, ['MD3001', 9], ['MD1001', 1]]).rows
    const result = resolveWaterfallImport(rows, mockGetItemsByIds('store', ['MD3001', 'MD1001']), [], 'store', 'flashBee')
    expect(result.issues).toEqual([])
    expect(result.slots.map(slot => slot.position)).toEqual([1, 9])
    expect(result.slots.every(slot => slot.brand === 'flashBee')).toBe(true)
  })

  it.each([
    ['store', 'MD1001', 'MD1003'],
    ['product', 'GD9001', 'GD9003'],
  ] as const)('%s 中混入跨品牌资源，整批拒绝', (contentType, allowed, denied) => {
    const rows = parseWaterfallRows([header, [allowed, 1], [denied, 2]]).rows
    const result = resolveWaterfallImport(rows, mockGetItemsByIds(contentType, [allowed, denied]), [], contentType, 'flashBee')
    expect(result.slots).toEqual([])
    expect(result.issues).toContainEqual(expect.objectContaining({ row: 3, code: 'brand', itemId: denied }))
  })

  it('不存在、错误维度、下线资源均拒绝', () => {
    const rows = parseWaterfallRows([header, ['UNKNOWN', 1], ['GD9001', 2], ['MD1004', 3]]).rows
    const result = resolveWaterfallImport(rows, [...mockGetItemsByIds('store', ['MD1004']), ...mockGetItemsByIds('product', ['GD9001'])], [], 'store', 'flashBee')
    expect(result.slots).toEqual([])
    expect(result.issues.map(issue => issue.code)).toEqual(['missing', 'missing', 'disabled'])
  })

  it('不覆盖已占坑位，不重复导入已配置内容，失败不修改原数据', () => {
    const existing: FixedContentSlot[] = [{ contentType: 'store', position: 1, itemId: 'MD1001', itemName: '原门店', brand: 'flashBee', status: 1 }]
    const rows = parseWaterfallRows([header, ['MD3001', 1], ['MD1001', 2]]).rows
    const result = resolveWaterfallImport(rows, mockGetItemsByIds('store', ['MD3001', 'MD1001']), existing, 'store', 'flashBee')
    expect(result.slots).toEqual([])
    expect(result.issues.map(issue => issue.code)).toEqual(['occupied', 'existingId'])
    expect(existing).toHaveLength(1)
    expect(existing[0].itemName).toBe('原门店')
  })
})

describe('展示模式兼容和完整草稿', () => {
  beforeEach(() => { localStorage.clear(); sessionStorage.clear() })

  it('旧团购记录默认分类模式，新建记录默认算法模式', () => {
    expect(getDisplayCategoryMode({ businessType: 'groupBuy' })).toBe('category')
    expect(getDisplayCategoryMode(emptyDraft('groupBuy'))).toBe('algorithm')
  })

  it('自定义无分类可持久化，回填保留品牌、模式、停用状态和坑位', () => {
    const draft = { ...emptyDraft('groupBuy', 'flashBee'), key: 'local_test', localId: 'test', strategyName: '测试自定义', status: 2 as const, displayCategoryMode: 'custom' as const, sortMode: 'distance' as const, fixedSlots: [{ contentType: 'store' as const, itemId: 'MD1001', itemName: '门店', position: 5, status: 1 as const }] }
    expect(upsertLocalStrategy(draft)).toBe(true)
    expect(getLocalStrategy('test')).toEqual(draft)
    expect(writeDraft(draft)).toBe(true)
    expect(readDraft('local_test')).toEqual(draft)
    expect(consumeDraft('another_record')).toBeNull()
    expect(readDraft('local_test')).toEqual(draft)
    expect(consumeDraft('local_test')).toEqual(draft)
    expect(readDraft('local_test')).toBeNull()
  })

  it('超市已有策略的非算法配置存扩展并回显，不改动服务器对象', () => {
    const server = { id: 99, strategyName: '线上名称', naturalAlgoId: 'LIVE', brand: 'flashBee', status: 1 }
    const draft = { ...emptyDraft('delivery', 'flashBee'), key: 'server_99', id: 99, strategyName: '本地超市方案', bizChannel: 'supermarket' as const, displayCategoryMode: 'custom' as const, sortMode: 'sales' as const }
    const ext: WaterfallExtension = { businessType: 'delivery', bizChannel: 'supermarket', contentType: 'store', displayCategoryMode: 'custom', sortMode: 'sales', layoutColumns: 1, fixedSlots: [], fallbackCategoryIds: [], confirmed: true, localDraft: draft }
    expect(setExtension(99, ext)).toBe(true)
    expect(buildDraftFromServer(server, ext)).toMatchObject({ strategyName: '本地超市方案', sortMode: 'sales', bizChannel: 'supermarket' })
    expect(mergeServerToStrategies([server], {})[0]).toMatchObject({ strategyName: '本地超市方案', localOnly: true })
    expect(server.naturalAlgoId).toBe('LIVE')
    expect(server.strategyName).toBe('线上名称')
  })

  it('存储失败明确返回失败', () => {
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementationOnce(() => { throw new Error('quota') })
    expect(writeDraft({ ...emptyDraft('groupBuy'), key: 'new_test' })).toBe(false)
    spy.mockRestore()
  })
})
