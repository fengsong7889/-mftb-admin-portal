/**
 * Copyright (c) 2026 fengsong7889. All Rights Reserved.
 *
 * 本文件为「MFTB 企业一体化管理平台软件」的组成部分。
 * 未经著作权人书面许可，不得使用、复制、修改、再分发或用于任何商业目的。
 * 完整许可条款见仓库根目录 LICENSE 文件。
 */

/**
 * 壳外说明表「收藏按钮」归属守卫。
 *
 * 命题：收藏按钮（id6）及其说明只属于優選商家/附近門店页签瀑布流；
 * 搜索结果团购两个面板（searchGroup / searchGroupPage）不得列出该行
 * （卡片搜索态本就不渲染收藏钮，说明表须与之一致）。
 */
import { describe, expect, it } from 'vitest'
import { SPEC_PANELS } from './groupBuySpec'

const panel = (key: string) => SPEC_PANELS.find((p) => p.key === key)!

describe('收藏按钮说明仅页签瀑布流持有', () => {
  it('優選商家/附近門店面板保留收藏按钮行', () => {
    expect(panel('preferred').defaults.some((s) => s.id === 6)).toBe(true)
  })

  it('搜索结果团购两面板剔除收藏按钮行，但保留商品展示与搜索专属行', () => {
    for (const key of ['searchGroup', 'searchGroupPage']) {
      const ids = panel(key).defaults.map((s) => s.id)
      expect(ids).not.toContain(6)
      expect(ids).toContain(17)
      expect(ids).toContain(15)
      expect(ids).toContain(16)
    }
  })
})
