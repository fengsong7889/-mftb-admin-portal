/**
 * 借用管理（物資管理 - 領用借用）
 *
 * 同一路由內視圖切換：列表 ⇄ 借用登記 ⇄ 詳情 ⇄ 續借
 * 歸還操作跳轉「歸還管理」並帶入借用單號（?borrowId=），保持入口唯一
 */
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import BorrowList from './BorrowList'
import BorrowForm from './BorrowForm'
import BorrowDetail from './BorrowDetail'
import BorrowRenew from './BorrowRenew'

type View =
  | { mode: 'list' }
  | { mode: 'form' }
  | { mode: 'detail'; id: number }
  | { mode: 'renew'; id: number }

export default function AssetBorrow() {
  const navigate = useNavigate()
  const [view, setView] = useState<View>({ mode: 'list' })

  const toAsset = (assetNo: string) => navigate(`/asset-list?assetNo=${encodeURIComponent(assetNo)}`)
  const toReturn = (borrowId: number) => navigate(`/asset-return?borrowId=${borrowId}`)

  return (
    <div className="content-area">
      {view.mode === 'list' && (
        <BorrowList
          onAdd={() => setView({ mode: 'form' })}
          onDetail={(id) => setView({ mode: 'detail', id })}
          onRenew={(id) => setView({ mode: 'renew', id })}
          onReturn={toReturn}
          onViewAsset={toAsset}
        />
      )}
      {view.mode === 'form' && (
        <BorrowForm onBack={() => setView({ mode: 'list' })} />
      )}
      {view.mode === 'detail' && (
        <BorrowDetail
          key={view.id}
          id={view.id}
          onBack={() => setView({ mode: 'list' })}
          onRenew={(id) => setView({ mode: 'renew', id })}
          onReturn={toReturn}
          onViewAsset={toAsset}
        />
      )}
      {view.mode === 'renew' && (
        <BorrowRenew
          key={view.id}
          id={view.id}
          onBack={() => setView({ mode: 'detail', id: view.id })}
        />
      )}
    </div>
  )
}
