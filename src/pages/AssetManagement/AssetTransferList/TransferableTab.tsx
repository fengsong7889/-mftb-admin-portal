/**
 * 待調撥資產（在用資產列表）
 *
 * 調撥操作入口：行操作「調撥」跳轉現有獨立頁 /asset-transfer?id=
 * 僅「在用」資產可調撥（閒置資產請走領用/借用流程）
 */
import { useState, useEffect, useCallback } from 'react'
import { Button, Form, Input, Select, Table, Tag, message, Space } from 'antd'
import type { TableColumnsType, TablePaginationConfig } from 'antd'
import { SearchOutlined, ReloadOutlined } from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
import { fetchAssetList, type AssetItem } from '../../../api/asset'
import { EAM_DEPARTMENTS } from '../eamUtils'

interface Props {
  onTransfer: (assetId: number) => void
  onDetail: (assetId: number) => void
}

export default function TransferableTab({ onTransfer, onDetail }: Props) {
  const { t } = useTranslation()
  const [form] = Form.useForm()
  const [loading, setLoading] = useState(false)
  const [dataSource, setDataSource] = useState<AssetItem[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [size, setSize] = useState(10)
  const [filters, setFilters] = useState<{ keyword?: string; department?: string; userName?: string }>({})

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetchAssetList({ ...filters, status: 'in_use', page, size })
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
      keyword: v.keyword || undefined,
      department: v.department || undefined,
      userName: v.userName || undefined,
    })
    setPage(1)
  }
  const handleReset = () => { form.resetFields(); setFilters({}); setPage(1) }
  const handleTableChange = (p: TablePaginationConfig) => {
    setPage(p.current || 1)
    setSize(p.pageSize || 10)
  }

  const columns: TableColumnsType<AssetItem> = [
    {
      title: t('asset.colAssetNo'), dataIndex: 'assetNo', key: 'assetNo', width: 140, fixed: 'left',
      render: (v: string) => <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>{v}</span>,
    },
    { title: t('asset.colAssetName'), dataIndex: 'assetName', key: 'assetName', width: 200, ellipsis: true },
    { title: t('asset.colAssetType'), dataIndex: 'assetType', key: 'assetType', width: 110 },
    { title: t('asset.colBrand'), dataIndex: 'brand', key: 'brand', width: 100 },
    { title: t('asset.colUserName'), dataIndex: 'userName', key: 'userName', width: 130 },
    { title: t('asset.colDepartment'), dataIndex: 'department', key: 'department', width: 110 },
    { title: t('asset.colLocationName'), dataIndex: 'location', key: 'location', width: 170, ellipsis: true },
    {
      title: t('asset.colHoldType'), dataIndex: 'holdType', key: 'holdType', width: 110,
      render: (v?: AssetItem['holdType']) => (v === 'borrowed'
        ? <Tag color="volcano">{t('asset.holdBorrowed')}</Tag>
        : <Tag color="geekblue">{t('asset.holdOwned')}</Tag>),
    },
    { title: t('asset.colUsageDate'), dataIndex: 'usageDate', key: 'usageDate', width: 120, render: (v: string | null) => v || '-' },
    {
      title: t('common.colAction'), key: 'action', width: 150, fixed: 'right',
      render: (_: unknown, record) => (
        <Space size={0} split={<span className="action-split">|</span>}>
          <Button type="link" size="small" onClick={() => onDetail(record.id)}>
            {t('common.detail')}
          </Button>
          <Button type="link" size="small" onClick={() => onTransfer(record.id)}>
            {t('asset.btnGoTransfer')}
          </Button>
        </Space>
      ),
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
          <Form.Item label={t('asset.colUserName')} name="userName">
            <Input placeholder={t('asset.userNamePh')} allowClear style={{ width: 160 }} />
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

      {/* ====== 表格 ====== */}
      <Table<AssetItem>
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
