/**
 * Copyright (c) 2026 fengsong7889. All Rights Reserved.
 *
 * 本文件为「MFTB 企业一体化管理平台软件」的组成部分。
 * 未经著作权人书面许可，不得使用、复制、修改、再分发或用于任何商业目的。
 * 完整许可条款见仓库根目录 LICENSE 文件。
 */

/**
 * 壳外说明表真源守卫（纯数据，不渲染组件）。
 *
 * 守卫一：收藏按钮（id6）及其说明只属于優選商家/附近門店页签瀑布流；
 * 搜索结果团购两个面板（searchGroup / searchGroupPage）不得列出该行
 * （卡片搜索态本就不渲染收藏钮，说明表须与之一致）。
 * 守卫二：「本轮口径调整」标记（changed）的日期格式与篩選面板显隐口径，
 * 徽标列是开发/测试/设计定位回归面的入口，日期不可排序就等于没标。
 */
import { describe, expect, it } from 'vitest'
import { DELIVERY_SPECS, FILTER_SPECS, SPEC_PANELS } from './groupBuySpec'

const panel = (key: string) => SPEC_PANELS.find((p) => p.key === key)!

describe('收藏按钮说明仅页签瀑布流持有', () => {
  it('優選商家/附近門店面板保留收藏按钮行，并限定大图模式', () => {
    const row = panel('preferred').defaults.find((s) => s.id === 6)!
    expect(row).toBeTruthy()
    expect(row.desc).toContain('只有大图模式下才展示收藏按钮')
    expect(row.changed?.date).toBe('2026-11-24')
  })

  it('搜索结果团购两面板剔除收藏按钮行，但保留商品展示与搜索专属行', () => {
    for (const key of ['searchGroup', 'searchGroupPage']) {
      const ids = panel(key).defaults.map((s) => s.id)
      expect(ids).not.toContain(6)
      expect(ids).toContain(17)
      expect(ids).toContain(15)
      expect(ids).not.toContain(16)
    }
  })
})

describe('準時寶说明引导文案与外部链接', () => {
  it('外卖四面板的準時寶行均为引导文案并携带 MFTB-3193 链接', () => {
    for (const key of ['delivery', 'searchDelivery', 'deliveryPage', 'searchDeliveryPage']) {
      const row = panel(key).defaults.find((s) => s.id === 6)!
      expect(row.desc).toContain('点击链接')
      expect(row.link).toBe('https://devops.aliyun.com/projex/req/MFTB-3193#')
    }
  })
})

describe('本轮口径调整标记（changed）', () => {
  it('全面板带标记的行均为 YYYY-MM-DD 日期 + 非空文案', () => {
    const marked = SPEC_PANELS.flatMap((p) => p.defaults).filter((s) => s.changed)
    expect(marked.length, '本轮至少应有一行带调整标记').toBeGreaterThan(0)
    for (const s of marked) {
      expect(s.changed!.date).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      expect(s.changed!.text.trim().length).toBeGreaterThan(0)
    }
    const history = SPEC_PANELS.flatMap((p) => p.defaults).flatMap((s) => s.history ?? [])
    for (const change of history) {
      expect(change.date).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      expect(change.text.trim().length).toBeGreaterThan(0)
    }
  })

  it('優選商家类模块显隐口径已写进篩選行正文', () => {
    const row = FILTER_SPECS.find((s) => s.id === 4)!
    expect(row.desc).toContain('營業時間模块仅商家类瀑布流')
    expect(row.desc).toContain('使用人數模块仅券类瀑布流')
  })
})

describe('外卖沉底口径已作废（note 画删除线而非删文本）', () => {
  it('門店展示规则行保留作废标记，并新增不感兴趣门店隐藏规则', () => {
    const row = DELIVERY_SPECS.find((s) => s.id === 18)!
    expect(row.note).toContain('沉底显示')
    expect(row.deprecated).toBe(true)
    expect(row.desc).toContain('7、被標記為白名單門店')
    expect(row.desc).toContain('8、用户设置为「不感兴趣」的门店')
    expect(row.desc).toContain('搜索结果不受限制')
    expect(row.changed?.date).toBe('2026-11-24')
    expect(row.changed?.text).toContain('第8点')
    expect(row.history).toEqual([{ date: '2026-11-16', text: '删除了以下这句说明：' }])
  })

  it('四个外卖面板共用同一真源，作废标记一并生效', () => {
    for (const key of ['delivery', 'searchDelivery', 'deliveryPage', 'searchDeliveryPage']) {
      const row = panel(key).defaults.find((s) => s.id === 18)!
      expect(row.deprecated, `${key} 面板的沉底 note 应同步标废`).toBe(true)
      expect(row.changed).toBeTruthy()
    }
  })
})

describe('展示模式行按页面分形与美食外卖页篩選面板', () => {
  it('卡片模式仅首页外卖瀑布流描述，美食外卖页两面板剔除（用户口径：频道页无卡片模式）', () => {
    expect(panel('delivery').defaults.find((s) => s.id === 21)!.desc).toContain('卡片模式')
    for (const key of ['deliveryPage', 'searchDeliveryPage']) {
      const row = panel(key).defaults.find((s) => s.id === 21)!
      expect(row.desc, `${key} 面板的展示模式行不应含卡片模式`).not.toContain('卡片模式')
    }
  })

  it('美食外卖页篩選面板：新增筛选条件逐条说明，蜂蜜兌換閃蜂专属与商家模块回补口径在列', () => {
    const rows = panel('deliveryFilter').defaults
    const labels = rows.map((s) => s.label)
    for (const label of ['筛选栏', '优惠活动标签', '篩選', '列表大小圖切換', '人均價', '時效範圍', '配送', '商家', '品質', '活动优惠']) {
      expect(labels, `篩選面板缺「${label}」行`).toContain(label)
    }
    for (const label of ['两排筛选栏', '綜合排序', '距離']) {
      expect(labels, `篩選面板不应再保留顶部旧入口「${label}」`).not.toContain(label)
    }
    expect(labels, '商家模块 2026-11 按用户口径回补').toContain('商家')
    expect(rows.some((s) => s.desc.includes('蜂蜜兌換仅閃蜂'))).toBe(true)
    // 活动优惠第二点「蜂蜜兌換仅閃蜂」走 note 突出显示（橙色警示框）；超值換購恢复的行为守卫在 DeliveryFilterBar.test（sheet 渲染断言）
    expect(panel('deliveryFilter').defaults.find((s) => s.id === 12)!.note).toContain('蜂蜜兌換仅閃蜂')
  })

  it('特惠团购页篩選面板：sheet 各模块均有独立说明行（含回补的大小图切换）', () => {
    const labels = panel('filter').defaults.map((s) => s.label)
    for (const label of ['附近', '全部分類', '智能排序', '篩選', '列表大小圖切換', '人均篩選器', '營業時間', '使用人數', '偏好优惠', '店鋪服務']) {
      expect(labels, `篩選面板缺「${label}」行`).toContain(label)
    }
    // 显隐分形口径同时写入模块行正文（与 id4 汇总行一致）
    expect(panel('filter').defaults.find((s) => s.id === 7)!.desc).toContain('仅商家类瀑布流')
    expect(panel('filter').defaults.find((s) => s.id === 8)!.desc).toContain('仅券类瀑布流')
  })
})
