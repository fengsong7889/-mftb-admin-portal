/**
 * AssetManagement 共享工具 —— AssetLoss 與 AssetScrap 的公共邏輯
 */
import { useState, useCallback, useRef } from 'react'
import { Tag, message } from 'antd'
import type { AssetItem, AssetStatus } from '../../../api/asset'
import { fetchAssetDetail, fetchAssetList } from '../../../api/asset'

/** 資產狀態 → 標籤顏色 */
export const ASSET_STATUS_COLOR: Record<AssetStatus, string> = {
  idle: 'default', in_use: 'success', in_repair: 'processing', scrapped: 'error',
  lost: 'warning', pending_inspection: 'blue', pending_disposal: 'orange', written_off: 'default',
}

/** 模塊卡片統一樣式 */
export const detailCardStyle: React.CSSProperties = {
  borderRadius: 8, background: '#fff', padding: '20px 24px', marginBottom: 16,
  boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
}

/** 卡片標題（圖標色塊 + 標題 + 分隔線） */
export function SectionTitle({ icon, iconBg, title, tag }: {
  icon: React.ReactNode; iconBg: string; title: string; tag?: React.ReactNode
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
      <div style={{ width: 28, height: 28, borderRadius: 6, background: iconBg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {icon}
      </div>
      <span style={{ fontSize: 15, fontWeight: 600, color: '#262626' }}>{title}</span>
      {tag}
      <div style={{ flex: 1, height: 1, background: '#f0f0f0', marginLeft: 8 }} />
    </div>
  )
}

/** 資產狀態標籤文本 */
export const getAssetStatusLabel = (status: AssetStatus) => {
  const map: Record<AssetStatus, string> = {
    idle: '閒置', in_use: '使用中', in_repair: '維修中', scrapped: '已報廢',
    lost: '遺失', pending_inspection: '待驗收', pending_disposal: '待處置', written_off: '已核銷',
  }
  return map[status] || status
}

/** 資產搜索與選擇 hook */
export function useAssetSearch() {
  const [asset, setAsset] = useState<AssetItem | null>(null)
  const [assetLoading, setAssetLoading] = useState(false)
  const [assetSelectOptions, setAssetSelectOptions] = useState<AssetItem[]>([])
  const [assetSelectLoading, setAssetSelectLoading] = useState(false)
  const searchTimerRef = useRef<ReturnType<typeof setTimeout>>()

  /** 選擇資產後帶出台賬數據 */
  const loadAsset = useCallback(async (assetId: number) => {
    setAssetLoading(true)
    try {
      const detail = await fetchAssetDetail(assetId)
      setAsset(detail)
    } catch (e: unknown) {
      message.error(e instanceof Error ? e.message : '查詢資產失敗')
    } finally {
      setAssetLoading(false)
    }
  }, [])

  /** 加載初始資產列表 */
  const loadInitialAssets = useCallback(async () => {
    if (assetSelectOptions.length > 0) return
    setAssetSelectLoading(true)
    try {
      const res = await fetchAssetList({ status: 'all', page: 1, size: 50 })
      setAssetSelectOptions(res.records.filter((a) => a.status !== 'scrapped'))
    } catch {
      setAssetSelectOptions([])
    } finally {
      setAssetSelectLoading(false)
    }
  }, [assetSelectOptions.length])

  /** 資產遠程搜索（300ms 防抖） */
  const handleAssetSearch = useCallback((keyword: string) => {
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current)
    if (!keyword) { loadInitialAssets(); return }
    searchTimerRef.current = setTimeout(async () => {
      setAssetSelectLoading(true)
      try {
        const res = await fetchAssetList({ keyword, status: 'all', page: 1, size: 50 })
        setAssetSelectOptions(res.records.filter((a) => a.status !== 'scrapped'))
      } catch {
        setAssetSelectOptions([])
      } finally {
        setAssetSelectLoading(false)
      }
    }, 300)
  }, [loadInitialAssets])

  /** 下拉選擇資產 */
  const handleAssetSelect = useCallback((assetId: number | undefined) => {
    if (assetId) {
      loadAsset(assetId)
    } else {
      setAsset(null)
    }
  }, [loadAsset])

  return {
    asset,
    setAsset,
    assetLoading,
    assetSelectOptions,
    assetSelectLoading,
    loadAsset,
    loadInitialAssets,
    handleAssetSearch,
    handleAssetSelect,
  }
}
