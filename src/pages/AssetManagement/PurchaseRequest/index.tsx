/**
 * 採購申請（物資管理 - 採購入庫）
 *
 * 同一路由內視圖切換：列表 ⇄ 新增/編輯表單 ⇄ 詳情（含審批）
 * 審批通過後自動生成採購訂單，可跳轉至「採購訂單」菜單繼續驗收入庫
 */
import { useState, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import RequestList from './RequestList'
import RequestForm from './RequestForm'
import RequestDetail from './RequestDetail'

type View =
  | { mode: 'list' }
  | { mode: 'form'; id?: number }
  | { mode: 'detail'; id: number }

export default function PurchaseRequest() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const urlId = searchParams.get('id') ? Number(searchParams.get('id')) : null
  const [view, setView] = useState<View>(urlId ? { mode: 'detail', id: urlId } : { mode: 'list' })

  // 外部跳轉（如採購訂單詳情）帶入 id 時同步打開詳情
  useEffect(() => {
    if (urlId) setView({ mode: 'detail', id: urlId })
  }, [urlId])

  return (
    <div className="content-area">
      {view.mode === 'list' && (
        <RequestList
          onAdd={() => setView({ mode: 'form' })}
          onEdit={(id) => setView({ mode: 'form', id })}
          onDetail={(id) => setView({ mode: 'detail', id })}
        />
      )}
      {view.mode === 'form' && (
        <RequestForm
          key={view.id ?? 'new'}
          id={view.id}
          onBack={() => setView({ mode: 'list' })}
        />
      )}
      {view.mode === 'detail' && (
        <RequestDetail
          key={view.id}
          id={view.id}
          onBack={() => {
            setView({ mode: 'list' })
            navigate('/asset-purchase-req', { replace: true })
          }}
          onViewOrder={(orderId) => navigate(`/asset-purchase-order?id=${orderId}`)}
        />
      )}
    </div>
  )
}
