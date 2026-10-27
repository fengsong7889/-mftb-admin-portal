/**
 * §六 回归门槛映射的纯函数单测：固定住「集合缩水必须失败」这条规则。
 */
import { describe, expect, it } from 'vitest'
import { bucketOf, evaluateRegressionMap, matchesAny } from './regression-map.mjs'

const config = {
  floors: { backend: 2, frontend: 1, scripts: 0 },
  categories: [
    {
      key: 'rdm',
      title: 'RDM',
      require: { backend: 1, frontend: 1 },
      patterns: { backend: ['rdm'], frontend: ['frontend/apps/rdm'] },
    },
    {
      key: 'release',
      title: '前端版本',
      require: { frontend: 1 },
      patterns: { frontend: ['version'] },
    },
  ],
}

const files = [
  'backend/bootstrap/src/test/java/com/mftb/admin/service/RdmFlowTest.java',
  'backend/bootstrap/src/test/java/com/mftb/admin/service/AuthTest.java',
  'frontend/apps/rdm/src/pages/Rdm/index.test.tsx',
  'src/pages/VersionUpdateNotification.test.tsx',
]

describe('regression-map', () => {
  it('按路径前缀分桶', () => {
    expect(bucketOf('backend/x/FooTest.java')).toBe('backend')
    expect(bucketOf('scripts/lib/a.test.mjs')).toBe('scripts')
    expect(bucketOf('frontend/apps/rdm/a.test.tsx')).toBe('frontend')
    expect(bucketOf('src/pages/a.test.tsx')).toBe('frontend')
  })

  it('pattern 为小写包含匹配', () => {
    expect(matchesAny('frontend/apps/RDM/x.test.tsx', ['frontend/apps/rdm'])).toBe(true)
    expect(matchesAny('src/pages/Other.test.tsx', ['rdm'])).toBe(false)
  })

  it('类别命中满足 require 时通过', () => {
    const r = evaluateRegressionMap(files, config)
    expect(r.problems).toEqual([])
    expect(r.counts).toEqual({ backend: 2, frontend: 2, scripts: 0 })
    expect(r.categories.find((c) => c.key === 'rdm')?.counts).toEqual({ backend: 1, frontend: 1, scripts: 0 })
  })

  it('某类保护对象的测试被删空 → 报「回归集合不足」', () => {
    const r = evaluateRegressionMap(files.filter((f) => !f.includes('/rdm/')), config)
    expect(r.problems.some((p) => p.includes('「rdm」'))).toBe(true)
    expect(r.categories.find((c) => c.key === 'rdm')?.ok).toBe(false)
  })

  it('测试文件总数下降 → 报 floors 违约（方案要求测试数不减少）', () => {
    const r = evaluateRegressionMap([files[0]], config)
    expect(r.problems.some((p) => p.includes('测试文件总数下降'))).toBe(true)
  })

  it('类别里未声明的桶不参与判定（例如只要求前端）', () => {
    const r = evaluateRegressionMap(
      [
        'backend/bootstrap/src/test/java/com/mftb/admin/service/RdmFlowTest.java',
        'backend/bootstrap/src/test/java/com/mftb/admin/service/AuthTest.java',
        'frontend/apps/rdm/src/pages/Rdm/index.test.tsx',
        'src/pages/VersionUpdateNotification.test.tsx',
      ],
      config,
    )
    const release = r.categories.find((c) => c.key === 'release')
    expect(release?.require.backend).toBeUndefined()
    expect(release?.ok).toBe(true)
  })
})
