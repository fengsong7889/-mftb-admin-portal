/**
 * AI 提取结果 → 现有纪要表单的字段级合并（纯函数，供表单与单测共用）。
 *
 * 口径（对齐方案 §8.1）：
 *   - 只「追加选中的建议 + 填充选中的空字段」，不整份替换、不覆盖既有议题/目的/附件/关联；
 *   - 保留既有 itemId/topicKey，新条目不带数据库主键；
 *   - 完全重复（同内容+同负责人+同期限）按规范化指纹跳过，疑似相似只交界面提示不自动删。
 * 这里只处理扁平结构（dueDate 用字符串），Dayjs 转换由表单在应用时完成。
 */
import type { MinutesAiProposal } from '@/api/meetingMinutes'

export interface MergeTopic { topicKey: string; topic: string; discussion?: string; conclusion?: string; decisionStatus?: string | null }
export interface MergeTask { itemId?: number; topicKey?: string; content: string; ownerUserId?: number | null; dueDate?: string | null; deliverable?: string }
export interface MergeInput { purpose?: string; items: MergeTopic[]; actions: MergeTask[]; followUps: MergeTask[] }
export interface MergeSelection { purpose: boolean; itemRefs: string[]; actionRefs: string[]; openIssueRefs: string[] }
export interface MergeResult extends MergeInput { addedTopics: number; addedActions: number; addedFollowUps: number }

/** 规范化指纹：去空白、统一大小写，用于识别「完全重复」条目。 */
export function fingerprint(kind: 'topic' | 'action' | 'follow', content: string, ownerUserId?: number | null, dueDate?: string | null): string {
  const text = (content || '').trim().toLowerCase().replace(/\s+/g, '')
  return `${kind}:${text}:${ownerUserId ?? ''}:${dueDate ?? ''}`
}

function topicKeyForRef(proposal: MinutesAiProposal, topicRef: string | null | undefined, createdKeyByRef: Map<string, string>): string | undefined {
  if (!topicRef) return undefined
  if (createdKeyByRef.has(topicRef)) return createdKeyByRef.get(topicRef)
  return undefined
}

/** 把选中的建议合并进当前扁平表单值，返回新对象（不修改入参）。 */
export function mergeProposal(current: MergeInput, proposal: MinutesAiProposal, selection: MergeSelection): MergeResult {
  const createdKeyByRef = new Map<string, string>()
  const items = [...current.items]
  const actions = [...current.actions]
  const followUps = [...current.followUps]

  const topicFingerprints = new Set(current.items.map(item => fingerprint('topic', item.topic)))
  const actionFingerprints = new Set(current.actions.map(a => fingerprint('action', a.content, a.ownerUserId, a.dueDate)))
  const followFingerprints = new Set(current.followUps.map(a => fingerprint('follow', a.content, a.ownerUserId, a.dueDate)))

  let addedTopics = 0
  for (const item of proposal.items ?? []) {
    if (!item.ref || !selection.itemRefs.includes(item.ref)) continue
    const key = crypto.randomUUID()
    createdKeyByRef.set(item.ref, key)
    const fp = fingerprint('topic', item.topic)
    if (topicFingerprints.has(fp)) continue
    topicFingerprints.add(fp)
    items.push({
      topicKey: key, topic: item.topic, discussion: item.discussion ?? '', conclusion: item.conclusion ?? '',
      decisionStatus: item.decisionStatus,
    })
    addedTopics++
  }

  let addedActions = 0
  for (const action of proposal.actions ?? []) {
    if (!action.ref || !selection.actionRefs.includes(action.ref)) continue
    const fp = fingerprint('action', action.content, action.ownerUserId, action.dueDate)
    if (actionFingerprints.has(fp)) continue
    actionFingerprints.add(fp)
    actions.push({
      topicKey: topicKeyForRef(proposal, action.topicRef, createdKeyByRef), content: action.content,
      ownerUserId: action.ownerUserId ?? null, dueDate: action.dueDate ?? null, deliverable: action.deliverable ?? '',
    })
    addedActions++
  }

  let addedFollowUps = 0
  for (const issue of proposal.openIssues ?? []) {
    if (!issue.ref || !selection.openIssueRefs.includes(issue.ref)) continue
    const fp = fingerprint('follow', issue.content, issue.ownerUserId, issue.dueDate)
    if (followFingerprints.has(fp)) continue
    followFingerprints.add(fp)
    followUps.push({
      topicKey: topicKeyForRef(proposal, issue.topicRef, createdKeyByRef), content: issue.content,
      ownerUserId: issue.ownerUserId ?? null, dueDate: issue.dueDate ?? null,
    })
    addedFollowUps++
  }

  // 目的只在为空时填充，绝不覆盖记录人已写的会议目的
  const purpose = selection.purpose && !(current.purpose ?? '').trim() ? (proposal.purpose ?? current.purpose) : current.purpose

  return { purpose, items, actions, followUps, addedTopics, addedActions, addedFollowUps }
}

/** 疑似相似（同内容不同负责人/期限）提示，不自动删除，仅给界面标注。 */
export function findSimilar(current: MergeInput, content: string, kind: 'action' | 'follow'): boolean {
  const text = (content || '').trim().toLowerCase().replace(/\s+/g, '')
  const pool = kind === 'action' ? current.actions : current.followUps
  return pool.some(task => (task.content || '').trim().toLowerCase().replace(/\s+/g, '') === text)
}
