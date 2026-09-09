/**
 * 驗收入庫批次列表
 *
 * - 展示每次批量入庫的批次號、關聯訂單、入庫明細與生成的資產編號
 * - 展開行查看本批次生成的全部資產編號（一物一碼）
 */
import { useState, useEffect, useCallback } from 'react'
import { Button, Form, Input, Table, Tag, message, Space } from 'antd'
import type { TableColumnsType, TablePaginationConfig } from 'antd'
import { SearchOutlined, ReloadOutlined, PlusOutlined } from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
import { fetchInboundList, type InboundBatch } from '../../../api/eam'

interface Props {
  onAdd: () => void
  onViewAsset: (assetNo: string) => void
}

export default function InboundList({ onAdd, onViewAsset }: Props) {
  const { t } = useTranslation()
  const [form] = Form.useForm()
  const [loading, setLoading] = useState(false)
  const [dataSource, setDataSource] = useState<InboundBatch[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [size, setSize] = useState(10)
  const [keyword, setKeyword] = useState<string | undefined>()

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetchInboundList({ keyword, page, size })
      setDataSource(res.records || [])
      setTotal(res.total || 0)
    } catch (e: unknown) {
      message.error(e instanceof Error ? e.message : t('asset.queryFailed'))
    } finally {
      setLoading(false)
    }
  }, [keyword, page, size, t])

  useEffect(() => { loadData() }, [loadData])

  const handleSearch = () => {
    const v = form.getFieldsValue()
    setKeyword(v.keyword || undefined)
    setPage(1)
  }
  const handleReset = () => { form.resetFields(); setKeyword(undefined); setPage(1) }
  const handleTableChange = (p: TablePaginationConfig) => {
    setPage(p.current || 1)
    setSize(p.pageSize || 10)
  }

  const columns: TableColumnsType<InboundBatch> = [
    {
      title: t('asset.colBatchNo'), dataIndex: 'batchNo', key: 'batchNo', width: 140, fixed: 'left',
      render: (v: string) => <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>{v}</span>,
    },
    {
      title: t('asset.colPoNo'), dataIndex: 'poNo', key: 'poNo', width: 140,
      render: (v: string) => <span style={{ fontFamily: 'monospace' }}>{v}</span>,
    },
    { title: t('asset.colInboundDate'), dataIndex: 'inboundDate', key: 'inboundDate', width: 120 },
    { title: t('asset.colOperator'), dataIndex: 'operator', key: 'operator', width: 120 },
    {
      title: t('asset.colItems'), dataIndex: 'items', key: 'items',
      render: (items: InboundBatch['items']) => (
        <Space size={4} wrap>
          {(items || []).map((it) => <Tag key={it.modelId}>{`${it.modelName} x${it.qty}`}</Tag>)}
        </Space>
      ),
    },
    {
      title: t('asset.colTotalQty'), dataIndex: 'totalQty', key: 'totalQty', width: 100, align: 'right',
      render: (v: number) => <Tag color="blue">{v}</Tag>,
    },
    {
      title: t('asset.colRemark'), dataIndex: 'remark', key: 'remark', width: 180, ellipsis: true,
      render: (v: string | undefined) => v || '-',
    },
    { title: t('asset.colCreatedAt'), dataIndex: 'createdAt', key: 'createdAt', width: 170 },
  ]

  return (
    <>
      {/* ====== 搜索區 ====== */}
      <div className="search-section">
        <Form form={form} layout="inline">
          <Form.Item label={t('asset.searchKeyword')} name="keyword">
            <Input placeholder={t('asset.colBatchNo')} allowClear style={{ width: 220 }} />
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
            {t('asset.btnReceive')}
          </Button>
        </div>
      </div>

      {/* ====== 表格（展開行顯示生成的資產編號） ====== */}
      <Table<InboundBatch>
        columns={columns}
        dataSource={dataSource}
        rowKey="id"
        loading={loading}
        size="middle"
        scroll={{ x: 1400 }}
        expandable={{
          expandedRowRender: (record) => (
            <div style={{ padding: '4px 0' }}>
              <div style={{ marginBottom: 8, fontWeight: 600 }}>{t('asset.colGeneratedNos')}</div>
              <Space size={6} wrap>
                {record.items.flatMap((it) => it.assetNos).map((no) => (
                  <Tag
                    key={no}
                    color="geekblue"
                    style={{ cursor: 'pointer', fontFamily: 'monospace' }}
                    onClick={() => onViewAsset(no)}
                  >
                    {no}
                  </Tag>
                ))}
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
