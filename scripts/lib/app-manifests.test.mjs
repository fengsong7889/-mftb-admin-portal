/**
 * 多份按应用产物清单合并的纯函数单测（方案 §4.2）。
 *
 * 这些断言固定住三条装配安全规则：
 *   1) 文件键必须按应用命名空间化（不同应用的 assets/index-*.js 不得互相覆盖）；
 *   2) 跨应用同名但摘要不同 → 冲突（禁止混装）；
 *   3) 合并后的清单能被 planAssembly 直接消费（复用与重建判定一致）。
 */
import { describe, expect, it } from 'vitest'
import { mergeAppManifests } from './app-manifests.mjs'
import { planAssembly } from './site-assembly.mjs'

const sha = (c) => c.repeat(64)

const oneApp = (app, chunks, docTitle = `${app} 标题`) => ({
  apps: {
    [app]: {
      fileCount: chunks.length,
      totalBytes: chunks.reduce((n, c) => n + c.bytes, 0),
      entries: chunks.filter((c) => c.isEntry).map((c) => c.file),
      chunks,
    },
  },
  document: { file: 'index.html', bytes: 100, sha256: sha('d'), title: docTitle },
})

describe('mergeAppManifests', () => {
  it('按应用给文件名加前缀，同名资源不互相覆盖', () => {
    const { manifest, conflicts } = mergeAppManifests([
      oneApp('rdm', [{ file: 'assets/index-a.js', bytes: 10, sha256: sha('a'), isEntry: true }]),
      oneApp('hr', [{ file: 'assets/index-a.js', bytes: 20, sha256: sha('b'), isEntry: true }]),
    ])
    expect(conflicts).toEqual([])
    expect(manifest.apps.rdm.chunks.map((c) => c.file)).toEqual(['rdm/assets/index-a.js'])
    expect(manifest.apps.hr.chunks.map((c) => c.file)).toEqual(['hr/assets/index-a.js'])
    expect(manifest.apps.rdm.entries).toEqual(['rdm/assets/index-a.js'])
    // 文档摘要随应用保留，装配时能核对「文档与资产同源」
    expect(manifest.documents.map((d) => d.app).sort()).toEqual(['hr', 'rdm'])
  })

  it('同一应用两次出现相同文件且摘要相同 → 去重，不重复计体积', () => {
    const chunk = { file: 'assets/index-a.js', bytes: 10, sha256: sha('a'), isEntry: true }
    const { manifest, conflicts } = mergeAppManifests([oneApp('eam', [chunk]), oneApp('eam', [chunk])])
    expect(conflicts).toEqual([])
    expect(manifest.apps.eam.chunks).toHaveLength(1)
    expect(manifest.apps.eam.fileCount).toBe(1)
    expect(manifest.apps.eam.totalBytes).toBe(10)
  })

  it('同名文件摘要不同 → 报冲突并保留第一份（不静默混装）', () => {
    const { manifest, conflicts } = mergeAppManifests([
      oneApp('rdm', [{ file: 'assets/index-a.js', bytes: 10, sha256: sha('a'), isEntry: true }]),
      oneApp('rdm', [{ file: 'assets/index-a.js', bytes: 99, sha256: sha('c'), isEntry: false }]),
    ])
    expect(conflicts).toHaveLength(1)
    expect(conflicts[0]).toContain('rdm/assets/index-a.js')
    expect(manifest.apps.rdm.chunks).toHaveLength(1)
    expect(manifest.apps.rdm.chunks[0].sha256).toBe(sha('a'))
  })

  it('合并结果可直接用于装配计划：内容不变则复用，内容变化则重建', () => {
    const before = mergeAppManifests([
      oneApp('rdm', [{ file: 'assets/index-a.js', bytes: 10, sha256: sha('a'), isEntry: true }]),
      oneApp('eam', [{ file: 'assets/index-a.js', bytes: 10, sha256: sha('b'), isEntry: true }]),
    ]).manifest
    const afterSame = mergeAppManifests([
      oneApp('rdm', [{ file: 'assets/index-a.js', bytes: 10, sha256: sha('a'), isEntry: true }]),
      oneApp('eam', [{ file: 'assets/index-a.js', bytes: 10, sha256: sha('b'), isEntry: true }]),
    ]).manifest
    const afterRdmChanged = mergeAppManifests([
      oneApp('rdm', [{ file: 'assets/index-c.js', bytes: 11, sha256: sha('c'), isEntry: true }]),
      oneApp('eam', [{ file: 'assets/index-a.js', bytes: 10, sha256: sha('b'), isEntry: true }]),
    ]).manifest

    const reusePlan = planAssembly(before, afterSame)
    expect(reusePlan.rdm.action).toBe('reuse')
    expect(reusePlan.eam.action).toBe('reuse')

    const changedPlan = planAssembly(before, afterRdmChanged)
    expect(changedPlan.rdm.action).toBe('rebuild')
    expect(changedPlan.rdm.rebuilt).toEqual(['rdm/assets/index-c.js'])
    expect(changedPlan.rdm.dropped).toEqual(['rdm/assets/index-a.js'])
    expect(changedPlan.eam.action).toBe('reuse')
  })
})
