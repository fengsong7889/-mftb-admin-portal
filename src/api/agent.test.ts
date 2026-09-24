import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { sendAgentMessage, type ChatMessage, type AgentReply } from './agent'
import { confirmExternalCall } from '../components/McpExternalConfirm'

// 用 vi.hoisted 让 mock 工厂能引用外部变量
const { postMock } = vi.hoisted(() => ({ postMock: vi.fn() }))
vi.mock('./request', () => ({
  default: { post: postMock, get: vi.fn() },
  TOKEN_KEY: 'mftb_token',
}))
vi.mock('../components/McpExternalConfirm', () => ({
  confirmExternalCall: vi.fn(),
}))

function chat(content: string): ChatMessage {
  return { id: `m-${Math.random()}`, role: 'user', content, timestamp: new Date() }
}

function orchestrateResp(body: unknown) {
  return new Response(JSON.stringify({ code: 200, data: body }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('agent.sendAgentMessage (V0 §B.1 orchestrate)', () => {
  const realFetch = global.fetch

  beforeEach(() => {
    localStorage.clear()
    postMock.mockReset()
    vi.mocked(confirmExternalCall).mockReset()
  })
  afterEach(() => { global.fetch = realFetch })

  it('直接返回文本：无 pendingExternalCalls', async () => {
    global.fetch = vi.fn().mockResolvedValueOnce(
      orchestrateResp({ text: '你好', model: 'deepseek-chat', tokens: 12, pendingExternalCalls: [] }),
    ) as unknown as typeof fetch
    const reply: AgentReply = await sendAgentMessage([chat('hi')])
    expect(reply).toEqual({ text: '你好', model: 'deepseek-chat', tokens: 12 })
    expect(confirmExternalCall).not.toHaveBeenCalled()
  })

  it('外部工具一次一循环：确认后回传 tool 结果并二次 orchestrate 得到文本', async () => {
    vi.mocked(confirmExternalCall).mockResolvedValueOnce(true)
    postMock.mockResolvedValueOnce({ messageId: 'ding-1' })
    global.fetch = vi.fn()
      .mockResolvedValueOnce(orchestrateResp({
        text: null, model: 'ds', tokens: 5,
        pendingExternalCalls: [{ id: 'call_1', name: 'dingtalk_sender', argumentsJson: '{"content":"hi"}' }],
        nextMessages: [{ role: 'user', content: 'hi' }, { role: 'assistant', content: '', tool_calls: [{ id: 'call_1' }] }],
      }))
      .mockResolvedValueOnce(orchestrateResp({
        text: '已发送', model: 'ds', tokens: 3, pendingExternalCalls: [],
      })) as unknown as typeof fetch

    const reply = await sendAgentMessage([chat('发条钉钉')])
    expect(confirmExternalCall).toHaveBeenCalledWith('dingtalk_sender', expect.stringContaining('"content": "hi"'))
    expect(postMock).toHaveBeenCalledWith('/mcp/exec', expect.objectContaining({ toolKey: 'dingtalk_sender' }), expect.anything())
    expect(reply.text).toBe('已发送')
    expect(reply.tokens).toBe(8)
  })

  it('用户拒绝：不执行 /mcp/exec 但仍回传 cancelled 给下一轮', async () => {
    vi.mocked(confirmExternalCall).mockResolvedValueOnce(false)
    global.fetch = vi.fn()
      .mockResolvedValueOnce(orchestrateResp({
        text: null, model: 'ds', tokens: 2,
        pendingExternalCalls: [{ id: 'c1', name: 'email_sender', argumentsJson: '{}' }],
        nextMessages: [{ role: 'user', content: 'hi' }],
      }))
      .mockResolvedValueOnce(orchestrateResp({ text: '已取消', model: 'ds', tokens: 1, pendingExternalCalls: [] })) as unknown as typeof fetch

    const reply = await sendAgentMessage([chat('发邮件')])
    expect(postMock).not.toHaveBeenCalled()
    expect(reply.text).toBe('已取消')
    // 第二次调用的 body 里应包含 cancelled 状态的 tool 消息
    const secondCall = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[1]
    const body = JSON.parse((secondCall[1] as RequestInit).body as string)
    expect(body.messages.at(-1)).toMatchObject({ role: 'tool', tool_call_id: 'c1' })
    expect(body.messages.at(-1).content).toContain('cancelled')
  })

  it('/mcp/exec 失败：把 error 作为 tool 结果回传下一轮', async () => {
    vi.mocked(confirmExternalCall).mockResolvedValueOnce(true)
    postMock.mockRejectedValueOnce(new Error('SMTP 500'))
    global.fetch = vi.fn()
      .mockResolvedValueOnce(orchestrateResp({
        text: null, model: 'ds', tokens: 2,
        pendingExternalCalls: [{ id: 'c1', name: 'email_sender', argumentsJson: '{}' }],
        nextMessages: [{ role: 'user', content: 'hi' }],
      }))
      .mockResolvedValueOnce(orchestrateResp({ text: '失败已提示', model: 'ds', tokens: 1, pendingExternalCalls: [] })) as unknown as typeof fetch

    const reply = await sendAgentMessage([chat('发邮件')])
    expect(reply.text).toBe('失败已提示')
    const secondCall = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[1]
    const body = JSON.parse((secondCall[1] as RequestInit).body as string)
    expect(body.messages.at(-1).content).toContain('外部服務執行失敗')
  })

  it('外部回环次数上限：超过 MAX_EXTERNAL_HOPS 时返回友好提示', async () => {
    vi.mocked(confirmExternalCall).mockResolvedValue(true)
    postMock.mockResolvedValue({ ok: true })
    // 每次 orchestrate 都返回新的 pendingExternalCalls，永远不收敛
    global.fetch = vi.fn().mockImplementation(() => Promise.resolve(orchestrateResp({
      text: null, model: 'ds', tokens: 1,
      pendingExternalCalls: [{ id: 'c', name: 'email_sender', argumentsJson: '{}' }],
      nextMessages: [],
    }))) as unknown as typeof fetch

    const reply = await sendAgentMessage([chat('loop')])
    expect(reply.text).toContain('超過上限')
    // 1 初 + 5 次 hop = 6 次 fetch
    expect((global.fetch as ReturnType<typeof vi.fn>).mock.calls.length).toBe(6)
  })

  it('编排调用异常：返回带 ⚠️ 前缀的提示文本', async () => {
    global.fetch = vi.fn().mockResolvedValue(new Response('boom', { status: 503 })) as unknown as typeof fetch
    const reply = await sendAgentMessage([chat('hi')])
    expect(reply.text).toMatch(/^⚠️ AI 服務異常/)
    expect(reply.tokens).toBe(0)
  })
})
