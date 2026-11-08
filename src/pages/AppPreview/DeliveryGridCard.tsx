/**
 * Copyright (c) 2026 fengsong7889. All Rights Reserved.
 *
 * 本文件为「MFTB 企业一体化管理平台软件」的组成部分。
 * 未经著作权人书面许可，不得使用、复制、修改、再分发或用于任何商业目的。
 * 完整许可条款见仓库根目录 LICENSE 文件。
 */

/**
 * 外卖瀑布流 · 卡片模式（一行两店精简卡片，閃蜂/MFOOD 共用，brand 区分品牌元素）
 *
 * 由说明面板「展示模式」切换器驱动（DualView 下发，两台手机同步切换）：
 *   - 大封面图 + 左下角「外賣/自取 + 距离 | 时间」叠加条
 *   - 门店名称 → 评分 ｜ 配送类型/支持自取 → 红包券行（勁爆券/神會員 + 最多 2 张券）
 *
 * 与列表模式共用同一批 SpecField 锚点 id：封面图 15 / 名称 1 / 评分 4 /
 * 时间距离 8 / 配送类型 14 / 勁爆券·神會員 16 / 券行 12；
 * 卡片模式不渲染的字段（起送/減配、準時寶、营业状态、标签栏、红包展开区）无锚点，悬停不高亮。
 * 类名前缀 apw-grid-（外賣瀑布流卡片模式），样式全部走语义令牌（不新增裸色值）。
 */
import { SpecField } from './SpecHighlight'
import BrandCover from './BrandCover'

/** 卡片模式门店数据（閃蜂 DeliveryStore / MFOOD MfoodStore 的公共子集） */
export interface DeliveryGridStore {
  name: string
  image: string
  rating: string
  deliveryType: 'platform' | 'self' | 'pickup'
  distance?: string
  deliveryTime: string
  pickupDiscount?: string
  merchantId: string
  memberTags: readonly { kind: string; text: string }[]
}

const TYPE_TEXT: Record<'bee' | 'mfood', string> = {
  bee: '閃蜂送',
  mfood: 'mFood送',
}

export default function DeliveryGridCard({ brand, store, onOpenStore }: {
  brand: 'bee' | 'mfood'
  store: DeliveryGridStore
  onOpenStore?: (merchantId: string) => void
}) {
  /* 券行：勁爆券/神會員（id16）+ 最多 2 张券（id12）；point/gray/plain 属「其它」类目，卡片模式不展示 */
  const shen = store.memberTags.find((m) => m.kind === 'shen')
  const coupons = store.memberTags
    .filter((m) => m.kind === 'green' || m.kind === 'red' || m.kind === 'coupon')
    .slice(0, 2)

  const isPickup = store.deliveryType === 'pickup'
  const typeText = isPickup
    ? (store.pickupDiscount ? `自取${store.pickupDiscount}` : '支持自取')
    : store.deliveryType === 'self' ? '自送' : TYPE_TEXT[brand]
  const overlayType = isPickup ? '自取' : '外賣'
  const overlayInfo = [store.distance, store.deliveryTime].filter(Boolean).join(' | ')

  return (
    <div className="apw-grid-card" onClick={() => onOpenStore?.(store.merchantId)}>
      <SpecField panel="delivery" id={15}>
        <div className="apw-grid-img">
          <BrandCover seed={store.merchantId} name={store.name} />
          <div className="apw-grid-overlay">
            <span className="apw-grid-overlay-type">{overlayType}</span>
            <SpecField panel="delivery" id={8}>
              <span className="apw-grid-overlay-info">{overlayInfo}</span>
            </SpecField>
          </div>
        </div>
      </SpecField>
      <div className="apw-grid-body">
        <SpecField panel="delivery" id={1}>
          <div className="apw-grid-name">{store.name}</div>
        </SpecField>
        <div className="apw-grid-meta">
          <SpecField panel="delivery" id={4}>
            <span className="apw-grid-rating">★ {store.rating}</span>
          </SpecField>
          <span className="apw-grid-meta-divider" aria-hidden="true">｜</span>
          <SpecField panel="delivery" id={14}>
            <span>{typeText}</span>
          </SpecField>
        </div>
        <div className="apw-grid-pills">
          {shen && (
            <SpecField panel="delivery" id={16}>
              {brand === 'mfood' ? (
                <span className="apw-pill-group">
                  <span className="apw-pill apw-pill-bao">
                    <span className="apw-pill-bao-ico" aria-hidden="true">🧨</span>
                    勁爆券
                  </span>
                  <span className="apw-pill apw-pill-bao-text">{shen.text}</span>
                </span>
              ) : (
                <span className="apw-pill apw-pill-shen">
                  <span className="apw-pill-crown" aria-hidden="true">👑</span>
                  <span className="apw-pill-shen-name">神會員</span>
                  {shen.text}
                </span>
              )}
            </SpecField>
          )}
          {coupons.map((m, i) => (
            <SpecField key={`${m.kind}-${m.text}-${i}`} panel="delivery" id={12}>
              <span className={`apw-pill apw-pill-${m.kind}`}>{m.text}</span>
            </SpecField>
          ))}
        </div>
      </div>
    </div>
  )
}
