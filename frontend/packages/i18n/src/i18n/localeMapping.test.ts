/**
 * Copyright (c) 2026 fengsong7889. All Rights Reserved.
 *
 * 本文件为「MFTB 企业一体化管理平台软件」的组成部分。
 * 未经著作权人书面许可，不得使用、复制、修改、再分发或用于任何商业目的。
 * 完整许可条款见仓库根目录 LICENSE 文件。
 */
import { describe, expect, it } from 'vitest'
import { antdLocaleKey, dayjsLocaleKey, htmlLangAttr } from './localeMapping'

/**
 * 界面语言 → 第三方库 locale 的映射。
 *
 * 钉住两个此前一直存在的错法：
 * 1. 旧 bootstrap 只分「en 用英文、其余一律繁中」。简体中文启用后，antd 的分页/清空等
 *    内置文案与 dayjs 星期表头会保持繁体（週日），而正文已是简体——同一屏两种字形。
 *    ja/ko/ru 同样一直是繁体内置文案。
 * 2. `<html lang>` 从没跟随语言变化，一直停在 index.html 写死的 zh-TW。
 */
describe('语言 → antd / dayjs / html lang 映射', () => {
  it('六种已注册语言各自落到对应的 locale', () => {
    expect(antdLocaleKey('zh-TW')).toBe('zh_TW')
    expect(antdLocaleKey('zh-CN')).toBe('zh_CN')
    expect(antdLocaleKey('en')).toBe('en_US')
    expect(antdLocaleKey('ja')).toBe('ja_JP')
    expect(antdLocaleKey('ko')).toBe('ko_KR')
    expect(antdLocaleKey('ru')).toBe('ru_RU')

    expect(dayjsLocaleKey('zh-CN')).toBe('zh-cn')
    expect(dayjsLocaleKey('ja')).toBe('ja')
    expect(dayjsLocaleKey('ko')).toBe('ko')
    expect(dayjsLocaleKey('ru')).toBe('ru')
  })

  it('简体中文不得再拿到繁体内置文案（这条正是旧实现的行为）', () => {
    expect(antdLocaleKey('zh-CN')).not.toBe(antdLocaleKey('zh-TW'))
    expect(dayjsLocaleKey('zh-CN')).not.toBe(dayjsLocaleKey('zh-TW'))
  })

  it('语言代码的区域/变体后缀都能识别', () => {
    expect(antdLocaleKey('en-US')).toBe('en_US')
    expect(antdLocaleKey('zh-Hans')).toBe('zh_CN')
    expect(antdLocaleKey('ZH-CN')).toBe('zh_CN')
  })

  it('未登记的语言回退繁中，但 html lang 仍如实透传当前语言', () => {
    expect(antdLocaleKey('th')).toBe('zh_TW')
    expect(dayjsLocaleKey('th')).toBe('zh-tw')
    expect(htmlLangAttr('th')).toBe('th')
  })

  it('语言为空时保持历史默认（zh-TW），不写空 lang', () => {
    expect(antdLocaleKey(undefined)).toBe('zh_TW')
    expect(htmlLangAttr(undefined)).toBe('zh-TW')
    expect(htmlLangAttr('   ')).toBe('zh-TW')
    expect(htmlLangAttr('zh-CN')).toBe('zh-CN')
  })
})
