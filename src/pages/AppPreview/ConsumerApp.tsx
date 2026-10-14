/**
 * 用户端 APP 根组件
 *
 * 屏幕栈：底部四 Tab（首頁 / 神會員 / 訂單 / 我的）为根屏，可 push 子页（如 特價團購）。
 * 复用 nav.ts 的 useMobileNav：它已把栈深桥接浏览器 history，真机 Android 返回键 / iOS 后退
 * 与机身内「‹ 返回」等价；Tab 切换用 reset 回到根屏。
 *
 * 说明：消费者侧暂无对应后端只读接口，各页先用占位数据渲染版式，待接口与设计切图接入后替换。
 */
import ConsumerHome from './ConsumerHome'
import ConsumerGroupBuy from './ConsumerGroupBuy'
import ConsumerDelivery from './ConsumerDelivery'
import ConsumerProfile from './ConsumerProfile'
import { useMobileNav } from './nav'

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

const ROOT: Record<RootKey, ConsumerScreen> = {
  home: { key: 'home' },
  vip: { key: 'vip' },
  order: { key: 'order' },
  mine: { key: 'mine' },
}

export default function ConsumerApp() {
  const nav = useMobileNav<ConsumerScreen>(ROOT.home)
  const { current } = nav
  const isRoot = TABS.some((t) => t.key === current.key)

  const renderTab = (t: (typeof TABS)[number]) => (
    <button
      key={t.key}
      type="button"
      className={`ap-tab${current.key === t.key ? ' is-active' : ''}`}
      onClick={() => nav.reset(ROOT[t.key])}
    >
      <span className="ap-tab-icon" aria-hidden="true">{t.icon}</span>
      <span>{t.label}</span>
    </button>
  )

  return (
    <div className="ap-screen apc-root">
      {current.key === 'home' && (
        <ConsumerHome
          onOpenGroupBuy={() => nav.push({ key: 'groupbuy' })}
          onOpenDelivery={() => nav.push({ key: 'delivery' })}
        />
      )}
      {current.key === 'groupbuy' && <ConsumerGroupBuy onBack={nav.back} />}
      {current.key === 'delivery' && <ConsumerDelivery onBack={nav.back} />}
      {current.key === 'mine' && <ConsumerProfile />}
      {(current.key === 'vip' || current.key === 'order') && (
        <div className="ap-body">
          <div className="ap-empty-tip">「{TABS.find((t) => t.key === current.key)?.label}」頁面待設計稿</div>
        </div>
      )}

      {/* 回到頂部（悬浮在 Tab 之上） */}
      <button type="button" className="apc-to-top" aria-label="回到頂部">↑</button>

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
