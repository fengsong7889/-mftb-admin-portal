/**
 * 資產領用簽署頁（釘釘工作通知直達，令牌免登）
 *
 * 入口：釘釘通知中的簽署鏈接（#/asset-claim-sign?token=...）。
 * 令牌為後端 HMAC 簽發（綁定領用單 + 領用人 + 7 天有效期），
 * 頁面憑令牌讀取待簽署領用詳情，Canvas 手寫簽名後提交。
 *
 * 公開頁面：不套後台佈局，移動端優先（釘釘內置瀏覽器打開）。
 */
import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Button, Modal, Result, Spin, message } from 'antd'
import { ClearOutlined, EditOutlined, FileDoneOutlined, SafetyOutlined } from '@ant-design/icons'
import { fetchSignPageDetail, submitSignPageSign, type SignPageClaimDetail } from '../../api/signPage'

/** 頁面狀態機：loading 加載中 / ready 待簽署 / signed 已簽署 / success 提交成功 / invalid 鏈接缺失 / error 加載失敗 */
type PageState = 'loading' | 'ready' | 'signed' | 'success' | 'invalid' | 'error'

/** 簽名板 CSS 高度 */
const CANVAS_HEIGHT = 200

export default function AssetClaimSign() {
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token') || ''

  const [state, setState] = useState<PageState>(token ? 'loading' : 'invalid')
  const [errorMsg, setErrorMsg] = useState('')
  const [claim, setClaim] = useState<SignPageClaimDetail | null>(null)
  const [submitting, setSubmitting] = useState(false)

  /* Canvas 手寫簽名 */
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const wrapRef = useRef<HTMLDivElement | null>(null)
  const drawingRef = useRef(false)
  const hasInkRef = useRef(false)
  const [hasInk, setHasInk] = useState(false)

  /* 憑令牌加載領用詳情 */
  useEffect(() => {
    if (!token) return
    let cancelled = false
    const load = async () => {
      setState('loading')
      try {
        const detail = await fetchSignPageDetail(token)
        if (cancelled) return
        setClaim(detail)
        if (detail.status === 'claimed' || detail.signatureImageUrl) {
          setState('signed')
        } else if (detail.status === 'pending_signature') {
          setState('ready')
        } else {
          setErrorMsg('該領用單當前狀態無需簽署（可能已取消或已歸還）')
          setState('error')
        }
      } catch (e: unknown) {
        if (cancelled) return
        setErrorMsg(e instanceof Error ? e.message : '簽署鏈接無效或已過期')
        setState('error')
      }
    }
    load()
    return () => { cancelled = true }
  }, [token])

  /** 初始化簽名板（高清屏適配；尺寸變化時保留已畫內容） */
  const setupCanvas = () => {
    const canvas = canvasRef.current
    const wrap = wrapRef.current
    if (!canvas || !wrap) return
    const cssWidth = wrap.clientWidth
    if (cssWidth <= 0) return
    const dpr = window.devicePixelRatio || 1
    const prevImage = hasInkRef.current ? canvas.toDataURL() : null
    canvas.width = Math.round(cssWidth * dpr)
    canvas.height = Math.round(CANVAS_HEIGHT * dpr)
    canvas.style.width = `${cssWidth}px`
    canvas.style.height = `${CANVAS_HEIGHT}px`
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.scale(dpr, dpr)
    ctx.lineWidth = 2.5
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.strokeStyle = '#262626'
    if (prevImage) {
      const img = new Image()
      img.onload = () => ctx.drawImage(img, 0, 0, cssWidth, CANVAS_HEIGHT)
      img.src = prevImage
    }
  }

  /* 進入待簽署態後初始化簽名板，並監聽容器尺寸變化（旋轉屏幕等） */
  useEffect(() => {
    if (state !== 'ready') return
    setupCanvas()
    const wrap = wrapRef.current
    if (!wrap || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(() => setupCanvas())
    ro.observe(wrap)
    return () => ro.disconnect()
  }, [state])

  /** 指針座標轉 Canvas 內座標 */
  const getPos = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    return { x: e.clientX - rect.left, y: e.clientY - rect.top }
  }

  const markInk = () => {
    if (!hasInkRef.current) {
      hasInkRef.current = true
      setHasInk(true)
    }
  }

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.preventDefault()
    e.currentTarget.setPointerCapture(e.pointerId)
    const ctx = canvasRef.current?.getContext('2d')
    if (!ctx) return
    const { x, y } = getPos(e)
    drawingRef.current = true
    ctx.beginPath()
    ctx.moveTo(x, y)
    ctx.lineTo(x + 0.01, y)
    ctx.stroke()
    markInk()
  }

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawingRef.current) return
    const ctx = canvasRef.current?.getContext('2d')
    if (!ctx) return
    const { x, y } = getPos(e)
    ctx.lineTo(x, y)
    ctx.stroke()
  }

  const endDraw = () => { drawingRef.current = false }

  const handleClear = () => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    hasInkRef.current = false
    setHasInk(false)
  }

  /** 導出白底簽名圖（Base64 PNG Data URL） */
  const exportSignature = (): string | null => {
    const canvas = canvasRef.current
    if (!canvas) return null
    const out = document.createElement('canvas')
    out.width = canvas.width
    out.height = canvas.height
    const octx = out.getContext('2d')
    if (!octx) return null
    octx.fillStyle = '#ffffff'
    octx.fillRect(0, 0, out.width, out.height)
    octx.drawImage(canvas, 0, 0)
    return out.toDataURL('image/png')
  }

  /** 提交簽名（二次確認 → 提交 → 成功態） */
  const handleSubmit = () => {
    if (!hasInkRef.current) {
      message.warning('請先在簽名框內手寫簽名')
      return
    }
    Modal.confirm({
      title: '確認提交簽名？',
      content: `提交後領用單 ${claim?.claimNo || ''} 即完成簽署確認，不可重籤。`,
      okText: '確認簽署',
      cancelText: '再看看',
      onOk: async () => {
        const dataUrl = exportSignature()
        if (!dataUrl) return
        setSubmitting(true)
        try {
          await submitSignPageSign(token, dataUrl)
          setState('success')
        } catch (e: unknown) {
          message.error(e instanceof Error ? e.message : '提交失敗，請重試')
        } finally {
          setSubmitting(false)
        }
      },
    })
  }

  if (state === 'loading') {
    return (
      <div style={{
        minHeight: '100vh', background: '#f5f6f8',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <Spin size="large" tip="加載中..." />
      </div>
    )
  }

  if (state === 'invalid') {
    return (
      <MobileShell>
        <Result
          status="404"
          title="鏈接無效"
          subTitle="簽署鏈接缺少憑證，請從釘釘通知中點擊鏈接進入"
        />
      </MobileShell>
    )
  }

  if (state === 'error') {
    return (
      <MobileShell>
        <Result status="warning" title="無法簽署" subTitle={errorMsg} />
      </MobileShell>
    )
  }

  if (state === 'success') {
    return (
      <MobileShell>
        <Result
          status="success"
          title="簽署完成"
          subTitle="您的簽名已提交，本領用單已完成確認，可關閉此頁面"
          extra={<SafetyOutlined style={{ fontSize: 40, color: '#52C41A' }} />}
        />
      </MobileShell>
    )
  }

  if (state === 'signed') {
    return (
      <MobileShell>
        <PageShell>
          <Result
            status="success"
            title="本領用單已簽署"
            subTitle={`簽署時間：${claim?.signedAt || '—'}`}
          />
          {claim?.signatureImageUrl && (
            <div style={{ padding: '0 20px 20px' }}>
              <div style={{ fontSize: 13, color: '#8c8c8c', marginBottom: 8 }}>簽名憑證</div>
              <img
                src={claim.signatureImageUrl}
                alt="簽名憑證"
                style={{ width: '100%', border: '1px solid #f0f0f0', borderRadius: 8, background: '#fff' }}
              />
            </div>
          )}
        </PageShell>
      </MobileShell>
    )
  }

  /* ready：待簽署視圖 */
  const infoRows: Array<{ label: string; value?: string }> = [
    { label: '領用單號', value: claim?.claimNo },
    { label: '資產名稱', value: claim?.assetName ? `${claim.assetName}（${claim.assetNo || '—'}）` : claim?.assetNo },
    { label: '品牌', value: claim?.brand },
    { label: '領用人', value: claim?.empName ? `${claim.empName}（${claim.empNo || '—'}）` : claim?.empNo },
    { label: '所屬部門', value: claim?.department },
    { label: '領用日期', value: claim?.claimDate },
    { label: '領用原因', value: claim?.claimReason },
    { label: '登記經辦', value: claim?.operator },
  ].filter(r => r.value)

  return (
    <MobileShell>
      <PageShell>
        {/* 領用信息卡 */}
        <div style={{ padding: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <div style={{
              width: 28, height: 28, borderRadius: 6, background: '#fff7e6',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <FileDoneOutlined style={{ fontSize: 14, color: '#E8720C' }} />
            </div>
            <span style={{ fontSize: 15, fontWeight: 600, color: '#262626' }}>領用信息</span>
          </div>
          {infoRows.map((r, idx) => (
            <div key={r.label} style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
              gap: 16, padding: '11px 0',
              borderBottom: idx < infoRows.length - 1 ? '1px solid #f5f5f5' : 'none',
            }}>
              <span style={{ fontSize: 13, color: '#8c8c8c', flexShrink: 0 }}>{r.label}</span>
              <span style={{ fontSize: 14, color: '#262626', fontWeight: 500, textAlign: 'right', wordBreak: 'break-all' }}>
                {r.value}
              </span>
            </div>
          ))}
        </div>

        {/* 簽名板 */}
        <div style={{ padding: '0 16px 16px' }}>
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8,
          }}>
            <span style={{ fontSize: 15, fontWeight: 600, color: '#262626' }}>本人簽名確認</span>
            <span style={{ fontSize: 12, color: '#8c8c8c' }}>請書寫本人姓名</span>
          </div>
          <div
            ref={wrapRef}
            style={{
              position: 'relative', borderRadius: 8, background: '#fff',
              border: '1px dashed #d9d9d9', overflow: 'hidden',
            }}
          >
            <canvas
              ref={canvasRef}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={endDraw}
              onPointerLeave={endDraw}
              onPointerCancel={endDraw}
              style={{ display: 'block', touchAction: 'none', cursor: 'crosshair' }}
            />
            {!hasInk && (
              <div style={{
                position: 'absolute', inset: 0, display: 'flex', alignItems: 'center',
                justifyContent: 'center', pointerEvents: 'none',
              }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#bfbfbf' }}>
                  <EditOutlined /> 在此區域內簽名
                </span>
              </div>
            )}
          </div>
        </div>

        {/* 操作按鈕 */}
        <div style={{ padding: '0 16px 8px', display: 'flex', gap: 12 }}>
          <Button
            icon={<ClearOutlined />}
            onClick={handleClear}
            disabled={!hasInk || submitting}
            style={{ flex: 1, height: 44, borderRadius: 8, borderColor: '#d9d9d9', color: '#595959' }}
          >
            清空重寫
          </Button>
          <Button
            type="primary"
            loading={submitting}
            onClick={handleSubmit}
            style={{
              flex: 2, height: 44, borderRadius: 8, fontWeight: 600,
              backgroundColor: '#E8720C', borderColor: '#E8720C',
              boxShadow: '0 2px 6px rgba(232,114,12,0.25)',
            }}
          >
            確認簽署
          </Button>
        </div>

        <div style={{ textAlign: 'center', fontSize: 11, color: '#bfbfbf', marginTop: 12, paddingBottom: 16 }}>
          閃蜂物資管理 · 電子簽名與手寫簽名具有同等效力
        </div>
      </PageShell>
    </MobileShell>
  )
}

/** 移動端外殼：無側邊欄/頂欄，居中卡片容器（與 AssetTagView 一致） */
function MobileShell({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      minHeight: '100vh', background: '#f5f6f8',
      display: 'flex', justifyContent: 'center',
    }}>
      <div style={{ width: '100%', maxWidth: 480 }}>
        {children}
      </div>
    </div>
  )
}

/** 頁面卡片：品牌橙頭部 + 白色內容容器 */
function PageShell({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ padding: 16 }}>
      <div style={{
        background: '#E8720C', color: '#fff',
        borderRadius: '16px 16px 0 0', padding: '20px 20px 16px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 700 }}>資產領用簽署</div>
          <div style={{ fontSize: 11, opacity: 0.85, marginTop: 2 }}>釘钉通知 · 令牌免登 · 手寫簽名</div>
        </div>
        <EditOutlined style={{ fontSize: 22, opacity: 0.85 }} />
      </div>
      <div style={{
        background: '#fff', borderRadius: '0 0 16px 16px',
        border: '1px solid #E8720C33', borderTop: 'none',
      }}>
        {children}
      </div>
    </div>
  )
}
