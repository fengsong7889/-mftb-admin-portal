/**
 * Copyright (c) 2026 fengsong7889. All Rights Reserved.
 *
 * 本文件为「MFTB 企业一体化管理平台软件」的组成部分。
 * 未经著作权人书面许可，不得使用、复制、修改、再分发或用于任何商业目的。
 * 完整许可条款见仓库根目录 LICENSE 文件。
 */

import { useEffect, useState } from 'react'

/**
 * 窄屏判定：与 antd 的 `lg` 断点下沿对齐（< 992px 视为窄屏）。
 *
 * <p>为什么用 991.98px 而不是 768px：antd 栅格与 Sider 的 `lg` 断点就是 992，
 * 两套阈值不一致会出现"栅格已经降级成单列、侧栏还占着 220px"的中间态——
 * 2026-11-06 会议模块 E2E 实测就是这个中间态：390px 视口下内容区只剩 132px，
 * 表单 input 实测宽度 1px、底部主操作按钮被裁到屏幕外不可达。
 */
export const NARROW_SCREEN_QUERY = '(max-width: 991.98px)'

/** 当前视口是否属于窄屏；无 matchMedia（SSR / 老 jsdom）时按宽屏处理，不得抛错 */
export function isNarrowScreen(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false
  return window.matchMedia(NARROW_SCREEN_QUERY).matches
}

/**
 * 订阅窄屏状态变化。
 *
 * <p>调用方拿到的只是一个布尔值，**不要**拿它直接强制 `collapsed`：
 * 那样用户在窄屏上手动展开侧栏会被立刻打回。正确用法是「跨越断点时跟随收/放一次」
 * （见 src/App.tsx 的 AuthenticatedLayout），断点之内仍由用户手动控制。
 */
export function useNarrowScreen(): boolean {
  const [narrow, setNarrow] = useState(isNarrowScreen)

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return
    const mql = window.matchMedia(NARROW_SCREEN_QUERY)
    const onChange = (event: MediaQueryListEvent) => setNarrow(event.matches)
    // addEventListener 是标准接口，addListener 是给老 Safari 兜底：
    // 少一路就会在部分机型上"转屏后侧栏不收起"
    if (typeof mql.addEventListener === 'function') {
      mql.addEventListener('change', onChange)
      return () => mql.removeEventListener('change', onChange)
    }
    mql.addListener(onChange)
    return () => mql.removeListener(onChange)
  }, [])

  return narrow
}
