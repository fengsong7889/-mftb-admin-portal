import dayjs from 'dayjs'

/**
 * 统一时间展示：兼容 epoch 毫秒/秒（后端 Fastjson 可能把 LocalDateTime 转成时间戳）
 * 与 ISO 字符串；无法解析时原样返回，不吞掉数据。
 *
 * <p>背景：能力清单/回答骨架/快捷提问曾直接渲染后端返回值，出现 `1792539638000`
 * 这类原始时间戳，与审计页的 `2026/10/21 17:11:28` 不一致。
 */
export function formatDateTime(value?: string | number | null): string {
  if (value === null || value === undefined || value === '') return '--'
  if (typeof value === 'number') {
    return dayjs(value).isValid() ? dayjs(value).format('YYYY/MM/DD HH:mm:ss') : String(value)
  }
  const text = String(value).trim()
  if (/^\d{13}$/.test(text)) return dayjs(Number(text)).format('YYYY/MM/DD HH:mm:ss')
  if (/^\d{10}$/.test(text)) return dayjs(Number(text) * 1000).format('YYYY/MM/DD HH:mm:ss')
  const parsed = dayjs(text)
  return parsed.isValid() ? parsed.format('YYYY/MM/DD HH:mm:ss') : text
}
