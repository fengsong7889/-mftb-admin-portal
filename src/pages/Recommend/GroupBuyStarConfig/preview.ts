/**
 * Copyright (c) 2026 fengsong7889. All Rights Reserved.
 *
 * 本文件为「MFTB 企业一体化管理平台软件」的组成部分。
 * 未经著作权人书面许可，不得使用、复制、修改、再分发或用于任何商业目的。
 * 完整许可条款见仓库根目录 LICENSE 文件。
 */
import type { AppType } from '@mftb/contracts/recommendConstants'
import { StarExposureStrategy, STAR_INTERVAL, type StarExposureStrategyType } from '@mftb/contracts/starAlgorithm'

// 策略枚举与区间统一来自契约包，页面只保留表单默认值，避免两处真源漂移。
export const ProductExposureStrategy = StarExposureStrategy
export const PRODUCT_STAR_INTERVAL = STAR_INTERVAL
export interface ProductStarPreviewValues {
  name?: string
  brand?: AppType
  consistencyCheckInterval?: number | null
  exposureStrategy: StarExposureStrategyType
}
export const PRODUCT_STAR_PREVIEW_DEFAULTS: ProductStarPreviewValues = {
  consistencyCheckInterval: STAR_INTERVAL.default,
  exposureStrategy: StarExposureStrategy.ROUND_ROBIN,
}
