import request from './request'

/** 职级序列枚举: M=管理 T=技術 P=專業 */
export const POSITION_SEQUENCE: Record<string, string> = {
  M: 'M(管理)',
  T: 'T(技術)',
  P: 'P(專業)',
}

/** 职级序列选项 */
export const POSITION_SEQUENCE_OPTIONS = Object.entries(POSITION_SEQUENCE).map(([value, label]) => ({
  value,
  label,
}))

/** 职位信息 */
export interface PositionItem {
  id: number
  name: string
  sequence: string
  jobLevel: string
  updatedBy?: string
  updatedAt?: string
}

/** 职位新增/编辑请求参数 */
export interface PositionPayload {
  name: string
  sequence: string
  jobLevel: string
}

/** 查询全部职位 */
export function fetchPositions() {
  return request.get<unknown, PositionItem[]>('/positions')
}

/** 新增职位 */
export function createPosition(data: PositionPayload) {
  return request.post<unknown, PositionItem>('/positions', data)
}

/** 编辑职位 */
export function updatePosition(id: number, data: PositionPayload) {
  return request.put<unknown, PositionItem>(`/positions/${id}`, data)
}

/** 删除职位 */
export function deletePosition(id: number) {
  return request.delete<unknown, void>(`/positions/${id}`)
}
