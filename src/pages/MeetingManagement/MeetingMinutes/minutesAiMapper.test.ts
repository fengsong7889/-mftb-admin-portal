/** 映射器纯函数契约：只追加选中项、完全重复按指纹跳过、保留既有身份、目的仅在空时填充。 */
import { describe, expect, it } from 'vitest'
import { fingerprint, mergeProposal, type MergeInput, type MergeSelection } from './minutesAiMapper'
import type { MinutesAiProposal } from '@/api/meetingMinutes'

const proposal: MinutesAiProposal = {
  purpose: '確認交付目標',
  items: [
    { ref: 't1', topic: '既有議題', discussion: 'd', sourceRefs: ['s1'] },
    { ref: 't2', topic: '新議題', discussion: 'd2', sourceRefs: ['s2'] },
  ],
  actions: [
    { ref: 'a1', topicRef: 't2', content: '後端提供接口', ownerUserId: 7, dueDate: '2026-11-06', sourceRefs: ['s2'] },
  ],
  openIssues: [{ ref: 'o1', topicRef: 't2', content: '待決策事項', sourceRefs: ['s2'] }],
}

const emptySelection: MergeSelection = { purpose: false, itemRefs: [], actionRefs: [], openIssueRefs: [] }

describe('minutesAiMapper.mergeProposal', () => {
  it('只追加选中的条目，未选中的忽略', () => {
    const current: MergeInput = { purpose: '', items: [], actions: [], followUps: [] }
    const result = mergeProposal(current, proposal, { ...emptySelection, itemRefs: ['t2'], actionRefs: ['a1'] })
    expect(result.items.map(item => item.topic)).toEqual(['新議題'])
    expect(result.actions).toHaveLength(1)
    expect(result.followUps).toHaveLength(0)
    expect(result.addedTopics).toBe(1)
    expect(result.addedActions).toBe(1)
  })

  it('完全重复（同内容+同负责人+同期限）按指纹跳过，不重复追加', () => {
    const current: MergeInput = {
      purpose: '', items: [], followUps: [],
      actions: [{ content: '後端提供接口', ownerUserId: 7, dueDate: '2026-11-06' }],
    }
    const result = mergeProposal(current, proposal, { ...emptySelection, actionRefs: ['a1'] })
    expect(result.actions).toHaveLength(1)
    expect(result.addedActions).toBe(0)
  })

  it('保留既有 itemId/topicKey，新行动项不带主键并挂到新建议题的 topicKey', () => {
    const current: MergeInput = {
      purpose: '已有目的', items: [{ topicKey: 'keep-1', topic: '旧議題' }], followUps: [],
      actions: [{ itemId: 99, content: '舊行動', ownerUserId: 1, dueDate: '2026-01-01' }],
    }
    const result = mergeProposal(current, proposal, { ...emptySelection, itemRefs: ['t2'], actionRefs: ['a1'] })
    expect(result.items[0]).toMatchObject({ topicKey: 'keep-1', topic: '旧議題' })
    expect(result.actions[0]).toMatchObject({ itemId: 99 })
    const added = result.actions[1]
    expect(added.itemId).toBeUndefined()
    // a1.topicRef=t2，t2 被选中并新建 topicKey，行动项应关联到该新键
    const newTopicKey = result.items.find(item => item.topic === '新議題')!.topicKey
    expect(added.topicKey).toBe(newTopicKey)
    // 目的已填且未勾选填充 → 不覆盖
    expect(result.purpose).toBe('已有目的')
  })

  it('目的仅在勾选填充且当前为空时写入，不覆盖已写内容', () => {
    const empty: MergeInput = { purpose: '', items: [], actions: [], followUps: [] }
    expect(mergeProposal(empty, proposal, { ...emptySelection, purpose: true }).purpose).toBe('確認交付目標')
    const filled: MergeInput = { purpose: '我自己写的', items: [], actions: [], followUps: [] }
    expect(mergeProposal(filled, proposal, { ...emptySelection, purpose: true }).purpose).toBe('我自己写的')
  })

  it('指纹规范化：大小写/空白差异视为同一条', () => {
    expect(fingerprint('action', ' 提供 接口 ', 7, '2026-11-06'))
      .toBe(fingerprint('action', '提供接口', 7, '2026-11-06'))
  })
})
