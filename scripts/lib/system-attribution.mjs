/**
 * 变更文件的系统归属（纯函数，无 fs）。
 *
 * 用途：把「这次改动碰到了哪些系统」算出来，供影响域分析与 CI 影响矩阵使用。
 * 真值来自 engineering/systems.json（前端页面目录归属 + 后端类名前缀归属），
 * 因此新增页面/类而没登记归属时，会落到 unattributed 而不是被静默忽略 ——
 * 与 check:registry 的双向棘轮配套，归属清单不会悄悄失真。
 */

const JAVA_PKG = 'backend/src/main/java/com/mftb/admin/'

/** 后端类名前缀：与 engineering 生成器同口径（文件名首个大写字母段） */
function javaPrefixOf(file) {
  const base = file.split('/').pop().replace(/\.java$/, '')
  const m = base.match(/^([A-Z][a-z0-9]*)/)
  return m ? m[1] : null
}

function frontendDirOf(file) {
  if (file.startsWith('src/pages/')) return file.split('/')[2] ?? null
  const m = file.match(/^frontend\/apps\/[^/]+\/src\/pages\/([^/]+)/)
  return m ? m[1] : null
}

/**
 * @param {string[]} changed 仓库相对路径
 * @param {object} registry  engineering/systems.json 解析结果
 */
export function attributeFiles(changed, registry) {
  const systems = registry?.systems ?? {}
  // 反查表：前端目录 → 系统；后端前缀 → 系统
  const dirToSystems = new Map()
  const prefixToSystems = new Map()
  for (const [code, sys] of Object.entries(systems)) {
    for (const dir of Object.keys(sys.frontendDirs ?? {})) {
      if (!dirToSystems.has(dir)) dirToSystems.set(dir, [])
      dirToSystems.get(dir).push(code)
    }
    for (const p of Object.keys(sys.backendPrefixes ?? {})) {
      if (!prefixToSystems.has(p)) prefixToSystems.set(p, [])
      prefixToSystems.get(p).push(code)
    }
  }
  const unattrDirs = new Set((registry?.unattributed?.frontendDirs ?? []).map((x) => x.dir ?? x))
  const unattrPrefixes = new Set(Object.keys(registry?.unattributed?.backendPrefixes ?? {}))

  const touched = new Map()
  const shared = []
  const unattributed = []

  const bump = (code, bucket, file) => {
    if (!touched.has(code)) touched.set(code, { frontend: 0, backend: 0, files: [] })
    const row = touched.get(code)
    if (bucket !== 'none') row[bucket] += 1
    if (row.files.length < 20) row.files.push(file)
  }

  for (const file of changed) {
    const dir = frontendDirOf(file)
    if (dir) {
      const owners = dirToSystems.get(dir) ?? []
      if (owners.length === 1) bump(owners[0], 'frontend', file)
      else if (owners.length > 1) owners.forEach((c) => bump(c, 'frontend', file))
      else if (unattrDirs.has(dir)) unattributed.push({ file, reason: `页面目录 ${dir} 未归属` })
      else shared.push({ file, reason: `公共页面层 ${dir}` })
      continue
    }
    if (file.startsWith('src/') || file.startsWith('frontend/')) {
      shared.push({ file, reason: file.startsWith('frontend/packages/') ? '共享 workspace 包' : '前端公共层' })
      continue
    }
    if (file.startsWith(JAVA_PKG)) {
      const rest = file.slice(JAVA_PKG.length)
      // 只有生产/测试源码参与归属；resources 等另计
      if (rest.endsWith('.java') && !rest.startsWith('resources')) {
        const prefix = javaPrefixOf(rest)
        const owners = prefix ? prefixToSystems.get(prefix) ?? [] : []
        if (owners.length >= 1) owners.forEach((c) => bump(c, 'backend', file))
        else if (prefix && unattrPrefixes.has(prefix)) unattributed.push({ file, reason: `后端前缀 ${prefix}* 未归属` })
        else unattributed.push({ file, reason: '后端类未归属' })
        continue
      }
    }
    if (file.startsWith('backend/')) {
      shared.push({ file, reason: '后端公共/配置/SQL' })
      continue
    }
    shared.push({ file, reason: '工程配置' })
  }

  const skipped = Object.keys(systems).filter((c) => !touched.has(c)).sort()
  return {
    touched: Object.fromEntries([...touched.entries()].sort()),
    skipped,
    sharedFiles: shared.length,
    unattributed,
  }
}

/**
 * 汇总成 CI 可直接消费的矩阵（方案 §八：测试范围与待发布产物范围分别输出）。
 * 本期后端仍是单个部署单元，因此 releaseUnits 只有「整包 JAR」一项，
 * 不伪装成按系统独立发布（方案 §一明确限制）。
 */
export function buildImpactMatrix(attribution, { frontendFull, backendFull, isolated }) {
  const touchedSystems = Object.keys(attribution.touched)
  const releaseUnits = []
  if (touchedSystems.length || attribution.sharedFiles) {
    releaseUnits.push(isolated?.frontend ? 'frontend/apps/*（按系统）' : 'frontend: 单一站点产物')
  }
  if (backendFull || touchedSystems.length) {
    releaseUnits.push('backend: mftb-admin.jar（单体，本期不按系统发布）')
  }
  return {
    testScope: {
      frontend: frontendFull ? 'FULL' : touchedSystems.length ? '影响域' : '无需',
      backend: backendFull ? 'FULL' : '影响域',
      systems: touchedSystems,
      skippedSystems: attribution.skipped,
    },
    releaseUnits,
    unattributedFiles: attribution.unattributed,
  }
}
