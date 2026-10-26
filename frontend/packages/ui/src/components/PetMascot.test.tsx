import { afterEach, expect, it, vi } from 'vitest'
import { fireEvent, render, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import PetMascot from './PetMascot'

vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ hasPermission: () => false }) }))
vi.mock('./PageDescriptions', () => ({ getPagePRD: () => null, buildPrdKey: () => 'rdm' }))
vi.mock('@/utils/customTipsStorage', () => ({ getCustomTips: () => [], mergeTips: () => [] }))
vi.mock('./PikachuFace', () => ({ default: () => <span>宠物</span> }))
afterEach(() => vi.restoreAllMocks())

it('RDM 页面实际外框压住按钮时让位，滚动后无重叠则恢复', async () => {
  let overlaps = true
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    const isPet = this.classList.contains('pet-mascot-wrapper')
    const left = isPet || overlaps ? 100 : 300
    return { left, right: left + 80, top: 100, bottom: 180, width: 80, height: 80, x: left, y: 100, toJSON: () => ({}) }
  })
  const { container } = render(<MemoryRouter initialEntries={['/rdm-prd?reqId=1']}>
    <button>保存</button><PetMascot />
  </MemoryRouter>)
  const pet = container.querySelector('.pet-mascot-wrapper')!
  await waitFor(() => expect(pet).toHaveStyle({ visibility: 'hidden', pointerEvents: 'none' }))
  overlaps = false
  fireEvent.scroll(window)
  await waitFor(() => expect((pet as HTMLElement).style.visibility).toBe(''))
})
