/**
 * MerchantGroup 共享工具 —— GroupList 與 StoreList 的公共邏輯
 */
import { useState, useCallback, useEffect, type ReactNode } from 'react'
import { Button, Form, message } from 'antd'
import type { TablePaginationConfig } from 'antd'
import { SearchOutlined, ReloadOutlined, PlusOutlined, ExportOutlined } from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
import dayjs from 'dayjs'
import { toDateRangeParams } from '../../../utils/dateRange'
import type { DateRangeValue } from '../../../utils/dateRange'

/* ──────────── 通用處理函數 ──────────── */

export const handleTableChangeFactory = (
  setPage: (v: number) => void,
  setSize: (v: number) => void,
) => (pagination: TablePaginationConfig) => {
  setPage(pagination.current || 1)
  setSize(pagination.pageSize || 10)
}

/* ──────────── 列渲染器 ──────────── */

export const renderTimestamp = (val: number) =>
  val ? dayjs(val).format('YYYY-MM-DD HH:mm:ss') : '-'

export const renderValOrDash = (val: string | undefined | null) => val || '-'

/* ──────────── 通用列表頁 Hook ──────────── */

export interface UseListPageOptions<TFilters> {
  /** 加載數據函數（由調用方實現） */
  loadData: () => Promise<void>
  /** 默認過濾器 */
  defaultFilters?: TFilters
}

export interface ListPageState<TFilters> {
  loading: boolean
  dataSource: unknown[]
  total: number
  page: number
  size: number
  filters: TFilters
  setFilters: (f: TFilters) => void
  setLoading: (v: boolean) => void
  setDataSource: (d: unknown[]) => void
  setTotal: (v: number) => void
  setPage: (v: number) => void
  setSize: (v: number) => void
  /** 搜索表單的「查詢」和「重置」按鈕回調 */
  handleSearch: (formValues: Record<string, unknown>) => void
  handleReset: (form: { resetFields: () => void }) => void
  /** 新增/編輯彈窗回調 */
  handleAdd: (setModalOpen: (v: boolean) => void, setEditingRecord: (r: null) => void) => void
  handleEdit: (record: unknown, setModalOpen: (v: boolean) => void, setEditingRecord: (r: unknown) => void) => void
  handleModalSuccess: (setModalOpen: (v: boolean) => void, setEditingRecord: (r: null) => void) => void
  /** 勾選回調 */
  handleSelectChange: (keys: React.Key[], rows: unknown[], setSelectedRowKeys: (k: React.Key[]) => void, setSelectedRows: (r: unknown[]) => void) => void
}

/**
 * 通用列表頁邏輯 Hook
 *
 * 提取 GroupList / StoreList 共享的：加載狀態、分頁、搜索/重置、勾選、彈窗管理。
 */
export function useListPage<TFilters extends Record<string, unknown>>(opts: UseListPageOptions<TFilters>) {
  const { t } = useTranslation()
  const [loading, setLoading] = useState(false)
  const [dataSource, setDataSource] = useState<unknown[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [size, setSize] = useState(10)
  const [filters, setFilters] = useState<TFilters>((opts.defaultFilters || {}) as TFilters)

  useEffect(() => {
    opts.loadData()
  }, [opts.loadData])

  const handleSearch = useCallback((formValues: Record<string, unknown>) => {
    const updated = toDateRangeParams(formValues.updatedRange as DateRangeValue | undefined)
    const created = toDateRangeParams(formValues.createdRange as DateRangeValue | undefined)
    setFilters({
      ...formValues,
      updatedRange: undefined,
      createdRange: undefined,
      updatedFrom: updated.from,
      updatedTo: updated.to,
      createdFrom: created.from,
      createdTo: created.to,
    } as unknown as TFilters)
    setPage(1)
  }, [])

  const handleReset = useCallback((form: { resetFields: () => void }) => {
    form.resetFields()
    setFilters((opts.defaultFilters || {}) as TFilters)
    setPage(1)
  }, [opts.defaultFilters])

  const handleAdd = useCallback((setModalOpen: (v: boolean) => void, setEditingRecord: (r: null) => void) => {
    setEditingRecord(null)
    setModalOpen(true)
  }, [])

  const handleEdit = useCallback((record: unknown, setModalOpen: (v: boolean) => void, setEditingRecord: (r: unknown) => void) => {
    setEditingRecord(record)
    setModalOpen(true)
  }, [])

  const handleModalSuccess = useCallback((setModalOpen: (v: boolean) => void, setEditingRecord: (r: null) => void) => {
    setModalOpen(false)
    setEditingRecord(null)
    opts.loadData()
  }, [opts.loadData])

  const handleSelectChange = useCallback((keys: React.Key[], _rows: unknown[], setSelectedRowKeys: (k: React.Key[]) => void, setSelectedRows: (r: unknown[]) => void) => {
    setSelectedRowKeys(keys)
    setSelectedRows(_rows)
  }, [])

  return {
    t, loading, setLoading, dataSource, setDataSource, total, setTotal,
    page, setPage, size, setSize, filters, setFilters,
    handleSearch, handleReset, handleAdd, handleEdit, handleModalSuccess, handleSelectChange,
  }
}

/* ──────────── 搜索表單按鈕組件 ──────────── */

export function SearchFormActions({ onSearch, onReset }: { onSearch: () => void; onReset: () => void }) {
  const { t } = useTranslation()
  return (
    <div className="search-actions">
      <Button type="primary" icon={<SearchOutlined />} onClick={onSearch}>
        {t('common:search')}
      </Button>
      <Button icon={<ReloadOutlined />} onClick={onReset}>
        {t('common:reset')}
      </Button>
    </div>
  )
}

/* ──────────── 操作區組件 ──────────── */

export function ListActionSection({
  onExport,
  onAdd,
  configComponent,
}: {
  onExport: () => void
  onAdd: () => void
  configComponent: ReactNode
}) {
  const { t } = useTranslation()
  return (
    <div className="action-section">
      <div className="action-section-left">
        <Button className="btn-export" icon={<ExportOutlined />} onClick={onExport}>
          {t('common:export')}
        </Button>
      </div>
      <div className="action-section-right">
        <Button type="primary" icon={<PlusOutlined />} onClick={onAdd}>
          {t('common:add')}
        </Button>
        {configComponent}
      </div>
    </div>
  )
}

/* ──────────── 共享表格分頁配置 ──────────── */

export function createPagination(t: (key: string, opts?: Record<string, unknown>) => string, page: number, size: number, total: number) {
  return {
    current: page,
    pageSize: size,
    total,
    showSizeChanger: true,
    showQuickJumper: true,
    showTotal: (total: number) => t('common:total', { count: total }),
  }
}
