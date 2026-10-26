import request from './request'

/** 机翻引擎 VO */
export interface MtEngineVO {
  id: number
  engineKey: string
  engineName: string
  apiUrl: string
  /** API Key 脱敏显示 */
  apiKey: string
  dailyLimit: number
  timeoutMs: number
  status: number
  configJson: string
  sortOrder: number
  createdAt: string
  updatedAt: string
  todayUsage: number
}

/** 引擎更新请求 */
export interface MtEngineUpdatePayload {
  engineName?: string
  apiUrl?: string
  apiKey?: string
  dailyLimit?: number
  timeoutMs?: number
  status?: number
  configJson?: string
}

/** 翻译测试结果 */
export interface TranslateTestResult {
  engineKey: string
  engineName: string
  sourceText: string
  targetLang: string
  translatedText?: string
  success: boolean
  error?: string
}

/** 获取引擎列表 */
export async function fetchMtEngines() {
  return request.get<unknown, MtEngineVO[]>('/mt-engines')
}

/** 获取当前启用的引擎 */
export async function fetchActiveMtEngine() {
  return request.get<unknown, MtEngineVO | null>('/mt-engines/active')
}

/** 更新引擎配置 */
export async function updateMtEngine(id: number, data: MtEngineUpdatePayload) {
  return request.put<unknown, MtEngineVO>(`/mt-engines/${id}`, data)
}

/** 测试翻译 */
export async function testMtEngineTranslate(id: number, text: string, targetLang = 'en') {
  return request.post<unknown, TranslateTestResult>(
    `/mt-engines/${id}/test?text=${encodeURIComponent(text)}&targetLang=${targetLang}`
  )
}
