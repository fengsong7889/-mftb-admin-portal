/**
 * Copyright (c) 2026 fengsong7889. All Rights Reserved.
 *
 * 本文件为「MFTB 企业一体化管理平台软件」的组成部分。
 * 未经著作权人书面许可，不得使用、复制、修改、再分发或用于任何商业目的。
 * 完整许可条款见仓库根目录 LICENSE 文件。
 */

/**
 * 说明面板分段轨道·滑动高亮丸（SpecTrack）门禁
 *
 * 钉住三件事：
 * ① 每段轨道恰好渲染一个高亮丸，且变体类名与档位（group / panel / mini）一致；
 * ② 高亮丸的几何取自「带 .is-on 的那一项」，而不是写死首项或末项；
 * ③ 切换段落（二级面板行、三级展示模式行）后高亮丸跟随新的选中项移动。
 *
 * ⚠️ 本文件同时是 setThumb 值比较守卫的回归用例：测量所在的 useLayoutEffect **没有依赖数组**
 * （每次渲染都重新测量），去掉守卫后每渲染都会 setThumb 一个新对象 → state 必变 → 自激重渲染，
 * React 抛「Maximum update depth exceeded」，以下用例会整体变红。
 *
 * 几何口径：jsdom 不做布局，offsetLeft / offsetWidth 恒为 0，因此这里把两个属性替换成假几何函数
 * （宽度随文案长度、左偏移按前置兄弟累加）。钉的是「thumb 用的是哪个元素的几何」这一对应关系，
 * 不是真实像素——断言里的期望值同样由该假函数对实际 .is-on 元素求值，故与轨道内元素个数无关。
 */
import { beforeAll, describe, expect, it } from 'vitest'
import { fireEvent, render, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import i18n from '@/i18n'
import AppPreview from './index'

/** 轨道内段间距（与 .ap-spec-track 的 gap 同值，只为让假几何贴近真实排布） */
const GAP = 2

function fakeWidth(el: Element) {
  return 20 + (el.textContent?.trim().length ?? 0) * 10
}

function fakeLeft(el: Element) {
  let left = 0
  let node = el.previousElementSibling
  while (node) {
    left += fakeWidth(node) + GAP
    node = node.previousElementSibling
  }
  return left
}

beforeAll(() => {
  // 主题/多语言偏好与壳内文案对齐其它 AppPreview 用例的口径
  void i18n.changeLanguage('zh-TW')
  Object.defineProperty(HTMLElement.prototype, 'offsetWidth', {
    configurable: true,
    get(this: Element) { return fakeWidth(this) },
  })
  Object.defineProperty(HTMLElement.prototype, 'offsetLeft', {
    configurable: true,
    get(this: Element) { return fakeLeft(this) },
  })
})

function renderPreview() {
  return render(
    <MemoryRouter>
      <AppPreview />
    </MemoryRouter>,
  )
}

/** 按档位取轨道：主级无修饰类，次级 --sub，三级 --mini */
function trackByVariant(variant: 'group' | 'panel' | 'mini') {
  const modifier = variant === 'panel' ? '.ap-spec-track--sub' : variant === 'mini' ? '.ap-spec-track--mini' : null
  const all = Array.from(document.querySelectorAll<HTMLElement>('.ap-spec-track'))
  const hits = modifier
    ? all.filter((t) => t.matches(modifier))
    : all.filter((t) => !t.classList.contains('ap-spec-track--sub') && !t.classList.contains('ap-spec-track--mini'))
  expect(hits, `档位 ${variant} 的轨道应当存在`).toHaveLength(1)
  return hits[0]
}

function thumbOf(track: HTMLElement) {
  const thumbs = track.querySelectorAll<HTMLElement>('.ap-spec-thumb')
  expect(thumbs, '每段轨道只能有一个高亮丸').toHaveLength(1)
  return thumbs[0]
}

function activeOf(track: HTMLElement) {
  return track.querySelector<HTMLElement>('.is-on')
}

/** thumb 样式是否已对齐给定元素的假几何 */
function expectThumbAt(thumb: HTMLElement, el: Element) {
  expect(thumb.style.transform).toBe(`translateX(${fakeLeft(el)}px)`)
  expect(thumb.style.width).toBe(`${fakeWidth(el)}px`)
}

describe('说明面板分段轨道·滑动高亮丸', () => {
  it('首帧即落位：每段轨道恰有一个高亮丸，变体类名与档位一致', () => {
    renderPreview()

    const groupThumb = thumbOf(trackByVariant('group'))
    expect(groupThumb).toHaveClass('ap-spec-thumb--group')
    const panelThumb = thumbOf(trackByVariant('panel'))
    expect(panelThumb).toHaveClass('ap-spec-thumb--panel')

    // 默认面板为「首页 · 团购瀑布流」：两级高亮丸都落在当前选中段上
    expectThumbAt(groupThumb, activeOf(trackByVariant('group'))!)
    expectThumbAt(panelThumb, activeOf(trackByVariant('panel'))!)
    // 高亮丸是纯装饰层，不进无障碍树
    expect(groupThumb).toHaveAttribute('aria-hidden', 'true')
  })

  it('切到外卖瀑布流：高亮丸跟随新选中项，且与旧位置不同（不是写死首项）', () => {
    renderPreview()

    const panelTrack = trackByVariant('panel')
    const before = activeOf(panelTrack)!
    const beforeThumb = thumbOf(panelTrack)
    const beforeTransform = beforeThumb.style.transform
    expectThumbAt(beforeThumb, before)

    fireEvent.click(within(panelTrack).getByRole('button', { name: '外卖瀑布流' }))

    const afterTrack = trackByVariant('panel')
    const after = activeOf(afterTrack)!
    expect(after.textContent).not.toBe(before.textContent)
    expectThumbAt(thumbOf(afterTrack), after)
    // 两段文案等长（假宽度相同），因此只能用横向落点拦「thumb 停在首项」这一类回归
    expect(thumbOf(afterTrack).style.transform).not.toBe(beforeTransform)
  })

  it('三级展示模式行：小图→大图切换后高亮丸同步移动', () => {
    renderPreview()
    // 展示模式行只在「外卖瀑布流」面板下渲染，先把它切出来
    fireEvent.click(within(trackByVariant('panel')).getByRole('button', { name: '外卖瀑布流' }))

    const miniTrack = trackByVariant('mini')
    const thumb = thumbOf(miniTrack)
    expect(thumb).toHaveClass('ap-spec-thumb--mini')
    expectThumbAt(thumb, activeOf(miniTrack)!)

    fireEvent.click(within(miniTrack).getByRole('button', { name: '大图模式' }))

    const moved = thumbOf(trackByVariant('mini'))
    expect(activeOf(trackByVariant('mini'))!.textContent).toBe('大图模式')
    expectThumbAt(moved, activeOf(trackByVariant('mini'))!)
  })

  it('无交互时重复渲染不再挪动高亮丸（setThumb 值比较守卫不产生新状态）', () => {
    const { rerender } = renderPreview()
    const thumb = thumbOf(trackByVariant('group'))
    const style = { transform: thumb.style.transform, width: thumb.style.width }

    rerender(
      <MemoryRouter>
        <AppPreview />
      </MemoryRouter>,
    )

    const again = thumbOf(trackByVariant('group'))
    expect(again.style.transform).toBe(style.transform)
    expect(again.style.width).toBe(style.width)
  })
})
