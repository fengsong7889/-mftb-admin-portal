/**
 * 參數庫管理（物資管理 - 基礎數據）
 *
 * 同一路由，視圖切換：列表 ⇄ 新增/編輯獨立表單頁
 * 左側分類樹 + 右側參數類型列表 + 下方參數值管理
 */
import { useState } from 'react'
import ParamLibraryList from './ParamLibraryList'
import ParamTypeForm from './ParamTypeForm'

type View =
  | { mode: 'list' }
  | { mode: 'form'; id?: number; defaultCategoryCode?: string }

/** 参数库管理页面入口 */
export default function ParamLibrary() {
  const [view, setView] = useState<View>({ mode: 'list' })

  return (
    <div className="content-area">
      {view.mode === 'list' ? (
        <ParamLibraryList
          onAddType={(categoryCode) => setView({ mode: 'form', defaultCategoryCode: categoryCode })}
          onEditType={(id) => setView({ mode: 'form', id })}
        />
      ) : (
        <ParamTypeForm
          key={view.id ?? `new-${view.defaultCategoryCode ?? 'all'}`}
          id={view.id}
          defaultCategoryCode={view.defaultCategoryCode}
          onBack={() => setView({ mode: 'list' })}
        />
      )}
    </div>
  )
}
