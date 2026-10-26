// @vitest-environment node
/**
 * 依赖边界规则单测（分系统独立工程改造方案 §4.1 / §八「依赖越界检查」）。
 *
 * 拆包后的规则是「包依赖白名单」：contracts / i18n 为叶子，platform-client 只依赖二者，
 * ui 可依赖前三者，legacy（仓库根 src/）可依赖所有包；任何包不得反向依赖 legacy 业务页面。
 * 这些方向必须能被固定住，否则按应用隔离会在某次顺手 import 里悄悄失效。
 */
import { describe, it, expect } from 'vitest'
import {
  evaluateViolations,
  diffAgainstBaseline,
  toSrcRelative,
  topSegment,
  pkgOf,
  CONTRACTS_PREFIX,
} from './boundary-rules.mjs'

const UI = 'frontend/packages/ui/src/components/X.tsx'
const UI_TEST = 'frontend/packages/ui/src/components/X.test.tsx'
const PC = 'frontend/packages/platform-client/src/api/x.ts'
const CONTRACT = `${CONTRACTS_PREFIX}src/menuPermission.ts`
const LEGACY_PAGE = 'src/pages/Rdm/List.tsx'

describe('toSrcRelative / topSegment / pkgOf', () => {
  it('别名与相对路径都能落到仓库内路径', () => {
    expect(toSrcRelative('@mftb/contracts/menuPermission', UI)).toBe(`${CONTRACTS_PREFIX}src/menuPermission`)
    expect(toSrcRelative('@/api/employee', LEGACY_PAGE)).toBe('frontend/packages/platform-client/src/api/employee')
    expect(toSrcRelative('../utils/sessionCaches', PC)).toBe('frontend/packages/platform-client/src/utils/sessionCaches')
  })

  it('第三方包名返回 null；越出仓库根的路径也返回 null（不参与判定）', () => {
    expect(toSrcRelative('antd', UI)).toBeNull()
    expect(toSrcRelative('../../../../../../outside.ts', UI)).toBeNull()
    // 仓库根内的非包路径可以解析出来，但不会命中任何包规则
    expect(toSrcRelative('../../../../../README.md', UI)).toBe('README.md')
  })

  it('包归属判定', () => {
    expect(pkgOf(UI)).toBe('ui')
    expect(pkgOf(PC)).toBe('platform-client')
    expect(pkgOf(CONTRACT)).toBe('contracts')
    expect(pkgOf(LEGACY_PAGE)).toBe('legacy')
    expect(pkgOf('package.json')).toBeNull()
    expect(topSegment('src/pages/Rdm/List.tsx')).toBe('pages')
  })
})

describe('evaluateViolations（包依赖白名单）', () => {
  it('ui 依赖 legacy 页面 → 越界（拆包要防的原始症状）', () => {
    const v = evaluateViolations([{ file: UI, code: `import Board from '@/pages/RdmDailyReportView'\n` }])
    expect(v).toEqual([{ file: UI, imports: 'src/pages/RdmDailyReportView', rule: 'package-dep-violation', from: 'ui', to: 'legacy' }])
  })

  it('测试文件允许直达页面，不制造噪音', () => {
    expect(evaluateViolations([{ file: UI_TEST, code: `import Portal from '@/pages/Portal'\n` }])).toEqual([])
  })

  it('platform-client 依赖 ui → 越界（反向成环）', () => {
    const v = evaluateViolations([{ file: PC, code: `import { confirmExternalCall } from '@/components/McpExternalConfirm'\n` }])
    expect(v[0].rule).toBe('package-dep-violation')
    expect(v[0].from).toBe('platform-client')
    expect(v[0].to).toBe('ui')
  })

  it('契约包是叶子：依赖 src/ 或别的包都算越界，包内互引不算', () => {
    const v = evaluateViolations([
      { file: CONTRACT, code: `import X from '@/pages/Rdm/List'\n` },
      { file: CONTRACT, code: `import { load } from '@/api/employee'\n` },
      { file: CONTRACT, code: `import { B } from './workflowConfig'\n` },
    ])
    expect(v.map((x) => x.to)).toEqual(['legacy', 'platform-client'])
  })

  it('允许方向不得误报：legacy→ui、ui→platform-client、platform-client→contracts', () => {
    const v = evaluateViolations([
      { file: LEGACY_PAGE, code: `import EmployeeSelect from '@/components/EmployeeSelect'\n` },
      { file: UI, code: `import { useAuth } from '@/contexts/AuthContext'\n` },
      { file: PC, code: `import { ROUTE_MENU_KEY_MAP } from '@mftb/contracts/menuPermission'\n` },
    ])
    expect(v).toEqual([])
  })

  it('动态 import 的页面引用同样算越界（不能靠写法绕过）', () => {
    const v = evaluateViolations([{ file: UI, code: `const P = () => import('@/pages/Rdm/DailyReport')\n` }])
    expect(v).toHaveLength(1)
    expect(v[0].rule).toBe('package-dep-violation')
  })

  it('同一文件重复引用同一目标只登记一条', () => {
    const v = evaluateViolations([{ file: PC, code: `import { A } from '@/pages/Rdm/a'\nimport { B } from '@/pages/Rdm/a'\n` }])
    expect(v).toHaveLength(1)
  })
})

describe('diffAgainstBaseline（双向棘轮）', () => {
  const violation = { file: PC, imports: 'src/pages/Rdm/a', rule: 'package-dep-violation', from: 'platform-client', to: 'legacy' }

  it('新增违规要报出来', () => {
    const { added, stale } = diffAgainstBaseline([violation], [])
    expect(added).toHaveLength(1)
    expect(stale).toHaveLength(0)
  })

  it('已修复却没从基线移除也要报（否则基线会静默腐坏成空壳门禁）', () => {
    const { added, stale } = diffAgainstBaseline([], [violation])
    expect(added).toHaveLength(0)
    expect(stale).toEqual(['package-dep-violation|frontend/packages/platform-client/src/api/x.ts|src/pages/Rdm/a'])
  })

  it('一致时两边都空', () => {
    const { added, stale } = diffAgainstBaseline([violation], [violation])
    expect(added).toHaveLength(0)
    expect(stale).toHaveLength(0)
  })
})
