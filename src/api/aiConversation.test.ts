import { describe, it, expect } from 'vitest'
import { serializeChatMessages, parseConversation } from './aiConversation'
import type { AiConversation } from './aiConversation'
import type { ChatMessage } from './agent'

/**
 * 会话消息落库/回放的契约锁。
 * <p>起因：AI 深度测试实测到「刷新后工具标签消失」——因为两处保存路径各自手写 map 字段列表，
 * 新增字段只改了一处就会静默丢数据。这里把「序列化 ↔ 反序列化」钉成可回归的断言。
 */

function msg(partial: Partial<ChatMessage> & { id: string; role: 'user' | 'assistant'; content: string }): ChatMessage {
  return { timestamp: new Date('2026-10-19T09:00:00Z'), ...partial } as ChatMessage
}

function asConversation(messagesJson: string): AiConversation {
  return {
    id: 1,
    conversationId: 'DH2026101900001',
    username: 'MF00001',
    title: '测试会话',
    messages: messagesJson,
    modelKey: 'qwen3.7-flash',
    totalTokens: 100,
    requestCount: 1,
    createdAt: '2026-10-19 09:00:00',
    updatedAt: '2026-10-19 09:00:00',
  } as unknown as AiConversation
}

describe('serializeChatMessages / parseConversation', () => {
  it('工具痕迹随消息一起落库并可回放', () => {
    const traces = [{ toolKey: 'query_account_balance', elapsedMs: 195, success: true }]
    const json = serializeChatMessages([
      msg({ id: 'u1', role: 'user', content: '查余额' }),
      msg({ id: 'a1', role: 'assistant', content: '餘額 100', toolTraces: traces }),
    ])
    expect(json).toContain('"toolTraces"')
    const parsed = parseConversation(asConversation(json))
    expect(parsed.messages).toHaveLength(2)
    expect(parsed.messages[1].toolTraces).toEqual(traces)
    expect(parsed.messages[1].timestamp).toBeInstanceOf(Date)
  })

  it('错误提示气泡不入库（否则会被当成历史回传给模型）', () => {
    const json = serializeChatMessages([
      msg({ id: 'u1', role: 'user', content: '发邮件' }),
      msg({ id: 'e1', role: 'assistant', content: 'AI 回應逾時，請稍後重試', isError: true }),
      msg({ id: 'a2', role: 'assistant', content: '正常回复' }),
    ])
    const parsed = parseConversation(asConversation(json))
    expect(parsed.messages.map((m) => m.id)).toEqual(['u1', 'a2'])
    expect(json).not.toContain('逾時')
  })

  it('附件保留；损坏 JSON 回退空列表而不是抛异常', () => {
    const att = [{ type: 'image' as const, name: 'a.png', data: 'data:image/png;base64,AA' }]
    const json = serializeChatMessages([msg({ id: 'u1', role: 'user', content: '看图', attachments: att })])
    expect(parseConversation(asConversation(json)).messages[0].attachments).toEqual(att)

    const broken = parseConversation(asConversation('{ 不是 JSON'))
    expect(broken.messages).toEqual([])
  })
})
