/**
 * 交接記錄列表
 *
 * - 展示離職/調崗批量交接記錄（交出人 → 接收人、資產數量、交接原因）
 * - 展開行查看本次交接的資產明細（編號 + 名稱）
 */
import { useState, useEffect, useCallback } from 'react'
import { Button, Form, Input, Select, Table, Tag, message, Space } from 'antd'
import type { TableColumnsType, TablePaginationConfig } from 'antd'
import { SearchOutlined, ReloadOutlined, PlusOutlined } from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
import { fetchHandoverList, type HandoverRecord } from '../../../api/eam'
import { fetchAssetList, type AssetItem } from '../../../api/asset'
import { EAM_DEPARTMENTS } from '../eamUtils'

type HandoverReason = HandoverRecord['reason']

const REASON_META: Record<HandoverReason, { key: string; color: string }> = {
  resign:   { key: 'asset.reasonResign',   color: 'error' },
  transfer: { key: 'asset.reasonTransfer', color: 'processing' },
  other:    { key: 'asset.reasonOther',    color: 'default' },
}

interface Props {
  onAdd: () => void
  onViewAsset: (assetNo: string) => void
}

export default function HandoverList({ onAdd, onViewAsset }: Props) {
  const { t } = useTranslation()
  const [form] = Form.useForm()
  const [loading, setLoading] = useState(false)
  const [dataSource, setDataSource] = useState<HandoverRecord[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [size, setSize] = useState(10)
  const [filters, setFilters] = useState<{ keyword?: string; department?: string }>({})
  /** 資產 ID → 資產信息映射（用於展開行顯示交接明細） */
  const [assetMap, setAssetMap] = useState<Record<number, AssetItem>>({})

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetchHandoverList({ ...filters, page, size })
      setDataSource(res.records || [])
      setTotal(res.total || 0)
    } catch (e: unknown) {
      message.error(e instanceof Error ? e.message : t('asset.queryFailed'))
    } finally {
      setLoading(false)
    }
  }, [filters, page, size, t])

  useEffect(() => { loadData() }, [loadData])

  // 一次性載入資產映射，避免展開行時逐條請求
  useEffect(() => {
    let alive = true
    fetchAssetList({ page: 1, size: 9999 })
      .then((res) => {
        if (!alive) return
        const map: Record<number, AssetItem> = {}
        ;(res.records || []).forEach((a) => { map[a.id] = a })
        setAssetMap(map)
      })
      .catch(() => { /* 展開行明細為輔助信息，失敗不阻塞列表 */ })
    return () => { alive = false }
  }, [])

  const handleSearch = () => {
    const v = form.getFieldsValue()
    setFilters({ keyword: v.keyword || undefined, department: v.department || undefined })
    setPage(1)
  }
  const handleReset = () => { form.resetFields(); setFilters({}); setPage(1) }
  const handleTableChange = (p: TablePaginationConfig) => {
    setPage(p.current || 1)
    setSize(p.pageSize || 10)
  }

  const columns: TableColumnsType<HandoverRecord> = [
    {
      title: t('asset.colHandoverNo'), dataIndex: 'handoverNo', key: 'handoverNo', width: 140, fixed: 'left',
      render: (v: string) => <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>{v}</span>,
    },
    {
      title: t('asset.colFromUser'), key: 'fromUser', width: 180,
      render: (_: unknown, r) => (
        <Space size={4}>
          <span>{r.fromUser}</span>
          <span style={{ color: '#bfbfbf' }}>/</span>
          <span style={{ color: '#8c8c8c' }}>{r.fromDepartment}</span>
        </Space>
      ),
    },
    {
      title: t('asset.colToUser'), key: 'toUser', width: 180,
      render: (_: unknown, r) => (
        <Space size={4}>
          <Tag color="blue">{r.toUser}</Tag>
          <span style={{ color: '#8c8c8c' }}>{r.toDepartment}</span>
        </Space>
      ),
    },
    { title: t('asset.colHandoverDate'), dataIndex: 'handoverDate', key: 'handoverDate', width: 120 },
    {
      title: t('asset.colAssetCount'), dataIndex: 'assetCount', key: 'assetCount', width: 100, align: 'right',
      render: (v: number) => <Tag color="geekblue">{v}</Tag>,
    },
    {
      title: t('asset.colHandoverReason'), dataIndex: 'reason', key: 'reason', width: 110,
      render: (v: HandoverReason) => <Tag color={REASON_META[v].color}>{t(REASON_META[v].key)}</Tag>,
    },
    { title: t('asset.colOperator'), dataIndex: 'operator', key: 'operator', width: 110 },
    { title: t('asset.colCreatedAt'), dataIndex: 'createdAt', key: 'createdAt', width: 170 },
    {
      title: t('asset.colRemark'), dataIndex: 'remark', key: 'remark', ellipsis: true,
      render: (v: string | undefined) => v || '-',
    },
  ]

  return (
    <>
      {/* ====== 搜索區 ====== */}
      <div className="search-section">
        <Form form={form} layout="inline">
          <Form.Item label={t('asset.searchKeyword')} name="keyword">
            <Input placeholder={t('asset.searchKeywordPh')} allowClear style={{ width: 220 }} />
          </Form.Item>
          <Form.Item label={t('asset.colDepartment')} name="department">
            <Select
              placeholder={t('common.all')} allowClear style={{ width: 160 }}
              options={EAM_DEPARTMENTS.map((d) => ({ label: d, value: d }))}
            />
          </Form.Item>
          <Form.Item>
            <div className="search-actions">
              <Button type="primary" icon={<SearchOutlined />} onClick={handleSearch}>{t('common.search')}</Button>
              <Button icon={<ReloadOutlined />} onClick={handleReset}>{t('common.reset')}</Button>
            </div>
          </Form.Item>
        </Form>
      </div>

      {/* ====== 操作區 ====== */}
      <div className="action-section">
        <div className="action-section-left" />
        <div className="action-section-right">
          <Button type="primary" icon={<PlusOutlined />} onClick={onAdd}>
            {t('asset.btnNewHandover')}
          </Button>
        </div>
      </div>

      {/* ====== 表格（展開行顯示交接資產明細） ====== */}
      <Table<HandoverRecord>
        columns={columns}
        dataSource={dataSource}
        rowKey="id"
        loading={loading}
        size="middle"
        scroll={{ x: 1500 }}
        expandable={{
          expandedRowRender: (record) => (
            <div style={{ padding: '4px 0' }}>
              <div style={{ marginBottom: 8, fontWeight: 600 }}>{t('asset.sectionAssetInfo')}</div>
              <Space size={6} wrap>
                {record.assetIds.map((id) => {
                  const asset = assetMap[id]
                  return (
                    <Tag
                      key={id}
                      color="geekblue"
                      style={{ cursor: asset ? 'pointer' : 'default', fontFamily: 'monospace' }}
                      onClick={() => { if (asset) onViewAsset(asset.assetNo) }}
                    >
                      {asset ? `${asset.assetNo} ${asset.assetName}` : `#${id}`}
                    </Tag>
                  )
                })}
              </Space>
            </div>
          ),
        }}
        pagination={{
          current: page, pageSize: size, total, showSizeChanger: true,
          showTotal: (tt) => `${t('common.total', { count: tt })}`,
        }}
        onChange={handleTableChange}
      />
    </>
  )
}
