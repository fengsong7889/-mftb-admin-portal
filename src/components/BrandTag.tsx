import React from 'react'
import { isShanfeng, BRAND_SHANFENG_LABEL, BRAND_MFOOD_LABEL } from '../constants/brand'

/**
 * 所屬品牌統一標籤組件
 * 全局統一「閃蜂 / mFood」品牌枚舉的展示樣式
 *
 * 兼容多種數據表示：
 *  - 枚舉/數字：1 = 閃蜂, 2 = mFood
 *  - 字符串：'1' / '2'
 *  - 字符串：'shanfeng' / 'mfood'
 *  - 字符串：'flashBee' / 'mFood'
 *  - 中文文本：'閃蜂' / 'mFood'
 */

export type BrandValue = number | string | null | undefined

interface BrandTagProps {
  value: BrandValue
  style?: React.CSSProperties
}

/** 閃蜂 - 金黃漸變 + 白字；mFood - 橙色漸變 + 白字 */
const BRAND_STYLE: Record<'shanfeng' | 'mfood', React.CSSProperties> = {
  shanfeng: {
    background: 'linear-gradient(135deg, #FFB300 0%, #FB8C00 100%)',
    color: '#FFFFFF',
    border: 'none',
    boxShadow: '0 1px 3px rgba(251, 140, 0, 0.35)',
    textShadow: '0 1px 1px rgba(0, 0, 0, 0.18)',
  },
  mfood: {
    background: 'linear-gradient(135deg, #FF7A45 0%, #F5680C 100%)',
    color: '#FFFFFF',
    border: 'none',
    boxShadow: '0 1px 3px rgba(245, 104, 12, 0.35)',
    textShadow: '0 1px 1px rgba(0, 0, 0, 0.18)',
  },
}

export default function BrandTag({ value, style }: BrandTagProps) {
  const shanfeng = isShanfeng(value)
  const brandStyle = shanfeng ? BRAND_STYLE.shanfeng : BRAND_STYLE.mfood
  return (
    <span
      style={{
        display: 'inline-block',
        margin: 0,
        padding: '2px 12px',
        minWidth: 64,
        textAlign: 'center',
        boxSizing: 'border-box',
        borderRadius: 6,
        fontSize: 13,
        fontWeight: 600,
        lineHeight: '20px',
        whiteSpace: 'nowrap',
        ...brandStyle,
        ...style,
      }}
    >
      {shanfeng ? BRAND_SHANFENG_LABEL : BRAND_MFOOD_LABEL}
    </span>
  )
}
