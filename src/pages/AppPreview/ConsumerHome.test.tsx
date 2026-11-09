/**
 * Copyright (c) 2026 fengsong7889. All Rights Reserved.
 *
 * 本文件为「MFTB 企业一体化管理平台软件」的组成部分。
 * 未经著作权人书面许可，不得使用、复制、修改、再分发或用于任何商业目的。
 * 完整许可条款见仓库根目录 LICENSE 文件。
 */

/**
 * 閃蜂首页 · 面板同步挂载回归门禁
 *
 * 回归背景：首页组件被面板命令从团购页/频道页拉回时会重新挂载，syncSeq 守卫在挂载首帧
 * 看不到序号变化（ref 初值即新序号），分类会停在默认团购——双机都「不跟随」。
 * 修复口径同 ConsumerGroupBuy：分类初值直接应用 syncCategory。这里钉住挂载即同步。
 */
import { beforeAll, describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import i18n from '@/i18n'
import ConsumerHome from './ConsumerHome'

beforeAll(async () => {
  await i18n.changeLanguage('zh-TW')
})

/** 当前吸顶分类切换的选中项（首页分类宫格也含「美食外賣」等文案，故按类名定位吸顶 Tab） */
function activeCatText() {
  return screen.getAllByRole('button').find((btn) => btn.className.includes('apc-sticky-cat is-on'))?.textContent ?? ''
}

describe('閃蜂首页面板同步', () => {
  it('被面板命令重挂载时分类初值直接生效（挂载即同步，不等 syncSeq 变化）', () => {
    render(<ConsumerHome syncCategory="delivery" syncSeq={7} />)
    expect(activeCatText()).toContain('外賣')
  })

  it('非法/无关命令回落默认團購分类', () => {
    render(<ConsumerHome syncCategory="preferred" syncSeq={7} />)
    expect(activeCatText()).toContain('團購')
  })

  it('挂载后仍响应 syncSeq 变化的分类切换（既有行为不回归）', () => {
    const { rerender } = render(<ConsumerHome syncCategory="group" syncSeq={1} />)
    expect(activeCatText()).toContain('團購')

    rerender(<ConsumerHome syncCategory="delivery" syncSeq={2} />)
    expect(activeCatText()).toContain('外賣')
  })
})
