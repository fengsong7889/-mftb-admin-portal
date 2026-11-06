/**
 * Copyright (c) 2026 fengsong7889. All Rights Reserved.
 *
 * 本文件为「MFTB 企业一体化管理平台软件」的组成部分。
 * 未经著作权人书面许可，不得使用、复制、修改、再分发或用于任何商业目的。
 * 完整许可条款见仓库根目录 LICENSE 文件。
 */
import type { CoverageVO, LanguageVO, TranslationVO } from '@/api/translation'

/**
 * 完成率的展示模型（全站口径）。
 *
 * <p>为什么要在前端单独立一个纯函数：2026-11-05 那次简体中文大面积回退英文，
 * 页面上一切正常——「翻译统计」与「语言管理」的完成率都是 100%。原因是这两处各自
 * 用 `fields.length`（= `sys_translation` 记录数）当分母，前端静态包里存在但尚未同步
 * 入库的词条**根本不在分母里**。后端 `coverage()` 同样是这个口径。
 * 现在分母改由后端按「语言包镜像 ∪ 库字段」算，前端只负责渲染与降级标注，
 * 不再自己发明分母。
 */
export interface CoverageRow {
  code: string
  name: string
  flag: string
  /** 需译全集（镜像文案 key ∪ 库里字段） */
  total: number
  translated: number
  /** 0~100 整数百分比 */
  rate: number
  status: CoverageVO['status']
  /** 镜像里有、库里还没同步的 key 数——>0 就说明有人加了文案没跑同步 */
  missingInDb: number
  /** true = 后端 coverage 不可用，只能按库里记录数估算（读数会偏高，必须标注） */
  estimated: boolean
}

/** 库里字段数：仅在 coverage 不可用时当兜底分母 */
function countByLanguage(fields: TranslationVO[], langCode: string): { total: number; translated: number } {
  const total = fields.length
  const translated = fields.filter(f => (f.translations?.[langCode] ?? '').trim()).length
  return { total, translated }
}

const round = (value: number) => Math.round(value * 100)

/**
 * 把「语言列表 + 各语言 coverage」合成可渲染的行。
 *
 * @param langs           sys_language 已启用语言（顺序即展示顺序）
 * @param coverages       与 langs 同序的后端结果；元素为 null 表示该语言取数失败（后端不可用）
 * @param fallbackFields  库里全部字段，用于 coverage 缺失时兜底
 */
export function buildCoverageRows(
  langs: LanguageVO[],
  coverages: Array<CoverageVO | null>,
  fallbackFields: TranslationVO[],
): CoverageRow[] {
  return langs.map((lang, index) => {
    const coverage = coverages[index]
    if (coverage && coverage.total > 0) {
      return {
        code: lang.code,
        name: lang.name,
        flag: lang.flag,
        total: coverage.total,
        translated: coverage.translated,
        rate: round(coverage.rate),
        status: coverage.status,
        missingInDb: coverage.missingInDb ?? 0,
        estimated: false,
      }
    }
    // 兜底口径必须显式标出来：它就是当年把 51.4% 报成 100% 的那套算法，
    // 静默使用等于把假绿重新接回页面
    const { total, translated } = countByLanguage(fallbackFields, lang.code)
    return {
      code: lang.code,
      name: lang.name,
      flag: lang.flag,
      total,
      translated,
      rate: total > 0 ? round(translated / total) : 0,
      status: translated === 0 ? 'not_configured' : 'partial',
      missingInDb: 0,
      estimated: true,
    }
  })
}

/** 平均完成率（按全站口径的分子/分母求和，而不是把各行百分比再平均一次） */
export function averageRate(rows: CoverageRow[]): number {
  const total = rows.reduce((sum, row) => sum + row.total, 0)
  if (total === 0) return 0
  const translated = rows.reduce((sum, row) => sum + row.translated, 0)
  return Math.round((translated / total) * 100)
}

/** 是否存在「前端有文案但库里还没同步」的缺口（任何语言都算） */
export function hasMissingInDb(rows: CoverageRow[]): boolean {
  return rows.some(row => row.missingInDb > 0)
}

/** 是否有行是兜底估算出来的——页面据此挂出「读数不是全站口径」的提示 */
export function hasEstimatedRow(rows: CoverageRow[]): boolean {
  return rows.some(row => row.estimated)
}
