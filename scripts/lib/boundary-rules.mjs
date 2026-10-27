/**
 * 依赖边界规则的纯函数层（无 fs）。
 *
 * 拆出来的原因与 impact-graph 相同：这条门禁守的是「公共层不得依赖业务页面」这一
 * 分系统独立工程的地基约束，必须能在不接触真实仓库的情况下把规则钉死。
 */

/** 公共层目录：被多个业务系统共用，不得反向依赖业务页面 */
export const SHARED_DIRS = ['components', 'contexts', 'hooks', 'utils', 'constants', 'api', 'styles', 'i18n', 'test']
/** 契约包（workspace 包）：必须是叶子，不得依赖 src/ 下任何业务或公共代码 */
export const CONTRACTS_PREFIX = 'frontend/packages/contracts/'
/** 契约目录允许的依赖方向：只允许包内互引 */
export const CONTRACT_FORBIDDEN = ['pages', 'components', 'contexts', 'hooks', 'utils', 'constants', 'api']

/** workspace 包前缀 → 包名（顺序即匹配优先级） */
export const PACKAGE_PREFIXES = [
  ['frontend/apps/rdm/', 'app-rdm'],
  ['frontend/apps/eam/', 'app-eam'],
  ['frontend/apps/hr/', 'app-hr'],
  ['frontend/packages/contracts/', 'contracts'],
  ['frontend/packages/i18n/', 'i18n'],
  ['frontend/packages/platform-client/', 'platform-client'],
  ['frontend/packages/ui/', 'ui'],
]

/**
 * 包依赖白名单（方案 §4.1/§4.3：公共包不得反向依赖业务，也不得互相成环）。
 * legacy = 仓库根 src/（过渡期应用壳），允许依赖所有包；包不允许依赖 legacy。
 */
export const PACKAGE_DEPS = {
  contracts: [],
  i18n: [],
  'platform-client': ['contracts', 'i18n'],
  ui: ['contracts', 'i18n', 'platform-client'],
  legacy: ['contracts', 'i18n', 'platform-client', 'ui', 'legacy', 'app-rdm', 'app-eam', 'app-hr'],
  'app-rdm': ['contracts', 'i18n', 'platform-client', 'ui'],
  'app-eam': ['contracts', 'i18n', 'platform-client', 'ui'],
  'app-hr': ['contracts', 'i18n', 'platform-client', 'ui'],
}

export function pkgOf(file) {
  for (const [prefix, name] of PACKAGE_PREFIXES) {
    if (file.startsWith(prefix)) return name
  }
  if (file.startsWith('src/')) return 'legacy'
  return null
}

export const SPEC_PATTERNS = [
  /\bfrom\s*['"]([^'"]+)['"]/g,
  /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
  /\bimport\s*['"]([^'"]+)['"]/g,
]

export function extractSpecifiers(code) {
  const specs = new Set()
  for (const re of SPEC_PATTERNS) {
    re.lastIndex = 0
    let m
    while ((m = re.exec(code))) specs.add(m[1])
  }
  return [...specs]
}

function joinPosix(fromDir, spec) {
  const out = []
  let escaped = false
  for (const p of `${fromDir}/${spec}`.split('/')) {
    if (!p || p === '.') continue
    if (p === '..') {
      if (!out.length) escaped = true
      else out.pop()
    } else out.push(p)
  }
  return escaped ? null : out.join('/')
}

/** import 别名 → 仓库内目录（与 tsconfig/vite/vitest 的 alias 保持一致，长前缀在前） */
const IMPORT_ALIASES = [
  ['@mftb/app-rdm/', 'frontend/apps/rdm/src/'],
  ['@mftb/contracts/', 'frontend/packages/contracts/src/'],
  ['@/api/', 'frontend/packages/platform-client/src/api/'],
  ['@/api', 'frontend/packages/platform-client/src/api'],
  ['@/contexts/', 'frontend/packages/platform-client/src/contexts/'],
  ['@/contexts', 'frontend/packages/platform-client/src/contexts'],
  ['@/utils/', 'frontend/packages/platform-client/src/utils/'],
  ['@/utils', 'frontend/packages/platform-client/src/utils'],
  ['@/components/', 'frontend/packages/ui/src/components/'],
  ['@/components', 'frontend/packages/ui/src/components'],
  ['@/hooks/', 'frontend/packages/ui/src/hooks/'],
  ['@/hooks', 'frontend/packages/ui/src/hooks'],
  ['@/styles/', 'frontend/packages/ui/src/styles/'],
  ['@/styles', 'frontend/packages/ui/src/styles'],
  ['@/assets/', 'frontend/packages/ui/src/assets/'],
  ['@/assets', 'frontend/packages/ui/src/assets'],
  ['@/i18n/', 'frontend/packages/i18n/src/i18n/'],
  ['@/i18n', 'frontend/packages/i18n/src/i18n'],
  ['@/constants/', 'frontend/packages/contracts/src/constants/'],
  ['@/constants', 'frontend/packages/contracts/src/constants'],
]

/** 把 import 说明符解析成仓库内相对路径；第三方包名与越出仓库根的路径返回 null */
export function toSrcRelative(spec, fromFile) {
  for (const [alias, dir] of IMPORT_ALIASES) {
    if (spec.startsWith(alias)) return `${dir}${spec.slice(alias.length)}`
  }
  if (spec.startsWith('@/')) return `src/${spec.slice(2)}`
  if (spec.startsWith('.')) {
    return joinPosix(fromFile.split('/').slice(0, -1).join('/'), spec)
  }
  return null
}

/** src/api/foo.ts → api ；src/pages/X/y.tsx → pages */
export function topSegment(srcPath) {
  const parts = srcPath.split('/')
  return parts.length > 1 ? parts[1] : ''
}

export const isTestFile = (f) => /\.(test|spec)\.(ts|tsx)$/.test(f)

/**
 * 计算越界清单。
 * @param {Array<{file:string, code:string}>} files 待检文件（file 为仓库相对路径）
 * @returns {Array<{file:string, imports:string, rule:string}>}
 */
export function evaluateViolations(files) {
  const violations = []
  for (const { file, code } of files) {
    const pkg = pkgOf(file)
    if (!pkg || isTestFile(file)) continue
    for (const spec of extractSpecifiers(code)) {
      const target = toSrcRelative(spec, file)
      if (!target) continue
      const tpkg = pkgOf(target)
      if (!tpkg || tpkg === pkg) continue
      if (!PACKAGE_DEPS[pkg].includes(tpkg)) {
        violations.push({ file, imports: target, rule: 'package-dep-violation', from: pkg, to: tpkg })
      }
    }
  }
  const seen = new Set()
  return violations.filter((v) => {
    const key = `${v.rule}|${v.file}|${v.imports}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

/**
 * 与棘轮基线比对：新增违规与「已修复却没删基线」都要报出来。
 * @param violations 当前实际违规
 * @param baseline  基线数组（{rule,file,imports}）
 */
export function diffAgainstBaseline(violations, baseline) {
  const keyOf = (v) => `${v.rule}|${v.file}|${v.imports}`
  const known = new Set(baseline.map(keyOf))
  const actual = new Set(violations.map(keyOf))
  return {
    added: violations.filter((v) => !known.has(keyOf(v))),
    stale: [...known].filter((k) => !actual.has(k)),
  }
}
