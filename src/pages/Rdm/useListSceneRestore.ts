/**
 * RDM 列表「原位置返回」支撑：页码 / 每页条数 / 筛选条件 / 滚动位置。
 *
 * 为什么需要：需求清单、项目总览都是「列表 → 详情 → 返回」的高频动线，
 * 返回时组件重新挂载，页码和筛选会回到初始值、滚动条回到顶部，
 * 用户要在上千条里重新定位。React Router 不会替我们保留组件 state。
 *
 * 为什么不塞进 URL：需求清单筛选有 12 个字段（含项目/迭代/部门），
 * 全量写进 query 会让链接长到无法分享，也会和「切换视角」的 scope 参数互相干扰；
 * 项目总览已经把条件写进 URL，这里只补它缺的滚动位置。
 *
 * 存储隔离（必须）：key 里带登录用户与环境标识。否则同一浏览器先后登录两个人时，
 * B 会继承 A 的筛选条件和滚动位置，既像数据错乱，也可能把 A 的查询条件带进 B 的可见范围判断。
 *
 * 实现取舍：
 * - 模块级 Map 让同一次会话内的返回零延迟命中；
 * - sessionStorage 兜住页面刷新（关闭标签页即失效，不污染长期偏好）；
 * - 滚动位置单独存，不参与筛选快照比较，避免「滚动一下就重算列表」；
 * - TTL 24 小时 + 每账号最多 50 个场景，防止长期积累与陈旧位置反复出现。
 */
import { useEffect, useLayoutEffect, useRef } from 'react'
import { registerSessionCleaner } from '../../utils/sessionCaches'

/** 列表场景快照 */
export interface RdmListScene<F = Record<string, unknown>> {
  page: number
  size: number
  filters: F
  scrollTop: number
  /** 落盘时间（毫秒），用于 TTL 与 LRU 清理 */
  savedAt: number
}

const KEY_PREFIX = 'rdm-list-scene:'
const TTL_MS = 24 * 60 * 60 * 1000
const MAX_SCENES_PER_OWNER = 50
const ALLOWED_SIZES = [10, 20, 50, 100]
const memory = new Map<string, RdmListScene>()

/** 默认归属：未登录/测试环境按匿名处理，避免与真实用户共享 key */
const ANON_OWNER = 'anonymous'

/**
 * 场景归属标识：环境 + 登录用户。
 * <p>只带 userId 不够：同一浏览器在 dev/prod 之间切换会串位置；
 * 只带环境不够：换账号会继承上一个人的筛选。
 */
export function rdmSceneOwner(userId?: number | null): string {
  const env = (import.meta.env.MODE as string) || 'dev'
  return `${env}:${userId ?? ANON_OWNER}`
}

function storageKey(owner: string, key: string): string {
  return `${KEY_PREFIX}${owner}:${key}`
}

/** 页面滚动容器（App.css 中 .app-content 是唯一的纵向滚动区，window 本身不滚） */
function scrollContainer(): HTMLElement | null {
  return document.querySelector<HTMLElement>('.app-content')
}

/** 当前 hash 的 pathname 部分（HashRouter 下 window.location.pathname 恒为 /） */
function currentHashPath(): string {
  const hash = window.location.hash || ''
  const path = hash.startsWith('#') ? hash.slice(1) : hash
  return path.split('?')[0]
}

function isValidScene(value: unknown): value is RdmListScene {
  if (!value || typeof value !== 'object') return false
  const scene = value as Partial<RdmListScene>
  if (!Number.isInteger(scene.page) || (scene.page as number) < 1) return false
  if (!ALLOWED_SIZES.includes(Number(scene.size))) return false
  if (typeof scene.scrollTop !== 'number' || !Number.isFinite(scene.scrollTop) || scene.scrollTop < 0) return false
  if (!scene.filters || typeof scene.filters !== 'object' || Array.isArray(scene.filters)) return false
  return true
}

/** 清理同一归属下过期或超量的场景（按 savedAt 保留最近的 N 个） */
function prune(owner: string): void {
  try {
    const prefix = `${KEY_PREFIX}${owner}:`
    const now = Date.now()
    const alive: { storageKey: string; savedAt: number }[] = []
    for (let i = 0; i < sessionStorage.length; i++) {
      const k = sessionStorage.key(i)
      if (!k || !k.startsWith(prefix)) continue
      let savedAt = 0
      try {
        savedAt = Number((JSON.parse(sessionStorage.getItem(k) || '{}') as { savedAt?: number }).savedAt ?? 0)
      } catch {
        savedAt = 0
      }
      if (!savedAt || now - savedAt > TTL_MS) {
        sessionStorage.removeItem(k)
        memory.delete(k.slice(KEY_PREFIX.length))
        continue
      }
      alive.push({ storageKey: k, savedAt })
    }
    if (alive.length <= MAX_SCENES_PER_OWNER) return
    alive.sort((a, b) => a.savedAt - b.savedAt)
    for (const item of alive.slice(0, alive.length - MAX_SCENES_PER_OWNER)) {
      sessionStorage.removeItem(item.storageKey)
      memory.delete(item.storageKey.slice(KEY_PREFIX.length))
    }
  } catch {
    // 隐私模式/配额异常只影响还原，不阻断列表
  }
}

/** 读取场景快照：内存优先，其次 sessionStorage；结构不合法或已过期按没有处理 */
export function readRdmListScene<F>(key: string, owner: string = ANON_OWNER): RdmListScene<F> | null {
  const fullKey = `${owner}:${key}`
  const cached = memory.get(fullKey)
  if (cached && Date.now() - cached.savedAt <= TTL_MS) return cached as RdmListScene<F>
  if (cached) memory.delete(fullKey)
  try {
    const raw = sessionStorage.getItem(storageKey(owner, key))
    if (!raw) return null
    const parsed = JSON.parse(raw) as RdmListScene<F>
    if (!isValidScene(parsed) || Date.now() - Number(parsed.savedAt ?? 0) > TTL_MS) {
      sessionStorage.removeItem(storageKey(owner, key))
      return null
    }
    memory.set(fullKey, parsed as RdmListScene)
    return parsed
  } catch {
    return null
  }
}

/** 写入场景快照（合并式：只传要改的字段，滚动位置不会被筛选变更覆盖） */
export function writeRdmListScene<F>(key: string, patch: Partial<RdmListScene<F>>, owner: string = ANON_OWNER): void {
  const fullKey = `${owner}:${key}`
  const prev = memory.get(fullKey) ?? { page: 1, size: 10, filters: {}, scrollTop: 0, savedAt: Date.now() }
  const next = { ...prev, ...patch, savedAt: Date.now() } as RdmListScene
  memory.set(fullKey, next)
  try {
    sessionStorage.setItem(storageKey(owner, key), JSON.stringify(next))
    prune(owner)
  } catch {
    // 配额满/隐私模式只影响刷新后的还原，不该阻断列表本身
  }
}

/** 主动登出/账号切换时清空本机场景缓存，避免下一个账号继承上一个人的条件 */
export function clearRdmListScenes(): void {
  memory.clear()
  try {
    const keys: string[] = []
    for (let i = 0; i < sessionStorage.length; i++) {
      const k = sessionStorage.key(i)
      if (k && k.startsWith(KEY_PREFIX)) keys.push(k)
    }
    keys.forEach(k => sessionStorage.removeItem(k))
  } catch {
    // 清不掉只影响下次还原，不影响登录流程
  }
}

// 登出/登录态失效时由 AuthContext 统一触发，避免下一个账号拿到上一人的筛选与位置
registerSessionCleaner(clearRdmListScenes)

/**
 * 持续记录列表场景：page/size/filters 变化即落盘，滚动位置在滚动过程中持续补齐。
 * @param key 场景键（同一张页面不同视角应使用不同 key）
 * @param scene 当前场景（不含 scrollTop）
 * @param pathname 本页路由 pathname：用于识别「容器归零是路由切换造成的，不是用户滚动」
 * @param owner 登录用户与环境标识（由调用方拼装）
 */
export function useRdmListScene<F>(
  key: string,
  scene: { page: number; size: number; filters: F },
  pathname: string,
  owner: string = ANON_OWNER,
): void {
  const latest = useRef(scene)
  latest.current = scene
  /** 最近一次滚动位置：路由切换时 App 会先把容器 scrollTop 归零，卸载清理读到的已是 0 */
  const latestScroll = useRef(0)

  useEffect(() => {
    writeRdmListScene(key, latest.current, owner)
  }, [key, owner, scene.page, scene.size, scene.filters])

  useEffect(() => {
    const el = scrollContainer()
    if (!el) return undefined
    latestScroll.current = el.scrollTop
    let ticking = false
    const onScroll = () => {
      // rAF 节流：滚动事件高频，直接写 sessionStorage 会拖慢滚动
      if (ticking) return
      ticking = true
      requestAnimationFrame(() => {
        ticking = false
        // 精确比较 pathname：startsWith 会把 /rdm-project 与 /rdm-project-detail 混为一谈
        if (currentHashPath() !== pathname) return
        latestScroll.current = el.scrollTop
        writeRdmListScene(key, { ...latest.current, scrollTop: latestScroll.current }, owner)
      })
    }
    el.addEventListener('scroll', onScroll, { passive: true })

    return () => {
      el.removeEventListener('scroll', onScroll)
      // 用滚动过程中记下的值，而不是此刻的 DOM 值（此刻可能已被路由复位成 0）
      writeRdmListScene(key, { ...latest.current, scrollTop: latestScroll.current }, owner)
    }
  }, [key, owner, pathname])
}

/**
 * 数据就绪后还原滚动位置，只还原一次（切换筛选不应把用户拽回旧位置）。
 * @param ready 列表数据是否已渲染（loading=false 且行已就位）
 * @param initialScrollTop 组件挂载那一刻读到的位置。
 *        <p>必须由调用方在 mount 时快照传入：返回列表时 App 会先把容器归零并触发一次
 *        scroll 事件，等本 hook 真正执行时快照里的值可能已被写成 0。
 * @param owner 登录用户与环境标识，必须与写入时一致
 */
export function useRdmScrollRestore(
  key: string,
  ready: boolean,
  initialScrollTop?: number,
  owner: string = ANON_OWNER,
): void {
  const restored = useRef(false)
  useLayoutEffect(() => {
    if (!ready || restored.current) return
    const top = initialScrollTop ?? readRdmListScene(key, owner)?.scrollTop ?? 0
    restored.current = true
    if (top <= 0) return
    /*
     * 在 layout 阶段直接滚：此时表格行已经挂进 DOM、高度可测，滚完才绘制，
     * 用户不会看到「先停在顶部、过几百毫秒才跳过去」。
     */
    const el = scrollContainer()
    if (el) el.scrollTop = top
    // 兜底：万一图片/字体在首帧后撑高内容把位置顶掉，下一帧再校一次
    requestAnimationFrame(() => {
      const box = scrollContainer()
      if (!box) return
      // 数据变少时不能强行拉回旧位置，夹到当前最大可滚范围内
      const max = Math.max(0, box.scrollHeight - box.clientHeight)
      const target = Math.min(top, max)
      if (Math.abs(box.scrollTop - target) > 4) box.scrollTop = target
    })
  }, [key, ready, initialScrollTop, owner])
}
