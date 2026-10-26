import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MenuProvider, useMenu } from './MenuContext'
import { fetchMyMenuTree } from '@/api/menu'
import type { MenuVO } from '@/api/menu'

const auth = vi.hoisted(() => ({ isAuthenticated: true, user: { id: 1 } as { id: number } | null }))
vi.mock('./AuthContext', () => ({ useAuth: () => auth }))
vi.mock('@/api/menu', () => ({ fetchMyMenuTree: vi.fn() }))
vi.mock('@/api/request', () => ({ isBackendUnavailable: () => false }))

beforeEach(() => {
  vi.mocked(fetchMyMenuTree).mockReset().mockResolvedValue([])
  auth.isAuthenticated = true
  auth.user = { id: 1 }
})

describe('用户导航数据边界', () => {
  it('已授权空树保留为空，不冒充菜单服务不可用', async () => {
    const { result } = renderHook(useMenu, { wrapper: MenuProvider })
    await waitFor(() => expect(result.current.status).toBe('online'))
    expect(result.current.menuTree).toEqual([])
    expect(fetchMyMenuTree).toHaveBeenCalledWith(expect.any(AbortSignal))
  })

  it('登出使旧请求取消，迟到响应不恢复旧菜单', async () => {
    let resolve!: (tree: MenuVO[]) => void
    vi.mocked(fetchMyMenuTree).mockReturnValue(new Promise(r => { resolve = r }))
    const { result, rerender } = renderHook(useMenu, { wrapper: MenuProvider })
    const signal = vi.mocked(fetchMyMenuTree).mock.calls[0][0]
    auth.isAuthenticated = false
    auth.user = null
    rerender()
    expect(signal?.aborted).toBe(true)
    await act(async () => { resolve([{ menuKey: 'private' } as MenuVO]) })
    expect(result.current.menuTree).toBeNull()
  })

  it('账号切换重新取数，拒绝把前一账号菜单展示为新账号结果', async () => {
    let resolve!: (tree: MenuVO[]) => void
    vi.mocked(fetchMyMenuTree).mockReturnValueOnce(new Promise(r => { resolve = r }))
    const { result, rerender } = renderHook(useMenu, { wrapper: MenuProvider })
    auth.user = { id: 2 }
    rerender()
    await waitFor(() => expect(result.current.status).toBe('online'))
    await act(async () => { resolve([{ menuKey: 'old-user' } as MenuVO]) })
    expect(result.current.menuTree).toEqual([])
  })
})
