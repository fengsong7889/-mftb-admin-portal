/**
 * 需求详情 —— 全角色协同主视图
 *
 * 设计口径：
 * 1. 左侧统一呈现「需求是什么 + 走到哪了 + 谁说了什么」，所有角色看到同一份事实；
 * 2. 右侧操作区由状态机配置（rdm_transition）驱动，按当前状态列出可执行动作，
 *    点击动作后就地展开必填字段，校验通过才提交（禁止无必填约束的裸流转）；
 * 3. 业务验收动作走独立验收页，不在详情页内做弹窗表单。
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Button, DatePicker, Input, Modal, Rate, Select, Space, Tag, Timeline, Tooltip, message } from 'antd'
import {
  AimOutlined,
  AuditOutlined,
  BellOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  CommentOutlined,
  FileProtectOutlined,
  HistoryOutlined,
  PaperClipOutlined,
  TeamOutlined,
} from '@ant-design/icons'
import { useNavigate, useSearchParams } from 'react-router-dom'
import dayjs from 'dayjs'
import DetailPageHeader from '../../components/DetailPageHeader'
import { useAuth } from '../../contexts/AuthContext'
import RequirementStageBar from './components/RequirementStageBar'
import AcceptanceTraceCard from './components/AcceptanceTraceCard'
import DeliveryPanel from './components/DeliveryPanel'
import { PriorityTag, StatusTag, TypeTag } from './components/Tags'
import {
  addComment,
  fetchIterations,
  fetchProductOptions,
  fetchRequirementDetail,
  fetchTransitions,
  transitionRequirement,
  urgeRequirement,
  type RdmIterationItem,
  type RdmProductOption,
  type RdmRequirementDetail,
  type RdmTransitionRow,
} from '../../api/rdm'
import {
  RDM_ACTION_LABEL,
  RDM_ACTION_OPTIONAL_FIELDS,
  RDM_ACTION_REQUIRED_FIELDS,
  RDM_ACTION_TONE,
  RDM_ANCHOR_LABEL,
  RDM_COMPLEXITY_LABEL,
  RDM_ITERATION_STATUS,
  RDM_PRIORITY_LABEL,
  RDM_REQ_TYPE_LABEL,
  RDM_ROLE_LABEL,
  RDM_STATUS,
  RDM_STATUS_LABEL,
  type RdmAction,
  type RdmActionField,
  type RdmActionTone,
  type RdmComplexity,
  type RdmPriority,
  type RdmReqType,
  type RdmRoleCode,
  type RdmStatus,
} from '../../constants/rdm'
import './index.css'

const { TextArea } = Input

/** 可选上线版本（原型：真实数据来自 sys_version_history） */
const VERSION_OPTIONS = ['2.9.0', '2.10.0', '2.11.0'].map(v => ({ value: v, label: v }))

/** 审批节点状态文案 */
const APPROVAL_STATUS_LABEL: Record<string, { text: string; color: string }> = {
  pending: { text: '待審批', color: 'processing' },
  approved: { text: '已通過', color: 'success' },
  rejected: { text: '已駁回', color: 'error' },
}

export default function RequirementDetail() {
  const navigate = useNavigate()
  const { hasPermission } = useAuth()
  const [searchParams] = useSearchParams()
  const id = Number(searchParams.get('id') ?? 0)

  const [detail, setDetail] = useState<RdmRequirementDetail | null>(null)
  const [transitions, setTransitions] = useState<RdmTransitionRow[]>([])
  const [pmOptions, setPmOptions] = useState<RdmProductOption[]>([])
  const [iterations, setIterations] = useState<RdmIterationItem[]>([])
  const [iterationCode, setIterationCode] = useState<string>()
  const [activeAction, setActiveAction] = useState<RdmAction | null>(null)
  const [remark, setRemark] = useState('')
  const [planDate, setPlanDate] = useState<dayjs.Dayjs | null>(null)
  const [promisedDate, setPromisedDate] = useState<dayjs.Dayjs | null>(null)
  const [holdUntil, setHoldUntil] = useState<dayjs.Dayjs | null>(null)
  const [versionNo, setVersionNo] = useState<string>()
  /** 满意度不预置 5 分：预置后「必填满意度」校验永远提前满足，等于代理业务方打分 */
  const [score, setScore] = useState<number | undefined>()
  const [pmUserId, setPmUserId] = useState<number>()
  const [comment, setComment] = useState('')
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    if (!id) return
    const [data, trans, pms, iters] = await Promise.all([
      fetchRequirementDetail(id),
      fetchTransitions(),
      fetchProductOptions(),
      fetchIterations(),
    ])
    setDetail(data)
    setTransitions(trans)
    setPmOptions(pms)
    setIterations(iters)
  }, [id])

  useEffect(() => { void load() }, [load])

  /**
   * 当前可执行动作：后端 allowedActions 为权威（已按 rdm_transition + 角色守卫算好）；
   * 后端不可用降级时，再按本地流转表与状态推导，保证 mock 演示可走通。
   */
  const availableActions = useMemo(() => {
    if (detail?.allowedActions?.length) {
      return detail.allowedActions.map(a => ({
        key: a.actionCode,
        actionCode: a.actionCode as RdmAction,
        actionName: a.actionName || RDM_ACTION_LABEL[a.actionCode as RdmAction] || a.actionCode,
        requiredFields: (a.requiredFields ?? []) as RdmActionField[],
      }))
    }
    const seen = new Set<string>()
    return transitions
      .filter(t => {
        if (!t.enabled || t.fromStatus !== detail?.status || seen.has(t.actionCode)) return false
        seen.add(t.actionCode)
        return true
      })
      .map(t => ({
        key: String(t.id),
        actionCode: t.actionCode as RdmAction,
        actionName: t.actionName || RDM_ACTION_LABEL[t.actionCode as RdmAction] || t.actionCode,
        requiredFields: (RDM_ACTION_REQUIRED_FIELDS[t.actionCode as RdmAction] ?? []) as RdmActionField[],
      }))
  }, [transitions, detail])

  const requiredFields: RdmActionField[] = useMemo(() => {
    if (!activeAction) return []
    return availableActions.find(a => a.actionCode === activeAction)?.requiredFields ?? []
  }, [activeAction, availableActions])

  /** 选填字段（如排期时的所属迭代）：不拦截提交，但必须给地方填 */
  const optionalFields: RdmActionField[] = useMemo(
    () => (activeAction ? RDM_ACTION_OPTIONAL_FIELDS[activeAction] ?? [] : []),
    [activeAction],
  )

  /**
   * 当前动作的显示名。
   * <p>必须优先取流转配置里的 actionName，而不是静态 RDM_ACTION_LABEL：
   * 同一个 actionCode 在不同起始状态下名字不同（如 reassign 在已分配→需求池叫「退回需求池」，
   * 在池内→已分配叫「改派」），写死映射会把面板标题显示成错误的动作（实测发生过）。
   */
  const activeActionName = activeAction
    ? availableActions.find(a => a.actionCode === activeAction)?.actionName
      ?? RDM_ACTION_LABEL[activeAction] ?? activeAction
    : ''

  /** 提交流转（先必填校验 → 再二次确认 → 确认后才调接口） */
  const handleTransition = async () => {
    if (!activeAction || !detail) return
    if (requiredFields.includes('remark') && !remark.trim()) {
      message.warning('請填寫說明（駁回/退回理由必填）')
      return
    }
    if (requiredFields.includes('planDate') && !planDate) {
      message.warning('請選擇計劃上線日期')
      return
    }
    if (requiredFields.includes('promisedDate') && !promisedDate) {
      message.warning('請選擇承諾出需求（PRD）日期')
      return
    }
    if (requiredFields.includes('pm') && !pmUserId) {
      message.warning('請選擇產品經理')
      return
    }
    if (requiredFields.includes('versionNo') && !versionNo) {
      message.warning('請選擇上線版本')
      return
    }
    if (requiredFields.includes('score') && !score) {
      message.warning('請給出交付滿意度評分')
      return
    }
    const pm = pmOptions.find(p => p.userId === pmUserId)
    const payload: Parameters<typeof transitionRequirement>[1] = {
      actionCode: activeAction,
      remark: remark || undefined,
      planDate: planDate?.format('YYYY-MM-DD'),
      promisedDate: promisedDate?.format('YYYY-MM-DD'),
      holdUntil: holdUntil?.format('YYYY-MM-DD'),
      versionNo,
      score: requiredFields.includes('score') ? score : undefined,
      pmUserId,
      pmName: pm?.name,
      iterationCode,
    }
    // 状态流转会改变需求归属与处理人，属于影响最大的写操作，必须二次确认
    Modal.confirm({
      title: `確認執行「${activeActionName}」？`,
      className: 'custom-confirm-modal',
      icon: <span className="confirm-icon-wrapper"><span className="confirm-icon-text">!</span></span>,
      content: (
        <div className="confirm-info-card">
          <div className="confirm-info-row"><span>需求：</span><b>{detail.reqNo} · {detail.title}</b></div>
          <div className="confirm-info-row"><span>當前狀態：</span><b>{RDM_STATUS_LABEL[detail.status as RdmStatus] ?? detail.status}</b></div>
          {pm && <div className="confirm-info-row"><span>指派產品經理：</span><b>{pm.name}</b></div>}
          {planDate && <div className="confirm-info-row"><span>計劃上線：</span><b>{planDate.format('YYYY-MM-DD')}</b></div>}
          {promisedDate && <div className="confirm-info-row"><span>PRD 承諾：</span><b>{promisedDate.format('YYYY-MM-DD')}</b></div>}
          {versionNo && <div className="confirm-info-row"><span>上線版本：</span><b>{versionNo}</b></div>}
          {iterationCode && <div className="confirm-info-row"><span>所屬迭代：</span><b>{iterationCode}</b></div>}
          {remark && <div className="confirm-info-row"><span>說明：</span><b>{remark}</b></div>}
        </div>
      ),
      okText: '確認執行',
      cancelText: '取消',
      onOk: () => runTransition(payload),
    })
  }

  /** 确认后才跑：执行流转并刷新详情 */
  const runTransition = async (payload: Parameters<typeof transitionRequirement>[1]) => {
    if (!activeAction || !detail) return
    setSaving(true)
    try {
      await transitionRequirement(detail.id, payload)
      message.success(`已執行「${activeActionName}」，需求狀態已更新`)
      setActiveAction(null)
      setRemark(''); setPlanDate(null); setPromisedDate(null); setVersionNo(undefined); setPmUserId(undefined); setIterationCode(undefined)
      await load()
    } catch {
      message.error('流轉失敗，請重試')
    } finally {
      setSaving(false)
    }
  }

  const handleComment = async () => {
    if (!comment.trim() || !detail) return
    await addComment(detail.id, comment.trim())
    setComment('')
    message.success('已發布溝通記錄')
    await load()
  }

  const handleUrge = async () => {
    if (!detail) return
    await urgeRequirement(detail.id)
    message.success('已催辦當前處理人')
  }

  if (!detail) {
    return (
      <div className="content-area">
        <div style={{ padding: 60, textAlign: 'center', color: '#8C8C8C' }}>
          {id ? '需求載入中…' : '未指定需求編號，請從列表進入詳情'}
          <div style={{ marginTop: 16 }}>
            <Button onClick={() => navigate('/rdm-requirement')}>返回需求列表</Button>
          </div>
        </div>
      </div>
    )
  }

  const stageHint = detail.stayHours
    ? `已在「${RDM_STATUS_LABEL[detail.status as RdmStatus] ?? detail.status}」停留 ${Math.max(Math.round(detail.stayHours / 24), 1)} 天`
    : undefined

  return (
    <div className="content-area">
      {/* ── 头部 ── */}
      <DetailPageHeader
        title="需求詳情"
        tags={
          <Space size={6}>
            <TypeTag reqType={detail.reqType} />
            <PriorityTag priority={detail.priority} />
            <StatusTag status={detail.status} overdue={detail.overdueFlag ?? false} />
          </Space>
        }
        meta={`${detail.reqNo} · 提出人 ${detail.submitterName}${detail.submitDeptName ? `（${detail.submitDeptName}）` : ''} · 提交於 ${detail.submitTime ?? '-'}`}
        onBack={() => navigate(-1)}
        extra={
          <Space>
            <Button icon={<BellOutlined />} onClick={handleUrge}>催辦</Button>
            {detail.status === RDM_STATUS.UAT_PENDING && (
              <Button
                type="primary"
                icon={<CheckCircleOutlined />}
                onClick={() => navigate(`/rdm-acceptance-form?id=${detail.id}`)}
                style={{ backgroundColor: '#52C41A', borderColor: '#52C41A' }}
              >
                業務驗收
              </Button>
            )}
          </Space>
        }
      />

      {/* ── 阶段进度条（全角色统一心智） ── */}
      <div className="rdm-card">
        <RequirementStageBar status={detail.status} overdue={detail.overdueFlag ?? false} hint={stageHint} />
      </div>

      <div className="rdm-detail-grid">
        {/* ════ 左侧主区 ════ */}
        <div className="rdm-detail-main">
          {/* 基本信息 */}
          <div className="rdm-card">
            <div className="rdm-card-title">
              <span className="rdm-icon-block" style={{ background: '#E6F7FF', color: '#1890FF' }}><FileProtectOutlined /></span>
              基本信息
              <span className="rdm-card-title-split" />
            </div>
            <div className="rdm-meta-grid">
              <MetaItem label="需求類型" value={RDM_REQ_TYPE_LABEL[detail.reqType as RdmReqType] ?? detail.reqType} />
              <MetaItem label="優先級" value={RDM_PRIORITY_LABEL[detail.priority as RdmPriority] ?? detail.priority} />
              <MetaItem label="預期規模" value={detail.complexity ? RDM_COMPLEXITY_LABEL[detail.complexity as RdmComplexity] : '待產品評估'} />
              <MetaItem label="期望完成時間" value={detail.expectDate ?? '由產研排期'} />
              <MetaItem label="技術負責人" value={detail.dispatcherName ?? '-'} />
              <MetaItem label="產品經理" value={detail.pmName ?? <span style={{ color: '#FF4D4F' }}>未分配</span>} />
              <MetaItem label="研發負責人" value={detail.devOwnerName ?? '-'} />
              <MetaItem label="承諾出需求" value={detail.promisedPrdDate ?? '-'} />
              <MetaItem label="計劃上線" value={detail.planReleaseDate ?? '-'} />
              <MetaItem label="實際上線" value={detail.actualReleaseDate ?? '-'} />
              <MetaItem label="關聯版本" value={detail.versionNo ?? '-'} />
              <MetaItem label="當前處理人" value={detail.currentHandler ?? '-'} />
              {/* M3：返工与变更代价就在基本信息里看见，避免“看起来很顺”但实际退过好几次 */}
              <MetaItem
                label="驗收返工"
                value={detail.reworkCount && detail.reworkCount > 0
                  ? <span style={{ color: '#CF1322', fontWeight: 600 }}>{detail.reworkCount} 次</span>
                  : '無'}
              />
              <MetaItem
                label="需求變更"
                value={detail.changeCount && detail.changeCount > 0
                  ? <span style={{ color: '#D46B08', fontWeight: 600 }}>{detail.changeCount} 次</span>
                  : '無'}
              />
              {detail.parentReqNo && (
                <MetaItem label="衍生自" value={<span style={{ color: '#1890FF' }}>{detail.parentReqNo}（驗收遺留）</span>} />
              )}
            </div>
          </div>

          {/* 需求内容 */}
          <div className="rdm-card">
            <div className="rdm-card-title">
              <span className="rdm-icon-block" style={{ background: '#FFF7E6', color: '#E8720C' }}><AimOutlined /></span>
              需求內容
              <span className="rdm-card-title-split" />
            </div>
            <div style={{ fontSize: 15, fontWeight: 600, color: '#262626', marginBottom: 10 }}>{detail.title}</div>
            <BlockLabel text="現狀與痛點" />
            <div className="rdm-desc-block">{detail.description ?? '-'}</div>
            {detail.expectResult && (
              <>
                <BlockLabel text="期望結果" />
                <div className="rdm-desc-block">{detail.expectResult}</div>
              </>
            )}
            {detail.businessValue && (
              <>
                <BlockLabel text="業務價值" />
                <div className="rdm-desc-block">{detail.businessValue}</div>
              </>
            )}
            {detail.targets.length > 0 && (
              <>
                <BlockLabel text="需求定位" />
                <Space size={8} wrap>
                  {detail.targets.map((t, i) => (
                    <span key={i} className="rdm-target-chip">
                      {RDM_ANCHOR_LABEL[t.anchorType as keyof typeof RDM_ANCHOR_LABEL] ?? t.anchorType}
                      {t.menuName ? ` · ${t.menuName}` : ''}
                      {t.anchorName ? ` · ${t.anchorName}` : ''}
                    </span>
                  ))}
                </Space>
                {detail.attachments.length > 0 && (
                  <div style={{ marginTop: 10 }}>
                    {/* 图片类附件直接给缩略图，业务方不用点开就能对照现状 */}
                    <Space size={8} wrap>
                      {detail.attachments.filter(a => (a.fileType ?? '').startsWith('image/')).map(att => (
                        <a key={`img-${att.id}`} href={att.fileUrl} target="_blank" rel="noreferrer" title={att.fileName}>
                          <img
                            src={att.fileUrl}
                            alt={att.fileName}
                            style={{
                              width: 148, height: 84, objectFit: 'cover',
                              border: '1px solid #e8eaed', borderRadius: 6,
                              transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                            }}
                          />
                        </a>
                      ))}
                    </Space>
                    {detail.attachments.map(att => (
                      <Tag key={att.id} icon={<PaperClipOutlined />} style={{ margin: '4px 4px 0 0' }}>
                        {att.fileUrl && !att.fileType?.startsWith('image/') ? (
                          <a href={att.fileUrl} target="_blank" rel="noreferrer">{att.fileName}</a>
                        ) : att.fileName}
                      </Tag>
                    ))}
                  </div>
                )}
                {detail.targets[0]?.screenshotUrl && (
                  <div style={{ marginTop: 10 }}>
                    <div style={{ fontSize: 12, color: '#8C8C8C', marginBottom: 4 }}>現狀截圖</div>
                    <a href={detail.targets[0].screenshotUrl!} target="_blank" rel="noreferrer">
                      <img
                        src={detail.targets[0].screenshotUrl!}
                        alt="現狀截圖"
                        style={{ maxWidth: 360, border: '1px solid #e8eaed', borderRadius: 6 }}
                      />
                    </a>
                  </div>
                )}
              </>
            )}
          </div>

          {/* 交付过程（PRD / 任务 / 评审 / 变更）：状态变化时重取，保证任务联动后的进度一致 */}
          <DeliveryPanel
            key={`${detail.id}-${detail.status}`}
            reqId={detail.id}
            status={detail.status}
            editable={hasPermission('rdm-product:edit') || hasPermission('rdm-delivery-board:edit')}
          />

          {/* 流转时间轴 */}
          <div className="rdm-card">
            <div className="rdm-card-title">
              <span className="rdm-icon-block" style={{ background: '#F9F0FF', color: '#722ED1' }}><HistoryOutlined /></span>
              全生命週期記錄
              <span className="rdm-card-title-split" />
              <span style={{ fontSize: 12, color: '#8C8C8C', fontWeight: 400 }}>
                共 {detail.timeline.length} 個節點，每一步誰在什麼時候做的都有留痕
              </span>
            </div>
            <Timeline
              items={detail.timeline.map(node => ({
                color: node.overdue ? 'red' : node === detail.timeline[0] ? 'blue' : 'gray',
                children: (
                  <div>
                    <Space size={6} wrap>
                      <StatusTag status={node.status} />
                      <span style={{ fontSize: 13, color: '#262626', fontWeight: 500 }}>{node.operatorName}</span>
                      {node.operatorRole && (
                        <span style={{ fontSize: 12, color: '#8C8C8C' }}>
                          {RDM_ROLE_LABEL[node.operatorRole as RdmRoleCode] ?? node.operatorRole}
                        </span>
                      )}
                      {node.durationHours != null && node.durationHours > 0 && (
                        <Tooltip title="在上一狀態停留時間">
                          <span style={{ fontSize: 12, color: '#D46B08' }}>
                            <ClockCircleOutlined /> {(node.durationHours / 24).toFixed(1)} 天
                          </span>
                        </Tooltip>
                      )}
                    </Space>
                    <div style={{ fontSize: 12, color: '#8C8C8C', marginTop: 2 }}>
                      {node.time}{node.remark ? ` · ${node.remark}` : ''}
                    </div>
                  </div>
                ),
              }))}
            />
          </div>

          {/* 沟通区 */}
          <div className="rdm-card">
            <div className="rdm-card-title">
              <span className="rdm-icon-block" style={{ background: '#F6FFED', color: '#52C41A' }}><CommentOutlined /></span>
              需求溝通
              <span className="rdm-card-title-split" />
              <span style={{ fontSize: 12, color: '#8C8C8C', fontWeight: 400 }}>標註「內部」的記錄業務方不可見</span>
            </div>
            {detail.comments.map(c => (
              <div key={c.id} className="rdm-comment-item">
                <div className="rdm-icon-block" style={{ background: '#FFF7F0', color: '#E8720C', width: 32, height: 32 }}>
                  {c.authorName.slice(0, 1)}
                </div>
                <div className="rdm-comment-body">
                  <div className="rdm-comment-text">{c.content}</div>
                  <div className="rdm-comment-meta">
                    {c.authorName}
                    {c.authorRole ? ` · ${RDM_ROLE_LABEL[c.authorRole as RdmRoleCode] ?? ''}` : ''}
                    {' · '}{c.createdAt}
                    {c.internal && <Tag color="purple" style={{ marginLeft: 6, margin: '0 0 0 6px' }}>內部</Tag>}
                  </div>
                </div>
              </div>
            ))}
            <Space style={{ width: '100%', marginTop: 12 }}>
              <TextArea
                rows={2}
                style={{ width: 460 }}
                placeholder="補充說明或回覆，@ 同事可觸發釘釘提醒"
                value={comment}
                onChange={e => setComment(e.target.value)}
              />
              <Button type="primary" onClick={handleComment} disabled={!comment.trim()}>發布</Button>
            </Space>
          </div>
        </div>

        {/* ════ 右侧处理区 ════ */}
        <div className="rdm-detail-side">
          {/* SLA 提示 */}
          {detail.sla && (
            <div className={`rdm-sla-bar ${detail.sla.overdue ? 'rdm-sla-overdue' : detail.sla.remainHours < (detail.sla.warnHours ?? 24) ? 'rdm-sla-warn' : 'rdm-sla-normal'}`}>
              <span>
                <ClockCircleOutlined />
                {detail.sla.overdue
                  ? `已逾期 ${Math.abs(detail.sla.remainHours)} 小時，請盡快推進或調整排期`
                  : `本階段標準時效 ${detail.sla.slaHours} 小時，剩餘 ${detail.sla.remainHours} 小時`}
              </span>
              {detail.sla.overdue && <Tag color="error" style={{ margin: 0 }}>升級預警已觸發</Tag>}
            </div>
          )}

          {/* 操作面板 */}
          <div className="rdm-card">
            <div className="rdm-card-title">
              <span className="rdm-icon-block" style={{ background: '#FFF7E6', color: '#E8720C' }}><AuditOutlined /></span>
              流轉處理
              <span className="rdm-card-title-split" />
            </div>
            {availableActions.length === 0 && (
              <div style={{ fontSize: 12, color: '#8C8C8C' }}>當前狀態無可執行動作（已歸檔或等待他人處理）</div>
            )}
            <Space size={8} wrap>
              {availableActions.map(t => {
                const actionCode = t.actionCode
                const tone: RdmActionTone = RDM_ACTION_TONE[actionCode] ?? 'default'
                return (
                  <Button
                    key={t.key}
                    size="small"
                    type={tone === 'primary' || tone === 'success' ? 'primary' : 'default'}
                    danger={tone === 'danger'}
                    style={tone === 'success' ? { backgroundColor: '#52C41A', borderColor: '#52C41A' } : undefined}
                    onClick={() => setActiveAction(activeAction === actionCode ? null : actionCode)}
                  >
                    {t.actionName}
                  </Button>
                )
              })}
            </Space>

            {activeAction && (
              <div className="rdm-action-panel">
                <div className="rdm-action-panel-title">
                  執行「{activeActionName}」
                  {requiredFields.length > 0 && <span style={{ color: '#FF4D4F' }}> · 帶 * 為必填</span>}
                </div>
                <Space direction="vertical" style={{ width: '100%' }} size={8}>
                  {requiredFields.includes('pm') && (
                    <Select
                      style={{ width: '100%' }}
                      placeholder="選擇產品經理"
                      value={pmUserId}
                      onChange={setPmUserId}
                      options={pmOptions.map(pm => ({
                        value: pm.userId,
                        label: `${pm.name} · 在途 ${pm.activeCount}/${pm.capacity}`,
                      }))}
                    />
                  )}
                  {requiredFields.includes('planDate') && (
                    <DatePicker style={{ width: '100%' }} placeholder="計劃上線日期 *" value={planDate} onChange={setPlanDate} />
                  )}
                  {requiredFields.includes('promisedDate') && (
                    <DatePicker style={{ width: '100%' }} placeholder="承諾出 PRD 日期 *" value={promisedDate} onChange={setPromisedDate} />
                  )}
                  {requiredFields.includes('holdUntil') && (
                    <DatePicker style={{ width: '100%' }} placeholder="復審日期 *" value={holdUntil} onChange={setHoldUntil} />
                  )}
                  {requiredFields.includes('versionNo') && (
                    <Select style={{ width: '100%' }} placeholder="關聯上線版本 *" value={versionNo} onChange={setVersionNo} options={VERSION_OPTIONS} />
                  )}
                  {/* 选填但有入口：不选迭代就进不了产能对账与按迭代的周报 */}
                  {optionalFields.includes('iteration') && (
                    <Select
                      style={{ width: '100%' }}
                      allowClear
                      placeholder="所屬迭代（選填，選了才進迭代產能對賬）"
                      value={iterationCode}
                      onChange={setIterationCode}
                      notFoundContent="暫無迭代，可先到「迭代排期」新建"
                      options={iterations.filter(i => i.status !== RDM_ITERATION_STATUS.CLOSED).map(i => ({
                        value: i.code,
                        label: `${i.name}（${i.startDate ?? '-'} ~ ${i.endDate ?? '-'}）`,
                      }))}
                    />
                  )}
                  {requiredFields.includes('score') && (
                    <div><span style={{ fontSize: 12, color: '#595959', marginRight: 8 }}>交付滿意度 *</span><Rate value={score} onChange={setScore} /></div>
                  )}
                  <TextArea
                    rows={2}
                    placeholder={requiredFields.includes('remark') ? '說明/理由 *（駁回時請寫清原因，便於業務理解）' : '補充說明（選填）'}
                    value={remark}
                    onChange={e => setRemark(e.target.value)}
                  />
                  <Space>
                    <Button type="primary" size="small" loading={saving} onClick={handleTransition}>確認執行</Button>
                    <Button size="small" onClick={() => setActiveAction(null)}>取消</Button>
                  </Space>
                </Space>
              </div>
            )}
          </div>

          {/* 参与角色 */}
          <div className="rdm-card">
            <div className="rdm-card-title">
              <span className="rdm-icon-block" style={{ background: '#E6F7FF', color: '#1890FF' }}><TeamOutlined /></span>
              參與角色（{detail.roles.length}）
              <span className="rdm-card-title-split" />
            </div>
            {detail.roles.map(r => (
              <div key={`${r.roleCode}-${r.userId}`} className="rdm-risk-item">
                <Tag color="geekblue" style={{ margin: 0 }}>{RDM_ROLE_LABEL[r.roleCode as RdmRoleCode] ?? r.roleCode}</Tag>
                <span style={{ color: '#262626' }}>{r.name}</span>
                <span style={{ marginLeft: 'auto', fontSize: 12, color: '#8C8C8C' }}>{r.empNo}</span>
              </div>
            ))}
          </div>

          {/* 准入审批（审批动作在 OA 引擎完成，本页只做展示与跳转，不再自建一套审批） */}
          <div className="rdm-card">
            <div className="rdm-card-title">
              <span className="rdm-icon-block" style={{ background: '#FFF1F0', color: '#FF4D4F' }}><AuditOutlined /></span>
              需求準入審批
              <span className="rdm-card-title-split" />
              {detail.intakeFlowNo && (
                <>
                  <span style={{ fontSize: 12, color: '#8C8C8C' }}>{detail.intakeFlowNo}</span>
                  <Button
                    type="link"
                    size="small"
                    style={{ paddingLeft: 8 }}
                    onClick={() => navigate(`/approval-detail?flowNo=${encodeURIComponent(detail.intakeFlowNo ?? '')}&type=rdm_intake`)}
                  >
                    前往審批單
                  </Button>
                </>
              )}
            </div>
            {detail.approvalNodes.length === 0 && (
              <div style={{ fontSize: 12, color: '#8C8C8C' }}>
                {detail.intakeFlowNo
                  ? '審批節點載入中，可點「前往審批單」到 OA 審批中心處理。'
                  : '該需求未啟用準入審批（或由管理員直送需求池），無需審批即可推進。'}
              </div>
            )}
            {detail.approvalNodes.map((node, idx) => {
              const meta = APPROVAL_STATUS_LABEL[node.status] ?? { text: node.status, color: 'default' }
              return (
                <div key={idx} className="rdm-risk-item">
                  <Tag color={meta.color} style={{ margin: 0 }}>{meta.text}</Tag>
                  <span>{node.nodeName}</span>
                  <span style={{ marginLeft: 'auto', fontSize: 12, color: '#8C8C8C' }}>
                    {node.approverName}{node.time ? ` · ${dayjs(node.time).format('MM-DD HH:mm')}` : ''}
                  </span>
                </div>
              )
            })}
            {detail.approvalNodes[0]?.comment && (
              <div style={{ fontSize: 12, color: '#595959', marginTop: 6 }}>審批意見：{detail.approvalNodes[0].comment}</div>
            )}
          </div>

          {/* 验收与追溯（M3）：历次验收 + 返工次数 + 版本入口 */}
          <AcceptanceTraceCard detail={detail} />
        </div>
      </div>
    </div>
  )
}

/** 元信息项 */
function MetaItem({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div className="rdm-meta-item-label">{label}</div>
      <div className="rdm-meta-item-value">{value}</div>
    </div>
  )
}

/** 内容分块小标题 */
function BlockLabel({ text }: { text: string }) {
  return (
    <div style={{
      fontSize: 12, color: '#8C8C8C', margin: '12px 0 6px',
      display: 'flex', alignItems: 'center', gap: 6,
    }}>
      <span style={{ width: 3, height: 12, background: '#E8720C', borderRadius: 2, display: 'inline-block' }} />
      {text}
    </div>
  )
}
