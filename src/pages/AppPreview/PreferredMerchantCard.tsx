/**
 * Copyright (c) 2026 fengsong7889. All Rights Reserved.
 *
 * 本文件为「MFTB 企业一体化管理平台软件」的组成部分。
 * 未经著作权人书面许可，不得使用、复制、修改、再分发或用于任何商业目的。
 * 完整许可条款见仓库根目录 LICENSE 文件。
 */

/**
 * 優選商家瀑布流卡片 · 共享组件（閃蜂「優選商家」页签）
 *
 * 双模式（由篩選面板「列表大小圖切換」下发 layout）：
 *   small 小圖模式（默认）：左 logo + 右信息区（店名/收藏钮/评分/标签/券列表），一行一店；
 *   large 大圖模式：顶部大封面（出血，收藏钮移至封面右上）→ logo+店名/评分/标签 → 券列表横跨全宽。
 *
 * 锚点口径两模式共用同一批 spec id（说明表不分模式）：
 *   id1 店名 / id2 logo / id8 新店飘带（嵌套 id2 内） / id3 评分+人均（两段共用） /
 *   id7 品类·商圈 / id12 距离 / id4 红包标+膨胀标（两段共用） / id11 半年售 / id5 券列表 / id6 收藏钮。
 * 红包标随品牌：閃蜂=「神會員」、MFOOD=「勐爆券」（对齐外卖面板 id16 既有口径），由 brand 下发。
 *
 * 取色全走全局/页局部令牌（紫标 --purple、橙 --brand、红价 --danger），不新增裸色值。
 */
import { useState, type ReactElement } from 'react'
import { SpecField } from './SpecHighlight'

/* ─── 卡片数据接口（JSDoc 即文档） ─── */
export interface PreferredMerchant {
  key: string
  /** 店名（含 emoji，单行截断） */
  name: string
  /** 评分（如 4.6） */
  rating: string
  /** 人均（如 $76/人） */
  perPerson: string
  /** 品类·商圈（如 淮揚菜·新馬路商圈） */
  cateArea: string
  /** 距离（如 231m / 1.2km） */
  dist: string
  /** logo 占位文字（待切图后替换为品牌图） */
  logoText: string
  /** logo 底色调（令牌渐变近似品牌色） */
  logoTone: 'red' | 'green' | 'orange' | 'blue'
  /** 新店斜飘带 */
  isNew?: boolean
  /** 初始收藏态 */
  fav?: boolean
  /** 勁爆券膨胀标（如 最高膨脹至$6），缺省不渲染 */
  inflate?: string
  /** 半年售标（如 半年售300+） */
  sales: string
  /** 券列表（1~3 行） */
  coupons: { icon: '券' | '惠' | '秒'; price: string; discount: string; name: string }[]
  /** 大圖模式封面（占位贴图，待切商家真实封面） */
  cover: string
  /** 超出配送範圍（搜索結果頁團購瀑布流展示態）：LOGO 蒙暗色阴影 + 叠「超出範圍」白膠囊（与外卖瀑布流同款视觉语言） */
  outOfRange?: boolean
  /** 未入駐商家（搜索結果頁團購瀑布流展示態）：評分「暫無」，無人均/券列表/半年售/紅包标/收藏钮；整卡锚点 id15 */
  notJoined?: boolean
  /** 開業時間横條（LOGO 底部深色条白字，如「10:00 營業」）；開業後不配置即隐藏 */
  openTimeLabel?: string
}

/** 列表展示模式：small=小圖（当前样式）/ large=大圖（顶部大封面） */
export type PreferredLayout = 'small' | 'large'

/* ─── 评分行：♥评分｜人均（共用锚点 id3）＋品类·商圈（id7）＋距离（id12），两模式共用 ───
   未入駐商家無平台評分/人均：評分位顯示「♥暫無」灰字，人均段不渲染（锚点 id3 口径不变） ─── */
function PreferredMeta({ item }: { item: PreferredMerchant }) {
  return (
    <div className="apq-meta">
      {item.notJoined ? (
        <SpecField panel="preferred" id={3}>
          <span className="apq-rating apq-rating--none"><i aria-hidden="true">♥</i>暫無</span>
        </SpecField>
      ) : (
        <>
          <SpecField panel="preferred" id={3}>
            <span className="apq-rating"><i aria-hidden="true">♥</i>{item.rating}</span>
          </SpecField>
          <i className="apq-sep" aria-hidden="true" />
          <SpecField panel="preferred" id={3}>
            <span>{item.perPerson}</span>
          </SpecField>
        </>
      )}
      <i className="apq-sep" aria-hidden="true" />
      <SpecField panel="preferred" id={7}>
        <span className="apq-cate">{item.cateArea}</span>
      </SpecField>
      <i className="apq-sep" aria-hidden="true" />
      <SpecField panel="preferred" id={12}>
        <span>{item.dist}</span>
      </SpecField>
    </div>
  )
}

/** 卡片品牌：bee=閃蜂（红包标「神會員」）/ mfood=MFOOD（红包标「勐爆券」） */
export type PreferredBrand = 'bee' | 'mfood'

/* ─── 标签行：红包标/膨胀标（共用锚点 id4）＋半年售（id11），两模式共用 ───
   红包标随品牌：閃蜂「神會員」直接复用首页外卖瀑布流同款药丸（apw-pill-shen：👑冠标+粉红渐变，零新样式）；MFOOD「勐爆券」为紫标⚡ */
function PreferredTags({ item, brand }: { item: PreferredMerchant; brand: PreferredBrand }) {
  return (
    <div className="apq-tags">
      <SpecField panel="preferred" id={4}>
        {brand === 'mfood' ? (
          <span className="apq-boom">勐爆券<i aria-hidden="true">⚡</i></span>
        ) : (
          <span className="apw-pill apw-pill-shen">
            <span className="apw-pill-crown" aria-hidden="true">👑</span>
            <span className="apw-pill-shen-name">神會員</span>
          </span>
        )}
      </SpecField>
      {item.inflate && (
        <SpecField panel="preferred" id={4}>
          <span className="apq-inflate">{item.inflate}</span>
        </SpecField>
      )}
      <SpecField panel="preferred" id={11}>
        <span className="apq-sales">{item.sales}</span>
      </SpecField>
    </div>
  )
}

/* ─── 券列表（锚点 id5）；maxCount 按模式收条数：小圖取 3、大圖取 2（说明【展示条数限制】口径），两模式共用 ─── */
function PreferredCoupons({ item, maxCount }: { item: PreferredMerchant; maxCount?: number }) {
  const list = maxCount ? item.coupons.slice(0, maxCount) : item.coupons
  return (
    <div className="apq-coupons">
      {list.map((c, i) => (
        <div key={`${c.icon}-${i}`} className="apq-coupon">
          <i className="apq-coupon-ico">{c.icon}</i>
          <b>${c.price}</b>
          <span className="apq-coupon-disc">{c.discount}</span>
          <span className="apq-coupon-name">{c.name}</span>
        </div>
      ))}
    </div>
  )
}

export default function PreferredMerchantCard({ item, layout = 'small', brand = 'bee' }: { item: PreferredMerchant; layout?: PreferredLayout; brand?: PreferredBrand }) {
  /** 收藏仅视觉态（原型不做真实收藏） */
  const [fav, setFav] = useState(Boolean(item.fav))
  const toggleFav = () => setFav((prev) => !prev)
  const favLabel = fav ? '取消收藏' : '收藏'

  /* logo 位（新店飘带锚点 id8 嵌套于 logo 锚点 id2 内），两模式同构；
     超出範圍 = 暗色阴影 + 白膠囊（锚点 id14，与外卖瀑布流共用 .apw-logo-* 视觉语言）；
     開業時間 = LOGO 底部深色横條白字（锚点 id16） */
  const logo = (
    <SpecField panel="preferred" id={2}>
      <div className={`apq-logo apq-logo--${item.logoTone}`}>
        {item.isNew && (
          <SpecField panel="preferred" id={8}>
            <span className="apq-new">新店</span>
          </SpecField>
        )}
        <span>{item.logoText}</span>
        {item.outOfRange && <span className="apw-logo-shade" aria-hidden="true" />}
        {item.outOfRange && (
          <SpecField panel="preferred" id={14}>
            <span className="apw-logo-badge">超出範圍</span>
          </SpecField>
        )}
        {item.openTimeLabel && (
          <SpecField panel="preferred" id={16}>
            <span className="apq-logo-time">{item.openTimeLabel}</span>
          </SpecField>
        )}
      </div>
    </SpecField>
  )

  /* 未入駐商家整卡锚点 id=15（悬停说明表「未入驻门店」行点亮整张门店卡，同外卖 id23 先例） */
  const wrapNotJoined = (card: ReactElement) => (
    item.notJoined ? <SpecField panel="preferred" id={15}>{card}</SpecField> : card
  )

  if (layout === 'large') {
    /* 大圖模式：封面出血（收藏钮 id6 移至封面右上）→ logo+店名/评分/标签 → 券列表横跨全宽；未入駐无收藏/标签/券列表 */
    return wrapNotJoined(
      <div className="apq-card apq-card--lg">
        <div className="apq-lg-cover">
          <SpecField panel="preferred" id={13}>
            <img className="apq-lg-img" src={item.cover} alt="商家封面" />
          </SpecField>
          {!item.notJoined && (
            <SpecField panel="preferred" id={6}>
              <button type="button" className={`apq-lg-fav${fav ? ' is-on' : ''}`} aria-label={favLabel} aria-pressed={fav} onClick={toggleFav}>
                {fav ? '★' : '☆'}
              </button>
            </SpecField>
          )}
        </div>
        <div className="apq-lg-info">
          {logo}
          <div className="apq-lg-info-main">
            <div className="apq-head">
              <SpecField panel="preferred" id={1}>
                <span className="apq-name">{item.name}</span>
              </SpecField>
            </div>
            <PreferredMeta item={item} />
            {!item.notJoined && <PreferredTags item={item} brand={brand} />}
          </div>
        </div>
        {!item.notJoined && (
          <div className="apq-lg-coupons">
            <SpecField panel="preferred" id={5}>
              <PreferredCoupons item={item} maxCount={2} />
            </SpecField>
          </div>
        )}
      </div>,
    )
  }

  /* 小圖模式（默认，原样式）：logo 左 + 信息区右（收藏钮在店名行尾）；未入駐仅基础信息 */
  return wrapNotJoined(
    <div className="apq-card">
      {logo}
      <div className="apq-main">
        <div className="apq-head">
          <SpecField panel="preferred" id={1}>
            <span className="apq-name">{item.name}</span>
          </SpecField>
          {!item.notJoined && (
            <SpecField panel="preferred" id={6}>
              <button type="button" className={`apq-fav${fav ? ' is-on' : ''}`} aria-label={favLabel} aria-pressed={fav} onClick={toggleFav}>
                {fav ? '★' : '☆'}
              </button>
            </SpecField>
          )}
        </div>
        <PreferredMeta item={item} />
        {!item.notJoined && <PreferredTags item={item} brand={brand} />}
        {!item.notJoined && (
          <SpecField panel="preferred" id={5}>
            <PreferredCoupons item={item} maxCount={3} />
          </SpecField>
        )}
      </div>
    </div>,
  )
}
