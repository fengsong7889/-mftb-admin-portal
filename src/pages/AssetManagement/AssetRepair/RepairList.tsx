/**
 * 維修記錄全局列表
 *
 * - 展示所有資產的維修記錄（資產/品牌/故障/維修方/費用/狀態/更新信息）
 * - 支持按資產編號/名稱、資產品牌、送修日期、狀態、完成日期、申請人、最後更新人、最後更新時間搜索
 * - 點擊資產編號跳轉資產詳情，點擊行跳轉維修詳情
 */
import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { Button, Empty, Form, Input, Select, Table, Tag, message, Space, Modal, DatePicker } from 'antd'
import type { TableColumnsType } from 'antd'
import { SearchOutlined, ReloadOutlined, ExportOutlined, PlusOutlined } from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
import { useColumnConfig } from '../../../hooks/useColumnConfig'
import { exportToCSV } from '../../../utils/exportCSV'
import BrandTag from '../../../components/BrandTag'
import { useCompanyBrand } from '../../../contexts/CompanyBrandContext'
import dayjs, { type Dayjs } from 'dayjs'
import {
  fetchRepairList, deleteRepair,
  fetchAssetList,
  type AssetRepairRecord, type AssetItem,
} from '../../../api/asset'
import { fetchBrandList, type AssetBrand } from '../../../api/eam'

interface Props {
  onViewAsset: (assetNo: string) => void
  onViewDetail: (assetId: number) => void
  /** 进入新建维修记录页（独立页面，替代原弹窗选择资产） */
  onCreate: () => void
}

/** 搜索過濾條件 */
interface RepairFilters {
  keyword?: string
  brand?: string
  companyBrand?: number
  repairDates?: [Dayjs, Dayjs]
  status?: 'repairing' | 'done'
  finishDates?: [Dayjs, Dayjs]
  applicant?: string
  updatedBy?: string
  updatedDates?: [Dayjs, Dayjs]
}

export default function RepairList({ onViewAsset, onViewDetail, onCreate }: Props) {
  const { t } = useTranslation()
  const { numericOptions } = useCompanyBrand()
  const [form] = Form.useForm<RepairFilters>()
  const [loading, setLoading] = useState(false)
  const [dataSource, setDataSource] = useState<AssetRepairRecord[]>([])
  const [filters, setFilters] = useState<RepairFilters>({})
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([])
  const [brands, setBrands] = useState<AssetBrand[]>([])

  /* ----- 資產下拉搜索（編號/名稱） ----- */
  const [assetOptions, setAssetOptions] = useState<AssetItem[]>([])
  const [assetSearchLoading, setAssetSearchLoading] = useState(false)
  const searchTimerRef = useRef<ReturnType<typeof setTimeout>>()

  useEffect(() => {
    fetchBrandList({ bizType: 'ASSET' }).then(setBrands).catch(() => setBrands([]))
  }, [])

  /** 資產遠程搜索（300ms 防抖） */
  const handleAssetSearch = useCallback((keyword: string) => {
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current)
    if (!keyword) { setAssetOptions([]); return }
    searchTimerRef.current = setTimeout(async () => {
      setAssetSearchLoading(true)
      try {
        const res = await fetchAssetList({ keyword, status: 'all', page: 1, size: 50 })
        setAssetOptions(res.records.filter((a) => a.status !== 'scrapped'))
      } catch {
        setAssetOptions([])
      } finally {
        setAssetSearchLoading(false)
      }
    }, 300)
  }, [])

  /** 關鍵字匹配（編號/名稱，忽略大小寫） */
  const matchKeyword = useCallback((r: AssetRepairRecord, kw: string) => {
    const lower = kw.toLowerCase()
    return (
      r.assetNo?.toLowerCase().includes(lower) ||
      r.assetName?.toLowerCase().includes(lower)
    )
  }, [])

  /** 日期範圍匹配（YYYY-MM-DD 字符串比較，缺值記錄不過濾） */
  const inDateRange = (value: string | null | undefined, range?: [Dayjs, Dayjs], skipEmpty = false) => {
    if (!range || !range[0] || !range[1]) return true
    if (!value) return skipEmpty
    const d = dayjs(value)
    return !d.isBefore(range[0], 'day') && !d.isAfter(range[1], 'day')
  }

  const applyFilters = useCallback((list: AssetRepairRecord[], f: RepairFilters) => list.filter((r) => {
    if (f.keyword && !matchKeyword(r, f.keyword)) return false
    if (f.brand && r.brand !== f.brand) return false
    if (f.companyBrand && r.companyBrand !== f.companyBrand) return false
    if (!inDateRange(r.repairDate, f.repairDates)) return false
    if (f.status && r.status !== f.status) return false
    if (!inDateRange(r.finishDate, f.finishDates)) return false
    if (f.applicant && !r.applicant?.toLowerCase().includes(f.applicant.toLowerCase())) return false
    if (f.updatedBy && !r.updatedBy?.toLowerCase().includes(f.updatedBy.toLowerCase())) return false
    if (!inDateRange(r.updatedAt, f.updatedDates)) return false
    return true
  }), [matchKeyword])

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetchRepairList()
      setDataSource(applyFilters(res, filters))
    } catch (e: unknown) {
      message.error(e instanceof Error ? e.message : t('asset.queryFailed'))
    } finally {
      setLoading(false)
    }
  }, [filters, applyFilters, t])

  useEffect(() => { loadData() }, [loadData])

  const handleSearch = () => {
    const v = form.getFieldsValue()
    setFilters({
      keyword: v.keyword?.trim() || undefined,
      brand: v.brand || undefined,
      companyBrand: v.companyBrand || undefined,
      repairDates: v.repairDates,
      status: v.status || undefined,
      finishDates: v.finishDates,
      applicant: v.applicant?.trim() || undefined,
      updatedBy: v.updatedBy?.trim() || undefined,
      updatedDates: v.updatedDates,
    })
  }
  const handleReset = () => { form.resetFields(); setFilters({}); setAssetOptions([]) }

  const handleExport = () => {
    const cols = [
      { title: t('asset.colAssetNo'), dataIndex: 'assetNo' },
      { title: t('asset.colAssetName'), dataIndex: 'assetName' },
      { title: '所属品牌', dataIndex: 'companyBrand', render: (v: number | null) => v === 1 ? '闪蜂' : v === 2 ? 'mFood' : '' },
      { title: t('asset.colBrand'), dataIndex: 'brand' },
      { title: t('asset.colRepairDate'), dataIndex: 'repairDate' },
      { title: t('asset.colFaultDesc'), dataIndex: 'faultDesc' },
      { title: t('asset.colRepairContent'), dataIndex: 'repairContent' },
      { title: t('asset.colRepairBy'), dataIndex: 'repairBy' },
      { title: t('asset.colCost'), dataIndex: 'cost' },
      { title: t('asset.colStatus'), dataIndex: 'status' },
      { title: t('asset.colFinishDate'), dataIndex: 'finishDate' },
      { title: t('asset.colApplicant'), dataIndex: 'applicant' },
      { title: t('asset.colCauseType'), dataIndex: 'causeType' },
      { title: t('asset.colUpdatedBy'), dataIndex: 'updatedBy' },
      { title: t('asset.colUpdatedAt'), dataIndex: 'updatedAt' },
    ]
    exportToCSV(`repair_${new Date().toISOString().slice(0, 10)}`, cols, dataSource)
    message.success(t('common.exportSuccess'))
  }

  const handleDelete = (record: AssetRepairRecord) => {
    Modal.confirm({
      title: t('asset.confirmDeleteRepair', '確認刪除此維修記錄？'),
      content: `${record.assetNo} - ${record.faultDesc}`,
      okText: t('common.confirm'),
      cancelText: t('common.cancel'),
      okButtonProps: { danger: true },
      onOk: async () => {
        try {
          await deleteRepair(record.id)
          message.success(t('asset.repairDeleted', '維修記錄已刪除'))
          loadData()
        } catch (e: unknown) {
          if (e instanceof Error) message.error(e.message)
        }
      },
    })
  }

  const statusOptions = [
    { label: t('common.all'), value: '' },
    { label: t('asset.statusRepairing'), value: 'repairing' },
    { label: t('asset.statusRepaired'), value: 'done' },
  ]

  const allColumns: TableColumnsType<AssetRepairRecord> = [
    {
      key: 'assetNo', title: t('asset.colAssetNo'), dataIndex: 'assetNo', width: 140, fixed: 'left',
      render: (v: string) => (
        <Button type="link" size="small" style={{ padding: 0, fontFamily: 'monospace' }}
          onClick={(e) => { e.stopPropagation(); onViewAsset(v) }}
        >
          {v}
        </Button>
      ),
    },
    { key: 'assetName', title: t('asset.colAssetName'), dataIndex: 'assetName', width: 180, ellipsis: true },
    {
      key: 'companyBrand', title: '所屬品牌', dataIndex: 'companyBrand', width: 100,
      render: (v: number | null) => v ? <BrandTag value={v} /> : '-',
    },
    { key: 'brand', title: t('asset.colBrand'), dataIndex: 'brand', width: 110, ellipsis: true, render: (v: string | null) => v || '-' },
    { key: 'repairDate', title: t('asset.colRepairDate'), dataIndex: 'repairDate', width: 120 },
    { key: 'faultDesc', title: t('asset.colFaultDesc'), dataIndex: 'faultDesc', width: 200, ellipsis: true },
    { key: 'repairContent', title: t('asset.colRepairContent'), dataIndex: 'repairContent', width: 200, ellipsis: true },
    { key: 'repairBy', title: t('asset.colRepairBy'), dataIndex: 'repairBy', width: 140 },
    {
      key: 'cost', title: t('asset.colCost'), dataIndex: 'cost', width: 120, align: 'right',
      render: (v: number) => v ? `MOP ${v.toLocaleString()}` : '-',
    },
    {
      key: 'status', title: t('asset.colStatus'), dataIndex: 'status', width: 100,
      render: (s: 'repairing' | 'done') => s === 'repairing'
        ? <Tag color="processing">{t('asset.statusRepairing')}</Tag>
        : <Tag color="success">{t('asset.statusRepaired')}</Tag>,
    },
    {
      key: 'finishDate', title: t('asset.colFinishDate'), dataIndex: 'finishDate', width: 120,
      render: (v: string | null) => v || '-',
    },
    { key: 'applicant', title: t('asset.colApplicant'), dataIndex: 'applicant', width: 110 },
    {
      key: 'causeType', title: t('asset.colCauseType'), dataIndex: 'causeType', width: 120,
      render: (v: string) => v ? <Tag>{t(`asset.cause${v.charAt(0).toUpperCase() + v.slice(1)}`)}</Tag> : '-',
    },
    {
      key: 'source', title: '來源', width: 100,
      render: (_: unknown, r: AssetRepairRecord) => r.returnId
        ? <Tag color="blue">歸還處置</Tag>
        : <span style={{ color: '#8C8C8C' }}>-</span>,
    },
    { key: 'updatedBy', title: t('asset.colUpdatedBy'), dataIndex: 'updatedBy', width: 110, ellipsis: true, render: (v: string | null) => v || '-' },
    { key: 'updatedAt', title: t('asset.colUpdatedAt'), dataIndex: 'updatedAt', width: 170, render: (v: string | null) => v || '-' },
    {
      key: 'action', title: t('common.colAction'), width: 140, fixed: 'right',
      render: (_: unknown, r: AssetRepairRecord) => (
        <Space size={0} split={<span className="action-split">|</span>}>
          <Button type="link" size="small" onClick={(e) => { e.stopPropagation(); onViewDetail(r.assetId) }}>{t('asset.repairRecordsTitle')}</Button>
          {r.status === 'repairing' && (
            <>
              <Button type="link" size="small" danger onClick={(e) => { e.stopPropagation(); handleDelete(r) }}>{t('common.delete')}</Button>
            </>
          )}
        </Space>
      ),
    },
  ]

  /* ----- 字段配置 ----- */
  const columnMeta = useMemo(() => [
    { key: 'assetNo', title: t('asset.colAssetNo') },
    { key: 'assetName', title: t('asset.colAssetName') },
    { key: 'companyBrand', title: '所屬品牌' },
    { key: 'brand', title: t('asset.colBrand') },
    { key: 'repairDate', title: t('asset.colRepairDate') },
    { key: 'faultDesc', title: t('asset.colFaultDesc') },
    { key: 'repairContent', title: t('asset.colRepairContent') },
    { key: 'repairBy', title: t('asset.colRepairBy') },
    { key: 'cost', title: t('asset.colCost') },
    { key: 'status', title: t('asset.colStatus') },
    { key: 'finishDate', title: t('asset.colFinishDate') },
    { key: 'applicant', title: t('asset.colApplicant') },
    { key: 'causeType', title: t('asset.colCauseType') },
    { key: 'source', title: '來源' },
    { key: 'updatedBy', title: t('asset.colUpdatedBy') },
    { key: 'updatedAt', title: t('asset.colUpdatedAt') },
    { key: 'action', title: t('common.colAction') },
  ], [t])

  const { configComponent, applyConfig } = useColumnConfig('asset-repair', columnMeta, [
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
          <Form.Item label={t('asset.searchAssetLabel')} name="keyword">
            <Select
              placeholder={t('asset.searchAssetPh')}
              allowClear
              showSearch
              filterOption={false}
              onSearch={handleAssetSearch}
              loading={assetSearchLoading}
              notFoundContent={assetSearchLoading ? t('common.searching', '搜索中...') : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('common.noData')} />}
              options={assetOptions.map((a) => ({
                label: `${a.assetNo} - ${a.assetName}`,
                value: a.assetNo,
              }))}
            />
          </Form.Item>
          <Form.Item label={t('asset.colBrand')} name="brand">
            <Select
              placeholder={t('asset.colBrand')}
              allowClear showSearch optionFilterProp="label"
              options={brands.map((b) => ({ label: b.brandZh, value: b.brandZh }))}
            />
          </Form.Item>
          <Form.Item label="所屬品牌" name="companyBrand">
            <Select allowClear placeholder={t('common.all')} options={numericOptions} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item label={t('asset.colRepairDate')} name="repairDates">
            <DatePicker.RangePicker />
          </Form.Item>
          <Form.Item label={t('asset.colStatus')} name="status">
            <Select placeholder={t('common.all')} allowClear options={statusOptions} />
          </Form.Item>
          <Form.Item label={t('asset.colFinishDate')} name="finishDates">
            <DatePicker.RangePicker />
          </Form.Item>
          <Form.Item label={t('asset.colApplicant')} name="applicant">
            <Input placeholder={t('asset.searchApplicantPh')} allowClear />
          </Form.Item>
          <Form.Item label={t('asset.searchUpdatedBy')} name="updatedBy">
            <Input placeholder={t('asset.searchUpdatedByPh')} allowClear />
          </Form.Item>
          <Form.Item label={t('asset.searchUpdatedAt')} name="updatedDates">
            <DatePicker.RangePicker />
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
          <Button type="primary" icon={<PlusOutlined />} onClick={onCreate}>
            {t('asset.btnNewRepair', '新增維修')}
          </Button>
          {configComponent}
        </div>
      </div>

      {/* ====== 表格 ====== */}
      <Table<AssetRepairRecord>
        columns={applyConfig(allColumns) as TableColumnsType<AssetRepairRecord>}
        dataSource={dataSource}
        rowKey="id"
        loading={loading}
        size="middle"
        scroll={{ x: 2200 }}
        rowSelection={rowSelection}
        locale={{ emptyText: <Empty description={t('common.noData')} /> }}
        onRow={(record) => ({
          onClick: () => onViewDetail(record.assetId),
          style: { cursor: 'pointer' },
        })}
        pagination={{
          showSizeChanger: true,
          showQuickJumper: true,
          showTotal: (tt) => `${t('common.total', { count: tt })}`,
        }}
      />

    </>
  )
}
