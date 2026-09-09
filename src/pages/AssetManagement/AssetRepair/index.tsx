/**
 * 維修管理（物資管理）
 *
 * 同一路由內視圖切換：維修記錄全局列表 ⇄ 單資產維修詳情
 * 支持 URL ?id= 直接進入指定資產的維修詳情（由資產台賬「維修」跳轉）
 */
import { useState, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import RepairList from './RepairList'
import RepairDetail from './RepairDetail'

type View = { mode: 'list' } | { mode: 'detail'; assetId: number }

export default function AssetRepair() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const urlId = searchParams.get('id') ? Number(searchParams.get('id')) : null
  const [view, setView] = useState<View>(
    urlId ? { mode: 'detail', assetId: urlId } : { mode: 'list' },
  )

  // 外部跳轉帶入 id 時同步打開維修詳情
  useEffect(() => {
    if (urlId) setView({ mode: 'detail', assetId: urlId })
  }, [urlId])

  const backToList = () => {
    setView({ mode: 'list' })
    navigate('/asset-repair', { replace: true })
  }

  return (
    <div className="content-area">
      {view.mode === 'list' ? (
        <RepairList
          onViewAsset={(assetNo) => navigate(`/asset-list?assetNo=${encodeURIComponent(assetNo)}`)}
          onViewDetail={(assetId) => {
            setView({ mode: 'detail', assetId })
            navigate(`/asset-repair?id=${assetId}`, { replace: true })
          }}
        />
      ) : (
        <RepairDetail
          key={view.assetId}
          assetId={view.assetId}
          onBack={backToList}
        />
      )}
    </div>
  )
}
