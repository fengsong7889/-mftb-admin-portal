/**
 * RDM 第三/四批 API 契约测试
 *
 * 目的：把「端点路径 + 请求 payload 形状 + 幂等 requestId 注入」钉死，防止前端臆造 API。
 * 覆盖：交付项验收记录、问题闭环（resolve/bind/延期裁决）、发布批次全流程
 * （decide/open/rollback/紧急豁免/豁免裁决/补验完成/allowedActions）、灰度配置、存量迁移。
 *
 * 与 rdm.test.ts 同一套 mock 手法：mock ./request 的 get/post/patch，断言其被调用的路径与参数。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import request from './request'
import {
  submitAcceptanceRecord,
  fetchAcceptanceRecords,
  resolveIssue,
  bindIssueFollowUp,
  decideIssueDefer,
  decideReleaseBatch,
  openReleaseBatch,
  rollbackReleaseBatch,
  applyReleaseExemption,
  decideReleaseExemption,
  completeReleaseSupplementary,
  fetchReleaseBatchActions,
  fetchGrayscaleStatus,
  fetchMigrationBatches,
  previewStockMigration,
  type RdmAcceptanceRecordSubmitForm,
  type RdmIssueResolveForm,
} from './rdm'

vi.mock('./request', () => ({
  default: { get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn(), delete: vi.fn() },
  isBackendUnavailable: vi.fn(() => false),
  SILENT_HEADER: 'X-Request-Silent',
}))

const SILENT = { headers: { 'X-Request-Silent': '1' } }

beforeEach(() => { vi.clearAllMocks() })

describe('交付项验收记录（V3 批次验收）', () => {
  it('submitAcceptanceRecord 走 /rdm/delivery-item/{id}/acceptance 并原样透传契约字段', async () => {
    vi.mocked(request.post).mockResolvedValue(undefined as never)
    const form: RdmAcceptanceRecordSubmitForm = {
      acceptanceType: 'business', stage: 'post_release', conclusion: 'conditional',
      score: 4, scopeVersion: 3, testEnv: 'prod', opinion: '可', conditionsJson: '[{"condition":"a","deadline":"2026-01-01","owner":"b"}]',
      expectedVersion: 7,
    }
    await submitAcceptanceRecord(500, form)
    expect(request.post).toHaveBeenCalledWith('/rdm/delivery-item/500/acceptance', form)
  })

  it('fetchAcceptanceRecords 走 GET 且带静默头与查询参数', async () => {
    vi.mocked(request.get).mockResolvedValue({ records: [], total: 0 } as never)
    await fetchAcceptanceRecords(500, { acceptanceType: 'product', pageSize: 20 })
    expect(request.get).toHaveBeenCalledWith(
      '/rdm/delivery-item/500/acceptance',
      { params: { acceptanceType: 'product', pageSize: 20 }, ...SILENT },
    )
  })
})

describe('问题闭环（resolve/bind/延期裁决）', () => {
  it('resolveIssue 走 /rdm/issue/{id}/resolve 并自动注入 requestId（幂等）', async () => {
    vi.mocked(request.post).mockResolvedValue(undefined as never)
    const form: RdmIssueResolveForm = {
      repairEvidenceJson: '{}', testRoundId: 11, productAcceptanceId: 22, reason: '已修复', expectedVersion: 3,
    }
    await resolveIssue(9, form)
    const [url, payload] = vi.mocked(request.post).mock.calls[0]
    expect(url).toBe('/rdm/issue/9/resolve')
    expect(payload).toMatchObject(form)
    expect(typeof (payload as { requestId: string }).requestId).toBe('string')
    expect((payload as { requestId: string }).requestId.length).toBeGreaterThan(0)
  })

  it('resolveIssue 保留调用方已给的 requestId（重试不变）', async () => {
    vi.mocked(request.post).mockResolvedValue(undefined as never)
    await resolveIssue(9, { repairEvidenceJson: '{}', testRoundId: 1, productAcceptanceId: 2, reason: 'r', requestId: 'fixed-req-id' })
    const payload = vi.mocked(request.post).mock.calls[0][1] as { requestId: string }
    expect(payload.requestId).toBe('fixed-req-id')
  })

  it('bindIssueFollowUp 走 /rdm/issue/bind 并注入 requestId', async () => {
    vi.mocked(request.post).mockResolvedValue(undefined as never)
    await bindIssueFollowUp({ issueId: 9, followUpReqId: 100, reason: '承接' })
    const [url, payload] = vi.mocked(request.post).mock.calls[0]
    expect(url).toBe('/rdm/issue/bind')
    expect(payload).toMatchObject({ issueId: 9, followUpReqId: 100, reason: '承接' })
    expect(typeof (payload as { requestId: string }).requestId).toBe('string')
  })

  it('decideIssueDefer 把 decisionType 作为查询参数传递', async () => {
    vi.mocked(request.post).mockResolvedValue(undefined as never)
    await decideIssueDefer(5, 'product', { decision: 'approved', reason: '同意延期' })
    expect(request.post).toHaveBeenCalledWith(
      '/rdm/issue/defer/5/decide',
      { decision: 'approved', reason: '同意延期' },
      { params: { decisionType: 'product' } },
    )
  })
})

describe('发布批次全流程', () => {
  it('decideReleaseBatch 走 /decide 且 decision 为 approved/rejected（不是 approve/reject）', async () => {
    vi.mocked(request.post).mockResolvedValue(undefined as never)
    await decideReleaseBatch(9, { decision: 'approved', reason: '放行', expectedVersion: 4 })
    expect(request.post).toHaveBeenCalledWith('/rdm/release-batch/9/decide', { decision: 'approved', reason: '放行', expectedVersion: 4 })
  })

  it('openReleaseBatch 走 /open 并注入 requestId（缺省 body 亦补 requestId）', async () => {
    vi.mocked(request.post).mockResolvedValue(undefined as never)
    await openReleaseBatch(9)
    const [url, payload] = vi.mocked(request.post).mock.calls[0]
    expect(url).toBe('/rdm/release-batch/9/open')
    expect(typeof (payload as { requestId: string }).requestId).toBe('string')
  })

  it('rollbackReleaseBatch 走 /rollback 并透传止损原因 + 注入 requestId', async () => {
    vi.mocked(request.post).mockResolvedValue(undefined as never)
    await rollbackReleaseBatch(9, { reason: '线上故障', systemCodes: ['SYS_A'], expectedVersion: 4 })
    const [url, payload] = vi.mocked(request.post).mock.calls[0]
    expect(url).toBe('/rdm/release-batch/9/rollback')
    expect(payload).toMatchObject({ reason: '线上故障', systemCodes: ['SYS_A'], expectedVersion: 4 })
    expect(typeof (payload as { requestId: string }).requestId).toBe('string')
  })

  it('applyReleaseExemption 走 /exemption（只豁免缺失产品验收）', async () => {
    vi.mocked(request.post).mockResolvedValue(undefined as never)
    await applyReleaseExemption(9, { reason: 'r', risk: 'k', rollbackPlan: 'p', expectedVersion: 4 })
    const [url, payload] = vi.mocked(request.post).mock.calls[0]
    expect(url).toBe('/rdm/release-batch/9/exemption')
    expect(payload).toMatchObject({ reason: 'r', risk: 'k', rollbackPlan: 'p' })
  })

  it('decideReleaseExemption 走 /exemption/{exemptionId}/decision', async () => {
    vi.mocked(request.post).mockResolvedValue(undefined as never)
    await decideReleaseExemption(9, 88, { decisionType: 'product_risk', decision: 'approved', reason: '可接受', expectedVersion: 4 })
    const [url, payload] = vi.mocked(request.post).mock.calls[0]
    expect(url).toBe('/rdm/release-batch/9/exemption/88/decision')
    expect(payload).toMatchObject({ decisionType: 'product_risk', decision: 'approved', reason: '可接受' })
  })

  it('completeReleaseSupplementary 走 /supplementary/{id}/complete', async () => {
    vi.mocked(request.post).mockResolvedValue(undefined as never)
    await completeReleaseSupplementary(77, { acceptanceRecordId: 6600, result: 'pass', expectedVersion: 2 })
    const [url, payload] = vi.mocked(request.post).mock.calls[0]
    expect(url).toBe('/rdm/release-batch/supplementary/77/complete')
    expect(payload).toMatchObject({ acceptanceRecordId: 6600, result: 'pass' })
  })

  it('fetchReleaseBatchActions 走 GET /actions 且带静默头（allowedActions 单一真相源）', async () => {
    vi.mocked(request.get).mockResolvedValue([{ code: 'rollback', label: '回滾', tone: 'danger' }] as never)
    const acts = await fetchReleaseBatchActions(9)
    expect(request.get).toHaveBeenCalledWith('/rdm/release-batch/9/actions', SILENT)
    expect(acts[0].code).toBe('rollback')
  })

  it('allowedActions 读接口在后端不可用时降级为空数组（不抛错，只影响按钮渲染）', async () => {
    const { isBackendUnavailable } = await import('./request')
    vi.mocked(isBackendUnavailable).mockReturnValue(true)
    vi.mocked(request.get).mockRejectedValue(new Error('Network Error') as never)
    await expect(fetchReleaseBatchActions(9)).resolves.toEqual([])
  })
})

describe('灰度配置与存量迁移', () => {
  it('fetchGrayscaleStatus 走 GET /rdm/flow-config/grayscale 且带 projectId 查询参数', async () => {
    vi.mocked(request.get).mockResolvedValue(null as never)
    await fetchGrayscaleStatus(77)
    expect(request.get).toHaveBeenCalledWith('/rdm/flow-config/grayscale', { params: { projectId: 77 }, ...SILENT })
  })

  it('fetchMigrationBatches 走 GET /rdm/stock-migration/batch', async () => {
    vi.mocked(request.get).mockResolvedValue([] as never)
    await fetchMigrationBatches('previewed')
    expect(request.get).toHaveBeenCalledWith('/rdm/stock-migration/batch', { params: { status: 'previewed' }, ...SILENT })
  })

  it('previewStockMigration 走 POST /preview 并注入 requestId（写接口绝不降级）', async () => {
    vi.mocked(request.post).mockResolvedValue({ items: [] } as never)
    await previewStockMigration({ projectId: 77 })
    const [url, payload] = vi.mocked(request.post).mock.calls[0]
    expect(url).toBe('/rdm/stock-migration/preview')
    expect(payload).toMatchObject({ projectId: 77 })
    expect(typeof (payload as { requestId: string }).requestId).toBe('string')
  })
})
