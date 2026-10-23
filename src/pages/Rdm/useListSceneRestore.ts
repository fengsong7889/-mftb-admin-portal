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
 * 实现取舍：
 * - 模块级 Map 让同一次会话内的返回零延迟命中；
 * - sessionStorage 兜住页面刷新（关闭标签页即失效，不污染长期偏好）；
 * - 滚动位置单独存，不参与筛选快照比较，避免「滚动一下就重算列表」。
 */
import { useEffect, useLayoutEffect, useRef } from 'react'

/** 列表场景快照 */
export interface RdmListScene<F = Record<string, unknown>> {
  page: number
  size: number
  filters: F
  scrollTop: number
}

const KEY_PREFIX = 'rdm-list-scene:'
const memory = new Map<string, RdmListScene>()

/** 页面滚动容器（App.css 中 .app-content 是唯一的纵向滚动区，window 本身不滚） */
function scrollContainer(): HTMLElement | null {
  return document.querySelector<HTMLElement>('.app-content')
}

/** 读取场景快照：内存优先，其次 sessionStorage；解析失败按没有处理 */
export function readRdmListScene<F>(key: string): RdmListScene<F> | null {
  const cached = memory.get(key)
  if (cached) return cached as RdmListScene<F>
  try {
    const raw = sessionStorage.getItem(KEY_PREFIX + key)
    if (!raw) return null
    const parsed = JSON.parse(raw) as RdmListScene<F>
    if (!parsed || typeof parsed.page !== 'number' || typeof parsed.size !== 'number') return null
    memory.set(key, parsed as RdmListScene)
    return parsed
  } catch {
    return null
  }
}

/** 写入场景快照（合并式：只传要改的字段，滚动位置不会被筛选变更覆盖） */
export function writeRdmListScene<F>(key: string, patch: Partial<RdmListScene<F>>): void {
  const prev = memory.get(key) ?? { page: 1, size: 10, filters: {}, scrollTop: 0 }
  const next = { ...prev, ...patch } as RdmListScene
  memory.set(key, next)
  try {
    sessionStorage.setItem(KEY_PREFIX + key, JSON.stringify(next))
  } catch {
    // 配额满/隐私模式只影响刷新后的还原，不该阻断列表本身
  }
}

/**
 * 持续记录列表场景：page/size/filters 变化即落盘，滚动位置在离开页面时补齐。
 * @param key 场景键（同一张页面不同视角应使用不同 key）
 * @param scene 当前场景（不含 scrollTop）
 */
export function useRdmListScene<F>(
  key: string,
  scene: { page: number; size: number; filters: F },
  /** 本页路由 pathname：用于识别「容器归零是路由切换造成的，不是用户滚动」 */
  pathname: string,
): void {
  const latest = useRef(scene)
  latest.current = scene
  /** 最近一次滚动位置：路由切换时 App 会先把容器 scrollTop 归零，卸载清理读到的已是 0 */
  const latestScroll = useRef(0)
  const pathRef = useRef(pathname)
  pathRef.current = pathname

  useEffect(() => {
    writeRdmListScene(key, latest.current)
  }, [key, scene.page, scene.size, scene.filters])

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
        // App.tsx 在 pathname 变化时会把 .app-content 归零；那一帧 hash 已指向新页面，
        // 不能把它当成用户的滚动位置记下来（否则返回时永远回到顶部）
        if (!window.location.hash.startsWith(`#${pathRef.current}`)) return
        latestScroll.current = el.scrollTop
        writeRdmListScene(key, { ...latest.current, scrollTop: latestScroll.current })
      })
    }
    el.addEventListener('scroll', onScroll, { passive: true })

    return () => {
      el.removeEventListener('scroll', onScroll)
      // 用滚动过程中记下的值，而不是此刻的 DOM 值（此刻可能已被路由复位成 0）
      writeRdmListScene(key, { ...latest.current, scrollTop: latestScroll.current })
    }
  }, [key])
}

/**
 * 数据就绪后还原滚动位置，只还原一次（切换筛选不应把用户拽回旧位置）。
 * @param ready 列表数据是否已渲染（loading=false 且行已就位）
 * @param initialScrollTop 组件挂载那一刻读到的位置。
 *        <p>必须由调用方在 mount 时快照传入：返回列表时 App 会先把容器归零并触发一次
 *        scroll 事件，等本 hook 真正执行时快照里的值可能已被写成 0。
 */
export function useRdmScrollRestore(key: string, ready: boolean, initialScrollTop?: number): void {
  const restored = useRef(false)
  useLayoutEffect(() => {
    if (!ready || restored.current) return
    const top = initialScrollTop ?? readRdmListScene(key)?.scrollTop ?? 0
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
      if (box && Math.abs(box.scrollTop - top) > 4) box.scrollTop = top
    })
  }, [key, ready, initialScrollTop])
}
