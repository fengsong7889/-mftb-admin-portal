/**
 * 個人工作台测试：三桶待办 + 角色化区块渲染
 *
 * 钉死两件事：
 *  1. 待办看板（任务30）：mine/waiting_others/unassigned 三桶、去重计数用 todo-board.total、
 *     rawReasonHits > total 时展示「已去重 N 条」；
 *  2. 角色化改造：首屏区块由菜单权限推导的身份决定，且「区块不可见 == 不发该区块的请求」——
 *     这条是角色化的实质收益，如果只是渲染层隐藏而仍在后台打接口，就等于没做；
 *  3. 横幅口径：只做「工作视图 + 今日焦点 + 三个动作」，不重复首页的头像/姓名/日期，
 *     也不抄侧边栏已有的工作台直达入口。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import {
  fetchIssues,
  fetchMyTasks,
  fetchProjectPage,
  fetchReleaseBatches,
  fetchRequirementPage,
  fetchTestBatches,
  fetchTodoBoard,
  fetchWorkbench,
  fetchWorkbenchSummary,
} from '../../api/rdm'
import RdmWorkbench from './Workbench'

/**
 * 权限模拟台。
 * <p>用 vi.hoisted 是因为 vi.mock 工厂会被提到 import 之前执行，
 * 普通模块顶层变量在工厂里引用到的是未初始化的绑定。
 */
const mockAuth = vi.hoisted(() => ({
  menus: new Set<string>(),
  actions: new Set<string>(),
  empId: 'MF0001',
}))

/**
 * i18n 在测试环境未初始化（useTranslation 拿不到实例时 t 会掉回 key），
 * 这里直接返回 defaultValue 原繁体，使横幅断言与浏览器里看到的文字一致。
 */
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) => String(options?.defaultValue ?? key),
    i18n: { language: 'zh-TW', changeLanguage: () => undefined },
  }),
}))

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({
    user: { empId: mockAuth.empId, role: 'guest', name: '張三' },
    hasMenuPermission: (menuKey: string) => mockAuth.menus.has(menuKey),
    hasPermission: (permission: string) => mockAuth.actions.has(permission),
  }),
}))

vi.mock('../../api/rdm', () => ({
  fetchWorkbench: vi.fn(),
  fetchRequirementPage: vi.fn(),
  fetchProjectPage: vi.fn(),
  fetchWorkbenchSummary: vi.fn(),
  fetchTodoBoard: vi.fn(),
  fetchMyTasks: vi.fn(),
  fetchTestBatches: vi.fn(),
  fetchIssues: vi.fn(),
  fetchReleaseBatches: vi.fn(),
}))

const wbData = (roleNames: string[]) => ({
  identity: { name: '張三', deptName: '研發部', roleNames },
  stats: { mineTotal: 0, mineProgress: 0, todoTotal: 0, toAcceptTotal: 0, overdueTotal: 0, deliveredTotal: 0 },
  todos: [],
  recentActivity: [],
}) as never

function todo(key: string, bucket: string, title: string) {
  return {
    key, bucket, title, refNo: `R-${key}`, objectType: 'requirement', refId: 1, projectId: 0,
    refIssueId: null, responsibleUserId: 1, responsibleName: '張三', reasons: ['原因'],
    dueDate: null, overdue: false, overdueWorkingDays: 0, refVersion: 1, actionUrl: `/rdm-detail?id=${key}`,
  } as never
}

/** total=4（已去重），三桶 count 相加=5，rawReasonHits=8 → 證明用 total 而非分組相加 */
const board = {
  projectId: 0, userId: 1, authenticated: true,
  total: 4, mineCount: 2, waitingOthersCount: 2, unassignedCount: 1, rawReasonHits: 8,
  todos: [
    todo('a', 'mine', '我負責A'), todo('b', 'mine', '我負責B'),
    todo('c', 'waiting_others', '等待他人C'), todo('d', 'waiting_others', '等待他人D'),
    todo('e', 'unassigned', '未指派E'),
  ],
  computedAt: null,
} as never

/** 零待办看板：横幅焦点区应该收起所有标签，改给「没有紧急事项」的安抚文案 */
const quietBoard = {
  projectId: 0, userId: 1, authenticated: true,
  total: 0, mineCount: 0, waitingOthersCount: 0, unassignedCount: 0, rawReasonHits: 0,
  todos: [],
  computedAt: null,
} as never

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  mockAuth.menus = new Set(['rdm-workbench', 'rdm-intake-approval', 'rdm-requirement'])
  mockAuth.actions = new Set<string>()
  vi.mocked(fetchWorkbench).mockResolvedValue(wbData(['需求提出人']))
  vi.mocked(fetchTodoBoard).mockResolvedValue(board)
  vi.mocked(fetchRequirementPage).mockResolvedValue({ records: [], total: 0 } as never)
  vi.mocked(fetchProjectPage).mockResolvedValue({ records: [], total: 0 } as never)
  vi.mocked(fetchWorkbenchSummary).mockResolvedValue(null)
  vi.mocked(fetchMyTasks).mockResolvedValue([])
  vi.mocked(fetchTestBatches).mockResolvedValue({ records: [], total: 0 } as never)
  vi.mocked(fetchIssues).mockResolvedValue({ records: [], total: 0 } as never)
  vi.mocked(fetchReleaseBatches).mockResolvedValue({ records: [], total: 0 } as never)
})

function renderWb() {
  return render(<MemoryRouter><RdmWorkbench /></MemoryRouter>)
}

/** 只在 hero 区范围内查按钮：区块面板的「查看全部」也是按钮，同名会撞车 */
function heroOf(container: HTMLElement) {
  const hero = container.querySelector('.rdm-hero')
  if (!hero) throw new Error('hero 区未渲染')
  return within(hero as HTMLElement)
}

/** 等首屏加载完（loading 分支只渲染 Spin，hero 还不存在）；横幅已撤页名，改等稳定的视图标题 */
async function waitForHero(container: HTMLElement) {
  await within(container).findByText('我的工作視圖')
  return heroOf(container)
}

/** 待办看板区（区块 wrapper 的 id 同时是横幅「今日焦點」的滚动锚点） */
function boardOf(container: HTMLElement) {
  const board = container.querySelector('#rdm-wb-todo-board')
  if (!board) throw new Error('待办看板区未渲染')
  return within(board as HTMLElement)
}

describe('Workbench 三桶待辦', () => {
  it('展示 mine/waiting_others/unassigned 三桶（含「等待他人」）', async () => {
    // 桶名必须在看板范围内查：横幅今日焦點也用同一个词，全局 getByText 会撞车
    const { container } = renderWb()
    await waitForHero(container)
    const area = boardOf(container)
    expect(await area.findByText('我負責')).toBeInTheDocument()
    expect(area.getByText('等待他人')).toBeInTheDocument()
    expect(area.getByText('未指派')).toBeInTheDocument()
    // 各桶內的待辦標題
    expect(area.getByText('等待他人C')).toBeInTheDocument()
  })

  it('去重計數用 todo-board 的 total（4），不用分組相加（5）', async () => {
    renderWb()
    await screen.findByText('我負責')
    // total=4 展示；分組相加=5 不應作為總數出現（total Tag 為 4）
    expect(screen.getByText('已去重 4 條')).toBeInTheDocument()
  })

  it('rawReasonHits > total 時展示「已去重 N 條」並消費 fetchTodoBoard(0)', async () => {
    renderWb()
    await screen.findByText('已去重 4 條')
    expect(fetchTodoBoard).toHaveBeenCalledWith(0)
  })
})

describe('Workbench 角色化区块', () => {
  it('持研發工作台菜單的人首屏出現「我的研發任務」，且不會出現測試批次區塊', async () => {
    mockAuth.menus.add('rdm-delivery-board')
    renderWb()
    expect(await screen.findByText('我的研發任務')).toBeInTheDocument()
    expect(fetchMyTasks).toHaveBeenCalled()
    // 测试批次区块需要 rdm-delivery-test 权限，纯研发既看不到也不会打接口
    expect(screen.queryByText('我的測試批次')).not.toBeInTheDocument()
    expect(fetchTestBatches).not.toHaveBeenCalled()
  })

  it('持測試工作台菜單的人首屏出現「我的測試批次」與「待閉環問題」', async () => {
    mockAuth.menus.add('rdm-delivery-test')
    renderWb()
    expect(await screen.findByText('我的測試批次')).toBeInTheDocument()
    expect(screen.getByText('待閉環問題')).toBeInTheDocument()
    expect(fetchTestBatches).toHaveBeenCalled()
    expect(fetchIssues).toHaveBeenCalled()
    expect(screen.queryByText('我的研發任務')).not.toBeInTheDocument()
  })

  it('業務方（只有提需求與需求清單權限）不會看到執行類區塊，也不會發對應請求', async () => {
    renderWb()
    expect(await screen.findByText('我的提交追蹤')).toBeInTheDocument()
    expect(screen.queryByText('我的研發任務')).not.toBeInTheDocument()
    expect(screen.queryByText('我的測試批次')).not.toBeInTheDocument()
    expect(screen.queryByText('我的發布批次')).not.toBeInTheDocument()
    expect(fetchMyTasks).not.toHaveBeenCalled()
    expect(fetchTestBatches).not.toHaveBeenCalled()
    expect(fetchReleaseBatches).not.toHaveBeenCalled()
  })

  it('已保存到本機的「關閉區塊」會生效：不渲染也不取數', async () => {
    mockAuth.menus.add('rdm-delivery-board')
    localStorage.setItem(`rdm-workbench-layout:v1:${mockAuth.empId}`, JSON.stringify({
      v: 1,
      order: ['metrics', 'dev-tasks', 'todo-board'],
      dismissed: ['dev-tasks'],
    }))
    renderWb()
    expect(await screen.findByText('我的待辦')).toBeInTheDocument()
    expect(screen.queryByText('我的研發任務')).not.toBeInTheDocument()
    expect(fetchMyTasks).not.toHaveBeenCalled()
  })

  it('hero 不再抄工作台直达入口：测试工作台归侧边菜单与个性区块，横幅只留提需求/刷新/个性化', async () => {
    mockAuth.menus.add('rdm-delivery-test')
    const hero = await waitForHero(renderWb().container)
    // 按钮带图标时 accessible name 会把图标 aria-label 拼在前面，故用正则包含匹配
    expect(hero.getByRole('button', { name: /我要提需求/ })).toBeInTheDocument()
    expect(hero.getByRole('button', { name: /個性化配置/ })).toBeInTheDocument()
    // 身份直达与全局看板都是侧边栏已有的菜单，横幅重复挂入口会把第一屏钉死
    expect(hero.queryByRole('button', { name: /測試工作台/ })).not.toBeInTheDocument()
    expect(hero.queryByRole('button', { name: /全局看板/ })).not.toBeInTheDocument()
    // 但对应区块照旧按身份上屏，该看的内容没被砍掉
    expect(await screen.findByText('我的測試批次')).toBeInTheDocument()
  })

  it('hero 今日焦點只收非零项，全零时给「没有紧急事项」而不是一排 0', async () => {
    const first = renderWb()
    const hero = await waitForHero(first.container)
    // 默认 mock：待办看板 waitingOthersCount=2、stats 全 0 → 只出一枚焦点标签
    expect(hero.getByText('等待他人')).toBeInTheDocument()
    expect(hero.queryByText('待我處理')).not.toBeInTheDocument()
    first.unmount()

    vi.mocked(fetchTodoBoard).mockResolvedValue(quietBoard)
    const second = await waitForHero(renderWb().container)
    expect(second.getByText('目前沒有需要你立即處理的事')).toBeInTheDocument()
  })
})
