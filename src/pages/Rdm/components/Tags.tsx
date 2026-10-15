/**
 * RDM 通用标签组件（状态/优先级/类型/复杂度/角色）
 */
import { Tag, Tooltip } from 'antd'
import { ClockCircleOutlined } from '@ant-design/icons'
import {
  getRdmComplexityLabel,
  getRdmPriorityLabel,
  RDM_PRIORITY_COLOR,
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

/**
 * 未知枚举兜底标签。
 * <p>历史数据里存在旧编码（如 reqType=feature、complexity=medium），映射表没有对应项。
 * 这里统一渲染成中性描边标签并原样显示编码：既不会混在标签堆里像渲染坏了，
 * 也不会被猜成一个中文映射写进报表口径。悬停提示说明它是未识别编码，便于后续核数据。
 */
function UnknownTag({ value }: { value: string }) {
  return (
    <Tooltip title="未收錄的歷史編碼，需核對數據來源後補入映射表">
      <Tag style={{ margin: 0, color: '#595959', borderColor: '#D9D9D9', background: '#FAFAFA' }}>
        {value}
      </Tag>
    </Tooltip>
  )
}

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

/**
 * 优先级标签（实心描边，颜色语义化）
 * <p>历史编码按原意翻译为中文并保留中性样式，不推断其对应的 P 等级。
 */
export function PriorityTag({ priority }: { priority?: string | null }) {
  const key = priority?.trim().toUpperCase() as RdmPriority
  const color = RDM_PRIORITY_COLOR[key]
  const label = getRdmPriorityLabel(priority)
  if (!color) return <Tag title={priority ?? undefined} style={{ margin: 0 }}>{label}</Tag>
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', height: 22, padding: '0 8px',
      borderRadius: 4, fontSize: 12, fontWeight: 600, color: '#fff', background: color,
    }}>
      {label}
    </span>
  )
}

/** 需求类型标签（浅色底 + 主色文字） */
export function TypeTag({ reqType }: { reqType: string }) {
  const key = reqType as RdmReqType
  const color = RDM_REQ_TYPE_COLOR[key]
  if (!color) return <UnknownTag value={reqType} />
  return (
    <Tag style={{ margin: 0, color, borderColor: `${color}66`, background: `${color}12`, fontWeight: 500 }}>
      {RDM_REQ_TYPE_LABEL[key]}
    </Tag>
  )
}

/** 复杂度标签 */
export function ComplexityTag({ complexity }: { complexity?: string | null }) {
  if (!complexity?.trim()) return <span style={{ color: '#8C8C8C' }}>-</span>
  const key = complexity.trim().toUpperCase() as RdmComplexity
  const map: Record<RdmComplexity, string> = { SIMPLE: 'default', MEDIUM: 'blue', COMPLEX: 'orange', HUGE: 'red' }
  return <Tag color={map[key] ?? 'default'} title={complexity} style={{ margin: 0 }}>{getRdmComplexityLabel(complexity)}</Tag>
}

/** 风险类型标签 */
export function RiskTag({ riskType }: { riskType: string }) {
  const key = riskType as RdmRiskType
  const color = RDM_RISK_COLOR[key]
  if (!color) return <UnknownTag value={riskType} />
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
