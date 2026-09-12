/**
 * 驗收入庫詳情頁
 *
 * - 展示入庫批次的完整信息（批次號、訂單號、經辦人、日期、數量統計等）
 * - 明細表格展示入庫物資及生成的資產編號
 * - 遵循全局詳情頁規範：DetailPageHeader（紫色漸變頂條）+ 卡片佈局 + 無底部操作欄
 */
import { useState, useEffect, useCallback, useMemo } from 'react'
import { Table, Tag, Row, Col, Spin, message } from 'antd'
import type { TableColumnsType } from 'antd'
import {
  ShoppingCartOutlined, FileTextOutlined, EnvironmentOutlined, CheckCircleOutlined,
  ExclamationCircleOutlined, SwapOutlined, RollbackOutlined,
} from '@ant-design/icons'
import DetailPageHeader from '../../../components/DetailPageHeader'
import { fetchInboundDetail, fetchLocationList, type InboundBatch, type InboundBatchItem, type AssetLocation } from '../../../api/eam'

interface Props {
  batchId: number
  onBack: () => void
}

/** 驗收處置方式展示映射 */
type Disposition = 'pass' | 'return' | 'exchange' | 'concession'
const DISPOSITION_META: Record<Disposition, { label: string; color: string }> = {
  pass: { label: '通過', color: 'success' },
  return: { label: '退貨', color: 'error' },
  exchange: { label: '換貨', color: 'warning' },
  concession: { label: '讓步接收', color: 'processing' },
}

export default function InboundDetail({ batchId, onBack }: Props) {
  const [loading, setLoading] = useState(false)
  const [batch, setBatch] = useState<InboundBatch | null>(null)
  const [locations, setLocations] = useState<AssetLocation[]>([])

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

  /* ----- 明細表格列 ----- */
  const itemColumns: TableColumnsType<InboundBatchItem> = [
    { title: '資產名稱', dataIndex: 'modelName', key: 'modelName', width: 180, ellipsis: true },
    { title: '數量', dataIndex: 'qty', key: 'qty', width: 80, align: 'right',
      render: (v: number) => <span style={{ fontWeight: 600 }}>{v}</span>,
    },
    {
      title: '處置方式', dataIndex: 'disposition', key: 'disposition', width: 100,
      render: (v: Disposition | undefined) => {
        const meta = DISPOSITION_META[v || 'pass']
        return <Tag color={meta.color}>{meta.label}</Tag>
      },
    },
    { title: '存放位置', dataIndex: 'locationId', key: 'locationId', width: 120,
      render: (v: number) => <span style={{ color: '#262626' }}>{locationMap.get(v) || '-'}</span>,
    },
    {
      title: '不通過原因', dataIndex: 'rejectReason', key: 'rejectReason', width: 200, ellipsis: true,
      render: (v: string | undefined) => <span style={{ color: '#595959' }}>{v || '-'}</span>,
    },
    {
      title: '生成資產編號', key: 'assetNos', width: 300,
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
      {/* ====== 頁面頭部 ====== */}
      <DetailPageHeader
        title="驗收入庫詳情"
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
            <div style={{ fontSize: 12, color: '#8C8C8C', marginBottom: 4 }}>入庫批次號</div>
            <div style={{ fontSize: 14, color: '#262626', fontFamily: 'monospace', fontWeight: 600 }}>{batch.batchNo}</div>
          </Col>
          <Col span={8}>
            <div style={{ fontSize: 12, color: '#8C8C8C', marginBottom: 4 }}>採購訂單號</div>
            <div style={{ fontSize: 14, color: '#262626', fontFamily: 'monospace' }}>{batch.poNo}</div>
          </Col>
          <Col span={8}>
            <div style={{ fontSize: 12, color: '#8C8C8C', marginBottom: 4 }}>驗收日期</div>
            <div style={{ fontSize: 14, color: '#262626' }}>{batch.inboundDate}</div>
          </Col>
        </Row>
        <Row gutter={24} style={{ marginTop: 16 }}>
          <Col span={8}>
            <div style={{ fontSize: 12, color: '#8C8C8C', marginBottom: 4 }}>操作人</div>
            <div style={{ fontSize: 14, color: '#262626' }}>{batch.operator || '-'}</div>
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

      {/* ====== 驗收統計 ====== */}
      <div style={{ border: '1px solid #e8eaed', borderRadius: 8, background: '#fff', padding: '20px 24px', marginBottom: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
          <div style={{ width: 28, height: 28, borderRadius: 6, background: '#f6ffed', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <ShoppingCartOutlined style={{ fontSize: 14, color: '#52c41a' }} />
          </div>
          <span style={{ fontSize: 15, fontWeight: 600, color: '#262626' }}>驗收統計</span>
          <div style={{ flex: 1, height: 1, background: '#f0f0f0', marginLeft: 8 }} />
        </div>

        <Row gutter={16}>
          <Col span={4}>
            <div style={{ textAlign: 'center', padding: '12px 0', background: '#FAFAFA', borderRadius: 8 }}>
              <div style={{ fontSize: 12, color: '#8C8C8C', marginBottom: 6 }}>總數量</div>
              <div style={{ fontSize: 22, fontWeight: 700, color: '#262626' }}>{batch.totalQty}</div>
            </div>
          </Col>
          <Col span={4}>
            <div style={{ textAlign: 'center', padding: '12px 0', background: '#f6ffed', borderRadius: 8, border: '1px solid #b7eb8f22' }}>
              <div style={{ fontSize: 12, color: '#8C8C8C', marginBottom: 6 }}>
                <CheckCircleOutlined style={{ color: '#52C41A', marginRight: 4 }} />已驗收
              </div>
              <div style={{ fontSize: 22, fontWeight: 700, color: '#52C41A' }}>{batch.acceptedQty}</div>
            </div>
          </Col>
          <Col span={4}>
            <div style={{ textAlign: 'center', padding: '12px 0', background: batch.pendingQty > 0 ? '#fff2f0' : '#FAFAFA', borderRadius: 8 }}>
              <div style={{ fontSize: 12, color: '#8C8C8C', marginBottom: 6 }}>未驗收</div>
              <div style={{ fontSize: 22, fontWeight: 700, color: batch.pendingQty > 0 ? '#FF4D4F' : '#8C8C8C' }}>{batch.pendingQty}</div>
            </div>
          </Col>
          <Col span={4}>
            <div style={{ textAlign: 'center', padding: '12px 0', background: batch.returnQty > 0 ? '#fff2f0' : '#FAFAFA', borderRadius: 8 }}>
              <div style={{ fontSize: 12, color: '#8C8C8C', marginBottom: 6 }}>
                <RollbackOutlined style={{ color: '#FF4D4F', marginRight: 4 }} />退貨
              </div>
              <div style={{ fontSize: 22, fontWeight: 700, color: batch.returnQty > 0 ? '#FF4D4F' : '#8C8C8C' }}>{batch.returnQty}</div>
            </div>
          </Col>
          <Col span={4}>
            <div style={{ textAlign: 'center', padding: '12px 0', background: batch.exchangeQty > 0 ? '#fffbe6' : '#FAFAFA', borderRadius: 8 }}>
              <div style={{ fontSize: 12, color: '#8C8C8C', marginBottom: 6 }}>
                <SwapOutlined style={{ color: '#FAAD14', marginRight: 4 }} />換貨
              </div>
              <div style={{ fontSize: 22, fontWeight: 700, color: batch.exchangeQty > 0 ? '#FAAD14' : '#8C8C8C' }}>{batch.exchangeQty}</div>
            </div>
          </Col>
          <Col span={4}>
            <div style={{ textAlign: 'center', padding: '12px 0', background: batch.concessionQty > 0 ? '#e6f7ff' : '#FAFAFA', borderRadius: 8 }}>
              <div style={{ fontSize: 12, color: '#8C8C8C', marginBottom: 6 }}>
                <ExclamationCircleOutlined style={{ color: '#1890FF', marginRight: 4 }} />讓步接收
              </div>
              <div style={{ fontSize: 22, fontWeight: 700, color: batch.concessionQty > 0 ? '#1890FF' : '#8C8C8C' }}>{batch.concessionQty}</div>
            </div>
          </Col>
        </Row>
      </div>

      {/* ====== 入庫明細 ====== */}
      <div style={{ border: '1px solid #e8eaed', borderRadius: 8, background: '#fff', padding: '20px 24px', marginBottom: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
          <div style={{ width: 28, height: 28, borderRadius: 6, background: '#e6f7ff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <EnvironmentOutlined style={{ fontSize: 14, color: '#1890ff' }} />
          </div>
          <span style={{ fontSize: 15, fontWeight: 600, color: '#262626' }}>入庫明細</span>
          <Tag color="blue" style={{ fontSize: 11 }}>共 {batch.items.length} 項</Tag>
          <div style={{ flex: 1, height: 1, background: '#f0f0f0', marginLeft: 8 }} />
        </div>

        <Table<InboundBatchItem>
          columns={itemColumns}
          dataSource={batch.items}
          rowKey={(r) => r.modelId?.toString() || Math.random().toString()}
          size="small"
          pagination={false}
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
    </>
  )
}
