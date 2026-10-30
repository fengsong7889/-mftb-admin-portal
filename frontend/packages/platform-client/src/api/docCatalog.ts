import request from './request'

export interface DocSystemPlan {
  id: number
  fileName: string
  title: string
  systemName: string
  systemCode?: string | null
  planType: string
  /** 该文件在 git 里的首次提交时间（不是文件 mtime，跨机器稳定） */
  generatedAt: string | number
  sourcePath: string
  contentHash: string
  fileSize: number
  /** 该文件在 git 里最后一次提交的时间 */
  updatedAt: string | number
  /** 1=生效、0=停用（停用仅退出默认列表与参考，不删除归档） */
  status: number
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
  /** 出參字段表 JSON：{ raw, fields }，由方法签名派生，只读 */
  responseFields?: string | null
  source: string
  apiName?: string | null
  /** 接口名来源：operation / auto / manual */
  apiNameSource?: string | null
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

/** 查询条件。日期传 `YYYY-MM-DD`，后端展开为当天起止时刻；status 不传即全部。 */
export interface DocSystemPlanQuery {
  title?: string
  systemName?: string
  planType?: string
  status?: number
  generatedFrom?: string
  generatedTo?: string
  updatedFrom?: string
  updatedTo?: string
  page?: number
  size?: number
}

export function fetchDocSystemPlans(params: DocSystemPlanQuery = {}) {
  return request.get<unknown, DocSystemPlanPage>('/doc/v3/system-plans', {
    params: {
      title: params.title?.trim() || undefined,
      systemName: params.systemName || undefined,
      planType: params.planType || undefined,
      status: params.status,
      generatedFrom: params.generatedFrom || undefined,
      generatedTo: params.generatedTo || undefined,
      updatedFrom: params.updatedFrom || undefined,
      updatedTo: params.updatedTo || undefined,
      page: params.page ?? 1,
      size: params.size ?? 20,
    },
  })
}

export function fetchDocSystemPlanSystems() {
  return request.get<unknown, string[]>('/doc/v3/system-plans/systems')
}

export function fetchDocSystemPlanTypes() {
  return request.get<unknown, string[]>('/doc/v3/system-plans/plan-types')
}

export function fetchDocSystemPlanDetail(id: number) {
  return request.get<unknown, DocSystemPlanDetail>(`/doc/v3/system-plans/${id}`)
}

export function scanDocSystemPlans() {
  return request.post<unknown, Record<string, number | string>>('/doc/v3/system-plans/scan')
}

/** 停用/启用。后端不存停用原因（表无对应列），因此只传目标状态。 */
export function updateDocSystemPlanStatus(id: number, status: number) {
  return request.post<unknown, DocSystemPlan>(`/doc/v3/system-plans/${id}/status`, { status })
}

export function fetchDocApiCatalogSystems() {
  return request.get<unknown, DocApiCatalogSystem[]>('/doc/v3/api-center/systems')
}

export function fetchDocApiCatalog(params: {
  systemCode?: string
  keyword?: string
  /** 文檔完整度篩選：draft / published / deprecated / incomplete，空=全部 */
  filter?: string
  page?: number
  size?: number
}) {
  return request.get<unknown, DocApiCatalogPage>('/doc/v3/api-center/apis', {
    params: {
      systemCode: params.systemCode || undefined,
      keyword: params.keyword?.trim() || undefined,
      filter: params.filter || undefined,
      page: params.page ?? 1,
      size: params.size ?? 20,
    },
  })
}

export function updateDocApiCatalog(id: number, payload: DocApiCatalogSave) {
  return request.put<unknown, DocApiCatalogEntry>(`/doc/v3/api-center/apis/${id}`, payload)
}

export function scanDocApiCatalog() {
  // 扫描全部 Controller 需要较长时间，单独放宽超时，避免与普通请求共用 15s。
  return request.post<unknown, Record<string, number | string>>('/doc/v3/api-center/scan', null, { timeout: 120_000 })
}
