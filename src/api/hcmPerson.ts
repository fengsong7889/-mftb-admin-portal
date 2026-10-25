/**
 * 人员主数据接口层（C3 花名册）。
 *
 * 为什么与 hcmOrganization.ts 分开：人员/雇佣/任职属于人事域（hr），
 * 组织/职位/岗位属于组织编制域（organization），两者写入方与权限菜单不同；
 * 混在一个文件会让「谁能改编制」和「谁能建档」的边界在代码里也变模糊。
 */
import request from './request'
import type { PageResult } from './employee'

/** 人员（可无账号） */
export interface Person {
  id?: number
  personNo?: string | null
  name: string
  nameEn?: string | null
  gender?: string | null
  birthDate?: string | null
  mobile?: string | null
  email?: string | null
  nationality?: string | null
  /** 账号映射 sys_user.id；为空表示无账号人员 */
  sysUserId?: number | null
  status?: number
  remark?: string | null
  updatedBy?: string | null
  createdAt?: number | null
  updatedAt?: number | null
}

/** 雇佣关系 */
export interface HrEmployment {
  id?: number
  personId: number
  legalEntityId: number
  employmentNo?: string | null
  employmentType?: string
  jurisdiction?: string
  startDate: string
  endDate?: string | null
  status?: number
  remark?: string | null
  updatedBy?: string | null
  createdAt?: number | null
  updatedAt?: number | null
}

/** 任职（日期生效） */
export interface HrAssignment {
  id?: number
  employmentId: number
  unitId: number
  positionId?: number | null
  managerPersonId?: number | null
  workLocation?: string | null
  fte?: string | number
  primaryFlag?: number
  effectiveFrom: string
  effectiveTo?: string | null
  seqNo?: number
  remark?: string | null
}

export const EMPLOYMENT_TYPE_OPTIONS = [
  { value: 'FULL_TIME', label: '全職' },
  { value: 'PART_TIME', label: '兼職' },
  { value: 'INTERN', label: '實習' },
  { value: 'DISPATCH', label: '勞務派遣' },
  { value: 'OUTSOURCE', label: '外包' },
] as const

export function listPersons(params: { page: number; size: number; keyword?: string; status?: number }) {
  return request.get<unknown, PageResult<Person>>('/hcm/v1/hr/persons', { params })
}

export function getPerson(id: number) {
  return request.get<unknown, Person>(`/hcm/v1/hr/persons/${id}`)
}

export function createPerson(data: Person) {
  return request.post<unknown, Person>('/hcm/v1/hr/persons', data)
}

export function updatePerson(id: number, data: Person) {
  return request.put<unknown, Person>(`/hcm/v1/hr/persons/${id}`, data)
}

export function deletePerson(id: number) {
  return request.delete(`/hcm/v1/hr/persons/${id}`)
}

export function listEmployments(personId: number, params: { page: number; size: number; status?: number }) {
  return request.get<unknown, PageResult<HrEmployment>>(`/hcm/v1/hr/persons/${personId}/employments`, { params })
}

export function getEmployment(id: number) {
  return request.get<unknown, HrEmployment>(`/hcm/v1/hr/employments/${id}`)
}

export function createEmployment(data: HrEmployment) {
  return request.post<unknown, HrEmployment>('/hcm/v1/hr/employments', data)
}

export function updateEmployment(id: number, data: HrEmployment) {
  return request.put<unknown, HrEmployment>(`/hcm/v1/hr/employments/${id}`, data)
}

export function terminateEmployment(id: number, endDate: string) {
  return request.post<unknown, HrEmployment>(`/hcm/v1/hr/employments/${id}/terminate`, null, { params: { endDate } })
}

export function listAssignments(
  employmentId: number,
  params: { page: number; size: number; asOf?: string },
) {
  return request.get<unknown, PageResult<HrAssignment>>(`/hcm/v1/hr/employments/${employmentId}/assignments`, {
    params,
  })
}

export function getAssignment(id: number) {
  return request.get<unknown, HrAssignment>(`/hcm/v1/hr/assignments/${id}`)
}

export function createAssignment(data: HrAssignment) {
  return request.post<unknown, HrAssignment>('/hcm/v1/hr/assignments', data)
}

export function updateAssignment(id: number, data: HrAssignment) {
  return request.put<unknown, HrAssignment>(`/hcm/v1/hr/assignments/${id}`, data)
}
