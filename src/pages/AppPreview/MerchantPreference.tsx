/**
 * Copyright (c) 2026 fengsong7889. All Rights Reserved.
 *
 * 本文件为「MFTB 企业一体化管理平台软件」的组成部分。
 * 未经著作权人书面许可，不得使用、复制、修改、再分发或用于任何商业目的。
 * 完整许可条款见仓库根目录 LICENSE 文件。
 */

/**
 * 商家偏好·第一阶段前端原型状态。
 *
 * 「不感兴趣」当前只保存在本会话内存，用于验证跨瀑布流即时移除的交互；
 * 真正的用户级黑名单、60 天有效期及搜索豁免必须在第二阶段由服务端裁决。
 */
/* eslint-disable react-refresh/only-export-components -- 商家偏好 Provider 与读取 hook 同文件，保证状态单一真源 */
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'

interface MerchantPreferenceContextValue {
  hiddenMerchantIds: ReadonlySet<string>
  hideMerchant: (merchantId: string) => void
  restoreMerchant: (merchantId: string) => void
  clearHiddenMerchants: () => void
}

const EMPTY_HIDDEN_MERCHANT_IDS: ReadonlySet<string> = new Set()
const MerchantPreferenceContext = createContext<MerchantPreferenceContextValue>({
  hiddenMerchantIds: EMPTY_HIDDEN_MERCHANT_IDS,
  hideMerchant: () => {},
  restoreMerchant: () => {},
  clearHiddenMerchants: () => {},
})

export function MerchantPreferenceProvider({ children }: { children: ReactNode }) {
  const [hiddenMerchantIds, setHiddenMerchantIds] = useState<ReadonlySet<string>>(() => new Set())

  const hideMerchant = useCallback((merchantId: string) => {
    setHiddenMerchantIds((prev) => {
      const next = new Set(prev)
      next.add(merchantId)
      return next
    })
  }, [])

  const restoreMerchant = useCallback((merchantId: string) => {
    setHiddenMerchantIds((prev) => {
      const next = new Set(prev)
      next.delete(merchantId)
      return next
    })
  }, [])

  const clearHiddenMerchants = useCallback(() => setHiddenMerchantIds(new Set()), [])

  const value = useMemo(
    () => ({ hiddenMerchantIds, hideMerchant, restoreMerchant, clearHiddenMerchants }),
    [hiddenMerchantIds, hideMerchant, restoreMerchant, clearHiddenMerchants],
  )

  return <MerchantPreferenceContext.Provider value={value}>{children}</MerchantPreferenceContext.Provider>
}

export function useMerchantPreferences() {
  return useContext(MerchantPreferenceContext)
}

/** 统一标签口径：去空、去首尾空格、转小写；中文标签保持原样。 */
function normalizeTags(tags: readonly string[]) {
  return new Set(tags.map((tag) => tag.trim().toLowerCase()).filter(Boolean))
}

/**
 * 以锚点商家标签为唯一召回口径：候选必须至少命中一个相同标签，
 * 按命中标签数降序，同分保持原瀑布流顺序；不命中则不入结果。
 */
export function rankSimilarMerchants<T>(
  items: readonly T[],
  anchor: T | undefined,
  getId: (item: T) => string,
  getTags: (item: T) => readonly string[],
  hiddenMerchantIds: ReadonlySet<string>,
): T[] {
  if (!anchor) return []
  const anchorId = getId(anchor)
  const anchorTags = normalizeTags(getTags(anchor))
  if (anchorTags.size === 0) return []

  return items
    .map((item, index) => {
      const candidateTags = normalizeTags(getTags(item))
      let score = 0
      for (const tag of candidateTags) {
        if (anchorTags.has(tag)) score += 1
      }
      return { item, index, score }
    })
    .filter(({ item, score }) => getId(item) !== anchorId && !hiddenMerchantIds.has(getId(item)) && score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map(({ item }) => item)
}

/** 页面级商家探索状态：原瀑布流过滤 + 当前相似锚点 + 相似结果。 */
export function useMerchantExplorer<T>(
  items: readonly T[],
  getId: (item: T) => string,
  getTags: (item: T) => readonly string[],
) {
  const { hiddenMerchantIds } = useMerchantPreferences()
  const [similarId, setSimilarId] = useState<string | null>(null)

  const visibleItems = useMemo(
    () => items.filter((item) => !hiddenMerchantIds.has(getId(item))),
    [items, hiddenMerchantIds, getId],
  )
  const similarAnchor = useMemo(
    () => (similarId ? items.find((item) => getId(item) === similarId) : undefined),
    [items, similarId, getId],
  )
  const similarItems = useMemo(
    () => rankSimilarMerchants(items, similarAnchor, getId, getTags, hiddenMerchantIds),
    [items, similarAnchor, getId, getTags, hiddenMerchantIds],
  )

  return {
    visibleItems,
    similarId,
    similarAnchor,
    similarItems,
    openSimilar: (merchantId: string) => setSimilarId(merchantId),
    closeSimilar: () => setSimilarId(null),
  }
}
