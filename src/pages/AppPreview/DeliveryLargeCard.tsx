/**
 * Copyright (c) 2026 fengsong7889. All Rights Reserved.
 *
 * 本文件为「MFTB 企业一体化管理平台软件」的组成部分。
 * 未经著作权人书面许可，不得使用、复制、修改、再分发或用于任何商业目的。
 * 完整许可条款见仓库根目录 LICENSE 文件。
 */

/**
 * 外卖瀑布流 · 大图模式卡片（閃蜂首页，草图「大圖」口径还原）
 *
 * 由说明面板「展示模式」切换器下发 deliveryMode='large' 时启用；规则与特惠团购页
 * 優選商家/附近門店的大圖模式一致：顶部门店大图出血（封面/视频）→ 下方信息区与
 * 列表模式（DeliveryStoreCard）同款组件与配色——橙星橙分 / 蓝框準時寶 / 橙框配送类型 /
 * 浅橙底深橙字广告标签 / 四色渐变品质角标 / 減配渐变角标 / 打烊倒计时 / 状态横幅 /
 * 红包区共用 DeliveryMemberBlock；相比列表模式仅新增顶部大图展示与 logo 行。
 *
 * 封面图/视频（spec id20，大图模式专属新增行）：商家上传了视频则显示并自动播放视频，
 * 未上传视频则显示大图封面兜底（必传）；原型以 coverVideo 标记 + 播放角标示意。
 *
 * 锚点与列表/卡片模式共用同一批 spec id（说明表不分模式）：
 *   id20 封面图/视频（大图专属）/ id15 门店 logo（新店角标 id2 嵌于 logo 左上，同列表模式口径）/
 *   id3 品牌标签（店名前）/ id1 店名 / id19 打烊倒计时 / id10 营业状态 / id4 评分 / id5 月售 /
 *   id6 準時寶 / id14 配送类型 / id25 自取折扣（距离后）/ id7 起送·減配/免配送費 / id8 配送时间·距离 / id11 广告标签 /
 *   id16 勁爆券·神會員 / id12 券行 / id17 其它。
 * 信息区样式全部复用列表模式既有类（apw-row-* / apw-info-* / apw-tag / apw-pill /
 * apw-status-* / apw-closing / apw-brand-tag / apw-discount-flag），
 * 本文件与 appPreview.css 大图段只保留版式类（apw-large-），不新增裸色值。
 */
import { SpecField } from './SpecHighlight'
import { useClosingCountdown } from './useClosingCountdown'
import BrandCover from './BrandCover'
import { deliveryFromText } from './deliveryFee'
import { BRAND_TAG_STYLE, DeliveryMemberBlock, type DeliveryStore } from './DeliveryStoreCard'

export default function DeliveryLargeCard({ store, onOpenStore }: {
  store: DeliveryStore
  onOpenStore?: (merchantId: string) => void
}) {
  /* 打烊倒计时（No.19）：与列表模式同款，每秒真实递减，归零隐藏 */
  const closing = useClosingCountdown(store.closingCountdown ?? '')

  return (
    <div className="apw-large" onClick={() => onOpenStore?.(store.merchantId)}>
      {/* 減配角标（id7）：与列表模式同款渐变角标，贴卡片（封面）右上角 */}
      {store.deliveryDiscount && (
        <SpecField panel="delivery" id={7}>
          <span className="apw-discount-flag">減配</span>
        </SpecField>
      )}

      {/* 封面图/视频（id20）：有视频自动播放视频，无视频大图封面兜底（必传） */}
      <SpecField panel="delivery" id={20}>
        <div className="apw-large-cover">
          <img className="apw-large-cover-img" src={store.image} alt={store.name} />
          {store.coverVideo && <span className="apw-large-play" aria-hidden="true">▶</span>}
        </div>
      </SpecField>

      <div className="apw-large-body">
        {/* logo（id15；新店角标 id2 嵌于 logo 左上，与列表模式同款口径）+ 品牌标签（id3）+ 店名（id1） */}
        <div className="apw-row-name">
          <SpecField panel="delivery" id={15}>
            <span className="apw-large-logo">
              <BrandCover seed={store.key} name={store.name} />
              {store.isNew && (
                <SpecField panel="delivery" id={2}>
                  <span className="apw-new-tag">新店</span>
                </SpecField>
              )}
            </span>
          </SpecField>
          {store.brandTag && (
            <SpecField panel="delivery" id={3}>
              <span className={`apw-brand-tag ${BRAND_TAG_STYLE[store.brandTag]}`}>{store.brandTag}</span>
            </SpecField>
          )}
          <SpecField panel="delivery" id={1}>
            <span className="apw-name">{store.name}</span>
          </SpecField>
        </div>

        {/* 打烊倒计时（id19）：与列表模式同款 info 令牌浅蓝底蓝字 */}
        {store.closingCountdown && !closing.expired && (
          <SpecField panel="delivery" id={19}>
            <div className="apw-closing-row">
              <span className="apw-closing"><i aria-hidden="true">⏰</i>距離打烊還剩 {closing.display}</span>
            </div>
          </SpecField>
        )}

        {/* 营业状态横幅（id10）：正常营业不渲染；已打烊=红条+原因；接受预定=绿条+起配时间 */}
        {store.businessState === 'preorder' && store.preorderTime && (
          <SpecField panel="delivery" id={10}>
            <div className="apw-status-banner apw-status-preorder">
              <span className="apw-status-badge">接受预定</span>
              <span className="apw-status-text">明天 {store.preorderTime} 后配送</span>
            </div>
          </SpecField>
        )}
        {store.businessState === 'closed' && (
          <SpecField panel="delivery" id={10}>
            <div className="apw-status-banner apw-status-closed">
              <span className="apw-status-badge">已打烊</span>
              {store.closedReason && <span className="apw-status-text">{store.closedReason}</span>}
            </div>
          </SpecField>
        )}

        {/* 评分（id4，★ 一并包裹）+ 月售（id5）｜右侧：準時寶（id6）+ 配送类型（id14）— 与列表模式同款配色 */}
        <div className="apw-row-rating">
          <SpecField panel="delivery" id={4}>{store.noRating ? <b className="apw-rating apw-rating--none"><span className="apw-star" aria-hidden="true">★</span>暫無</b> : <b className="apw-rating"><span className="apw-star" aria-hidden="true">★</span>{store.rating}</b>}</SpecField>
          <SpecField panel="delivery" id={5}><span className="apw-sales">月售 {store.monthlySales}</span></SpecField>
          <span className="apw-rating-side">
            {store.punctual && <SpecField panel="delivery" id={6}><span className="apw-punctual">準時寶</span></SpecField>}
            <SpecField panel="delivery" id={14}>
              <span className="apw-delivery-type">配送类型</span>
            </SpecField>
          </span>
        </div>

        {/* 起送·減配/免配送費（id7）+ 时间·距离（id8）+ 自取折扣（id25，距离后）：三列信息格与列表模式同款 */}
        <div className="apw-info-grid">
          <SpecField panel="delivery" id={7}>
            <div className="apw-info-cell">
              <span className="apw-info-label">起送</span>
              <span className="apw-info-value">{store.minOrder}</span>
            </div>
          </SpecField>
          <SpecField panel="delivery" id={7}>
            <div className="apw-info-cell">
              <span className="apw-info-label">配送</span>
              {/* 免配送費=橙字（列表模式同款，不标減配角标）；其余配送费按门店 key 散列 0-19 显示「$x起」+右上角标 */}
              <span className={`apw-info-value${store.freeDelivery ? ' apw-info-value--free' : ''}`}>
                {store.freeDelivery ? '免配送費' : deliveryFromText(store.key)}
              </span>
            </div>
          </SpecField>
          <div className="apw-info-cell">
            <span className="apw-info-label">时间·距离</span>
            <span className="apw-info-value apw-info-value--row">
              <SpecField panel="delivery" id={8}>
                <span className="apw-info-td">
                  {store.deliveryTime}
                  {store.distance ? <> · {store.distance}</> : null}
                </span>
              </SpecField>
              {/* 自取折扣（id25）：报名自取折扣活动时跟在距离后展示「自取x折」 */}
              {store.deliveryType === 'pickup' && store.pickupDiscount && (
                <SpecField panel="delivery" id={25}>
                  <span className="apw-pickup-text">自取{store.pickupDiscount}</span>
                </SpecField>
              )}
            </span>
          </div>
        </div>

        {/* 广告标签（id11）：排名/特色/兜底字典招牌 — 与列表模式同款浅橙标 */}
        {store.tags.length > 0 && (
          <SpecField panel="delivery" id={11}>
            <div className="apw-row-tags">
              {store.tags.map((t) => <span key={t} className="apw-tag">{t}</span>)}
            </div>
          </SpecField>
        )}

        {/* 红包区（id16 勁爆券·神會員 / id12 券行 / id17 其它）：与列表模式共用组件（含展開/收起） */}
        <DeliveryMemberBlock store={store} />
      </div>
    </div>
  )
}
