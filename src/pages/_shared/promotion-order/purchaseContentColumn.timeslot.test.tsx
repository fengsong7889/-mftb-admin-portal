/**
 * Copyright (c) 2026 fengsong7889. All Rights Reserved.
 *
 * 本文件为「MFTB 企业一体化管理平台软件」的组成部分。
 * 未经著作权人书面许可，不得使用、复制、修改、再分发或用于任何商业目的。
 * 完整许可条款见仓库根目录 LICENSE 文件。
 */
/**
 * 購買內容列 · 時段推薦分支：最多 2 個標籤 + 「+N ▾」面板（全部時段 + 購買日期）。
 */
import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { RecommendType } from './constants'
import { createPurchaseContentRenderer } from './purchaseContentColumn'
import type { BaseOrderItem } from './types'

const renderer = createPurchaseContentRenderer({
  t: (k) => k,
  orderType: '時段推薦廣告',
  regionLabel: (r) => String(r),
})

function buildRecord(overrides: Partial<BaseOrderItem>): BaseOrderItem {
  return {
    recommendType: RecommendType.TIME_SLOT_AD,
    mealSlots: [],
    purchaseDays: [],
    ...overrides,
  } as unknown as BaseOrderItem
}

describe('購買內容列 時段推薦', () => {
  it('時段數 ≤2 時全部展示，不出 +N', () => {
    render(<div>{renderer(null, buildRecord({ mealSlots: ['午餐', '宵夜'], purchaseDays: ['2026-11-04'] }))}</div>)
    expect(screen.getByText('午餐')).toBeInTheDocument()
    expect(screen.getByText('宵夜')).toBeInTheDocument()
    expect(screen.queryByText(/\+\d+ ▾/)).not.toBeInTheDocument()
  })

  it('超過 2 個時段時只展示前 2 個並出現 +N 入口', () => {
    render(<div>{renderer(null, buildRecord({ mealSlots: ['晚餐', '下午茶', '早餐'], purchaseDays: ['2026-11-04', '2026-11-05'] }))}</div>)
    expect(screen.getByText('晚餐')).toBeInTheDocument()
    expect(screen.getByText('下午茶')).toBeInTheDocument()
    expect(screen.queryByText('早餐')).not.toBeInTheDocument()
    const more = screen.getByText('+1 ▾')
    expect(more.closest('button')).toHaveClass('ant-btn-link')
  })

  it('點擊 +N 展開面板顯示全部時段與購買日期', () => {
    render(<div>{renderer(null, buildRecord({ mealSlots: ['晚餐', '下午茶', '早餐'], purchaseDays: ['2026-11-04', '2026-11-05', '2026-11-06'] }))}</div>)
    fireEvent.click(screen.getByText('+1 ▾'))
    expect(screen.getByText('全部時段（3）')).toBeInTheDocument()
    expect(screen.getByText('早餐')).toBeInTheDocument()
    expect(screen.getByText('購買日期（3 天）')).toBeInTheDocument()
    expect(screen.getByText('2026-11-06')).toBeInTheDocument()
  })

  it('無時段數據時顯示占位符', () => {
    render(<div>{renderer(null, buildRecord({}))}</div>)
    expect(screen.getByText('-')).toBeInTheDocument()
  })
})
