/**
 * RequirementStageBar —— 需求生命周期统一进度条
 *
 * 把 23 个状态折叠为 9 个阶段（提交/審批/分配受理/PRD设计/評審排期/開發/測試/業務驗收/上線歸檔），
 * 分段依据是「现在卡在谁手上」：PM 扫一眼就知道该催研发还是催 QA，而不是在“研發測試”里猜。
 * 业务方一眼看懂「我的需求到哪了」；PM/研发可点开查看阶段口径与细分状态。
 */
import { Popover, Tag } from 'antd'
import {
  RDM_STAGE_LABEL,
  RDM_STAGE_ORDER,
  RDM_STAGE_DESC,
  RDM_STAGE,
  RDM_STALLED_STATUS,
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
  /**
   * V3：由交付項事實推導的階段（只讀投影）。傳入時優先於 status 映射。
   * <p>V3 需求受理後狀態按設計停住，設計/開發/測試/驗收按交付項推進；
   * 不傳時行為完全等同舊版（V1/V2 不受影響）。
   */
  derivedStage?: RdmStage | null
  /** 推導口徑說明（如「交付項 3/5 完成」），展示在階段條下方 */
  derivedHint?: string
}

/** 阶段在 9 段序列中的下标 */
function stageIndex(stage: RdmStage) {
  return RDM_STAGE_ORDER.indexOf(stage)
}

export default function RequirementStageBar({ status, overdue, compact, stayDays, derivedStage, derivedHint }: StageBarProps) {
  const stage = derivedStage ?? stageOfStatus(status)
  const currentIdx = stageIndex(stage)
  /**
   * 驳回/挂起：仍留在原阶段但要把节点标红，否则异常停留会被读成正常推进。
   * <p>推导阶段（V3）不代表需求状态异常，不参与「异常停留」着色。
   */
  const stalled = derivedStage ? undefined : RDM_STALLED_STATUS[status as RdmStatus]
  const derived = !!derivedStage

  // 紧凑模式（看板卡片）：只画 9 段细分段条 + 当前阶段名，避免列宽溢出
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
          {derived ? '（交付項）' : ''}
        </div>
        {/* 看板卡片：推导阶段旁边直出 N/M，不占额外行也不靠悬停 */}
        {derived && derivedHint && (
          <div style={{ fontSize: 11, color: '#8C8C8C' }}>{derivedHint}</div>
        )}
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
          /** 当前节点且处于逾期/驳回/挂起：用危险色抢回注意力，否则异常停留与普通推进长得一样 */
          const alarm = active && (overdue || !!stalled)
          const color = alarm ? '#FF4D4F' : done || active ? '#E8720C' : '#D9D9D9'
          const stay = stayDays?.[st]
          return (
            <div key={st} style={{ flex: 1, display: 'flex', alignItems: 'flex-start', minWidth: 0 }}>
              {/* 节点 */}
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: 64 }}>
                <div style={{
                  width: 22, height: 22, borderRadius: '50%',
                  background: done ? '#E8720C' : active ? (alarm ? '#FFF2F0' : '#FFF7F0') : '#fff',
                  border: `2px solid ${color}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 11, fontWeight: 700, color: done ? '#fff' : active ? (alarm ? '#CF1322' : '#E8720C') : '#BFBFBF',
                  boxShadow: active ? `0 0 0 4px ${alarm ? 'rgba(255,77,79,0.12)' : 'rgba(232,114,12,0.12)'}` : 'none',
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
                          {derived ? (
                            <>
                              階段來源：<Tag color="purple" style={{ margin: 0 }}>由交付項推導</Tag>
                              {derivedHint ? <div style={{ marginTop: 4 }}>{derivedHint}</div> : null}
                            </>
                          ) : (
                            <>
                              細分狀態：<Tag color={alarm ? 'error' : 'orange'} style={{ margin: 0 }}>
                                {RDM_STATUS_LABEL[status as RdmStatus] ?? status}
                              </Tag>
                              {stalled && (
                                <span style={{ color: '#CF1322', marginLeft: 6 }}>{stalled}，需人工推進</span>
                              )}
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  }
                >
                  <div style={{ marginTop: 6, textAlign: 'center', cursor: 'pointer' }}>
                    <div style={{
                      fontSize: 12, whiteSpace: 'nowrap',
                      color: alarm ? '#CF1322' : active ? '#E8720C' : done ? '#595959' : '#8C8C8C',
                      fontWeight: active ? 600 : 400,
                    }}>
                      {RDM_STAGE_LABEL[st]}
                    </div>
                    {/* 第二行：异常态优先报“被驳回/挂起”，正常推进才报停留天数 */}
                    {(stalled || typeof stay === 'number') && (
                      <div style={{
                        fontSize: 11, whiteSpace: 'nowrap', marginTop: 2,
                        color: alarm ? '#CF1322' : '#8C8C8C',
                      }}>
                        {stalled
                          ? `${stalled}${typeof stay === 'number' ? ` · 停留 ${stay} 天` : ''}`
                          : `停留 ${stay} 天`}
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
      {/* V3：把推导口径常驻在阶段条下方，避免「阶标在開発、需求状态却还是已受理」被读成矛盾 */}
      {derived && derivedHint && (
        <div style={{ marginTop: 4, paddingLeft: 2, fontSize: 12, color: '#8C8C8C' }}>{derivedHint}</div>
      )}
    </div>
  )
}

/** 状态 → 阶段（直接取 constants 中的权威映射，页面内不硬编状态判断） */
function stageOfStatus(status: string): RdmStage {
  return (RDM_STATUS_STAGE as Record<string, RdmStage>)[status] ?? RDM_STAGE.SUBMIT
}
