/**
 * RDM 模块时间展示格式化。
 *
 * <p>后端 VO 已统一输出 `yyyy-MM-dd HH:mm:ss` 字符串，但灰度与存量迁移的响应会被
 * `RdmIdempotentService.executeOnce` 以 result_json 缓存并在重复请求时回放：契约改造前
 * 写入的旧缓存里，时间是全局 JacksonConfig 序列化出的毫秒数字。前端直接对数字调用
 * `.slice()` 会抛 TypeError 并把整页交给 RouteErrorBoundary（灰度管理页曾因此整页崩溃，
 * 连带全局/项目级熔断开关在 UI 上完全不可操作）。
 *
 * <p>这里对 number 与 string 都归一处理，保证「读到的时间一定能显示、绝不崩页」；
 * 毫秒时间戳按浏览器本地时区还原，与后端 Asia/Shanghai 的口径一致。
 */
export function formatRdmDateTime(value?: string | number | null): string {
  if (value === null || value === undefined || value === '') {
    return '-'
  }
  if (typeof value === 'number') {
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) {
      return '-'
    }
    const pad = (n: number) => String(n).padStart(2, '0')
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} `
      + `${pad(date.getHours())}:${pad(date.getMinutes())}`
  }
  return String(value).slice(0, 16).replace('T', ' ') || '-'
}
