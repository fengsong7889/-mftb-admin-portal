/**
 * 方案 §六「稳定性与业务回归门槛」的评估逻辑（纯函数，可单测）。
 *
 * 为什么要把「表格」变成代码：§六 列了 8 类保护对象必须验证的路径，但如果只写在文档里，
 * 删掉某个域的测试、或把测试挪走后没人会发现。这里把每类对象映射到真实测试文件，
 * 并给出两个失败条件：
 *   1) 某类对象的命中数低于 require（该保护的回归集合空了）；
 *   2) 测试文件总数低于 floors（方案要求「测试数和安全门禁没有减少」）。
 *
 * 只做文件级归属，不解析用例内容——用例是否真的覆盖业务路径由各域测试自己负责；
 * 这里保证的是「回归集合存在且没有静默缩水」。
 */

/** 路径 → 桶：backend / scripts / frontend */
export function bucketOf(file) {
  if (file.startsWith('backend/')) return 'backend'
  if (file.startsWith('scripts/')) return 'scripts'
  return 'frontend'
}

/** 一条路径是否命中某类对象的 patterns（小写包含匹配） */
export function matchesAny(file, patterns) {
  const lower = file.toLowerCase()
  return (patterns ?? []).some((p) => p && lower.includes(String(p).toLowerCase()))
}

/**
 * @param {string[]} files 相对仓库根的测试文件路径
 * @param {object} config engineering/regression-gates.json
 * @returns {{counts: object, categories: object[], problems: string[]}}
 */
export function evaluateRegressionMap(files, config) {
  const counts = { backend: 0, frontend: 0, scripts: 0 }
  const byBucket = { backend: [], frontend: [], scripts: [] }
  for (const f of files ?? []) {
    const b = bucketOf(f)
    counts[b] = (counts[b] ?? 0) + 1
    byBucket[b].push(f)
  }

  const problems = []
  for (const [bucket, floor] of Object.entries(config?.floors ?? {})) {
    if ((counts[bucket] ?? 0) < floor) {
      problems.push(`测试文件总数下降：${bucket} 现有 ${counts[bucket] ?? 0}，基线 ${floor}（删/挪测试必须同步改基线并说明）`)
    }
  }

  const categories = []
  for (const cat of config?.categories ?? []) {
    const counts_ = { backend: 0, frontend: 0, scripts: 0 }
    const samples = []
    for (const bucket of ['backend', 'frontend', 'scripts']) {
      const patterns = cat.patterns?.[bucket] ?? []
      if (!patterns.length) continue
      for (const f of byBucket[bucket]) {
        if (!matchesAny(f, patterns)) continue
        counts_[bucket] += 1
        if (samples.length < 4) samples.push(f)
      }
    }
    const require_ = cat.require ?? {}
    const ok = Object.entries(require_).every(([bucket, min]) => (counts_[bucket] ?? 0) >= (min ?? 0))
    categories.push({ key: cat.key, title: cat.title, counts: counts_, require: require_, samples, ok })
    if (!ok) {
      const missing = Object.entries(require_)
        .filter(([bucket, min]) => (counts_[bucket] ?? 0) < (min ?? 0))
        .map(([bucket, min]) => `${bucket} 需 ≥${min}，实际 ${counts_[bucket] ?? 0}`)
      problems.push(`保护对象「${cat.key}」回归集合不足：${missing.join('；')}`)
    }
  }

  return { counts, categories, problems }
}
