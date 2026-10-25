/**
 * 最小 MCP STDIO 服务端：JSON-RPC 2.0，逐行读写。
 * 只实现 tools 能力；不声明 resources/prompts，避免扩大机器可见面。
 */
import { createInterface } from 'node:readline'
import { toolDefinitions, callTool } from './tools.mjs'

export const PROTOCOL_VERSION = '2024-11-05'
export const SERVER_INFO = { name: 'doc-native-mcp', version: '0.1.0' }

const ok = (id, result) => ({ jsonrpc: '2.0', id, result })
const fail = (id, code, message) => ({ jsonrpc: '2.0', id, error: { code, message } })

export function createRpcHandler({ client }) {
  if (!client) throw new Error('client is required')
  return async function handle(message) {
    if (!message || message.jsonrpc !== '2.0' || typeof message.method !== 'string') {
      return fail(message?.id ?? null, -32600, 'Invalid Request')
    }
    const { id, method, params } = message
    switch (method) {
      case 'initialize':
        return ok(id, {
          protocolVersion: PROTOCOL_VERSION,
          capabilities: { tools: { listChanged: false } },
          serverInfo: SERVER_INFO,
        })
      case 'notifications/initialized':
        return null
      case 'ping':
        return ok(id, {})
      case 'tools/list':
        return ok(id, { tools: toolDefinitions() })
      case 'tools/call': {
        const name = params?.name
        if (typeof name !== 'string') return fail(id, -32602, 'tool name is required')
        try {
          const data = await callTool(client, name, params?.arguments ?? {})
          return ok(id, {
            content: [{ type: 'text', text: JSON.stringify({ ok: true, data }) }],
            isError: false,
          })
        } catch (error) {
          // 工具失败按 MCP 约定放进 result.isError，让模型能看到可恢复的说明；
          // message 只来自本地校验或后端脱敏文案，不包含令牌。
          return ok(id, {
            content: [{ type: 'text', text: JSON.stringify({ ok: false, error: String(error?.message ?? error) }) }],
            isError: true,
          })
        }
      }
      default:
        return fail(id, -32601, `Method not found: ${method}`)
    }
  }
}

export function startStdioServer({ client, input = process.stdin, output = process.stdout }) {
  const handle = createRpcHandler({ client })
  const lines = createInterface({ input, crlfDelay: Infinity })
  lines.on('line', async line => {
    const text = line.trim()
    if (!text) return
    let message
    try {
      message = JSON.parse(text)
    } catch {
      output.write(`${JSON.stringify(fail(null, -32700, 'Parse error'))}\n`)
      return
    }
    const response = await handle(message)
    if (response) output.write(`${JSON.stringify(response)}\n`)
  })
  return lines
}
