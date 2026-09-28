import { describe, expect, it } from 'vitest'
import {
  assessPassword,
  countCharCategories,
  isCommonWeak,
  PASSWORD_MIN_CATEGORIES,
} from './passwordPolicy'

/**
 * 密码策略纯函数测试（与后端 PasswordPolicyTest 同一批用例，保证两侧口径一致）。
 */
const IDENTITY = { account: 'MF00001', empId: 'MF00001', name: '張三丰' }

describe('assessPassword 规则清单', () => {
  it('空值不判分，避免弹窗一打开就满屏报错', () => {
    const result = assessPassword('', IDENTITY)
    expect(result.empty).toBe(true)
    expect(result.passed).toBe(false)
    expect(result.rules.every(rule => !rule.passed)).toBe(true)
  })

  it('合规密码四项全绿', () => {
    const result = assessPassword('Kx7#pq2m', IDENTITY)
    expect(result.passed).toBe(true)
    expect(result.rules.every(rule => rule.passed)).toBe(true)
  })

  it('长度：7 位与首尾空格都不通过长度项', () => {
    const short = assessPassword('Kx7#pq2', IDENTITY).rules.find(r => r.key === 'length')
    const spaced = assessPassword(' Kx7#pq2m', IDENTITY).rules.find(r => r.key === 'length')
    expect(short?.passed).toBe(false)
    expect(spaced?.passed).toBe(false)
  })

  it('字符类别：少于三类不通过', () => {
    expect(countCharCategories('abcdefgh')).toBe(1)
    expect(countCharCategories('Abcd3f5x')).toBe(3)
    expect(PASSWORD_MIN_CATEGORIES).toBe(3)
    const weakCategories = assessPassword('abcdefghijkl', IDENTITY).rules.find(r => r.key === 'category')
    expect(weakCategories?.passed).toBe(false)
  })

  it('个人信息：含账号/工号/姓名命中 personal 项', () => {
    const hit = assessPassword('Kx#MF00001q2', IDENTITY).rules.find(r => r.key === 'personal')
    expect(hit?.passed).toBe(false)
    // 两字以内姓名不做片段匹配，避免误伤
    expect(assessPassword('Kx7#pq2m', { name: '李' }).rules.find(r => r.key === 'personal')?.passed).toBe(true)
  })

  it('弱口令：黑名单、纯重复、5 位以上连续序列都算弱', () => {
    expect(isCommonWeak('12345678')).toBe(true)
    expect(isCommonWeak('Passw0rd')).toBe(true)
    expect(isCommonWeak('aaaaaaaa')).toBe(true)
    expect(isCommonWeak('Abcdefgh')).toBe(true)
    expect(isCommonWeak('Kx7#pq2m')).toBe(false)
    // 4 位短序列不足以判定为顺序口令
    expect(isCommonWeak('Kx7#pq1234')).toBe(false)
  })
})

describe('强度分级', () => {
  it('未满足策略时强度封顶「中」', () => {
    // 四类字符齐但含本人账号 → 不放行，不能显示成「強」
    expect(assessPassword('Kx7#MF00001q2', IDENTITY).strength).toBe('medium')
    // 单一类别 / 黑名单口令 → 「弱」
    expect(assessPassword('abcdefghijkl', IDENTITY).strength).toBe('weak')
    expect(assessPassword('12345678', IDENTITY).strength).toBe('weak')
  })

  it('达标后按长度与类别数上探', () => {
    expect(assessPassword('Abcd3f5x', IDENTITY).strength).toBe('medium')
    expect(assessPassword('Kx7#pq2m', IDENTITY).strength).toBe('strong')
    expect(assessPassword('Tr4in#Golf99', IDENTITY).strength).toBe('veryStrong')
  })
})
