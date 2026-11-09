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

  /* 壳外说明面板同步命令：只在 syncSeq 变化时执行；preferred/page-group → 團購根屏，
     delivery-page（美食外卖页说明面板）与首页两类 → home 之外的对应根屏（delivery-page → 美食外賣频道页）。
     注意：syncCategory 必须直接透传给 MfoodGroupBuy（不得经派生 state 中转）——
     中转会晚一帧到达，子组件的 syncSeq 守卫会在 syncTab 还是旧值时先消费掉 seq，导致命令丢失 */
  const syncSeqRef = useRef(syncSeq ?? 0)
  useEffect(() => {
    if ((syncSeq ?? 0) !== syncSeqRef.current) {
      syncSeqRef.current = syncSeq ?? 0
      if (syncCategory === 'preferred' || syncCategory === 'page-group' || syncCategory === 'filter') setRoot('group')
      else if (syncCategory === 'delivery-page') setRoot('delivery')
      else if (syncCategory === 'group' || syncCategory === 'delivery') setRoot('home')
    }
  }, [syncSeq, syncCategory])

  return (
    <div className="ap-screen apm-root">
      {root === 'group'
        ? (
            <MfoodGroupBuy
              onBack={() => setRoot('home')}
              onTabChange={onCategoryChange}
              syncTab={syncCategory}
              syncSeq={syncSeq}
              preferredLayout={preferredLayout}
              onPreferredLayoutChange={onPreferredLayoutChange}
            />
          )
        : root === 'delivery'
          ? <MfoodDelivery layout={deliveryPageMode} />
          : (
              <MfoodHome
                onCategoryChange={onCategoryChange}
                syncCategory={syncCategory}
                syncSeq={syncSeq}
                deliveryMode={deliveryMode}
                onOpenGroupBuy={() => setRoot('group')}
                onOpenDelivery={() => setRoot('delivery')}
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
