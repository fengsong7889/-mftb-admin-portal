import request, { SILENT_HEADER, isBackendUnavailable } from './request'

/**
 * 搜索运营 · 配置管理域前端 API（对接后端 /api/search/*）。
 * <p>读操作后端不可用时降级为空数组（页面据此回退到原型样例，保持 U1 可离线预览）；
 * 写操作不做假成功——后端不可用会抛出，由页面层保留本次会话草稿。前端校验仅 UX，后端重验。
 */

const SILENT = { headers: { [SILENT_HEADER]: '1' } }

/** 与后端枚举一致：类型/场景/频道/来源/审批/状态均为整型编码（方案 §11.2、业务数据字典）。 */
export interface SearchGuidanceItem {
  id?: number
  configNo?: string
  wordType: number
  displayText: string
  targetQuery: string
  brand?: string
  surface: number
  bizChannel?: number
  regionCode?: string
  priority?: number
  source?: number
  startDate?: string
  endDate?: string
  approvalStatus?: number
  status?: number
  remark?: string
  updatedBy?: string
  updatedAt?: string
}

export interface SearchLexiconItem {
  id?: number
  entryNo?: string
  wordType: number
  sourceTerm: string
  targetTerm: string
  entityId?: number
  entityType?: number
  categoryId?: string
  brand?: string
  evidence?: string
  status?: number
  updatedBy?: string
  updatedAt?: string
}

export interface SearchScenarioItem {
  id?: number
  scenarioNo?: string
  surface: number
  bizChannel?: number
  objectType?: number
  weightRelevance: number
  weightQuality: number
  weightDistance: number
  weightHeat: number
  candidateWindow?: number
  adLimitPerPage: number
  filterRule?: string
  status?: number
  updatedBy?: string
  updatedAt?: string
}

export interface SearchInterventionItem {
  id?: number
  ruleNo?: string
  targetType: number
  targetId: string
  targetName?: string
  actionType: number
  scopeTerms?: string
  exactTerms?: string
  multiplier?: number
  regionCode?: string
  surface?: number
  bizChannel?: number
  reason: string
  startDate: string
  endDate: string
  approvalStatus?: number
  approver?: string
  status?: number
  updatedBy?: string
  updatedAt?: string
}

export interface SearchReleaseItem {
  id?: number
  versionNo: string
  changeSummary: string
  snapshot?: string
  checksum?: string
  status?: number
  rollbackVersion?: string
  approver?: string
  approveTime?: string
  publishedAt?: string
  updatedBy?: string
  updatedAt?: string
}

async function getList<T>(path: string, params?: Record<string, unknown>): Promise<T[]> {
  try {
    return await request.get<unknown, T[]>(path, { params, ...SILENT })
  } catch (err) {
    if (isBackendUnavailable(err)) return []
    throw err
  }
}

export const fetchGuidance = () => getList<SearchGuidanceItem>('/search/guidance')
export const createGuidance = (d: SearchGuidanceItem) => request.post<unknown, number>('/search/guidance', d)
export const updateGuidance = (id: number, d: SearchGuidanceItem) => request.put<unknown, void>(`/search/guidance/${id}`, d)

export const fetchLexicon = () => getList<SearchLexiconItem>('/search/lexicon')
export const createLexicon = (d: SearchLexiconItem) => request.post<unknown, number>('/search/lexicon', d)
export const updateLexicon = (id: number, d: SearchLexiconItem) => request.put<unknown, void>(`/search/lexicon/${id}`, d)

export const fetchScenario = () => getList<SearchScenarioItem>('/search/scenario')
export const createScenario = (d: SearchScenarioItem) => request.post<unknown, number>('/search/scenario', d)
export const updateScenario = (id: number, d: SearchScenarioItem) => request.put<unknown, void>(`/search/scenario/${id}`, d)

export const fetchIntervention = () => getList<SearchInterventionItem>('/search/intervention')
export const createIntervention = (d: SearchInterventionItem) => request.post<unknown, number>('/search/intervention', d)
export const updateIntervention = (id: number, d: SearchInterventionItem) => request.put<unknown, void>(`/search/intervention/${id}`, d)
export const approveIntervention = (id: number, approved: boolean) =>
  request.post<unknown, void>(`/search/intervention/${id}/approve`, { approved })

export const fetchRelease = () => getList<SearchReleaseItem>('/search/release')
export const createRelease = (d: SearchReleaseItem) => request.post<unknown, number>('/search/release', d)
export const submitRelease = (id: number) => request.post<unknown, void>(`/search/release/${id}/submit`, {})
export const approveRelease = (id: number) => request.post<unknown, void>(`/search/release/${id}/approve`, {})
