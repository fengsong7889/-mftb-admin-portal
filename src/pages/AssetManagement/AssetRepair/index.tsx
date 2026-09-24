/**
 * 維修管理（物資管理）
 *
 * 同一路由內視圖切換：維修記錄全局列表 ⇄ 新建維修 ⇄ 單資產維修詳情
 * 支持 URL ?id= 直接進入指定資產的維修詳情（由資產台賬「維修」跳轉）
 * 支持 URL ?create=1 直接進入新建維修頁
 */
import { useState, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import RepairList from './RepairList'
import RepairCreate from './RepairCreate'
import RepairDetail from './RepairDetail'

type View = { mode: 'list' } | { mode: 'create' } | { mode: 'detail'; assetId: number }

export default function AssetRepair() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const urlId = searchParams.get('id') ? Number(searchParams.get('id')) : null
  const urlCreate = searchParams.get('create') === '1'
  const [view, setView] = useState<View>(
    urlCreate ? { mode: 'create' }
      : urlId ? { mode: 'detail', assetId: urlId }
        : { mode: 'list' },
  )

  // 視圖完全由 URL 驅動：外鏈帶 id 進詳情、?create=1 進新建、無參數回列表（修復點側欄菜單卡在詳情）
  useEffect(() => {
    if (urlCreate) setView({ mode: 'create' })
    else if (urlId) setView({ mode: 'detail', assetId: urlId })
    else setView({ mode: 'list' })
  }, [urlId, urlCreate])

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
          onCreate={() => {
            setView({ mode: 'create' })
            navigate('/asset-repair?create=1', { replace: true })
          }}
        />
      ) : view.mode === 'create' ? (
        <RepairCreate
          onBack={backToList}
          onCreated={(assetId) => {
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
