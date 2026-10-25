import request from './request'

export interface DocSystemPlan {
  id: number
  fileName: string
  title: string
  systemName: string
  systemCode?: string | null
  planType: string
  generatedAt: string | number
  sourcePath: string
  contentHash: string
  fileSize: number
  updatedAt: string | number
}

export interface DocSystemPlanPage {
  records: DocSystemPlan[]
  total: number
  page: number
  size: number
}

export interface DocSystemPlanDetail {
  plan: DocSystemPlan
  content: string
}

export interface DocApiCatalogEntry {
  id: number
  systemCode: string
  systemName: string
  method: string
  path: string
  handler: string
  requestSchema?: string | null
  responseSchema?: string | null
  source: string
  apiName?: string | null
  description?: string | null
  scenario?: string | null
  authType?: string | null
  authScope?: string | null
  visibility: number
  docStatus: number
  ownerUserId?: number | null
  version?: string | null
  baseUrl?: string | null
  requestExample?: string | null
  responseExample?: string | null
  errorCodes?: string | null
  changelog?: string | null
  active: boolean
  syncedAt: string | number
}

export interface DocApiCatalogSave {
  apiName?: string | null
  description?: string | null
  scenario?: string | null
  authType?: string | null
  authScope?: string | null
  visibility: number
  docStatus: number
  version?: string | null
  baseUrl?: string | null
  requestExample?: string | null
  responseExample?: string | null
  errorCodes?: string | null
  changelog?: string | null
}

export interface DocApiCatalogSystem {
  systemCode: string
  systemName: string
  endpointCount: number
}

export interface DocApiCatalogPage {
  records: DocApiCatalogEntry[]
  total: number
  page: number
  size: number
}

export function fetchDocSystemPlans(params: { keyword?: string; system?: string; page?: number; size?: number }) {
  return request.get<unknown, DocSystemPlanPage>('/doc/v3/system-plans', {
    params: { keyword: params.keyword?.trim() || undefined, system: params.system || undefined, page: params.page ?? 1, size: params.size ?? 20 },
  })
}

export function fetchDocSystemPlanSystems() {
  return request.get<unknown, string[]>('/doc/v3/system-plans/systems')
}

export function fetchDocSystemPlanDetail(id: number) {
  return request.get<unknown, DocSystemPlanDetail>(`/doc/v3/system-plans/${id}`)
}

export function scanDocSystemPlans() {
  return request.post<unknown, Record<string, number | string>>('/doc/v3/system-plans/scan')
}

export function fetchDocApiCatalogSystems() {
  return request.get<unknown, DocApiCatalogSystem[]>('/doc/v3/api-center/systems')
}

export function fetchDocApiCatalog(params: { systemCode?: string; keyword?: string; page?: number; size?: number }) {
  return request.get<unknown, DocApiCatalogPage>('/doc/v3/api-center/apis', {
    params: { systemCode: params.systemCode || undefined, keyword: params.keyword?.trim() || undefined, page: params.page ?? 1, size: params.size ?? 20 },
  })
}

export function updateDocApiCatalog(id: number, payload: DocApiCatalogSave) {
  return request.put<unknown, DocApiCatalogEntry>(`/doc/v3/api-center/apis/${id}`, payload)
}

export function scanDocApiCatalog() {
  // 扫描全部 Controller 需要较长时间，单独放宽超时，避免与普通请求共用 15s。
  return request.post<unknown, Record<string, number | string>>('/doc/v3/api-center/scan', null, { timeout: 120_000 })
}
