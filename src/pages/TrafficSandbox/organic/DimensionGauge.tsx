/**
 * Copyright (c) 2026 fengsong7889. All Rights Reserved.
 *
 * 本文件为「MFTB 企业一体化管理平台软件」的组成部分。
 * 未经著作权人书面许可，不得使用、复制、修改、再分发或用于任何商业目的。
 * 完整许可条款见仓库根目录 LICENSE 文件。
 */
import { useEffect, useState } from 'react'

interface GaugeProps { label: string; color: string; score?: number | null; max: number }

/**
 * 维度得分仪表盘：复刻「搜索系统-搜索校验」详情页的圆形表盘样式
 * （-60°~240° 刻度盘 + 渐变弧 + 指针缓动动画 + 顶部得分框），供自然流量沙盘演示使用。
 */
export default function DimensionGauge({ label, color, score, max }: GaugeProps) {
  const pct = max > 0 && score != null ? Math.min(Math.max((score / max) * 100, 0), 100) : 0
  const [animatedPct, setAnimatedPct] = useState(0)
  const [animatedAngle, setAnimatedAngle] = useState(-60)
  useEffect(() => {
    const timer = setTimeout(() => {
      const startAngle = -60
      const targetAngle = startAngle + (300 * pct) / 100
      const duration = 3000
      const startTime = Date.now()
      const animate = () => {
        const progress = Math.min((Date.now() - startTime) / duration, 1)
        const ease = 1 - Math.pow(1 - progress, 3)
        setAnimatedAngle(startAngle + (targetAngle - startAngle) * ease)
        setAnimatedPct(pct * ease)
        if (progress < 1) requestAnimationFrame(animate)
      }
      requestAnimationFrame(animate)
    }, 300)
    return () => clearTimeout(timer)
  }, [pct])
  const size = 160
  const centerX = size / 2
  const centerY = size / 2
  const radius = 65
  const startAngle = -60
  const totalAngle = 300
  const polar = (r: number, angleDeg: number) => {
    const rad = (angleDeg * Math.PI) / 180
    return { x: centerX + r * Math.cos(rad), y: centerY + r * Math.sin(rad) }
  }
  const arcPath = (end: number) => {
    const r = radius - 2
    const startPt = polar(r, end)
    const endPt = polar(r, startAngle)
    return `M ${startPt.x} ${startPt.y} A ${r} ${r} 0 ${end - startAngle <= 180 ? 0 : 1} 0 ${endPt.x} ${endPt.y}`
  }
  const gradId = `organic-gauge-${label.replace(/\s/g, '')}`
  const ticks = []
  for (let i = 0; i <= 100; i += 10) {
    const angle = startAngle + (totalAngle * i) / 100
    const inner = polar(radius - 10, angle)
    const outer = polar(radius - 2, angle)
    ticks.push(<line key={i} x1={inner.x} y1={inner.y} x2={outer.x} y2={outer.y} stroke={i <= animatedPct ? color : '#d9d9d9'} strokeWidth={2} strokeLinecap="round" />)
  }
  return <div className="organic__gauge" aria-label={`${label}儀表盤`}>
    <div className="organic__gauge-title">{label}</div>
    <div className="organic__gauge-dial">
      <svg width={size} height={size} aria-hidden>
        <defs>
          <linearGradient id={gradId} x1="0%" y1="50%" x2="100%" y2="50%">
            <stop offset="0%" style={{ stopColor: color, stopOpacity: 0.2 }} />
            <stop offset="100%" style={{ stopColor: color, stopOpacity: 1 }} />
          </linearGradient>
        </defs>
        {/* 底盘走 --surface-2：盘内前景（弧、指针、内圈、中心点）全部用传入的语义色 color，
            没有深色线条，所以白底换深底不会让任何零件消失；
            反而未达标刻度的 #d9d9d9 在白底上只有 1.2:1（几乎看不见），换深底后升到约 6.5:1。 */}
        <circle cx={centerX} cy={centerY} r={radius} fill="var(--surface-2)" stroke="#e8e8e8" strokeWidth={2} />
        {animatedPct > 0 && <path d={arcPath(animatedAngle)} fill="none" stroke={`url(#${gradId})`} strokeWidth={8} strokeLinecap="round" />}
        {ticks}
        {/* 指针：按 0° 方向画标准锥形后整体绕圆心旋转；固定底边三角形在竖直方向会与顶点共线退化成细针 */}
        <g transform={`rotate(${animatedAngle} ${centerX} ${centerY})`} style={{ filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.2))' }}>
          <polygon points={`${centerX + radius - 18},${centerY} ${centerX - 9},${centerY - 4.5} ${centerX - 9},${centerY + 4.5}`} fill={color} />
          <line x1={centerX - 9} y1={centerY} x2={centerX - 17} y2={centerY} stroke={color} strokeWidth={3} strokeLinecap="round" />
        </g>
        <circle cx={centerX} cy={centerY} r={12} fill="var(--surface-1)" stroke="var(--border-1)" strokeWidth={1.5} />
        <circle cx={centerX} cy={centerY} r={7} fill={color} />
        {/* 中心白点保持白色：它紧贴在外圈 fill={color} 的饱和色上，与插画对勾同理，
            改成令牌色反而会让它在彩色底上消失。 */}
        <circle cx={centerX} cy={centerY} r={3.5} fill="#fff" />
      </svg>
      {/* 满分不可控（演示配置合计），得分框只展示当前分 */}
      <div className="organic__gauge-score" style={{ borderColor: color }}>
        <b style={{ color }}>{score == null ? '—' : score.toFixed(1)}</b>
      </div>
    </div>
  </div>
}
