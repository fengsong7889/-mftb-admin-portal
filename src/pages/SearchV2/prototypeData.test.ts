import { describe, expect, it } from 'vitest'
import { MENU_ICON_NAMES } from '@/components/MenuIcon'
import { createSampleRecords, FIELD_SCHEMAS, isPane, PANES, prototypeUrl, validateDraft, type RecordPane } from './prototypeData'
import { getPreviewCards, PREVIEW_CARDS, type PreviewContext } from './previewFixtures'

const context: PreviewContext = { scene: 'delivery', region: '澳門', query: '漢堡', sort: 'relevance', showAds: true }
describe('搜索 U1 样本与原型边界', () => {
  it('九个导航图标唯一且已注册，不增加真实菜单', () => {
    expect(PANES).toHaveLength(9)
    expect(new Set(PANES.map(p => p.icon)).size).toBe(9)
    PANES.forEach(p => expect(MENU_ICON_NAMES).toContain(p.icon))
    expect(isPane('__proto__')).toBe(false)
    expect(prototypeUrl('lexicon', 'edit', 'DEMO-A&B')).toBe('/global-config?prototype=search-v2&pane=lexicon&view=edit&id=DEMO-A%26B')
  })
  it('每个配置模块有独立字段，工厂不共享样本状态', () => {
    const a = createSampleRecords()
    const b = createSampleRecords()
    a[0].name = '不应串入另一会话'
    expect(b[0].name).not.toBe(a[0].name)
    expect(new Set(a.map(r => r.id)).size).toBe(a.length)
    Object.entries(FIELD_SCHEMAS).forEach(([pane, fields]) => {
      expect(fields.length).toBeGreaterThan(0)
      expect(b.some(record => record.pane === pane)).toBe(true)
    })
  })
  it.each(['market', 'groupbuy'] as const)('外卖词不会进入不相关的 %s 结果', scene => {
    const rows = getPreviewCards({ ...context, scene, query: scene === 'market' ? '紙巾' : '雙人餐' })
    expect(rows.length).toBeGreaterThan(0)
    expect(rows.every(row => row.channel === scene)).toBe(true)
  })
  it('首页分组各不超过四张，且有三类相关供给示例', () => {
    const rows = getPreviewCards({ ...context, scene: 'home' })
    expect(new Set(rows.map(row => row.channel)).size).toBe(3)
    for (const channel of ['delivery', 'market', 'groupbuy']) expect(rows.filter(row => row.channel === channel).length).toBeLessThanOrEqual(4)
    expect(rows.filter(row => row.isAd).length).toBeLessThanOrEqual(2)
  })
  it.each(['澳門', '氹仔'])('店内强隔离且无广告：%s', region => {
    const rows = getPreviewCards({ ...context, scene: 'store', region })
    expect(rows).toHaveLength(3)
    expect(new Set(rows.map(row => row.storeId)).size).toBe(1)
    expect(rows.every(row => row.id.startsWith('DEMO-IN') && row.region === region && !row.isAd)).toBe(true)
  })
  it.each(['price', 'distance', 'sales'] as const)('显式排序 %s 无广告且遵循排序', sort => {
    const rows = getPreviewCards({ ...context, sort })
    expect(rows.every(row => !row.isAd)).toBe(true)
    const values = rows.map(row => row[sort])
    expect(values).toEqual([...values].sort((a, b) => sort === 'sales' ? b - a : a - b))
  })
  it('样例广告只在第三卡，提升而非重复已有商家', () => {
    const rows = getPreviewCards(context)
    expect(rows.map((row, i) => row.isAd ? i + 1 : 0).filter(Boolean)).toEqual([3])
    expect(new Set(rows.map(row => row.id)).size).toBe(rows.length)
    expect(rows[2].id).toBe(getPreviewCards({ ...context, showAds: false })[4].id)
    expect(PREVIEW_CARDS.some(row => row.isAd)).toBe(false)
  })
  it('明确找店返回自然结果，未知词和空词不编造命中', () => {
    const exact = getPreviewCards({ ...context, query: '星港' })
    expect(exact).toHaveLength(1)
    expect(exact[0].isAd).not.toBe(true)
    expect(getPreviewCards({ ...context, query: '不存在的搜索样本' })).toEqual([])
    expect(getPreviewCards({ ...context, query: ' ' })).toEqual([])
  })
  it.each([
    ['scenarios', '場景策略', { relevance: 65, quality: 15, distance: 15, heat: 10 }, '四項權重'],
    ['interventions', '泛詞降權', { factor: 1.2, days: 7 }, '不得超過 1'],
    ['interventions', '臨時扶持', { factor: 0.8, days: 7 }, '不得低於 1'],
    ['interventions', '泛詞降權', { factor: 0.8, days: 14 }, '不得超過 7 天'],
    ['interventions', '精確準入', { days: 15 }, '不得超過 14 天'],
    ['guidance', '底紋詞', { start: '2026-11-07', end: '2026-11-01' }, '不得早於'],
    ['lexicon', '有向同義詞', { source: '漢堡', target: '漢堡' }, '不得相同'],
  ] as const)('表单边界：%s %s', (pane, kind, values, expected) => {
    expect(validateDraft(pane as RecordPane, kind, values)).toContain(expected)
  })
})
