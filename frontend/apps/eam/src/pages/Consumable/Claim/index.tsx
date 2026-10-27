/**
 * 耗材领用（物資管理 - 耗材管理）
 *
 * 视图切换：列表（含状态 Tab）⇄ 领用申请独立页 ⇄ 领用详情独立页（审批/出库）
 * 业务流程：申请（占用库存）→ 审批（通过/驳回）→ 出库核销（扣减库存，无归还）
 */
import { useState } from 'react'
import ClaimList from './ClaimList'
import ClaimForm from './ClaimForm'
import ClaimDetail from './ClaimDetail'

type View =
  | { mode: 'list' }
  | { mode: 'form' }
  | { mode: 'detail'; id: number }

export default function ConsumableClaim() {
  const [view, setView] = useState<View>({ mode: 'list' })

  return (
    <div className="content-area">
      {view.mode === 'list' ? (
        <ClaimList
          onAdd={() => setView({ mode: 'form' })}
          onDetail={(id) => setView({ mode: 'detail', id })}
        />
      ) : view.mode === 'form' ? (
        <ClaimForm onBack={() => setView({ mode: 'list' })} />
      ) : (
        <ClaimDetail key={view.id} id={view.id} onBack={() => setView({ mode: 'list' })} />
      )}
    </div>
  )
}
