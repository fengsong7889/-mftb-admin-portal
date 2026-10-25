import { describe, expect, it } from 'vitest'
import { DEFAULT_PREVIEW_POLICY, evaluatePreviewPolicy, nextPreviewRunStatus } from './previewModel'

describe('企业 Agent 隔离原型规则样例', () => {
  it('预算减去已用和预占后不足时要求审批', () => {
    const decision = evaluatePreviewPolicy(DEFAULT_PREVIEW_POLICY)
    expect(decision.availableCents).toBe(1000)
    expect(decision.kind).toBe('approval')
    expect(decision.reason).toContain('5.00')
  })

  it('资源权限优先于预算放行', () => {
    expect(evaluatePreviewPolicy({ ...DEFAULT_PREVIEW_POLICY, authorized: false, estimatedCents: 0 }).kind).toBe('deny')
  })

  it('敏感数据不能因预算足够而出域', () => {
    const result = evaluatePreviewPolicy({ ...DEFAULT_PREVIEW_POLICY, endpoint: 'cloud', dataClass: 'sensitive', estimatedCents: 0 })
    expect(result.kind).toBe('deny')
    expect(result.title).toContain('出域')
  })

  it('无效金额不能得到通过结论', () => {
    expect(evaluatePreviewPolicy({ ...DEFAULT_PREVIEW_POLICY, estimatedCents: Number.NaN }).kind).toBe('deny')
    expect(evaluatePreviewPolicy({ ...DEFAULT_PREVIEW_POLICY, estimatedCents: -1 }).kind).toBe('deny')
  })

  it('充足预算且合法数据边界可通过样例试算', () => {
    expect(evaluatePreviewPolicy({ ...DEFAULT_PREVIEW_POLICY, estimatedCents: 500 }).kind).toBe('allow')
  })

  it('没有审批不能直接执行，待核实不能直接重试', () => {
    expect(nextPreviewRunStatus('prepared', 'execute')).toBe('prepared')
    expect(nextPreviewRunStatus('waiting', 'execute')).toBe('waiting')
    expect(nextPreviewRunStatus('rejected', 'execute')).toBe('rejected')
    expect(nextPreviewRunStatus('approved', 'execute', true)).toBe('unknown')
    expect(nextPreviewRunStatus('unknown', 'execute')).toBe('unknown')
    expect(nextPreviewRunStatus('unknown', 'reconcile')).toBe('succeeded')
  })
})
