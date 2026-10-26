/**
 * 员工额度状态判定测试
 *
 * 钉住 N2 口径修正：历史上「没有任何额度配置」被判成 frozen，
 * 与后端 checkQuota 对无适用额度维度时 allowed=true 放行的语义相反，
 * 导致列表里 25 人清一色「凍結」、而首页却显示该员工可正常提问。
 */
import { describe, expect, it } from 'vitest'
import {
  calcQuotaStatus,
  QUOTA_STATUS_LABEL,
  QUOTA_STATUS_COLOR,
  type EmpQuotaGrant,
  type QuotaStatus,
} from './empPermission'

function grant(overrides: Partial<EmpQuotaGrant> = {}): EmpQuotaGrant {
  return {
    id: 1,
    source: 'employee',
    sourceDesc: '員工專屬',
    quotaType: 'token',
    quotaValue: 1000,
    quotaPeriod: 'daily',
    usedValue: 0,
    effectiveType: 'permanent',
    effectiveAt: '2026-10-01 00:00:00',
    expireAt: null,
    overLimitAction: null,
    status: 1,
    ...overrides,
  } as EmpQuotaGrant
}

describe('calcQuotaStatus', () => {
  it('没有任何额度配置判为「未授予額度」，不得判为凍結', () => {
    expect(calcQuotaStatus([])).toBe('ungranted')
  })

  it('有配置但全部停用才判为凍結', () => {
    expect(calcQuotaStatus([grant({ status: 0 }), grant({ id: 2, status: 0 })])).toBe('frozen')
  })

  it('存在启用且未用完的额度判为正常', () => {
    expect(calcQuotaStatus([grant({ usedValue: 500 })])).toBe('normal')
    // 混合：一条用完 + 一条未用完 → 仍算正常（只要有一条启用且未耗尽）
    expect(calcQuotaStatus([grant({ usedValue: 1000 }), grant({ id: 2, usedValue: 10 })])).toBe('normal')
  })

  it('启用的额度全部耗尽才判为已用完', () => {
    expect(calcQuotaStatus([grant({ usedValue: 1000 })])).toBe('exhausted')
    // 混合：启用的已用完 + 一条停用的未用完 → 停用的不参与判定
    expect(calcQuotaStatus([grant({ usedValue: 1000 }), grant({ id: 2, status: 0, usedValue: 0 })])).toBe('exhausted')
  })
})

describe('额度状态展示映射完整性', () => {
  const ALL: QuotaStatus[] = ['normal', 'exhausted', 'frozen', 'ungranted']

  it('每个状态都有标签与颜色，避免新增状态渲染成空白 Tag', () => {
    for (const status of ALL) {
      expect(QUOTA_STATUS_LABEL[status], `标签缺失: ${status}`).toBeTruthy()
      expect(QUOTA_STATUS_COLOR[status], `颜色缺失: ${status}`).toBeTruthy()
    }
  })

  it('「未授予額度」与「凍結」必须是可区分的两种文案', () => {
    expect(QUOTA_STATUS_LABEL.ungranted).not.toBe(QUOTA_STATUS_LABEL.frozen)
  })
})
