import { useEffect, useState } from 'react'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createMemoryRouter, Outlet, RouterProvider } from 'react-router-dom'
import { Modal } from 'antd'
import { UnsavedChangesProvider, UnsavedNavigationGuard, useConfirmLeave, useUnsavedGuard } from './UnsavedChangesContext'

type ConfirmOptions = Parameters<typeof Modal.confirm>[0]
const dialogs: ConfirmOptions[] = []
const stash = vi.fn(() => true)
const discard = vi.fn()
const destroy = vi.fn()
let router: ReturnType<typeof createMemoryRouter>

function Editor() {
  const { register } = useUnsavedGuard()
  const confirmLeave = useConfirmLeave()
  useEffect(() => register({ isDirty: () => true, stash, discard }), [register])
  return <button onClick={async () => {
    // 与真实页签入口一致：确认时把目标路径交给守卫，确认后那一次导航不再重复弹框
    const decision = confirmLeave('/other')
    if (decision === true || await decision) void router.navigate('/other')
  }}>关闭页签</button>
}
function Harness() {
  const [enabled, setEnabled] = useState(true)
  return <UnsavedChangesProvider>
    <button onClick={() => setEnabled(false)}>模拟撤权</button>
    <UnsavedNavigationGuard enabled={enabled} />
    <Outlet />
  </UnsavedChangesProvider>
}
function setup() {
  router = createMemoryRouter([{ element: <Harness />, children: [
    { path: '/rdm-prd', element: <Editor /> },
    { path: '/other', element: <div>其它页面</div> },
  ] }], { initialEntries: ['/other', '/rdm-prd?reqId=1&id=2'], initialIndex: 1 })
  render(<RouterProvider router={router} />)
}

beforeEach(() => {
  dialogs.length = 0
  stash.mockReset().mockReturnValue(true)
  discard.mockReset()
  vi.spyOn(Modal, 'confirm').mockImplementation(options => {
    dialogs.push(options)
    return { destroy, update: vi.fn() }
  })
})
afterEach(() => {
  cleanup()
  router?.dispose()
  vi.restoreAllMocks()
})

describe('未保存编辑导航', () => {
  it('浏览器后退取消仍留原文档，确认暂存后才离开', async () => {
    setup()
    await act(() => router.navigate(-1))
    await waitFor(() => expect(dialogs).toHaveLength(1))
    expect(router.state.location.search).toBe('?reqId=1&id=2')
    await act(async () => { dialogs[0].onCancel?.() })
    expect(router.state.location.pathname).toBe('/rdm-prd')
    await act(() => router.navigate(-1))
    await act(async () => { dialogs[1].onOk?.() })
    await waitFor(() => expect(router.state.location.pathname).toBe('/other'))
    expect(stash).toHaveBeenCalledTimes(1)
    expect(discard).not.toHaveBeenCalled()
  })

  it('同路径切 PRD 身份与 replace 都被保护，重复点击不叠框', async () => {
    setup()
    await act(() => router.navigate('/rdm-prd?reqId=1&id=3', { replace: true }))
    await act(() => router.navigate('/rdm-prd?reqId=1&id=4'))
    expect(dialogs).toHaveLength(1)
    await act(async () => { dialogs[0].onOk?.() })
    await waitFor(() => expect(router.state.location.search).toBe('?reqId=1&id=4'))
  })

  it('暂存失败不导航且允许原弹窗重试', async () => {
    setup()
    stash.mockReturnValue(false)
    await act(() => router.navigate('/other'))
    await act(async () => { await expect(dialogs[0].onOk?.()).rejects.toThrow('stash-failed') })
    expect(router.state.location.pathname).toBe('/rdm-prd')
    stash.mockReturnValue(true)
    await act(async () => { dialogs[0].onOk?.() })
    await waitFor(() => expect(router.state.location.pathname).toBe('/other'))
    expect(dialogs).toHaveLength(1)
  })

  it('撤权立即解除导航阻塞，不要求用户保存后才能退出', async () => {
    setup()
    await act(() => router.navigate('/other'))
    fireEvent.click(screen.getByText('模拟撤权'))
    await waitFor(() => expect(router.state.location.pathname).toBe('/other'))
    expect(stash).not.toHaveBeenCalled()
  })

  it('页签关闭先确认，随后路由不再弹第二次确认', async () => {
    setup()
    fireEvent.click(screen.getByText('关闭页签'))
    expect(dialogs).toHaveLength(1)
    await act(async () => { dialogs[0].onOk?.() })
    await waitFor(() => expect(router.state.location.pathname).toBe('/other'))
    expect(dialogs).toHaveLength(1)
  })
})
