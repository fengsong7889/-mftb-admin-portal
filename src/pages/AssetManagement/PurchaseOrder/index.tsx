/**
 * 採購執行（物資管理 - 採購入庫）
 *
 * 同一路由內視圖切換：列表 ⇄ 詳情 ⇄ 編輯
 * 支持 URL ?id= 直接打開指定訂單（由採購申請審批通過後跳轉）
 */
import { useState, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import OrderList from './OrderList'
import OrderDetail from './OrderDetail'
import OrderEdit from './OrderEdit'

type View =
  | { mode: 'list' }
  | { mode: 'detail'; id: number }
  | { mode: 'edit'; id: number }

export default function PurchaseOrder() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const urlId = searchParams.get('id') ? Number(searchParams.get('id')) : null
  const [view, setView] = useState<View>(urlId ? { mode: 'detail', id: urlId } : { mode: 'list' })

  useEffect(() => {
    if (urlId) setView({ mode: 'detail', id: urlId })
  }, [urlId])

  const goList = () => { setView({ mode: 'list' }); navigate('/purchase-order', { replace: true }) }

  return (
    <div className="content-area">
      {view.mode === 'list' ? (
        <OrderList
          onDetail={(id) => setView({ mode: 'detail', id })}
          onEdit={(id) => setView({ mode: 'edit', id })}
          onInbound={(poId) => navigate(`/asset-inbound?poId=${poId}`)}
        />
      ) : view.mode === 'detail' ? (
        <OrderDetail
          key={view.id}
          id={view.id}
          onBack={goList}
          onEdit={(id) => setView({ mode: 'edit', id })}
          onInbound={(poId) => navigate(`/asset-inbound?poId=${poId}`)}
          onViewRequest={(reqId) => navigate(`/oa-requests`)}
        />
      ) : (
        <OrderEdit
          key={view.id}
          id={view.id}
          onBack={goList}
          onSaved={() => setView({ mode: 'detail', id: view.id })}
        />
      )}
    </div>
  )
}
