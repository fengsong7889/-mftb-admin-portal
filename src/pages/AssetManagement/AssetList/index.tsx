/**
 * 资产台账列表页（物资管理-核心入口）
 *
 * 展示所有资产的基础信息，支持多条件搜索、批量操作、导出 Excel
 * 顶部 Tab 切换「全部 / 在用 / 闲置 / 维修中 / 已报废」
 *
 * EAM 增强：
 *  - 新增「存放仓库」（关联位置树）与「持有方式」（自有领用/借用）列
 *  - 展开行显示型号参数实例（CPU/内存/硬盘…，参数名取分类模板 label）
 *  - 操作列移除「领用」「归还」，统一入口改为领用管理 / 归还管理菜单
 *  - 支持 URL ?assetNo= 带入编号过滤（由验收入库页点击资产编号跳转）
 *
 * 保留的行操作（按序）：详情 / 编辑 / 维修(查看维修) / 报废 / 删除
 *
 * 搜索条件（11 字段）：资产编号、资产类型、品牌、所属公司、归属部门、采购形式、
 *                      状态、购买日期、报废日期、最后更新人、最后更新时间
 */
import { useState, useEffect, useCallback, useMemo } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  Button, Form, Input, Select, Table, Tag, Modal, message, Space, Tabs, DatePicker, Tooltip, TreeSelect,
} from 'antd'
import type { TableColumnsType, TablePaginationConfig } from 'antd'
import {
  SearchOutlined, ReloadOutlined, PlusOutlined, ExportOutlined, PrinterOutlined, TagsOutlined,
} from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
import {
  fetchAssetList, fetchAssetStatusCounts, deleteAsset, updateAsset,
  type AssetItem, type AssetStatus, type AssetSource, type AssetListQuery,
} from '../../../api/asset'
import { fetchAssetTagList, bindAssetTag, fetchCategoryList, fetchBrandList, type AssetCategory, type AssetBrand, type AssetTagTemplate } from '../../../api/eam'
import { fetchDepartments, type DepartmentItem } from '../../../api/department'
import { fetchEmployeeOptions } from '../../../api/employee'
import type { OptionItem } from '../../../api/types'
import { exportToCSV } from '../../../utils/exportCSV'
import BrandTag from '../../../components/BrandTag'
import { useColumnConfig } from '../../../hooks/useColumnConfig'

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

/* ==================== 部門樹形數據構建 ==================== */
function buildDeptTree(depts: DepartmentItem[]): { title: string; value: string; children?: { title: string; value: string }[] }[] {
  const childrenMap = new Map<number, DepartmentItem[]>()
  const roots: DepartmentItem[] = []
  depts.forEach((d) => {
    if (d.parentId && d.parentId !== 0) {
      if (!childrenMap.has(d.parentId)) childrenMap.set(d.parentId, [])
      childrenMap.get(d.parentId)!.push(d)
    } else {
      roots.push(d)
    }
  })
  return roots.map((r) => ({
    title: r.name,
    value: r.name,
    children: (childrenMap.get(r.id) || []).map((c) => ({ title: c.name, value: c.name })),
  }))
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
  /* ----- 批量綁定標籤 ----- */
  const [batchBindOpen, setBatchBindOpen] = useState(false)
  const [batchTagId, setBatchTagId] = useState<number>()
  const [batchBinding, setBatchBinding] = useState(false)
  const [tagTemplates, setTagTemplates] = useState<AssetTagTemplate[]>([])
  /** 各状态统计（受非状态过滤条件影响，用于 Tab 徽标） */
  const [stats, setStats] = useState<Record<AssetStatus | 'all', number>>({
    all: 0, in_use: 0, idle: 0, in_repair: 0, scrapped: 0,
  })

  /* ----- 分类树 & 品牌列表（搜索区用） ----- */
  const [categories, setCategories] = useState<AssetCategory[]>([])
  const [brands, setBrands] = useState<AssetBrand[]>([])

  /* ----- 部門樹（搜索區用） ----- */
  const [departments, setDepartments] = useState<DepartmentItem[]>([])

  /* ----- 員工搜索下拉（最後更新人） ----- */
  const [employeeOptions, setEmployeeOptions] = useState<OptionItem[]>([])
  const [employeeSearchLoading, setEmployeeSearchLoading] = useState(false)

  useEffect(() => {
    fetchCategoryList({ bizType: 'ASSET' }).then(setCategories).catch(() => setCategories([]))
    fetchBrandList({ bizType: 'ASSET' }).then(setBrands).catch(() => setBrands([]))
    fetchDepartments().then(setDepartments).catch(() => setDepartments([]))
  }, [])

  /** 构建树结构（parentId=0 为根） */
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

  /** 部門樹數據 */
  const deptTreeData = useMemo(() => buildDeptTree(departments), [departments])

  /** 員工搜索 */
  const handleEmployeeSearch = useCallback(async (keyword: string) => {
    setEmployeeSearchLoading(true)
    try {
      const options = await fetchEmployeeOptions(keyword)
      setEmployeeOptions(options)
    } finally {
      setEmployeeSearchLoading(false)
    }
  }, [])

  // URL ?assetNo= 带入时回填搜索框（由验收入库页跳转）
  useEffect(() => {
    if (urlAssetNo) form.setFieldsValue({ assetNo: urlAssetNo })
  }, [urlAssetNo, form])

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      // 状态过滤优先级：搜索区 status > Tab 状态
      const statusFilter = filters.status || (activeTab === 'all' ? undefined : activeTab)
      const { status: _searchStatus, ...restFilters } = filters

      // 各状态数量由后端汇总，避免分页上限导致徽标数量不完整。
      const newStats = await fetchAssetStatusCounts(restFilters)
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

  /* ----- 操作：详情 / 新增 / 编辑 / 报废 / 维修 / 删除 ----- */
  const handleDetail = (record: AssetItem) => {
    navigate(`/asset-detail?id=${record.id}`)
  }
  const handleAdd = () => {
    navigate('/asset-add')
  }
  const handleEdit = (record: AssetItem) => {
    navigate(`/asset-add?id=${record.id}`)
  }
  const handleScrap = (record: AssetItem) => {
    Modal.confirm({
      title: '確定要報廢該資產嗎？',
      className: 'custom-confirm-modal',
      icon: <span className="confirm-icon-wrapper"><span className="confirm-icon-text">!</span></span>,
      content: (
        <div className="confirm-info-card">
          <div className="confirm-info-row"><span>資產編號：</span><b>{record.assetNo}</b></div>
          <div className="confirm-info-row"><span>資產名稱：</span><b>{record.assetName}</b></div>
          <div className="confirm-info-row"><span>當前狀態：</span><b>{t(STATUS_META[record.status].key)}</b></div>
          <div style={{ marginTop: 12, padding: '8px 12px', background: '#FFF2F0', borderRadius: 6, border: '1px solid #FFCCC7', fontSize: 13, color: '#FF4D4F' }}>
            ⚠️ 報廢後資產狀態將變更為「已報廢」，此操作不可恢復，請謹慎操作。
          </div>
        </div>
      ),
      okText: '確認報廢',
      okButtonProps: { danger: true },
      cancelText: '取消',
      onOk: async () => {
        await updateAsset(record.id, { ...record, status: 'scrapped', scrapTime: new Date().toISOString().slice(0, 10) } as never)
        message.success('資產已報廢')
        loadData()
      },
    })
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
      { title: t('asset.assetNo'),     dataIndex: 'assetNo' },
      { title: t('asset.colAssetName'),   dataIndex: 'assetName' },
      { title: t('asset.colAssetType'),   dataIndex: 'assetType' },
      { title: t('asset.purchaseType'),   dataIndex: 'purchaseType' },
      { title: t('asset.colBrand'),       dataIndex: 'brand' },
      { title: t('asset.colCompanyBrand'), dataIndex: 'companyBrand', render: (v: number | null | undefined) => (v === 1 ? '闪蜂' : v === 2 ? 'mFood' : '') },
      { title: t('asset.colCompany'),     dataIndex: 'company' },
      { title: t('asset.colLocation'),    dataIndex: 'location' },
      { title: t('asset.colCurrentUserName'), dataIndex: 'userName' },
      { title: t('asset.colDepartment'),  dataIndex: 'department' },
      { title: t('asset.colClaimDate'), dataIndex: 'usageDate' },
      { title: t('asset.sourceLabel'),      dataIndex: 'source' },
      { title: t('asset.colPurchaseValue'), dataIndex: 'purchaseValue' },
      { title: t('asset.colPurchaseDate'),  dataIndex: 'purchaseDate' },
      { title: t('asset.colUsageDate'),     dataIndex: 'usageDate' },
      { title: t('asset.colStatus'),      dataIndex: 'status' },
    ]
    exportToCSV(`${t('asset.assetLedgerPrefix')}${new Date().toISOString().slice(0, 10)}`, cols, dataSource)
    message.success(t('asset.exportSuccess'))
  }

  /* ----- 批量綁定標籤 ----- */
  const openBatchBind = async () => {
    setBatchTagId(undefined)
    setBatchBindOpen(true)
    try {
      const list = await fetchAssetTagList()
      setTagTemplates(list.filter(t => t.status === 'enabled'))
    } catch (e: unknown) {
      message.error(e instanceof Error ? e.message : t('asset.tagTemplateLoadFailed'))
    }
  }

  const handleBatchBind = async () => {
    if (!batchTagId) {
      message.warning(t('asset.selectTagTemplate'))
      return
    }
    setBatchBinding(true)
    try {
      await Promise.all(selectedRowKeys.map(k => bindAssetTag(Number(k), batchTagId)))
      message.success(t('asset.batchBindSuccess', { count: selectedRowKeys.length }))
      setBatchBindOpen(false)
    } catch (e: unknown) {
      message.error(e instanceof Error ? e.message : t('asset.batchBindFailed'))
    } finally {
      setBatchBinding(false)
    }
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

  /* ----- 字段配置 ----- */
  const columnMeta = useMemo(() => [
    { key: 'assetNo', title: t('asset.assetNo') },
    { key: 'assetName', title: t('asset.colAssetName') },
    { key: 'assetType', title: t('asset.colAssetType') },
    { key: 'purchaseType', title: t('asset.purchaseType') },
    { key: 'brand', title: t('asset.colBrand') },
    { key: 'companyBrand', title: t('asset.colCompanyBrand') },
    { key: 'company', title: t('asset.colCompany') },
    { key: 'location', title: t('asset.colLocationName') },
    { key: 'holdType', title: t('asset.colHoldType') },
    { key: 'userName', title: t('asset.colCurrentUserName') },
    { key: 'department', title: t('asset.colDepartment') },
    { key: 'usageDate', title: t('asset.colClaimDate') },
    { key: 'source', title: t('asset.sourceLabel') },
    { key: 'quantity', title: t('asset.colQuantity') },
    { key: 'purchaseValue', title: t('asset.colPurchaseValue') },
    { key: 'orderDate', title: t('asset.colOrderDate') },
    { key: 'status', title: t('asset.colStatus') },
    { key: 'scrapTime', title: t('asset.colScrapTime') },
    { key: 'updatedBy', title: t('asset.colUpdatedBy') },
    { key: 'updatedAt', title: t('asset.colUpdatedAt') },
    { key: 'remark', title: t('asset.colRemark') },
    { key: 'action', title: t('common.colAction') },
  ], [t])

  const { configComponent, applyConfig } = useColumnConfig('asset-list-v2', columnMeta, [
    { key: 'action', visible: true, locked: 'tail' },
  ])

  /* ----- 列定义 ----- */
  const allColumns: TableColumnsType<AssetItem> = [
    {
      title: t('asset.assetNo'),
      dataIndex: 'assetNo', key: 'assetNo', width: 180, fixed: 'left',
      render: (v: string) => <span style={{ fontFamily: 'monospace', fontWeight: 600, whiteSpace: 'nowrap' }}>{v}</span>,
    },
    {
      title: t('asset.colAssetName'),
      dataIndex: 'assetName', key: 'assetName', width: 180, ellipsis: true,
      render: (v: string) => (
        <Tooltip title={v || undefined}>
          <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{v || '-'}</span>
        </Tooltip>
      ),
    },
    {
      title: t('asset.colAssetType'),
      dataIndex: 'assetType', key: 'assetType', width: 100, ellipsis: true,
      render: (v: string) => (
        <Tooltip title={v || undefined}>
          <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{v || '-'}</span>
        </Tooltip>
      ),
    },
    {
      title: t('asset.purchaseType'),
      dataIndex: 'purchaseType', key: 'purchaseType', width: 90,
      render: (v: string) => {
        if (!v) return <span style={{ color: '#bfbfbf' }}>-</span>
        return <Tag color={v === 'purchase' ? 'blue' : 'green'}>{v === 'purchase' ? t('asset.purchaseTypePurchase') : t('asset.purchaseTypeLease')}</Tag>
      },
    },
    {
      title: t('asset.colBrand'),
      dataIndex: 'brand', key: 'brand', width: 100, ellipsis: true,
      render: (v: string) => (
        <Tooltip title={v || undefined}>
          <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {v || <span style={{ color: '#8C8C8C' }}>-</span>}
          </span>
        </Tooltip>
      ),
    },
    {
      title: t('asset.colCompanyBrand'),
      dataIndex: 'companyBrand', key: 'companyBrand', width: 110,
      render: (v: number | null | undefined) => v ? <BrandTag value={v} /> : <span style={{ color: '#8C8C8C' }}>-</span>,
    },
    {
      title: t('asset.colCompany'),
      dataIndex: 'company', key: 'company', width: 120, ellipsis: true,
      render: (v: string) => (
        <Tooltip title={v || undefined}>
          <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {v || '-'}
          </span>
        </Tooltip>
      ),
    },
    {
      title: t('asset.colLocationName'),
      dataIndex: 'location', key: 'location', width: 180, ellipsis: true,
      render: (_: string, record: AssetItem) => {
        const parts = [record.province, record.city, record.district, record.address].filter(Boolean)
        const full = parts.length > 0 ? parts.join('') : (record.location || '-')
        if (!record.location && parts.length === 0) return <span style={{ color: '#8C8C8C' }}>-</span>
        return (
          <Tooltip title={full}>
            <span style={{ cursor: 'default' }}>{full}</span>
          </Tooltip>
        )
      },
    },
    {
      title: t('asset.colHoldType'),
      dataIndex: 'holdType', key: 'holdType', width: 100,
      render: (v: NonNullable<AssetItem['holdType']>, record: AssetItem) => {
        // 闲置资产无使用人，持有方式不展示
        if (record.status === 'idle') return '-'
        return renderHoldType(v)
      },
    },
    {
      title: t('asset.colCurrentUserName'),
      dataIndex: 'userName', key: 'userName', width: 120, ellipsis: true,
      render: (v: string, record: AssetItem) => {
        // 闲置资产无使用人
        if (record.status === 'idle') return '-'
        return (
          <Tooltip title={v || undefined}>
            <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{v || '-'}</span>
          </Tooltip>
        )
      },
    },
    {
      title: t('asset.colDepartment'),
      dataIndex: 'department', key: 'department', width: 120, ellipsis: true,
      render: (v: string, record: AssetItem) => {
        // 闲置资产无部门归属展示
        if (record.status === 'idle') return '-'
        return (
          <Tooltip title={v || undefined}>
            <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{v || '-'}</span>
          </Tooltip>
        )
      },
    },
    {
      title: t('asset.colClaimDate'),
      dataIndex: 'usageDate', key: 'usageDate', width: 110,
      render: (v: string | null, record: AssetItem) => {
        if (record.status === 'idle') return '-'
        return v || '-'
      },
    },
    {
      title: t('asset.sourceLabel'),
      dataIndex: 'source', key: 'source', width: 90,
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
      render: (v: string | null) => v || '-',
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
      dataIndex: 'applicant', key: 'updatedBy', width: 120, ellipsis: true,
      render: (v: string) => (
        <Tooltip title={v || undefined}>
          <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{v || '-'}</span>
        </Tooltip>
      ),
    },
    {
      title: t('asset.colUpdatedAt'),
      dataIndex: 'updatedAt', key: 'updatedAt', width: 170,
    },
    {
      title: t('asset.colRemark'),
      dataIndex: 'remark', key: 'remark', width: 140, ellipsis: true,
      render: (v: string | null) => (
        <Tooltip title={v || undefined}>
          <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{v || '-'}</span>
        </Tooltip>
      ),
    },
    {
      title: t('common.colAction'),
      key: 'action', width: 280, fixed: 'right',
      render: (_: unknown, record: AssetItem) => {
        const canScrap = record.status !== 'scrapped'
        // in_use 可发起新维修；in_repair 已在维修中，引导进入维修菜单查看
        const canNewRepair = record.status === 'in_use'
        const canViewRepair = record.status === 'in_repair'
        return (
          <Space size={0} split={<span className="action-split">|</span>}>
            <Button type="link" size="small" onClick={() => handleDetail(record)}>
              {t('common.detail')}
            </Button>
            <Button type="link" size="small" onClick={() => handleEdit(record)}>
              {t('common.edit')}
            </Button>
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
            <Button type="link" size="small" danger onClick={() => handleDelete(record)}>
              {t('common.delete')}
            </Button>
          </Space>
        )
      },
    },
  ]

  const columns = applyConfig(allColumns)

  /* ----- 资产类型选项（已用 TreeSelect 替代，保留给导出等场景） ----- */
  const companyOptions = [
    { label: t('common.all'), value: '' },
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
          <Form.Item label={t('asset.assetNo')} name="assetNo">
            <Input placeholder={t('asset.assetNoPh')} allowClear style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item label={t('asset.colAssetType')} name="assetType">
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
          <Form.Item label={t('asset.colBrand')} name="brand">
            <Select
              placeholder={t('asset.colBrand')}
              allowClear
              showSearch
              optionFilterProp="label"
              options={brands.map(b => ({ label: b.brandZh, value: b.brandZh }))}
            />
          </Form.Item>
          <Form.Item label={t('asset.colCompany')} name="company">
            <Select placeholder={t('common.all')} allowClear options={companyOptions} />
          </Form.Item>
          <Form.Item label={t('asset.colDepartment')} name="department">
            <TreeSelect
              placeholder={t('common.all')}
              allowClear
              showSearch
              treeDefaultExpandAll
              treeNodeFilterProp="title"
              treeData={deptTreeData}
              style={{ width: '100%' }}
            />
          </Form.Item>
          <Form.Item label={t('asset.sourceLabel')} name="source">
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
            <Select
              placeholder={t('asset.searchUpdatedBy')}
              allowClear
              showSearch
              filterOption={false}
              onSearch={handleEmployeeSearch}
              notFoundContent={employeeSearchLoading ? '搜索中...' : '暫無數據'}
              options={employeeOptions}
              style={{ width: '100%' }}
            />
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
          <Button
            icon={<PrinterOutlined />} disabled={selectedRowKeys.length === 0}
            onClick={() => navigate(`/asset-tag-print?ids=${selectedRowKeys.join(',')}`)}
          >
            {t('asset.batchPrintTags')}
          </Button>
          <Button icon={<TagsOutlined />} disabled={selectedRowKeys.length === 0} onClick={openBatchBind}>
            {t('asset.batchBindTags')}
          </Button>
        </div>
        <div className="action-section-right">
          <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd}>
            {t('asset.btnAddAsset')}
          </Button>
          {configComponent}
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
        scroll={{ x: 2490 }}
        rowSelection={{
          selectedRowKeys,
          onChange: setSelectedRowKeys,
          columnWidth: 40,
        }}
        pagination={{
          current: page, pageSize: size, total, showSizeChanger: true, showTotal: (t2) => `${t('common.total', { count: t2 })}`,
        }}
        onChange={handleTableChange}
      />

      {/* ====== 批量綁定標籤彈窗（輕量動作：僅選模板） ====== */}
      <Modal
        title={t('asset.batchBindModalTitle', { count: selectedRowKeys.length })}
        open={batchBindOpen}
        onOk={handleBatchBind}
        onCancel={() => setBatchBindOpen(false)}
        okText={t('asset.confirmBind')}
        cancelText={t('common.cancel')}
        confirmLoading={batchBinding}
        okButtonProps={{ disabled: !batchTagId }}
        width={420}
      >
        <Select
          style={{ width: '100%' }}
          placeholder={t('asset.selectEnabledTemplate')}
          value={batchTagId}
          onChange={setBatchTagId}
          options={tagTemplates.map(t2 => ({ label: t2.name, value: t2.id }))}
          notFoundContent={<span style={{ fontSize: 12, color: '#8c8c8c' }}>{t('asset.noEnabledTemplate')}</span>}
        />
        <div style={{ marginTop: 12, fontSize: 12, color: '#8c8c8c' }}>
          {t('asset.bindSkipHint')}
        </div>
      </Modal>
    </div>
  )
}
