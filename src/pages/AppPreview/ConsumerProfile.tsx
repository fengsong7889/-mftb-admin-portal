/**
 * 用户端 APP · 我的（个人中心）（按设计稿还原，纯前端静态原型）
 *
 * 入口：首页底部 Tab「我的」进入（ConsumerApp 根屏之一）。
 * 结构：深紫头部(头像+等级+昵称+右上三图标) → 神會員卡(成长值+三栏权益) →
 *       我的訂單(5 宫格) → 三张张数卡 → 两张促销卡 → 活动 Banner → 服務設置(2×4 宫格)。
 * 底栏由 ConsumerApp 统一渲染（含中间「賣閒置」悬浮钮）。
 *
 * 说明：文案暂硬编码繁中，头像/图标用 emoji 占位，待切图与 i18n 接入后替换。
 */

const ORDERS = [
  { key: 'all', icon: '📋', label: '全部訂單' },
  { key: 'pay', icon: '💰', label: '待付款' },
  { key: 'use', icon: '🎟️', label: '待使用' },
  { key: 'review', icon: '⭐', label: '待評價' },
  { key: 'refund', icon: '💸', label: '退款' },
]

const COUNTS = [
  { key: 'redpack', num: '18', unit: '張', label: '閃蜂紅包', icon: '🧧', bg: 'linear-gradient(160deg,#7FD3FF,#3B9BFF)' },
  { key: 'voucher', num: '18', unit: '張', label: '商家代金券', icon: '🏪', bg: 'linear-gradient(160deg,#FFE07A,#FFC53D)' },
  { key: 'cut', num: '18', unit: '張', label: '立減券', icon: '％', bg: 'linear-gradient(160deg,#8FD8FF,#49A9FF)' },
]

const SETTINGS = [
  { key: 'addr', icon: '📍', label: '收貨地址' },
  { key: 'fav', icon: '⭐', label: '我的收藏' },
  { key: 'bank', icon: '💳', label: '銀行卡' },
  { key: 'review', icon: '👍', label: '我的評價' },
  { key: 'feedback', icon: '✉️', label: '意見反饋' },
  { key: 'join', icon: '🏪', label: '商家入駐' },
  { key: 'lang', icon: '🌐', label: '語言切換' },
  { key: 'setting', icon: '⚙️', label: '設置' },
]

export default function ConsumerProfile() {
  return (
    <div className="ap-body apf-body">
      {/* 深紫头部 */}
      <div className="apf-top">
        <div className="apf-user">
          <span className="apf-avatar">
            <i aria-hidden="true">👩</i>
            <em className="apf-avatar-edit" aria-hidden="true">✎</em>
          </span>
          <span className="apf-user-main">
            <span className="apf-level"><i aria-hidden="true">💎</i>鑽石</span>
            <span className="apf-name">小貝殼 Barber <i aria-hidden="true">›</i></span>
          </span>
          <span className="apf-actions">
            <button type="button" className="apf-action" aria-label="訊息">✉</button>
            <button type="button" className="apf-action" aria-label="數據">▤</button>
            <button type="button" className="apf-action" aria-label="更多">◎</button>
          </span>
        </div>

        {/* 神會員卡 */}
        <div className="apf-vip">
          <div className="apf-vip-head">
            <span className="apf-vip-title"><i aria-hidden="true">👑</i>神會員</span>
            <span className="apf-vip-growth">成長值 <b>240</b>/1000</span>
            <span className="apf-vip-bar" aria-hidden="true"><i style={{ width: '24%' }} /></span>
            <button type="button" className="apf-vip-center">會員中心 ›</button>
          </div>
          <div className="apf-vip-cols">
            <div className="apf-vip-col">
              <span className="apf-vip-col-title">外賣神券</span>
              <span className="apf-vip-col-art">
                <span className="apf-redpack"><b>$30</b><i>滿$60可用</i></span>
              </span>
              <span className="apf-vip-col-link">最高膨至$30 ›</span>
            </div>
            <div className="apf-vip-col">
              <span className="apf-vip-col-title">大牌專屬券</span>
              <span className="apf-vip-col-art">
                <span className="apf-brands">
                  <i aria-hidden="true">🍔</i><i aria-hidden="true">🍟</i><i aria-hidden="true">🥤</i><i aria-hidden="true">🍗</i>
                </span>
              </span>
              <span className="apf-vip-col-link">最高膨至$30 ›</span>
            </div>
            <div className="apf-vip-col">
              <span className="apf-vip-col-title">會員權益</span>
              <span className="apf-vip-col-art">
                <span className="apf-basket" aria-hidden="true">🍔🥤</span>
              </span>
              <span className="apf-vip-col-link">最高膨至$30 ›</span>
            </div>
          </div>
        </div>
      </div>

      {/* 我的訂單 */}
      <div className="apf-card">
        <div className="apf-card-head">
          <span className="apf-card-title">我的訂單</span>
          <span className="apf-orders-tag">Orders</span>
        </div>
        <div className="apf-orders">
          {ORDERS.map((o) => (
            <button key={o.key} type="button" className="apf-order">
              <span className="apf-order-ico" aria-hidden="true">{o.icon}</span>
              <span className="apf-order-label">{o.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* 三张张数卡 */}
      <div className="apf-counts">
        {COUNTS.map((c) => (
          <button key={c.key} type="button" className="apf-count" style={{ background: c.bg }}>
            <span className="apf-count-ico" aria-hidden="true">{c.icon}</span>
            <span className="apf-count-num">{c.num}<i>{c.unit}</i></span>
            <span className="apf-count-label">{c.label}</span>
          </button>
        ))}
      </div>

      {/* 两促销卡 */}
      <div className="apf-promos">
        <button type="button" className="apf-promo">
          <span className="apf-promo-main">
            <b>簽到&任務</b>
            <i>連續簽到領更多紅包</i>
          </span>
          <span className="apf-promo-ico" aria-hidden="true">👨‍🍳</span>
        </button>
        <button type="button" className="apf-promo apf-promo--honey">
          <span className="apf-promo-main">
            <b>蜂蜜兌換</b>
            <i>可用蜂蜜 3600</i>
          </span>
          <span className="apf-promo-ico" aria-hidden="true">🐝</span>
        </button>
      </div>

      {/* 活动 Banner */}
      <div className="apf-banner">
        <span className="apf-banner-title">快手游戏人<br /><em>暑假打卡</em></span>
        <span className="apf-banner-ico" aria-hidden="true">🎮</span>
      </div>

      {/* 服務設置 */}
      <div className="apf-card apf-card--last">
        <div className="apf-card-head">
          <span className="apf-card-title">服務設置</span>
        </div>
        <div className="apf-settings">
          {SETTINGS.map((s) => (
            <button key={s.key} type="button" className="apf-setting">
              <span className="apf-setting-ico" aria-hidden="true">{s.icon}</span>
              <span className="apf-setting-label">{s.label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
