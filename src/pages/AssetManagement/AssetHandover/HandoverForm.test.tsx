import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { Modal } from 'antd'
import userEvent from '@testing-library/user-event'
import HandoverForm from './HandoverForm'
import { fetchEmployees, type EmployeeItem } from '../../../api/employee'
import { fetchDepartments } from '../../../api/department'
import { createHandover, fetchUserAssets } from '../../../api/eam'
import type { AssetItem } from '../../../api/asset'

const { t } = vi.hoisted(() => ({ t: (key: string) => key }))
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t }) }))
vi.mock('../../../api/employee', () => ({ fetchEmployees: vi.fn(), fetchEmployeeOptions: vi.fn() }))
vi.mock('../../../api/department', () => ({ fetchDepartments: vi.fn() }))
vi.mock('../../../api/eam', () => ({ fetchUserAssets: vi.fn(), createHandover: vi.fn() }))
vi.mock('../../../hooks/useAssetParameterCatalog', () => ({
  useAssetParameterCatalog: () => ({ categories: [], types: [] }),
}))
vi.mock('../../../components/AssetParameters', () => ({ default: () => null }))

const employees: EmployeeItem[] = [
  { id: 2, username: 'MF00002', name: '冯松', empId: 'MF00002', department: '交接部門', role: 'employee', status: 1, functionRoleIds: [] },
  { id: 3, username: 'MF00003', name: '冯松', empId: 'MF00003', department: '另一部門', role: 'employee', status: 1, functionRoleIds: [] },
]
const asset: AssetItem = {
  id: 1, assetNo: 'TEST-001', assetName: '測試資產', assetType: '手機',
  brand: '測試品牌', unit: '台', quantity: 1, purchaseValue: 10, purchaseDate: null, usageDate: null,
  source: 'self', company: '測試公司', location: '測試倉庫', department: '交接部門', userName: '冯松', status: 'in_use',
  images: null, remark: null, applicant: '測試員', scrapTime: null, createdAt: '', updatedAt: '',
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(fetchEmployees).mockImplementation(async ({ keyword }) => {
    const records = employees.filter(e => !keyword || `${e.name}(${e.empId})`.includes(keyword))
    return { records, total: records.length }
  })
  vi.mocked(fetchDepartments).mockResolvedValue([
    { id: 1, code: 'TEST', name: '接收部門', status: 1, permissions: [], userCount: 0 },
  ])
  vi.mocked(fetchUserAssets).mockResolvedValue([asset])
  vi.mocked(createHandover).mockImplementation(async data => ({
    ...data, id: 1, handoverNo: 'TEST-HANDOVER', assetCount: data.assetIds.length, status: 'done', createdAt: '',
  }))
})
afterEach(() => { Modal.destroyAll() })

function fromUserInput() {
  return screen.getAllByRole('combobox')[0]
}

function selectedFromUser() {
  return fromUserInput().closest('.ant-select')?.querySelector('.ant-select-selection-item')
}

async function selectEmployee(input: HTMLElement, label: string) {
  await userEvent.click(input)
  const option = await waitFor(() => {
    const dropdown = [...document.querySelectorAll<HTMLElement>('.ant-select-dropdown:not(.ant-select-dropdown-hidden)')]
      .find(element => getComputedStyle(element).pointerEvents !== 'none')
    expect(dropdown).toBeDefined()
    return within(dropdown!).getByText(label, { selector: '.ant-select-item-option-content' })
  })
  await userEvent.click(option)
}

async function selectFromUser() {
  await selectEmployee(fromUserInput(), '冯松(MF00002)')
  await waitFor(() => expect(screen.getByPlaceholderText('asset.colDepartment')).toHaveValue('交接部門'))
}

describe('交接人選中回顯', () => {
  it('默認列表選中並回填部門後，仍顯示姓名及工號，查詢使用 currentHolderId', async () => {
    render(<HandoverForm onBack={vi.fn()} />)
    await selectFromUser()

    expect(selectedFromUser()).toHaveTextContent(/^冯松\(MF00002\)$/)
    expect(fetchEmployees).toHaveBeenCalledTimes(1)
    expect(fetchUserAssets).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: /asset.btnQueryAssets/ }))
    await waitFor(() => expect(fetchUserAssets).toHaveBeenCalledWith(2))
    expect(selectedFromUser()).toHaveTextContent(/^冯松\(MF00002\)$/)
  })

  it('按工號搜索後可選擇同名員工，切換及清空時重置部門和資產', async () => {
    render(<HandoverForm onBack={vi.fn()} />)
    await selectFromUser()
    fireEvent.click(screen.getByRole('button', { name: /asset.btnQueryAssets/ }))
    await screen.findByText('TEST-001')

    fireEvent.mouseDown(fromUserInput())
    fireEvent.change(fromUserInput(), { target: { value: 'MF00003' } })
    await waitFor(() => expect(fetchEmployees).toHaveBeenCalledWith(expect.objectContaining({ keyword: 'MF00003' })))
    fireEvent.click(await screen.findByText('冯松(MF00003)', { selector: '.ant-select-item-option-content' }))
    await waitFor(() => expect(screen.getByPlaceholderText('asset.colDepartment')).toHaveValue('另一部門'))
    expect(selectedFromUser()).toHaveTextContent(/^冯松\(MF00003\)$/)
    expect(screen.queryByText('TEST-001')).not.toBeInTheDocument()

    fireEvent.mouseDown(fromUserInput().closest('.ant-select')!.querySelector('.ant-select-clear')!)
    expect(selectedFromUser()).toBeNull()
    expect(screen.getByPlaceholderText('asset.colDepartment')).toHaveValue('')
    expect(screen.getByRole('button', { name: /asset.btnQueryAssets/ })).toBeDisabled()
  })

  it('重新搜索無匹配結果時，已選標籤不退化為姓名或工號', async () => {
    render(<HandoverForm onBack={vi.fn()} />)
    await selectFromUser()
    fireEvent.mouseDown(fromUserInput())
    fireEvent.change(fromUserInput(), { target: { value: '不存在的員工' } })
    await waitFor(() => expect(fetchEmployees).toHaveBeenCalledWith(expect.objectContaining({ keyword: '不存在的員工' })))
    fireEvent.keyDown(fromUserInput(), { key: 'Escape', code: 'Escape' })
    await waitFor(() => expect(selectedFromUser()).toHaveTextContent(/^冯松\(MF00002\)$/))
  })

  it('顯示工號不改變提交的交接人和經辦人姓名', async () => {
    render(<HandoverForm onBack={vi.fn()} />)
    await selectFromUser()
    fireEvent.click(screen.getByRole('button', { name: /asset.btnQueryAssets/ }))
    await screen.findByText('TEST-001')
    fireEvent.click(screen.getAllByRole('checkbox')[1])
    fireEvent.click(screen.getByLabelText('asset.receiverTypeDepartment'))
    fireEvent.mouseDown(screen.getByLabelText('asset.receiverDept'))
    fireEvent.click(await screen.findByText('接收部門', { selector: '.ant-select-tree-title' }))
    const operatorField = screen.getByText('asset.colOperator', { selector: 'label' }).closest('.ant-form-item')!
    await selectEmployee(within(operatorField as HTMLElement).getByRole('combobox'), '冯松(MF00003)')
    fireEvent.click(screen.getByRole('button', { name: /common.save/ }))
    fireEvent.click(await screen.findByRole('button', { name: '確認提交' }))
    await waitFor(() => expect(createHandover).toHaveBeenCalledWith(expect.objectContaining({
      fromUserName: '冯松', operatorName: '冯松', assetIds: [1], receiverType: 'department', toDepartment: '接收部門',
    })))
  })
})
