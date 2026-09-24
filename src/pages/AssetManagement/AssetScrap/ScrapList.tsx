/**
 * 報廢記錄列表頁
 *
 * - 展示所有資產報廢記錄（資產編號/名稱/所屬品牌/資產品牌/分類/報廢時間/經辦人/處置方式/殘值/時間）
 * - 搜索條件（9 字段）：資產編碼/名稱、資產分類、資產品牌、所屬品牌、報廢時間、經辦人、
 *                        處置方式、創建時間、最後更新人、最後更新時間
 * - 支持新增報廢（先選擇資產，再填寫表單）
 */
import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { Button, Empty, Form, Input, Select, Table, Tag, message, Space, Modal, DatePicker, TreeSelect } from 'antd'
import type { TableColumnsType } from 'antd'
import { SearchOutlined, ReloadOutlined, ExportOutlined, PlusOutlined } from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
import { useColumnConfig } from '../../../hooks/useColumnConfig'
import { exportToCSV } from '../../../utils/exportCSV'
import BrandTag from '../../../components/BrandTag'
import { useCompanyBrand } from '../../../contexts/CompanyBrandContext'
import {
  fetchScrapList, deleteScrapRecord, fetchAssetList,
  type ScrapRecord, type ScrapQuery, type AssetItem,
} from '../../../api/asset'
import { fetchCategoryList, fetchBrandList, type AssetCategory, type AssetBrand } from '../../../api/eam'
import { fetchEmployeeOptions } from '../../../api/employee'
import type { OptionItem } from '../../../api/types'

interface Props {
  /** 进入新建报废页（独立页面，Select 下拉选资产） */
  onCreate: () => void
  onViewDetail: (scrapId: number) => void
}

const DISPOSE_LABELS: Record<string, string> = {
  sale: '出售',
  donate: '捐贈',
  recycle: '回收',
  destroy: '銷毀',
}

export default function ScrapList({ onCreate, onViewDetail }: Props) {
  const { t } = useTranslation()
  const { numericOptions } = useCompanyBrand()
  const [form] = Form.useForm()
  const [loading, setLoading] = useState(false)
  const [dataSource, setDataSource] = useState<ScrapRecord[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [filters, setFilters] = useState<Omit<ScrapQuery, 'page' | 'size'>>({})
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([])

  /* ----- 分类树 & 品牌列表（搜索区用） ----- */
  const [categories, setCategories] = useState<AssetCategory[]>([])
  const [brands, setBrands] = useState<AssetBrand[]>([])

  /* ----- 員工搜索下拉（經辦人 / 最後更新人） ----- */
  const [handlerOptions, setHandlerOptions] = useState<OptionItem[]>([])
  const [handlerLoading, setHandlerLoading] = useState(false)
  const [employeeOptions, setEmployeeOptions] = useState<OptionItem[]>([])
  const [employeeSearchLoading, setEmployeeSearchLoading] = useState(false)

  /* ----- 资产编码/名称下拉搜索 ----- */
  const [assetOptions, setAssetOptions] = useState<{ label: string; value: string }[]>([])
  const [assetSearchLoading, setAssetSearchLoading] = useState(false)
  const assetTimerRef = useRef<ReturnType<typeof setTimeout>>()

  useEffect(() => {
    fetchCategoryList({ bizType: 'ASSET' }).then(setCategories).catch(() => setCategories([]))
    fetchBrandList({ bizType: 'ASSET' }).then(setBrands).catch(() => setBrands([]))
  }, [])

  /** 構建分類樹（parentId=0 為根，與資產台賬搜索區一致） */
  const categoryTreeData = useMemo(() => {
    function buildTree(parentId: number): { title: string; key: string; value: string; children?: ReturnType<typeof buildTree> }[] {
      return categories
        .filter(c => c.parentId === parentId && c.status === 'enabled')
        .sort((a, b) => a.sort - b.sort)
        .map(c => {
          const children = buildTree(c.id)
          return { title: `${c.code} - ${c.name}`, key: c.code, value: c.code, children: children.length ? children : undefined }
        })
    }
    return buildTree(0)
  }, [categories])

  /** 分類編碼 → 名稱映射（列表/導出將 assetType 編碼轉為可讀名稱，找不到回退原值） */
  const categoryNameByCode = useMemo(() => {
    const map: Record<string, string> = {}
    categories.forEach(c => { map[c.code] = c.name })
    return map
  }, [categories])

  /** 品牌選項（同名品牌按 brandZh 去重，避免 Select 重複 key） */
  const brandOptions = useMemo(
    () => [...new Map(brands.map(b => [b.brandZh, { label: b.brandZh, value: b.brandZh }])).values()],
    [brands],
  )

  /** 经辦人远程搜索（300ms 防抖） */
  const handleHandlerSearch = useCallback(async (keyword: string) => {
    setHandlerLoading(true)
    try {
      const options = await fetchEmployeeOptions(keyword)
      setHandlerOptions(options)
    } finally {
      setHandlerLoading(false)
    }
  }, [])

  /** 最後更新人远程搜索 */
  const handleEmployeeSearch = useCallback(async (keyword: string) => {
    setEmployeeSearchLoading(true)
    try {
      const options = await fetchEmployeeOptions(keyword)
      setEmployeeOptions(options)
    } finally {
      setEmployeeSearchLoading(false)
    }
  }, [])

  /** 资产编码/名称远程搜索（300ms 防抖） */
  const handleAssetKeywordSearch = useCallback((keyword: string) => {
    if (assetTimerRef.current) clearTimeout(assetTimerRef.current)
    if (!keyword) { setAssetOptions([]); return }
    assetTimerRef.current = setTimeout(async () => {
      setAssetSearchLoading(true)
      try {
        const res = await fetchAssetList({ keyword, status: 'all', page: 1, size: 30 })
        setAssetOptions(res.records.map((a: AssetItem) => ({
          label: `${a.assetNo} / ${a.assetName}`,
          value: `${a.assetNo} / ${a.assetName}`,
        })))
      } catch {
        setAssetOptions([])
      } finally {
        setAssetSearchLoading(false)
      }
    }, 300)
  }, [])

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetchScrapList({
        page,
        size: pageSize,
        ...filters,
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
    const fmtRange = (range?: [{ format(f: string): string } | null, { format(f: string): string } | null]) => {
      const start = range?.[0]?.format('YYYY-MM-DD') ?? null
      const end = range?.[1]?.format('YYYY-MM-DD') ?? null
      return start || end ? [start, end] as [string, string] : undefined
    }
    setPage(1)
    setFilters({
      scrapNo: v.scrapNo || undefined,
      assetKeyword: v.assetKeyword || undefined,
      assetType: v.assetType || undefined,
      brand: v.brand || undefined,
      companyBrand: v.companyBrand || undefined,
      scrapDate: fmtRange(v.scrapDate),
      applyBy: v.applyBy || undefined,
      disposeType: v.disposeType || undefined,
      createdAt: fmtRange(v.createdAt),
      updatedBy: v.updatedBy || undefined,
      updatedAt: fmtRange(v.updatedAt),
    })
  }

  const handleReset = () => {
    form.resetFields()
    setPage(1)
    setFilters({})
  }

  const handleExport = () => {
    const cols = [
      { title: '報廢編號', dataIndex: 'scrapNo' },
      { title: '資產編號', dataIndex: 'assetNo' },
      { title: '資產名稱', dataIndex: 'assetName' },
      { title: '所屬品牌', dataIndex: 'companyBrand' },
      { title: '資產品牌', dataIndex: 'brand' },
      { title: '資產分類', dataIndex: 'assetType', render: (v: string) => categoryNameByCode[v] || v || '' },
      { title: '報廢日期', dataIndex: 'scrapDate' },
      { title: '經辦人', dataIndex: 'applyBy' },
      { title: '報廢原因', dataIndex: 'reason' },
      { title: '殘值', dataIndex: 'residualValue' },
      { title: '處置方式', dataIndex: 'disposeType' },
      { title: '創建時間', dataIndex: 'createdAt' },
      { title: '最後更新人', dataIndex: 'updatedBy' },
      { title: '最後更新時間', dataIndex: 'updatedAt' },
    ]
    exportToCSV(`scrap_records_${new Date().toISOString().slice(0, 10)}`, cols, dataSource)
    message.success(t('common.exportSuccess'))
  }

  const handleDelete = (record: ScrapRecord) => {
    Modal.confirm({
      title: '確認刪除此報廢記錄？',
      content: (
        <div style={{ background: '#FFF7F0', border: '1px solid #FFE7D1', borderRadius: 8, padding: '12px 16px', marginTop: 12 }}>
          <div style={{ fontSize: 13, color: '#595959' }}>
            <div>資產編號：<b style={{ color: '#262626' }}>{record.assetNo}</b></div>
            <div>資產名稱：<b style={{ color: '#262626' }}>{record.assetName}</b></div>
          </div>
          <div style={{ fontSize: 12, color: '#8C8C8C', marginTop: 8 }}>
            刪除後資產將恢復為閒置狀態，可再次被領用或借用。
          </div>
        </div>
      ),
      okText: '確認刪除',
      cancelText: t('common.cancel'),
      okButtonProps: { danger: true },
      onOk: async () => {
        try {
          await deleteScrapRecord(record.id)
          message.success('報廢記錄已刪除，資產已恢復閒置')
          loadData()
        } catch (e: unknown) {
          if (e instanceof Error) message.error(e.message)
        }
      },
    })
  }

  const disposeOptions = [
    { label: t('common.all'), value: '' },
    { label: '出售', value: 'sale' },
    { label: '捐贈', value: 'donate' },
    { label: '回收', value: 'recycle' },
    { label: '銷毀', value: 'destroy' },
  ]

  const allColumns: TableColumnsType<ScrapRecord> = [
    {
      key: 'scrapNo', title: '報廢編號', dataIndex: 'scrapNo', width: 150, fixed: 'left',
      render: (v: string) => <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>{v || '-'}</span>,
    },
    {
      key: 'assetNo', title: '資產編號', dataIndex: 'assetNo', width: 150,
      render: (v: string) => <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>{v}</span>,
    },
    { key: 'assetName', title: '資產名稱', dataIndex: 'assetName', width: 160, ellipsis: true },
    {
      key: 'companyBrand', title: '所屬品牌', dataIndex: 'companyBrand', width: 100,
      render: (v: number | null) => v ? <BrandTag value={v} /> : '-',
    },
    { key: 'brand', title: '資產品牌', dataIndex: 'brand', width: 100, ellipsis: true },
    { key: 'assetType', title: '資產分類', dataIndex: 'assetType', width: 100, render: (v: string) => categoryNameByCode[v] || v || '-' },
    { key: 'scrapDate', title: '報廢日期', dataIndex: 'scrapDate', width: 120 },
    {
      key: 'applyBy', title: '經辦人', dataIndex: 'applyBy', width: 140,
      render: (_: string, r: ScrapRecord) => {
        const name = r.applyBy || '-'
        const empId = r.empId || ''
        return <span style={{ whiteSpace: 'nowrap' }}>{empId ? `${name}（${empId}）` : name}</span>
      },
    },
    { key: 'reason', title: '報廢原因', dataIndex: 'reason', width: 200, ellipsis: true },
    {
      key: 'residualValue', title: '殘值', dataIndex: 'residualValue', width: 130, align: 'right',
      render: (v: number) => v ? `MOP ${v.toLocaleString()}` : '-',
    },
    {
      key: 'disposeType', title: '處置方式', dataIndex: 'disposeType', width: 100,
      render: (v: string | null) => v ? <Tag>{DISPOSE_LABELS[v] || v}</Tag> : '-',
    },
    {
      key: 'createdAt', title: '創建時間', dataIndex: 'createdAt', width: 160,
      render: (v: string) => v || '-',
    },
    {
      key: 'updatedBy', title: '最後更新人', dataIndex: 'updatedBy', width: 110, ellipsis: true,
      render: (v: string) => v || '-',
    },
    {
      key: 'updatedAt', title: '最後更新時間', dataIndex: 'updatedAt', width: 160,
      render: (v: string) => v || '-',
    },
    {
      key: 'action', title: t('common.colAction'), width: 140, fixed: 'right',
      render: (_: unknown, r: ScrapRecord) => (
        <Space size={0} split={<span className="action-split">|</span>}>
          <Button type="link" size="small" onClick={(e) => { e.stopPropagation(); onViewDetail(r.id) }}>{t('common.detail')}</Button>
          <Button type="link" size="small" danger onClick={(e) => { e.stopPropagation(); handleDelete(r) }}>{t('common.delete')}</Button>
        </Space>
      ),
    },
  ]

  /* ----- 字段配置 ----- */
  const columnMeta = useMemo(() => [
    { key: 'scrapNo', title: '報廢編號' },
    { key: 'assetNo', title: '資產編號' },
    { key: 'assetName', title: '資產名稱' },
    { key: 'companyBrand', title: '所屬品牌' },
    { key: 'brand', title: '資產品牌' },
    { key: 'assetType', title: '資產分類' },
    { key: 'scrapDate', title: '報廢日期' },
    { key: 'applyBy', title: '經辦人' },
    { key: 'reason', title: '報廢原因' },
    { key: 'residualValue', title: '殘值' },
    { key: 'disposeType', title: '處置方式' },
    { key: 'createdAt', title: '創建時間' },
    { key: 'updatedBy', title: '最後更新人' },
    { key: 'updatedAt', title: '最後更新時間' },
    { key: 'action', title: t('common.colAction') },
  ], [t])

  const { configComponent, applyConfig } = useColumnConfig('asset-scrap', columnMeta, [
    { key: 'scrapNo', locked: 'head' }, { key: 'assetNo', locked: 'head' }, { key: 'action', locked: 'tail' },
  ])

  /* ----- 行选择 ----- */
  const rowSelection = {
    selectedRowKeys,
    onChange: (keys: React.Key[]) => setSelectedRowKeys(keys),
  }

  return (
    <>
      {/* ====== 搜索區（10 字段） ====== */}
      <div className="search-section">
        <Form form={form} layout="inline">
          <Form.Item label="報廢編號" name="scrapNo">
            <Input placeholder="請輸入報廢編號搜索" allowClear style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item label="資產編碼/名稱" name="assetKeyword">
            <Select
              placeholder="請輸入資產編號或名稱搜索"
              allowClear
              showSearch
              filterOption={false}
              onSearch={handleAssetKeywordSearch}
              loading={assetSearchLoading}
              notFoundContent={assetSearchLoading ? '搜索中...' : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暫無數據" />}
              options={assetOptions}
              style={{ width: '100%' }}
            />
          </Form.Item>
          <Form.Item label="資產分類" name="assetType">
            <TreeSelect
              placeholder={t('common.all')}
              allowClear
              showSearch
              treeDefaultExpandAll
              treeNodeFilterProp="title"
              treeData={categoryTreeData}
              style={{ width: '100%' }}
            />
          </Form.Item>
          <Form.Item label="資產品牌" name="brand">
            <Select
              placeholder={t('common.all')}
              allowClear
              showSearch
              optionFilterProp="label"
              options={brandOptions}
              style={{ width: '100%' }}
            />
          </Form.Item>
          <Form.Item label="所屬品牌" name="companyBrand">
            <Select placeholder={t('common.all')} allowClear options={numericOptions} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item label="報廢日期" name="scrapDate">
            <DatePicker.RangePicker style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item label="經辦人" name="applyBy">
            <Select
              placeholder="請輸入姓名或工號搜索"
              allowClear
              showSearch
              filterOption={false}
              onSearch={handleHandlerSearch}
              loading={handlerLoading}
              notFoundContent={handlerLoading ? '搜索中...' : '暫無數據'}
              options={handlerOptions}
              style={{ width: '100%' }}
            />
          </Form.Item>
          <Form.Item label="處置方式" name="disposeType">
            <Select placeholder={t('common.all')} allowClear style={{ width: '100%' }} options={disposeOptions} />
          </Form.Item>
          <Form.Item label="創建時間" name="createdAt">
            <DatePicker.RangePicker style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item label="最後更新人" name="updatedBy">
            <Select
              placeholder="請輸入姓名或工號搜索"
              allowClear
              showSearch
              filterOption={false}
              onSearch={handleEmployeeSearch}
              notFoundContent={employeeSearchLoading ? '搜索中...' : '暫無數據'}
              options={employeeOptions}
              style={{ width: '100%' }}
            />
          </Form.Item>
          <Form.Item label="最後更新時間" name="updatedAt">
            <DatePicker.RangePicker style={{ width: '100%' }} />
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
        scroll={{ x: 2150 }}
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
    </>
  )
}
