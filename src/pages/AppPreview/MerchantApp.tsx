/**
 * 商家端 APP 根组件
 *
 * 承载底部 Tab（首頁 / 我的訂單）与购买闭环的屏幕栈，并在最外层套 MerchantProvider
 * 共享下单状态。购买相关屏幕（store/algo/cells/cart/success）委托给 MerchantPurchase，
 * 首页/订单/订单详情在本文件内实现（同样调用真实接口 fetchAdOrders / fetchAdOrderDetail）。
 */
import { useCallback, useEffect, useState } from 'react'
import { Spin, message } from 'antd'
import {
  fetchAdOrders,
  fetchAdOrderDetail,
  type AdOrder,
  type AdOrderDetail,
} from '../../api/adPromotion'
import { useAuth } from '../../contexts/AuthContext'
import { MOBILE_PRODUCTS, ORDER_STATUS_NAME, ORDER_STATUS_COLOR, regionName, mealSlotLabel } from './constants'
import { MerchantProvider } from './merchantContext'
import { useMobileNav, MERCHANT_ROOT, type MerchantScreen, type MobileNavApi } from './nav'
import { StoreStep, AlgoStep, CellsStep, CartStep, SuccessStep } from './MerchantPurchase'

/** 各屏幕的导航栏标题 */
const NAV_TITLE: Record<MerchantScreen['key'], string> = {
  home: '無敵星星 · 商家端',
  store: '選擇門店',
  algo: '選擇方案',
  cells: '選購時段',
  cart: '確認訂單',
  success: '下單成功',
  orders: '我的訂單',
  orderDetail: '訂單詳情',
}

/* ───────────────── 首页 ───────────────── */
function HomeScreen({ nav }: { nav: MobileNavApi<MerchantScreen> }) {
  const { user } = useAuth()
  return (
    <div className="ap-body">
      <div className="ap-hero">
        <div className="ap-hero-hello">{user?.name || '商家'}，歡迎來到推廣中心</div>
        <div style={{ fontSize: 12, opacity: 0.92, marginTop: 4 }}>選購廣告時段，曝光直達目標商圈</div>
      </div>
      <div className="ap-section-title">廣告商品</div>
      {MOBILE_PRODUCTS.map((p) => (
        <div
          key={p.key}
          className={`ap-product${p.available ? '' : ' is-soon'}`}
          onClick={() => {
            if (!p.available) { message.info('該商品原型階段敬請期待'); return }
            nav.push({ key: 'store' })
          }}
        >
          <div className="ap-product-emoji" style={{ background: `${p.tone}1A`, color: p.tone }}>{p.emoji}</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="ap-product-name">{p.name}</div>
            <div className="ap-product-desc">{p.desc}</div>
          </div>
          {p.available ? (
            <span style={{ color: p.tone, fontWeight: 600, fontSize: 13 }}>選購 ›</span>
          ) : (
            <span className="ap-soon-tag">敬請期待</span>
          )}
        </div>
      ))}
    </div>
  )
}

/* ───────────────── 我的订单 ───────────────── */
function OrdersScreen({ nav }: { nav: MobileNavApi<MerchantScreen> }) {
  const [orders, setOrders] = useState<AdOrder[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(() => {
    setLoading(true)
    fetchAdOrders({ page: 1, size: 30 })
      .then((res) => setOrders(res.records ?? []))
      .catch(() => setOrders([]))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { load() }, [load])

  return (
    <div className="ap-body">
      {loading ? (
        <div className="ap-empty-tip"><Spin /></div>
      ) : orders.length === 0 ? (
        <div className="ap-empty-tip">暫無訂單</div>
      ) : (
        orders.map((o) => {
          const color = ORDER_STATUS_COLOR[o.status] || ORDER_STATUS_COLOR[5]
          return (
            <div key={o.orderNo} className="ap-card" onClick={() => nav.push({ key: 'orderDetail', orderNo: o.orderNo })}>
              <div className="ap-order-head">
                <span className="ap-order-no">{o.orderNo}</span>
                <span className="ap-order-status" style={{ color: color.fg, background: color.bg }}>
                  {ORDER_STATUS_NAME[o.status] || '未知'}
                </span>
              </div>
              <div style={{ fontSize: 14, fontWeight: 600, color: '#262626' }}>{o.algoName}</div>
              <div style={{ fontSize: 12, color: '#8c8c8c', marginTop: 3 }}>{o.storeName || o.groupName}</div>
              <div className="ap-order-foot">
                <span style={{ fontSize: 12, color: '#8c8c8c' }}>{o.itemCount ?? 0} 個時段</span>
                <span className="ap-order-amount">MOP {Math.round(o.actualAmount)}</span>
              </div>
            </div>
          )
        })
      )}
    </div>
  )
}

/* ───────────────── 订单详情 ───────────────── */
function OrderDetailScreen({ orderNo }: { orderNo: string }) {
  const [detail, setDetail] = useState<AdOrderDetail | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let alive = true
    setLoading(true)
    fetchAdOrderDetail(orderNo)
      .then((d) => alive && setDetail(d))
      .catch(() => alive && setDetail(null))
      .finally(() => alive && setLoading(false))
    return () => { alive = false }
  }, [orderNo])

  if (loading) return <div className="ap-body"><div className="ap-empty-tip"><Spin /></div></div>
  if (!detail) return <div className="ap-body"><div className="ap-empty-tip">訂單加載失敗</div></div>

  const color = ORDER_STATUS_COLOR[detail.status] || ORDER_STATUS_COLOR[5]
  return (
    <div className="ap-body">
      <div className="ap-card" style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 18, fontWeight: 700 }}>{detail.algoName}</div>
        <span className="ap-order-status" style={{ color: color.fg, background: color.bg, display: 'inline-block', marginTop: 8 }}>
          {ORDER_STATUS_NAME[detail.status] || '未知'}
        </span>
      </div>
      <div className="ap-card">
        <div className="ap-kv"><span>訂單號</span><b>{detail.orderNo}</b></div>
        <div className="ap-kv"><span>門店</span><b>{detail.storeName || '-'}</b></div>
        <div className="ap-kv"><span>集團</span><b>{detail.groupName || detail.groupCode}</b></div>
        <div className="ap-kv"><span>原價</span><b>MOP {Math.round(detail.originalAmount)}</b></div>
        <div className="ap-kv"><span>優惠</span><b>- MOP {Math.round(detail.discountAmount)}</b></div>
        <div className="ap-kv"><span>實付</span><b style={{ color: '#e8720c' }}>MOP {Math.round(detail.actualAmount)}</b></div>
      </div>
      {detail.dateSlots && detail.dateSlots.length > 0 && (
        <div className="ap-card">
          <div className="ap-section-title" style={{ marginTop: 0 }}>購買時段</div>
          {detail.dateSlots.map((ds, i) => (
            <div key={i} className="ap-cart-row">
              <div className="ap-cart-meta">
                <div className="ap-cart-line1">{regionName(ds.region)} · {ds.date}</div>
                <div className="ap-cart-line2">{ds.slots.map(mealSlotLabel).join('、')}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

/* ───────────────── 根：导航栏 + 屏幕 + Tab ───────────────── */
function MerchantShell() {
  const nav = useMobileNav<MerchantScreen>(MERCHANT_ROOT.home)
  const { current, canGoBack } = nav
  const isRoot = current.key === 'home' || current.key === 'orders'

  const renderScreen = () => {
    switch (current.key) {
      case 'home': return <HomeScreen nav={nav} />
      case 'store': return <StoreStep nav={nav} />
      case 'algo': return <AlgoStep nav={nav} />
      case 'cells': return <CellsStep nav={nav} />
      case 'cart': return <CartStep nav={nav} />
      case 'success': return <SuccessStep nav={nav} orderNo={current.orderNo} amount={current.amount} />
      case 'orders': return <OrdersScreen nav={nav} />
      case 'orderDetail': return <OrderDetailScreen orderNo={current.orderNo} />
      default: return null
    }
  }

  return (
    <div className="ap-screen">
      <div className="ap-navbar">
        {canGoBack && !isRoot ? (
          <button type="button" className="ap-navbar-back" onClick={nav.back}>‹ 返回</button>
        ) : <span style={{ width: 8 }} />}
        <span className="ap-navbar-title">{NAV_TITLE[current.key]}</span>
      </div>
      {renderScreen()}
      {isRoot && (
        <div className="ap-tabbar">
          <button
            type="button"
            className={`ap-tab${current.key === 'home' ? ' is-active' : ''}`}
            onClick={() => nav.reset(MERCHANT_ROOT.home)}
          >
            <span className="ap-tab-icon">🏠</span>
            <span>首頁</span>
          </button>
          <button
            type="button"
            className={`ap-tab${current.key === 'orders' ? ' is-active' : ''}`}
            onClick={() => nav.reset(MERCHANT_ROOT.orders)}
          >
            <span className="ap-tab-icon">📋</span>
            <span>我的訂單</span>
          </button>
        </div>
      )}
    </div>
  )
}

export default function MerchantApp() {
  return (
    <MerchantProvider>
      <MerchantShell />
    </MerchantProvider>
  )
}
