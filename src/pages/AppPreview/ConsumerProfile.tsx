/**
 * 用户端 APP · 我的（个人中心）（按设计稿还原，纯前端静态原型）
 *
 * 入口：首页底部 Tab「我的」进入（ConsumerApp 根屏之一）。
 * 结构：深紫头部(头像+等级+昵称+右上三图标) → 神會員卡(成长值+三栏权益) →
 *       我的訂單(5 宫格) → 三张张数卡 → 两张促销卡 → 活动 Banner → 服務設置(2×4 宫格)。
 * 底栏由 ConsumerApp 统一渲染（含中间「賣閒置」悬浮钮）。
 *
 * 说明：界面文案走 appConsumer 命名空间；昵称/成长值/张数等为占位数据，不进入语言包。
 * 下方 *_LABEL_KEY 把存量 label 字段映射到 i18n key，label 本身保留作兜底真值——
 * 这样既不动存量繁中码位（编辑链路会把部分字归一化成简体），又能逐页推进 i18n。
 */
import { useTranslation } from 'react-i18next'

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

/** 存量 label → i18n key 映射（key 名保持 ASCII，不动原繁中字段） */
const ORDER_LABEL_KEY: Record<string, string> = {
  all: 'appConsumer.profile.order.all',
  pay: 'appConsumer.profile.order.toPay',
  use: 'appConsumer.profile.order.toUse',
  review: 'appConsumer.profile.order.toReview',
  refund: 'appConsumer.profile.order.refund',
}

const COUNT_LABEL_KEY: Record<string, string> = {
  redpack: 'appConsumer.profile.count.redpack',
  voucher: 'appConsumer.profile.count.voucher',
  cut: 'appConsumer.profile.count.cut',
}

const SETTING_LABEL_KEY: Record<string, string> = {
  addr: 'appConsumer.profile.setting.address',
  fav: 'appConsumer.profile.setting.favorite',
  bank: 'appConsumer.profile.setting.bankCard',
  review: 'appConsumer.profile.setting.review',
  feedback: 'appConsumer.profile.setting.feedback',
  join: 'appConsumer.profile.setting.merchantApply',
  lang: 'appConsumer.profile.setting.language',
  setting: 'appConsumer.profile.setting.system',
}

export default function ConsumerProfile() {
  const { t } = useTranslation()
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
            <span className="apf-level"><i aria-hidden="true">💎</i>{t('appConsumer.profile.levelDiamond', { defaultValue: '鑽石' })}</span>
            <span className="apf-name">小貝殼 Barber <i aria-hidden="true">›</i></span>
          </span>
          <span className="apf-actions">
            <button type="button" className="apf-action" aria-label={t('appConsumer.profile.actionMessage', { defaultValue: '訊息' })}>✉</button>
            <button type="button" className="apf-action" aria-label={t('appConsumer.profile.actionData', { defaultValue: '數據' })}>▤</button>
            <button type="button" className="apf-action" aria-label={t('appConsumer.common.more', { defaultValue: '更多' })}>◎</button>
          </span>
        </div>

        {/* 神會員卡 */}
        <div className="apf-vip">
          <div className="apf-vip-head">
            <span className="apf-vip-title"><i aria-hidden="true">👑</i>{t('appConsumer.common.vipCard', { defaultValue: '神會員' })}</span>
            <span className="apf-vip-growth">{t('appConsumer.profile.growthLabel', { defaultValue: '成長值' })} <b>240</b>/1000</span>
            <span className="apf-vip-bar" aria-hidden="true"><i style={{ width: '24%' }} /></span>
            <button type="button" className="apf-vip-center">{t('appConsumer.common.memberCenter', { defaultValue: '會員中心' })} ›</button>
          </div>
          <div className="apf-vip-cols">
            <div className="apf-vip-col">
              <span className="apf-vip-col-title">{t('appConsumer.profile.couponDelivery', { defaultValue: '外賣神券' })}</span>
              <span className="apf-vip-col-art">
                <span className="apf-redpack"><b>$30</b><i>{t('appConsumer.common.couponMinSpend', { price: 60, defaultValue: '滿${{price}}可用' })}</i></span>
              </span>
              <span className="apf-vip-col-link">{t('appConsumer.profile.maxUpTo', { price: '$30', defaultValue: '最高膨至{{price}} ›' })}</span>
            </div>
            <div className="apf-vip-col">
              <span className="apf-vip-col-title">{t('appConsumer.profile.couponBrand', { defaultValue: '大牌專屬券' })}</span>
              <span className="apf-vip-col-art">
                <span className="apf-brands">
                  <i aria-hidden="true">🍔</i><i aria-hidden="true">🍟</i><i aria-hidden="true">🥤</i><i aria-hidden="true">🍗</i>
                </span>
              </span>
              <span className="apf-vip-col-link">{t('appConsumer.profile.maxUpTo', { price: '$30', defaultValue: '最高膨至{{price}} ›' })}</span>
            </div>
            <div className="apf-vip-col">
              <span className="apf-vip-col-title">{t('appConsumer.profile.memberBenefits', { defaultValue: '會員權益' })}</span>
              <span className="apf-vip-col-art">
                <span className="apf-basket" aria-hidden="true">🍔🥤</span>
              </span>
              <span className="apf-vip-col-link">{t('appConsumer.profile.maxUpTo', { price: '$30', defaultValue: '最高膨至{{price}} ›' })}</span>
            </div>
          </div>
        </div>
      </div>

      {/* 我的訂單 */}
      <div className="apf-card">
        <div className="apf-card-head">
          <span className="apf-card-title">{t('appConsumer.profile.myOrders', { defaultValue: '我的訂單' })}</span>
          <span className="apf-orders-tag">Orders</span>
        </div>
        <div className="apf-orders">
          {ORDERS.map((o) => (
            <button key={o.key} type="button" className="apf-order">
              <span className="apf-order-ico" aria-hidden="true">{o.icon}</span>
              <span className="apf-order-label">{t(ORDER_LABEL_KEY[o.key], { defaultValue: o.label })}</span>
            </button>
          ))}
        </div>
      </div>

      {/* 三张张数卡 */}
      <div className="apf-counts">
        {COUNTS.map((c) => (
          <button key={c.key} type="button" className="apf-count" style={{ background: c.bg }}>
            <span className="apf-count-ico" aria-hidden="true">{c.icon}</span>
            <span className="apf-count-num">{c.num}<i>{t('appConsumer.profile.unitSheet', { defaultValue: c.unit })}</i></span>
            <span className="apf-count-label">{t(COUNT_LABEL_KEY[c.key], { defaultValue: c.label })}</span>
          </button>
        ))}
      </div>

      {/* 两促销卡 */}
      <div className="apf-promos">
        <button type="button" className="apf-promo">
          <span className="apf-promo-main">
            <b>{t('appConsumer.profile.checkInTasks', { defaultValue: '簽到&任務' })}</b>
            <i>{t('appConsumer.profile.checkInHint', { defaultValue: '連續簽到領更多紅包' })}</i>
          </span>
          <span className="apf-promo-ico" aria-hidden="true">👨‍🍳</span>
        </button>
        <button type="button" className="apf-promo apf-promo--honey">
          <span className="apf-promo-main">
            <b>{t('appConsumer.profile.honeyExchange', { defaultValue: '蜂蜜兌換' })}</b>
            <i>{t('appConsumer.profile.honeyAvailable', { value: 3600, defaultValue: '可用蜂蜜 {{value}}' })}</i>
          </span>
          <span className="apf-promo-ico" aria-hidden="true">🐝</span>
        </button>
      </div>

      {/* 活动 Banner */}
      <div className="apf-banner">
        <span className="apf-banner-title">{t('appConsumer.profile.bannerLine1', { defaultValue: '快手游戏人' })}<br /><em>{t('appConsumer.profile.bannerLine2', { defaultValue: '暑假打卡' })}</em></span>
        <span className="apf-banner-ico" aria-hidden="true">🎮</span>
      </div>

      {/* 服務設置 */}
      <div className="apf-card apf-card--last">
        <div className="apf-card-head">
          <span className="apf-card-title">{t('appConsumer.profile.serviceSettings', { defaultValue: '服務設置' })}</span>
        </div>
        <div className="apf-settings">
          {SETTINGS.map((s) => (
            <button key={s.key} type="button" className="apf-setting">
              <span className="apf-setting-ico" aria-hidden="true">{s.icon}</span>
              <span className="apf-setting-label">{t(SETTING_LABEL_KEY[s.key], { defaultValue: s.label })}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
