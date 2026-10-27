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
import OrderAdd from './OrderAdd'

type View =
  | { mode: 'list' }
  | { mode: 'detail'; id: number }
  | { mode: 'edit'; id: number }
  | { mode: 'add' }

export default function PurchaseOrder() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const urlId = searchParams.get('id') ? Number(searchParams.get('id')) : null
  const urlMode = searchParams.get('mode')
  const [view, setView] = useState<View>(
    urlMode === 'add' ? { mode: 'add' } : urlId ? { mode: 'detail', id: urlId } : { mode: 'list' }
  )

  useEffect(() => {
    if (urlMode === 'add') setView({ mode: 'add' })
    else if (urlMode === 'edit' && urlId) setView({ mode: 'edit', id: urlId })
    else if (urlId) setView({ mode: 'detail', id: urlId })
    else setView({ mode: 'list' })
  }, [urlId, urlMode])

  const goList = () => { setView({ mode: 'list' }); navigate('/purchase-order', { replace: true }) }

  return (
    <div className="content-area">
      {view.mode === 'list' ? (
        <OrderList
          onDetail={(id) => { setView({ mode: 'detail', id }); navigate(`/purchase-order?id=${id}`, { replace: true }) }}
          onEdit={(id) => { setView({ mode: 'edit', id }); navigate(`/purchase-order?mode=edit&id=${id}`, { replace: true }) }}
          onInbound={(poId) => navigate(`/asset-inbound?poId=${poId}`)}
        />
      ) : view.mode === 'detail' ? (
        <OrderDetail
          key={view.id}
          id={view.id}
          onBack={goList}
          onEdit={(id) => { setView({ mode: 'edit', id }); navigate(`/purchase-order?mode=edit&id=${id}`, { replace: true }) }}
          onInbound={(poId) => navigate(`/asset-inbound?poId=${poId}`)}
          onViewRequest={(reqId) => navigate(`/oa-requests`)}
        />
      ) : view.mode === 'add' ? (
        <OrderAdd />
      ) : (
        <OrderEdit
          key={view.id}
          id={view.id}
          onBack={goList}
          onSaved={() => { setView({ mode: 'detail', id: view.id }); navigate(`/purchase-order?id=${view.id}`, { replace: true }) }}
        />
      )}
    </div>
  )
}
