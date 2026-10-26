import { describe, it, expect, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useColumnConfig } from './useColumnConfig'

/**
 * 列配置合并口径：页面后续新增的列必须自动补进存量本地配置，
 * 否则「所屬迭代」这类新列在列表与列配置抽屉里都看不到，
 * 用户在抽屉里操作一次还会把缺失新列的旧配置写回，新列随之消失。
 */
const STORAGE_KEY = 'table-config-test-page'
const DEFAULT_COLUMNS = [
  { key: 'title', title: '標題', visible: true, locked: 'head' as const },
  { key: 'iterationCode', title: '所屬迭代', visible: true, locked: null },
  { key: 'action', title: '操作', visible: true, locked: 'tail' as const },
]

const meta = DEFAULT_COLUMNS.map(({ key, title }) => ({ key, title }))

function readSaved() {
  return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]') as { key: string; visible: boolean }[]
}

describe('useColumnConfig 存量配置合并', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('旧配置缺少新增列时自动补齐为默认可见，并写回本地', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([
      { key: 'title', title: '標題', visible: true, locked: 'head' },
      { key: 'action', title: '操作', visible: true, locked: 'tail' },
    ]))

    const { result } = renderHook(() => useColumnConfig('test-page', meta, DEFAULT_COLUMNS))

    const iteration = result.current.config.find(c => c.key === 'iterationCode')
    expect(iteration).toBeTruthy()
    expect(iteration?.visible).toBe(true)
    // 新列插在尾部锁定列之前，而不是落到「操作」后面
    expect(result.current.config.map(c => c.key)).toEqual(['title', 'iterationCode', 'action'])
    expect(readSaved().some(c => c.key === 'iterationCode')).toBe(true)
  })

  it('页面默认隐藏的新列补齐后保持隐藏（提需求页不关心迭代）', () => {
    const defaults = DEFAULT_COLUMNS.map(c => (
      c.key === 'iterationCode' ? { ...c, visible: false } : c
    ))
    localStorage.setItem(STORAGE_KEY, JSON.stringify([
      { key: 'title', title: '標題', visible: true, locked: 'head' },
      { key: 'action', title: '操作', visible: true, locked: 'tail' },
    ]))

    const { result } = renderHook(() => useColumnConfig('test-page', meta, defaults))

    expect(result.current.config.find(c => c.key === 'iterationCode')?.visible).toBe(false)
  })

  it('用户已保存的显隐不被覆盖，已删除的旧列被剔除', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([
      { key: 'title', title: '標題', visible: true, locked: 'head' },
      // 用户手动关掉过该列：补齐逻辑不得把它重新打开
      { key: 'iterationCode', title: '所屬迭代', visible: false, locked: null },
      { key: 'removedColumn', title: '已下線列', visible: true, locked: null },
      { key: 'action', title: '操作', visible: true, locked: 'tail' },
    ]))

    const { result } = renderHook(() => useColumnConfig('test-page', meta, DEFAULT_COLUMNS))

    expect(result.current.config.find(c => c.key === 'iterationCode')?.visible).toBe(false)
    expect(result.current.config.some(c => c.key === 'removedColumn')).toBe(false)
  })
})
