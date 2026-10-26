/**
 * MFTB 集團品牌 Logo（MF 熱氣徽章）
 *
 * 順豐/京東式字母標 + 烹飪熱氣（V5）：
 *  - 橙漸變圓徽 + 白色外環：任何背景（毛玻璃橙底 / 白底 / 深色側欄）都有清晰邊界
 *  - MF 共筆字標：F 的豎筆即 M 的右腿（麥峰 Maifeng 首字母，集團字標）
 *  - 三縷熱氣自 M 峰間升起：美食外賣的「鍋氣」，白色呼吸明滅、錯開節奏
 *  - 橙色漸變主色：延續品牌色 #E8720C → #FFB347
 *
 * 使用位置：登錄面板徽章 / 登錄視頻品牌牆 / 門戶頂欄 / 側欄門戶態 / favicon（靜態同構版）。
 * BrandLogo（AI 智慧搜索鏡）專屬搜索運營系統側欄品牌位（經 sys_system.icon='BrandLogo' 配置）。
 */
import type { CSSProperties } from 'react'
import { useTranslation } from 'react-i18next'

interface GroupLogoProps {
  /** 圖標尺寸，默認 24 */
  size?: number
  /** 附加 className */
  className?: string
  /** 附加 style */
  style?: CSSProperties
}

/** MF 共筆字標：M 左腿/左峰/谷/右腿，右腿同時作為 F 的豎筆 */
const MF_PATH = 'M8.4 20 V12.6 L14.2 18.2 L20.4 12.6 V23.2'

/** F 的兩條橫筆（從共筆豎筆向右伸出） */
const F_TOP_BAR = 'M20.4 13.8 H25.8'
const F_MID_BAR = 'M20.4 16.8 H24.8'

/** 三縷熱氣：自 M 峰間升起 */
const STEAM_LEFT = 'M12.8 11.2 c-0.6 -0.65 0.6 -1.25 0 -1.9 c-0.5 -0.5 0.4 -0.9 0 -1.4'
const STEAM_MID = 'M16 11.4 c-0.75 -0.75 0.75 -1.35 0 -2.1 c-0.6 -0.55 0.45 -1 0 -1.55'
const STEAM_RIGHT = 'M19.2 11.2 c0.6 -0.65 -0.6 -1.25 0 -1.9 c0.5 -0.5 -0.4 -0.9 0 -1.4'

export default function GroupLogo({ size = 24, className, style }: GroupLogoProps) {
  const { t } = useTranslation()
  const uid = Math.random().toString(36).slice(2, 8)
  const gradId = `mftb-group-grad-${uid}`
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      style={{ display: 'block', flexShrink: 0, ...style }}
      aria-label={t('app.logoGroup')}
    >
      <defs>
        <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#E8720C" />
          <stop offset="100%" stopColor="#FFB347" />
        </linearGradient>
      </defs>

      {/* 圓徽底座 + 白色外環：跨背景的清晰邊界 */}
      <circle cx="16" cy="16" r="14.7" fill={`url(#${gradId})`} stroke="#FFFFFF" strokeWidth="1.2" />

      {/* 三縷熱氣：白色呼吸明滅，錯開節奏（繪於字標之下，視覺自峰間冒起） */}
      <g fill="none" stroke="#FFFFFF" strokeLinecap="round" opacity="0.95">
        <path d={STEAM_LEFT} strokeWidth="1.25">
          <animate attributeName="opacity" values="0.5;1;0.5" dur="2.8s" repeatCount="indefinite" />
        </path>
        <path d={STEAM_MID} strokeWidth="1.35">
          <animate attributeName="opacity" values="0.6;1;0.6" dur="3.2s" begin="0.6s" repeatCount="indefinite" />
        </path>
        <path d={STEAM_RIGHT} strokeWidth="1.25">
          <animate attributeName="opacity" values="0.5;1;0.5" dur="2.8s" begin="1.4s" repeatCount="indefinite" />
        </path>
      </g>

      {/* MF 共筆字標 */}
      <g stroke="#FFFFFF" fill="none" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <path d={MF_PATH} />
        <path d={F_TOP_BAR} />
        <path d={F_MID_BAR} />
      </g>
    </svg>
  )
}
