// @vitest-environment node
/**
 * 站点装配规则单测（方案 §4.2「发布清单串行更新 + 摘要校验 + 复用已验证产物」）。
 *
 * 这些规则决定发布安全：判错「可复用」会把旧 chunk 混进新站点，
 * 判错「drop」会留下指向已删资源的旧引用。因此必须用 fixture 固定住。
 */
import { describe, expect, it } from 'vitest'
import { indexAppChunks, planAssembly, validateManifest } from './site-assembly.mjs'

const sha = (n) => n.repeat(64).slice(0, 64)
const manifest = (apps) => ({ apps })

describe('indexAppChunks', () => {
  it('按应用取 chunk → sha256 索引；缺应用返回空 Map', () => {
    const m = manifest({ rdm: { chunks: [{ file: 'a.js', sha256: sha('a') }] } })
    expect([...indexAppChunks(m, 'rdm')]).toEqual([['a.js', sha('a')]])
    expect(indexAppChunks(m, 'eam').size).toBe(0)
    expect(indexAppChunks(null, 'rdm').size).toBe(0)
  })
})

describe('planAssembly', () => {
  it('首次发布：所有应用都 build', () => {
    const plan = planAssembly(null, manifest({
      rdm: { chunks: [{ file: 'rdm-1.js', sha256: sha('1') }] },
      legacy: { chunks: [{ file: 'index.js', sha256: sha('2') }] },
    }))
    expect(plan.rdm.action).toBe('build')
    expect(plan.legacy.action).toBe('build')
    expect(plan.rdm.rebuilt).toEqual(['rdm-1.js'])
  })

  it('内容未变的应用可 reuse；内容变化的应用必须 rebuild（禁止新旧混装）', () => {
    const prev = manifest({
      rdm: { chunks: [{ file: 'rdm-1.js', sha256: sha('1') }] },
      eam: { chunks: [{ file: 'eam-1.js', sha256: sha('2') }] },
    })
    const cur = manifest({
      rdm: { chunks: [{ file: 'rdm-1.js', sha256: sha('1') }] },
      eam: { chunks: [{ file: 'eam-1.js', sha256: sha('3') }] },
    })
    const plan = planAssembly(prev, cur)
    expect(plan.rdm.action).toBe('reuse')
    expect(plan.rdm.reused).toEqual(['rdm-1.js'])
    expect(plan.eam.action).toBe('rebuild')
    expect(plan.eam.rebuilt).toEqual(['eam-1.js'])
  })

  it('消失的旧文件要显式 drop（避免残留旧 chunk 造成引用悬空）', () => {
    const prev = manifest({ rdm: { chunks: [{ file: 'old.js', sha256: sha('a') }] } })
    const cur = manifest({ rdm: { chunks: [{ file: 'new.js', sha256: sha('b') }] } })
    const plan = planAssembly(prev, cur)
    expect(plan.rdm.action).toBe('rebuild')
    expect(plan.rdm.dropped).toEqual(['old.js'])
    expect(plan.rdm.rebuilt).toEqual(['new.js'])
  })

  it('上一版有、本次完全没有的应用也要出现在计划里（写明要 drop 什么）', () => {
    const prev = manifest({ legacy: { chunks: [{ file: 'index.js', sha256: sha('a') }] } })
    const cur = manifest({ rdm: { chunks: [{ file: 'rdm.js', sha256: sha('b') }] } })
    const plan = planAssembly(prev, cur)
    expect(plan.legacy.action).toBe('rebuild')
    expect(plan.legacy.dropped).toEqual(['index.js'])
  })
})

describe('validateManifest', () => {
  it('正常清单无问题', () => {
    const m = manifest({ rdm: { chunks: [{ file: 'a.js', sha256: sha('a') }] } })
    expect(validateManifest(m)).toEqual([])
  })

  it('sha256 非法 / 文件重复登记 / 应用无 chunk / 空清单 都会被拦下', () => {
    expect(validateManifest(manifest({ rdm: { chunks: [{ file: 'a.js', sha256: 'deadbeef' }] } })))
      .toEqual([`rdm/a.js: sha256 非法`])
    expect(validateManifest(manifest({
      rdm: { chunks: [{ file: 'a.js', sha256: sha('a') }] },
      eam: { chunks: [{ file: 'a.js', sha256: sha('b') }] },
    }))).toEqual(['eam/a.js: 同一文件被多个应用重复登记'])
    expect(validateManifest(manifest({ rdm: { chunks: [] } }))).toEqual(['rdm: 没有登记任何 chunk'])
    expect(validateManifest({})).toEqual(['清单未包含任何应用'])
  })
})
