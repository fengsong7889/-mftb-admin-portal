/**
 * 员工AI权额列表 —— 请求竞态契约测试
 *
 * 背景（实测缺陷）：列表接口在远端共享库上耗时 ~11.7s，而 axios 超时是 15s；
 * 开发模式 StrictMode 会对同一查询条件发两次请求，于是出现「先返回的那次已成功、
 * 后返回的那次超时」。旧实现在 .catch 里无条件 `setData([])`，把已成功的数据清空，
 * 用户看到的是「数据凭空消失 + 报错」。
 *
 * 本文件钉住修复后的三条口径：
 * 1. 同一条件下已落定时，迟到的失败不得清空数据、不得再弹错误提示；
 * 2. 条件被更新后，旧条件的迟到响应必须被丢弃（不得把新结果打回去）；
 * 3. 真正的首次加载失败仍必须提示用户（错误提示不得被吞）。
 */
import { StrictMode } from 'react'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { ConfigProvider, message } from 'antd'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { EmpPermissionSummary } from '../../api/empPermission'
import AiEmpPermission from './index'

/** t 必须稳定引用：每次新建会让 useCallback 依赖抖动，effect 死循环表现为超时而非断言失败 */
const i18n = vi.hoisted(() => ({ t: (key: string) => key }))

const api = vi.hoisted(() => ({
  fetchEmpPermissionList: vi.fn(),
  fetchDepartments: vi.fn(),
}))

vi.mock('../../api/empPermission', () => ({
  fetchEmpPermissionList: api.fetchEmpPermissionList,
  calcQuotaStatus: () => 'normal',
  SOURCE_TAG_COLOR: { department: 'blue', position: 'green', role: 'orange', approval: 'purple' },
  QUOTA_STATUS_LABEL: { normal: '正常', exhausted: '已用完', frozen: '凍結' },
  QUOTA_STATUS_COLOR: { normal: 'green', exhausted: 'red', frozen: 'default' },
}))
vi.mock('../../api/department', () => ({ fetchDepartments: api.fetchDepartments }))
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: i18n.t, i18n: { language: 'zh-TW' } }) }))
vi.mock('react-router-dom', () => ({ useNavigate: () => vi.fn() }))
vi.mock('../../hooks/useColumnConfig', () => ({ useColumnConfig: () => ({ configComponent: null }) }))

function row(employeeName: string, employeeId = 1): EmpPermissionSummary {
  return {
    employeeId,
    employeeName,
    empId: `MF${String(employeeId).padStart(5, '0')}`,
    department: '行政部',
    deptId: 5,
    position: '工程師',
    jobLevel: 'P5',
    modelCount: 1,
    modelPermissions: [],
    quotaGrants: [],
    lastUpdatedBy: 'system',
    lastUpdatedAt: '2026-10-19 10:00:00',
  }
}

/** 手工可控的 promise，用于精确编排「谁先返回」 */
function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej })
  return { promise, resolve, reject }
}

function mount(strict: boolean) {
  render(<ConfigProvider theme={{ token: { motion: false } }}>
    {strict
      ? <StrictMode><AiEmpPermission /></StrictMode>
      : <AiEmpPermission />}
  </ConfigProvider>)
}

beforeEach(() => {
  vi.clearAllMocks()
  // message.error 是 antd 真实实现，必须显式 spy 才能断言「有没有弹错误提示」
  vi.spyOn(message, 'error')
  api.fetchDepartments.mockResolvedValue([])
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('员工AI权额列表请求竞态', () => {
  it('StrictMode 双发：先成功后超时，不得清空数据也不得报错', async () => {
    const first = deferred<EmpPermissionSummary[]>()
    const second = deferred<EmpPermissionSummary[]>()
    api.fetchEmpPermissionList
      .mockImplementationOnce(() => first.promise)
      .mockImplementationOnce(() => second.promise)

    await act(async () => { mount(true) })

    // 前置确认：开发模式确实对同一条件发了两次请求（否则本用例失去意义）
    expect(api.fetchEmpPermissionList).toHaveBeenCalledTimes(2)

    await act(async () => { first.resolve([row('張三')]) })
    await waitFor(() => expect(screen.getByText('張三')).toBeInTheDocument())

    // 迟到的超时：旧实现会 setData([]) + message.error
    await act(async () => { second.reject(new Error('timeout of 15000ms exceeded')) })

    expect(screen.getByText('張三')).toBeInTheDocument()
    expect(message.error).not.toHaveBeenCalled()
  })

  it('条件被更新后，旧条件的迟到响应必须被丢弃', async () => {
    const stale = deferred<EmpPermissionSummary[]>()
    const fresh = deferred<EmpPermissionSummary[]>()
    api.fetchEmpPermissionList
      .mockImplementationOnce(() => stale.promise)
      .mockImplementationOnce(() => fresh.promise)

    await act(async () => { mount(false) })
    expect(api.fetchEmpPermissionList).toHaveBeenCalledTimes(1)

    // 用户点「查詢」→ 条件代次变化，发出第二次请求
    fireEvent.click(screen.getByText('common.search'))
    await waitFor(() => expect(api.fetchEmpPermissionList).toHaveBeenCalledTimes(2))

    await act(async () => { fresh.resolve([row('李四')]) })
    await waitFor(() => expect(screen.getByText('李四')).toBeInTheDocument())

    // 旧条件的响应此时才回来，不得覆盖新结果
    await act(async () => { stale.resolve([row('張三')]) })
    expect(screen.getByText('李四')).toBeInTheDocument()
    expect(screen.queryByText('張三')).not.toBeInTheDocument()
  })

  it('首次加载即失败时仍要提示用户', async () => {
    api.fetchEmpPermissionList.mockRejectedValue(new Error('boom'))

    await act(async () => { mount(false) })

    await waitFor(() => expect(message.error).toHaveBeenCalledWith('加載數據失敗'))
  })

  it('分页必须真正切片：12 行数据每页 10 条时，第一页只渲染 10 行且翻页会换人', async () => {
    // 12 行：足够跨页，又不至于让断言写成数全量
    api.fetchEmpPermissionList.mockResolvedValue(
      Array.from({ length: 12 }, (_, i) => row(`員工${i + 1}`, i + 1))
    )

    await act(async () => { mount(false) })
    await waitFor(() => expect(screen.getByText('員工1')).toBeInTheDocument())

    // 旧实现把全量 filtered 直喂 Table（分页器只改页码），会一次渲染 12 行
    expect(screen.queryByText('員工11')).not.toBeInTheDocument()
    expect(screen.getAllByRole('row')).toHaveLength(11) // 1 表头 + 10 数据行

    fireEvent.click(screen.getByTitle('2'))

    await waitFor(() => expect(screen.getByText('員工11')).toBeInTheDocument())
    expect(screen.queryByText('員工1')).not.toBeInTheDocument()
  })
})
