import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import i18n from '@/i18n'
import OrgScopeNotice from './OrgScopeNotice'
import { fetchMyOrgScope } from '@/api/orgScope'
import { DATA_SCOPE } from '@/constants/dataScope'

vi.mock('@/api/orgScope', () => ({
  fetchMyOrgScope: vi.fn(),
}))

const mockedFetch = vi.mocked(fetchMyOrgScope)

/**
 * 数据范围提示横幅。
 * <p>
 * 它存在的意义是「让受限范围不被误读成数据丢了」，所以两条边界都必须钉住：
 * ① 不限制时不许出现（否则用户会以为自己的数据被动过）；
 * ② 提示接口失败时不许挡住页面（取不到就安静地不显示）。
 */
describe('OrgScopeNotice', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('zh-TW')
    vi.clearAllMocks()
  })

  it('受限范围时显示档位与可见人数', async () => {
    mockedFetch.mockResolvedValueOnce({
      scope: DATA_SCOPE.DEPT_AND_CHILD,
      scopeLabel: '本部門及以下',
      unlimited: false,
      deptCount: 3,
      userCount: 28,
    })

    render(<OrgScopeNotice />)

    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument())
    const text = screen.getByRole('alert').textContent ?? ''
    expect(text).toContain(i18n.t('orgScope.deptAndChild'))
    expect(text).toContain('28')
  })

  it('档位为「全部」或未限制时不渲染任何提示', async () => {
    mockedFetch.mockResolvedValueOnce({
      scope: DATA_SCOPE.ALL,
      scopeLabel: '全部',
      unlimited: true,
      deptCount: null,
      userCount: null,
    })

    render(<OrgScopeNotice />)

    await waitFor(() => expect(mockedFetch).toHaveBeenCalled())
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('仅本人档也要提示：只看得见自己正是最容易以为是 bug 的情形', async () => {
    mockedFetch.mockResolvedValueOnce({
      scope: DATA_SCOPE.SELF,
      scopeLabel: '僅本人',
      unlimited: false,
      deptCount: 0,
      userCount: 1,
    })

    render(<OrgScopeNotice />)

    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument())
    expect(screen.getByRole('alert').textContent).toContain(i18n.t('orgScope.self'))
  })

  it('取数失败时静默降级，不抛错也不显示提示', async () => {
    mockedFetch.mockRejectedValueOnce(new Error('network down'))

    render(<OrgScopeNotice />)

    await waitFor(() => expect(mockedFetch).toHaveBeenCalled())
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})
