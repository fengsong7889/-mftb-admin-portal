/**
 * Copyright (c) 2026 fengsong7889. All Rights Reserved.
 *
 * 本文件为「MFTB 企业一体化管理平台软件」的组成部分。
 * 未经著作权人书面许可，不得使用、复制、修改、再分发或用于任何商业目的。
 * 完整许可条款见仓库根目录 LICENSE 文件。
 */
import { AppType, AREA_TO_REGIONS, Region } from '@mftb/contracts/recommendConstants'
import { POINTS, SCENES } from './fixtures'
import type { BoardQuery, Coordinate } from './types'

export const DEFAULT_QUERY: BoardQuery = { brand: AppType.SHANFENG, point: 'A', scene: 'normal', keyword: '', merchantId: '', regions: [], eligibility: 'all', scoreBand: '', page: 1, size: 20 }
export const scoreText = (value: number | null | undefined): string => value == null ? '—' : value.toFixed(2)
export const rankText = (value: number | null | undefined, population?: number): string => value == null ? '—' : population == null ? `${value}` : `${value} / ${population}`
export const brandLabel = (brand: AppType): string => brand === AppType.MFOOD ? 'mFood' : '閃蜂'

export function expandRegions(values: (string | number)[]): Region[] {
  return [...new Set(values.flatMap(v => AREA_TO_REGIONS[String(v)] ?? [Number(v) as Region]).filter(v => Number.isInteger(v) && v >= 1 && v <= 11))]
}
export function readBoardQuery(params: URLSearchParams): BoardQuery {
  const eligibility = params.get('status')
  const scene = SCENES.find(s => s.value === params.get('scene'))?.value ?? 'normal'
  const page = Number(params.get('page') || 1)
  const size = Number(params.get('size') || 20)
  return { ...DEFAULT_QUERY, brand: params.get('brand') === String(AppType.MFOOD) ? AppType.MFOOD : AppType.SHANFENG,
    point: params.get('point') === 'B' ? 'B' : 'A', scene,
    keyword: (params.get('keyword') ?? '').slice(0, 100), merchantId: params.get('merchant') ?? '',
    regions: expandRegions((params.get('regions') ?? '').split(',').filter(Boolean)),
    eligibility: eligibility === 'ranked' || eligibility === 'bottom' || eligibility === 'filtered' || eligibility === 'pending' ? eligibility : 'all',
    scoreBand: params.get('band') ?? '',
    page: Number.isInteger(page) && page > 0 ? Math.min(page, 120) : 1, size: [10, 20, 50, 100].includes(size) ? size : 20 }
}
export function coordinateError(lat: number | null, lng: number | null): string | null {
  if (lat == null || lng == null) return '請完整填寫經度與緯度'
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return '經緯度必須為有效數字'
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return '緯度須為 -90～90，經度須為 -180～180'
  return null
}
export function matchSamplePoint(coordinate: Coordinate): 'A' | 'B' | null {
  // 仅精确匹配预设，不把附近手填点吸附成已计算位置。
  return Object.values(POINTS).find(p => Math.abs(p.lat - coordinate.lat) < 1e-8 && Math.abs(p.lng - coordinate.lng) < 1e-8)?.id ?? null
}
export function rankChange(a: number | null, b: number | null): string {
  if (a == null && b == null) return '不可比較'
  if (a == null) return '新進入'
  if (b == null) return '退出'
  return a === b ? '持平' : a > b ? `提升 ${a - b} 名` : `下降 ${b - a} 名`
}
