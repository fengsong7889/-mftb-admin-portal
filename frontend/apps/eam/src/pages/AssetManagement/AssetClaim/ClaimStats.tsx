/**
 * 领用统计卡片（四张）。
 *
 * 两种口径：列表页看全局（第一张为「涉及员工」），员工详情页传 personal 看个人
 * —— 个人视角下员工数恒为 1 没有信息量，所以同一张卡改成展示「本人资产记录」。
 *
 * 四张卡必须与页面页签一一对应（卡 = 页签 total），不能自己拼算：
 *  本人資產記錄 = totalCount（全部記錄页签，含待签/取消/遗失/报废/送修等）；
 *  在用資產   = claimedCount（在用頁簽）；已歸還記錄 = returnedCount（已歸還頁簽）；
 *  待簽記錄   = pendingSignatureCount（待我簽署頁簽）。
 * 历史上第一张卡用 claimed+returned 相加，漏掉待签与各类终止态，卡片与列表长期对不上。
 *
 * data 缺省时显示 — 而不是 0：— 代指尚未加载或加载失败，0 会被读成“确实没有”，
 * 两者语义必须区分。调用方在报错时传 data=undefined 就走同一分支。
 */
import { AuditOutlined, CheckCircleOutlined, InboxOutlined, TeamOutlined } from '@ant-design/icons'
import AnimatedNumber from '@/components/AnimatedNumber'
import type { ClaimStatsData } from '@/api/claimViewTypes'

interface Props {
  data?: ClaimStatsData
  /** 统计口径标识（列表页传筛选项快照，详情页传 employeeId）。用作 React key，
   *  口径一变就整组重挂载，让 AnimatedNumber 从 0 重新跑计数动画，视觉上明确告知已刷新 */
  scopeKey?: string
  /** 个人视角：第一张卡换为本人资产记录数 */
  personal?: boolean
}

export default function ClaimStats({ data, scopeKey, personal = false }: Props) {
  const items = [
    { key: 'employeeCount' as const, label: personal ? '本人資產記錄' : '涉及員工', value: personal ? data?.totalCount : data?.employeeCount, icon: <TeamOutlined />, color: '#1890FF', background: '#E6F7FF' },
    { key: 'claimedCount' as const, label: '在用資產', value: data?.claimedCount, icon: <InboxOutlined />, color: '#52C41A', background: '#F6FFED' },
    { key: 'returnedCount' as const, label: '已歸還記錄', value: data?.returnedCount, icon: <CheckCircleOutlined />, color: '#E8720C', background: '#FFF7E6' },
    { key: 'pendingSignatureCount' as const, label: '待簽記錄（含代辦補簽）', value: data?.pendingSignatureCount, icon: <AuditOutlined />, color: '#722ED1', background: '#F9F0FF' },
  ]
  return (
    <div className="claim-stats" key={scopeKey} aria-label="領用統計">
      {items.map((item) => (
        <div key={item.key} className="claim-stat" style={{ color: item.color, background: item.background, borderColor: `${item.color}22` }}>
          <div className="claim-stat-icon">{item.icon}</div>
          <div className="claim-stat-value" aria-label={`${item.label}：${item.value ?? '尚未加載'}`}>
            {item.value === undefined ? '—' : <AnimatedNumber value={item.value} />}
          </div>
          <div className="claim-stat-label">{item.label}</div>
        </div>
      ))}
    </div>
  )
}
