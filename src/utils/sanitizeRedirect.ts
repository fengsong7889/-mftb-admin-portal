/**
 * 登录回跳路径校验（防开放重定向）。
 *
 * 为什么单独一个文件而不是放在 Login 页里：
 * 1. 页面文件导出组件以外的东西会触发 react-refresh/only-export-components（Fast Refresh 失效）；
 * 2. 这是安全边界逻辑，必须可独立单测——放在页面里就得渲染整个登录页才能测一个字符串函数。
 */

/**
 * 校验登录后回跳路径：只接受站内绝对路径，其余一律返回 null（调用方走默认首页）。
 *
 * 为什么必须校验：`?redirect=` 是外部可控输入（钉钉链接、别人转发的 URL 都能带），
 * 直接喂给 navigate 就成了开放重定向——`//evil.com`、`/\evil.com`、`https://evil.com`
 * 这类值都会被浏览器当成外部站点，把登录页变成钓鱼跳板（用户刚输完密码就被送走）。
 *
 * 三道判定：必须 `/` 开头、不得 `//` 或含 `\`（协议相对变体）、不得带 scheme；
 * 再用 URL 解析确认 origin 与本站一致，最后只回传 pathname+search+hash。
 *
 * @param raw 原始 redirect 参数
 * @returns 校验通过的站内路径，或 null（表示应走默认首页）
 */
export function sanitizeRedirectPath(raw: string | null | undefined): string | null {
  if (!raw) return null
  const v = raw.trim()
  if (!v.startsWith('/') || v.startsWith('//') || v.includes('\\')) return null
  // 带 scheme 的绝对 URL（http://evil、javascript:alert(1)）一律拒绝
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(v)) return null
  try {
    const u = new URL(v, window.location.origin)
    if (u.origin !== window.location.origin) return null
    const path = `${u.pathname}${u.search}${u.hash}`
    return path.startsWith('/') && !path.startsWith('//') ? path : null
  } catch {
    return null
  }
}
