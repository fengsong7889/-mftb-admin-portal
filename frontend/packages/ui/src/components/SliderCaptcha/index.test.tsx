import { fireEvent, render, screen } from '@testing-library/react'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import SliderCaptcha from './index'

beforeAll(() => {
  // jsdom 未实现 Pointer Capture API，不补一个空实现会让 handlePointerDown 抛错
  const proto = Element.prototype as Element & {
    setPointerCapture?: (id: number) => void
    releasePointerCapture?: (id: number) => void
    hasPointerCapture?: (id: number) => boolean
  }
  proto.setPointerCapture ??= () => {}
  proto.releasePointerCapture ??= () => {}
  proto.hasPointerCapture ??= () => false
})

/**
 * 滑块验证的「不能白送」测试。
 * <p>真实事故：cutX 初始值是 0、滑块起点也是 0，拼图 effect 还没跑完时
 * 一次「按下 + 抬起」就满足 |0-0| <= 容差，页面直接显示「驗證通過」并去后端换一次性 token，
 * 于是这道风控对脚本完全失效。这里钉住的就是「没拖动绝不通过」。
 */
function handle(): HTMLElement {
  const el = document.querySelector<HTMLElement>('.slider-captcha-handle')
  if (!el) throw new Error('滑块把手未渲染')
  return el
}

describe('SliderCaptcha', () => {
  it('按下后不拖动就抬起：不得判通过，也不得回调 onSuccess', () => {
    const onSuccess = vi.fn()
    render(<SliderCaptcha onSuccess={onSuccess} onClose={vi.fn()} />)

    const el = handle()
    fireEvent.pointerDown(el, { clientX: 100, pointerId: 1 })
    fireEvent.pointerUp(el, { pointerId: 1 })

    expect(onSuccess).not.toHaveBeenCalled()
    expect(screen.queryByText('驗證通過')).not.toBeInTheDocument()
  })

  it('没有按下事件时抬起无效（不能让外部直接派发 pointerup 过关）', () => {
    const onSuccess = vi.fn()
    render(<SliderCaptcha onSuccess={onSuccess} onClose={vi.fn()} />)

    fireEvent.pointerUp(handle(), { pointerId: 2 })

    expect(onSuccess).not.toHaveBeenCalled()
    expect(screen.queryByText('驗證通過')).not.toBeInTheDocument()
  })

  it('拼图尚未就绪（jsdom 无 canvas，effect 早退）时即使位置对齐也不能通过', () => {
    const onSuccess = vi.fn()
    render(<SliderCaptcha onSuccess={onSuccess} onClose={vi.fn()} />)

    const el = handle()
    // 缺口坐标在这个环境里从未被赋值，仍停留在初始 0；拖动一步再松手也不该算数
    fireEvent.pointerDown(el, { clientX: 200, pointerId: 3 })
    fireEvent.pointerMove(el, { clientX: 260, pointerId: 3 })
    fireEvent.pointerUp(el, { pointerId: 3 })

    expect(onSuccess).not.toHaveBeenCalled()
  })

  it('标题与关闭入口存在（供读屏与用户退出）', () => {
    const onClose = vi.fn()
    render(<SliderCaptcha onSuccess={vi.fn()} onClose={onClose} />)

    expect(screen.getByText('安全驗證')).toBeInTheDocument()
    fireEvent.click(screen.getByTitle('關閉'))
    expect(onClose).toHaveBeenCalled()
  })
})
