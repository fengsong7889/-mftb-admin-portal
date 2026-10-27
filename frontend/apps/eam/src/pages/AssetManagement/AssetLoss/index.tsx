/**
 * 遺失資產（物資管理）
 *
 * 同一路由內視圖切換：遺失單列表 ⇄ 新建報失 ⇄ 遺失單詳情
 * 支持 URL ?id= 直接進入指定遺失單詳情
 * 支持 URL ?create=1 直接進入新建報失頁
 * 支持 URL ?followUp=1 進入詳情並自動打開跟進彈窗
 */
import { useState, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import LossList from './LossList'
import LossDetail from './LossDetail'
import LossCreate from './LossCreate'

type View =
  | { mode: 'list' }
  | { mode: 'create' }
  | { mode: 'detail'; lossId: number; followUp?: boolean }

export default function AssetLoss() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const urlId = searchParams.get('id') ? Number(searchParams.get('id')) : null
  const urlCreate = searchParams.get('create') === '1'
  const urlFollowUp = searchParams.get('followUp') === '1'
  const [view, setView] = useState<View>(
    urlCreate ? { mode: 'create' }
      : urlId ? { mode: 'detail', lossId: urlId, followUp: urlFollowUp }
        : { mode: 'list' },
  )

  // 視圖完全由 URL 驅動：無 id/create 時回列表（修復點側欄菜單卡在詳情）
  useEffect(() => {
    if (urlCreate) setView({ mode: 'create' })
    else if (urlId) setView({ mode: 'detail', lossId: urlId, followUp: urlFollowUp })
    else setView({ mode: 'list' })
  }, [urlId, urlCreate, urlFollowUp])

  const backToList = () => {
    setView({ mode: 'list' })
    navigate('/asset-loss', { replace: true })
  }

  return (
    <div className="content-area">
      {view.mode === 'list' ? (
        <LossList
          onViewDetail={(lossId) => {
            setView({ mode: 'detail', lossId })
            navigate(`/asset-loss?id=${lossId}`, { replace: true })
          }}
          onFollowUp={(lossId) => {
            setView({ mode: 'detail', lossId, followUp: true })
            navigate(`/asset-loss?id=${lossId}&followUp=1`, { replace: true })
          }}
          onCreate={() => {
            setView({ mode: 'create' })
            navigate('/asset-loss?create=1', { replace: true })
          }}
        />
      ) : view.mode === 'create' ? (
        <LossCreate
          onBack={backToList}
          onCreated={(lossId) => {
            setView({ mode: 'detail', lossId })
            navigate(`/asset-loss?id=${lossId}`, { replace: true })
          }}
        />
      ) : (
        <LossDetail
          key={view.lossId}
          lossId={view.lossId}
          followUp={view.followUp}
          onBack={backToList}
        />
      )}
    </div>
  )
}
