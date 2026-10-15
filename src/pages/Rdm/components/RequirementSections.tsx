/**
 * RequirementSections —— 需求详情「交付过程」的分区小节
 *
 * 为什么从 DeliveryPanel 拆出来：详情页把交付内容收进「子任务 / 方案与计划 / 更多记录」
 * 三个一级页签后，组件内部不能再自带一套 Tabs（一级页签套二级页签，用户要点两层才看到东西）。
 * 因此这里按「一个页签对应一组小节」输出可独立渲染的块，取数与刷新由详情页统一持有，
 * 避免同一份 summary 被多个子组件各拉一次。
 */
import { useState } from 'react'
import { Button, Input, Progress, Space, Table, Tag, Tooltip, message } from 'antd'
import type { TableColumnsType } from 'antd'
import {
  CheckCircleOutlined,
  CloseCircleOutlined,
  FileTextOutlined,
  NodeIndexOutlined,
  PauseCircleOutlined,
  PlusOutlined,
  ProfileOutlined,
  SwapOutlined,
  TeamOutlined,
} from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import dayjs from 'dayjs'
import { decideReview, type RdmChangeItem, type RdmDeliverySummary, type RdmPrdItem, type RdmReviewItem, type RdmTaskItem } from '../../../api/rdm'
import {
  RDM_CHANGE_STATUS_COLOR,
  RDM_CHANGE_STATUS_LABEL,
  RDM_CHANGE_TYPE_LABEL,
  RDM_PRD_STATUS_COLOR,
  RDM_PRD_STATUS_LABEL,
  RDM_REVIEW_CONCLUSION,
  RDM_REVIEW_CONCLUSION_COLOR,
  RDM_REVIEW_CONCLUSION_LABEL,
  RDM_REVIEW_TYPE_LABEL,
  RDM_TASK_STATUS,
  RDM_TASK_STATUS_COLOR,
  RDM_TASK_STATUS_LABEL,
  RDM_TASK_TYPE_COLOR,
  RDM_TASK_TYPE_LABEL,
  type RdmChangeStatus,
  type RdmChangeType,
  type RdmPrdStatus,
  type RdmReviewConclusion,
  type RdmReviewType,
  type RdmTaskStatus,
  type RdmTaskType,
} from '../../../constants/rdm'

/** 浅色描边标签（类型类字段统一用这套，避免与状态语义色混淆） */
function SoftTag({ color, text }: { color?: string; text: string }) {
  const c = color ?? '#8C8C8C'
  return <Tag style={{ margin: 0, color: c, borderColor: `${c}66`, background: `${c}12` }}>{text}</Tag>
}

/** 空态提示（同时告诉用户下一步该做什么，而不是只说「暂无数据」） */
function EmptyHint({ text }: { text: string }) {
  return <div className="rdm-empty-hint">{text}</div>
}

/** 小节标题（页签内的一级分组，比 rdm-card-title 轻一档） */
function SectionTitle({ icon, color, bg, text, extra }: {
  icon: React.ReactNode; color: string; bg: string; text: string; extra?: React.ReactNode
}) {
  return (
    <div className="rdm-section-title">
      <span className="rdm-icon-block" style={{ background: bg, color }}>{icon}</span>
      {text}
      <span className="rdm-card-title-split" />
      {extra}
    </div>
  )
}

/* ==================== 摘要条 ==================== */

export function DeliverySummaryBar({ summary }: { summary: RdmDeliverySummary | null }) {
  if (!summary) return null
  const blocked = summary.taskBlocked ?? 0
  return (
    <div className="rdm-delivery-summary">
      <div className="rdm-delivery-summary-item">
        <span className="rdm-delivery-summary-label">整體進度</span>
        <Progress percent={summary.overallProgress ?? 0} size="small" style={{ width: 120 }} />
      </div>
      <div className="rdm-delivery-summary-item">
        <span className="rdm-delivery-summary-label">任務完成</span>
        <b>{summary.taskDone ?? 0}/{summary.taskTotal ?? 0}</b>
      </div>
      <div className="rdm-delivery-summary-item">
        <span className="rdm-delivery-summary-label">實際工時</span>
        <b>{(summary.actualHoursTotal ?? 0).toFixed(1)} h</b>
        <span style={{ color: '#8C8C8C', fontSize: 12 }}> / 計劃 {(summary.planHoursTotal ?? 0).toFixed(1)} h</span>
      </div>
      <div className="rdm-delivery-summary-item">
        <span className="rdm-delivery-summary-label">阻塞</span>
        {blocked > 0
          ? <Tag color="error" style={{ margin: 0 }}>{blocked} 個任務</Tag>
          : <Tag color="success" style={{ margin: 0 }}>無</Tag>}
      </div>
      {summary.hoursByType && summary.hoursByType.length > 0 && (
        <div className="rdm-delivery-hours">
          {summary.hoursByType.map(h => (
            <Tooltip key={h.name} title={`${h.name}：${h.value.toFixed(1)} 工時`}>
              <span className="rdm-delivery-hours-chip">
                {h.name}
                <b>{h.value.toFixed(1)}h</b>
              </span>
            </Tooltip>
          ))}
        </div>
      )}
    </div>
  )
}

/* ==================== 子任务 ==================== */

/**
 * 任务小节。
 * <p>完成动作统一去研发交付工作台上报：服务端要求「完成必须带交付说明」，
 * 在这里静默发送只会拿到一个无证据的 100%。
 */
export function TaskSection({ summary, editable, reqId, canCreate }: {
  summary: RdmDeliverySummary | null
  editable: boolean
  reqId: number
  canCreate: boolean
}) {
  const navigate = useNavigate()
  const tasks = summary?.tasks ?? []

  const columns: TableColumnsType<RdmTaskItem> = [
    {
      title: '任務', dataIndex: 'title', key: 'title',
      render: (v: string, r) => (
        <div style={{ lineHeight: 1.4 }}>
          <div style={{ color: '#262626' }}>{v}</div>
          <div style={{ fontSize: 12, color: '#8C8C8C' }}>
            {r.taskNo}
            {r.iterationCode ? ` · ${r.iterationCode}` : ''}
            {r.planFinishDate ? ` · 計劃 ${r.planFinishDate}` : ''}
          </div>
        </div>
      ),
    },
    {
      title: '類型', dataIndex: 'taskType', key: 'taskType', width: 90,
      render: (v: string) => <SoftTag color={RDM_TASK_TYPE_COLOR[v as RdmTaskType]} text={RDM_TASK_TYPE_LABEL[v as RdmTaskType] ?? v} />,
    },
    { title: '負責人', dataIndex: 'ownerName', key: 'ownerName', width: 100, render: (v?: string | null) => v ?? '-' },
    {
      title: '狀態', dataIndex: 'status', key: 'status', width: 96,
      render: (v: string, r) => (
        <Space size={4}>
          <Tag color={RDM_TASK_STATUS_COLOR[v as RdmTaskStatus] ?? 'default'} style={{ margin: 0 }}>
            {RDM_TASK_STATUS_LABEL[v as RdmTaskStatus] ?? v}
          </Tag>
          {r.overdue && <Tag color="error" style={{ margin: 0 }}>逾期</Tag>}
        </Space>
      ),
    },
    {
      title: '進度', key: 'progress', width: 150,
      render: (_, r) => (
        <Space size={6}>
          <Progress percent={r.progress ?? 0} size="small" style={{ width: 62 }} />
          {/* 缺报不等于 0：把未填报当成 0 会同时做假负载与估时偏差 */}
          <span style={{ fontSize: 12, color: r.actualHoursReported ? '#8C8C8C' : '#FA8C16' }}>
            {r.actualHoursReported ? `${r.actualHours ?? 0}/${r.planHours ?? '-'}h` : `未填報 / ${r.planHours ?? '-'}h`}
          </span>
        </Space>
      ),
    },
    {
      title: '操作', key: 'action', width: 150,
      render: (_, r) => (
        <Space size={0} split={<span className="action-split">|</span>}>
          {editable && r.status === RDM_TASK_STATUS.TODO && (
            <Button type="link" size="small" onClick={() => navigate(`/rdm-task?reqId=${reqId}&id=${r.id}`)}>編輯</Button>
          )}
          {editable && r.status === RDM_TASK_STATUS.DOING && (
            <Button type="link" size="small" onClick={() => navigate('/rdm-delivery')}>去上報完成</Button>
          )}
          {r.status === RDM_TASK_STATUS.BLOCKED && r.blockedReason && (
            <Tooltip title={r.blockedReason}>
              <Button type="link" size="small" danger icon={<PauseCircleOutlined />}>阻塞原因</Button>
            </Tooltip>
          )}
          <Button type="link" size="small" onClick={() => navigate('/rdm-delivery')}>上報進度</Button>
        </Space>
      ),
    },
  ]

  return (
    <>
      <SectionTitle
        icon={<ProfileOutlined />} color="#2F54EB" bg="#F0F5FF"
        text={`研發任務（${tasks.length}）`}
        extra={canCreate && (
          <Button size="small" type="primary" icon={<PlusOutlined />} onClick={() => navigate(`/rdm-task?reqId=${reqId}`)}>
            新增任務
          </Button>
        )}
      />
      {tasks.length === 0
        ? <EmptyHint text="尚未拆解任務。產品經理或研發負責人受理需求後拆任務，需求會自動進入「開發中」。" />
        : (
          /*
            数值型 scroll.x（不是 'max-content'）：max-content 会把表格固有宽度往上传播，
            实测在窄视口下撑破 .rdm-detail-grid 与 main，横向滚动条落到页面上而不是表格里。
            给固定值后表格容器保持父级宽度、由自身 overflow 滚动。
          */
          <Table<RdmTaskItem> rowKey="id" size="small" columns={columns} dataSource={tasks} pagination={false} scroll={{ x: 780 }} />
        )}
    </>
  )
}

/* ==================== 方案与计划 ==================== */

/** PRD 行 */
function PrdRow({ prd, editable, onClick }: { prd: RdmPrdItem; editable?: boolean; onClick: () => void }) {
  const key = prd.status as RdmPrdStatus
  return (
    <div className="rdm-delivery-row">
      <Tag color={RDM_PRD_STATUS_COLOR[key] ?? 'default'} style={{ margin: 0 }}>{RDM_PRD_STATUS_LABEL[key] ?? prd.status}</Tag>
      <span className="rdm-delivery-row-main">
        <a style={{ color: '#E8720C' }} onClick={onClick}>{prd.title}</a>
        <span style={{ fontSize: 12, color: '#8C8C8C', marginLeft: 8 }}>
          {prd.prdNo}{prd.versionNo ? ` · ${prd.versionNo}` : ''}{prd.authorName ? ` · ${prd.authorName}` : ''}
        </span>
      </span>
      {editable && <Button type="link" size="small" onClick={onClick}>編輯</Button>}
    </div>
  )
}

/** 评审行（待评审时行内录入结论） */
function ReviewRow({ review, editable, onDecide }: {
  review: RdmReviewItem
  editable?: boolean
  /** passed 时 conclusion 必填（作为开发与验收依据） */
  onDecide: (review: RdmReviewItem, passed: boolean, conclusion: string) => Promise<void>
}) {
  const [open, setOpen] = useState(false)
  const [conclusion, setConclusion] = useState('')
  const [saving, setSaving] = useState(false)
  const key = review.conclusion as RdmReviewConclusion
  const pending = key === RDM_REVIEW_CONCLUSION.PENDING

  const submit = async (passed: boolean) => {
    if (passed && !conclusion.trim()) {
      message.warning('評審通過請填寫結論（作為後續開發與驗收依據）')
      return
    }
    setSaving(true)
    try {
      await onDecide(review, passed, conclusion.trim())
      setOpen(false)
      setConclusion('')
    } catch {
      // 失败提示由请求层统一弹出，这里保留已填结论让用户能就地重试
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      <div className="rdm-delivery-row">
        <Tag color={RDM_REVIEW_CONCLUSION_COLOR[key] ?? 'default'} style={{ margin: 0 }}>
          {RDM_REVIEW_CONCLUSION_LABEL[key] ?? review.conclusion}
        </Tag>
        <span className="rdm-delivery-row-main">
          <b style={{ fontWeight: 500 }}>{RDM_REVIEW_TYPE_LABEL[review.reviewType as RdmReviewType] ?? review.reviewType}</b>
          <span style={{ fontSize: 12, color: '#8C8C8C', marginLeft: 8 }}>
            {review.reviewNo}
            {review.prdTitle ? ` · ${review.prdTitle}` : ''}
            {review.reviewTime ? ` · ${dayjs(review.reviewTime).format('MM-DD HH:mm')}` : ''}
            {review.participants ? ` · 參與 ${review.participants}` : ''}
          </span>
        </span>
        {pending && editable && (
          <Button type="link" size="small" onClick={() => setOpen(v => !v)}>{open ? '收起' : '錄入結論'}</Button>
        )}
      </div>
      {review.conclusionDesc && !pending && (
        <div className="rdm-delivery-row-desc">結論：{review.conclusionDesc}</div>
      )}
      {pending && open && (
        <div className="rdm-action-panel">
          <div className="rdm-action-panel-title">錄入評審結論：{review.reviewNo}</div>
          <Space direction="vertical" size={8} style={{ width: '100%' }}>
            <Input.TextArea
              rows={2}
              value={conclusion}
              placeholder="評審結論與遺留問題（通過時作為開發與驗收依據）"
              onChange={e => setConclusion(e.target.value)}
            />
            <Space>
              <Button type="primary" size="small" icon={<CheckCircleOutlined />} loading={saving} onClick={() => void submit(true)}>評審通過</Button>
              <Button size="small" danger icon={<CloseCircleOutlined />} loading={saving} onClick={() => void submit(false)}>退回修改</Button>
              <Button size="small" onClick={() => setOpen(false)}>取消</Button>
            </Space>
          </Space>
        </div>
      )}
    </div>
  )
}

/**
 * 方案与计划小节：节点计划 → PRD → 评审。
 * <p>节点计划排在最前：PM 最先要回答的是「承诺过什么时间」，而不是已经拆了多少任务。
 */
export function PlanSection({ summary, planReleaseDate, editable, canCreate, reqId, onReviewDecided }: {
  summary: RdmDeliverySummary | null
  /** 计划上线日期：只用于说明「以已冻结基线为准」，不在这里改 */
  planReleaseDate?: string | null
  editable: boolean
  canCreate: boolean
  reqId: number
  onReviewDecided: () => void
}) {
  const navigate = useNavigate()
  const milestones = summary?.milestones ?? []
  const prds = summary?.prds ?? []
  const reviews = summary?.reviews ?? []
  const baselineFrozen = milestones.length > 0 && milestones.every(m => m.baselineLocked)

  return (
    <>
      <SectionTitle
        icon={<NodeIndexOutlined />} color="#722ED1" bg="#F9F0FF"
        text={`節點計劃（${milestones.length}）`}
        extra={editable && (
          <Button size="small" onClick={() => navigate(`/rdm-milestone?reqId=${reqId}`)}>
            {milestones.length === 0 ? '規劃節點' : baselineFrozen ? '調整預測' : '規劃 / 凍結基線'}
          </Button>
        )}
      />
      {milestones.length === 0
        ? <EmptyHint text="尚未規劃五個關鍵節點（評審/設計/研發啟動/開發完成/上線）。受理需求後先排初步計劃，評審通過再凍結基線。" />
        : milestones.map(m => (
          <div key={m.code} className="rdm-delivery-row">
            <Tag color={m.baselineLocked ? 'purple' : m.status === 'done' ? 'success' : m.status === 'not_applicable' ? 'default' : 'processing'} style={{ margin: 0 }}>
              {m.name}
            </Tag>
            <span className="rdm-delivery-row-main">
              <span style={{ fontSize: 13 }}>
                初步 {m.preliminaryDate ?? '-'}
                {' · 基線 '}{m.baselineDate ?? '未凍結'}
                {' · 預測 '}{m.forecastDate ?? '-'}
                {m.actualDate ? ` · 實際 ${m.actualDate}` : ''}
              </span>
              {typeof m.slipDays === 'number' && (
                <Tag color={m.slipDays > 0 ? 'error' : 'success'} style={{ margin: '0 0 0 8px' }}>
                  {m.slipDays > 0 ? `晚 ${m.slipDays} 天` : '按時'}
                </Tag>
              )}
              <div className="rdm-delivery-row-desc">
                {m.ownerName ? `負責人：${m.ownerName}` : '負責人：未指定'}
                {m.naReason ? ` · 不適用原因：${m.naReason}` : ''}
              </div>
            </span>
          </div>
        ))}

      <SectionTitle
        icon={<FileTextOutlined />} color="#E8720C" bg="#FFF7E6"
        text={`PRD（${prds.length}）`}
        extra={canCreate && (
          <Button size="small" icon={<PlusOutlined />} onClick={() => navigate(`/rdm-prd?reqId=${reqId}`)}>編寫 PRD</Button>
        )}
      />
      {prds.length === 0
        ? <EmptyHint text="尚未編寫 PRD。PRD 的「驗收標準」會直接成為業務驗收檢查項，請寫清可驗證的口徑。" />
        : prds.map(p => (
          <PrdRow key={p.id} prd={p} editable={editable} onClick={() => navigate(`/rdm-prd?reqId=${reqId}&id=${p.id}`)} />
        ))}

      <SectionTitle
        icon={<TeamOutlined />} color="#1890FF" bg="#E6F7FF"
        text={`評審（${reviews.length}）`}
        extra={canCreate && (
          <Button size="small" icon={<TeamOutlined />} onClick={() => navigate(`/rdm-review?reqId=${reqId}`)}>發起評審</Button>
        )}
      />
      {reviews.length === 0
        ? <EmptyHint text="尚無評審記錄。發起需求評審後由研發/測試確認技術方案與可測性；評審通過才能凍結基線。" />
        : reviews.map(r => (
          <ReviewRow
            key={r.id}
            review={r}
            editable={editable}
            onDecide={async (review, passed, conclusion) => {
              await decideReview(review.id, { passed, conclusionDesc: conclusion || undefined })
              message.success(passed ? '評審已通過' : '評審已退回')
              onReviewDecided()
            }}
          />
        ))}
      {planReleaseDate && (
        <div style={{ fontSize: 12, color: '#8C8C8C', marginTop: 8 }}>
          計劃上線：{planReleaseDate}（以已凍結基線為準，業務期望日期不等同產研承諾）
        </div>
      )}
    </>
  )
}

/* ==================== 需求变更 ==================== */

/** 变更小节（收进「更多记录」：变更走审批，不是日常推进动作） */
export function ChangeSection({ summary, canCreate, reqId }: {
  summary: RdmDeliverySummary | null
  canCreate: boolean
  reqId: number
}) {
  const navigate = useNavigate()
  const changes = summary?.changes ?? []
  return (
    <>
      <SectionTitle
        icon={<SwapOutlined />} color="#FA8C16" bg="#FFF7E6"
        text={`需求變更（${changes.length}）`}
        extra={canCreate && (
          <Button size="small" icon={<SwapOutlined />} onClick={() => navigate(`/rdm-change?reqId=${reqId}`)}>申請變更</Button>
        )}
      />
      {changes.length === 0
        ? <EmptyHint text="尚無變更記錄。需求口徑變化請走變更申請（需審批），避免口頭改需求。" />
        : changes.map(c => <ChangeRow key={c.id} change={c} />)}
    </>
  )
}

/** 变更行 */
function ChangeRow({ change }: { change: RdmChangeItem }) {
  const key = change.approvalStatus as RdmChangeStatus
  return (
    <div className="rdm-delivery-row" style={{ alignItems: 'flex-start' }}>
      <Tag color={RDM_CHANGE_STATUS_COLOR[key] ?? 'default'} style={{ margin: 0 }}>{RDM_CHANGE_STATUS_LABEL[key] ?? change.approvalStatus}</Tag>
      <span className="rdm-delivery-row-main">
        <b style={{ fontWeight: 500 }}>{RDM_CHANGE_TYPE_LABEL[change.changeType as RdmChangeType] ?? change.changeType}</b>
        <span style={{ fontSize: 12, color: '#8C8C8C', marginLeft: 8 }}>
          {change.changeNo}
          {change.applicantName ? ` · ${change.applicantName}` : ''}
          {change.applyTime ? ` · ${dayjs(change.applyTime).format('MM-DD HH:mm')}` : ''}
          {change.affectsSchedule ? ' · 影響排期' : ''}
          {change.addedHours ? ` · 加 ${change.addedHours}h` : ''}
        </span>
        <div style={{ fontSize: 13, color: '#595959', marginTop: 4 }}>{change.afterContent}</div>
        <div style={{ fontSize: 12, color: '#8C8C8C', marginTop: 2 }}>原因：{change.reason}</div>
        {change.decideRemark && <div style={{ fontSize: 12, color: '#8C8C8C', marginTop: 2 }}>審批意見：{change.decideRemark}</div>}
      </span>
    </div>
  )
}
