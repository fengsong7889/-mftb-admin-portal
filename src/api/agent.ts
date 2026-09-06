import OpenAI from 'openai'
import { fetchFinAccounts } from './finance'
import { fetchFinApprovals } from './finance'
import { TOKEN_KEY } from './request'
import type { FinAccount, FinApproval } from './finance'
import { fetchInstalledMcpTools } from './mcpService'
import type { McpTool } from './mcpService'
import { confirmExternalCall } from '../components/McpExternalConfirm'

/**
 * AI Agent 模塊
 * - 定義查詢工具（Tool）的 JSON Schema
 * - 編排 LLM 調用 → 工具執行 → 自然語言回覆 的完整流程
 * - 所有工具調用走現有後端 API，權限由 JWT 控制
 */

/* ────────────────── 類型定義 ────────────────── */

/** 消息附件（圖片 / 文件） */
export interface ChatAttachment {
  type: 'image' | 'file'
  name: string
  /** base64 data URL（圖片）或文本內容（文件） */
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

/* ────────────────── LLM 客戶端 ────────────────── */

// OpenAI SDK 要求絕對 URL，用 window.location.origin 拼接代理路徑
const client = new OpenAI({
  baseURL: `${window.location.origin}/api/llm`,
  apiKey: 'proxy', // 佔位，實際 Key 在 Vite 插件服務端
  dangerouslyAllowBrowser: true,
})

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const MODEL = ((import.meta as any).env?.VITE_LLM_MODEL as string) || 'deepseek-chat'

/* ────────────────── 引擎模式（省錢優先 / 手動固定） ────────────────── */

/** auto = 由代理按單價最優選通道；primary / off-peak = 手動固定 */
export type LlmEngineMode = 'auto' | 'primary' | 'off-peak'

/** localStorage key：記錄當前瀏覽器的手動切換結果 */
const ENGINE_MODE_KEY = 'llm_engine_mode'

/** 讀取當前引擎模式（非法值回落 auto） */
export function getEngineMode(): LlmEngineMode {
  const saved = localStorage.getItem(ENGINE_MODE_KEY)
  return saved === 'primary' || saved === 'off-peak' ? saved : 'auto'
}

/** 切換引擎模式，由代理側讀取請求頭完成實際路由 */
export function setEngineMode(mode: LlmEngineMode): void {
  localStorage.setItem(ENGINE_MODE_KEY, mode)
}

/** 思考深度枚举 */
export type ThinkingDepth = 'low' | 'medium' | 'high' | 'xhigh'

/** LLM 请求附加选项（上下文窗口 / 思考深度） */
export interface LlmRequestOptions {
  /** 上下文窗口大小（tokens），如 200000 = 200K */
  contextWindow?: number
  /** 思考深度（仅当模型支持思考模式时生效） */
  thinkingDepth?: ThinkingDepth
}

/** sendAgentMessage 返回值：包含回复文本与用量信息 */
export interface AgentReply {
  /** AI 回复文本 */
  text: string
  /** 实际使用的模型标识 */
  model: string
  /** 本次请求消耗的 tokens（输入+输出） */
  tokens: number
}

/**
 * 每次請求即時取模式與登錄憑證，避免把 header 固化在 client 實例上
 *
 * x-llm-token 攜帶當前登錄 JWT（Authorization 頭已被 OpenAI SDK 用作占位 Key）：
 * 代理側會拿它回源後端換取 username 與模型白名單，賬號權限完全由服務端判定，
 * 客戶端無任何可自報的權限參數。
 *
 * 附加選項：
 * - x-llm-context-window: 上下文窗口大小（tokens）
 * - x-llm-thinking-depth: 思考深度（low/medium/high/xhigh）
 */
function engineModeHeaders(opts?: LlmRequestOptions): Record<string, string> {
  const headers: Record<string, string> = { 'x-llm-mode': getEngineMode() }
  const token = localStorage.getItem(TOKEN_KEY)
  if (token) headers['x-llm-token'] = token
  if (opts?.contextWindow) headers['x-llm-context-window'] = String(opts.contextWindow)
  if (opts?.thinkingDepth) headers['x-llm-thinking-depth'] = opts.thinkingDepth
  return headers
}

/* ────────────────── System Prompt（能力範圍隨已安裝 MCP 工具動態生成） ────────────────── */

const SYSTEM_RULES = `規則：
- 使用繁體中文回覆
- 金額顯示使用千分位格式（如 1,000,000）
- 品牌名稱：1=閃蜂，2=mFood
- 如果用戶提到的集團名稱模糊，先嘗試模糊匹配，有多個結果時列出讓用戶選擇
- 查詢結果為空時，明確告知用戶未找到數據
- 不要編造數據，只根據工具返回的實際結果回覆
- 發送郵件等對外操作：用戶未提供收件人郵箱時必須先詢問確認，禁止編造郵箱地址
- 標記「外部服務」的工具執行前系統會請求用戶人工確認，請在回覆中說明確認結果（已執行/被拒絕）
- 回覆簡潔清晰，重要數字加粗顯示`

/** 根據已安裝工具的描述動態拼接 System Prompt */
function buildSystemPrompt(capabilityLines: string): string {
  return `你是 MFTB 推廣管理後台的 AI 助手，幫助業務人員快速查詢系統數據。

你的能力範圍：
${capabilityLines}

${SYSTEM_RULES}`
}

/* ────────────────── 內置執行器 registry 與 fallback Schema ────────────────── */

/** 工具執行器 registry：tool_key → handler（沿用 JWT 直調後端 API 的既有安全鏈路） */
const toolHandlers: Record<string, (args: Record<string, unknown>) => Promise<string>> = {
  query_account_balance: handleQueryBalance,
  query_batches: handleQueryBatches,
  query_approvals: handleQueryApprovals,
}

/**
 * 內置 fallback Schema：僅在 MCP 工具註冊表接口異常時回退使用，
 * 保證助手不失能；正常路徑一律以下發的已安裝 manifest 為準
 */
const FALLBACK_TOOLS: OpenAI.Chat.Completions.ChatCompletionTool[] = [
  {
    type: 'function',
    function: {
      name: 'query_account_balance',
      description: '查詢集團賬戶的推廣金餘額（虛擬餘額和實際餘額），可按集團名稱、品牌篩選',
      parameters: {
        type: 'object',
        properties: {
          groupName: { type: 'string', description: '集團名稱（支持模糊匹配）' },
          brand: { type: 'string', description: '品牌：1=閃蜂, 2=mFood', enum: ['1', '2'] },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'query_batches',
      description: '查詢交易批次記錄，包括充值、轉賬、扣款、合併等批次',
      parameters: {
        type: 'object',
        properties: {
          groupName: { type: 'string', description: '集團名稱' },
          batchType: {
            type: 'string',
            description: '批次類型',
            enum: ['recharge', 'transfer', 'deduct', 'merge'],
          },
          tradeFrom: { type: 'string', description: '交易時間起（YYYY-MM-DD）' },
          tradeTo: { type: 'string', description: '交易時間止（YYYY-MM-DD）' },
          amountMin: { type: 'number', description: '充值金額下限（虛擬推廣金，元），如 100000' },
          amountMax: { type: 'number', description: '充值金額上限（虛擬推廣金，元）' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'query_approvals',
      description: '查詢審批中心的流程狀態，可按審批類型和狀態篩選',
      parameters: {
        type: 'object',
        properties: {
          approvalType: {
            type: 'string',
            description: '審批類型',
            enum: ['recharge', 'transfer', 'deduct', 'merge'],
          },
          flowStatus: {
            type: 'string',
            description: '流程狀態',
            enum: ['pending', 'approved', 'rejected', 'cancelled'],
          },
          groupName: { type: 'string', description: '集團名稱' },
        },
      },
    },
  },
]

/** manifest → OpenAI Function Calling Schema（MCP tools/list 語義的落地） */
function manifestToTool(tool: McpTool): OpenAI.Chat.Completions.ChatCompletionTool {
  let parameters: Record<string, unknown> = { type: 'object', properties: {} }
  try {
    parameters = JSON.parse(tool.paramsJson || '{}') as Record<string, unknown>
  } catch {
    // schema 解析失敗時退回空參數 schema，保留工具描述
  }
  return {
    type: 'function',
    function: { name: tool.toolKey, description: tool.description, parameters },
  }
}

/** 安全讀取工具描述（新版 SDK 的 ChatCompletionTool 為聯合類型） */
function toolDescription(tool: OpenAI.Chat.Completions.ChatCompletionTool): string {
  return 'function' in tool ? (tool.function?.description ?? '') : ''
}

/** 已安裝外部服務 tool_key 集合（loadMcpTools 同步維護；外部工具執行走人工確認 + 服務端網關） */
let externalToolKeys = new Set<string>()

/**
 * 拉取已安裝 MCP 工具 manifest（含外部服務）：廣場安裝/卸載即刻生效；
 * 註冊表接口異常時回退 FALLBACK_TOOLS，保證助手不失能
 */
async function loadMcpTools(): Promise<OpenAI.Chat.Completions.ChatCompletionTool[]> {
  try {
    const installed = await fetchInstalledMcpTools()
    if (Array.isArray(installed)) {
      externalToolKeys = new Set(installed.filter((tool) => tool.source === 'external').map((tool) => tool.toolKey))
      return installed.map(manifestToTool)
    }
  } catch (err) {
    console.warn('[Agent] MCP 工具清單拉取失敗，回退內置工具', err)
  }
  externalToolKeys = new Set()
  return FALLBACK_TOOLS
}

/* ────────────────── 工具執行處理器 ────────────────── */

async function executeTool(name: string, args: Record<string, unknown>): Promise<string> {
  const handler = toolHandlers[name]
  if (handler) {
    try {
      return await handler(args)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      return JSON.stringify({ error: `查詢失敗: ${msg}` })
    }
  }
  // 外部服務：前端人工確認（L3）→ /api/mcp/exec 服務端網關執行
  if (externalToolKeys.has(name)) {
    return execExternalTool(name, args)
  }
  return JSON.stringify({ error: `未知工具: ${name}` })
}

/** 外部服務執行：確認通過後轉發服務端網關；被拒絕/失敗都以結構化結果回給 LLM */
async function execExternalTool(name: string, args: Record<string, unknown>): Promise<string> {
  const confirmed = await confirmExternalCall(name, JSON.stringify(args, null, 2))
  if (!confirmed) {
    return JSON.stringify({ status: 'cancelled', message: '用戶取消了該外部服務調用，請告知用戶可修改後重試' })
  }
  try {
    const { default: request } = await import('./request')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await request.post('/mcp/exec', { toolKey: name, args }, { headers: { 'x-silent': '1' } }) as any
    return typeof result === 'string' ? result : JSON.stringify(result)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return JSON.stringify({ error: `外部服務執行失敗: ${msg}` })
  }
}

/** 查詢賬戶餘額 */
async function handleQueryBalance(args: Record<string, unknown>): Promise<string> {
  const params: Record<string, unknown> = { page: 1, size: 10 }
  if (args.groupName) params.groupName = args.groupName as string
  if (args.brand) params.brand = args.brand as string

  const result = await fetchFinAccounts(params as Parameters<typeof fetchFinAccounts>[0])
  const records = (result?.records ?? []) as FinAccount[]

  if (records.length === 0) {
    return JSON.stringify({ message: '未找到符合條件的賬戶', total: 0 })
  }

  const brandLabel = (b: string) => (b === '1' ? '閃蜂' : b === '2' ? 'mFood' : b)
  const statusLabel = (s: string) => {
    const map: Record<string, string> = { normal: '正常', frozen: '凍結', mergeFrozen: '合併凍結' }
    return map[s] || s
  }

  const summary = records.map((r) => ({
    集團: r.groupName,
    集團ID: r.groupId,
    品牌: brandLabel(r.brand),
    虛擬餘額: r.virtualBalance,
    實際餘額: r.actualBalance,
    狀態: statusLabel(r.status),
  }))

  return JSON.stringify({ total: result?.total ?? records.length, records: summary })
}

/** 查詢交易批次 */
async function handleQueryBatches(args: Record<string, unknown>): Promise<string> {
  const params: Record<string, unknown> = { page: 1, size: 10 }
  if (args.groupName) params.groupName = args.groupName as string
  if (args.batchType) params.batchType = args.batchType as string
  if (args.tradeFrom) params.tradeFrom = args.tradeFrom as string
  if (args.tradeTo) params.tradeTo = args.tradeTo as string
  // 金額過濾（LLM 可能給字符串數字，統一轉 number 且過濾 NaN）
  const amountMin = Number(args.amountMin)
  const amountMax = Number(args.amountMax)
  if (args.amountMin !== undefined && args.amountMin !== null && args.amountMin !== '' && !Number.isNaN(amountMin)) params.amountMin = amountMin
  if (args.amountMax !== undefined && args.amountMax !== null && args.amountMax !== '' && !Number.isNaN(amountMax)) params.amountMax = amountMax

  // 使用與 fetchFinAccounts 相同的 request 實例
  const { default: request } = await import('./request')
  const SILENT = { headers: { 'x-silent': '1' } }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const result = await request.get('/fin/batches', { params, ...SILENT }) as any

  const records = (result?.records ?? []) as Array<{
    groupName: string; batchType: string; batchNo: string; tradeTime: string;
    virtualAmount: number | null; actualAmount: number | null; applicant: string; remark: string
  }>

  if (records.length === 0) {
    return JSON.stringify({ message: '未找到符合條件的批次記錄', total: 0 })
  }

  const typeLabel = (t: string) => {
    const map: Record<string, string> = { recharge: '充值', transfer: '轉賬', deduct: '扣款', merge: '合併' }
    return map[t] || t
  }

  const summary = records.map((r) => ({
    集團: r.groupName,
    類型: typeLabel(r.batchType),
    批次號: r.batchNo,
    交易時間: r.tradeTime,
    虛擬金額: r.virtualAmount,
    實際金額: r.actualAmount,
    申請人: r.applicant,
    備註: r.remark,
  }))

  return JSON.stringify({ total: result?.total ?? records.length, records: summary })
}

/** 查詢審批狀態 */
async function handleQueryApprovals(args: Record<string, unknown>): Promise<string> {
  const params: Record<string, unknown> = { page: 1, size: 10 }
  if (args.approvalType) params.approvalType = args.approvalType as string
  if (args.flowStatus) params.flowStatus = args.flowStatus as string
  if (args.groupName) params.groupName = args.groupName as string

  const result = await fetchFinApprovals(params as Parameters<typeof fetchFinApprovals>[0])
  const records = (result?.records ?? []) as FinApproval[]

  if (records.length === 0) {
    return JSON.stringify({ message: '未找到符合條件的審批記錄', total: 0 })
  }

  const typeLabel = (t: string) => {
    const map: Record<string, string> = { recharge: '充值', transfer: '轉賬', deduct: '扣款', merge: '合併' }
    return map[t] || t
  }
  const statusLabel = (s: string) => {
    const map: Record<string, string> = { pending: '審批中', approved: '已通過', rejected: '已駁回', cancelled: '已撤銷' }
    return map[s] || s
  }

  const summary = records.map((r) => ({
    集團: r.groupName,
    類型: typeLabel(r.approvalType),
    流程號: r.flowNo,
    申請人: r.applicant,
    申請時間: r.applyTime,
    狀態: statusLabel(r.flowStatus),
    駁回原因: r.rejectReason || '--',
  }))

  return JSON.stringify({ total: result?.total ?? records.length, records: summary })
}

/* ────────────────── 核心編排邏輯 ────────────────── */

/** 多輪工具編排上限（防死循環；正常組合任務 2-3 輪內完成） */
const MAX_TOOL_ROUNDS = 5

/**
 * 發送消息給 Agent，返回 AI 回覆
 * 流程：用戶消息 → LLM（可能觸發工具調用）→ 執行工具 → LLM 生成最終回覆
 */
export async function sendAgentMessage(history: ChatMessage[], opts?: LlmRequestOptions): Promise<AgentReply> {
  // 拉取已安裝 MCP 工具（廣場安裝/卸載即刻生效；註冊表異常時回退內置 schema）
  const tools = await loadMcpTools()
  const capabilityLines = tools.length > 0
    ? tools.map((tool, i) => {
        const fnName = 'function' in tool ? tool.function?.name ?? '' : ''
        const suffix = fnName && externalToolKeys.has(fnName) ? '（外部服務：執行前需用戶人工確認）' : ''
        return `${i + 1}. ${toolDescription(tool)}${suffix}`
      }).join('\n')
    : '- （暫無可用工具，無法查詢系統數據；請引導用戶前往智能中心「MCP 服務」安裝工具，或聯繫管理員）'
  // 構造 LLM 消息（取最近 10 條作為上下文）
  const recentHistory = history.slice(-10)
  const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    { role: 'system', content: buildSystemPrompt(capabilityLines) },
    ...recentHistory.map((m) => {
      // 用戶消息含圖片附件時，構造多模態 content
      if (m.role === 'user' && m.attachments?.some((a) => a.type === 'image')) {
        const parts: Array<
          | { type: 'text'; text: string }
          | { type: 'image_url'; image_url: { url: string; detail: 'auto' } }
        > = [{ type: 'text', text: m.content }]
        m.attachments
          .filter((a) => a.type === 'image' && a.data.startsWith('data:'))
          .forEach((a) => {
            parts.push({ type: 'image_url', image_url: { url: a.data, detail: 'auto' } })
          })
        // 文件附件以文本形式追加
        m.attachments
          .filter((a) => a.type === 'file' && a.data)
          .forEach((a) => {
            parts.push({ type: 'text', text: `\n[文件: ${a.name}]\n${a.data}` })
          })
        return {
          role: m.role as 'user',
          content: parts as unknown as string,
        }
      }
      // 用戶消息含文件附件（無圖片）
      if (m.role === 'user' && m.attachments?.some((a) => a.type === 'file')) {
        let text = m.content
        m.attachments
          .filter((a) => a.type === 'file' && a.data)
          .forEach((a) => { text += `\n[文件: ${a.name}]\n${a.data}` })
        return { role: m.role as 'user', content: text }
      }
      return {
        role: m.role as 'user' | 'assistant',
        content: m.content,
      }
    }),
  ]

  try {
    // 多輪工具編排：LLM 每輪可發起工具調用，執行結果回填上下文後繼續生成，
    // 支撐「查詢 → 再調用外部服務發送」的組合任務；MAX_TOOL_ROUNDS 防死循環
    let totalTokens = 0
    let modelUsed = MODEL
    let rounds = 0
    while (true) {
      const response = await client.chat.completions.create({
        model: MODEL,
        messages,
        ...(tools.length > 0 ? { tools, tool_choice: 'auto' as const } : {}),
        temperature: 0.3,
      }, { headers: engineModeHeaders(opts) })

      const choice = response.choices[0]
      if (!choice) return { text: '抱歉，AI 暫時無法回應。', model: modelUsed, tokens: totalTokens }
      totalTokens += (response.usage?.prompt_tokens ?? 0) + (response.usage?.completion_tokens ?? 0)
      modelUsed = response.model || modelUsed

      // 無工具調用 → 本輪回覆即最終答案
      if (!choice.message.tool_calls || choice.message.tool_calls.length === 0) {
        return {
          text: choice.message.content || '抱歉，我不太理解你的意思，請嘗試更具體地描述。',
          model: modelUsed,
          tokens: totalTokens,
        }
      }

      // 輪次保護：超限後強制不帶 tools 總結收尾
      if (++rounds > MAX_TOOL_ROUNDS) {
        const finalResponse = await client.chat.completions.create({
          model: MODEL,
          messages,
          temperature: 0.3,
        }, { headers: engineModeHeaders(opts) })
        totalTokens += (finalResponse.usage?.prompt_tokens ?? 0) + (finalResponse.usage?.completion_tokens ?? 0)
        return {
          text: finalResponse.choices[0]?.message?.content || '查詢完成，但無法生成回覆。',
          model: finalResponse.model || modelUsed,
          tokens: totalTokens,
        }
      }

      // 執行本輪所有工具調用，結果以 tool 消息回填上下文（下一輪 LLM 可再次發起調用）
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const rawToolCalls = choice.message.tool_calls as any[]
      messages.push({ role: 'assistant', content: choice.message.content || '', tool_calls: rawToolCalls.map((tc) => ({
        id: tc.id,
        type: 'function' as const,
        function: { name: tc.function.name, arguments: tc.function.arguments },
      })) })

      for (const toolCall of rawToolCalls) {
        let args: Record<string, unknown> = {}
        try {
          args = JSON.parse(toolCall.function.arguments)
        } catch {
          args = {}
        }
        const toolResult = await executeTool(toolCall.function.name, args)
        messages.push({
          role: 'tool',
          tool_call_id: toolCall.id,
          content: toolResult,
        })
      }
    }
  } catch (err) {
    console.error('[Agent Error]', err)
    if (err instanceof Error) {
      if (err.message.includes('API Key')) {
        return { text: '️ LLM 服務未配置。請在 `.env.local` 中設置 `VITE_LLM_API_KEY` 後重啟開發服務器。', model: MODEL, tokens: 0 }
      }
      return { text: `⚠️ AI 服務異常：${err.message}`, model: MODEL, tokens: 0 }
    }
    return { text: '⚠️ AI 服務暫時不可用，請稍後再試。', model: MODEL, tokens: 0 }
  }
}

/* ────────────────── 引擎狀態（當前通道 / 高峰·低峰） ────────────────── */

export interface LlmEngineStatus {
  ok: boolean
  /** 當前生效的引擎模式（手動切換後為所選值） */
  mode: LlmEngineMode
  /** true = 高峰時段（DeepSeek 此時段單價最高） */
  peak: boolean
  /** 北京時間小時，峰谷判定的依據 */
  hour: number
  /** 實際路由通道：primary（全天）/ off-peak（谷時） */
  channel: string | null
  /** 代理側實際改寫的模型 ID */
  model: string | null
  /** 代理依 JWT 身份算出的被限制通道（服務端結論，前端不可偽造） */
  denied: string[]
}

/** 查詢代理當前路由到的模型通道；失敗返回 null，不影響對話 */
export async function fetchEngineStatus(): Promise<LlmEngineStatus | null> {
  return probeEngineStatus(getEngineMode())
}

/**
 * 以指定模式探測引擎狀態（不讀本地記錄的模式）：
 * 首頁用它分別探 primary / off-peak 兩條通道，得到網關真實接入的模型清單
 */
export async function probeEngineStatus(mode: LlmEngineMode): Promise<LlmEngineStatus | null> {
  try {
    const res = await fetch(`${window.location.origin}/api/llm/status`, {
      headers: { ...engineModeHeaders(), 'x-llm-mode': mode },
    })
    if (!res.ok) return null
    return (await res.json()) as LlmEngineStatus
  } catch {
    return null
  }
}

/* ────────────────── 上下文窗口選項生成 ────────────────── */

/** 標準上下文窗口檔位（tokens） */
const CONTEXT_WINDOW_TIERS = [32_000, 64_000, 128_000, 200_000, 400_000, 500_000, 1_000_000, 2_000_000]

/** 將 tokens 數格式化為人類可讀標籤（如 200000 → "200K"） */
export function formatContextWindow(tokens: number): string {
  if (tokens >= 1_000_000) return `${Math.round(tokens / 1_000_000)}M`
  return `${Math.round(tokens / 1_000)}K`
}

/**
 * 根據模型最大上下文窗口，生成可選擇的上下文窗口檔位列表。
 * 返回所有不大於 maxContextWindow 的標準檔位，至少返回一個。
 */
export function getContextWindowOptions(maxContextWindow: number | null | undefined): number[] {
  if (!maxContextWindow || maxContextWindow <= 0) return [128_000]
  return CONTEXT_WINDOW_TIERS.filter((t) => t <= maxContextWindow)
}
