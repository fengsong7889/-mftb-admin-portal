/**
 * AI 助手会话 API
 * 管理用户的多轮对话历史，支持多窗口会话 CRUD
 */
import request from './request'
import type { ChatMessage } from './agent'

/** 会话 VO */
export interface AiConversation {
  id: number
  /** 对话编号（DH+YYYYMMDD+7位自增） */
  conversationId: string | null
  username: string
  title: string
  /** JSON 序列化后的 ChatMessage[] */
  messages: string
  /** 本次会话使用的模型标识 */
  modelKey: string | null
  /** 本次会话累计消耗 tokens */
  totalTokens: number
  /** 本次会话累计请求次数 */
  requestCount: number
  /** 逻辑删除标记：0=正常 1=已删除 */
  deleted: number
  /** 删除时间戳（回收站） */
  deletedAt: string | null
  createdAt: string
  updatedAt: string
}

/** 前端使用的会话结构（messages 已反序列化） */
export interface Conversation {
  id: number
  title: string
  messages: ChatMessage[]
  createdAt: string
  updatedAt: string
}

/** 反序列化后端会话为前端结构 */
export function parseConversation(conv: AiConversation): Conversation {
  let messages: ChatMessage[] = []
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const raw: any[] = JSON.parse(conv.messages)
    if (Array.isArray(raw)) {
      messages = raw.map((m) => ({
        id: m.id as string,
        role: m.role as 'user' | 'assistant',
        content: m.content as string,
        attachments: m.attachments,
        timestamp: m.timestamp ? new Date(m.timestamp as string) : new Date(),
      }))
    }
  } catch { /* 损坏数据回退空 */ }
  return {
    id: conv.id,
    title: conv.title,
    messages,
    createdAt: conv.createdAt,
    updatedAt: conv.updatedAt,
  }
}

/** 列出当前用户所有会话（按更新时间倒序） */
export function fetchConversations(): Promise<AiConversation[]> {
  return request.get<unknown, AiConversation[]>('/ai/conversations')
}

/** 新建会话 */
export function createConversation(): Promise<AiConversation> {
  return request.post<unknown, AiConversation>('/ai/conversations')
}

/** 更新会话（标题 / 消息 / 模型 / tokens） */
export function updateConversation(id: number, data: { title?: string; messages?: string; modelKey?: string; totalTokens?: number }): Promise<void> {
  return request.put(`/ai/conversations/${id}`, data)
}

/** 删除指定会话 */
export function deleteConversation(id: number): Promise<void> {
  return request.delete(`/ai/conversations/${id}`)
}

/** 获取最大会话数配置 */
export function fetchMaxConversations(): Promise<number> {
  return request.get<unknown, { max: number }>('/ai/conversations/max').then((r) => r.max)
}

/* ── 回收站 API ── */

/** 列出我已删除的会话（回收站） */
export function fetchDeletedConversations(): Promise<AiConversation[]> {
  return request.get<unknown, AiConversation[]>('/ai/conversations/deleted')
}

/** 恢复已删除的会话 */
export function restoreConversation(id: number): Promise<void> {
  return request.post(`/ai/conversations/${id}/restore`)
}

/** 永久删除已删除的会话 */
export function permanentDeleteConversation(id: number): Promise<void> {
  return request.delete(`/ai/conversations/${id}/permanent`)
}

/* ── 管理员审计 API ── */

/** 审计查询参数 */
export interface AuditParams {
  page: number
  size: number
  username?: string
  modelKey?: string
  status?: number
  createStartDate?: string
  createEndDate?: string
  updateStartDate?: string
  updateEndDate?: string
}

/** 分页查询结果 */
export interface AuditPageResult {
  records: AiConversation[]
  total: number
  size: number
  current: number
  pages: number
}

/** 管理员分页查询所有会话 */
export function fetchAuditConversations(params: AuditParams): Promise<AuditPageResult> {
  return request.get('/ai/conversations/audit', { params })
}

/** 获取所有已使用过的模型标识列表 */
export function fetchAuditModelKeys(): Promise<string[]> {
  return request.get<unknown, string[]>('/ai/conversations/audit/model-keys')
}

/** 获取所有有会话的用户账号列表 */
export function fetchAuditUsernames(): Promise<string[]> {
  return request.get<unknown, string[]>('/ai/conversations/audit/usernames')
}

/** 管理员查看单个会话详情 */
export function fetchAuditConversation(id: number): Promise<AiConversation> {
  return request.get<unknown, AiConversation>(`/ai/conversations/audit/${id}`)
}
