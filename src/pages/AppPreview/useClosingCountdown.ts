/**
 * Copyright (c) 2026 fengsong7889. All Rights Reserved.
 *
 * 本文件为「MFTB 企业一体化管理平台软件」的组成部分。
 * 未经著作权人书面许可，不得使用、复制、修改、再分发或用于任何商业目的。
 * 完整许可条款见仓库根目录 LICENSE 文件。
 */

/**
 * 打烊倒计时 hook（閃蜂 / MFOOD 外卖瀑布流卡片共用，No.19）
 *
 * 把 mock 的初始倒计时（HH:MM:SS）解析为秒数后每秒真实递减：
 * - 归零返回 expired=true，卡片据此隐藏标签（到达打烊时刻）；
 * - 状态挂在卡片组件内：切分类、切换页面、刷新浏览器都会卸载重挂，自动重置为初始值；
 * - 初始串非法（空/格式错）按 0 处理 → expired=true，无字段商家不渲染标签。
 */
import { useEffect, useState } from 'react'

/** 'HH:MM:SS' → 总秒数；非法输入按 0 */
function parseHms(value: string): number {
  const [h, m, s] = value.split(':').map(Number)
  if (!Number.isFinite(h) || !Number.isFinite(m) || !Number.isFinite(s)) return 0
  return (h || 0) * 3600 + (m || 0) * 60 + (s || 0)
}

/** 总秒数 → 'HH:MM:SS'（补零） */
function formatHms(total: number): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(Math.floor(total / 3600))}:${pad(Math.floor((total % 3600) / 60))}:${pad(total % 60)}`
}

export function useClosingCountdown(initial: string) {
  const [remain, setRemain] = useState(() => parseHms(initial))
  useEffect(() => {
    // 归零后 setRemain(0) 与当前值相同，React 跳过重渲染，interval 空转无害；卸载时清理
    const timer = setInterval(() => setRemain((prev) => (prev <= 1 ? 0 : prev - 1)), 1000)
    return () => clearInterval(timer)
  }, [])
  return { display: formatHms(remain), expired: remain <= 0 }
}
