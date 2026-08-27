import { useCountUp } from '../hooks/useCountUp'

interface AnimatedNumberProps {
  value: number
  prefix?: string
  suffix?: string
  /** 小數位數，默認 0（整數計數） */
  decimals?: number
}

/**
 * 動畫數字組件（設計規範 12.1 強制標準）
 * 數值使用 useCountUp 做計數動畫，並以 toLocaleString() 輸出千分位
 */
export default function AnimatedNumber({
  value,
  prefix = '',
  suffix = '',
  decimals = 0,
}: AnimatedNumberProps) {
  // 帶小數時先放大再還原，保證緩動過程平滑
  const factor = Math.pow(10, decimals)
  const animated = useCountUp(Math.round(value * factor))
  const display = decimals > 0
    ? (animated / factor).toLocaleString(undefined, {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      })
    : animated.toLocaleString()

  return <>{prefix}{display}{suffix}</>
}
