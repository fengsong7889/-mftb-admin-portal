/**
 * 調撥記錄（只讀）
 *
 * 數據來源：後端調撥單 /eam/transfers（由資產調撥頁登記寫入，作廢單據 status='cancelled'）
 * 支持按資產編號 / 關鍵字 / 調撥時間過濾
 */
import { useState, useEffect, useCallback } from 'react'
import { Button, Form, Input, Table, Tag, message, Space, DatePicker } from 'antd'
import type { TableColumnsType, TablePaginationConfig } from 'antd'
import { SearchOutlined, ReloadOutlined } from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
import { fetchTransferList, type TransferRecord } from '../../../api/asset'

interface Props {
  onViewAsset: (assetNo: string) => void
}

export default function TransferLogTab({ onViewAsset }: Props) {
  const { t } = useTranslation()
  const [form] = Form.useForm()
  const [loading, setLoading] = useState(false)
  const [dataSource, setDataSource] = useState<TransferRecord[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [size, setSize] = useState(10)
  const [filters, setFilters] = useState<{ assetNo?: string; keyword?: string; startDate?: string; endDate?: string }>({})

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetchTransferList({ ...filters, page, size })
      setDataSource(res.records || [])
      setTotal(res.total || 0)
    } catch (e: unknown) {
      message.error(e instanceof Error ? e.message : t('asset.queryFailed'))
    } finally {
      setLoading(false)
    }
  }, [filters, page, size, t])

  useEffect(() => { loadData() }, [loadData])

  const handleSearch = () => {
    const v = form.getFieldsValue()
    setFilters({
      assetNo: v.assetNo || undefined,
      keyword: v.keyword || undefined,
      startDate: v.transferDate?.[0]?.format('YYYY-MM-DD'),
      endDate: v.transferDate?.[1]?.format('YYYY-MM-DD'),
    })
    setPage(1)
  }
  const handleReset = () => { form.resetFields(); setFilters({}); setPage(1) }
  const handleTableChange = (p: TablePaginationConfig) => {
    setPage(p.current || 1)
    setSize(p.pageSize || 10)
  }

  const columns: TableColumnsType<TransferRecord> = [
    {
      title: t('asset.colTransferNo'), dataIndex: 'transferNo', key: 'transferNo', width: 170, fixed: 'left',
      render: (v: string) => <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>{v}</span>,
    },
    { title: t('asset.colTransferDate'), dataIndex: 'transferDate', key: 'transferDate', width: 110 },
    {
      title: t('asset.colAssetNo'), dataIndex: 'assetNo', key: 'assetNo', width: 140,
      render: (v: string) => (
        <Button type="link" size="small" style={{ padding: 0, fontFamily: 'monospace', fontWeight: 600 }}
          onClick={() => onViewAsset(v)}
        >
          {v}
        </Button>
      ),
    },
    { title: t('asset.colAssetName'), dataIndex: 'assetName', key: 'assetName', width: 190, ellipsis: true },
    {
      title: t('asset.colNewUser'), key: 'userChange', width: 210,
      render: (_: unknown, r) => (
        <Space size={4}>
          <span>{r.fromUserName || '-'}</span>
          <span style={{ color: '#bfbfbf' }}>→</span>
          <Tag color="blue">{r.toUserName || '-'}</Tag>
        </Space>
      ),
    },
    {
      title: t('asset.colToDept'), key: 'deptChange', width: 210,
      render: (_: unknown, r) => (
        <Space size={4}>
          <span>{r.fromDepartment || '-'}</span>
          <span style={{ color: '#bfbfbf' }}>→</span>
          <Tag color="cyan">{r.toDepartment || '-'}</Tag>
        </Space>
      ),
    },
    { title: t('asset.colTransferReason'), dataIndex: 'reason', key: 'reason', ellipsis: true },
    {
      title: t('asset.colStatus'), dataIndex: 'status', key: 'status', width: 100,
      render: (v: TransferRecord['status']) => v === 'cancelled'
        ? <Tag color="default">{t('asset.transferCancelled')}</Tag>
        : <Tag color="success">{t('asset.transferDone')}</Tag>,
    },
    { title: t('asset.colOperator'), dataIndex: 'operatorName', key: 'operatorName', width: 120 },
  ]

  return (
    <>
      {/* ====== 搜索區 ====== */}
      <div className="search-section">
        <Form form={form} layout="inline">
          <Form.Item label={t('asset.searchAssetNo')} name="assetNo">
            <Input placeholder={t('asset.searchAssetNoPh')} allowClear style={{ width: 180 }} />
          </Form.Item>
          <Form.Item label={t('asset.colOperateTime')} name="transferDate">
            <DatePicker.RangePicker style={{ width: 240 }} />
          </Form.Item>
          <Form.Item label={t('asset.searchKeyword')} name="keyword">
            <Input placeholder={t('asset.searchKeywordPh')} allowClear style={{ width: 200 }} />
          </Form.Item>
          <Form.Item>
            <div className="search-actions">
              <Button type="primary" icon={<SearchOutlined />} onClick={handleSearch}>{t('common.search')}</Button>
              <Button icon={<ReloadOutlined />} onClick={handleReset}>{t('common.reset')}</Button>
            </div>
          </Form.Item>
        </Form>
      </div>

      {/* ====== 表格 ====== */}
      <Table<TransferRecord>
        columns={columns}
        dataSource={dataSource}
        rowKey="id"
        loading={loading}
        size="middle"
        scroll={{ x: 1500 }}
        pagination={{
          current: page, pageSize: size, total, showSizeChanger: true,
          showTotal: (tt) => `${t('common.total', { count: tt })}`,
        }}
        onChange={handleTableChange}
      />
    </>
  )
}
