import { defineConfig, loadEnv, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import { createHash } from 'crypto'

/** LLM 通道（一條通道 = 一個 OpenAI 兼容服務端點） */
interface LlmChannel {
  /** 完整的 chat/completions 端點 */
  url: string
  /** 服務端注入的鑒權 Key；本地模型為 undefined */
  apiKey?: string
  /** 該通道實際使用的模型 ID（由代理側改寫 payload.model） */
  model?: string
  /** 通道專有請求參數（如百煉需關閉思考鏈） */
  extraParams?: Record<string, unknown>
  /** 日誌標識 */
  label: string
}

const DEEPSEEK_OFFICIAL_BASE = 'https://api.deepseek.com/v1'
/** 後端服務地址：同時供 server.proxy 與 LLM 代理插件使用（插件需回源驗證 JWT 與讀 sys_config） */
const BACKEND_BASE = 'http://127.0.0.1:8080'
/** DeepSeek 官方峰時（北京時間 09-12 / 14-18）：僅供狀態接口展示，不參與路由 */
const DEFAULT_PEAK_HOURS = '9-12,14-18'

/** 解析附加請求參數（JSON 字符串）：格式錯誤時忽略，不影響請求 */
function parseExtraParams(spec: string | undefined): Record<string, unknown> | undefined {
  if (!spec || !spec.trim()) return undefined
  try {
    return JSON.parse(spec) as Record<string, unknown>
  } catch {
    console.warn(`[LLM Proxy] 附加請求參數無效，已忽略：${spec}`)
    return undefined
  }
}

/** 本地端點（Ollama 等）無需 Authorization 頭 */
function isLocalEndpoint(url: string): boolean {
  return /(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])/.test(url)
}

/** 解析 "9-12,14-18" 形式的小時段區間（支持 22-2 這種跨日寫法） */
function parseHourRanges(spec: string): Array<[number, number]> {
  return spec
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
    .map((segment) => {
      const [start, end] = segment.split('-').map((n) => Number(n.trim()))
      return [start, end] as [number, number]
    })
    .filter(([start, end]) => Number.isInteger(start) && Number.isInteger(end))
}

function hitHourRange(hour: number, [start, end]: [number, number]): boolean {
  return start <= end ? hour >= start && hour < end : hour >= start || hour < end
}

/** 北京時間當前小時：峰谷計價按北京時區定義，不能依賴本機時區 */
function beijingHour(date = new Date()): number {
  const text = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Shanghai',
    hour: '2-digit',
    hour12: false,
  }).format(date)
  return Number(text) % 24
}

/**
 * 由環境變量構造一條通道；未配置 base 但配了 Key 時回落 DeepSeek 官方（兼容舊配置）。
 * 兩者都沒配置則返回 null，表示該通道不存在。
 */
function buildChannel(
  base: string | undefined,
  apiKey: string | undefined,
  model: string | undefined,
  extraParams: Record<string, unknown> | undefined,
  label: string,
): LlmChannel | null {
  const rawBase = base || (apiKey ? DEEPSEEK_OFFICIAL_BASE : '')
  if (!rawBase) return null
  return {
    url: `${rawBase.replace(/\/$/, '')}/chat/completions`,
    apiKey: isLocalEndpoint(rawBase) ? undefined : apiKey,
    model,
    extraParams,
    label,
  }
}

/** 引擎模式：auto=省錢優先（默認）；primary / off-peak = 手動指定通道 */
type LlmMode = 'auto' | 'primary' | 'off-peak'

/** 前端透過 x-llm-mode 頭傳遞手動切換意圖（非法值一律回落 auto） */
function readRequestedMode(req: { headers: Record<string, string | string[] | undefined> }): LlmMode {
  const raw = req.headers['x-llm-mode']
  const value = Array.isArray(raw) ? raw[0] : raw
  return value === 'primary' || value === 'off-peak' ? value : 'auto'
}

/** 該時刻是否處於 DeepSeek 峰時（只影響前端標識文案，省錢優先策略不看時段） */
function isPeakHour(env: Record<string, string>, hour: number): boolean {
  return parseHourRanges(env.VITE_LLM_PEAK_HOURS || DEFAULT_PEAK_HOURS)
    .some((range) => hitHourRange(hour, range))
}

/** 讀取前端帶來的 JWT（Authorization 頭已被 OpenAI SDK 用作占位 Key，故走獨立頭） */
function readBearerToken(req: { headers: Record<string, string | string[] | undefined> }): string | null {
  const raw = req.headers['x-llm-token']
  const value = Array.isArray(raw) ? raw[0] : raw
  return value && value.trim() ? value.trim() : null
}

/** 身份與模型權限的解析結果 */
type PrincipalOutcome =
  | { status: 'ok'; username: string; denied: string[] }
  | { status: 'unauthorized' }
  | { status: 'unreachable' }

/** 已驗證身份的緩存：避免每條 LLM 請求都回源後端 */
const principalCache = new Map<string, { username: string; denied: string[]; expiresAt: number }>()
const PRINCIPAL_TTL_MS = 30 * 1000

/** 模型賬號白名單的 sys_config key → 對應通道標識 */
const MODEL_ACCOUNT_KEYS: Array<{ configKey: string; channel: string }> = [
  { configKey: 'ai_model_qw_accounts', channel: 'primary' },
  { configKey: 'ai_model_ds_accounts', channel: 'off-peak' },
]

/** 讀後端 sys_config 賬號白名單：key 不存在/值無效時返回 null（語義 = 不限制） */
async function fetchAccountWhitelist(
  configKey: string,
  authHeaders: Record<string, string>,
): Promise<string[] | null> {
  try {
    const res = await fetch(`${BACKEND_BASE}/api/sys-config/${configKey}`, { headers: authHeaders })
    if (!res.ok) return null
    const body = (await res.json()) as { code?: number; data?: { value?: string } }
    if (body?.code !== 200) return null
    const raw = body.data?.value
    if (!raw) return null
    const parsed: unknown = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.map((item) => String(item)) : null
  } catch {
    return null
  }
}

/**
 * 用前端 JWT 向後端換取當前賬號與被限制的模型通道。
 * 身份由後端校驗（含單設備/強制下線等會話規則），客戶端無法自報 username 或自報受限集合；
 * 認證失敗一律拒絕，僅「白名單讀不到」按不限制降級（配置缺失的既有語義）。
 */
async function resolvePrincipal(token: string): Promise<PrincipalOutcome> {
  // 以 token 摘要作緩存 key，避免可直接復用的憑證明文常駐內存
  const cacheKey = createHash('sha256').update(token).digest('hex')
  const hit = principalCache.get(cacheKey)
  if (hit && hit.expiresAt > Date.now()) {
    return { status: 'ok', username: hit.username, denied: hit.denied }
  }

  const authHeaders = { Authorization: `Bearer ${token}` }
  let res: Awaited<ReturnType<typeof fetch>>
  try {
    res = await fetch(`${BACKEND_BASE}/api/auth/info`, { headers: authHeaders })
  } catch (err) {
    console.warn(`[LLM Proxy] 無法連接後端驗證賬號權限：${err instanceof Error ? err.message : String(err)}`)
    return { status: 'unreachable' }
  }

  let username: string | null = null
  const text = await res.text().catch(() => '')
  if (res.ok) {
    try {
      // 完整解析（UserInfoVO 含日期字段，若後端未啟用 JSR310 模块會導致解析失敗）
      const body = JSON.parse(text) as { code?: number; data?: { username?: string } }
      if (body?.code === 200) username = body.data?.username ?? null
    } catch {
      // 降級：只提取 username 字段，避免被無關字段的序列化格式影響（身份校驗仍由後端完成）
      const matched = text.match(/"username"\s*:\s*"([^"]+)"/)
      if (/"code"\s*:\s*200/.test(text) && matched) username = matched[1]
    }
  }

  if (!username) {
    principalCache.delete(cacheKey)
    return { status: 'unauthorized' }
  }

  const denied: string[] = []
  for (const { configKey, channel } of MODEL_ACCOUNT_KEYS) {
    const accounts = await fetchAccountWhitelist(configKey, authHeaders)
    if (accounts && accounts.length > 0 && !accounts.includes(username)) denied.push(channel)
  }

  if (principalCache.size > 200) principalCache.clear()
  principalCache.set(cacheKey, { username, denied, expiresAt: Date.now() + PRINCIPAL_TTL_MS })
  return { status: 'ok', username, denied }
}

/** 構造兩條通道（primary = 百煉 Qwen，off-peak = DeepSeek） */
function buildChannels(env: Record<string, string>): { primary: LlmChannel | null; offPeak: LlmChannel | null } {
  return {
    primary: buildChannel(
      env.VITE_LLM_BASE_URL,
      env.VITE_LLM_API_KEY,
      env.VITE_LLM_MODEL,
      parseExtraParams(env.VITE_LLM_EXTRA_PARAMS),
      'primary',
    ),
    offPeak: buildChannel(
      env.VITE_LLM_OFFPEAK_BASE_URL,
      env.VITE_LLM_OFFPEAK_API_KEY,
      env.VITE_LLM_OFFPEAK_MODEL,
      parseExtraParams(env.VITE_LLM_OFFPEAK_EXTRA_PARAMS),
      'off-peak',
    ),
  }
}

/** 路由決策結果 */
interface LlmRoute {
  /** 實際轉發的通道；null 表示該賬號在此模式下沒有可用模型 */
  channel: LlmChannel | null
  /** true = 通道已配置但均不對該賬號開放（有別於「後端未配置」） */
  deniedAll: boolean
}

/**
 * 選通道（denied = 該賬號被「AI 模型權限規則」限制的通道）：
 * - auto（省錢優先）：在「已配置且對該賬號開放」的通道裡按單價最優順序取第一條；
 *   全部不可用時返回 null 直接報錯，不會繞過權限借用未開放的模型
 * - primary / off-peak：尊重顯式選擇，被權限限制時不改道（避免悄悄消耗未開放額度）；
 *   僅在該通道根本未配置時沿用寬容回落，保證本地開發不中斷
 */
function resolveRoute(env: Record<string, string>, mode: LlmMode, denied: Set<string>): LlmRoute {
  const { primary, offPeak } = buildChannels(env)
  const usable = (channel: LlmChannel | null): channel is LlmChannel =>
    channel !== null && !denied.has(channel.label)

  if (mode === 'primary') {
    if (primary) return { channel: usable(primary) ? primary : null, deniedAll: denied.has(primary.label) }
    return { channel: usable(offPeak) ? offPeak : null, deniedAll: false }
  }
  if (mode === 'off-peak') {
    if (offPeak) return { channel: usable(offPeak) ? offPeak : null, deniedAll: denied.has(offPeak.label) }
    return { channel: usable(primary) ? primary : null, deniedAll: false }
  }
  if (usable(primary)) return { channel: primary, deniedAll: false }
  if (usable(offPeak)) return { channel: offPeak, deniedAll: false }
  return { channel: null, deniedAll: Boolean(primary || offPeak) }
}

/** 為省錢優先找一條「未被限制且不同於當前」的備用通道；找不到返回 null（即故障時只能報錯） */
function findBackupChannel(
  env: Record<string, string>,
  usedLabel: string,
  denied: Set<string>,
): LlmChannel | null {
  const { primary, offPeak } = buildChannels(env)
  const candidates = [offPeak, primary].filter(
    (channel): channel is LlmChannel =>
      channel !== null && channel.label !== usedLabel && !denied.has(channel.label),
  )
  return candidates[0] ?? null
}

/**
 * 將本次用量上報後端落庫（fire-and-forget，不阻塞對話）：
 * 攜帶同一 JWT 由後端校驗賬號，客戶端無法冒用他人身份記賬；失敗僅打日誌。
 */
function reportUsage(
  token: string,
  mode: LlmMode,
  channel: LlmChannel,
  data: unknown,
): void {
  const response = data as {
    model?: string
    usage?: {
      prompt_tokens?: number
      completion_tokens?: number
      prompt_tokens_details?: { cached_tokens?: number }
    }
  } | null
  const usage = response?.usage
  if (!usage) return
  const body = JSON.stringify({
    mode,
    channel: channel.label,
    model: response?.model || channel.model || '',
    promptTokens: usage.prompt_tokens ?? 0,
    completionTokens: usage.completion_tokens ?? 0,
    cachedTokens: usage.prompt_tokens_details?.cached_tokens ?? 0,
  })
  fetch(`${BACKEND_BASE}/api/llm-usage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body,
  }).catch((err) => {
    console.warn(`[LLM Proxy] 用量上報失敗（本次不計入統計）：${err instanceof Error ? err.message : String(err)}`)
  })
}

/** 查詢 DeepSeek 官方餘額接口；未配置/失敗返回 null（百煉無公開餘額 API） */
async function fetchDeepSeekBalance(
  env: Record<string, string>,
): Promise<{ available: boolean; balance: number } | null> {
  const apiKey = env.VITE_LLM_OFFPEAK_API_KEY
  if (!apiKey) return null
  try {
    const res = await fetch('https://api.deepseek.com/user/balance', {
      headers: { Authorization: `Bearer ${apiKey}` },
    })
    if (!res.ok) return null
    const body = (await res.json()) as { is_available?: boolean; balance?: number }
    return { available: Boolean(body?.is_available), balance: Number(body?.balance ?? 0) }
  } catch {
    return null
  }
}

/** 轉發一次請求到指定通道；status=0 表示網絡/超時/非 JSON 等傳輸層失敗 */
async function requestChannel(
  channel: LlmChannel,
  payload: Record<string, unknown>,
): Promise<{ status: number; data: unknown }> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (channel.apiKey) headers['Authorization'] = `Bearer ${channel.apiKey}`

  // 前端只傳一個模型名，實際模型 ID 與通道專有參數由各通道自行改寫
  const body: Record<string, unknown> = { ...payload }
  if (channel.model) body.model = channel.model
  if (channel.extraParams) Object.assign(body, channel.extraParams)

  // 超時控制：60 秒（LLM 工具調用可能較慢）
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 60000)
  try {
    const response = await fetch(channel.url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: controller.signal,
    })
    const text = await response.text()
    try {
      return { status: response.status, data: JSON.parse(text) as unknown }
    } catch {
      return { status: response.status, data: { error: `非 JSON 回應：${text.slice(0, 200)}` } }
    }
  } catch (err) {
    return { status: 0, data: { error: `LLM 請求失敗：${err instanceof Error ? err.message : String(err)}` } }
  } finally {
    clearTimeout(timer)
  }
}

/**
 * LLM 代理插件：前端調用 /api/llm/chat → 服務端按引擎模式 + 賬號模型權限選通道轉發 → 返回結果
 *
 * 三類目標均由環境變量驅動，業務代碼（agent.ts）不需要感知供應商：
 * 1. 雲端 OpenAI 兼容服務：設 BASE_URL + API_KEY（百煉 / OpenAI / OpenRouter 等）
 * 2. 本地模型（Ollama 等）：BASE_URL 指向 localhost，自動跳過鑒權頭
 * 3. 只設 API_KEY：回落 DeepSeek 官方端點
 *
 * 賬號模型權限由代理側自主判定：拿前端 JWT 回源後端 /api/auth/info 換取 username（驗簽由後端負責），
 * 再讀 sys_config 白名單算出受限通道——客戶端無法自報身份或自報受限集合。
 * 注意：本插件僅存在於開發環境（構建後無 /api/llm 路由），生產上線需把同一套路由搬到後端。
 */
function llmProxyPlugin(envDir: string): Plugin {
  return {
    name: 'llm-proxy',
    configureServer(server) {
      // 從 .env.local 讀取環境變量（Vite 插件運行在 Node 端，需手動加載）
      const env = loadEnv('', envDir, '')

      server.middlewares.use('/api/llm', async (req, res, next) => {
        const hour = beijingHour()
        const mode = readRequestedMode(req)

        // 身份與權限必須由後端判定：缺 token / token 失效 / 後端不可達一律拒絕，
        // 不接受任何客戶端直報的權限頭（x-llm-denied 已廢棄）
        const token = readBearerToken(req)
        const principal = token
          ? await resolvePrincipal(token)
          : { status: 'unauthorized' as const }
        if (principal.status !== 'ok') {
          res.statusCode = principal.status === 'unreachable' ? 503 : 401
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({
            error: principal.status === 'unreachable'
              ? '無法連接後端驗證賬號模型權限，請確認後端服務已啟動'
              : '登錄狀態無效或已過期，請重新登錄後使用 AI 助手',
          }))
          return
        }

        const denied = new Set(principal.denied)
        const route = resolveRoute(env, mode, denied)
        const channel = route.channel

        // 引擎狀態查詢：供前端展示「當前引擎 / 峰谷時段」（GET /api/llm/status）
        if (req.method === 'GET' && (req.url ?? '').split('?')[0] === '/status') {
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({
            ok: Boolean(channel),
            mode,
            peak: isPeakHour(env, hour),
            hour,
            channel: channel?.label ?? null,
            model: channel?.model ?? null,
            account: principal.username,
            denied: principal.denied,
          }))
          return
        }

        if (req.method === 'GET' && (req.url ?? '').split('?')[0] === '/balances') {
          const deepseek = await fetchDeepSeekBalance(env)
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ deepseek }))
          return
        }

        if (req.method !== 'POST') return next()

        if (!channel) {
          res.statusCode = route.deniedAll ? 403 : 500
          res.end(JSON.stringify({
            error: route.deniedAll
              ? '當前賬號在該模式下沒有可用模型（部分模型未對你開放），請聯繫管理員申請開通'
              : 'LLM 未配置：請設置 VITE_LLM_BASE_URL + VITE_LLM_API_KEY',
          }))
          return
        }

        try {
          let body = ''
          for await (const chunk of req) body += chunk
          const payload = JSON.parse(body) as Record<string, unknown>
          const deniedTip = denied.size > 0 ? `，受限通道：${[...denied].join('/')}` : ''
          console.log(`[LLM Proxy] ${mode === 'auto' ? '省錢優先' : `手動:${mode}`} → ${channel.label}（${channel.model ?? payload.model}）${deniedTip}`)

          let result = await requestChannel(channel, payload)

          // 省錢優先：當前通道故障（欠費/鑒權失效/超時）時，只在該賬號有權的其它通道裡兜底；
          // 沒有可接管模型時保留原始錯誤直接返回，不繞過權限借用未開放的模型
          if ((result.status === 0 || result.status >= 400) && mode === 'auto') {
            const backup = findBackupChannel(env, channel.label, denied)
            if (backup) {
              console.warn(`[LLM Proxy] ${channel.label} 失敗(${result.status})，回落 ${backup.label}`)
              const retry = await requestChannel(backup, payload)
              if (retry.status > 0 && retry.status < 400) result = retry
            } else {
              console.warn(`[LLM Proxy] ${channel.label} 失敗(${result.status})，該賬號無其它可回落通道，直接報錯`)
            }
          }

          // 轉發成功後上報用量落庫（後端按 JWT 身份記賬；回落時 data.model 已是真實接管模型）
          if (result.status > 0 && result.status < 400 && token) {
            reportUsage(token, mode, channel, result.data)
          }

          res.statusCode = result.status === 0 ? 500 : result.status
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify(result.data))
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err)
          console.error('[LLM Proxy Error]', msg)
          res.statusCode = 500
          res.end(JSON.stringify({ error: `LLM 請求失敗：${msg}` }))
        }
      })
    },
  }
}

export default defineConfig({
  plugins: [react(), llmProxyPlugin(__dirname)],
  base: process.env.NODE_ENV === 'production' ? '/-mftb-admin-portal/' : '/',
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
    dedupe: ['react', 'react-dom'],
  },
  server: {
    port: 3000,
    host: '0.0.0.0', // 允许局域网访问
    open: true,
    proxy: {
      // 将 /api 请求代理到后端 Spring Boot 服务
      '/api': {
        target: BACKEND_BASE,
        changeOrigin: true,
      },
    },
  },
  build: {
    chunkSizeWarningLimit: 2000,
  },
})
