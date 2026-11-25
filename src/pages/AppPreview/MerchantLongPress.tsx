/**
 * Copyright (c) 2026 fengsong7889. All Rights Reserved.
 *
 * 本文件为「MFTB 企业一体化管理平台软件」的组成部分。
 * 未经著作权人书面许可，不得使用、复制、修改、再分发或用于任何商业目的。
 * 完整许可条款见仓库根目录 LICENSE 文件。
 */

/** 商家卡片长按操作浮层：小图横排、大图竖排、首页卡片模式紧凑竖排。 */
import { useCallback, useEffect, useRef, useState, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useMerchantPreferences } from './MerchantPreference'
import { SpecField } from './SpecHighlight'

export type MerchantActionLayout = 'small' | 'large' | 'card'

const LONG_PRESS_MS = 550
const MOVE_TOLERANCE = 12

interface MerchantMenuPosition {
  host: HTMLElement
  left: number
  top: number
}

export default function MerchantLongPress({
  merchantId,
  merchantName,
  layout,
  specPanel,
  children,
  initiallyOpen = false,
  onFindSimilar,
}: {
  merchantId: string
  merchantName: string
  layout: MerchantActionLayout
  /** 右侧说明悬停高亮作用域 */
  specPanel: 'delivery' | 'preferred'
  children: ReactNode
  /** 演示位：卡片内固定展示操作浮层，关闭后仍可长按重新打开 */
  initiallyOpen?: boolean
  onFindSimilar?: (merchantId: string) => void
}) {
  const { hideMerchant } = useMerchantPreferences()
  const timerRef = useRef<number | null>(null)
  const startRef = useRef<{ x: number; y: number } | null>(null)
  const suppressClickUntilRef = useRef(0)
  const openedAtRef = useRef(0)
  const [menu, setMenu] = useState<MerchantMenuPosition | null>(null)
  const [demoVisible, setDemoVisible] = useState(initiallyOpen)

  const clearTimer = () => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current)
      timerRef.current = null
    }
  }

  useEffect(() => clearTimer, [])

  useEffect(() => {
    if (!menu) return
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenu(null)
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [menu])

  const openMenu = useCallback((clientX: number, clientY: number, target: EventTarget | null) => {
    const screen = target instanceof Element ? target.closest<HTMLElement>('.ap-phone-screen') : null
    if (!screen) return
    const rect = screen.getBoundingClientRect()
    const width = layout === 'small' ? 248 : layout === 'card' ? 138 : 154
    const height = layout === 'small' ? 76 : layout === 'card' ? 104 : 116
    const left = Math.min(Math.max(clientX - rect.left - width / 2, 12), Math.max(12, rect.width - width - 12))
    const top = Math.min(Math.max(clientY - rect.top - height / 2, 12), Math.max(12, rect.height - height - 12))
    suppressClickUntilRef.current = Date.now() + 450
    openedAtRef.current = Date.now()
    setMenu({ host: screen, left, top })
  }, [layout])

  useEffect(() => {
    if (initiallyOpen) setDemoVisible(true)
  }, [initiallyOpen, layout])

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return
    clearTimer()
    const host = event.currentTarget
    startRef.current = { x: event.clientX, y: event.clientY }
    timerRef.current = window.setTimeout(() => {
      if (host.closest('.ap-stage.is-drag-scrolling')) return
      const start = startRef.current
      if (start) openMenu(start.x, start.y, event.target)
    }, LONG_PRESS_MS)
  }

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const start = startRef.current
    if (!start) return
    if (event.currentTarget.closest('.ap-stage.is-drag-scrolling')) {
      clearTimer()
      return
    }
    if (Math.hypot(event.clientX - start.x, event.clientY - start.y) > MOVE_TOLERANCE) clearTimer()
  }

  const handlePointerUp = () => clearTimer()
  const handlePointerCancel = () => clearTimer()

  const handleClickCapture = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (Date.now() < suppressClickUntilRef.current) {
      event.preventDefault()
      event.stopPropagation()
    }
  }

  const handleContextMenu = (event: ReactMouseEvent<HTMLDivElement>) => {
    event.preventDefault()
    openMenu(event.clientX, event.clientY, event.target)
  }

  const closeMenu = () => {
    setMenu(null)
    setDemoVisible(false)
  }
  const handleNotInterested = () => {
    hideMerchant(merchantId)
    closeMenu()
  }
  const handleFindSimilar = () => {
    closeMenu()
    onFindSimilar?.(merchantId)
  }

  const menuClass = layout === 'small'
    ? 'merchant-action-menu is-horizontal'
    : layout === 'card'
      ? 'merchant-action-menu is-card'
      : 'merchant-action-menu is-vertical'
  const actionButtons = (
    <>
      <SpecField panel={specPanel} id={27}>
        <button type="button" className="merchant-action-btn" onClick={handleNotInterested}>
          <span aria-hidden="true">💔</span>不感兴趣
        </button>
      </SpecField>
      <SpecField panel={specPanel} id={28}>
        <button type="button" className="merchant-action-btn" onClick={handleFindSimilar}>
          <span aria-hidden="true">🔍</span>查找相似
        </button>
      </SpecField>
    </>
  )

  return (
    <>
      <div
        className={`merchant-action-host${initiallyOpen && demoVisible ? ' is-demo' : ''}`}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
        onPointerLeave={handlePointerUp}
        onClickCapture={handleClickCapture}
        onContextMenu={handleContextMenu}
      >
        {children}
        {initiallyOpen && demoVisible && (
          <div
            className={`merchant-action-demo is-${layout}`}
            role="group"
            aria-label={`${merchantName}操作演示`}
            onPointerDown={(event) => event.stopPropagation()}
            onContextMenu={(event) => { event.preventDefault(); event.stopPropagation() }}
            onClick={closeMenu}
          >
            {layout !== 'small' && (
              <button type="button" className="merchant-action-demo-close" aria-label="关闭操作演示" onClick={closeMenu}>×</button>
            )}
            <div className="merchant-action-demo-actions" onClick={(event) => event.stopPropagation()}>
              {actionButtons}
            </div>
          </div>
        )}
      </div>
      {menu && createPortal(
        <div
          className="merchant-action-backdrop"
          onClick={() => {
            if (Date.now() - openedAtRef.current > 250) closeMenu()
          }}
        >
          <div
            className={menuClass}
            style={{ left: menu.left, top: menu.top }}
            role="dialog"
            aria-label={`${merchantName}操作`}
            onClick={(event) => event.stopPropagation()}
          >
            {actionButtons}
          </div>
        </div>,
        menu.host,
      )}
    </>
  )
}
