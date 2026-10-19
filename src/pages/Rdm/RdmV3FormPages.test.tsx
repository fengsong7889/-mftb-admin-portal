/**
 * V3 提测 / 发布「新增表单」独立页测试（AGENTS.md §9.1：新增/编辑/详情禁止用 Modal）
 *
 * 钉死三件事：
 *  1. 列表页的「發起提測」「創建發布批次」是路由跳转，不再弹出 Modal；
 *  2. 独立页渲染在页面流里（无 .ant-modal 容器），且带统一表单页头与 .form-footer；
 *  3. 提交必须先过表单校验：必填未齐时绝不调用后端接口（§B.3 校验 → 提交顺序）。
 */
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import type { ReactNode } from 'react'
import { cleanup, render, screen, fireEvent, waitFor } from '@testing-library/react'
import { message } from 'antd'
import { MemoryRouter, useLocation } from 'react-router-dom'
import {
  acceptTestBatch,
  createReleaseBatch,
  fetchDeliveryItems,
  fetchProjectPage,
  fetchReleaseBatches,
  fetchRequirementPage,
  fetchTestBatches,
  returnTestBatch,
  submitTestBatch,
} from '../../api/rdm'
import TestWorkbench from './TestWorkbench'
import ReleaseCenter from './ReleaseCenter'
import TestBatchSubmit from './TestBatchSubmit'
import ReleaseBatchCreate from './ReleaseBatchCreate'

vi.mock('../../api/employee', () => ({
  fetchEmployeeIdOptions: vi.fn(async () => [{ value: '21', label: '張三(MF00021)' }]),
  fetchEmployees: vi.fn(),
}))

vi.mock('../../api/rdm', () => ({
  fetchTestBatches: vi.fn(),
  acceptTestBatch: vi.fn(),
  returnTestBatch: vi.fn(),
  submitTestBatch: vi.fn(),
  fetchRequirementPage: vi.fn(),
  fetchDeliveryItems: vi.fn(),
  fetchReleaseBatches: vi.fn(),
  createReleaseBatch: vi.fn(),
  fetchProjectPage: vi.fn(),
}))

/** 路由探针：断言按钮点击后确实发生了页面跳转 */
function LocationProbe() {
  const location = useLocation()
  return <output data-testid="current-path">{location.pathname}</output>
}

const page = (node: ReactNode, entry = '/') => render(
  <MemoryRouter initialEntries={[entry]}>
    {node}
    <LocationProbe />
  </MemoryRouter>,
)

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(fetchTestBatches).mockResolvedValue({ records: [], total: 0 } as never)
  vi.mocked(fetchReleaseBatches).mockResolvedValue({ records: [], total: 0 } as never)
  vi.mocked(fetchRequirementPage).mockResolvedValue({ records: [], total: 0 } as never)
  vi.mocked(fetchDeliveryItems).mockResolvedValue({ records: [] } as never)
  vi.mocked(fetchProjectPage).mockResolvedValue({ records: [] } as never)
  vi.mocked(submitTestBatch).mockResolvedValue({} as never)
  vi.mocked(createReleaseBatch).mockResolvedValue({} as never)
  vi.mocked(acceptTestBatch).mockResolvedValue({} as never)
  vi.mocked(returnTestBatch).mockResolvedValue({} as never)
})

/**
 * antd message 渲染在 body 端的 portal 里，不随组件卸载清理；
 * 不手动 destroy，上一个用例的校验提示会让下一个用例的 getByText 命中多个节点。
 */
afterEach(() => {
  cleanup()
  message.destroy()
})

/**
 * 断言“弹了这条警告”，而不是“只弹了一条”。
 * antd message 的节点挂在 document.body 上，不属于 cleanup() 能 unmount 的容器；
 * message.destroy() 后节点停在离场动画，而 jsdom 不触发 animationend，旧节点不会消失，
 * 同一个页面的两个前后用例就会叠成多条。直接把 .ant-message 整棵摸掉会把 antd 的 holder 一并拔了，
 * 导致后续用例的 toast 根本不再渲染。本用例集真正要钉的是“拦住并提示 + 不得调接口”，
 * 所以这里容忍重复节点，只要求至少出现一条。
 */
const expectWarning = (text: string) => {
  expect(screen.getAllByText(text).length).toBeGreaterThan(0)
}

describe('提测工作台：發起提測改为独立页', () => {
  it('点击「發起提測」跳转到 /rdm-test-submit，且不弹 Modal', async () => {
    page(<TestWorkbench />)
    fireEvent.click(await screen.findByRole('button', { name: /發起提測/ }))
    await waitFor(() => expect(screen.getByTestId('current-path')).toHaveTextContent('/rdm-test-submit'))
    expect(document.querySelector('.ant-modal')).toBeNull()
  })
})

describe('发布中心：創建發布批次改为独立页', () => {
  it('点击「創建發布批次」跳转到 /rdm-release-create，且不弹 Modal', async () => {
    page(<ReleaseCenter />)
    fireEvent.click(await screen.findByRole('button', { name: /創建發布批次/ }))
    await waitFor(() => expect(screen.getByTestId('current-path')).toHaveTextContent('/rdm-release-create'))
    expect(document.querySelector('.ant-modal')).toBeNull()
  })
})

describe('發起提測独立页', () => {
  it('以表单页形态渲染：有页面头与底部提交栏，不套 Modal', async () => {
    page(<TestBatchSubmit />, '/rdm-test-submit')
    expect(await screen.findByRole('heading', { name: '發起提測' })).toBeInTheDocument()
    expect(document.querySelector('.ant-modal')).toBeNull()
    expect(document.querySelector('.form-footer')).not.toBeNull()
    expect(screen.getByRole('button', { name: /提交提測/ })).toBeInTheDocument()
  })

  it('必填未齐时只提示、绝不调用提测接口', async () => {
    page(<TestBatchSubmit />, '/rdm-test-submit')
    fireEvent.click(await screen.findByRole('button', { name: /提交提測/ }))
    await waitFor(() => expectWarning('請先補全提測表單帶 * 的必填項'))
    expect(submitTestBatch).not.toHaveBeenCalled()
  })
})

describe('創建發布批次独立页', () => {
  it('以表单页形态渲染：有页面头与底部提交栏，不套 Modal', async () => {
    page(<ReleaseBatchCreate />, '/rdm-release-create')
    expect(await screen.findByRole('heading', { name: '創建發布批次' })).toBeInTheDocument()
    expect(document.querySelector('.ant-modal')).toBeNull()
    expect(document.querySelector('.form-footer')).not.toBeNull()
  })

  it('必填未齐时只提示、绝不调用创建接口', async () => {
    page(<ReleaseBatchCreate />, '/rdm-release-create')
    fireEvent.click(await screen.findByRole('button', { name: /創建批次/ }))
    await waitFor(() => expectWarning('請先補全發布批次帶 * 的必填項'))
    expect(createReleaseBatch).not.toHaveBeenCalled()
  })

  it('版本標識与發布負責人齊了才允许提交（負責人取员工下拉的 sys_user.id）', async () => {
    page(<ReleaseBatchCreate />, '/rdm-release-create')
    const version = await screen.findByPlaceholderText('例如 v2.1.0')
    fireEvent.change(version, { target: { value: 'v9.9.9' } })
    // 负责人是远程搜索下拉，未选择前提交必须被拦住
    fireEvent.click(screen.getByRole('button', { name: /創建批次/ }))
    await waitFor(() => expectWarning('請先補全發布批次帶 * 的必填項'))
    expect(createReleaseBatch).not.toHaveBeenCalled()
    expect(version).toHaveValue('v9.9.9')
  })
})
