/**
 * 资产详情页（只读模式）
 *
 * 现代化卡片布局（参考订单详情页样式）：
 *  - 顶部：全局 DetailPageHeader（紫色渐变顶条 + 编辑按钮）
 *  - 主体：白色圆角卡片 + Tabs 分模块
 *    1. 资产信息 — 编码/分类/品牌/名称/图片
 *    2. 租/购信息 — 来源/价值/日期/存放位置/公司
 *    3. 操作历史 — 操作日志表格
 */
import { useState, useEffect, useCallback, useMemo } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  Descriptions, Tag, Image, Table, Card, Tabs, message, Spin,
} from 'antd'
import type { TableColumnsType } from 'antd'
import { useTranslation } from 'react-i18next'
import {
  PictureOutlined, FileImageOutlined, HistoryOutlined,
  DollarOutlined, AppstoreOutlined, CarOutlined,
} from '@ant-design/icons'
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

/* ---- 卡片标题组件（与订单详情一致） ---- */
function CardTitle({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <div style={{
        width: 24, height: 24, borderRadius: 6, background: '#e6f7ff',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        {icon}
      </div>
      <span style={{ fontSize: 15, fontWeight: 600, color: '#262626' }}>{text}</span>
    </div>
  )
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

  /* ---- 状态概览统计卡 ---- */
  const statusStats = [
    { label: t('asset.colAssetNo'), value: asset.assetNo, icon: <AppstoreOutlined />, color: '#1890ff', bg: '#E6F7FF' },
    { label: t('asset.colQuantity'), value: `${asset.quantity} ${asset.unit}`, icon: <PictureOutlined />, color: '#52C41A', bg: '#F6FFED' },
    { label: t('asset.colSource'), value: asset.source === 'self' ? t('asset.sourceSelf') : t('asset.sourceLease'), icon: <DollarOutlined />, color: '#E8720C', bg: '#FFF7E6' },
    { label: '状态', value: renderStatus(asset.status), icon: <CarOutlined />, color: '#722ED1', bg: '#F9F0FF' },
  ]

  return (
    <div className="content-area">
      {/* ====== 详情页头部（全局 DetailPageHeader - 紫色渐变顶条 + 编辑按钮） ====== */}
      <DetailPageHeader
        title={t('asset.detailTitle')}
        tags={
          <Tag color={STATUS_META[asset.status].color} style={{
            fontSize: 12, padding: '2px 10px', borderRadius: 4,
            fontWeight: 500, margin: 0,
          }}>{t(STATUS_META[asset.status].key)}</Tag>
        }
        meta={<>{asset.assetNo} · {asset.assetName}</>}
        onBack={() => navigate('/asset-list')}
        onEdit={() => navigate(`/asset-add?id=${asset.id}`)}
        menuKey="asset-list"
      />

      {/* ====== 状态概览统计卡（4 格动效卡片） ====== */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 16 }}>
        {statusStats.map((stat, i) => (
          <div key={i} style={{
            padding: '16px', borderRadius: 12, background: stat.bg,
            border: `1px solid ${stat.color}22`, textAlign: 'center',
            transition: 'all 0.35s cubic-bezier(0.4, 0, 0.2, 1)', cursor: 'default',
            position: 'relative', overflow: 'hidden',
          }}
            onMouseEnter={e => {
              e.currentTarget.style.transform = 'translateY(-4px)'
              e.currentTarget.style.boxShadow = '0 8px 24px rgba(0, 0, 0, 0.1)'
            }}
            onMouseLeave={e => {
              e.currentTarget.style.transform = 'translateY(0)'
              e.currentTarget.style.boxShadow = 'none'
            }}
          >
            <div style={{ fontSize: 20, color: stat.color, marginBottom: 6 }}>{stat.icon}</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: stat.color }}>{stat.value}</div>
            <div style={{ fontSize: 12, color: '#8C8C8C', marginTop: 2 }}>{stat.label}</div>
          </div>
        ))}
      </div>

      {/* ====== 主体白色圆角卡片 ====== */}
      <div style={{
        background: '#fff', borderRadius: 12, boxShadow: '0 2px 12px rgba(0,0,0,0.06)',
        overflow: 'hidden', marginBottom: 16,
      }}>
        <Tabs
          defaultActiveKey="assetInfo"
          style={{ padding: '0 24px' }}
          items={[
            /* ---- Tab 1: 资产信息 ---- */
            {
              key: 'assetInfo',
              label: (
                <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 14, fontWeight: 600 }}>
                  <PictureOutlined style={{ color: '#1890ff' }} /> 资产信息
                </span>
              ),
              children: (
                <div style={{ padding: '8px 0 0' }}>
                  {/* 基本信息 */}
                  <Card
                    title={<CardTitle icon={<AppstoreOutlined style={{ fontSize: 12, color: '#1890ff' }} />} text="基本信息" />}
                    style={{ marginBottom: 16, borderRadius: 8, border: 'none' }}
                    styles={{ body: { padding: '16px 24px' } }}
                  >
                    <Descriptions column={3} labelStyle={{ color: '#8c8c8c', fontSize: 13 }} contentStyle={{ fontSize: 13 }}>
                      <Descriptions.Item label={t('asset.colAssetNo')}>{asset.assetNo}</Descriptions.Item>
                      <Descriptions.Item label={t('asset.colAssetType')}>{asset.assetType}</Descriptions.Item>
                      <Descriptions.Item label={t('asset.colBrand')}>{asset.brand || '-'}</Descriptions.Item>
                      <Descriptions.Item label={t('asset.colAssetName')} span={2}>{asset.assetName}</Descriptions.Item>
                      <Descriptions.Item label={t('asset.colQuantity')}>{asset.quantity} {asset.unit}</Descriptions.Item>
                      <Descriptions.Item label="归属部门">{asset.department || <span style={{ color: '#BFBFBF' }}>—</span>}</Descriptions.Item>
                      <Descriptions.Item label={t('asset.colCurrentUserName')}>{asset.userName || <span style={{ color: '#BFBFBF' }}>—</span>}</Descriptions.Item>
                      <Descriptions.Item label={t('asset.colClaimDate')}>{asset.usageDate || <span style={{ color: '#BFBFBF' }}>—</span>}</Descriptions.Item>
                    </Descriptions>
                  </Card>

                  {/* 资产图片 */}
                  {imageList.length > 0 && (
                    <Card
                      title={<CardTitle icon={<FileImageOutlined style={{ fontSize: 12, color: '#52C41A' }} />} text="资产图片" />}
                      style={{ borderRadius: 8, border: 'none' }}
                      styles={{ body: { padding: '16px 24px' } }}
                    >
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
                        {imageList.map((src, i) => (
                          <Image
                            key={i}
                            src={src}
                            width={120}
                            height={120}
                            style={{ objectFit: 'cover', borderRadius: 8, border: '1px solid #f0f0f0' }}
                          />
                        ))}
                      </div>
                    </Card>
                  )}
                </div>
              ),
            },
            /* ---- Tab 2: 租/购信息 ---- */
            {
              key: 'purchaseInfo',
              label: (
                <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 14, fontWeight: 600 }}>
                  <DollarOutlined style={{ color: '#E8720C' }} /> 租/购信息
                </span>
              ),
              children: (
                <div style={{ padding: '8px 0 0' }}>
                  <Card
                    title={<CardTitle icon={<DollarOutlined style={{ fontSize: 12, color: '#E8720C' }} />} text="租购详情" />}
                    style={{ borderRadius: 8, border: 'none' }}
                    styles={{ body: { padding: '16px 24px' } }}
                  >
                    <Descriptions column={3} labelStyle={{ color: '#8c8c8c', fontSize: 13 }} contentStyle={{ fontSize: 13 }}>
                      <Descriptions.Item label={t('asset.colSource')}>
                        <Tag color={asset.source === 'self' ? 'blue' : 'orange'}>
                          {asset.source === 'self' ? t('asset.sourceSelf') : t('asset.sourceLease')}
                        </Tag>
                      </Descriptions.Item>
                      <Descriptions.Item label={t('asset.colPurchaseValue')}>
                        <span style={{ fontWeight: 600, color: '#E8720C' }}>
                          {asset.purchaseValue ? `MOP ${asset.purchaseValue.toLocaleString()}` : '-'}
                        </span>
                      </Descriptions.Item>
                      <Descriptions.Item label={t('asset.colPurchaseDate')}>{asset.purchaseDate || '-'}</Descriptions.Item>
                      <Descriptions.Item label={t('asset.colCompany')}>{asset.company}</Descriptions.Item>
                      <Descriptions.Item label={t('asset.colLocation')}>{asset.location || <span style={{ color: '#BFBFBF' }}>—</span>}</Descriptions.Item>
                      <Descriptions.Item label={t('asset.colUsageDate')}>{asset.usageDate || '-'}</Descriptions.Item>
                    </Descriptions>
                  </Card>
                </div>
              ),
            },
            /* ---- Tab 3: 操作历史 ---- */
            {
              key: 'logs',
              label: (
                <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 14, fontWeight: 600 }}>
                  <HistoryOutlined style={{ color: '#722ED1' }} /> {t('asset.sectionLogs')}
                </span>
              ),
              children: (
                <div style={{ padding: '8px 0 0' }}>
                  {logs.length > 0 ? (
                    <Table<AssetLog>
                      columns={logColumns}
                      dataSource={logs}
                      rowKey="id"
                      size="middle"
                      pagination={false}
                    />
                  ) : (
                    <div style={{ color: '#8C8C8C', textAlign: 'center', padding: 40, fontSize: 13 }}>
                      {t('asset.noLogs')}
                    </div>
                  )}
                </div>
              ),
            },
          ]}
        />
      </div>
    </div>
  )
}
