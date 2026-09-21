import { AuditOutlined, CheckCircleOutlined, InboxOutlined, TeamOutlined } from '@ant-design/icons'
import AnimatedNumber from '../../../components/AnimatedNumber'
import type { ClaimStatsData } from './claimViewTypes'

interface Props { data?: ClaimStatsData; scopeKey?: string; personal?: boolean }

export default function ClaimStats({ data, scopeKey, personal = false }: Props) {
  const items = [
    { key: 'employeeCount' as const, label: personal ? '本人資產記錄' : '涉及員工', value: personal && data ? data.claimedCount + data.returnedCount : data?.employeeCount, icon: <TeamOutlined />, color: '#1890FF', background: '#E6F7FF' },
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
