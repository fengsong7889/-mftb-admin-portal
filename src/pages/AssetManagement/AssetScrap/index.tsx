/**
 * 資產報廢管理
 *
 * 視圖切換：報廢記錄列表 ⇄ 新增報廢表單
 * 支持 URL ?id= 直接進入指定資產的報廢表單（由資產台賬「報廢」跳轉）
 * 支持 URL ?create=1 進入新建報廢頁（Select 下拉選資產）
 */
import { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import ScrapList from './ScrapList'
import ScrapForm from './ScrapForm'

type View = { mode: 'list' } | { mode: 'create' } | { mode: 'form'; assetId: number }

export default function AssetScrap() {
  const [searchParams] = useSearchParams()
  const urlCreate = searchParams.get('create') === '1'
  const urlAssetId = searchParams.get('id') || searchParams.get('assetId')
    ? Number(searchParams.get('id') || searchParams.get('assetId'))
    : null
  const [view, setView] = useState<View>(
    urlCreate ? { mode: 'create' }
    : urlAssetId ? { mode: 'form', assetId: urlAssetId }
    : { mode: 'list' },
  )

  // 外部跳轉帶入 id 時同步打開報廢表單
  useEffect(() => {
    if (urlAssetId && !urlCreate) setView({ mode: 'form', assetId: urlAssetId })
  }, [urlAssetId, urlCreate])

  return (
    <div className="content-area">
      {view.mode === 'list' ? (
        <ScrapList
          onCreate={() => setView({ mode: 'create' })}
          onViewDetail={() => {
            /* 詳情頁後續擴展，暫不實現 */
          }}
        />
      ) : view.mode === 'create' ? (
        <ScrapForm
          onBack={() => setView({ mode: 'list' })}
          onCreated={() => setView({ mode: 'list' })}
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
