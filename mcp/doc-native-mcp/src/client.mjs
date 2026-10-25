/**
 * Doc Native HTTP 客户端（集成凭据）。
 *
 * 约束：
 * - 令牌只从环境变量读，不写日志、不进错误信息、不进 URL；
 * - 只允许 https，或本机 http（本地联调）；
 * - 禁止跟随重定向，避免凭据被带到未授权主机；
 * - 每次写请求必须由调用方显式提供 Idempotency-Key。
 */
const TOKEN_PATTERN = /^docint_[A-Za-z0-9_-]{43}$/

export class DocNativeClient {
  constructor({ baseUrl, token, fetchImpl = globalThis.fetch, timeoutMs = 15000 }) {
    if (!baseUrl) throw new Error('DOC_NATIVE_BASE_URL is required')
    if (!token) throw new Error('DOC_NATIVE_TOKEN is required')
    if (!TOKEN_PATTERN.test(token)) throw new Error('DOC_NATIVE_TOKEN format is invalid')
    let url
    try { url = new URL(baseUrl) } catch { throw new Error('DOC_NATIVE_BASE_URL is invalid') }
    if (url.protocol !== 'https:' && url.protocol !== 'http:') {
      throw new Error('DOC_NATIVE_BASE_URL must use https')
    }
    if (url.protocol === 'http:' && !['localhost', '127.0.0.1', '::1'].includes(url.hostname)) {
      throw new Error('plain http is only allowed for localhost')
    }
    if (typeof fetchImpl !== 'function') throw new Error('fetch implementation is required')
    this.baseUrl = baseUrl.replace(/\/+$/, '')
    this.token = token
    this.fetch = fetchImpl
    this.timeoutMs = timeoutMs
  }

  async request(method, path, { body, idempotencyKey } = {}) {
    if (!path.startsWith('/api/doc/v2/')) throw new Error('refusing non-doc-native path')
    const headers = { Authorization: `Bearer ${this.token}`, Accept: 'application/json' }
    if (body !== undefined) headers['Content-Type'] = 'application/json'
    if (idempotencyKey) headers['Idempotency-Key'] = idempotencyKey
    const response = await this.fetch(`${this.baseUrl}${path}`, {
      method,
      headers,
      redirect: 'error',
      signal: AbortSignal.timeout(this.timeoutMs),
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    const text = await response.text()
    let payload = null
    try { payload = text ? JSON.parse(text) : null } catch {
      throw new Error(`document service returned a non-JSON response (HTTP ${response.status})`)
    }
    if (!response.ok) throw new Error(payload?.message || `document service returned HTTP ${response.status}`)
    if (!payload || payload.code !== 200) {
      throw new Error(payload?.message || 'document service rejected the request')
    }
    return payload.data
  }
}
