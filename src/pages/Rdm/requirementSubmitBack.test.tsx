/**
 * 「提交需求」表单页的返回接线测试。
 *
 * bug 现场：从「提需求」菜单点「提需求」进来后，头部「返回」与底部「取消」都写死跳个人工作台，
 * 用户回不到自己刚存草稿的那张列表。落点解析规则本身由 src/constants/menuDataSource.test.ts 钉住
 * （白名单、伪造来源回落、草稿默认回提需求），这里只验页面有没有真的把它接到两个按钮上：
 *  1. 带 from=rdm-intake-approval 进来 → 返回/取消都回提需求，且按钮文案取的是「返回提需求」；
 *  2. 不带 from 的历史链接 → 保持旧行为回工作台（不因为这次修复改变原有入口）。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router-dom'
import RequirementSubmit from './RequirementSubmit'

vi.mock('../../api/rdm', () => ({
  RDM_INTAKE_MODE_LABEL: { APPROVAL: '需審批', AUTO: '免審直送' },
  createRequirement: vi.fn(),
  fetchFunctionPoints: vi.fn().mockResolvedValue([]),
  fetchMenuTree: vi.fn().mockResolvedValue([]),
  fetchProductOptions: vi.fn().mockResolvedValue([]),
  fetchProjectPage: vi.fn().mockResolvedValue({ records: [], total: 0 }),
  // 返回落点与草稿内容无关：给 null 让续编回填分支直接跳过，聚焦在导航接线上
  fetchRequirementDetail: vi.fn().mockResolvedValue(null),
  fetchRequirementPage: vi.fn().mockResolvedValue({ records: [], total: 0 }),
  fetchSimilarRequirements: vi.fn().mockResolvedValue([]),
  simulateIntake: vi.fn().mockResolvedValue({ mode: 'AUTO', needApproval: false, policyName: '默認策略', policyVersion: 'v1', approvalNodes: [], abnormal: false }),
  submitRequirement: vi.fn(),
  updateRequirement: vi.fn(),
  uploadAttachment: vi.fn(),
}))
vi.mock('../../api/employee', () => ({ fetchEmployees: vi.fn().mockResolvedValue({ records: [], total: 0 }) }))
vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({ user: { empId: 'MF00011', name: '測試提出人' }, hasPermission: () => true }),
}))
/** t 直接回 key（与 Workbench.test 同一口径）：断言的是「取的是哪个文案 key」，不是译文本身 */
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) => String(options?.defaultValue ?? key),
    i18n: { language: 'zh-TW', changeLanguage: () => undefined },
  }),
}))

/** 跳转探针：跟着 Router context 重渲染，落在哪个路由一眼可见，不必去断言 navigate 的调用参数 */
function WhereAmI() {
  const location = useLocation()
  return <div data-testid="where">{location.pathname}</div>
}

function renderAt(entry: string) {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <RequirementSubmit />
      <WhereAmI />
    </MemoryRouter>,
  )
}

beforeEach(() => {
  localStorage.clear()
})

describe('提交需求页的返回落点', () => {
  it('从「提需求」菜单进来：返回文案与落点都指向提需求', () => {
    renderAt('/rdm-submit?from=rdm-intake-approval')

    // antd 图标的 aria-label 会并进按钮的可访问名，故用正则而不是全等
    fireEvent.click(screen.getByRole('button', { name: /rdm\.reqSubmit\.backToSubmit/ }))
    expect(screen.getByTestId('where')).toHaveTextContent('/rdm-intake-approval')
  })

  it('从「提需求」菜单进来：底部「取消」也回提需求，不留一条死路', () => {
    renderAt('/rdm-submit?from=rdm-intake-approval')

    fireEvent.click(screen.getByRole('button', { name: /取消/ }))
    expect(screen.getByTestId('where')).toHaveTextContent('/rdm-intake-approval')
  })

  it('无 from 的历史链接（书签/报表深链）保持旧行为：新建回工作台', () => {
    renderAt('/rdm-submit')

    fireEvent.click(screen.getByRole('button', { name: /rdm\.reqSubmit\.backToWorkbench/ }))
    expect(screen.getByTestId('where')).toHaveTextContent('/rdm-workbench')
  })
})
