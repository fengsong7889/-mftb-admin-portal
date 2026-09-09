/**
 * 资产详情页（只读模式）
 *
 * 展示资产基础信息 + 资产图片 + 操作历史时间线
 * 详情页为只读，顶部不放置操作按钮（领用/转移/归还/维修/报废/编辑）
 * 统一全局详情页顶部样式（.detail-header）
 */
import { useState, useEffect, useCallback, useMemo } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  Descriptions, Tag, Image, Table, message, Spin,
} from 'antd'
import type { TableColumnsType } from 'antd'
import { useTranslation } from 'react-i18next'
import {
  fetchAssetDetail, fetchAssetLogs, type AssetItem, type AssetLog,
  type AssetStatus, type AssetOpType,
} from '../../../api/asset'
import { OP_META } from '../opMeta'
import DetailPageHeader from '../../../components/DetailPageHeader'

const STATUS_META: Record<AssetStatus, { key: string; color: string }> = {
  idle:      { key: 'asset.statusIdle',     color: 'default' },
  in_use:    { key: 'asset.statusInUse',    color: 'success' },
  in_repair: { key: 'asset.statusInRepair', color: 'processing' },
  scrapped:  { key: 'asset.statusScrapped', color: 'error' },
}

export default function AssetDetail() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const id = searchParams.get('id') ? Number(searchParams.get('id')) : null

  const [loading, setLoading] = useState(false)
  const [asset, setAsset] = useState<AssetItem | null>(null)
  const [logs, setLogs] = useState<AssetLog[]>([])

  const loadData = useCallback(async () => {
    if (!id) return
    setLoading(true)
    try {
      const [a, l] = await Promise.all([
        fetchAssetDetail(id),
        fetchAssetLogs({ assetId: id, page: 1, size: 50 }),
      ])
      setAsset(a)
      setLogs(l.records || [])
    } catch (e: unknown) {
      message.error(e instanceof Error ? e.message : t('asset.queryFailed'))
    } finally {
      setLoading(false)
    }
  }, [id, t])

  useEffect(() => { loadData() }, [loadData])

  /* ----- 渲染状态 ----- */
  const renderStatus = (s: AssetStatus) => {
    const m = STATUS_META[s]
    return <Tag color={m.color}>{t(m.key)}</Tag>
  }
  const renderOpTag = (op: AssetOpType) => {
    const m = OP_META[op]
    return <Tag color={m.color}>{t(m.key)}</Tag>
  }

  /* ----- 操作日志列定义 ----- */
  const logColumns: TableColumnsType<AssetLog> = useMemo(() => [
    {
      title: t('asset.colOpType'),
      dataIndex: 'opType', key: 'opType', width: 100,
      render: (v: AssetOpType) => renderOpTag(v),
    },
    { title: t('asset.colOperator'), dataIndex: 'operator', key: 'operator', width: 140 },
    { title: t('asset.colOperateTime'), dataIndex: 'operateTime', key: 'operateTime', width: 170 },
    {
      title: t('asset.colDescription'), dataIndex: 'description', key: 'description', ellipsis: true,
    },
    {
      title: t('asset.colFlowNo'),
      dataIndex: 'flowNo', key: 'flowNo', width: 160,
      render: (v: string | undefined) => v || '-',
    },
  ], [t])

  if (loading || !asset) {
    return (
      <div className="content-area" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 400 }}>
        <Spin size="large" tip={t('common.loading')} />
      </div>
    )
  }

  const imageList = asset.images ? asset.images.split(',').filter(Boolean) : []

  return (
    <div className="content-area" style={{ padding: '20px 24px' }}>
      {/* ====== 详情页头部（全局 DetailPageHeader） ====== */}
      <DetailPageHeader
        title={t('asset.detailTitle')}
        tags={renderStatus(asset.status)}
        meta={<>{asset.assetNo} · {asset.assetName}</>}
        onBack={() => navigate('/asset-list')}
      />

      {/* ====== 基本信息 ====== */}
      <div style={{
        background: '#fff', borderRadius: 8, padding: '20px 24px', marginBottom: 16,
        boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
      }}>
        <h3 style={{ margin: '0 0 16px', fontSize: 16, fontWeight: 600 }}>{t('asset.sectionBasic')}</h3>
        <Descriptions column={3} size="middle" bordered>
          <Descriptions.Item label={t('asset.colAssetNo')}>{asset.assetNo}</Descriptions.Item>
          <Descriptions.Item label={t('asset.colAssetName')}>{asset.assetName}</Descriptions.Item>
          <Descriptions.Item label={t('asset.colAssetType')}>{asset.assetType}</Descriptions.Item>
          <Descriptions.Item label={t('asset.colBrand')}>{asset.brand || '-'}</Descriptions.Item>
          <Descriptions.Item label={t('asset.colQuantity')}>{asset.quantity} {asset.unit}</Descriptions.Item>
          <Descriptions.Item label={t('asset.colSource')}>
            <Tag color={asset.source === 'self' ? 'blue' : 'orange'}>
              {asset.source === 'self' ? t('asset.sourceSelf') : t('asset.sourceLease')}
            </Tag>
          </Descriptions.Item>
          <Descriptions.Item label={t('asset.colCompany')}>{asset.company}</Descriptions.Item>
          <Descriptions.Item label={t('asset.colLocation')}>{asset.location || '-'}</Descriptions.Item>
          <Descriptions.Item label={t('asset.colDepartment')}>{asset.department || '-'}</Descriptions.Item>
          <Descriptions.Item label={t('asset.colUserName')}>{asset.userName || '-'}</Descriptions.Item>
          <Descriptions.Item label={t('asset.colPurchaseValue')}>
            {asset.purchaseValue ? `MOP ${asset.purchaseValue.toLocaleString()}` : '-'}
          </Descriptions.Item>
          <Descriptions.Item label={t('asset.colPurchaseDate')}>{asset.purchaseDate || '-'}</Descriptions.Item>
          <Descriptions.Item label={t('asset.colUsageDate')}>{asset.usageDate || '-'}</Descriptions.Item>
          {asset.scrapTime && (
            <Descriptions.Item label={t('asset.colScrapTime')}>{asset.scrapTime}</Descriptions.Item>
          )}
          <Descriptions.Item label={t('asset.colApplicant')}>{asset.applicant}</Descriptions.Item>
          <Descriptions.Item label={t('asset.colCreatedAt')}>{asset.createdAt}</Descriptions.Item>
          <Descriptions.Item label={t('asset.colUpdatedAt')} span={3}>{asset.updatedAt}</Descriptions.Item>
          {asset.remark && (
            <Descriptions.Item label={t('asset.colRemark')} span={3}>{asset.remark}</Descriptions.Item>
          )}
        </Descriptions>
      </div>

      {/* ====== 资产图片 ====== */}
      {imageList.length > 0 && (
        <div style={{
          background: '#fff', borderRadius: 8, padding: '20px 24px', marginBottom: 16,
          boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
        }}>
          <h3 style={{ margin: '0 0 16px', fontSize: 16, fontWeight: 600 }}>{t('asset.sectionImages')}</h3>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
            {imageList.map((src, i) => (
              <Image
                key={i}
                src={src}
                width={120}
                height={120}
                style={{ objectFit: 'cover', borderRadius: 6 }}
              />
            ))}
          </div>
        </div>
      )}

      {/* ====== 操作历史 ====== */}
      <div style={{
        background: '#fff', borderRadius: 8, padding: '20px 24px',
        boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
      }}>
        <h3 style={{ margin: '0 0 16px', fontSize: 16, fontWeight: 600 }}>{t('asset.sectionLogs')}</h3>
        {logs.length > 0 ? (
          <Table<AssetLog>
            columns={logColumns}
            dataSource={logs}
            rowKey="id"
            size="middle"
            pagination={false}
          />
        ) : (
          <div style={{ color: '#8C8C8C', textAlign: 'center', padding: 40 }}>{t('asset.noLogs')}</div>
        )}
      </div>
    </div>
  )
}
