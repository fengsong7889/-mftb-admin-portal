/**
 * 推廣訂單共享列定義
 *
 * 提取 PromotionOrderManage 和 PromotionOrderManageStandalone 中完全相同的表格列。
 * 各頁面獨有的列（region、purchaseContent、status、refund 等）仍保留在各自頁面。
 */
import { Tag, Space } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import BrandTag from '../../../components/BrandTag'
import { AppType, RecommendChannel } from '../../Recommend/constants'
import type { BaseOrderItem } from './types'

export interface SharedColumnDeps {
  t: (key: string) => string
  channelLabel: (v: RecommendChannel) => string
}

/**
 * 返回兩個頁面共用的基礎列（orderNo / groupInfo / storeInfo / app / channel /
 * originalPrice / discount / payMode / giftDays / actualPrice / orderTime）。
 *
 * 各頁面再按自身需求拼接條件列。
 */
export function getSharedOrderColumns(deps: SharedColumnDeps): ColumnsType<BaseOrderItem> {
  const { t, channelLabel } = deps

  return [
    {
      title: t('promotionOrderManage.colOrderNo'),
      dataIndex: 'orderNo',
      key: 'orderNo',
      width: 180,
      fixed: 'left',
    },
    {
      title: t('promotionOrderManage.colGroupInfo'),
      key: 'groupInfo',
      width: 180,
      render: (_, record) => (
        <Space direction="vertical" size={0}>
          <span style={{ fontSize: 12, color: '#8C8C8C' }}>{record.groupId}</span>
          <span>{record.groupName}</span>
        </Space>
      ),
    },
    {
      title: t('promotionOrderManage.colStoreInfo'),
      key: 'storeInfo',
      width: 180,
      render: (_, record) => (
        <Space direction="vertical" size={0}>
          <span style={{ fontSize: 12, color: '#8C8C8C' }}>{record.storeId}</span>
          <span>{record.storeName}</span>
        </Space>
      ),
    },
    {
      title: t('common.colBrand'),
      dataIndex: 'app',
      key: 'app',
      width: 100,
      render: (app: AppType) => <BrandTag value={app} />,
    },
    {
      title: t('common.colChannel'),
      dataIndex: 'channel',
      key: 'channel',
      width: 120,
      render: (channel: RecommendChannel) => channelLabel(channel),
    },
    {
      title: t('promotionOrderManage.colOrderAmount'),
      dataIndex: 'originalPrice',
      key: 'originalPrice',
      width: 120,
      align: 'right' as const,
      render: (price: number) => `$${price}`,
    },
    {
      title: t('promotionOrderManage.colDiscount'),
      key: 'discount',
      width: 120,
      align: 'right' as const,
      render: (_, record) => {
        const disc = record.discountAmount ?? (record.originalPrice - record.actualPrice)
        return disc > 0 ? <span style={{ color: '#fa8c16' }}>-${disc}</span> : <span style={{ color: '#bfbfbf' }}>-</span>
      },
    },
    {
      title: t('promotionOrderManage.colPayMode'),
      key: 'payMode',
      width: 110,
      render: (_, record) => {
        const gd = record.giftDays ?? 0
        const isGift = gd > 0 && record.actualPrice === 0
        const isMixed = gd > 0 && record.actualPrice > 0
        if (isGift) return <Tag color="orange">{t('promotionOrderManage.payModeGift')}</Tag>
        if (isMixed) return <Tag color="green">{t('promotionOrderManage.payModeMixed')}</Tag>
        return <Tag color="gold">{t('promotionOrderManage.payModePromo')}</Tag>
      },
    },
    {
      title: t('promotionOrderManage.colGiftDays'),
      key: 'giftDays',
      width: 90,
      render: (_, record) => {
        const gd = record.giftDays ?? 0
        return gd > 0
          ? <span style={{ color: '#E8720C', fontWeight: 600 }}>{gd} {t('promotionOrderManage.dayUnit')}</span>
          : <span style={{ color: '#bfbfbf' }}>-</span>
      },
    },
    {
      title: t('promotionOrderManage.colActualPay'),
      dataIndex: 'actualPrice',
      key: 'actualPrice',
      width: 120,
      align: 'right' as const,
      render: (price: number) => (
        <span style={{ color: '#ff4d4f', fontWeight: 600 }}>${price}</span>
      ),
    },
    {
      title: t('promotionOrderManage.colOrderTime'),
      dataIndex: 'orderTime',
      key: 'orderTime',
      width: 175,
      render: (time: string) => time ? <span style={{ whiteSpace: 'nowrap' }}>{time}</span> : '-',
    },
  ]
}
