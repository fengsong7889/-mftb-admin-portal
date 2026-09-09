/**
 * 調撥記錄（只讀）
 *
 * 數據來源：資產流水中 opType='transfer' 的記錄（由資產調撥頁 / 批量交接寫入）
 * 支持按資產編號 / 關鍵字 / 調撥時間過濾
 */
import { useState, useEffect, useCallback } from 'react'
import { Button, Form, Input, Table, Tag, message, Space, DatePicker } from 'antd'
import type { TableColumnsType, TablePaginationConfig } from 'antd'
import { SearchOutlined, ReloadOutlined } from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
import { fetchAssetLogs, type AssetLog } from '../../../api/asset'

interface Props {
  onViewAsset: (assetNo: string) => void
}

export default function TransferLogTab({ onViewAsset }: Props) {
  const { t } = useTranslation()
  const [form] = Form.useForm()
  const [loading, setLoading] = useState(false)
  const [dataSource, setDataSource] = useState<AssetLog[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [size, setSize] = useState(10)
  const [filters, setFilters] = useState<{ assetNo?: string; keyword?: string; dateRange?: [string, string] }>({})

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetchAssetLogs({ ...filters, opType: 'transfer', page, size })
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
      dateRange: v.transferDate
        ? [v.transferDate[0]?.format('YYYY-MM-DD'), v.transferDate[1]?.format('YYYY-MM-DD')]
        : undefined,
    })
    setPage(1)
  }
  const handleReset = () => { form.resetFields(); setFilters({}); setPage(1) }
  const handleTableChange = (p: TablePaginationConfig) => {
    setPage(p.current || 1)
    setSize(p.pageSize || 10)
  }

  const columns: TableColumnsType<AssetLog> = [
    { title: t('asset.colOperateTime'), dataIndex: 'operateTime', key: 'operateTime', width: 170, fixed: 'left' },
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
          <span>{r.fromUser || '-'}</span>
          <span style={{ color: '#bfbfbf' }}>→</span>
          <Tag color="blue">{r.toUser || '-'}</Tag>
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
    { title: t('asset.colTransferReason'), dataIndex: 'description', key: 'description', ellipsis: true },
    { title: t('asset.colOperator'), dataIndex: 'operator', key: 'operator', width: 120 },
    {
      title: t('asset.colFlowNo'), dataIndex: 'flowNo', key: 'flowNo', width: 150,
      render: (v: string | undefined) => v || '-',
    },
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
      <Table<AssetLog>
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
