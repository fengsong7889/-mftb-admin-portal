/**
 * 耗材入库单 - 详情独立页面
 *
 * 遵循详情页规范：DetailPageHeader（紫色渐变顶条）+ .detail-card（不加 border）
 * + Descriptions 信息展示 + 底部「最后更新人/时间」收尾，无底部操作按钮
 */
import { useEffect, useState } from 'react'
import { Descriptions, Spin, Table, Tag, message } from 'antd'
import type { TableColumnsType } from 'antd'
import { useTranslation } from 'react-i18next'
import DetailPageHeader from '../../../components/DetailPageHeader'
import { fetchConsumableInboundOrderDetail, type ConsumableInboundItem, type ConsumableInboundOrder } from '../../../api/consumable'
import { INBOUND_TYPE_MAP } from './inboundMeta'

interface Props {
  id: number
  onBack: () => void
}

export default function InboundDetail({ id, onBack }: Props) {
  const { t } = useTranslation()
  const [loading, setLoading] = useState(true)
  const [order, setOrder] = useState<ConsumableInboundOrder | null>(null)

  useEffect(() => {
    let alive = true
    setLoading(true)
    fetchConsumableInboundOrderDetail(id)
      .then((data) => { if (alive) setOrder(data) })
      .catch((e: unknown) => { if (alive) message.error(e instanceof Error ? e.message : t('consumable.queryFailed')) })
      .finally(() => { if (alive) setLoading(false) })
    // 语言切换时重新取文案，故 t 参与依赖；alive 守卫避免卸载后 setState
    return () => { alive = false }
  }, [id, t])

  const columns: TableColumnsType<ConsumableInboundItem> = [
    { title: t('consumable.inboundItemCode'), dataIndex: 'itemCode', key: 'itemCode', width: 120,
      render: (v?: string) => <span style={{ fontFamily: 'monospace' }}>{v || '-'}</span> },
    { title: t('consumable.inboundItemName'), dataIndex: 'itemName', key: 'itemName', width: 160, ellipsis: true, render: (v?: string) => v || '-' },
    { title: t('consumable.inboundSpec'), dataIndex: 'spec', key: 'spec', width: 140, ellipsis: true, render: (v?: string) => v || '-' },
    { title: t('consumable.inboundWarehouse'), dataIndex: 'locationName', key: 'locationName', width: 140, ellipsis: true, render: (v?: string) => v || '-' },
    { title: t('consumable.inboundQty'), dataIndex: 'qty', key: 'qty', width: 90, align: 'right' },
    { title: t('consumable.inboundUnitPrice'), dataIndex: 'unitPrice', key: 'unitPrice', width: 110, align: 'right', render: (v?: number) => `MOP ${(v ?? 0).toFixed(2)}` },
    { title: t('consumable.inboundAmount'), dataIndex: 'amount', key: 'amount', width: 120, align: 'right', render: (v?: number) => `MOP ${(v ?? 0).toFixed(2)}` },
  ]

  const typeMeta = order ? INBOUND_TYPE_MAP[order.inboundType] : undefined

  return (
    <Spin spinning={loading}>
      <DetailPageHeader
        title={t('consumable.inboundDetailTitle')}
        tags={typeMeta ? <Tag color={typeMeta.color}>{t(typeMeta.labelKey)}</Tag> : undefined}
        meta={<>{order?.inboundNo} · {t('consumable.inboundBizDate')}：{order?.bizDate || '-'}</>}
        onBack={onBack}
      />

      {/* 基础信息 */}
      <div className="detail-card">
        <Descriptions column={4} size="middle">
          <Descriptions.Item label={t('consumable.inboundNo')}>{order?.inboundNo || '-'}</Descriptions.Item>
          <Descriptions.Item label={t('consumable.inboundType')}>
            {typeMeta ? t(typeMeta.labelKey) : order?.inboundType || '-'}
          </Descriptions.Item>
          <Descriptions.Item label={t('common.colBrand')}>{order?.companyBrandName || '-'}</Descriptions.Item>
          <Descriptions.Item label={t('consumable.purchaseCompany')}>{order?.purchaseCompany || '-'}</Descriptions.Item>
          <Descriptions.Item label={t('consumable.supplier')}>{order?.supplierName || '-'}</Descriptions.Item>
          <Descriptions.Item label={t('consumable.inboundBizDate')}>{order?.bizDate || '-'}</Descriptions.Item>
          <Descriptions.Item label={t('consumable.totalQty')}>{order?.totalQty ?? '-'}</Descriptions.Item>
          <Descriptions.Item label={t('consumable.inboundTotalAmount')}>MOP {(order?.totalAmount ?? 0).toFixed(2)}</Descriptions.Item>
          <Descriptions.Item label={t('common.colCreator')}>{order?.createdBy || '-'}</Descriptions.Item>
          <Descriptions.Item label={t('common.colCreateTime')}>{order?.createdAt || '-'}</Descriptions.Item>
          <Descriptions.Item label={t('consumable.remark')} span={2}>{order?.remark || '-'}</Descriptions.Item>
        </Descriptions>
      </div>

      {/* 入库明细 */}
      <div className="detail-card">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
          <span style={{ fontSize: 15, fontWeight: 600, color: '#262626' }}>{t('consumable.sectionItems')}</span>
          <Tag color="orange" style={{ marginLeft: 4, fontSize: 11 }}>
            {t('consumable.inboundItemCount', { count: order?.items?.length ?? 0 })}
          </Tag>
          <div style={{ flex: 1, height: 1, background: '#f0f0f0', marginLeft: 8 }} />
          <span style={{ fontSize: 13, color: '#595959' }}>
            {t('common.colTotal')}：<b style={{ color: '#E8720C' }}>MOP {(order?.totalAmount ?? 0).toFixed(2)}</b>
          </span>
        </div>
        <Table<ConsumableInboundItem>
          columns={columns}
          dataSource={order?.items ?? []}
          rowKey={(r) => r.id ?? `${r.itemId}-${r.locationId}`}
          pagination={false}
          size="middle"
          scroll={{ x: 900 }}
        />
      </div>

      {/* 最后更新 footer（详情页规范：替代独立操作记录卡片） */}
      <div style={{ background: '#fafafa', borderRadius: 8, padding: '12px 24px', border: '1px solid #f0f0f0', display: 'flex', justifyContent: 'flex-end', gap: 24 }}>
        <span style={{ fontSize: 12, color: '#8C8C8C' }}>{t('asset.updatedByLabel')}<span style={{ color: '#595959' }}>{order?.updatedBy || '-'}</span></span>
        <span style={{ fontSize: 12, color: '#8C8C8C' }}>{t('asset.updatedAtLabel')}<span style={{ color: '#595959' }}>{order?.updatedAt || '-'}</span></span>
      </div>
    </Spin>
  )
}
