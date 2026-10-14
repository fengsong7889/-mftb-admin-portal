/**
 * 移动 APP 原型 · 顶层入口（/app-preview）
 *
 * 在后台里以「手机外壳」承载两个 APP 原型：商家端（真实下单闭环）与用户端（结构壳）。
 * 本页不属于任何业务系统，故在 App.tsx 里走独立 Layout 分支（不注入 Sidebar/MenuTabs），
 * 与 /portal 同级。入口来自企业门户「移動 APP」页签下的两张卡片。
 *
 * 交互约定（按产品要求）：
 * - ?app=merchant|consumer 决定展示哪个 APP（缺省商家端）；换 APP 由门户卡片重新进入，本页内不做 APP 间切换；
 * - ?from=<门户页签> 记录进入来源页签，左上返回直接回企业门户并还原该页签（从哪进、返回就在哪个页签）。
 */
import { useNavigate, useSearchParams } from 'react-router-dom'
import PhoneFrame from './PhoneFrame'
import MerchantApp from './MerchantApp'
import ConsumerApp from './ConsumerApp'
import './appPreview.css'

export default function AppPreview() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const app = params.get('app') === 'consumer' ? 'consumer' : 'merchant'
  // 进入来源的门户页签，返回时带回并还原；缺省回到「移動 APP」页签（卡片入口所在）
  const fromTab = params.get('from') || 'app'

  return (
    <div className="ap-stage">
      <button
        type="button"
        className="ap-exit"
        onClick={() => navigate(`/portal?tab=${fromTab}`)}
      >
        ‹ 返回企業門戶
      </button>
      <PhoneFrame>
        {app === 'merchant' ? <MerchantApp /> : <ConsumerApp />}
      </PhoneFrame>
    </div>
  )
}
