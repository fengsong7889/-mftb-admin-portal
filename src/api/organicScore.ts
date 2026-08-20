import request, { SILENT_HEADER, isBackendUnavailable } from './request'

/** 维度权重 VO */
export interface OrganicDimensionVO {
  id: number
  dimension: number
  weight: number
  sortOrder: number
}

/** 评分规则 VO */
export interface OrganicRuleVO {
  id: number
  ruleCode: string
  dimension: number
  name: string
  description: string
  mode: number
  score: number
  prerequisites?: string
  statDays?: number
  rangeScores?: string
  tiers?: string
  conditionItems?: string
  calcCycle?: string
  calcIntervalHours?: number
  statDaysTotal?: number
  statDaysRecent?: number
  peakTimeRanges?: string
  deductionPerOrder?: number
  decayCoefficient?: number
  timeRangeScores?: string
  status: number
  builtin: number
  sortOrder: number
  updatedBy?: string
  updateTime?: string
}

/** 完整配置（维度权重 + 评分规则） */
export interface OrganicScoreConfig {
  dimensions: OrganicDimensionVO[]
  rules: OrganicRuleVO[]
}

/** 评分规则新增/编辑请求 */
export interface OrganicRulePayload {
  dimension: number
  name: string
  description: string
  mode: number
  score?: number
  prerequisites?: string
  statDays?: number
  rangeScores?: string
  tiers?: string
  conditionItems?: string
  calcCycle?: string
  calcIntervalHours?: number
  statDaysTotal?: number
  statDaysRecent?: number
  peakTimeRanges?: string
  deductionPerOrder?: number
  decayCoefficient?: number
  timeRangeScores?: string
  status: number
}

/** 维度权重更新请求 */
export interface OrganicDimensionWeightPayload {
  dimension: number
  weight: number
}

/** 静默请求头 */
const SILENT = { headers: { [SILENT_HEADER]: '1' } }

/** 获取完整配置（维度权重 + 全部评分规则） */
export async function fetchOrganicScoreConfig() {
  try {
    return await request.get<unknown, OrganicScoreConfig>('/organic-score', SILENT)
  } catch (err) {
    if (isBackendUnavailable(err)) return { dimensions: [], rules: [] }
    throw err
  }
}

/** 批量更新维度权重 */
export async function updateDimensionWeights(data: OrganicDimensionWeightPayload[]) {
  return request.put<unknown, void>('/organic-score/dimensions', data)
}

/** 新增评分规则 */
export async function createOrganicRule(data: OrganicRulePayload) {
  return request.post<unknown, OrganicRuleVO>('/organic-score/rules', data)
}

/** 编辑评分规则 */
export async function updateOrganicRule(id: number, data: OrganicRulePayload) {
  return request.put<unknown, OrganicRuleVO>(`/organic-score/rules/${id}`, data)
}

/** 切换规则状态 */
export async function toggleOrganicRuleStatus(id: number) {
  return request.put<unknown, void>(`/organic-score/rules/${id}/toggle`)
}

/** 更新规则分值 */
export async function updateOrganicRuleScore(id: number, score: number) {
  return request.put<unknown, void>(`/organic-score/rules/${id}/score`, { score })
}

/** 删除自定义规则 */
export async function deleteOrganicRule(id: number) {
  return request.delete<unknown, void>(`/organic-score/rules/${id}`)
}
