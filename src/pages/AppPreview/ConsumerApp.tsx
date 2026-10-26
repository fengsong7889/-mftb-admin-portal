/**
 * 用户端 APP 根组件
 *
 * 屏幕栈：底部四 Tab（首頁 / 神會員 / 訂單 / 我的）为根屏，可 push 子页
 * （美食外賣 / 特價團購 / 超市百貨 / 店鋪詳情 / 搜尋）。
 * 复用 nav.ts 的 useMobileNav：它已把栈深桥接浏览器 history，真机 Android 返回键 / iOS 后退
 * 与机身内「‹ 返回」等价；Tab 切换用 reset 回到根屏。
 *
 * 搜索作为覆盖层压在来源页之上：打开搜索时来源页保持挂载，返回后关键词与滚动位置不丢；
 * 从搜索结果进入店铺再返回时，ConsumerSearch 通过页面级记忆恢复上一次结果。
 *
 * 说明：消费者侧暂无对应后端只读接口，各页先用占位数据渲染版式，待接口与设计切图接入后替换。
 */
import { useState } from 'react'
import ConsumerHome from './ConsumerHome'
import ConsumerGroupBuy from './ConsumerGroupBuy'
import ConsumerDelivery from './ConsumerDelivery'
import ConsumerMarket from './ConsumerMarket'
import ConsumerStore from './ConsumerStore'
import ConsumerSearch from './ConsumerSearch'
import ConsumerProfile from './ConsumerProfile'
import { useMobileNav } from './nav'
import type { SearchScope } from './consumerSearchData'

type RootKey = 'home' | 'vip' | 'order' | 'mine'

const TABS: { key: RootKey; icon: string; label: string }[] = [
  { key: 'home', icon: '🏠', label: '首頁' },
  { key: 'vip', icon: '💎', label: '神會員' },
  { key: 'order', icon: '📋', label: '訂單' },
  { key: 'mine', icon: '👤', label: '我的' },
]

type ConsumerScreen =
  | { key: 'home' }
  | { key: 'vip' }
  | { key: 'order' }
  | { key: 'mine' }
  | { key: 'groupbuy' }
  | { key: 'delivery' }
  | { key: 'market' }
  | { key: 'store'; merchantId: string }
  | { key: 'search'; scope: SearchScope; merchantId?: string; keyword?: string }

const ROOT: Record<RootKey, ConsumerScreen> = {
  home: { key: 'home' },
  vip: { key: 'vip' },
  order: { key: 'order' },
  mine: { key: 'mine' },
}

export default function ConsumerApp() {
  const nav = useMobileNav<ConsumerScreen>(ROOT.home)
  const { current } = nav
  const [cartCount, setCartCount] = useState(0)

  const openSearch = (scope: SearchScope, merchantId?: string, keyword?: string) => {
    nav.push({ key: 'search', scope, merchantId, keyword })
  }
  const openStore = (merchantId: string) => {
    nav.push({ key: 'store', merchantId })
  }
  const addToCart = () => setCartCount((count) => count + 1)

  const isSearch = current.key === 'search'
  const baseScreen = isSearch ? nav.stack[nav.stack.length - 2] : current
  const isRoot = !isSearch && TABS.some((tab) => tab.key === current.key)

  const renderTab = (tab: (typeof TABS)[number]) => (
    <button
      key={tab.key}
      type="button"
      className={`ap-tab${current.key === tab.key ? ' is-active' : ''}`}
      onClick={() => nav.reset(ROOT[tab.key])}
    >
      <span className="ap-tab-icon" aria-hidden="true">{tab.icon}</span>
      <span>{tab.label}</span>
    </button>
  )

  const renderScreen = (screen: ConsumerScreen) => {
    switch (screen.key) {
      case 'home':
        return (
          <ConsumerHome
            onSearch={() => openSearch('global')}
            onOpenGroupBuy={() => nav.push({ key: 'groupbuy' })}
            onOpenDelivery={() => nav.push({ key: 'delivery' })}
            onOpenMarket={() => nav.push({ key: 'market' })}
            onOpenStore={openStore}
          />
        )
      case 'groupbuy':
        return (
          <ConsumerGroupBuy
            onBack={nav.back}
            onSearch={() => openSearch('groupbuy')}
            onOpenStore={openStore}
          />
        )
      case 'delivery':
        return (
          <ConsumerDelivery
            onBack={nav.back}
            onSearch={(keyword) => openSearch('delivery', undefined, keyword)}
            onOpenStore={openStore}
          />
        )
      case 'market':
        return (
          <ConsumerMarket
            onBack={nav.back}
            onSearch={() => openSearch('market')}
            onOpenStore={openStore}
          />
        )
      case 'store':
        return (
          <ConsumerStore
            merchantId={screen.merchantId}
            onBack={nav.back}
            onSearch={() => openSearch('store', screen.merchantId)}
            cartCount={cartCount}
            onAddToCart={addToCart}
          />
        )
      case 'mine':
        return <ConsumerProfile />
      case 'vip':
      case 'order':
        return (
          <div className="ap-body">
            <div className="ap-empty-tip">「{TABS.find((tab) => tab.key === screen.key)?.label}」頁面待設計稿</div>
          </div>
        )
      case 'search':
        return null
    }
  }

  return (
    <div className="ap-screen apc-root">
      {baseScreen && renderScreen(baseScreen)}

      {isSearch && (
        <ConsumerSearch
          key={`${current.scope}:${current.merchantId ?? ''}:${current.keyword ?? ''}`}
          scope={current.scope}
          merchantId={current.merchantId}
          initialKeyword={current.keyword}
          onBack={nav.back}
          onOpenStore={openStore}
          onSearchGlobal={(keyword) => nav.push({ key: 'search', scope: 'global', keyword })}
          onAddToCart={addToCart}
        />
      )}

      {/* 回到頂部（悬浮在 Tab 之上；搜索覆盖层打开时隐藏） */}
      {!isSearch && <button type="button" className="apc-to-top" aria-label="回到頂部">↑</button>}

      {isRoot && (
        <div className="ap-tabbar apc-tabbar">
          {TABS.slice(0, 2).map(renderTab)}
          {/* 中间「賣閒置」悬浮钮（设计稿：凸出在底栏之上） */}
          <button type="button" className="apc-fab" aria-label="賣閒置">
            <span className="apc-fab-ico" aria-hidden="true">🐝</span>
            <span className="apc-fab-label">賣閒置</span>
          </button>
          {TABS.slice(2).map(renderTab)}
        </div>
      )}
    </div>
  )
}
