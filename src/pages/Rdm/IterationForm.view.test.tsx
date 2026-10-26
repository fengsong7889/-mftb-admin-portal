/**
 * 迭代详情只读回归。
 *
 * 背景：列表操作列的「詳情」把只读用户带到 `/rdm-iteration-form?id=X&mode=view`。
 * 若表单仍可编辑、仍渲染保存键，只读入口等于把「编辑」换了个名字放出来。
 * 本文件钉住：view 模式标题为「迭代詳情」、全表单禁用、没有保存按钮，且不破坏缺省 edit 行为。
 */
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import i18n from '@/i18n'
import { fetchIterations, fetchProjectPage } from '@/api/rdm'
import IterationForm from './IterationForm'

beforeAll(async () => {
  await i18n.changeLanguage('zh-TW')
})

// 真实 EmployeeSelect 依赖员工接口；本文件只验证只读态，不需要选人交互
vi.mock('@/components/EmployeeSelect', () => ({
  default: () => <div data-testid="employee-select" />,
}))

vi.mock('@/api/rdm', () => ({
  fetchIterations: vi.fn(),
  fetchProjectPage: vi.fn(),
  saveIteration: vi.fn(),
}))

const iteration = {
  id: 1,
  code: 'SP202610001',
  name: '11月第一版迭代',
  projectId: 9,
  iterationType: 'sprint',
  startDate: '2026-11-02',
  endDate: '2026-11-13',
  capacityHours: 80,
  ownerUserId: 7,
  ownerName: '張三',
  status: 'active',
  remark: '完成推广金上线',
  reqCount: 2,
  taskCount: 3,
  taskHours: 18,
}

function renderAt(entry: string) {
  return render(<MemoryRouter initialEntries={[entry]}><IterationForm /></MemoryRouter>)
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(fetchIterations).mockResolvedValue([iteration])
  vi.mocked(fetchProjectPage).mockResolvedValue({ records: [], total: 0 })
})

describe('迭代详情只读模式', () => {
  it('mode=view 渲染「迭代詳情」，字段禁用且不渲染保存按钮', async () => {
    renderAt('/rdm-iteration-form?id=1&mode=view')

    // 表单回填完成后才可判断禁用态
    const nameInput = await screen.findByDisplayValue(iteration.name)
    expect(nameInput).toBeDisabled()
    expect(screen.getByText('迭代詳情')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /保存迭代/ })).not.toBeInTheDocument()
    // 只读页脚仍保留返回入口（页头另有带图标返回钮，故按「至少一个」断言）
    expect(screen.getAllByRole('button', { name: /返回/ }).length).toBeGreaterThan(0)
  })

  it('不带 mode 仍按编辑模式渲染（兼容列表「編輯」与既有链接）', async () => {
    renderAt('/rdm-iteration-form?id=1')

    const nameInput = await screen.findByDisplayValue(iteration.name)
    expect(nameInput).not.toBeDisabled()
    expect(screen.getByText('編輯迭代')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /保存迭代/ })).toBeInTheDocument()
  })
})
