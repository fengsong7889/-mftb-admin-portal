/**
 * 閃蜂外賣 · 门店瀑布流卡片（按设计稿还原，纯前端静态原型）
 *
 * 字段口径：
 *   门店名称（含 新店/熱門 类型角标）、门店评分、月售、
 *   起送费用·减免配送费区间（免配送費门店以绿色字突出）、配送时间、
 *   距离（自取门店不显示距离，显示【自取x折】）、
 *   标签栏（广告推荐系统 / 算法库 / 金字招牌配置，抽 2 个展示）、
 *   底部会员红包标签（神會員膨脹券 / Super / 領券 / 满减等）。
 *
 * 说明：外賣側暂无对应后端只读接口，先用占位数据渲染版式，待接口接入后替换。
 * 类名前缀 apw-（外賣瀑布流），不与 apd-（外賣頻道頁）混用。
 */

export interface MemberTag {
  kind: 'shen' | 'super' | 'coupon' | 'red' | 'plain'
  text: string
}

export interface DeliveryStore {
  key: string
  /** No.1 门店名称 */
  name: string
  /** 新店角标 — 商品封面图右上角；可与 brandTag 同时存在 */
  isNew?: boolean
  /** 门店名称前品质标签（独家/品牌/连锁/金牌，四选一，部分门店无） */
  brandTag?: '独家' | '品牌' | '连锁' | '金牌'
  /** No.2 门店评分 */
  rating: string
  /** No.3 月售，如 "300+" */
  monthlySales: string
  /** No.4 起送费用，如 "$40" */
  minOrder: string
  /** No.4 减免配送费区间，如 "$0~6"；免配送費门店不传 */
  deliveryDiscount?: string
  /** No.4 免配送費门店置 true，信息行以绿色字展示「免配送費」 */
  freeDelivery?: boolean
  /** No.5 配送时间，如 "30分鐘" */
  deliveryTime: string
  /** No.6 自取门店：true 时不显示距离，显示【自取x折】 */
  isPickup?: boolean
  /** No.6 自取折扣，如 "8.8折" */
  pickupDiscount?: string
  /** No.6 距离，如 "1.4km"；自取门店不传 */
  distance?: string
  /** 準時寶标（评分行右侧蓝色描边） */
  punctual?: boolean
  /** No.7 标签栏 — 广告推荐系统 / 算法库 / 金字招牌配置，抽 2 个展示 */
  tags: string[]
  /** No.8 会员红包标签行 */
  memberTags: MemberTag[]
  /** 门店封面图 */
  image: string
  /** 商家 ID，用于跳转详情页 */
  merchantId: string
  /** 营业状态：open=正常营业(不显示横幅，缺省)；closed=已打烊(红条+原因)；preorder=接受预定单(绿条+起配时间) */
  businessState?: 'open' | 'closed' | 'preorder'
  /** 已打烊原因（businessState=closed 时展示）：休息一会，马上回来 / 爆单啦，暂停接单一会 / 休息打烊 */
  closedReason?: string
  /** 预定起配时间（businessState=preorder 时展示），如"07:30" → 明天 07:30 后配送 */
  preorderTime?: string
}

const MEMBER_STYLE: Record<MemberTag['kind'], string> = {
  shen: 'apw-pill-shen',
  super: 'apw-pill-super',
  coupon: 'apw-pill-coupon',
  red: 'apw-pill-red',
  plain: 'apw-pill-plain',
}

/** 名称前品质标签样式映射（独家/品牌/连锁/金牌，四选一） */
const BRAND_TAG_STYLE: Record<string, string> = {
  独家: 'apw-brand-tag--exclusive',
  品牌: 'apw-brand-tag--brand',
  连锁: 'apw-brand-tag--chain',
  金牌: 'apw-brand-tag--gold',
}

export default function DeliveryStoreCard({
  store,
  onOpenStore,
}: {
  store: DeliveryStore
  onOpenStore?: (id: string) => void
}) {
  return (
    <div className="apw-card" onClick={() => onOpenStore?.(store.merchantId)}>
      {/* 门店封面图（新店角标固定左上角） */}
      <div className="apw-card-img">
        <img src={store.image} alt={store.name} />
        {store.isNew && <span className="apw-new-tag">新店</span>}
      </div>

      {/* 右侧信息 */}
      <div className="apw-card-body">
        {/* No.1 门店名称（前缀品质标签：独家/品牌/连锁/金牌，四选一） */}
        <div className="apw-row-name">
          {store.brandTag && (
            <span className={`apw-brand-tag ${BRAND_TAG_STYLE[store.brandTag]}`}>{store.brandTag}</span>
          )}
          <span className="apw-name">{store.name}</span>
        </div>

        {/* 营业状态横幅：正常营业不显示；已打烊=红条+原因；接受预定=绿条+起配时间 */}
        {store.businessState === 'preorder' && store.preorderTime && (
          <div className="apw-status-banner apw-status-preorder">
            <span className="apw-status-badge">接受预定</span>
            <span className="apw-status-text">明天 {store.preorderTime} 后配送</span>
          </div>
        )}
        {store.businessState === 'closed' && (
          <div className="apw-status-banner apw-status-closed">
            <span className="apw-status-badge">已打烊</span>
            {store.closedReason && <span className="apw-status-text">{store.closedReason}</span>}
          </div>
        )}

        {/* No.2 评分 + No.3 月售 + 準時寶 */}
        <div className="apw-row-rating">
          <span className="apw-star" aria-hidden="true">★</span>
          <b className="apw-rating">{store.rating}</b>
          <span className="apw-sales">月售 {store.monthlySales}</span>
          {store.punctual && <span className="apw-punctual">準時寶</span>}
        </div>

        {/* No.4~No.6 信息行：免配送費与起送/减配互斥，只展示其一 */}
        <div className="apw-row-info">
          <span className="apw-scooter" aria-hidden="true">🛵</span>
          <span className="apw-info">
            {store.freeDelivery ? (
              <em className="apw-free">免配送費</em>
            ) : (
              <>起送{store.minOrder}{store.deliveryDiscount ? ` · 減配${store.deliveryDiscount}` : ''}</>
            )}
            {' · '}{store.deliveryTime}
            {store.isPickup && store.pickupDiscount
              ? <> · <em className="apw-pickup">自取{store.pickupDiscount}</em></>
              : store.distance ? <> · {store.distance}</> : null}
          </span>
        </div>

        {/* No.7 标签栏 */}
        {store.tags.length > 0 && (
          <div className="apw-row-tags">
            {store.tags.map((tag) => (
              <span key={tag} className="apw-tag">{tag}</span>
            ))}
          </div>
        )}

        {/* No.8 会员红包标签 */}
        {store.memberTags.length > 0 && (
          <div className="apw-row-member">
            {store.memberTags.map((m, i) => (
              <span key={`${m.kind}-${i}`} className={`apw-pill ${MEMBER_STYLE[m.kind]}`}>
                {m.kind === 'shen' && <span className="apw-pill-crown" aria-hidden="true">👑</span>}
                {m.kind === 'shen' && <span className="apw-pill-shen-name">神會員</span>}
                {m.kind === 'super' && <span className="apw-pill-bee" aria-hidden="true">🐝</span>}
                {m.text}
                {m.kind === 'super' && <span className="apw-pill-bolt" aria-hidden="true">⚡</span>}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
