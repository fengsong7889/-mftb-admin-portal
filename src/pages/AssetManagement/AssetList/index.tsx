/**
 * 资产台账列表页（物资管理-核心入口）
 *
 * 展示所有资产的基础信息，支持多条件搜索、批量操作、导出 Excel
 * 顶部 Tab 切换「全部 / 在用 / 闲置 / 维修中 / 已报废」
 *
 * EAM 增强：
 *  - 新增「存放位置」（关联位置树）与「持有方式」（自有领用/借用）列
 *  - 展开行显示型号参数实例（CPU/内存/硬盘…，参数名取分类模板 label）
 *  - 操作列移除「领用」「归还」，统一入口改为领用管理 / 归还管理菜单
 *  - 支持 URL ?assetNo= 带入编号过滤（由验收入库页点击资产编号跳转）
 *
 * 保留的行操作：详情 / 转移 / 维修 / 查看维修 / 报废 / 编辑 / 删除
 *
 * 搜索条件（11 字段）：资产编号、资产类型、品牌、所属公司、所在部门、来源、
 *                      状态、购买日期、报废日期、最后更新人、最后更新时间
 */
import { useState, useEffect, useCallback, useMemo } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  Button, Form, Input, Select, Table, Tag, Modal, message, Space, Tabs, Image, DatePicker,
} from 'antd'
import type { TableColumnsType, TablePaginationConfig } from 'antd'
import {
  SearchOutlined, ReloadOutlined, PlusOutlined, ExportOutlined,
  CameraOutlined,
} from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
import {
  fetchAssetList, deleteAsset,
  type AssetItem, type AssetStatus, type AssetSource, type AssetListQuery,
} from '../../../api/asset'
import { fetchCategoryList } from '../../../api/eam'
import { exportToCSV } from '../../../utils/exportCSV'

/* ==================== 枚举映射 ==================== */

const STATUS_META: Record<AssetStatus, { key: string; color: string }> = {
  idle:      { key: 'asset.statusIdle',      color: 'default' },
  in_use:    { key: 'asset.statusInUse',     color: 'success' },
  in_repair: { key: 'asset.statusInRepair',  color: 'processing' },
  scrapped:  { key: 'asset.statusScrapped',  color: 'error' },
}

const SOURCE_META: Record<AssetSource, { key: string; color: string }> = {
  self:  { key: 'asset.sourceSelf',  color: 'blue' },
  lease: { key: 'asset.sourceLease', color: 'orange' },
}

/** 持有方式：自有领用 / 借用（借用语义由 BorrowRecord 承载） */
const HOLD_META: Record<NonNullable<AssetItem['holdType']>, { key: string; color: string }> = {
  owned:    { key: 'asset.holdOwned',    color: 'geekblue' },
  borrowed: { key: 'asset.holdBorrowed', color: 'volcano' },
}

/* ==================== 主组件 ==================== */

export default function AssetList() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const urlAssetNo = searchParams.get('assetNo') || ''
  const [form] = Form.useForm()
  const [loading, setLoading] = useState(false)
  const [dataSource, setDataSource] = useState<AssetItem[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [size, setSize] = useState(10)
  const [activeTab, setActiveTab] = useState<AssetStatus | 'all'>('all')
  const [filters, setFilters] = useState<Omit<AssetListQuery, 'page' | 'size'>>(
    urlAssetNo ? { assetNo: urlAssetNo } : {},
  )
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([])
  /** 各状态统计（受非状态过滤条件影响，用于 Tab 徽标） */
  const [stats, setStats] = useState<Record<AssetStatus | 'all', number>>({
    all: 0, in_use: 0, idle: 0, in_repair: 0, scrapped: 0,
  })

  /** 型号参数 key → 展示名映射（取全部分类参数模板的并集） */
  const [paramLabelMap, setParamLabelMap] = useState<Record<string, string>>({})

  // URL ?assetNo= 带入时回填搜索框（由验收入库页跳转）
  useEffect(() => {
    if (urlAssetNo) form.setFieldsValue({ assetNo: urlAssetNo })
  }, [urlAssetNo, form])

  // 载入分类参数模板，用于展开行显示参数中文名
  useEffect(() => {
    let alive = true
    fetchCategoryList()
      .then((list) => {
        if (!alive) return
        const map: Record<string, string> = {}
        list.forEach((c) => (c.paramTemplate || []).forEach((f) => { map[f.key] = f.label }))
        setParamLabelMap(map)
      })
      .catch(() => { /* 参数模板仅用于展示，失败不阻塞台账 */ })
    return () => { alive = false }
  }, [])

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      // 状态过滤优先级：搜索区 status > Tab 状态
      const statusFilter = filters.status || (activeTab === 'all' ? undefined : activeTab)
      const { status: _searchStatus, ...restFilters } = filters

      // 1) 调一次不带 status 的查询来计算各 Tab 统计（受其他过滤条件影响）
      const statsRes = await fetchAssetList({
        page: 1, size: 9999,
        ...restFilters,
      })
      const allData = statsRes.records || []
      const newStats: Record<AssetStatus | 'all', number> = {
        all: statsRes.total || 0,
        in_use: 0, idle: 0, in_repair: 0, scrapped: 0,
      }
      allData.forEach((a) => { newStats[a.status] += 1 })
      setStats(newStats)

      // 2) 调分页查询（带 status filter）
      const res = await fetchAssetList({
        page,
        size,
        ...restFilters,
        status: statusFilter,
      })
      setDataSource(res.records || [])
      setTotal(res.total || 0)
    } catch {
      message.error(t('asset.queryFailed'))
    } finally {
      setLoading(false)
    }
  }, [page, size, activeTab, filters, t])

  useEffect(() => { loadData() }, [loadData])

  /* ----- 搜索 / 重置 ----- */
  const handleSearch = () => {
    const v = form.getFieldsValue()
    setFilters({
      assetNo: v.assetNo || undefined,
      assetType: v.assetType || undefined,
      brand: v.brand || undefined,
      company: v.company || undefined,
      department: v.department || undefined,
      source: v.source || undefined,
      status: v.status || undefined,
      purchaseDate: v.purchaseDate
        ? [v.purchaseDate[0]?.format('YYYY-MM-DD'), v.purchaseDate[1]?.format('YYYY-MM-DD')]
        : undefined,
      scrapDate: v.scrapDate
        ? [v.scrapDate[0]?.format('YYYY-MM-DD'), v.scrapDate[1]?.format('YYYY-MM-DD')]
        : undefined,
      updatedBy: v.updatedBy || undefined,
      updatedAt: v.updatedAt
        ? [v.updatedAt[0]?.format('YYYY-MM-DD'), v.updatedAt[1]?.format('YYYY-MM-DD')]
        : undefined,
    })
    setPage(1)
  }
  const handleReset = () => { form.resetFields(); setFilters({}); setPage(1) }

  /* ----- Tab 切换 ----- */
  const handleTabChange = (key: string) => {
    setActiveTab(key as AssetStatus | 'all')
    setPage(1)
  }

  /* ----- 操作：详情 / 新增 / 编辑 / 转移 / 报废 / 维修 / 删除 ----- */
  const handleDetail = (record: AssetItem) => {
    navigate(`/asset-detail?id=${record.id}`)
  }
  const handleAdd = () => {
    navigate('/asset-add')
  }
  const handleEdit = (record: AssetItem) => {
    navigate(`/asset-add?id=${record.id}`)
  }
  const handleTransfer = (record: AssetItem) => {
    navigate(`/asset-transfer?id=${record.id}`)
  }
  const handleScrap = (record: AssetItem) => {
    navigate(`/asset-scrap?id=${record.id}`)
  }
  const handleRepair = (record: AssetItem) => {
    navigate(`/asset-repair?id=${record.id}`)
  }
  const handleDelete = (record: AssetItem) => {
    Modal.confirm({
      title: t('asset.confirmDeleteTitle'),
      content: `${record.assetName}（${record.assetNo}）`,
      okText: t('common.confirm'),
      okButtonProps: { danger: true },
      cancelText: t('common.cancel'),
      onOk: async () => {
        try {
          await deleteAsset(record.id)
          message.success(t('asset.deleteSuccess'))
          loadData()
        } catch (e: unknown) {
          message.error(e instanceof Error ? e.message : t('asset.deleteFailed'))
        }
      },
    })
  }

  /* ----- 导出 ----- */
  const handleExport = () => {
    if (!dataSource.length) {
      message.warning(t('asset.noDataToExport'))
      return
    }
    const cols = [
      { title: t('asset.colAssetNo'),     dataIndex: 'assetNo' },
      { title: t('asset.colAssetName'),   dataIndex: 'assetName' },
      { title: t('asset.colAssetType'),   dataIndex: 'assetType' },
      { title: t('asset.colBrand'),       dataIndex: 'brand' },
      { title: t('asset.colCompany'),     dataIndex: 'company' },
      { title: t('asset.colLocation'),    dataIndex: 'location' },
      { title: t('asset.colDepartment'),  dataIndex: 'department' },
      { title: t('asset.colUserName'),    dataIndex: 'userName' },
      { title: t('asset.colSource'),      dataIndex: 'source' },
      { title: t('asset.colPurchaseValue'), dataIndex: 'purchaseValue' },
      { title: t('asset.colPurchaseDate'),  dataIndex: 'purchaseDate' },
      { title: t('asset.colUsageDate'),     dataIndex: 'usageDate' },
      { title: t('asset.colStatus'),      dataIndex: 'status' },
    ]
    exportToCSV(`资产台账_${new Date().toISOString().slice(0, 10)}`, cols, dataSource)
    message.success(t('asset.exportSuccess'))
  }

  const handleTableChange = (pagination: TablePaginationConfig) => {
    setPage(pagination.current || 1)
    setSize(pagination.pageSize || 10)
  }

  /* ----- 状态徽章渲染 ----- */
  const renderStatus = (s: AssetStatus) => {
    const meta = STATUS_META[s]
    return <Tag color={meta.color}>{t(meta.key)}</Tag>
  }
  const renderSource = (s: AssetSource) => {
    const meta = SOURCE_META[s]
    return <Tag color={meta.color}>{t(meta.key)}</Tag>
  }
  const renderHoldType = (h?: AssetItem['holdType']) => {
    if (!h) return '-'
    const meta = HOLD_META[h]
    return <Tag color={meta.color}>{t(meta.key)}</Tag>
  }

  /* ----- 列定义 ----- */
  const columns: TableColumnsType<AssetItem> = useMemo(() => [
    {
      title: t('asset.colAssetNo'),
      dataIndex: 'assetNo', key: 'assetNo', width: 140, fixed: 'left',
      render: (v: string) => <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>{v}</span>,
    },
    {
      title: t('asset.colAssetName'),
      dataIndex: 'assetName', key: 'assetName', width: 180, ellipsis: true,
    },
    {
      title: t('asset.colAssetType'),
      dataIndex: 'assetType', key: 'assetType', width: 100,
    },
    {
      title: t('asset.colBrand'),
      dataIndex: 'brand', key: 'brand', width: 100,
    },
    {
      title: t('asset.colImage'),
      dataIndex: 'images', key: 'images', width: 80,
      render: (v: string | null) => v ? (
        <Image src={v.split(',')[0]} width={40} height={40} style={{ objectFit: 'cover', borderRadius: 4 }} />
      ) : (
        <CameraOutlined style={{ fontSize: 20, color: '#bfbfbf' }} />
      ),
    },
    {
      title: t('asset.colCompany'),
      dataIndex: 'company', key: 'company', width: 100,
    },
    {
      title: t('asset.colLocationName'),
      dataIndex: 'location', key: 'location', width: 180, ellipsis: true,
    },
    {
      title: t('asset.colHoldType'),
      dataIndex: 'holdType', key: 'holdType', width: 110,
      render: (v?: AssetItem['holdType']) => renderHoldType(v),
    },
    {
      title: t('asset.colDepartment'),
      dataIndex: 'department', key: 'department', width: 100,
    },
    {
      title: t('asset.colUserName'),
      dataIndex: 'userName', key: 'userName', width: 140,
    },
    {
      title: t('asset.colSource'),
      dataIndex: 'source', key: 'source', width: 80,
      render: (v: AssetSource) => renderSource(v),
    },
    {
      title: t('asset.colQuantity'),
      dataIndex: 'quantity', key: 'quantity', width: 70, align: 'right',
    },
    {
      title: t('asset.colPurchaseValue'),
      dataIndex: 'purchaseValue', key: 'purchaseValue', width: 110, align: 'right',
      render: (v: number) => v ? `MOP ${v.toLocaleString()}` : '-',
    },
    {
      title: t('asset.colPurchaseDate'),
      dataIndex: 'purchaseDate', key: 'purchaseDate', width: 110,
    },
    {
      title: t('asset.colStatus'),
      dataIndex: 'status', key: 'status', width: 90,
      render: (v: AssetStatus) => renderStatus(v),
    },
    {
      title: t('asset.colScrapTime'),
      dataIndex: 'scrapTime', key: 'scrapTime', width: 170,
      render: (v: string | null) => v || '-',
    },
    {
      title: t('asset.colUpdatedBy'),
      dataIndex: 'applicant', key: 'updatedBy', width: 120,
    },
    {
      title: t('asset.colUpdatedAt'),
      dataIndex: 'updatedAt', key: 'updatedAt', width: 170,
    },
    {
      title: t('asset.colRemark'),
      dataIndex: 'remark', key: 'remark', width: 140, ellipsis: true,
    },
    {
      title: t('common.colAction'),
      key: 'action', width: 340, fixed: 'right',
      render: (_: unknown, record: AssetItem) => {
        const canTransfer = record.status === 'in_use'
        const canScrap = record.status !== 'scrapped'
        // in_use 可发起新维修；in_repair 已在维修中，引导进入维修菜单查看
        const canNewRepair = record.status === 'in_use'
        const canViewRepair = record.status === 'in_repair'
        return (
          <Space size={0} split={<span className="action-split">|</span>}>
            <Button type="link" size="small" onClick={() => handleDetail(record)}>
              {t('common.detail')}
            </Button>
            {canTransfer && (
              <Button type="link" size="small" onClick={() => handleTransfer(record)}>
                {t('asset.btnTransfer')}
              </Button>
            )}
            {canNewRepair && (
              <Button type="link" size="small" onClick={() => handleRepair(record)}>
                {t('asset.btnRepair')}
              </Button>
            )}
            {canViewRepair && (
              <Button type="link" size="small" onClick={() => handleRepair(record)}>
                {t('asset.btnViewRepair')}
              </Button>
            )}
            {canScrap && (
              <Button type="link" size="small" danger onClick={() => handleScrap(record)}>
                {t('asset.btnScrap')}
              </Button>
            )}
            <Button type="link" size="small" onClick={() => handleEdit(record)}>
              {t('common.edit')}
            </Button>
            <Button type="link" size="small" danger onClick={() => handleDelete(record)}>
              {t('common.delete')}
            </Button>
          </Space>
        )
      },
    },
  ], [t])

  /* ----- 资产类型选项 ----- */
  const assetTypeOptions = [
    { label: t('common.all'), value: '' },
    { label: '电子设备', value: '电子设备' },
    { label: '办公家具', value: '办公家具' },
    { label: '办公设备', value: '办公设备' },
    { label: '交通工具', value: '交通工具' },
    { label: '其他', value: '其他' },
  ]
  const companyOptions = [
    { label: t('common.all'), value: '' },
    { label: '澳觅科技', value: '澳觅科技' },
    { label: '闪蜂', value: '闪蜂' },
    { label: 'mFood', value: 'mFood' },
  ]
  const sourceOptions = [
    { label: t('common.all'), value: '' },
    { label: t('asset.sourceSelf'),  value: 'self' },
    { label: t('asset.sourceLease'), value: 'lease' },
  ]
  const statusOptions = [
    { label: t('common.all'),           value: '' },
    { label: t('asset.statusIdle'),     value: 'idle' },
    { label: t('asset.statusInUse'),    value: 'in_use' },
    { label: t('asset.statusInRepair'), value: 'in_repair' },
    { label: t('asset.statusScrapped'), value: 'scrapped' },
  ]

  return (
    <div className="content-area">
      {/* ====== 搜索区 ====== */}
      <div className="search-section">
        <Form form={form} layout="inline">
          <Form.Item label={t('asset.searchAssetNo')} name="assetNo">
            <Input placeholder={t('asset.searchAssetNoPh')} allowClear style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item label={t('asset.colAssetType')} name="assetType">
            <Select placeholder={t('common.all')} allowClear options={assetTypeOptions} />
          </Form.Item>
          <Form.Item label={t('asset.colBrand')} name="brand">
            <Input placeholder={t('asset.colBrand')} allowClear />
          </Form.Item>
          <Form.Item label={t('asset.colCompany')} name="company">
            <Select placeholder={t('common.all')} allowClear options={companyOptions} />
          </Form.Item>
          <Form.Item label={t('asset.colDepartment')} name="department">
            <Input placeholder={t('asset.colDepartment')} allowClear />
          </Form.Item>
          <Form.Item label={t('asset.colSource')} name="source">
            <Select placeholder={t('common.all')} allowClear options={sourceOptions} />
          </Form.Item>
          <Form.Item label={t('asset.colStatus')} name="status">
            <Select placeholder={t('common.all')} allowClear options={statusOptions} />
          </Form.Item>
          <Form.Item label={t('asset.colPurchaseDate')} name="purchaseDate">
            <DatePicker.RangePicker style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item label={t('asset.searchScrapDate')} name="scrapDate">
            <DatePicker.RangePicker style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item label={t('asset.searchUpdatedBy')} name="updatedBy">
            <Input placeholder={t('asset.searchUpdatedBy')} allowClear />
          </Form.Item>
          <Form.Item label={t('asset.searchUpdatedAt')} name="updatedAt">
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

      {/* ====== 操作区 ====== */}
      <div className="action-section">
        <div className="action-section-left">
          <Button className="btn-export" icon={<ExportOutlined />} onClick={handleExport}>
            {t('common.export')}
          </Button>
        </div>
        <div className="action-section-right">
          <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd}>
            {t('asset.btnAddAsset')}
          </Button>
        </div>
      </div>

      {/* ====== 状态 Tab ====== */}
      <Tabs
        activeKey={activeTab}
        onChange={handleTabChange}
        items={[
          { key: 'all',       label: `${t('asset.tabAll')}(${stats.all})` },
          { key: 'in_use',    label: `${t('asset.tabInUse')}(${stats.in_use})` },
          { key: 'idle',      label: `${t('asset.tabIdle')}(${stats.idle})` },
          { key: 'in_repair', label: `${t('asset.tabInRepair')}(${stats.in_repair})` },
          { key: 'scrapped',  label: `${t('asset.tabScrapped')}(${stats.scrapped})` },
        ]}
      />

      {/* ====== 表格（展开行显示型号参数实例） ====== */}
      <Table<AssetItem>
        columns={columns}
        dataSource={dataSource}
        rowKey="id"
        loading={loading}
        size="middle"
        scroll={{ x: 2100 }}
        rowSelection={{
          selectedRowKeys,
          onChange: setSelectedRowKeys,
          columnWidth: 40,
          fixed: true,
        }}
        expandable={{
          expandedRowRender: (record) => (
            <div style={{ padding: '4px 0' }}>
              <div style={{ marginBottom: 8, fontWeight: 600 }}>{t('asset.colParams')}</div>
              {record.params && Object.keys(record.params).length > 0 ? (
                <Space size={6} wrap>
                  {Object.entries(record.params).map(([k, v]) => (
                    <Tag key={k} color="blue">{`${paramLabelMap[k] || k}：${v}`}</Tag>
                  ))}
                </Space>
              ) : (
                <span style={{ color: '#8c8c8c' }}>-</span>
              )}
            </div>
          ),
          rowExpandable: (record) => !!(record.params && Object.keys(record.params).length),
        }}
        pagination={{
          current: page, pageSize: size, total, showSizeChanger: true, showTotal: (t2) => `${t('common.total', { count: t2 })}`,
        }}
        onChange={handleTableChange}
      />
    </div>
  )
}
