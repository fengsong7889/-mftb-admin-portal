/**
 * Copyright (c) 2026 fengsong7889. All Rights Reserved.
 *
 * 本文件为「MFTB 企业一体化管理平台软件」的组成部分。
 * 未经著作权人书面许可，不得使用、复制、修改、再分发或用于任何商业目的。
 * 完整许可条款见仓库根目录 LICENSE 文件。
 */
import { useTranslation } from 'react-i18next'
import { AlgorithmType } from '@mftb/contracts/recommendConstants'

/** 三个菜单与兼容入口共用文案键，防止销售端硬编码与算法库译文漂移。 */
const DESCRIPTION_KEYS: Partial<Record<AlgorithmType, string>> = {
  [AlgorithmType.INVINCIBLE_STAR]: 'algorithm.descInvincibleStar',
  [AlgorithmType.HOT_REVIVE_AD]: 'algorithm.descHotRevive',
  [AlgorithmType.NEW_STORE_AD]: 'algorithm.descNewStore',
  [AlgorithmType.BRAND_MERCHANT]: 'algorithm.descBrandMerchant',
  [AlgorithmType.EXCLUSIVE_MERCHANT]: 'algorithm.descExclusiveMerchant',
  [AlgorithmType.GOLDEN_SIGNBOARD]: 'algorithm.descGoldenSignboard',
  [AlgorithmType.TRAFFIC_AD]: 'algorithm.descTraffic',
  [AlgorithmType.GUESS_YOU_LIKE]: 'algorithm.descGuessYouLike',
  [AlgorithmType.ORGANIC_TRAFFIC]: 'algorithm.descOrganicTraffic',
  [AlgorithmType.POPULAR_MERCHANT_KA]: 'algorithm.descPopularMerchant',
  [AlgorithmType.TIME_SLOT_AD]: 'algorithm.descTimeSlotAd',
  [AlgorithmType.PRODUCT_PROMO]: 'algorithm.descProductPromo',
}

export default function AdPromotionDescription({ type }: { type: AlgorithmType }) {
  const { t } = useTranslation()
  const key = DESCRIPTION_KEYS[type]
  if (!key) return null
  return <p className="algo-card-desc">{t(key)}</p>
}
