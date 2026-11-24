/**
 * 瀑布流本地扩展存储
 *
 * 后端 `biz_ad_waterfall` 无法保存本期新增字段（业务线、展示内容、单/双列布局、
 * 团购分类兜底、团购固定内容坑位），这些字段统一存浏览器本地：
 * - server 记录：基础字段仍走后端接口，新增字段按 server id 存扩展表。
 * - local 记录：团购新建策略整体存本地（后端无对应记录），使用独立本地 ID，
 *   不向算法坑位接口塞门店/商品数据，也不假冒服务器生成的策略编号。
 *
 * 隔离：按当前账号 + 结构版本分键；仅当前浏览器可见，不跨设备同步。
 */
import type {
  WaterfallBusinessType,
  WaterfallContentType,
  WaterfallLayoutColumns,
  WaterfallBizChannel,
  WaterfallDisplayCategoryMode,
  WaterfallSortMode,
  WaterfallDraft,
  WaterfallListView,
  FixedContentSlot,
} from '@mftb/contracts/waterfallTypes'
import { serverKey, localKey, defaultExtension, getDisplayCategoryMode, DEFAULT_WATERFALL_SORT } from '@mftb/contracts/waterfallTypes'
import type { WaterfallFixedSlotItem, WaterfallStrategy } from '@/api/adPromotion'

const SCHEMA_VERSION = 'v1'
const EXT_PREFIX = 'wf_ext'
const LOCAL_PREFIX = 'wf_local'

/** 后端策略的新增扩展字段（落本地） */
export interface WaterfallExtension {
  businessType: WaterfallBusinessType
  contentType: WaterfallContentType
  displayCategoryMode?: WaterfallDisplayCategoryMode
  sortMode?: WaterfallSortMode
  /** 超市非算法模式只保存本地完整草稿，不覆盖线上仍在使用的算法配置。 */
  localDraft?: WaterfallDraft
  layoutColumns: WaterfallLayoutColumns
  /** 外卖到家业务频道（美食外卖/超市百货） */
  bizChannel: WaterfallBizChannel
  fallbackCategoryIds: string[]
  fixedSlots: FixedContentSlot[]
  /** 业务线是否已由人工确认（旧记录推断场景标记待确认） */
  confirmed: boolean
}

function currentAccount(): string {
  try {
    const raw = localStorage.getItem('user_info')
    if (raw) return JSON.parse(raw)?.username || 'anon'
  } catch {
    /* 忽略脏数据 */
  }
  return 'anon'
}

function extStorageKey(): string {
  return `${EXT_PREFIX}_${SCHEMA_VERSION}_${currentAccount()}`
}

function localStorageKey(): string {
  return `${LOCAL_PREFIX}_${SCHEMA_VERSION}_${currentAccount()}`
}

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}

function writeJson(key: string, value: unknown): boolean {
  try {
    localStorage.setItem(key, JSON.stringify(value))
    return true
  } catch {
    return false
  }
}

/* ==================== 扩展字段（server 记录） ==================== */

export function getExtension(id: number): WaterfallExtension | undefined {
  const map = readJson<Record<string, WaterfallExtension>>(extStorageKey(), {})
  return map[String(id)]
}

export function setExtension(id: number, ext: WaterfallExtension): boolean {
  const map = readJson<Record<string, WaterfallExtension>>(extStorageKey(), {})
  map[String(id)] = ext
  return writeJson(extStorageKey(), map)
}

export function removeExtension(id: number): void {
  const map = readJson<Record<string, WaterfallExtension>>(extStorageKey(), {})
  delete map[String(id)]
  writeJson(extStorageKey(), map)
}

export function getAllExtensions(): Record<string, WaterfallExtension> {
  return readJson<Record<string, WaterfallExtension>>(extStorageKey(), {})
}

/* ==================== 本地团购策略（local 记录） ==================== */

export function listLocalStrategies(): WaterfallDraft[] {
  const map = readJson<Record<string, WaterfallDraft>>(localStorageKey(), {})
  return Object.values(map)
}

export function getLocalStrategy(id: string): WaterfallDraft | undefined {
  const map = readJson<Record<string, WaterfallDraft>>(localStorageKey(), {})
  return map[id]
}

export function upsertLocalStrategy(draft: WaterfallDraft): boolean {
  const map = readJson<Record<string, WaterfallDraft>>(localStorageKey(), {})
  const id = draft.localId ?? draft.key.replace(/^local_/, '')
  map[id] = { ...draft, localId: id }
  return writeJson(localStorageKey(), map)
}

export function removeLocalStrategy(id: string): void {
  const map = readJson<Record<string, WaterfallDraft>>(localStorageKey(), {})
  delete map[id]
  writeJson(localStorageKey(), map)
}

/** 生成不与已有记录冲突的本地 ID（不假冒服务器策略编号） */
export function newLocalId(): string {
  const rand = Math.random().toString(36).slice(2, 8)
  return `L${Date.now().toString(36)}${rand}`.toUpperCase()
}

/* ==================== 列表合并视图 ==================== */

/**
 * 依据算法坑位引用频道推断业务线。
 * @param algoChannelByCode 算法编码 -> 业务频道（RecommendChannel，4=团购到店）
 * @returns 推断结果；无法判定（混用/缺失）返回 null，交由「待确认」处理
 */
export function inferBusinessType(
  slots: { algoId?: string }[] | undefined,
  algoChannelByCode: Record<string, number>,
): WaterfallBusinessType | null {
  if (!slots || slots.length === 0) return null
  let sawGroupBuy = false
  let sawOther = false
  for (const s of slots) {
    const ch = s.algoId ? algoChannelByCode[s.algoId] : undefined
    if (ch === undefined) continue
    if (ch === 4) sawGroupBuy = true
    else sawOther = true
  }
  if (sawGroupBuy && sawOther) return null // 混用 -> 待确认
  if (sawGroupBuy) return 'groupBuy'
  if (sawOther) return 'delivery'
  return null
}

/**
 * 把后端策略 + 本地扩展 + 业务线推断合并为列表视图。
 * 团购服务端化后后端字段是配置真值；但存量记录的 VO 默认值（businessType=1）与历史本地扩展
 * 无法区分，因此仍按「扩展优先→后端字段→频道推断」过渡：新建团购记录无扩展，直接读后端。
 * 存量超市记录的完整草稿仍存扩展（localDraft），优先回显。
 */
export function mergeServerToStrategies(
  serverList: WaterfallStrategy[],
  algoChannelByCode: Record<string, number>,
): WaterfallListView[] {
  const extMap = getAllExtensions()
  return serverList.map(s => {
    const ext = s.id != null ? extMap[String(s.id)] : undefined
    const inferred = ext ? undefined : inferBusinessType(s.slots, algoChannelByCode)
    const serverBusiness = s.businessType === 2 ? 'groupBuy' as const : s.businessType === 1 ? 'delivery' as const : undefined
    const businessType: WaterfallBusinessType =
      ext?.businessType ?? serverBusiness ?? inferred ?? 'delivery'
    const confirmed = ext?.confirmed ?? (serverBusiness != null || inferred != null)
    return {
      key: serverKey(s.id as number),
      source: 'server' as const,
      localOnly: !!ext?.localDraft,
      id: s.id,
      strategyCode: s.strategyCode,
      strategyName: ext?.localDraft?.strategyName ?? s.strategyName,
      brand: ext?.localDraft?.brand ?? s.brand,
      status: s.status,
      updatedBy: s.updatedBy,
      updatedAt: s.updatedAt,
      businessType,
      contentType: ext?.contentType ?? (s.contentType === 2 ? 'product' : 'store'),
      layoutColumns: ext?.layoutColumns ?? (s.layoutColumns === 2 ? 2 : 1),
      bizChannel: ext?.bizChannel ?? (s.bizChannel === 'supermarket' ? 'supermarket' : 'food'),
      filterDislike: s.filterDislike,
      naturalAlgoName: s.naturalAlgoName,
      businessConfirmed: confirmed,
    }
  })
}

/** 把本地团购策略映射为列表视图 */
export function mergeLocalToStrategies(list: WaterfallDraft[]): WaterfallListView[] {
  return list.map(d => ({
    key: localKey(d.localId ?? d.key.replace(/^local_/, '')),
    source: 'local' as const,
    localOnly: true,
    localId: d.localId,
    strategyCode: d.strategyCode,
    strategyName: d.strategyName,
    brand: d.brand,
    status: d.status,
    updatedBy: undefined,
    updatedAt: undefined,
    businessType: d.businessType,
    contentType: d.contentType,
    layoutColumns: d.layoutColumns,
    bizChannel: d.bizChannel,
    filterDislike: d.filterDislike,
    naturalAlgoName: d.naturalAlgoName,
    businessConfirmed: d.businessConfirmed,
  }))
}

/** 后端固定内容坑位 → 草稿结构（列名不同构：position/status 默认启用）。 */
function serverFixedSlotsToDraft(items: WaterfallFixedSlotItem[] | null | undefined, contentType: WaterfallContentType, brand?: string): FixedContentSlot[] {
  return (items ?? []).map(item => ({
    position: item.slotPosition,
    contentType,
    itemId: item.itemId,
    itemName: item.itemName,
    brand,
    categoryId: item.categoryId ?? undefined,
    categoryName: item.categoryName ?? undefined,
    stock: item.stock ?? undefined,
    status: (item.status === 2 ? 2 : 1) as 1 | 2,
  }))
}

/** 从后端策略 + 扩展构造完整草稿（编辑/详情用）。
 * 团购服务端化后后端字段是配置真值；存量超市记录继续优先回显扩展/localDraft。 */
export function buildDraftFromServer(
  s: WaterfallStrategy,
  ext?: WaterfallExtension,
): WaterfallDraft {
  const base = ext ?? defaultExtension('delivery')
  if (ext?.localDraft) {
    return { ...ext.localDraft, key: serverKey(s.id as number), source: 'server', id: s.id, strategyCode: s.strategyCode, status: s.status === 2 ? 2 : 1 }
  }
  const businessType: WaterfallBusinessType = ext?.businessType ?? (s.businessType === 2 ? 'groupBuy' : 'delivery')
  const contentType: WaterfallContentType = ext?.contentType ?? (s.contentType === 2 ? 'product' : 'store')
  const displayCategoryMode: WaterfallDisplayCategoryMode =
    ext?.displayCategoryMode ?? (s.displayCategoryMode as WaterfallDisplayCategoryMode | null | undefined) ?? getDisplayCategoryMode(base)
  return {
    key: serverKey(s.id as number),
    source: 'server',
    id: s.id,
    strategyCode: s.strategyCode,
    strategyName: s.strategyName,
    brand: s.brand,
    businessType,
    contentType,
    displayCategoryMode,
    sortMode: ext?.sortMode ?? (s.sortMode as WaterfallSortMode | null | undefined) ?? DEFAULT_WATERFALL_SORT,
    layoutColumns: ext?.layoutColumns ?? (s.layoutColumns === 2 ? 2 : 1),
    bizChannel: ext?.bizChannel ?? (s.bizChannel === 'supermarket' ? 'supermarket' : 'food'),
    filterDislike: (s.filterDislike === 1 ? 1 : 2),
    status: (s.status === 2 ? 2 : 1),
    remark: s.remark,
    naturalAlgoId: s.naturalAlgoId ?? null,
    naturalAlgoName: s.naturalAlgoName,
    algoSlots: (s.slots ?? []).map(sl => ({
      position: sl.slotPosition,
      algorithmId: sl.algoId,
      algorithmName: sl.algoName ?? '',
      algorithmType: sl.algoType ?? 1,
      brand: undefined,
      status: (sl.status === 2 ? 2 : 1) as 1 | 2,
    })),
    fallbackCategoryIds: ext?.fallbackCategoryIds ?? s.fallbackCategoryIds ?? [],
    fixedSlots: ext?.fixedSlots ?? serverFixedSlotsToDraft(s.fixedSlots, contentType, s.brand),
    businessConfirmed: base.confirmed,
  }
}

/** 空草稿（新增用） */
export function emptyDraft(businessType: WaterfallBusinessType, brand?: string): WaterfallDraft {
  const isLocal = businessType === 'groupBuy'
  return {
    key: isLocal ? localKey('') : '',
    source: isLocal ? 'local' : 'server',
    localId: isLocal ? newLocalId() : undefined,
    strategyName: '',
    brand,
    businessType,
    contentType: 'store',
    displayCategoryMode: 'algorithm',
    sortMode: DEFAULT_WATERFALL_SORT,
    layoutColumns: 1,
    bizChannel: 'food',
    filterDislike: 2,
    status: 1,
    naturalAlgoId: null,
    algoSlots: [],
    fallbackCategoryIds: [],
    fixedSlots: [],
    businessConfirmed: true,
  }
}
