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
 *
 * 人氣商家皮膚（可選字段，缺省零影響；與「廣告推薦系統 → 銷售定價 → 新增定價」的皮膚配置同源）：
 *   small — 「邊框色+框內漸變」小圖模式，配色取自 SMALL_SKIN_TEMPLATES（11 套固定配色，單一真源）
 *   large — 大圖拼列（大圖模式版式之一）：左側豎版海報（FALLBACK_POSTERS 兜底配色）
 *           + 右側店鋪信息 + 下方 1大2小商品拼列
 */
import { useContext, useState } from 'react'
import { getSmallTemplate, getFallbackPoster } from '@/constants/popularSkinTemplates'
import { HighlightContext, SpecField } from './SpecHighlight'

export interface MemberTag {
  kind: 'shen' | 'point' | 'coupon' | 'red' | 'plain' | 'green' | 'gray'
  text: string
}

/** 神會員展開區段落（券包/活动/其它）；配置後會員行可展開收起，收起仍只顯示 memberTags */
export interface MemberSection {
  /** 段名：券包 / 活动 / 其它 */
  label: string
  tags: MemberTag[]
}

/** 人氣商家大圖商品拼列條目（首項為主推：折扣角標+價格+菜名，其餘為小圖） */
export interface HotDish {
  name: string
  image: string
  /** 折扣角标，如 "8.7折" */
  discount?: string
  price: string
  /** 划线原价 */
  origin?: string
}

/** 人氣商家皮膚（商家購買廣告後點亮） */
export interface HotSkin {
  /** small=邊框+漸變小圖；large=大圖拼列 */
  mode: 'small' | 'large'
  /** small 模式：小圖皮膚 key（SMALL_SKIN_TEMPLATES，如 small_red），邊框+漸變由此單一真源驅動 */
  templateKey?: string
  /** large 模式：兜底海報 key（FALLBACK_POSTERS，如 poster_red） */
  posterKey?: string
  /** large 模式：海報頂部品牌短名 */
  posterBrand?: string
  /** large 模式：海報吉祥物 emoji */
  posterMascot?: string
  /** large 模式：真实海報图（参考图切图，优先于兜底渐变；图内已含「人氣商家/立即進入」无需叠加文字） */
  posterImage?: string
  /** large 模式：商品拼列（1大2小，首項為主推） */
  dishes?: HotDish[]
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
  /** No.4 减免配送费区间，如 "$0~6"；有減配时配送列固定「$0 起」+ 卡片右上角「減配」角标 */
  deliveryDiscount?: string
  /** No.4 配送費价格区间（如 "$6~12"）——无減配且非免配送費门店的配送列展示 */
  deliveryFee?: string
  /** No.4 免配送費门店置 true：配送列显示「$0」，卡片右上角标「減配」 */
  freeDelivery?: boolean
  /** No.5 配送时间，如 "30分鐘" */
  deliveryTime: string
  /** 配送类型（每个商家必显示其一，優先级 platform > self > pickup）：platform=平台配送「閃蜂送」；self=商家自送「自送」；pickup=支持自取 */
  deliveryType: 'platform' | 'self' | 'pickup'
  /** 自取折扣（deliveryType=pickup 时展示），如 "8.8折"；无折扣则标签直接显示「支持自取」 */
  pickupDiscount?: string
  /** No.6 距离，如 "1.4km"；自取门店不传 */
  distance?: string
  /** 準時寶标（评分行右侧蓝色描边） */
  punctual?: boolean
  /** No.7 标签栏 — 广告推荐系统 / 算法库 / 金字招牌配置，抽 2 个展示 */
  tags: string[]
  /** No.8 会员红包标签行（收起态展示；神會員/勁爆券開頭） */
  memberTags: MemberTag[]
  /** No.8 神會員展開區（券包/活动/其它三段）；配置後會員行右側出現展開箭頭，收起態不變 */
  memberSections?: MemberSection[]
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
  /** 人氣商家皮膚（缺省=普通門店卡） */
  hotSkin?: HotSkin
}

const MEMBER_STYLE: Record<MemberTag['kind'], string> = {
  shen: 'apw-pill-shen',
  point: 'apw-pill-green',
  coupon: 'apw-pill-coupon',
  red: 'apw-pill-red',
  plain: 'apw-pill-plain',
  green: 'apw-pill-green',
  gray: 'apw-pill-gray',
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
  /* 人氣商家皮膚解析：配色一律從共享模板真源取，不在本頁複製色值 */
  const hot = store.hotSkin
  const smallSkin = hot?.mode === 'small' && hot.templateKey ? getSmallTemplate(hot.templateKey) : undefined
  const poster = hot?.mode === 'large' && hot.posterKey ? getFallbackPoster(hot.posterKey) : undefined
  const isHotLarge = hot?.mode === 'large'

  /* 神會員展開/收起（配置了 memberSections 才出現箭頭） */
  const [memberOpen, setMemberOpen] = useState(false)
  const hasSections = (store.memberSections?.length ?? 0) > 0
  /* 懸停說明表「券包/活动」（id12）或「其它」（id17）行時自動展開紅包區，便於快速定位對應欄目 */
  const { highlightId, scope } = useContext(HighlightContext)
  const autoExpand = (highlightId === 12 || highlightId === 17) && scope === 'delivery'

  /** 會員紅包膠囊渲染（收起行與展開區共用；閃蜂口径：shen = 👑神會員） */
  const renderPill = (m: MemberTag, i: number) => (
    <span key={`${m.kind}-${m.text}-${i}`} className={`apw-pill ${MEMBER_STYLE[m.kind]}`}>
      {m.kind === 'shen' && <span className="apw-pill-crown" aria-hidden="true">👑</span>}
      {m.kind === 'shen' && <span className="apw-pill-shen-name">神會員</span>}
      {m.text}
    </span>
  )

  /* 人氣商家小圖模式：id13 標記整卡邊框（皮膚）而非封面圖；其餘模式原樣返回 */
  const cardNode = (
    <div
      className={`apw-card${isHotLarge ? ' is-hot-large' : ''}${smallSkin ? ' is-hot-small' : ''}`}
      style={smallSkin ? { border: `2px solid ${smallSkin.borderColor}`, background: smallSkin.gradientCss } : undefined}
      onClick={() => onOpenStore?.(store.merchantId)}
    >
      {/* 減配角标：卡片右上角（有減配区间或免配送費时展示；免配送費不再单独展示绿字） */}
      {(store.freeDelivery || store.deliveryDiscount) && (
        <SpecField panel="delivery" id={7}>
          <span className="apw-discount-flag">減配</span>
        </SpecField>
      )}

      {/* 左列：大圖模式=豎版海報（id13 锚海报）；人气小圖=封面圖（id13 改标整卡边框，不标封面图）；普通卡=封面圖（封面图锚点 id=15，新店角标固定左上角） */}
      {isHotLarge ? (
        <SpecField panel="delivery" id={13}>
          <div className="apw-hot-poster" style={poster ? { background: poster.gradientCss } : undefined}>
            {hot?.posterImage ? (
              <img className="apw-hot-poster-img" src={hot.posterImage} alt="人氣商家" />
            ) : (
              <>
                <span className="apw-hot-poster-brand">{hot?.posterBrand}</span>
                <span className="apw-hot-poster-mascot" aria-hidden="true">{hot?.posterMascot}</span>
                <span className="apw-hot-poster-title">人氣商家</span>
                <span className="apw-hot-poster-btn">立即進入 ▶</span>
              </>
            )}
          </div>
        </SpecField>
      ) : hot ? (
        <div className="apw-card-img">
          <SpecField panel="delivery" id={15}><img src={store.image} alt={store.name} /></SpecField>
          {store.isNew && <SpecField panel="delivery" id={2}><span className="apw-new-tag">新店</span></SpecField>}
        </div>
      ) : (
        <SpecField panel="delivery" id={15}>
          <div className="apw-card-img">
            <img src={store.image} alt={store.name} />
            {store.isNew && <SpecField panel="delivery" id={2}><span className="apw-new-tag">新店</span></SpecField>}
          </div>
        </SpecField>
      )}

      {/* 右侧信息 */}
      <div className="apw-card-body">
        {/* 门店名称（人氣商家大圖模式帶「熱門」角标；普通卡前缀品质标签四选一）：名称 id=1 / 品质标签 id=3 */}
        <div className="apw-row-name">
          {isHotLarge && <span className="apw-hot-flag">熱門</span>}
          {store.brandTag && (
            <SpecField panel="delivery" id={3}>
              <span className={`apw-brand-tag ${BRAND_TAG_STYLE[store.brandTag]}`}>{store.brandTag}</span>
            </SpecField>
          )}
          <SpecField panel="delivery" id={1}>
            <span className="apw-name">{store.name}</span>
          </SpecField>
        </div>

        {/* 营业状态横幅：正常营业不显示；已打烊=红条+原因；接受预定=绿条+起配时间。锚点 id=10 */}
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

        {/* 评分 id=4 + 月售 id=5（大圖模式不展示）；右侧堆叠：準時寶 id=6 + 配送类型 id=14（閃蜂送/自送/自取x折/支持自取） */}
        <div className="apw-row-rating">
          <span className="apw-star" aria-hidden="true">★</span>
          <SpecField panel="delivery" id={4}><b className="apw-rating">{store.rating}</b></SpecField>
          {!isHotLarge && <SpecField panel="delivery" id={5}><span className="apw-sales">月售 {store.monthlySales}</span></SpecField>}
          <span className="apw-rating-side">
            {store.punctual && <SpecField panel="delivery" id={6}><span className="apw-punctual">準時寶</span></SpecField>}
            <SpecField panel="delivery" id={14}>
              <span className="apw-delivery-type">
                {store.deliveryType === 'pickup'
                  ? (store.pickupDiscount ? `自取${store.pickupDiscount}` : '支持自取')
                  : store.deliveryType === 'self' ? '自送' : '閃蜂送'}
              </span>
            </SpecField>
          </span>
        </div>

        {/* 信息三列 id=7/8：起送 / 配送（免配送費互斥，減配改右上角标）/ 时间·距離（时间+距离整格共用锚点 id 8；自取折扣已移至配送类型标签） */}
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
              <span className="apw-info-value">{store.freeDelivery ? '$0' : store.deliveryDiscount ? '$0 起' : (store.deliveryFee ?? '$0 起')}</span>
            </div>
          </SpecField>
          <div className="apw-info-cell">
            <span className="apw-info-label">时间·距离</span>
            <SpecField panel="delivery" id={8}>
              <span className="apw-info-value">
                {store.deliveryTime}
                {store.distance ? <> · {store.distance}</> : null}
              </span>
            </SpecField>
          </div>
        </div>

        {/* 广告标签 id=11 */}
        {store.tags.length > 0 && (
          <SpecField panel="delivery" id={11}>
            <div className="apw-row-tags">
              {store.tags.map((tag) => (
                <span key={tag} className="apw-tag">{tag}</span>
              ))}
            </div>
          </SpecField>
        )}

        {/* 红包区锚点：勁爆券/神會員药丸（shen）=id16；其它类目药丸（point/其它段）=id17；其它券药丸+▾▴按鈕+券包/活动段=id12；懸停 id17 自動展開（点击不触发卡片跳轉） */}
        {hasSections && (memberOpen || autoExpand) ? (
          <div className="apw-member-open">
            {store.memberSections?.map((sec) => (
              <div key={sec.label} className="apw-member-section">
                <span className="apw-member-section-label">{sec.label}</span>
                <div className="apw-member-section-tags">
                  {sec.tags.map((m, i) =>
                    m.kind === 'shen' ? (
                      <SpecField key={`${m.kind}-${m.text}-${i}`} panel="delivery" id={16}>
                        {renderPill(m, i)}
                      </SpecField>
                    ) : sec.label === '其它' ? (
                      <SpecField key={`${m.kind}-${m.text}-${i}`} panel="delivery" id={17}>
                        {renderPill(m, i)}
                      </SpecField>
                    ) : (
                      <SpecField key={`${m.kind}-${m.text}-${i}`} panel="delivery" id={12}>
                        {renderPill(m, i)}
                      </SpecField>
                    )
                  )}
                  {sec.label === store.memberSections?.[0]?.label && (
                    <SpecField panel="delivery" id={12}>
                      <button
                        type="button"
                        className="apw-member-toggle"
                        aria-label="收起會員紅包"
                        onClick={(e) => { e.stopPropagation(); setMemberOpen(false) }}
                      >
                        ▴
                      </button>
                    </SpecField>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="apw-row-member">
            {store.memberTags.map((m, i) =>
              m.kind === 'shen' ? (
                <SpecField key={`${m.kind}-${m.text}-${i}`} panel="delivery" id={16}>
                  {renderPill(m, i)}
                </SpecField>
              ) : m.kind === 'point' ? (
                <SpecField key={`${m.kind}-${m.text}-${i}`} panel="delivery" id={17}>
                  {renderPill(m, i)}
                </SpecField>
              ) : (
                <SpecField key={`${m.kind}-${m.text}-${i}`} panel="delivery" id={12}>
                  {renderPill(m, i)}
                </SpecField>
              )
            )}
            {hasSections && (
              <SpecField panel="delivery" id={12}>
                <button
                  type="button"
                  className="apw-member-toggle"
                  aria-label="展開會員紅包"
                  onClick={(e) => { e.stopPropagation(); setMemberOpen(true) }}
                >
                  ▾
                </button>
              </SpecField>
            )}
          </div>
        )}

        {/* 人氣商家大圖模式：1大2小商品拼列（首項主推：折扣角標+價格條+菜名） */}
        {isHotLarge && hot?.dishes && hot.dishes.length > 0 && (
          <div className="apw-hot-dishes">
            {hot.dishes.map((d, i) => (
              <div key={d.name} className={`apw-hot-dish${i === 0 ? ' is-lead' : ''}`}>
                <div className="apw-hot-dish-img">
                  <img src={d.image} alt={d.name} />
                  {d.discount && <span className="apw-hot-dish-discount">{d.discount}</span>}
                  {i === 0 && (
                    <span className="apw-hot-dish-price">
                      <em>${d.price}</em>
                      {d.origin && <s>${d.origin}</s>}
                    </span>
                  )}
                </div>
                {i === 0 && <span className="apw-hot-dish-name">{d.name}</span>}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )

  return smallSkin ? (
    <SpecField panel="delivery" id={13}>{cardNode}</SpecField>
  ) : (
    cardNode
  )
}
