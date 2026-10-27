/**
 * 资产盘点（物資管理）
 *
 * 同一路由内三视图切换：任務列表 ⇄ 發起盤點 ⇄ 盤點詳情/執行
 * - /asset-inventory            列表
 * - /asset-inventory?create=1   发起盘点
 * - /asset-inventory?id={id}    详情/执行
 */
import { useState, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import InventoryList from './InventoryList'
import InventoryCreate from './InventoryCreate'
import InventoryDetail from './InventoryDetail'

type View =
  | { mode: 'list' }
  | { mode: 'create' }
  | { mode: 'detail'; taskId: number }

export default function AssetInventory() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const urlId = searchParams.get('id') ? Number(searchParams.get('id')) : null
  const urlCreate = searchParams.get('create') === '1'

  const [view, setView] = useState<View>(() => {
    if (urlCreate) return { mode: 'create' }
    if (urlId) return { mode: 'detail', taskId: urlId }
    return { mode: 'list' }
  })

  useEffect(() => {
    if (urlId) setView({ mode: 'detail', taskId: urlId })
    else if (urlCreate) setView({ mode: 'create' })
    else setView({ mode: 'list' })
  }, [urlId, urlCreate])

  const goList = () => { navigate('/asset-inventory', { replace: true }); setView({ mode: 'list' }) }
  const goCreate = () => { navigate('/asset-inventory?create=1'); setView({ mode: 'create' }) }
  const goDetail = (taskId: number) => { navigate(`/asset-inventory?id=${taskId}`); setView({ mode: 'detail', taskId }) }

  if (view.mode === 'create') {
    return (
      <div className="content-area">
        <InventoryCreate onBack={goList} onCreated={goDetail} />
      </div>
    )
  }
  if (view.mode === 'detail') {
    return (
      <div className="content-area">
        <InventoryDetail taskId={view.taskId} onBack={goList} />
      </div>
    )
  }
  return (
    <div className="content-area">
      <InventoryList onCreate={goCreate} onOpen={goDetail} />
    </div>
  )
}
