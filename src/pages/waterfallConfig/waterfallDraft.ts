/**
 * 瀑布流完整草稿在「表单页」与「坑位配置页」之间的传递（sessionStorage）。
 *
 * 取代旧版仅传递算法坑位数组（slotConfigDraftSlots / slotConfigResultSlots）的方式：
 * 现在传递整个 WaterfallDraft，并按记录 key 隔离，避免不同策略草稿串用。
 */
import type { WaterfallDraft } from './types'

const DRAFT_KEY = 'wf_slot_draft_v1'

interface DraftEnvelope {
  /** 归属记录 key（server_<id> / local_<localId> / new_<会话id>） */
  key: string
  draft: WaterfallDraft
}

/** 写入草稿（进入坑位页前调用） */
export function writeDraft(draft: WaterfallDraft): void {
  const env: DraftEnvelope = { key: draft.key, draft }
  try {
    sessionStorage.setItem(DRAFT_KEY, JSON.stringify(env))
  } catch {
    /* 忽略存储异常 */
  }
}

/**
 * 读取草稿。传入 expectedKey 做归属校验：key 不一致时返回 null，
 * 防止刷新/切换记录后读到别的策略草稿。
 */
export function readDraft(expectedKey?: string): WaterfallDraft | null {
  try {
    const raw = sessionStorage.getItem(DRAFT_KEY)
    if (!raw) return null
    const env = JSON.parse(raw) as DraftEnvelope
    if (expectedKey && env.key !== expectedKey) return null
    return env.draft
  } catch {
    return null
  }
}

/** 消费草稿（读取后清除），避免下次进入误用旧草稿 */
export function consumeDraft(expectedKey?: string): WaterfallDraft | null {
  const draft = readDraft(expectedKey)
  clearDraft()
  return draft
}

export function clearDraft(): void {
  try {
    sessionStorage.removeItem(DRAFT_KEY)
  } catch {
    /* 忽略 */
  }
}

/**
 * 为「新增」会话生成稳定 key：新增尚未拿到 server/local id 前，
 * 用会话级 key 隔离草稿，保存成功后再切换到正式 key。
 */
export function newSessionKey(businessType: string): string {
  return `new_${businessType}_${Date.now().toString(36)}`
}
