/**
 * 仓库维护（物資管理 - 基礎數據）
 *
 * 同一路由內視圖切換：樹形列表 ⇄ 詳情 ⇄ 新增/編輯獨立表單頁
 * 位置樹（倉庫/樓層/辦公室）供批量入庫與資產台賬選用
 */
import { useState } from 'react'
import LocationList from './LocationList'
import LocationForm from './LocationForm'
import LocationDetail from './LocationDetail'

type View =
  | { mode: 'list' }
  | { mode: 'detail'; id: number }
  | { mode: 'form'; id?: number; parentId?: number }

export default function AssetLocation() {
  const [view, setView] = useState<View>({ mode: 'list' })

  return (
    <div className="content-area">
      {view.mode === 'list' ? (
        <LocationList
          onAdd={(parentId) => setView({ mode: 'form', parentId })}
          onEdit={(id) => setView({ mode: 'form', id })}
          onView={(id) => setView({ mode: 'detail', id })}
        />
      ) : view.mode === 'detail' ? (
        <LocationDetail
          key={`detail-${view.id}`}
          id={view.id}
          onBack={() => setView({ mode: 'list' })}
          onEdit={(id) => setView({ mode: 'form', id })}
        />
      ) : (
        <LocationForm
          key={view.id ?? `new-${view.parentId ?? 0}`}
          id={view.id}
          parentId={view.parentId}
          onBack={() => setView({ mode: 'list' })}
        />
      )}
    </div>
  )
}
