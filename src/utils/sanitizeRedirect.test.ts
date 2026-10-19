import { describe, expect, it } from 'vitest'
import { sanitizeRedirectPath } from './sanitizeRedirect'

/**
 * 登录回跳白名单校验（安全边界）。
 *
 * 这组用例钉住的是「开放重定向」防护：?redirect= 完全由外部控制（钉钉链接、他人转发的 URL），
 * 任何一条绕过都等于把登录页变成钓鱼跳板——用户输完密码就被送到攻击者站点。
 * 因此宁可误拒（回落到默认首页，用户多点一次），不可误放。
 */
describe('sanitizeRedirectPath', () => {
  it('放行站内绝对路径并保留查询参数（钉钉日报链接的主要形态）', () => {
    expect(sanitizeRedirectPath('/rdm-daily?date=2026-10-19&type=morning'))
      .toBe('/rdm-daily?date=2026-10-19&type=morning')
    expect(sanitizeRedirectPath('/rdm-daily-report-rules')).toBe('/rdm-daily-report-rules')
    expect(sanitizeRedirectPath('/')).toBe('/')
  })

  it('保留 hash 片段', () => {
    expect(sanitizeRedirectPath('/rdm-daily?date=2026-10-19#project-7'))
      .toBe('/rdm-daily?date=2026-10-19#project-7')
  })

  it('容忍前后空格', () => {
    expect(sanitizeRedirectPath('  /rdm-daily  ')).toBe('/rdm-daily')
  })

  it('拒绝协议相对 URL（// 与 /\\ 两种变体）', () => {
    expect(sanitizeRedirectPath('//evil.example.com/rdm-daily')).toBeNull()
    expect(sanitizeRedirectPath('/\\evil.example.com')).toBeNull()
    expect(sanitizeRedirectPath('///evil.example.com')).toBeNull()
  })

  it('拒绝带 scheme 的绝对 URL 与脚本伪协议', () => {
    expect(sanitizeRedirectPath('https://evil.example.com')).toBeNull()
    expect(sanitizeRedirectPath('http://evil.example.com/rdm-daily')).toBeNull()
    expect(sanitizeRedirectPath('javascript:alert(1)')).toBeNull()
    expect(sanitizeRedirectPath('data:text/html,<script>alert(1)</script>')).toBeNull()
  })

  it('拒绝相对路径（不以 / 开头，语义不确定）', () => {
    expect(sanitizeRedirectPath('rdm-daily')).toBeNull()
    expect(sanitizeRedirectPath('./rdm-daily')).toBeNull()
    expect(sanitizeRedirectPath('../portal')).toBeNull()
  })

  it('拒绝空值与空白，交由调用方回落默认首页', () => {
    expect(sanitizeRedirectPath(null)).toBeNull()
    expect(sanitizeRedirectPath(undefined)).toBeNull()
    expect(sanitizeRedirectPath('')).toBeNull()
    expect(sanitizeRedirectPath('   ')).toBeNull()
  })

  it('拒绝指向其他 origin 的完整站内样式路径（URL 解析后 origin 不一致）', () => {
    // 形如 /redirect?to=... 的合法站内路径本身放行，但任何解析出跨 origin 的值都必须拒绝
    const cross = `${window.location.origin.replace(/^https?:/, 'http:').replace(/localhost/, '127.0.0.1')}/rdm-daily`
    // 该值以字母开头（http:）会被 scheme 规则先拦下
    expect(sanitizeRedirectPath(cross)).toBeNull()
  })
})
