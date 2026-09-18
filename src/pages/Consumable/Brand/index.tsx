/**
 * 耗材品牌管理（物資管理 - 耗材管理 - 基礎配置）
 *
 * 完全对齐资产品牌产品（AssetModel/index.tsx）的视图路由模式：
 * 同一路由内视图切换：列表（左树右表）⇄ 新增/编辑独立表单页 ⇄ 详情页
 *
 * 独立于资产品牌（biz_eam_brand），含 categoryType 标记 ASSET/CONSUMABLE/BOTH
 * 编码规则：CB 前缀（CB01, CB02, CB03 ...）
 */
import { useState } from 'react'
import BrandList from './BrandList'
import BrandForm from './BrandForm'
import BrandDetail from './BrandDetail'

type View =
  | { mode: 'list' }
  | { mode: 'form'; id?: number }
  | { mode: 'detail'; id: number }

export default function ConsumableBrand() {
  const [view, setView] = useState<View>({ mode: 'list' })

  return (
    <div className="content-area">
      {view.mode === 'list' ? (
        <BrandList
          onAdd={() => setView({ mode: 'form' })}
          onEdit={(id) => setView({ mode: 'form', id })}
          onView={(id) => setView({ mode: 'detail', id })}
        />
      ) : view.mode === 'detail' ? (
        <BrandDetail
          key={`detail-${view.id}`}
          id={view.id}
          onBack={() => setView({ mode: 'list' })}
          onEdit={(id) => setView({ mode: 'form', id })}
        />
      ) : (
        <BrandForm
          key={view.id ?? 'new'}
          id={view.id}
          onBack={() => setView({ mode: 'list' })}
        />
      )}
    </div>
  )
}
