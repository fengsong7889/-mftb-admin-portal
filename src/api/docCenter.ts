/**
 * 文檔中心 API（階段二：全量走真實 /api/doc/**，無前端 mock 回退）
 *
 * 口徑：騰訊文檔為內容中台（正文單一事實源），本模組只承載元數據索引、
 * 菜單門禁與查閱審計；後端枚舉整型存儲（DocConstants.java），整型↔字符串
 * 映射收斂在本層，頁面層類型保持穩定。
 */
import request from './request'

export type DocType = 'doc' | 'sheet' | 'slide' | 'pdf' | 'link'
export type DocStatus = 'draft' | 'reviewing' | 'published' | 'archived'

export const DOC_TYPE_VALUES: DocType[] = ['doc', 'sheet', 'slide', 'pdf', 'link']
export const DOC_STATUS_VALUES: DocStatus[] = ['draft', 'reviewing', 'published', 'archived']

/** 展示文案走 i18n：t(`doc.type.${v}`) / t(`doc.status.${v}`)；本層只留存儲口徑與顏色映射 */
export const DOC_STATUS_COLOR: Record<DocStatus, string> = {
  draft: 'default',
  reviewing: 'orange',
  published: 'green',
  archived: 'purple',
}

/** 整型存儲口徑雙向映射（真值來源：後端 DocConstants） */
const TYPE_FROM_INT: Record<number, DocType> = { 1: 'doc', 2: 'sheet', 3: 'slide', 4: 'pdf', 5: 'link' }
const TYPE_TO_INT: Record<DocType, number> = { doc: 1, sheet: 2, slide: 3, pdf: 4, link: 5 }
const STATUS_FROM_INT: Record<number, DocStatus> = { 1: 'draft', 2: 'reviewing', 3: 'published', 4: 'archived' }
const STATUS_TO_INT: Record<DocStatus, number> = { draft: 1, reviewing: 2, published: 3, archived: 4 }

/* ==================== 頁面層類型 ==================== */

/** 空間（知識域）：需求/人事/行政/制度/培訓 */
export interface DocSpace {
  id: number
  name: string
  icon: string
  sort: number
  description?: string
}

/** 文檔元數據索引（正文在騰訊文檔側） */
export interface DocNode {
  id: number
  spaceId: number
  spaceName: string
  category: string
  title: string
  docType: DocType
  status: DocStatus
  tags: string[]
  ownerName: string
  updatedAt: string
  /** 後端附帶的存儲口徑文案（供 RDM 等外域卡片免 i18n 直渲） */
  docTypeLabel?: string
  statusLabel?: string
  tencentUrl: string
  tencentFileId?: string
  /** 通用業務掛接：REQ → 產研交付需求單 */
  bizType?: 'REQ'
  bizId?: number
  bizLabel?: string
  summary?: string
}

/** 查閱審計留痕 */
export interface DocViewLog {
  id: number
  nodeId: number
  userName: string
  department: string
  viewedAt: string
  durationSec: number | null
}

export interface DocQuery {
  keyword?: string
  spaceId?: number | null
  status?: DocStatus | ''
  docType?: DocType | ''
  /** 業務掛接過濾：RDM 需求詳情「關聯文檔」卡片用 REQ + bizId */
  bizType?: 'REQ' | ''
  bizId?: number | null
}

export interface DocStats {
  total: number
  published: number
  updatedThisMonth: number
  linkedReq: number
}

export interface DocRegisterPayload {
  spaceId: number
  category: string
  title: string
  docType: DocType
  status: DocStatus
  tencentUrl: string
  tags: string[]
  bizId?: number
  summary?: string
}

export interface DocSpacePayload {
  name: string
  icon?: string
  sortOrder: number
  description?: string
}

export interface DocSyncResult {
  created: number
  updated: number
  skipped: number
}

/* ==================== 後端原始結構與映射 ==================== */

interface RawSpace {
  id: number
  name: string
  icon?: string | null
  sortOrder?: number | null
  description?: string | null
}

interface RawNode {
  id: number
  spaceId: number
  spaceName?: string | null
  category: string
  title: string
  docType: number
  docTypeLabel?: string | null
  status: number
  statusLabel?: string | null
  tags?: string[] | null
  ownerName?: string | null
  updatedAt?: string | null
  tencentUrl: string
  tencentFileId?: string | null
  bizType?: string | null
  bizId?: number | null
  bizLabel?: string | null
  summary?: string | null
}

interface RawViewLog {
  id: number
  nodeId: number
  userName?: string | null
  department?: string | null
  viewedAt?: string | null
  durationSec?: number | null
}

function mapSpace(r: RawSpace): DocSpace {
  return { id: r.id, name: r.name, icon: r.icon ?? '📄', sort: r.sortOrder ?? 0, description: r.description ?? undefined }
}

function mapNode(r: RawNode): DocNode {
  return {
    id: r.id,
    spaceId: r.spaceId,
    spaceName: r.spaceName ?? '未分類',
    category: r.category,
    title: r.title,
    docType: TYPE_FROM_INT[r.docType] ?? 'doc',
    status: STATUS_FROM_INT[r.status] ?? 'draft',
    tags: r.tags ?? [],
    ownerName: r.ownerName ?? '-',
    updatedAt: r.updatedAt ?? '-',
    docTypeLabel: r.docTypeLabel ?? undefined,
    statusLabel: r.statusLabel ?? undefined,
    tencentUrl: r.tencentUrl,
    tencentFileId: r.tencentFileId ?? undefined,
    bizType: r.bizType === 'REQ' ? 'REQ' : undefined,
    bizId: r.bizId ?? undefined,
    bizLabel: r.bizLabel ?? undefined,
    summary: r.summary ?? undefined,
  }
}

function toParams(q: DocQuery): Record<string, string | number> {
  const p: Record<string, string | number> = {}
  if (q.keyword?.trim()) p.keyword = q.keyword.trim()
  if (q.spaceId != null) p.spaceId = q.spaceId
  if (q.status) p.status = STATUS_TO_INT[q.status]
  if (q.docType) p.docType = TYPE_TO_INT[q.docType]
  if (q.bizType) p.bizType = q.bizType
  if (q.bizId != null) p.bizId = q.bizId
  return p
}

function toSaveBody(p: DocRegisterPayload) {
  return {
    spaceId: p.spaceId,
    category: p.category,
    title: p.title,
    docType: TYPE_TO_INT[p.docType],
    status: STATUS_TO_INT[p.status],
    tencentUrl: p.tencentUrl,
    tags: p.tags,
    bizId: p.bizId ?? null,
    summary: p.summary ?? null,
  }
}

/* ==================== 空間 ==================== */

export async function fetchDocSpaces(): Promise<DocSpace[]> {
  const rows = await request.get<unknown, RawSpace[]>('/doc/spaces')
  return (rows ?? []).map(mapSpace)
}

export async function createSpace(payload: DocSpacePayload): Promise<DocSpace> {
  const row = await request.post<unknown, RawSpace>('/doc/spaces', payload)
  return mapSpace(row)
}

export async function updateSpace(id: number, payload: DocSpacePayload): Promise<DocSpace> {
  const row = await request.put<unknown, RawSpace>(`/doc/spaces/${id}`, payload)
  return mapSpace(row)
}

export async function deleteSpace(id: number): Promise<void> {
  await request.delete<unknown, void>(`/doc/spaces/${id}`)
}

/* ==================== 文檔索引 ==================== */

export async function fetchDocNodes(q: DocQuery): Promise<DocNode[]> {
  const rows = await request.get<unknown, RawNode[]>('/doc/nodes', { params: toParams(q) })
  return (rows ?? []).map(mapNode)
}

/** 統計口徑跟隨搜索條件：與列表共用同一組 filters（後端同一 filter 實現） */
export async function fetchDocStats(q: DocQuery): Promise<DocStats> {
  const s = await request.get<unknown, DocStats>('/doc/nodes/stats', { params: toParams(q) })
  return s ?? { total: 0, published: 0, updatedThisMonth: 0, linkedReq: 0 }
}

/** 詳情（後端打開即寫查閱留痕）；不存在時後端拋業務異常，由調用方展示 */
export async function fetchDocNode(id: number): Promise<DocNode | undefined> {
  const row = await request.get<unknown, RawNode | null>(`/doc/nodes/${id}`)
  return row ? mapNode(row) : undefined
}

export async function fetchDocViewLogs(nodeId: number): Promise<DocViewLog[]> {
  const rows = await request.get<unknown, RawViewLog[]>(`/doc/nodes/${nodeId}/view-logs`)
  return (rows ?? []).map(r => ({
    id: r.id, nodeId: r.nodeId, userName: r.userName ?? '-',
    department: r.department ?? '-', viewedAt: r.viewedAt ?? '-', durationSec: r.durationSec ?? null,
  }))
}

/** 頁面離開時上報停留時長；失敗靜默（留痕缺時長好過丟整條上報鏈路） */
export async function reportViewDuration(nodeId: number, durationSec: number): Promise<void> {
  try {
    await request.post<unknown, void>(`/doc/nodes/${nodeId}/view-report`, { durationSec })
  } catch {
    /* 靜默：上報失敗不影響閱讀 */
  }
}

export async function registerDoc(payload: DocRegisterPayload): Promise<DocNode> {
  const row = await request.post<unknown, RawNode>('/doc/nodes', toSaveBody(payload))
  return mapNode(row)
}

export async function updateDoc(id: number, payload: DocRegisterPayload): Promise<DocNode> {
  const row = await request.put<unknown, RawNode>(`/doc/nodes/${id}`, toSaveBody(payload))
  return mapNode(row)
}

export async function deleteDoc(id: number): Promise<void> {
  await request.delete<unknown, void>(`/doc/nodes/${id}`)
}

/* ==================== 騰訊文檔集成 ==================== */

export async function syncTencentDocs(): Promise<DocSyncResult> {
  const r = await request.post<unknown, DocSyncResult>('/doc/sync/tencent')
  return r ?? { created: 0, updated: 0, skipped: 0 }
}

/** OpenAPI 配額用量（結構由騰訊文檔定義，透傳展示） */
export async function fetchTencentQuota(): Promise<unknown> {
  return request.get<unknown, unknown>('/doc/tencent/quota')
}

/* ==================== 閱讀統計（P2 看板） ==================== */

/** 按文檔聚合行（標題/空間為當前索引快照） */
export interface DocViewStatRow {
  nodeId: number
  title: string
  spaceId: number
  spaceName: string
  viewCount: number
  readerCount: number
  avgDurationSec: number | null
  lastViewedAt: string
}

export interface DocViewStats {
  totalViews: number
  totalReaders: number
  docCount: number
  avgDurationSec: number | null
  rows: DocViewStatRow[]
}

/** 閱讀統計：days 為窗口天數（後端鉗 1~365），spaceId 可選 */
export async function fetchDocViewStats(days: number, spaceId?: number | null): Promise<DocViewStats> {
  const params: Record<string, number> = { days }
  if (spaceId != null) params.spaceId = spaceId
  const s = await request.get<unknown, DocViewStats>('/doc/view-stats', { params })
  return s ?? { totalViews: 0, totalReaders: 0, docCount: 0, avgDurationSec: null, rows: [] }
}

/* ==================== 學習路徑（新人入職包/培訓清單） ==================== */

/** 路徑列表行：附條目數與本人完成數 */
export interface DocLearningPathRow {
  id: number
  name: string
  description?: string
  status: number
  itemCount: number
  myReadCount: number
  updatedAt: string
}

/** 路徑條目：文檔快照 + 本人已讀標記 + 全局閱讀人數（枚舉附後端 label，免前端再映射） */
export interface DocLearningPathItem {
  nodeId: number
  title: string
  spaceName: string
  docType: number
  docTypeLabel?: string
  status: number
  statusLabel?: string
  myRead: boolean
  readerCount: number
}

export interface DocLearningPathDetail {
  id: number
  name: string
  description?: string
  status: number
  updatedAt: string
  items: DocLearningPathItem[]
}

export interface DocLearningPathSavePayload {
  name: string
  description?: string
  status: number
  sortOrder: number
  /** 有序文檔 ID 清單（編輯時整體替換） */
  items: number[]
}

export async function fetchLearningPaths(keyword?: string): Promise<DocLearningPathRow[]> {
  const params: Record<string, string> = {}
  if (keyword?.trim()) params.keyword = keyword.trim()
  return (await request.get<unknown, DocLearningPathRow[]>('/doc/learning-paths', { params })) ?? []
}

export async function fetchLearningPathDetail(id: number): Promise<DocLearningPathDetail | undefined> {
  const row = await request.get<unknown, DocLearningPathDetail | null>(`/doc/learning-paths/${id}`)
  return row ?? undefined
}

/** 創建返回新路徑 ID（保存後直達詳情頁） */
export async function createLearningPath(payload: DocLearningPathSavePayload): Promise<number | undefined> {
  const row = await request.post<unknown, { id?: number }>('/doc/learning-paths', payload)
  return row?.id
}

export async function updateLearningPath(id: number, payload: DocLearningPathSavePayload): Promise<void> {
  await request.put<unknown, unknown>(`/doc/learning-paths/${id}`, payload)
}

export async function deleteLearningPath(id: number): Promise<void> {
  await request.delete<unknown, void>(`/doc/learning-paths/${id}`)
}
