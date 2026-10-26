/**
 * 登录密码强度策略（前端实时反馈版）
 *
 * 与后端 `PasswordPolicy.java` 同一套口径：后端是最终裁决，这里负责在用户输入时逐项打勾，
 * 两侧规则必须一起修改，否则会出现「界面绿灯、提交被拒」。
 *
 * 规则来源：主流企业身份系统（Microsoft Entra ID / Okta / 阿里云 RAM）通行做法——
 * 长度下限 8、四类字符至少三类、禁止个人身份信息、禁止常见弱口令与连续/重复序列。
 */

export const PASSWORD_MIN_LENGTH = 8
export const PASSWORD_MAX_LENGTH = 32
export const PASSWORD_MIN_CATEGORIES = 3

/** 个人信息片段达到该长度才判定，避免两字姓名等被误伤 */
const PERSONAL_TOKEN_MIN_LENGTH = 3
/** 连续升/降序列达到该长度视为顺序口令 */
const SEQUENCE_MIN_LENGTH = 5
/** 单一字符占比阈值 */
const REPEAT_RATIO = 0.7

/** 常见弱口令黑名单（与后端 BLOCKED_PASSWORDS 一致） */
const BLOCKED_PASSWORDS = new Set([
  '12345678', '123456789', '1234567890', '88888888', '66666666', '00000000',
  'password', 'password1', 'passw0rd', 'p@ssword', 'p@ssw0rd',
  'abc123456', 'abcd1234', '1234abcd', 'iloveyou', 'qwerty123', 'qwertyui',
  'admin123', 'admin888', 'admin123456', 'root1234', 'test1234', 'guest123',
  'asdasd123', 'a1b2c3d4', '1q2w3e4r', '1qaz2wsx', 'zhao123456', 'woaini1314',
])

/** 规则标识：文案由调用方用 i18n 渲染，避免工具层绑定语言包 */
export type PasswordRuleKey = 'length' | 'category' | 'personal' | 'common'

export interface PasswordRuleState {
  key: PasswordRuleKey
  passed: boolean
}

export interface PasswordIdentity {
  /** 登录账号 */
  account?: string
  /** 工号 */
  empId?: string
  /** 姓名 */
  name?: string
  /** 证件号 */
  idNumber?: string
}

export type PasswordStrength = 'weak' | 'medium' | 'strong' | 'veryStrong'

export interface PasswordAssessment {
  /** 空值时不判分，界面保持中性，避免一开始就满屏红 */
  empty: boolean
  rules: PasswordRuleState[]
  strength: PasswordStrength
  passed: boolean
}

/** 命中的字符类别数：大写/小写/数字/特殊字符 */
export function countCharCategories(value: string): number {
  let upper = false
  let lower = false
  let digit = false
  let special = false
  for (const char of value) {
    if (char >= 'A' && char <= 'Z') upper = true
    else if (char >= 'a' && char <= 'z') lower = true
    else if (char >= '0' && char <= '9') digit = true
    else if (!/[a-zA-Z0-9]/.test(char)) special = true
  }
  return [upper, lower, digit, special].filter(Boolean).length
}

/** 单一字符占比过高（如 aaaaaaaa） */
function isRepeatedChars(value: string): boolean {
  if (value.length < PASSWORD_MIN_LENGTH) return false
  const counts = new Map<string, number>()
  let max = 0
  for (const char of value) {
    const next = (counts.get(char) ?? 0) + 1
    counts.set(char, next)
    max = Math.max(max, next)
  }
  return max / value.length >= REPEAT_RATIO
}

/** 存在长度≥5 的连续升序或降序序列（abcde、9876543） */
function hasLongSequence(value: string): boolean {
  let asc = 1
  let desc = 1
  for (let i = 1; i < value.length; i++) {
    const diff = value.charCodeAt(i) - value.charCodeAt(i - 1)
    asc = diff === 1 ? asc + 1 : 1
    desc = diff === -1 ? desc + 1 : 1
    if (asc >= SEQUENCE_MIN_LENGTH || desc >= SEQUENCE_MIN_LENGTH) return true
  }
  return false
}

/** 常见弱口令 / 纯重复 / 连续序列 */
export function isCommonWeak(value: string): boolean {
  const lower = value.toLowerCase()
  if (BLOCKED_PASSWORDS.has(lower)) return true
  // 去掉数字与符号后的纯字母形态再比一次（password123 → password）
  if (BLOCKED_PASSWORDS.has(lower.replace(/[^a-z]/g, ''))) return true
  return isRepeatedChars(lower) || hasLongSequence(lower)
}

/** 密码中包含本人账号/工号/姓名/证件号（忽略大小写） */
export function containsIdentityInfo(value: string, identity: PasswordIdentity): boolean {
  const lower = value.toLowerCase()
  return [identity.account, identity.empId, identity.name, identity.idNumber]
    .some(token => {
      const normalized = token?.trim().toLowerCase() ?? ''
      return normalized.length >= PERSONAL_TOKEN_MIN_LENGTH && lower.includes(normalized)
    })
}

/**
 * 逐项评估新密码。
 * <p>首尾空格单独并入长度规则口径：成熟系统拒绝而非静默 trim，
 * 否则用户会以为设置成功、实际密码与自己记住的不一致。
 */
export function assessPassword(value: string, identity: PasswordIdentity): PasswordAssessment {
  if (!value) {
    return {
      empty: true,
      rules: [
        { key: 'length', passed: false },
        { key: 'category', passed: false },
        { key: 'personal', passed: false },
        { key: 'common', passed: false },
      ],
      strength: 'weak',
      passed: false,
    }
  }
  const lengthOk = value === value.trim()
    && value.length >= PASSWORD_MIN_LENGTH && value.length <= PASSWORD_MAX_LENGTH
  const categoryOk = countCharCategories(value) >= PASSWORD_MIN_CATEGORIES
  const personalOk = !containsIdentityInfo(value, identity)
  const commonOk = !isCommonWeak(value)
  const rules: PasswordRuleState[] = [
    { key: 'length', passed: lengthOk },
    { key: 'category', passed: categoryOk },
    { key: 'personal', passed: personalOk },
    { key: 'common', passed: commonOk },
  ]
  const passed = rules.every(rule => rule.passed)
  return { empty: false, rules, passed, strength: strengthOf(value.length, countCharCategories(value), passed) }
}

/** 强度分级：未过策略只到「中」，达标后按长度与类别数上探 */
function strengthOf(length: number, categories: number, passed: boolean): PasswordStrength {
  if (!passed) return categories >= PASSWORD_MIN_CATEGORIES ? 'medium' : 'weak'
  if (length >= 12 && categories >= 4) return 'veryStrong'
  if (length >= 12 || categories >= 4) return 'strong'
  return 'medium'
}

/** 强度对应的色值（遵循全局设计令牌：危险/警告/信息/成功） */
export const STRENGTH_COLOR: Record<PasswordStrength, string> = {
  weak: '#FF4D4F',
  medium: '#FA8C16',
  strong: '#1890FF',
  veryStrong: '#52C41A',
}

/** 强度对应的分段（4 段进度条） */
export const STRENGTH_LEVEL: Record<PasswordStrength, number> = {
  weak: 1,
  medium: 2,
  strong: 3,
  veryStrong: 4,
}
