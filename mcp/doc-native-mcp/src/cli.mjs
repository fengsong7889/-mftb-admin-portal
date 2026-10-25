#!/usr/bin/env node
/**
 * 启动入口。凭据只从环境变量读取，缺失或格式错误直接退出，且不打印凭据值。
 *
 *   DOC_NATIVE_BASE_URL=https://<host>  DOC_NATIVE_TOKEN=docint_xxx  node src/cli.mjs
 */
import { DocNativeClient } from './client.mjs'
import { startStdioServer } from './server.mjs'

try {
  const client = new DocNativeClient({
    baseUrl: process.env.DOC_NATIVE_BASE_URL,
    token: process.env.DOC_NATIVE_TOKEN,
    timeoutMs: Number(process.env.DOC_NATIVE_TIMEOUT_MS) || 15000,
  })
  startStdioServer({ client })
  process.stderr.write('doc-native-mcp ready (stdio)\n')
} catch (error) {
  process.stderr.write(`doc-native-mcp failed to start: ${error?.message ?? error}\n`)
  process.exit(1)
}
