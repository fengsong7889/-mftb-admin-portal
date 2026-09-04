import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'

/**
 * 模擬後端 Jackson default-property-inclusion=non_null 的真實響應：
 * null 字段（如不限額集團的 availableAmount）會被省略，前端收到 undefined。
 */
vi.mock('../../api/finance', () => ({
  fetchFinRiskPage: vi.fn().mockResolvedValue({
    records: [{
      groupId: 'JT000001',
      groupName: '測試集團',
      brand: 'mFood',
      accountStatus: 'normal',
      virtualBalance: 1000,
      unsettledDebt: 0,
      paidPool: 1000,
      totalConsumed: 0,
      monthlyRelease: 0,
      limited: false,
      releaseMode: 'repay',
      status: 'enabled',
    }],
    total: 1,
  }),
  fetchFinRiskConfig: vi.fn().mockResolvedValue(null),
  fetchFinAccounts: vi.fn().mockResolvedValue({ records: [], total: 0 }),
  saveFinRiskConfig: vi.fn().mockResolvedValue(undefined),
  saveFinRiskStatus: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({ hasPermission: () => true }),
}))

import ConsumeRisk from './index'

describe('ConsumeRisk page', () => {
  it('renders rows whose availableAmount is omitted by backend (undefined) without crashing', async () => {
    render(<ConsumeRisk />)
    // 不限額行應展示「不限額」文案，而非拋出 toLocaleString 異常
    expect(await screen.findAllByText(/consumeRisk.unlimited|不限額/)).toBeTruthy()
    // 登記制：展示啟用狀態與賬戶狀態列
    expect(screen.getAllByText(/consumeRisk.statusEnabled|啟用/).length).toBeGreaterThan(0)
  })
})
