/**
 * 耗材分类管理（物資管理 - 耗材管理 - 基礎配置）
 *
 * 完全对齐资产分类（AssetCategory/index.tsx）的视图路由模式：
 * 同一路由内视图切换：列表（树形）⇄ 新增/编辑独立表单页 ⇄ 详情页
 *
 * 独立于资产分类（biz_eam_category），耗材档案从本模块获取分类数据源
 * 编码规则：HC 前缀（HC01, HC01-01, HC01-01-01）
 */
import { useState } from 'react'
import CategoryList from './CategoryList'
import CategoryForm from './CategoryForm'
import CategoryDetail from './CategoryDetail'

type View =
  | { mode: 'list' }
  | { mode: 'form'; id?: number; parentId?: number }
  | { mode: 'detail'; id: number }

export default function ConsumableCategory() {
  const [view, setView] = useState<View>({ mode: 'list' })

  return (
    <div className="content-area">
      {view.mode === 'list' ? (
        <CategoryList
          onAdd={(parentId) => setView({ mode: 'form', parentId })}
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
          key={view.id ?? `new-${view.parentId ?? 0}`}
          id={view.id}
          parentId={view.parentId}
          onBack={() => setView({ mode: 'list' })}
        />
      )}
    </div>
  )
}
