/**
 * Copyright (c) 2026 fengsong7889. All Rights Reserved.
 *
 * 本文件为「MFTB 企业一体化管理平台软件」的组成部分。
 * 未经著作权人书面许可，不得使用、复制、修改、再分发或用于任何商业目的。
 * 完整许可条款见仓库根目录 LICENSE 文件。
 */
/**
 * 星期标签读取器 — AdSales 与 PromotionSalesConfig 的日期选择器共用。
 *
 * <p>收口成一个函数的原因：语言包里的 `adSales.weekdayFull` / `adSales.weekdayShort` 是**数组**，
 * 而 `t(key, { returnObjects: true }) as string[]` 这个写法在数组没取到时不会报错，只会拿到字符串，
 * 随后 `WEEKDAY_LABELS[date.day()]` 静默返回 undefined（或整串 key 文本）。2026-11-06 会议模块
 * 已因同一写法在简体中文下把整页打成错误边界，这里按同一口径把类型校验收口，不再依赖每个调用点自觉。
 * <p>条数契约与兜底文案都由繁中真源给出（readTextArray），不在代码里钉中文。
 */
import type { TFunction } from 'i18next'
import { readTextArray } from '@/i18n'

/** 读取全名星期标签（ns 由调用方的 useTranslation('adSales') 决定，真源路径需显式给） */
export function readWeekdayFull(t: TFunction): string[] {
  return readTextArray(t, 'weekdayFull', 'adSales.weekdayFull')
}

/** 读取单字星期标签 */
export function readWeekdayShort(t: TFunction): string[] {
  return readTextArray(t, 'weekdayShort', 'adSales.weekdayShort')
}
