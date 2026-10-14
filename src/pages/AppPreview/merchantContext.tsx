/**
 * 商家端购买闭环 · 跨屏共享状态
 *
 * 选门店 → 选算法 → 选格子 → 购物车 → 结算 是连续的下单动线，
 * 这几步共享的数据（品牌 / 门店 / 算法 / 库存 / 购物车）用一个 Context 承载，
 * 避免逐屏透传 props；离开购买流程时调用 reset 清空，防止脏状态带入下一次下单。
 *
 * 下单动线草稿同步到 sessionStorage：真机浏览器把页面切到后台后随时可能被回收，
 * 刷新/恢复时若不落盘，用户选好的门店、方案与购物车会整体丢失（原生 APP 不会）。
 * 库存与价格刻意不落盘——必须每次重新取，避免拿旧库存下出已变化的单。
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { StoreItem } from '../../api/store'
import type { AdAlgorithm, AdInventoryVO } from '../../api/adPromotion'
import type { MobileBrand } from './constants'

/** 购物车格子：字段命名与后端下单请求 cells 对齐（bizDate / region / mealSlot） */
export interface ChosenCell {
  bizDate: string
  region: number
  mealSlot: string
  /** 格子单价（库存接口返回，仅前端展示合计用；最终成交价以订单返回为准） */
  cellPrice: number
}

/** 购物车唯一键：商圈 × 日期 × 餐段（同一格不可重复加购） */
export function cellKey(c: { bizDate: string; region: number; mealSlot: string }): string {
  return `${c.bizDate}|${c.region}|${c.mealSlot}`
}

/** 下单动线草稿：只存跨屏恢复需要的选择结果，不存库存这类会变的取数结果 */
interface MerchantDraft {
  brand: MobileBrand | null
  store: StoreItem | null
  algo: AdAlgorithm | null
  cart: ChosenCell[]
}

const DRAFT_KEY = 'app-preview:merchant-draft'

/**
 * 读取草稿：结构不符（旧版本残留、手改存储）一律视为无草稿。
 * 原型页宁可丢掉上次选择，也不能让坏数据把整页撑白屏。
 * sessionStorage 不可用（隐私模式、测试环境未 mock）时同样静默返回空草稿。
 */
function readMerchantDraft(): MerchantDraft {
  const empty: MerchantDraft = { brand: null, store: null, algo: null, cart: [] }
  try {
    const raw = sessionStorage.getItem(DRAFT_KEY)
    if (!raw) return empty
    const parsed = JSON.parse(raw) as Partial<MerchantDraft> | null
    if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.cart)) return empty
    return { brand: parsed.brand ?? null, store: parsed.store ?? null, algo: parsed.algo ?? null, cart: parsed.cart }
  } catch {
    return empty
  }
}

function writeMerchantDraft(draft: MerchantDraft) {
  try {
    sessionStorage.setItem(DRAFT_KEY, JSON.stringify(draft))
  } catch {
    // 配额满或存储不可用：草稿丢个把次不影响下单正确性，不打扰用户
  }
}

function clearMerchantDraft() {
  try {
    sessionStorage.removeItem(DRAFT_KEY)
  } catch {
    // 同上：清不掉也只是下次进来多一次空草稿，不做提示
  }
}

interface MerchantState {
  brand: MobileBrand | null
  store: StoreItem | null
  algo: AdAlgorithm | null
  inventory: AdInventoryVO | null
  cart: ChosenCell[]
  setBrand: (b: MobileBrand | null) => void
  setStore: (s: StoreItem | null) => void
  setAlgo: (a: AdAlgorithm | null) => void
  setInventory: (i: AdInventoryVO | null) => void
  toggleCell: (cell: ChosenCell) => void
  removeCell: (cell: ChosenCell) => void
  clearCart: () => void
  /** 离开购买流程时清空全部下单态 */
  reset: () => void
  cartTotal: number
  isInCart: (cell: ChosenCell) => boolean
}

const MerchantContext = createContext<MerchantState | null>(null)

export function MerchantProvider({ children }: { children: ReactNode }) {
  // 懒初始化只读一次草稿；放在最前，后续各屏初值都从这份 draft 取
  const [draft] = useState(readMerchantDraft)
  const [brand, setBrand] = useState<MobileBrand | null>(draft.brand)
  const [store, setStore] = useState<StoreItem | null>(draft.store)
  const [algo, setAlgo] = useState<AdAlgorithm | null>(draft.algo)
  const [inventory, setInventory] = useState<AdInventoryVO | null>(null)
  const [cart, setCart] = useState<ChosenCell[]>(draft.cart)

  /** 动线草稿跟随选择结果落盘（库存是取数结果，不参与持久化） */
  useEffect(() => {
    writeMerchantDraft({ brand, store, algo, cart })
  }, [brand, store, algo, cart])

  const toggleCell = useCallback((cell: ChosenCell) => {
    setCart((prev) => {
      const key = cellKey(cell)
      return prev.some((c) => cellKey(c) === key)
        ? prev.filter((c) => cellKey(c) !== key)
        : [...prev, cell]
    })
  }, [])

  const removeCell = useCallback((cell: ChosenCell) => {
    setCart((prev) => prev.filter((c) => cellKey(c) !== cellKey(cell)))
  }, [])

  const clearCart = useCallback(() => setCart([]), [])

  const reset = useCallback(() => {
    setBrand(null)
    setStore(null)
    setAlgo(null)
    setInventory(null)
    setCart([])
    // 显式清草稿：下一次进原型必须从「未选门店」开始，不能带着上一次的下单动线
    clearMerchantDraft()
  }, [])

  const cartTotal = useMemo(() => cart.reduce((sum, c) => sum + (c.cellPrice || 0), 0), [cart])

  const isInCart = useCallback(
    (cell: ChosenCell) => cart.some((c) => cellKey(c) === cellKey(cell)),
    [cart],
  )

  const value: MerchantState = {
    brand, store, algo, inventory, cart,
    setBrand, setStore, setAlgo, setInventory,
    toggleCell, removeCell, clearCart, reset, cartTotal, isInCart,
  }

  return <MerchantContext.Provider value={value}>{children}</MerchantContext.Provider>
}

/** 商家端购买状态 Hook：必须在 MerchantProvider 内使用 */
export function useMerchant(): MerchantState {
  const ctx = useContext(MerchantContext)
  if (!ctx) throw new Error('useMerchant 必须在 MerchantProvider 内使用')
  return ctx
}
