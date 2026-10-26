import { beforeEach, describe, expect, it, vi } from 'vitest'
import request from './request'
import { fetchEmployeeIdOptions, fetchEmployeeOptions } from './employee'

vi.mock('./request', () => ({
  default: { get: vi.fn() },
  isBackendUnavailable: vi.fn(() => false),
  SILENT_HEADER: 'X-Silent',
}))

/** 后端返回的在职员工（含部门/职位/职级等敏感列，用于验证这些列不会被拼进下拉文案） */
const employees = [
  {
    id: 21, username: 'zhangsan', name: '张三', empId: 'MF00021', role: 'USER', status: 1,
    department: '「市場營銷」事業部', position: '高級工程師', jobLevel: 'T6', sequence: 'T', rank: 'R3',
  },
  {
    id: 22, username: 'lisi', name: '橘子同学', empId: 'MF00022', role: 'USER', status: 1,
    department: '產品部', position: '中級工程師', jobLevel: 'T5',
  },
]

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(request.get).mockResolvedValue({ records: employees, total: employees.length })
})

describe('选人下拉文案（员工隐私）', () => {
  it('选项文案只含姓名与工号，禁止出现部门/职位/职级', async () => {
    const options = await fetchEmployeeIdOptions('')

    expect(options.map(o => o.label)).toEqual(['张三(MF00021)', '橘子同学(MF00022)'])
    for (const option of options) {
      expect(option.label).not.toContain('事業部')
      expect(option.label).not.toContain('工程師')
      expect(option.label).not.toContain('T6')
      expect(option.label).not.toContain('T5')
    }
  })

  it('选项值必须是 sys_user.id（后端按用户 ID 取值，传工号会静默变 NaN）', async () => {
    const options = await fetchEmployeeIdOptions('')

    expect(options.map(o => o.value)).toEqual(['21', '22'])
    expect(options.every(o => Number.isFinite(Number(o.value)) && Number(o.value) > 0)).toBe(true)
  })

  it('关键字交给服务端搜索，不做本地拼接过滤', async () => {
    await fetchEmployeeIdOptions('张三')

    expect(request.get).toHaveBeenCalledWith('/employees', {
      params: { page: 1, size: 50, keyword: '张三', employmentStatus: 'active' },
    })
  })

  /**
   * 工号版选项（资产使用人/经办人、门店 BD 绑定等）：保留部门供归属辨认，
   * 但职位与职级一律不拼进文案——选人下拉会把它们批量暴露给任何能打开该页的人。
   */
  it('工号版选项可带部门，但禁止出现职位/职级', async () => {
    const options = await fetchEmployeeOptions('')

    expect(options.map(o => o.label)).toEqual([
      '张三(MF00021) · 「市場營銷」事業部',
      '橘子同学(MF00022) · 產品部',
    ])
    expect(options.map(o => o.value)).toEqual(['MF00021', 'MF00022'])
    for (const option of options) {
      expect(option.label).not.toContain('工程師')
      expect(option.label).not.toContain('T6')
      expect(option.label).not.toContain('T5')
    }
  })
})
