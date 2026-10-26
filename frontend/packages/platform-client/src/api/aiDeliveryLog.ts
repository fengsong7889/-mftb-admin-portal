import request from './request'

/**
 * V0 §八 V0-6：AI 通知外部投递日志（dingtalk/email/wecom）。
 * SENT=渠道已受理；FAILED=渠道或网络失败；UNKNOWN=异步提交未确认。
 * 渠道本身不提供更进一步的送达/已读回执。
 */
export interface DeliveryLogEntry {
  id: number
  toolKey: string
  channel: 'dingtalk' | 'email' | 'wecom' | string
  caller: string | null
  conversationPk: number | null
  conversationId: string | null
  /** 收件目标脱敏摘要 */
  recipientSummary: string | null
  /** 标题/内容前 100 字预览 */
  subjectPreview: string | null
  status: 'SENT' | 'FAILED' | 'UNKNOWN' | string
  externalErrcode: string | null
  errorMessage: string | null
  attempts: number
  createdAt: string
  updatedAt: string
}

export interface DeliveryLogPage {
  records: DeliveryLogEntry[]
  total: number
}

export interface DeliveryLogQuery {
  page?: number
  size?: number
  toolKey?: string
  status?: string
  caller?: string
}

/** 分页查询 AI 通知投递日志（管理端） */
export function fetchDeliveryLogs(params: DeliveryLogQuery): Promise<DeliveryLogPage> {
  return request.get('/agent/delivery-log', { params })
}
