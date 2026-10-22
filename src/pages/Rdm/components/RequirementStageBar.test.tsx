/**
 * V3 阶段条「由交付项推导」的展示口径
 *
 * 钉死三件事：
 *  1. 不传 derivedStage 时行为完全等同旧版（V1/V2 不受影响）；
 *  2. V3 传入 derivedStage 后按推导阶段高亮，并在紧凑模式标注「（交付項）」；
 *  3. 推导管径文案（N/M 完成）必须常驻可见，避免「进度条在开发、状态却写已受理」被读成矛盾。
 */
import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import RequirementStageBar from './RequirementStageBar'
import { RDM_STATUS } from '../../../constants/rdm'

describe('需求阶段条', () => {
  it('V1/V2：不传推导阶段时仍按需求状态映射（已受理 → PRD 產出）', () => {
    render(<RequirementStageBar status={RDM_STATUS.ACCEPTED} compact />)
    const label = screen.getByText(/PRD 產出/)
    expect(label.textContent).toBe('PRD 產出')
  })

  it('V3：传入推导阶段后按交付项推进（已受理 + dev → 開發）', () => {
    render(<RequirementStageBar status={RDM_STATUS.ACCEPTED} compact derivedStage="dev" derivedHint="交付項 1/3 完成" />)
    expect(screen.getByText('開發（交付項）')).toBeTruthy()
  })

  it('V3：推导管径文案常驻可见，并保留「需求状态仍为已受理」的事实', () => {
    render(
      <RequirementStageBar
        status={RDM_STATUS.ACCEPTED}
        derivedStage="dev"
        derivedHint="V3 分批交付：階段由交付項推導 · 1/3 完成（待準備 1 · 開發中 1）· 需求狀態仍為「已受理·待排期」"
      />,
    )
    expect(screen.getByText(/由交付項推導/)).toBeTruthy()
    expect(screen.getByText(/需求狀態仍為「已受理·待排期」/)).toBeTruthy()
  })
})
