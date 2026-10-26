/**
 * PRD 未保存内容的「本机暂存」。
 *
 * 为什么需要：页面切页签/切页后组件会被整体卸载（见 MenuTabs 挂载模型），
 * 未保存的正文会直接消失；这不是"设计如此"就能接受的行为。
 *
 * 边界（不得扩大）：
 * - 只存 sessionStorage，关闭浏览器/换设备不承诺恢复；
 * - 按「环境 + 登录用户 + 需求 + PRD」隔离，绝不跨账号复用；
 * - 24 小时过期、单条 1MiB、每账号最多 10 条；
 * - 只缓存编辑字段与版本基线，不缓存 token、权限或整页响应；
 * - 正式保存成功才清空；本地暂存不代表服务端已保存。
 */
import { registerSessionCleaner } from '@/utils/sessionCaches'

const PREFIX = 'rdm-prd-draft:v1:'
const TTL_MS = 24 * 60 * 60 * 1000
const MAX_BYTES = 1024 * 1024
const MAX_PER_OWNER = 10
const MAX_TOTAL_BYTES = 3 * 1024 * 1024

export interface PrdDraftPayload {
  title: string
  parentPrdId?: number
  targetUsers: string
  featureList: string
  acceptanceCriteria: string
  prototypeUrl: string
  contentRich: string
  /** 服务端当前行的并发版本（新建时为空），恢复后用于冲突提示 */
  baseRowVersion?: number
  /** 服务端当前行的 updatedAt：恢复时与最新值比较，识别"服务器已变化" */
  baseUpdatedAt?: string | null
  /** 业务文档版本（v1.0 之类），仅用于展示 */
  baseVersionNo?: string | null
  savedAt: number
}

function keyOf(owner: string, reqId: number, prdId: number | null, draftId?: string): string {
  return `${PREFIX}${owner}:${reqId}:${prdId ?? (draftId ? `new:${draftId}` : 'new')}`
}

function byteLength(text: string): number {
  try {
    return new Blob([text]).size
  } catch {
    return text.length * 2
  }
}

/** 只淘汰过期/损坏内容，不能静默删除仍有效的未保存文档。 */
function existingDrafts(owner: string): { key: string; bytes: number }[] {
  const result: { key: string; bytes: number }[] = []
  for (let i = sessionStorage.length - 1; i >= 0; i--) {
    const key = sessionStorage.key(i)
    if (!key?.startsWith(`${PREFIX}${owner}:`)) continue
    const raw = sessionStorage.getItem(key) ?? ''
    let savedAt = 0
    try { savedAt = JSON.parse(raw).savedAt } catch { /* 无效缓存按过期处理 */ }
    if (!Number.isFinite(savedAt) || savedAt <= 0 || savedAt > Date.now() || Date.now() - savedAt > TTL_MS) {
      sessionStorage.removeItem(key)
    } else {
      result.push({ key, bytes: byteLength(raw) })
    }
  }
  return result
}

/** 本机暂存归属：环境 + 登录用户 */
export function prdDraftOwner(userId?: number | null): string {
  const env = (import.meta.env.MODE as string) || 'dev'
  return `${env}:${userId ?? 'anonymous'}`
}

/**
 * 保存本机暂存。
 * @returns true=已写入；false=内容过大或存储不可用（调用方必须提示「暂存失败」，不能假装成功）
 */
export function savePrdDraft(
  owner: string, reqId: number, prdId: number | null, payload: Omit<PrdDraftPayload, 'savedAt'>, draftId?: string,
): boolean {
  const serialized = JSON.stringify({ ...payload, savedAt: Date.now() })
  if (byteLength(serialized) > MAX_BYTES) return false
  try {
    const key = keyOf(owner, reqId, prdId, draftId)
    const other = existingDrafts(owner).filter(item => item.key !== key)
    if (other.length >= MAX_PER_OWNER || other.reduce((sum, item) => sum + item.bytes, 0)
        + byteLength(serialized) > MAX_TOTAL_BYTES) return false
    sessionStorage.setItem(key, serialized)
    return true
  } catch {
    return false
  }
}

/** 读取本机暂存：结构不合法、超过 24 小时或跨账号一律视为没有 */
export function loadPrdDraft(owner: string, reqId: number, prdId: number | null, draftId?: string): PrdDraftPayload | null {
  try {
    const raw = sessionStorage.getItem(keyOf(owner, reqId, prdId, draftId))
    if (!raw) return null
    const parsed = JSON.parse(raw) as PrdDraftPayload
    if (!parsed || typeof parsed.contentRich !== 'string' || typeof parsed.title !== 'string') {
      sessionStorage.removeItem(keyOf(owner, reqId, prdId, draftId))
      return null
    }
    if (byteLength(raw) > MAX_BYTES || !Number.isFinite(parsed.savedAt) || parsed.savedAt > Date.now()
      || Date.now() - parsed.savedAt > TTL_MS
      || ['targetUsers', 'featureList', 'acceptanceCriteria', 'prototypeUrl'].some(field =>
        typeof (parsed as unknown as Record<string, unknown>)[field] !== 'string')
      || (parsed.baseRowVersion != null && (!Number.isSafeInteger(parsed.baseRowVersion) || parsed.baseRowVersion < 0))) {
      sessionStorage.removeItem(keyOf(owner, reqId, prdId, draftId))
      return null
    }
    return parsed
  } catch {
    return null
  }
}

/** 正式保存成功或用户明确放弃后清理 */
export function clearPrdDraft(owner: string, reqId: number, prdId: number | null, draftId?: string): void {
  try {
    sessionStorage.removeItem(keyOf(owner, reqId, prdId, draftId))
  } catch {
    // 清不掉只会在下次打开时多一次恢复询问
  }
}

/** 登出/登录态失效：清掉全部 PRD 暂存，避免下一个账号看到上一人的正文 */
export function clearAllPrdDrafts(): void {
  try {
    const keys: string[] = []
    for (let i = 0; i < sessionStorage.length; i++) {
      const k = sessionStorage.key(i)
      if (k && k.startsWith(PREFIX)) keys.push(k)
    }
    keys.forEach(k => sessionStorage.removeItem(k))
  } catch {
    // 同上，不影响登出主流程
  }
}

registerSessionCleaner(clearAllPrdDrafts)
