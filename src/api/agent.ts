import { TOKEN_KEY } from './request'
import { confirmExternalCall } from '../components/McpExternalConfirm'

/**
 * AI Agent 客户端（V0 §B.1 迁移完成版）
 *
 * - 后端 /api/agent/orchestrate 已承担多轮 tool 循环、System Prompt 拼装、内建工具执行与事件写入。
 * - 前端只负责：
 *   1) 组装最近消息发给后端；
 *   2) 对未在内建工具集中的外部工具（email_sender / dingtalk_sender 等）执行「确认弹窗 → /api/mcp/exec → 回填 tool result → 再次 orchestrate」；
 *   3) 引擎状态展示与模型选项辅助函数。
 * - 与旧版本的关键差异：不再持有 API Key、不再前端直连模型、tool 循环统一在服务端。
 */

/* ────────────────── 类型 ────────────────── */

/** 消息附件（图片 / 文件） */
export interface ChatAttachment {
  type: 'image' | 'file'
  name: string
  /** base64 data URL（图片）或文本内容（文件） */
  data: string
  mimeType?: string
}

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  attachments?: ChatAttachment[]
  timestamp: Date
}

/** auto=后端按单价值最优选通道；primary/off-peak=显式固定 */
export type LlmEngineMode = 'auto' | 'primary' | 'off-peak'
export type ThinkingDepth = 'low' | 'medium' | 'high' | 'xhigh' | 'max'

export interface LlmRequestOptions {
  contextWindow?: number
  thinkingDepth?: ThinkingDepth
  /** 会话主键（ai_conversation.id）；后端据此写 ai_conversation_event */
  conversationPk?: number
}

export interface AgentReply {
  text: string
  model: string
  tokens: number
}

/* ────────────────── 引擎模式持久化（仅前端选择） ────────────────── */

const ENGINE_MODE_KEY = 'llm_engine_mode'

export function getEngineMode(): LlmEngineMode {
  const saved = localStorage.getItem(ENGINE_MODE_KEY)
  return saved === 'primary' || saved === 'off-peak' ? saved : 'auto'
}

export function setEngineMode(mode: LlmEngineMode): void {
  localStorage.setItem(ENGINE_MODE_KEY, mode)
}

/* ────────────────── Orchestrate 请求 ────────────────── */

interface OrchestrateResponse {
  text: string | null
  model: string | null
  tokens: number
  pendingExternalCalls?: { id: string; name: string; argumentsJson: string }[]
  nextMessages?: unknown[]
}

/** 前端上下文窗口/思考深度通过 body 传给后端，替代旧 header 直连方案 */
function buildOrchestrateHeaders(): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  const token = localStorage.getItem(TOKEN_KEY)
  if (token) headers['Authorization'] = `Bearer ${token}`
  return headers
}

/** 将最近 10 条前端消息映射为 OpenAI Chat 消息数组（图片走多模态、文件走文本附加） */
function toOrchestratorMessages(history: ChatMessage[]): unknown[] {
  return history.slice(-10).map((m) => {
    if (m.role === 'user' && m.attachments?.length) {
      const images = m.attachments.filter((a) => a.type === 'image' && a.data.startsWith('data:'))
      const files = m.attachments.filter((a) => a.type === 'file' && a.data)
      if (images.length > 0) {
        const parts: Array<
          | { type: 'text'; text: string }
          | { type: 'image_url'; image_url: { url: string; detail: 'auto' } }
        > = [{ type: 'text', text: m.content }]
        images.forEach((a) => parts.push({ type: 'image_url', image_url: { url: a.data, detail: 'auto' } }))
        files.forEach((a) => parts.push({ type: 'text', text: `\n[文件: ${a.name}]\n${a.data}` }))
        return { role: 'user', content: parts }
      }
      let text = m.content
      files.forEach((a) => { text += `\n[文件: ${a.name}]\n${a.data}` })
      return { role: 'user', content: text }
    }
    return { role: m.role, content: m.content }
  })
}

async function callOrchestrate(
  messages: unknown[],
  opts: LlmRequestOptions | undefined,
  mode: LlmEngineMode,
): Promise<OrchestrateResponse> {
  const res = await fetch(`${window.location.origin}/api/agent/orchestrate`, {
    method: 'POST',
    headers: buildOrchestrateHeaders(),
    body: JSON.stringify({
      messages,
      conversationPk: opts?.conversationPk ?? null,
      mode,
      contextWindow: opts?.contextWindow ?? null,
      thinkingDepth: opts?.thinkingDepth ?? null,
    }),
  })
  if (!res.ok) {
    const msg = await res.text().catch(() => '')
    throw new Error(`AI 编排失败 HTTP ${res.status}${msg ? '：' + msg.slice(0, 120) : ''}`)
  }
  const json = (await res.json()) as { code: number; message?: string; data?: OrchestrateResponse }
  if (json.code !== 200 || !json.data) {
    throw new Error(json.message || 'AI 编排失败')
  }
  return json.data
}

/**
 * 外部工具执行：L3 弹窗确认 → POST /api/mcp/exec；被拒或失败都作为结构化 tool 消息回给下一轮。
 * 与 §B.2 ai_tool_policy 契约一致：后端 enforce 会做二次校验，弹窗不是安全边界。
 */
async function runExternalTool(call: { id: string; name: string; argumentsJson: string },
                               conversationPk: number | null):
  Promise<{ role: 'tool'; tool_call_id: string; content: string }> {
  let parsed: Record<string, unknown>
  try { parsed = JSON.parse(call.argumentsJson || '{}') as Record<string, unknown> } catch { parsed = {} }
  const confirmed = await confirmExternalCall(call.name, JSON.stringify(parsed, null, 2))
  if (!confirmed) {
    return {
      role: 'tool',
      tool_call_id: call.id,
      content: JSON.stringify({ status: 'cancelled', message: '用戶取消了該外部服務調用，請告知用戶可修改後重試' }),
    }
  }
  try {
    const { default: request } = await import('./request')
    const result = await request.post('/mcp/exec', {
      toolKey: call.name,
      args: parsed,
      conversationPk: conversationPk ?? undefined,
    }, { headers: { 'x-silent': '1' } }) as unknown
    return {
      role: 'tool',
      tool_call_id: call.id,
      content: typeof result === 'string' ? result : JSON.stringify(result),
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return {
      role: 'tool',
      tool_call_id: call.id,
      content: JSON.stringify({ error: `外部服務執行失敗: ${msg}` }),
    }
  }
}

/* 前端处理 pendingExternalCalls 的最大回环次数（防死循环；正常组合 1-2 次即结束） */
const MAX_EXTERNAL_HOPS = 5

/**
 * 发送消息给 Agent，返回最终回复。
 * 内部一次 orchestrate + 若命中外部工具则「确认 → /mcp/exec → 追补 tool result → 再 orchestrate」直到拿到 text。
 */
export async function sendAgentMessage(
  history: ChatMessage[],
  opts?: LlmRequestOptions,
): Promise<AgentReply> {
  const mode = getEngineMode()
  let messages: unknown[] = toOrchestratorMessages(history)
  let totalTokens = 0
  let lastModel = ''
  try {
    for (let hop = 0; hop <= MAX_EXTERNAL_HOPS; hop++) {
      const resp = await callOrchestrate(messages, opts, mode)
      totalTokens += resp.tokens ?? 0
      if (resp.model) lastModel = resp.model
      const pendings = resp.pendingExternalCalls ?? []
      if (pendings.length === 0) {
        return {
          text: resp.text || '抱歉，我不太理解你的意思，請嘗試更具體地描述。',
          model: lastModel,
          tokens: totalTokens,
        }
      }
      // 用后端返回的 nextMessages（含 assistant.tool_calls）作为基线，追加真实 tool 结果
      const resumed = Array.isArray(resp.nextMessages) ? [...resp.nextMessages] : [...messages]
      for (const call of pendings) {
        const toolMsg = await runExternalTool(call, opts?.conversationPk ?? null)
        resumed.push(toolMsg)
      }
      messages = resumed
    }
    return {
      text: '查詢完成，但外部工具調用次數超過上限，請簡化請求後重試。',
      model: lastModel,
      tokens: totalTokens,
    }
  } catch (err) {
    console.error('[Agent Error]', err)
    const msg = err instanceof Error ? err.message : String(err)
    return { text: `⚠️ AI 服務異常：${msg}`, model: lastModel, tokens: totalTokens }
  }
}

/* ────────────────── 引擎状态展示（沿用旧字段，后端已提供 /api/agent/status） ────────────────── */

export interface LlmEngineStatus {
  ok: boolean
  mode: LlmEngineMode
  channel: string | null
  model: string | null
  account?: string
  /** 当前账号被限制的通道（primary/off-peak），后端基于 sys_config 白名单推导 */
  denied?: string[]
}

export async function fetchEngineStatus(): Promise<LlmEngineStatus | null> {
  return probeEngineStatus(getEngineMode())
}

export async function probeEngineStatus(mode: LlmEngineMode): Promise<LlmEngineStatus | null> {
  try {
    const res = await fetch(`${window.location.origin}/api/agent/status`, {
      headers: { 'x-llm-mode': mode, ...authHeader() },
    })
    if (!res.ok) return null
    const json = (await res.json()) as { code: number; data?: LlmEngineStatus }
    return json.data ?? null
  } catch {
    return null
  }
}

function authHeader(): Record<string, string> {
  const token = localStorage.getItem(TOKEN_KEY)
  return token ? { Authorization: `Bearer ${token}` } : {}
}

/* ────────────────── 上下文窗口选项 ────────────────── */

const CONTEXT_WINDOW_TIERS = [64_000, 128_000, 200_000, 400_000, 800_000, 1_000_000, 2_000_000]

export function formatContextWindow(tokens: number): string {
  if (tokens >= 1_000_000) return `${Math.round(tokens / 1_000_000)}M`
  return `${Math.round(tokens / 1_000)}K`
}

export function getContextWindowOptions(maxContextWindow: number | null | undefined): number[] {
  if (!maxContextWindow || maxContextWindow <= 0) return [128_000]
  return CONTEXT_WINDOW_TIERS.filter((t) => t <= maxContextWindow)
}
