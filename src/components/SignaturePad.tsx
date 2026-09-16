/**
 * Canvas 手写签名组件
 *
 * 使用原生 Pointer Events 实现跨设备（鼠标/触控/笔）签名采集。
 * 不依赖第三方库，纯 React + Canvas 2D API。
 */
import { useCallback, useEffect, useRef, useState } from 'react'

export interface SignaturePadProps {
  /** 画布宽度（px），默认 600 */
  width?: number
  /** 画布高度（px），默认 200 */
  height?: number
  /** 笔画颜色，默认 '#262626' */
  penColor?: string
  /** 笔画宽度，默认 2 */
  penWidth?: number
  /** 背景色，默认 '#FFFFFF' */
  backgroundColor?: string
  /** 签名变更回调（Data URL PNG） */
  onChange?: (dataUrl: string | null) => void
  /** 是否禁用 */
  disabled?: boolean
  /** 自定义 className */
  className?: string
}

export interface SignaturePadRef {
  /** 清除签名 */
  clear: () => void
  /** 导出 Data URL（PNG） */
  toDataURL: () => string | null
  /** 是否有内容 */
  isEmpty: () => boolean
}

export function SignaturePad({
  width = 600,
  height = 200,
  penColor = '#262626',
  penWidth = 2,
  backgroundColor = '#FFFFFF',
  onChange,
  disabled = false,
  className,
}: SignaturePadProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const isDrawingRef = useRef(false)
  const lastPointRef = useRef<{ x: number; y: number } | null>(null)
  const [hasContent, setHasContent] = useState(false)

  // 初始化画布
  const initCanvas = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.fillStyle = backgroundColor
    ctx.fillRect(0, 0, width, height)
    setHasContent(false)
  }, [width, height, backgroundColor])

  useEffect(() => {
    initCanvas()
  }, [initCanvas])

  // 获取相对坐标
  const getPoint = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    if (!canvas) return null
    const rect = canvas.getBoundingClientRect()
    const scaleX = canvas.width / rect.width
    const scaleY = canvas.height / rect.height
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    }
  }, [])

  // 绘制线段（平滑贝塞尔曲线）
  const drawLine = useCallback((from: { x: number; y: number }, to: { x: number; y: number }) => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.beginPath()
    ctx.moveTo(from.x, from.y)
    // 使用二次贝塞尔曲线使笔画更平滑
    const midX = (from.x + to.x) / 2
    const midY = (from.y + to.y) / 2
    ctx.quadraticCurveTo(from.x, from.y, midX, midY)
    ctx.lineTo(to.x, to.y)
    ctx.strokeStyle = penColor
    ctx.lineWidth = penWidth
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.stroke()
  }, [penColor, penWidth])

  // Pointer 事件处理
  const handlePointerDown = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    if (disabled) return
    e.preventDefault()
    const canvas = canvasRef.current
    if (!canvas) return
    canvas.setPointerCapture(e.pointerId)
    isDrawingRef.current = true
    const point = getPoint(e)
    if (point) {
      lastPointRef.current = point
      // 画一个点
      const ctx = canvas.getContext('2d')
      if (ctx) {
        ctx.beginPath()
        ctx.arc(point.x, point.y, penWidth / 2, 0, Math.PI * 2)
        ctx.fillStyle = penColor
        ctx.fill()
      }
      setHasContent(true)
    }
  }, [disabled, getPoint, penColor, penWidth])

  const handlePointerMove = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDrawingRef.current || disabled) return
    e.preventDefault()
    const point = getPoint(e)
    if (!point || !lastPointRef.current) return
    drawLine(lastPointRef.current, point)
    lastPointRef.current = point
  }, [disabled, getPoint, drawLine])

  const handlePointerUp = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDrawingRef.current) return
    e.preventDefault()
    isDrawingRef.current = false
    lastPointRef.current = null
    // 触发 onChange
    if (onChange) {
      const canvas = canvasRef.current
      if (canvas) {
        onChange(canvas.toDataURL('image/png'))
      }
    }
  }, [onChange])

  // 公开方法
  const clear = useCallback(() => {
    initCanvas()
    if (onChange) onChange(null)
  }, [initCanvas, onChange])

  const toDataURL = useCallback(() => {
    const canvas = canvasRef.current
    return canvas ? canvas.toDataURL('image/png') : null
  }, [])

  const isEmpty = useCallback(() => !hasContent, [hasContent])

  // 暴露 ref 方法（通过自定义属性）
  const containerRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = containerRef.current
    if (el) {
      (el as unknown as Record<string, unknown>).clear = clear
      ;(el as unknown as Record<string, unknown>).toDataURL = toDataURL
      ;(el as unknown as Record<string, unknown>).isEmpty = isEmpty
    }
  }, [clear, toDataURL, isEmpty])

  return (
    <div
      ref={containerRef}
      className={className}
      style={{
        position: 'relative',
        border: '1px solid #d9d9d9',
        borderRadius: 8,
        overflow: 'hidden',
        background: backgroundColor,
        touchAction: 'none', // 禁止浏览器默认触控行为
      }}
    >
      <canvas
        ref={canvasRef}
        width={width}
        height={height}
        style={{
          display: 'block',
          width: '100%',
          height: height,
          cursor: disabled ? 'not-allowed' : 'crosshair',
        }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
      />
      {/* 清除按钮 */}
      {!disabled && hasContent && (
        <button
          type="button"
          onClick={clear}
          style={{
            position: 'absolute',
            top: 8,
            right: 8,
            padding: '2px 10px',
            fontSize: 12,
            color: '#8c8c8c',
            background: 'rgba(255,255,255,0.85)',
            border: '1px solid #d9d9d9',
            borderRadius: 4,
            cursor: 'pointer',
          }}
        >
          清除
        </button>
      )}
      {/* 占位提示 */}
      {!hasContent && !disabled && (
        <div
          style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            color: '#bfbfbf',
            fontSize: 14,
            pointerEvents: 'none',
            userSelect: 'none',
          }}
        >
          请在此处手写签名
        </div>
      )}
    </div>
  )
}

export default SignaturePad
