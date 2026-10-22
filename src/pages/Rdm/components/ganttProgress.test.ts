import { describe, expect, it } from 'vitest'
import { PRD_PROGRESS_MAX, clampGanttProgress } from './ganttProgress'

describe('甘特图进度口径', () => {
  it('PRD 任务封顶 99%：拖到 100 也只落 99，100% 由提交评审产生', () => {
    expect(clampGanttProgress('prd', 100)).toBe(PRD_PROGRESS_MAX)
    expect(clampGanttProgress('prd', 99)).toBe(99)
    expect(clampGanttProgress('prd', 55.4)).toBe(55)
  })

  it('普通任务保留 0-100 区间', () => {
    expect(clampGanttProgress('frontend', 100)).toBe(100)
    expect(clampGanttProgress('qa', 37.6)).toBe(38)
    expect(clampGanttProgress('backend', -5)).toBe(0)
    expect(clampGanttProgress('design', 180)).toBe(100)
  })
})
