import request from './request'

/** AI 知识库文档（列表不返回正文，详情返回 content） */
export interface AiKnowledgeDoc {
  id?: number
  title: string
  systemCode: string
  sourceType?: string
  content?: string
  status?: 'active' | 'disabled'
  chunkCount?: number
  updatedBy?: string
  updatedAt?: string
}

export interface KnowledgeHit {
  docId: number
  chunkNo: number
  title: string
  systemCode: string
  snippet: string
  score: number
}

export const KNOWLEDGE_SYSTEMS = ['common', 'rdm', 'finance', 'eam', 'hr'] as const

export function fetchKnowledgeDocs(params: { keyword?: string; systemCode?: string } = {}) {
  return request.get<unknown, AiKnowledgeDoc[]>('/ai/prompt-config/knowledge', { params })
}

export function fetchKnowledgeDoc(id: number) {
  return request.get<unknown, AiKnowledgeDoc>(`/ai/prompt-config/knowledge/${id}`)
}

export function saveKnowledgeDoc(doc: AiKnowledgeDoc) {
  return request.post<unknown, AiKnowledgeDoc>('/ai/prompt-config/knowledge', doc)
}

export function setKnowledgeStatus(id: number, status: 'active' | 'disabled') {
  return request.put<unknown, AiKnowledgeDoc>(`/ai/prompt-config/knowledge/${id}/status`, null, {
    params: { status },
  })
}

export function rebuildKnowledge(id: number) {
  return request.post<unknown, { chunks: number }>(`/ai/prompt-config/knowledge/${id}/rebuild`)
}

export function deleteKnowledgeDoc(id: number) {
  return request.delete(`/ai/prompt-config/knowledge/${id}`)
}

export function searchKnowledge(params: { query: string; systemCode?: string; limit?: number }) {
  return request.get<unknown, KnowledgeHit[]>('/ai/prompt-config/knowledge/search', { params })
}
