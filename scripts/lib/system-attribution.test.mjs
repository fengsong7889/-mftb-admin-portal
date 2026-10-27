// @vitest-environment node
/**
 * 系统归属与影响矩阵单测（方案 §十「影响分析单元测试」的跨语言部分）。
 *
 * 关注点：前端页面目录与后端类名前缀都要能归到系统；归不进去时必须显式落到 unattributed，
 * 绝不能被静默当成「没碰到任何系统」——那会让 CI 矩阵漏掉真实影响。
 */
import { describe, it, expect } from 'vitest'
import { attributeFiles, buildImpactMatrix } from './system-attribution.mjs'

const registry = {
  systems: {
    rdm: {
      isolation: { frontend: 'pending', backend: 'pending' },
      frontendDirs: { Rdm: { evidence: 'menu-route' }, RdmDailyReportView: { evidence: 'naming' } },
      backendPrefixes: { Rdm: 267 },
      planned: { frontendApp: 'frontend/apps/rdm', backendModule: 'backend/modules/rdm' },
    },
    eam: {
      isolation: { frontend: 'pending', backend: 'pending' },
      frontendDirs: { AssetManagement: { evidence: 'menu-route' } },
      backendPrefixes: { Eam: 268 },
      planned: { frontendApp: 'frontend/apps/eam', backendModule: 'backend/modules/eam' },
    },
    iam: {
      isolation: { frontend: 'pending', backend: 'pending' },
      // 多系统共享目录：同一目录被两个系统登记时，两边都算被触碰
      frontendDirs: { Permission: { evidence: 'menu-route' } },
      backendPrefixes: { Role: 6 },
      planned: {},
    },
    hr: {
      isolation: { frontend: 'pending', backend: 'pending' },
      frontendDirs: { Permission: { evidence: 'menu-route' } },
      backendPrefixes: { Hr: 139 },
      planned: {},
    },
  },
  unattributed: {
    frontendDirs: [{ dir: 'AppPreview', reason: '待确认' }],
    backendPrefixes: { Zzz: 3 },
  },
}

describe('attributeFiles', () => {
  it('前端页面目录与后端类名前缀分别归到对应系统', () => {
    const r = attributeFiles(
      ['src/pages/Rdm/TaskForm.tsx', 'backend/modules/legacy/src/main/java/com/mftb/admin/service/impl/EamPurchaseServiceImpl.java'],
      registry,
    )
    expect(r.touched.rdm).toEqual({ frontend: 1, backend: 0, files: ['src/pages/Rdm/TaskForm.tsx'] })
    expect(r.touched.eam.backend).toBe(1)
    // hr / iam 只持有 Permission 目录，本次没碰到，应出现在跳过列表
    expect(r.skipped).toEqual(['hr', 'iam'])
  })

  it('多系统共享目录同时算进每个拥有者（不能只算第一个就漏掉另一个）', () => {
    const r = attributeFiles(['src/pages/Permission/RoleList.tsx'], registry)
    expect(Object.keys(r.touched).sort()).toEqual(['hr', 'iam'])
  })

  it('未归属的页面目录/后端前缀必须显式落到 unattributed，而不是被忽略', () => {
    const r = attributeFiles(
      ['src/pages/AppPreview/Index.tsx', 'backend/modules/legacy/src/main/java/com/mftb/admin/service/impl/ZzzJob.java'],
      registry,
    )
    expect(Object.keys(r.touched)).toEqual([])
    expect(r.unattributed).toHaveLength(2)
    expect(r.unattributed[0].reason).toContain('AppPreview')
    expect(r.unattributed[1].reason).toContain('Zzz')
  })

  it('公共层与工程配置计入 sharedFiles，不冒充业务系统影响', () => {
    const r = attributeFiles(
      ['src/components/EmployeeSelect.tsx', 'backend/pom.xml', '.github/workflows/deploy.yml'],
      registry,
    )
    expect(Object.keys(r.touched)).toEqual([])
    expect(r.sharedFiles).toBe(3)
    expect(r.unattributed).toEqual([])
  })

  it('空归属表（登记表缺失/未生成）不得抛异常，全部落未归属或共享', () => {
    expect(() => attributeFiles(['src/pages/Rdm/X.tsx'], null)).not.toThrow()
    const r = attributeFiles(['src/pages/Rdm/X.tsx'], {})
    expect(Object.keys(r.touched)).toEqual([])
  })
})

describe('buildImpactMatrix', () => {
  it('升档全量时测试范围标 FULL，产物范围含单体 JAR', () => {
    const attr = attributeFiles(['src/pages/Rdm/TaskForm.tsx'], registry)
    const m = buildImpactMatrix(attr, { frontendFull: true, backendFull: false, isolated: { frontend: false, backend: false } })
    expect(m.testScope.frontend).toBe('FULL')
    expect(m.testScope.systems).toEqual(['rdm'])
    expect(m.releaseUnits.some((u) => u.includes('mftb-admin.jar'))).toBe(true)
    // 本期未独立：不得声称按系统产物发布
    expect(m.releaseUnits.join(' ')).toContain('单一站点产物')
  })

  it('跳过列表要输出，供 CI 矩阵显示「未触碰系统」', () => {
    const attr = attributeFiles(['src/pages/Rdm/TaskForm.tsx'], registry)
    const m = buildImpactMatrix(attr, { frontendFull: false, backendFull: false, isolated: {} })
    expect(m.testScope.skippedSystems).toContain('eam')
  })
})
