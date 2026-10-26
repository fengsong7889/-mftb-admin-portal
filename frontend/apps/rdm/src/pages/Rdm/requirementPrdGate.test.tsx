/**
 * PRD / 評審入口的狀態閘門（使用者回饋修正）
 *
 * 钉死三件事：
 *  1. 評估中（尚未接受需求）不給「編寫 PRD」「發起評審」入口，并说明原因；
 *  2. 受理後才出现入口：沒有 PRD 時只給「編寫 PRD」，不給「發起評審」；
 *  3. 有 PRD 後才允許發起評審（評審要有具體方案可評）。
 */
import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { PlanSection } from './components/RequirementSections'
import type { RdmDeliverySummary, RdmPrdItem } from '@/api/rdm'
import { RDM_STATUS } from '@/constants/rdm'

function prd(overrides: Partial<RdmPrdItem> = {}): RdmPrdItem {
  return {
    id: 1,
    prdNo: 'PRD202610190001',
    reqId: 1,
    title: '推廣金賬戶',
    status: 'draft',
    versionNo: 'v1.0',
    authorName: '馮松',
    ...overrides,
  }
}

function summary(prds: RdmPrdItem[]): RdmDeliverySummary {
  return { reqId: 1, status: 'accepted', prds, tasks: [], reviews: [], changes: [] }
}

function renderPlan(status: string, prds: RdmPrdItem[]) {
  return render(
    <MemoryRouter>
      <PlanSection
        summary={summary(prds)}
        status={status}
        editable
        canCreate
        reqId={1}
        onReviewDecided={() => {}}
      />
    </MemoryRouter>,
  )
}

describe('需求详情的 PRD / 評審入口', () => {
  it('評估中：不給編寫 PRD / 發起評審入口，并提示先接受需求', () => {
    renderPlan(RDM_STATUS.EVALUATING, [])
    expect(screen.queryByRole('button', { name: /編寫 PRD/ })).toBeNull()
    expect(screen.queryByRole('button', { name: /發起評審/ })).toBeNull()
    expect(screen.getByText('接受需求後才能編寫')).toBeTruthy()
    expect(screen.getByText(/先由產品經理接受需求/)).toBeTruthy()
  })

  it('已受理但还没有 PRD：只給編寫 PRD，不給發起評審', () => {
    renderPlan(RDM_STATUS.ACCEPTED, [])
    expect(screen.getByRole('button', { name: /編寫 PRD/ })).toBeTruthy()
    expect(screen.queryByRole('button', { name: /發起評審/ })).toBeNull()
    expect(screen.getByText('先編寫 PRD 再發起')).toBeTruthy()
  })

  it('已受理且已有 PRD：編寫 PRD 与發起評審都可用', () => {
    renderPlan(RDM_STATUS.ACCEPTED, [prd()])
    expect(screen.getByRole('button', { name: /編寫 PRD/ })).toBeTruthy()
    expect(screen.getByRole('button', { name: /發起評審/ })).toBeTruthy()
  })
})
