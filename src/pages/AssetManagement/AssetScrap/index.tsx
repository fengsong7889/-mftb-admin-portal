/**
 * 資產報廢管理
 *
 * 視圖切換：報廢記錄列表 ⇄ 報廢詳情 ⇄ 新增報廢表單
 * 支持 URL ?id= 直接進入指定資產的報廢表單（由資產台賬「報廢」跳轉）
 * 支持 URL ?create=1 進入新建報廢頁（Select 下拉選資產）
 * 支持 URL ?detail={scrapId} 進入報廢詳情頁
 */
import { useState, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import ScrapList from './ScrapList'
import ScrapForm from './ScrapForm'
import ScrapDetail from './ScrapDetail'

type View =
  | { mode: 'list' }
  | { mode: 'detail'; scrapId: number }
  | { mode: 'create' }
  | { mode: 'form'; assetId: number }

export default function AssetScrap() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const urlCreate = searchParams.get('create') === '1'
  const urlDetailId = searchParams.get('detail') ? Number(searchParams.get('detail')) : null
  const urlAssetId = searchParams.get('id') || searchParams.get('assetId')
    ? Number(searchParams.get('id') || searchParams.get('assetId'))
    : null
  const [view, setView] = useState<View>(
    urlCreate ? { mode: 'create' }
    : urlDetailId ? { mode: 'detail', scrapId: urlDetailId }
    : urlAssetId ? { mode: 'form', assetId: urlAssetId }
    : { mode: 'list' },
  )

  // 視圖完全由 URL 驅動：無任何參數時回列表（修復點側欄菜單卡在詳情/新建）
  useEffect(() => {
    if (urlCreate) setView({ mode: 'create' })
    else if (urlDetailId) setView({ mode: 'detail', scrapId: urlDetailId })
    else if (urlAssetId) setView({ mode: 'form', assetId: urlAssetId })
    else setView({ mode: 'list' })
  }, [urlCreate, urlDetailId, urlAssetId])

  const goList = () => { setView({ mode: 'list' }); navigate('/asset-scrap', { replace: true }) }
  const goCreate = () => { setView({ mode: 'create' }); navigate('/asset-scrap?create=1', { replace: true }) }
  const goDetail = (scrapId: number) => { setView({ mode: 'detail', scrapId }); navigate(`/asset-scrap?detail=${scrapId}`, { replace: true }) }

  return (
    <div className="content-area">
      {view.mode === 'list' ? (
        <ScrapList
          onCreate={goCreate}
          onViewDetail={goDetail}
        />
      ) : view.mode === 'detail' ? (
        <ScrapDetail
          key={view.scrapId}
          scrapId={view.scrapId}
          onBack={goList}
          onDeleted={goList}
        />
      ) : view.mode === 'create' ? (
        <ScrapForm
          onBack={goList}
          onCreated={goList}
        />
      ) : (
        <ScrapForm
          key={view.assetId}
          assetId={view.assetId}
          onBack={goList}
        />
      )}
    </div>
  )
}
