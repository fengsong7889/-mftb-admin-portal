import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import ClaimStats from './ClaimStats'
import type { ClaimStatsData } from './claimViewTypes'

/**
 * 领用统计卡口径测试。
 *
 * 现场问题：个人视图「在用資產」显示 1，点进「在用資產」页签列表却有 2 条。
 * 根因有两层，这里钉住可静态验证的那一层——四张卡必须与四个页签一一对应，
 * 首卡取「全部記錄」的总数，不能自己用 claimed+returned 拼算（会漏掉
 * 待签、取消、遗失/报废/送修等终止态，卡片与列表天然对不上）。
 */
const stats: ClaimStatsData = {
  employeeCount: 1,
  totalCount: 13,
  claimedCount: 2,
  returnedCount: 6,
  pendingSignatureCount: 1,
}

describe('领用统计卡与页签同口径', () => {
  it('个人视图首卡取全部記錄，四张卡分别对应四个页签', () => {
    render(<ClaimStats personal data={stats} scopeKey="MF00002" />)

    // 首卡不能用 claimed+returned(=8) 代替 13
    expect(screen.getByLabelText('本人資產記錄：13')).toBeInTheDocument()
    expect(screen.getByLabelText('在用資產：2')).toBeInTheDocument()
    expect(screen.getByLabelText('已歸還記錄：6')).toBeInTheDocument()
    expect(screen.getByLabelText('待簽記錄（含代辦補簽）：1')).toBeInTheDocument()
  })

  it('概览视图首卡仍是涉及员工数，不误用全部記錄数', () => {
    render(<ClaimStats data={stats} scopeKey="all" />)

    expect(screen.getByLabelText('涉及員工：1')).toBeInTheDocument()
    expect(screen.getByLabelText('在用資產：2')).toBeInTheDocument()
  })

  it('统计未返回时显示 — 而不是 0', () => {
    render(<ClaimStats personal />)

    expect(screen.getByLabelText('本人資產記錄：尚未加載')).toBeInTheDocument()
    expect(screen.getByLabelText('在用資產：尚未加載')).toBeInTheDocument()
  })
})
