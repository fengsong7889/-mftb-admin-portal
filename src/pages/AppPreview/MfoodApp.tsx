/**
 * MFOOD APP 根组件
 *
 * 屏幕栈：底部五 Tab（首頁 / 團購 / 外賣 / 超市 / 我的）为根屏；
 * 團購根屏 = 特惠團購页（首页分类宫格「特價團購」或底部 Tab「團購」进入）。
 * 通过 ?app=mfood 进入，与商家端/閃蜂用户端同级。
 */
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import MfoodHome from './MfoodHome'
import MfoodGroupBuy from './MfoodGroupBuy'
import MfoodDelivery from './MfoodDelivery'
import ConsumerSearch from './ConsumerSearch'
import type { SearchScope } from './consumerSearchData'

type RootKey = 'home' | 'group' | 'delivery' | 'market' | 'mine'

const TABS: { key: RootKey; icon: string; zh: string }[] = [
  { key: 'home', icon: '😊', zh: '首頁' },
  { key: 'group', icon: '⚡', zh: '團購' },
  { key: 'delivery', icon: '🛵', zh: '外賣' },
  { key: 'market', icon: '🛒', zh: '超市' },
  { key: 'mine', icon: '😊', zh: '我的' },
]

export default function MfoodApp({ onCategoryChange, syncCategory, syncSeq, deliveryMode, deliveryPageMode, preferredLayout, onPreferredLayoutChange }: {
  onCategoryChange?: (tab: string) => void
  /** 右侧说明面板 Tab 下发的分类同步命令（syncSeq 自增时执行） */
  syncCategory?: string
  syncSeq?: number
  /** 外卖瀑布流展示模式（说明面板切换器下发；两台手机同步；large=大图模式 MFOOD 亦实现，样式与閃蜂一致） */
  deliveryMode?: 'list' | 'card' | 'large'
  /** 美食外卖频道页瀑布流大小图模式（说明面板切换器下发；閃蜂/MFOOD 两台手机同步） */
  deliveryPageMode?: 'small' | 'large'
  /** 優選商家/附近好店列表大小圖模式（说明面板切换器下发；两台手机同步） */
  preferredLayout?: 'small' | 'large'
  /** 篩選面板内大小图切换上报（说明面板闭环后下发另一台手机） */
  onPreferredLayoutChange?: (mode: 'small' | 'large') => void
}) {
  const { t } = useTranslation()
  /** 当前根屏：仅 home / group 有页面，其余 Tab 暂回首页（原型口径） */
  const [root, setRoot] = useState<RootKey>('home')
  /** 搜索覆盖层（同閃蜂壳结构）：null=关闭；scope 区分入口——首页=global / 美食外賣频道=delivery / 特惠團購频道=groupbuy
   *  （频道内搜索结果页为对应瀑布流且无分类切换 Tab，与閃蜂频道内搜索同口径） */
  const [searchScope, setSearchScope] = useState<SearchScope | null>(null)
  /** 面板搜索命令携带的关键词（同閃蜂 nav push 的「火鍋」口径，直达结果页瀑布流）；壳内搜索框手动进入不携带 */
  const [searchKeyword, setSearchKeyword] = useState<string | undefined>(undefined)

  /* 壳外说明面板同步命令：只在 syncSeq 变化时执行；preferred/page-group → 團購根屏，
     delivery-page（美食外卖页说明面板）与首页两类 → home 之外的对应根屏（delivery-page → 美食外賣频道页）；
     search-delivery/search-group → 打开搜索结果页（分类由 ConsumerSearch 按 syncFeed 切换）。
     注意：syncCategory 必须直接透传给 MfoodGroupBuy（不得经派生 state 中转）——
     中转会晚一帧到达，子组件的 syncSeq 守卫会在 syncTab 还是旧值时先消费掉 seq，导致命令丢失 */
  const syncSeqRef = useRef(syncSeq ?? 0)
  useEffect(() => {
    if ((syncSeq ?? 0) !== syncSeqRef.current) {
      syncSeqRef.current = syncSeq ?? 0
      /* 搜索是独立覆盖层（不在根屏状态里）：非搜索类命令必须先关覆盖层，否则根屏切了用户仍看到搜索页（MFOOD 不跟随的根因） */
      const isSearchCmd = syncCategory === 'search-delivery' || syncCategory === 'search-group'
        || syncCategory === 'delivery-search' || syncCategory === 'groupbuy-search'
      if (!isSearchCmd) {
        setSearchScope(null)
        setSearchKeyword(undefined)
      }
      if (syncCategory === 'preferred' || syncCategory === 'page-group' || syncCategory === 'filter') setRoot('group')
      else if (syncCategory === 'delivery-page') setRoot('delivery')
      else if (syncCategory === 'search-delivery' || syncCategory === 'search-group') {
        setSearchScope('global')
        setSearchKeyword('火鍋')
      } else if (syncCategory === 'delivery-search' || syncCategory === 'groupbuy-search') {
        /* 美食外卖页/特惠团购页·搜索结果瀑布流面板：进入对应频道内搜索（带关键词直达结果页瀑布流，无分类 Tab） */
        setSearchScope(syncCategory === 'delivery-search' ? 'delivery' : 'groupbuy')
        setSearchKeyword('火鍋')
      } else if (syncCategory === 'group' || syncCategory === 'delivery') setRoot('home')
    }
  }, [syncSeq, syncCategory])

  return (
    <div className="ap-screen apm-root">
      {root === 'group'
        ? (
            <MfoodGroupBuy
              onBack={() => setRoot('home')}
              onSearch={() => { setSearchScope('groupbuy'); setSearchKeyword(undefined) }}
              onTabChange={onCategoryChange}
              syncTab={syncCategory}
              syncSeq={syncSeq}
              preferredLayout={preferredLayout}
              onPreferredLayoutChange={onPreferredLayoutChange}
            />
          )
        : root === 'delivery'
          ? <MfoodDelivery layout={deliveryPageMode} onSearch={() => { setSearchScope('delivery'); setSearchKeyword(undefined) }} />
          : (
              <MfoodHome
                onSearch={() => { setSearchScope('global'); setSearchKeyword(undefined) }}
                onCategoryChange={onCategoryChange}
                syncCategory={syncCategory}
                syncSeq={syncSeq}
                deliveryMode={deliveryMode}
                onOpenGroupBuy={() => setRoot('group')}
                onOpenDelivery={() => setRoot('delivery')}
              />
            )}

      {/* 搜索覆盖层（压在来源页之上，同閃蜂壳结构）：MFOOD 品牌瀑布流（勁爆券皮门店卡 / 附近好店卡）；
          key 按 scope+关键词重挂载：面板命令携带关键词直达结果页（同閃蜂「火鍋」口径），手动进入落激活页 */}
      {searchScope && (
        <ConsumerSearch
          key={`${searchScope}:${searchKeyword ?? ''}`}
          brand="mfood"
          scope={searchScope}
          initialKeyword={searchKeyword}
          syncFeed={syncCategory === 'search-group' ? 'groupbuy' : syncCategory === 'search-delivery' ? 'delivery' : undefined}
          syncSeq={syncSeq}
          onBack={() => setSearchScope(null)}
        />
      )}

      {/* 底部 Tab 栏 */}
      <div className="ap-tabbar apm-tabbar">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            className={`apm-tab-item${root === tab.key ? ' is-active' : ''}`}
            onClick={() => setRoot(tab.key === 'group' ? 'group' : tab.key === 'delivery' ? 'delivery' : 'home')}
          >
            <span className="apm-tab-icon" aria-hidden="true">{tab.icon}</span>
            <span>{t(`appConsumer.tab.${tab.key}`, { defaultValue: tab.zh })}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
