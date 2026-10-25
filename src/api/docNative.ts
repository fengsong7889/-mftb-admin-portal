import dayjs from 'dayjs'
import request from './request'

/** 契约真值：DocNativeDTO.java；本层只做传输与响应校验，权限和版本归属由后端重判。 */
export type DocNativeTime = string | number

export function formatDocNativeTime(value?: DocNativeTime | null): string {
  return value !== undefined && value !== null && dayjs(value).isValid() ? dayjs(value).format('YYYY-MM-DD HH:mm:ss') : '—'
}

export interface DocNativeDocument {
  nodeId: number
  documentNo: string
  spaceId?: number
  spaceName?: string | null
  ownerUserId?: number
  ownerName?: string | null
  createdByUserId?: number
  draftRevisionId?: number | null
  effectiveRevisionId?: number | null
  adoptedRevisionId?: number | null
  version: number
  lifecycle: number
  executionStatus: number
  restricted?: boolean
  deletedAt?: DocNativeTime | null
  deletionReason?: string | null
  createdAt?: DocNativeTime | null
  updatedAt?: DocNativeTime | null
}

export interface DocNativeRevision {
  id: number
  nodeId: number
  revisionNo: number
  title: string
  summary?: string | null
  markdown?: string | null
  contentHash: string
  createdAt?: DocNativeTime | null
  createdByUserId: number
  systemCode?: string | null
  menuKey?: string | null
  changeReason?: string | null
  tagsJson?: string | null
}

export interface DocNativeConfirmation {
  id: number
  revisionId: number
  reviewerUserId: number
  status: number
  note?: string | null
  createdAt?: DocNativeTime | null
  decidedAt?: DocNativeTime | null
}

export interface DocNativeHandoff {
  id: number
  revisionId: number
  senderUserId: number
  recipientUserId: number
  completedText: string
  remainingText?: string | null
  riskText?: string | null
  status: number
  createdAt?: DocNativeTime | null
  acceptedAt?: DocNativeTime | null
}

export interface DocNativeView {
  document: DocNativeDocument
  revision: DocNativeRevision
  /** 列表响应省略这些集合；详情响应完整返回 */
  revisions?: DocNativeRevision[]
  allowedActions?: string[]
  confirmations?: DocNativeConfirmation[]
  handoffs?: DocNativeHandoff[]
}

export interface DocNativeReceipt {
  documentId: number
  documentNo: string
  revisionId: number
  contentHash: string
  version: number
  savedAt?: DocNativeTime | null
  versionUrl: string
}

export interface DocNativeSpace {
  id: number
  name: string
  description?: string | null
  ownerUserId?: number
  permissions: number
}

export interface DocNativeMember {
  userId: number
  name: string
  empId?: string | null
  permissions: number
}

export interface DocNativeAuditEvent {
  id: number
  action: string
  revisionId?: number | null
  detail?: string
  actorUserId?: number
  createdAt?: DocNativeTime | null
}

export interface DocNativeAcl {
  restricted: boolean
  members: { userId: number; name: string; empId?: string | null; permissions: number }[]
}

export interface DocNativeGrant {
  id: number
  ownerUserId?: number
  spaceId: number
  name: string
  canWrite: boolean
  expiresAt?: DocNativeTime | null
  revokedAt?: DocNativeTime | null
  createdAt?: DocNativeTime | null
}

export interface DocNativeGrantCreated {
  id: number
  token: string
  expiresAt?: DocNativeTime | null
}

export interface DocNativeSavePayload {
  spaceId: number
  title: string
  summary?: string
  markdown: string
  tags: string[]
  systemCode?: string
  menuKey?: string
  originalFilename?: string
  changeReason: string
  sourceSessionKey?: string
  expectedVersion?: number
}

export const DOC_NATIVE_VIEWS = ['effective', 'drafts', 'history', 'trash'] as const
export type DocNativeScope = typeof DOC_NATIVE_VIEWS[number]
export interface DocNativeQuery {
  keyword: string
  view: DocNativeScope
  page: number
  size: number
}
export interface DocNativePage {
  records: DocNativeView[]
  total: number
  page: number
  size: number
}

/** 空间权限位集：读 1 / 写 2 / 确认 4 / 管理 8（与 DocNativeAccess 一致） */
export const DOC_NATIVE_PERMISSION = { READ: 1, EDIT: 2, CONFIRM: 4, MANAGE: 8 } as const

const positiveId = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value > 0
const nullableId = (value: unknown) => value === undefined || value === null || positiveId(value)
const nullableText = (value: unknown) => value === undefined || value === null || typeof value === 'string'
const nullableTime = (value: unknown) => value === undefined || value === null
  || ((typeof value === 'string' || typeof value === 'number') && dayjs(value).isValid())
const optionalArray = (value: unknown) => value === undefined || Array.isArray(value)
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value)
const inRange = (value: unknown, min: number, max: number) => typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max

function isRevision(value: unknown): value is DocNativeRevision {
  if (!record(value)) return false
  return positiveId(value.id) && positiveId(value.nodeId) && positiveId(value.revisionNo)
    && typeof value.title === 'string' && nullableText(value.summary) && nullableText(value.markdown)
    && typeof value.contentHash === 'string' && /^[a-f0-9]{64}$/.test(value.contentHash)
    && nullableTime(value.createdAt) && positiveId(value.createdByUserId)
    && nullableText(value.systemCode) && nullableText(value.menuKey) && nullableText(value.tagsJson)
}

/** 校验页面实际消费的投影；列表不带正文，因此不要求 markdown 存在。 */
function isView(value: unknown): value is DocNativeView {
  if (!record(value) || !record(value.document) || !isRevision(value.revision)) return false
  const d = value.document
  return positiveId(d.nodeId) && typeof d.documentNo === 'string'
    && nullableId(d.spaceId) && nullableText(d.spaceName) && nullableId(d.ownerUserId) && nullableText(d.ownerName)
    && nullableId(d.draftRevisionId) && nullableId(d.effectiveRevisionId) && nullableId(d.adoptedRevisionId)
    && positiveId(d.version) && inRange(d.lifecycle, 1, 3) && inRange(d.executionStatus, 1, 4)
    && (d.restricted === undefined || typeof d.restricted === 'boolean')
    && nullableTime(d.deletedAt) && nullableText(d.deletionReason) && nullableTime(d.createdAt) && nullableTime(d.updatedAt)
    && value.revision.nodeId === d.nodeId
    && optionalArray(value.revisions) && optionalArray(value.allowedActions)
    && optionalArray(value.confirmations) && optionalArray(value.handoffs)
}

export function isDocNativeConflict(error: unknown): boolean {
  const typed = error as { code?: number; response?: { status?: number } } | null
  return typed?.code === 409 || typed?.response?.status === 409
}

/** 幂等键：同一次保存重试必须复用，不能每次点击都换新键。 */
export function newIdempotencyKey(prefix = 'doc'): string {
  const random = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`
  return `${prefix}-${random}`
}

/** 前端仅做链接 UX 校验；版本归属和读取权限必须由后端重验。 */
export function parseDocNativeLink(search: string): { id: number; revisionId?: number } | null {
  const params = new URLSearchParams(search)
  const parseId = (value: string | null) => value && /^[1-9]\d*$/.test(value) && positiveId(Number(value)) ? Number(value) : null
  const id = parseId(params.get('id'))
  if (!id || params.getAll('id').length !== 1 || params.getAll('revision').length > 1) return null
  if (!params.has('revision')) return { id }
  const revisionId = parseId(params.get('revision'))
  // 非法固定版本不能回退成当前版本，否则用户会误读另一份内容。
  return revisionId ? { id, revisionId } : null
}

export function parseDocNativeId(search: string, name = 'id'): number | null {
  const value = new URLSearchParams(search).get(name)
  return value && /^[1-9]\d*$/.test(value) && positiveId(Number(value)) ? Number(value) : null
}

export function docNativeDetailPath(id: number, revisionId: number): string {
  if (!positiveId(id) || !positiveId(revisionId)) throw new Error('無效的文檔版本')
  return `/doc-plans/detail?id=${id}&revision=${revisionId}`
}

export async function fetchDocNativeView(id: number, revisionId?: number): Promise<DocNativeView> {
  if (!positiveId(id) || (revisionId !== undefined && !positiveId(revisionId))) throw new Error('無效的文檔版本')
  const path = revisionId === undefined ? `/doc/v2/documents/${id}` : `/doc/v2/documents/${id}/revisions/${revisionId}`
  const result = await request.get<unknown, unknown>(path)
  if (!isView(result) || result.document.nodeId !== id
    || (revisionId !== undefined && result.revision.id !== revisionId) || typeof result.revision.markdown !== 'string') {
    throw new Error('文檔回應不符合版本契約')
  }
  return { ...result, revisions: result.revisions ?? [], allowedActions: result.allowedActions ?? [],
    confirmations: result.confirmations ?? [], handoffs: result.handoffs ?? [] }
}

export async function fetchDocNativePage(query: DocNativeQuery): Promise<DocNativePage> {
  const result = await request.get<unknown, unknown>('/doc/v2/documents', { params: query })
  if (!record(result) || !Array.isArray(result.records) || !result.records.every(isView)
    || typeof result.total !== 'number' || !Number.isSafeInteger(result.total) || result.total < 0
    || !positiveId(result.page) || !positiveId(result.size) || result.size > 100) {
    throw new Error('文檔列表回應不符合契約')
  }
  return { records: result.records, total: result.total, page: result.page, size: result.size }
}

export async function fetchDocNativeSpaces(): Promise<DocNativeSpace[]> {
  const rows = await request.get<unknown, unknown>('/doc/v2/spaces')
  if (!Array.isArray(rows) || !rows.every(row => record(row) && positiveId(row.id)
    && typeof row.name === 'string' && inRange(row.permissions, 1, 15))) {
    throw new Error('空間列表回應不符合契約')
  }
  return rows as DocNativeSpace[]
}

export async function fetchDocNativeMembers(spaceId: number): Promise<DocNativeMember[]> {
  if (!positiveId(spaceId)) throw new Error('無效的空間')
  const rows = await request.get<unknown, unknown>(`/doc/v2/spaces/${spaceId}/members`)
  if (!Array.isArray(rows) || !rows.every(row => record(row) && positiveId(row.userId)
    && typeof row.name === 'string' && inRange(row.permissions, 1, 15))) {
    throw new Error('空間成員回應不符合契約')
  }
  return rows as DocNativeMember[]
}

export async function createDocNativeSpace(payload: { name: string; description?: string }): Promise<DocNativeSpace> {
  const result = await request.post<unknown, unknown>('/doc/v2/spaces', payload)
  if (!record(result) || !positiveId(result.id) || typeof result.name !== 'string' || !inRange(result.permissions, 1, 15)) {
    throw new Error('空間建立回應不符合契約')
  }
  return result as unknown as DocNativeSpace
}

export async function saveDocNativeMember(spaceId: number, body: { userId: number; permissions: number }): Promise<void> {
  if (!positiveId(spaceId) || !positiveId(body.userId)) throw new Error('無效的空間成員')
  await request.put<unknown, void>(`/doc/v2/spaces/${spaceId}/members`, body)
}

export async function removeDocNativeMember(spaceId: number, userId: number): Promise<void> {
  if (!positiveId(spaceId) || !positiveId(userId)) throw new Error('無效的空間成員')
  await request.delete<unknown, void>(`/doc/v2/spaces/${spaceId}/members/${userId}`)
}

function requireReceipt(value: unknown): DocNativeReceipt {
  if (!record(value) || !positiveId(value.documentId) || typeof value.documentNo !== 'string'
    || !positiveId(value.revisionId) || typeof value.contentHash !== 'string' || !positiveId(value.version)
    || typeof value.versionUrl !== 'string') {
    throw new Error('保存回執不符合契約')
  }
  return value as unknown as DocNativeReceipt
}

export async function createDocNativeDraft(payload: DocNativeSavePayload, key = newIdempotencyKey('create')): Promise<DocNativeReceipt> {
  const result = await request.post<unknown, unknown>('/doc/v2/documents', payload, { headers: { 'Idempotency-Key': key } })
  return requireReceipt(result)
}

export async function saveDocNativeRevision(id: number, payload: DocNativeSavePayload, key = newIdempotencyKey('revise')): Promise<DocNativeReceipt> {
  const result = await request.post<unknown, unknown>(`/doc/v2/documents/${id}/revisions`, payload, { headers: { 'Idempotency-Key': key } })
  return requireReceipt(result)
}

export async function submitDocNativeConfirmation(id: number, body: { expectedVersion: number; revisionId: number; reviewerUserId: number }): Promise<number> {
  const result = await request.post<unknown, unknown>(`/doc/v2/documents/${id}/confirmations`, body)
  if (typeof result !== 'number' || !positiveId(result)) throw new Error('確認申請回應不符合契約')
  return result
}

export async function decideDocNativeConfirmation(confirmationId: number,
  body: { expectedVersion: number; decision: 'approve' | 'reject' | 'withdraw'; note?: string }): Promise<void> {
  await request.post<unknown, void>(`/doc/v2/confirmations/${confirmationId}/decision`, body)
}

export async function createDocNativeHandoff(id: number,
  body: { expectedVersion: number; revisionId: number; recipientUserId: number; completedText: string; remainingText: string; riskText?: string }): Promise<number> {
  const result = await request.post<unknown, unknown>(`/doc/v2/documents/${id}/handoffs`, body)
  if (typeof result !== 'number' || !positiveId(result)) throw new Error('交接回應不符合契約')
  return result
}

export async function acceptDocNativeHandoff(handoffId: number, body: { expectedVersion: number; reason?: string }): Promise<void> {
  await request.post<unknown, void>(`/doc/v2/handoffs/${handoffId}/accept`, body)
}

export async function updateDocNativeExecution(id: number,
  body: { expectedVersion: number; revisionId: number; status: number; evidence: string }): Promise<void> {
  await request.post<unknown, void>(`/doc/v2/documents/${id}/execution`, body)
}

export async function trashDocNativeDocument(id: number, body: { expectedVersion: number; reason: string }): Promise<void> {
  await request.post<unknown, void>(`/doc/v2/documents/${id}/trash`, body)
}

export async function restoreDocNativeDocument(id: number, body: { expectedVersion: number; reason?: string }): Promise<void> {
  await request.post<unknown, void>(`/doc/v2/documents/${id}/restore`, body)
}

export async function saveDocNativeAcl(id: number,
  body: { expectedVersion: number; restricted: boolean; members: { userId: number; permissions: number }[] }): Promise<void> {
  await request.put<unknown, void>(`/doc/v2/documents/${id}/acl`, body)
}

export async function fetchDocNativeAcl(id: number): Promise<DocNativeAcl> {
  const result = await request.get<unknown, unknown>(`/doc/v2/documents/${id}/acl`)
  if (!record(result) || typeof result.restricted !== 'boolean' || !Array.isArray(result.members)
    || !result.members.every(member => record(member) && positiveId(member.userId)
      && typeof member.name === 'string' && inRange(member.permissions, 1, 3))) {
    throw new Error('收窄授權回應不符合契約')
  }
  return result as unknown as DocNativeAcl
}

export async function fetchDocNativeGrants(): Promise<DocNativeGrant[]> {
  const rows = await request.get<unknown, unknown>('/doc/v2/grants')
  if (!Array.isArray(rows) || !rows.every(row => record(row) && positiveId(row.id) && positiveId(row.spaceId)
    && typeof row.name === 'string' && typeof row.canWrite === 'boolean')) {
    throw new Error('集成憑據清單不符合契約')
  }
  return rows as DocNativeGrant[]
}

export async function issueDocNativeGrant(body: { spaceId: number; name: string; canWrite: boolean; days: number }): Promise<DocNativeGrantCreated> {
  const result = await request.post<unknown, unknown>('/doc/v2/grants', body)
  if (!record(result) || !positiveId(result.id) || typeof result.token !== 'string'
    || !result.token.startsWith('docint_')) {
    throw new Error('集成憑據簽發回應不符合契約')
  }
  return result as unknown as DocNativeGrantCreated
}

export async function revokeDocNativeGrant(id: number): Promise<void> {
  if (!positiveId(id)) throw new Error('無效的集成憑據')
  await request.delete<unknown, void>(`/doc/v2/grants/${id}`)
}

export async function fetchDocNativeAudit(id: number): Promise<DocNativeAuditEvent[]> {
  const rows = await request.get<unknown, unknown>(`/doc/v2/documents/${id}/audit`)
  if (!Array.isArray(rows)) throw new Error('操作記錄回應不符合契約')
  return rows.filter(record).map(row => ({
    id: Number(row.id), action: String(row.action ?? ''),
    revisionId: typeof row.revision_id === 'number' ? row.revision_id : null,
    detail: typeof row.detail === 'string' ? row.detail : '',
    actorUserId: typeof row.actor_user_id === 'number' ? row.actor_user_id : undefined,
    createdAt: (row.created_at ?? undefined) as DocNativeTime | undefined,
  }))
}

export async function exportDocNativeVersion(id: number, revisionId?: number): Promise<Blob> {
  const result = await request.get<unknown, Blob>(`/doc/v2/documents/${id}/export`,
    { params: revisionId ? { revisionId } : undefined, responseType: 'blob' })
  if (!(result instanceof Blob)) throw new Error('導出回應不是檔案')
  return result
}

/**
 * 可迁移清单：只含编号/版本/状态/关系与校验值，不含正文、凭据、ACL 与审计。
 * 用于导出再导入时还原选定版本与关系，不把敏感内容带出。
 */
export function buildDocNativeManifest(view: DocNativeView) {
  const doc = view.document
  return {
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
    document: {
      nodeId: doc.nodeId, documentNo: doc.documentNo, spaceId: doc.spaceId, spaceName: doc.spaceName,
      ownerUserId: doc.ownerUserId, lifecycle: doc.lifecycle, executionStatus: doc.executionStatus,
      version: doc.version, effectiveRevisionId: doc.effectiveRevisionId ?? null,
      adoptedRevisionId: doc.adoptedRevisionId ?? null, createdAt: doc.createdAt ?? null, updatedAt: doc.updatedAt ?? null,
    },
    revision: {
      id: view.revision.id, revisionNo: view.revision.revisionNo, title: view.revision.title,
      summary: view.revision.summary ?? null, contentHash: view.revision.contentHash,
      createdAt: view.revision.createdAt ?? null,
    },
    revisions: (view.revisions ?? []).map(revision => ({
      id: revision.id, revisionNo: revision.revisionNo, title: revision.title,
      contentHash: revision.contentHash, createdAt: revision.createdAt ?? null,
    })),
    confirmations: (view.confirmations ?? []).map(record => ({
      id: record.id, revisionId: record.revisionId, status: record.status, decidedAt: record.decidedAt ?? null,
    })),
    handoffs: (view.handoffs ?? []).map(record => ({
      id: record.id, revisionId: record.revisionId, status: record.status, acceptedAt: record.acceptedAt ?? null,
    })),
  }
}
