import request from './request'

export interface AiFeedbackInput {
  conversationPk?: number
  messageId: string
  /** 1=赞 -1=踩 */
  rating: 1 | -1
  reason?: string
  answerPreview?: string
  toolKeys?: string
}

/** 提交赞/踩；同一用户同一条消息只保留一条，重复提交只更新 */
export async function submitFeedback(input: AiFeedbackInput): Promise<void> {
  await request.post('/ai/feedback', input)
}

export interface AiFeedbackRow {
  id: number
  conversationPk?: number | null
  messageId: string
  userId: number
  rating: number
  reason?: string | null
  answerPreview?: string | null
  toolKeys?: string | null
  createdAt?: string | null
}

/** 管理员低分看板：按评分筛选最近反馈（需 AI 助手配置查看权） */
export function fetchFeedback(params?: { rating?: number; limit?: number }): Promise<AiFeedbackRow[]> {
  return request.get<unknown, AiFeedbackRow[]>('/ai/feedback', { params })
}

export interface AiFeedbackStats {
  days: number
  total: number
  up: number
  down: number
  /** 差评率（百分比，保留 1 位小数） */
  downRate: number
  byTool: Array<{ toolKey: string; count: number }>
  topReasons: Array<{ reason: string; count: number }>
  daily: Array<{ date: string; up: number; down: number }>
}

/** 反馈聚合：按工具/原因/日趋势，供配置中心判断改哪里 */
export function fetchFeedbackStats(days = 30): Promise<AiFeedbackStats> {
  return request.get<unknown, AiFeedbackStats>('/ai/feedback/stats', { params: { days } })
}
