/**
 * 歸還管理（物資管理 - 領用借用）
 *
 * 同一路由內視圖切換：歸還記錄列表 ⇄ 歸還登記表單
 * 支持 URL ?borrowId= 直接進入借用歸還（由借用管理「歸還」跳轉）
 * 狀況為損壞/遺失時聯動跳轉「損壞賠付」登記頁
 */
import { useState, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import ReturnList from './ReturnList'
import ReturnForm from './ReturnForm'
import type { ReturnRecord } from '../../../api/eam'

type View = { mode: 'list' } | { mode: 'form'; borrowId?: number }

export default function AssetReturn() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const urlBorrowId = searchParams.get('borrowId') ? Number(searchParams.get('borrowId')) : null
  const [view, setView] = useState<View>(
    urlBorrowId ? { mode: 'form', borrowId: urlBorrowId } : { mode: 'list' },
  )

  // 外部跳轉帶入 borrowId 時同步打開歸還登記
  useEffect(() => {
    if (urlBorrowId) setView({ mode: 'form', borrowId: urlBorrowId })
  }, [urlBorrowId])

  const backToList = () => {
    setView({ mode: 'list' })
    navigate('/asset-return', { replace: true })
  }

  /** 跳轉賠付登記：帶入歸還單、資產與損失類型（遺失→loss，損壞→damage） */
  const toCompensation = (record: ReturnRecord) => {
    const damageType = record.condition === 'lost' ? 'loss' : 'damage'
    navigate(`/asset-compensation?returnId=${record.id}&assetId=${record.assetId}&damageType=${damageType}`)
  }

  return (
    <div className="content-area">
      {view.mode === 'list' ? (
        <ReturnList
          onAdd={() => setView({ mode: 'form' })}
          onViewAsset={(assetNo) => navigate(`/asset-list?assetNo=${encodeURIComponent(assetNo)}`)}
          onViewComp={(compId) => navigate(`/asset-compensation?id=${compId}`)}
          onCreateComp={toCompensation}
        />
      ) : (
        <ReturnForm
          key={view.borrowId ?? 'new'}
          borrowId={view.borrowId}
          onBack={backToList}
          onGoCompensation={toCompensation}
        />
      )}
    </div>
  )
}
