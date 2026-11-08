/**
 * Copyright (c) 2026 fengsong7889. All Rights Reserved.
 *
 * 本文件为「MFTB 企业一体化管理平台软件」的组成部分。
 * 未经著作权人书面许可，不得使用、复制、修改、再分发或用于任何商业目的。
 * 完整许可条款见仓库根目录 LICENSE 文件。
 */

/**
 * 優選商家瀑布流卡片 · 共享组件（閃蜂「優選商家」页签，设计稿图2）
 *
 * 字段结构（照抄图2）：
 *   左=方形门店 logo（圆角，可带「新店」绿色斜飘带）；
 *   右=店名(粗体+emoji，单行截断) + 右上收藏圆钮(灰星/橙星) →
 *      评分行(橙心+评分 | 人均 | 品类·商圈 | 距离，细竖线分隔) →
 *      标签行(勁爆券紫标 + 可选膨胀紫软标 + 半年售灰标) →
 *      券列表(橙方图标 券/惠/秒 + 红价 + 红描边折扣 pill + 灰券名截断，1~3 行)。
 *
 * 取色全走全局/页局部令牌（紫标用 --purple、橙用 --brand、红价用 --danger），不新增裸色值。
 */
import { useState } from 'react'
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
  /** 勁爆券膨胀标（如 最高膨脹至$60），缺省不渲染 */
  inflate?: string
  /** 半年售标（如 半年售300+） */
  sales: string
  /** 券列表（1~3 行） */
  coupons: { icon: '券' | '惠' | '秒'; price: string; discount: string; name: string }[]
}

export default function PreferredMerchantCard({ item }: { item: PreferredMerchant }) {
  /** 收藏仅视觉态（原型不做真实收藏） */
  const [fav, setFav] = useState(Boolean(item.fav))

  return (
    <div className="apq-card">
      <SpecField panel="preferred" id={2}>
        <div className={`apq-logo apq-logo--${item.logoTone}`}>
          {item.isNew && <span className="apq-new">新店</span>}
          <span>{item.logoText}</span>
        </div>
      </SpecField>
      <div className="apq-main">
        <div className="apq-head">
          <SpecField panel="preferred" id={1}>
            <span className="apq-name">{item.name}</span>
          </SpecField>
          <SpecField panel="preferred" id={6}>
            <button
              type="button"
              className={`apq-fav${fav ? ' is-on' : ''}`}
              aria-label={fav ? '取消收藏' : '收藏'}
              aria-pressed={fav}
              onClick={() => setFav((prev) => !prev)}
            >
              {fav ? '★' : '☆'}
            </button>
          </SpecField>
        </div>
        <SpecField panel="preferred" id={3}>
          <div className="apq-meta">
            <span className="apq-rating"><i aria-hidden="true">♥</i>{item.rating}</span>
            <i className="apq-sep" aria-hidden="true" />
            <span>{item.perPerson}</span>
            <i className="apq-sep" aria-hidden="true" />
            <span className="apq-cate">{item.cateArea}</span>
            <i className="apq-sep" aria-hidden="true" />
            <span>{item.dist}</span>
          </div>
        </SpecField>
        <SpecField panel="preferred" id={4}>
          <div className="apq-tags">
            <span className="apq-boom">勁爆券<i aria-hidden="true">⚡</i></span>
            {item.inflate && <span className="apq-inflate">{item.inflate}</span>}
            <span className="apq-sales">{item.sales}</span>
          </div>
        </SpecField>
        <SpecField panel="preferred" id={5}>
          <div className="apq-coupons">
            {item.coupons.map((c, i) => (
              <div key={`${c.icon}-${i}`} className="apq-coupon">
                <i className="apq-coupon-ico">{c.icon}</i>
                <b>${c.price}</b>
                <span className="apq-coupon-disc">{c.discount}</span>
                <span className="apq-coupon-name">{c.name}</span>
              </div>
            ))}
          </div>
        </SpecField>
      </div>
    </div>
  )
}
