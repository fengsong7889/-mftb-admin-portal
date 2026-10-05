/**
 * 推廣訂單共享 Hook — 標籤函數 + 商圈樹 + orderTypeKey
 *
 * 提取自 PromotionOrderManage 和 PromotionOrderManageStandalone 的重複邏輯。
 */
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { AppType, RecommendChannel, Region } from '../../Recommend/constants'
import {
  OrderStatus,
  RecommendType,
  RECOMMEND_TYPE_LABEL,
  RECOMMEND_TYPE_ICON,
} from './index'

export interface PromotionOrderLabels {
  statusLabel: (v: OrderStatus) => { label: string; color: string }
  appLabel: (v: AppType) => string
  channelLabel: (v: RecommendChannel) => string
  regionLabel: (v: Region) => string
  recommendTypeLabel: (v: RecommendType) => string
  regionTreeData: any[]
  orderTypeKey: RecommendType | undefined
}

export function usePromotionOrderLabels(orderType: string): PromotionOrderLabels {
  const { t } = useTranslation()

  const statusLabel = (v: OrderStatus) => {
    const map: Partial<Record<OrderStatus, { label: string; color: string }>> = {
      [OrderStatus.PENDING_PROMOTION]: { label: t('promotionOrderManage.statusPending'), color: 'blue' },
      [OrderStatus.PROMOTING]: { label: t('promotionOrderManage.statusPromoting'), color: 'green' },
      [OrderStatus.PROMOTED]: { label: t('promotionOrderManage.statusPromoted'), color: 'purple' },
      [OrderStatus.REFUNDED]: { label: t('promotionOrderManage.statusRefunded'), color: 'orange' },
      [OrderStatus.CANCELLED]: { label: t('promotionOrderManage.statusCancelled'), color: 'red' },
      [OrderStatus.ABORTED]: { label: t('promotionOrderManage.statusAborted'), color: 'orange' },
    }
    return map[v] || { label: String(v), color: 'default' }
  }

  const appLabel = (v: AppType) => (v === AppType.SHANFENG ? t('common.flashBee') : 'mFood')

  const channelLabelMap: Record<number, string> = {
    [RecommendChannel.DELIVERY]: t('promotionOrderManage.chDelivery'),
    [RecommendChannel.GROUP_BUY]: t('promotionOrderManage.chGroupBuy'),
    [RecommendChannel.SUPERMARKET]: t('promotionOrderManage.chSupermarket'),
  }
  const channelLabel = (v: RecommendChannel) => channelLabelMap[v] || String(v)

  const regionLabel = (v: Region) => {
    const map: Record<number, string> = {
      [Region.KOKSAA]: t('promotionOrderManage.regionKoksaa'),
      [Region.COSTA]: t('promotionOrderManage.regionCosta'),
      [Region.SANMA]: t('promotionOrderManage.regionSanma'),
      [Region.SANWONG]: t('promotionOrderManage.regionSanwong'),
      [Region.HKM]: t('promotionOrderManage.regionHkm'),
      [Region.FAHUA]: t('promotionOrderManage.regionFahua'),
      [Region.AIRPORT]: t('promotionOrderManage.regionAirport'),
      [Region.LHOTEL]: t('promotionOrderManage.regionLhotel'),
      [Region.RHOTEL]: t('promotionOrderManage.regionRhotel'),
      [Region.UM]: t('promotionOrderManage.regionUm'),
      [Region.HACS]: t('promotionOrderManage.regionHacs'),
    }
    return map[v] || String(v)
  }

  const recommendTypeLabel = (v: RecommendType) => {
    const map: Partial<Record<RecommendType, string>> = {
      [RecommendType.INVINCIBLE_STAR]: t('promotionReport.recTypeInvincibleStar'),
      [RecommendType.HOT_REVIVE_AD]: t('promotionReport.recTypeHotRevive'),
      [RecommendType.NEW_STORE_AD]: t('promotionReport.recTypeNewStore'),
      [RecommendType.TRAFFIC_AD]: t('promotionReport.recTypeTraffic'),
      [RecommendType.POPULAR_MERCHANT_KA]: t('promotionOrderManage.recTypePopular'),
      [RecommendType.GOLDEN_SIGNBOARD]: t('promotionOrderManage.recTypeGoldenSignboard'),
    }
    return map[v] || String(v)
  }

  const regionTreeData = [
    {
      value: 'macau_area',
      title: t('promotionOrderManage.areaMacau'),
      selectable: true,
      children: [
        { value: Region.KOKSAA, title: t('promotionOrderManage.regionKoksaa') },
        { value: Region.COSTA, title: t('promotionOrderManage.regionCosta') },
        { value: Region.SANMA, title: t('promotionOrderManage.regionSanma') },
        { value: Region.SANWONG, title: t('promotionOrderManage.regionSanwong') },
        { value: Region.HKM, title: t('promotionOrderManage.regionHkm') },
      ],
    },
    {
      value: 'taipa_area',
      title: t('promotionOrderManage.areaTaipa'),
      selectable: true,
      children: [
        { value: Region.FAHUA, title: t('promotionOrderManage.regionFahua') },
        { value: Region.AIRPORT, title: t('promotionOrderManage.regionAirport') },
        { value: Region.LHOTEL, title: t('promotionOrderManage.regionLhotel') },
        { value: Region.RHOTEL, title: t('promotionOrderManage.regionRhotel') },
        { value: Region.UM, title: t('promotionOrderManage.regionUm') },
        { value: Region.HACS, title: t('promotionOrderManage.regionHacs') },
      ],
    },
  ]

  const orderTypeKey = useMemo(() => {
    const numVal = Number(orderType)
    if (!isNaN(numVal) && Object.values(RecommendType).includes(numVal)) {
      return numVal as RecommendType
    }
    const entry = Object.entries(RECOMMEND_TYPE_LABEL).find(([, label]) => label === orderType)
    return entry ? (Number(entry[0]) as RecommendType) : undefined
  }, [orderType])

  return {
    statusLabel,
    appLabel,
    channelLabel,
    regionLabel,
    recommendTypeLabel,
    regionTreeData,
    orderTypeKey,
  }
}
