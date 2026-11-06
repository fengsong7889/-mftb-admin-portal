/**
 * Copyright (c) 2026 fengsong7889. All Rights Reserved.
 *
 * 本文件为「MFTB 企业一体化管理平台软件」的组成部分。
 * 未经著作权人书面许可，不得使用、复制、修改、再分发或用于任何商业目的。
 * 完整许可条款见仓库根目录 LICENSE 文件。
 */

/**
 * 界面语言 → 第三方库 locale 的映射（antd / dayjs / html lang 属性）。
 *
 * 单独做成纯函数有三个原因：
 * 1. 入口装配文件（src/bootstrap.tsx）是四个工程共用的唯一装配点，改它风险大且难以单测；
 *    把「选哪个 locale」的判断挪到这里，入口只负责把字符串换成 import 进来的对象。
 * 2. 旧实现只有「en 用英文、其余一律用繁中」两个分支。简体中文启用后这个分支就错了：
 *    antd 的分页/清空/确认等内置文案与 dayjs 的星期表头会持续显示繁体（週日/週一…），
 *    而页面正文已经是简体——同一屏两种字形，用户会当成显示坏了。
 *    ja/ko/ru 同理：内置文案此前一直是繁体。
 * 3. `document.documentElement.lang` 此前固定在 index.html 的 `zh-TW`，切换语言从不更新；
 *    读屏器与搜索引擎因此一直按繁体中文播报当前界面。
 */

/** antd locale 键（对应 antd/locale/<key>） */
export function antdLocaleKey(lang?: string): 'en_US' | 'zh_CN' | 'zh_TW' | 'ja_JP' | 'ko_KR' | 'ru_RU' {
  const value = (lang ?? '').toLowerCase()
  if (value.startsWith('en')) return 'en_US'
  if (value.startsWith('ja')) return 'ja_JP'
  if (value.startsWith('ko')) return 'ko_KR'
  if (value.startsWith('ru')) return 'ru_RU'
  // zh-CN 必须显式落在 zh_CN：否则简中界面会拿到繁体内置文案
  if (value.startsWith('zh-cn') || value.startsWith('zh-hans')) return 'zh_CN'
  return 'zh_TW'
}

/** dayjs locale 键（对应 dayjs/locale/<key>）；DatePicker 表头与日期格式靠它 */
export function dayjsLocaleKey(lang?: string): 'en' | 'zh-cn' | 'zh-tw' | 'ja' | 'ko' | 'ru' {
  switch (antdLocaleKey(lang)) {
    case 'en_US': return 'en'
    case 'zh_CN': return 'zh-cn'
    case 'ja_JP': return 'ja'
    case 'ko_KR': return 'ko'
    case 'ru_RU': return 'ru'
    default: return 'zh-tw'
  }
}

/**
 * `<html lang>` 应当等于当前界面语言，而不是 index.html 里写死的那个。
 * 未识别的语言代码原样透传（浏览器会按语言名处理，比强行回落 zh-TW 更诚实）。
 */
export function htmlLangAttr(lang?: string): string {
  const value = (lang ?? '').trim()
  return value || 'zh-TW'
}
