/**
 * 驗收入庫（物資管理 - 採購入庫）
 *
 * 同一路由內視圖切換：列表 ⇄ 批量入庫表單 ⇄ 詳情
 * 支持 URL ?poId= 直接進入指定訂單的入庫表單（由採購訂單「驗收入庫」跳轉）
 */
import { useState, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import InboundList from './InboundList'
import InboundForm from './InboundForm'
import InboundDetail from './InboundDetail'

type View = { mode: 'list' } | { mode: 'form'; poId?: number } | { mode: 'detail'; batchId: number }

export default function AssetInbound() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const urlPoId = searchParams.get('poId') ? Number(searchParams.get('poId')) : null
  const [view, setView] = useState<View>(urlPoId ? { mode: 'form', poId: urlPoId } : { mode: 'list' })

  // 外部跳轉帶入 poId 時同步打開入庫表單
  useEffect(() => {
    if (urlPoId) setView({ mode: 'form', poId: urlPoId })
  }, [urlPoId])

  const backToList = () => {
    setView({ mode: 'list' })
    navigate('/asset-inbound', { replace: true })
  }

  return (
    <div className="content-area">
      {view.mode === 'list' ? (
        <InboundList
          onAdd={(poId) => setView({ mode: 'form', poId })}
          onDetail={(batchId) => setView({ mode: 'detail', batchId })}
        />
      ) : view.mode === 'detail' ? (
        <InboundDetail batchId={view.batchId} onBack={backToList} />
      ) : (
        <InboundForm key={view.poId ?? 'new'} poId={view.poId} onBack={backToList} />
      )}
    </div>
  )
}
