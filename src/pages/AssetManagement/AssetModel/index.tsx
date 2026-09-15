/**
 * 品牌产品维护（物资管理 - 基础数据）
 *
 * 同一路由内视图切换：列表 ⇄ 品牌详情  产品详情 ⇄ 品牌表单  产品表单
 */
import { useState } from 'react'
import ModelList from './ModelList'
import ModelForm from './ModelForm'
import ModelDetail from './ModelDetail'
import AccessoryConfig from './AccessoryConfig'

type View =
  | { mode: 'list' }
  | { mode: 'accessoryConfig'; categoryCode: string; categoryName: string }
  | { mode: 'brandDetail'; id: number }
  | { mode: 'productDetail'; id: number }
  | { mode: 'brandForm'; id?: number; categoryCode?: string }
  | { mode: 'productForm'; id?: number; categoryCode?: string; brandId?: number }

export default function AssetModel() {
  const [view, setView] = useState<View>({ mode: 'list' })

  return (
    <div className="content-area">
      {view.mode === 'list' ? (
        <ModelList
          onAddBrand={(categoryCode) => setView({ mode: 'brandForm', categoryCode })}
          onAddProduct={(categoryCode, brandId) => setView({ mode: 'productForm', categoryCode, brandId })}
          onEditBrand={(id) => setView({ mode: 'brandForm', id })}
          onEditProduct={(id) => setView({ mode: 'productForm', id })}
          onDetailBrand={(id) => setView({ mode: 'brandDetail', id })}
          onDetailProduct={(id) => setView({ mode: 'productDetail', id })}
          onAccessoryConfig={(categoryCode, categoryName) => setView({ mode: 'accessoryConfig', categoryCode, categoryName })}
        />
      ) : view.mode === 'accessoryConfig' ? (
        <AccessoryConfig
          key={view.categoryCode}
          categoryCode={view.categoryCode}
          categoryName={view.categoryName}
          onBack={() => setView({ mode: 'list' })}
        />
      ) : view.mode === 'brandDetail' ? (
        <ModelDetail
          key={`brand-detail-${view.id}`}
          id={view.id}
          type="brand"
          onBack={() => setView({ mode: 'list' })}
          onEdit={(id) => setView({ mode: 'brandForm', id })}
        />
      ) : view.mode === 'productDetail' ? (
        <ModelDetail
          key={`product-detail-${view.id}`}
          id={view.id}
          type="product"
          onBack={() => setView({ mode: 'list' })}
          onEdit={(id) => setView({ mode: 'productForm', id })}
        />
      ) : view.mode === 'brandForm' ? (
        <ModelForm
          key={view.id ?? 'new-brand'}
          id={view.id}
          categoryCode={view.categoryCode}
          type="brand"
          onBack={() => setView({ mode: 'list' })}
        />
      ) : (
        <ModelForm
          key={view.id ?? 'new-product'}
          id={view.id}
          categoryCode={view.categoryCode}
          brandId={view.brandId}
          type="product"
          onBack={() => setView({ mode: 'list' })}
        />
      )}
    </div>
  )
}
