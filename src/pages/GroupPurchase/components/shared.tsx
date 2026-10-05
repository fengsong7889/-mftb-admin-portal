/**
 * GroupPurchase 秒殺管理共享工具 —— FlashSaleRegister 與 FlashSaleStats 的公共邏輯
 */
import { useState, useEffect, useCallback } from 'react'
import { message } from 'antd'
import type { FlashSalePeriod } from '../../../api/flashSale'
import { fetchFlashSalePeriods } from '../../../api/flashSale'

/** 秒殺分頁配置 */
export interface FlashSalePagination {
  current: number
  pageSize: number
  total: number
}

/** 秒殺分頁 UI 配置 */
export const flashSalePaginationConfig = (pagination: FlashSalePagination) => ({
  ...pagination,
  showSizeChanger: true,
  showQuickJumper: true,
  showTotal: (total: number) => `共 ${total} 條`,
})

/** 秒殺頁面通用 hooks：期數加載 + 搜索/重置/分頁處理 */
export function useFlashSalePage() {
  const [periods, setPeriods] = useState<FlashSalePeriod[]>([])
  const [periodNo, setPeriodNo] = useState<number | undefined>(undefined)
  const [pagination, setPagination] = useState<FlashSalePagination>({ current: 1, pageSize: 10, total: 0 })

  /** 加載期數下拉 */
  const fetchPeriods = useCallback(async () => {
    try {
      const list = await fetchFlashSalePeriods()
      setPeriods(list)
      return list
    } catch {
      return [] as FlashSalePeriod[]
    }
  }, [])

  /** 初始化：加載期數並設置默認期 */
  const initPeriods = useCallback(async (onLoad: (latestPeriodNo: number) => void) => {
    const list = await fetchPeriods()
    const latest = list[0]?.periodNo
    setPeriodNo(latest)
    onLoad(latest)
  }, [fetchPeriods])

  /** 查詢 */
  const handleSearch = useCallback((fetchList: (page: number, pageSize: number) => void, pageSize: number) => {
    fetchList(1, pageSize)
  }, [])

  /** 重置 */
  const handleReset = useCallback((resetForm: () => void, fetchList: (page: number, pageSize: number) => void, pageSize: number) => {
    resetForm()
    fetchList(1, pageSize)
  }, [])

  /** 期數切換 */
  const handlePeriodChange = useCallback((value: number, fetchList: (page: number, pageSize: number, period?: number) => void, pageSize: number) => {
    setPeriodNo(value)
    fetchList(1, pageSize, value)
  }, [])

  /** 分頁變化 */
  const handleTableChange = useCallback((pag: { current?: number; pageSize?: number }, fetchList: (page?: number, pageSize?: number) => void) => {
    fetchList(pag.current, pag.pageSize)
  }, [])

  /** 導出（佔位） */
  const handleExport = useCallback(() => {
    message.info('导出功能开发中...')
  }, [])

  /** 導入結果提示 */
  const showImportResult = useCallback((successCount: number, errorCount: number, firstError?: string) => {
    if (errorCount > 0) {
      message.warning(`導入完成：成功 ${successCount} 條，失敗 ${errorCount} 條${firstError ? `（${firstError}）` : ''}`)
    } else {
      message.success(`導入成功 ${successCount} 條`)
    }
  }, [])

  return {
    periods,
    periodNo,
    setPeriodNo,
    pagination,
    setPagination,
    fetchPeriods,
    initPeriods,
    handleSearch,
    handleReset,
    handlePeriodChange,
    handleTableChange,
    handleExport,
    showImportResult,
  }
}
