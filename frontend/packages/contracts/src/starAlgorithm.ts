/**
 * Copyright (c) 2026 fengsong7889. All Rights Reserved.
 *
 * 本文件为「MFTB 企业一体化管理平台软件」的组成部分。
 * 未经著作权人书面许可，不得使用、复制、修改、再分发或用于任何商业目的。
 * 完整许可条款见仓库根目录 LICENSE 文件。
 */
/** 与后端 StarAlgorithmParams 对齐；不依赖页面、API 或翻译运行时。 */
export const StarTarget = { STORE: 1, PRODUCT: 2 } as const
export type StarTargetType = typeof StarTarget[keyof typeof StarTarget]
export const AdBusinessType = { DELIVERY: 1, GROUP_BUY: 2 } as const
export const StarExposureStrategy = { ROUND_ROBIN: 'roundRobin', RANDOM: 'random' } as const
export type StarExposureStrategyType = typeof StarExposureStrategy[keyof typeof StarExposureStrategy]
export const STAR_SCHEMA_VERSION = 1
export const STAR_INTERVAL = { min: 1, max: 1440, default: 5 } as const

export interface StarProductRules {
  consistencyCheckInterval: number
  exposureStrategy: StarExposureStrategyType
}
export interface StarStoreRules {
  consistencyCheckInterval: number
  merchantExposureStrategy: 'random'
  statusOpen: true
  statusRest: boolean
  statusOverwhelmed: boolean
  statusClosed: boolean
}
type StarVersion = {
  schemaVersion: typeof STAR_SCHEMA_VERSION
  applicableBusinessTypes: [typeof AdBusinessType.GROUP_BUY]
  revision: number
}
export type StarProductParams = StarVersion & {
  targetType: typeof StarTarget.PRODUCT
  productRules: StarProductRules
}
export type StarStoreParams = StarVersion & {
  targetType: typeof StarTarget.STORE
  storeRules: StarStoreRules
  legacyParams?: Record<string, unknown>
}
export type StarParams = StarProductParams | StarStoreParams

const ROOT_FIELDS = ['schemaVersion', 'applicableBusinessTypes', 'targetType', 'revision', 'productRules', 'storeRules', 'legacyParams']
const PRODUCT_FIELDS = ['consistencyCheckInterval', 'exposureStrategy']
const STORE_FIELDS = ['consistencyCheckInterval', 'merchantExposureStrategy', 'statusOpen', 'statusRest', 'statusOverwhelmed', 'statusClosed']
export const isStarParamsObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)
export const hasStarProtocol = (value: Record<string, unknown>) => ROOT_FIELDS.some(field => Object.hasOwn(value, field))
const integer = (value: unknown, min: number, max: number): value is number => typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max
const exactKeys = (value: Record<string, unknown>, fields: string[]) => Object.keys(value).length === fields.length && fields.every(field => Object.hasOwn(value, field))

/** 未知协议返回失败，调用者必须阻止保存；不能把它归一成默认商品配置。 */
export function isStarParams(value: unknown): value is StarParams {
  if (!isStarParamsObject(value) || Object.keys(value).some(field => !ROOT_FIELDS.includes(field))) return false
  if (value.schemaVersion !== STAR_SCHEMA_VERSION || !integer(value.revision, 0, 2147483646)) return false
  if (!Array.isArray(value.applicableBusinessTypes) || value.applicableBusinessTypes.length !== 1 || value.applicableBusinessTypes[0] !== AdBusinessType.GROUP_BUY) return false
  if (value.targetType === StarTarget.PRODUCT) {
    const rules = value.productRules
    return !Object.hasOwn(value, 'storeRules') && !Object.hasOwn(value, 'legacyParams')
      && isStarParamsObject(rules) && exactKeys(rules, PRODUCT_FIELDS)
      && integer(rules.consistencyCheckInterval, STAR_INTERVAL.min, STAR_INTERVAL.max)
      && (rules.exposureStrategy === StarExposureStrategy.ROUND_ROBIN || rules.exposureStrategy === StarExposureStrategy.RANDOM)
  }
  if (value.targetType === StarTarget.STORE) {
    const rules = value.storeRules
    return !Object.hasOwn(value, 'productRules') && (!Object.hasOwn(value, 'legacyParams') || isStarParamsObject(value.legacyParams))
      && isStarParamsObject(rules) && exactKeys(rules, STORE_FIELDS)
      && integer(rules.consistencyCheckInterval, STAR_INTERVAL.min, STAR_INTERVAL.max)
      && rules.merchantExposureStrategy === 'random' && rules.statusOpen === true
      && ['statusRest', 'statusOverwhelmed', 'statusClosed'].every(field => typeof rules[field] === 'boolean')
  }
  return false
}

export function makeStarProductParams(rules: StarProductRules, revision: number): StarProductParams {
  return { schemaVersion: STAR_SCHEMA_VERSION, applicableBusinessTypes: [AdBusinessType.GROUP_BUY], targetType: StarTarget.PRODUCT, revision, productRules: rules }
}
