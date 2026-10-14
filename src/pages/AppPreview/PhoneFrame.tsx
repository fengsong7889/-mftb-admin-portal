/**
 * 手机设备框（device mockup）
 *
 * 样式对齐「广告推荐系统 → 瀑布流策略 → 新增配置」页右侧的手机壳
 * （src/pages/waterfallConfig/WaterfallPreview.tsx）：蓝灰金属机身 + 侧边按键 +
 * 金属高光描边 + 黑色屏幕边框 + 灵动岛 + SVG 状态图标。
 *
 * 桌面端把原型包在机身里，让后台用户一眼看出「这是 APP」；内容视口在屏幕内自行滚动。
 * 真机访问时由 appPreview.css 的单条 @media 去掉机身装饰、铺满全屏（见该文件例外登记）。
 */
import { useEffect, useState, type ReactNode } from 'react'

/** 状态栏时钟：贴近真机顶部时间，独立持有定时器，避免每秒重渲染整棵树 */
function StatusBarClock() {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 15000)
    return () => window.clearInterval(timer)
  }, [])
  const hh = String(now.getHours()).padStart(2, '0')
  const mm = String(now.getMinutes()).padStart(2, '0')
  return <span className="ap-statusbar-time">{`${hh}:${mm}`}</span>
}

export default function PhoneFrame({ children }: { children: ReactNode }) {
  return (
    <div className="ap-phone">
      {/* 侧边按键 */}
      <span className="ap-phone-side ap-phone-side--l1" aria-hidden="true" />
      <span className="ap-phone-side ap-phone-side--l2" aria-hidden="true" />
      <span className="ap-phone-side ap-phone-side--l3" aria-hidden="true" />
      <span className="ap-phone-side ap-phone-side--r1" aria-hidden="true" />
      {/* 金属边框高光描边 */}
      <span className="ap-phone-edge" aria-hidden="true" />

      {/* 黑色屏幕边框 + 屏幕 */}
      <div className="ap-phone-bezel">
        <div className="ap-phone-screen">
          <div className="ap-statusbar">
            <StatusBarClock />
            <span className="ap-phone-island" aria-hidden="true" />
            <span className="ap-statusbar-right" aria-hidden="true">
              <svg width="17" height="12" viewBox="0 0 17 12" fill="none">
                <rect x="0" y="9" width="3" height="3" rx="0.5" fill="#000" />
                <rect x="4.5" y="6" width="3" height="6" rx="0.5" fill="#000" />
                <rect x="9" y="3" width="3" height="9" rx="0.5" fill="#000" />
                <rect x="13.5" y="0" width="3" height="12" rx="0.5" fill="#000" />
              </svg>
              <svg width="16" height="12" viewBox="0 0 16 12" fill="none">
                <circle cx="8" cy="10" r="1.5" fill="#000" />
                <path d="M4.5 8c1-1.2 2.2-1.8 3.5-1.8s2.5.6 3.5 1.8" stroke="#000" strokeWidth="1.3" strokeLinecap="round" />
                <path d="M1.8 5.5C3.5 3.5 5.6 2.5 8 2.5s4.5 1 6.2 3" stroke="#000" strokeWidth="1.3" strokeLinecap="round" />
              </svg>
              <svg width="27" height="13" viewBox="0 0 27 13" fill="none">
                <rect x="0.5" y="0.5" width="22" height="12" rx="2.5" stroke="#000" strokeOpacity="0.35" />
                <rect x="2" y="2" width="19" height="9" rx="1.5" fill="#000" />
                <path d="M24 4.5v4a2 2 0 0 0 0-4z" fill="#000" fillOpacity="0.4" />
              </svg>
            </span>
          </div>
          <div className="ap-viewport">{children}</div>
        </div>
      </div>
    </div>
  )
}
