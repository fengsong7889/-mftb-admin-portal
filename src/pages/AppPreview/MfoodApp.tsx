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

export default function MfoodApp() {
  const { t } = useTranslation()

  return (
    <div className="ap-screen apm-root">
      <MfoodHome />

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
