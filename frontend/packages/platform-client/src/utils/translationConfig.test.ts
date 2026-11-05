/**
 * Copyright (c) 2026 fengsong7889. All Rights Reserved.
 *
 * 本文件为「MFTB 企业一体化管理平台软件」的组成部分。
 * 未经著作权人书面许可，不得使用、复制、修改、再分发或用于任何商业目的。
 * 完整许可条款见仓库根目录 LICENSE 文件。
 */
import { describe, expect, it } from 'vitest'
import {
  COUNTRY_INFO,
  LANG_INFO,
  SYS_LANG_ORDER,
  countrySysName,
  langSysName,
  sysLangIndex,
} from './translationConfig'

/**
 * 语言/国家显示名的下标口径测试。
 *
 * LANG_INFO 与 COUNTRY_INFO 的 `names` 是按 SYS_LANG_ORDER 排列的 5 列，
 * 而 zh-CN 已是一等可选语言。早期没有为 zh-CN 做映射，`indexOf('zh-CN')` 返回 -1，
 * 于是简体中文界面下：语言下拉退回母语名、国家下拉退回英文名（United States），
 * 用户看到的是「界面简体、选项英文」。这里钉住修复后的口径，并保证另外 5 语不受影响。
 */
describe('简体中文语境下的语言/国家显示名', () => {
  it('SYS_LANG_ORDER 的中文列（下标 0）就是 zh-CN 的回退列', () => {
    expect(SYS_LANG_ORDER).toEqual(['zh-TW', 'en', 'ja', 'ko', 'ru'])
    expect(sysLangIndex('zh-CN')).toBe(0)
    expect(sysLangIndex('ja')).toBe(2)
    // 未登记在 names 列里的语言仍返回 -1，由调用方按各自口径降级
    expect(sysLangIndex('fr')).toBe(-1)
  })

  it('六种已注册语言在简体中文下都显示简体名', () => {
    expect(langSysName('zh-TW', 'zh-CN')).toBe('繁体中文')
    expect(langSysName('zh-CN', 'zh-CN')).toBe('简体中文')
    expect(langSysName('en', 'zh-CN')).toBe('英文')
    expect(langSysName('ja', 'zh-CN')).toBe('日文')
    expect(langSysName('ko', 'zh-CN')).toBe('韩文')
    expect(langSysName('ru', 'zh-CN')).toBe('俄文')
  })

  it('未覆盖到的长尾语言在简体中文下回退母语名，不返回空', () => {
    // 这些语言没在 sys_language 注册，语言下拉选不到；回退 native 是为了避免出现空白标签
    expect(langSysName('th', 'zh-CN')).toBe(LANG_INFO.th.native)
    expect(langSysName('__unknown__', 'zh-CN')).toBe('__unknown__')
  })

  it('注册语言所属国家在简体中文下显示简体名', () => {
    expect(countrySysName('china', 'zh-CN')).toBe('中国')
    expect(countrySysName('usa', 'zh-CN')).toBe('美国')
    expect(countrySysName('japan', 'zh-CN')).toBe('日本')
    expect(countrySysName('south_korea', 'zh-CN')).toBe('韩国')
    expect(countrySysName('russia', 'zh-CN')).toBe('俄罗斯')
  })

  it('长尾国家在简体中文下回退中文列而不是英文列', () => {
    expect(countrySysName('france', 'zh-CN')).toBe(COUNTRY_INFO.france.names[0])
    expect(countrySysName('france', 'zh-CN')).not.toBe(COUNTRY_INFO.france.names[1])
    expect(countrySysName('__unknown__', 'zh-CN')).toBe('__unknown__')
  })

  it('另外 5 种界面语言的取列口径不变（防止把已有语言也一起改掉）', () => {
    SYS_LANG_ORDER.forEach((lang, index) => {
      expect(sysLangIndex(lang)).toBe(index)
      expect(langSysName('ja', lang)).toBe(LANG_INFO.ja.names[index])
      expect(countrySysName('usa', lang)).toBe(COUNTRY_INFO.usa.names[index])
    })
    // 未知语言仍然走英文列兜底，与修复前一致
    expect(countrySysName('usa', 'fr')).toBe(COUNTRY_INFO.usa.names[1])
  })
})
