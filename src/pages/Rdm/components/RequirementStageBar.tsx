/**
 * RequirementStageBar —— 需求生命周期统一进度条
 *
 * 把 23 个状态折叠为 6 个阶段（提交/审批/分配受理/设计评审/研发测试/验收入库），
 * 业务方一眼看懂「我的需求到哪了」；PM/研发可点开查看完整状态明细。
 */
import { Popover, Tag } from 'antd'
import {
  RDM_STAGE_LABEL,
  RDM_STAGE_ORDER,
  RDM_STAGE_DESC,
  RDM_STAGE,
  RDM_STATUS_LABEL,
  RDM_STATUS_STAGE,
  type RdmStage,
  type RdmStatus,
} from '../../../constants/rdm'

interface StageBarProps {
  /** 当前状态码 */
  status: string
  /** 当前状态逾期时高亮提示 */
  overdue?: boolean
  /** 紧凑模式（卡片/列表内使用） */
  compact?: boolean
  /** 状态变更提示（如「已在「開發中」停留 4 天」） */
  hint?: string
}

/** 阶段在 6 段序列中的下标 */
function stageIndex(stage: RdmStage) {
  return RDM_STAGE_ORDER.indexOf(stage)
}

export default function RequirementStageBar({ status, overdue, compact, hint }: StageBarProps) {
  const stage = stageOfStatus(status)
  const currentIdx = stageIndex(stage)
  const finished = currentIdx < 0

  // 紧凑模式（看板卡片）：只画 6 段细分段条 + 当前阶段名，避免列宽溢出
  if (compact) {
    return (
      <div style={{ marginTop: 8 }}>
        <div style={{ display: 'flex', gap: 2 }}>
          {RDM_STAGE_ORDER.map((st, idx) => (
            <div
              key={st}
              style={{
                flex: 1, height: 4, borderRadius: 2,
                background: idx < currentIdx ? '#E8720C'
                  : idx === currentIdx ? (overdue ? '#FF4D4F' : '#F59432')
                  : '#F0F0F0',
              }}
            />
          ))}
        </div>
        <div style={{
          marginTop: 4, fontSize: 11,
          color: overdue ? '#CF1322' : '#8C8C8C',
        }}>
          {currentIdx >= 0 ? RDM_STAGE_LABEL[RDM_STAGE_ORDER[currentIdx]] : RDM_STATUS_LABEL[status as RdmStatus] ?? status}
        </div>
      </div>
    )
  }

  return (
    <div style={{
      display: 'flex', alignItems: 'flex-start', gap: 0,
      padding: '16px 8px 8px',
      flexWrap: 'wrap',
    }}>
      {RDM_STAGE_ORDER.map((st, idx) => {
        const done = idx < currentIdx
        const active = idx === currentIdx
        const color = done || active ? '#E8720C' : '#D9D9D9'
        return (
          <div key={st} style={{ flex: 1, display: 'flex', alignItems: 'flex-start', minWidth: 0 }}>
            {/* 节点 */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: 72 }}>
              <div style={{
                width: 22, height: 22, borderRadius: '50%',
                background: done ? '#E8720C' : active ? '#FFF7F0' : '#fff',
                border: `2px solid ${color}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 11, fontWeight: 700, color: done ? '#fff' : active ? '#E8720C' : '#BFBFBF',
                boxShadow: active ? '0 0 0 4px rgba(232,114,12,0.12)' : 'none',
                animation: active ? 'statusPulse 2s ease-in-out infinite' : undefined,
                transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
              }}>
                {done ? '✓' : idx + 1}
              </div>
              <div style={{
                marginTop: 6, fontSize: 12, whiteSpace: 'nowrap',
                color: active ? '#E8720C' : done ? '#595959' : '#8C8C8C',
                fontWeight: active ? 600 : 400,
              }}>
                {RDM_STAGE_LABEL[st]}
              </div>
            </div>
            {/* 连接线 */}
            {idx < RDM_STAGE_ORDER.length - 1 && (
              <div style={{
                flex: 1, height: 2, marginTop: 11,
                background: idx < currentIdx ? 'linear-gradient(90deg,#E8720C,#F59432)' : '#F0F0F0',
                borderRadius: 2,
              }} />
            )}
          </div>
        )
      })}

      {/* 当前状态明细（Popover 展示阶段说明 + 状态码） */}
      {currentIdx >= 0 && (
        <div style={{ textAlign: 'center', marginTop: 4, width: '100%' }}>
          <Popover
            trigger="hover"
            content={
              <div style={{ maxWidth: 320 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#262626', marginBottom: 6 }}>
                  當前階段：{RDM_STAGE_LABEL[RDM_STAGE_ORDER[currentIdx]]}
                </div>
                <div style={{ fontSize: 12, color: '#595959', marginBottom: 8 }}>
                  {RDM_STAGE_DESC[RDM_STAGE_ORDER[currentIdx]]}
                </div>
                <div style={{ fontSize: 12, color: '#8C8C8C' }}>
                  細分狀態：<Tag color={overdue ? 'error' : 'orange'} style={{ margin: 0 }}>
                    {RDM_STATUS_LABEL[status as RdmStatus] ?? status}
                  </Tag>
                  {hint && <span style={{ marginLeft: 8 }}>{hint}</span>}
                </div>
              </div>
            }
          >
            <span style={{
              fontSize: 12, color: '#E8720C', cursor: 'pointer',
              borderBottom: '1px dashed #E8720C',
            }}>
              當前所處狀態：{RDM_STATUS_LABEL[status as RdmStatus] ?? (finished ? status : '')}
            </span>
          </Popover>
        </div>
      )}
    </div>
  )
}

/** 状态 → 阶段（直接取 constants 中的权威映射，页面内不硬编状态判断） */
function stageOfStatus(status: string): RdmStage {
  return (RDM_STATUS_STAGE as Record<string, RdmStage>)[status] ?? RDM_STAGE.SUBMIT
}
