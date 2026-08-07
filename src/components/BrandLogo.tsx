/**
 * MFTB 搜廣推系統品牌 Logo（AI 智慧搜索鏡）
 *
 * 複合圖標設計：搜索鏡 + AI 神經網絡 + 智能軌道環 + 廣告菱形
 *  - 鏡框圓形：象徵「搜索」（精準查找）
 *  - 鏡片內神經網絡（中心智腦節點 + 三個數據節點互聯）：象徵「AI 智能推薦」
 *  - 傾斜軌道環 + 巡航光點：象徵「智能掃描 / 算法持續運算」
 *  - 鏡柄末端菱形：象徵「廣告」（商業價值）
 *  - 橙色漸變主色：延續品牌色 #E8720C → #FFB347
 */
import type { CSSProperties } from 'react'
import { useTranslation } from 'react-i18next'

interface BrandLogoProps {
  /** 圖標尺寸，默認 24 */
  size?: number
  /** 附加 className */
  className?: string
  /** 附加 style */
  style?: CSSProperties
}

export default function BrandLogo({ size = 24, className, style }: BrandLogoProps) {
  const { t } = useTranslation()
  const uid = Math.random().toString(36).slice(2, 8)
  const gradId = `mftb-logo-grad-${uid}`
  const coreId = `mftb-logo-core-${uid}`
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      style={{ display: 'block', flexShrink: 0, ...style }}
      aria-label={t('app.logoMain')}
    >
      <defs>
        <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#E8720C" />
          <stop offset="55%" stopColor="#F59432" />
          <stop offset="100%" stopColor="#FFB347" />
        </linearGradient>
        {/* 中心智腦節點：內亮外橙的能量光暈 */}
        <radialGradient id={coreId} cx="50%" cy="45%" r="60%">
          <stop offset="0%" stopColor="#FFE3BD" />
          <stop offset="55%" stopColor="#FFB347" />
          <stop offset="100%" stopColor="#F59432" />
        </radialGradient>
      </defs>

      {/* 智能軌道環（傾斜橢圓，置於鏡框後方） */}
      <g transform="rotate(-28 13.5 13.5)">
        <ellipse
          cx="13.5"
          cy="13.5"
          rx="12.3"
          ry="4.8"
          fill="none"
          stroke={`url(#${gradId})`}
          strokeWidth="1.1"
          opacity="0.75"
        />
        {/* 軌道巡航光點：沿橢圓循環運動，象徵算法持續運算 */}
        <circle r="1.15" fill="#FFB347">
          <animateMotion
            dur="6s"
            repeatCount="indefinite"
            path="M 25.8,13.5 A 12.3 4.8 0 1 1 1.2,13.5 A 12.3 4.8 0 1 1 25.8,13.5"
          />
        </circle>
      </g>

      {/* 搜索鏡：鏡框圓環 */}
      <circle
        cx="13.5"
        cy="13.5"
        r="8"
        fill="none"
        stroke={`url(#${gradId})`}
        strokeWidth="2.4"
        strokeLinecap="round"
      />

      {/* 鏡片內 AI 神經網絡 */}
      {/* 外圍連接邊（知識圖譜三角） */}
      <path
        d="M13.5 9 L9.8 16.4 M13.5 9 L17.2 16.4 M9.8 16.4 L17.2 16.4"
        stroke="#F59432"
        strokeWidth="0.7"
        opacity="0.55"
        strokeLinecap="round"
      />
      {/* 中心到外圍節點的神經連線 */}
      <path
        d="M13.5 13.6 L13.5 9 M13.5 13.6 L9.8 16.4 M13.5 13.6 L17.2 16.4"
        stroke={`url(#${gradId})`}
        strokeWidth="1"
        strokeLinecap="round"
      />
      {/* 外圍數據節點 */}
      <circle cx="13.5" cy="9" r="1.25" fill={`url(#${gradId})`} />
      <circle cx="9.8" cy="16.4" r="1.25" fill={`url(#${gradId})`} />
      <circle cx="17.2" cy="16.4" r="1.25" fill={`url(#${gradId})`} />
      {/* 中心智腦節點（帶呼吸光暈） */}
      <circle cx="13.5" cy="13.6" r="3.1" fill="#FFB347" opacity="0.28">
        <animate attributeName="opacity" values="0.28;0.5;0.28" dur="2.4s" repeatCount="indefinite" />
      </circle>
      <circle cx="13.5" cy="13.6" r="1.9" fill={`url(#${coreId})`} />

      {/* 鏡柄 */}
      <line
        x1="19.4"
        y1="19.4"
        x2="23.2"
        y2="23.2"
        stroke={`url(#${gradId})`}
        strokeWidth="2.4"
        strokeLinecap="round"
      />

      {/* 鏡柄末端廣告菱形 */}
      <path
        d="M24.6 22 L27.2 24.6 L24.6 27.2 L22 24.6 Z"
        fill={`url(#${gradId})`}
      />
    </svg>
  )
}
