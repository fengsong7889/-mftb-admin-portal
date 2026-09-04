import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'

/** 權限門控 mock：每個用例通過 mockHasPermission 控制返回值 */
const mockHasPermission = vi.fn<(permission: string) => boolean>()
vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({ hasPermission: mockHasPermission }),
}))

import DetailPageHeader from './DetailPageHeader'

describe('DetailPageHeader 詳情頁頂部標題欄（全局規範）', () => {
  beforeEach(() => {
    mockHasPermission.mockReset()
  })

  it('始終渲染橙色返回按鈕與標題，返回可點擊', () => {
    const onBack = vi.fn()
    render(<DetailPageHeader title="部門模型詳情" onBack={onBack} />)
    expect(screen.getByText('部門模型詳情')).toBeTruthy()
    fireEvent.click(screen.getByText('返回'))
    expect(onBack).toHaveBeenCalledTimes(1)
  })

  it('無 onEdit（無編輯頁）時不渲染編輯按鈕', () => {
    render(<DetailPageHeader title="批次詳情" onBack={() => {}} />)
    expect(screen.queryByText('編輯')).toBeNull()
  })

  it('有編輯權限（hasPermission 通過）時渲染編輯按鈕並可點擊跳轉', () => {
    mockHasPermission.mockReturnValue(true)
    const onEdit = vi.fn()
    render(<DetailPageHeader title="部門模型詳情" onBack={() => {}} onEdit={onEdit} menuKey="ai-dept-model-auth" />)
    expect(mockHasPermission).toHaveBeenCalledWith('ai-dept-model-auth:edit')
    fireEvent.click(screen.getByText('編輯'))
    expect(onEdit).toHaveBeenCalledTimes(1)
  })

  it('無編輯權限（hasPermission 拒絕）時不渲染編輯按鈕', () => {
    mockHasPermission.mockReturnValue(false)
    render(<DetailPageHeader title="部門模型詳情" onBack={() => {}} onEdit={() => {}} menuKey="ai-dept-model-auth" />)
    expect(screen.queryByText('編輯')).toBeNull()
  })

  it('未傳 menuKey 時不做權限校驗，直接渲染編輯按鈕', () => {
    render(<DetailPageHeader title="詳情" onBack={() => {}} onEdit={() => {}} />)
    expect(mockHasPermission).not.toHaveBeenCalled()
    expect(screen.getByText('編輯')).toBeTruthy()
  })
})
