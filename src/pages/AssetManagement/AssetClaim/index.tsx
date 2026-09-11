/**
 * 领用管理（物资管理 - 领用管理）
 *
 * 同一路由内视图切换：
 *   list   → 员工维度汇总列表（ClaimList）
 *   detail → 员工资产详情页（EmployeeAssetDetail）
 *   form   → 领用登记表单（ClaimForm）
 *
 * 此菜单仅做领用操作，归还操作统一在「归还管理」菜单处理
 */
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import ClaimList from './ClaimList'
import ClaimForm from './ClaimForm'
import EmployeeAssetDetail from './EmployeeAssetDetail'

type View =
  | { mode: 'list' }
  | { mode: 'detail'; claimant: string }
  | { mode: 'form'; fromDetail?: boolean }

export default function AssetClaim() {
  const navigate = useNavigate()
  const [view, setView] = useState<View>({ mode: 'list' })

  /* ----- 列表 → 员工详情 ----- */
  const handleManage = (claimant: string) => {
    setView({ mode: 'detail', claimant })
  }

  /* ----- 列表/详情 → 新增领用 ----- */
  const handleAdd = () => {
    setView({ mode: 'form', fromDetail: view.mode === 'detail' })
  }

  /* ----- 表单返回 ----- */
  const handleFormBack = () => {
    if (view.mode === 'form' && view.fromDetail) {
      // 从详情页进入的，回到详情页（需要保留 claimant）
      // 由于 form 状态没有 claimant，简单处理：回到列表
      setView({ mode: 'list' })
    } else {
      setView({ mode: 'list' })
    }
  }

  return (
    <div className="content-area">
      {view.mode === 'list' && (
        <ClaimList
          onAdd={() => setView({ mode: 'form' })}
          onManage={handleManage}
        />
      )}

      {view.mode === 'detail' && (
        <EmployeeAssetDetail
          claimant={view.claimant}
          onBack={() => setView({ mode: 'list' })}
          onAddClaim={handleAdd}
          onViewAsset={(assetNo) => navigate(`/asset-list?assetNo=${encodeURIComponent(assetNo)}`)}
        />
      )}

      {view.mode === 'form' && (
        <ClaimForm onBack={handleFormBack} />
      )}
    </div>
  )
}
