/**
 * 需求存量导入弹窗 · 预览行移除
 *
 * 钉死三件事：
 *  1. 移除只改本地待提交列表，确认文案带 Excel 行号，删除后不重排剩余行号；
 *  2. 只剩一条时移除按钮禁用（后端同样拒绝空列表）；
 *  3. 存在错误行时移除按钮也禁用，避免用户误以为「删行能消错」。
 */
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import i18n from '../../../i18n'
import { RDM_STATUS } from '../../../constants/rdm'
import type { ParsedRdmImportRow, RdmImportRowError } from '../rdmImport'
import RequirementImportModal from './RequirementImportModal'

const { parseMock } = vi.hoisted(() => ({ parseMock: vi.fn() }))

vi.mock('../rdmImport', () => ({
  generateRequirementImportTemplate: vi.fn(),
  parseRequirementImportExcel: parseMock,
}))

function row(rowNo: number, title: string, externalNo: string): ParsedRdmImportRow {
  return { rowNo, title, externalNo, status: RDM_STATUS.DEVELOPING, statusText: '開發中' }
}

beforeAll(async () => {
  await i18n.changeLanguage('zh-TW')
})

beforeEach(() => {
  parseMock.mockReset()
})

/** 渲染弹窗并模拟一次上传，等待解析结果落到预览表 */
async function openWith(rows: ParsedRdmImportRow[], errors: RdmImportRowError[] = []) {
  parseMock.mockResolvedValue({ rows, errors })
  render(<RequirementImportModal open onClose={() => {}} onImport={vi.fn()} />)
  const input = document.querySelector('input[type="file"]') as HTMLInputElement
  await act(async () => {
    fireEvent.change(input, { target: { files: [new File(['x'], 'requirements.xlsx')] } })
  })
  await waitFor(() => expect(parseMock).toHaveBeenCalled())
}

describe('RequirementImportModal 预览行移除', () => {
  it('确认移除后该行不再参与导入，剩余行保留 Excel 原行号', async () => {
    await openWith([
      row(2, '需求甲', 'MFTB-1'),
      row(3, '需求乙', 'MFTB-2'),
      row(4, '需求丙', 'MFTB-3'),
    ])
    expect(await screen.findByText('需求甲')).toBeInTheDocument()

    fireEvent.click(screen.getAllByRole('button', { name: '移除' })[0])
    const okButton = await screen.findByRole('button', { name: '確認移除' })
    expect(within(okButton.closest('.ant-modal') as HTMLElement).getByText(/第 2 行/)).toBeInTheDocument()

    await act(async () => {
      fireEvent.click(okButton)
    })

    await waitFor(() => expect(screen.queryByText('需求甲')).not.toBeInTheDocument())
    expect(screen.getByText('需求乙')).toBeInTheDocument()
    expect(screen.getByText('需求丙')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /確認導入（2 條）/ })).toBeEnabled()
  })

  it('只剩一条时禁用移除，并保留可导入的唯一一行', async () => {
    await openWith([row(5, '唯一需求', 'MFTB-9')])
    expect(await screen.findByText('唯一需求')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '移除' })).toBeDisabled()
  })

  it('存在错误行时禁用移除，先修正文件再操作', async () => {
    await openWith(
      [row(2, '需求甲', 'MFTB-1'), row(3, '需求乙', 'MFTB-2')],
      [{ rowNo: 4, message: '第 4 行：需求狀態不能在字典外' }],
    )
    expect(await screen.findByText('第 4 行：需求狀態不能在字典外')).toBeInTheDocument()
    for (const button of screen.getAllByRole('button', { name: '移除' })) {
      expect(button).toBeDisabled()
    }
  })
})
