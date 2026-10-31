import { describe, expect, it } from 'vitest'
import { LEAF_ROUTES, leafConfigFor, leafMenuName } from './leafRoutes'
import type { MenuVO } from '@/api/menu'
import { isRecordPane, KINDS } from './prototypeData'

/**
 * 菜单融合第一阶段的映射契约：路径、菜单 key 与能力域三者一旦漂移，
 * 页面会静默渲染到错误的菜单下，故在此锁死。
 */
describe('SearchV2 菜单叶子融合映射', () => {
  it('每个叶子的 path 与 menuKey 唯一，且 pane 合法', () => {
    expect(new Set(LEAF_ROUTES.map(l => l.path)).size).toBe(LEAF_ROUTES.length)
    expect(new Set(LEAF_ROUTES.map(l => l.menuKey)).size).toBe(LEAF_ROUTES.length)
    LEAF_ROUTES.forEach(l => {
      expect(l.path.startsWith('/')).toBe(true)
      expect(isRecordPane(l.pane as never) || ['lab', 'overview'].includes(l.pane)).toBe(true)
    })
  })

  it('kinds 必须是该能力域枚举的子集，且同一域多叶子之间不重叠（共用一表但要边界清晰）', () => {
    const seen = new Map<string, Set<string>>()
    LEAF_ROUTES.forEach(l => {
      if (!l.kinds) return
      l.kinds.forEach(kind => {
        expect(KINDS[l.pane as keyof typeof KINDS]).toContain(kind)
        const owner = `${l.pane}:${kind}`
        expect(seen.has(owner), `类型 ${kind} 被多个叶子重复承载`).toBe(false)
        seen.set(owner, new Set([l.path]))
      })
    })
  })

  it('leafConfigFor 只命中已融合路径，未融合叶子返回 undefined 以保留原页面', () => {
    expect(leafConfigFor('/hint-config')?.pane).toBe('guidance')
    expect(leafConfigFor('/hot-search-library')).toBeUndefined()
    expect(leafConfigFor('/global-config')).toBeUndefined()
  })

  it('leafMenuName 按 menuKey 取菜单真值；取不到时返回 null 而非编造名称', () => {
    const tree = [{ menuKey: 'search-guide', name: '搜索引導', children: [
      { menuKey: 'hint-config', name: '底紋配置' },
    ] }] as unknown as MenuVO[]
    expect(leafMenuName(tree, 'hint-config')).toBeTruthy()
    expect(leafMenuName(tree, 'not-a-menu')).toBeNull()
    expect(leafMenuName(null, 'hint-config')).toBeNull()
  })
})
