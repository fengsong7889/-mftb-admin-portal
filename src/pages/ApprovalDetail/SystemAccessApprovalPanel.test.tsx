/**
 * 系統權限申請「授權配置」面板测试
 *
 * 钉死四件事（2026-10 改口径后：申请人不再勾菜单，面板也不再有覆盖率）：
 *  1. 候选卡展示角色名 + 业务说明 + 「已授权 N 项功能」的数量，**不出现**覆盖率与未覆盖菜单清单
 *     （菜单明细清单本身就是不该外泄的系统结构信息）；
 *  2. 选中角色时 onChange 收到的是 **number** 类型的 roleId——antd 透传原生事件，
 *     event.target.value 是字符串，漏掉 Number() 会让「选中后卡片不高亮 + 上送字符串 ID」，
 *     这是本次改造中发现并修掉的真实缺陷，用这条断言钉死；
 *  3. 申请人建议的角色带「申請人建議」标记；已持有的角色带「申請人已持有」标记；
 *  4. denied（非当前节点审批人）与「没有候选角色」是两种不同的态，各给各的指引。
 */
import { beforeAll, describe, expect, it, vi } from 'vitest'
import type { ComponentProps } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { I18nextProvider } from 'react-i18next'
import i18n from '../../i18n'
import zh from '../../i18n/locales/zh-TW.json'
import type { SystemAccessGrantOption } from '../../api/systemAccessRequest'
import SystemAccessApprovalPanel from './SystemAccessApprovalPanel'

const options: SystemAccessGrantOption[] = [
  {
    targetType: 'role', targetId: 12, targetName: '考勤管理員', targetCode: 'ATTENDANCE_ADMIN',
    description: '可維護考勤組與排班規則', grantedMenuCount: 9, preferred: true, alreadyBound: false,
  },
  {
    targetType: 'role', targetId: 11, targetName: '考勤查看員', targetCode: 'ATTENDANCE_VIEWER',
    description: '只讀查看打卡與異常', grantedMenuCount: 3, preferred: false, alreadyBound: true,
  },
]

function mount(props: Partial<ComponentProps<typeof SystemAccessApprovalPanel>> = {}) {
  const onChange = vi.fn()
  render(
    <I18nextProvider i18n={i18n}>
      <SystemAccessApprovalPanel
        options={options}
        value={null}
        onChange={onChange}
        systemName="考勤假勤系統"
        {...props}
      />
    </I18nextProvider>,
  )
  return { onChange }
}

/** 选中一个角色卡（点 antd 渲染的 label，jsdom 靠 label 激活转发才会真正置 checked） */
function pickRole(name: string) {
  const wrapper = screen.getByText(name).closest('.ant-radio-wrapper')
  if (!wrapper) throw new Error(`未找到角色卡 ${name}`)
  fireEvent.click(wrapper)
}

/** 断言直接拿 zh-TW 文案做字面比对，先固定语言（i18n 实例可能被其他用例切过） */
beforeAll(async () => {
  await i18n.changeLanguage('zh-TW')
})

describe('系統權限申請授權面板：候选展示', () => {
  it('展示角色名、业务说明与已授权功能数量', () => {
    mount()
    expect(screen.getByText(zh.approvalDetail.saGrantTitle)).toBeInTheDocument()
    expect(screen.getByText('考勤管理員')).toBeInTheDocument()
    expect(screen.getByText('可維護考勤組與排班規則')).toBeInTheDocument()
    expect(screen.getByText(zh.approvalDetail.saGrantMenuCount.replace('{{count}}', '9'))).toBeInTheDocument()
  })

  it('不再出现覆盖率与未覆盖菜单清单（申请人已不勾菜单，菜单明细也不该外泄）', () => {
    mount()
    expect(screen.queryByText(/覆蓋\s*\d+\s*\/\s*\d+/)).not.toBeInTheDocument()
    expect(screen.queryByText(/未覆蓋/)).not.toBeInTheDocument()
  })

  it('申请人建议项与已持有项各带标记', () => {
    mount()
    expect(screen.getByText(zh.approvalDetail.saGrantPreferred)).toBeInTheDocument()
    expect(screen.getByText(zh.approvalDetail.saGrantAlreadyBound)).toBeInTheDocument()
  })
})

describe('系統權限申請授權面板：选择', () => {
  it('点选角色后 onChange 收到 number 类型的 roleId', () => {
    const { onChange } = mount()
    pickRole('考勤管理員')
    expect(onChange).toHaveBeenCalledTimes(1)
    const value = onChange.mock.calls[0][0]
    expect(value).toBe(12)
    // 这条是本次修掉的缺陷：拿到字符串 "12" 时，父组件的 option.targetId === value 恒为 false，
    // 卡片不高亮、确认弹窗里也拼不出角色名
    expect(typeof value).toBe('number')
  })

  it('已持有的角色同样可选（授权是空操作，由界面提示而不是禁用）', () => {
    const { onChange } = mount()
    pickRole('考勤查看員')
    expect(onChange).toHaveBeenCalledWith(11)
  })
})

describe('系統權限申請授權面板：两种空态不混淆', () => {
  it('非当前节点审批人（403）给只读提示，而不是「没角色可授」', () => {
    mount({ denied: true, options: [] })
    expect(screen.getByText(zh.approvalDetail.saGrantDenied)).toBeInTheDocument()
    expect(screen.queryByText(zh.approvalDetail.saGrantNoOption)).not.toBeInTheDocument()
  })

  it('真的没有候选角色时给「去权限管理系统配置」的指引', () => {
    mount({ options: [] })
    expect(screen.getByText(zh.approvalDetail.saGrantNoOption)).toBeInTheDocument()
    expect(screen.getByText(/考勤假勤系統/)).toBeInTheDocument()
    expect(screen.queryByText(zh.approvalDetail.saGrantDenied)).not.toBeInTheDocument()
  })
})
