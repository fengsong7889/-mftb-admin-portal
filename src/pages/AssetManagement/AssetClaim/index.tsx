/**
 * 領用管理（物資管理 - 領用借用）
 *
 * 同一路由內視圖切換：領用單列表 ⇄ 領用登記表單
 * 長期配給入口，台賬列表已移除行內「領用」操作，統一由此菜單進入
 */
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import ClaimList from './ClaimList'
import ClaimForm from './ClaimForm'

type View = { mode: 'list' } | { mode: 'form' }

export default function AssetClaim() {
  const navigate = useNavigate()
  const [view, setView] = useState<View>({ mode: 'list' })

  return (
    <div className="content-area">
      {view.mode === 'list' ? (
        <ClaimList
          onAdd={() => setView({ mode: 'form' })}
          onViewAsset={(assetNo) => navigate(`/asset-list?assetNo=${encodeURIComponent(assetNo)}`)}
        />
      ) : (
        <ClaimForm onBack={() => setView({ mode: 'list' })} />
      )}
    </div>
  )
}
