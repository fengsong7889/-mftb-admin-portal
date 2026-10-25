/**
 * 工具面限定为「检索 + 读 + 写草稿 + 查回执 + 读交接上下文」。
 * 没有发布、审批、改权限、删除、导出工具：机器身份在后端也永远不能审批。
 */
const KEY_PATTERN = /^[A-Za-z0-9_.:-]{8,128}$/
const VIEWS = ['effective', 'drafts', 'history', 'trash']

const requiredString = (args, name, max) => {
  const value = args?.[name]
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${name} is required`)
  if (max && value.length > max) throw new Error(`${name} is too long`)
  return value
}
const requiredId = (args, name) => {
  const value = Number(args?.[name])
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error(`${name} must be a positive integer`)
  return value
}
const optionalString = (args, name, max) => {
  const value = args?.[name]
  if (value === undefined || value === null || value === '') return undefined
  if (typeof value !== 'string') throw new Error(`${name} must be a string`)
  if (max && value.length > max) throw new Error(`${name} is too long`)
  return value
}
const key = (args, name) => {
  const value = requiredString(args, name, 128)
  if (!KEY_PATTERN.test(value)) throw new Error(`${name} must match [A-Za-z0-9_.:-]{8,128}`)
  return value
}
const tags = (args) => {
  const value = args?.tags
  if (value === undefined) return []
  if (!Array.isArray(value) || value.length > 20) throw new Error('tags must contain at most 20 items')
  return value.map(tag => {
    if (typeof tag !== 'string' || !tag.trim() || tag.length > 40) throw new Error('each tag must be 1-40 characters')
    return tag.trim()
  })
}

export function toolDefinitions() {
  return [
    {
      name: 'doc_search',
      description: 'Search plans visible to the credential within its allowed space. Returns metadata and the current revision, never the full markdown of other revisions.',
      inputSchema: {
        type: 'object',
        properties: {
          keyword: { type: 'string', description: 'Title, body, number or historical filename; max 100 chars' },
          view: { type: 'string', enum: VIEWS, description: 'effective (default) / drafts / history / trash' },
          page: { type: 'integer', minimum: 1, default: 1 },
          size: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
        },
      },
    },
    {
      name: 'doc_get',
      description: 'Read a plan by id, optionally pinned to a revision id. Access is recomputed on the server for every call.',
      inputSchema: {
        type: 'object',
        required: ['id'],
        properties: { id: { type: 'integer' }, revisionId: { type: 'integer' } },
      },
    },
    {
      name: 'doc_create_draft',
      description: 'Create a Markdown draft. A sourceSessionKey and an Idempotency-Key are mandatory so a lost response can be retried safely. This tool can never publish or approve.',
      inputSchema: {
        type: 'object',
        required: ['spaceId', 'title', 'markdown', 'changeReason', 'sourceSessionKey', 'idempotencyKey'],
        properties: {
          spaceId: { type: 'integer' },
          title: { type: 'string', description: 'Max 200 chars' },
          summary: { type: 'string', description: 'Max 1000 chars' },
          markdown: { type: 'string', description: 'Markdown source, max 2 MiB' },
          tags: { type: 'array', items: { type: 'string' }, maxItems: 20 },
          changeReason: { type: 'string', description: 'Max 200 chars' },
          sourceSessionKey: { type: 'string', description: 'Stable logical source id for this session' },
          idempotencyKey: { type: 'string', description: 'Unique per write; reuse only when retrying the identical payload' },
        },
      },
    },
    {
      name: 'doc_save_revision',
      description: 'Append a new immutable revision to an existing draft. expectedVersion must be the current document version; conflicts are returned instead of overwritten.',
      inputSchema: {
        type: 'object',
        required: ['id', 'spaceId', 'title', 'markdown', 'changeReason', 'expectedVersion', 'idempotencyKey'],
        properties: {
          id: { type: 'integer' },
          spaceId: { type: 'integer' },
          title: { type: 'string' },
          summary: { type: 'string' },
          markdown: { type: 'string' },
          tags: { type: 'array', items: { type: 'string' }, maxItems: 20 },
          changeReason: { type: 'string' },
          expectedVersion: { type: 'integer', description: 'Current document version; stale values get 409' },
          idempotencyKey: { type: 'string' },
        },
      },
    },
    {
      name: 'doc_get_save_receipt',
      description: 'Verify a previous write by idempotency key. Use this after a timeout instead of creating a second draft.',
      inputSchema: {
        type: 'object',
        required: ['key'],
        properties: { key: { type: 'string' } },
      },
    },
    {
      name: 'doc_get_handoff_context',
      description: 'Read the handoff/decision context of a plan (document head, allowed actions, handoffs, current revision metadata) without moving it to execution.',
      inputSchema: {
        type: 'object',
        required: ['id'],
        properties: { id: { type: 'integer' } },
      },
    },
  ]
}

export async function callTool(client, name, args = {}) {
  switch (name) {
    case 'doc_search': {
      const view = args.view === undefined ? 'effective' : String(args.view)
      if (!VIEWS.includes(view)) throw new Error(`view must be one of ${VIEWS.join(', ')}`)
      const page = args.page === undefined ? 1 : Number(args.page)
      const size = args.size === undefined ? 20 : Number(args.size)
      if (!Number.isInteger(page) || page < 1) throw new Error('page must be a positive integer')
      if (!Number.isInteger(size) || size < 1 || size > 100) throw new Error('size must be between 1 and 100')
      const params = new URLSearchParams({ view, page: String(page), size: String(size) })
      const keyword = optionalString(args, 'keyword', 100)
      if (keyword) params.set('keyword', keyword)
      return await client.request('GET', `/api/doc/v2/documents?${params.toString()}`)
    }
    case 'doc_get': {
      const id = requiredId(args, 'id')
      const revisionId = args.revisionId === undefined ? undefined : requiredId(args, 'revisionId')
      return await client.request('GET', revisionId
        ? `/api/doc/v2/documents/${id}/revisions/${revisionId}`
        : `/api/doc/v2/documents/${id}`)
    }
    case 'doc_create_draft': {
      const body = {
        spaceId: requiredId(args, 'spaceId'),
        title: requiredString(args, 'title', 200),
        summary: optionalString(args, 'summary', 1000) ?? '',
        markdown: requiredString(args, 'markdown'),
        tags: tags(args),
        changeReason: requiredString(args, 'changeReason', 200),
        sourceSessionKey: requiredString(args, 'sourceSessionKey', 128),
      }
      return await client.request('POST', '/api/doc/v2/documents', {
        body, idempotencyKey: key(args, 'idempotencyKey'),
      })
    }
    case 'doc_save_revision': {
      const id = requiredId(args, 'id')
      const expectedVersion = Number(args.expectedVersion)
      if (!Number.isInteger(expectedVersion) || expectedVersion < 1) throw new Error('expectedVersion must be a positive integer')
      const body = {
        spaceId: requiredId(args, 'spaceId'),
        title: requiredString(args, 'title', 200),
        summary: optionalString(args, 'summary', 1000) ?? '',
        markdown: requiredString(args, 'markdown'),
        tags: tags(args),
        changeReason: requiredString(args, 'changeReason', 200),
        expectedVersion,
      }
      return await client.request('POST', `/api/doc/v2/documents/${id}/revisions`, {
        body, idempotencyKey: key(args, 'idempotencyKey'),
      })
    }
    case 'doc_get_save_receipt':
      return await client.request('GET', `/api/doc/v2/ingest-receipts/${encodeURIComponent(key(args, 'key'))}`)
    case 'doc_get_handoff_context': {
      const data = await client.request('GET', `/api/doc/v2/documents/${requiredId(args, 'id')}`)
      return {
        document: data?.document,
        revision: data?.revision
          ? { id: data.revision.id, revisionNo: data.revision.revisionNo, title: data.revision.title, contentHash: data.revision.contentHash }
          : null,
        allowedActions: data?.allowedActions ?? [],
        handoffs: data?.handoffs ?? [],
        confirmations: data?.confirmations ?? [],
      }
    }
    default:
      throw new Error(`unknown tool: ${name}`)
  }
}
