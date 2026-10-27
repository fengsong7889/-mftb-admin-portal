/**
 * 站点装配的纯函数层（方案 §4.2）。
 *
 * 为什么单拆一层：装配规则决定「哪些产物可以直接复用、哪些必须重建、回滚按什么校验」，
 * 这属于发布安全逻辑，必须能在不碰真实 dist 的情况下被测试固定住。
 *
 * 输入都是 build-site-manifest.mjs 产出的清单（app → chunks[{file,sha256,bytes}]）。
 */

/** 从清单里取出某应用的 chunk 索引：file → sha256 */
export function indexAppChunks(manifest, app) {
  const out = new Map()
  const chunks = manifest?.apps?.[app]?.chunks ?? []
  for (const c of chunks) out.set(c.file, c.sha256)
  return out
}

/**
 * 计算装配计划：上一版清单 + 本次构建清单 → 每个应用的处置。
 *
 * 规则（保守优先）：
 * - 新应用 / 新增 chunk → build（必须取本次产物）
 * - 同名文件且 sha256 相同 → reuse（可复用已验证产物）
 * - 同名文件但 sha256 不同 → rebuild（内容变了，禁止混用旧文件）
 * - 上一版存在、本次消失的文件 → drop（显式记录，避免残留旧 chunk 造成新旧混装）
 */
export function planAssembly(previous, current) {
  const apps = new Set([...Object.keys(previous?.apps ?? {}), ...Object.keys(current?.apps ?? {})])
  const plan = {}
  for (const app of [...apps].sort()) {
    const prev = indexAppChunks(previous, app)
    const next = indexAppChunks(current, app)
    const reused = []
    const rebuilt = []
    const dropped = []
    for (const [file, sha] of next) {
      if (prev.get(file) === sha) reused.push(file)
      else rebuilt.push(file)
    }
    for (const file of prev.keys()) {
      if (!next.has(file)) dropped.push(file)
    }
    const action = !prev.size ? 'build' : rebuilt.length === 0 && dropped.length === 0 ? 'reuse' : 'rebuild'
    plan[app] = { action, reused: reused.sort(), rebuilt: rebuilt.sort(), dropped: dropped.sort() }
  }
  return plan
}

/**
 * 校验一份清单自身的一致性：不得出现空 file、不得重复登记同一文件、
 * sha256 必须是 64 位十六进制（否则「摘要校验」形同虚设）。
 *
 * @returns {string[]} 问题列表（空数组 = 通过）
 */
export function validateManifest(manifest) {
  const problems = []
  const seen = new Set()
  for (const [app, data] of Object.entries(manifest?.apps ?? {})) {
    if (!Array.isArray(data.chunks) || data.chunks.length === 0) {
      problems.push(`${app}: 没有登记任何 chunk`)
      continue
    }
    for (const c of data.chunks) {
      if (!c.file) problems.push(`${app}: chunk 缺少 file`)
      if (!/^[0-9a-f]{64}$/.test(c.sha256 ?? '')) problems.push(`${app}/${c.file}: sha256 非法`)
      if (seen.has(c.file)) problems.push(`${app}/${c.file}: 同一文件被多个应用重复登记`)
      seen.add(c.file)
    }
  }
  if (!Object.keys(manifest?.apps ?? {}).length) problems.push('清单未包含任何应用')
  return problems
}
