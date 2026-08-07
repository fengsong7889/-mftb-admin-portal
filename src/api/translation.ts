import request, { SILENT_HEADER, isBackendUnavailable } from './request'

/** 后端翻译字段 VO */
export interface TranslationVO {
  id: number
  fieldKey: string
  fieldName: string
  category: string
  translations: Record<string, string>
  source: string // manual/sync
  updatedBy?: string
  updatedAt?: number | string
}

/** 翻译字段新增/编辑请求 */
export interface TranslationPayload {
  fieldKey?: string
  fieldName: string
  category?: string
  translations?: Record<string, string>
  source?: string
}

/** 后端语言 VO */
export interface LanguageVO {
  id: number
  code: string
  name: string
  flag: string
  names?: Record<string, string>
}

/** 语言完成率 */
export interface CoverageVO {
  langCode: string
  total: number
  translated: number
  rate: number
  status: 'not_configured' | 'partial' | 'ready'
}

const SILENT = { headers: { [SILENT_HEADER]: '1' } }

/* ========== 翻译字段 ========== */

/** 字段列表（后端不可用时返回 null，调用方降级 Mock） */
export async function fetchTranslations(params?: { keyword?: string; category?: string }) {
  try {
    return await request.get<unknown, TranslationVO[]>('/translations', { ...SILENT, params })
  } catch (err) {
    if (isBackendUnavailable(err)) return null
    throw err
  }
}

/** 新增字段（fieldKey 留空由后端自动生成） */
export async function createTranslation(data: TranslationPayload) {
  return request.post<unknown, TranslationVO>('/translations', data)
}

/** 编辑字段 */
export async function updateTranslation(id: number, data: TranslationPayload) {
  return request.put<unknown, TranslationVO>(`/translations/${id}`, data)
}

/** 删除字段 */
export async function deleteTranslation(id: number) {
  return request.delete<unknown, void>(`/translations/${id}`)
}

/** 语言包: {fieldKey: 译文}（已应用回退链），注入 i18next 用 */
export async function fetchTranslationBundle(lang: string) {
  try {
    return await request.get<unknown, Record<string, string>>('/translations/bundle', {
      ...SILENT,
      params: { lang },
    })
  } catch (err) {
    if (isBackendUnavailable(err)) return null
    throw err
  }
}

/** 语言完成率校验 */
export async function fetchCoverage(lang: string) {
  try {
    return await request.get<unknown, CoverageVO>('/translations/coverage', {
      ...SILENT,
      params: { lang },
    })
  } catch (err) {
    if (isBackendUnavailable(err)) return null
    throw err
  }
}

/* ========== 已注册语言 ========== */

/** 语言列表（后端不可用时返回 null，调用方降级） */
export async function fetchLanguages() {
  try {
    return await request.get<unknown, LanguageVO[]>('/translations/languages', SILENT)
  } catch (err) {
    if (isBackendUnavailable(err)) return null
    throw err
  }
}

/** 注册新语言 */
export async function createLanguage(data: Omit<LanguageVO, 'id'>) {
  return request.post<unknown, LanguageVO>('/translations/languages', data)
}

/** 删除语言 */
export async function deleteLanguage(code: string) {
  return request.delete<unknown, void>(`/translations/languages/${code}`)
}

/* ========== 机翻 ========== */

/** 机翻请求参数 */
export interface MachineTranslatePayload {
  ids: number[]
  targetLangs?: string[]
}

/** 机翻响应 */
export interface MachineTranslateResult {
  filled: number
}

/** 机器翻译：调用 MyMemory API 填充空缺翻译，结果自动持久化 */
export async function machineTranslate(data: MachineTranslatePayload) {
  return request.post<unknown, MachineTranslateResult>('/translations/machine-translate', data)
}

/** 单文本翻译：将源文本翻译为目标语言（不持久化，仅返回翻译结果） */
export async function translateText(text: string, targetLang = 'en') {
  return request.post<unknown, string>('/translations/translate-text', { text, targetLang })
}
