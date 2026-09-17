/**
 * 交接管理（物資管理 - 調撥交接）
 *
 * URL 深鏈（與借用/歸還模塊模式一致）：
 *   /asset-handover          → 交接記錄列表
 *   /asset-handover/add      → 交接登記表單
 *   /asset-handover/detail   → 交接詳情（獨立頁面，禁止 Modal）
 *
 * 交接為批量操作：選離職員工 → 勾選名下資產 → 接收人 → 批量變更使用人
 */
import { useCallback, useEffect, useState } from 'react'
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { fetchHandoverDetail } from '../../../api/eam'
import type { HandoverRecord } from '../../../api/eam'
import HandoverList from './HandoverList'
import HandoverForm from './HandoverForm'
import HandoverDetail from './HandoverDetail'

type View = 'list' | 'add' | 'detail'

function parseId(raw: string | null): number | undefined {
  if (!raw || !/^[1-9]\d*$/.test(raw)) return undefined
  return Number(raw)
}

export default function AssetHandover() {
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const [searchParams] = useSearchParams()

  /* ----- 視圖路由 ----- */
  const mode = pathname.split('/')[2] || 'list'
  const view: View = mode === 'add' ? 'add' : mode === 'detail' ? 'detail' : 'list'
  const recordId = parseId(searchParams.get('id'))

  /* ----- 詳情數據 ----- */
  const [detail, setDetail] = useState<HandoverRecord>()
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailError, setDetailError] = useState<string>()

  const loadDetail = useCallback(async (id: number) => {
    setDetailLoading(true)
    setDetailError(undefined)
    try {
      setDetail(await fetchHandoverDetail(id))
    } catch (e: unknown) {
      setDetailError(e instanceof Error ? e.message : '加載交接詳情失敗')
    } finally {
      setDetailLoading(false)
    }
  }, [])

  /* ----- 進入詳情視圖時自動加載 ----- */
  useEffect(() => {
    if (view === 'detail' && recordId != null) loadDetail(recordId)
  }, [view, recordId, loadDetail])

  return (
    <div className="content-area">
      {view === 'list' && (
        <HandoverList
          onAdd={() => navigate('/asset-handover/add')}
          onViewAsset={(assetNo) => navigate(`/asset-list?assetNo=${encodeURIComponent(assetNo)}`)}
          onViewDetail={(id) => navigate(`/asset-handover/detail?id=${id}`)}
        />
      )}

      {view === 'add' && (
        <HandoverForm onBack={() => navigate('/asset-handover')} />
      )}

      {view === 'detail' && recordId != null && (
        <HandoverDetail
          record={detail}
          loading={detailLoading}
          error={detailError}
          onBack={() => navigate('/asset-handover')}
          onViewAsset={(assetNo) => navigate(`/asset-list?assetNo=${encodeURIComponent(assetNo)}`)}
        />
      )}

      {view === 'detail' && recordId == null && (
        <HandoverDetail
          error="缺少有效的交接記錄 ID。"
          onBack={() => navigate('/asset-handover')}
        />
      )}
    </div>
  )
}
