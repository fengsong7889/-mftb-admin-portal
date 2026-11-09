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
 * 界面文案走 appConsumer 命名空间（zh-TW + en 双语已登记，其余语种回落英文）。
 */
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
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

const TABS: { key: RootKey; icon: string; labelKey: string; zh: string }[] = [
  { key: 'home', icon: '🏠', labelKey: 'appConsumer.tab.home', zh: '首頁' },
  { key: 'vip', icon: '💎', labelKey: 'appConsumer.tab.vip', zh: '神會員' },
  { key: 'order', icon: '📋', labelKey: 'appConsumer.tab.order', zh: '訂單' },
  { key: 'mine', icon: '👤', labelKey: 'appConsumer.tab.mine', zh: '我的' },
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

export default function ConsumerApp({ onCategoryChange, syncCategory, syncSeq, deliveryMode, deliveryPageMode, preferredLayout, onPreferredLayoutChange }: {
  onCategoryChange?: (cat: string) => void
  /** 右侧说明面板 Tab 下发的分类同步命令（syncSeq 自增时执行） */
  syncCategory?: string
  syncSeq?: number
  /** 外卖瀑布流展示模式（说明面板切换器下发；两台手机同步；large=大图模式閃蜂/MFOOD 均实现） */
  deliveryMode?: 'list' | 'card' | 'large'
  /** 美食外卖频道页瀑布流大小图模式（说明面板切换器下发；閃蜂/MFOOD 两台手机同步） */
  deliveryPageMode?: 'small' | 'large'
  /** 優選商家列表大小圖模式（说明面板切换器下发；两台手机同步） */
  preferredLayout?: 'small' | 'large'
  /** 篩選面板内切换上报（说明面板闭环后下发另一台手机） */
  onPreferredLayoutChange?: (mode: 'small' | 'large') => void
}) {
  const { t } = useTranslation()
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

  /* 壳外说明面板同步命令：特惠团购页两类 → 进入特惠團購界面（页签由 ConsumerGroupBuy 内部切换）；
     delivery-page → 进入美食外賣频道页（美食外卖页说明面板联动）；
     search → 打开搜索结果页（搜索结果瀑布流说明面板联动；带热搜词直达，MFOOD 无搜索功能会忽略该命令）；
     首页两类 → 回首页根屏（分类由 ConsumerHome 内部切换） */
  const syncSeqRef = useRef(syncSeq ?? 0)
  useEffect(() => {
    if ((syncSeq ?? 0) !== syncSeqRef.current) {
      syncSeqRef.current = syncSeq ?? 0
      if (syncCategory === 'preferred' || syncCategory === 'page-group' || syncCategory === 'filter') {
        if (nav.current.key !== 'groupbuy') nav.push({ key: 'groupbuy' })
      } else if (syncCategory === 'delivery-page') {
        if (nav.current.key !== 'delivery') nav.push({ key: 'delivery' })
      } else if (syncCategory === 'search-delivery' || syncCategory === 'search-group') {
        /* 搜索结果瀑布流说明面板（三级 外卖/团购）：面板描述的是首页搜索瀑布流，
           未进入搜索或正停在频道内搜索时统一进入/替换为首页搜索，保证双机与面板口径对应；
           壳内瀑布流分类由 ConsumerSearch 按 syncFeed 切换（MFOOD 壳同口径处理） */
        if (nav.current.key !== 'search' || nav.current.scope !== 'global') {
          nav.push({ key: 'search', scope: 'global', keyword: '火鍋' })
        }
      } else if (syncCategory === 'delivery-search' || syncCategory === 'groupbuy-search') {
        /* 美食外卖页/特惠团购页·搜索结果瀑布流面板：进入对应频道内搜索（带关键词直达结果页瀑布流，无分类 Tab） */
        const wantScope = syncCategory === 'delivery-search' ? 'delivery' : 'groupbuy'
        if (nav.current.key !== 'search' || nav.current.scope !== wantScope) {
          nav.push({ key: 'search', scope: wantScope, keyword: '火鍋' })
        }
      } else if ((syncCategory === 'group' || syncCategory === 'delivery') && nav.current.key !== 'home') {
        nav.reset(ROOT.home)
      }
    }
  }, [syncSeq, syncCategory, nav])

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
      <span>{t(tab.labelKey, { defaultValue: tab.zh })}</span>
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
            onCategoryChange={onCategoryChange}
            syncCategory={syncCategory}
            syncSeq={syncSeq}
            deliveryMode={deliveryMode}
          />
        )
      case 'groupbuy':
        return (
          <ConsumerGroupBuy
            onBack={nav.back}
            onSearch={() => openSearch('groupbuy')}
            onOpenStore={openStore}
            onOpenOrder={() => nav.reset(ROOT.order)}
            onTabChange={onCategoryChange}
            syncTab={syncCategory}
            syncSeq={syncSeq}
            preferredLayout={preferredLayout}
            onPreferredLayoutChange={onPreferredLayoutChange}
          />
        )
      case 'delivery':
        return (
          <ConsumerDelivery
            onBack={nav.back}
            onSearch={(keyword) => openSearch('delivery', undefined, keyword)}
            onOpenStore={openStore}
            layout={deliveryPageMode}
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
            <div className="ap-empty-tip">{t('appConsumer.common.pagePending', { name: t(TABS.find((tab) => tab.key === screen.key)!.labelKey), defaultValue: '「{{name}}」頁面待設計稿' })}</div>
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
          syncFeed={syncCategory === 'search-group' ? 'groupbuy' : syncCategory === 'search-delivery' ? 'delivery' : undefined}
          syncSeq={syncSeq}
          onBack={nav.back}
          onOpenStore={openStore}
          onSearchGlobal={(keyword) => nav.push({ key: 'search', scope: 'global', keyword })}
          onAddToCart={addToCart}
        />
      )}

      {/* 回到頂部（悬浮在 Tab 之上；搜索覆盖层打开时隐藏） */}
      {!isSearch && <button type="button" className="apc-to-top" aria-label={t('appConsumer.common.toTop', { defaultValue: '回到頂部' })}>↑</button>}

      {isRoot && (
        <div className="ap-tabbar apc-tabbar">
          {TABS.slice(0, 2).map(renderTab)}
          {/* 中间「賣閒置」悬浮钮（设计稿：凸出在底栏之上） */}
          <button type="button" className="apc-fab" aria-label={t('appConsumer.common.sellIdle', { defaultValue: '賣閒置' })}>
            <span className="apc-fab-ico" aria-hidden="true">🐝</span>
            <span className="apc-fab-label">{t('appConsumer.common.sellIdle', { defaultValue: '賣閒置' })}</span>
          </button>
          {TABS.slice(2).map(renderTab)}
        </div>
      )}
    </div>
  )
}
