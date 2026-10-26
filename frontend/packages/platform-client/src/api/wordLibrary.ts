import request, { SILENT_HEADER, isBackendUnavailable } from './request'

/** 词库记录 */
export interface WordLibraryItem {
  id: number
  word: string
  channel: string
  status: number
  matchCount: number
  updatedBy: string
  updateTime: string
  remark: string
}

/** 词库分页结果 */
export interface WordLibraryPageResult {
  records: WordLibraryItem[]
  total: number
}

/** 词库新增/编辑请求 */
export interface WordLibraryPayload {
  word: string
  channel: string
  status?: number
  remark?: string
}

/** 静默请求头：后端不可用时降级到 Mock，不弹全局错误提示 */
const SILENT = { headers: { [SILENT_HEADER]: '1' } }

/** 词库列表（分页 + 搜索） */
export async function fetchWordLibraryList(params: {
  page?: number; size?: number; keyword?: string; channel?: string
  status?: number; updatedBy?: string; remark?: string
  startDate?: string; endDate?: string
}) {
  try {
    return await request.get<unknown, WordLibraryPageResult>('/word-library', { params, ...SILENT })
  } catch (err) {
    if (isBackendUnavailable(err)) return { records: [], total: 0 }
    throw err
  }
}

/** 新增词条 */
export async function createWordLibraryItem(data: WordLibraryPayload) {
  return request.post<unknown, WordLibraryItem>('/word-library', data)
}

/** 编辑词条 */
export async function updateWordLibraryItem(id: number, data: WordLibraryPayload) {
  return request.put<unknown, WordLibraryItem>(`/word-library/${id}`, data)
}

/** 切换状态（启用/停用） */
export async function toggleWordLibraryStatus(id: number) {
  return request.put<unknown, void>(`/word-library/${id}/toggle`)
}

/** 删除词条 */
export async function deleteWordLibraryItem(id: number) {
  return request.delete<unknown, void>(`/word-library/${id}`)
}

/** 智能分词：对输入文本进行分词，返回词条列表 */
export async function segmentWords(text: string) {
  try {
    return await request.post<unknown, string[]>('/word-library/segment', { text }, SILENT)
  } catch (err) {
    if (isBackendUnavailable(err)) return []
    throw err
  }
}
