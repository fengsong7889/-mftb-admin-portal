/**
 * 产研需求存量导入模板定义（Excel 产物格式契约）。
 *
 * 这里的字面量会原样写进用户下载的 .xlsx：页签、表头、示例行、下拉提示。
 * 解析器靠同一份表头与别名定位列，所以模板生成与解析必须共用本文件，
 * 禁止两处各写一份中文表头——否则改模板时解析会静默错列。
 *
 * 界面文案（错误提示、弹窗按钮）不放这里，走 rdm.import.* 语言包。
 */
import { RDM_STATUS, RDM_STATUS_LABEL, RDM_STATUS_LABEL_SIMPLIFIED, type RdmStatus } from './rdm'

/** 导入模板列定义（数组顺序即模板列序） */
export interface RdmImportColumn {
  /** 解析结果字段名 */
  key: 'title' | 'externalNo' | 'status' | 'projectManager' | 'productManager' | 'projectName' | 'iterationName' | 'description'
  /** 模板表头（同时用于缺列提示） */
  header: string
  /**
   * 解析兼容别名：繁中、简中、英文字段名都认。
   * 用户手工改过表头或复制旧模板时，靠别名仍能定位列。
   */
  aliases: string[]
  /** 列宽（字符数） */
  width: number
  /** 缺列即整份文件拒收 */
  required?: boolean
}

/** 模板列（顺序即模板列序） */
export const RDM_IMPORT_COLUMNS: readonly RdmImportColumn[] = [
  { key: 'title', header: '需求名稱', aliases: ['需求名稱', '需求名称', 'title'], width: 32, required: true },
  { key: 'externalNo', header: '雲效編號', aliases: ['雲效編號', '云效编号', 'externalNo'], width: 18, required: true },
  { key: 'status', header: '需求狀態', aliases: ['需求狀態', '需求状态', 'status'], width: 16, required: true },
  { key: 'projectManager', header: '項目經理', aliases: ['項目經理', '项目经理', 'projectManager'], width: 14 },
  { key: 'productManager', header: '產品經理', aliases: ['產品經理', '产品经理', 'productManager'], width: 14 },
  { key: 'projectName', header: '所屬項目', aliases: ['所屬項目', '所属项目', 'projectName'], width: 22 },
  { key: 'iterationName', header: '所屬迭代', aliases: ['所屬迭代', '所属迭代', 'iterationName'], width: 20 },
  { key: 'description', header: '需求描述', aliases: ['需求描述', 'description'], width: 48 },
]

/** 模板文件名（用户下载时看到的名称） */
export const RDM_IMPORT_TEMPLATE_NAME = '產研需求導入模板.xlsx'

/** 模板工作簿作者 */
export const RDM_IMPORT_CREATOR = '產研交付系統'

/** 状态字典页签 */
export const RDM_IMPORT_DICT_SHEET = {
  name: '狀態字典',
  labelHeader: '可填狀態（中文）',
  codeHeader: '狀態碼',
  hintHeader: '說明',
}

/** 数据页签 */
export const RDM_IMPORT_DATA_SHEET = '需求導入'

/** 状态列下拉的校验提示 */
export const RDM_IMPORT_STATUS_VALIDATION = {
  errorTitle: '狀態不在字典內',
  error: '請從下拉列表選擇產研交付系統的需求狀態',
}

/** 示例行前缀：用户没删示例行时按此前缀跳过，不当作真实数据 */
export const RDM_IMPORT_EXAMPLE_PREFIXES = ['（示例）', '(示例)']

/** 模板自带的示例行（灰色斜体，仅为示范填法） */
export const RDM_IMPORT_SAMPLE_ROW = {
  title: '（示例）門店推廣報表支持按區域篩選',
  externalNo: 'STORY-000001',
  projectManager: '張三(MF00001)',
  productManager: '李四(MF00002)',
  projectName: '推廣報表二期',
  iterationName: 'SP2026-10A',
  description: '需求背景與預期結果，導入後會同步生成一份 PRD。',
}

/** 状态码列表（模板状态字典页的顺序） */
export const RDM_IMPORT_STATUS_CODES = Object.values(RDM_STATUS) as RdmStatus[]

/** 状态字典页一行：可填文案、状态码、简体别名 */
export interface RdmImportStatusDictRow {
  label: string
  code: RdmStatus
  hint: string
}

/** 状态字典页数据（顺序与状态码定义一致） */
export const RDM_IMPORT_STATUS_DICT: readonly RdmImportStatusDictRow[] = RDM_IMPORT_STATUS_CODES.map(code => ({
  label: RDM_STATUS_LABEL[code],
  code,
  hint: RDM_STATUS_LABEL_SIMPLIFIED[code],
}))
