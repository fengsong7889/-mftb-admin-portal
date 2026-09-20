/**
 * 資產領用簽署頁（釘釘工作通知直達，令牌免登）
 *
 * 入口：釘釘通知中的簽署鏈接（#/asset-claim-sign?token=...）。
 * 令牌為後端 HMAC 簽發（綁定領用單 + 領用人 + 7 天有效期），
 * 頁面憑令牌讀取待簽署領用詳情，Canvas 手寫簽名後提交。
 *
 * 公開頁面：不套後台佈局，移動端優先（釘釘內置瀏覽器打開）。
 */
import { useEffect, useRef, useState, useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Button, Modal, Result, Spin, Tag, message } from 'antd'
import { AppstoreOutlined, EditOutlined, FileDoneOutlined, SafetyOutlined } from '@ant-design/icons'
import { fetchSignPageDetail, submitSignPageSign, type SignPageClaimDetail } from '../../api/signPage'

/** 頁面狀態機 */
type PageState = 'loading' | 'ready' | 'signed' | 'success' | 'invalid' | 'error'

export default function AssetClaimSign() {
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token') || ''

  const [state, setState] = useState<PageState>(token ? 'loading' : 'invalid')
  const [errorMsg, setErrorMsg] = useState('')
  const [claim, setClaim] = useState<SignPageClaimDetail | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [signaturePreviewOpen, setSignaturePreviewOpen] = useState(false)

  /* 全屏簽名覆蓋層 */
  const fsCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const fsWrapRef = useRef<HTMLDivElement | null>(null)

  const drawingRef = useRef(false)
  const hasInkRef = useRef(false)
  const [hasInk, setHasInk] = useState(false)
  const [fullscreenOpen, setFullscreenOpen] = useState(false)

  /* 簽署頁獨立於後台佈局，需恢復 body 滾動 */
  useEffect(() => {
    document.documentElement.style.overflow = 'auto'
    document.body.style.overflow = 'auto'
    return () => {
      document.documentElement.style.overflow = ''
      document.body.style.overflow = ''
    }
  }, [])

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
        if (detail.signatureStatus === 'signed' || detail.signatureImageUrl) {
          setState('signed')
        } else if (detail.status === 'pending_signature' || detail.signatureStatus === 'proxy_pending') {
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

  /** 初始化簽名板（高清屏適配） */
  const setupCanvas = useCallback((canvas: HTMLCanvasElement | null, wrap: HTMLDivElement | null, height: number) => {
    if (!canvas || !wrap) return
    const cssWidth = wrap.clientWidth
    if (cssWidth <= 0) return
    const dpr = window.devicePixelRatio || 1
    // 已有簽名痕跡時，跳過清空（避免 ResizeObserver 觸發時丟失簽名）
    if (hasInkRef.current) return
    canvas.width = Math.round(cssWidth * dpr)
    canvas.height = Math.round(height * dpr)
    canvas.style.width = `${cssWidth}px`
    canvas.style.height = `${height}px`
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.scale(dpr, dpr)
    ctx.lineWidth = 3
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.strokeStyle = '#262626'
  }, [])

  /* 全屏簽名板初始化 */
  useEffect(() => {
    if (!fullscreenOpen) return
    // 等待 DOM 渲染後初始化
    const timer = setTimeout(() => {
      setupCanvas(fsCanvasRef.current, fsWrapRef.current, window.innerHeight - 120)
    }, 50)
    const wrap = fsWrapRef.current
    if (!wrap || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(() => setupCanvas(fsCanvasRef.current, wrap, window.innerHeight - 120))
    ro.observe(wrap)
    return () => { clearTimeout(timer); ro.disconnect() }
  }, [fullscreenOpen, setupCanvas])

  /** 指針座標轉 Canvas 內座標 */
  const getPos = (canvas: HTMLCanvasElement, e: React.PointerEvent) => {
    const rect = canvas.getBoundingClientRect()
    return { x: e.clientX - rect.left, y: e.clientY - rect.top }
  }

  const markInk = () => {
    if (!hasInkRef.current) {
      hasInkRef.current = true
      setHasInk(true)
    }
  }

  const createPointerDown = (canvasRef: React.RefObject<HTMLCanvasElement | null>) =>
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      e.preventDefault()
      e.currentTarget.setPointerCapture(e.pointerId)
      const ctx = canvasRef.current?.getContext('2d')
      if (!ctx) return
      const { x, y } = getPos(canvasRef.current!, e)
      drawingRef.current = true
      ctx.beginPath()
      ctx.moveTo(x, y)
      ctx.lineTo(x + 0.01, y)
      ctx.stroke()
      markInk()
    }

  const createPointerMove = (canvasRef: React.RefObject<HTMLCanvasElement | null>) =>
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      if (!drawingRef.current) return
      const ctx = canvasRef.current?.getContext('2d')
      if (!ctx) return
      const { x, y } = getPos(canvasRef.current!, e)
      ctx.lineTo(x, y)
      ctx.stroke()
    }

  const endDraw = () => { drawingRef.current = false }

  const clearCanvas = (canvas: HTMLCanvasElement | null) => {
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    hasInkRef.current = false
    setHasInk(false)
  }

  /** 導出白底簽名圖（高分屏畫布降採樣至最大 1000px 寬，控制 base64 體積） */
  const exportSignature = (canvas: HTMLCanvasElement | null): string | null => {
    if (!canvas) return null
    const MAX_WIDTH = 1000
    const scale = canvas.width > MAX_WIDTH ? MAX_WIDTH / canvas.width : 1
    const out = document.createElement('canvas')
    out.width = Math.round(canvas.width * scale)
    out.height = Math.round(canvas.height * scale)
    const octx = out.getContext('2d')
    if (!octx) return null
    octx.fillStyle = '#ffffff'
    octx.fillRect(0, 0, out.width, out.height)
    octx.drawImage(canvas, 0, 0, out.width, out.height)
    return out.toDataURL('image/png')
  }

  /** 全屏簽名 - 提交 */
  const handleFullscreenSubmit = () => {
    if (!hasInkRef.current) {
      message.warning('請先簽名後再提交')
      return
    }
    Modal.confirm({
      title: '確認提交簽名？',
      content: `提交後領用單 ${claim?.claimNo || ''} 即完成簽署確認，不可重籤。`,
      okText: '確認簽署',
      cancelText: '再看看',
      onOk: async () => {
        const dataUrl = exportSignature(fsCanvasRef.current)
        if (!dataUrl) return
        setSubmitting(true)
        try {
          await submitSignPageSign(token, dataUrl)
          setState('success')
        } catch (e: unknown) {
          const msg = e instanceof Error ? e.message : '提交失敗，請重試'
          // 403 通常是 CORS 或網絡問題，給出更友好的提示
          if (msg.includes('403')) {
            message.error('提交失敗，請檢查網絡連接後重試')
          } else {
            message.error(msg)
          }
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
    const signedInfoRows: Array<{ label: string; value?: string }> = [
      { label: '領用單號', value: claim?.claimNo },
      { label: '資產編碼', value: claim?.assetNo },
      { label: '资产品牌', value: claim?.brand },
      { label: '資產名稱', value: claim?.assetName },
      { label: '購買時價值', value: claim?.purchaseValue != null ? `MOP ${Number(claim.purchaseValue).toLocaleString()}` : undefined },
      { label: '領用人', value: claim?.empName ? `${claim.empName}（${claim.empNo || '—'}）` : claim?.empNo },
      { label: '所屬部門', value: claim?.department },
      { label: '領用日期', value: claim?.claimDate },
      { label: '領用原因', value: claim?.claimReason },
    ].filter(r => r.value)
    const signedAccessories = claim?.accessories ?? []

    return (
      <MobileShell>
        <PageShell>
          {/* 頂部成功提示 */}
          <div style={{ padding: '24px 16px 8px', textAlign: 'center' }}>
            <div style={{
              width: 64, height: 64, borderRadius: '50%', background: '#52C41A',
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              marginBottom: 16,
            }}>
              <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </div>
            <div style={{ fontSize: 18, fontWeight: 600, color: '#262626', marginBottom: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12 }}>
              本領用單已簽署
              {claim?.signatureImageUrl && (
                <a
                  onClick={() => setSignaturePreviewOpen(true)}
                  style={{ fontSize: 13, color: '#E8720C', cursor: 'pointer', textDecoration: 'underline', fontWeight: 500 }}
                >
                  查看簽名
                </a>
              )}
            </div>
            <div style={{ fontSize: 13, color: '#8c8c8c' }}>簽署時間：{claim?.signedAt || '—'}</div>
          </div>

          {/* 資產信息 */}
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
            {signedInfoRows.map((r, idx) => (
              <div key={r.label} style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
                gap: 16, padding: '11px 0',
                borderBottom: idx < signedInfoRows.length - 1 ? '1px solid #f5f5f5' : 'none',
              }}>
                <span style={{ fontSize: 13, color: '#8c8c8c', flexShrink: 0 }}>{r.label}</span>
                <span style={{ fontSize: 14, color: '#262626', fontWeight: 500, textAlign: 'right', wordBreak: 'break-all' }}>
                  {r.value}
                </span>
              </div>
            ))}

            {/* 領用配件 */}
            {signedAccessories.length > 0 && (
              <div style={{ paddingTop: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  <AppstoreOutlined style={{ fontSize: 13, color: '#FA8C16' }} />
                  <span style={{ fontSize: 13, fontWeight: 600, color: '#595959' }}>領用配件</span>
                  <Tag color="orange" style={{ fontSize: 11 }}>{signedAccessories.length} 項</Tag>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {signedAccessories.map((acc, idx) => (
                    <Tag key={idx} color="orange" style={{ fontSize: 13, padding: '4px 12px', borderRadius: 4 }}>
                      {acc.name} × {acc.qty}
                    </Tag>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* 重新簽署按鈕 */}
          <div style={{ padding: '0 16px 16px' }}>
            <Button
              onClick={() => setFullscreenOpen(true)}
              icon={<EditOutlined />}
              style={{
                width: '100%', height: 44, borderRadius: 8, fontSize: 14, fontWeight: 500,
                backgroundColor: '#fff', borderColor: '#E8720C', color: '#E8720C',
              }}
            >
              重新簽署
            </Button>
            <div style={{ textAlign: 'center', fontSize: 11, color: '#bfbfbf', marginTop: 8 }}>
              重新簽署將覆蓋原有簽名
            </div>
          </div>
        </PageShell>

        {/* 簽名預覽 Modal */}
        {signaturePreviewOpen && claim?.signatureImageUrl && (
          <Modal
            open={signaturePreviewOpen}
            onCancel={() => setSignaturePreviewOpen(false)}
            footer={null}
            width={360}
            centered
            styles={{ body: { padding: '16px 24px 24px', textAlign: 'center' } }}
          >
            <div style={{ fontSize: 15, fontWeight: 600, color: '#262626', marginBottom: 16 }}>簽名憑證</div>
            <img
              src={claim.signatureImageUrl}
              alt="簽名憑證"
              style={{ width: '100%', border: '1px solid #f0f0f0', borderRadius: 8, background: '#fff' }}
            />
          </Modal>
        )}
      </MobileShell>
    )
  }

  /* ready：待簽署視圖 */
  const infoRows: Array<{ label: string; value?: string }> = [
    { label: '領用單號', value: claim?.claimNo },
    { label: '資產編碼', value: claim?.assetNo },
    { label: '资产品牌', value: claim?.brand },
    { label: '資產名稱', value: claim?.assetName },
    { label: '購買時價值', value: claim?.purchaseValue != null ? `MOP ${Number(claim.purchaseValue).toLocaleString()}` : undefined },
    { label: '領用人', value: claim?.empName ? `${claim.empName}（${claim.empNo || '—'}）` : claim?.empNo },
    { label: '所屬部門', value: claim?.department },
    { label: '領用日期', value: claim?.claimDate },
    { label: '領用原因', value: claim?.claimReason },
  ].filter(r => r.value)
  const readyAccessories = claim?.accessories ?? []

  return (
    <MobileShell>
      <PageShell>
        {/* 領用信息 */}
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

          {/* 領用配件 */}
          {readyAccessories.length > 0 && (
            <div style={{ paddingTop: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <AppstoreOutlined style={{ fontSize: 13, color: '#FA8C16' }} />
                <span style={{ fontSize: 13, fontWeight: 600, color: '#595959' }}>領用配件</span>
                <Tag color="orange" style={{ fontSize: 11 }}>{readyAccessories.length} 項</Tag>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {readyAccessories.map((acc, idx) => (
                  <Tag key={idx} color="orange" style={{ fontSize: 13, padding: '4px 12px', borderRadius: 4 }}>
                    {acc.name} × {acc.qty}
                  </Tag>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* 簽名按鈕 */}
        <div style={{ padding: '0 16px 16px' }}>
          <Button
            type="primary"
            onClick={() => setFullscreenOpen(true)}
            icon={<EditOutlined />}
            style={{
              width: '100%', height: 48, borderRadius: 8, fontSize: 15, fontWeight: 600,
              backgroundColor: '#E8720C', borderColor: '#E8720C',
              boxShadow: '0 2px 6px rgba(232,114,12,0.25)',
            }}
          >
            確認無誤，簽字簽收
          </Button>
          <div style={{ textAlign: 'center', fontSize: 11, color: '#bfbfbf', marginTop: 12 }}>
            閃蜂物資管理 · 電子簽名與手寫簽名具有同等效力
          </div>
        </div>
      </PageShell>

      {/* 全屏簽名覆蓋層 */}
      {fullscreenOpen && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 100, background: '#fff',
          display: 'flex', flexDirection: 'column',
        }}>
          {/* 标题栏 */}
          <div style={{
            textAlign: 'center', padding: '14px 16px 10px',
            fontSize: 16, fontWeight: 600, color: '#262626',
            borderBottom: '1px solid #f0f0f0',
          }}>
            簽名
          </div>
          {/* 签名画布 - 填满剩余空间 */}
          <div
            ref={fsWrapRef}
            style={{
              flex: 1, position: 'relative', background: '#fff',
              overflow: 'hidden',
            }}
          >
            <canvas
              ref={fsCanvasRef}
              onPointerDown={createPointerDown(fsCanvasRef)}
              onPointerMove={createPointerMove(fsCanvasRef)}
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
                <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 15, color: '#bfbfbf' }}>
                  <EditOutlined /> 請在此區域簽名
                </span>
              </div>
            )}
          </div>
          {/* 底部按钮 + 提示 */}
          <div style={{
            borderTop: '1px solid #f0f0f0', background: '#fff',
          }}>
            <div style={{
              textAlign: 'center', padding: '10px 16px 4px',
              fontSize: 12, color: '#FF4D4F', fontWeight: 500,
            }}>
              請書寫领用人姓名，不可代签！
            </div>
            <div style={{
              display: 'flex', gap: 12, padding: '8px 16px 16px',
            }}>
              <Button
                onClick={() => { setFullscreenOpen(false); clearCanvas(fsCanvasRef.current); }}
                style={{ flex: 1, height: 44, borderRadius: 8, borderColor: '#d9d9d9', color: '#595959' }}
              >
                返回
              </Button>
              <Button
                onClick={() => clearCanvas(fsCanvasRef.current)}
                disabled={!hasInk}
                style={{ flex: 1, height: 44, borderRadius: 8, borderColor: '#d9d9d9', color: '#595959' }}
              >
                清空
              </Button>
              <Button
                type="primary"
                loading={submitting}
                onClick={handleFullscreenSubmit}
                disabled={!hasInk}
                style={{
                  flex: 2, height: 44, borderRadius: 8, fontWeight: 600,
                  backgroundColor: hasInk ? '#E8720C' : undefined,
                  borderColor: hasInk ? '#E8720C' : undefined,
                  boxShadow: hasInk ? '0 2px 6px rgba(232,114,12,0.25)' : undefined,
                  opacity: hasInk ? 1 : 0.5,
                }}
              >
                提交
              </Button>
            </div>
          </div>
        </div>
      )}
    </MobileShell>
  )
}

/** 移動端外殼 */
function MobileShell({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ minHeight: '100vh', background: '#f5f6f8', paddingBottom: 32 }}>
      <div style={{ width: '100%', maxWidth: 480, margin: '0 auto' }}>
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
