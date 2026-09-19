/**
 * 验收入库详情页
 *
 * - 展示入库批次的完整信息（批次号、订单号、经办人、日期、数量统计等）
 * - 明细表格展示入库物资及生成的资产编号
 * - 遵循全局详情页规范：DetailPageHeader（紫色渐变顶条）+ 卡片布局 + 无底部操作栏
 */
import { useState, useEffect, useCallback, useMemo } from 'react'
import { Table, Tag, Row, Col, Spin, message, Modal, Button, Input, Space, Tooltip, Descriptions } from 'antd'
import type { TableColumnsType } from 'antd'
import {
  ShoppingCartOutlined, FileTextOutlined, EnvironmentOutlined, CheckCircleOutlined,
  ExclamationCircleOutlined, SwapOutlined, RollbackOutlined,
} from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
import DetailPageHeader from '../../../components/DetailPageHeader'
import BrandTag from '../../../components/BrandTag'
import { fetchInboundDetail, fetchLocationList, registerExchangeShipment, type InboundBatch, type InboundBatchItem, type AssetLocation } from '../../../api/eam'

interface Props {
  batchId: number
  onBack: () => void
}

/** 验收处置方式展示映射 */
type Disposition = 'pass' | 'return' | 'exchange' | 'concession'
/** labelKey 為 asset 段 key（復用驗收表單的处置方式文案），渲染時經 t() 轉換 */
const DISPOSITION_META: Record<Disposition, { labelKey: string; color: string }> = {
  pass: { labelKey: 'passBtn', color: 'success' },
  return: { labelKey: 'rejectReturn', color: 'error' },
  exchange: { labelKey: 'rejectExchange', color: 'warning' },
  concession: { labelKey: 'rejectConcession', color: 'processing' },
}

/**
 * 验收入库详情页组件
 *
 * @param props batchId=入库批次 ID；onBack=返回列表
 */
export default function InboundDetail({ batchId, onBack }: Props) {
  const { t } = useTranslation()
  const [loading, setLoading] = useState(false)
  const [batch, setBatch] = useState<InboundBatch | null>(null)
  const [locations, setLocations] = useState<AssetLocation[]>([])
  const [previewVisible, setPreviewVisible] = useState(false)
  const [previewImage, setPreviewImage] = useState('')
  const [previewPhotos, setPreviewPhotos] = useState<{ name: string; dataUrl: string }[]>([])
  const [previewIndex, setPreviewIndex] = useState(0)
  const [previewRotate, setPreviewRotate] = useState(0)

  // PR-3: 換貨二次發貨登記彈窗
  const [exchangeModal, setExchangeModal] = useState<InboundBatchItem | null>(null)
  const [exchangeTrackingNo, setExchangeTrackingNo] = useState('')
  const [exchangeExpectedDate, setExchangeExpectedDate] = useState('')
  const [exchangeSubmitting, setExchangeSubmitting] = useState(false)

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const [data, locList] = await Promise.all([
        fetchInboundDetail(batchId),
        fetchLocationList(),
      ])
      setBatch(data)
      setLocations(locList)
    } catch (e: unknown) {
      message.error(e instanceof Error ? e.message : t('asset.loadFailed'))
    } finally {
      setLoading(false)
    }
  }, [batchId, t])

  useEffect(() => { loadData() }, [loadData])

  /** 位置 ID → 名稱映射 */
  const locationMap = useMemo(() => {
    const map = new Map<number, string>()
    locations.forEach((loc) => map.set(loc.id, loc.name))
    return map
  }, [locations])
  
  /** PR-3: 提交換貨二次發貨登記 */
  const handleExchangeSubmit = async () => {
    if (!exchangeModal || exchangeModal.id == null) return
    if (!exchangeTrackingNo.trim()) { message.warning(t('asset.warnTrackingNo')); return }
    setExchangeSubmitting(true)
    try {
      await registerExchangeShipment(batchId, exchangeModal.id, {
        trackingNo: exchangeTrackingNo.trim(),
        expectedDate: exchangeExpectedDate.trim() || undefined,
      })
      message.success(t('asset.exchangeRegistered'))
      setExchangeModal(null)
      setExchangeTrackingNo('')
      setExchangeExpectedDate('')
      loadData()
    } catch (e: unknown) {
      message.error(e instanceof Error ? e.message : t('asset.registerFailed'))
    } finally {
      setExchangeSubmitting(false)
    }
  }

  /* ----- 明细表格列 ----- */
  const itemColumns: TableColumnsType<InboundBatchItem> = [
    { title: t('asset.colAssetName'), dataIndex: 'modelName', key: 'modelName', width: 180, ellipsis: true },
    { title: t('asset.colQty'), dataIndex: 'qty', key: 'qty', width: 80, align: 'right',
      render: (v: number) => <span style={{ fontWeight: 600 }}>{v}</span>,
    },
    {
      title: t('asset.colDisposeMethod'), dataIndex: 'disposition', key: 'disposition', width: 100,
      render: (v: Disposition | undefined) => {
        const meta = DISPOSITION_META[v || 'pass']
        return <Tag color={meta.color}>{t(`asset.${meta.labelKey}`)}</Tag>
      },
    },
    { title: t('asset.colStorageLocation'), dataIndex: 'locationId', key: 'locationId', width: 120,
      render: (v: number) => <span style={{ color: '#262626' }}>{locationMap.get(v) || '-'}</span>,
    },
    {
      title: t('asset.colRejectReason'), dataIndex: 'rejectReason', key: 'rejectReason', width: 200, ellipsis: true,
      render: (v: string | undefined) => <span style={{ color: '#595959' }}>{v || '-'}</span>,
    },
    {
      title: t('asset.colAccessories'), key: 'accessories', width: 220,
      render: (_: unknown, r: InboundBatchItem) => {
        const accs = r.accessories || []
        if (accs.length === 0) return <span style={{ color: '#bfbfbf' }}>-</span>
        return (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {accs.map((a, i) => (
              <Tag key={i} style={{ margin: 0, fontSize: 12 }}>{a.name} × {a.qty}</Tag>
            ))}
          </div>
        )
      },
    },
    {
      title: t('asset.colPhotos'), key: 'photos', width: 140,
      render: (_: unknown, r: InboundBatchItem) => {
        const photos = r.photos || []
        if (photos.length === 0) return <span style={{ color: '#bfbfbf' }}>-</span>
        return (
          <Space size={4}>
            {photos.slice(0, 3).map((p, i) => (
              <img
                key={i} src={p.dataUrl} alt={p.name}
                onClick={() => { setPreviewPhotos(photos); setPreviewIndex(i); setPreviewImage(p.dataUrl); setPreviewRotate(0); setPreviewVisible(true) }}
                style={{ width: 32, height: 32, objectFit: 'cover', borderRadius: 4, cursor: 'pointer', border: '1px solid #f0f0f0' }}
              />
            ))}
            {photos.length > 3 && (
              <span
                onClick={() => { setPreviewPhotos(photos); setPreviewIndex(0); setPreviewImage(photos[0].dataUrl); setPreviewRotate(0); setPreviewVisible(true) }}
                style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minWidth: 24, height: 20, padding: '0 6px', background: '#E8720C', color: '#fff', fontSize: 11, fontWeight: 600, borderRadius: 10, cursor: 'pointer' }}
              >
                +{photos.length - 3}
              </span>
            )}
          </Space>
        )
      },
    },
    {
      title: t('asset.colGeneratedNos'), key: 'assetNos', width: 300,
      render: (_: unknown, r: InboundBatchItem) => (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
          {r.assetNos.length > 0
            ? r.assetNos.map((no) => (
                <span key={no} style={{
                  padding: '2px 8px', borderRadius: 4,
                  background: '#f0f5ff', border: '1px solid #adc6ff',
                  fontFamily: 'monospace', fontSize: 12,
                }}>{no}</span>
              ))
            : <span style={{ color: '#bfbfbf' }}>—</span>
          }
        </div>
      ),
    },
    {
      title: t('asset.colExchangeTracking'), key: 'exchange', width: 160,
      render: (_: unknown, r: InboundBatchItem) => {
        if (r.disposition !== 'exchange') return <span style={{ color: '#bfbfbf' }}>-</span>
        return (
          <Space size={4} wrap>
            {r.exchangeStatus === 'shipped' ? (
              <Tooltip title={`${t('asset.trackingNoPrefix', { no: r.exchangeTrackingNo || '-' })}${r.exchangeExpectedDate ? ` · ${t('asset.expectedPrefix', { date: r.exchangeExpectedDate })}` : ''}`}>
                <Tag color="blue" style={{ margin: 0 }}>{t('asset.tagShipped')}</Tag>
              </Tooltip>
            ) : (
              <Tag color="orange" style={{ margin: 0 }}>{t('asset.tagPendingShipment')}</Tag>
            )}
            {r.exchangeStatus !== 'shipped' && (
              <Button type="link" size="small" style={{ fontSize: 12, padding: '0 2px' }}
                onClick={() => { setExchangeModal(r); setExchangeTrackingNo(''); setExchangeExpectedDate('') }}>
                {t('asset.registerShipmentBtn')}
              </Button>
            )}
          </Space>
        )
      },
    },
  ]

  if (loading || !batch) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 400 }}>
        <Spin size="large" tip={t('common.loading')} />
      </div>
    )
  }

  return (
    <>
      {/* ====== 页面頭部 ====== */}
      <DetailPageHeader
        title={t('asset.inboundDetailTitle')}
        tags={<Tag color="orange" style={{ marginLeft: 4 }}>{batch.batchNo}</Tag>}
        meta={<>{batch.poNo} · {batch.operator} · {batch.inboundDate}</>}
        onBack={onBack}
      />

      {/* ====== 批次信息 ====== */}
      <div style={{ borderRadius: 8, background: '#fff', padding: '20px 24px', marginBottom: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
          <div style={{ width: 28, height: 28, borderRadius: 6, background: '#fff7e6', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <FileTextOutlined style={{ fontSize: 14, color: '#fa8c16' }} />
          </div>
          <span style={{ fontSize: 15, fontWeight: 600, color: '#262626' }}>{t('asset.batchInfoTitle')}</span>
          <div style={{ flex: 1, height: 1, background: '#f0f0f0', marginLeft: 8 }} />
        </div>

        <Descriptions column={4} size="middle">
          <Descriptions.Item label={t('asset.colBatchNo')}><span style={{ fontFamily: 'monospace', fontWeight: 600 }}>{batch.batchNo}</span></Descriptions.Item>
          <Descriptions.Item label={t('asset.colPoNo')}><span style={{ fontFamily: 'monospace' }}>{batch.poNo}</span></Descriptions.Item>
          <Descriptions.Item label={t('asset.labelInboundDate')}>{batch.inboundDate}</Descriptions.Item>
          <Descriptions.Item label={t('asset.colOperator')}>{batch.operator || '-'}</Descriptions.Item>
          <Descriptions.Item label={t('asset.orderBrand')}>
            {batch.brand ? <BrandTag value={batch.brand} /> : <span style={{ color: '#bfbfbf' }}>-</span>}
          </Descriptions.Item>
          <Descriptions.Item label={t('asset.colCreatedAt')}>{batch.createdAt}</Descriptions.Item>
          {batch.purchaseReason && <Descriptions.Item label={t('asset.orderReasonLabel')} span={4}>{batch.purchaseReason}</Descriptions.Item>}
        </Descriptions>
      </div>

      {/* ====== 验收统计 ====== */}
      <div style={{ borderRadius: 8, background: '#fff', padding: '20px 24px', marginBottom: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
          <div style={{ width: 28, height: 28, borderRadius: 6, background: '#f6ffed', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <ShoppingCartOutlined style={{ fontSize: 14, color: '#52c41a' }} />
          </div>
          <span style={{ fontSize: 15, fontWeight: 600, color: '#262626' }}>{t('asset.statsTitle')}</span>
          <div style={{ flex: 1, height: 1, background: '#f0f0f0', marginLeft: 8 }} />
        </div>

        <Row gutter={16}>
          <Col span={4}>
            <div style={{ textAlign: 'center', padding: '12px 0', background: '#FAFAFA', borderRadius: 8 }}>
              <div style={{ fontSize: 12, color: '#8C8C8C', marginBottom: 6 }}>{t('asset.statTotal')}</div>
              <div style={{ fontSize: 22, fontWeight: 700, color: '#262626' }}>{batch.totalQty}</div>
            </div>
          </Col>
          <Col span={4}>
            <div style={{ textAlign: 'center', padding: '12px 0', background: '#f6ffed', borderRadius: 8, border: '1px solid #b7eb8f22' }}>
              <div style={{ fontSize: 12, color: '#8C8C8C', marginBottom: 6 }}>
                <CheckCircleOutlined style={{ color: '#52C41A', marginRight: 4 }} />{t('asset.colReceived')}
              </div>
              <div style={{ fontSize: 22, fontWeight: 700, color: '#52C41A' }}>{batch.acceptedQty}</div>
            </div>
          </Col>
          <Col span={4}>
            <div style={{ textAlign: 'center', padding: '12px 0', background: batch.pendingQty > 0 ? '#fff2f0' : '#FAFAFA', borderRadius: 8 }}>
              <div style={{ fontSize: 12, color: '#8C8C8C', marginBottom: 6 }}>{t('asset.statPending')}</div>
              <div style={{ fontSize: 22, fontWeight: 700, color: batch.pendingQty > 0 ? '#FF4D4F' : '#8C8C8C' }}>{batch.pendingQty}</div>
            </div>
          </Col>
          <Col span={4}>
            <div style={{ textAlign: 'center', padding: '12px 0', background: batch.returnQty > 0 ? '#fff2f0' : '#FAFAFA', borderRadius: 8 }}>
              <div style={{ fontSize: 12, color: '#8C8C8C', marginBottom: 6 }}>
                <RollbackOutlined style={{ color: '#FF4D4F', marginRight: 4 }} />{t('asset.rejectReturn')}
              </div>
              <div style={{ fontSize: 22, fontWeight: 700, color: batch.returnQty > 0 ? '#FF4D4F' : '#8C8C8C' }}>{batch.returnQty}</div>
            </div>
          </Col>
          <Col span={4}>
            <div style={{ textAlign: 'center', padding: '12px 0', background: batch.exchangeQty > 0 ? '#fffbe6' : '#FAFAFA', borderRadius: 8 }}>
              <div style={{ fontSize: 12, color: '#8C8C8C', marginBottom: 6 }}>
                <SwapOutlined style={{ color: '#FAAD14', marginRight: 4 }} />{t('asset.rejectExchange')}
              </div>
              <div style={{ fontSize: 22, fontWeight: 700, color: batch.exchangeQty > 0 ? '#FAAD14' : '#8C8C8C' }}>{batch.exchangeQty}</div>
            </div>
          </Col>
          <Col span={4}>
            <div style={{ textAlign: 'center', padding: '12px 0', background: batch.concessionQty > 0 ? '#e6f7ff' : '#FAFAFA', borderRadius: 8 }}>
              <div style={{ fontSize: 12, color: '#8C8C8C', marginBottom: 6 }}>
                <ExclamationCircleOutlined style={{ color: '#1890FF', marginRight: 4 }} />{t('asset.rejectConcession')}
              </div>
              <div style={{ fontSize: 22, fontWeight: 700, color: batch.concessionQty > 0 ? '#1890FF' : '#8C8C8C' }}>{batch.concessionQty}</div>
            </div>
          </Col>
        </Row>
      </div>

      {/* ====== 入库明细 ====== */}
      <div style={{ borderRadius: 8, background: '#fff', padding: '20px 24px', marginBottom: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
          <div style={{ width: 28, height: 28, borderRadius: 6, background: '#e6f7ff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <EnvironmentOutlined style={{ fontSize: 14, color: '#1890ff' }} />
          </div>
          <span style={{ fontSize: 15, fontWeight: 600, color: '#262626' }}>{t('asset.itemsTitle')}</span>
          <Tag color="blue" style={{ fontSize: 11 }}>{t('asset.exceptionCountTag', { count: batch.items.length })}</Tag>
          <div style={{ flex: 1, height: 1, background: '#f0f0f0', marginLeft: 8 }} />
        </div>

        <Table<InboundBatchItem>
          columns={itemColumns}
          dataSource={batch.items}
          rowKey={(r) => r.modelId?.toString() || Math.random().toString()}
          size="small"
          pagination={false}
          scroll={{ x: 1320 }}
        />
      </div>

      {/* ====== 備註 ====== */}
      {batch.remark && (
        <div style={{ borderRadius: 8, background: '#fff', padding: '20px 24px', marginBottom: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <span style={{ fontSize: 14, fontWeight: 600, color: '#262626' }}>{t('asset.remarkTitle')}</span>
            <div style={{ flex: 1, height: 1, background: '#f0f0f0', marginLeft: 8 }} />
          </div>
          <div style={{ fontSize: 14, color: '#595959', lineHeight: 1.8 }}>{batch.remark}</div>
        </div>
      )}

      {/* ====== 最後更新 ====== */}
      <div style={{
        background: '#fafafa', borderRadius: 8, padding: '12px 24px',
        border: '1px solid #f0f0f0',
        display: 'flex', justifyContent: 'flex-end', gap: 24,
      }}>
        <span style={{ fontSize: 12, color: '#8C8C8C' }}>{t('asset.updatedByLabel')}<span style={{ color: '#595959' }}>{batch.updatedBy || '-'}</span></span>
        <span style={{ fontSize: 12, color: '#8C8C8C' }}>{t('asset.updatedAtLabel')}<span style={{ color: '#595959' }}>{batch.updatedAt || '-'}</span></span>
      </div>

      {/* ====== 照片預覽 ====== */}
      <Modal
        open={previewVisible}
        footer={null}
        onCancel={() => { setPreviewVisible(false); setPreviewRotate(0) }}
        centered
        width={720}
        title={<span style={{ fontSize: 15, fontWeight: 600 }}>照片預覽 ({previewIndex + 1} / {previewPhotos.length})</span>}
      >
        {/* 图片区域 */}
        <div style={{ minHeight: 400, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#fafafa', borderRadius: 8, padding: 24 }}>
          <img
            alt="preview"
            src={previewImage}
            style={{ maxWidth: '100%', maxHeight: 520, objectFit: 'contain', transform: `rotate(${previewRotate}deg)`, transition: 'transform 0.3s ease' }}
          />
        </div>
        {/* 工具栏 */}
        <div style={{ marginTop: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12 }}>
          <Button
            onClick={() => { const idx = previewIndex - 1; if (idx >= 0) { setPreviewIndex(idx); setPreviewImage(previewPhotos[idx].dataUrl); setPreviewRotate(0) } }}
            disabled={previewIndex === 0}
            style={{ width: 40, height: 40, borderRadius: 8, fontSize: 18, fontWeight: 600, background: '#fff', border: '1px solid #d9d9d9' }}
          >
            ‹
          </Button>
          <Button
            onClick={() => setPreviewRotate((prev) => prev - 90)}
            style={{ height: 40, borderRadius: 8, fontSize: 13, fontWeight: 500, padding: '0 16px', background: '#fff', border: '1px solid #d9d9d9' }}
          >
            ↺ 逆時針
          </Button>
          <Button
            onClick={() => setPreviewRotate((prev) => prev + 90)}
            style={{ height: 40, borderRadius: 8, fontSize: 13, fontWeight: 500, padding: '0 16px', background: '#fff', border: '1px solid #d9d9d9' }}
          >
            ↻ 順時針
          </Button>
          <Button
            onClick={() => { const idx = previewIndex + 1; if (idx < previewPhotos.length) { setPreviewIndex(idx); setPreviewImage(previewPhotos[idx].dataUrl); setPreviewRotate(0) } }}
            disabled={previewIndex === previewPhotos.length - 1}
            style={{ width: 40, height: 40, borderRadius: 8, fontSize: 18, fontWeight: 600, background: '#fff', border: '1px solid #d9d9d9' }}
          >
            ›
          </Button>
        </div>
        {/* 底部缩略图导航 */}
        {previewPhotos.length > 1 && (
          <div style={{ marginTop: 16, display: 'flex', justifyContent: 'center', gap: 8, flexWrap: 'wrap', paddingBottom: 8 }}>
            {previewPhotos.map((p, i) => (
              <img
                key={i}
                src={p.dataUrl}
                alt={p.name}
                onClick={() => { setPreviewIndex(i); setPreviewImage(p.dataUrl); setPreviewRotate(0) }}
                style={{
                  width: 56, height: 56, objectFit: 'cover', borderRadius: 6,
                  border: i === previewIndex ? '2px solid #E8720C' : '1px solid #f0f0f0',
                  opacity: i === previewIndex ? 1 : 0.6,
                  boxShadow: i === previewIndex ? '0 2px 8px rgba(232,114,12,0.25)' : 'none',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                }}
              />
            ))}
          </div>
        )}
      </Modal>

      {/* ====== 換貨二次發貨登記（PR-3） ====== */}
      <Modal
        title={t('asset.exchangeModalTitle')}
        open={!!exchangeModal}
        onOk={handleExchangeSubmit}
        onCancel={() => setExchangeModal(null)}
        okText={t('asset.confirmRegister')}
        cancelText={t('common.cancel')}
        confirmLoading={exchangeSubmitting}
        destroyOnClose
      >
        {exchangeModal && (
          <div>
            <div style={{ background: '#FAFAFA', border: '1px solid #f0f0f0', borderRadius: 8, padding: '12px 16px', marginBottom: 16, fontSize: 13 }}>
              <div><span style={{ color: '#8C8C8C' }}>{t('asset.modelNameLabel')}</span><b>{exchangeModal.modelName}</b></div>
              <div><span style={{ color: '#8C8C8C' }}>{t('asset.exchangeQtyLabel')}</span><b style={{ color: '#FA8C16' }}>{exchangeModal.qty}</b> {t('asset.unitPiece')}</div>
            </div>
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 13, marginBottom: 6 }}>{t('asset.trackingNoLabel')} <span style={{ color: '#FF4D4F' }}>*</span></div>
              <Input value={exchangeTrackingNo} onChange={(e) => setExchangeTrackingNo(e.target.value)} placeholder={t('asset.phTrackingNo')} allowClear />
            </div>
            <div>
              <div style={{ fontSize: 13, marginBottom: 6 }}>{t('asset.expectedArrivalLabel')}</div>
              <Input value={exchangeExpectedDate} onChange={(e) => setExchangeExpectedDate(e.target.value)} placeholder={t('asset.phOptionalDate')} allowClear />
            </div>
          </div>
        )}
      </Modal>
    </>
  )
}
