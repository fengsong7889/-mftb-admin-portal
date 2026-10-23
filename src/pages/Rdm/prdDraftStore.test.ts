import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  clearAllPrdDrafts, clearPrdDraft, loadPrdDraft, prdDraftOwner, savePrdDraft,
} from './prdDraftStore'

const payload = {
  title: '登入改造', targetUsers: '門店店長', featureList: '手機號登入',
  acceptanceCriteria: '可登入', prototypeUrl: '', contentRich: '<p>正文</p>',
}

describe('PRD 本机暂存', () => {
  afterEach(() => clearAllPrdDrafts())

  it('按用户与 PRD 隔离，不同账号/不同文档互不可见', () => {
    expect(savePrdDraft('test:1', 10, 5, { ...payload, baseUpdatedAt: '2026-10-23T10:00:00' })).toBe(true)
    expect(loadPrdDraft('test:1', 10, 5)?.title).toBe('登入改造')
    expect(loadPrdDraft('test:2', 10, 5)).toBeNull()
    expect(loadPrdDraft('test:1', 10, 6)).toBeNull()
    expect(loadPrdDraft('test:1', 11, 5)).toBeNull()
  })

  it('超过 24 小时视为失效并清理', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-23T10:00:00+08:00'))
    savePrdDraft('test:1', 10, null, payload)
    expect(loadPrdDraft('test:1', 10, null)).not.toBeNull()

    vi.setSystemTime(new Date('2026-10-24T11:00:00+08:00'))
    expect(loadPrdDraft('test:1', 10, null)).toBeNull()
    vi.useRealTimers()
  })

  it('超大正文拒绝写入，调用方必须提示暂存失败', () => {
    const huge = '字'.repeat(400 * 1024)
    expect(savePrdDraft('test:1', 10, null, { ...payload, contentRich: huge })).toBe(false)
    expect(loadPrdDraft('test:1', 10, null)).toBeNull()
  })

  it('正式保存后可单独清理，登出清理会清空全部', () => {
    savePrdDraft('test:1', 10, 5, payload)
    savePrdDraft('test:1', 11, null, payload)
    clearPrdDraft('test:1', 10, 5)
    expect(loadPrdDraft('test:1', 10, 5)).toBeNull()
    expect(loadPrdDraft('test:1', 11, null)).not.toBeNull()

    clearAllPrdDrafts()
    expect(loadPrdDraft('test:1', 11, null)).toBeNull()
  })

  it('归属串包含环境与用户，匿名也相互隔离', () => {
    expect(prdDraftOwner(7)).toBe('test:7')
    expect(prdDraftOwner(null)).toBe('test:anonymous')
  })
})
