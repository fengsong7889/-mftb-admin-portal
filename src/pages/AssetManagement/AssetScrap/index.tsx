/**
 * 資產報廢管理
 *
 * 視圖切換：報廢記錄列表 ⇄ 新增報廢表單
 * 支持 URL ?id= 直接進入指定資產的報廢表單（由資產台賬「報廢」跳轉）
 */
import { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import ScrapList from './ScrapList'
import ScrapForm from './ScrapForm'

type View = { mode: 'list' } | { mode: 'form'; assetId: number }

export default function AssetScrap() {
  const [searchParams] = useSearchParams()
  // 資產台賬跳轉用 ?id=，內部新增用 ?assetId=
  const urlAssetId = searchParams.get('id') || searchParams.get('assetId')
    ? Number(searchParams.get('id') || searchParams.get('assetId'))
    : null
  const [view, setView] = useState<View>(
    urlAssetId ? { mode: 'form', assetId: urlAssetId } : { mode: 'list' },
  )

  // 外部跳轉帶入 id 時同步打開報廢表單
  useEffect(() => {
    if (urlAssetId) setView({ mode: 'form', assetId: urlAssetId })
  }, [urlAssetId])

  return (
    <div className="content-area">
      {view.mode === 'list' ? (
        <ScrapList
          onAddScrap={(assetId) => setView({ mode: 'form', assetId })}
          onViewDetail={() => {
            /* 詳情頁後續擴展，暫不實現 */
          }}
        />
      ) : (
        <ScrapForm
          key={view.assetId}
          assetId={view.assetId}
          onBack={() => setView({ mode: 'list' })}
        />
      )}
    </div>
  )
}
