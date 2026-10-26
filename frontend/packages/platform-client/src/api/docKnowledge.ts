import request from './request'
import { formatDocNativeTime, newIdempotencyKey } from './docNative'
import type { DocNativeTime } from './docNative'

/** 契约真值：DocKnowledgeDTO.java；权限与密级由后端重判，前端只负责展示与交互。 */

export const DOC_CONTENT_KIND = {
  MARKDOWN: 1,
  PDF: 2,
  OFFICE: 3,
  LINK: 4,
  OPENAPI: 5,
} as const
export type DocContentKind = (typeof DOC_CONTENT_KIND)[keyof typeof DOC_CONTENT_KIND]

export const DOC_CONFIDENTIALITY = {
  PUBLIC: 1,
  INTERNAL: 2,
  SENSITIVE: 3,
  RESTRICTED: 4,
} as const
export type DocConfidentiality = (typeof DOC_CONFIDENTIALITY)[keyof typeof DOC_CONFIDENTIALITY]

/** 用户密级与文档密级共用 1-4 口径；撤销后回落到 INTERNAL(2)。 */
export const DOC_CLEARANCE_LEVEL = DOC_CONFIDENTIALITY

export const DOC_CONFIDENTIALITY_COLOR: Record<DocConfidentiality, string> = {
  1: 'green',
  2: 'blue',
  3: 'orange',
  4: 'red',
}

export const DOC_DOWNLOAD_POLICY = {
  ALLOW: 1,
  APPROVAL: 2,
  DENY: 3,
} as const

export const DOC_CONTENT_KIND_VALUES: DocContentKind[] = [1, 2, 3, 4, 5]
export const DOC_CONFIDENTIALITY_VALUES: DocConfidentiality[] = [1, 2, 3, 4]

export interface DocKnowledgeSpace {
  id: number
  name: string
  description?: string | null
  kind: number
  /** true=已建立 doc_space_access，可写入原生文档；false=历史空间只读 */
  managed: boolean
}

export interface DocCategoryNode {
  id: number
  parentId: number
  code: string
  name: string
  path: string
  level: number
  sortOrder: number
  status: number
  docCount: number
  children: DocCategoryNode[]
}

export interface DocTag {
  id: number
  spaceId: number
  name: string
  color?: string | null
  status: number
}

export interface DocSearchRow {
  nodeId: number
  title: string
  summary?: string | null
  spaceId: number
  spaceName: string
  categoryId?: number | null
  categoryName?: string | null
  contentKind: DocContentKind
  confidentiality: DocConfidentiality
  status: number
  tags: string
  ownerName?: string | null
  nativeDoc: boolean
  updatedAt: DocNativeTime
}

export interface DocSearchPage {
  records: DocSearchRow[]
  total: number
  page: number
  size: number
}

export interface DocClearanceUser {
  userId: number
  name: string
  empId?: string | null
  username: string
}

export interface DocClearance {
  userId: number
  name: string
  empId?: string | null
  maxLevel: number
  grantedByName?: string | null
  grantedAt?: DocNativeTime | null
  expiresAt?: DocNativeTime | null
}

export interface DocAckTarget {
  subjectType: 'DEPT' | 'ROLE' | 'ALL'
  subjectId: string
  subjectName?: string | null
  dueAt?: string | null
}

export interface DocAckStatus {
  nodeId: number
  revisionId?: number | null
  targeted: boolean
  acknowledged: boolean
  acknowledgedAt?: DocNativeTime | null
  dueAt?: string | null
  targetCount: number
  receiptCount: number
}

export interface DocAckReceipt {
  userId: number
  name: string
  empId?: string | null
  acknowledgedAt?: DocNativeTime | null
}

export interface DocAckCoverageRow {
  subjectType: 'DEPT' | 'ROLE' | 'ALL'
  subjectId: string
  subjectName: string
  dueAt?: string | null
  targetUsers: number
  acknowledgedUsers: number
  rate: number
}

export interface DocAckCoverage {
  rows: DocAckCoverageRow[]
  targetUsers: number
  acknowledgedUsers: number
  rate: number
}

export interface DocPendingAck {
  nodeId: number
  title: string
  spaceName: string
  revisionId?: number | null
  dueAt?: string | null
  confidentiality: DocConfidentiality
  updatedAt: DocNativeTime
}

export interface DocPendingAckPage {
  records: DocPendingAck[]
  total: number
  page: number
  size: number
}

export interface DocKnowledgeStats {
  total: number
  effective: number
  updatedThisMonth: number
  files: number
  pendingAck: number
}

export interface DocAsset {
  id: number
  spaceId: number
  originalName: string
  mime: string
  sizeBytes: number
  status: number
  scanResult?: string | null
  createdBy?: number | null
  createdAt?: DocNativeTime | null
}

export interface DocKnowledgeHead {
  nodeId: number
  documentNo: string
  spaceId: number
  spaceName?: string | null
  ownerUserId?: number | null
  ownerName?: string | null
  createdByUserId?: number | null
  draftRevisionId?: number | null
  effectiveRevisionId?: number | null
  adoptedRevisionId?: number | null
  version: number
  lifecycle: number
  executionStatus: number
  /** 1草稿 2评审中 3已生效 4已归档 5已失效 6待销毁 7已销毁 */
  status: number
  restricted: boolean
  contentKind: DocContentKind
  categoryId?: number | null
  categoryName?: string | null
  confidentiality: DocConfidentiality
  downloadPolicy: number
  sourceUrl?: string | null
  legalHold: number
  deletedAt?: DocNativeTime | null
  deletionReason?: string | null
  createdAt?: DocNativeTime | null
  updatedAt?: DocNativeTime | null
}

export interface DocKnowledgeRevision {
  id: number
  nodeId: number
  revisionNo: number
  title: string
  summary?: string | null
  markdown?: string | null
  tagsJson?: string | null
  originalFilename?: string | null
  contentHash: string
  changeReason?: string | null
  createdByUserId?: number | null
  createdAt?: DocNativeTime | null
}

export interface DocAclEntry {
  id: number
  subjectType: 'USER' | 'DEPT' | 'ROLE' | 'ALL'
  subjectId: string
  subjectName?: string | null
  permissions: number
  expiresAt?: DocNativeTime | null
}

export interface DocKnowledgeDetail {
  document: DocKnowledgeHead
  revision: DocKnowledgeRevision
  revisions: DocKnowledgeRevision[]
  assets: DocAsset[]
  acl: DocAclEntry[]
  allowedActions: string[]
}

export interface DocWritePayload {
  spaceId: number
  title: string
  summary?: string
  contentKind: DocContentKind
  categoryId?: number | null
  confidentiality?: DocConfidentiality
  downloadPolicy?: number
  tags?: string[]
  sourceUrl?: string
  markdown?: string
  originalFilename?: string
  assetIds?: number[]
  changeReason?: string
  sourceSessionKey?: string
  expectedVersion?: number
}

export interface DocKnowledgeReceipt {
  documentId: number
  documentNo: string
  revisionId: number
  contentHash: string
  version: number
  savedAt: DocNativeTime
  versionUrl: string
}

export interface DocSearchQuery {
  keyword?: string
  spaceId?: number | null
  categoryId?: number | null
  contentKind?: DocContentKind | ''
  confidentiality?: DocConfidentiality | ''
  status?: number | ''
  page?: number
  size?: number
}

function searchParams(query: DocSearchQuery) {
  return {
    keyword: query.keyword?.trim() || undefined,
    spaceId: query.spaceId ?? undefined,
    categoryId: query.categoryId ?? undefined,
    contentKind: query.contentKind === '' ? undefined : query.contentKind,
    confidentiality: query.confidentiality === '' ? undefined : query.confidentiality,
    status: query.status === '' ? undefined : query.status,
    page: query.page,
    size: query.size,
  }
}

export function fetchDocKnowledgeSpaces() {
  return request.get<unknown, DocKnowledgeSpace[]>('/doc/v3/spaces')
}

export function fetchDocCategoryTree(spaceId: number) {
  return request.get<unknown, DocCategoryNode[]>('/doc/v3/catalog/tree', { params: { spaceId } })
}

export function createDocCategory(spaceId: number, payload: { name: string; parentId?: number | null; sortOrder?: number }) {
  return request.post<unknown, DocCategoryNode>('/doc/v3/catalog/categories', payload, { params: { spaceId } })
}

export function updateDocCategory(id: number, payload: { name: string; sortOrder?: number }) {
  return request.put<unknown, DocCategoryNode>(`/doc/v3/catalog/categories/${id}`, payload)
}

export function disableDocCategory(id: number) {
  return request.delete<unknown, void>(`/doc/v3/catalog/categories/${id}`)
}

export function fetchDocTags(spaceId?: number | null) {
  return request.get<unknown, DocTag[]>('/doc/v3/tags', { params: { spaceId: spaceId ?? undefined } })
}

export function createDocTag(payload: { name: string; color?: string; global?: boolean }, spaceId?: number | null) {
  return request.post<unknown, DocTag>('/doc/v3/tags', payload, { params: { spaceId: spaceId ?? undefined } })
}

export function disableDocTag(id: number) {
  return request.delete<unknown, void>(`/doc/v3/tags/${id}`)
}

export function searchDocKnowledge(query: DocSearchQuery) {
  return request.get<unknown, DocSearchPage>('/doc/v3/search', { params: searchParams(query) })
}

export function fetchDocKnowledgeStats(query: DocSearchQuery) {
  return request.get<unknown, DocKnowledgeStats>('/doc/v3/search/stats', { params: searchParams(query) })
}

export function fetchDocKnowledgeDetail(id: number, revisionId?: number) {
  return request.get<unknown, DocKnowledgeDetail>(`/doc/v3/documents/${id}`, {
    params: { revisionId: revisionId ?? undefined },
  })
}

export function createDocKnowledgeDocument(payload: DocWritePayload, key = newIdempotencyKey('knowledge')) {
  return request.post<unknown, DocKnowledgeReceipt>('/doc/v3/documents', payload, {
    headers: { 'Idempotency-Key': key },
  })
}

export function saveDocKnowledgeRevision(id: number, payload: DocWritePayload, key = newIdempotencyKey('knowledge')) {
  return request.post<unknown, DocKnowledgeReceipt>(`/doc/v3/documents/${id}/revisions`, payload, {
    headers: { 'Idempotency-Key': key },
  })
}

export function fetchDocKnowledgeAcl(id: number) {
  return request.get<unknown, DocAclEntry[]>(`/doc/v3/documents/${id}/acl`)
}

export function saveDocKnowledgeAcl(id: number, expectedVersion: number, entries: DocAclEntry[]) {
  return request.put<unknown, void>(`/doc/v3/documents/${id}/acl`, {
    expectedVersion,
    entries: entries.map(entry => ({
      subjectType: entry.subjectType,
      subjectId: entry.subjectId,
      permissions: entry.permissions,
      expiresAt: entry.expiresAt ?? null,
    })),
  })
}

/**
 * 原始字节流上传：不放大全局 multipart 限制；浏览器自动带 Content-Length。
 * 该请求不走 JSON，进度回调用于大文件上传提示。
 */
export function uploadDocAsset(spaceId: number, file: File, onProgress?: (percent: number) => void) {
  return request.post<unknown, DocAsset>('/doc/v3/assets/upload', file, {
    params: { spaceId, fileName: file.name },
    headers: { 'Content-Type': file.type || 'application/octet-stream' },
    timeout: 120000,
    onUploadProgress: event => {
      if (onProgress && event.total) onProgress(Math.round((event.loaded / event.total) * 100))
    },
  })
}

/** PDF/图片预览：iframe 不会携带 JWT，必须先取 Blob 再生成 object URL。 */
export function fetchDocAssetBlob(assetId: number, nodeId?: number) {
  return request.get<unknown, Blob>(`/doc/v3/assets/${assetId}/preview`, {
    params: { nodeId: nodeId ?? undefined },
    responseType: 'blob',
  })
}

export async function fetchDocOfficePreview(assetId: number, nodeId: number | undefined) {
  const blob = await request.get<unknown, Blob>(`/doc/v3/assets/${assetId}/office-preview`, {
    params: { nodeId: nodeId ?? undefined },
    responseType: 'blob',
  })
  if ((blob.type || '').includes('json')) {
    let message = 'Office 預覽失敗'
    try {
      const body = JSON.parse(await blob.text()) as { message?: string }
      message = body.message || message
    } catch { /* 非 JSON 错误体 */ }
    throw new Error(message)
  }
  return blob
}

export async function downloadDocAsset(assetId: number, nodeId: number | undefined, fileName: string) {
  const blob = await request.get<unknown, Blob>(`/doc/v3/assets/${assetId}/download`, {
    params: { nodeId: nodeId ?? undefined },
    responseType: 'blob',
  })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

export function rebuildDocKnowledgeIndex() {
  return request.post<unknown, void>('/doc/v3/index/rebuild')
}

export function searchDocClearanceUsers(keyword?: string) {
  return request.get<unknown, DocClearanceUser[]>('/doc/v3/clearances/users', {
    params: { keyword: keyword?.trim() || undefined },
  })
}

export function fetchDocClearances(keyword?: string) {
  return request.get<unknown, DocClearance[]>('/doc/v3/clearances', {
    params: { keyword: keyword?.trim() || undefined },
  })
}

export function saveDocClearance(userId: number, payload: { maxLevel: number; days?: number | null }) {
  return request.put<unknown, DocClearance>(`/doc/v3/clearances/${userId}`, payload)
}

export function revokeDocClearance(userId: number) {
  return request.delete<unknown, void>(`/doc/v3/clearances/${userId}`)
}

export function fetchDocAckTargets(id: number) {
  return request.get<unknown, DocAckTarget[]>(`/doc/v3/documents/${id}/ack-targets`)
}

export function saveDocAckTargets(id: number, targets: DocAckTarget[]) {
  return request.put<unknown, DocAckTarget[]>(`/doc/v3/documents/${id}/ack-targets`, { targets })
}

export function fetchDocAckStatus(id: number) {
  return request.get<unknown, DocAckStatus>(`/doc/v3/documents/${id}/ack-status`)
}

export function ackDoc(id: number) {
  return request.post<unknown, DocAckStatus>(`/doc/v3/documents/${id}/ack`)
}

export function fetchDocAckReceipts(id: number) {
  return request.get<unknown, DocAckReceipt[]>(`/doc/v3/documents/${id}/ack-receipts`)
}

export function fetchDocAckCoverage(id: number) {
  return request.get<unknown, DocAckCoverage>(`/doc/v3/documents/${id}/ack-coverage`)
}

export async function downloadDocAckReceipts(id: number, documentNo: string) {
  const blob = await request.get<unknown, Blob>(`/doc/v3/documents/${id}/ack-receipts/export`, {
    responseType: 'blob',
  })
  // 后端统一异常处理仍返回 HTTP 200 + JSON，blob 请求不能只看状态码。
  if ((blob.type || '').includes('json')) {
    let message = '導出失敗'
    try {
      const body = JSON.parse(await blob.text()) as { message?: string }
      message = body.message || message
    } catch { /* 非 JSON 错误体 */ }
    throw new Error(message)
  }
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `${documentNo}-ack-receipts.csv`
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

export function fetchPendingAcks(page = 1, size = 20) {
  return request.get<unknown, DocPendingAckPage>('/doc/v3/me/pending-acks', { params: { page, size } })
}

export function splitDocTags(tags?: string | null): string[] {
  return (tags ?? '').split(',').map(tag => tag.trim()).filter(Boolean)
}

export function formatDocKnowledgeTime(value?: DocNativeTime | null): string {
  return formatDocNativeTime(value)
}

export function newDocKnowledgeKey(prefix = 'knowledge'): string {
  return newIdempotencyKey(prefix)
}
