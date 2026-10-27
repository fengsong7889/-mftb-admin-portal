/**
 * 多份按应用产物清单的合并、冲突与文件校验（方案 §4.2）。
 *
 * 场景：`dist-apps/<app>` 各自是一份独立构建产物，装配时要把「目标应用的新产物」
 * 与「其它应用已验证的旧产物」组合起来。组合前必须回答三个问题：
 *   1) 每份清单自身是否一致（复用 validateManifest）；
 *   2) 清单登记的 sha256 与磁盘文件是否一致（文件校验，见 verifyManifestFiles）；
 *   3) 合并后是否存在同名文件但摘要不同（跨应用冲突，禁止混装）。
 *
 * 文件键统一加应用前缀（`<app>/<file>`）：各应用产物目录独立，压缩后同名
 * `assets/index-xxx.js` 很常见，不加前缀会把两份不同内容当成同一份。
 */
import { createHash } from 'node:crypto'

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

/**
 * 文件校验：清单登记的 sha256 必须与磁盘文件一致（方案 §4.2「旧产物须有来源 SHA 与文件校验」）。
 *
 * 为什么不能让装配只看清单：清单本身是构建时的快照，产物目录可能被清空、覆盖或拷坏；
 * 回滚时如果拿一份摘要对不上文件的清单去装，就会出现「清单是旧版、文件是新版」的混装。
 *
 * 抽成纯函数（注入 readFile）是为了不碰真实磁盘也能测三个分支：匹配 / 缺文件 / 摘要不符。
 *
 * @param {object} manifest 单应用清单（含 chunks 与 document）
 * @param {(rel: string) => Buffer|null} readFile 按清单相对路径读文件，返回 null 表示不存在
 * @returns {string[]} 问题列表（空数组 = 通过）
 */
export function verifyManifestFiles(manifest, readFile) {
  const problems = []
  const check = (rel, sha) => {
    const buf = readFile(rel)
    if (!buf) {
      problems.push(`${rel}: 清单登记了但文件不存在`)
      return
    }
    const actual = createHash('sha256').update(buf).digest('hex')
    if (actual !== sha) problems.push(`${rel}: sha256 与清单不符（文件已被覆盖或拷坏）`)
  }
  for (const data of Object.values(manifest?.apps ?? {})) {
    for (const c of data?.chunks ?? []) check(c.file, c.sha256)
    if (data?.document?.sha256) check(data.document.file ?? 'index.html', data.document.sha256)
  }
  if (manifest?.document?.sha256) check(manifest.document.file ?? 'index.html', manifest.document.sha256)
  return problems
}
