/**
 * 品牌型號庫（物資管理 - 基礎數據）
 *
 * 同一路由內視圖切換：列表 ⇄ 詳情（只讀） ⇄ 新增/編輯表單頁
 */
import { useState } from 'react'
import ModelList from './ModelList'
import ModelForm from './ModelForm'
import ModelDetail from './ModelDetail'

type View =
  | { mode: 'list' }
  | { mode: 'detail'; id: number }
  | { mode: 'form'; id?: number }

export default function AssetModel() {
  const [view, setView] = useState<View>({ mode: 'list' })

  return (
    <div className="content-area">
      {view.mode === 'list' ? (
        <ModelList
          onAdd={() => setView({ mode: 'form' })}
          onEdit={(id) => setView({ mode: 'form', id })}
          onDetail={(id) => setView({ mode: 'detail', id })}
        />
      ) : view.mode === 'detail' ? (
        <ModelDetail
          key={`detail-${view.id}`}
          id={view.id}
          onBack={() => setView({ mode: 'list' })}
          onEdit={(id) => setView({ mode: 'form', id })}
        />
      ) : (
        <ModelForm
          key={view.id ?? 'new'}
          id={view.id}
          onBack={() => setView({ mode: 'list' })}
        />
      )}
    </div>
  )
}
