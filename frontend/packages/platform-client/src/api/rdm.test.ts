/**
 * RDM 请求层测试（重点守两类坑）
 * 1. 模块加载期时序：mock 数据文件若在顶层常量初始化路径里引用后声明的常量，
 *    会抛 TDZ 错误（Cannot access 'X' before initialization），表现为全站页面异常；
 * 2. 后端不可用时才允许读接口降级 mock，真实业务错误必须原样抛出（否则会拿假数据覆盖真实结果）；
 * 3. 写接口默认绝不降级（阶段 2A）：假成功比报错更难发现。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import request, { isBackendUnavailable } from './request'
import {
  createRequirement,
  fetchRequirementPage,
  fetchScopeCounts,
  fetchWorkbench,
  fetchRequirementDetail,
  fetchTransitions,
  submitRequirement,
  type RdmRequirementForm,
} from './rdm'

vi.mock('./request', () => ({
  default: { get: vi.fn(), post: vi.fn(), put: vi.fn() },
  isBackendUnavailable: vi.fn(() => true),
  SILENT_HEADER: 'X-Request-Silent',
}))

beforeEach(() => { vi.clearAllMocks() })

describe('RDM 请求层', () => {
  it('模块可被加载：mock 数据初始化不踩 TDZ', async () => {
    // 仅 import 成功即成立；此断言防止未来把状态表写成后声明的顶层常量
    await expect(import('./rdm')).resolves.toBeDefined()
  })

  it('后端不可用时降级到本地数据且保持静默（不弹错误提示）', async () => {
    vi.mocked(isBackendUnavailable).mockReturnValue(true)
    vi.mocked(request.get).mockRejectedValue(new Error('Network Error'))

    const page = await fetchRequirementPage({ scope: 'all' })
    expect(page.records.length).toBeGreaterThan(0)
    // 列表行必须带阶段与当前处理人，否则工作台/列表会渲染成空行
    const first = page.records[0]
    expect(first.stage).toBeTruthy()
    expect(first.reqNo).toBeTruthy()
    expect(first.status).toBeTruthy()
  })

  it('工作台/计数/详情/流转表都能降级返回结构完整的数据', async () => {
    vi.mocked(isBackendUnavailable).mockReturnValue(true)
    vi.mocked(request.get).mockRejectedValue(new Error('Network Error'))

    const [workbench, counts, detail, transitions] = await Promise.all([
      fetchWorkbench(), fetchScopeCounts(), fetchRequirementDetail(1), fetchTransitions(),
    ])
    expect(workbench.identity.name).toBeTruthy()
    expect(workbench.stats).toBeDefined()
    expect(counts.all).toBeGreaterThan(0)
    expect(detail?.reqNo).toBeTruthy()
    expect(detail?.timeline.length).toBeGreaterThan(0)
    // 流转表是详情页操作区与配置页的共同真值
    expect(transitions.length).toBeGreaterThan(0)
  })

  it('真实业务错误不得被 mock 覆盖', async () => {
    vi.mocked(isBackendUnavailable).mockReturnValue(false)
    vi.mocked(request.get).mockRejectedValue(new Error('無權限'))

    await expect(fetchRequirementPage({ scope: 'all' })).rejects.toThrow('無權限')
  })

  it('写接口默认不降级：后端不可用时必须报错，不能给假成功', async () => {
    // 未设 VITE_RDM_DEMO（测试环境即如此），写降级分支必须处于关闭状态
    vi.mocked(isBackendUnavailable).mockReturnValue(true)
    vi.mocked(request.post).mockRejectedValue(new Error('Network Error'))

    const form: RdmRequirementForm = {
      title: '推薦報表支持自定義時間區間導出',
      reqType: 'OPTIMIZE',
      priority: 'P2',
      description: '现导只能选固定区间',
      targets: [],
      assignMode: 'POOL',
    }
    await expect(createRequirement(form, 'submit')).rejects.toThrow('Network Error')
  })

  it('自助提交走 create 专用端点，不占用通用流转的 edit 权', async () => {
    vi.mocked(request.post).mockResolvedValue({ id: 7, reqNo: 'XQ202610060007' } as never)

    await submitRequirement(7)

    expect(request.post).toHaveBeenCalledWith('/rdm/requirement/7/submit', { remark: undefined })
  })
})
