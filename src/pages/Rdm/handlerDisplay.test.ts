import { describe, expect, it } from 'vitest'
import { formatHandlers, formatPerson, splitHandlers } from './handlerDisplay'
import type { RdmHandlerPerson } from '../../api/rdm'

const p = (name: string, empNo?: string): RdmHandlerPerson => ({ userId: 1, name, empNo })

describe('formatPerson', () => {
  it('有工号时输出「姓名（工号）」', () => {
    expect(formatPerson({ name: '龙颖之', empNo: 'MF00023' })).toBe('龙颖之（MF00023）')
  })
  it('无工号时只给姓名，不留空括号', () => {
    expect(formatPerson({ name: '张三', empNo: null })).toBe('张三')
  })
  it('姓名为空时返回空串，交给调用方决定占位', () => {
    expect(formatPerson({ name: null })).toBe('')
  })
})

describe('formatHandlers', () => {
  it('多人全量列出，不折叠', () => {
    expect(formatHandlers([p('A', 'MFA'), p('B', 'MFB'), p('C', 'MFC')])).toBe('A（MFA）、B（MFB）、C（MFC）')
  })
  it('无未完成任务时回退流程推演值（审批人/技術負責人等）', () => {
    expect(formatHandlers([], '審批人')).toBe('審批人')
    expect(formatHandlers(null, '技術負責人')).toBe('技術負責人')
  })
  it('既无任务也无推演值时返回空串', () => {
    expect(formatHandlers([])).toBe('')
  })
})

describe('splitHandlers', () => {
  it('超过 2 人时前 2 位直出、其余进 +N', () => {
    const parts = splitHandlers([p('A'), p('B'), p('C'), p('D')])
    expect(parts?.shown.map(x => x.name)).toEqual(['A', 'B'])
    expect(parts?.rest.map(x => x.name)).toEqual(['C', 'D'])
  })
  it('2 人以内不产生折叠段', () => {
    const parts = splitHandlers([p('A'), p('B')])
    expect(parts?.rest).toHaveLength(0)
  })
  it('无处理人返回 null，由调用方回退', () => {
    expect(splitHandlers([])).toBeNull()
    expect(splitHandlers(undefined)).toBeNull()
  })
})
