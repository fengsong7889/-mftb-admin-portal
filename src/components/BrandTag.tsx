import React from 'react'
import { isShanfeng, BRAND_SHANFENG_LABEL, BRAND_MFOOD_LABEL } from '../constants/brand'
import { useCompanyBrand } from '../contexts/CompanyBrandContext'

/**
 * 所屬品牌統一標籤組件
 * 全局統一品牌展示樣式，標籤從後端動態加載
 *
 * 兼容多種數據表示：
 *  - 數字（公司品牌 ID，從 sys_company_brand 表查詢）
 *  - 字符串：'flashBee' / 'mFood'（推廣模塊兼容）
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
  const { labelMap } = useCompanyBrand()
  const shanfeng = isShanfeng(value)
  const brandStyle = shanfeng ? BRAND_STYLE.shanfeng : BRAND_STYLE.mfood

  // 數字 ID → 從 context 動態取標籤；字符串 → 回退靜態常量
  let label: string
  if (typeof value === 'number' && labelMap[value]) {
    label = labelMap[value]
  } else {
    label = shanfeng ? BRAND_SHANFENG_LABEL : BRAND_MFOOD_LABEL
  }

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
      {label}
    </span>
  )
}
