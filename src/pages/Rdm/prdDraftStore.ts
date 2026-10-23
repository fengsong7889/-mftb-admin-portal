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
import { registerSessionCleaner } from '../../utils/sessionCaches'

const PREFIX = 'rdm-prd-draft:v1:'
const TTL_MS = 24 * 60 * 60 * 1000
const MAX_BYTES = 1024 * 1024
const MAX_PER_OWNER = 10

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

function keyOf(owner: string, reqId: number, prdId: number | null): string {
  return `${PREFIX}${owner}:${reqId}:${prdId ?? 'new'}`
}

function byteLength(text: string): number {
  try {
    return new Blob([text]).size
  } catch {
    return text.length * 2
  }
}

function prune(owner: string): void {
  try {
    const prefix = `${PREFIX}${owner}:`
    const alive: { k: string; savedAt: number }[] = []
    const now = Date.now()
    for (let i = 0; i < sessionStorage.length; i++) {
      const k = sessionStorage.key(i)
      if (!k || !k.startsWith(prefix)) continue
      let savedAt = 0
      try {
        savedAt = Number((JSON.parse(sessionStorage.getItem(k) || '{}') as PrdDraftPayload).savedAt ?? 0)
      } catch {
        savedAt = 0
      }
      if (!savedAt || now - savedAt > TTL_MS) {
        sessionStorage.removeItem(k)
        continue
      }
      alive.push({ k, savedAt })
    }
    if (alive.length <= MAX_PER_OWNER) return
    alive.sort((a, b) => a.savedAt - b.savedAt)
    alive.slice(0, alive.length - MAX_PER_OWNER).forEach(item => sessionStorage.removeItem(item.k))
  } catch {
    // 隐私模式/配额异常只影响恢复
  }
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
  owner: string, reqId: number, prdId: number | null, payload: Omit<PrdDraftPayload, 'savedAt'>,
): boolean {
  const serialized = JSON.stringify({ ...payload, savedAt: Date.now() })
  if (byteLength(serialized) > MAX_BYTES) return false
  try {
    sessionStorage.setItem(keyOf(owner, reqId, prdId), serialized)
    prune(owner)
    return true
  } catch {
    return false
  }
}

/** 读取本机暂存：结构不合法、超过 24 小时或跨账号一律视为没有 */
export function loadPrdDraft(owner: string, reqId: number, prdId: number | null): PrdDraftPayload | null {
  try {
    const raw = sessionStorage.getItem(keyOf(owner, reqId, prdId))
    if (!raw) return null
    const parsed = JSON.parse(raw) as PrdDraftPayload
    if (!parsed || typeof parsed.contentRich !== 'string' || typeof parsed.title !== 'string') {
      sessionStorage.removeItem(keyOf(owner, reqId, prdId))
      return null
    }
    if (!Number.isFinite(parsed.savedAt) || Date.now() - parsed.savedAt > TTL_MS) {
      sessionStorage.removeItem(keyOf(owner, reqId, prdId))
      return null
    }
    return parsed
  } catch {
    return null
  }
}

/** 正式保存成功或用户明确放弃后清理 */
export function clearPrdDraft(owner: string, reqId: number, prdId: number | null): void {
  try {
    sessionStorage.removeItem(keyOf(owner, reqId, prdId))
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
