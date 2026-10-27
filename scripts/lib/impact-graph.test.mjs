// @vitest-environment node
/**
 * 影响域分析器单测（分系统独立工程改造方案 §十「影响分析单元测试」）。
 *
 * 覆盖：单系统变更、多跳依赖、别名/动态 import/vi.mock 解析、删除与重命名、
 * 0 测试覆盖缺口、共享层全局升档、后端扩散失控升档。
 * 全部用内存 fixture，不碰真实仓库 —— 否则这些规则只能靠「在真仓上跑一次」来保证。
 */
import { describe, it, expect } from 'vitest'
import {
  GLOBAL_FE,
  GLOBAL_BE,
  GLOBAL_BOTH,
  classify,
  resolveSpecifier,
  extractSpecifiers,
  buildFrontendGraph,
  frontendAffectedTests,
  buildBackendGraph,
  backendAffectedTests,
  computeCoverageGaps,
  isFrontendBusinessFile,
  isBackendBusinessFile,
} from './impact-graph.mjs'

/** 构造一个最小前端仓库：两个互不相干的系统 + 一个共享 api */
function fixtureRepo() {
  const files = {
    'frontend/packages/platform-client/src/api/sharedUser.ts': `export const load = () => {}\n`,
    'src/pages/Rdm/List.tsx': `import { load } from '@/api/sharedUser'\nexport default function L(){return null}\n`,
    'src/pages/Rdm/List.test.tsx': `import L from './List'\nimport { load } from '@/api/sharedUser'\n`,
    'src/pages/Eam/List.tsx': `import { load } from '@/api/sharedUser'\nexport default function E(){return null}\n`,
    'src/pages/Eam/List.test.tsx': `import E from './List'\n`,
    'src/pages/Eam/Detail.tsx': `import E from './List'\n`,
    'src/pages/Eam/Detail.test.tsx': `import D from './Detail'\n`,
  }
  const list = Object.keys(files)
  return { files, list, read: (f) => files[f] ?? '', isFile: (p) => p in files }
}

/** 后端 fixture 路径常量（跨 describe 共用） */
const MAIN = 'backend/modules/legacy/src/main/java/com/mftb/admin'
const TEST = 'backend/bootstrap/src/test/java/com/mftb/admin'

describe('resolveSpecifier / extractSpecifiers', () => {
  it('解析 @/ 别名与相对路径，忽略第三方包名', () => {
    const { isFile } = fixtureRepo()
    expect(resolveSpecifier('@/api/sharedUser', 'src/pages/Rdm/List.tsx', isFile))
      .toBe('frontend/packages/platform-client/src/api/sharedUser.ts')
    expect(resolveSpecifier('./List', 'src/pages/Rdm/List.test.tsx', isFile)).toBe('src/pages/Rdm/List.tsx')
    expect(resolveSpecifier('react', 'src/pages/Rdm/List.tsx', isFile)).toBeNull()
  })

  it('动态 import() 与 vi.mock 的说明符都要进依赖图', () => {
    const specs = extractSpecifiers(
      `const X = lazy(() => import('./Heavy'))\nvi.mock('../MeetingManagement/EmployeeSelect', () => ({}))\n`,
    )
    expect(specs).toContain('./Heavy')
    expect(specs).toContain('../MeetingManagement/EmployeeSelect')
  })
})

describe('前端影响域', () => {
  it('改共享 api 只波及引用链上的测试，不选不相关系统的', () => {
    const { list, read } = fixtureRepo()
    const reverse = buildFrontendGraph(list, read)
    const tests = frontendAffectedTests(['frontend/packages/platform-client/src/api/sharedUser.ts'], reverse)
    // sharedUser ← Rdm/List 与 Eam/List；Eam/Detail 又透依赖 Eam/List，所以三个测试都在链上
    expect([...tests].sort()).toEqual([
      'src/pages/Eam/Detail.test.tsx',
      'src/pages/Eam/List.test.tsx',
      'src/pages/Rdm/List.test.tsx',
    ])
  })

  it('改私有页面只选中自己的测试，不牵动另一个系统', () => {
    const { list, read } = fixtureRepo()
    const reverse = buildFrontendGraph(list, read)
    const tests = frontendAffectedTests(['src/pages/Eam/Detail.tsx'], reverse)
    expect([...tests]).toEqual(['src/pages/Eam/Detail.test.tsx'])
  })

  it('多跳：改底层文件要沿反向边追到间接引用的测试', () => {
    const { list, read } = fixtureRepo()
    const reverse = buildFrontendGraph(list, read)
    // List.tsx ← List.test.tsx（直接）以及 List.tsx ← Detail.tsx ← Detail.test.tsx（两跳）
    const tests = frontendAffectedTests(['src/pages/Eam/List.tsx'], reverse)
    expect([...tests].sort()).toEqual(['src/pages/Eam/Detail.test.tsx', 'src/pages/Eam/List.test.tsx'])
  })

  it('删除/未知文件不炸，也不会凭空选出测试', () => {
    const { list, read } = fixtureRepo()
    const reverse = buildFrontendGraph(list, read)
    expect(() => frontendAffectedTests(['src/pages/Gone/Index.tsx'], reverse)).not.toThrow()
    expect(frontendAffectedTests(['src/pages/Gone/Index.tsx'], reverse).size).toBe(0)
  })
})

describe('共享层升档', () => {
  it('前端共享层、后端共享层、工程链路各自命中即升档', () => {
    const cls = classify([
      'frontend/packages/ui/src/components/EmployeeSelect.tsx',
      'frontend/packages/contracts/src/menuPermission.ts',
      'backend/src/main/java/com/mftb/admin/entity/SysUser.java',
      'backend/sql/302_x.sql',
      '.github/workflows/deploy.yml',
      'src/pages/Rdm/List.tsx',
    ])
    expect(cls.feGlobal).toContain('frontend/packages/ui/src/components/EmployeeSelect.tsx')
    expect(cls.feGlobal).toContain('frontend/packages/contracts/src/menuPermission.ts')
    expect(cls.beGlobal).toContain('backend/src/main/java/com/mftb/admin/entity/SysUser.java')
    expect(cls.beGlobal).toContain('backend/sql/302_x.sql')
    expect(cls.bothGlobal).toContain('.github/workflows/deploy.yml')
    // 私有页面不属于任何共享层：不该被误升档
    expect(cls.feGlobal.concat(cls.beGlobal, cls.bothGlobal)).not.toContain('src/pages/Rdm/List.tsx')
  })

  it('规则表本身不可被悄悄删空（安全网：删一条就会让这个门禁形同虚设）', () => {
    // 拆包后共享层收敛为「入口文件 + 整个 frontend/packages」，条目数变少但覆盖面不变
    expect(GLOBAL_FE.length).toBeGreaterThanOrEqual(8)
    expect(GLOBAL_FE.some((re) => re.test('frontend/packages/ui/src/components/X.tsx'))).toBe(true)
    expect(GLOBAL_BE.length).toBeGreaterThan(8)
    expect(GLOBAL_BOTH.length).toBeGreaterThanOrEqual(4)
  })
})

describe('后端影响域', () => {
  const files = {
    [`${MAIN}/service/impl/AdOrderServiceImpl.java`]: `public class AdOrderServiceImpl {}\n`,
    [`${MAIN}/service/impl/RdmRequirementServiceImpl.java`]: `public class RdmRequirementServiceImpl {}\n`,
    [`${MAIN}/util/BizSeqService.java`]: `import com.mftb.admin.service.impl.AdOrderServiceImpl;\npublic class BizSeqService {}\n`,
    [`${TEST}/AdOrderTest.java`]: `import com.mftb.admin.service.impl.AdOrderServiceImpl;\npublic class AdOrderTest {}\n`,
    [`${TEST}/RdmRequirementTest.java`]: `import com.mftb.admin.service.impl.RdmRequirementServiceImpl;\npublic class RdmRequirementTest {}\n`,
  }
  const list = Object.keys(files)
  const read = (f) => files[f] ?? ''

  it('改广告实现只选广告测试，不牵动产研测试', () => {
    const graph = buildBackendGraph(list, read)
    const { selected } = backendAffectedTests([`${MAIN}/service/impl/AdOrderServiceImpl.java`], graph, list, { hops: 2 })
    expect([...selected]).toEqual([`${TEST}/AdOrderTest.java`])
  })

  it('hops=0 时不扩散，只保留变更文件自身是测试的部分', () => {
    const graph = buildBackendGraph(list, read)
    const { selected } = backendAffectedTests([`${MAIN}/util/BizSeqService.java`], graph, list, { hops: 0 })
    expect(selected.size).toBe(0)
  })

  it('重命名后的旧类名不在图中：不抛异常，selected 为空', () => {
    const graph = buildBackendGraph(list, read)
    const { selected, exploded } = backendAffectedTests([`${MAIN}/service/impl/GoneServiceImpl.java`], graph, list, { hops: 2 })
    expect(selected.size).toBe(0)
    expect(exploded).toBe(false)
  })

  it('扩散失控必须被标记 exploded，交给调用方升档全量（fail-closed）', () => {
    // 造一条长链：Chain0 ← Chain1 ← … ← Chain9，hops 大、explodeLimit 小
    const chainFiles = {}
    for (let i = 0; i < 10; i++) {
      const imports = i > 0 ? `import com.mftb.admin.service.impl.Chain${i - 1};\n` : ''
      chainFiles[`${MAIN}/service/impl/Chain${i}.java`] = `${imports}public class Chain${i} {}\n`
    }
    chainFiles[`${TEST}/ChainTest.java`] = `import com.mftb.admin.service.impl.Chain9;\npublic class ChainTest {}\n`
    const l = Object.keys(chainFiles)
    const graph = buildBackendGraph(l, (f) => chainFiles[f] ?? '')
    const r = backendAffectedTests([`${MAIN}/service/impl/Chain0.java`], graph, l, { hops: 20, explodeLimit: 3 })
    expect(r.exploded).toBe(true)
  })
})

describe('覆盖缺口（0 测试不得当成已验证）', () => {
  it('有业务源码变更但选不到测试 → 报缺口', () => {
    const gaps = computeCoverageGaps({
      feBusinessFiles: ['src/pages/Rdm/List.tsx'],
      beBusinessFiles: [],
      frontendFull: false,
      frontendTestCount: 0,
    })
    expect(gaps).toHaveLength(1)
    expect(gaps[0].side).toBe('frontend')
  })

  it('升档全量时不算缺口（全量必然覆盖到）', () => {
    const gaps = computeCoverageGaps({
      feBusinessFiles: ['src/components/EmployeeSelect.tsx'],
      frontendFull: true,
      frontendTestCount: 0,
    })
    expect(gaps).toHaveLength(0)
  })

  it('测试文件与样式/资源不算业务变更，不制造噪音缺口', () => {
    expect(isFrontendBusinessFile('src/pages/Rdm/List.test.tsx')).toBe(false)
    expect(isFrontendBusinessFile('src/pages/Rdm/index.css')).toBe(false)
    expect(isFrontendBusinessFile('src/pages/Rdm/List.tsx')).toBe(true)
    // 拆包后共享包内的业务源码同样算「有业务改动」
    expect(isFrontendBusinessFile('frontend/packages/platform-client/src/api/employee.ts')).toBe(true)
    expect(isFrontendBusinessFile('frontend/packages/ui/src/components/EmployeeSelect.test.tsx')).toBe(false)
    expect(isBackendBusinessFile(`${TEST}/AdOrderTest.java`)).toBe(false)
    expect(isBackendBusinessFile(`${MAIN}/service/impl/AdOrderServiceImpl.java`)).toBe(true)
  })

  it('后端同理：改了生产类却没有可选测试类 → 报缺口', () => {
    const gaps = computeCoverageGaps({
      beBusinessFiles: [`${MAIN}/service/impl/AdOrderServiceImpl.java`],
      backendFull: false,
      backendTestCount: 0,
    })
    expect(gaps).toHaveLength(1)
    expect(gaps[0].side).toBe('backend')
  })
})
