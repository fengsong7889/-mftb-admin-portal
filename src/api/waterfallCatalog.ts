/**
 * 瀑布流团购目录适配层
 *
 * 对页面暴露统一的异步接口与响应类型，页面不直接引用假数据数组。
 * 本期委托 Mock；接入外部系统后，仅需把各函数实现替换为 request.* 调用，
 * 保持函数签名与返回类型不变即可，业务页面无需改动。
 */
import type { WaterfallContentType, WaterfallSortMode, WaterfallCatalogChannel } from '../pages/waterfallConfig/types'
import {
  mockListCategories,
  mockSearchItems,
  mockGetItemsByIds,
  mockCandidatesByCategories,
  mockCategoryName,
  type MockCategory,
  type MockCatalogItem,
} from './mock/waterfallCatalogMock'

export type { MockCategory as WaterfallCategory, MockCatalogItem as WaterfallCatalogItem }

const delay = (ms = 200) => new Promise(resolve => setTimeout(resolve, ms))

/** 读取分类（按内容类型 / 品牌） */
export async function fetchWaterfallCategories(
  contentType: WaterfallContentType,
  brand?: string,
  channel: WaterfallCatalogChannel = 'groupBuy',
): Promise<MockCategory[]> {
  await delay()
  return mockListCategories(contentType, brand, channel)
}

/** 分页搜索资源（门店 / 商品） */
export async function searchWaterfallCatalog(params: {
  contentType: WaterfallContentType
  brand?: string
  categoryId?: string
  keyword?: string
  channel?: WaterfallCatalogChannel
  page?: number
  size?: number
}): Promise<{ records: MockCatalogItem[]; total: number }> {
  await delay()
  return mockSearchItems({
    contentType: params.contentType,
    brand: params.brand,
    categoryId: params.categoryId,
    keyword: params.keyword,
    channel: params.channel,
    page: params.page ?? 1,
    size: params.size ?? 20,
  })
}

/** 按 ID 回显资源（编辑/详情时把已保存的 itemId 还原为名称等展示信息） */
export async function fetchCatalogByIds(
  contentType: WaterfallContentType,
  ids: string[],
  channel: WaterfallCatalogChannel = 'groupBuy',
): Promise<MockCatalogItem[]> {
  await delay()
  return mockGetItemsByIds(contentType, ids, channel)
}

/** 按分类并集取候选（预览补位用，父含子、去重、排除已固定） */
export async function fetchCategoryCandidates(params: {
  contentType: WaterfallContentType
  brand?: string
  categoryIds: string[]
  excludeItemIds?: string[]
  sortMode?: WaterfallSortMode
  channel?: WaterfallCatalogChannel
  limit?: number
}): Promise<MockCatalogItem[]> {
  await delay()
  return mockCandidatesByCategories(params)
}

/** 同步取分类名称（用于标签展示，Mock 阶段直接查表；真实接入后改为缓存） */
export function getWaterfallCategoryName(id: string): string | undefined {
  return mockCategoryName(id)
}
