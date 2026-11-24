/**
 * Copyright (c) 2026 fengsong7889. All Rights Reserved.
 *
 * 本文件为「MFTB 企业一体化管理平台软件」的组成部分。
 * 未经著作权人书面许可，不得使用、复制、修改、再分发或用于任何商业目的。
 * 完整许可条款见仓库根目录 LICENSE 文件。
 */

/** 找相似瀑布流：复用原商家卡与长按操作，返回后回到来源瀑布流。 */
import { DeliveryMerchantCard, PreferredMerchantActionCard, type DeliveryMerchantStore } from './MerchantActionCards'
import type { MerchantActionLayout } from './MerchantLongPress'
import type { PreferredBrand, PreferredMerchant } from './PreferredMerchantCard'

export default function SimilarMerchantView({
  brand,
  anchorName,
  layout,
  stores,
  preferred,
  onBack,
  onOpenStore,
  onFindSimilar,
}: {
  brand: PreferredBrand
  anchorName: string
  layout: MerchantActionLayout
  stores?: readonly DeliveryMerchantStore[]
  preferred?: readonly PreferredMerchant[]
  onBack: () => void
  onOpenStore?: (merchantId: string) => void
  onFindSimilar?: (merchantId: string) => void
}) {
  const deliveryCount = stores?.length ?? 0
  const preferredCount = preferred?.length ?? 0
  const count = deliveryCount + preferredCount
  const preferredLayout = layout === 'large' ? 'large' : 'small'

  return (
    <div className="ap-screen ap-similar-screen">
      <div className="ap-body ap-similar-body">
        <header className="ap-similar-header">
          <button type="button" className="ap-similar-back" aria-label="返回" onClick={onBack}>←</button>
          <div className="ap-similar-heading">
            <b>查找相似</b>
            <span title={anchorName}>{anchorName}</span>
          </div>
        </header>
        <div className="ap-similar-summary">
          <span>根据商家标签匹配相似商家</span>
          <em>{count} 家</em>
        </div>
        {count === 0 ? (
          <div className="ap-similar-empty">
            <span aria-hidden="true">🔍</span>
            <b>暂未找到标签相似的商家</b>
            <p>返回后可选择其他商家再试</p>
          </div>
        ) : stores ? (
          <div className={layout === 'card' ? 'apw-grid ap-similar-grid' : 'apf-feed-list ap-similar-feed'}>
            {stores.map((store) => (
              <DeliveryMerchantCard
                key={store.merchantId}
                brand={brand}
                store={store}
                layout={layout}
                onOpenStore={onOpenStore}
                onFindSimilar={onFindSimilar}
              />
            ))}
          </div>
        ) : (
          <div className="apf-feed-list ap-similar-feed">
            {preferred?.map((item) => (
              <PreferredMerchantActionCard
                key={item.key}
                brand={brand}
                item={item}
                layout={preferredLayout}
                onOpenStore={onOpenStore ? () => onOpenStore(item.key) : undefined}
                onFindSimilar={onFindSimilar}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
