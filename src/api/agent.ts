import OpenAI from 'openai'
import { fetchFinAccounts } from './finance'
import { fetchFinApprovals } from './finance'
import { TOKEN_KEY } from './request'
import type { FinAccount, FinApproval } from './finance'

/**
 * AI Agent 模塊
 * - 定義查詢工具（Tool）的 JSON Schema
 * - 編排 LLM 調用 → 工具執行 → 自然語言回覆 的完整流程
 * - 所有工具調用走現有後端 API，權限由 JWT 控制
 */

/* ────────────────── 類型定義 ────────────────── */

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
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

/**
 * 每次請求即時取模式與登錄憑證，避免把 header 固化在 client 實例上
 *
 * x-llm-token 攜帶當前登錄 JWT（Authorization 頭已被 OpenAI SDK 用作占位 Key）：
 * 代理側會拿它回源後端換取 username 與模型白名單，賬號權限完全由服務端判定，
 * 客戶端無任何可自報的權限參數。
 */
function engineModeHeaders(): Record<string, string> {
  const headers: Record<string, string> = { 'x-llm-mode': getEngineMode() }
  const token = localStorage.getItem(TOKEN_KEY)
  if (token) headers['x-llm-token'] = token
  return headers
}

/* ────────────────── System Prompt ────────────────── */

const SYSTEM_PROMPT = `你是 MFTB 推廣管理後台的 AI 助手，幫助業務人員快速查詢系統數據。

你的能力範圍：
1. 查詢集團賬戶餘額（推廣金虛擬/實際餘額）
2. 查詢交易批次（充值/轉賬/扣款/合併記錄）
3. 查詢交易明細（具體的推廣金變動記錄）
4. 查詢審批狀態（待審批、已通過、已駁回的流程）

規則：
- 使用繁體中文回覆
- 金額顯示使用千分位格式（如 1,000,000）
- 品牌名稱：1=閃蜂，2=mFood
- 如果用戶提到的集團名稱模糊，先嘗試模糊匹配，有多個結果時列出讓用戶選擇
- 查詢結果為空時，明確告知用戶未找到數據
- 不要編造數據，只根據工具返回的實際結果回覆
- 回覆簡潔清晰，重要數字加粗顯示`

/* ────────────────── 工具定義（OpenAI Function Calling Schema） ────────────────── */

const tools: OpenAI.Chat.Completions.ChatCompletionTool[] = [
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

/* ────────────────── 工具執行處理器 ────────────────── */

async function executeTool(name: string, args: Record<string, unknown>): Promise<string> {
  try {
    switch (name) {
      case 'query_account_balance':
        return await handleQueryBalance(args)
      case 'query_batches':
        return await handleQueryBatches(args)
      case 'query_approvals':
        return await handleQueryApprovals(args)
      default:
        return JSON.stringify({ error: `未知工具: ${name}` })
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return JSON.stringify({ error: `查詢失敗: ${msg}` })
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

/**
 * 發送消息給 Agent，返回 AI 回覆
 * 流程：用戶消息 → LLM（可能觸發工具調用）→ 執行工具 → LLM 生成最終回覆
 */
export async function sendAgentMessage(history: ChatMessage[]): Promise<string> {
  // 構造 LLM 消息（取最近 10 條作為上下文）
  const recentHistory = history.slice(-10)
  const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    { role: 'system', content: SYSTEM_PROMPT },
    ...recentHistory.map((m) => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    })),
  ]

  try {
    // 第一步：調用 LLM（帶工具定義）
    const response = await client.chat.completions.create({
      model: MODEL,
      messages,
      tools,
      tool_choice: 'auto',
      temperature: 0.3,
    }, { headers: engineModeHeaders() })

    const choice = response.choices[0]
    if (!choice) return '抱歉，AI 暫時無法回應。'

    // 第二步：如果 LLM 返回工具調用，執行工具
    if (choice.message.tool_calls && choice.message.tool_calls.length > 0) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const rawToolCalls = choice.message.tool_calls as any[]
      // 將 assistant 的 tool_calls 消息加入上下文
      const toolMessages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
        { role: 'assistant', content: choice.message.content || '', tool_calls: rawToolCalls.map((tc) => ({
          id: tc.id,
          type: 'function' as const,
          function: { name: tc.function.name, arguments: tc.function.arguments },
        })) },
      ]

      // 執行每個工具調用，將結果加入上下文
      for (const toolCall of rawToolCalls) {
        let args: Record<string, unknown> = {}
        try {
          args = JSON.parse(toolCall.function.arguments)
        } catch {
          args = {}
        }

        const toolResult = await executeTool(toolCall.function.name, args)
        toolMessages.push({
          role: 'tool',
          tool_call_id: toolCall.id,
          content: toolResult,
        })
      }

      messages.push(...toolMessages)

      // 第三步：帶工具結果再次調用 LLM，生成自然語言回覆
      const finalResponse = await client.chat.completions.create({
        model: MODEL,
        messages,
        temperature: 0.3,
      }, { headers: engineModeHeaders() })

      return finalResponse.choices[0]?.message?.content || '查詢完成，但無法生成回覆。'
    }

    // 無工具調用，直接返回 LLM 回覆
    return choice.message.content || '抱歉，我不太理解你的意思，請嘗試更具體地描述。'
  } catch (err) {
    console.error('[Agent Error]', err)
    if (err instanceof Error) {
      if (err.message.includes('API Key')) {
        return '⚠️ LLM 服務未配置。請在 `.env.local` 中設置 `VITE_LLM_API_KEY` 後重啟開發服務器。'
      }
      return `⚠️ AI 服務異常：${err.message}`
    }
    return '⚠️ AI 服務暫時不可用，請稍後再試。'
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
