/**
 * 資產分類（物資管理 - 基礎數據）
 *
 * 同一路由內視圖切換：列表（樹形）⇄ 新增/編輯獨立表單頁
 * 分類維護「參數模板」，型號庫與資產台賬據此渲染動態參數表單
 */
import { useState } from 'react'
import CategoryList from './CategoryList'
import CategoryForm from './CategoryForm'
import CategoryDetail from './CategoryDetail'

type View =
  | { mode: 'list' }
  | { mode: 'form'; id?: number; parentId?: number; bizType?: string }
  | { mode: 'detail'; id: number }

export default function AssetCategory() {
  const [view, setView] = useState<View>({ mode: 'list' })

  return (
    <div className="content-area">
      {view.mode === 'list' ? (
        <CategoryList
          onAdd={(parentId, bizType) => setView({ mode: 'form', parentId, bizType })}
          onEdit={(id) => setView({ mode: 'form', id })}
          onView={(id) => setView({ mode: 'detail', id })}
        />
      ) : view.mode === 'detail' ? (
        <CategoryDetail
          key={`detail-${view.id}`}
          id={view.id}
          onBack={() => setView({ mode: 'list' })}
          onEdit={(id) => setView({ mode: 'form', id })}
        />
      ) : (
        <CategoryForm
          key={view.id ?? `new-${view.parentId ?? 0}-${view.bizType ?? 'ASSET'}`}
          id={view.id}
          parentId={view.parentId}
          bizType={view.bizType}
          onBack={() => setView({ mode: 'list' })}
        />
      )}
    </div>
  )
}
