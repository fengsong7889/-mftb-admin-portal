import { describe, expect, it, beforeAll } from 'vitest'
import i18n from '../i18n'
import { getSystemDisplayName } from './portalSystems'

/**
 * 系统名称全局一致性的回归锁。
 * <p>为什么单独测：门户、侧边栏、系统切换器、首页、授权中心历史上各自取名，
 * 出现过「HR 系統 / 人力資源系統」两套名字并存。本表以企业门户为唯一真值，
 * 任何一处改名都必须同步 `sys_system` 种子与 5 个语言包，否则此用例失败。
 * key = sys_system.code（i18n 归一化前的原始编码）。
 */
const AUTHORITATIVE_NAMES: Record<string, string> = {
  ads: '廣告推薦系統',
  merchant: '商戶運營系統',
  seller: '商家工作台',
  search: '搜索運營系統',
  finance: '財務系統',
  ai: '人工智能管理系統',
  hr: '人力資源系統',
  eam: '物資管理系統',
  rdm: '產研協同系統',
  oa: '協同辦公系統',
  iam: '權限中心',
  platform: '平台配置',
  i18n: '翻譯中心',
}

const LANGUAGES = ['zh-TW', 'en', 'ja', 'ko', 'ru'] as const

beforeAll(async () => {
  await i18n.changeLanguage('zh-TW')
})

describe('系统名称全局统一（以企业门户为准）', () => {
  it('繁中下 13 个业务系统全部返回门户真值名称，不受 sys_system.name 旧写法影响', () => {
    for (const [code, expected] of Object.entries(AUTHORITATIVE_NAMES)) {
      // 故意传入数据库里的旧名称，验证语言包优先于 sys_system.name
      expect(getSystemDisplayName(i18n.getFixedT('zh-TW'), { code, name: `${code} 旧名` })).toBe(expected)
    }
  })

  it.each(LANGUAGES)('%s 语言下全部系统都有本地化名称，不泄漏中文兜底', async (lang) => {
    const t = i18n.getFixedT(lang)
    for (const code of Object.keys(AUTHORITATIVE_NAMES)) {
      const name = getSystemDisplayName(t, { code, name: AUTHORITATIVE_NAMES[code] }, lang)
      expect(name).toBeTruthy()
      if (lang !== 'zh-TW') {
        expect(name).not.toBe(AUTHORITATIVE_NAMES[code])
      }
    }
  })

  it('自定义系统无语言包时回退原始名称，非中文界面优先回退英文名', () => {
    const zh = i18n.getFixedT('zh-TW')
    const en = i18n.getFixedT('en')
    expect(getSystemDisplayName(zh, { code: 'future', name: '未來系統' }, 'zh-TW')).toBe('未來系統')
    expect(getSystemDisplayName(en, { code: 'future', name: '未來系統', nameEn: 'Future' }, 'en')).toBe('Future')
    // 非中文但没配英文名时仍只能用原始名，避免渲染出空白
    expect(getSystemDisplayName(en, { code: 'future', name: '未來系統' }, 'en')).toBe('未來系統')
  })

  it('翻译中心编码别名（i18n / translation）归一到同一套文案', () => {
    const t = i18n.getFixedT('zh-TW')
    expect(getSystemDisplayName(t, { code: 'i18n', name: '翻譯中心' })).toBe('翻譯中心')
    expect(getSystemDisplayName(t, { code: 'translation', name: '翻譯中心' })).toBe('翻譯中心')
  })
})
