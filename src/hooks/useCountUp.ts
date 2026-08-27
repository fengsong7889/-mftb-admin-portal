import { useEffect, useRef, useState } from 'react'

/**
 * 數字加載動畫 Hook（設計規範 12.1 強制標準）
 * - 時長 1200ms
 * - 緩動函數 1 - Math.pow(2, -10 * progress)
 * - 基於 requestAnimationFrame 實現
 */
export function useCountUp(target: number, duration = 1200) {
  const [value, setValue] = useState(0)
  const rafRef = useRef<number>(0)

  useEffect(() => {
    const start = performance.now()
    const animate = (now: number) => {
      const elapsed = now - start
      const progress = Math.min(elapsed / duration, 1)
      const eased = progress === 1 ? 1 : 1 - Math.pow(2, -10 * progress)
      setValue(Math.round(target * eased))
      if (progress < 1) {
        rafRef.current = requestAnimationFrame(animate)
      }
    }
    rafRef.current = requestAnimationFrame(animate)
    return () => cancelAnimationFrame(rafRef.current)
  }, [target, duration])

  return value
}

export default useCountUp
