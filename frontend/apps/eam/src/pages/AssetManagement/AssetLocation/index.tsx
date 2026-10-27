/**
 * 仓库维护（物資管理 - 基礎數據）
 *
 * 同一路由內視圖切換：列表 ⇄ 詳情 ⇄ 新增/編輯獨立表單頁
 * 按省-市-区-详细地址维度管理仓库位置（无层级关系）
 */
import { useState } from 'react'
import LocationList from './LocationList'
import LocationForm from './LocationForm'
import LocationDetail from './LocationDetail'

type View =
  | { mode: 'list' }
  | { mode: 'detail'; id: number }
  | { mode: 'form'; id?: number }

export default function AssetLocation() {
  const [view, setView] = useState<View>({ mode: 'list' })

  return (
    <div className="content-area">
      {view.mode === 'list' ? (
        <LocationList
          onAdd={() => setView({ mode: 'form' })}
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
          key={view.id ?? 'new'}
          id={view.id}
          onBack={() => setView({ mode: 'list' })}
        />
      )}
    </div>
  )
}
