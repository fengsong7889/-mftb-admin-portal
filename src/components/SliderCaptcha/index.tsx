import React, { useEffect, useRef, useState } from 'react'
import {
  CheckOutlined,
  CloseOutlined,
  DoubleRightOutlined,
  ReloadOutlined,
  SafetyCertificateOutlined,
} from '@ant-design/icons'

interface SliderCaptchaProps {
  /** 验证通过回调（延迟 600ms 触发，便于展示成功态） */
  onSuccess: () => void
  /** 关闭回调 */
  onClose: () => void
}

/* ---- 拼图参数 ---- */
const CANVAS_W = 320
const CANVAS_H = 160
const PIECE = 40        // 拼图块边长
const KNOB = 7          // 凸起半径
const PW = PIECE + KNOB // 拼图画布宽（含右侧凸起）
const PH = PIECE + KNOB // 拼图画布高（含顶部凸起）
const TOLERANCE = 5     // 对齐容差(px)
const HANDLE_W = 44
const SLIDER_MAX = CANVAS_W - HANDLE_W

type Status = 'idle' | 'dragging' | 'success' | 'fail'

/** 拼图路径（方形 + 顶部/右侧圆形凸起），绘制于 (x, y) 左上角 */
function drawPiecePath(ctx: CanvasRenderingContext2D, x: number, y: number) {
  const s = PIECE
  const r = KNOB
  ctx.beginPath()
  ctx.moveTo(x, y)
  ctx.lineTo(x + s / 2 - r, y)
  ctx.arc(x + s / 2, y, r, Math.PI, 0, false)                    // 顶部凸起
  ctx.lineTo(x + s, y)
  ctx.lineTo(x + s, y + s / 2 - r)
  ctx.arc(x + s, y + s / 2, r, -Math.PI / 2, Math.PI / 2, false) // 右侧凸起
  ctx.lineTo(x + s, y + s)
  ctx.lineTo(x, y + s)
  ctx.closePath()
}

/** 生成随机渐变纹理背景（每次验证图案不同） */
function drawBackground(ctx: CanvasRenderingContext2D) {
  const hue1 = Math.floor(Math.random() * 360)
  const hue2 = (hue1 + 80 + Math.floor(Math.random() * 120)) % 360
  const gradient = ctx.createLinearGradient(0, 0, CANVAS_W, CANVAS_H)
  gradient.addColorStop(0, `hsl(${hue1}, 72%, 56%)`)
  gradient.addColorStop(1, `hsl(${hue2}, 76%, 44%)`)
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H)

  // 随机圆形纹理
  for (let i = 0; i < 8; i++) {
    ctx.beginPath()
    ctx.arc(Math.random() * CANVAS_W, Math.random() * CANVAS_H, 12 + Math.random() * 30, 0, Math.PI * 2)
    ctx.fillStyle = `hsla(${Math.floor(Math.random() * 360)}, 82%, 72%, 0.16)`
    ctx.fill()
  }
  // 随机线条纹理
  for (let i = 0; i < 5; i++) {
    ctx.beginPath()
    ctx.moveTo(Math.random() * CANVAS_W, Math.random() * CANVAS_H)
    ctx.lineTo(Math.random() * CANVAS_W, Math.random() * CANVAS_H)
    ctx.strokeStyle = `rgba(255, 255, 255, ${0.08 + Math.random() * 0.1})`
    ctx.lineWidth = 1 + Math.random() * 2
    ctx.stroke()
  }
}

/**
 * 滑块拼图验证码（第一阶段：纯前端实现）
 * TODO(第二阶段): 接入后端 captchaToken 签发与校验，防止绕过前端直接刷接口
 */
export default function SliderCaptcha({ onSuccess, onClose }: SliderCaptchaProps) {
  const bgRef = useRef<HTMLCanvasElement>(null)
  const pieceRef = useRef<HTMLCanvasElement>(null)
  const dragStartX = useRef<number | null>(null)

  const [seed, setSeed] = useState(0)
  const [cutX, setCutX] = useState(0)
  const [cutY, setCutY] = useState(0)
  const [sliderX, setSliderX] = useState(0)
  const [status, setStatus] = useState<Status>('idle')

  /** 生成/刷新拼图 */
  useEffect(() => {
    const bgCanvas = bgRef.current
    const pieceCanvas = pieceRef.current
    if (!bgCanvas || !pieceCanvas) return
    const dpr = window.devicePixelRatio || 1

    // 随机缺口位置（保证滑块可达范围内）
    const x = Math.round(70 + Math.random() * (SLIDER_MAX - 80))
    const y = Math.round(14 + Math.random() * (CANVAS_H - PH - 24))
    setCutX(x)
    setCutY(y)
    setSliderX(0)
    setStatus('idle')

    /* 背景画布（按 devicePixelRatio 放大保证清晰度） */
    bgCanvas.width = CANVAS_W * dpr
    bgCanvas.height = CANVAS_H * dpr
    const bg = bgCanvas.getContext('2d')
    if (!bg) return
    bg.setTransform(dpr, 0, 0, dpr, 0, 0)
    drawBackground(bg)

    /* 拼图块：从背景裁剪对应区域（必须先于缺口绘制） */
    pieceCanvas.width = PW * dpr
    pieceCanvas.height = PH * dpr
    const piece = pieceCanvas.getContext('2d')
    if (!piece) return
    piece.setTransform(dpr, 0, 0, dpr, 0, 0)
    piece.save()
    drawPiecePath(piece, 0, KNOB)
    piece.clip()
    piece.drawImage(bgCanvas, x * dpr, (y - KNOB) * dpr, PW * dpr, PH * dpr, 0, 0, PW, PH)
    piece.restore()
    drawPiecePath(piece, 0, KNOB)
    piece.strokeStyle = 'rgba(255, 255, 255, 0.9)'
    piece.lineWidth = 1.5
    piece.stroke()

    /* 缺口（半透明暗色 + 白描边） */
    drawPiecePath(bg, x, y)
    bg.fillStyle = 'rgba(0, 0, 0, 0.35)'
    bg.fill()
    bg.strokeStyle = 'rgba(255, 255, 255, 0.7)'
    bg.lineWidth = 1.5
    bg.stroke()
  }, [seed])

  /** 拖动开始 */
  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (status === 'success') return
    e.preventDefault()
    dragStartX.current = e.clientX - sliderX
    setStatus('dragging')
    e.currentTarget.setPointerCapture(e.pointerId)
  }

  /** 拖动中 */
  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (dragStartX.current === null) return
    const next = Math.min(Math.max(e.clientX - dragStartX.current, 0), SLIDER_MAX)
    setSliderX(next)
  }

  /** 拖动结束 → 校验对齐 */
  const handlePointerUp = () => {
    if (dragStartX.current === null) return
    dragStartX.current = null
    if (status === 'success') return
    if (Math.abs(sliderX - cutX) <= TOLERANCE) {
      setSliderX(cutX)
      setStatus('success')
      setTimeout(onSuccess, 600)
    } else {
      setStatus('fail')
      // 失败抖动提示后自动刷新拼图
      setTimeout(() => setSeed(s => s + 1), 450)
    }
  }

  /** 换一张 */
  const refresh = () => {
    if (status === 'success') return
    setSeed(s => s + 1)
  }

  return (
    <div className="slider-captcha">
      {/* 标题栏 */}
      <div className="slider-captcha-header">
        <span className="slider-captcha-title">
          <SafetyCertificateOutlined style={{ color: '#E8720C' }} />
          安全驗證
        </span>
        <div className="slider-captcha-header-actions">
          <button type="button" className="slider-captcha-icon-btn" onClick={refresh} title="換一張">
            <ReloadOutlined />
          </button>
          <button type="button" className="slider-captcha-icon-btn" onClick={onClose} title="關閉">
            <CloseOutlined />
          </button>
        </div>
      </div>

      {/* 拼图区 */}
      <div className={`slider-captcha-canvas-wrap${status === 'fail' ? ' is-fail' : ''}`}>
        <canvas ref={bgRef} className="slider-captcha-bg" />
        <canvas
          ref={pieceRef}
          className="slider-captcha-piece"
          style={{
            left: sliderX,
            top: cutY - KNOB,
            transition: status === 'dragging' ? 'none' : 'left 0.25s ease',
          }}
        />
      </div>

      {/* 滑块轨道 */}
      <div className={`slider-captcha-track is-${status}`}>
        <div className="slider-captcha-fill" style={{ width: sliderX + HANDLE_W }} />
        <span className="slider-captcha-tip">
          {status === 'success' ? '驗證通過' : status === 'fail' ? '未對齊，請重試' : '按住滑塊向右拖動完成拼圖'}
        </span>
        <div
          className="slider-captcha-handle"
          style={{ left: sliderX, transition: status === 'dragging' ? 'none' : 'left 0.25s ease' }}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
        >
          {status === 'success' ? <CheckOutlined /> : status === 'fail' ? <CloseOutlined /> : <DoubleRightOutlined />}
        </div>
      </div>
    </div>
  )
}
