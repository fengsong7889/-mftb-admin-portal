import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import ExcelJS from 'exceljs'
import i18n from '@/i18n'
import {
  generateRequirementImportTemplate,
  parseRequirementImportExcel,
  resolveStatus,
} from './rdmImport'
import { RDM_STATUS } from '@/constants/rdm'

/**
 * 存量导入解析与状态归一测试。
 *
 * 重点钉住三件事：状态文案的繁简/code 兼容、必填与批内重复的阻断、
 * 模板自带示例行不会被当成真实数据导进去。
 */

const HEADERS = ['需求名稱', '雲效編號', '需求狀態', '項目經理', '產品經理', '所屬項目', '所屬迭代', '需求描述']

// 行级错误走 i18n，断言的是繁中文案，必须先固定语言（默认语言取自 localStorage，测试环境为 en）
beforeAll(async () => {
  await i18n.changeLanguage('zh-TW')
})

/** 用内存工作簿造一个上传文件，避免在仓库里放二进制测试夹具 */
async function buildExcel(rows: Array<Array<string | null>>): Promise<File> {
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet('需求導入')
  ws.addRow(HEADERS)
  rows.forEach(row => ws.addRow(row))
  const buffer = await wb.xlsx.writeBuffer()
  return new File([buffer], 'requirements.xlsx')
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('resolveStatus', () => {
  it('接受繁体、简体与状态码三种写法', () => {
    expect(resolveStatus('開發中')).toBe(RDM_STATUS.DEVELOPING)
    expect(resolveStatus('开发中')).toBe(RDM_STATUS.DEVELOPING)
    expect(resolveStatus('developing')).toBe(RDM_STATUS.DEVELOPING)
  })

  it('忽略空格与分隔符差异', () => {
    expect(resolveStatus('已受理 · 待排期')).toBe(RDM_STATUS.ACCEPTED)
    expect(resolveStatus('已歸檔')).toBe(RDM_STATUS.CLOSED)
  })

  it('字典外的文案返回 null', () => {
    expect(resolveStatus('开发')).toBeNull()
    expect(resolveStatus('')).toBeNull()
  })
})

describe('parseRequirementImportExcel', () => {
  it('解析有效行并保留人员与归属文本', async () => {
    const file = await buildExcel([
      ['門店報表支持區域篩選', 'STORY-1', '開發中', '張三(MF00001)', '李四(MF00002)', '報表二期', 'SP2026-10A', '背景說明'],
      ['報表導出增加水印', 'STORY-2', '測試中', '', '', '', '', ''],
    ])

    const result = await parseRequirementImportExcel(file)

    expect(result.errors).toHaveLength(0)
    expect(result.rows).toHaveLength(2)
    expect(result.rows[0]).toMatchObject({
      rowNo: 2,
      title: '門店報表支持區域篩選',
      externalNo: 'STORY-1',
      status: RDM_STATUS.DEVELOPING,
      projectManager: '張三(MF00001)',
      productManager: '李四(MF00002)',
      projectName: '報表二期',
      iterationName: 'SP2026-10A',
      description: '背景說明',
    })
    expect(result.rows[1].status).toBe(RDM_STATUS.TESTING)
    expect(result.rows[1].projectManager).toBeUndefined()
  })

  it('缺必填、状态非法、云效编号重复都阻断该行', async () => {
    const file = await buildExcel([
      ['', 'STORY-1', '開發中', '', '', '', '', ''],
      ['需求二', 'STORY-2', '不存在的狀態', '', '', '', '', ''],
      ['需求三', 'STORY-3', '開發中', '', '', '', '', ''],
      ['需求四', 'STORY-3', '測試中', '', '', '', '', ''],
    ])

    const result = await parseRequirementImportExcel(file)

    expect(result.rows).toHaveLength(1)
    expect(result.rows[0].externalNo).toBe('STORY-3')
    const messages = result.errors.map(item => item.message).join('\n')
    expect(messages).toContain('需求名稱不能為空')
    expect(messages).toContain('不在產研交付系統狀態字典內')
    expect(messages).toContain('雲效編號與第 4 行重複')
  })

  it('云效编号非必填：留空的行仍可导入', async () => {
    const file = await buildExcel([
      ['非雲效來源的需求', '', '開發中', '', '', '', '', ''],
    ])

    const result = await parseRequirementImportExcel(file)

    expect(result.errors).toHaveLength(0)
    expect(result.rows).toHaveLength(1)
    expect(result.rows[0].externalNo).toBe('')
  })

  it('模板示例行被跳过，不计入有效数据', async () => {
    const file = await buildExcel([
      ['（示例）門店推廣報表支持按區域篩選', 'STORY-000001', '開發中', '', '', '', '', ''],
      ['真實需求', 'STORY-9', '已上線', '', '', '', '', ''],
    ])

    const result = await parseRequirementImportExcel(file)

    expect(result.errors).toHaveLength(0)
    expect(result.rows).toHaveLength(1)
    expect(result.rows[0].externalNo).toBe('STORY-9')
  })

  it('表头缺必填列时直接报错，不逐行解析', async () => {
    const wb = new ExcelJS.Workbook()
    const ws = wb.addWorksheet('sheet')
    // 云效编号已改为非必填，缺它不再拒收；需求状态仍是必填
    ws.addRow(['需求名稱', '雲效編號'])
    ws.addRow(['只有两列', 'STORY-1'])
    const file = new File([await wb.xlsx.writeBuffer()], 'bad.xlsx')

    const result = await parseRequirementImportExcel(file)

    expect(result.rows).toHaveLength(0)
    expect(result.errors[0].message).toContain('表頭缺少必要列')
  })

  it('表头不含云效编号列也能导入（非必填）', async () => {
    const wb = new ExcelJS.Workbook()
    const ws = wb.addWorksheet('需求導入')
    ws.addRow(['需求名稱', '需求狀態', '需求描述'])
    ws.addRow(['非雲效需求', '開發中', '直接錄入'])
    const file = new File([await wb.xlsx.writeBuffer()], 'no-external.xlsx')

    const result = await parseRequirementImportExcel(file)

    expect(result.errors).toHaveLength(0)
    expect(result.rows).toHaveLength(1)
    expect(result.rows[0].externalNo).toBe('')
    expect(result.rows[0].status).toBe(RDM_STATUS.DEVELOPING)
  })

  it('下载模板原样回灌可解析：數據頁在前、字典頁在后', async () => {
    // 回归防线：数据页必须是默认打开的第一个页签，字典页只做参考
    let blob: Blob | undefined
    const createObjectURL = vi.fn((value: Blob) => {
      blob = value
      return 'blob:template'
    })
    vi.stubGlobal('URL', { ...URL, createObjectURL })

    await generateRequirementImportTemplate()
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load(await blob!.arrayBuffer())
    expect(wb.worksheets.map(sheet => sheet.name)).toEqual(['需求導入', '狀態字典'])
    wb.getWorksheet('需求導入')?.addRow(['推廣金充值', 'MFTB-2801', '已分配·待受理', '', '', '', '', ''])

    const file = new File([await wb.xlsx.writeBuffer()], 'template.xlsx')
    const result = await parseRequirementImportExcel(file)

    expect(result.errors).toHaveLength(0)
    expect(result.rows).toHaveLength(1)
    expect(result.rows[0].externalNo).toBe('MFTB-2801')
  })

  it('旧模板（字典页在前）仍可解析，兼容已下发的文件', async () => {
    const wb = new ExcelJS.Workbook()
    const dict = wb.addWorksheet('狀態字典')
    dict.addRow(['可填狀態（中文）', '狀態碼', '說明'])
    dict.addRow(['開發中', 'developing', '开发中'])
    const sheet = wb.addWorksheet('需求導入')
    sheet.addRow(HEADERS)
    sheet.addRow(['舊模板需求', 'STORY-8', '開發中', '', '', '', '', ''])

    const file = new File([await wb.xlsx.writeBuffer()], 'legacy.xlsx')
    const result = await parseRequirementImportExcel(file)

    expect(result.errors).toHaveLength(0)
    expect(result.rows).toHaveLength(1)
    expect(result.rows[0].externalNo).toBe('STORY-8')
  })

  it('数据页签被改名时按表头兜底定位', async () => {
    const wb = new ExcelJS.Workbook()
    const dict = wb.addWorksheet('狀態字典')
    dict.addRow(['可填狀態（中文）', '狀態碼', '說明'])
    dict.addRow(['開發中', 'developing', '开发中'])
    const sheet = wb.addWorksheet('Sheet1')
    sheet.addRow(HEADERS)
    sheet.addRow(['改名后仍可導入', 'STORY-7', '開發中', '', '', '', '', ''])

    const file = new File([await wb.xlsx.writeBuffer()], 'renamed.xlsx')
    const result = await parseRequirementImportExcel(file)

    expect(result.errors).toHaveLength(0)
    expect(result.rows).toHaveLength(1)
    expect(result.rows[0].externalNo).toBe('STORY-7')
  })
})

describe('generateRequirementImportTemplate', () => {
  it('生成可下载的模板 blob', async () => {
    const createObjectURL = vi.fn(() => 'blob:template')
    vi.stubGlobal('URL', { ...URL, createObjectURL })

    const url = await generateRequirementImportTemplate()

    expect(url).toBe('blob:template')
    expect(createObjectURL).toHaveBeenCalledTimes(1)
  })
})
