/**
 * 验收入库详情页
 *
 * - 展示入库批次的完整信息（批次号、订单号、经办人、日期、数量统计等）
 * - 明细表格展示入库物资及生成的资产编号
 * - 遵循全局详情页规范：DetailPageHeader（紫色渐变顶条）+ 卡片布局 + 无底部操作栏
 */
import { useState, useEffect, useCallback, useMemo } from 'react'
import { Table, Tag, Row, Col, Spin, message, Modal, Button, Input, Space, Tooltip } from 'antd'
import type { TableColumnsType } from 'antd'
import {
  ShoppingCartOutlined, FileTextOutlined, EnvironmentOutlined, CheckCircleOutlined,
  ExclamationCircleOutlined, SwapOutlined, RollbackOutlined, CameraOutlined,
} from '@ant-design/icons'
import DetailPageHeader from '../../../components/DetailPageHeader'
import BrandTag from '../../../components/BrandTag'
import { fetchInboundDetail, fetchLocationList, registerExchangeShipment, type InboundBatch, type InboundBatchItem, type AssetLocation } from '../../../api/eam'

interface Props {
  batchId: number
  onBack: () => void
}

/** 验收处置方式展示映射 */
type Disposition = 'pass' | 'return' | 'exchange' | 'concession'
const DISPOSITION_META: Record<Disposition, { label: string; color: string }> = {
  pass: { label: '通过', color: 'success' },
  return: { label: '退货', color: 'error' },
  exchange: { label: '换货', color: 'warning' },
  concession: { label: '让步接收', color: 'processing' },
}

/**
 * 验收入库详情页组件
 *
 * @param props batchId=入库批次 ID；onBack=返回列表
 */
export default function InboundDetail({ batchId, onBack }: Props) {
  const [loading, setLoading] = useState(false)
  const [batch, setBatch] = useState<InboundBatch | null>(null)
  const [locations, setLocations] = useState<AssetLocation[]>([])
  const [previewVisible, setPreviewVisible] = useState(false)
  const [previewImage, setPreviewImage] = useState('')

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
      message.error(e instanceof Error ? e.message : '加載失敗')
    } finally {
      setLoading(false)
    }
  }, [batchId])

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
    if (!exchangeTrackingNo.trim()) { message.warning('請填寫物流單號'); return }
    setExchangeSubmitting(true)
    try {
      await registerExchangeShipment(batchId, exchangeModal.id, {
        trackingNo: exchangeTrackingNo.trim(),
        expectedDate: exchangeExpectedDate.trim() || undefined,
      })
      message.success('二次發貨登記成功')
      setExchangeModal(null)
      setExchangeTrackingNo('')
      setExchangeExpectedDate('')
      loadData()
    } catch (e: unknown) {
      message.error(e instanceof Error ? e.message : '登記失敗')
    } finally {
      setExchangeSubmitting(false)
    }
  }

  /* ----- 明细表格列 ----- */
  const itemColumns: TableColumnsType<InboundBatchItem> = [
    { title: '资产名称', dataIndex: 'modelName', key: 'modelName', width: 180, ellipsis: true },
    { title: '数量', dataIndex: 'qty', key: 'qty', width: 80, align: 'right',
      render: (v: number) => <span style={{ fontWeight: 600 }}>{v}</span>,
    },
    {
      title: '处置方式', dataIndex: 'disposition', key: 'disposition', width: 100,
      render: (v: Disposition | undefined) => {
        const meta = DISPOSITION_META[v || 'pass']
        return <Tag color={meta.color}>{meta.label}</Tag>
      },
    },
    { title: '存放位置', dataIndex: 'locationId', key: 'locationId', width: 120,
      render: (v: number) => <span style={{ color: '#262626' }}>{locationMap.get(v) || '-'}</span>,
    },
    {
      title: '不通过原因', dataIndex: 'rejectReason', key: 'rejectReason', width: 200, ellipsis: true,
      render: (v: string | undefined) => <span style={{ color: '#595959' }}>{v || '-'}</span>,
    },
    {
      title: '配件清單', key: 'accessories', width: 220,
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
      title: '验收照片', key: 'photos', width: 120,
      render: (_: unknown, r: InboundBatchItem) => {
        const photos = r.photos || []
        if (photos.length === 0) return <span style={{ color: '#bfbfbf' }}>-</span>
        return (
          <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
            {photos.slice(0, 3).map((p, idx) => (
              <img
                key={idx} src={p.dataUrl} alt={p.name}
                style={{ width: 32, height: 32, objectFit: 'cover', borderRadius: 4, border: '1px solid #d9d9d9', cursor: 'pointer' }}
                onClick={() => { setPreviewImage(p.dataUrl); setPreviewVisible(true) }}
              />
            ))}
            {photos.length > 3 && (
              <span style={{ fontSize: 11, color: '#8c8c8c', lineHeight: '32px' }}>+{photos.length - 3}</span>
            )}
          </div>
        )
      },
    },
    {
      title: '生成资产编号', key: 'assetNos', width: 300,
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
      title: '換貨跟蹤', key: 'exchange', width: 160,
      render: (_: unknown, r: InboundBatchItem) => {
        if (r.disposition !== 'exchange') return <span style={{ color: '#bfbfbf' }}>-</span>
        return (
          <Space size={4} wrap>
            {r.exchangeStatus === 'shipped' ? (
              <Tooltip title={`單號 ${r.exchangeTrackingNo || '-'}${r.exchangeExpectedDate ? ` · 預計 ${r.exchangeExpectedDate}` : ''}`}>
                <Tag color="blue" style={{ margin: 0 }}>已發貨</Tag>
              </Tooltip>
            ) : (
              <Tag color="orange" style={{ margin: 0 }}>待發貨</Tag>
            )}
            {r.exchangeStatus !== 'shipped' && (
              <Button type="link" size="small" style={{ fontSize: 12, padding: '0 2px' }}
                onClick={() => { setExchangeModal(r); setExchangeTrackingNo(''); setExchangeExpectedDate('') }}>
                登記發貨
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
        <Spin size="large" tip="加載中..." />
      </div>
    )
  }

  const hasReject = (batch.returnQty || 0) + (batch.exchangeQty || 0) + (batch.concessionQty || 0) > 0

  return (
    <>
      {/* ====== 页面頭部 ====== */}
      <DetailPageHeader
        title="验收入库详情"
        tags={<Tag color="orange" style={{ marginLeft: 4 }}>{batch.batchNo}</Tag>}
        meta={<>{batch.poNo} · {batch.operator} · {batch.inboundDate}</>}
        onBack={onBack}
      />

      {/* ====== 批次信息 ====== */}
      <div style={{ border: '1px solid #e8eaed', borderRadius: 8, background: '#fff', padding: '20px 24px', marginBottom: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
          <div style={{ width: 28, height: 28, borderRadius: 6, background: '#fff7e6', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <FileTextOutlined style={{ fontSize: 14, color: '#fa8c16' }} />
          </div>
          <span style={{ fontSize: 15, fontWeight: 600, color: '#262626' }}>批次信息</span>
          <div style={{ flex: 1, height: 1, background: '#f0f0f0', marginLeft: 8 }} />
        </div>

        <Row gutter={24}>
          <Col span={8}>
            <div style={{ fontSize: 12, color: '#8C8C8C', marginBottom: 4 }}>入库批次号</div>
            <div style={{ fontSize: 14, color: '#262626', fontFamily: 'monospace', fontWeight: 600 }}>{batch.batchNo}</div>
          </Col>
          <Col span={8}>
            <div style={{ fontSize: 12, color: '#8C8C8C', marginBottom: 4 }}>採購订单号</div>
            <div style={{ fontSize: 14, color: '#262626', fontFamily: 'monospace' }}>{batch.poNo}</div>
          </Col>
          <Col span={8}>
            <div style={{ fontSize: 12, color: '#8C8C8C', marginBottom: 4 }}>验收日期</div>
            <div style={{ fontSize: 14, color: '#262626' }}>{batch.inboundDate}</div>
          </Col>
        </Row>
        <Row gutter={24} style={{ marginTop: 16 }}>
          <Col span={8}>
            <div style={{ fontSize: 12, color: '#8C8C8C', marginBottom: 4 }}>操作人</div>
            <div style={{ fontSize: 14, color: '#262626' }}>{batch.operator || '-'}</div>
          </Col>
          <Col span={8}>
            <div style={{ fontSize: 12, color: '#8C8C8C', marginBottom: 4 }}>所屬品牌</div>
            <div style={{ fontSize: 14 }}>
              {batch.brand ? <BrandTag value={batch.brand} /> : <span style={{ color: '#bfbfbf' }}>-</span>}
            </div>
          </Col>
          <Col span={8}>
            <div style={{ fontSize: 12, color: '#8C8C8C', marginBottom: 4 }}>創建時間</div>
            <div style={{ fontSize: 14, color: '#262626' }}>{batch.createdAt}</div>
          </Col>
        </Row>
        {batch.purchaseReason && (
          <Row gutter={24} style={{ marginTop: 16 }}>
            <Col span={24}>
              <div style={{ fontSize: 12, color: '#8C8C8C', marginBottom: 4 }}>採購事由</div>
              <div style={{ fontSize: 14, color: '#262626' }}>{batch.purchaseReason}</div>
            </Col>
          </Row>
        )}
      </div>

      {/* ====== 验收统计 ====== */}
      <div style={{ border: '1px solid #e8eaed', borderRadius: 8, background: '#fff', padding: '20px 24px', marginBottom: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
          <div style={{ width: 28, height: 28, borderRadius: 6, background: '#f6ffed', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <ShoppingCartOutlined style={{ fontSize: 14, color: '#52c41a' }} />
          </div>
          <span style={{ fontSize: 15, fontWeight: 600, color: '#262626' }}>验收统计</span>
          <div style={{ flex: 1, height: 1, background: '#f0f0f0', marginLeft: 8 }} />
        </div>

        <Row gutter={16}>
          <Col span={4}>
            <div style={{ textAlign: 'center', padding: '12px 0', background: '#FAFAFA', borderRadius: 8 }}>
              <div style={{ fontSize: 12, color: '#8C8C8C', marginBottom: 6 }}>總数量</div>
              <div style={{ fontSize: 22, fontWeight: 700, color: '#262626' }}>{batch.totalQty}</div>
            </div>
          </Col>
          <Col span={4}>
            <div style={{ textAlign: 'center', padding: '12px 0', background: '#f6ffed', borderRadius: 8, border: '1px solid #b7eb8f22' }}>
              <div style={{ fontSize: 12, color: '#8C8C8C', marginBottom: 6 }}>
                <CheckCircleOutlined style={{ color: '#52C41A', marginRight: 4 }} />已验收
              </div>
              <div style={{ fontSize: 22, fontWeight: 700, color: '#52C41A' }}>{batch.acceptedQty}</div>
            </div>
          </Col>
          <Col span={4}>
            <div style={{ textAlign: 'center', padding: '12px 0', background: batch.pendingQty > 0 ? '#fff2f0' : '#FAFAFA', borderRadius: 8 }}>
              <div style={{ fontSize: 12, color: '#8C8C8C', marginBottom: 6 }}>未验收</div>
              <div style={{ fontSize: 22, fontWeight: 700, color: batch.pendingQty > 0 ? '#FF4D4F' : '#8C8C8C' }}>{batch.pendingQty}</div>
            </div>
          </Col>
          <Col span={4}>
            <div style={{ textAlign: 'center', padding: '12px 0', background: batch.returnQty > 0 ? '#fff2f0' : '#FAFAFA', borderRadius: 8 }}>
              <div style={{ fontSize: 12, color: '#8C8C8C', marginBottom: 6 }}>
                <RollbackOutlined style={{ color: '#FF4D4F', marginRight: 4 }} />退货
              </div>
              <div style={{ fontSize: 22, fontWeight: 700, color: batch.returnQty > 0 ? '#FF4D4F' : '#8C8C8C' }}>{batch.returnQty}</div>
            </div>
          </Col>
          <Col span={4}>
            <div style={{ textAlign: 'center', padding: '12px 0', background: batch.exchangeQty > 0 ? '#fffbe6' : '#FAFAFA', borderRadius: 8 }}>
              <div style={{ fontSize: 12, color: '#8C8C8C', marginBottom: 6 }}>
                <SwapOutlined style={{ color: '#FAAD14', marginRight: 4 }} />换货
              </div>
              <div style={{ fontSize: 22, fontWeight: 700, color: batch.exchangeQty > 0 ? '#FAAD14' : '#8C8C8C' }}>{batch.exchangeQty}</div>
            </div>
          </Col>
          <Col span={4}>
            <div style={{ textAlign: 'center', padding: '12px 0', background: batch.concessionQty > 0 ? '#e6f7ff' : '#FAFAFA', borderRadius: 8 }}>
              <div style={{ fontSize: 12, color: '#8C8C8C', marginBottom: 6 }}>
                <ExclamationCircleOutlined style={{ color: '#1890FF', marginRight: 4 }} />让步接收
              </div>
              <div style={{ fontSize: 22, fontWeight: 700, color: batch.concessionQty > 0 ? '#1890FF' : '#8C8C8C' }}>{batch.concessionQty}</div>
            </div>
          </Col>
        </Row>
      </div>

      {/* ====== 入库明细 ====== */}
      <div style={{ border: '1px solid #e8eaed', borderRadius: 8, background: '#fff', padding: '20px 24px', marginBottom: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
          <div style={{ width: 28, height: 28, borderRadius: 6, background: '#e6f7ff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <EnvironmentOutlined style={{ fontSize: 14, color: '#1890ff' }} />
          </div>
          <span style={{ fontSize: 15, fontWeight: 600, color: '#262626' }}>入库明细</span>
          <Tag color="blue" style={{ fontSize: 11 }}>共 {batch.items.length} 項</Tag>
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
        <div style={{ border: '1px solid #e8eaed', borderRadius: 8, background: '#fff', padding: '20px 24px', marginBottom: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <span style={{ fontSize: 14, fontWeight: 600, color: '#262626' }}>備註</span>
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
        <span style={{ fontSize: 12, color: '#8C8C8C' }}>最後更新人：<span style={{ color: '#595959' }}>{batch.updatedBy || '-'}</span></span>
        <span style={{ fontSize: 12, color: '#8C8C8C' }}>最後更新時間：<span style={{ color: '#595959' }}>{batch.updatedAt || '-'}</span></span>
      </div>

      {/* ====== 照片預覽 ====== */}
      <Modal
        open={previewVisible}
        footer={null}
        onCancel={() => setPreviewVisible(false)}
        centered
      >
        <img alt="preview" style={{ width: '100%' }} src={previewImage} />
      </Modal>

      {/* ====== 換貨二次發貨登記（PR-3） ====== */}
      <Modal
        title="登記換貨二次發貨"
        open={!!exchangeModal}
        onOk={handleExchangeSubmit}
        onCancel={() => setExchangeModal(null)}
        okText="確認登記"
        cancelText="取消"
        confirmLoading={exchangeSubmitting}
        destroyOnClose
      >
        {exchangeModal && (
          <div>
            <div style={{ background: '#FAFAFA', border: '1px solid #f0f0f0', borderRadius: 8, padding: '12px 16px', marginBottom: 16, fontSize: 13 }}>
              <div><span style={{ color: '#8C8C8C' }}>資產名稱：</span><b>{exchangeModal.modelName}</b></div>
              <div><span style={{ color: '#8C8C8C' }}>換貨數量：</span><b style={{ color: '#FA8C16' }}>{exchangeModal.qty}</b> 件</div>
            </div>
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 13, marginBottom: 6 }}>物流單號 <span style={{ color: '#FF4D4F' }}>*</span></div>
              <Input value={exchangeTrackingNo} onChange={(e) => setExchangeTrackingNo(e.target.value)} placeholder="請輸入供應商二次發貨的物流單號" allowClear />
            </div>
            <div>
              <div style={{ fontSize: 13, marginBottom: 6 }}>預計到貨日</div>
              <Input value={exchangeExpectedDate} onChange={(e) => setExchangeExpectedDate(e.target.value)} placeholder="YYYY-MM-DD（可選）" allowClear />
            </div>
          </div>
        )}
      </Modal>
    </>
  )
}
