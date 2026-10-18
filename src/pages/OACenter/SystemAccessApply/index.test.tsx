/**
 * 系統權限申請页测试（企業門戶「我要申請」的落地页）
 *
 * 钉死六件事（2026-10 改口径后：申请人陈述诉求，不再勾选菜单）：
 *  1. 页面**不再拉菜单树**、不渲染任何菜单勾选控件——菜单级申请会把目标系统的功能全貌
 *     摊给对它零权限的人（架构泄露），这条断言就是防复发的护栏；
 *  2. 带 ?system= 进入时系统锁定为只读；无 ?system= 时用后端目录渲染下拉；
 *  3. 提交前校验：未选场景 / 未填诉求 / 选「至指定日期」却没给日期时绝不触碰后端（§B.3）；
 *  4. 提交载荷只含诉求（场景 code + 期限 + 说明），不含菜单字段与任何身份字段；
 *  5. 参考角色目录：非空时渲染并默认「不指定」，选中后载荷带 preferredRoleId；
 *     目录为空时整卡不渲染（退化为纯诉求制），加载失败给重试入口；
 *  6. 同系统已有在途申请时给出提示并禁用提交（后端同样会拒，前端先讲清楚）。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { I18nextProvider } from 'react-i18next'
import { MemoryRouter } from 'react-router-dom'
import { Modal, message } from 'antd'
import i18n from '../../../i18n'
import zh from '../../../i18n/locales/zh-TW.json'
import { fetchMenuTree } from '../../../api/menu'
import {
  fetchMySystemAccessRequests, fetchRequestableSystems, fetchSelfServiceRoles,
  submitSystemAccessRequest,
} from '../../../api/systemAccessRequest'
import SystemAccessApply from './index'

vi.mock('../../../contexts/AuthContext', () => ({
  useAuth: () => ({
    user: {
      username: 'tester', name: '测试员工', empId: 'MF00099', role: 'guest',
      department: '研發部', position: '工程師',
    },
    // 成功弹窗文案按「能不能看流程事項」分支，缺这个函数会让提交回调直接报错
    hasMenuPermission: () => true,
  }),
}))
// 菜单接口仍然 mock：本页已不该调用它，用例 1 正是靠「一次都没调」来钉死架构泄露的修复
vi.mock('../../../api/menu', () => ({ fetchMenuTree: vi.fn() }))
vi.mock('../../../api/systemAccessRequest', () => ({
  submitSystemAccessRequest: vi.fn(),
  fetchMySystemAccessRequests: vi.fn(),
  fetchRequestableSystems: vi.fn(),
  fetchSelfServiceRoles: vi.fn(),
  fetchSystemAccessRequestByFlow: vi.fn(),
  fetchSystemAccessGrantOptions: vi.fn(),
}))

/** 参考角色目录夹具：只有角色名与业务说明（后端刻意不返回 code / 菜单数 / 权限明细） */
const roleCatalog = [
  { roleId: 11, roleName: '考勤查看員', description: '適合需要核對打卡與異常的門店與運營崗，只讀' },
  { roleId: 12, roleName: '考勤管理員', description: '可維護考勤組與排班規則，適合人事專員' },
]

function mount(entry = '/system-access-apply?system=oa&name=流程審批系統') {
  return render(
    <I18nextProvider i18n={i18n}>
      <MemoryRouter initialEntries={[entry]}>
        <SystemAccessApply />
      </MemoryRouter>
    </I18nextProvider>,
  )
}

/** 勾选一个使用场景（antd Checkbox 的可点区域是 wrapper，直接点文字节点不触发） */
function checkScenario(label: string) {
  const wrapper = screen.getByText(label).closest('.ant-checkbox-wrapper')
  if (!wrapper) throw new Error(`未找到使用場景 ${label}`)
  fireEvent.click(wrapper)
}

/**
 * 选中一个单选项（期限 / 参考角色共用）。
 * <p>必须点 label（.ant-radio-wrapper）而不是直接点 input：jsdom 是先跑 label 的激活转发
 * （内部调 input.click() → 先置 checked 再派发 click），而直接 dispatch 一个 click 到 input 时
 * 激活行为在事件派发之后才跑，React 的 onChange 读到的仍是 checked=false，表现为「点了没反应」。
 */
function pickRadio(label: string) {
  const wrapper = screen.getByText(label).closest('.ant-radio-wrapper')
  if (!wrapper) throw new Error(`未找到單選項 ${label}`)
  fireEvent.click(wrapper)
}

/** getByText 不会做 i18next 插值，带变量的文案先手工展开再断言 */
function interpolate(template: string, vars: Record<string, string | number>) {
  return Object.entries(vars).reduce(
    (text, [key, value]) => text.replaceAll(`{{${key}}}`, String(value)),
    template,
  )
}

/**
 * 提交按钮：antd 会把图标名一并算进可访问名（实际为 "send提交申請"），
 * 所以用正则而不是全字匹配。
 */
function submitButton() {
  return screen.getByRole('button', { name: new RegExp(zh.systemAccessApply.submit) })
}

/**
 * 二次确认弹窗的「確定提交」：antd 静态 API 渲染在 body 端的 portal 里，
 * 且不是同步上屏——必须先 await findByRole，否则点不到（表现为「点了没反应」的假失败）。
 */
async function confirmSubmit() {
  const dialog = await screen.findByRole('dialog')
  fireEvent.click(within(dialog).getByRole('button', { name: zh.common.confirmSubmit }))
}

/** 填一条最小可提交的诉求（场景 + 说明），期限保持默认「长期」 */
async function fillDemand(text = '需要查看流程配置以跟进审批链') {
  checkScenario(zh.systemAccessApply.scenarioDailyView)
  fireEvent.change(screen.getByPlaceholderText(zh.systemAccessApply.reasonPlaceholder), {
    target: { value: text },
  })
}

/**
 * Modal.confirm / message 渲染到 document.body，不随组件卸载清理；
 * destroyAll 走关闭动画，jsdom 下节点不会立刻消失，不显式摘掉的话下一个用例
 * 会点到旧闭包里的「確定提交」（表现为提交了上一个用例的载荷）。
 */
afterEach(() => {
  Modal.destroyAll()
  message.destroy()
  document.querySelectorAll('.ant-modal-root, .ant-modal-wrap, .ant-message').forEach(node => node.remove())
})

beforeEach(async () => {
  vi.clearAllMocks()
  await i18n.changeLanguage('zh-TW')
  vi.mocked(fetchMySystemAccessRequests).mockResolvedValue([])
  vi.mocked(fetchSelfServiceRoles).mockResolvedValue([])
  vi.mocked(fetchRequestableSystems).mockResolvedValue([
    { code: 'eam', name: '物資管理系統', description: '資產、耗材' },
  ])
  vi.mocked(submitSystemAccessRequest).mockResolvedValue('XTSQ2026101801')
})

describe('系統權限申請：不再暴露系统结构', () => {
  it('页面不拉菜单树、不渲染任何菜单勾选控件', async () => {
    mount()
    await screen.findByText(zh.systemAccessApply.demandSection)
    expect(fetchMenuTree).not.toHaveBeenCalled()
    expect(document.querySelector('.ant-tree')).toBeNull()
    // 六个使用场景照旧渲染（业务动作粒度，不是菜单粒度）
    expect(screen.getByText(zh.systemAccessApply.scenarioDailyView)).toBeInTheDocument()
    expect(screen.getByText(zh.systemAccessApply.scenarioConfigMaintain)).toBeInTheDocument()
    // 系统由门户带参锁定：展示为只读文本而不是下拉
    expect(screen.getByText(zh.systemAccessApply.targetSystem)).toBeInTheDocument()
    expect(screen.getByText(zh.portal.systems.oa.name)).toBeInTheDocument()
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument()
  })

  it('无 ?system= 时用后端目录渲染可申请系统下拉，并按系统拉参考角色目录', async () => {
    mount('/system-access-apply')
    const combo = await screen.findByRole('combobox')
    expect(combo).toBeInTheDocument()
    expect(fetchRequestableSystems).toHaveBeenCalledTimes(1)
    expect(fetchMenuTree).not.toHaveBeenCalled()
    // 未选系统前不拉角色目录：目录按系统裁剪，没有系统就没有可拉的目录
    expect(fetchSelfServiceRoles).not.toHaveBeenCalled()
    fireEvent.mouseDown(combo)
    expect(await screen.findByText('物資管理系統')).toBeInTheDocument()
  })
})

describe('系統權限申請：提交校验与载荷', () => {
  it('期限提示必须如实写明自动收回（不能许下「只供参考」的假承诺）', async () => {
    mount()
    await screen.findByText(zh.systemAccessApply.demandSection)
    const hint = screen.getByText(zh.systemAccessApply.durationHint)
    expect(hint).toBeInTheDocument()
    // 后端已上线到期回收作业：文案里必须同时出现「次日」与「自動收回」，
    // 否则申请人会以为权限是永久的（或反过来以为到期当天就没了）
    expect(hint.textContent).toContain('自動收回')
    expect(hint.textContent).toContain('長期')
  })

  it('未选场景 / 未填诉求 / 期限选了至指定日期却没给日期时都不触碰后端', async () => {
    mount()
    await screen.findByText(zh.systemAccessApply.demandSection)

    fireEvent.click(submitButton())
    expect(await screen.findByText(zh.systemAccessApply.scenarioRequired)).toBeInTheDocument()
    expect(submitSystemAccessRequest).not.toHaveBeenCalled()

    checkScenario(zh.systemAccessApply.scenarioDataCheck)
    fireEvent.click(submitButton())
    expect(await screen.findByText(zh.systemAccessApply.reasonRequired)).toBeInTheDocument()
    expect(submitSystemAccessRequest).not.toHaveBeenCalled()

    fireEvent.change(screen.getByPlaceholderText(zh.systemAccessApply.reasonPlaceholder), {
      target: { value: '需要核对门店考勤' },
    })
    // 选「至指定日期」但不给日期：日期缺失会让审批人无从判断范围，必须当场拦下
    pickRadio(zh.systemAccessApply.durationUntil)
    expect(screen.getByPlaceholderText(zh.systemAccessApply.durationDatePlaceholder)).toBeInTheDocument()
    fireEvent.click(submitButton())
    expect(await screen.findByText(zh.systemAccessApply.durationDateRequired)).toBeInTheDocument()
    expect(submitSystemAccessRequest).not.toHaveBeenCalled()
  })

  it('提交只上送诉求内容，不含菜单字段与身份字段', async () => {
    mount()
    await fillDemand()
    fireEvent.click(submitButton())

    // 提交前必须过二次确认，且确认框里把申请摘要列清楚（提交就开审批流，不该一点就飞）
    const dialog = await screen.findByRole('dialog')
    expect(dialog).toHaveTextContent(zh.systemAccessApply.confirmTitle)
    expect(dialog).toHaveTextContent(zh.systemAccessApply.scenarioDailyView)
    expect(dialog).toHaveTextContent(zh.systemAccessApply.durationPermanent)
    expect(dialog).toHaveTextContent('需要查看流程配置以跟进审批链')
    expect(dialog).toHaveTextContent(zh.portal.systems.oa.name)
    expect(submitSystemAccessRequest).not.toHaveBeenCalled()
    await confirmSubmit()

    await waitFor(() => expect(submitSystemAccessRequest).toHaveBeenCalledTimes(1))
    const payload = vi.mocked(submitSystemAccessRequest).mock.calls[0][0]
    expect(payload).toEqual({
      systemCode: 'oa',
      scenarios: ['daily_view'],
      durationType: 'permanent',
      durationUntil: undefined,
      preferredRoleId: undefined,
      reason: '需要查看流程配置以跟进审批链',
      attachments: undefined,
    })
    // 菜单不再是申请对象；身份只由服务端从登录态取，请求体里一个都不许有
    const serialized = JSON.stringify(payload)
    expect(serialized).not.toMatch(/menuKey|requestedMenus/i)
    expect(serialized).not.toMatch(/userId|empId|username|department/i)
    expect(await screen.findByText(zh.systemAccessApply.submitSuccessTitle)).toBeInTheDocument()
    expect(screen.getByText('XTSQ2026101801')).toBeInTheDocument()
  })

  it('选「至指定日期」并给出日期时，载荷带 ISO 截止日、确认框显示中文口径', async () => {
    mount()
    await fillDemand('需要临时核对上季度考勤')
    pickRadio(zh.systemAccessApply.durationUntil)
    const dateInput = screen.getByPlaceholderText(zh.systemAccessApply.durationDatePlaceholder)
    fireEvent.change(dateInput, { target: { value: '2026-12-31' } })
    fireEvent.keyDown(dateInput, { key: 'Enter', keyCode: 13 })

    fireEvent.click(submitButton())
    const dialog = await screen.findByRole('dialog')
    expect(dialog).toHaveTextContent(interpolate(zh.systemAccessApply.durationUntilDate, { date: '2026-12-31' }))
    await confirmSubmit()

    await waitFor(() => expect(submitSystemAccessRequest).toHaveBeenCalledTimes(1))
    expect(vi.mocked(submitSystemAccessRequest).mock.calls[0][0]).toMatchObject({
      durationType: 'until',
      durationUntil: '2026-12-31',
    })
  })
})

describe('系統權限申請：参考角色目录', () => {
  it('目录为空时整卡不渲染，页面退化为纯诉求制', async () => {
    mount()
    await screen.findByText(zh.systemAccessApply.demandSection)
    await waitFor(() => expect(fetchSelfServiceRoles).toHaveBeenCalledWith('oa'))
    expect(screen.queryByText(zh.systemAccessApply.preferredRoleSection)).not.toBeInTheDocument()
    expect(screen.queryByText(zh.systemAccessApply.preferredRoleLoadError)).not.toBeInTheDocument()
  })

  it('目录非空时展示角色名与业务说明，不暴露菜单数与角色编码', async () => {
    vi.mocked(fetchSelfServiceRoles).mockResolvedValue(roleCatalog)
    mount()
    expect(await screen.findByText(zh.systemAccessApply.preferredRoleSection)).toBeInTheDocument()
    expect(screen.getByText('考勤查看員')).toBeInTheDocument()
    expect(screen.getByText('考勤管理員')).toBeInTheDocument()
    // 只暴露名称与业务说明：不得出现角色编码或菜单数量（那又成了结构地图）
    expect(screen.getByText(/適合需要核對打卡與異常的門店與運營崗/)).toBeInTheDocument()
    expect(screen.queryByText(/該角色在本系統已授權/)).not.toBeInTheDocument()
    expect(screen.queryByText(/ATTENDANCE_|role_/)).not.toBeInTheDocument()
    // 「不指定」默认选中：不选角色是完全正当的，审批人会按诉求决定
    const noneInput = screen.getByText(zh.systemAccessApply.preferredRoleNone)
      .closest('.ant-radio-wrapper')?.querySelector('input')
    expect(noneInput).toBeChecked()
  })

  it('默认不指定时载荷不带 preferredRoleId', async () => {
    vi.mocked(fetchSelfServiceRoles).mockResolvedValue(roleCatalog)
    mount()
    await screen.findByText(zh.systemAccessApply.preferredRoleSection)
    await fillDemand('需要核对门店打卡与异常')
    fireEvent.click(submitButton())
    await confirmSubmit()
    await waitFor(() => expect(submitSystemAccessRequest).toHaveBeenCalledTimes(1))
    expect(vi.mocked(submitSystemAccessRequest).mock.calls[0][0].preferredRoleId).toBeUndefined()
  })

  it('选中参考角色后确认框显示角色名，载荷带目录里的 roleId', async () => {
    vi.mocked(fetchSelfServiceRoles).mockResolvedValue(roleCatalog)
    mount()
    await screen.findByText(zh.systemAccessApply.preferredRoleSection)
    await fillDemand('需要维护考勤组与排班规则')
    pickRadio('考勤管理員')

    fireEvent.click(submitButton())
    const dialog = await screen.findByRole('dialog')
    expect(dialog).toHaveTextContent(zh.systemAccessApply.preferredRoleSection)
    expect(dialog).toHaveTextContent('考勤管理員')
    await confirmSubmit()

    await waitFor(() => expect(submitSystemAccessRequest).toHaveBeenCalledTimes(1))
    // 必须是目录里返回的 roleId（不是前端自己编的），否则后端白名单校验会把它拒掉
    expect(vi.mocked(submitSystemAccessRequest).mock.calls[0][0]).toMatchObject({
      systemCode: 'oa',
      preferredRoleId: 12,
    })
  })

  it('目录加载失败给错误与重试入口，重试成功后正常渲染', async () => {
    vi.mocked(fetchSelfServiceRoles).mockRejectedValueOnce(new Error('network'))
    mount()
    expect(await screen.findByText(zh.systemAccessApply.preferredRoleLoadError)).toBeInTheDocument()
    // 重试后的返回值要在点击之前就换好：fireEvent.click 会同步跑完 effect，
    // 晚一步就还是 beforeEach 里的空目录（表现为「重试了但角色还是不出来」的假失败）
    vi.mocked(fetchSelfServiceRoles).mockResolvedValue(roleCatalog)
    // antd 会给两个字的中文按钮自动插空格（实际可访问名为「重 試」），故用正则
    fireEvent.click(screen.getByRole('button', { name: /重\s*試/ }))

    expect(await screen.findByText('考勤查看員')).toBeInTheDocument()
    expect(fetchSelfServiceRoles).toHaveBeenCalledTimes(2)
  })
})

describe('系統權限申請：重复申请防护', () => {
  it('同系统已有在途申请时提示流程编号并禁用提交', async () => {
    vi.mocked(fetchMySystemAccessRequests).mockResolvedValue([{
      id: 7, flowNo: 'XTSQ2026101701', systemCode: 'oa', systemName: '流程審批系統',
      applicantName: '测试员工', applicantEmpId: 'MF00099', deptName: '研發部',
      requestedMenus: [], scenarios: ['daily_view'], durationType: 'permanent', durationUntil: null,
      preferredRoleId: null, preferredRoleName: null,
      revokeStatus: 'none', revokedAt: null, revokedBy: null,
      reason: '早前提交的申请', attachments: [], status: 'pending',
      grantTargetType: null, grantTargetId: null, grantTargetName: null, grantStatus: 'none',
      grantedAt: null, grantedBy: null, rejectReason: null,
      applyTime: '2026-10-17 09:00:00', completeTime: null,
    }])
    mount()
    expect(await screen.findByText(zh.systemAccessApply.pendingTitle)).toBeInTheDocument()
    expect(screen.getByText(interpolate(zh.systemAccessApply.pendingDesc, { flowNo: 'XTSQ2026101701' })))
      .toBeInTheDocument()
    expect(submitButton()).toBeDisabled()
    expect(submitSystemAccessRequest).not.toHaveBeenCalled()
  })
})
