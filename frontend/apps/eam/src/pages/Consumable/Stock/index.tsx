/**
 * 耗材库存（物資管理 - 耗材管理）
 *
 * 视图切换：库存列表 ⇄ 手工入库独立页
 * 库存按「耗材 × 仓库」维度展示，行内查看出入库流水（只读抽屉）
 */
import { useState } from 'react'
import StockList from './StockList'
import InboundForm from '../components/InboundForm'

type View =
  | { mode: 'list' }
  | { mode: 'inbound'; itemId?: number }

export default function ConsumableStock() {
  const [view, setView] = useState<View>({ mode: 'list' })

  return (
    <div className="content-area">
      {view.mode === 'list' ? (
        <StockList onInbound={(itemId) => setView({ mode: 'inbound', itemId })} />
      ) : (
        <InboundForm
          key={view.itemId ?? 'new'}
          presetItemId={view.itemId}
          onBack={() => setView({ mode: 'list' })}
        />
      )}
    </div>
  )
}
