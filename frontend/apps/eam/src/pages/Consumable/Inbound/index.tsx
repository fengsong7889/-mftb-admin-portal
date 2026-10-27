/**
 * 耗材入庫（獨立菜單頁）
 *
 * 單路由多視圖：列表 ⇄ 新建入庫單頁 ⇄ 入庫單詳情頁
 * 規範要求新增/詳情使用獨立頁面，禁止 Modal 彈窗
 */
import { useState } from 'react'
import InboundList from './InboundList'
import InboundForm from './InboundForm'
import InboundDetail from './InboundDetail'

type View =
  | { mode: 'list' }
  | { mode: 'form' }
  | { mode: 'detail'; id: number }

export default function ConsumableInbound() {
  const [view, setView] = useState<View>({ mode: 'list' })

  return (
    <div className="content-area">
      {view.mode === 'list' ? (
        <InboundList
          onCreate={() => setView({ mode: 'form' })}
          onDetail={(id) => setView({ mode: 'detail', id })}
        />
      ) : view.mode === 'form' ? (
        <InboundForm onBack={() => setView({ mode: 'list' })} />
      ) : (
        <InboundDetail key={view.id} id={view.id} onBack={() => setView({ mode: 'list' })} />
      )}
    </div>
  )
}
