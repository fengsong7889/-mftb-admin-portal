/**
 * Copyright (c) 2026 fengsong7889. All Rights Reserved.
 *
 * 本文件为「MFTB 企业一体化管理平台软件」的组成部分。
 * 未经著作权人书面许可，不得使用、复制、修改、再分发或用于任何商业目的。
 * 完整许可条款见仓库根目录 LICENSE 文件。
 */
/* eslint-disable react-refresh/only-export-components -- 卡片适配组件与标签召回函数同文件，避免两套真源 */

/** 商家卡片操作适配层：按品牌/模式选原卡片，再统一挂长按浮层。 */
import DeliveryGridCard from './DeliveryGridCard'
import DeliveryLargeCard from './DeliveryLargeCard'
import DeliveryStoreCard, { type DeliveryStore } from './DeliveryStoreCard'
import MerchantLongPress, { type MerchantActionLayout } from './MerchantLongPress'
import MfoodDeliveryLargeCard from './MfoodDeliveryLargeCard'
import MfoodDeliveryStoreCard, { type MfoodStore } from './MfoodDeliveryStoreCard'
import PreferredMerchantCard, { type PreferredBrand, type PreferredLayout, type PreferredMerchant } from './PreferredMerchantCard'

export type DeliveryMerchantStore = DeliveryStore | MfoodStore

/** 外卖商家标签召回口径：运营标签 + 品质/新店/准时宝/配送方式。 */
export function deliveryMerchantTags(store: Pick<DeliveryStore, 'tags' | 'brandTag' | 'isNew' | 'punctual' | 'deliveryType'>) {
  return [
    ...store.tags,
    ...(store.brandTag ? [store.brandTag] : []),
    ...(store.isNew ? ['新店'] : []),
    ...(store.punctual ? ['準時寶'] : []),
    store.deliveryType === 'pickup' ? '到店自取' : store.deliveryType === 'self' ? '商家送' : '平台送',
  ]
}

/** 优选/附近好店标签召回口径：末级品类 + 行政商圈 + 新店标记。 */
export function preferredMerchantTags(item: PreferredMerchant) {
  return [
    ...item.cateArea.split(/[·・]/).map((tag) => tag.trim()).filter(Boolean),
    ...(item.isNew ? ['新店'] : []),
  ]
}

export function DeliveryMerchantCard({
  brand,
  store,
  layout,
  onOpenStore,
  demo = false,
  onFindSimilar,
}: {
  brand: PreferredBrand
  store: DeliveryMerchantStore
  layout: MerchantActionLayout
  onOpenStore?: (merchantId: string) => void
  /** 每个目标瀑布流的首个商家作为长按操作演示位 */
  demo?: boolean
  onFindSimilar?: (merchantId: string) => void
}) {
  const card = layout === 'large'
    ? brand === 'mfood'
      ? <MfoodDeliveryLargeCard store={store as MfoodStore} onOpenStore={onOpenStore} />
      : <DeliveryLargeCard store={store as DeliveryStore} onOpenStore={onOpenStore} />
    : layout === 'card'
      ? <DeliveryGridCard brand={brand} store={store} onOpenStore={onOpenStore} />
      : brand === 'mfood'
        ? <MfoodDeliveryStoreCard store={store as MfoodStore} onOpenStore={onOpenStore} />
        : <DeliveryStoreCard store={store as DeliveryStore} onOpenStore={onOpenStore} />

  return (
    <MerchantLongPress
      merchantId={store.merchantId}
      merchantName={store.name}
      layout={layout}
      specPanel="delivery"
      initiallyOpen={demo}
      onFindSimilar={onFindSimilar}
    >
      {card}
    </MerchantLongPress>
  )
}

export function PreferredMerchantActionCard({
  item,
  layout,
  brand,
  onOpenStore,
  demo = false,
  onFindSimilar,
}: {
  item: PreferredMerchant
  layout: PreferredLayout
  brand: PreferredBrand
  onOpenStore?: (merchantId: string) => void
  /** 每个目标瀑布流的首个商家作为长按操作演示位 */
  demo?: boolean
  onFindSimilar?: (merchantId: string) => void
}) {
  return (
    <MerchantLongPress
      merchantId={item.key}
      merchantName={item.name}
      layout={layout}
      specPanel="preferred"
      initiallyOpen={demo}
      onFindSimilar={onFindSimilar}
    >
      <PreferredMerchantCard item={item} layout={layout} brand={brand} onOpenStore={onOpenStore} />
    </MerchantLongPress>
  )
}
