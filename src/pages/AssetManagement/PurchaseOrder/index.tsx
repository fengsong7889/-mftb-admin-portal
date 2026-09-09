/**
 * 採購訂單（物資管理 - 採購入庫）
 *
 * 同一路由內視圖切換：列表 ⇄ 詳情（含驗收入庫入口）
 * 支持 URL ?id= 直接打開指定訂單（由採購申請審批通過後跳轉）
 */
import { useState, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import OrderList from './OrderList'
import OrderDetail from './OrderDetail'

type View = { mode: 'list' } | { mode: 'detail'; id: number }

export default function PurchaseOrder() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const urlId = searchParams.get('id') ? Number(searchParams.get('id')) : null
  const [view, setView] = useState<View>(urlId ? { mode: 'detail', id: urlId } : { mode: 'list' })

  // 外部跳轉（如採購申請審批通過）帶入 id 時同步打開詳情
  useEffect(() => {
    if (urlId) setView({ mode: 'detail', id: urlId })
  }, [urlId])

  return (
    <div className="content-area">
      {view.mode === 'list' ? (
        <OrderList
          onDetail={(id) => setView({ mode: 'detail', id })}
          onInbound={(poId) => navigate(`/asset-inbound?poId=${poId}`)}
        />
      ) : (
        <OrderDetail
          key={view.id}
          id={view.id}
          onBack={() => { setView({ mode: 'list' }); navigate('/asset-purchase-order', { replace: true }) }}
          onInbound={(poId) => navigate(`/asset-inbound?poId=${poId}`)}
          onViewRequest={(reqId) => navigate(`/asset-purchase-req?id=${reqId}`)}
        />
      )}
    </div>
  )
}
