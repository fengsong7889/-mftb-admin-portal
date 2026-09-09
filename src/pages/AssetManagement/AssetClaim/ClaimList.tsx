/**
 * 領用單列表（長期配給）
 *
 * - 展示歷史領用記錄（單號/資產/領用人/部門/領用日期）
 * - 領用入口為獨立表單頁（新建領用）
 */
import { useState, useEffect, useCallback } from 'react'
import { Button, Form, Input, Select, Table, message } from 'antd'
import type { TableColumnsType, TablePaginationConfig } from 'antd'
import { SearchOutlined, ReloadOutlined, PlusOutlined } from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
import { fetchClaimList, type ClaimRecord } from '../../../api/eam'
import { EAM_DEPARTMENTS } from '../eamUtils'

interface Props {
  onAdd: () => void
  onViewAsset: (assetNo: string) => void
}

export default function ClaimList({ onAdd, onViewAsset }: Props) {
  const { t } = useTranslation()
  const [form] = Form.useForm()
  const [loading, setLoading] = useState(false)
  const [dataSource, setDataSource] = useState<ClaimRecord[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [size, setSize] = useState(10)
  const [filters, setFilters] = useState<{ keyword?: string; department?: string }>({})

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetchClaimList({ ...filters, page, size })
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
    setFilters({ keyword: v.keyword || undefined, department: v.department || undefined })
    setPage(1)
  }
  const handleReset = () => { form.resetFields(); setFilters({}); setPage(1) }
  const handleTableChange = (p: TablePaginationConfig) => {
    setPage(p.current || 1)
    setSize(p.pageSize || 10)
  }

  const columns: TableColumnsType<ClaimRecord> = [
    {
      title: t('asset.colClaimNo'), dataIndex: 'claimNo', key: 'claimNo', width: 140, fixed: 'left',
      render: (v: string) => <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>{v}</span>,
    },
    {
      title: t('asset.colAssetNo'), dataIndex: 'assetNo', key: 'assetNo', width: 140,
      render: (v: string) => (
        <Button type="link" size="small" style={{ padding: 0, fontFamily: 'monospace' }}
          onClick={() => onViewAsset(v)}
        >
          {v}
        </Button>
      ),
    },
    { title: t('asset.colAssetName'), dataIndex: 'assetName', key: 'assetName', width: 200, ellipsis: true },
    { title: t('asset.colClaimant'), dataIndex: 'claimant', key: 'claimant', width: 120 },
    { title: t('asset.colDepartment'), dataIndex: 'department', key: 'department', width: 120 },
    { title: t('asset.colClaimDate'), dataIndex: 'claimDate', key: 'claimDate', width: 120 },
    { title: t('asset.colOperator'), dataIndex: 'operator', key: 'operator', width: 120 },
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
            {t('asset.btnNewClaim')}
          </Button>
        </div>
      </div>

      {/* ====== 表格 ====== */}
      <Table<ClaimRecord>
        columns={columns}
        dataSource={dataSource}
        rowKey="id"
        loading={loading}
        size="middle"
        scroll={{ x: 1300 }}
        pagination={{
          current: page, pageSize: size, total, showSizeChanger: true,
          showTotal: (tt) => `${t('common.total', { count: tt })}`,
        }}
        onChange={handleTableChange}
      />
    </>
  )
}
