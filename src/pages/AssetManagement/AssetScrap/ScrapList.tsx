/**
 * 報廢記錄列表頁
 *
 * - 展示所有資產報廢記錄（資產編號/名稱/報廢日期/申請人/處置方式/殘值/狀態）
 * - 支持按狀態、關鍵詞、報廢日期搜索
 * - 支持新增報廢（先選擇資產，再填寫表單）
 */
import { useState, useEffect, useCallback, useMemo } from 'react'
import { Button, Empty, Form, Input, Select, Table, Tag, message, Space, Modal, DatePicker } from 'antd'
import type { TableColumnsType } from 'antd'
import { SearchOutlined, ReloadOutlined, ExportOutlined, PlusOutlined } from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
import { useColumnConfig } from '../../../hooks/useColumnConfig'
import { exportToCSV } from '../../../utils/exportCSV'
import {
  fetchScrapList, fetchAssetList, deleteScrapRecord,
  type ScrapRecord, type AssetItem,
} from '../../../api/asset'

interface Props {
  onAddScrap: (assetId: number) => void
  onViewDetail: (scrapId: number) => void
}

const DISPOSE_LABELS: Record<string, string> = {
  sale: '出售',
  donate: '捐贈',
  recycle: '回收',
  destroy: '銷毀',
}

const STATUS_MAP: Record<string, { color: string; label: string }> = {
  pending: { color: 'warning', label: '待審批' },
  approved: { color: 'success', label: '已報廢' },
  rejected: { color: 'error', label: '已駁回' },
  cancelled: { color: 'default', label: '已取消' },
}

export default function ScrapList({ onAddScrap, onViewDetail }: Props) {
  const { t } = useTranslation()
  const [form] = Form.useForm()
  const [loading, setLoading] = useState(false)
  const [dataSource, setDataSource] = useState<ScrapRecord[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [filters, setFilters] = useState<{
    keyword?: string
    status?: ScrapRecord['status']
    disposeType?: ScrapRecord['disposeType']
    startDate?: string
    endDate?: string
  }>({})
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([])
  const [assetModalOpen, setAssetModalOpen] = useState(false)
  const [assetSearchLoading, setAssetSearchLoading] = useState(false)
  const [assetList, setAssetList] = useState<AssetItem[]>([])
  const [assetKeyword, setAssetKeyword] = useState('')

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetchScrapList({
        page,
        size: pageSize,
        keyword: filters.keyword,
        status: filters.status,
        disposeType: filters.disposeType,
        startDate: filters.startDate,
        endDate: filters.endDate,
      })
      setDataSource(res.records)
      setTotal(res.total)
    } catch (e: unknown) {
      message.error(e instanceof Error ? e.message : t('asset.queryFailed'))
    } finally {
      setLoading(false)
    }
  }, [page, pageSize, filters, t])

  useEffect(() => { loadData() }, [loadData])

  const handleSearch = () => {
    const v = form.getFieldsValue()
    const dateRange = v.scrapDate
    setPage(1)
    setFilters({
      keyword: v.keyword || undefined,
      status: v.status || undefined,
      disposeType: v.disposeType || undefined,
      startDate: dateRange?.[0]?.format('YYYY-MM-DD') || undefined,
      endDate: dateRange?.[1]?.format('YYYY-MM-DD') || undefined,
    })
  }

  const handleReset = () => {
    form.resetFields()
    setPage(1)
    setFilters({})
  }

  const handleExport = () => {
    const cols = [
      { title: t('asset.colAssetNo'), dataIndex: 'assetNo' },
      { title: t('asset.colAssetName'), dataIndex: 'assetName' },
      { title: t('asset.colAssetType'), dataIndex: 'assetType' },
      { title: '品牌', dataIndex: 'brand' },
      { title: t('asset.colScrapDate'), dataIndex: 'scrapDate' },
      { title: t('asset.colApplyBy'), dataIndex: 'applyBy' },
      { title: t('asset.colScrapReason'), dataIndex: 'reason' },
      { title: t('asset.colResidualValue'), dataIndex: 'residualValue' },
      { title: t('asset.colDisposeType'), dataIndex: 'disposeType' },
      { title: t('asset.colStatus'), dataIndex: 'status' },
    ]
    exportToCSV(`scrap_records_${new Date().toISOString().slice(0, 10)}`, cols, dataSource)
    message.success(t('common.exportSuccess'))
  }

  const handleOpenAssetModal = () => {
    setAssetModalOpen(true)
    setAssetKeyword('')
    searchAssets('')
  }

  const searchAssets = async (keyword: string) => {
    setAssetSearchLoading(true)
    try {
      const res = await fetchAssetList({
        keyword: keyword || undefined,
        status: 'all',
        page: 1,
        size: 20,
      })
      // 过滤掉已报废的资产
      const available = res.records.filter((a) => a.status !== 'scrapped')
      setAssetList(available)
    } catch {
      setAssetList([])
    } finally {
      setAssetSearchLoading(false)
    }
  }

  const handleSelectAsset = (asset: AssetItem) => {
    setAssetModalOpen(false)
    onAddScrap(asset.id)
  }

  const handleDelete = (record: ScrapRecord) => {
    Modal.confirm({
      title: '確認刪除此報廢記錄？',
      content: `${record.assetNo} - ${record.assetName}`,
      okText: t('common.confirm'),
      cancelText: t('common.cancel'),
      okButtonProps: { danger: true },
      onOk: async () => {
        try {
          await deleteScrapRecord(record.id)
          message.success('報廢記錄已刪除')
          loadData()
        } catch (e: unknown) {
          if (e instanceof Error) message.error(e.message)
        }
      },
    })
  }

  const statusOptions = [
    { label: t('common.all'), value: '' },
    { label: '待審批', value: 'pending' },
    { label: '已報廢', value: 'approved' },
    { label: '已駁回', value: 'rejected' },
    { label: '已取消', value: 'cancelled' },
  ]

  const disposeOptions = [
    { label: t('common.all'), value: '' },
    { label: '出售', value: 'sale' },
    { label: '捐贈', value: 'donate' },
    { label: '回收', value: 'recycle' },
    { label: '銷毀', value: 'destroy' },
  ]

  const allColumns: TableColumnsType<ScrapRecord> = [
    {
      key: 'assetNo', title: t('asset.colAssetNo'), dataIndex: 'assetNo', width: 150, fixed: 'left',
      render: (v: string) => <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>{v}</span>,
    },
    { key: 'assetName', title: t('asset.colAssetName'), dataIndex: 'assetName', width: 180, ellipsis: true },
    { key: 'assetType', title: t('asset.colAssetType'), dataIndex: 'assetType', width: 100 },
    { key: 'brand', title: '品牌', dataIndex: 'brand', width: 100, ellipsis: true },
    { key: 'scrapDate', title: t('asset.colScrapDate'), dataIndex: 'scrapDate', width: 120 },
    { key: 'applyBy', title: t('asset.colApplyBy'), dataIndex: 'applyBy', width: 110 },
    { key: 'reason', title: t('asset.colScrapReason'), dataIndex: 'reason', width: 200, ellipsis: true },
    {
      key: 'residualValue', title: t('asset.colResidualValue'), dataIndex: 'residualValue', width: 130, align: 'right',
      render: (v: number) => v ? `MOP ${v.toLocaleString()}` : '-',
    },
    {
      key: 'disposeType', title: t('asset.colDisposeType'), dataIndex: 'disposeType', width: 100,
      render: (v: string | null) => v ? <Tag>{DISPOSE_LABELS[v] || v}</Tag> : '-',
    },
    {
      key: 'status', title: t('asset.colStatus'), dataIndex: 'status', width: 100,
      render: (s: string) => {
        const cfg = STATUS_MAP[s] || { color: 'default', label: s }
        return <Tag color={cfg.color}>{cfg.label}</Tag>
      },
    },
    {
      key: 'createdAt', title: '創建時間', dataIndex: 'createdAt', width: 160,
      render: (v: string) => v || '-',
    },
    {
      key: 'action', title: t('common.colAction'), width: 140, fixed: 'right',
      render: (_: unknown, r: ScrapRecord) => (
        <Space size={0} split={<span className="action-split">|</span>}>
          <Button type="link" size="small" onClick={(e) => { e.stopPropagation(); onViewDetail(r.id) }}>{t('common.detail')}</Button>
          {r.status === 'pending' && (
            <Button type="link" size="small" danger onClick={(e) => { e.stopPropagation(); handleDelete(r) }}>{t('common.delete')}</Button>
          )}
        </Space>
      ),
    },
  ]

  /* ----- 字段配置 ----- */
  const columnMeta = useMemo(() => [
    { key: 'assetNo', title: t('asset.colAssetNo') },
    { key: 'assetName', title: t('asset.colAssetName') },
    { key: 'assetType', title: t('asset.colAssetType') },
    { key: 'brand', title: '品牌' },
    { key: 'scrapDate', title: t('asset.colScrapDate') },
    { key: 'applyBy', title: t('asset.colApplyBy') },
    { key: 'reason', title: t('asset.colScrapReason') },
    { key: 'residualValue', title: t('asset.colResidualValue') },
    { key: 'disposeType', title: t('asset.colDisposeType') },
    { key: 'status', title: t('asset.colStatus') },
    { key: 'createdAt', title: '創建時間' },
    { key: 'action', title: t('common.colAction') },
  ], [t])

  const { configComponent, applyConfig } = useColumnConfig('asset-scrap', columnMeta, [
    { key: 'assetNo', locked: 'head' }, { key: 'action', locked: 'tail' },
  ])

  /* ----- 行选择 ----- */
  const rowSelection = {
    selectedRowKeys,
    onChange: (keys: React.Key[]) => setSelectedRowKeys(keys),
  }

  return (
    <>
      {/* ====== 搜索區 ====== */}
      <div className="search-section">
        <Form form={form} layout="inline">
          <Form.Item label={t('asset.searchKeyword')} name="keyword">
            <Input placeholder="資產編號/名稱/申請人" allowClear style={{ width: 200 }} />
          </Form.Item>
          <Form.Item label={t('asset.colStatus')} name="status">
            <Select placeholder={t('common.all')} allowClear style={{ width: 130 }} options={statusOptions} />
          </Form.Item>
          <Form.Item label={t('asset.colDisposeType')} name="disposeType">
            <Select placeholder={t('common.all')} allowClear style={{ width: 130 }} options={disposeOptions} />
          </Form.Item>
          <Form.Item label={t('asset.colScrapDate')} name="scrapDate">
            <DatePicker.RangePicker style={{ width: 240 }} />
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
        <div className="action-section-left">
          <Space>
            <Button className="btn-export" icon={<ExportOutlined />} disabled={selectedRowKeys.length === 0} onClick={handleExport}>
              {t('common.export')}
            </Button>
          </Space>
        </div>
        <div className="action-section-right">
          <Button type="primary" icon={<PlusOutlined />} onClick={handleOpenAssetModal}>
            新增報廢
          </Button>
          {configComponent}
        </div>
      </div>

      {/* ====== 表格 ====== */}
      <Table<ScrapRecord>
        columns={applyConfig(allColumns) as TableColumnsType<ScrapRecord>}
        dataSource={dataSource}
        rowKey="id"
        loading={loading}
        size="middle"
        scroll={{ x: 1730 }}
        rowSelection={rowSelection}
        locale={{ emptyText: <Empty description={t('common.noData')} /> }}
        onRow={(record) => ({
          onClick: () => onViewDetail(record.id),
          style: { cursor: 'pointer' },
        })}
        pagination={{
          current: page,
          pageSize,
          total,
          showSizeChanger: true,
          showQuickJumper: true,
          showTotal: (tt) => `共 ${tt} 條`,
          onChange: (p, ps) => { setPage(p); setPageSize(ps) },
        }}
      />

      {/* ====== 選擇資產彈窗 ====== */}
      <Modal
        title="選擇資產 - 新增報廢"
        open={assetModalOpen}
        onCancel={() => setAssetModalOpen(false)}
        footer={null}
        width={720}
        destroyOnClose
      >
        <div style={{ marginBottom: 12 }}>
          <Input.Search
            placeholder="輸入資產編號/名稱搜索"
            allowClear
            value={assetKeyword}
            onChange={(e) => setAssetKeyword(e.target.value)}
            onSearch={searchAssets}
            style={{ width: '100%' }}
          />
        </div>
        <Table<AssetItem>
          columns={[
            { title: t('asset.colAssetNo'), dataIndex: 'assetNo', key: 'assetNo', width: 140,
              render: (v: string) => <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>{v}</span> },
            { title: t('asset.colAssetName'), dataIndex: 'assetName', key: 'assetName', ellipsis: true },
            { title: t('asset.colAssetType'), dataIndex: 'assetType', key: 'assetType', width: 100 },
            { title: '品牌', dataIndex: 'brand', key: 'brand', width: 100 },
            { title: t('asset.colDepartment'), dataIndex: 'department', key: 'department', width: 120, ellipsis: true },
            { title: t('asset.colUserName'), dataIndex: 'userName', key: 'userName', width: 100 },
            {
              key: 'action', title: t('common.colAction'), width: 80, fixed: 'right' as const,
              render: (_: unknown, record: AssetItem) => (
                <Button type="link" size="small" onClick={() => handleSelectAsset(record)}>{t('common.select', '選擇')}</Button>
              ),
            },
          ]}
          dataSource={assetList}
          rowKey="id"
          loading={assetSearchLoading}
          size="small"
          pagination={false}
          scroll={{ x: 700, y: 320 }}
          locale={{ emptyText: <Empty description={t('common.noData')} /> }}
        />
      </Modal>
    </>
  )
}
