/**
 * 多份按应用产物清单的合并与冲突校验（方案 §4.2）。
 *
 * 场景：`dist-apps/<app>` 各自是一份独立构建产物，装配时要把「目标应用的新产物」
 * 与「其它应用已验证的旧产物」组合起来。组合前必须回答两个问题：
 *   1) 每份清单自身是否一致（复用 validateManifest）；
 *   2) 合并后是否存在同名文件但摘要不同（跨应用冲突，禁止混装）。
 *
 * 文件键统一加应用前缀（`<app>/<file>`）：各应用产物目录独立，压缩后同名
 * `assets/index-xxx.js` 很常见，不加前缀会把两份不同内容当成同一份。
 */

/**
 * @param {Array<object>} manifests build-site-manifest.mjs 产出的单应用清单
 * @returns {{manifest: object, conflicts: string[]}}
 */
export function mergeAppManifests(manifests) {
  const apps = {}
  const conflicts = []
  const seen = new Map() // `<app>/<file>` → sha256
  const documents = []

  for (const m of manifests ?? []) {
    for (const [app, data] of Object.entries(m?.apps ?? {})) {
      if (!apps[app]) apps[app] = { fileCount: 0, totalBytes: 0, entries: [], chunks: [] }
      const target = apps[app]
      for (const c of data?.chunks ?? []) {
        const file = `${app}/${c.file}`
        const prev = seen.get(file)
        if (prev !== undefined && prev !== c.sha256) {
          conflicts.push(`${file}: 两份产物给出不同 sha256（禁止混装）`)
          continue
        }
        if (prev === c.sha256) continue
        seen.set(file, c.sha256)
        target.chunks.push({ ...c, file })
        target.fileCount += 1
        target.totalBytes += c.bytes ?? 0
      }
      for (const e of data?.entries ?? []) {
        if (!target.entries.includes(`${app}/${e}`)) target.entries.push(`${app}/${e}`)
      }
      if (m?.document?.sha256) {
        documents.push({ app, ...m.document })
        target.document = { ...m.document }
      }
    }
  }

  // 稳定排序：装配计划与 diff 不应因遍历顺序而变化
  for (const data of Object.values(apps)) {
    data.chunks.sort((a, b) => a.file.localeCompare(b.file))
    data.entries.sort()
  }
  return { manifest: { apps, documents }, conflicts }
}
