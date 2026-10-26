import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

/**
 * 横幅励志语公共语料源（企业门户横幅与各系统首页横幅共用）。
 *
 * 语料只维护语言包 `portal.quotes` 数组一处（繁中/英/日/韩/俄各一套 30 条），
 * 两个横幅改读本 Hook 后，增删语句只需编辑语言包，无需再动代码。
 * 轮换间隔统一 5 秒，牌堆洗牌保证一轮 30 条走完才会重洗，约 2.5 分钟内不重复。
 */
const QUOTE_ROTATE_MS = 5000

/** Fisher-Yates 洗牌，返回一轮不重复的下标顺序。 */
function shuffledOrder(size: number): number[] {
  const order = Array.from({ length: size }, (_, index) => index)
  for (let index = order.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(Math.random() * (index + 1))
    ;[order[index], order[swap]] = [order[swap], order[index]]
  }
  return order
}

/** 从牌堆取下一条；牌堆空了就重洗，并保证新轮首条不与上一条相同。 */
function drawQuote(deck: number[], size: number, previous: number): number {
  if (deck.length === 0) {
    const order = shuffledOrder(size)
    if (order[0] === previous && order.length > 1) {
      ;[order[0], order[order.length - 1]] = [order[order.length - 1], order[0]]
    }
    deck.push(...order)
  }
  return deck.shift() ?? 0
}

/**
 * 读取当前语言的励志语数组。
 * returnObjects 让 i18next 直接返回数组，语言包缺该键时由 fallbackLng（英文）兜底；
 * 数据库翻译包只会写入扁平字符串，因此必须校验类型，非数组则视为无语料。
 */
export function useMotivationQuotes(): string[] {
  const { t } = useTranslation()
  // 不做 memo：30 条字符串的过滤开销极低，而直接求值可保证语言切换后一定拿到新语料
  const raw = t('portal.quotes', { returnObjects: true }) as unknown
  return Array.isArray(raw)
    ? raw.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    : []
}

/**
 * 励志语轮播：返回当前条文本与下标（下标可作 key 触发淡入动画重播）。
 * 语言切换时牌堆与下标同步重置；无语料时 text 为 null，调用方应整体不渲染。
 */
export function useRotatingMotivationQuote(): { text: string | null; index: number } {
  const { i18n } = useTranslation()
  const quotes = useMotivationQuotes()
  const deck = useRef<number[]>([])
  const [index, setIndex] = useState(() => drawQuote(deck.current, quotes.length, -1))

  // 语言切换：清牌堆并重新抽首条，保证立即切到目标语言语料而非等下一个节拍
  useEffect(() => {
    deck.current = []
    setIndex(drawQuote(deck.current, quotes.length, -1))
    // 依赖语言而非 quotes.length：抽语料只为重置下标，不作为定时器节拍
  }, [i18n.language]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (quotes.length < 2) return undefined
    const timer = window.setInterval(() => {
      setIndex((current) => drawQuote(deck.current, quotes.length, current))
    }, QUOTE_ROTATE_MS)
    return () => window.clearInterval(timer)
  }, [quotes.length])

  if (quotes.length === 0) return { text: null, index: 0 }
  return { text: quotes[index % quotes.length], index }
}
