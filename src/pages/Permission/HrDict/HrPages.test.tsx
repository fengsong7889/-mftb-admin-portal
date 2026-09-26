import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { I18nextProvider, initReactI18next } from 'react-i18next'
import { createInstance } from 'i18next'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ConfigProvider } from 'antd'
import enUS from 'antd/locale/en_US'
import en from '../../../i18n/locales/en.json'
import zh from '../../../i18n/locales/zh-TW.json'
import * as dictApi from '../../../api/hrDict'
import * as employeeApi from '../../../api/employee'
import HrDictForm from './HrDictForm'
import HrDictManagement from './index'
import ContractLedger from '../ContractLedger'
import MenuTabs from '../../../components/MenuTabs'

const permissions = vi.hoisted(() => new Set(['hr-dict:view', 'hr-dict:edit', 'contract-ledger:view', 'employee-management:view']))
vi.mock('../../../contexts/AuthContext', () => ({ useAuth: () => ({
  hasPermission: (key: string) => permissions.has(key),
  hasMenuPermission: () => true,
}) }))
vi.mock('../../../contexts/MenuContext', () => ({ useMenu: () => ({ menuTree: null, status: 'online' }) }))
vi.mock('../../../components/Sidebar', () => ({ pathToKey: {} }))
vi.mock('../../../hooks/useColumnConfig', () => ({ useColumnConfig: () => ({ configComponent: null, applyConfig: (value: unknown) => value }) }))
vi.mock('../../../api/hrDict', async importOriginal => ({
  ...await importOriginal<typeof import('../../../api/hrDict')>(),
  fetchHrDict: vi.fn(), createHrDict: vi.fn(), updateHrDict: vi.fn(), fetchHrDictOptions: vi.fn(),
  updateHrDictStatus: vi.fn(), deleteHrDict: vi.fn(),
}))
vi.mock('../../../api/employee', async importOriginal => ({
  // 合同台账页新增到期预警（CONTRACT_EXPIRY_BUCKET / fetchContractExpirySummary），保留其余真实导出
  ...await importOriginal<typeof import('../../../api/employee')>(),
  fetchContractLedger: vi.fn(),
  fetchContractExpirySummary: vi.fn(),
}))

const i18n = createInstance()
await i18n.use(initReactI18next).init({ lng: 'en', resources: { en: { translation: en }, 'zh-TW': { translation: zh } }, interpolation: { escapeValue: false } })
const item = { id: 987, dictType: 'WORK_LOCATION', code: 'TEST-LOC', name: '測試地點', nameEn: 'Test Location', status: 1 }
function Probe() {
  const location = useLocation()
  return <output data-testid="path">{location.pathname + location.search}</output>
}
function mount(element: React.ReactNode, path: string) {
  return render(<I18nextProvider i18n={i18n}><ConfigProvider locale={enUS}>
    <MemoryRouter initialEntries={[path]}><MenuTabs /><Routes>
      <Route path="/hr-dict-edit" element={element} />
      <Route path="/hr-dict" element={element} />
      <Route path="/contract-ledger" element={element} />
      <Route path="/employee-detail" element={<div>员工详情目标</div>} />
    </Routes><Probe /></MemoryRouter>
  </ConfigProvider></I18nextProvider>)
}

beforeEach(async () => {
  localStorage.clear()
  vi.clearAllMocks()
  permissions.add('hr-dict:edit')
  permissions.add('employee-management:view')
  await i18n.changeLanguage('en')
  vi.mocked(dictApi.fetchHrDict).mockResolvedValue([item])
  vi.mocked(dictApi.createHrDict).mockResolvedValue(item.id)
  vi.mocked(dictApi.updateHrDict).mockResolvedValue(undefined)
  vi.mocked(dictApi.fetchHrDictOptions).mockResolvedValue([])
  vi.mocked(dictApi.updateHrDictStatus).mockResolvedValue(undefined)
  vi.mocked(employeeApi.fetchContractLedger).mockResolvedValue({ records: [{ id: 1, userId: 42, contractNo: 'TEST-C11', status: '生效中', contractType: '劳动合同' }], total: 1 })
})

describe('字典表单保存与国际化', () => {
  it('英文校验失败保持表单，API失败保持标签，成功后关闭当前标签', async () => {
    const { container } = mount(<HrDictForm />, '/hr-dict-edit?type=WORK_LOCATION')
    fireEvent.click(screen.getByRole('button', { name: /Save/ }))
    expect(await screen.findByText('Enter a code')).toBeInTheDocument()
    expect(dictApi.createHrDict).not.toHaveBeenCalled()
    expect(container.querySelector('.menu-tabs-bar')).toHaveTextContent('Add · Work Location')
    fireEvent.change(screen.getByLabelText('Code'), { target: { value: 'TEST-LOC' } })
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: '測試地點' } })
    vi.mocked(dictApi.createHrDict).mockRejectedValueOnce(new Error('模拟保存失败'))
    fireEvent.click(screen.getByRole('button', { name: /Save/ }))
    await waitFor(() => expect(dictApi.createHrDict).toHaveBeenCalledTimes(1))
    expect(screen.getByTestId('path')).toHaveTextContent('/hr-dict-edit')
    expect(container.querySelector('.menu-tabs-bar')).toHaveTextContent('Add · Work Location')
    fireEvent.click(screen.getByRole('button', { name: /Save/ }))
    await waitFor(() => expect(screen.getByTestId('path')).toHaveTextContent('/hr-dict?type=WORK_LOCATION'))
    await waitFor(() => expect(container.querySelector('.menu-tabs-bar')).not.toHaveTextContent('Add · Work Location'))
    expect(dictApi.createHrDict).toHaveBeenLastCalledWith(expect.objectContaining({ dictType: 'WORK_LOCATION', code: 'TEST-LOC', name: '測試地點', status: 1 }))
  })

  it('编辑成功关闭编辑标签，保留字典类型；只读不显示保存', async () => {
    const { container, unmount } = mount(<HrDictForm />, '/hr-dict-edit?type=WORK_LOCATION&id=987')
    await waitFor(() => expect(screen.getByLabelText('Code')).toHaveValue('TEST-LOC'))
    expect(screen.getByLabelText('Code')).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: /Save/ }))
    await waitFor(() => expect(dictApi.updateHrDict).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(container.querySelector('.menu-tabs-bar')).not.toHaveTextContent('Edit · Work Location'))
    unmount()
    permissions.delete('hr-dict:edit')
    mount(<HrDictForm />, '/hr-dict-edit')
    expect(screen.queryByRole('button', { name: /Save/ })).not.toBeInTheDocument()
  })

  it('列表主体和状态二次确认双语，取消不调用API', async () => {
    mount(<HrDictManagement />, '/hr-dict?type=WORK_LOCATION')
    expect(await screen.findByText('TEST-LOC')).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Working Hours System' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('switch'))
    const dialog = await screen.findByRole('dialog')
    expect(dialog).toHaveTextContent('Disable dictionary item 測試地點?')
    fireEvent.click(within(dialog).getByRole('button', { name: /Cancel/ }))
    expect(dictApi.updateHrDictStatus).not.toHaveBeenCalled()
    await act(async () => { await i18n.changeLanguage('zh-TW') })
    expect(screen.getByRole('tab', { name: '工時制' })).toBeInTheDocument()
    expect(screen.getByPlaceholderText('編碼 / 名稱 / 英文名')).toBeInTheDocument()
  })
})

describe('合同台账详情与语言', () => {
  it('英文状态/类型展示不改变原值，详情跳转携带员工ID', async () => {
    mount(<ContractLedger />, '/contract-ledger')
    expect(await screen.findByText('TEST-C11')).toBeInTheDocument()
    expect(screen.getByText('Active')).toBeInTheDocument()
    expect(screen.getByText('Labor Contract')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Details' }))
    expect(screen.getByTestId('path')).toHaveTextContent('/employee-detail?id=42')
    expect(screen.getByText('员工详情目标')).toBeInTheDocument()
  })
  it('没有员工查看权限不提供不可访问的详情链接', async () => {
    permissions.delete('employee-management:view')
    mount(<ContractLedger />, '/contract-ledger')
    expect(await screen.findByText('TEST-C11')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Details' })).not.toBeInTheDocument()
  })
})
