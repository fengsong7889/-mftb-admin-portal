/**
 * MFOOD APP 根组件
 *
 * 屏幕栈：底部五 Tab（首頁 / 團購 / 外賣 / 超市 / 我的）为根屏。
 * 通过 ?app=mfood 进入，与商家端/閃蜂用户端同级。
 */
import { useTranslation } from 'react-i18next'
import MfoodHome from './MfoodHome'

type RootKey = 'home' | 'group' | 'delivery' | 'market' | 'mine'

const TABS: { key: RootKey; icon: string; zh: string }[] = [
  { key: 'home', icon: '😊', zh: '首頁' },
  { key: 'group', icon: '⚡', zh: '團購' },
  { key: 'delivery', icon: '🛵', zh: '外賣' },
  { key: 'market', icon: '🛒', zh: '超市' },
  { key: 'mine', icon: '😊', zh: '我的' },
]

export default function MfoodApp({ onCategoryChange, syncCategory, syncSeq, deliveryMode }: {
  onCategoryChange?: (tab: string) => void
  /** 右侧说明面板 Tab 下发的分类同步命令（syncSeq 自增时执行） */
  syncCategory?: string
  syncSeq?: number
  /** 外卖瀑布流展示模式（说明面板切换器下发；两台手机同步） */
  deliveryMode?: 'list' | 'card'
}) {
  const { t } = useTranslation()

  return (
    <div className="ap-screen apm-root">
      <MfoodHome onCategoryChange={onCategoryChange} syncCategory={syncCategory} syncSeq={syncSeq} deliveryMode={deliveryMode} />

      {/* 底部 Tab 栏 */}
      <div className="ap-tabbar apm-tabbar">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            className={`apm-tab-item${tab.key === 'home' ? ' is-active' : ''}`}
          >
            <span className="apm-tab-icon" aria-hidden="true">{tab.icon}</span>
            <span>{t(`appConsumer.tab.${tab.key}`, { defaultValue: tab.zh })}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
