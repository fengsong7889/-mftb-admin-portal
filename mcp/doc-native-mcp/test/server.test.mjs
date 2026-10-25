import { test } from 'node:test'
import assert from 'node:assert/strict'
import { DocNativeClient } from '../src/client.mjs'
import { toolDefinitions, callTool } from '../src/tools.mjs'
import { createRpcHandler } from '../src/server.mjs'

const TOKEN = `docint_${'x'.repeat(43)}`
const BASE = 'https://doc.example.com'

function fakeFetch(payload = { code: 200, data: { ok: true } }, status = 200) {
  const calls = []
  const fetchImpl = async (url, init) => {
    calls.push({ url, init })
    return { ok: status >= 200 && status < 300, status, text: async () => JSON.stringify(payload) }
  }
  return { calls, fetchImpl }
}
const clientWith = fetchImpl => new DocNativeClient({ baseUrl: BASE, token: TOKEN, fetchImpl })

test('客户端拒绝非本机明文 http 与缺失凭据', () => {
  assert.throws(() => new DocNativeClient({ baseUrl: 'http://doc.example.com', token: TOKEN }), /localhost/)
  assert.throws(() => new DocNativeClient({ baseUrl: BASE }), /DOC_NATIVE_TOKEN/)
  assert.throws(() => new DocNativeClient({ baseUrl: BASE, token: 'bad' }), /format/)
  assert.throws(() => new DocNativeClient({ baseUrl: 'ftp://x', token: TOKEN }), /https/)
})

test('请求携带 Bearer 与幂等键，不把令牌写进 URL', async () => {
  const { calls, fetchImpl } = fakeFetch({ code: 200, data: { documentId: 1 } })
  const client = clientWith(fetchImpl)
  await client.request('POST', '/api/doc/v2/documents', { body: { title: 't' }, idempotencyKey: 'create-abcdefgh' })
  assert.equal(calls.length, 1)
  assert.equal(calls[0].url, `${BASE}/api/doc/v2/documents`)
  assert.equal(calls[0].init.headers.Authorization, `Bearer ${TOKEN}`)
  assert.equal(calls[0].init.headers['Idempotency-Key'], 'create-abcdefgh')
  assert.equal(calls[0].init.redirect, 'error')
  assert.ok(!calls[0].url.includes(TOKEN))
})

test('后端业务码非 200 时抛出后端脱敏文案', async () => {
  const { fetchImpl } = fakeFetch({ code: 403, message: '文檔不存在或不可存取' })
  const client = clientWith(fetchImpl)
  await assert.rejects(() => client.request('GET', '/api/doc/v2/documents'), /文檔不存在或不可存取/)
})

test('拒绝非文档域路径，避免被当成通用代理', async () => {
  const { fetchImpl } = fakeFetch()
  const client = clientWith(fetchImpl)
  await assert.rejects(() => client.request('GET', '/api/auth/check'), /non-doc-native/)
})

test('工具面只有草稿与只读能力，没有发布/审批/导出', () => {
  const names = toolDefinitions().map(tool => tool.name)
  assert.deepEqual(names.sort(), [
    'doc_create_draft', 'doc_get', 'doc_get_handoff_context', 'doc_get_save_receipt',
    'doc_save_revision', 'doc_search',
  ])
  for (const forbidden of ['publish', 'approve', 'grant', 'export', 'trash', 'acl']) {
    assert.ok(!names.some(name => name.includes(forbidden)), `must not expose ${forbidden}`)
  }
})

test('创建草稿强制幂等键与会话来源，并按契约提交', async () => {
  const { calls, fetchImpl } = fakeFetch({ code: 200, data: { documentId: 7 } })
  const client = clientWith(fetchImpl)
  await assert.rejects(() => callTool(client, 'doc_create_draft', {
    spaceId: 3, title: 't', markdown: 'm', changeReason: 'c', sourceSessionKey: 'session-1',
  }), /idempotencyKey/)
  await callTool(client, 'doc_create_draft', {
    spaceId: 3, title: '方案', markdown: '# 正文', changeReason: '初稿', sourceSessionKey: 'session-1',
    idempotencyKey: 'create-12345678', summary: '摘要', tags: ['標籤'],
  })
  assert.equal(calls[0].init.method, 'POST')
  assert.equal(calls[0].init.headers['Idempotency-Key'], 'create-12345678')
  assert.deepEqual(JSON.parse(calls[0].init.body), {
    spaceId: 3, title: '方案', summary: '摘要', markdown: '# 正文', tags: ['標籤'],
    changeReason: '初稿', sourceSessionKey: 'session-1',
  })
})

test('检索参数白名单与分页上限', async () => {
  const { calls, fetchImpl } = fakeFetch({ code: 200, data: { records: [], total: 0 } })
  const client = clientWith(fetchImpl)
  await callTool(client, 'doc_search', { keyword: '方案', view: 'drafts', page: 2, size: 50 })
  assert.equal(calls[0].url, `${BASE}/api/doc/v2/documents?view=drafts&page=2&size=50&keyword=%E6%96%B9%E6%A1%88`)
  await assert.rejects(() => callTool(client, 'doc_search', { view: 'all' }), /view must be/)
  await assert.rejects(() => callTool(client, 'doc_search', { size: 101 }), /size must be/)
})

test('回执查询使用编码后的键，交接上下文不返回正文', async () => {
  const { calls, fetchImpl } = fakeFetch({
    code: 200,
    data: { document: { nodeId: 1 }, revision: { id: 2, revisionNo: 1, title: 't', contentHash: 'a'.repeat(64), markdown: 'secret' }, allowedActions: ['read'], handoffs: [] },
  })
  const client = clientWith(fetchImpl)
  await callTool(client, 'doc_get_save_receipt', { key: 'save-12345678' })
  assert.equal(calls[0].url, `${BASE}/api/doc/v2/ingest-receipts/save-12345678`)
  const context = await callTool(client, 'doc_get_handoff_context', { id: 1 })
  assert.equal(context.revision.markdown, undefined)
  assert.deepEqual(context.allowedActions, ['read'])
})

test('JSON-RPC：握手、未知方法与工具失败返回可恢复说明', async () => {
  const { fetchImpl } = fakeFetch()
  const handle = createRpcHandler({ client: clientWith(fetchImpl) })
  const init = await handle({ jsonrpc: '2.0', id: 1, method: 'initialize' })
  assert.equal(init.result.protocolVersion, '2024-11-05')
  assert.deepEqual(init.result.capabilities, { tools: { listChanged: false } })
  const unknown = await handle({ jsonrpc: '2.0', id: 2, method: 'resources/list' })
  assert.equal(unknown.error.code, -32601)
  const badArgs = await handle({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'doc_get', arguments: {} } })
  assert.equal(badArgs.result.isError, true)
  assert.match(badArgs.result.content[0].text, /id must be a positive integer/)
  assert.equal(await handle({ jsonrpc: '2.0', method: 'notifications/initialized' }), null)
})
