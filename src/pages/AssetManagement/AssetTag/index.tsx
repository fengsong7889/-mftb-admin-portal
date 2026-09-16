/**
 * 資產標籤配置（物資管理 - 基礎配置）
 *
 * 同一路由內視圖切換：列表 ⇄ 新增/編輯表單頁 ⇄ 只讀詳情頁
 * 業務人員為資產貼上自定義標籤模板，配置標籤展示哪些資產字段及樣式。
 */
import { useState } from 'react'
import AssetTagList from './AssetTagList'
import AssetTagForm from './AssetTagForm'
import AssetTagDetail from './AssetTagDetail'

type View =
  | { mode: 'list' }
  | { mode: 'form'; id?: number }
  | { mode: 'detail'; id: number }

export default function AssetTag() {
  const [view, setView] = useState<View>({ mode: 'list' })

  return (
    <div className="content-area">
      {view.mode === 'list' && (
        <AssetTagList
          onAdd={() => setView({ mode: 'form' })}
          onEdit={(id) => setView({ mode: 'form', id })}
          onDetail={(id) => setView({ mode: 'detail', id })}
        />
      )}
      {view.mode === 'form' && (
        <AssetTagForm
          key={view.id ?? 'new'}
          id={view.id}
          onBack={() => setView({ mode: 'list' })}
        />
      )}
      {view.mode === 'detail' && (
        <AssetTagDetail
          key={view.id}
          id={view.id}
          onBack={() => setView({ mode: 'list' })}
        />
      )}
    </div>
  )
}
