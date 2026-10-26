/**
 * 商家端 · 无敌星星真实购买闭环
 *
 * 五个连续屏幕（选门店 → 选算法 → 选格子 → 购物车结算 → 下单成功），
 * 全部直接调用后台已在用的真实接口（src/api/adPromotion.ts / store.ts / finance.ts）：
 *   fetchStores → fetchAdAlgorithms → fetchAdInventory → placeAdStarOrder
 * 下单成功后订单真实落库，可在后台「推廣訂單管理 / 訂單詳情」查到同一笔订单。
 *
 * 说明：Phase 0 未接「加購鎖 lock/unlock」，结算直接下单（原型演示够用，
 * 并发防超卖仍由后端下单事务兜底）。桌面端完整折扣/贈送抵扣逻辑不在原型复刻范围。
 *
 * ⚠️ 例外登记（对 .qoder/rules/frontend-ui-design-spec.md §B.3「提交类必须 Modal.confirm」）：
 *   原因：本页在真机上按 APP 惯例用「底部确认 sheet」呈现二次确认，居中 Modal 在手机
 *         上遮罩高、按钮偏小、单手够不到；确认内容与执行顺序（校验 → 确认 → 调 API）不变，
 *         信息面板仍复用全局 .confirm-info-card，不新增色值。
 *   风险：仅 /app-preview 原型页的确认交互形态与桌面端不同，后台业务页不受影响。
 *   补偿：范围限定 .ap-confirm-sheet；正式立项时随设计稿统一为移动端确认组件。
 *   负责人：产品/前端（本原型发起人）。到期：随 APP 正式立项、原型下线即移除。
 */
import { useEffect, useMemo, useState } from 'react'
import { Drawer, Spin, message } from 'antd'
import dayjs from 'dayjs'
import {
  fetchAdAlgorithms,
  fetchAdInventory,
  placeAdStarOrder,
  type AdAlgorithm,
  type AdInventoryCell,
} from '@/api/adPromotion'
import { fetchStores, type StoreItem } from '@/api/store'
import { fetchFinAccountBalance } from '@/api/finance'
import { UI_TO_BACKEND_BRAND } from '../_shared/ad-promotion/gridConstants'
import { AlgorithmType } from '@mftb/contracts/recommendConstants'
import {
  BRAND_OPTIONS,
  MEAL_SLOT_ORDER,
  mealSlotLabel,
  regionName,
  type MobileBrand,
} from './constants'
import { useMerchant, type ChosenCell } from './merchantContext'
import type { MobileNavApi } from './nav'
import type { MerchantScreen } from './nav'

type Nav = MobileNavApi<MerchantScreen>
const WEEK = ['日', '一', '二', '三', '四', '五', '六']

/* ───────────────────────── 选门店 ───────────────────────── */
export function StoreStep({ nav }: { nav: Nav }) {
  const { brand, setBrand, setStore } = useMerchant()
  const [stores, setStores] = useState<StoreItem[]>([])
  const [loading, setLoading] = useState(false)
  const [keyword, setKeyword] = useState('')

  const activeBrand: MobileBrand = brand || BRAND_OPTIONS[0].value

  useEffect(() => {
    let alive = true
    setLoading(true)
    const backendBrand = UI_TO_BACKEND_BRAND[activeBrand]
    fetchStores({ page: 1, size: 500 })
      .then((res) => {
        if (!alive) return
        const list = (res.records ?? []).filter((s) => !s.brand || s.brand.split(',').some((b) => b.trim() === backendBrand))
        setStores(list)
      })
      .catch(() => alive && setStores([]))
      .finally(() => alive && setLoading(false))
    return () => { alive = false }
  }, [activeBrand])

  const shown = keyword ? stores.filter((s) => `${s.storeName}${s.storeCode}${s.groupName}`.includes(keyword)) : stores

  const handlePick = (store: StoreItem) => {
    setBrand(activeBrand)
    setStore(store)
    nav.push({ key: 'algo' })
  }

  return (
    <div className="ap-body">
      <div className="ap-section-title">選擇品牌</div>
      <div className="ap-chips">
        {BRAND_OPTIONS.map((b) => (
          <button
            key={b.value}
            type="button"
            className={`ap-chip${activeBrand === b.value ? ' is-active' : ''}`}
            onClick={() => { setBrand(b.value); setStore(null) }}
          >
            {b.label}
          </button>
        ))}
      </div>
      <div className="ap-section-title">選擇門店（真實數據）</div>
      <input
        className="ap-card"
        style={{ width: '100%', boxSizing: 'border-box', marginBottom: 12, fontSize: 14 }}
        placeholder="搜索門店 / 門店ID / 集團"
        value={keyword}
        onChange={(e) => setKeyword(e.target.value)}
      />
      {loading ? (
        <div className="ap-empty-tip"><Spin /></div>
      ) : shown.length === 0 ? (
        <div className="ap-empty-tip">該品牌下暫無門店，請換個品牌</div>
      ) : (
        shown.map((s) => (
          <div key={s.storeCode} className="ap-list-item" onClick={() => handlePick(s)}>
            <div className="ap-list-item-main">
              <div className="ap-list-item-title">{s.storeName}</div>
              <div className="ap-list-item-sub">ID：{s.storeCode} · {s.groupName}</div>
              {s.address ? <div className="ap-list-item-sub">{s.address}</div> : null}
            </div>
            <span style={{ color: '#d9d9d9', fontSize: 18 }}>›</span>
          </div>
        ))
      )}
    </div>
  )
}

/* ───────────────────────── 选算法 ───────────────────────── */
export function AlgoStep({ nav }: { nav: Nav }) {
  const { brand, store, setAlgo } = useMerchant()
  const [algos, setAlgos] = useState<AdAlgorithm[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!store || !brand) return
    let alive = true
    setLoading(true)
    fetchAdAlgorithms({
      page: 1, size: 200,
      algoType: AlgorithmType.INVINCIBLE_STAR,
      brand: UI_TO_BACKEND_BRAND[brand],
      status: 1, hasPricing: true, storeCode: store.storeCode,
    })
      .then((res) => alive && setAlgos(res?.records ?? []))
      .catch(() => alive && setAlgos([]))
      .finally(() => alive && setLoading(false))
    return () => { alive = false }
  }, [store, brand])

  const handlePick = (a: AdAlgorithm) => {
    setAlgo(a)
    nav.push({ key: 'cells' })
  }

  return (
    <div className="ap-body">
      <div className="ap-card" style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 12, color: '#8c8c8c' }}>當前門店</div>
        <div style={{ fontSize: 15, fontWeight: 600, marginTop: 4 }}>{store?.storeName}（{store?.storeCode}）</div>
      </div>
      <div className="ap-section-title">選擇推廣方案（無敵星星算法）</div>
      {loading ? (
        <div className="ap-empty-tip"><Spin /></div>
      ) : algos.length === 0 ? (
        <div className="ap-empty-tip">該門店可用方案為空（可能已被屏蔽或未配價）</div>
      ) : (
        algos.map((a) => (
          <div key={a.id} className="ap-list-item" onClick={() => handlePick(a)}>
            <div className="ap-list-item-main">
              <div className="ap-list-item-title">{a.algoName}</div>
              <div className="ap-list-item-sub">{a.algoCode} · {a.brand}</div>
            </div>
            <span style={{ color: '#d9d9d9', fontSize: 18 }}>›</span>
          </div>
        ))
      )}
    </div>
  )
}

/* ───────────────────────── 选格子 ───────────────────────── */
export function CellsStep({ nav }: { nav: Nav }) {
  const { algo, store, inventory, setInventory, cart, toggleCell, isInCart, cartTotal } = useMerchant()
  const [loading, setLoading] = useState(false)
  const [activeDate, setActiveDate] = useState<string>('')

  const algoId = algo?.id
  useEffect(() => {
    if (!algoId || !store) return
    let alive = true
    setLoading(true)
    fetchAdInventory(algoId, store.storeCode, store.groupCode)
      .then((inv) => {
        if (!alive) return
        setInventory(inv)
        const first = inv?.cells?.[0]?.bizDate || ''
        setActiveDate(first)
      })
      .catch(() => alive && setInventory(null))
      .finally(() => alive && setLoading(false))
    return () => { alive = false }
  }, [algoId, store, setInventory])

  const dates = useMemo(() => {
    const set = new Set((inventory?.cells ?? []).map((c) => c.bizDate))
    return Array.from(set).sort()
  }, [inventory])

  // 当前日期下、按商圈分组的格子
  const regionBlocks = useMemo(() => {
    if (!inventory || !activeDate) return []
    const byRegion = new Map<number, AdInventoryCell[]>()
    inventory.cells
      .filter((c) => c.bizDate === activeDate)
      .forEach((c) => {
        const arr = byRegion.get(c.region) || []
        arr.push(c)
        byRegion.set(c.region, arr)
      })
    return Array.from(byRegion.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([region, cells]) => ({
        region,
        cells: MEAL_SLOT_ORDER.map((slot) => cells.find((c) => c.mealSlot === slot)).filter(Boolean) as AdInventoryCell[],
      }))
  }, [inventory, activeDate])

  const handleToggle = (cell: AdInventoryCell) => {
    if (cell.status !== 'available') return
    const chosen: ChosenCell = { bizDate: cell.bizDate, region: cell.region, mealSlot: cell.mealSlot, cellPrice: cell.cellPrice }
    toggleCell(chosen)
  }

  const goCart = () => {
    if (cart.length === 0) { message.warning('請先選擇至少一個時段'); return }
    nav.push({ key: 'cart' })
  }

  if (loading) return <div className="ap-body"><div className="ap-empty-tip"><Spin tip="載入庫存…" /></div></div>

  return (
    <>
      <div className="ap-body">
        <div className="ap-card" style={{ marginBottom: 12, padding: '10px 14px' }}>
          <div style={{ fontSize: 13, fontWeight: 600 }}>{algo?.algoName}</div>
          <div style={{ fontSize: 12, color: '#8c8c8c', marginTop: 2 }}>{store?.storeName} · 预售 {inventory?.presaleDays ?? '-'} 天</div>
        </div>
        {dates.length === 0 ? (
          <div className="ap-empty-tip">暫無可購時段</div>
        ) : (
          <>
            <div className="ap-date-strip">
              {dates.map((d) => {
                const dj = dayjs(d)
                const isToday = dj.isSame(dayjs(), 'day')
                return (
                  <button
                    key={d}
                    type="button"
                    className={`ap-date${activeDate === d ? ' is-active' : ''}`}
                    onClick={() => setActiveDate(d)}
                  >
                    <div className="ap-date-week">{isToday ? '今天' : `周${WEEK[dj.day()]}`}</div>
                    <div className="ap-date-day">{dj.format('D')}</div>
                  </button>
                )
              })}
            </div>
            {regionBlocks.map((rb) => (
              <div key={rb.region} className="ap-region-block">
                <div className="ap-region-title">{regionName(rb.region)}</div>
                <div className="ap-cell-grid">
                  {rb.cells.map((cell) => {
                    const selected = isInCart(cell)
                    const cls = cell.status === 'available' ? (selected ? 'is-selected' : '')
                      : cell.status === 'soldOut' ? 'is-sold' : 'is-unavailable'
                    return (
                      <div
                        key={`${cell.region}|${cell.mealSlot}`}
                        className={`ap-cell ${cls}`}
                        onClick={() => handleToggle(cell)}
                      >
                        <div className="ap-cell-slot">{mealSlotLabel(cell.mealSlot)}</div>
                        <div className="ap-cell-price">MOP {Math.round(cell.cellPrice)}</div>
                        <div className="ap-cell-stock">
                          {cell.status === 'available' ? `剩 ${cell.remaining ?? 1}`
                            : cell.status === 'soldOut' ? '已售罄'
                            : cell.status === 'upcoming' ? '待開售' : '不可售'}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            ))}
          </>
        )}
      </div>
      <div className="ap-stickybar">
        <div className="ap-stickybar-info">
          <span className="ap-stickybar-total">MOP {Math.round(cartTotal)}</span>
          <span className="ap-stickybar-sub">已選 {cart.length} 個時段</span>
        </div>
        <button type="button" className="ap-btn" onClick={goCart} disabled={cart.length === 0}>去結算</button>
      </div>
    </>
  )
}

/* ───────────────────────── 购物车 / 结算 ───────────────────────── */
export function CartStep({ nav }: { nav: Nav }) {
  const { brand, store, algo, cart, cartTotal, removeCell, clearCart } = useMerchant()
  const [balance, setBalance] = useState<number | null>(null)
  const [paying, setPaying] = useState(false)
  /** 下单确认底部 sheet 开关（例外登记见文件头：真机按 APP 惯例用底部弹层替代居中 Modal.confirm） */
  const [confirmOpen, setConfirmOpen] = useState(false)

  useEffect(() => {
    if (!store || !brand) return
    fetchFinAccountBalance(store.groupCode, UI_TO_BACKEND_BRAND[brand])
      .then((bal) => setBalance(bal ? Number(bal.virtualBalance) : null))
      .catch(() => setBalance(null))
  }, [store, brand])

  /** 校验先行：信息不全或购物车为空都进不到确认层（保持 §B.3「校验 → 确认 → API」顺序） */
  const handleSubmit = () => {
    if (!store || !algo?.id) { message.error('下單信息不完整'); return }
    if (cart.length === 0) { message.warning('請先選擇至少一個時段'); return }
    setConfirmOpen(true)
  }

  const doPlaceOrder = async () => {
    if (!store || !algo?.id) return
    setPaying(true)
    try {
      const order = await placeAdStarOrder({
        algoId: algo.id as number,
        groupCode: store.groupCode,
        storeCode: store.storeCode,
        bdEmpId: store.bdList?.[0]?.bdEmpId || undefined,
        cells: cart.map((c) => ({ bizDate: c.bizDate, region: c.region, mealSlot: c.mealSlot })),
      })
      clearCart()
      setConfirmOpen(false)
      nav.replace({ key: 'success', orderNo: order.orderNo, amount: Number(order.actualAmount) || 0 })
    } catch (err) {
      message.error(err instanceof Error ? err.message : '下單失敗')
    } finally {
      setPaying(false)
    }
  }

  return (
    <>
      <div className="ap-body">
        <div className="ap-card">
          <div className="ap-kv"><span>門店</span><b>{store?.storeName}</b></div>
          <div className="ap-kv"><span>所屬集團</span><b>{store?.groupName}（{store?.groupCode}）</b></div>
          <div className="ap-kv"><span>推廣方案</span><b>{algo?.algoName}</b></div>
          <div className="ap-kv"><span>推廣金餘額</span><b>{balance == null ? '--' : `MOP ${Math.round(balance)}`}</b></div>
        </div>
        <div className="ap-section-title">已選時段（{cart.length}）</div>
        <div className="ap-card">
          {cart.map((c) => (
            <div key={`${c.bizDate}|${c.region}|${c.mealSlot}`} className="ap-cart-row">
              <div className="ap-cart-meta">
                <div className="ap-cart-line1">{regionName(c.region)} · {mealSlotLabel(c.mealSlot)}</div>
                <div className="ap-cart-line2">{c.bizDate}</div>
              </div>
              <span className="ap-cart-price">MOP {Math.round(c.cellPrice)}</span>
              <button type="button" className="ap-cart-remove" onClick={() => removeCell(c)} aria-label="移除">×</button>
            </div>
          ))}
        </div>
      </div>
      <div className="ap-stickybar">
        <div className="ap-stickybar-info">
          <span className="ap-stickybar-total">MOP {Math.round(cartTotal)}</span>
          <span className="ap-stickybar-sub">成交價以下單返回為準</span>
        </div>
        <button type="button" className="ap-btn" onClick={handleSubmit} disabled={paying || cart.length === 0}>
          {paying ? '提交中…' : '提交訂單'}
        </button>
      </div>
      {/* 下单二次确认：真机底部 sheet（例外登记见文件头），提交中禁止遮罩关闭避免重复扣款 */}
      <Drawer
        open={confirmOpen}
        placement="bottom"
        height="auto"
        closable={false}
        title="確認提交訂單？"
        rootClassName="ap-confirm-sheet"
        onClose={() => { if (!paying) setConfirmOpen(false) }}
      >
        <div className="confirm-info-card">
          <div className="confirm-info-row"><span>門店：</span><b>{store?.storeName}</b></div>
          <div className="confirm-info-row"><span>方案：</span><b>{algo?.algoName}</b></div>
          <div className="confirm-info-row"><span>時段數：</span><b>{cart.length}</b></div>
          <div className="confirm-info-row"><span>預估金額：</span><b>MOP {Math.round(cartTotal)}</b></div>
        </div>
        <div className="ap-sheet-actions">
          <button type="button" className="ap-btn is-plain" disabled={paying} onClick={() => setConfirmOpen(false)}>
            返回修改
          </button>
          <button type="button" className="ap-btn" disabled={paying} onClick={doPlaceOrder}>
            {paying ? '提交中…' : '確認下單'}
          </button>
        </div>
      </Drawer>
    </>
  )
}

/* ───────────────────────── 下单成功 ───────────────────────── */
export function SuccessStep({ nav, orderNo, amount }: { nav: Nav; orderNo: string; amount: number }) {
  return (
    <div className="ap-success">
      <div className="ap-success-icon">✓</div>
      <div className="ap-success-title">下單成功</div>
      <div style={{ fontSize: 13, color: '#8c8c8c', marginTop: 6 }}>已從推廣金賬戶扣款 MOP {Math.round(amount)}</div>
      <div className="ap-success-no">訂單號：{orderNo}</div>
      <div style={{ fontSize: 12, color: '#8c8c8c', marginTop: 12 }}>可在後台「推廣訂單管理」查看此訂單</div>
      <div style={{ display: 'flex', gap: 12, marginTop: 26 }}>
        <button type="button" className="ap-btn is-danger" style={{ marginLeft: 0 }} onClick={() => nav.reset({ key: 'home' })}>繼續選購</button>
        <button type="button" className="ap-btn" style={{ marginLeft: 0 }} onClick={() => nav.reset({ key: 'orderDetail', orderNo })}>查看訂單</button>
      </div>
    </div>
  )
}
