/**
 * DeliveryPanel —— 需求详情内的「交付过程」区块
 *
 * 设计口径：业务方看「做到哪了」，产品/研发看「还剩什么」，项目经理看「卡在哪」。
 * 因此一个区块同时给出进度摘要 + PRD/任务/评审/变更四类明细，
 * 评审结论录入走行内面板（与流转处理同法），其余新增动作跳独立表单页。
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Button, Input, Progress, Space, Table, Tabs, Tag, Tooltip, message } from 'antd'
import type { TableColumnsType } from 'antd'
import {
  ApartmentOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  EditOutlined,
  FileTextOutlined,
  PauseCircleOutlined,
  PlusOutlined,
  SwapOutlined,
  TeamOutlined,
} from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import dayjs from 'dayjs'
import {
  decideReview,
  fetchDeliverySummary,
  reportTask,
  type RdmChangeItem,
  type RdmDeliverySummary,
  type RdmPrdItem,
  type RdmReviewItem,
  type RdmTaskItem,
} from '../../../api/rdm'
import {
  RDM_CHANGE_STATUS_COLOR,
  RDM_CHANGE_STATUS_LABEL,
  RDM_CHANGE_TYPE_LABEL,
  RDM_FINAL_STATUS,
  RDM_PRD_STATUS_COLOR,
  RDM_PRD_STATUS_LABEL,
  RDM_REVIEW_CONCLUSION,
  RDM_REVIEW_CONCLUSION_COLOR,
  RDM_REVIEW_CONCLUSION_LABEL,
  RDM_REVIEW_TYPE_LABEL,
  RDM_TASK_ACTION,
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
  type RdmStatus,
  type RdmTaskStatus,
  type RdmTaskType,
} from '../../../constants/rdm'

interface DeliveryPanelProps {
  reqId: number
  /** 需求状态（终态时隐藏新增类动作，避免归档后再改口径） */
  status: string
  /** 是否可维护交付内容（产品经理/研发负责人/管理员视角） */
  editable?: boolean
}

/** 浅色描边标签（类型类字段统一用这套，避免与状态语义色混淆） */
function SoftTag({ color, text }: { color?: string; text: string }) {
  const c = color ?? '#8C8C8C'
  return <Tag style={{ margin: 0, color: c, borderColor: `${c}66`, background: `${c}12` }}>{text}</Tag>
}

export default function DeliveryPanel({ reqId, status, editable }: DeliveryPanelProps) {
  const navigate = useNavigate()
  const [summary, setSummary] = useState<RdmDeliverySummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('task')
  const [reviewCtx, setReviewCtx] = useState<number | null>(null)
  const [conclusionDesc, setConclusionDesc] = useState('')
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setSummary(await fetchDeliverySummary(reqId))
    } catch {
      message.error('交付過程載入失敗')
    } finally {
      setLoading(false)
    }
  }, [reqId])

  useEffect(() => { void load() }, [load])

  /** 需求已归档后不再提供新增/编辑动作（改口径需另起需求） */
  const closed = RDM_FINAL_STATUS.includes(status as RdmStatus)
  const canManage = editable && !closed

  /** summary 每次刷新都是新对象，先固定 tasks 引用，避开下游 useMemo 失效 */
  const tasks = useMemo(() => summary?.tasks ?? [], [summary])
  const blockedTasks = useMemo(() => tasks.filter(t => t.status === RDM_TASK_STATUS.BLOCKED), [tasks])

  /** 行内上报任务（详情页只做「完成」这一最高频动作，其余回研发交付工作台） */
  const handleFinishTask = useCallback(async (task: RdmTaskItem) => {
    setSaving(true)
    try {
      await reportTask(task.id, { action: RDM_TASK_ACTION.DONE, progress: 100 })
      message.success(`任務「${task.title}」已完成`)
      await load()
    } catch {
      message.error('操作失敗，請重試')
    } finally {
      setSaving(false)
    }
  }, [load])

  /** 录入评审结论（通过/退回），评审是状态流转闸门，必须由评审人显式点选 */
  const handleReviewDecision = async (review: RdmReviewItem, passed: boolean) => {
    if (passed && !conclusionDesc.trim()) {
      message.warning('評審通過請填寫結論（作為後續開發與驗收依據）')
      return
    }
    setSaving(true)
    try {
      await decideReview(review.id, { passed, conclusionDesc: conclusionDesc.trim() || undefined })
      message.success(passed ? '評審已通過' : '評審已退回')
      setReviewCtx(null)
      setConclusionDesc('')
      await load()
    } catch {
      message.error('錄入失敗，請重試')
    } finally {
      setSaving(false)
    }
  }

  const taskColumns: TableColumnsType<RdmTaskItem> = useMemo(() => [
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
          <span style={{ fontSize: 12, color: '#8C8C8C' }}>{r.actualHours ?? 0}/{r.planHours ?? '-'}h</span>
        </Space>
      ),
    },
    {
      title: '操作', key: 'action', width: 150,
      render: (_, r) => (
        <Space size={0}>
          {canManage && r.status === RDM_TASK_STATUS.TODO && (
            <>
              <Button type="link" size="small" onClick={() => navigate(`/rdm-task?reqId=${reqId}&id=${r.id}`)}>編輯</Button>
              <span className="action-split">|</span>
            </>
          )}
          {canManage && r.status === RDM_TASK_STATUS.DOING && (
            <>
              <Button type="link" size="small" style={{ color: '#52C41A' }} loading={saving} onClick={() => handleFinishTask(r)}>標記完成</Button>
              <span className="action-split">|</span>
            </>
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
  ], [canManage, reqId, navigate, saving, handleFinishTask])

  const items = [
    {
      key: 'task',
      label: `研發任務（${tasks.length}）`,
      children: tasks.length === 0
        ? <EmptyHint text="尚未拆解任務。產品經理或研發負責人受理需求後拆任務，需求會自動進入「開發中」。" />
        : (
          <Table<RdmTaskItem>
            rowKey="id"
            size="small"
            columns={taskColumns}
            dataSource={tasks}
            pagination={false}
          />
        ),
    },
    {
      key: 'prd',
      label: `PRD（${summary?.prds.length ?? 0}）`,
      children: (summary?.prds.length ?? 0) === 0
        ? <EmptyHint text="尚未編寫 PRD。PRD 的「驗收標準」會直接成為業務驗收檢查項，請寫清可驗證的口徑。" />
        : (
          <Space direction="vertical" size={8} style={{ width: '100%' }}>
            {summary?.prds.map(p => <PrdRow key={p.id} prd={p} editable={canManage} onClick={() => navigate(`/rdm-prd?reqId=${reqId}&id=${p.id}`)} />)}
          </Space>
        ),
    },
    {
      key: 'review',
      label: `評審（${summary?.reviews.length ?? 0}）`,
      children: (summary?.reviews.length ?? 0) === 0
        ? <EmptyHint text="尚無評審記錄。發起需求評審後由研發/測試確認技術方案與可測性。" />
        : (
          <Space direction="vertical" size={8} style={{ width: '100%' }}>
            {summary?.reviews.map(r => (
              <ReviewRow
                key={r.id}
                review={r}
                editable={canManage}
                expanded={reviewCtx === r.id}
                conclusionDesc={conclusionDesc}
                onConclusionChange={setConclusionDesc}
                onToggle={(id) => { setReviewCtx(reviewCtx === id ? null : id); setConclusionDesc('') }}
                onDecide={handleReviewDecision}
                saving={saving}
              />
            ))}
          </Space>
        ),
    },
    {
      key: 'change',
      label: `變更（${summary?.changes.length ?? 0}）`,
      children: (summary?.changes.length ?? 0) === 0
        ? <EmptyHint text="尚無變更記錄。需求口徑變化請走變更申請（需審批），避免口頭改需求。" />
        : (
          <Space direction="vertical" size={8} style={{ width: '100%' }}>
            {summary?.changes.map(c => <ChangeRow key={c.id} change={c} />)}
          </Space>
        ),
    },
  ]

  return (
    <div className="rdm-card">
      <div className="rdm-card-title">
        <span className="rdm-icon-block" style={{ background: '#F0F5FF', color: '#2F54EB' }}><ApartmentOutlined /></span>
        交付過程
        <span className="rdm-card-title-split" />
        <span style={{ fontSize: 12, color: '#8C8C8C', fontWeight: 400 }}>
          {loading ? '載入中…' : `共 ${summary?.taskTotal ?? tasks.length} 個任務，完成 ${summary?.taskDone ?? 0} 個`}
        </span>
        <Space size={8} style={{ marginLeft: 'auto' }}>
          {canManage && <Button size="small" icon={<FileTextOutlined />} onClick={() => navigate(`/rdm-prd?reqId=${reqId}`)}>編寫 PRD</Button>}
          {canManage && <Button size="small" icon={<PlusOutlined />} onClick={() => navigate(`/rdm-task?reqId=${reqId}`)}>新增任務</Button>}
          {canManage && <Button size="small" icon={<TeamOutlined />} onClick={() => navigate(`/rdm-review?reqId=${reqId}`)}>發起評審</Button>}
          <Button size="small" icon={<SwapOutlined />} onClick={() => navigate(`/rdm-change?reqId=${reqId}`)}>申請變更</Button>
        </Space>
      </div>

      {/* 摘要条：进度 + 工时 + 阻塞，项目经理扫一眼即知风险 */}
      {summary && (
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
            {blockedTasks.length > 0
              ? <Tag color="error" style={{ margin: 0 }}>{blockedTasks.length} 個任務</Tag>
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
      )}

      <Tabs activeKey={activeTab} onChange={setActiveTab} items={items} size="small" />
    </div>
  )
}

/** 空态提示（同时告诉用户下一步该做什么） */
function EmptyHint({ text }: { text: string }) {
  return <div className="rdm-empty-hint">{text}</div>
}

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
      {editable && <Button type="link" size="small" icon={<EditOutlined />} onClick={onClick}>編輯</Button>}
    </div>
  )
}

/** 评审行（待评审时行内录入结论） */
function ReviewRow({
  review, editable, expanded, conclusionDesc, onConclusionChange, onToggle, onDecide, saving,
}: {
  review: RdmReviewItem
  editable?: boolean
  expanded: boolean
  conclusionDesc: string
  onConclusionChange: (v: string) => void
  onToggle: (id: number) => void
  onDecide: (review: RdmReviewItem, passed: boolean) => void
  saving: boolean
}) {
  const key = review.conclusion as RdmReviewConclusion
  const pending = key === RDM_REVIEW_CONCLUSION.PENDING
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
            {review.reviewTime ? ` · ${dayjs(review.reviewTime).format('MM-DD HH:mm')}` : ''}
            {review.participants ? ` · 參與 ${review.participants}` : ''}
          </span>
        </span>
        {pending && editable && (
          <Button type="link" size="small" onClick={() => onToggle(review.id)}>錄入結論</Button>
        )}
      </div>
      {review.conclusionDesc && !pending && (
        <div className="rdm-delivery-row-desc">結論：{review.conclusionDesc}</div>
      )}
      {pending && expanded && (
        <div className="rdm-action-panel">
          <div className="rdm-action-panel-title">錄入評審結論：{review.reviewNo}</div>
          <Space direction="vertical" size={8} style={{ width: '100%' }}>
            <Input.TextArea
              rows={2}
              value={conclusionDesc}
              placeholder="評審結論與遺留問題（通過時作為開發與驗收依據）"
              onChange={e => onConclusionChange(e.target.value)}
            />
            <Space>
              <Button type="primary" size="small" icon={<CheckCircleOutlined />} loading={saving} onClick={() => onDecide(review, true)}>評審通過</Button>
              <Button size="small" danger icon={<CloseCircleOutlined />} loading={saving} onClick={() => onDecide(review, false)}>退回修改</Button>
              <Button size="small" onClick={() => onToggle(review.id)}>取消</Button>
            </Space>
          </Space>
        </div>
      )}
    </div>
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
        </span>
        <div style={{ fontSize: 13, color: '#595959', marginTop: 4 }}>{change.afterContent}</div>
        <div style={{ fontSize: 12, color: '#8C8C8C', marginTop: 2 }}>原因：{change.reason}</div>
        {change.decideRemark && <div style={{ fontSize: 12, color: '#8C8C8C', marginTop: 2 }}>審批意見：{change.decideRemark}</div>}
      </span>
    </div>
  )
}
