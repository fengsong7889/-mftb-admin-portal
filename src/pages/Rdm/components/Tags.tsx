/**
 * RDM 通用标签组件（状态/优先级/类型/复杂度/角色）
 */
import { Tag } from 'antd'
import { ClockCircleOutlined } from '@ant-design/icons'
import {
  RDM_COMPLEXITY_LABEL,
  RDM_PRIORITY_COLOR,
  RDM_PRIORITY_LABEL,
  RDM_REQ_TYPE_COLOR,
  RDM_REQ_TYPE_LABEL,
  RDM_RISK_COLOR,
  RDM_RISK_LABEL,
  RDM_STATUS_COLOR,
  RDM_STATUS_LABEL,
  type RdmComplexity,
  type RdmPriority,
  type RdmReqType,
  type RdmRiskType,
  type RdmStatus,
} from '../../../constants/rdm'

/** 需求状态标签（逾期时附加超时图标） */
export function StatusTag({ status, overdue }: { status: string; overdue?: boolean }) {
  const key = status as RdmStatus
  const label = RDM_STATUS_LABEL[key] ?? status
  if (!RDM_STATUS_COLOR[key]) {
    return <Tag style={{ margin: 0 }}>{status}</Tag>
  }
  return (
    <Tag color={RDM_STATUS_COLOR[key]} style={{ margin: 0 }}>
      {overdue && <ClockCircleOutlined style={{ marginRight: 4 }} />}
      {label}
    </Tag>
  )
}

/** 优先级标签（实心描边，颜色语义化） */
export function PriorityTag({ priority }: { priority: string }) {
  const key = priority as RdmPriority
  const color = RDM_PRIORITY_COLOR[key]
  if (!color) return <span>{priority}</span>
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', height: 22, padding: '0 8px',
      borderRadius: 4, fontSize: 12, fontWeight: 600, color: '#fff', background: color,
    }}>
      {RDM_PRIORITY_LABEL[key]}
    </span>
  )
}

/** 需求类型标签（浅色底 + 主色文字） */
export function TypeTag({ reqType }: { reqType: string }) {
  const key = reqType as RdmReqType
  const color = RDM_REQ_TYPE_COLOR[key]
  if (!color) return <span>{reqType}</span>
  return (
    <Tag style={{ margin: 0, color, borderColor: `${color}66`, background: `${color}12`, fontWeight: 500 }}>
      {RDM_REQ_TYPE_LABEL[key]}
    </Tag>
  )
}

/** 复杂度标签 */
export function ComplexityTag({ complexity }: { complexity?: string | null }) {
  if (!complexity) return <span style={{ color: '#8C8C8C' }}>-</span>
  const map: Record<string, string> = { SIMPLE: 'default', MEDIUM: 'blue', COMPLEX: 'orange', HUGE: 'red' }
  return <Tag color={map[complexity] ?? 'default'} style={{ margin: 0 }}>{RDM_COMPLEXITY_LABEL[complexity as RdmComplexity] ?? complexity}</Tag>
}

/** 风险类型标签 */
export function RiskTag({ riskType }: { riskType: string }) {
  const key = riskType as RdmRiskType
  const color = RDM_RISK_COLOR[key]
  if (!color) return <span>{riskType}</span>
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4, height: 22, padding: '0 8px',
      borderRadius: 4, fontSize: 12, color, background: `${color}14`, border: `1px solid ${color}40`,
    }}>
      {RDM_RISK_LABEL[key]}
    </span>
  )
}

/** 逾期/阻塞标记（列表与卡片共用） */
export function RiskFlags({ overdue, blocked }: { overdue?: boolean; blocked?: boolean }) {
  if (!overdue && !blocked) return null
  return (
    <span style={{ display: 'inline-flex', gap: 4, marginLeft: 6 }}>
      {overdue && <Tag color="error" style={{ margin: 0 }}>逾期</Tag>}
      {blocked && <Tag color="purple" style={{ margin: 0 }}>阻塞</Tag>}
    </span>
  )
}
