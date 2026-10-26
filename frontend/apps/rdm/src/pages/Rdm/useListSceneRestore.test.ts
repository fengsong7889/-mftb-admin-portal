import { afterEach, describe, expect, it, vi } from 'vitest'
import { clearRdmListScenes, readRdmListScene, writeRdmListScene } from './useListSceneRestore'

/**
 * 列表场景缓存：换账号不串、结构不合法不接受、过期即失效。
 * 这三条都是「看起来只是恢复位置」却会直接影响数据判断的行为：
 * 继承上一个人的筛选条件，会让 B 以为自己看到的是默认列表。
 */
describe('RDM 列表场景缓存', () => {
  afterEach(() => {
    clearRdmListScenes()
    vi.useRealTimers()
  })

  it('不同账号/环境互不继承筛选与滚动位置', () => {
    writeRdmListScene('requirement:/rdm-requirement:mine:table', {
      page: 3, size: 20, filters: { priority: 'P1' }, scrollTop: 600,
    }, 'test:1')

    expect(readRdmListScene('requirement:/rdm-requirement:mine:table', 'test:1')).toMatchObject({
      page: 3, size: 20, filters: { priority: 'P1' }, scrollTop: 600,
    })
    expect(readRdmListScene('requirement:/rdm-requirement:mine:table', 'test:2')).toBeNull()
    expect(readRdmListScene('requirement:/rdm-requirement:mine:table', 'prod:1')).toBeNull()
  })

  it('非法页码/每页条数/滚动值不参与还原', () => {
    sessionStorage.setItem(
      'rdm-list-scene:test:1:requirement:/rdm-requirement:mine:table',
      JSON.stringify({ page: 0, size: 20, filters: {}, scrollTop: 100, savedAt: Date.now() }),
    )
    expect(readRdmListScene('requirement:/rdm-requirement:mine:table', 'test:1')).toBeNull()

    sessionStorage.setItem(
      'rdm-list-scene:test:1:requirement:/rdm-requirement:mine:table',
      JSON.stringify({ page: 1, size: 999, filters: {}, scrollTop: 100, savedAt: Date.now() }),
    )
    expect(readRdmListScene('requirement:/rdm-requirement:mine:table', 'test:1')).toBeNull()

    sessionStorage.setItem(
      'rdm-list-scene:test:1:requirement:/rdm-requirement:mine:table',
      JSON.stringify({ page: 1, size: 10, filters: {}, scrollTop: -5, savedAt: Date.now() }),
    )
    expect(readRdmListScene('requirement:/rdm-requirement:mine:table', 'test:1')).toBeNull()
  })

  it('超过 24 小时的快照不再还原', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-23T10:00:00+08:00'))
    writeRdmListScene('requirement:/rdm-requirement:mine:table', {
      page: 2, size: 10, filters: {}, scrollTop: 300,
    }, 'test:1')
    expect(readRdmListScene('requirement:/rdm-requirement:mine:table', 'test:1')).not.toBeNull()

    vi.setSystemTime(new Date('2026-10-24T12:00:00+08:00'))
    expect(readRdmListScene('requirement:/rdm-requirement:mine:table', 'test:1')).toBeNull()
  })

  it('登出清理会同时清掉内存与 sessionStorage', () => {
    writeRdmListScene('project:', { page: 1, size: 20, filters: {}, scrollTop: 170 }, 'test:1')
    clearRdmListScenes()

    expect(readRdmListScene('project:', 'test:1')).toBeNull()
    expect(Object.keys(sessionStorage).some(k => k.startsWith('rdm-list-scene:'))).toBe(false)
  })
})
