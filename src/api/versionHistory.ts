/**
 * 版本发布历史记录 API
 */
import request from './request'

export interface VersionHistoryRecord {
  id: number
  versionNo: string
  releaseDate: string
  releaseType: 'major' | 'minor' | 'patch'
  summary: string
  frontendChanges: string
  backendChanges: string
  databaseChanges: string
  status: number
  createdBy: string
  updatedBy: string
  createdAt: string
  updatedAt: string
}

interface PageResult<T> {
  records: T[]
  total: number
}

/** 分页查询版本记录 */
export function fetchVersionHistory(params: {
  page?: number
  size?: number
  keyword?: string
  releaseType?: string
  startDate?: string
  endDate?: string
  status?: number
}): Promise<PageResult<VersionHistoryRecord>> {
  return request.get('/version-history', { params })
}

/** 获取版本详情 */
export function fetchVersionDetail(id: number): Promise<VersionHistoryRecord> {
  return request.get(`/version-history/${id}`)
}

/** 新增版本记录 */
export function createVersion(data: Partial<VersionHistoryRecord>): Promise<number> {
  return request.post('/version-history', data)
}

/** 更新版本记录 */
export function updateVersion(id: number, data: Partial<VersionHistoryRecord>): Promise<void> {
  return request.put(`/version-history/${id}`, data)
}

/** 删除版本记录 */
export function deleteVersion(id: number): Promise<void> {
  return request.delete(`/version-history/${id}`)
}
