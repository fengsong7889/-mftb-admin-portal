/**
 * 交接管理（物資管理 - 調撥交接）
 *
 * 同一路由內視圖切換：交接記錄列表 ⇄ 交接登記表單
 * 交接為批量操作：選離職員工 → 勾選名下資產 → 接收人 → 批量變更使用人
 */
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import HandoverList from './HandoverList'
import HandoverForm from './HandoverForm'

type View = { mode: 'list' } | { mode: 'form' }

export default function AssetHandover() {
  const navigate = useNavigate()
  const [view, setView] = useState<View>({ mode: 'list' })

  return (
    <div className="content-area">
      {view.mode === 'list' ? (
        <HandoverList
          onAdd={() => setView({ mode: 'form' })}
          onViewAsset={(assetNo) => navigate(`/asset-list?assetNo=${encodeURIComponent(assetNo)}`)}
        />
      ) : (
        <HandoverForm onBack={() => setView({ mode: 'list' })} />
      )}
    </div>
  )
}
