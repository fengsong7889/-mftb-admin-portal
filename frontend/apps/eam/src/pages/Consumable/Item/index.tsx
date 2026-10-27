/**
 * 耗材档案（物資管理 - 耗材管理）
 *
 * 同一路由内视图切换：列表 ⇄ 新增/编辑/详情独立表单页
 * 耗材按 SKU 数量型管理（区别于资产单件化台账）：编码/分类/单位/参考价/安全库存/限领量
 */
import { useState } from 'react'
import ItemList from './ItemList'
import ItemForm from './ItemForm'

type View =
  | { mode: 'list' }
  | { mode: 'form'; id?: number; readOnly?: boolean }

export default function ConsumableItem() {
  const [view, setView] = useState<View>({ mode: 'list' })

  return (
    <div className="content-area">
      {view.mode === 'list' ? (
        <ItemList
          onAdd={() => setView({ mode: 'form' })}
          onEdit={(id) => setView({ mode: 'form', id })}
          onView={(id) => setView({ mode: 'form', id, readOnly: true })}
        />
      ) : (
        <ItemForm
          key={view.id ?? 'new'}
          id={view.id}
          readOnly={view.readOnly}
          onBack={() => setView({ mode: 'list' })}
        />
      )}
    </div>
  )
}
