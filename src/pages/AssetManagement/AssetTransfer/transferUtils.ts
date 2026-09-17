import { ROUTE_MENU_KEY_MAP } from '../../Permission/types'

export const TRANSFER_STATUS = { DONE: 'done', CANCELLED: 'cancelled' } as const
export const HOLD_TYPE = { OWNED: 'owned', BORROWED: 'borrowed' } as const
export const TRANSFER_LIMITS = { REASON: 500, REMARK: 512 } as const
export const TRANSFER_MENU = 'asset-transfer-list'
export const TRANSFER_LIST = '/asset-transfer-list'
export const ENABLED_DEPARTMENT = 1

export function positiveId(value: string | null): number | undefined {
  if (!value || !/^[1-9]\d*$/.test(value)) return undefined
  const id = Number(value)
  return Number.isSafeInteger(id) ? id : undefined
}

/** 来源只控制导航；访问权限仍由路由与后端各自校验。 */
export function resolveTransferFrom(raw: string | null, fallback = TRANSFER_LIST, current?: string): string {
  if (!raw || !raw.startsWith('/') || raw.startsWith('//') || /[\\\r\n]/.test(raw)) return fallback
  try {
    const parsed = new URL(raw, 'https://internal.invalid')
    if (parsed.origin !== 'https://internal.invalid' || parsed.pathname === current
      || !(parsed.pathname in ROUTE_MENU_KEY_MAP) || parsed.pathname === '/asset-transfer') return fallback
    return `${parsed.pathname}${parsed.search}`
  } catch { return fallback }
}

export function withTransferFrom(path: string, from: string, transferContext = false): string {
  const [pathname, search = ''] = path.split('?')
  const params = new URLSearchParams(search)
  params.set('from', from)
  if (transferContext) params.set('context', 'transfer')
  return `${pathname}?${params}`
}

export interface TransferTreeNode { title: string; value: number; disabled?: boolean; children?: TransferTreeNode[] }
export function buildTransferTree<T extends { id: number; parentId?: number | null; name: string }>(
  list: T[], disabled?: (item: T) => boolean,
): TransferTreeNode[] {
  const nodes = new Map(list.map(item => [item.id, {
    title: item.name, value: item.id, disabled: disabled?.(item), children: [] as TransferTreeNode[],
  }]))
  const roots: TransferTreeNode[] = []
  for (const item of list) {
    const node = nodes.get(item.id)!
    const visited = new Set([item.id])
    let parentId = item.parentId
    let cyclic = false
    while (parentId && nodes.has(parentId)) {
      if (visited.has(parentId)) { cyclic = true; break }
      visited.add(parentId)
      parentId = list.find(parent => parent.id === parentId)?.parentId
    }
    const parent = !cyclic && item.parentId ? nodes.get(item.parentId) : undefined
    if (parent) parent.children.push(node)
    else roots.push(node)
  }
  return roots
}

export function formatTransferUser(name?: string | null, empId?: string | null): string {
  return name ? (empId ? `${name} (${empId})` : name) : '—'
}

export function updateQuery(params: URLSearchParams, prefix: string, values: Record<string, string | number | undefined>): URLSearchParams {
  const next = new URLSearchParams(params)
  for (const key of [...next.keys()]) if (key.startsWith(`${prefix}.`)) next.delete(key)
  for (const [key, value] of Object.entries(values)) if (value !== undefined && value !== '') next.set(`${prefix}.${key}`, String(value))
  return next
}
