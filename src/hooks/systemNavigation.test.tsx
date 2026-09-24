import { act, render, renderHook, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { MenuVO } from '../api/menu'
import request from '../api/request'
import { CURRENT_SYSTEM_STORAGE_KEY, useCurrentSystem, writeCurrentSystemCode, resolveSystemFromPathname } from './useCurrentSystem'
import { invalidateSystemNavigation, pickFirstEntryPath, useSystemNavigation } from './useSystemNavigation'
import { resolveMenuPath } from '../constants/menuDataSource'

vi.mock('../api/request', () => ({ default: { get: vi.fn() } }))

const hr: MenuVO = { id: 1, parentId: null, menuKey: 'hr', name: '人事', type: 1, sort: 1, status: 1, systemCode: 'hr', children: [
  { id: 2, parentId: 1, menuKey: 'hr-dict', name: '字典', type: 2, sort: 2, status: 1 },
  { id: 3, parentId: 1, menuKey: 'contract-ledger', name: '合同', type: 2, sort: 3, status: 1 },
] }
const finance: MenuVO = { id: 4, parentId: null, menuKey: 'account-balance', name: '账户', type: 2, sort: 1, status: 1, systemCode: 'finance' }

beforeEach(() => {
  localStorage.clear()
  vi.clearAllMocks()
  invalidateSystemNavigation()
})

function Probe({ name }: { name: string }) {
  const { currentSystemCode, setCurrentSystemCode } = useCurrentSystem()
  return <button onClick={() => setCurrentSystemCode('hr')} data-testid={name}>{currentSystemCode ?? 'none'}</button>
}

describe('系统选择同步', () => {
  it('同一标签页的多个 Hook 实例、命令式写入与清空同步生效', () => {
    render(<><Probe name="header" /><Probe name="sidebar" /></>)
    act(() => { screen.getByTestId('header').click() })
    expect(screen.getByTestId('sidebar')).toHaveTextContent('hr')
    act(() => writeCurrentSystemCode('finance'))
    expect(screen.getByTestId('header')).toHaveTextContent('finance')
    expect(screen.getByTestId('sidebar')).toHaveTextContent('finance')
    act(() => writeCurrentSystemCode(null))
    expect(screen.getByTestId('sidebar')).toHaveTextContent('none')
  })

  it('跨标签 storage 更新和清空生效，不响应无关键', () => {
    const { result } = renderHook(useCurrentSystem)
    act(() => {
      localStorage.setItem(CURRENT_SYSTEM_STORAGE_KEY, 'hr')
      window.dispatchEvent(new StorageEvent('storage', { key: 'other' }))
    })
    expect(result.current.currentSystemCode).toBeNull()
    act(() => window.dispatchEvent(new StorageEvent('storage', { key: CURRENT_SYSTEM_STORAGE_KEY })))
    expect(result.current.currentSystemCode).toBe('hr')
    act(() => { localStorage.clear(); window.dispatchEvent(new StorageEvent('storage', { key: null })) })
    expect(result.current.currentSystemCode).toBeNull()
  })

  it('portal 哨兵不被持久化为业务系统', () => {
    const { result } = renderHook(useCurrentSystem)
    act(() => writeCurrentSystemCode('portal'))
    expect(result.current.currentSystemCode).toBeNull()
    expect(localStorage.getItem(CURRENT_SYSTEM_STORAGE_KEY)).toBeNull()
  })
})

describe('不含 path 的后端菜单', () => {
  it.each(['/hr-dict', '/hr-dict-edit', '/contract-ledger'])('直达 %s 识别 HR 归属', path => {
    expect(resolveSystemFromPathname(path, [hr])).toBe('hr')
  })
  it('不推测未知、缺失或停用菜单的系统和入口', () => {
    expect(resolveSystemFromPathname('/hr-dict', [])).toBeNull()
    expect(resolveSystemFromPathname('/hr-dict', [{ ...hr, status: 0 }])).toBeNull()
    expect(resolveMenuPath({ menuKey: 'unknown' })).toBeNull()
    expect(resolveMenuPath({ menuKey: 'unknown', path: '//external.test' })).toBeNull()
  })
  it('服务端有效自定义路径优先，动态子路径匹配最长前缀', () => {
    const menu = { ...finance, path: '/custom-account' }
    expect(resolveMenuPath(menu)).toBe('/custom-account')
    expect(resolveSystemFromPathname('/custom-account/12', [menu])).toBe('finance')
  })
  it('首个可用入口使用登记路径，跳过停用和未知项', () => {
    expect(pickFirstEntryPath([hr])).toBe('/hr-dict')
    expect(pickFirstEntryPath([{ ...hr, children: [{ ...hr.children![0], status: 0 }, hr.children![1]] }])).toBe('/contract-ledger')
    expect(pickFirstEntryPath([{ ...finance, menuKey: 'unknown' }])).toBeNull()
  })
})

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(done => { resolve = done })
  return { promise, resolve }
}

describe('系统导航异步隔离', () => {
  it('快速切换不会显示或被迟到的上一系统响应覆盖', async () => {
    const first = deferred<MenuVO[]>()
    const second = deferred<MenuVO[]>()
    vi.mocked(request.get).mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise)
    const { result, rerender } = renderHook(({ code }) => useSystemNavigation(code), { initialProps: { code: 'hr' } })
    rerender({ code: 'finance' })
    expect(result.current.tree).toEqual([])
    await act(async () => { second.resolve([finance]) })
    expect(result.current.tree).toEqual([finance])
    await act(async () => { first.resolve([hr]) })
    expect(result.current.tree).toEqual([finance])
  })

  it('切换后立即清除旧树，成功返回空树不被误认为失败', async () => {
    vi.mocked(request.get).mockResolvedValueOnce([hr]).mockResolvedValueOnce([])
    const { result, rerender } = renderHook(({ code }) => useSystemNavigation(code), { initialProps: { code: 'hr' as string | null } })
    await act(async () => {})
    expect(result.current.tree).toEqual([hr])
    rerender({ code: 'finance' })
    expect(result.current.tree).toEqual([])
    await act(async () => {})
    expect(result.current.loaded).toBe(true)
    expect(result.current.tree).toEqual([])
    rerender({ code: null })
    expect(result.current.tree).toEqual([])
    expect(result.current.loaded).toBe(false)
  })
})
