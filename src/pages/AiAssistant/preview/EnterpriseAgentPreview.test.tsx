import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import EnterpriseAgentPreview from './EnterpriseAgentPreview'

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }))
vi.mock('@/components/DetailPageHeader', () => ({ default: ({ title }: { title: string }) => <h1>{title}</h1> }))

function renderPane(pane: string) {
  return render(<MemoryRouter initialEntries={[`/ai-assistant?preview=enterprise&pane=${pane}`]}><EnterpriseAgentPreview /></MemoryRouter>)
}

/** antd 图标会进入无障碍名称，统一用正则匹配文字部分。 */
function clickButton(name: RegExp) {
  fireEvent.click(screen.getByRole('button', { name }))
}

function queryButton(name: RegExp) {
  return screen.queryByRole('button', { name })
}

describe('企业 Agent 第一阶段隔离交互', () => {
  const fetchSpy = vi.fn()
  beforeEach(() => { fetchSpy.mockReset(); vi.stubGlobal('fetch', fetchSpy) })
  afterEach(() => vi.unstubAllGlobals())

  it('默认标明模拟边界，并要求先审批才显示执行入口', () => {
    renderPane('runs')
    expect(screen.getByText(/全部為模擬資料/)).toBeTruthy()
    clickButton(/開始模擬/)
    expect(queryButton(/模擬執行前重驗與執行/)).toBeNull()
    clickButton(/模擬提交審批/)
    expect(screen.getByText('等待示例業務審批人，尚未執行')).toBeTruthy()
    clickButton(/模擬批准/)
    clickButton(/模擬執行前重驗與執行/)
    expect(screen.getByText('演練完成，沒有生產副作用')).toBeTruthy()
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('外部结果不确定时只提供回执查验，不提供重发', () => {
    renderPane('runs')
    fireEvent.click(screen.getByRole('switch', { name: '模擬外部超時' }))
    clickButton(/開始模擬/)
    clickButton(/模擬提交審批/)
    clickButton(/模擬批准/)
    clickButton(/模擬執行前重驗與執行/)
    expect(screen.getByText('可能已受理：先核實，不能重發')).toBeTruthy()
    expect(queryButton(/模擬執行前重驗與執行/)).toBeNull()
    clickButton(/模擬查驗回執/)
    expect(screen.getByText('演練完成，沒有生產副作用')).toBeTruthy()
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('审批后资源变化要求重新生成提案', () => {
    renderPane('runs')
    clickButton(/開始模擬/)
    clickButton(/模擬提交審批/)
    clickButton(/模擬批准/)
    fireEvent.click(screen.getByRole('switch', { name: '模擬資源版本變更' }))
    clickButton(/模擬執行前重驗與執行/)
    expect(screen.getByText(/原提案與審批失效/)).toBeTruthy()
    expect(screen.queryByText('演練完成，沒有生產副作用')).toBeNull()
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('权限撤销后不显示上一次知识引用', () => {
    renderPane('knowledge')
    clickButton(/試搜示例/)
    expect(screen.getByText('示例物資領用規範')).toBeTruthy()
    fireEvent.click(screen.getByRole('switch', { name: '知識樣例權限' }))
    clickButton(/試搜示例/)
    expect(screen.queryByText('示例物資領用規範')).toBeNull()
    expect(screen.getByText('沒有可引用的授權依據')).toBeTruthy()
    expect(fetchSpy).not.toHaveBeenCalled()
  })
})
