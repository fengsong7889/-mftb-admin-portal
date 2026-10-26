import request from './request'

/** HR 人事通用字典类型 */
export const HR_DICT_TYPE = {
  /** 雇主法人（任职公司 / 合同签订主体） */
  EMPLOYER_COMPANY: 'EMPLOYER_COMPANY',
  /** 工作地点（国家 parentCode=null；城市 parentCode=国家 code） */
  WORK_LOCATION: 'WORK_LOCATION',
  /** 人员类别 */
  EMPLOYEE_CATEGORY: 'EMPLOYEE_CATEGORY',
  /** 合同类型 */
  CONTRACT_TYPE: 'CONTRACT_TYPE',
  /** 工时制 */
  WORK_SYSTEM: 'WORK_SYSTEM',
} as const

export type HrDictType = (typeof HR_DICT_TYPE)[keyof typeof HR_DICT_TYPE]

/** 启用下拉项 */
export interface HrDictOption {
  id: number
  code: string
  name: string
  nameEn?: string | null
  parentCode?: string | null
  sortOrder?: number
}

/** 完整字典项（管理列表用，含停用） */
export interface HrDictItem extends HrDictOption {
  dictType: string
  status: number
  remark?: string | null
}

/** 指定类型的启用下拉 */
export function fetchHrDictOptions(type: HrDictType) {
  return request.get<unknown, HrDictOption[]>('/hr-dict/options', { params: { type } })
}

/** 字典列表（可按类型 / 状态过滤，供管理页） */
export function fetchHrDict(type?: HrDictType, status?: number) {
  return request.get<unknown, HrDictItem[]>('/hr-dict', { params: { type, status } })
}

/** 字典新增/编辑请求 */
export interface HrDictPayload {
  dictType: HrDictType | string
  code: string
  name: string
  nameEn?: string
  parentCode?: string | null
  status?: number
  sortOrder?: number
  remark?: string
}

/** 新增字典项 */
export function createHrDict(data: HrDictPayload) {
  return request.post<unknown, number>('/hr-dict', data)
}

/** 更新字典项（不允许改 dictType/code） */
export function updateHrDict(id: number, data: Partial<HrDictPayload>) {
  return request.put<unknown, void>(`/hr-dict/${id}`, data)
}

/** 启用/停用 */
export function updateHrDictStatus(id: number, status: number) {
  return request.put<unknown, void>(`/hr-dict/${id}/status`, null, { params: { status } })
}

/** 删除（逻辑删除） */
export function deleteHrDict(id: number) {
  return request.delete<unknown, void>(`/hr-dict/${id}`)
}
