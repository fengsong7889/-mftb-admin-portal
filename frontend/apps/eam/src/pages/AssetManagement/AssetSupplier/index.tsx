/**
 * 供應商管理（物資管理 - 二級直達菜單）
 *
 * 同一路由內視圖切換：列表 ⇄ 詳情 ⇄ 新增/編輯獨立表單頁
 * 管理採購入庫的供貨方基礎數據（編碼/名稱/聯繫人/銀行信息），支持啟用-停用
 */
import { useState } from 'react'
import SupplierList from './SupplierList'
import SupplierForm from './SupplierForm'
import SupplierDetail from './SupplierDetail'

type View =
  | { mode: 'list' }
  | { mode: 'detail'; id: number }
  | { mode: 'form'; id?: number }

export default function AssetSupplier() {
  const [view, setView] = useState<View>({ mode: 'list' })

  return (
    <div className="content-area">
      {view.mode === 'list' ? (
        <SupplierList
          onAdd={() => setView({ mode: 'form' })}
          onEdit={(id) => setView({ mode: 'form', id })}
          onView={(id) => setView({ mode: 'detail', id })}
        />
      ) : view.mode === 'detail' ? (
        <SupplierDetail
          key={`detail-${view.id}`}
          id={view.id}
          onBack={() => setView({ mode: 'list' })}
          onEdit={(id) => setView({ mode: 'form', id })}
        />
      ) : (
        <SupplierForm
          key={view.id ?? 'new'}
          id={view.id}
          onBack={() => setView({ mode: 'list' })}
        />
      )}
    </div>
  )
}
