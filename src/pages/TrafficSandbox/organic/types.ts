/**
 * Copyright (c) 2026 fengsong7889. All Rights Reserved.
 *
 * 本文件为「MFTB 企业一体化管理平台软件」的组成部分。
 * 未经著作权人书面许可，不得使用、复制、修改、再分发或用于任何商业目的。
 * 完整许可条款见仓库根目录 LICENSE 文件。
 */
import type { AppType, Region } from '@mftb/contracts/recommendConstants'

/** 仅供沙盘展示的模型，不是生产计分接口。 */
export type Dimension = 'commercial' | 'store' | 'platform'
export type Eligibility = 'ranked' | 'bottom' | 'filtered' | 'pending'
export type MatchStatus = 'scored' | 'deducted' | 'missed' | 'disabled' | 'inapplicable' | 'missing' | 'insufficient' | 'stale' | 'error'
export type SampleScene = 'normal' | 'zero' | 'config' | 'sample' | 'stale' | 'deduction' | 'error'
export type PointId = 'A' | 'B'
export type SimulationMode = 'distance' | 'full'
export interface Coordinate { lat: number; lng: number }
export interface SamplePoint extends Coordinate { id: PointId; label: string }

export interface RuleInput {
  label: string
  value: string | number | boolean | null
  unit?: string
}
export interface RulePart {
  label: string
  score: number
  status?: string
  reference?: string
  validFrom?: string
  validTo?: string
}
export interface RuleResult {
  ruleCode: string
  name: string
  dimension: Dimension
  ruleStatus: 'enabled' | 'disabled' | 'inapplicable'
  matchStatus: MatchStatus
  reasonCode: string
  reason: string
  metric: string
  metricValue: string | number | boolean | null
  unit: string | null
  inputs: RuleInput[]
  matchedTier: string | null
  window: string
  windowStart: string | null
  windowEnd: string | null
  sampleSize: number | null
  rawScore: number | null
  effectiveMax: number | null
  sourceRefs: string[]
  observedAt: string
  expression: string
  parts?: RulePart[]
}
export interface DimensionResult {
  dimension: Dimension
  rawScore: number | null
}
export interface StoreResult {
  storeId: string
  storeCode: string
  storeName: string
  merchantId: string
  merchantName: string
  regionId: Region
  category: string
  coordinate: Coordinate | null
  eligibility: Eligibility
  eligibilityReason: string
  rankingBucket: 'normal' | 'bottom' | 'excluded'
  totalScore: number | null
  globalRank: number | null
  displayPosition: number | null
  regionRank: number | null
  rankPopulation: number
  regionPopulation: number
  sameScore: boolean
  shopRating: number
  orders30d: number
  distanceKm: number | null
  dimensions: DimensionResult[]
  rules: RuleResult[]
}
export interface ScoreSnapshot {
  dataMode: 'demo'
  scenarioId: string
  brand: AppType
  channel: number
  algorithmId: string
  configScope: string
  configVersion: string
  configDraftVersion: string | null
  configSavedVersion: string | null
  configExecutedVersion: string | null
  configUpdatedBy: string | null
  configUpdatedAt: string | null
  simulationMode: SimulationMode
  evaluationTime: string
  observedAt: string
  coordinateSystem: 'WGS84'
  location: SamplePoint
  snapshotId: string
  candidateSetId: string
  stores: StoreResult[]
}
export interface SimulationComparison {
  contextId: string
  pointA: SamplePoint
  pointB: SamplePoint | null
  scoreA: number | null
  scoreB: number | null
  rankA: number | null
  rankB: number | null
  scoreDelta: number | null
  rankDeltaText: string
  eligibilityTransition: string | null
  changedRuleCodes: string[]
}
export interface DisplayFilters {
  keyword: string
  merchantId: string
  regions: Region[]
  eligibility: Eligibility | 'all'
  scoreBand: string
}
export interface BoardQuery extends DisplayFilters {
  brand: AppType
  point: PointId
  scene: SampleScene
  page: number
  size: number
}
