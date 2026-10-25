import request from './request'
import type { ConsolePane } from '../pages/AiAssistant/console/consoleModel'

/**
 * 企業 Agent 控制面 API（/api/agent/platform/**）。
 *
 * <p>所有寫操作的最終裁決都在後端（分級、端點批准、ACL、預算池、提案），
 * 前端只負責展示與提交；不要把這裡的返回值當成“已放行”的憑據。
 */
export interface AgentReadiness {
  workerEnabled: boolean
  counts: { dataClasses: number; approvedEndpoints: number; knowledgeAcls: number; publishedApplications: number }
  blocking: string[]
  readyForModelCalls: boolean
  readyForKnowledgeSearch: boolean
  note?: string
}

export interface AgentApplicationRow {
  key: string
  name: string
  system: string
  owner: string
  publishedVersion: number
  state: 'published' | 'draft'
  tools: string[]
  knowledge: string[]
}

export interface AgentBudgetPoolRow {
  key: string
  scopeType: 'USER' | 'DEPT' | 'APP'
  scopeLabel: string
  period: string
  limit: number
  reserved: number
  used: number
  currency: string
}

export interface AgentActionRow {
  key: string
  tool: string
  target: string
  impact: string
  requester: string
  status: 'pending' | 'approved' | 'unknown' | 'executed'
  expiresAt: string
  approvalRef?: string
}

export interface AgentDataClassRow {
  system: string
  label: string
  level: 'PUBLIC' | 'INTERNAL' | 'SENSITIVE' | 'RESTRICTED'
  note: string
}

export interface AgentEndpointRow {
  model: string
  maxLevel: string
  residency: 'private' | 'external'
  expiresAt: string
  note: string
}

export interface AgentAclRow {
  doc: string
  title: string
  subjects: string
  version: string
  state: 'active' | 'revoked'
}

export interface AgentRunRow {
  key: string
  runNo: string
  appName: string
  requester: string
  status: 'queued' | 'running' | 'succeeded' | 'unknown'
  startedAt: string
  steps: { title: string; state: 'finish' | 'process' | 'wait' | 'error'; detail: string }[]
}

export interface AgentEvalCaseRow {
  caseNo: string
  title: string
  expected: string
  actual: string
  passed: boolean
}

export interface AgentReleaseRow {
  key: string
  app: string
  version: string
  releasedBy: string
  releasedAt: string
  state: 'active' | 'rolled_back'
}

type Dict = Record<string, unknown>

const str = (value: unknown, fallback = '') => value === null || value === undefined ? fallback : String(value)
const num = (value: unknown, fallback = 0) => {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

const RUN_STATUS: Record<string, AgentRunRow['status']> = {
  queued: 'queued', running: 'running', succeeded: 'succeeded',
  failed: 'unknown', unknown: 'unknown', cancelled: 'unknown', waiting_approval: 'running',
}
const ACTION_STATUS: Record<string, AgentActionRow['status']> = {
  pending: 'pending', approved: 'approved', executing: 'approved', unknown: 'unknown',
  executed: 'executed', failed: 'unknown', expired: 'unknown', rejected: 'unknown', cancelled: 'unknown',
}

export function fetchReadiness() {
  return request.get<unknown, AgentReadiness>('/agent/platform/ops/readiness')
}

export async function fetchApplications(keyword?: string): Promise<AgentApplicationRow[]> {
  const rows = await request.get<unknown, Dict[]>('/agent/platform/applications', { params: { keyword } })
  return (rows ?? []).map(row => ({
    key: str(row.app_key), name: str(row.name), system: str(row.system_code, 'common'),
    owner: str(row.owner_name, '—'), publishedVersion: num(row.published_version),
    state: num(row.published_version) > 0 ? 'published' : 'draft',
    // 工具白名單在版本詳情中；列表不逐行拉詳情，避免 N+1
    tools: [], knowledge: [],
  }))
}

export async function fetchApplication(appKey: string) {
  return request.get<unknown, Dict & { versions?: Dict[] }>(`/agent/platform/applications/${encodeURIComponent(appKey)}`)
}

export async function saveApplication(body: Dict) {
  return request.post<unknown, Dict>('/agent/platform/applications', body)
}

export async function createApplicationVersion(appKey: string, body: Dict) {
  return request.post<unknown, Dict>(`/agent/platform/applications/${encodeURIComponent(appKey)}/versions`, body)
}

export async function publishApplication(appKey: string, versionNo: number, note?: string) {
  return request.post<unknown, Dict>(
    `/agent/platform/applications/${encodeURIComponent(appKey)}/versions/${versionNo}/publish`, null, { params: { note } })
}

export async function rollbackApplication(appKey: string, versionNo: number, note?: string) {
  return request.post<unknown, Dict>(
    `/agent/platform/applications/${encodeURIComponent(appKey)}/versions/${versionNo}/rollback`, null, { params: { note } })
}

export async function fetchBudgetPools(scopeType?: string): Promise<AgentBudgetPoolRow[]> {
  const rows = await request.get<unknown, Dict[]>('/agent/platform/budget-pools', { params: { scopeType } })
  return (rows ?? []).map(row => ({
    key: `${str(row.scope_type)}-${str(row.scope_key)}-${str(row.period)}`,
    scopeType: (str(row.scope_type, 'USER') as AgentBudgetPoolRow['scopeType']),
    scopeLabel: str(row.scope_key, '—'), period: str(row.period),
    limit: num(row.limit_amount), reserved: num(row.reserved_amount), used: num(row.used_amount),
    currency: str(row.currency, 'CNY'),
  }))
}

export function saveBudgetPool(body: Dict) {
  return request.post<unknown, Dict>('/agent/platform/budget-pools', body)
}

export async function fetchActions(params: { requester?: string; status?: string } = {}): Promise<AgentActionRow[]> {
  const rows = await request.get<unknown, Dict[]>('/agent/platform/actions', { params })
  return (rows ?? []).map(row => ({
    key: str(row.proposal_no), tool: str(row.tool_key), target: str(row.target_resource, '—'),
    impact: str(row.impact_summary, '—'), requester: str(row.requester),
    status: ACTION_STATUS[str(row.status)] ?? 'unknown',
    expiresAt: str(row.expires_at), approvalRef: str(row.approval_ref) || undefined,
  }))
}

export function prepareAction(body: Dict) {
  return request.post<unknown, Dict>('/agent/platform/actions', body)
}

export function approveAction(proposalNo: string, approvalRef: string) {
  return request.post<unknown, Dict>(`/agent/platform/actions/${encodeURIComponent(proposalNo)}/approve`, { approvalRef })
}

export function executeAction(proposalNo: string) {
  return request.post<unknown, Dict>(`/agent/platform/actions/${encodeURIComponent(proposalNo)}/execute`)
}

export function reconcileAction(proposalNo: string, delivered: boolean, detail: string) {
  return request.post<unknown, Dict>(`/agent/platform/actions/${encodeURIComponent(proposalNo)}/reconcile`, { delivered, detail })
}

export async function fetchDataClasses(): Promise<AgentDataClassRow[]> {
  const rows = await request.get<unknown, Dict[]>('/agent/platform/data-policies')
  return (rows ?? []).map(row => ({
    system: str(row.system_code), label: str(row.system_code),
    level: (str(row.data_class, 'INTERNAL') as AgentDataClassRow['level']),
    note: str(row.note, '—'),
  }))
}

export function saveDataClass(body: Dict) {
  return request.post<unknown, Dict>('/agent/platform/data-policies', body)
}

export async function fetchEndpoints(): Promise<AgentEndpointRow[]> {
  const rows = await request.get<unknown, Dict[]>('/agent/platform/endpoints')
  return (rows ?? []).map(row => ({
    model: str(row.model_key), maxLevel: str(row.max_data_class),
    residency: str(row.residency, 'external') === 'private' ? 'private' : 'external',
    expiresAt: str(row.expires_at, '—'), note: str(row.note, '—'),
  }))
}

export function approveEndpoint(body: Dict) {
  return request.post<unknown, Dict>('/agent/platform/endpoints', body)
}

export function revokeEndpoint(modelKey: string) {
  return request.delete<unknown, void>(`/agent/platform/endpoints/${encodeURIComponent(modelKey)}`)
}

export async function fetchKnowledgeAcl(docId: number): Promise<AgentAclRow[]> {
  const rows = await request.get<unknown, Dict[]>(`/agent/platform/knowledge/${docId}/acl`)
  return (rows ?? []).map(row => ({
    doc: `${docId}`, title: '#'.concat(String(docId)), version: '—',
    subjects: `${str(row.subject_type)}:${str(row.subject_id)}`,
    state: 'active',
  }))
}

export function grantKnowledgeAcl(docId: number, subjectType: string, subjectId: string) {
  return request.post<unknown, void>(`/agent/platform/knowledge/${docId}/acl`, { subjectType, subjectId })
}

export function revokeKnowledgeAcl(docId: number, subjectType: string, subjectId: string) {
  return request.delete<unknown, void>(`/agent/platform/knowledge/${docId}/acl`, { params: { subjectType, subjectId } })
}

export async function fetchRuns(status?: string): Promise<AgentRunRow[]> {
  const rows = await request.get<unknown, Dict[]>('/agent/platform/runs', { params: { status } })
  return (rows ?? []).map(row => ({
    key: str(row.run_no), runNo: str(row.run_no), appName: str(row.app_key, '—'),
    requester: str(row.requester), status: RUN_STATUS[str(row.status)] ?? 'unknown',
    startedAt: str(row.started_at, str(row.created_at)), steps: [],
  }))
}

export async function fetchRunDetail(runNo: string): Promise<AgentRunRow> {
  const row = await request.get<unknown, Dict>(`/agent/platform/runs/${encodeURIComponent(runNo)}`)
  const steps = (row.steps as Dict[] | undefined) ?? []
  return {
    key: str(row.run_no), runNo: str(row.run_no), appName: str(row.app_key, '—'),
    requester: str(row.requester), status: RUN_STATUS[str(row.status)] ?? 'unknown',
    startedAt: str(row.started_at, str(row.created_at)),
    steps: steps.map(step => ({
      title: str(step.step_type),
      state: str(step.status) === 'succeeded' ? 'finish' : str(step.status) === 'failed' ? 'error' : 'process',
      detail: str(step.detail, str(step.tool_key)),
    })),
  }
}

export function createRun(body: Dict) {
  return request.post<unknown, Dict>('/agent/platform/runs', body)
}

export function cancelRun(runNo: string) {
  return request.post<unknown, Dict>(`/agent/platform/runs/${encodeURIComponent(runNo)}/cancel`)
}

export async function fetchReleases(appKey?: string): Promise<AgentReleaseRow[]> {
  const rows = await request.get<unknown, Dict[]>('/agent/platform/releases', { params: { appKey } })
  return (rows ?? []).map(row => ({
    key: `${str(row.app_key)}-${str(row.app_version)}`,
    app: str(row.app_key), version: `v${str(row.app_version)}`,
    releasedBy: str(row.released_by, '—'), releasedAt: str(row.released_at, '—'),
    state: row.rolled_back_at ? 'rolled_back' : 'active',
  }))
}

export async function fetchEvalCases(datasetKey?: string): Promise<AgentEvalCaseRow[]> {
  const rows = await request.get<unknown, Dict[]>('/agent/platform/eval/cases', { params: { datasetKey } })
  return (rows ?? []).map(row => ({
    caseNo: str(row.case_no), title: str(row.input_text).slice(0, 80),
    expected: '—', actual: '—', passed: num(row.must_pass) === 1,
  }))
}

export function saveEvalCase(body: Dict) {
  return request.post<unknown, Dict>('/agent/platform/eval/cases', body)
}

export async function runEval(datasetKey: string, appKey?: string) {
  return request.post<unknown, { total: number; passed: number; failed: number; blocking: boolean }>(
    '/agent/platform/eval/run', { datasetKey, appKey })
}

export async function fetchEvalRuns(datasetKey?: string) {
  return request.get<unknown, Dict[]>('/agent/platform/eval/runs', { params: { datasetKey } })
}

export function evaluatePolicy(systemCode: string, modelKey?: string) {
  return request.post<unknown, Dict>('/agent/platform/policies/evaluate', { systemCode, modelKey })
}

export function fetchOpsSummary() {
  return request.get<unknown, Dict>('/agent/platform/ops/summary')
}

/** 面板 → 需載入的資料；供頁面按 pane 觸發，避免進一頁拉全部。 */
export function loadPane(pane: ConsolePane) {
  switch (pane) {
    case 'overview': return fetchReadiness()
    case 'apps': return fetchApplications()
    case 'budget': return fetchBudgetPools()
    case 'actions': return fetchActions()
    case 'knowledge': return fetchKnowledgeAcl(0).catch(() => [] as AgentAclRow[])
    case 'data': return Promise.all([fetchDataClasses(), fetchEndpoints()])
    case 'runs': return fetchRuns()
    case 'evaluation': return fetchEvalCases()
  }
}
