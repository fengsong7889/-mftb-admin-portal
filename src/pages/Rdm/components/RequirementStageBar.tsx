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
  /**
   * 各折叠阶段的停留天数（详情页按时间轴汇总细分状态后传入）。
   * <p>直接标在每个节点名下方，不再靠底部一行「当前所处状态」+ hover 才能看到；
   * 没走过的阶段不传就不显示，避免用 0 天冒充事实。
   */
  stayDays?: Partial<Record<RdmStage, number>>
}

/** 阶段在 6 段序列中的下标 */
function stageIndex(stage: RdmStage) {
  return RDM_STAGE_ORDER.indexOf(stage)
}

export default function RequirementStageBar({ status, overdue, compact, stayDays }: StageBarProps) {
  const stage = stageOfStatus(status)
  const currentIdx = stageIndex(stage)

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
    <div style={{ padding: '16px 8px 8px' }}>
      {/*
        步骤行与「当前状态」文本必须分成两个块级行。
        原先两者是同一个 flex-row 的兄弟，状态文本 width:100% 的 flex-basis 会吃满整行，
        6 个 flex:1 步骤被压成 0 宽并叠在同一坐标 —— 弹窗里看起来「进度条是空的」。
      */}
      <div style={{ display: 'flex', alignItems: 'flex-start' }}>
        {RDM_STAGE_ORDER.map((st, idx) => {
          const done = idx < currentIdx
          const active = idx === currentIdx
          const color = done || active ? '#E8720C' : '#D9D9D9'
          const stay = stayDays?.[st]
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
                {/* 阶段名 + 停留天数常驻显示，hover 才展开阶段口径与细分状态 */}
                <Popover
                  trigger="hover"
                  content={
                    <div style={{ maxWidth: 320 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: '#262626', marginBottom: 6 }}>
                        {RDM_STAGE_LABEL[st]}
                        {typeof stay === 'number' ? ` · 停留 ${stay} 天` : ''}
                      </div>
                      <div style={{ fontSize: 12, color: '#595959', marginBottom: active ? 8 : 0 }}>
                        {RDM_STAGE_DESC[st]}
                      </div>
                      {active && (
                        <div style={{ fontSize: 12, color: '#8C8C8C' }}>
                          細分狀態：<Tag color={overdue ? 'error' : 'orange'} style={{ margin: 0 }}>
                            {RDM_STATUS_LABEL[status as RdmStatus] ?? status}
                          </Tag>
                        </div>
                      )}
                    </div>
                  }
                >
                  <div style={{ marginTop: 6, textAlign: 'center', cursor: 'pointer' }}>
                    <div style={{
                      fontSize: 12, whiteSpace: 'nowrap',
                      color: active ? '#E8720C' : done ? '#595959' : '#8C8C8C',
                      fontWeight: active ? 600 : 400,
                    }}>
                      {RDM_STAGE_LABEL[st]}
                    </div>
                    {typeof stay === 'number' && (
                      <div style={{
                        fontSize: 11, whiteSpace: 'nowrap', marginTop: 2,
                        color: active && overdue ? '#CF1322' : '#8C8C8C',
                      }}>
                        停留 {stay} 天
                      </div>
                    )}
                  </div>
                </Popover>
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
      </div>
    </div>
  )
}

/** 状态 → 阶段（直接取 constants 中的权威映射，页面内不硬编状态判断） */
function stageOfStatus(status: string): RdmStage {
  return (RDM_STATUS_STAGE as Record<string, RdmStage>)[status] ?? RDM_STAGE.SUBMIT
}
