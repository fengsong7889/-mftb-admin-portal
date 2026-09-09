/**
 * 損壞賠付管理（物資管理）
 *
 * 同一路由內視圖切換：賠付列表 ⇄ 賠付登記 ⇄ 賠付詳情
 * 支持 URL 參數：
 *  - ?id=X              → 打開賠付詳情
 *  - ?returnId=X&assetId=Y&damageType=damage → 打開賠付登記（從歸還跳轉）
 */
import { useState, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import CompensationList from './CompensationList'
import CompensationForm from './CompensationForm'
import CompensationDetail from './CompensationDetail'

type View =
  | { mode: 'list' }
  | { mode: 'form'; returnId?: number; assetId: number; damageType?: 'damage' | 'loss' }
  | { mode: 'detail'; id: number }

export default function AssetCompensation() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const urlId = searchParams.get('id') ? Number(searchParams.get('id')) : null
  const urlReturnId = searchParams.get('returnId') ? Number(searchParams.get('returnId')) : null
  const urlAssetId = searchParams.get('assetId') ? Number(searchParams.get('assetId')) : null
  const urlDamageType = searchParams.get('damageType') as 'damage' | 'loss' | null

  const [view, setView] = useState<View>(() => {
    if (urlId) return { mode: 'detail', id: urlId }
    if (urlAssetId) return { mode: 'form', returnId: urlReturnId || undefined, assetId: urlAssetId, damageType: urlDamageType || undefined }
    return { mode: 'list' }
  })

  useEffect(() => {
    if (urlId) setView({ mode: 'detail', id: urlId })
    else if (urlAssetId) setView({ mode: 'form', returnId: urlReturnId || undefined, assetId: urlAssetId, damageType: urlDamageType || undefined })
  }, [urlId, urlReturnId, urlAssetId, urlDamageType])

  const backToList = () => {
    setView({ mode: 'list' })
    navigate('/asset-compensation', { replace: true })
  }

  const toAsset = (assetNo: string) => navigate(`/asset-list?assetNo=${encodeURIComponent(assetNo)}`)

  return (
    <div className="content-area">
      {view.mode === 'list' && (
        <CompensationList
          onViewDetail={(id) => {
            setView({ mode: 'detail', id })
            navigate(`/asset-compensation?id=${id}`, { replace: true })
          }}
          onViewAsset={toAsset}
        />
      )}
      {view.mode === 'form' && (
        <CompensationForm
          key={`form-${view.assetId}`}
          returnId={view.returnId}
          assetId={view.assetId}
          damageType={view.damageType}
          onBack={backToList}
          onCreated={(compId) => {
            setView({ mode: 'detail', id: compId })
            navigate(`/asset-compensation?id=${compId}`, { replace: true })
          }}
        />
      )}
      {view.mode === 'detail' && (
        <CompensationDetail
          key={`detail-${view.id}`}
          compId={view.id}
          onBack={backToList}
          onViewAsset={toAsset}
        />
      )}
    </div>
  )
}
